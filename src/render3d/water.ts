import * as THREE from 'three';
import { WATER_UNIT } from './coords.ts';
import { injectMagicIntoWater, type MagicField } from './magic.ts';
import type { SceneSnapshot } from './snapshot.ts';
import { SUB, TERRAIN, type TerrainData } from './terrain.ts';

/** quality tiers for the water shader: high = flow normals, glints, foam; medium = fewer layers; low = one cheap pass */
export type WaterTier = 'high' | 'medium' | 'low';

const VERT = /* glsl */ `
  attribute float aDepth;
  attribute float aRiver;
  varying vec3 vWorld;
  varying float vDepth;
  varying float vRiver;
  uniform float uTime;
  #include <fog_pars_vertex>
  void main() {
    vec3 p = position;
    float wave = sin(p.x * 3.1 + uTime * 1.3) * 0.006 + sin(p.z * 2.3 - uTime * 1.7 + p.x) * 0.006;
    p.y += wave * step(0.03, aDepth);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vDepth = aDepth;
    vRiver = aRiver;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vWorld;
  varying float vDepth;
  varying float vRiver;
  uniform float uTime;
  uniform vec2 uFlow;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSky;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uTint;
  uniform float uGrey;
  uniform float uTierF;
  uniform float uRain;
  #include <fog_pars_fragment>
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec2 p = vWorld.xz;
    float speed = mix(0.25, 1.0, vRiver);
    // coordinates along and across the current: ripples stretch downstream into long streaks
    vec2 dirF = normalize(uFlow);
    vec2 dirC = vec2(-dirF.y, dirF.x);
    float along = dot(p, dirF) - uTime * speed * 0.9;
    float across = dot(p, dirC);
    float n1 = vn(vec2(across * 3.2, along * 0.9));
    float n2 = vn(vec2(across * 7.5 + 13.0, along * 1.7 + uTime * 0.12 * speed));
    float n3 = vn(vec2(across * 15.0 + 4.0, along * 3.0));
    vec3 N = normalize(vec3((n1 - 0.5) * 0.35 + (n2 - 0.5) * 0.22 * uTierF, 1.0, (vn(vec2(across * 3.2 + 9.0, along * 0.9 + 3.0)) - 0.5) * 0.35 + (n3 - 0.5) * 0.12 * uTierF));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float d = clamp(vDepth / 0.7, 0.0, 1.0);
    vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 0.95, d));
    // soft bands of lighter and darker water drifting downstream
    col += (n1 - 0.5) * 0.10 + (n2 - 0.5) * 0.07;
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 140.0);
    col += uSunColor * spec * 1.2;
    col = mix(col, uSky, fres * 0.45);
    // foam hugs the shore and breaks up in long thin streaks; the quick middle of the river gets a few white threads
    float shore = (1.0 - smoothstep(0.0, 0.07, vDepth)) * (0.45 + 0.55 * vn(vec2(across * 14.0, along * 4.0)));
    float threads = smoothstep(0.78, 0.95, n2 * 0.55 + n3 * 0.5) * 0.35 * vRiver * uTierF;
    col = mix(col, vec3(0.93, 0.97, 0.95), clamp(shore * 0.9 + threads, 0.0, 1.0) * 0.8);
    // rain on the water: a ring spreads from a random point in every cell, each at its own moment
    if (uRain > 0.02) {
      vec2 gp = p * 3.4;
      vec2 id = floor(gp);
      vec2 f = fract(gp) - 0.5 - (vec2(h21(id + 3.1), h21(id + 7.7)) - 0.5) * 0.5;
      float t = fract(uTime * 0.8 + h21(id));
      float ring = smoothstep(0.045, 0.0, abs(length(f) - t * 0.42)) * (1.0 - t) * uRain * uTierF;
      col += vec3(0.7, 0.8, 0.85) * ring * 0.55;
    }
    // at night the water's colour fades toward a cool grey like everything else under the moon
    col = mix(col, dot(col, vec3(0.2126, 0.7152, 0.0722)) * vec3(0.80, 0.94, 1.16), uGrey);
    col *= uTint;
    float edge = vDepth + (vn(p * 9.0) - 0.5) * 0.04;
    float alpha = smoothstep(0.0, 0.05, edge) * mix(0.8, 0.96, smoothstep(0.1, 0.6, d));
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The river and the flood as one surface. The engine says, per tile, how deep the water is; this turns that into a continuous
 * surface over the terrain's own height field: where the surface is above the ground there is water, and its depth is what colours it.
 * A flood is therefore the same mesh rising over the bank, not a second layer, and it can only ever cover what the engine flooded.
 */
export class Water {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly nx: number;
  private readonly nz: number;
  private readonly terrain: TerrainData;
  /** surface height per tile centre, now and where it is heading */
  private cur: Float32Array;
  private target: Float32Array;
  private tileRiver: Uint8Array;
  private animT = 1;
  private readonly depthAttr: THREE.BufferAttribute;
  private readonly riverAttr: THREE.BufferAttribute;
  private readonly posAttr: THREE.BufferAttribute;
  readonly flow: THREE.Vector2;
  private snapW: number;
  private snapH: number;

  constructor(snap: SceneSnapshot, terrain: TerrainData, tier: WaterTier) {
    this.terrain = terrain;
    this.nx = terrain.nx;
    this.nz = terrain.nz;
    this.snapW = snap.w;
    this.snapH = snap.h;
    const n = this.nx * this.nz;
    this.geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i;
        pos[k * 3] = i / SUB;
        pos[k * 3 + 1] = 0;
        pos[k * 3 + 2] = j / SUB;
      }
    }
    this.posAttr = new THREE.BufferAttribute(pos, 3);
    this.depthAttr = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.riverAttr = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aDepth', this.depthAttr);
    this.geo.setAttribute('aRiver', this.riverAttr);
    const index: number[] = [];
    for (let j = 0; j < this.nz - 1; j++) {
      for (let i = 0; i < this.nx - 1; i++) {
        const a = j * this.nx + i;
        const b = a + 1;
        const c = a + this.nx;
        const d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
    this.geo.setIndex(index);
    // the downstream direction: along the river's long axis, southwards or eastwards
    const rt = terrain.riverTiles;
    let fx = 0;
    let fz = 1;
    if (rt.length > 1) {
      let mx = 0;
      let mz = 0;
      for (const [x, y] of rt) {
        mx += x;
        mz += y;
      }
      mx /= rt.length;
      mz /= rt.length;
      let sxx = 0;
      let szz = 0;
      for (const [x, y] of rt) {
        sxx += (x - mx) ** 2;
        szz += (y - mz) ** 2;
      }
      if (sxx > szz) {
        fx = 1;
        fz = 0;
      }
    }
    this.flow = new THREE.Vector2(fx, fz);
    this.tileRiver = new Uint8Array(snap.w * snap.h);
    for (let i = 0; i < snap.w * snap.h; i++) this.tileRiver[i] = snap.terrain[i] === TERRAIN.RIVER ? 1 : 0;
    this.cur = new Float32Array(snap.w * snap.h);
    this.target = new Float32Array(snap.w * snap.h);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uFlow: { value: this.flow },
          uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
          uSunColor: { value: new THREE.Color(1.0, 0.86, 0.62) },
          uSky: { value: new THREE.Color(0.62, 0.76, 0.86) },
          uDeep: { value: new THREE.Color(0x0a4456) },
          uShallow: { value: new THREE.Color(0x2d7f7a) },
          uTint: { value: new THREE.Color(1, 1, 1) },
          uGrey: { value: 0 },
          uTierF: { value: tier === 'high' ? 1 : tier === 'medium' ? 0.5 : 0 },
          uRain: { value: 0 },
        },
      ]),
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'water';
    this.setTargets(snap);
    this.cur.set(this.target);
    this.refresh();
  }

  /** let the glow belief leaves (law ground, ripples going out from a source) show on the surface */
  attachMagic(field: MagicField): void {
    this.mat.fragmentShader = injectMagicIntoWater(FRAG);
    for (const k of Object.keys(field.uniforms)) this.mat.uniforms[k] = field.uniforms[k];
    this.mat.needsUpdate = true;
  }

  setLight(sunDir: THREE.Vector3, sunColor: THREE.Color, sky: THREE.Color): void {
    (this.mat.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir).normalize();
    (this.mat.uniforms.uSunColor.value as THREE.Color).copy(sunColor);
    (this.mat.uniforms.uSky.value as THREE.Color).copy(sky);
  }

  /** how hard it is raining (0..1): rings spread on the surface */
  setRain(v: number): void {
    this.mat.uniforms.uRain.value = v;
  }

  /** the water's colour shifts with the weather (murky and dark in a flood) and fades toward grey under the moon by `grey` (0..1) */
  setTint(t: THREE.Color, grey = 0): void {
    (this.mat.uniforms.uTint.value as THREE.Color).copy(t);
    this.mat.uniforms.uGrey.value = grey;
  }

  private setTargets(snap: SceneSnapshot): void {
    const { w, h } = snap;
    const base = this.terrain.tileBase;
    const wet = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const d = snap.water[i];
      if (this.tileRiver[i]) {
        this.target[i] = base[i] + 0.12 + d * WATER_UNIT;
        wet[i] = 1;
      } else if (d > 0) {
        this.target[i] = base[i] + d * WATER_UNIT;
        wet[i] = 1;
      }
    }
    // dry tiles fall away from the nearest water, so the shoreline sits where the ground meets the water and the surface never climbs a bank
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (wet[i]) continue;
        let near = -Infinity;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            if (wet[yy * w + xx]) near = Math.max(near, this.target[yy * w + xx]);
          }
        }
        this.target[i] = near > -Infinity ? Math.min(base[i] - 0.45, near - 0.3) : base[i] - 0.6;
      }
    }
  }

  /** the engine's water changed: head for the new surface over about a second (jump at once with reduced motion) */
  setState(snap: SceneSnapshot, animate: boolean): void {
    this.setTargets(snap);
    if (animate) this.animT = 0;
    else {
      this.cur.set(this.target);
      this.animT = 1;
      this.refresh();
    }
  }

  /** the water height the engine's numbers put at a world position (for villagers wading, for tests) */
  surfaceAt(wx: number, wz: number): number {
    const fx = Math.min(this.snapW - 1.001, Math.max(0, wx - 0.5));
    const fy = Math.min(this.snapH - 1.001, Math.max(0, wz - 0.5));
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const g = (a: number, b: number) => this.cur[b * this.snapW + a];
    return g(ix, iy) * (1 - tx) * (1 - ty) + g(ix + 1, iy) * tx * (1 - ty) + g(ix, iy + 1) * (1 - tx) * ty + g(ix + 1, iy + 1) * tx * ty;
  }

  depthAt(wx: number, wz: number): number {
    return Math.max(0, this.surfaceAt(wx, wz) - this.terrain.heightAt(wx, wz));
  }

  private refresh(): void {
    const { nx, nz, terrain } = this;
    const pos = this.posAttr.array as Float32Array;
    const dep = this.depthAttr.array as Float32Array;
    const riv = this.riverAttr.array as Float32Array;
    const w = this.snapW;
    const h = this.snapH;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const u = i / SUB;
        const v = j / SUB;
        const fx = Math.min(w - 1.001, Math.max(0, u - 0.5));
        const fy = Math.min(h - 1.001, Math.max(0, v - 0.5));
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const g = (a: number, b: number) => this.cur[b * w + a];
        const s = g(ix, iy) * (1 - tx) * (1 - ty) + g(ix + 1, iy) * tx * (1 - ty) + g(ix, iy + 1) * (1 - tx) * ty + g(ix + 1, iy + 1) * tx * ty;
        const r = (a: number, b: number) => this.tileRiver[b * w + a];
        const rv = r(ix, iy) * (1 - tx) * (1 - ty) + r(ix + 1, iy) * tx * (1 - ty) + r(ix, iy + 1) * (1 - tx) * ty + r(ix + 1, iy + 1) * tx * ty;
        const ground = terrain.heights[k];
        const depth = s - ground;
        pos[k * 3 + 1] = depth > 0 ? s : ground - 0.02;
        dep[k] = Math.max(0, depth);
        riv[k] = smoothstep(0.2, 0.9, rv);
      }
    }
    this.posAttr.needsUpdate = true;
    this.depthAttr.needsUpdate = true;
    this.riverAttr.needsUpdate = true;
  }

  /** advance the rise or fall of the water; returns true while it is still moving */
  tick(dt: number, time: number): boolean {
    (this.mat.uniforms.uTime as { value: number }).value = time;
    if (this.animT >= 1) return false;
    this.animT = Math.min(1, this.animT + dt / 1.4);
    const e = this.animT * this.animT * (3 - 2 * this.animT);
    for (let i = 0; i < this.cur.length; i++) this.cur[i] += (this.target[i] - this.cur[i]) * Math.min(1, e * 0.5 + 0.08);
    if (this.animT >= 1) this.cur.set(this.target);
    this.refresh();
    return this.animT < 1;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
