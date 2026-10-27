import { emit, type Ctx } from '../core/events.ts';
import { rand } from '../core/rng.ts';
import type { Landmark, RunState } from '../core/types.ts';
import type { Modifiers } from '../laws/effects.ts';
import { DIRS4, DIRS8, T, idx, inBounds } from './grid.ts';

export function landmarkAtTile(s: RunState, x: number, y: number): Landmark | undefined {
  return s.world.landmarks.find((l) => l.tiles.some((t) => t[0] === x && t[1] === y));
}

/** Flammable: crops that are standing, forest, and houses (thatch). Water and ash do not burn. */
export function flammable(s: RunState, x: number, y: number): boolean {
  const w = s.world;
  if (!inBounds(w, x, y)) return false;
  const i = idx(w, x, y);
  if (w.water[i] > 0 || w.burned[i] || w.fire[i] > 0) return false;
  const t = w.terrain[i];
  if (t === T.FOREST) return true;
  const lm = landmarkAtTile(s, x, y);
  if (lm && lm.kind === 'field' && !lm.data.ruined) return true;
  if (lm && (lm.kind === 'home' || lm.kind === 'cabin') && lm.hp > 0) return true;
  return false;
}

function regionOfTile(s: RunState, x: number, y: number): string {
  const r = s.world.region[idx(s.world, x, y)];
  return r >= 0 ? s.world.regions[r].id : '';
}

/**
 * Night fire step. Lit beacons/campfires may ignite adjacent fuel; existing fires spread, burn for three
 * nights, then become ash. Floodwater extinguishes. Probabilities are shown to the player as risk.
 */
export function runFire(ctx: Ctx, mods: Modifiers): void {
  const s = ctx.s;
  const w = s.world;
  const base = (s.scn.consts.fireBase ?? 10) / 100;
  const windMult = 1 + 0.15 * ((s.threat[s.day - 1]?.wind ?? 1) - 1);
  // existing fires: extinguish by water, spread, age
  const nextFire = w.fire.slice();
  const spreadFrom: number[] = [];
  for (let i = 0; i < w.fire.length; i++) {
    if (w.fire[i] > 0) {
      if (w.water[i] > 0) {
        nextFire[i] = 0;
        continue;
      }
      spreadFrom.push(i);
    }
  }
  for (const i of spreadFrom) {
    const x = i % w.w;
    const y = (i - x) / w.w;
    const sm = mods.spreadMult[regionOfTile(s, x, y)] ?? 1;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!flammable(s, nx, ny)) continue;
      const ni = idx(w, nx, ny);
      if (nextFire[ni] > 0) continue;
      const p = 0.3 * windMult * sm;
      const hit = ctx.expect ? false : rand(s.seed, 'spread', s.day, i, ni) < p;
      if (hit) {
        nextFire[ni] = 1;
        emit(ctx, { step: 'hazard', code: 'FIRE_SPREAD', importance: 1, tile: [nx, ny], text: `Fire spreads to (${nx},${ny}).` });
      }
    }
  }
  for (const i of spreadFrom) {
    if (w.fire[i] >= 3) {
      nextFire[i] = 0;
      w.burned[i] = 1;
    } else nextFire[i] = Math.max(nextFire[i], w.fire[i] + 1);
  }
  w.fire = nextFire;
  // new ignitions from lit fires
  for (const lm of w.landmarks) {
    if (!(lm.kind === 'beacon' || lm.kind === 'campfire') || !lm.lit || lm.fuelNights <= 0) continue;
    const mult = mods.ignitionMult[lm.district] ?? 1;
    for (const [dx, dy] of DIRS8) {
      const nx = lm.x + dx;
      const ny = lm.y + dy;
      if (!flammable(s, nx, ny)) continue;
      const ni = idx(w, nx, ny);
      if (w.fire[ni] > 0) continue;
      const p = base * mult * windMult;
      const hit = ctx.expect ? false : rand(s.seed, 'ignite', s.day, lm.id, ni) < p;
      if (hit) {
        w.fire[ni] = 1;
        const target = landmarkAtTile(s, nx, ny);
        emit(ctx, {
          step: 'hazard', code: 'FIRE_STARTED', importance: 2, tile: [nx, ny], reason: 'BEACON_SPARK',
          text: `Sparks from ${lm.name} ignite ${target ? target.name : 'dry ground'}${mult > 1.4 ? ' (the law made the fire bold)' : ''}.`,
        });
      }
    }
  }
}

/** Ignition probability per flammable neighbour, for UI risk display. */
export function ignitionRisk(s: RunState, mult = 1): number {
  const base = (s.scn.consts.fireBase ?? 10) / 100;
  const windMult = 1 + 0.15 * ((s.threat[s.day - 1]?.wind ?? 1) - 1);
  return Math.min(0.95, base * mult * windMult);
}
