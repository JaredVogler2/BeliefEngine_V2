import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Layer, WorldContext } from './context.ts';
import { engineToWorld } from './coords.ts';
import { box, cyl, place, sphere } from './geom.ts';
import { Particles, viewScale } from './particles.ts';
import { DISPLAY_GLSL, displayUniforms } from './post.ts';
import type { SceneChanges, SceneSnapshot } from './snapshot.ts';

/**
 * The dangers on the ground: the wolf packs the chapter has sent so far, where the engine has them, as many wolves as the 2D map draws
 * for each (coat and eyes running red once the pack is starving) and a mark over each pack at the overview; fire spreading over the
 * ground (flames and smoke on every tile the engine says is burning, out of the roof of a building on fire); and the smoke lying around
 * a lit fire, the ground wolves keep off and that sickens whoever stands in it. The 2D map always drew all three and the 3D world drew
 * none (3D implementation plan, stage 1). An observer like every layer: positions come from the snapshot; only the trot between them
 * and the drift of the flames and smoke are the renderer's own.
 */
const MAX_WOLVES = 36;
const MAX_PACKS = 8;
const MAX_FIRE_TILES = 48;
const MAX_SMOKE_TILES = 96;
/** a building taller than this above its ground burns from its roof, not from the ground under it */
const TALL = 0.3;
/** a pack's wolves stand in a loose ring this far from where the engine has the pack */
const RING = 0.3;
/** a wolf is drawn a little larger than life beside the villagers, so it reads (and up to a third larger again at the overview) */
const WOLF_SCALE = 1.1;
/** seconds a pack takes to trot to where the engine moved it */
const TROT = 1.6;
const HUNGRY = 75;

/**
 * One mark over each pack, sized in pixels and drawn through the trees, that fades in as the camera pulls back: at the overview a wolf in
 * the forest is hidden by the canopy, and the 2D map labels every pack. A point-down warning triangle with a pale rim, so it is not
 * mistaken for the diamonds over the villagers.
 */
const MARK_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vFade;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = -mv.z;
    gl_PointSize = clamp(aSize * uScale / d, 10.0, 24.0) * step(0.001, aSize);
    vFade = smoothstep(8.0, 17.0, d);
    vColor = aColor;
  }
`;
const MARK_FRAG = /* glsl */ `
  ${DISPLAY_GLSL}
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float halfW = 0.46 * (0.42 - p.y) / 0.78;
    if (p.y < -0.36 || p.y > 0.42 || abs(p.x) > halfW) discard;
    float edge = min(p.y + 0.36, (halfW - abs(p.x)) * 0.85);
    vec3 c = mix(vec3(1.0), vColor, smoothstep(0.05, 0.11, edge));
    float a = vFade * 0.92;
    if (a < 0.02) discard;
    // (held under white: a mark is a label, it must not glow)
    gl_FragColor = vec4(postDisplay(min(c, vec3(0.8))), a);
    #include <colorspace_fragment>
  }
`;

interface FireTile {
  x: number;
  /** the ground */
  y: number;
  z: number;
  /** the top of the standing building on the tile (its ground when there is none) */
  top: number;
  building: string | null;
}

interface Wolf {
  pack: string;
  k: number;
  from: THREE.Vector2;
  to: THREE.Vector2;
  at: THREE.Vector2;
  heading: number;
  t: number;
  phase: number;
}

/** A wolf facing +x, standing on y = 0: shoulders about half a villager's height, as in life, and a little over half a tile long with its tail. */
function wolfBody(): THREE.BufferGeometry {
  // a cylinder laid along +x, its base at the back and its top at the front
  const ALONG = -Math.PI / 2;
  const parts = [
    // body from haunch to chest, deeper at the chest, rounded at both ends
    place(cyl(0.046, 0.058, 0.22, 8), -0.11, 0.165, 0, 0, 1, 1, 1, 0, ALONG),
    place(sphere(0.058, 8, 6), 0.1, 0.165, 0),
    place(sphere(0.047, 8, 6), -0.11, 0.165, 0),
    // neck rising forward to the head, and a tapering muzzle
    place(cyl(0.044, 0.035, 0.09, 6), 0.09, 0.17, 0, 0, 1, 1, 1, 0, -Math.PI / 4),
    place(sphere(0.045, 8, 6, 0.9), 0.165, 0.245, 0),
    place(cyl(0.03, 0.013, 0.085, 6), 0.185, 0.235, 0, 0, 1, 1, 1, 0, ALONG),
    // upright ears
    place(cyl(0.02, 0.002, 0.05, 4), 0.155, 0.27, 0.024),
    place(cyl(0.02, 0.002, 0.05, 4), 0.155, 0.27, -0.024),
    // a bushy tail hanging back and down
    place(cyl(0.026, 0.01, 0.16, 6), -0.14, 0.18, 0, 0, 1, 1, 1, 0, 2.2),
    // legs
    ...[
      [0.085, 0.032],
      [0.085, -0.032],
      [-0.1, 0.032],
      [-0.1, -0.032],
    ].map(([x, z]) => place(cyl(0.015, 0.018, 0.13, 5), x, 0, z)),
  ];
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

function wolfEyes(): THREE.BufferGeometry {
  const parts = [place(box(0.014, 0.014, 0.014), 0.203, 0.252, 0.022), place(box(0.014, 0.014, 0.014), 0.203, 0.252, -0.022)];
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

/** a small stable number from a string, for where each wolf stands in its pack (never the engine's random numbers) */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export class HazardsLayer implements Layer {
  readonly group = new THREE.Group();
  private readonly bodies: THREE.InstancedMesh;
  private readonly eyes: THREE.InstancedMesh;
  /** the glow of the flames (additive), and their body (blended normally, so a fire reads over a bright roof or a pale sky too) */
  private readonly flames: Particles;
  private readonly blaze: Particles;
  private readonly smoke: Particles;
  private readonly haze: Particles;
  private readonly marks: THREE.Points;
  private readonly markPos = new Float32Array(MAX_PACKS * 3);
  private readonly markCol = new Float32Array(MAX_PACKS * 3);
  private readonly markSize = new Float32Array(MAX_PACKS);
  private markCount = 0;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  private wolves: Wolf[] = [];
  private hungry = new Set<string>();
  private fireTiles: FireTile[] = [];
  /** tiles under the smoke of a lit fire, with how thick it lies there (1-3) */
  private smokeTiles: { x: number; y: number; z: number; d: number }[] = [];
  private smokeWeight = 0;
  private packsKey = '';
  private centre = new THREE.Vector2();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly cEye = new THREE.Color(0xffc24a);
  private readonly cStarving = new THREE.Color(0xff3b1f);
  private readonly cFur = new THREE.Color(0xffffff);
  /** a starving pack's whole coat runs red, so it reads from the overview (its eyes are too small to) */
  private readonly cFurStarving = new THREE.Color(0xffa08c);
  /** the 2D map's pack label colour, and a hot red for a starving pack */
  private readonly cMark = new THREE.Color(0xffb3a8);
  private readonly cMarkStarving = new THREE.Color(0xff5a4a);
  private readonly cFlameA = new THREE.Color(0xffe2a0);
  private readonly cFlameB = new THREE.Color(0xd23a1a);
  private readonly cBlazeA = new THREE.Color(0xffb444);
  private readonly cBlazeB = new THREE.Color(0xc2361a);
  private readonly cSmokeA = new THREE.Color(0x5e5a54);
  private readonly cSmokeB = new THREE.Color(0x9a958c);
  private readonly cHazeA = new THREE.Color(0x9c9da3);
  private readonly cHazeB = new THREE.Color(0xb9babe);
  private emitDebt = 0;
  private hazeDebt = 0;

  constructor(ctx: WorldContext) {
    const body = wolfBody();
    const eyes = wolfEyes();
    this.geos.push(body, eyes);
    // the 2D map's blue-grey, a little lighter so a wolf stands out on the forest floor
    const fur = new THREE.MeshStandardMaterial({ color: 0x62676e, roughness: 0.95, metalness: 0, emissive: 0x15171a, emissiveIntensity: 0.6 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mats.push(fur, glow);
    this.bodies = new THREE.InstancedMesh(body, fur, MAX_WOLVES);
    this.eyes = new THREE.InstancedMesh(eyes, glow, MAX_WOLVES);
    for (const [name, mesh] of [['hazard-wolves', this.bodies], ['hazard-wolf-eyes', this.eyes]] as const) {
      mesh.name = name;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    }
    this.bodies.castShadow = true;
    for (let i = 0; i < MAX_WOLVES; i++) {
      this.bodies.setColorAt(i, this.cFur);
      this.eyes.setColorAt(i, this.cEye);
    }
    // what burns and where the smoke lies is the game's information, so even the lowest tier keeps a blaze and a haze that read
    const room = Math.max(0.6, ctx.profile.particles);
    this.flames = new Particles(Math.round(300 * room), true);
    this.blaze = new Particles(Math.round(240 * room), false);
    this.smoke = new Particles(Math.round(180 * room), false);
    this.haze = new Particles(280, false);
    this.group.add(this.haze.points, this.smoke.points, this.blaze.points, this.flames.points);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(this.markPos, 3).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('aColor', new THREE.BufferAttribute(this.markCol, 3).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('aSize', new THREE.BufferAttribute(this.markSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.marks = new THREE.Points(mg, new THREE.ShaderMaterial({ vertexShader: MARK_VERT, fragmentShader: MARK_FRAG, transparent: true, depthWrite: false, depthTest: false, uniforms: { uScale: viewScale, ...displayUniforms } }));
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 9;
    this.marks.name = 'hazard-pack-marks';
    this.group.add(this.marks);
    this.group.name = 'hazards';
  }

  /** wolves drawn now, the burning tiles flames rise from, the tiles smoke lies over, and the live flame and smoke puffs (for the tests) */
  hazardCounts(): { wolves: number; packMarks: number; fireTiles: number; smokeTiles: number; puffs: number } {
    return { wolves: this.bodies.count, packMarks: this.markCount, fireTiles: this.fireTiles.length, smokeTiles: this.smokeTiles.length, puffs: this.flames.count + this.blaze.count + this.smoke.count + this.haze.count };
  }

  /** the standing buildings flames are rising from (a burning tile with one on it), for the tests */
  burningBuildings(): string[] {
    return this.fireTiles.flatMap((f) => (f.building ? [f.building] : []));
  }

  update(snap: SceneSnapshot, changes: SceneChanges, ctx: WorldContext): void {
    if (changes.rebuild) {
      this.wolves = [];
      this.packsKey = '';
    }
    this.centre.set(snap.w / 2, snap.h / 2);
    const packs = snap.packs.slice(0, snap.activePacks);
    const key = JSON.stringify(packs) + (changes.rebuild ? '!' : '');
    if (key !== this.packsKey) {
      this.packsKey = key;
      this.placeWolves(packs, ctx);
    }
    if (changes.fire || changes.rebuild) {
      this.fireTiles = [];
      for (let i = 0; i < snap.fire.length && this.fireTiles.length < MAX_FIRE_TILES; i++) {
        if (snap.fire[i] <= 0) continue;
        const tx = i % snap.w;
        const ty = Math.floor(i / snap.w);
        const w = engineToWorld(tx, ty);
        const ground = ctx.heightAt(w.x, w.z);
        // a home on fire burns from its roof, as the 2D map draws it (the landmarks have been placed: they update first)
        const lm = snap.landmarks.find((l) => l.x === tx && l.y === ty && l.hp > 0);
        const at = lm ? ctx.locate?.('landmark', lm.id) : null;
        // a building's hit volume stands on its ground with its centre half way up
        const top = at ? 2 * at.y - ground : ground;
        if (lm && at && top - ground > TALL) this.fireTiles.push({ x: at.x, y: ground, z: at.z, top, building: lm.id });
        else this.fireTiles.push({ x: w.x, y: ground, z: w.z, top: ground, building: null });
      }
      this.smokeTiles = [];
      this.smokeWeight = 0;
      for (let i = 0; i < snap.smoke.length && this.smokeTiles.length < MAX_SMOKE_TILES; i++) {
        const d = snap.smoke[i];
        if (d <= 0) continue;
        const w = engineToWorld(i % snap.w, Math.floor(i / snap.w));
        this.smokeTiles.push({ x: w.x, y: ctx.heightAt(w.x, w.z), z: w.z, d });
        this.smokeWeight += d;
      }
      if (!this.smokeTiles.length) this.haze.clear();
      if (!this.fireTiles.length) {
        this.flames.clear();
        this.blaze.clear();
        this.smoke.clear();
      }
    }
  }

  /** each pack's wolves around where the engine has it; a pack that moved trots there (or is simply there, with reduced motion) */
  private placeWolves(packs: SceneSnapshot['packs'], ctx: WorldContext): void {
    const old = new Map(this.wolves.map((w) => [`${w.pack}#${w.k}`, w]));
    const next: Wolf[] = [];
    this.hungry = new Set(packs.filter((p) => p.hunger >= HUNGRY).map((p) => p.id));
    for (const pack of packs) {
      // the 2D map draws one wolf more than the pack's size
      const n = Math.max(1, Math.min(6, Math.round(pack.size) + 1));
      const c = engineToWorld(pack.x, pack.y);
      const a0 = hash(pack.id) * Math.PI * 2;
      for (let k = 0; k < n && next.length < MAX_WOLVES; k++) {
        const r = n === 1 ? 0 : RING * (0.8 + 0.4 * hash(`${pack.id}:${k}`));
        const a = a0 + (k * Math.PI * 2) / n;
        const to = new THREE.Vector2(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r);
        const prev = old.get(`${pack.id}#${k}`);
        const from = prev ? prev.at.clone() : to.clone();
        const moved = from.distanceTo(to) > 0.05;
        // a moving wolf faces where it goes; a waiting one faces the village it is stalking
        const dir = moved ? to.clone().sub(from) : this.centre.clone().sub(to);
        next.push({ pack: pack.id, k, from, to, at: from.clone(), heading: Math.atan2(-dir.y, dir.x), t: moved && !ctx.reducedMotion ? 0 : TROT, phase: hash(`${pack.id}~${k}`) * 6.28 });
      }
    }
    this.wolves = next;
    this.draw(0, ctx);
  }

  private draw(time: number, ctx: WorldContext): void {
    // the people grow a little at the overview so they stay legible; the wolves do the same
    const t = Math.min(1, Math.max(0, (ctx.viewDistance - 12) / 22));
    const scale = WOLF_SCALE * (1 + 0.32 * t * t * (3 - 2 * t));
    let i = 0;
    for (const w of this.wolves) {
      const u = Math.min(1, w.t / TROT);
      const e = u < 1 ? u * u * (3 - 2 * u) : 1;
      w.at.set(w.from.x + (w.to.x - w.from.x) * e, w.from.y + (w.to.y - w.from.y) * e);
      const trotting = u < 1;
      const bob = ctx.reducedMotion ? 0 : trotting ? Math.abs(Math.sin(time * 11 + w.phase)) * 0.035 : Math.sin(time * 2.2 + w.phase) * 0.006;
      this.p.set(w.at.x, ctx.heightAt(w.at.x, w.at.y) + bob, w.at.y);
      this.q.setFromAxisAngle(this.up, w.heading);
      this.s.setScalar(scale);
      this.m.compose(this.p, this.q, this.s);
      this.bodies.setMatrixAt(i, this.m);
      this.eyes.setMatrixAt(i, this.m);
      const starving = this.hungry.has(w.pack);
      this.bodies.setColorAt(i, starving ? this.cFurStarving : this.cFur);
      this.eyes.setColorAt(i, starving ? this.cStarving : this.cEye);
      i++;
    }
    this.bodies.count = i;
    this.eyes.count = i;
    // a mark over each pack (its wolves are placed together, pack by pack)
    let k = 0;
    for (let a = 0; a < this.wolves.length && k < MAX_PACKS; ) {
      const pack = this.wolves[a].pack;
      let x = 0;
      let z = 0;
      let b = a;
      for (; b < this.wolves.length && this.wolves[b].pack === pack; b++) {
        x += this.wolves[b].at.x;
        z += this.wolves[b].at.y;
      }
      x /= b - a;
      z /= b - a;
      this.markPos[k * 3] = x;
      this.markPos[k * 3 + 1] = ctx.heightAt(x, z) + 0.75 * scale;
      this.markPos[k * 3 + 2] = z;
      const c = this.hungry.has(pack) ? this.cMarkStarving : this.cMark;
      this.markCol[k * 3] = c.r;
      this.markCol[k * 3 + 1] = c.g;
      this.markCol[k * 3 + 2] = c.b;
      this.markSize[k] = 0.5;
      k++;
      a = b;
    }
    this.markCount = k;
    for (; k < MAX_PACKS; k++) this.markSize[k] = 0;
    const mg = this.marks.geometry;
    (mg.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (mg.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (mg.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.eyes.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.eyes.instanceColor) this.eyes.instanceColor.needsUpdate = true;
  }

  tick(dt: number, time: number, ctx: WorldContext): void {
    for (const w of this.wolves) if (w.t < TROT) w.t += dt;
    if (this.wolves.length) this.draw(time, ctx);
    // flames and smoke from every burning tile: over the ground, or out of the roof of a building on fire (twice as many: a house
    // ablaze is the loudest thing in the village)
    if (this.fireTiles.length) {
      const weight = this.fireTiles.reduce((n, f) => n + (f.building ? 2 : 1), 0);
      this.emitDebt += dt * weight * 14 * Math.max(0.6, ctx.profile.particles) * (ctx.reducedMotion ? 0.5 : 1);
      while (this.emitDebt >= 1) {
        this.emitDebt -= 1;
        let r = Math.random() * weight;
        let f = this.fireTiles[0];
        for (const t of this.fireTiles) {
          r -= t.building ? 2 : 1;
          if (r <= 0) {
            f = t;
            break;
          }
        }
        const tall = f.building !== null;
        const spread = tall ? 0.55 : 0.7;
        const dx = (Math.random() - 0.5) * spread;
        const dz = (Math.random() - 0.5) * spread;
        const x = f.x + dx;
        const z = f.z + dz;
        // out of the roof: born at the ridge and a little lower down the slopes (any lower, they would be hidden inside the roof and
        // the walls), rising clear of it
        const y = tall ? f.top - 0.02 - 0.3 * Math.hypot(dx, dz) + Math.random() * 0.12 : f.y + 0.05;
        const vx = (Math.random() - 0.5) * 0.1;
        const vz = (Math.random() - 0.5) * 0.1;
        const vy = 0.35 + Math.random() * 0.3;
        this.blaze.emit(x, y, z, vx, vy, vz, tall ? 0.9 : 0.75, tall ? 0.36 : 0.18, 0.04, this.cBlazeA, this.cBlazeB, 0.85, 0.6, 0.1);
        this.flames.emit(x, y + 0.04, z, vx, vy, vz, tall ? 0.8 : 0.7, tall ? 0.26 : 0.13, 0.03, this.cFlameA, this.cFlameB, 1, 0.6, 0.1);
        if (Math.random() < (tall ? 0.5 : 0.35)) this.smoke.emit(x, y + 0.3, z, (Math.random() - 0.5) * 0.06, 0.24, (Math.random() - 0.5) * 0.06, 3.2, tall ? 0.24 : 0.12, tall ? 0.85 : 0.4, this.cSmokeA, this.cSmokeB, tall ? 0.65 : 0.5, 0.3, 0.03);
      }
    }
    // a low haze over the smoky ground, thicker where the engine has the smoke thicker (the same at every tier: it is information)
    if (this.smokeTiles.length) {
      this.hazeDebt += dt * this.smokeWeight * 0.5;
      while (this.hazeDebt >= 1) {
        this.hazeDebt -= 1;
        // pick a tile in proportion to how thick the smoke lies on it
        let r = Math.random() * this.smokeWeight;
        let f = this.smokeTiles[0];
        for (const t of this.smokeTiles) {
          r -= t.d;
          if (r <= 0) {
            f = t;
            break;
          }
        }
        const drift = ctx.reducedMotion ? 0 : 0.04 + ctx.weather.wind * 0.06;
        this.haze.emit(f.x + (Math.random() - 0.5) * 0.9, f.y + 0.12 + Math.random() * 0.12, f.z + (Math.random() - 0.5) * 0.9, drift, ctx.reducedMotion ? 0 : 0.025, drift * 0.3, 5, 0.6, 1.25, this.cHazeA, this.cHazeB, 0.18 + 0.08 * f.d, 0.3, ctx.reducedMotion ? 0 : 0.004);
      }
    }
    this.flames.update(dt);
    this.blaze.update(dt);
    this.smoke.update(dt);
    this.haze.update(dt);
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.bodies.dispose();
    this.eyes.dispose();
    this.marks.geometry.dispose();
    (this.marks.material as THREE.Material).dispose();
    this.flames.dispose();
    this.blaze.dispose();
    this.smoke.dispose();
    this.haze.dispose();
    this.group.clear();
  }
}
