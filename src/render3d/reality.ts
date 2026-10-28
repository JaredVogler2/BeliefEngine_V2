import * as THREE from 'three';
import type { Layer, WorldContext } from './context.ts';
import { engineToWorld } from './coords.ts';
import type { SceneSnapshot } from './snapshot.ts';

/**
 * What a Generative Reality run adds to the village, drawn from the snapshot as the engine holds it: coops beside the homes, the
 * hens that are alive (where they are, strays on the far bank included, and at the height they reached when the engine lifts them),
 * loose stones (darker when wet), stones carried to the bank, and the courses of fitted stone that raise the bank where they were
 * laid. Instanced, a few draw calls in all; nothing here is read by the simulation, and nothing is drawn that the run does not hold.
 */

export interface RealityDrawn {
  coops: number;
  hens: number;
  strays: number;
  stones: number;
  placed: number;
  bank: number;
}

const MAX_HENS = 24;
const MAX_STONES = 12;
const MAX_COOPS = 4;
const MAX_BANK = 96;

function jitter(id: string): [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return [((h % 17) / 16 - 0.5) * 0.7, (((h >> 5) % 17) / 16 - 0.5) * 0.6];
}

export class RealityLayer implements Layer {
  readonly group = new THREE.Group();
  private readonly hens: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private readonly combs: THREE.InstancedMesh;
  private readonly stones: THREE.InstancedMesh;
  private readonly coops: THREE.InstancedMesh;
  private readonly roofs: THREE.InstancedMesh;
  private readonly bank: THREE.InstancedMesh;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  private drawn: RealityDrawn = { coops: 0, hens: 0, strays: 0, stones: 0, placed: 0, bank: 0 };
  /** each hen's resting place, for the peck and the lift */
  private henBase: { id: string; x: number; y: number; z: number; ground: number; phase: number }[] = [];
  /** blob shadows under the hens: they shrink and fade as a hen rises, so height reads without real-time shadows */
  private readonly shadows: THREE.InstancedMesh;
  /** lifts being played: which hens, how high (tiles, as the engine reached), and how far through */
  private lifts: { ids: Set<string>; height: number; t: number; dur: number }[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(ctx: WorldContext) {
    const mk = <T extends THREE.BufferGeometry>(g: T): T => (this.geos.push(g), g);
    const mat = (o: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
      this.mats.push(m);
      return m;
    };
    this.hens = new THREE.InstancedMesh(mk(new THREE.SphereGeometry(0.14, 10, 8).scale(1.3, 1, 1)), mat({ color: 0xfaf6ec, emissive: 0x3a3226, emissiveIntensity: 0.35 }), MAX_HENS);
    this.heads = new THREE.InstancedMesh(mk(new THREE.SphereGeometry(0.075, 8, 6)), mat({ color: 0xfaf6ec, emissive: 0x3a3226, emissiveIntensity: 0.35 }), MAX_HENS);
    this.combs = new THREE.InstancedMesh(mk(new THREE.BoxGeometry(0.05, 0.05, 0.03)), mat({ color: 0xc0392b, emissive: 0x400a05, emissiveIntensity: 0.3 }), MAX_HENS);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    this.mats.push(shadowMat);
    this.shadows = new THREE.InstancedMesh(mk(new THREE.CircleGeometry(0.17, 12).rotateX(-Math.PI / 2)), shadowMat, MAX_HENS);
    this.stones = new THREE.InstancedMesh(mk(new THREE.DodecahedronGeometry(0.2, 0)), mat({ color: 0xffffff, roughness: 0.95 }), MAX_STONES);
    this.coops = new THREE.InstancedMesh(mk(new THREE.BoxGeometry(0.5, 0.36, 0.42)), mat({ color: 0xa8703f }), MAX_COOPS);
    this.roofs = new THREE.InstancedMesh(mk(new THREE.ConeGeometry(0.4, 0.24, 4).rotateY(Math.PI / 4)), mat({ color: 0x6b4428 }), MAX_COOPS);
    this.bank = new THREE.InstancedMesh(mk(new THREE.BoxGeometry(0.98, 0.2, 0.4)), mat({ color: 0xb3a88f, roughness: 1 }), MAX_BANK);
    for (const [name, mesh] of [['reality-hens', this.hens], ['reality-hen-heads', this.heads], ['reality-hen-combs', this.combs], ['reality-hen-shadows', this.shadows], ['reality-stones', this.stones], ['reality-coops', this.coops], ['reality-coop-roofs', this.roofs], ['reality-bank', this.bank]] as const) {
      mesh.name = name;
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    }
    this.shadows.castShadow = false;
    this.shadows.receiveShadow = false;
    this.group.name = 'reality';
    ctx.reality = { lift: (ids, height, durMs) => this.lift(ids, height, durMs) };
  }

  /** play a lift the engine logged: these hens rise to the height they reached, hover, and settle (never anything the run reads) */
  lift(ids: string[], height: number, durMs: number): void {
    if (!ids.length || height <= 0) return;
    this.lifts.push({ ids: new Set(ids), height, t: 0, dur: Math.max(0.3, durMs / 1000) });
  }

  /** how far up (world units) a hen is in the lifts playing now */
  private liftOf(id: string, reduced: boolean): number {
    let y = 0;
    for (const l of this.lifts) {
      if (!l.ids.has(id)) continue;
      const u = Math.min(1, l.t / l.dur);
      const top = l.height * 0.55;
      // rise, hover with a flutter, settle; with reduced motion simply up for the length of the effect, then down
      const k = reduced ? (u < 1 ? 1 : 0) : u < 0.3 ? 1 - (1 - u / 0.3) ** 2 : u < 0.72 ? 1 : 1 - ((u - 0.72) / 0.28) ** 2;
      y = Math.max(y, top * k);
    }
    return y;
  }

  update(snap: SceneSnapshot, changes: { reality: boolean; rebuild: boolean }, ctx: WorldContext): void {
    if (!changes.reality && !changes.rebuild) return;
    const r = snap.reality;
    this.group.visible = !!r;
    if (!r) {
      this.drawn = { coops: 0, hens: 0, strays: 0, stones: 0, placed: 0, bank: 0 };
      return;
    }
    const ground = (x: number, z: number) => ctx.heightAt(x, z);
    // a hen or a stone standing in floodwater is drawn at the surface, where a player can see it, not under the water
    const above = (x: number, z: number) => Math.max(ground(x, z), ctx.water.surfaceAt(x, z));
    let n = 0;
    for (const c of r.coops.slice(0, MAX_COOPS)) {
      const w = engineToWorld(c.x, c.y);
      const y = ground(w.x, w.z);
      this.set(this.coops, n, w.x, y + 0.15, w.z, 0, 1);
      this.set(this.roofs, n, w.x, y + 0.4, w.z, 0, 1);
      n++;
    }
    this.coops.count = n;
    this.roofs.count = n;
    n = 0;
    this.henBase = [];
    for (const h of r.hens.slice(0, MAX_HENS)) {
      const [jx, jy] = jitter(h.id);
      const w = engineToWorld(h.x + jx, h.y + jy);
      const y = above(w.x, w.z) + 0.16 + h.alt * 0.55;
      this.henBase.push({ id: h.id, x: w.x, y, z: w.z, ground: above(w.x, w.z), phase: (jx + jy) * 9 });
      this.set(this.hens, n, w.x, y, w.z, jx * 3, 1);
      this.set(this.shadows, n, w.x, above(w.x, w.z) + 0.02, w.z, 0, 1);
      this.set(this.heads, n, w.x + 0.16, y + 0.11, w.z, 0, 1);
      this.set(this.combs, n, w.x + 0.17, y + 0.19, w.z, 0, 1);
      n++;
    }
    this.hens.count = n;
    this.heads.count = n;
    this.combs.count = n;
    this.shadows.count = n;
    n = 0;
    let placed = 0;
    for (const st of r.stones.slice(0, MAX_STONES)) {
      const w = engineToWorld(st.x, st.y);
      const y = above(w.x, w.z);
      const k = 0.7 + Math.min(4, st.base) * 0.15;
      this.set(this.stones, n, w.x, y + 0.08 * k, w.z, st.x * 1.7 + st.y, k);
      this.stones.setColorAt(n, new THREE.Color(st.state === 'placed' ? 0xb7ad98 : st.wet > 0 ? 0x5f6168 : 0x8d8f96));
      if (st.state === 'placed') placed++;
      n++;
    }
    this.stones.count = n;
    if (this.stones.instanceColor) this.stones.instanceColor.needsUpdate = true;
    n = 0;
    for (const [i, h] of r.bank) {
      const tx = i % snap.w;
      const ty = Math.floor(i / snap.w);
      const w = engineToWorld(tx, ty);
      const y = above(w.x, w.z);
      for (let c = 0; c < h && n < MAX_BANK; c++) this.set(this.bank, n++, w.x, y + 0.1 + c * 0.2, w.z, 0, 1);
    }
    this.bank.count = n;
    for (const mesh of [this.hens, this.heads, this.combs, this.shadows, this.stones, this.coops, this.roofs, this.bank]) mesh.instanceMatrix.needsUpdate = true;
    this.drawn = { coops: r.coops.length, hens: r.hens.length, strays: r.hens.filter((h) => h.stray).length, stones: r.stones.filter((x) => x.state === 'loose').length, placed, bank: r.bank.length };
  }

  private set(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, scale: number): void {
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.p.set(x, y, z);
    this.s.set(scale, scale, scale);
    this.m.compose(this.p, this.q, this.s);
    mesh.setMatrixAt(i, this.m);
  }

  tick(dt: number, time: number, ctx: WorldContext): void {
    if (!this.henBase.length) return;
    for (const l of this.lifts) l.t += dt;
    const flying = this.lifts.length > 0;
    if (ctx.reducedMotion && !flying) return;
    // a peck now and then, and a lift when the engine logged one: purely a picture of a hen, never anything the simulation reads
    this.henBase.forEach((b, i) => {
      const up = flying ? this.liftOf(b.id, ctx.reducedMotion) : 0;
      const flap = up > 0 && !ctx.reducedMotion ? Math.sin(time * 18 + b.phase) * 0.035 : 0;
      const peck = up > 0 || ctx.reducedMotion ? 0 : Math.max(0, Math.sin(time * 2.2 + b.phase)) ** 6 * 0.05;
      const y = b.y + up + flap;
      this.set(this.hens, i, b.x, y, b.z, b.phase * 0.33, 1);
      this.set(this.heads, i, b.x + 0.16, y + 0.11 - peck, b.z, 0, 1);
      this.set(this.combs, i, b.x + 0.17, y + 0.19 - peck, b.z, 0, 1);
      const k = Math.max(0.35, 1 - up / 1.8);
      this.set(this.shadows, i, b.x, b.ground + 0.02, b.z, 0, k);
    });
    this.lifts = this.lifts.filter((l) => l.t < l.dur);
    for (const mesh of [this.hens, this.heads, this.combs, this.shadows]) mesh.instanceMatrix.needsUpdate = true;
  }

  /** hens in the air right now (tests read it while a lift plays) */
  airborne(): number {
    return this.lifts.length ? this.henBase.filter((b) => this.liftOf(b.id, false) > 0.05).length : 0;
  }

  info(): RealityDrawn & { airborne: number } {
    return { ...this.drawn, airborne: this.airborne() };
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const mesh of [this.hens, this.heads, this.combs, this.shadows, this.stones, this.coops, this.roofs, this.bank]) mesh.dispose();
  }
}
