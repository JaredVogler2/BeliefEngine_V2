import * as THREE from 'three';
import type { SceneSnapshot } from './snapshot.ts';

/**
 * Lamplight after dark (3D plan, stage 2). Every home someone still lives in, every standing hall, chapel, market, mill and granary,
 * and every lit fire spills a pool of warm light on the ground round it and up its own walls. It is one small texture over the plate
 * (four texels a tile: how much lamplight falls there, and the ground's height so the light can fade above the eaves) that every lit
 * material reads by where it is: one texture read a pixel and no lights, so it costs the same on every tier. Lit fires also keep their
 * real point lights (four at most, `landmarks.ts`), brighter after dark.
 *
 * How strong it is follows the hour (the lamps are lit as the sun goes down), never the simulation. Where it falls follows the engine:
 * a home whose people are all dead, or that burned, stays dark, the way its chimney stops smoking.
 */
const RES = 4;
/** the ground's height is stored in 8 bits over this range (world units) */
const H0 = -2;
const HSPAN = 8;

export interface LampSource {
  x: number;
  z: number;
  /** how far the pool reaches (world units) */
  r: number;
  /** how bright it is at the middle */
  s: number;
}

const PUBLIC = new Set(['hall', 'chapel', 'market', 'mill', 'granary']);

/** where lamplight falls tonight, from the engine's own picture of the village */
export function lampSources(snap: SceneSnapshot): LampSource[] {
  const lived = new Set(snap.villagers.filter((v) => v.status !== 'dead').map((v) => v.homeId));
  const out: LampSource[] = [];
  for (const l of snap.landmarks) {
    const x = l.x + 0.5;
    const z = l.y + 0.5;
    if ((l.kind === 'campfire' || l.kind === 'beacon') && l.lit) out.push({ x, z, r: 2.8, s: 1.2 });
    else if (l.hp <= 0) continue;
    else if ((l.kind === 'home' || l.kind === 'cabin') && lived.has(l.id)) out.push({ x, z, r: 2.3, s: 1 });
    else if (PUBLIC.has(l.kind)) out.push({ x, z, r: 2.2, s: 0.8 });
  }
  return out;
}

export const HOME_PARS = /* glsl */ `
  uniform sampler2D uHome;
  uniform vec2 uHomeDim;
  uniform vec3 uHomeCol;
  uniform float uHomeK;
  uniform float uMoonGrey;
  varying vec3 vHomeW;
`;

const VERT = /* glsl */ `
  vec4 homeW = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    homeW = batchingMatrix * homeW;
  #endif
  #ifdef USE_INSTANCING
    homeW = instanceMatrix * homeW;
  #endif
  vHomeW = (modelMatrix * homeW).xyz;
`;

// Under the moon colours fade toward a cool grey, as they do to the eye at night (the moonlight and the sky's light only: what glows
// keeps its colour). Then the lamplight is added to the light the surface already has, as light falling on it (so it takes the
// surface's own colour, and stays warm): full on the ground and the walls up to the eaves, fading out above them, so roofs and treetops
// stay in the night, and none below the ground (the plate's cut sides, the river bed).
const FRAG = /* glsl */ `
  if (uMoonGrey > 0.001) {
    vec3 moonTint = vec3(0.80, 0.94, 1.16);
    vec3 lw = vec3(0.2126, 0.7152, 0.0722);
    reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, dot(reflectedLight.directDiffuse, lw) * moonTint, uMoonGrey);
    reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, dot(reflectedLight.indirectDiffuse, lw) * moonTint, uMoonGrey);
  }
  if (uHomeK > 0.001) {
    vec4 hm = texture2D(uHome, vHomeW.xz / uHomeDim);
    float above = vHomeW.y - (hm.g * ${HSPAN.toFixed(1)} + (${H0.toFixed(1)}));
    float lamp = hm.r * uHomeK * smoothstep(-0.5, -0.2, above) * (1.0 - smoothstep(0.35, 1.05, above));
    reflectedLight.indirectDiffuse += material.diffuseColor * uHomeCol * lamp;
  }
`;

export class HomeLight {
  /** one set for the renderer's lifetime: every material that takes the lamplight shares these, so a new village only repaints them */
  readonly uniforms: Record<string, THREE.IUniform>;
  private tex: THREE.DataTexture;
  private data = new Uint8Array(4);
  private tw = 1;
  private th = 1;
  private key = '';

  constructor() {
    this.tex = this.makeTexture();
    this.uniforms = {
      uHome: { value: this.tex },
      uHomeDim: { value: new THREE.Vector2(1, 1) },
      uHomeCol: { value: new THREE.Color(1.0, 0.56, 0.24) },
      uHomeK: { value: 0 },
      uMoonGrey: { value: 0 },
    };
  }

  private makeTexture(): THREE.DataTexture {
    const t = new THREE.DataTexture(this.data, this.tw, this.th, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }

  /** a new village: the texture takes its size and the height of its ground (after a lost context the old one is dropped, not deleted) */
  reset(snap: SceneSnapshot, heightAt: (x: number, z: number) => number, gone = false): void {
    if (!gone) this.tex.dispose();
    this.tw = snap.w * RES;
    this.th = snap.h * RES;
    this.data = new Uint8Array(this.tw * this.th * 4);
    for (let j = 0; j < this.th; j++)
      for (let i = 0; i < this.tw; i++) {
        const y = heightAt((i + 0.5) / RES, (j + 0.5) / RES);
        this.data[(j * this.tw + i) * 4 + 1] = Math.round(Math.min(1, Math.max(0, (y - H0) / HSPAN)) * 255);
      }
    this.tex = this.makeTexture();
    this.uniforms.uHome.value = this.tex;
    (this.uniforms.uHomeDim.value as THREE.Vector2).set(snap.w, snap.h);
    this.key = '';
    this.set(snap);
  }

  /** paint the pools from where lamps are lit tonight (only when that changed) */
  set(snap: SceneSnapshot): void {
    const src = lampSources(snap);
    const key = src.map((s) => `${s.x},${s.z},${s.r},${s.s}`).join(';');
    if (key === this.key) return;
    this.key = key;
    const sum = new Float32Array(this.tw * this.th);
    for (const s of src) {
      const i0 = Math.max(0, Math.floor((s.x - s.r) * RES));
      const i1 = Math.min(this.tw - 1, Math.ceil((s.x + s.r) * RES));
      const j0 = Math.max(0, Math.floor((s.z - s.r) * RES));
      const j1 = Math.min(this.th - 1, Math.ceil((s.z + s.r) * RES));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot((i + 0.5) / RES - s.x, (j + 0.5) / RES - s.z) / s.r;
          if (d >= 1) continue;
          const f = 1 - d * d;
          sum[j * this.tw + i] += s.s * f * f;
        }
    }
    // pools that overlap add up, but never past full
    for (let k = 0; k < sum.length; k++) this.data[k * 4] = Math.round((1 - Math.exp(-1.7 * sum[k])) * 255);
    this.tex.needsUpdate = true;
  }

  /** how strongly the lamps are lit (0 by day), and how far the moonlit colours fade (0 by day) */
  setStrength(k: number, grey = 0): void {
    this.uniforms.uHomeK.value = k;
    this.uniforms.uMoonGrey.value = grey;
  }

  get strength(): number {
    return this.uniforms.uHomeK.value as number;
  }

  /** how much lamplight falls at a point of the ground, 0..1, before the hour's strength (tests) */
  at(x: number, z: number): number {
    const i = Math.min(this.tw - 1, Math.max(0, Math.floor(x * RES)));
    const j = Math.min(this.th - 1, Math.max(0, Math.floor(z * RES)));
    return this.data[(j * this.tw + i) * 4] / 255;
  }

  dispose(): void {
    this.tex.dispose();
  }
}

const isLit = (m: THREE.Material): boolean => {
  const t = m as THREE.Material & { isMeshStandardMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean; isMeshToonMaterial?: boolean };
  return !!(t.isMeshStandardMaterial || t.isMeshLambertMaterial || t.isMeshPhongMaterial || t.isMeshToonMaterial);
};

/** materials that already take the lamplight (kept out of `userData`, which clones copy) */
const hooked = new WeakSet<THREE.Material>();

/**
 * Let every lit material under `root` take the lamplight. A material's own shader changes (the terrain's magic, the trees' sway) run
 * first and are kept, and so does whatever wraps it later (the finishing chain does, on the first frame that draws it); each material is
 * changed once. Returns how many changed.
 */
export function attachHomeLight(root: THREE.Object3D, uniforms: Record<string, THREE.IUniform>): number {
  let changed = 0;
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const mat of Array.isArray(mats) ? mats : [mats]) {
      if (seen.has(mat) || !isLit(mat)) continue;
      seen.add(mat);
      if (hooked.has(mat)) continue;
      const prev = mat.onBeforeCompile;
      const key = mat.customProgramCacheKey();
      const hook: THREE.Material['onBeforeCompile'] = (shader, renderer) => {
        prev.call(mat, shader, renderer);
        for (const k of Object.keys(uniforms)) shader.uniforms[k] = uniforms[k];
        // once per shader, however the hooks round it are chained
        if (shader.vertexShader.includes('vHomeW')) return;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vHomeW;')
          .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT}`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${HOME_PARS}`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAG}`);
      };
      mat.onBeforeCompile = hook;
      mat.customProgramCacheKey = () => `${key}|home1`;
      hooked.add(mat);
      mat.needsUpdate = true;
      changed++;
    }
  });
  return changed;
}
