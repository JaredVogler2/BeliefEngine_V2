import * as THREE from 'three';
import type { Built } from './buildings.ts';
import { archSolid, place } from './geom.ts';
import {
  add, barrelAt, beam, box, crateAt, cyl, fence, gableEnd, gableRoof, hipRoof, logAt, sackAt, sphere, stoneAt, vbeam, type Parts,
} from './kit.ts';
import { pick, type Rng } from './rand.ts';

// ----------------------------------------------------------------------------------------------------------------------------
// the bell tower: the tallest thing in the village, with a bell that really swings
// ----------------------------------------------------------------------------------------------------------------------------
export function buildBellTower(r: Rng): Built {
  const parts: Parts = [];
  const base = 0.5;
  add(parts, box(base + 0.16, 0.12, base + 0.16, 0.4), 'stone@8e887a', 0, -0.08, 0);
  // the shaft tapers a little: three stacked courses, each narrower, with a string course between
  const courses: [number, number][] = [[base, 0.55], [base - 0.05, 0.5], [base - 0.1, 0.45]];
  let y = 0.04;
  for (const [w, h] of courses) {
    add(parts, box(w, h, w, 0.4), 'stone@c4bca8', 0, y, 0);
    add(parts, box(w + 0.04, 0.03, w + 0.04, 0.3), 'stone@a79f8b', 0, y + h, 0);
    y += h + 0.03;
  }
  const w = base - 0.1;
  // narrow slit windows and a door
  for (const dz of [1, -1]) add(parts, box(0.04, 0.16, 0.02, 0.1), 'coal', 0, 0.6, dz * (base / 2 + 0.002));
  add(parts, box(0.04, 0.16, 0.02, 0.1), 'coal', 0, 1.1, base / 2 - 0.045);
  add(parts, box(0.14, 0.22, 0.03, 0.1), 'wood@4a3320', 0, 0.04, base / 2 + 0.005);
  // stone steps up to the door
  for (let i = 0; i < 3; i++) add(parts, box(0.3 - i * 0.05, 0.035, 0.07, 0.1), 'stone@a79f8b', 0, 0.0 + i * 0.0, base / 2 + 0.09 + (2 - i) * 0.06);
  // the belfry: four posts, open sides, a hipped roof
  const by = y;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(parts, box(0.06, 0.3, 0.06, 0.2), 'stone@d0c8b2', sx * (w / 2 - 0.03), by, sz * (w / 2 - 0.03));
  add(parts, box(w, 0.04, w, 0.3), 'stone@b0a890', 0, by + 0.3, 0);
  add(parts, hipRoof(w, w, 0.3, 0.07, 0, 0.2), 'roofSlate@5f8a78', 0, by + 0.34, 0);
  add(parts, box(0.012, 0.2, 0.012, 0.1), 'iron', 0, by + 0.64, 0);
  add(parts, box(0.1, 0.012, 0.012, 0.1), 'iron', 0, by + 0.8, 0);
  add(parts, box(0.03, 0.03, 0.03, 0.1), 'gold', 0.05, by + 0.8, 0);
  // the bell hangs from a beam; it is its own group so it can swing
  const bell: Parts = [];
  add(bell, cyl(0.1, 0.045, 0.16, 12, 0.1), 'brass', 0, -0.16, 0);
  add(bell, cyl(0.1, 0.1, 0.015, 12, 0.1), 'brass', 0, -0.16, 0);
  add(bell, sphere(0.02, 6, 4), 'iron', 0, -0.18, 0);
  add(bell, box(0.012, 0.06, 0.012, 0.1), 'iron', 0, -0.02, 0);
  add(parts, box(w - 0.05, 0.025, 0.04, 0.1), 'timber', 0, by + 0.27, 0);
  void r;
  return { parts, extras: [{ name: 'bell', parts: bell, pivot: [0, by + 0.27, 0] }], radius: 0.5, height: by + 0.9 };
}

// ----------------------------------------------------------------------------------------------------------------------------
// the watermill: a stone house on the bank with a wheel that turns with the water
// ----------------------------------------------------------------------------------------------------------------------------
export function buildMill(r: Rng): Built {
  const parts: Parts = [];
  const W = 0.8;
  const D = 0.62;
  const wh = 0.5;
  add(parts, box(W + 0.06, 0.14, D + 0.06, 0.4), 'stone@8e887a', 0, -0.1, 0);
  add(parts, box(W, 0.26, D, 0.4), 'stone@c4bca8', 0, 0.04, 0);
  add(parts, box(W, wh - 0.26, D, 0.4), 'plaster@efe3c8', 0, 0.3, 0);
  for (let i = 0; i <= 4; i++) vbeam(parts, -W / 2 + 0.03 + i * ((W - 0.06) / 4), 0.3, D / 2 + 0.004, wh - 0.26);
  add(parts, gableRoof(W, D, 0.34, 0.09, 0.04), 'roofTile@c0764f', 0, 0.04 + wh, 0);
  for (const sx of [-1, 1]) add(parts, gableEnd(D, 0.34, 0.02), 'plaster@efe3c8', sx * (W / 2 - 0.01), 0.04 + wh, 0, Math.PI / 2);
  add(parts, box(0.14, 0.24, 0.02, 0.1), 'wood@4a3320', -0.15, 0.04, D / 2 + 0.005);
  add(parts, box(0.16, 0.14, 0.03, 0.1), 'wood@6a4a30', 0.2, 0.34, D / 2 + 0.005);
  // a hoist beam with a rope and a sack
  add(parts, box(0.03, 0.03, 0.2, 0.1), 'timber', 0.2, 0.62, D / 2 + 0.1);
  add(parts, box(0.006, 0.12, 0.006, 0.1), 'rope', 0.2, 0.5, D / 2 + 0.18);
  sackAt(parts, 0.2, 0.44, D / 2 + 0.18);
  sackAt(parts, -0.35, 0.04, D / 2 + 0.1);
  sackAt(parts, -0.28, 0.04, D / 2 + 0.12);
  // the wheel, on the side that faces the water (the +x side is handled by rotating the whole building towards the river)
  const wheel: Parts = [];
  const R = 0.33;
  add(wheel, cyl(R, R, 0.04, 16, 0.1), 'wood@7a5a3a', 0, 0, -0.1, 0, 1, 1, 1, Math.PI / 2);
  add(wheel, cyl(R, R, 0.04, 16, 0.1), 'wood@7a5a3a', 0, 0, 0.1, 0, 1, 1, 1, Math.PI / 2);
  add(wheel, cyl(0.04, 0.04, 0.3, 8, 0.1), 'timber', 0, 0, -0.15, 0, 1, 1, 1, Math.PI / 2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    add(wheel, box(0.04, 0.07, 0.2, 0.1), 'wood@8a6a44', Math.sin(a) * (R + 0.02), Math.cos(a) * (R + 0.02), 0, -a);
    beam(wheel, 0, 0, -0.1, Math.sin(a) * R, Math.cos(a) * R, -0.1, 'timber');
    beam(wheel, 0, 0, 0.1, Math.sin(a) * R, Math.cos(a) * R, 0.1, 'timber');
  }
  void r;
  return { parts, extras: [{ name: 'wheel', parts: wheel, pivot: [W / 2 + 0.2, R - 0.02, 0] }], smoke: [], radius: 0.7, height: 0.95 };
}

// ----------------------------------------------------------------------------------------------------------------------------
// the market: striped stalls, a cart, crates and barrels
// ----------------------------------------------------------------------------------------------------------------------------
export function buildMarket(r: Rng): Built {
  const parts: Parts = [];
  const awnings = ['c0452f', '2f6f9e', 'd0a02a', '4d8a4a'];
  const stall = (x: number, z: number, ry: number, colour: string, goods: number): void => {
    const sub: Parts = [];
    add(sub, box(0.5, 0.012, 0.3, 0.2), 'wood@8a6a44', 0, 0.2, 0);
    add(sub, box(0.5, 0.2, 0.3, 0.3), 'wood@7a5a3a', 0, 0.0, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) vbeam(sub, sx * 0.24, 0, sz * 0.14, 0.46);
    // the awning slopes towards the customer
    add(sub, box(0.56, 0.015, 0.4, 0.1), `cloth@${colour}`, 0, 0.45, 0.02, 0, 1, 1, 1, 0.28);
    add(sub, box(0.56, 0.05, 0.015, 0.1), `cloth@${colour}`, 0, 0.36, 0.2);
    for (let i = 0; i < 4; i++) add(sub, box(0.07, 0.016, 0.4, 0.1), 'cloth@f2ebd8', -0.2 + i * 0.133, 0.452, 0.02, 0, 1, 1, 1, 0.28);
    // goods: apples, loaves, cheeses, jars
    for (let i = 0; i < 5; i++) {
      const gx = -0.18 + i * 0.09;
      if (goods === 0) add(sub, sphere(0.03, 7, 5), 'bloom@d8412f', gx, 0.2, 0.0 + (i % 2) * 0.05);
      else if (goods === 1) add(sub, sphere(0.04, 7, 5, 0.55), 'sack@c28e4a', gx, 0.21, 0.02);
      else add(sub, cyl(0.035, 0.035, 0.04, 8, 0.1), 'bloom@f0d070', gx, 0.2, (i % 2) * 0.06 - 0.02);
    }
    for (const p of sub) add(parts, p.geo, p.mat, x, 0, z, ry);
  };
  stall(-0.4, -0.15, 0.1, pick(r, awnings), 0);
  stall(0.25, -0.3, -0.15, pick(r, awnings), 1);
  stall(0.35, 0.28, Math.PI, pick(r, awnings), 2);
  // a handcart and barrels in the lane between
  add(parts, box(0.3, 0.05, 0.18, 0.2), 'wood@7a5a3a', -0.35, 0.1, 0.35, 0.3);
  add(parts, cyl(0.08, 0.08, 0.02, 12, 0.1), 'wood@6a4a30', -0.35, 0.08, 0.46, 0.3, 1, 1, 1, Math.PI / 2);
  add(parts, cyl(0.08, 0.08, 0.02, 12, 0.1), 'wood@6a4a30', -0.35, 0.08, 0.24, 0.3, 1, 1, 1, Math.PI / 2);
  sackAt(parts, -0.38, 0.12, 0.34);
  sackAt(parts, -0.3, 0.12, 0.36);
  barrelAt(parts, 0.0, 0, 0.1);
  barrelAt(parts, 0.1, 0, 0.16);
  crateAt(parts, -0.05, 0, -0.38, 0.4);
  crateAt(parts, -0.05, 0.1, -0.38, 0.2);
  // a hanging sign on a post
  vbeam(parts, 0.55, 0, 0.0, 0.5);
  add(parts, box(0.2, 0.012, 0.012, 0.1), 'iron', 0.45, 0.48, 0.0);
  add(parts, box(0.1, 0.1, 0.012, 0.1), 'wood@c9a24a', 0.4, 0.38, 0.0);
  return { parts, radius: 0.9, height: 0.6 };
}

// ----------------------------------------------------------------------------------------------------------------------------
// the shelter on the hill: a pavilion with tents
// ----------------------------------------------------------------------------------------------------------------------------
export function buildShelter(r: Rng): Built {
  const parts: Parts = [];
  add(parts, cyl(0.62, 0.58, 0.14, 10, 0.3), 'stone@b0a890', 0, -0.05, 0);
  add(parts, cyl(0.54, 0.54, 0.04, 10, 0.3), 'stone@c8c0ac', 0, 0.09, 0);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    add(parts, cyl(0.035, 0.035, 0.42, 8, 0.2), 'stone@d0c8b2', Math.sin(a) * 0.42, 0.13, Math.cos(a) * 0.42);
    add(parts, box(0.09, 0.03, 0.09, 0.1), 'stone@b0a890', Math.sin(a) * 0.42, 0.55, Math.cos(a) * 0.42);
  }
  add(parts, hipRoof(0.98, 0.98, 0.3, 0.1, 0, 0.2), 'roofTile@c0764f', 0, 0.58, 0);
  add(parts, cyl(0.02, 0.01, 0.12, 6, 0.1), 'gold', 0, 0.88, 0);
  // a bench and a brazier inside
  add(parts, box(0.3, 0.04, 0.1, 0.1), 'wood@8a6a44', 0, 0.13, -0.18);
  add(parts, cyl(0.05, 0.07, 0.06, 8, 0.1), 'iron', 0.1, 0.13, 0.15);
  // tents around the foot of the hill
  for (let i = 0; i < 3; i++) {
    const a = 0.9 + i * 1.0;
    const rr = 0.9 + r() * 0.15;
    add(parts, cyl(0.2, 0.01, 0.26, 4, 0.2), `cloth@${pick(r, ['d9c9a0', 'c9a9a0', 'a9b9c0'])}`, Math.sin(a) * rr, 0, Math.cos(a) * rr + 0.1, a + 0.7);
  }
  return { parts, radius: 1.0, height: 1.0 };
}

export function buildWell(r: Rng): Built {
  const parts: Parts = [];
  add(parts, cyl(0.16, 0.16, 0.16, 12, 0.2), 'stone@a79f8b', 0, 0, 0);
  add(parts, cyl(0.12, 0.12, 0.012, 12, 0.2), 'glass', 0, 0.14, 0);
  for (const sx of [-1, 1]) vbeam(parts, sx * 0.15, 0.1, 0, 0.3);
  add(parts, gableRoof(0.34, 0.2, 0.12, 0.05, 0.02), 'roofTile@c0764f', 0, 0.4, 0);
  add(parts, cyl(0.012, 0.012, 0.34, 6, 0.1), 'timber', 0, 0.32, 0, 0, 1, 1, 1, 0, Math.PI / 2);
  add(parts, cyl(0.035, 0.03, 0.05, 8, 0.1), 'wood@7a5a3a', 0.0, 0.22, 0.0);
  void r;
  return { parts, radius: 0.3, height: 0.5 };
}

export function buildPen(r: Rng): Built {
  const parts: Parts = [];
  const W = 1.2;
  const D = 0.95;
  fence(parts, -W / 2, -D / 2, W / 2, -D / 2);
  fence(parts, W / 2, -D / 2, W / 2, D / 2);
  fence(parts, W / 2, D / 2, 0.15, D / 2);
  fence(parts, -0.15, D / 2, -W / 2, D / 2);
  fence(parts, -W / 2, D / 2, -W / 2, -D / 2);
  // a lean-to shelter on the north side and hay
  add(parts, box(0.5, 0.18, 0.2, 0.3), 'wood@7a5a3a', -0.3, 0, -D / 2 + 0.12);
  add(parts, box(0.56, 0.025, 0.3, 0.3), 'thatch', -0.3, 0.2, -D / 2 + 0.14, 0, 1, 1, 1, -0.2);
  add(parts, box(0.24, 0.1, 0.14, 0.2), 'straw', 0.25, 0, -D / 2 + 0.14);
  add(parts, box(0.3, 0.05, 0.1, 0.2), 'wood@8a6a44', 0.3, 0.0, 0.1);
  // the flock
  for (let i = 0; i < 6; i++) {
    const x = (r() - 0.5) * (W - 0.35);
    const z = (r() - 0.5) * (D - 0.3) + 0.05;
    const a = r() * 6;
    add(parts, sphere(0.06, 8, 6, 0.8), 'white', x, 0.075, z, a, 1.15, 1, 0.85);
    add(parts, sphere(0.028, 6, 5), 'coal', x + Math.sin(a) * 0.07, 0.09, z + Math.cos(a) * 0.07);
    for (const dx of [-0.03, 0.03]) for (const dz of [-0.03, 0.03]) add(parts, box(0.012, 0.04, 0.012, 0.1), 'coal', x + dx, 0.0, z + dz);
  }
  return { parts, radius: 0.8, height: 0.3 };
}

// ----------------------------------------------------------------------------------------------------------------------------
// fire: the campfire and the beacon, both with a flame that is its own group (shown only when the engine says it is lit)
// ----------------------------------------------------------------------------------------------------------------------------
export function buildCampfire(r: Rng): Built {
  const parts: Parts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    stoneAt(parts, Math.sin(a) * 0.14, 0.0, Math.cos(a) * 0.14, 0.8 + r() * 0.5);
  }
  for (let i = 0; i < 4; i++) logAt(parts, 0, 0.0, 0, (i / 4) * Math.PI + 0.3);
  add(parts, cyl(0.1, 0.1, 0.01, 8, 0.1), 'coal', 0, 0.0, 0);
  // two logs to sit on
  add(parts, cyl(0.04, 0.04, 0.2, 7, 0.1), 'wood@7a5a3a', 0.3, 0.04, 0.05, 0.4, 1, 1, 1, 0, Math.PI / 2);
  add(parts, cyl(0.04, 0.04, 0.2, 7, 0.1), 'wood@7a5a3a', -0.28, 0.04, -0.1, -0.5, 1, 1, 1, 0, Math.PI / 2);
  return { parts, radius: 0.35, height: 0.25 };
}

export function buildBeacon(r: Rng): Built {
  const parts: Parts = [];
  add(parts, cyl(0.22, 0.2, 0.12, 8, 0.2), 'stone@a79f8b', 0, -0.06, 0);
  add(parts, cyl(0.14, 0.1, 0.3, 8, 0.2), 'stone@c4bca8', 0, 0.04, 0);
  add(parts, cyl(0.17, 0.17, 0.03, 8, 0.2), 'stone@a79f8b', 0, 0.34, 0);
  // the iron basket with its fuel
  add(parts, cyl(0.13, 0.08, 0.1, 8, 0.1), 'iron', 0, 0.37, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    beam(parts, Math.sin(a) * 0.08, 0.37, Math.cos(a) * 0.08, Math.sin(a) * 0.13, 0.47, Math.cos(a) * 0.13, 'iron');
  }
  for (let i = 0; i < 4; i++) logAt(parts, 0, 0.4, 0, (i / 4) * Math.PI + 0.2);
  add(parts, sphere(0.06, 6, 4, 0.6), 'coal', 0, 0.42, 0);
  barrelAt(parts, 0.26, -0.04, 0.12);
  void r;
  return { parts, radius: 0.3, height: 0.5 };
}

// ----------------------------------------------------------------------------------------------------------------------------
// the bridge: a humped stone bridge over the river tiles, built from the engine's own footprint
// ----------------------------------------------------------------------------------------------------------------------------
export interface BridgeSpec {
  /** x of the first and last river tile of the span (tile units) and the row */
  x0: number;
  x1: number;
  row: number;
  /** ground height at each end, and at the middle bank level, in world units */
  y0: number;
  y1: number;
  /** water surface height under it */
  waterY: number;
}

export function buildBridge(spec: BridgeSpec): { standing: Parts; ruins: Parts; trim: Parts; width: number } {
  const standing: Parts = [];
  const ruins: Parts = [];
  const trim: Parts = [];
  const xa = spec.x0 - 0.6;
  const xb = spec.x1 + 1 + 0.6;
  const cz = spec.row + 0.5;
  const width = 0.62;
  const apex = Math.max(spec.y0, spec.y1) + 0.34;
  // deck centre line: a smooth hump between the two banks
  const N = 22;
  const top = (t: number): number => {
    const base = spec.y0 + (spec.y1 - spec.y0) * t;
    return base + Math.sin(t * Math.PI) * (apex - Math.max(spec.y0, spec.y1));
  };
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) pts.push([xa + ((xb - xa) * i) / N, top(i / N)]);
  const strip = (inset: number, w: number, y0: number, y1: number, mat: string, into: Parts): void => {
    // a swept box along the hump from height y0 below the deck surface to y1 above it
    const pos: number[] = [];
    const uv: number[] = [];
    const zl = cz - inset - w / 2;
    const zr = cz - inset + w / 2;
    const q = (a: number[], b: number[], c: number[], d: number[], ua: number[], ub: number[], uc: number[], ud: number[]): void => {
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
    };
    for (let i = 0; i < N; i++) {
      const [x1, h1] = pts[i];
      const [x2, h2] = pts[i + 1];
      const u1 = x1 / 0.4;
      const u2 = x2 / 0.4;
      // top
      q([x1, h1 + y1, zl], [x1, h1 + y1, zr], [x2, h2 + y1, zr], [x2, h2 + y1, zl], [u1, 0], [u1, w / 0.4], [u2, w / 0.4], [u2, 0]);
      // front (+z) and back (-z) faces
      q([x1, h1 + y1, zr], [x1, h1 - y0, zr], [x2, h2 - y0, zr], [x2, h2 + y1, zr], [u1, 0], [u1, (y0 + y1) / 0.4], [u2, (y0 + y1) / 0.4], [u2, 0]);
      q([x2, h2 + y1, zl], [x2, h2 - y0, zl], [x1, h1 - y0, zl], [x1, h1 + y1, zl], [u2, 0], [u2, (y0 + y1) / 0.4], [u1, (y0 + y1) / 0.4], [u1, 0]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    into.push({ geo: g, mat });
  };
  strip(0, width, 0.07, 0, 'cobble', standing);
  // parapets on both sides, capped
  strip(-width / 2 + 0.04, 0.07, 0.04, 0.13, 'stone@b8b09a', standing);
  strip(width / 2 - 0.04, 0.07, 0.04, 0.13, 'stone@b8b09a', standing);
  strip(-width / 2 + 0.04, 0.095, -0.12, 0.145, 'stone@cfc7b2', standing);
  strip(width / 2 - 0.04, 0.095, -0.12, 0.145, 'stone@cfc7b2', standing);
  // the gold trim a watched bridge shows along its railings (its own parts so it can light up)
  strip(-width / 2 + 0.04, 0.02, -0.14, 0.155, 'gold', trim);
  strip(width / 2 - 0.04, 0.02, -0.14, 0.155, 'gold', trim);
  // the arch under the hump, as a ring of masonry across the river, and piers where it meets the banks
  const span = spec.x1 - spec.x0 + 1;
  const arch = archSolid(span - 0.2, Math.max(0.35, apex - spec.waterY - 0.28), width - 0.02, 0.2, 14, 0.3);
  standing.push({ geo: arch.translate((spec.x0 + spec.x1 + 1) / 2, spec.waterY - 0.1, cz), mat: 'stone@b0a890' });
  for (const [px, side] of [[spec.x0 - 0.1, -1], [spec.x1 + 1.1, 1]] as [number, number][]) {
    const h = (side < 0 ? spec.y0 : spec.y1) - spec.waterY + 0.25;
    standing.push({ geo: box(0.34, h, width + 0.04, 0.3).translate(px, spec.waterY - 0.25, cz), mat: 'stone@a79f8b' });
  }
  // lantern posts at the four corners
  for (const [lx, sz] of [[xa + 0.12, -1], [xa + 0.12, 1], [xb - 0.12, -1], [xb - 0.12, 1]] as [number, number][]) {
    const t = (lx - xa) / (xb - xa);
    const gy = top(t) + 0.13;
    standing.push({ geo: box(0.03, 0.24, 0.03, 0.1).translate(lx, gy, cz + sz * (width / 2 - 0.04)), mat: 'timber' });
    standing.push({ geo: box(0.06, 0.07, 0.06, 0.1).translate(lx, gy + 0.24, cz + sz * (width / 2 - 0.04)), mat: 'glassLit' });
    standing.push({ geo: box(0.08, 0.025, 0.08, 0.1).translate(lx, gy + 0.31, cz + sz * (width / 2 - 0.04)), mat: 'iron' });
  }
  // what is left when the bridge has fallen: the two abutments' stumps and rubble in the water
  for (const [px, side] of [[spec.x0 - 0.1, -1], [spec.x1 + 1.1, 1]] as [number, number][]) {
    const h = (side < 0 ? spec.y0 : spec.y1) - spec.waterY + 0.25;
    ruins.push({ geo: box(0.34, h, width + 0.04, 0.3).translate(px, spec.waterY - 0.25, cz), mat: 'stone@a79f8b' });
    ruins.push({ geo: box(0.26, 0.1, 0.4, 0.3).translate(px + side * 0.3, (side < 0 ? spec.y0 : spec.y1) - 0.1, cz), mat: 'stone@b8b09a' });
  }
  for (let i = 0; i < 9; i++) {
    const rx = spec.x0 + 0.2 + (i / 8) * (spec.x1 - spec.x0 + 0.6);
    ruins.push({ geo: place(box(0.14 + (i % 3) * 0.04, 0.1, 0.12, 0.2), rx, spec.waterY - 0.08 + (i % 2) * 0.04, cz + (((i * 7) % 5) - 2) * 0.1, i), mat: 'stone@b0a890' });
  }
  return { standing, ruins, trim, width };
}

/** the bridge's footprint from the engine's own landmark tiles, in world units */
export function bridgeSpecOf(tiles: [number, number][], ctx: { heightAt(x: number, z: number): number; terrain: { w: number; tileBase: Float32Array } }): BridgeSpec {
  const xs = tiles.map((t) => t[0]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const row = tiles[0][1];
  const cz = row + 0.5;
  const riverIdx = row * ctx.terrain.w + Math.min(ctx.terrain.w - 1, Math.round((x0 + x1) / 2));
  return { x0, x1, row, y0: ctx.heightAt(x0 - 0.6, cz), y1: ctx.heightAt(x1 + 1.6, cz), waterY: ctx.terrain.tileBase[riverIdx] + 0.12 };
}

/** the height of the deck's walking surface at world x (the same hump the mesh is built with) */
export function deckHeight(spec: BridgeSpec, x: number): number {
  const xa = spec.x0 - 0.6;
  const xb = spec.x1 + 1 + 0.6;
  const t = Math.min(1, Math.max(0, (x - xa) / (xb - xa)));
  const apex = Math.max(spec.y0, spec.y1) + 0.34;
  return spec.y0 + (spec.y1 - spec.y0) * t + Math.sin(t * Math.PI) * (apex - Math.max(spec.y0, spec.y1)) + 0.02;
}
