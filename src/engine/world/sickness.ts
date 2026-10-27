import { emit, type Ctx } from '../core/events.ts';
import { clamp } from '../core/rng.ts';
import type { RunState } from '../core/types.ts';
import type { Modifiers } from '../laws/effects.ts';
import { DIRS4, idx, inBounds } from './grid.ts';

/** Smoke density per tile from lit campfires (radius 2, thinning outward). Stored on the world for rendering and fog. */
export function updateSmoke(s: RunState): void {
  const w = s.world;
  w.smoke = w.smoke.map(() => 0);
  for (const l of w.landmarks) {
    if (l.kind !== 'campfire' || !l.lit || l.fuelNights <= 0) continue;
    for (let y = l.y - 2; y <= l.y + 2; y++)
      for (let x = l.x - 2; x <= l.x + 2; x++) {
        if (!inBounds(w, x, y)) continue;
        const d = Math.abs(x - l.x) + Math.abs(y - l.y);
        if (d > 3) continue;
        const v = d <= 1 ? 3 : d === 2 ? 2 : 1;
        const i = idx(w, x, y);
        w.smoke[i] = Math.max(w.smoke[i], v);
      }
  }
}

/**
 * Smoke and cold harm lungs. People standing in smoke lose health; below 45 they fall sick and cannot work.
 * Open-door style laws reduce the sickness chance (sickMult) in their region.
 */
export function runSickness(ctx: Ctx, mods: Modifiers): void {
  const s = ctx.s;
  const w = s.world;
  updateSmoke(s);
  let newlySick = 0;
  for (const v of s.villagers) {
    if (v.status === 'dead') continue;
    const smoke = inBounds(w, v.x, v.y) ? w.smoke[idx(w, v.x, v.y)] : 0;
    const lung = mods.smokeLungs.some((q) => Math.abs(q.x - v.x) + Math.abs(q.y - v.y) <= q.r);
    let dmg = 0;
    if (smoke >= 2) dmg += 6;
    else if (smoke === 1 && lung) dmg += 3;
    else if (lung) dmg += 2;
    if (dmg > 0) {
      dmg = Math.round(dmg * (mods.sickMult[v.district] ?? 1));
      v.health = clamp(v.health - dmg, 0, 100);
      if (v.health < 45 && v.status === 'ok') {
        v.status = 'sick';
        newlySick++;
      }
    }
  }
  // open doors let the cold in: the weak (children, elders, anyone already run down) lose a little health each night
  let coldSick = 0;
  for (const v of s.villagers) {
    const drain = mods.coldDrain[v.district] ?? 0;
    if (v.status === 'dead' || drain <= 0) continue;
    if (v.health < 75 || v.archetype === 'child' || v.archetype === 'elder') {
      v.health = clamp(v.health - drain, 0, 100);
      if (v.health < 45 && v.status === 'ok') {
        v.status = 'sick';
        coldSick++;
      }
    }
  }
  if (coldSick) emit(ctx, { step: 'hazard', code: 'COLD_SICKNESS', importance: 2, text: `${coldSick} villager${coldSick === 1 ? '' : 's'} fall sick from the cold the open doors let in. They cannot work tomorrow.` });
  if (newlySick) emit(ctx, { step: 'hazard', code: 'SMOKE_SICKNESS', importance: 2, text: `${newlySick} villager${newlySick === 1 ? '' : 's'} fall sick from the smoke. They cannot work tomorrow.` });
}

/** Smoke thickens fog on paths: people standing in dense smoke talk less. */
export function fogFactor(s: RunState, ax: number, ay: number, bx: number, by: number): number {
  const w = s.world;
  const a = inBounds(w, ax, ay) ? w.smoke[idx(w, ax, ay)] : 0;
  const b = inBounds(w, bx, by) ? w.smoke[idx(w, bx, by)] : 0;
  return a >= 2 || b >= 2 ? 0.7 : 1;
}

export function sickCount(s: RunState): number {
  return s.villagers.filter((v) => v.status === 'sick').length;
}

export { DIRS4 };
