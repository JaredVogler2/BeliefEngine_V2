import { GameSession } from '../../core/session.ts';
import type { CreateRunOptions } from '../../core/types.ts';
import { aliveCount, homesStanding } from '../../world/economy.ts';
import type { BotRunResult, Policy } from './types.ts';

/** Play a full run with a policy. Hard cap protects against any policy that fails to end days. */
export function runPolicy(policy: Policy, opts: CreateRunOptions, maxDays = 60): BotRunResult {
  const g = GameSession.create(opts);
  let guard = 0;
  while (!g.state.outcome && guard++ < maxDays) policy.playDay(g);
  const s = g.state;
  return {
    policy: policy.name,
    seed: opts.seed,
    scenarioId: opts.scenarioId,
    result: s.outcome ? s.outcome.result : 'timeout',
    day: s.day,
    score: s.outcome?.score ?? 0,
    alive: aliveCount(s),
    homes: homesStanding(s),
    food: s.world.stocks.food ?? 0,
    apSpent: s.stats.apSpent,
    lawsActivated: s.stats.lawsActivated.slice(),
    actions: s.stats.actions,
    log: g.log.slice(),
  };
}
