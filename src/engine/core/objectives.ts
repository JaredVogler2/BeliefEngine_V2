import type { ObjectiveDef, Outcome, RunState } from './types.ts';
import { aliveCount, homesStanding } from '../world/economy.ts';

export function metricValue(s: RunState, metric: ObjectiveDef['metric']): number {
  switch (metric) {
    case 'alive':
      return aliveCount(s);
    case 'homes':
      return homesStanding(s);
    case 'food':
      return s.world.stocks.food ?? 0;
    case 'fed':
      return s.villagers.filter((v) => v.status !== 'dead' && v.hunger < 60).length;
    case 'livestock':
      return s.world.landmarks.filter((l) => l.kind === 'pen').reduce((a, l) => a + (l.data.stock ?? 0), 0);
    case 'trust':
      return Math.round(s.villagers.filter((v) => v.status !== 'dead').reduce((a, v) => a + v.keeperTrust, 0) / Math.max(1, aliveCount(s)));
    case 'fields':
      return s.world.landmarks.filter((l) => l.kind === 'field' && !l.data.ruined).length;
    case 'bridge':
      return s.world.landmarks.some((l) => l.kind === 'bridge' && l.hp > 0) ? 1 : 0;
    case 'legit':
      return s.flags.legitimacy ?? 0;
    case 'sick':
      return s.villagers.filter((v) => v.status === 'sick').length;
  }
}

export interface ObjectiveStatus {
  id: string;
  label: string;
  current: number;
  target: number;
  met: boolean;
  required: boolean;
  heroic: boolean;
}

export function objectiveStatuses(s: RunState): ObjectiveStatus[] {
  return s.scn.objectives
    .filter((o) => !o.instantLoss)
    .map((o) => {
      const cur = metricValue(s, o.metric);
      const met = o.op === '>=' ? cur >= o.value : cur <= o.value;
      return { id: o.id, label: o.label, current: cur, target: o.value, met, required: o.required, heroic: !!o.heroic };
    });
}

export interface Evaluation {
  over: boolean;
  result: 'victory' | 'defeat' | null;
  reason: string;
  failed: string[];
  heroic: boolean;
}

/** End-of-day evaluation. Instant-loss objectives end the run immediately; otherwise judged on the final day. */
export function evaluate(s: RunState): Evaluation {
  for (const o of s.scn.objectives) {
    if (!o.instantLoss) continue;
    const cur = metricValue(s, o.metric);
    const ok = o.op === '>=' ? cur >= o.value : cur <= o.value;
    if (!ok) return { over: true, result: 'defeat', reason: `${o.label} — failed (${cur}).`, failed: [o.id], heroic: false };
  }
  if (s.day < s.maxDay) return { over: false, result: null, reason: '', failed: [], heroic: false };
  const failed: string[] = [];
  let heroic = true;
  let hasHeroic = false;
  for (const o of s.scn.objectives) {
    if (o.instantLoss) continue;
    const cur = metricValue(s, o.metric);
    const ok = o.op === '>=' ? cur >= o.value : cur <= o.value;
    if (o.heroic) {
      hasHeroic = true;
      if (!ok) heroic = false;
    } else if (o.required && !ok) failed.push(o.id);
  }
  if (hasHeroic && s.scn.id === 'redbank') heroic = heroic && metricValue(s, 'bridge') === 1;
  if (failed.length === 0) return { over: true, result: 'victory', reason: 'The village endures.', failed, heroic: hasHeroic && heroic };
  const labels = failed.map((id) => s.scn.objectives.find((o) => o.id === id)?.label ?? id);
  return { over: true, result: 'defeat', reason: `Day ${s.maxDay} ended with unmet goals: ${labels.join('; ')}.`, failed, heroic: false };
}

/** `raw` is the base-point total before multipliers, so medals mean the same on every difficulty. */
export function medalFor(result: 'victory' | 'defeat', heroic: boolean, raw: number): Outcome['medal'] {
  if (result !== 'victory') return 'none';
  if (heroic) return 'gold';
  return raw >= 800 ? 'silver' : 'bronze';
}
