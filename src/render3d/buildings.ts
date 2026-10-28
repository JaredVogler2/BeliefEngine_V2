import { pick, type Rng } from './rand.ts';
import {
  add, barrelAt, beam, box, chimneyAt, crateAt, cyl, doorAt, flowerBoxAt, gableEnd, gableRoof, hipRoof, logAt, sackAt, sphere, stoneAt, vbeam, windowAt, type Parts,
} from './kit.ts';

/** what a builder hands back: static parts (merged per material), plus the few pieces that move or glow */
export interface Built {
  parts: Parts;
  /** pieces that animate: separate groups with their own pivot, named for the layer that drives them */
  extras?: { name: string; parts: Parts; pivot: [number, number, number] }[];
  /** chimney tops, where smoke can rise (local space) */
  smoke?: [number, number, number][];
  /** window lights that glow in a storm or at night (local space) */
  radius: number;
  height: number;
}

const PLASTER = [0xf3ead2, 0xead7a8, 0xe9cdb4, 0xdfe0d2, 0xf0dfa4, 0xe6d3c4];
const hex6 = (n: number): string => n.toString(16).padStart(6, '0');
const plaster = (n: number): string => `plaster@${hex6(n)}`;

// ----------------------------------------------------------------------------------------------------------------------------
// houses: five different buildings, not one rescaled five times
// ----------------------------------------------------------------------------------------------------------------------------

export function buildHome(variant: number, r: Rng): Built {
  const parts: Parts = [];
  const smoke: [number, number, number][] = [];
  const wall = pick(r, PLASTER);
  // the standard's roofs: mostly terracotta and brick, with glazed teal and dark umber in among them (weighted by repetition)
  const roofTints = ['b8532f', 'b8532f', 'c8694a', 'a63a2c', 'a63a2c', '3f8f8f', '3f8f8f', '7a4a2e'];
  const tile = `roofTile@${pick(r, roofTints)}`;
  const door = pick(r, [0x6a4a30, 0x3f5f5a, 0x7a3b2e, 0x4a5c7a]);
  let radius: number;
  let height: number;

  switch (variant % 5) {
    default:
    case 0: {
      // the gable cottage
      const W = 0.8;
      const D = 0.56;
      const wh = 0.4;
      add(parts, box(W + 0.05, 0.4, D + 0.05, 0.4), 'stone', 0, -0.36, 0);
      add(parts, box(W, wh, D, 0.5), plaster(wall), 0, 0.04, 0);
      add(parts, gableRoof(W, D, 0.3, 0.075, 0.035), tile, 0, 0.04 + wh, 0);
      for (const sx of [-1, 1]) add(parts, gableEnd(D, 0.3, 0.02), plaster(wall), sx * (W / 2 - 0.01), 0.04 + wh, 0, Math.PI / 2);
      chimneyAt(parts, W * 0.24, 0.04 + wh + 0.14, -0.02, 1);
      smoke.push([W * 0.24, 0.04 + wh + 0.14 + 0.32, -0.02]);
      doorAt(parts, -0.12, D / 2, 0, door);
      windowAt(parts, 0.2, 0.26, D / 2);
      windowAt(parts, -0.32, 0.26, D / 2);
      windowAt(parts, 0.0, 0.28, D / 2, Math.PI);
      windowAt(parts, -W / 2, 0.26, 0, -Math.PI / 2, true, 0.9);
      windowAt(parts, -W / 2 + 0.005, 0.04 + wh + 0.1, 0, -Math.PI / 2, false, 0.55);
      flowerBoxAt(parts, 0.2, 0.18, D / 2, r);
      // a small lean-to woodshed at one end
      add(parts, box(0.22, 0.2, D * 0.7, 0.3), 'wood', W / 2 + 0.11, 0.04, 0.02);
      add(parts, box(0.26, 0.025, D * 0.78, 0.3), 'roofTile', W / 2 + 0.12, 0.24, 0.02, 0, 1, 1, 1, 0, -0.18);
      logAt(parts, W / 2 + 0.12, 0.04, D / 2 - 0.02, 0.1);
      logAt(parts, W / 2 + 0.12, 0.08, D / 2 - 0.02, -0.05);
      barrelAt(parts, -W / 2 - 0.08, 0.04, D / 2 - 0.05);
      radius = 0.6;
      height = 0.78;
      break;
    }
    case 1: {
      // the timber-framed house with an overhanging upper floor
      const W = 0.72;
      const D = 0.58;
      const h1 = 0.3;
      const h2 = 0.28;
      add(parts, box(W + 0.05, 0.4, D + 0.05, 0.4), 'stone', 0, -0.36, 0);
      add(parts, box(W, h1, D, 0.5), plaster(wall), 0, 0.04, 0);
      const U = 0.05;
      add(parts, box(W + U, 0.03, D + U, 0.3), 'timber', 0, 0.04 + h1, 0);
      add(parts, box(W + U, h2, D + U, 0.5), plaster(wall), 0, 0.07 + h1, 0);
      const y2 = 0.07 + h1;
      // timber frame on the upper storey: corner posts, mid rail, braces
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) vbeam(parts, sx * (W + U) / 2, y2, sz * (D + U) / 2, h2);
      const zf = (D + U) / 2 + 0.002;
      for (const x of [-0.2, 0.2]) vbeam(parts, x, y2, zf, h2);
      add(parts, box(W + U, 0.02, 0.02, 0.2), 'timber', 0, y2 + h2 * 0.5, zf);
      beam(parts, -0.36, y2, zf, -0.2, y2 + h2, zf);
      beam(parts, 0.36, y2, zf, 0.2, y2 + h2, zf);
      add(parts, gableRoof(W + U, D + U, 0.34, 0.08, 0.035), 'roofSlate', 0, y2 + h2, 0);
      for (const sx of [-1, 1]) add(parts, gableEnd(D + U, 0.34, 0.02), plaster(wall), sx * ((W + U) / 2 - 0.01), y2 + h2, 0, Math.PI / 2);
      chimneyAt(parts, -W * 0.25, y2 + h2 + 0.1, 0, 1.15);
      smoke.push([-W * 0.25, y2 + h2 + 0.1 + 0.35, 0]);
      doorAt(parts, 0, D / 2, 0, door);
      windowAt(parts, -0.25, 0.2, D / 2, 0, true, 0.9);
      windowAt(parts, 0.25, 0.2, D / 2, 0, true, 0.9);
      windowAt(parts, -0.0, y2 + 0.14, zf + 0.02, 0, false, 0.95);
      windowAt(parts, -0.26, y2 + 0.14, zf + 0.02, 0, true, 0.85);
      windowAt(parts, 0.26, y2 + 0.14, zf + 0.02, 0, true, 0.85);
      for (const sx of [-1, 1]) {
        windowAt(parts, sx * (W / 2), 0.2, 0, (sx * Math.PI) / 2, false, 0.85);
        windowAt(parts, sx * ((W + U) / 2 + 0.002), y2 + 0.14, 0, (sx * Math.PI) / 2, false, 0.8);
      }
      windowAt(parts, 0.15, y2 + 0.14, zf + 0.02, Math.PI, false, 0.85);
      crateAt(parts, 0.42, 0.04, D / 2 + 0.05, 0.3);
      sackAt(parts, 0.5, 0.04, D / 2 + 0.02);
      radius = 0.55;
      height = 0.95;
      break;
    }
    case 2: {
      // the L-shaped farmhouse: a long wing and a cross wing, each with its own roof
      const W = 0.86;
      const D = 0.5;
      const wh = 0.38;
      add(parts, box(W + 0.05, 0.4, D + 0.05, 0.4), 'stone', 0, -0.36, 0);
      add(parts, box(W, wh, D, 0.5), plaster(wall), 0, 0.04, 0);
      add(parts, gableRoof(W, D, 0.27, 0.07), tile, 0, 0.04 + wh, 0);
      for (const sx of [-1, 1]) add(parts, gableEnd(D, 0.27, 0.02), plaster(wall), sx * (W / 2 - 0.01), 0.04 + wh, 0, Math.PI / 2);
      // cross wing at the east end, running toward the viewer
      const cw = 0.46;
      const cd = 0.62;
      const cx = W / 2 - cw / 2;
      const cz = D / 2 + cd / 2 - 0.12;
      add(parts, box(cw + 0.05, 0.4, cd + 0.05, 0.4), 'stone', cx, -0.36, cz);
      add(parts, box(cw, wh, cd, 0.5), plaster(wall), cx, 0.04, cz);
      add(parts, gableRoof(cd, cw, 0.25, 0.07), tile, cx, 0.04 + wh, cz, Math.PI / 2);
      add(parts, gableEnd(cw, 0.25, 0.02), plaster(wall), cx, 0.04 + wh, cz + cd / 2 - 0.01, 0);
      chimneyAt(parts, -W * 0.2, 0.04 + wh + 0.12, 0, 1.1);
      smoke.push([-W * 0.2, 0.04 + wh + 0.12 + 0.33, 0]);
      doorAt(parts, cx, cz + cd / 2, 0, door);
      windowAt(parts, cx - 0.11, 0.25, cz + cd / 2 + 0.0, 0, true, 0.9);
      windowAt(parts, -0.2, 0.26, D / 2, 0);
      windowAt(parts, -0.38, 0.26, D / 2, 0);
      windowAt(parts, cx + cw / 2, 0.26, cz, Math.PI / 2);
      windowAt(parts, -W / 2, 0.26, 0, -Math.PI / 2, true, 0.9);
      windowAt(parts, -0.25, 0.26, D / 2, Math.PI, true, 0.9);
      windowAt(parts, 0.2, 0.26, D / 2, Math.PI, true, 0.9);
      // a porch roof on two posts over the cross wing door
      add(parts, box(0.3, 0.02, 0.18, 0.3), 'wood@7a5a3a', cx, 0.33, cz + cd / 2 + 0.09, 0, 1, 1, 1, 0.12);
      vbeam(parts, cx - 0.13, 0.04, cz + cd / 2 + 0.16, 0.3);
      vbeam(parts, cx + 0.13, 0.04, cz + cd / 2 + 0.16, 0.3);
      barrelAt(parts, -W / 2 + 0.05, 0.04, D / 2 + 0.07);
      radius = 0.75;
      height = 0.75;
      break;
    }
    case 3: {
      // the stone cottage under slate, with a round chimney and a bench
      const W = 0.7;
      const D = 0.56;
      const wh = 0.42;
      add(parts, box(W + 0.05, 0.4, D + 0.05, 0.4), 'stone@8e887a', 0, -0.36, 0);
      add(parts, box(W, wh, D, 0.45), 'stone@b5ad98', 0, 0.04, 0);
      add(parts, gableRoof(D, W, 0.32, 0.075, 0.04), 'roofSlate', 0, 0.04 + wh, 0, Math.PI / 2);
      add(parts, gableEnd(W, 0.32, 0.02), 'stone@b5ad98', 0, 0.04 + wh, D / 2 - 0.01, 0);
      add(parts, gableEnd(W, 0.32, 0.02), 'stone@b5ad98', 0, 0.04 + wh, -D / 2 + 0.01, Math.PI);
      chimneyAt(parts, W * 0.28, 0.04 + wh + 0.18, 0, 1.05, true);
      smoke.push([W * 0.28, 0.04 + wh + 0.18 + 0.3, 0]);
      doorAt(parts, 0.1, D / 2, 0, door);
      windowAt(parts, -0.2, 0.28, D / 2, 0, true, 0.95);
      windowAt(parts, W / 2, 0.28, 0, Math.PI / 2, true, 0.95);
      windowAt(parts, -W / 2, 0.28, 0.0, -Math.PI / 2, true, 0.95);
      add(parts, box(0.3, 0.035, 0.08, 0.2), 'wood@8a6a44', -0.2, 0.1, D / 2 + 0.12);
      vbeam(parts, -0.32, 0.04, D / 2 + 0.12, 0.06);
      vbeam(parts, -0.08, 0.04, D / 2 + 0.12, 0.06);
      stoneAt(parts, W / 2 + 0.1, 0.04, D / 2 - 0.05, 1.2);
      stoneAt(parts, W / 2 + 0.16, 0.04, D / 2 - 0.1, 0.8);
      radius = 0.55;
      height = 0.82;
      break;
    }
    case 4: {
      // the thatched cottage: low walls, a deep hipped thatch roof and an eyebrow dormer
      const W = 0.76;
      const D = 0.58;
      const wh = 0.34;
      add(parts, box(W + 0.05, 0.4, D + 0.05, 0.4), 'stone', 0, -0.36, 0);
      add(parts, box(W, wh, D, 0.5), plaster(wall), 0, 0.04, 0);
      add(parts, hipRoof(W, D, 0.34, 0.11, W * 0.5, 0.25), 'thatch', 0, 0.04 + wh, 0);
      // eyebrow dormer over the door
      add(parts, hipRoof(0.2, 0.14, 0.09, 0.03, 0.08, 0.2), 'thatch', -0.05, 0.04 + wh + 0.12, D / 2 + 0.02, 0, 1, 1, 1, 0.5);
      add(parts, box(0.14, 0.08, 0.05, 0.2), plaster(wall), -0.05, 0.04 + wh + 0.07, D / 2 - 0.05, 0, 1, 1, 1, 0.0);
      chimneyAt(parts, W * 0.22, 0.04 + wh + 0.22, -0.05, 0.9);
      smoke.push([W * 0.22, 0.04 + wh + 0.22 + 0.27, -0.05]);
      doorAt(parts, -0.05, D / 2, 0, door);
      windowAt(parts, 0.22, 0.22, D / 2, 0, true, 0.9);
      windowAt(parts, -0.3, 0.22, D / 2, 0, true, 0.9);
      windowAt(parts, W / 2, 0.22, 0, Math.PI / 2, true, 0.85);
      windowAt(parts, -W / 2, 0.22, 0, -Math.PI / 2, true, 0.85);
      windowAt(parts, 0.1, 0.22, D / 2, Math.PI, true, 0.85);
      sackAt(parts, 0.36, 0.04, D / 2 + 0.06);
      add(parts, sphere(0.045, 7, 5), 'straw', -0.4, 0.07, D / 2 + 0.06);
      radius = 0.6;
      height = 0.75;
      break;
    }
  }
  return { parts, smoke, radius, height };
}

// ----------------------------------------------------------------------------------------------------------------------------
// cabins, granaries, halls, chapels
// ----------------------------------------------------------------------------------------------------------------------------

export function buildCabin(r: Rng): Built {
  const parts: Parts = [];
  const W = 0.62;
  const D = 0.5;
  const wh = 0.34;
  add(parts, box(W + 0.05, 0.4, D + 0.05, 0.4), 'stone@8e887a', 0, -0.36, 0);
  // log walls: stacked horizontal logs with the ends sticking out at the corners
  for (let i = 0; i < 6; i++) {
    const y = 0.04 + i * 0.058 + 0.03;
    add(parts, box(W, 0.05, D - 0.02, 0.3), 'wood@8a6440', 0, y - 0.03, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(parts, cyl(0.03, 0.03, 0.05, 8, 0.1), 'wood@a07a4e', sx * (W / 2 + 0.005), y - 0.03, sz * (D / 2 - 0.02), 0, 1, 1, 1, 0, Math.PI / 2);
  }
  add(parts, gableRoof(W, D, 0.26, 0.09, 0.04), 'roofTile@8a5a3a', 0, 0.04 + wh, 0);
  for (const sx of [-1, 1]) add(parts, gableEnd(D, 0.26, 0.02), 'wood@8a6440', sx * (W / 2 - 0.01), 0.04 + wh, 0, Math.PI / 2);
  chimneyAt(parts, W * 0.22, 0.04 + wh + 0.1, 0, 0.95, true);
  doorAt(parts, 0.1, D / 2 - 0.02, 0, 0x4a3320);
  windowAt(parts, -0.15, 0.22, D / 2 - 0.02, 0, true, 0.85);
  logAt(parts, -W / 2 - 0.08, 0.04, D / 2 - 0.05, 0.2);
  logAt(parts, -W / 2 - 0.08, 0.08, D / 2 - 0.05, -0.1);
  void r;
  return { parts, smoke: [[W * 0.22, 0.04 + wh + 0.1 + 0.28, 0]], radius: 0.5, height: 0.7 };
}

export function buildGranary(r: Rng): Built {
  const parts: Parts = [];
  const W = 0.64;
  const D = 0.52;
  const lift = 0.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(parts, cyl(0.045, 0.04, lift, 8, 0.1), 'stone@9a9484', sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06));
  }
  add(parts, box(W + 0.04, 0.03, D + 0.04, 0.3), 'timber', 0, lift, 0);
  add(parts, box(W, 0.36, D, 0.3), 'wood@a8814f', 0, lift + 0.03, 0);
  for (const x of [-W / 2 + 0.02, 0, W / 2 - 0.02]) vbeam(parts, x, lift + 0.03, D / 2 + 0.005, 0.36);
  add(parts, gableRoof(W, D, 0.3, 0.09, 0.04), 'thatch', 0, lift + 0.39, 0);
  for (const sx of [-1, 1]) add(parts, gableEnd(D, 0.3, 0.02), 'wood@a8814f', sx * (W / 2 - 0.01), lift + 0.39, 0, Math.PI / 2);
  // a loading door and a ladder
  add(parts, box(0.18, 0.22, 0.02, 0.2), 'timber', 0.0, lift + 0.07, D / 2 + 0.005);
  beam(parts, 0.3, 0, D / 2 + 0.14, 0.2, lift + 0.2, D / 2 + 0.02, 'wood@7a5a3a');
  beam(parts, 0.37, 0, D / 2 + 0.14, 0.27, lift + 0.2, D / 2 + 0.02, 'wood@7a5a3a');
  for (let i = 0; i < 4; i++) add(parts, box(0.07, 0.012, 0.012, 0.1), 'wood@7a5a3a', 0.285, 0.04 + i * 0.045, D / 2 + 0.11 - i * 0.025);
  sackAt(parts, -0.25, 0, D / 2 + 0.12);
  sackAt(parts, -0.33, 0, D / 2 + 0.08);
  sackAt(parts, -0.29, 0.07, D / 2 + 0.1);
  barrelAt(parts, 0.45, 0, -D / 2 - 0.05);
  void r;
  return { parts, radius: 0.55, height: 0.9 };
}

export function buildHall(r: Rng): Built {
  const parts: Parts = [];
  const W = 1.5;
  const D = 0.72;
  const wh = 0.42;
  add(parts, box(W + 0.06, 0.12, D + 0.06, 0.4), 'stone', 0, -0.08, 0);
  add(parts, box(W, wh, D, 0.5), 'plaster@efe3c8', 0, 0.04, 0);
  // exposed timber: posts every third of a metre along the front, a sill and a wall plate
  for (let i = 0; i <= 6; i++) vbeam(parts, -W / 2 + 0.02 + i * ((W - 0.04) / 6), 0.04, D / 2 + 0.004, wh);
  add(parts, box(W, 0.025, 0.02, 0.2), 'timber', 0, 0.04 + wh - 0.02, D / 2 + 0.004);
  add(parts, gableRoof(W, D, 0.4, 0.09, 0.04), 'roofTile@c8794f', 0, 0.04 + wh, 0);
  for (const sx of [-1, 1]) add(parts, gableEnd(D, 0.4, 0.02), 'plaster@efe3c8', sx * (W / 2 - 0.01), 0.04 + wh, 0, Math.PI / 2);
  // a cross gable over the entrance
  add(parts, box(0.42, wh * 0.9, 0.14, 0.4), 'plaster@efe3c8', 0, 0.04, D / 2 + 0.07);
  add(parts, gableRoof(0.14, 0.42, 0.22, 0.05), 'roofTile@c8794f', 0, 0.04 + wh * 0.9, D / 2 + 0.07, Math.PI / 2);
  doorAt(parts, 0, D / 2 + 0.14, 0, 0x4a3a2a, true);
  add(parts, box(0.26, 0.04, 0.26, 0.3), 'stone', 0, 0, D / 2 + 0.25);
  windowAt(parts, -0.46, 0.27, D / 2, 0, true, 1.1);
  windowAt(parts, 0.46, 0.27, D / 2, 0, true, 1.1);
  windowAt(parts, -0.7, 0.27, D / 2, 0, false, 1.0);
  windowAt(parts, 0.7, 0.27, D / 2, 0, false, 1.0);
  chimneyAt(parts, -W * 0.34, 0.04 + wh + 0.18, 0, 1.2);
  chimneyAt(parts, W * 0.3, 0.04 + wh + 0.18, 0, 1.2);
  // a flag on a pole at one gable
  add(parts, box(0.015, 0.52, 0.015, 0.1), 'timber', W / 2 - 0.05, 0.04 + wh + 0.25, 0.0);
  add(parts, box(0.01, 0.1, 0.18, 0.2), 'cloth@c0392b', W / 2 - 0.05, 0.04 + wh + 0.52, 0.09);
  barrelAt(parts, 0.62, 0.04, D / 2 + 0.07);
  crateAt(parts, 0.72, 0.04, D / 2 + 0.07, 0.2);
  void r;
  return { parts, smoke: [[-W * 0.34, 0.04 + wh + 0.18 + 0.36, 0], [W * 0.3, 0.04 + wh + 0.18 + 0.36, 0]], radius: 0.9, height: 1.0 };
}

export function buildChapel(r: Rng): Built {
  const parts: Parts = [];
  const W = 0.62;
  const D = 0.9;
  const wh = 0.48;
  add(parts, box(W + 0.06, 0.12, D + 0.06, 0.4), 'stone@8e887a', 0, -0.08, 0);
  add(parts, box(W, wh, D, 0.4), 'stone@c8c0ac', 0, 0.04, 0);
  add(parts, gableRoof(D, W, 0.34, 0.08, 0.04), 'roofSlate', 0, 0.04 + wh, 0, Math.PI / 2);
  add(parts, gableEnd(W, 0.34, 0.02), 'stone@c8c0ac', 0, 0.04 + wh, D / 2 - 0.01, 0);
  add(parts, gableEnd(W, 0.34, 0.02), 'stone@c8c0ac', 0, 0.04 + wh, -D / 2 + 0.01, Math.PI);
  // a bell turret on the ridge
  add(parts, box(0.15, 0.2, 0.15, 0.3), 'stone@c8c0ac', 0, 0.04 + wh + 0.28, -D * 0.25);
  add(parts, hipRoof(0.15, 0.15, 0.18, 0.03, 0, 0.2), 'roofSlate', 0, 0.04 + wh + 0.48, -D * 0.25);
  add(parts, box(0.07, 0.1, 0.02, 0.1), 'iron', 0, 0.04 + wh + 0.34, -D * 0.25 + 0.076);
  add(parts, box(0.012, 0.1, 0.012, 0.1), 'iron', 0, 0.04 + wh + 0.66, -D * 0.25);
  add(parts, box(0.07, 0.012, 0.012, 0.1), 'iron', 0, 0.04 + wh + 0.7, -D * 0.25);
  // the porch: a pointed doorway and a stone step
  add(parts, box(0.3, 0.3, 0.1, 0.3), 'stone@bdb5a1', 0, 0.04, D / 2 + 0.05);
  add(parts, gableRoof(0.1, 0.3, 0.14, 0.04, 0.03), 'roofSlate', 0, 0.34, D / 2 + 0.05, Math.PI / 2);
  doorAt(parts, 0, D / 2 + 0.1, 0, 0x3b2a1e);
  // tall lancet windows with a little coloured glass
  for (const z of [-0.2, 0.15]) {
    for (const sx of [-1, 1]) {
      add(parts, box(0.02, 0.2, 0.07, 0.1), 'timber', sx * (W / 2 + 0.002), 0.2, z);
      add(parts, box(0.012, 0.18, 0.055, 0.1), 'glassLit', sx * (W / 2 + 0.008), 0.21, z);
    }
  }
  void r;
  return { parts, radius: 0.6, height: 1.2 };
}

// ----------------------------------------------------------------------------------------------------------------------------
// what is left of a building the flood or the fire took: broken walls, a few charred beams, rubble
// ----------------------------------------------------------------------------------------------------------------------------
export function buildRuin(r: Rng, burned: boolean): Built {
  const parts: Parts = [];
  const wallMat = burned ? 'plaster@6a6258' : 'plaster@cfc3a8';
  add(parts, box(0.86, 0.08, 0.62, 0.4), 'stone@8e887a', 0, -0.05, 0);
  // stubs of wall of different heights
  const stubs: [number, number, number, number, number][] = [[-0.38, 0, 0.05, 0.3, 0.5], [0.0, 0.28, 0.2, 0.05, 0.1], [0.36, 0.0, 0.05, 0.22, 0.52], [-0.1, -0.28, 0.5, 0.05, 0.16]];
  for (const [x, z, w, d, h] of stubs) add(parts, box(w, h * (0.6 + r() * 0.8), d, 0.5), wallMat, x, 0.03, z);
  for (let i = 0; i < 5; i++) beam(parts, -0.3 + r() * 0.6, 0.06, -0.2 + r() * 0.4, -0.3 + r() * 0.6, 0.18 + r() * 0.2, -0.2 + r() * 0.4, burned ? 'coal' : 'timber');
  for (let i = 0; i < 10; i++) stoneAt(parts, -0.45 + r() * 0.9, 0.03, -0.35 + r() * 0.7, 0.7 + r() * 0.8);
  if (burned) add(parts, box(0.7, 0.01, 0.5, 0.3), 'coal', 0, 0.03, 0);
  return { parts, radius: 0.55, height: 0.35 };
}
