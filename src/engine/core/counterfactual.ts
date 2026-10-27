import { policyById } from '../ai/bots/generic.ts';
import { optionsFromState } from '../progress/options.ts';
import { describeAction } from './actions.ts';
import { cloneState } from './clone.ts';
import { replayRun } from './replay.ts';
import { GameSession } from './session.ts';
import type { Action, RunState } from './types.ts';
import { aliveCount, homesStanding } from '../world/economy.ts';

/**
 * "What would have changed it?" For a lost run, rewind to the start of each planning day with the player's own earlier choices
 * intact, let a few simple plans (the same public-API bots the tournament uses) play from there on the same seed, and report
 * the days from which a different plan wins. The claim is deliberately narrow and checkable: *a computer-played continuation
 * that starts differently on that day survived*. It is hindsight (the night's dice are the real ones) and it is bounded by the
 * plans tried: finding nothing does not prove the run was unwinnable.
 */
export interface Alternative {
  /** planning day on which the alternative starts to differ from what the player did */
  day: number;
  /** the plan that played on from that day */
  plan: string;
  /** what the player did that day */
  yours: string[];
  /** what the winning continuation did that day */
  instead: string[];
  alive: number;
  homes: number;
  /** the complete action log (the player's earlier days, then the alternative) that replays to the victory */
  log: Action[];
}

export interface Counterfactual {
  /** the last planning day from which a different plan still wins: the point of no return is the day after */
  latest: Alternative | null;
  /** the earliest day from which a different plan wins */
  earliest: Alternative | null;
  /** plans tried, and how many rollouts were played to find the answer */
  plans: string[];
  rollouts: number;
}

export interface SearchProgress {
  rollouts: number;
  planned: number;
}

/** The plans tried, with what each one means to a player. Order matters: the first to win is the one reported. */
export const PLANS: { id: string; label: string }[] = [
  { id: 'evidence-first', label: 'proof first: demonstrations on calm nights, and talking to the doubters' },
  { id: 'threat-aware', label: 'a story chosen to fit the danger, with Influence held back for the forecast' },
  { id: 'greedy', label: 'one story pressed hard, with direct tellings' },
];

/** The player's own accepted actions for the days before `day`, with the night markers a replay needs. */
function playedBefore(final: RunState, day: number): Action[] {
  const out: Action[] = [];
  for (const h of final.history) {
    if (h.day >= day) break;
    out.push(...h.actions, { type: 'END_DAY' });
  }
  return out;
}

const trim = (xs: string[]): string[] => (xs.length > 4 ? [...xs.slice(0, 4), `and ${xs.length - 4} more`] : xs);

/**
 * Incremental search: yields after every simulated day so a caller (the browser) can interleave other work; `findCounterfactual`
 * drains it. Pure and deterministic: the same lost run always gives the same answer.
 */
export function* searchCounterfactual(final: RunState, planIds: string[] = PLANS.map((p) => p.id)): Generator<SearchProgress, Counterfactual> {
  const lastDay = final.history.length;
  const options = optionsFromState(final);
  const progress: SearchProgress = { rollouts: 0, planned: lastDay * planIds.length };
  const result: Counterfactual = { latest: null, earliest: null, plans: planIds.map((id) => PLANS.find((p) => p.id === id)?.label ?? id), rollouts: 0 };
  if (final.outcome?.result !== 'defeat' || lastDay === 0) return result;

  function* tryDay(day: number): Generator<SearchProgress, Alternative | null> {
    const earlier = playedBefore(final, day);
    const base = replayRun({ ...options, actions: earlier }).state;
    for (const id of planIds) {
      const g = new GameSession(cloneState(base));
      const policy = policyById(id);
      let guard = 0;
      let firstDay: Action[] | null = null;
      while (!g.state.outcome && guard++ < 60) {
        policy.playDay(g);
        if (firstDay === null) firstDay = g.log.filter((a) => a.type !== 'END_DAY');
        progress.rollouts++;
        result.rollouts = progress.rollouts;
        yield { ...progress };
      }
      if (g.state.outcome?.result === 'victory') {
        const yours = (final.history.find((h) => h.day === day)?.actions ?? []).map((a) => describeAction(base, a));
        return {
          day,
          plan: PLANS.find((p) => p.id === id)?.label ?? id,
          yours: trim(yours),
          instead: trim((firstDay ?? []).map((a) => describeAction(base, a))),
          alive: aliveCount(g.state),
          homes: homesStanding(g.state),
          log: [...earlier, ...g.log],
        };
      }
    }
    return null;
  }

  // the latest day first: late rollouts are short, and "you could still have saved it on day N" is the most useful sentence
  for (let day = lastDay; day >= 1 && !result.latest; day--) {
    const alt = yield* tryDay(day);
    if (alt) result.latest = alt;
  }
  if (result.latest) {
    for (let day = 1; day < result.latest.day && !result.earliest; day++) {
      const alt = yield* tryDay(day);
      if (alt) result.earliest = alt;
    }
  }
  if (result.latest && !result.earliest) result.earliest = result.latest;
  return result;
}

export function findCounterfactual(final: RunState, planIds?: string[]): Counterfactual {
  const it = searchCounterfactual(final, planIds);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
