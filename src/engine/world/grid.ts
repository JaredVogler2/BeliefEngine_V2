import type { Landmark, RunState, WorldState } from '../core/types.ts';

export const T = { GRASS: 0, RIVER: 1, FIELD: 2, HILL: 3, FOREST: 4, ROAD: 5, ROCK: 6, MARSH: 7, SAND: 8 } as const;
export type TerrainName = keyof typeof T;
export const TERRAIN_NAMES: Record<number, string> = {
  0: 'grass', 1: 'river', 2: 'field', 3: 'hill', 4: 'forest', 5: 'road', 6: 'rock', 7: 'marsh', 8: 'sand',
};

export const idx = (w: WorldState, x: number, y: number): number => y * w.w + x;
export const inBounds = (w: WorldState, x: number, y: number): boolean => x >= 0 && y >= 0 && x < w.w && y < w.h;
export const xyOf = (w: WorldState, i: number): [number, number] => [i % w.w, Math.floor(i / w.w)];

export const DIRS4: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const DIRS8: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function cheb(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function landmarkById(w: WorldState, id: string): Landmark | undefined {
  return w.landmarks.find((l) => l.id === id);
}

export function landmarksOf(w: WorldState, kind: string): Landmark[] {
  return w.landmarks.filter((l) => l.kind === kind);
}

export function regionIndex(w: WorldState, id: string): number {
  return w.regions.findIndex((r) => r.id === id);
}

export function regionAt(w: WorldState, x: number, y: number): string {
  if (!inBounds(w, x, y)) return '';
  const r = w.region[idx(w, x, y)];
  return r >= 0 ? w.regions[r].id : '';
}

/** All tiles belonging to a region id. */
export function regionTiles(w: WorldState, id: string): number[] {
  const ri = regionIndex(w, id);
  const out: number[] = [];
  if (ri < 0) return out;
  for (let i = 0; i < w.region.length; i++) if (w.region[i] === ri) out.push(i);
  return out;
}

export function isAlive(s: RunState, id: string): boolean {
  const v = s.villagers.find((x) => x.id === id);
  return !!v && v.status !== 'dead';
}
