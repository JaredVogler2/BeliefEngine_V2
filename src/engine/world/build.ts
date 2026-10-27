import type { Landmark, LandmarkKind, RegionDef, WorldState } from '../core/types.ts';
import { hashKeys } from '../core/rng.ts';
import { T, type TerrainName } from './grid.ts';

export type Rect = [number, number, number, number];

export type MapOp =
  | { op: 'terrain'; rect: Rect; t: TerrainName }
  | { op: 'elev'; rect: Rect; v: number }
  | { op: 'grad'; rect: Rect; axis: 'x' | 'y'; from: number; to: number }
  | { op: 'bump'; cx: number; cy: number; r: number; h: number }
  | { op: 'noise'; rect: Rect; amp: number; salt: number };

export interface LandmarkDef {
  id: string;
  kind: LandmarkKind;
  name: string;
  x: number;
  y: number;
  hp?: number;
  capacity?: number;
  tiles?: [number, number][];
  data?: Record<string, number>;
  lit?: boolean;
  fuelNights?: number;
}

export interface MapDef {
  w: number;
  h: number;
  ops: MapOp[];
  regions: RegionDef[];
  landmarks: LandmarkDef[];
  stocks: Record<string, number>;
  packs?: { id: string; x: number; y: number; size: number }[];
}

const rectEach = (r: Rect, fn: (x: number, y: number) => void) => {
  for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) fn(x, y);
};

/** Build a WorldState from declarative map ops. Fully deterministic (hash-based noise). */
export function buildWorld(def: MapDef): WorldState {
  const n = def.w * def.h;
  const terrain = new Array<number>(n).fill(T.GRASS);
  const elev = new Array<number>(n).fill(1);
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < def.w && y < def.h;
  for (const op of def.ops) {
    switch (op.op) {
      case 'terrain':
        rectEach(op.rect, (x, y) => inb(x, y) && (terrain[y * def.w + x] = T[op.t]));
        break;
      case 'elev':
        rectEach(op.rect, (x, y) => inb(x, y) && (elev[y * def.w + x] = op.v));
        break;
      case 'grad': {
        const [x0, y0, x1, y1] = op.rect;
        rectEach(op.rect, (x, y) => {
          if (!inb(x, y)) return;
          const t = op.axis === 'x' ? (x1 === x0 ? 0 : (x - x0) / (x1 - x0)) : y1 === y0 ? 0 : (y - y0) / (y1 - y0);
          elev[y * def.w + x] = Math.round(op.from + (op.to - op.from) * t);
        });
        break;
      }
      case 'bump':
        for (let y = op.cy - op.r; y <= op.cy + op.r; y++)
          for (let x = op.cx - op.r; x <= op.cx + op.r; x++) {
            if (!inb(x, y)) continue;
            const d = Math.hypot(x - op.cx, y - op.cy);
            if (d <= op.r) elev[y * def.w + x] += Math.round(op.h * (1 - d / (op.r + 0.001)));
          }
        break;
      case 'noise':
        rectEach(op.rect, (x, y) => {
          if (!inb(x, y)) return;
          const r = hashKeys(op.salt, 'elevnoise', x, y) / 4294967296;
          const d = Math.round((r - 0.5) * 2 * op.amp);
          elev[y * def.w + x] = Math.max(0, elev[y * def.w + x] + d);
        });
        break;
    }
  }
  const region = new Array<number>(n).fill(-1);
  def.regions.forEach((r, ri) => {
    for (const rect of r.rects) rectEach(rect, (x, y) => inb(x, y) && region[y * def.w + x] < 0 && (region[y * def.w + x] = ri));
  });
  const world: WorldState = {
    w: def.w,
    h: def.h,
    terrain,
    elev,
    region,
    regions: def.regions.map((r) => ({ ...r, rects: r.rects.map((q) => [...q] as Rect) })),
    water: new Array<number>(n).fill(0),
    fire: new Array<number>(n).fill(0),
    burned: new Array<number>(n).fill(0),
    smoke: new Array<number>(n).fill(0),
    landmarks: [],
    stocks: { ...def.stocks },
    level: 0,
    packs: (def.packs ?? []).map((p) => ({ id: p.id, x: p.x, y: p.y, size: p.size, hunger: 40, target: null, lastKill: -9 })),
  };
  for (const l of def.landmarks) {
    const ri = region[l.y * def.w + l.x];
    const lm: Landmark = {
      id: l.id,
      kind: l.kind,
      name: l.name,
      x: l.x,
      y: l.y,
      district: ri >= 0 ? def.regions[ri].id : '',
      hp: l.hp ?? defaultHp(l.kind),
      maxHp: l.hp ?? defaultHp(l.kind),
      lit: l.lit ?? false,
      fuelNights: l.fuelNights ?? 0,
      capacity: l.capacity ?? 0,
      tiles: l.tiles ? l.tiles.map((t) => [t[0], t[1]] as [number, number]) : [[l.x, l.y]],
      data: { ...(l.data ?? {}) },
    };
    world.landmarks.push(lm);
  }
  return world;
}

function defaultHp(kind: LandmarkKind): number {
  switch (kind) {
    case 'home':
      return 100;
    case 'bridge':
      return 100;
    case 'mill':
    case 'hall':
    case 'chapel':
    case 'granary':
      return 120;
    case 'belltower':
      return 150;
    default:
      return 100;
  }
}
