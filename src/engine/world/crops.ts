import { emit, type Ctx } from '../core/events.ts';
import { clamp } from '../core/rng.ts';
import type { Landmark, RunState, Villager } from '../core/types.ts';
import type { Modifiers } from '../laws/effects.ts';
import { workersAt } from './economy.ts';

/**
 * Crop growth for drought-style scenarios. Each field has growth 0..100 and moisture 0..100.
 * Every night moisture falls with the heat and rises with rain (including rain called by a law); growth follows moisture.
 * A ripe field is harvested by the people working it the next day.
 */
export function isCropScenario(s: RunState): boolean {
  return !!s.scn.features.crops;
}

export function fields(s: RunState): Landmark[] {
  return s.world.landmarks.filter((l) => l.kind === 'field');
}

export function moistureFactor(m: number): number {
  return 0.25 + (m / 100) * 1.1;
}

export function projectedGrowth(s: RunState, f: Landmark, boost = 0): number {
  const base = s.scn.consts.growBase ?? 5;
  return Math.round(base * moistureFactor(f.data.moisture ?? 0) + boost);
}

export function runCrops(ctx: Ctx, mods: Modifiers): void {
  const s = ctx.s;
  const th = s.threat[Math.min(s.day, s.threat.length) - 1];
  const heat = th?.level ?? 3;
  const rain = th?.rain ?? 0;
  const dry = s.scn.consts.dryRate ?? 5;
  for (const f of fields(s)) {
    if (f.data.harvested || f.data.ruined) continue;
    const region = f.district;
    const regionRain = rain + (mods.rainBonus[region] ?? 0);
    const m0 = f.data.moisture ?? 0;
    const m1 = clamp(m0 - heat * dry + regionRain * 22, 0, 100);
    f.data.moisture = m1;
    const boost = mods.cropBoost[region] ?? 0;
    const g0 = f.data.growth ?? 0;
    let gain = projectedGrowth(s, f, boost);
    if (m1 <= 8) gain -= 2;
    f.data.growth = clamp(g0 + gain, 0, 100);
    if (f.data.growth >= 100 && !f.data.ripe) {
      f.data.ripe = 1;
      emit(ctx, { step: 'hazard', code: 'FIELD_RIPE', importance: 2, tile: [f.x, f.y], text: `${f.name} is ripe. It can be harvested tomorrow.` });
    } else if (boost > 0 && gain > 0) {
      emit(ctx, { step: 'hazard', code: 'CROP_BOOSTED', importance: 0, tile: [f.x, f.y], text: `${f.name} ripens by moonlight: +${gain} (moisture ${Math.round(m1)}).` });
    }
    if (m1 <= 8 && m0 > 8) emit(ctx, { step: 'hazard', code: 'FIELD_PARCHED', importance: 1, tile: [f.x, f.y], text: `${f.name} is parched. The crop stops growing.` });
  }
  // night labour under a moonlight-style law drains workers who keep it
  for (const [region, drain] of Object.entries(mods.laborDrain)) {
    if (drain <= 0) continue;
    let tired = 0;
    for (const v of s.villagers) {
      if (v.status === 'dead' || v.district !== region) continue;
      const w = fields(s).some((f) => f.id === v.workId);
      const believes = Object.values(v.beliefs).some((b) => b.conv >= 30);
      if (!w || !believes) continue;
      v.energy = clamp(v.energy - drain, 0, 100);
      v.health = clamp(v.health - 3, 0, 100);
      tired++;
    }
    if (tired) emit(ctx, { step: 'hazard', code: 'NIGHT_LABOR', importance: 1, text: `${tired} field workers labour by moonlight and wake exhausted.` });
  }
}

/** Daytime: ripe fields with workers are harvested into the granary. */
export function runCropHarvest(ctx: Ctx): number {
  const s = ctx.s;
  let produced = 0;
  for (const f of fields(s)) {
    if (!f.data.ripe || f.data.harvested || f.data.ruined) continue;
    const workers = workersAt(s, f.id);
    if (workers.length === 0) continue;
    const full = f.data.yield ?? 6;
    const got = Math.round(full * (workers.length >= 2 ? 1 : 0.7));
    f.data.harvested = 1;
    produced += got;
    emit(ctx, { step: 'needs', code: 'HARVEST', importance: 2, tile: [f.x, f.y], text: `${workers.map((w) => w.name.split(' ')[0]).join(' and ')} bring in ${f.name}: +${got} food.` });
  }
  s.world.stocks.food = (s.world.stocks.food ?? 0) + produced;
  s.flags.harvestedToday = produced;
  return produced;
}

export function fieldSummary(s: RunState): { ripe: number; total: number; avgGrowth: number; avgMoisture: number } {
  const fs = fields(s).filter((f) => !f.data.ruined);
  if (!fs.length) return { ripe: 0, total: 0, avgGrowth: 0, avgMoisture: 0 };
  return {
    ripe: fs.filter((f) => f.data.ripe).length,
    total: fs.length,
    avgGrowth: Math.round(fs.reduce((a, f) => a + (f.data.growth ?? 0), 0) / fs.length),
    avgMoisture: Math.round(fs.reduce((a, f) => a + (f.data.moisture ?? 0), 0) / fs.length),
  };
}

export type { Villager };
