import { useSyncExternalStore } from 'react';
import { GameSession, checkRun, deserializeRun, emptyLedger, mayHaveExternal, serializeRun } from '../engine/index.ts';
import type { Action, ActionResult, CreateRunOptions, GameEvent, DaySummary, Ledger, RunReward, RunState } from '../engine/index.ts';
import { DEFAULT_SETTINGS, KEYS, loadSettings, readKey, removeKey, saveSettings, writeKey, type Settings } from './persist.ts';
import { sfx } from '../audio/audio.ts';
import { recordRun } from './progress.ts';
import type { Reading } from '../engine/reality/read.ts';
import type { ReadingMeta } from '../ai/client.ts';

export type Screen = 'title' | 'scenarios' | 'howto' | 'settings' | 'credits' | 'briefing' | 'play' | 'debrief' | 'atlas';
export type Lens = 'none' | 'social';
export type Selection = { kind: 'villager' | 'landmark'; id: string } | null;
export type SideTab = 'selected' | 'laws' | 'village' | 'forecast' | 'log';

export interface Resolution {
  day: number;
  events: GameEvent[];
  summary: DaySummary;
  /** water depth before the night, for animation */
  at: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'good' | 'warn';
}

export interface UiState {
  screen: Screen;
  selection: Selection;
  activeClaim: string | null;
  lens: Lens;
  tab: SideTab;
  sheetOpen: boolean;
  digest: Resolution | null;
  confirmEnd: boolean;
  /** the Write-a-belief dialog is open (Inventor runs) */
  composing: boolean;
  settings: Settings;
  toasts: Toast[];
  loadError: string | null;
  tutorialDone: boolean;
  debug: boolean;
  announce: string;
  showFlood: boolean;
  scenarioId: string;
  /** plain-language notes about how the current run was opened (e.g. an older link) */
  notes: string[];
  /** what the run that just ended earned (achievements, unlocks, knowledge) */
  reward: RunReward | null;
  /** events of the Keeper's latest accepted action, for immediate map feedback (never persisted) */
  lastAction: { events: GameEvent[] } | null;
  /** the main menu's choice: which tab the mode screen opens on, and which V2 mode its chapter cards lead with */
  startTab?: 'story' | 'expedition' | 'daily' | 'reality';
  v2Mode?: 'chronicle' | 'living' | 'lab';
  /** the reality composer's unsent words and its last reading, kept while the dialog is closed (never persisted; see RealityDraftUi) */
  realityDraft?: RealityDraftUi;
  /** the event a "Why?" link asked the log to show */
  logFocus?: number;
}

/**
 * What the reality composer keeps when it closes before anything is written: the words, the region and, with them, the last reading
 * and the choices made on it. `rev` is the run revision the reading was made at; a reading is only shown again at that same
 * revision (a confirmation built on an older village would be refused), otherwise the words come back and the reading is redone.
 */
export interface RealityDraftUi {
  text: string;
  region: string;
  rev: number;
  reading: Reading | null;
  meta: ReadingMeta | null;
  pick: number;
  title: string | null;
}

type Listener = () => void;

export class GameStore {
  session: GameSession | null = null;
  ui: UiState;
  version = 0;
  private listeners = new Set<Listener>();
  private toastId = 1;
  lastSavedOk = true;
  /** previous planning-phase state, kept for render interpolation */
  prevState: RunState | null = null;

  constructor() {
    const settings = loadSettings();
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    this.ui = {
      screen: 'title', selection: null, activeClaim: null, lens: 'none', tab: 'selected', sheetOpen: false, digest: null, confirmEnd: false, composing: false,
      settings, toasts: [], loadError: null, tutorialDone: !settings.tutorial, debug: params.get('debug') === '1', announce: '', showFlood: settings.showFlood,
      scenarioId: 'redbank', notes: [], reward: null, lastAction: null,
    };
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getVersion = (): number => this.version;

  private emit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  get state(): RunState | null {
    return this.session?.state ?? null;
  }

  set(patch: Partial<UiState>): void {
    this.ui = { ...this.ui, ...patch };
    this.emit();
  }

  toast(text: string, kind: Toast['kind'] = 'info'): void {
    const t: Toast = { id: this.toastId++, text, kind };
    this.ui = { ...this.ui, toasts: [...this.ui.toasts.slice(-3), t] };
    this.emit();
    if (typeof window !== 'undefined') window.setTimeout(() => this.dismissToast(t.id), kind === 'error' ? 6000 : 3800);
  }

  /** Keep (or drop) the composer's unsent draft. Nothing on screen shows it while the composer is closed, so nothing re-renders. */
  keepDraft(draft: RealityDraftUi | undefined): void {
    this.ui = { ...this.ui, realityDraft: draft };
  }

  dismissToast(id: number): void {
    this.ui = { ...this.ui, toasts: this.ui.toasts.filter((t) => t.id !== id) };
    this.emit();
  }

  hasSave(): boolean {
    const raw = readKey(KEYS.save);
    if (!raw) return false;
    const r = deserializeRun(raw);
    return r.ok && !r.state.outcome;
  }

  savedInfo(): { scenarioId: string; day: number; maxDay: number; seed: number } | null {
    const raw = readKey(KEYS.save);
    if (!raw) return null;
    const r = deserializeRun(raw);
    if (!r.ok || r.state.outcome) return null;
    return { scenarioId: r.state.scenarioId, day: r.state.day, maxDay: r.state.maxDay, seed: r.state.seed };
  }

  newRun(opts: CreateRunOptions): void {
    this.session = GameSession.create(opts);
    this.prevState = null;
    this.ui = { ...this.ui, screen: 'briefing', selection: null, activeClaim: null, digest: null, confirmEnd: false, lens: 'none', tab: 'selected', sheetOpen: false, composing: false, announce: '', loadError: null, scenarioId: opts.scenarioId, notes: [], reward: null, tutorialDone: !this.ui.settings.tutorial, realityDraft: undefined, logFocus: undefined };
    this.persist();
    this.emit();
  }

  /** The current run as a save file the player can keep or hand to another tool (browser, MCP coach). Null if there is no run. */
  exportSave(): string | null {
    return this.state ? serializeRun(this.state, { ledger: this.session?.ledger }) : null;
  }

  /**
   * A session for a loaded run, with its ledger: the one the save carries, or (an older save, which has none) the one its own action
   * log derives. A plain Classic run has no external inputs, so nothing is replayed for it. The debrief checks the ledger in full.
   */
  private sessionFor(state: RunState, ledger: Ledger | undefined): GameSession {
    if (ledger || !mayHaveExternal(state)) return new GameSession(state, ledger ?? emptyLedger());
    const { check, derived } = checkRun(state, undefined);
    return new GameSession(state, check.ok || check.code === 'LEDGER_MISSING' ? derived.ledger : emptyLedger());
  }

  /** Load a save file the player picked. Validated exactly like the autosave; on failure nothing changes and a reason is shown. */
  loadSaveText(text: string): boolean {
    if (text.length > 2_000_000) {
      this.set({ loadError: 'That file is too large to be a Belief Engine save.' });
      return false;
    }
    const r = deserializeRun(text);
    if (!r.ok) {
      this.set({ loadError: r.error });
      return false;
    }
    this.session = this.sessionFor(r.state, r.ledger);
    this.prevState = null;
    this.persist();
    const first = r.state.scn.starters.find((c) => r.state.claims.find((x) => x.id === c)?.available) ?? null;
    this.ui = { ...this.ui, screen: r.state.outcome ? 'debrief' : 'play', selection: null, activeClaim: first, digest: null, confirmEnd: false, loadError: null, scenarioId: r.state.scenarioId, tutorialDone: true, realityDraft: undefined, logFocus: undefined };
    this.emit();
    return true;
  }

  continueRun(): boolean {
    const raw = readKey(KEYS.save);
    if (!raw) return false;
    const r = deserializeRun(raw);
    if (!r.ok) {
      removeKey(KEYS.save);
      this.set({ loadError: `${r.error} The save was cleared so you can start fresh.` });
      return false;
    }
    this.session = this.sessionFor(r.state, r.ledger);
    this.prevState = null;
    const first = r.state.scn.starters.find((c) => r.state.claims.find((x) => x.id === c)?.available) ?? null;
    this.ui = { ...this.ui, screen: r.state.outcome ? 'debrief' : 'play', selection: null, activeClaim: first, digest: null, confirmEnd: false, loadError: null, scenarioId: r.state.scenarioId, tutorialDone: true, realityDraft: undefined, logFocus: undefined };
    this.emit();
    return true;
  }

  clearSave(): void {
    removeKey(KEYS.save);
    this.emit();
  }

  /** Delete the saved run and drop it from memory (Settings > Your data). */
  deleteGame(): void {
    removeKey(KEYS.save);
    this.session = null;
    this.prevState = null;
    this.ui = { ...this.ui, screen: 'title', realityDraft: undefined, logFocus: undefined, digest: null };
    this.emit();
  }

  /** Delete everything this game keeps in this browser (the saved run, the Atlas, settings, what has been seen), then start afresh. */
  deleteAllLocal(): void {
    for (const k of Object.values(KEYS)) removeKey(k);
    this.session = null;
    this.prevState = null;
    this.ui = { ...this.ui, screen: 'title', settings: { ...DEFAULT_SETTINGS }, showFlood: DEFAULT_SETTINGS.showFlood, realityDraft: undefined, logFocus: undefined, reward: null, digest: null };
    this.emit();
  }

  private persist(): void {
    const s = this.state;
    if (!s) return;
    if (s.outcome) {
      removeKey(KEYS.save);
      return;
    }
    const wasOk = this.lastSavedOk;
    this.lastSavedOk = writeKey(KEYS.save, serializeRun(s, { ledger: this.session?.ledger }));
    // tell the player once, with the way out, instead of failing silently
    if (wasOk && !this.lastSavedOk) this.toast('This browser would not save the game (storage is full or blocked). You can keep playing; use Settings > Download this game to keep a copy.', 'error');
  }

  act(action: Action): ActionResult | null {
    if (!this.session) return null;
    const res = this.session.act(action);
    if (res.ok) {
      this.persist();
      if (action.type === 'SEED' || action.type === 'MESSENGER') sfx('seed');
      else if (action.type === 'RITUAL') {
        // the bell is heard from the side of the map the tower stands on
        const tower = this.state?.world.landmarks.find((l) => l.id === action.landmark);
        const w = this.state?.world.w ?? 1;
        if (action.ritual === 'ring_bells') sfx('bell', tower ? ((tower.x + 0.5) / w - 0.5) * 1.8 : 0);
        else sfx('ritual');
      }
      else if (action.type === 'GATHER') sfx('gather');
      else if (action.type === 'COUNTER') sfx('counter');
      else sfx('click');
      this.ui = { ...this.ui, announce: res.summary || 'Action done.', lastAction: { events: res.events } };
    } else {
      sfx('deny');
      this.toast(res.error.message, 'error');
    }
    this.emit();
    return res;
  }

  undo(): void {
    if (this.session?.undo()) {
      sfx('click');
      this.persist();
      this.ui = { ...this.ui, announce: 'Last action undone.' };
      this.emit();
    }
  }

  endDay(): void {
    if (!this.session) return;
    const before = this.session.state;
    this.prevState = before;
    const day = before.day;
    const r = this.session.endDay();
    this.persist();
    const important = r.events.filter((e) => e.importance >= 2);
    sfx(important.some((e) => e.code === 'LAW_ACTIVATED') ? 'law' : important.some((e) => e.code === 'DEATH') ? 'loss' : 'night');
    if (r.events.some((e) => e.code === 'BRIDGE_DAMAGED' || e.code === 'BRIDGE_COLLAPSED')) window.setTimeout(() => sfx('creak'), 500);
    const over = !!r.state.outcome;
    let reward: RunReward | null = null;
    if (over) {
      try {
        reward = recordRun(r.state, !!this.ui.debug);
      } catch {
        /* progress is best-effort */
      }
    }
    this.ui = {
      ...this.ui,
      reward,
      digest: { day, events: r.events, summary: r.summary, at: this.version },
      confirmEnd: false,
      // the morning digest owns the screen: a details sheet left open on a phone would sit on top of its button
      sheetOpen: false,
      activeClaim: this.ui.activeClaim,
      announce: `Day ${day} resolved. ${r.summary.headline}`,
    };
    this.emit();
  }

  closeDigest(): void {
    const s = this.state;
    const over = !!s?.outcome;
    this.ui = { ...this.ui, digest: null, screen: over ? 'debrief' : 'play' };
    if (over) sfx(s!.outcome!.result === 'victory' ? 'win' : 'lose');
    this.emit();
  }

  select(sel: Selection): void {
    // choosing someone shows a small card beside them; the side sheet (full detail) opens only when asked for
    this.ui = { ...this.ui, selection: sel };
    if (sel) sfx('tick');
    this.emit();
  }

  setSettings(patch: Partial<Settings>): void {
    const next = { ...this.ui.settings, ...patch };
    saveSettings(next);
    this.ui = { ...this.ui, settings: next, showFlood: next.showFlood };
    this.emit();
  }

  resetSettings(): void {
    saveSettings(DEFAULT_SETTINGS);
    this.ui = { ...this.ui, settings: { ...DEFAULT_SETTINGS }, showFlood: DEFAULT_SETTINGS.showFlood };
    this.emit();
  }
}

export const store = new GameStore();

export function useStore<T>(selector: (s: GameStore) => T): T {
  // The version counter is the snapshot; derived values are computed on read.
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return selector(store);
}
