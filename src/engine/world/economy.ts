import { emit, type Ctx } from '../core/events.ts';
import { findLandmark } from '../core/lookup.ts';
import { clamp, hashString } from '../core/rng.ts';
import type { RunState, Villager } from '../core/types.ts';
import { idx } from './grid.ts';

export function aliveCount(s: RunState): number {
  return s.villagers.filter((v) => v.status !== 'dead').length;
}

export function homesStanding(s: RunState): number {
  return s.world.landmarks.filter((l) => l.kind === 'home' && l.hp > 0).length;
}

export function dailyConsumption(s: RunState): number {
  return Math.ceil(aliveCount(s) / 4);
}

/** Workers at a field today: living, working, rested people whose workplace is the field. */
export function workersAt(s: RunState, fieldId: string): Villager[] {
  return s.villagers.filter((v) => v.status !== 'dead' && v.workId === fieldId && v.duty === 'work' && v.energy >= 25);
}

/** Expected food production tomorrow (for forecasts). */
export function projectedProduction(s: RunState): number {
  let total = 0;
  for (const l of s.world.landmarks) {
    if (l.kind !== 'field' || l.data.ruined) continue;
    if (workersAt(s, l.id).length > 0) total += l.data.yield ?? 1;
  }
  return total;
}

/** Daytime: standing, worked fields yield food into the store (simple scenarios; crop scenarios override). */
export function runHarvest(ctx: Ctx): number {
  const s = ctx.s;
  if (s.scn.features.crops) return 0;
  let produced = 0;
  for (const l of s.world.landmarks) {
    if (l.kind !== 'field' || l.data.ruined) continue;
    if (workersAt(s, l.id).length > 0) produced += l.data.yield ?? 1;
  }
  s.world.stocks.food = (s.world.stocks.food ?? 0) + produced;
  s.flags.harvestedToday = produced;
  return produced;
}

/** Daytime: woodcutters who actually worked today bring in the fuel that is counted at dawn. */
export function countWoodcutters(ctx: Ctx): void {
  const s = ctx.s;
  if (!(s.scn.consts.fuelPerDay > 0)) return;
  s.flags.cuttersToday = s.villagers.filter((v) => v.status !== 'dead' && v.role.toLowerCase().includes('woodcutter') && v.duty === 'work' && v.energy >= 25).length;
}

/** Dawn bookkeeping: eating, fear, recovery. */
export function runDawnNeeds(ctx: Ctx): void {
  const s = ctx.s;
  const stocks = s.world.stocks;
  const eat = dailyConsumption(s);
  const produced = s.flags.harvestedToday ?? 0;
  const have = stocks.food ?? 0;
  stocks.food = Math.max(0, have - eat);
  if (have - eat < 0) {
    // each unit feeds four people; children and elders eat first, workers last
    const order = s.villagers
      .filter((v) => v.status !== 'dead')
      .sort((a, b) => (a.archetype === 'child' || a.archetype === 'elder' ? 0 : 1) - (b.archetype === 'child' || b.archetype === 'elder' ? 0 : 1) || (a.id < b.id ? -1 : 1));
    const fed = Math.min(order.length, have * 4);
    order.forEach((v, i) => {
      v.hunger = clamp(v.hunger + (i < fed ? -10 : 22 + (hashString(v.id) % 9)), 0, 100);
    });
    emit(ctx, { step: 'needs', code: 'FAMINE', importance: 3, text: have <= 0 ? 'The granary is empty. The village goes hungry.' : `The granary is nearly empty: only ${fed} of ${order.length} people eat their fill.` });
  } else {
    for (const v of s.villagers) if (v.status !== 'dead') v.hunger = clamp(v.hunger - 15, 0, 100);
  }
  const fpd = s.scn.consts.fuelPerDay ?? 0;
  if (fpd > 0) {
    const gain = Math.min(fpd, s.flags.cuttersToday ?? 0);
    if (gain > 0) stocks.fuel = (stocks.fuel ?? 0) + gain;
  }
  emit(ctx, {
    step: 'needs', code: 'FOOD', importance: 1, delta: { food: [have - produced, stocks.food] },
    text: `Food: +${produced} harvested, \u2212${eat} eaten \u2192 ${stocks.food} in store.`,
  });
  for (const v of s.villagers) {
    if (v.status === 'dead') continue;
    if (v.hunger >= 100) {
      v.status = 'dead';
      v.health = 0;
      v.deathDay = s.day;
      v.deathCause = 'starved';
      emit(ctx, { step: 'needs', code: 'DEATH', importance: 3, target: v.id, reason: 'STARVED', text: `${v.name} starved. The granary was empty too long.` });
      continue;
    }
    v.energy = clamp(v.energy + 30, 0, 100);
    if ((v.status === 'injured' || v.status === 'sick') && v.health >= 60) v.status = 'ok';
    v.health = clamp(v.health + 8, 0, 100);
    v.fear = clamp(Math.round(v.fear * 0.6 + dangerNext(s, v) * 22), 0, 100);
  }
}

/** How scary the next two nights look from this villager's home (0..3). */
function dangerNext(s: RunState, v: Villager): number {
  const home = findLandmark(s, v.homeId);
  if (!home || !s.scn.features.flood) return 0;
  let worst = 0;
  for (let k = 0; k < 2; k++) {
    const th = s.threat[Math.min(s.day, s.threat.length - 1) + k];
    if (!th) continue;
    const depth = Math.max(0, th.level - s.world.elev[idx(s.world, home.x, home.y)]);
    worst = Math.max(worst, depth);
  }
  const g = Math.min(3, worst);
  const lostKin = s.villagers.some((o) => o.household === v.household && o.status === 'dead') ? 1 : 0;
  return g + lostKin;
}

/** Caravans agreed earlier arrive if the road is open; a blocked road delays them. */
export function runDeliveries(ctx: Ctx): void {
  const s = ctx.s;
  for (let k = 0; k < 12; k++) {
    const key = `caravan:${k}`;
    const due = s.flags[key];
    if (due === undefined || due > s.day) continue;
    const food = s.flags[`caravanFood:${k}`] ?? 0;
    const via = s.flags[`caravanVia:${k}`] ?? 0;
    void via;
    const blocked = s.world.landmarks.some((l) => l.kind === 'road' && (l.data.blockedUntil ?? -1) >= s.day);
    if (blocked) {
      if (!s.flags[`caravanWarned:${k}`]) {
        s.flags[`caravanWarned:${k}`] = 1;
        emit(ctx, { step: 'dawn', code: 'CARAVAN_DELAYED', importance: 3, text: 'The grain caravan is stuck behind the mudslide. It will come when the road is clear.' });
      }
      continue;
    }
    delete s.flags[key];
    delete s.flags[`caravanFood:${k}`];
    delete s.flags[`caravanWarned:${k}`];
    s.world.stocks.food = (s.world.stocks.food ?? 0) + food;
    s.stats.tradeDeals += 1;
    emit(ctx, { step: 'dawn', code: 'CARAVAN_ARRIVES', importance: 3, text: `The grain caravan arrives: +${food} food.` });
  }
}
