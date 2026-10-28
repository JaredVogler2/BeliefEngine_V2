import type { Ctx } from '../core/events.ts';
import { findVillager } from '../core/lookup.ts';
import { applyChoice, resolveTests, validateChoice } from './decide.ts';
import { makeNpcClaims } from './claims.ts';
import type { Episode } from './types.ts';
import { choose } from './policy.ts';

/**
 * Dusk: every villager due to think acts once, in id order: the decision a model proposed and the game accepted, or the game's
 * own policy. Then today's queue is spent.
 */
export function runMinds(ctx: Ctx, fresh: Map<string, Episode[]> = new Map()): void {
  const minds = ctx.s.v2?.minds;
  if (!minds) return;
  resolveTests(ctx, fresh);
  makeNpcClaims(ctx);
  minds.last = [];
  for (const q of [...minds.queue].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const v = findVillager(ctx.s, q.id);
    if (!v || v.status === 'dead' || v.duty === 'trapped') continue;
    const accepted = minds.decided[q.id];
    const c = accepted && validateChoice(ctx.s, accepted).ok ? accepted : choose(ctx.s, q);
    applyChoice(ctx, c);
    minds.last.push(c);
  }
  minds.queue = [];
  minds.decided = {};
}

