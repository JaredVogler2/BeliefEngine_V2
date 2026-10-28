import * as THREE from 'three';
import type { Mood } from './atmosphere.ts';
import type { Quality } from './context.ts';
import { makeNoise, rng, range } from './rand.ts';
import { makeTree, type TreeKind } from './trees.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DISPLAY_GLSL, displayUniforms } from './post.ts';

/**
 * A sea of cloud far below the village, so the diorama sits in a place instead of a void: two slow layers of soft cloud that take the
 * mood's colour (white and warm on a calm day, slate in a storm), a soft shadow of the plate on the upper layer, and a fade to haze at
 * the edge of the world. Purely decoration, drawn behind everything the engine says exists.
 */
const VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const frag = (octaves: number): string => /* glsl */ `
  varying vec3 vWorld;
  uniform float uTime;
  uniform vec3 uHigh;
  uniform vec3 uLow;
  uniform vec3 uHaze;
  uniform float uCover;
  uniform float uLayer;
  uniform vec4 uPlate; // centre x, centre z, half width, half depth
  uniform vec2 uSun;   // where the plate's shadow falls, as an offset
  ${DISPLAY_GLSL}
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < ${octaves}; i++) {
      s += a * vn(p);
      p = p * 2.07 + 17.3;
      a *= 0.5;
    }
    return s;
  }
  void main() {
    vec2 q = vWorld.xz * 0.045 + vec2(uTime * 0.012, uTime * 0.006) * (1.0 + uLayer * 0.6) + uLayer * 31.0;
    float n = fbm(q + fbm(q * 0.6) * 0.7);
    float thr = 0.62 - 0.32 * uCover;
    float body = smoothstep(thr, thr + 0.14, n);
    // lit tops and shaded bellies: the same noise sampled a step towards the sun
    float n2 = fbm(q + vec2(0.06, -0.04) + fbm((q + vec2(0.06, -0.04)) * 0.6) * 0.7);
    float lit = clamp(0.55 + (n - n2) * 8.0, 0.0, 1.0);
    vec3 c = mix(uLow, uHigh, lit);
    // the plate's shadow on the cloud, soft and offset away from the sun
    vec2 d = abs(vWorld.xz - uPlate.xy - uSun) / (uPlate.zw + 1.0);
    float sh = 1.0 - smoothstep(0.55, 1.5, max(d.x, d.y));
    c *= 1.0 - 0.38 * sh;
    float dist = length(vWorld.xz - uPlate.xy);
    float fade = 1.0 - smoothstep(55.0, 200.0, dist);
    float a = body * fade * mix(0.9, 0.7, uLayer);
    c = mix(c, uHaze, smoothstep(40.0, 200.0, dist) * 0.6);
    if (a < 0.01) discard;
    gl_FragColor = vec4(postDisplay(c), a);
    #include <colorspace_fragment>
  }
`;

/** a small floating rock with a grassy top and a tree or two: a tapered, craggy, flat-shaded body painted in the vertices */
function makeIslet(radius: number, depth: number, seed: number, kinds: TreeKind[]): THREE.BufferGeometry {
  const noise = makeNoise(seed);
  const segs = 11;
  const rings: { y: number; k: number; c: THREE.Color }[] = [
    { y: 0.12, k: 0.96, c: new THREE.Color(0x5f9a45) },
    { y: 0, k: 1, c: new THREE.Color(0x4e7a35) },
    { y: -0.12, k: 0.98, c: new THREE.Color(0x6f5736) },
    { y: -depth * 0.3, k: 0.8, c: new THREE.Color(0x7d7668) },
    { y: -depth * 0.62, k: 0.5, c: new THREE.Color(0x645f56) },
    { y: -depth, k: 0.04, c: new THREE.Color(0x4d4a44) },
  ];
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  rings.forEach((r, ri) => {
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const bite = ri === 0 || ri === 1 ? 1 : 1 - 0.22 * noise(Math.cos(a) * 2 + ri * 5, Math.sin(a) * 2 + seed);
      const rad = radius * r.k * bite * (0.9 + 0.2 * noise(a * 1.7 + seed, ri));
      pos.push(Math.cos(a) * rad, r.y + (ri > 1 ? (noise(i * 0.9, ri + seed) - 0.5) * 0.25 * depth : 0), Math.sin(a) * rad);
      const g = 0.85 + 0.3 * noise(i * 0.8 + ri * 3, seed * 0.1);
      col.push(r.c.r * g, r.c.g * g, r.c.b * g);
    }
  });
  const top = pos.length / 3;
  pos.push(0, 0.3, 0);
  col.push(0.4, 0.66, 0.3);
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < segs; i++) {
    const a = r * segs + i;
    const b = r * segs + ((i + 1) % segs);
    idx.push(a, a + segs, b, b, a + segs, b + segs);
  }
  for (let i = 0; i < segs; i++) idx.push(top, i, (i + 1) % segs);
  let body: THREE.BufferGeometry = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  body.setIndex(idx);
  body = body.toNonIndexed();
  body.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [body];
  const r = rng(seed);
  kinds.forEach((kind, i) => {
    const t = makeTree(kind, r);
    const sc = 1.1 + r() * 0.6;
    t.scale(sc, sc, sc);
    const a = (i / kinds.length) * Math.PI * 2 + r();
    t.translate(Math.cos(a) * radius * 0.35, 0.22, Math.sin(a) * radius * 0.35);
    parts.push(t.index ? t.toNonIndexed() : t);
  });
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  return merged ?? body;
}

export class CloudSea {
  readonly group = new THREE.Group();
  private readonly mats: THREE.ShaderMaterial[] = [];
  private readonly geo = new THREE.PlaneGeometry(520, 520, 1, 1);
  private readonly islets: { mesh: THREE.Mesh; y: number; phase: number; spin: number }[] = [];
  private readonly isletMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });

  constructor(w: number, h: number, quality: Quality, seed = 1) {
    const octaves = quality === 'high' ? 4 : quality === 'medium' ? 3 : 2;
    this.geo.rotateX(-Math.PI / 2);
    [-7.5, -11.5].forEach((y, i) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: frag(octaves),
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uHigh: { value: new THREE.Color(0xffffff) },
          uLow: { value: new THREE.Color(0xb9c4d4) },
          uHaze: { value: new THREE.Color(0xe6eadc) },
          uCover: { value: 0.4 },
          uLayer: { value: i },
          uPlate: { value: new THREE.Vector4(w / 2, h / 2, w / 2, h / 2) },
          uSun: { value: new THREE.Vector2(6, -4) },
          ...displayUniforms,
        },
      });
      const mesh = new THREE.Mesh(this.geo, m);
      mesh.position.set(w / 2, y, h / 2);
      mesh.renderOrder = -5 + i * -1;
      mesh.name = `cloud-sea-${i}`;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.mats.push(m);
    });
    // a few small islands drifting far from the village, for depth and a sense of place (none on the lowest tier)
    if (quality !== 'low') {
      const r = rng(seed ^ 0x1514);
      const spots: [number, number, number, number][] = [
        [-0.45, -0.1, -3.5, 1.7], [1.5, 0.9, -5.5, 2.3], [0.2, 1.75, -8, 2.9], [0.95, -0.95, -4.5, 1.5], [-0.65, 1.3, -10, 2.1],
      ];
      spots.forEach(([fx, fz, y, rad], i) => {
        const kinds: TreeKind[] = i % 2 ? ['pine', 'pine'] : ['oak', 'birch'];
        const geo = makeIslet(rad, rad * 1.9, seed + i * 17, kinds);
        const mesh = new THREE.Mesh(geo, this.isletMat);
        mesh.position.set(w / 2 + (fx - 0.5) * w * 1.7, y, h / 2 + (fz - 0.5) * h * 1.7);
        mesh.rotation.y = r() * 6.28;
        mesh.name = `islet-${i}`;
        mesh.castShadow = false;
        this.group.add(mesh);
        this.islets.push({ mesh, y, phase: r() * 6.28, spin: range(r, -0.03, 0.03) });
      });
    }
  }

  setMood(m: Mood): void {
    const hi = new THREE.Color(m.cloudColor);
    const lo = hi.clone().multiplyScalar(0.72).lerp(new THREE.Color(m.skyTop), 0.3);
    for (const mat of this.mats) {
      (mat.uniforms.uHigh.value as THREE.Color).copy(hi);
      (mat.uniforms.uLow.value as THREE.Color).copy(lo);
      (mat.uniforms.uHaze.value as THREE.Color).setHex(m.fog);
      mat.uniforms.uCover.value = 0.25 + 0.6 * m.cloud;
    }
  }

  tick(time: number): void {
    for (const mat of this.mats) mat.uniforms.uTime.value = time;
    for (const it of this.islets) {
      it.mesh.position.y = it.y + Math.sin(time * 0.35 + it.phase) * 0.18;
      it.mesh.rotation.y += it.spin * 0.016;
    }
  }

  dispose(): void {
    this.geo.dispose();
    for (const m of this.mats) m.dispose();
    for (const it of this.islets) it.mesh.geometry.dispose();
    this.isletMat.dispose();
  }
}
