import { GameSession } from './session.ts';
import { hashValue } from './hash.ts';
import type { Action, CreateRunOptions, RunState } from './types.ts';

export interface ReplayLog extends CreateRunOptions {
  actions: Action[];
}

export interface ReplayResult {
  state: RunState;
  stateHash: string;
  eventHash: string;
  rejected: { index: number; code: string }[];
}

export function stateHash(s: RunState): string {
  // the static scenario block is covered by scenarioId+version; hash the dynamic run state
  const { scn: _scn, ...rest } = s;
  return hashValue(rest);
}

export function eventHash(s: RunState): string {
  return hashValue(s.log);
}

/** Re-run a recorded action list from scratch. Same seed + same actions => same hashes. */
export function replayRun(log: ReplayLog): ReplayResult {
  const session = GameSession.create(log);
  const rejected: ReplayResult['rejected'] = [];
  for (let i = 0; i < log.actions.length; i++) {
    const a = log.actions[i];
    if (session.state.outcome) break;
    const r = session.act(a);
    if (!r.ok) rejected.push({ index: i, code: r.error.code });
  }
  return { state: session.state, stateHash: stateHash(session.state), eventHash: eventHash(session.state), rejected };
}
