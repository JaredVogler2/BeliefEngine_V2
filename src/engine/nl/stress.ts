import { cloneState } from '../core/clone.ts';
import { hashKeys } from '../core/rng.ts';
import { resolveDay } from '../core/resolve.ts';
import type { ClaimDef, RunState } from '../core/types.ts';
import { computeModifiers } from '../laws/effects.ts';

/** Add a claim and its laws to a run, exactly as the Compose Belief action does. */
export function installClaim(s: RunState, def: ClaimDef): void {
  s.claims.push({ id: def.id, available: def.unlockDay === undefined || s.day >= def.unlockDay, introduced: false, introducedDay: null, def });
  for (const r of def.regions)
    s.laws.push({
      id: `${def.id}@${r}`, claimId: def.id, regionId: r, status: 'dormant', progress: 0, pressure: 0, strength: 0,
      supporters: [], opponents: [], topShare: 0, activatedDay: null, changedDay: s.day, note: 'Nobody has heard of it yet.', activeNights: 0,
    });
}

export interface StressReport {
  nights: number;
  /** nothing impossible happened: finite numbers, no new villagers, no resource from nothing */
  invariantsOk: boolean;
  /** with every source it needs present, the law really is powered (an impossible trigger is caught here) */
  powered: boolean;
  /** what differed from the same village without the belief, in the simulated nights (empty: no hazard tested it) */
  changed: string[];
  problems: string[];
}

const NIGHTS = 3;

function metrics(s: RunState): Record<string, number> {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const lm = s.world.landmarks;
  return {
    'people alive': s.villagers.filter((v) => v.status !== 'dead').length,
    'people sick': s.villagers.filter((v) => v.status === 'sick').length,
    'homes standing': lm.filter((l) => l.kind === 'home' && l.hp > 0).length,
    'flooded ground': sum(s.world.water.map((w) => (w > 0 ? 1 : 0))),
    'fire on the ground': sum(s.world.fire.map((f) => (f > 0 ? 1 : 0))),
    'burned ground': sum(s.world.burned),
    'bridge strength': sum(lm.filter((l) => l.kind === 'bridge').map((l) => l.hp)),
    'crop growth': Math.round(sum(lm.filter((l) => l.kind === 'field').map((l) => l.data.growth ?? 0))),
    'animals': sum(lm.filter((l) => l.kind === 'pen').map((l) => l.data.stock ?? 0)),
    'food in store': s.world.stocks.food ?? 0,
    'wolf positions': sum(s.world.packs.map((p) => p.x * 31 + p.y)),
    'villager health': Math.round(sum(s.villagers.map((v) => v.health))),
  };
}

/** Give a village every source a belief could be powered by, so the test measures the belief and not the player's luck. */
function powerEverything(s: RunState): void {
  for (const l of s.world.landmarks) {
    if ((l.kind === 'beacon' || l.kind === 'campfire') && l.hp > 0) {
      l.lit = true;
      l.fuelNights = Math.max(l.fuelNights, 3);
      if (l.kind === 'campfire') l.data.keep = 1;
    }
    if (l.kind === 'belltower') l.data.ringing = 1;
    if (l.kind === 'field') l.data.moonlit = 1;
    if (l.kind === 'bridge' && l.hp > 0) l.data.watchers = 4;
  }
  s.world.stocks.fuel = Math.max(s.world.stocks.fuel ?? 0, 6);
  s.flags.vigilDay = s.day;
}

/**
 * A cheap deterministic counterfactual. The belief is installed in a copy of the village, forced to be law with everyone
 * believing and every source present; the same village without it is the control; both play three nights with nobody acting.
 * The dice are those of a different, derived seed, so the test cannot reveal what will really happen to the player's village.
 */
export function stressTest(s: RunState, def: ClaimDef): StressReport {
  const problems: string[] = [];
  const seed = hashKeys(s.seed, 'compose-stress') | 0;
  let sim = cloneState(s);
  let ctl = cloneState(s);
  sim.seed = seed;
  ctl.seed = seed;
  // test through the worst night the village faces, so a protective belief has something to protect against
  const worst = s.threat.reduce((m, t, i) => (Math.max(t.level, t.pack, t.heat) > Math.max(s.threat[m].level, s.threat[m].pack, s.threat[m].heat) ? i : m), 0);
  const start = Math.max(s.day, Math.min(worst + 1, s.maxDay - NIGHTS + 1));
  sim.day = start;
  ctl.day = start;
  if (sim.starter === null) sim.starter = sim.scn.starters[0];
  if (ctl.starter === null) ctl.starter = ctl.scn.starters[0];
  if (!sim.claims.some((c) => c.id === def.id)) installClaim(sim, def);
  for (const v of sim.villagers) v.beliefs[def.id] = { conv: 90, heard: 5, lastDay: sim.day, lastSource: 'keeper', evidence: 20, cause: null, stale: 0 };
  for (const l of sim.laws.filter((x) => x.claimId === def.id)) {
    l.status = 'active';
    l.progress = 100;
    l.pressure = 1;
    l.strength = 1;
  }
  powerEverything(sim);
  powerEverything(ctl);
  const initial = sim.villagers.length;
  const mods = computeModifiers(sim);
  const powered = sim.laws.filter((l) => l.claimId === def.id).some((l) => (mods.sourcesByLaw[l.id] ?? 0) > 0);
  if (!powered) problems.push('even with every source present nothing powers it');

  const changed = new Set<string>();
  let invariantsOk = true;
  const finite = (n: number) => Number.isFinite(n);
  for (let night = 0; night < NIGHTS; night++) {
    if (sim.outcome || ctl.outcome) break;
    try {
      sim = resolveDay(sim).state;
      ctl = resolveDay(ctl).state;
    } catch (e) {
      invariantsOk = false;
      problems.push(`the engine failed while testing it: ${e instanceof Error ? e.message : 'unknown'}`);
      break;
    }
    powerEverything(sim);
    powerEverything(ctl);
    const a = metrics(sim);
    const b = metrics(ctl);
    for (const k of Object.keys(a)) if (a[k] !== b[k]) changed.add(k);
    if (!Object.values(a).every(finite) || !Object.values(sim.world.stocks).every((x) => finite(x) && x >= 0 && x <= 2000)) {
      invariantsOk = false;
      problems.push('a number left its bounds');
    }
    if (sim.villagers.length !== initial) {
      invariantsOk = false;
      problems.push('the number of villagers changed');
    }
    if ((sim.world.stocks.food ?? 0) > (ctl.world.stocks.food ?? 0) + 40) {
      invariantsOk = false;
      problems.push('it produced food from nothing');
    }
    if (a['people alive'] > b['people alive'] + initial) invariantsOk = false;
  }
  return { nights: NIGHTS, invariantsOk, powered, changed: [...changed].filter((k) => k !== 'wolf positions' && k !== 'villager health'), problems };
}
