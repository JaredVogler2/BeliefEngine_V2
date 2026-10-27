import type { Outcome, RunState } from './types.ts';
import { aliveCount, homesStanding } from '../world/economy.ts';
import { medalFor, type Evaluation } from './objectives.ts';
import { DRAFT_BONUS, pledgeMultiplier } from '../progress/options.ts';

export const DIFF_MULT = { story: 0.8, normal: 1, hard: 1.25 } as const;
/** Influence a run may spend per day before the efficiency bonus starts to shrink. */
export const EFFICIENCY_PAR_PER_DAY = 2;
export const TWIST_BONUS = 0.1;

export interface ScoreParts {
  /** category points (before multipliers); each is a measurement of the end state or a distinct strategic act */
  breakdown: Record<string, number>;
  multiplier: number;
  /** human-readable multiplier parts */
  multipliers: { label: string; value: number }[];
}

/**
 * Readable, normalised, stable. Base points add up to about 1000 for a flawless run:
 *   survivors 500 (dominant) + households 100 + essentials 100 + infrastructure 50 + harmony 70 + efficiency 60 (victory only)
 *   + laws 80 (two distinct laws) + heroic 100.
 * Then multiplied by difficulty and by any pledges, draft or twists the player chose. Nothing rewards doing nothing: efficiency
 * is only paid on victory and never exceeds 6% of the total, and there is no bonus for unspent Influence or for ending early.
 */
export function computeScore(s: RunState, heroic: boolean, victory: boolean): ScoreParts {
  const total = s.villagers.length;
  const alive = aliveCount(s);
  const living = s.villagers.filter((v) => v.status !== 'dead');
  const homes = s.world.landmarks.filter((l) => l.kind === 'home');
  const pens = s.world.landmarks.filter((l) => l.kind === 'pen');
  const fields = s.world.landmarks.filter((l) => l.kind === 'field');
  const bridge = s.world.landmarks.find((l) => l.kind === 'bridge');
  const food = Math.min(12, s.world.stocks.food ?? 0) / 12;
  const stockMax = pens.reduce((a, l) => a + (l.data.stockMax ?? l.data.stock ?? 0), 0);
  const livestock = stockMax ? pens.reduce((a, l) => a + (l.data.stock ?? 0), 0) / stockMax : null;
  const fed = s.scn.features.crops ? living.filter((v) => v.hunger < 60).length / Math.max(1, total) : null;
  const essentialParts = [food, ...(livestock !== null ? [livestock] : []), ...(fed !== null ? [fed] : [])];
  const infra: number[] = [];
  if (bridge) infra.push(Math.max(0, bridge.hp) / Math.max(1, bridge.maxHp));
  if (fields.length) infra.push(fields.filter((f) => !f.data.ruined && !f.data.burned).length / fields.length);
  const trust = living.length ? living.reduce((a, v) => a + v.keeperTrust, 0) / living.length : 0;
  const par = EFFICIENCY_PAR_PER_DAY * s.maxDay;
  const breakdown: Record<string, number> = {
    survivors: Math.round((500 * alive) / Math.max(1, total)),
    households: homes.length ? Math.round((100 * homesStanding(s)) / homes.length) : 0,
    essentials: Math.round((100 * essentialParts.reduce((a, b) => a + b, 0)) / essentialParts.length),
    infrastructure: infra.length ? Math.round((50 * infra.reduce((a, b) => a + b, 0)) / infra.length) : 0,
    harmony: Math.round(trust * 0.7),
    efficiency: victory ? Math.max(0, Math.min(60, 60 - 3 * Math.max(0, s.stats.apSpent - par))) : 0,
    laws: Math.min(2, new Set(s.stats.lawsActivated.map((l) => l.split('@')[0])).size) * 40,
    heroic: heroic ? 100 : 0,
  };
  const multipliers: ScoreParts['multipliers'] = [{ label: `difficulty (${s.difficulty})`, value: DIFF_MULT[s.difficulty] }];
  const pledge = pledgeMultiplier(s.modifiers);
  if (pledge > 1) multipliers.push({ label: 'pledges kept', value: pledge });
  if (s.flags.drafted) multipliers.push({ label: 'drafted stories', value: 1 + DRAFT_BONUS });
  if (s.flags.twisted) multipliers.push({ label: 'chosen twists', value: 1 + Math.min(0.3, TWIST_BONUS * s.flags.twisted) });
  const multiplier = multipliers.reduce((a, m) => a * m.value, 1);
  return { breakdown, multiplier: Math.round(multiplier * 1000) / 1000, multipliers };
}

export function buildOutcome(s: RunState, ev: Evaluation): Outcome {
  const result = ev.result ?? 'defeat';
  const parts = computeScore(s, ev.heroic, result === 'victory');
  const raw = Object.values(parts.breakdown).reduce((a, b) => a + b, 0);
  return {
    result,
    day: s.day,
    reason: ev.reason,
    heroic: ev.heroic,
    score: Math.round(raw * parts.multiplier),
    breakdown: parts.breakdown,
    multiplier: parts.multiplier,
    medal: medalFor(result, ev.heroic, raw),
    failedObjectives: ev.failed,
  };
}
