import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Small modelling kit: every piece is a non-indexed BufferGeometry with position, normal and uv, whose uv is in world units (one unit
 * of uv = `texel` metres of the texture), so a plaster or tile texture keeps the same scale on a wall, a roof or a tower. Pieces
 * are collected per material and merged, so a whole cottage is a handful of draw calls.
 */
export type Part = { geo: THREE.BufferGeometry; mat: string };

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();

export function place(geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0): THREE.BufferGeometry {
  E.set(rx, ry, rz);
  Q.setFromEuler(E);
  M.compose(new THREE.Vector3(x, y, z), Q, new THREE.Vector3(sx, sy, sz));
  const g = geo.clone();
  g.applyMatrix4(M);
  return g;
}

const toNonIndexed = (g: THREE.BufferGeometry): THREE.BufferGeometry => (g.index ? g.toNonIndexed() : g);

/** a box standing on y=0, centred on x/z, with uv in world units on every face */
export function box(w: number, h: number, d: number, texel = 0.5): THREE.BufferGeometry {
  const g = toNonIndexed(new THREE.BoxGeometry(w, h, d));
  g.translate(0, h / 2, 0);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    let u: number;
    let v: number;
    if (ny > 0.5) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else if (nx > 0.5) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv.setXY(i, u / texel, v / texel);
  }
  return g;
}

/** a cylinder (or cone, if the top radius is smaller) standing on y=0; uv wraps once around */
export function cyl(rBottom: number, rTop: number, h: number, seg = 12, texel = 0.5): THREE.BufferGeometry {
  const g = toNonIndexed(new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1));
  g.translate(0, h / 2, 0);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * Math.max(rBottom, rTop)) / texel, (uv.getY(i) * h) / texel);
  return g;
}

export function sphere(r: number, ws = 10, hs = 8, sy = 1): THREE.BufferGeometry {
  const g = toNonIndexed(new THREE.SphereGeometry(r, ws, hs));
  g.scale(1, sy, 1);
  return g;
}

/**
 * A gable roof: ridge along x, eaves at y=0, ridge at y=rise, `span` across z, with an overhang all round and a visible thickness.
 * Slopes carry the roofing texture; the two end triangles are the gable walls' lip.
 */
export function gableRoof(length: number, span: number, rise: number, overhang = 0.07, thick = 0.035, texel = 0.2): THREE.BufferGeometry {
  const L = length / 2 + overhang;
  const S = span / 2 + overhang;
  const slope = Math.hypot(S, rise);
  const pos: number[] = [];
  const uvs: number[] = [];
  const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]): void => {
    pos.push(...a, ...b, ...c);
    uvs.push(...ua, ...ub, ...uc);
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], w: number, h: number): void => {
    tri(a, b, c, [0, 0], [w / texel, 0], [w / texel, h / texel]);
    tri(a, c, d, [0, 0], [w / texel, h / texel], [0, h / texel]);
  };
  // two sloped faces (top)
  quad([-L, 0, S], [L, 0, S], [L, rise, 0], [-L, rise, 0], 2 * L, slope);
  quad([L, 0, -S], [-L, 0, -S], [-L, rise, 0], [L, rise, 0], 2 * L, slope);
  // thickness along the eaves: a lip under each slope edge
  const t = thick;
  quad([-L, -t, S], [L, -t, S], [L, 0, S], [-L, 0, S], 2 * L, t);
  quad([L, -t, -S], [-L, -t, -S], [-L, 0, -S], [L, 0, -S], 2 * L, t);
  // underside
  quad([-L, -t, S], [-L, rise - t * 1.5, 0], [L, rise - t * 1.5, 0], [L, -t, S], 2 * L, slope);
  quad([L, -t, -S], [L, rise - t * 1.5, 0], [-L, rise - t * 1.5, 0], [-L, -t, -S], 2 * L, slope);
  // end caps
  tri([-L, -t, S], [-L, -t, -S], [-L, rise - t * 1.5, 0], [0, 0], [1, 0], [0.5, 1]);
  tri([L, -t, -S], [L, -t, S], [L, rise - t * 1.5, 0], [0, 0], [1, 0], [0.5, 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** a four-sided pyramid roof (hip roof when the base is not square) with a small overhang */
export function hipRoof(w: number, d: number, rise: number, overhang = 0.06, ridge = 0, texel = 0.2): THREE.BufferGeometry {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const rw = ridge / 2;
  const pos: number[] = [];
  const uvs: number[] = [];
  const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]): void => {
    pos.push(...a, ...b, ...c);
    uvs.push(...ua, ...ub, ...uc);
  };
  const sl = Math.hypot(hd, rise);
  const sw = Math.hypot(hw, rise);
  // front/back slopes (trapezoids) and left/right slopes (triangles or trapezoids)
  const f = [[-hw, 0, hd], [hw, 0, hd], [rw, rise, 0], [-rw, rise, 0]];
  const b = [[hw, 0, -hd], [-hw, 0, -hd], [-rw, rise, 0], [rw, rise, 0]];
  const l = [[-hw, 0, -hd], [-hw, 0, hd], [-rw, rise, 0]];
  const r = [[hw, 0, hd], [hw, 0, -hd], [rw, rise, 0]];
  tri(f[0], f[1], f[2], [0, 0], [2 * hw / texel, 0], [(hw + rw) / texel, sl / texel]);
  tri(f[0], f[2], f[3], [0, 0], [(hw + rw) / texel, sl / texel], [(hw - rw) / texel, sl / texel]);
  tri(b[0], b[1], b[2], [0, 0], [2 * hw / texel, 0], [(hw + rw) / texel, sl / texel]);
  tri(b[0], b[2], b[3], [0, 0], [(hw + rw) / texel, sl / texel], [(hw - rw) / texel, sl / texel]);
  tri(l[0], l[1], l[2], [0, 0], [2 * hd / texel, 0], [hd / texel, sw / texel]);
  tri(r[0], r[1], r[2], [0, 0], [2 * hd / texel, 0], [hd / texel, sw / texel]);
  // underside so the roof is closed
  tri([-hw, 0, hd], [-hw, 0, -hd], [hw, 0, -hd], [0, 0], [0, 1], [1, 1]);
  tri([-hw, 0, hd], [hw, 0, -hd], [hw, 0, hd], [0, 0], [1, 1], [1, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** a rounded arch (half cylinder cut-out look) used for bridge arches and doorways: a half-torus-ish extruded profile */
export function archSolid(width: number, rise: number, depth: number, thick: number, seg = 12, texel = 0.3): THREE.BufferGeometry {
  // one closed outline: out over the top, down to the footing, back under the inner arc: a ring with the opening left clear
  const shape = new THREE.Shape();
  const ro = width / 2 + thick;
  shape.moveTo(-ro, 0);
  shape.absarc(0, 0, ro, Math.PI, 0, true);
  shape.lineTo(width / 2, 0);
  shape.absarc(0, 0, width / 2, 0, Math.PI, false);
  shape.lineTo(-ro, 0);
  const g = toNonIndexed(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: seg }));
  g.translate(0, 0, -depth / 2);
  g.scale(1, rise / (width / 2), 1);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nz = Math.abs(nor.getZ(i));
    if (nz > 0.5) uv.setXY(i, pos.getX(i) / texel, pos.getY(i) / texel);
    else uv.setXY(i, pos.getZ(i) / texel, (Math.atan2(pos.getY(i), pos.getX(i)) * width) / texel);
  }
  return g;
}

/** merge a list of parts into one mesh per material key */
export function mergeByMaterial(parts: Part[]): Map<string, THREE.BufferGeometry> {
  const by = new Map<string, THREE.BufferGeometry[]>();
  for (const p of parts) {
    const g = toNonIndexed(p.geo);
    // all merged geometries must carry the same attributes
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    const arr = by.get(p.mat) ?? [];
    arr.push(g);
    by.set(p.mat, arr);
  }
  const out = new Map<string, THREE.BufferGeometry>();
  for (const [k, arr] of by) {
    const merged = mergeGeometries(arr, false);
    if (merged) out.set(k, merged);
    for (const g of arr) g.dispose();
  }
  return out;
}
