import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeNoise, type Rng } from './rand.ts';

/**
 * Procedural trees and shrubs. Each species is one merged BufferGeometry with its colours painted into the vertices (bark below,
 * leaves above, darker where the crown is shaded by itself), built once and then instanced hundreds of times with a random
 * rotation, size and tint. Four tree shapes (oak, pine, birch, willow), an orchard apple tree, a shrub and a stump.
 */
export type TreeKind = 'oak' | 'pine' | 'birch' | 'willow' | 'apple' | 'shrub' | 'stump';

const noise = makeNoise(7771);
const c = (hex: number): THREE.Color => new THREE.Color(hex);

function paint(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, i: number) => THREE.Color): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = fn(pos.getX(i), pos.getY(i), pos.getZ(i), i);
    col[i * 3] = k.r;
    col[i * 3 + 1] = k.g;
    col[i * 3 + 2] = k.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** a lumpy ball: an icosphere pushed in and out by noise, with smooth normals */
function blob(r: number, detail: number, lump: number, seed: number, sy = 1): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = noise(x * 5 + seed, z * 5 + y * 3 + seed * 1.7);
    const k = 1 + (n - 0.5) * lump;
    p.setXYZ(i, x * k, y * k * sy, z * k);
  }
  g.computeVertexNormals();
  return g;
}

const leafPaint =
  (base: THREE.Color, light: THREE.Color, yMin: number, yMax: number, shade = 0.5) =>
  (x: number, y: number, z: number): THREE.Color => {
    const t = Math.min(1, Math.max(0, (y - yMin) / (yMax - yMin)));
    const n = noise(x * 9 + 3, z * 9 + y * 4);
    const col = base.clone().lerp(light, t * 0.85 + (n - 0.5) * 0.45);
    // the underside of a crown is in its own shadow
    return col.multiplyScalar(1 - shade * (1 - t) * (1 - t));
  };

function trunk(rBottom: number, rTop: number, h: number, bend: number, bark: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, 7, 3, false);
  g.translate(0, h / 2, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.sin((p.getY(i) / h) * Math.PI) * bend);
  g.computeVertexNormals();
  return paint(g, (_x, y) => bark.clone().multiplyScalar(0.8 + 0.3 * Math.min(1, y / h)));
}

const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, s = 1): THREE.BufferGeometry => {
  g.scale(s, s, s);
  g.translate(x, y, z);
  return g;
};

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    for (const name of Object.keys(n.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color') n.deleteAttribute(name);
    return n;
  });
  const out = mergeGeometries(prepared, false);
  if (!out) throw new Error('tree geometry could not be merged');
  return out;
}

export function makeTree(kind: TreeKind, r: Rng): THREE.BufferGeometry {
  const seed = r() * 100;
  switch (kind) {
    case 'oak': {
      const bark = c(0x5b4630);
      const parts: THREE.BufferGeometry[] = [trunk(0.045, 0.03, 0.4, 0.03, bark)];
      const leaf = c(0x3f8a3f);
      const light = c(0x8fc24f);
      const lobes: [number, number, number, number][] = [[0, 0.62, 0, 0.27], [0.18, 0.5, 0.06, 0.18], [-0.16, 0.53, -0.05, 0.19], [0.03, 0.5, -0.17, 0.17], [-0.04, 0.8, 0.07, 0.16]];
      for (const [x, y, z, rad] of lobes) {
        const b = blob(rad, 1, 0.5, seed + x * 10, 0.9);
        place(b, x, y, z);
        paint(b, leafPaint(leaf, light, 0.36, 0.95));
        parts.push(b);
      }
      return merge(parts);
    }
    case 'pine': {
      const bark = c(0x4d3b2a);
      const parts: THREE.BufferGeometry[] = [trunk(0.04, 0.02, 0.3, 0.01, bark)];
      const leaf = c(0x2c5f43);
      const light = c(0x4f8f5a);
      const tiers: [number, number, number][] = [[0.2, 0.3, 0.26], [0.36, 0.26, 0.23], [0.52, 0.22, 0.2], [0.68, 0.17, 0.17], [0.82, 0.11, 0.14]];
      tiers.forEach(([y, rad, h], i) => {
        const cone = new THREE.ConeGeometry(rad, h, 8, 1);
        cone.translate(0, h / 2, 0);
        const p = cone.getAttribute('position') as THREE.BufferAttribute;
        for (let k = 0; k < p.count; k++) {
          const yy = p.getY(k);
          if (yy < 0.01) {
            const a = Math.atan2(p.getZ(k), p.getX(k));
            const kk = 1 + (noise(a * 3 + i * 7 + seed, 1.7) - 0.5) * 0.28;
            p.setX(k, p.getX(k) * kk);
            p.setZ(k, p.getZ(k) * kk);
          }
        }
        cone.computeVertexNormals();
        place(cone, 0, y, 0);
        paint(cone, leafPaint(leaf, light, y, y + h, 0.55));
        parts.push(cone);
      });
      return merge(parts);
    }
    case 'birch': {
      const parts: THREE.BufferGeometry[] = [];
      const bark = trunk(0.03, 0.02, 0.6, 0.05, c(0xe8e2d2));
      paint(bark, (x, y, z) => ((Math.floor(y * 22 + noise(x * 40, z * 40) * 3) % 3 === 0) ? c(0x3c3a36) : c(0xe9e4d4)).multiplyScalar(0.9 + 0.12 * noise(y * 9, x * 20)));
      parts.push(bark);
      const leaf = c(0x7dbb48);
      const light = c(0xcde06a);
      const lobes: [number, number, number, number][] = [[0.02, 0.72, 0, 0.17], [0.12, 0.6, 0.05, 0.13], [-0.11, 0.62, -0.04, 0.14], [0.01, 0.88, 0.03, 0.12], [-0.03, 0.54, 0.1, 0.11]];
      for (const [x, y, z, rad] of lobes) {
        const b = blob(rad, 1, 0.55, seed + y * 9, 1.15);
        place(b, x, y, z);
        paint(b, leafPaint(leaf, light, 0.42, 1.0, 0.4));
        parts.push(b);
      }
      return merge(parts);
    }
    case 'willow': {
      const parts: THREE.BufferGeometry[] = [trunk(0.06, 0.04, 0.34, 0.05, c(0x5a4a38))];
      const leaf = c(0x6b9a4a);
      const light = c(0xb2cf6a);
      const dome = blob(0.34, 1, 0.4, seed, 0.75);
      place(dome, 0, 0.58, 0);
      paint(dome, leafPaint(leaf, light, 0.3, 0.9, 0.35));
      parts.push(dome);
      // curtains of hanging branches
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + noise(i * 3, seed) * 0.3;
        const len = 0.36 + noise(i * 5, seed * 2) * 0.26;
        const s = new THREE.ConeGeometry(0.035, len, 5, 1);
        s.rotateX(Math.PI);
        s.translate(0, -len / 2, 0);
        place(s, Math.cos(a) * 0.3, 0.64, Math.sin(a) * 0.3);
        paint(s, leafPaint(leaf, light, 0.62 - len, 0.64, 0.25));
        parts.push(s);
      }
      return merge(parts);
    }
    case 'apple': {
      const parts: THREE.BufferGeometry[] = [trunk(0.035, 0.025, 0.24, 0.02, c(0x5b4630))];
      const leaf = c(0x4c9a44);
      const light = c(0x93cb58);
      const crown = blob(0.22, 1, 0.45, seed, 0.85);
      place(crown, 0, 0.42, 0);
      paint(crown, leafPaint(leaf, light, 0.24, 0.62, 0.45));
      parts.push(crown);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        const ap = new THREE.SphereGeometry(0.026, 6, 4);
        place(ap, Math.cos(a) * 0.19, 0.36 + (i % 3) * 0.07, Math.sin(a) * 0.19);
        paint(ap, () => c(0xd8412f));
        parts.push(ap);
      }
      return merge(parts);
    }
    case 'shrub': {
      const parts: THREE.BufferGeometry[] = [];
      for (const [x, z, rad] of [[0, 0, 0.12], [0.1, 0.04, 0.09], [-0.08, 0.06, 0.08]] as [number, number, number][]) {
        const b = blob(rad, 1, 0.5, seed + x * 30, 0.8);
        place(b, x, rad * 0.7, z);
        paint(b, leafPaint(c(0x3f7d3d), c(0x84b552), 0, 0.25, 0.4));
        parts.push(b);
      }
      return merge(parts);
    }
    case 'stump': {
      const parts: THREE.BufferGeometry[] = [trunk(0.05, 0.045, 0.1, 0, c(0x6a523a))];
      const top = new THREE.CircleGeometry(0.045, 8);
      top.rotateX(-Math.PI / 2);
      top.translate(0, 0.101, 0);
      paint(top, () => c(0xc9a56a));
      parts.push(top);
      return merge(parts);
    }
  }
}
