import { brokerRoute, lawPusher, lightBeaconsByCoverage, lightFiresForThreat } from '../ai/bots/lawpusher.ts';
import { noop } from '../ai/bots/basic.ts';
import type { Policy } from '../ai/bots/types.ts';
import { runPolicy } from '../ai/bots/run.ts';
import type { ScenarioDef } from '../content/types.ts';
import type { Action, CreateRunOptions, RunState } from '../core/types.ts';
import { expeditionId } from './expedition.ts';
import type { Blueprint } from './blueprint.ts';

/**
 * Constructive witnesses: scripted-but-adaptive planners that use only the public action API. A village is "witnessed" when at
 * least one of them wins it. This is evidence of solvability, not a proof, and a village that no policy wins is reported as
 * unwitnessed rather than hidden.
 */
export function witnessPolicies(bp: Blueprint, def: ScenarioDef): Policy[] {
  const D = def.runtime.durationDays;
  const has = (c: string) => def.runtime.claimDefs.some((x) => x.id === c);
  const out: Policy[] = [];
  if (bp.biome === 'river') {
    if (has('river_fears_fire'))
      out.push(lawPusher({
        name: 'fire-wall', claim: 'river_fears_fire', regions: ['east'],
        reserve: (s) => (s.day >= D - 2 ? Math.min(s.ap, 4) : 0),
        physical: (g) => {
          if (g.state.day >= D - 2) lightBeaconsByCoverage(g, 'east', 5);
        },
      }));
    if (has('bridge_stands_watched')) out.push(lawPusher({ name: 'witness-bridge', claim: 'bridge_stands_watched', regions: ['river'] }));
    if (has('rain_heeds_bells'))
      out.push(lawPusher({
        name: 'bell-ringer', claim: 'rain_heeds_bells', regions: ['river'],
        reserve: (s) => (s.day >= D - 3 ? Math.min(s.ap, 1) : 0),
        physical: (g) => {
          if (g.state.day >= D - 3 && g.state.ap >= 1) g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: 'bell' });
        },
      }));
  } else if (bp.biome === 'drought') {
    out.push(lawPusher({ name: 'moonlight', claim: 'moonlight_ripens_grain', regions: ['valley'] }));
    if (def.runtime.deals?.length)
      out.push(brokerRoute({ name: 'caravans', claims: ['moonlight_ripens_grain', 'rain_follows_bells'], broker: def.runtime.deals[0].broker, deal: def.runtime.deals[0].id }));
    out.push(lawPusher({
      name: 'rain-bells', claim: 'rain_follows_bells', regions: ['valley'],
      physical: (g) => {
        if (g.state.day >= 4 && g.state.ap >= 1) g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: 'bell' });
      },
    }));
  } else {
    // proof by fire costs fuel: only stage it at a fire that also guards a pen, and never spend the last of the store on it
    const guardsPen = (s: RunState, a: Action) => {
      if (a.type !== 'RITUAL' || !a.claim) return true;
      const f = s.world.landmarks.find((l) => l.id === a.landmark);
      return (s.world.stocks.fuel ?? 0) >= 5 && !!f && s.world.landmarks.some((l) => l.kind === 'pen' && Math.abs(l.x - f.x) + Math.abs(l.y - f.y) <= 4);
    };
    out.push(lawPusher({
      name: 'smoke-ring', claim: 'wolves_fear_smoke', regions: ['north', 'mill', 'ash'], reserve: (s) => (s.day >= 3 ? Math.min(s.ap, 2) : 0), allow: guardsPen,
      physical: (g) => lightFiresForThreat(g, 'ring'),
    }));
    out.push(lawPusher({
      name: 'decoy', claim: 'wolves_follow_smoke', regions: ['wild'], reserve: (s) => (s.day >= 2 ? Math.min(s.ap, 2) : 0), allow: (s, a) => a.type !== 'RITUAL' || !a.claim || (s.world.stocks.fuel ?? 0) >= 5,
      physical: (g) => lightFiresForThreat(g, 'decoy'),
    }));
  }
  return out;
}

export interface WitnessResult {
  seed: number;
  id: string;
  biome: string;
  noopResult: string;
  /** every policy that won, in order tried */
  wins: string[];
  tried: string[];
  results: { policy: string; result: string; score: number; alive: number }[];
}

/** Run the no-op baseline and every witness policy on one village. Deterministic. */
export function verifyExpedition(seed: number, bp: Blueprint, def: ScenarioDef, opts: Partial<CreateRunOptions> = {}, stopAtFirstWin = false): WitnessResult {
  const id = expeditionId(seed, opts.modifiers ?? null);
  const base: CreateRunOptions = { scenarioId: id, seed, difficulty: 'normal', ...opts };
  const noopRun = runPolicy(noop, base);
  const results: WitnessResult['results'] = [];
  const wins: string[] = [];
  const policies = witnessPolicies(bp, def);
  for (const p of policies) {
    const r = runPolicy(p, base);
    results.push({ policy: p.name, result: r.result, score: r.score, alive: r.alive });
    if (r.result === 'victory') {
      wins.push(p.name);
      if (stopAtFirstWin) break;
    }
  }
  return { seed, id, biome: bp.biome, noopResult: noopRun.result, wins, tried: policies.map((p) => p.name), results };
}
