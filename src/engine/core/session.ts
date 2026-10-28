import { applyAction, getAvailableActions, previewAction, type ActionOption, type Preview, type Selection } from './actions.ts';
import { cloneState } from './clone.ts';
import { createRun } from './create.ts';
import { resolveDay } from './resolve.ts';
import type { Action, ActionResult, CreateRunOptions, GameEvent, ResolveResult, RunState } from './types.ts';
import { actionCount, appendExternal, emptyLedger, truncateLedger, type Ledger } from '../save/ledger.ts';

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
  /**
   * the external-decision ledger of the whole run (save/ledger.ts), kept as actions are accepted and undone; a session made from a
   * saved state starts from the ledger saved with it (the loader derives and checks it), or empty
   */
  ledger: Ledger;

  constructor(state: RunState, ledger?: Ledger) {
    this.state = state;
    this.ledger = ledger ?? emptyLedger();
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
      const pre = this.state;
      this.undoStack.push(pre);
      this.state = res.state;
      this.log.push(action);
      this.ledger = appendExternal(this.ledger, pre, action, actionCount(pre));
    }
    return res;
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    this.state = this.undoStack.pop()!;
    this.log.pop();
    this.ledger = truncateLedger(this.ledger, actionCount(this.state));
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
