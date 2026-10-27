import * as THREE from 'three';
import { VOCAB_COLOR, type LawVisual, type Vocab } from './plan.ts';
import type { SceneSnapshot } from './snapshot.ts';

/**
 * The glow belief leaves on the ground and the water. It is part of the terrain's and the river's own shading rather than a layer drawn
 * on top, so it follows the hills, passes under bridges and trees, and costs nothing per object. Two things feed it:
 *
 *  - a small per-tile texture (one channel per colour vocabulary) holding where each law's ground is and how strongly it is felt, set
 *    from the laws the engine reports, never from a guess;
 *  - a handful of pulses (expanding rings and ripples) that the effects layer starts from engine events.
 *
 * Each vocabulary has its own pattern as well as its own colour (a lattice of diamonds for trust, hatching for a rival belief, drops
 * for rain, dots for safety), so the cues survive colour-blindness and a greyscale screenshot.
 */
const PULSES = 16;
const HOLLOW = 6;
const REACH = 6;

export const MAGIC_GLSL = /* glsl */ `
  uniform sampler2D uMagic;
  uniform vec2 uMagicDim;
  uniform float uMagicTime;
  uniform float uMagicOn;
  uniform vec4 uPulse[${PULSES}];
  uniform vec4 uPulseCol[${PULSES}];
  uniform vec4 uHollow[${HOLLOW}];
  uniform vec4 uReach[${REACH}];
  uniform vec4 uReachCol[${REACH}];

  // patterns are drawn around a source and go out from it: rings and ticks for trust, a spiral closing in for a rival belief,
  // falling drops for rain, a wheel of dots for safety. They differ in shape as well as colour.
  float magicPattern(vec2 rel, float id) {
    float d = length(rel);
    float ang = atan(rel.y, rel.x) / 6.2831853;
    if (id < 0.5) {
      float rings = smoothstep(0.82, 0.94, abs(fract(d * 1.25 - uMagicTime * 0.12) - 0.5) * 2.0);
      float band = step(0.5, fract(d * 0.625 - uMagicTime * 0.06));
      float ticks = smoothstep(0.84, 0.95, abs(fract(ang * 24.0 + band * 0.5) - 0.5) * 2.0) * band;
      return clamp(rings + ticks * 0.8, 0.0, 1.0);
    }
    if (id < 1.5) {
      float arms = abs(fract(ang * 3.0 + d * 0.9 + uMagicTime * 0.14) - 0.5);
      float dashed = step(0.5, fract(d * 4.0));
      return smoothstep(0.38, 0.5, arms) * (0.5 + 0.5 * dashed);
    }
    if (id < 2.5) {
      vec2 cell = fract(rel * 3.4) - 0.5;
      return 1.0 - smoothstep(0.08, 0.2 + 0.1 * sin(uMagicTime * 2.0 + floor(rel.x * 3.4) * 1.7 + floor(rel.y * 3.4) * 2.3), length(cell));
    }
    float row = floor(d * 1.6);
    float n = max(6.0, row * 7.0);
    float a2 = fract(ang * n + row * 0.37);
    vec2 q = vec2((a2 - 0.5) * 0.35, fract(d * 1.6) - 0.5);
    return 1.0 - smoothstep(0.08, 0.16, length(q));
  }

  vec3 magicGlow(vec2 xz) {
    vec3 col = vec3(0.0);
    if (uMagicOn > 0.5) {
      vec4 m = texture2D(uMagic, xz / uMagicDim);
      // each channel stores 0 outside a law's ground and 0.5 + level/2 inside it
      vec4 inside = smoothstep(0.22, 0.5, m);
      vec4 lvl = clamp((m - 0.5) * 2.0, 0.0, 1.0);
      vec4 rim = smoothstep(0.12, 0.32, m) * (1.0 - smoothstep(0.34, 0.62, m));
      // trust: a slow lattice of diamonds
      float trust = inside.r * (0.04 + 0.05 * lvl.r) + rim.r * (0.3 + 0.45 * lvl.r);
      col += vec3(1.0, 0.70, 0.26) * trust * (0.5 + 0.5 * lvl.r);
      // rival belief: diagonal hatching moving the other way, cold
      float rival = inside.g * (0.04 + 0.05 * lvl.g) + rim.g * (0.34 + 0.4 * lvl.g);
      col += vec3(0.42, 0.34, 1.0) * rival * 0.9;
      // rain: a field of small drops
      float rain = inside.b * (0.04 + 0.05 * lvl.b) + rim.b * (0.3 + 0.4 * lvl.b);
      col += vec3(0.30, 0.80, 0.96) * rain * 0.9;
      // safe: a ring of dots rising in brightness with strength
      float safe = inside.a * (0.04 + 0.05 * lvl.a) + rim.a * (0.28 + 0.3 * lvl.a);
      col += vec3(0.44, 0.84, 0.54) * safe * 0.9;
    }
    // the ground a power source actually reaches (the engine's own radius around each lit beacon, rung bell, manned bridge): the strong motif
    for (int i = 0; i < ${REACH}; i++) {
      vec4 r = uReach[i];
      if (r.w > 0.002) {
        float d = length(xz - r.xy);
        float inside = 1.0 - smoothstep(r.z - 0.3, r.z + 0.05, d);
        float edge = exp(-pow((d - r.z) / 0.07, 2.0));
        float pat = magicPattern(xz - r.xy, uReachCol[i].w);
        // brightest at the source, fading to the edge, with a bright rim at the exact reach
        float core = 1.0 - smoothstep(0.0, r.z, d);
        col += uReachCol[i].rgb * (inside * (0.025 + 0.6 * pat * r.w * (0.4 + 0.6 * core)) + edge * (0.22 + 0.55 * r.w) + core * core * 0.07 * r.w);
      }
    }
    // expanding rings and ripples from engine events
    for (int i = 0; i < ${PULSES}; i++) {
      vec4 p = uPulse[i];
      if (p.w > 0.002) {
        float d = length(xz - p.xy);
        float w = uPulseCol[i].w;
        float ring = exp(-pow((d - p.z) / w, 2.0));
        float fill = (1.0 - smoothstep(p.z * 0.2, p.z, d)) * 0.03;
        col += uPulseCol[i].rgb * (ring * 1.15 + fill) * p.w;
      }
    }
    // a cold dashed circle where a law is waiting for what would power it
    for (int i = 0; i < ${HOLLOW}; i++) {
      vec4 h = uHollow[i];
      if (h.w > 0.002) {
        vec2 q = xz - h.xy;
        float d = length(q);
        float ang = atan(q.y, q.x) + uMagicTime * 0.25;
        float dash = smoothstep(0.1, 0.3, abs(fract(ang * 1.9099) - 0.5));
        col += vec3(0.58, 0.68, 0.82) * exp(-pow((d - h.z) / 0.05, 2.0)) * dash * h.w * 0.9;
      }
    }
    return col;
  }
`;

interface Pulse {
  x: number;
  z: number;
  r0: number;
  r1: number;
  t0: number;
  dur: number;
  color: THREE.Color;
  width: number;
  peak: number;
}

const CHANNEL: Record<Vocab, number> = { trust: 0, resist: 0, rival: 1, rain: 2, danger: 3, safe: 3, neutral: 0 };

export class MagicField {
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly tex: THREE.DataTexture;
  private readonly data: Uint8Array;
  private readonly w: number;
  private readonly h: number;
  /** the level each tile is easing toward, per channel (0 = none, otherwise 0.1..1) */
  private target: Float32Array;
  private current: Float32Array;
  private mask: Float32Array;
  private pulses: Pulse[] = [];
  private clock = 0;
  private instant = true;
  private dirty = true;
  reduced = false;

  constructor(snap: SceneSnapshot) {
    this.w = snap.w;
    this.h = snap.h;
    this.data = new Uint8Array(this.w * this.h * 4);
    this.target = new Float32Array(this.w * this.h * 4);
    this.current = new Float32Array(this.w * this.h * 4);
    this.mask = new Float32Array(this.w * this.h * 4);
    this.tex = new THREE.DataTexture(this.data, this.w, this.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = THREE.ClampToEdgeWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    this.uniforms = {
      uMagic: { value: this.tex },
      uMagicDim: { value: new THREE.Vector2(this.w, this.h) },
      uMagicTime: { value: 0 },
      uMagicOn: { value: 1 },
      uPulse: { value: Array.from({ length: PULSES }, () => new THREE.Vector4(0, 0, 1, 0)) },
      uPulseCol: { value: Array.from({ length: PULSES }, () => new THREE.Vector4(1, 1, 1, 0.12)) },
      uHollow: { value: Array.from({ length: HOLLOW }, () => new THREE.Vector4(0, 0, 1, 0)) },
      uReach: { value: Array.from({ length: REACH }, () => new THREE.Vector4(0, 0, 1, 0)) },
      uReachCol: { value: Array.from({ length: REACH }, () => new THREE.Vector4(1, 1, 1, 0)) },
    };
  }

  /** the number of live pulses, for the effects count */
  get pulseCount(): number {
    return this.pulses.length;
  }

  /** the strongest level on each channel, for tests and the quality monitor */
  levels(): { trust: number; rival: number; rain: number; safe: number } {
    let a = 0;
    let b = 0;
    let c = 0;
    let d = 0;
    for (let i = 0; i < this.w * this.h; i++) {
      a = Math.max(a, this.target[i * 4]);
      b = Math.max(b, this.target[i * 4 + 1]);
      c = Math.max(c, this.target[i * 4 + 2]);
      d = Math.max(d, this.target[i * 4 + 3]);
    }
    return { trust: a, rival: b, rain: c, safe: d };
  }

  /** set the ground each law occupies from what the engine reports */
  setLaws(laws: LawVisual[], snap: SceneSnapshot, instant: boolean): void {
    this.target.fill(0);
    const hollow = this.uniforms.uHollow.value as THREE.Vector4[];
    hollow.forEach((v) => v.set(0, 0, 1, 0));
    let hi = 0;
    const reach = this.uniforms.uReach.value as THREE.Vector4[];
    const reachCol = this.uniforms.uReachCol.value as THREE.Vector4[];
    reach.forEach((v) => v.set(0, 0, 1, 0));
    let ri = 0;
    for (const l of laws) {
      const reg = snap.regions.find((r) => r.id === l.region);
      if (!reg) continue;
      const ch = CHANNEL[l.vocab];
      // a law that is waiting for what would power it is felt less, and the missing piece is marked
      const level = l.level * (l.powered ? 1 : 0.5);
      this.mask.fill(0);
      for (const rc of reg.rects) {
        for (let y = Math.max(0, rc[1]); y <= Math.min(this.h - 1, rc[3]); y++) {
          for (let x = Math.max(0, rc[0]); x <= Math.min(this.w - 1, rc[2]); x++) this.mask[y * this.w + x] = 1;
        }
      }
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (this.mask[y * this.w + x] === 0) continue;
          // the river bed lies under the water: only a law about the river or the rain lights it
          if (snap.terrain[y * this.w + x] === 1 && l.vocab !== 'rain' && !l.river) continue;
          const i = (y * this.w + x) * 4 + ch;
          this.target[i] = Math.max(this.target[i], 0.5 + 0.5 * Math.min(1, Math.max(0.05, level)));
        }
      }
      if (l.powered && l.status === 'active' && l.radius > 0) {
        const c = new THREE.Color(VOCAB_COLOR[l.vocab]);
        const pattern = l.vocab === 'rival' ? 1 : l.vocab === 'rain' ? 2 : l.vocab === 'safe' ? 3 : 0;
        for (const src of l.sources) {
          if (ri >= REACH) break;
          reach[ri].set(src.x, src.z, l.radius + 0.5, Math.min(1, Math.max(0.2, l.level)));
          reachCol[ri].set(c.r, c.g, c.b, pattern);
          ri++;
        }
      }
      if (!l.powered) for (const c of l.candidates) if (hi < hollow.length) hollow[hi++].set(c.x, c.z, 0.9, 0.9);
    }
    this.instant = instant || this.reduced;
    this.dirty = true;
  }

  /** an expanding ring (or a ripple that moves inward when `inward`) over the ground and the water */
  pulse(x: number, z: number, radius: number, durMs: number, vocab: Vocab, opts: { delay?: number; inward?: boolean; width?: number; peak?: number } = {}): void {
    if (this.pulses.length >= PULSES) this.pulses.shift();
    this.pulses.push({
      x,
      z,
      r0: opts.inward ? radius : 0.05,
      r1: opts.inward ? 0.1 : radius,
      t0: this.clock + (opts.delay ?? 0) / 1000,
      dur: Math.max(0.15, durMs / 1000),
      color: new THREE.Color(VOCAB_COLOR[vocab]),
      width: opts.width ?? 0.11,
      peak: opts.peak ?? 0.9,
    });
  }

  clear(): void {
    this.pulses = [];
    this.apply();
  }

  tick(dt: number, time: number): void {
    this.clock = time;
    this.uniforms.uMagicTime.value = time;
    if (this.dirty) {
      // ease the ground toward what the engine says, so a law waking is a glow spreading in rather than a switch
      const k = this.instant ? 1 : Math.min(1, dt * 1.8);
      let moving = false;
      for (let i = 0; i < this.current.length; i++) {
        const t = this.target[i];
        const c = this.current[i];
        if (c === t) continue;
        const n = Math.abs(t - c) < 0.004 ? t : c + (t - c) * k;
        this.current[i] = n;
        this.data[i] = Math.round(n * 255);
        if (n !== t) moving = true;
      }
      this.tex.needsUpdate = true;
      if (!moving) this.dirty = false;
    }
    this.apply();
  }

  private apply(): void {
    const P = this.uniforms.uPulse.value as THREE.Vector4[];
    const C = this.uniforms.uPulseCol.value as THREE.Vector4[];
    const keep: Pulse[] = [];
    let i = 0;
    for (const p of this.pulses) {
      const u = (this.clock - p.t0) / p.dur;
      if (u >= 1) continue;
      keep.push(p);
      if (u < 0 || i >= PULSES) continue;
      const e = 1 - (1 - u) * (1 - u);
      const r = p.r0 + (p.r1 - p.r0) * e;
      const a = p.peak * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.8;
      P[i].set(p.x, p.z, Math.max(0.05, r), a);
      C[i].set(p.color.r, p.color.g, p.color.b, p.width);
      i++;
    }
    this.pulses = keep;
    for (; i < PULSES; i++) P[i].set(0, 0, 1, 0);
  }

  dispose(): void {
    this.tex.dispose();
  }
}

/** put the magic glow into the terrain's standard material */
export function attachMagicToStandard(mat: THREE.MeshStandardMaterial, field: MagicField): void {
  mat.onBeforeCompile = (shader) => {
    for (const k of Object.keys(field.uniforms)) shader.uniforms[k] = field.uniforms[k];
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vMagicXZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMagicXZ = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vMagicXZ;\n${MAGIC_GLSL}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += magicGlow(vMagicXZ);');
  };
  mat.customProgramCacheKey = () => 'terrain-magic-1';
  mat.needsUpdate = true;
}

/** put the glow into the water shader's colour (the water's own fragment source is passed in and returned changed) */
export function injectMagicIntoWater(frag: string): string {
  return frag
    .replace('void main() {', `${MAGIC_GLSL}\n  void main() {`)
    .replace('col *= uTint;', 'col *= uTint;\n    col += magicGlow(vWorld.xz) * 0.8;');
}
