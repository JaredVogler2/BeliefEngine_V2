import type { RunState, WorldState } from '../core/types.ts';
import { DIRS4, T, idx, inBounds } from './grid.ts';

/**
 * Passability for people. The river blocks unless a bridge deck stands; deep floodwater and raging fire block;
 * rock blocks. Everything else is walkable. Computed from state each time it is needed (cheap on small maps).
 */
export function passableMask(world: WorldState, opts: { useWater?: boolean } = {}): Uint8Array {
  const m = new Uint8Array(world.w * world.h);
  for (let i = 0; i < m.length; i++) {
    const t = world.terrain[i];
    let ok = t !== T.RIVER && t !== T.ROCK;
    if (ok && opts.useWater && world.water[i] >= 2) ok = false;
    if (ok && world.fire[i] >= 2) ok = false;
    m[i] = ok ? 1 : 0;
  }
  for (const l of world.landmarks) {
    if (l.kind === 'bridge' && l.hp > 0) for (const [x, y] of l.tiles) m[y * world.w + x] = 1;
  }
  return m;
}

export interface Reach {
  dist: Int16Array;
  /** component label per tile (-1 impassable) */
  comp: Int16Array;
}

/** Connected components of the passable mask. */
export function components(world: WorldState, mask: Uint8Array): Int16Array {
  const comp = new Int16Array(world.w * world.h).fill(-1);
  let c = 0;
  const stack: number[] = [];
  for (let i = 0; i < comp.length; i++) {
    if (!mask[i] || comp[i] >= 0) continue;
    comp[i] = c;
    stack.push(i);
    while (stack.length) {
      const cur = stack.pop()!;
      const x = cur % world.w;
      const y = (cur - x) / world.w;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(world, nx, ny)) continue;
        const ni = ny * world.w + nx;
        if (mask[ni] && comp[ni] < 0) {
          comp[ni] = c;
          stack.push(ni);
        }
      }
    }
    c++;
  }
  return comp;
}

/** BFS walking distance from a source tile over a passable mask (-1 unreachable). */
export function bfsDist(world: WorldState, mask: Uint8Array, sx: number, sy: number, maxSteps = 999): Int16Array {
  const d = new Int16Array(world.w * world.h).fill(-1);
  if (!inBounds(world, sx, sy)) return d;
  const q: number[] = [idx(world, sx, sy)];
  d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    if (d[cur] >= maxSteps) continue;
    const x = cur % world.w;
    const y = (cur - x) / world.w;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(world, nx, ny)) continue;
      const ni = ny * world.w + nx;
      if (!mask[ni] && !(nx === sx && ny === sy)) continue;
      if (d[ni] >= 0) continue;
      d[ni] = d[cur] + 1;
      q.push(ni);
    }
  }
  return d;
}

/** Whether two points can reach each other today. Start/end tiles on impassable terrain use nearest passable neighbour. */
export function connected(world: WorldState, comp: Int16Array, ax: number, ay: number, bx: number, by: number): boolean {
  const ca = compAt(world, comp, ax, ay);
  const cb = compAt(world, comp, bx, by);
  return ca >= 0 && ca === cb;
}

function compAt(world: WorldState, comp: Int16Array, x: number, y: number): number {
  if (!inBounds(world, x, y)) return -1;
  const c = comp[idx(world, x, y)];
  if (c >= 0) return c;
  for (const [dx, dy] of DIRS4) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(world, nx, ny) && comp[idx(world, nx, ny)] >= 0) return comp[idx(world, nx, ny)];
  }
  return -1;
}

export function bridgeStanding(s: RunState): boolean {
  return s.world.landmarks.some((l) => l.kind === 'bridge' && l.hp > 0);
}
