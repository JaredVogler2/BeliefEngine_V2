import type { RunState } from './types.ts';

/**
 * Copy a RunState so that mutating the copy can never leak into the original.
 *
 * Shared by reference because nothing mutates them after the run is created:
 *  - `scn`: the static scenario definition;
 *  - `world.terrain`, `world.elev`, `world.region`, `world.regions`: the immutable map;
 *  - the individual event objects in `log` (events are never edited once emitted; only the array grows or is compacted).
 * Everything else is deep-copied. This is the hot path of every action preview, bot probe and forecast, so it is a hand-written
 * copy of plain JSON data (numbers, strings, booleans, null, arrays, plain objects) rather than structuredClone.
 */
export function cloneState(s: RunState): RunState {
  const { scn, log, world, ...rest } = s;
  const { terrain, elev, region, regions, ...wrest } = world;
  const copy = deepCopy({ ...rest, world: wrest }) as unknown as Omit<RunState, 'scn' | 'log' | 'world'> & { world: Omit<RunState['world'], 'terrain' | 'elev' | 'region' | 'regions'> };
  return { ...copy, world: { ...copy.world, terrain, elev, region, regions }, log: log.slice(), scn };
}

export function deepCopy<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const n = v.length;
    if (n === 0) return [] as unknown as T;
    const first = v[0];
    if (typeof first === 'number' || typeof first === 'string' || typeof first === 'boolean') {
      // arrays of primitives (tile grids, id lists) copy in one go
      let flat = true;
      for (let i = 1; i < n; i++) {
        const t = typeof v[i];
        if (t === 'object' && v[i] !== null) {
          flat = false;
          break;
        }
      }
      if (flat) return v.slice() as unknown as T;
    }
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = deepCopy(v[i]);
    return out as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in v as Record<string, unknown>) out[k] = deepCopy((v as Record<string, unknown>)[k]);
  return out as T;
}
