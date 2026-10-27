import { applyAction, getAvailableActions, previewAction, type ActionOption, type Preview, type Selection } from './actions.ts';
import { cloneState } from './clone.ts';
import { createRun } from './create.ts';
import { resolveDay } from './resolve.ts';
import type { Action, ActionResult, CreateRunOptions, GameEvent, ResolveResult, RunState } from './types.ts';

/**
 * A GameSession is the one controller used by the browser UI, bots, the MCP adapter and tests. It owns the
 * undo stack for the current planning phase (undo restores the exact earlier state, so Influence can never be
 * duplicated) and delegates every mutation to the pure engine functions.
 */
export class GameSession {
  state: RunState;
  private undoStack: RunState[] = [];
  /** accepted actions in order, including END_DAY: a complete replay log */
  readonly log: Action[] = [];

  constructor(state: RunState) {
    this.state = state;
  }

  static create(opts: CreateRunOptions): GameSession {
    return new GameSession(createRun(opts));
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 && this.state.phase === 'planning';
  }

  options(sel: Selection = {}, includeDisabled = false): ActionOption[] {
    return getAvailableActions(this.state, sel, { includeDisabled });
  }

  preview(action: Action): Preview {
    return previewAction(this.state, action);
  }

  act(action: Action): ActionResult {
    if (action.type === 'END_DAY') {
      const r = this.endDay();
      return { ok: true, state: r.state, events: r.events, cost: 0, summary: r.summary.headline };
    }
    const res = applyAction(this.state, action);
    if (res.ok) {
      this.undoStack.push(this.state);
      this.state = res.state;
      this.log.push(action);
    }
    return res;
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    this.state = this.undoStack.pop()!;
    this.log.pop();
    return true;
  }

  endDay(): ResolveResult {
    const r = resolveDay(this.state);
    this.state = r.state;
    this.undoStack = [];
    this.log.push({ type: 'END_DAY' });
    return r;
  }

  /** Snapshot independent from the session. */
  snapshot(): RunState {
    return cloneState(this.state);
  }

  events(sinceId = 0): GameEvent[] {
    return this.state.log.filter((e) => e.id > sinceId);
  }
}
