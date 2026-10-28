import * as THREE from 'three';
import type { GameEvent, RunState } from '../engine/index.ts';
import type { Layer, WorldContext } from './context.ts';
import { Particles } from './particles.ts';
import { VOCAB_COLOR, lawVisuals, planAction, planResolution, type EffectPlan, type LawVisual, type Vocab } from './plan.ts';
import type { SceneChanges, SceneSnapshot } from './snapshot.ts';
import { getSceneSnapshot } from './snapshot.ts';
import { makeGlyphs, type Glyphs } from './glyphs.ts';
import { engineToWorld } from './coords.ts';
import { DISPLAY_GLSL, displayUniforms } from './post.ts';

/**
 * The belief magic of the village: effects played from what the engine logged and from the laws it reports. The planning is in
 * `plan.ts` (plain data, tested against real runs); this file only draws what was planned, with a few kinds of thing:
 *
 *  - rings and ripples over the ground and water (through the terrain's and river's own shading, see `magic.ts`),
 *  - hovering runes and eyes over the people an event touched,
 *  - luminous ribbons that travel along a real tie between two people,
 *  - bursts of sparks, smoke, dust, splashes and rain.
 *
 * A law that is working also has a quiet life of its own (ripples going out from a lit beacon, motes along a watched bridge, rain
 * gathering for a bell), drawn only while the engine reports that law powered tonight.
 */
const ARC_SEGMENTS = 22;
const MAX_ARCS = 28;
const MAX_RUNES = 40;

const RIBBON_VERT = /* glsl */ `
  attribute float aU;
  varying float vU;
  uniform float uTime;
  uniform float uRough;
  void main() {
    vU = aU;
    vec3 p = position;
    p.y += uRough * sin(aU * 46.0 + uTime * 9.0) * 0.035;
    p.x += uRough * sin(aU * 37.0 - uTime * 7.0) * 0.03;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  }
`;
const RIBBON_FRAG = /* glsl */ `
  ${DISPLAY_GLSL}
  varying float vU;
  uniform float uHead;
  uniform float uFade;
  uniform vec3 uColor;
  uniform float uDash;
  uniform float uSolid;
  uniform float uTime;
  void main() {
    float tail = smoothstep(uHead - 0.5, uHead, vU) * (1.0 - smoothstep(uHead, uHead + 0.04, vU));
    // the social lens draws a whole standing ribbon with a slow pulse running along it, not a single trail
    tail = mix(tail, 0.4 + 0.6 * smoothstep(0.3, 1.0, sin(vU * 14.0 - uTime * 2.2) * 0.5 + 0.5), uSolid);
    // a rough, broken stroke for distrust and rivals: dashes instead of one smooth ribbon
    float dash = mix(1.0, step(0.5, fract(vU * 14.0)), uDash);
    float a = tail * uFade * dash;
    if (a < 0.01) discard;
    gl_FragColor = vec4(postDisplay(uColor * (0.8 + 0.8 * tail)), a);
    #include <colorspace_fragment>
  }
`;

interface Ribbon {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  pos: THREE.BufferAttribute;
  busy: boolean;
  t: number;
  dur: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  lift: number;
  color: THREE.Color;
  trail: number;
}

interface RuneSprite {
  sprite: THREE.Sprite;
  busy: boolean;
  t: number;
  dur: number;
  follow: string | null;
  at: THREE.Vector3;
  rise: number;
  size: number;
  color: THREE.Color;
  spin: number;
}

interface Queued {
  plan: EffectPlan;
  wait: number;
}

export interface PlayedEffect {
  eventId: number;
  code: string;
  kind: EffectPlan['kind'];
  vocab: Vocab;
  via?: 'tie' | 'event';
  from?: string;
  to?: string;
  law?: string;
}

const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const col = (h: number): THREE.Color => new THREE.Color(h);

export class EffectsLayer implements Layer {
  readonly group = new THREE.Group();
  private ctx: WorldContext;
  private sparks: Particles;
  private smoke: Particles;
  private ribbons: Ribbon[] = [];
  private lensRibbons: Ribbon[] = [];
  private lens: 'none' | 'social' = 'none';
  private activeClaim: string | null = null;
  private selection: { kind: string; id: string } | null = null;
  private lensT = 0;
  private runes: RuneSprite[] = [];
  private glyphs: Glyphs | null = null;
  private queue: Queued[] = [];
  private snap: SceneSnapshot | null = null;
  private visuals: LawVisual[] = [];
  private time = 0;
  private ambientT = 0;
  private reduced = false;
  private spawned = 0;
  /** every effect actually started, for tests and the debug panel: nothing is drawn that is not listed here */
  readonly log: PlayedEffect[] = [];
  /** the camera is asked to look somewhere (the world decides whether it may) */
  onFocus: ((x: number, z: number) => void) | null = null;
  private lastLaws = '';

  constructor(ctx: WorldContext) {
    this.ctx = ctx;
    this.group.name = 'effects';
    this.reduced = ctx.reducedMotion;
    const k = ctx.profile.particles;
    this.sparks = new Particles(Math.max(120, Math.round(520 * k)), true);
    this.smoke = new Particles(Math.max(80, Math.round(220 * k)), false);
    this.group.add(this.smoke.points, this.sparks.points);
    if (typeof document !== 'undefined') {
      this.glyphs = makeGlyphs();
      for (let i = 0; i < MAX_RUNES; i++) {
        const sp = new THREE.Sprite(this.glyphs.eye.clone());
        sp.visible = false;
        sp.renderOrder = 9;
        sp.frustumCulled = false;
        (sp.material as THREE.SpriteMaterial).opacity = 0;
        this.group.add(sp);
        this.runes.push({ sprite: sp, busy: false, t: 0, dur: 1, follow: null, at: new THREE.Vector3(), rise: 0.3, size: 0.4, color: col(0xffffff), spin: 0 });
      }
    }
    for (let i = 0; i < MAX_ARCS; i++) this.ribbons.push(this.makeRibbon());
    for (let i = 0; i < 12; i++) this.lensRibbons.push(this.makeRibbon());
  }

  private makeRibbon(): Ribbon {
    const geo = new THREE.BufferGeometry();
    const n = ARC_SEGMENTS + 1;
    const pos = new Float32Array(n * 2 * 3);
    const u = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      u[i * 2] = i / ARC_SEGMENTS;
      u[i * 2 + 1] = i / ARC_SEGMENTS;
    }
    const idx: number[] = [];
    for (let i = 0; i < ARC_SEGMENTS; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const attr = new THREE.BufferAttribute(pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr);
    geo.setAttribute('aU', new THREE.BufferAttribute(u, 1));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uHead: { value: 0 }, uFade: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) }, uRough: { value: 0 }, uDash: { value: 0 }, uSolid: { value: 0 }, ...displayUniforms },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 7;
    this.group.add(mesh);
    return { mesh, mat, pos: attr, busy: false, t: 0, dur: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), lift: 1, color: col(0xffffff), trail: 0 };
  }

  // ------------------------------------------------------------------------------------------------------ layer API

  update(snap: SceneSnapshot, changes: SceneChanges): void {
    this.reduced = this.ctx.reducedMotion;
    const first = !this.snap || changes.rebuild;
    if (first) this.reset();
    this.snap = snap;
    if (this.lens === 'social') this.refreshLens();
    const laws = JSON.stringify(snap.laws.map((l) => [l.id, l.status, Math.round(l.strength * 20), Math.round(l.progress / 5), l.sources.length]));
    const bridge = snap.landmarks.find((l) => l.kind === 'bridge');
    const key = `${laws}|${snap.landmarks.map((l) => `${l.id}${l.lit ? 1 : 0}${l.hp > 0 ? 1 : 0}`).join('')}|${bridge?.data.watchers ?? ''}|${snap.landmarks.find((l) => l.kind === 'belltower')?.data.ringing ?? ''}`;
    if (first || key !== this.lastLaws) {
      this.lastLaws = key;
      this.visuals = lawVisuals(snap);
      this.ctx.magic?.setLaws(this.visuals, snap, first, this.highlightRegions());
    }
  }

  private reset(): void {
    this.queue = [];
    for (const r of this.ribbons) {
      r.busy = false;
      r.mesh.visible = false;
    }
    for (const r of this.runes) {
      r.busy = false;
      r.sprite.visible = false;
    }
    this.sparks.clear();
    this.smoke.clear();
    this.ctx.magic?.clear();
    this.log.length = 0;
  }

  private highlightRegions(): string[] {
    return this.activeClaim && this.snap ? this.snap.claimRegions[this.activeClaim] ?? [] : [];
  }

  setOptions(o?: { lens: 'none' | 'social'; selection: { kind: string; id: string } | null; activeClaim: string | null }): void {
    this.reduced = this.ctx.reducedMotion;
    if (this.ctx.magic) this.ctx.magic.reduced = this.reduced;
    if (o) {
      const changed = o.lens !== this.lens || o.selection?.id !== this.selection?.id;
      this.lens = o.lens;
      this.selection = o.selection;
      if (changed) this.refreshLens();
      if (o.activeClaim !== this.activeClaim) {
        this.activeClaim = o.activeClaim;
        if (this.snap) this.ctx.magic?.setLaws(this.visuals, this.snap, false, this.highlightRegions());
      }
    }
  }

  /** the trust ties the social lens is showing now (for the tests) */
  lensCount(): number {
    let n = 0;
    for (const r of this.lensRibbons) if (r.mesh.visible) n++;
    return n;
  }

  /** the number of things being shown or about to be: used by tests and the debug panel */
  effectCount(): number {
    let n = this.queue.length + (this.ctx.magic?.pulseCount ?? 0) + this.sparks.count + this.smoke.count;
    for (const r of this.ribbons) if (r.busy) n++;
    for (const r of this.lensRibbons) if (r.mesh.visible) n++;
    for (const r of this.runes) if (r.busy) n++;
    return n;
  }

  /** the effects started so far this session, newest last */
  played(): readonly PlayedEffect[] {
    return this.log;
  }

  laws(): readonly LawVisual[] {
    return this.visuals;
  }

  // ------------------------------------------------------------------------------------------------------ events in

  playAction(events: GameEvent[]): void {
    if (!this.snap) return;
    this.enqueue(planAction(events, this.snap, { reduced: this.reduced }));
  }

  playResolution(events: GameEvent[], prev: RunState | null): void {
    if (!this.snap) return;
    const before = prev ? getSceneSnapshot(prev) : null;
    this.enqueue(planResolution(events, this.snap, before, { reduced: this.reduced }));
  }

  noteBell(): void {
    const bell = this.snap?.landmarks.find((l) => l.kind === 'belltower');
    if (!bell) return;
    const p = engineToWorld(bell.x, bell.y);
    // sound made visible: three soft rings going out from the tower
    for (let i = 0; i < 3; i++) this.ctx.magic?.pulse(p.x, p.z, 2.6 + i * 1.3, this.reduced ? 300 : 1500, 'neutral', { delay: this.reduced ? 0 : i * 380, width: 0.07, peak: 0.55 });
  }

  /** feed plans in directly (tests, and the layers above) */
  enqueue(plans: EffectPlan[]): void {
    for (const plan of plans) this.queue.push({ plan, wait: plan.delay / 1000 });
  }

  // ------------------------------------------------------------------------------------------------------ frame

  tick(dt: number, time: number): void {
    this.time = time;
    this.reduced = this.ctx.reducedMotion;
    this.ctx.magic?.tick(dt, time);
    if (this.queue.length) {
      const rest: Queued[] = [];
      for (const q of this.queue) {
        q.wait -= dt;
        if (q.wait <= 0) this.start(q.plan);
        else rest.push(q);
      }
      this.queue = rest;
    }
    this.tickRibbons(dt, time);
    if (this.lens === 'social') {
      this.lensT += dt;
      for (const r of this.lensRibbons) r.mat.uniforms.uTime.value = time;
      // people walk: follow them a few times a second
      if (this.lensT > 0.25) {
        this.lensT = 0;
        this.refreshLens();
      }
    }
    this.tickRunes(dt);
    this.ambient(dt);
    this.sparks.update(dt);
    this.smoke.update(dt);
  }

  private pos(p: EffectPlan, which: 'from' | 'to'): THREE.Vector3 | null {
    const id = which === 'from' ? p.from : p.to;
    if (id) {
      const h = this.ctx.actors?.head(id);
      if (h) return h;
      const l = this.ctx.locate?.('villager', id);
      return l ? l.clone().add(v3(0, 0.1, 0)) : null;
    }
    if (which === 'from' && p.at) return v3(p.at.x, this.ctx.heightAt(p.at.x, p.at.z) + 0.5, p.at.z);
    return null;
  }

  private ground(p: EffectPlan): { x: number; z: number } | null {
    if (p.at) return p.at;
    const q = this.pos(p, 'to') ?? this.pos(p, 'from');
    return q ? { x: q.x, z: q.z } : null;
  }

  private start(p: EffectPlan): void {
    const magic = this.ctx.magic;
    const k = this.ctx.profile.particles;
    const reduced = this.reduced;
    this.spawned++;
    this.log.push({ eventId: p.eventId, code: p.code, kind: p.kind, vocab: p.vocab, via: p.via, from: p.from, to: p.to, law: p.law });
    if (this.log.length > 400) this.log.splice(0, 100);
    const color = col(VOCAB_COLOR[p.vocab]);
    const g = this.ground(p);
    switch (p.kind) {
      case 'ring':
        if (g) {
          magic?.pulse(g.x, g.z, p.radius ?? 1.2, p.dur, p.vocab, { width: p.vocab === 'rival' ? 0.07 : 0.1 });
          if (p.vocab === 'rival' && !reduced) magic?.pulse(g.x, g.z, (p.radius ?? 1.2) * 0.6, p.dur * 0.8, 'rival', { inward: true, delay: 150, width: 0.06, peak: 0.7 });
        }
        break;
      case 'ripple':
        if (g) {
          const n = reduced ? 1 : 3;
          for (let i = 0; i < n; i++) magic?.pulse(g.x, g.z, p.radius ?? 3, p.dur, p.vocab, { delay: i * 340, inward: p.vocab === 'rival', width: 0.09, peak: 0.7 - i * 0.12 });
          for (let i = 0; i < Math.round(10 * k); i++) this.mote(g.x, g.z, color, 0.5 + Math.random() * 0.7);
        }
        break;
      case 'glyph':
        if (g) {
          const r = p.radius ?? 3;
          magic?.pulse(g.x, g.z, r, p.dur, p.vocab, { width: 0.12, peak: 0.95 });
          if (!reduced) {
            magic?.pulse(g.x, g.z, r * 0.62, p.dur * 0.9, p.vocab, { delay: 220, width: 0.09, peak: 0.7 });
            // runes lift off the ground around the circle and drift up
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * Math.PI * 2 + 0.4;
              const rx = g.x + Math.cos(a) * r * 0.62;
              const rz = g.z + Math.sin(a) * r * 0.62;
              this.rune(null, v3(rx, this.ctx.heightAt(rx, rz) + 0.2, rz), color, 0.78, p.dur * 1.2, 0.8, i * 0.12, p.vocab);
            }
            for (let i = 0; i < Math.round(26 * k); i++) this.mote(g.x + (Math.random() - 0.5) * r, g.z + (Math.random() - 0.5) * r, color, 0.7 + Math.random() * 1.2);
          }
        }
        break;
      case 'rune': {
        const at = this.pos(p, 'to') ?? this.pos(p, 'from');
        if (at) {
          this.rune(p.to ?? null, at.clone().add(v3(0, 0.34, 0)), color, 0.46, p.dur, 0.28, 0, p.vocab);
          if (!reduced) for (let i = 0; i < Math.round(6 * k); i++) this.mote(at.x, at.z, color, 0.4 + Math.random() * 0.5, at.y);
        }
        if (p.to) this.ctx.actors?.gesture(p.to, 'listen', 1.6);
        break;
      }
      case 'eyes': {
        const at = this.pos(p, 'to');
        if (at) this.rune(p.to ?? null, at.clone().add(v3(0, 0.3, 0)), color, 0.3, p.dur, 0.1, 0, p.vocab, true);
        break;
      }
      case 'arc': {
        const a = this.pos(p, 'from');
        const b = this.pos(p, 'to');
        if (a && b) {
          this.ribbon(a, b, color, p.dur, p.vocab === 'resist' || p.vocab === 'rival');
          // the listener turns toward whoever is speaking
          if (p.from && p.to) {
            this.ctx.actors?.faceToward(p.to, a.x, a.z, 1.6);
            this.ctx.actors?.gesture(p.from, 'talk', 1.4);
          }
        }
        break;
      }
      case 'burst':
        if (g) {
          const y = this.ctx.heightAt(g.x, g.z) + 0.15;
          const n = Math.round(30 * k);
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 0.4 + Math.random() * 0.9;
            this.sparks.emit(g.x, y, g.z, Math.cos(a) * s * 0.5, 1.4 + Math.random() * 1.6, Math.sin(a) * s * 0.5, 0.8 + Math.random() * 0.9, 0.07, 0.015, col(0xffd27a), col(0xff4a2a), 1, 0.5, -1.2);
          }
          for (let i = 0; i < Math.round(8 * k); i++) this.smoke.emit(g.x + (Math.random() - 0.5) * 0.3, y + 0.2, g.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2, 0.5, (Math.random() - 0.5) * 0.2, 1.8, 0.2, 0.6, col(0x444444), col(0x777777), 0.55, 0.8, 0.2);
        }
        break;
      case 'puffs': {
        const at = this.pos(p, 'to') ?? (g ? v3(g.x, this.ctx.heightAt(g.x, g.z) + 0.3, g.z) : null);
        if (at) for (let i = 0; i < Math.round(12 * k); i++) this.smoke.emit(at.x + (Math.random() - 0.5) * 0.12, at.y + 0.1, at.z + (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.2, 0.35, (Math.random() - 0.5) * 0.2, 1.7, 0.1, 0.4, col(0x8a8a82), col(0xb8b8b0), 0.6, 0.9, 0.1);
        break;
      }
      case 'dust':
        if (g) {
          const y = this.ctx.heightAt(g.x, g.z) + 0.1;
          const r = p.radius ?? 1.4;
          for (let i = 0; i < Math.round(26 * k); i++) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.random() * r * 0.6;
            this.smoke.emit(g.x + Math.cos(a) * d, y, g.z + Math.sin(a) * d, Math.cos(a) * 0.45, 0.5 + Math.random() * 0.5, Math.sin(a) * 0.45, 1.6 + Math.random() * 0.8, 0.12, 0.5, col(0x8d7b5e), col(0xb5a889), 0.75, 1.0, 0.1);
          }
          // a few stones thrown clear
          for (let i = 0; i < Math.round(8 * k); i++) {
            const a = Math.random() * Math.PI * 2;
            this.smoke.emit(g.x, y + 0.3, g.z, Math.cos(a) * 0.9, 1.4 + Math.random(), Math.sin(a) * 0.9, 1.0, 0.07, 0.05, col(0x6d675d), col(0x4d4a44), 1, 0.3, -3.6);
          }
        }
        break;
      case 'splash':
        if (g) {
          const y = this.ctx.heightAt(g.x, g.z) + 0.1;
          magic?.pulse(g.x, g.z, p.radius ?? 1.2, p.dur, 'rain', { width: 0.08, peak: 0.8 });
          for (let i = 0; i < Math.round(34 * k); i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 0.4 + Math.random() * 0.9;
            this.sparks.emit(g.x, y, g.z, Math.cos(a) * s, 1.6 + Math.random() * 1.8, Math.sin(a) * s, 0.9 + Math.random() * 0.5, 0.06, 0.03, col(0xbfe8ff), col(0x4cc9f0), 0.9, 0.4, -4.2);
          }
        }
        break;
      case 'drops':
        if (g) {
          const r = p.radius ?? 2;
          const y = this.ctx.heightAt(g.x, g.z);
          // rain gathers over this ground: a curtain of streaks that falls for the length of the effect
          const n = Math.round(90 * k);
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.sqrt(Math.random()) * r;
            this.sparks.emit(g.x + Math.cos(a) * d, y + 2.4 + Math.random() * 1.2, g.z + Math.sin(a) * d, 0.2, -3.2 - Math.random() * 1.6, 0, 0.7 + Math.random() * 0.4, 0.045, 0.02, col(0xd0f0ff), col(0x4cc9f0), 0.8, 0.1, 0);
          }
          magic?.pulse(g.x, g.z, r, p.dur, 'rain', { width: 0.1, peak: 0.7 });
        }
        break;
      case 'focus':
        if (g && !reduced) this.onFocus?.(g.x, g.z);
        break;
      case 'lift':
        // the hens themselves rise (the reality layer owns them); a soft ring marks where the law took hold of them
        if (p.targets?.length && p.height) this.ctx.reality?.lift(p.targets, p.height, p.dur);
        break;
      case 'chill':
        if (g) {
          magic?.pulse(g.x, g.z, p.radius ?? 1.2, p.dur, p.vocab, { width: 0.06, peak: 0.6, inward: p.vocab === 'rain' });
          // cooler flames: pale motes sinking over the fire instead of sparks rising from it (hotter: the opposite)
          const y = this.ctx.heightAt(g.x, g.z) + 1.4;
          const n = Math.round(26 * k);
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.random() * (p.radius ?? 1.2);
            const cool = p.vocab === 'rain';
            this.sparks.emit(g.x + Math.cos(a) * d, y + (cool ? 0.6 : -1) + Math.random() * 0.4, g.z + Math.sin(a) * d, 0, cool ? -0.6 - Math.random() * 0.5 : 0.9 + Math.random() * 0.6, 0, 1 + Math.random() * 0.6, 0.05, 0.02, col(cool ? 0xdff6ff : 0xffd29a), col(cool ? 0x6fc3ff : 0xff6b57), 0.8, 0.3, 0);
          }
        }
        break;
      case 'gesture':
        if (p.to) this.ctx.actors?.gesture(p.to, 'talk', Math.max(0.6, p.dur / 1000));
        break;
    }
  }

  // ------------------------------------------------------------------------------------------------------ pieces

  private mote(x: number, z: number, c: THREE.Color, life: number, y0?: number): void {
    const y = y0 ?? this.ctx.heightAt(x, z) + 0.1;
    this.sparks.emit(x, y, z, (Math.random() - 0.5) * 0.18, 0.35 + Math.random() * 0.5, (Math.random() - 0.5) * 0.18, life, 0.05 + Math.random() * 0.04, 0.012, c, c.clone().lerp(col(0xffffff), 0.5), 0.9, 0.5, 0.15);
  }

  private rune(follow: string | null, at: THREE.Vector3, color: THREE.Color, size: number, durMs: number, rise: number, delay: number, vocab: Vocab, eye = false): void {
    const r = this.runes.find((q) => !q.busy);
    if (!r || !this.glyphs) return;
    const mat = r.sprite.material as THREE.SpriteMaterial;
    const base = eye ? this.glyphs.eye : this.glyphs.forVocab(vocab, this.spawned + Math.floor(at.x * 3));
    mat.map = base.map;
    mat.color.copy(color);
    r.busy = true;
    r.t = -delay;
    r.dur = Math.max(0.3, durMs / 1000);
    r.follow = follow;
    r.at.copy(at);
    r.rise = rise;
    r.size = size;
    r.color.copy(color);
    r.spin = eye ? 0 : (Math.random() - 0.5) * 0.8;
    r.sprite.visible = false;
  }

  private tickRunes(dt: number): void {
    for (const r of this.runes) {
      if (!r.busy) continue;
      r.t += dt;
      if (r.t < 0) continue;
      const u = r.t / r.dur;
      if (u >= 1) {
        r.busy = false;
        r.sprite.visible = false;
        continue;
      }
      let base = r.at;
      if (r.follow) {
        const h = this.ctx.actors?.head(r.follow);
        if (h) base = h.clone().add(v3(0, 0.22, 0));
      }
      const e = 1 - (1 - u) * (1 - u);
      const bob = this.reduced ? 0 : Math.sin(this.time * 3 + r.at.x * 5) * 0.015;
      r.sprite.position.set(base.x, base.y + (this.reduced ? 0 : r.rise * e) + bob, base.z);
      const pop = Math.min(1, u * 5);
      const s = r.size * (0.6 + 0.4 * pop) * (1 + 0.1 * Math.sin(this.time * 4));
      r.sprite.scale.set(s, s, s);
      const mat = r.sprite.material as THREE.SpriteMaterial;
      mat.opacity = Math.min(1, u * 6) * (1 - Math.max(0, (u - 0.55) / 0.45) ** 1.5);
      mat.rotation = r.spin * u;
      r.sprite.visible = true;
    }
  }

  /** lay a ribbon along a curve from `a` to `b`: out of one head, over, down to the other */
  private fillRibbon(r: Ribbon, a: THREE.Vector3, b: THREE.Vector3): void {
    r.a.copy(a);
    r.b.copy(b);
    r.lift = Math.min(1.5, 0.3 + a.distanceTo(b) * 0.1);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const w = 0.045;
    const arr = r.pos.array as Float32Array;
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      const y = a.y + (b.y - a.y) * t + Math.sin(Math.PI * t) * r.lift;
      arr[i * 6] = x + nx * w;
      arr[i * 6 + 1] = y;
      arr[i * 6 + 2] = z + nz * w;
      arr[i * 6 + 3] = x - nx * w;
      arr[i * 6 + 4] = y;
      arr[i * 6 + 5] = z - nz * w;
    }
    r.pos.needsUpdate = true;
  }

  private ribbon(a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color, durMs: number, rough: boolean): void {
    const r = this.ribbons.find((q) => !q.busy);
    if (!r) return;
    r.busy = true;
    r.t = 0;
    r.dur = Math.max(0.2, durMs / 1000);
    r.color.copy(color);
    r.mat.uniforms.uColor.value = color;
    r.mat.uniforms.uRough.value = rough ? 1 : 0;
    r.mat.uniforms.uDash.value = rough ? 1 : 0;
    r.mat.uniforms.uSolid.value = 0;
    this.fillRibbon(r, a, b);
    r.mesh.visible = true;
  }

  // ------------------------------------------------------------------------------------------------------ the social lens

  /**
   * The ties around whoever is selected (the strongest handful when nobody is), drawn as standing ribbons: brighter for more trust,
   * broken and cold for a rivalry. Bounded on purpose: the whole graph at once would be a tangle that hides the village.
   */
  private lensTies(): { a: string; b: string; w: number; rival: boolean }[] {
    const snap = this.snap;
    if (!snap) return [];
    const alive = new Set(snap.villagers.filter((v) => v.status !== 'dead').map((v) => v.id));
    const sel = this.selection?.kind === 'villager' ? this.selection.id : null;
    let ties = snap.ties.filter((t) => alive.has(t.a) && alive.has(t.b));
    if (sel) ties = ties.filter((t) => t.a === sel || t.b === sel);
    return ties
      .map((t) => ({ a: t.a, b: t.b, w: Math.max(t.ab, t.ba) / 100, rival: t.kind === 'rival' }))
      .sort((x, y) => y.w - x.w)
      .slice(0, sel ? this.lensRibbons.length : 8);
  }

  private refreshLens(): void {
    const on = this.lens === 'social';
    if (!on) {
      for (const r of this.lensRibbons) r.mesh.visible = false;
      return;
    }
    const ties = this.lensTies();
    this.lensRibbons.forEach((r, i) => {
      const t = ties[i];
      const a = t ? this.pos({ from: t.a } as EffectPlan, 'from') : null;
      const b = t ? this.pos({ to: t.b } as EffectPlan, 'to') : null;
      if (!t || !a || !b) {
        r.mesh.visible = false;
        return;
      }
      const c = col(VOCAB_COLOR[t.rival ? 'resist' : 'trust']);
      r.color.copy(c);
      r.mat.uniforms.uColor.value = c;
      r.mat.uniforms.uSolid.value = 1;
      r.mat.uniforms.uRough.value = t.rival ? 1 : 0;
      r.mat.uniforms.uDash.value = t.rival ? 1 : 0;
      r.mat.uniforms.uFade.value = 0.3 + 0.6 * Math.min(1, t.w);
      this.fillRibbon(r, a, b);
      r.mesh.visible = true;
    });
  }

  private tickRibbons(dt: number, time: number): void {
    const k = this.ctx.profile.particles;
    for (const r of this.ribbons) {
      if (!r.busy) continue;
      r.t += dt;
      const u = r.t / r.dur;
      if (u >= 1.25) {
        r.busy = false;
        r.mesh.visible = false;
        continue;
      }
      const head = Math.min(1, u / 0.8);
      r.mat.uniforms.uHead.value = head;
      r.mat.uniforms.uTime.value = time;
      r.mat.uniforms.uFade.value = u < 0.8 ? 1 : Math.max(0, 1 - (u - 0.8) / 0.45);
      // a bright mote rides the head of the ribbon, and a trail of smaller ones falls behind it
      if (head < 1 && Math.random() < 0.9 * (0.4 + k)) {
        const t = head;
        const x = r.a.x + (r.b.x - r.a.x) * t;
        const z = r.a.z + (r.b.z - r.a.z) * t;
        const y = r.a.y + (r.b.y - r.a.y) * t + Math.sin(Math.PI * t) * r.lift;
        this.sparks.emit(x, y, z, (Math.random() - 0.5) * 0.12, (Math.random() - 0.3) * 0.12, (Math.random() - 0.5) * 0.12, 0.5, 0.11, 0.02, r.color, r.color.clone().lerp(col(0xffffff), 0.6), 1, 1.5, 0);
      }
    }
  }

  // ------------------------------------------------------------------------------------------------------ the quiet life of a working law

  private ambient(dt: number): void {
    if (this.reduced || !this.snap) return;
    this.ambientT += dt;
    if (this.ambientT < 0.12) return;
    const step = this.ambientT;
    this.ambientT = 0;
    const k = this.ctx.profile.particles;
    for (const l of this.visuals) {
      if (l.status !== 'active' && l.status !== 'awakening') continue;
      const color = col(VOCAB_COLOR[l.vocab]);
      const live = l.status === 'active' && l.powered;
      const rate = (live ? 1 : 0.25) * k;
      if (live && l.sources.length) {
        for (const s of l.sources) {
          // a power source breathes out: ripples going outward, or pressure coming in when it is a rival belief
          if (Math.random() < step / 2.6) this.ctx.magic?.pulse(s.x, s.z, Math.min(5, Math.max(2, l.radius)), 2200, l.vocab, { inward: l.vocab === 'rival', width: 0.08, peak: 0.45 });
          if (Math.random() < step * 7 * rate) this.mote(s.x + (Math.random() - 0.5) * 0.5, s.z + (Math.random() - 0.5) * 0.5, color, 1.2 + Math.random(), this.ctx.heightAt(s.x, s.z) + 0.3);
        }
      }
      if (live && l.subject === 'bridge') {
        const b = this.snap.landmarks.find((m) => m.kind === 'bridge');
        if (b && b.tiles.length && Math.random() < step * 10 * rate) {
          const t = b.tiles[Math.floor(Math.random() * b.tiles.length)];
          const p = engineToWorld(t[0], t[1]);
          this.mote(p.x + (Math.random() - 0.5) * 0.8, p.z + (Math.random() - 0.5) * 0.5, color, 1.0, this.ctx.heightAt(p.x, p.z) + 0.25);
        }
      }
      if (live && l.subject === 'rain' && Math.random() < step * 20 * rate) {
        const reg = this.snap.regions.find((r) => r.id === l.region);
        if (reg && reg.rects.length) {
          const rc = reg.rects[Math.floor(Math.random() * reg.rects.length)];
          const x = rc[0] + Math.random() * (rc[2] - rc[0] + 1) + 0.5;
          const z = rc[1] + Math.random() * (rc[3] - rc[1] + 1) + 0.5;
          this.sparks.emit(x, this.ctx.heightAt(x, z) + 2.6, z, 0.2, -3.4, 0, 0.7, 0.04, 0.02, col(0xd0f0ff), col(0x4cc9f0), 0.7, 0.1, 0);
        }
      }
      if (live && l.subject === 'grain' && Math.random() < step * 12 * rate) {
        const reg = this.snap.regions.find((r) => r.id === l.region);
        if (reg && reg.rects.length) {
          const rc = reg.rects[Math.floor(Math.random() * reg.rects.length)];
          const x = rc[0] + Math.random() * (rc[2] - rc[0] + 1) + 0.5;
          const z = rc[1] + Math.random() * (rc[3] - rc[1] + 1) + 0.5;
          this.mote(x, z, color, 1.4);
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------------------ plumbing

  dispose(): void {
    this.sparks.dispose();
    this.smoke.dispose();
    for (const r of [...this.ribbons, ...this.lensRibbons]) {
      r.mesh.geometry.dispose();
      r.mat.dispose();
    }
    for (const r of this.runes) (r.sprite.material as THREE.SpriteMaterial).dispose();
    this.glyphs?.dispose();
    this.ribbons = [];
    this.lensRibbons = [];
    this.runes = [];
  }
}
