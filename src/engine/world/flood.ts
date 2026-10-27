import type { WorldState } from '../core/types.ts';
import { DIRS4, T } from './grid.ts';

/**
 * Bounded flood fill. A dry tile floods when the river level exceeds its effective elevation (terrain plus any
 * law shield) AND floodwater can reach it through connected flooded tiles. Shields therefore redirect the
 * flow around protected ground instead of deleting water. Depth is level minus effective elevation.
 */
export function computeWater(world: WorldState, level: number, shield: number[] | null): number[] {
  const n = world.w * world.h;
  const depth = new Array<number>(n).fill(0);
  if (level <= 0) return depth;
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (world.terrain[i] === T.RIVER) {
      depth[i] = level;
      queue.push(i);
    }
  }
  for (let h = 0; h < queue.length; h++) {
    const cur = queue[h];
    const x = cur % world.w;
    const y = (cur - x) / world.w;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) continue;
      const ni = ny * world.w + nx;
      if (depth[ni] > 0) continue;
      const eff = world.elev[ni] + (shield ? shield[ni] : 0);
      if (level > eff) {
        depth[ni] = level - eff;
        queue.push(ni);
      }
    }
  }
  return depth;
}
