import * as THREE from 'three';
import type { Layer, WorldContext } from './context.ts';
import type { SceneSnapshot } from './snapshot.ts';

/**
 * A few birds circling the village on fine days: the one thing that moves high above the roofs, so a still overview is never quite
 * still. They leave when it rains and when the run has been lost, and never carry meaning: nothing here is read by the simulation.
 */
interface Bird {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  alt: number;
  speed: number;
  phase: number;
  dir: number;
}

export class BirdsLayer implements Layer {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly birds: Bird[] = [];
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly geo: THREE.BufferGeometry;
  private readonly uTime = { value: 0 };
  private present = 1;
  private allowed = true;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(ctx: WorldContext) {
    const n = ctx.profile.detail > 0.5 ? 7 : 3;
    // a body and two wings, flat triangles; the wing tips (aTip = 1) are what the shader lifts and drops
    const pos = new Float32Array([
      0, 0, 0.2, -0.05, 0, -0.1, 0.05, 0, -0.1,
      0, 0, 0.06, -0.3, 0, -0.04, 0, 0, -0.13,
      0, 0, 0.06, 0, 0, -0.13, 0.3, 0, -0.04,
    ]);
    const tip = new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
    const phase = new Float32Array(n);
    const r = ctx.rng('birds');
    this.mat = new THREE.MeshBasicMaterial({ color: 0x4a4f58, side: THREE.DoubleSide, fog: true });
    const uTime = this.uTime;
    this.mat.onBeforeCompile = (sh): void => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'attribute float aTip;\nattribute float aPhase;\nuniform float uTime;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.y += aTip * (0.08 + sin(uTime * 8.0 + aPhase) * 0.11);');
    };
    for (let i = 0; i < n; i++) {
      phase[i] = r() * 6.28;
      this.birds.push({ cx: 0, cz: 0, rx: 5 + r() * 7, rz: 3.5 + r() * 5, alt: 8 + r() * 4, speed: (0.14 + r() * 0.1) * (r() < 0.5 ? 1 : -1), phase: r() * 6.28, dir: 1 });
    }
    this.geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.name = 'birds';
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  update(snap: SceneSnapshot): void {
    for (const b of this.birds) {
      b.cx = snap.w * 0.5;
      b.cz = snap.h * 0.5;
    }
    // birds stay for a fine day or a won run; a lost run is silent
    this.allowed = snap.outcome !== 'defeat';
  }

  tick(dt: number, time: number, ctx: WorldContext): void {
    const want = this.allowed && ctx.weather.rain < 0.25 && !ctx.reducedMotion ? 1 : 0;
    this.present += (want - this.present) * (1 - Math.exp(-dt * 1.2));
    const on = this.present > 0.03;
    this.group.visible = on;
    if (!on) return;
    this.uTime.value = time;
    this.birds.forEach((b, i) => {
      const a = b.phase + time * b.speed;
      const x = b.cx + Math.cos(a) * b.rx;
      const z = b.cz + Math.sin(a) * b.rz;
      const y = ctx.heightAt(b.cx, b.cz) + b.alt + Math.sin(a * 2.3 + i) * 0.35;
      // heading along the path
      const tx = -Math.sin(a) * b.rx * Math.sign(b.speed);
      const tz = Math.cos(a) * b.rz * Math.sign(b.speed);
      const yaw = Math.atan2(tx, tz);
      this.q.setFromAxisAngle(this.up, yaw);
      const k = 1.15 * this.present;
      this.p.set(x, y, z);
      this.s.set(k, k, k);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }
}
