import type { EventStep, GameEvent, RunState } from './types.ts';

const LOG_CAP = 3000;

export interface Ctx {
  s: RunState;
  /** events produced during this operation */
  events: GameEvent[];
  /** expectation mode: no randomness, probabilities become weights (used for forecasts) */
  expect: boolean;
}

export type EventInput = {
  step: EventStep;
  code: string;
  text: string;
  importance?: 0 | 1 | 2 | 3;
  actor?: string;
  target?: string;
  claim?: string;
  law?: string;
  tile?: [number, number];
  delta?: Record<string, [number, number]>;
  reason?: string;
  cause?: number[];
};

/** Append an event to the run log and the current operation's event list. Returns the event id. */
export function emit(ctx: Ctx, e: EventInput): number {
  const s = ctx.s;
  const ev: GameEvent = {
    id: s.nextEventId++,
    day: s.day,
    step: e.step,
    code: e.code,
    text: e.text,
    importance: e.importance ?? 1,
    ...(e.actor !== undefined ? { actor: e.actor } : {}),
    ...(e.target !== undefined ? { target: e.target } : {}),
    ...(e.claim !== undefined ? { claim: e.claim } : {}),
    ...(e.law !== undefined ? { law: e.law } : {}),
    ...(e.tile !== undefined ? { tile: e.tile } : {}),
    ...(e.delta !== undefined ? { delta: e.delta } : {}),
    ...(e.reason !== undefined ? { reason: e.reason } : {}),
    ...(e.cause && e.cause.length ? { cause: e.cause } : {}),
  };
  ctx.events.push(ev);
  if (!ctx.expect) {
    s.log.push(ev);
    if (s.log.length > LOG_CAP) compactLog(s);
  }
  return ev.id;
}

/** Drop the oldest low-importance entries while keeping every headline event. */
function compactLog(s: RunState): void {
  const keep: GameEvent[] = [];
  let drop = s.log.length - Math.floor(LOG_CAP * 0.8);
  for (const e of s.log) {
    if (drop > 0 && e.importance <= 1) {
      drop--;
      continue;
    }
    keep.push(e);
  }
  s.log = keep;
}

export function eventById(s: RunState, id: number): GameEvent | undefined {
  return s.log.find((e) => e.id === id);
}
