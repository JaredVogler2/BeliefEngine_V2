import * as THREE from 'three';
import { box, cyl, gableRoof, hipRoof, place, sphere, type Part } from './geom.ts';
import type { Rng } from './rand.ts';

/**
 * Reusable architectural details: windows with shutters, doors, chimneys, flower boxes, fences, barrels, crates, sacks. Each one
 * appends parts (a geometry and a material key) in the building's own space: x along the front, z out of the front, y up, with the
 * front face at z = +depth/2. Material keys are `name` or `name@rrggbb` for a tint.
 */
export type Parts = Part[];

export const add = (parts: Parts, geo: THREE.BufferGeometry, mat: string, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0): void => {
  parts.push({ geo: place(geo, x, y, z, ry, sx, sy, sz, rx, rz), mat });
};

// shared templates (never rendered directly; every use is a clone)
const T = {
  winFrame: box(0.13, 0.15, 0.022, 0.2),
  winGlass: box(0.1, 0.12, 0.012, 0.2),
  winBar: box(0.012, 0.12, 0.02, 0.2),
  winBarH: box(0.1, 0.012, 0.02, 0.2),
  shutter: box(0.05, 0.15, 0.014, 0.1),
  sill: box(0.16, 0.02, 0.04, 0.2),
  door: box(0.13, 0.25, 0.022, 0.1),
  doorFrame: box(0.17, 0.28, 0.02, 0.2),
  step: box(0.2, 0.03, 0.08, 0.2),
  chimney: box(0.085, 0.3, 0.085, 0.2),
  chimneyCap: box(0.115, 0.025, 0.115, 0.2),
  flowerBox: box(0.15, 0.04, 0.05, 0.1),
  bloom: sphere(0.018, 6, 4),
  postUnit: box(0.025, 1, 0.025, 0.1),
  railUnit: box(1, 0.018, 0.012, 0.1),
  barrel: cyl(0.06, 0.06, 0.12, 10, 0.1),
  barrelBand: cyl(0.064, 0.064, 0.012, 10, 0.1),
  crate: box(0.11, 0.1, 0.11, 0.1),
  sack: sphere(0.05, 8, 6, 0.8),
  log: cyl(0.025, 0.025, 0.3, 7, 0.1),
  stoneSmall: sphere(0.05, 6, 4, 0.7),
  beam: box(1, 0.02, 0.02, 0.1),
  vbeam: box(0.02, 1, 0.02, 0.1),
};

/** a window on the front face (z = +zf), with frame, bars, glass, sill and optional shutters */
export function windowAt(parts: Parts, x: number, y: number, zf: number, ry = 0, shutters = true, scale = 1): void {
  const s = scale;
  // front is the local +z; `ry` rotates the whole window with its wall
  const put = (g: THREE.BufferGeometry, mat: string, px: number, py: number, pz: number): void => {
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    const gx = x + c * px + sn * (zf + pz);
    const gz = -sn * px + c * (zf + pz);
    parts.push({ geo: place(g, gx, y + py, gz, ry, s), mat });
  };
  put(T.winFrame, 'timber', 0, 0, 0);
  put(T.winGlass, 'glass', 0, 0.015, 0.008);
  put(T.winBar, 'timber', 0, 0.015, 0.014);
  put(T.winBarH, 'timber', 0, 0.045, 0.014);
  put(T.sill, 'stone', 0, -0.085, 0.012);
  if (shutters) {
    put(T.shutter, 'wood@7a5a3a', -0.095, 0, 0.004);
    put(T.shutter, 'wood@7a5a3a', 0.095, 0, 0.004);
  }
}

export function doorAt(parts: Parts, x: number, zf: number, ry = 0, color = 0x6a4a30, step = true): void {
  const put = (g: THREE.BufferGeometry, mat: string, px: number, py: number, pz: number): void => {
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    parts.push({ geo: place(g, x + c * px + sn * (zf + pz), py, -sn * px + c * (zf + pz), ry), mat });
  };
  put(T.doorFrame, 'timber', 0, 0.03, 0);
  put(T.door, `wood@${color.toString(16).padStart(6, '0')}`, 0, 0.035, 0.008);
  put(sphere(0.012, 5, 4), 'brass', 0.04, 0.16, 0.022);
  if (step) put(T.step, 'stone', 0, 0, 0.05);
}

export function chimneyAt(parts: Parts, x: number, y: number, z: number, h = 1, round = false): void {
  if (round) {
    add(parts, cyl(0.05, 0.045, 0.3 * h, 10, 0.2), 'stone', x, y, z);
    add(parts, cyl(0.062, 0.062, 0.02, 10, 0.2), 'stone', x, y + 0.3 * h, z);
  } else {
    add(parts, T.chimney, 'stone', x, y, z, 0, 1, h, 1);
    add(parts, T.chimneyCap, 'stone', x, y + 0.3 * h, z);
  }
}

export function flowerBoxAt(parts: Parts, x: number, y: number, zf: number, r: Rng, ry = 0): void {
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  const put = (g: THREE.BufferGeometry, mat: string, px: number, py: number, pz: number): void => {
    parts.push({ geo: place(g, x + c * px + sn * (zf + pz), y + py, -sn * px + c * (zf + pz), ry), mat });
  };
  put(T.flowerBox, 'wood@6b4a2e', 0, 0, 0.03);
  const cols = ['bloom@e85a7a', 'bloom@f2c14e', 'bloom@f0f0f0', 'bloom@b06ae0'];
  for (let i = 0; i < 5; i++) put(T.bloom, cols[Math.floor(r() * cols.length)], -0.06 + i * 0.03, 0.04 + r() * 0.012, 0.03 + (r() - 0.5) * 0.02);
}

/** a run of fence from (x0,z0) to (x1,z1): posts every ~0.22 and two rails */
export function fence(parts: Parts, x0: number, z0: number, x1: number, z1: number, y = 0, h = 0.13, mat = 'wood@8a6a44'): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.05) return;
  const n = Math.max(1, Math.round(len / 0.22));
  const ang = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
  for (let i = 0; i <= n; i++) add(parts, T.postUnit, mat, x0 + ((x1 - x0) * i) / n, y, z0 + ((z1 - z0) * i) / n, 0, 1, h, 1);
  for (const k of [0.45, 0.8]) add(parts, T.railUnit, mat, (x0 + x1) / 2, y + h * k, (z0 + z1) / 2, ang, len, 1, 1);
}

export const barrelAt = (parts: Parts, x: number, y: number, z: number): void => {
  add(parts, T.barrel, 'wood@7d5a38', x, y, z);
  add(parts, T.barrelBand, 'iron', x, y + 0.025, z);
  add(parts, T.barrelBand, 'iron', x, y + 0.085, z);
};
export const crateAt = (parts: Parts, x: number, y: number, z: number, ry = 0, tint = 'wood@93703f'): void => add(parts, T.crate, tint, x, y, z, ry);
export const sackAt = (parts: Parts, x: number, y: number, z: number, tint = 'sack'): void => add(parts, T.sack, tint, x, y + 0.03, z);
export const logAt = (parts: Parts, x: number, y: number, z: number, ry: number): void => add(parts, T.log, 'wood@6e4e32', x, y + 0.025, z, ry, 1, 1, 1, 0, Math.PI / 2);
export const stoneAt = (parts: Parts, x: number, y: number, z: number, s = 1): void => add(parts, T.stoneSmall, 'stone@9d9686', x, y, z, 0, s, s, s);
export const beam = (parts: Parts, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat = 'timber'): void => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const g = place(T.beam, 0, 0, 0);
  g.translate(-0.5, 0, 0);
  g.scale(len, 1, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(dx, dy, dz).normalize());
  g.applyQuaternion(q);
  g.translate(x0, y0, z0);
  parts.push({ geo: g, mat });
};
export const vbeam = (parts: Parts, x: number, y: number, z: number, h: number, mat = 'timber'): void => add(parts, T.vbeam, mat, x, y, z, 0, 1, h, 1);

/** a triangular gable end wall (a prism) filling the space under a gable roof at the end of a ridge */
export function gableEnd(span: number, rise: number, thick: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-span / 2, 0);
  shape.lineTo(span / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 0.5, pos.getY(i) / 0.5);
  return g;
}

export { box, cyl, gableRoof, hipRoof, sphere };
