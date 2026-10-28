import { box, cyl, sphere } from './geom.ts';
import { add, fence, logAt, type Parts } from './kit.ts';
import type { Rng } from './rand.ts';

/**
 * The clutter of a lived-in yard, placed at the edge of each home's trodden earth: a woodpile with its chopping block, a hand cart, a
 * washing line with the week's linen, a fenced kitchen garden. Pure dressing, built into the foliage layer's merged meshes (a few draw
 * calls for the whole village), and kept off roads, water, fields and buildings by the same occupancy grid the trees use.
 */

// templates, cloned on use
const WHEEL = cyl(0.07, 0.07, 0.022, 12, 0.1).rotateX(Math.PI / 2).translate(0, 0.07, 0);
const HUB = cyl(0.018, 0.018, 0.04, 6, 0.1).rotateX(Math.PI / 2).translate(0, 0.07, 0);
const POST = box(0.022, 0.32, 0.022, 0.1);
const LINE = box(0.5, 0.006, 0.006, 0.1);
const SHEET = box(0.085, 0.11, 0.006, 0.1);
const BED = box(0.34, 0.035, 0.2, 0.2);
const SIDE = box(0.34, 0.06, 0.016, 0.2);
const SHAFT = box(0.3, 0.016, 0.016, 0.1);
const PLOT = box(0.44, 0.022, 0.32, 0.3);
const HEAD = sphere(0.032, 7, 5, 0.75);
const BLOCK = cyl(0.045, 0.05, 0.07, 9, 0.1);

const LINEN = ['white', 'cloth@6b8cb8', 'cloth@c0574b', 'cloth@d9b44a', 'white', 'cloth@8aa06a'];

export type YardProp = 'woodpile' | 'cart' | 'washing' | 'garden';
export const YARD_PROPS: YardProp[] = ['woodpile', 'cart', 'washing', 'garden'];

/** footprint radius of each prop, for the occupancy grid */
export const PROP_RADIUS: Record<YardProp, number> = { woodpile: 0.17, cart: 0.24, washing: 0.28, garden: 0.27 };

/** build one prop at (x, y, z) facing `ry`, in world space */
export function yardProp(parts: Parts, kind: YardProp, x: number, y: number, z: number, ry: number, r: Rng): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  // local (u along the prop, v across it) to world
  const at = (u: number, v: number): [number, number] => [x + c * u + s * v, z - s * u + c * v];
  switch (kind) {
    case 'woodpile': {
      // split logs stacked three, two, one, and the block they were split on
      [3, 2, 1].forEach((n, k) => {
        for (let i = 0; i < n; i++) {
          const [px, pz] = at(0, (i - (n - 1) / 2) * 0.052);
          logAt(parts, px, y + k * 0.044, pz, ry);
        }
      });
      const [bx, bz] = at(0.04, 0.17);
      add(parts, BLOCK, 'wood@8a6440', bx, y, bz);
      break;
    }
    case 'cart': {
      const [cx, cz] = at(0, 0);
      add(parts, BED, 'wood@7a5a3a', cx, y + 0.1, cz, ry);
      for (const v of [-0.1, 0.1]) {
        const [sx, sz] = at(0, v);
        add(parts, SIDE, 'wood@6e4e32', sx, y + 0.13, sz, ry);
        const [wx, wz] = at(-0.03, v * 1.18);
        add(parts, WHEEL, 'wood@5a4028', wx, y, wz, ry);
        add(parts, HUB, 'iron', wx, y, wz, ry);
        // the shafts rest on the ground in front
        const [hx, hz] = at(0.3, v * 0.55);
        add(parts, SHAFT, 'wood@6e4e32', hx, y + 0.06, hz, ry, 1, 1, 1, 0, -0.32);
      }
      // a sack or two in the bed
      if (r() < 0.7) {
        const [kx, kz] = at(-0.05, 0.02);
        add(parts, sphere(0.05, 8, 6, 0.8), 'sack', kx, y + 0.16, kz);
      }
      break;
    }
    case 'washing': {
      for (const u of [-0.24, 0.24]) {
        const [px, pz] = at(u, 0);
        add(parts, POST, 'wood@6e4e32', px, y, pz, ry);
      }
      const [lx, lz] = at(0, 0);
      add(parts, LINE, 'rope', lx, y + 0.29, lz, ry);
      const n = 3 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const u = -0.16 + (i * 0.32) / (n - 1);
        const [px, pz] = at(u, 0);
        add(parts, SHEET, LINEN[Math.floor(r() * LINEN.length)], px, y + 0.18 - r() * 0.02, pz, ry, 1, 0.8 + r() * 0.5, 1);
      }
      break;
    }
    case 'garden': {
      const [gx, gz] = at(0, 0);
      add(parts, PLOT, 'dirt', gx, y - 0.005, gz, ry);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          const [px, pz] = at(-0.15 + i * 0.1, -0.09 + j * 0.09);
          add(parts, HEAD, j === 1 && i % 2 ? 'leaf@a3b84f' : 'leaf', px, y + 0.01, pz, r() * 6);
        }
      }
      // a knee-high fence on three sides, open towards the house
      const corner = (u: number, v: number): [number, number] => at(u, v);
      const [ax, az] = corner(-0.24, -0.18);
      const [bx, bz] = corner(0.24, -0.18);
      const [cx2, cz2] = corner(0.24, 0.18);
      const [dx, dz] = corner(-0.24, 0.18);
      fence(parts, ax, az, bx, bz, y, 0.08, 'wood@9a7a52');
      fence(parts, bx, bz, cx2, cz2, y, 0.08, 'wood@9a7a52');
      fence(parts, cx2, cz2, dx, dz, y, 0.08, 'wood@9a7a52');
      break;
    }
  }
}

/** a direction for a prop that sits at angle `a` round a house: along the house's side, so it reads as placed, not dropped */
export function propFacing(a: number): number {
  return -a + Math.PI / 2;
}
