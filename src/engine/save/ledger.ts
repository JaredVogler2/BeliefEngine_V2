import { cloneState } from '../core/clone.ts';
import { hashValue } from '../core/hash.ts';
import { stateHash } from '../core/replay.ts';
import { GameSession } from '../core/session.ts';
import { RULES_VERSION, type Action, type CreateRunOptions, type InferenceMeta, type RunState } from '../core/types.ts';
import { cleanMeta } from '../core/meta.ts';
import { optionsFromState } from '../progress/options.ts';

export { cleanMeta };

/**
 * The external-decision ledger (phase 14). Everything in a run that did not come from the engine's own deterministic rules is an
 * *input*: a sentence read into a belief (offline or by a model), decisions a model proposed for villagers, a line a model voiced
 * for a villager. Each is recorded, validated, in the action that used it, so a replay reads it back and never asks anyone again.
 *
 * The ledger is that record made explicit and checkable: one entry per external input, in order, with the revision of the village
 * it was made against, what it targeted, who produced it (reader, provider, model, prompt version), the versions it was validated
 * under, a canonical hash of exactly what the engine used, and a hash chain over the entries. It is DERIVED from the action log by
 * replaying it (so it never changes a run's state or its hash), saved beside the run, and checked against a fresh derivation when
 * the run is loaded or replayed: a missing, extra, reordered or edited entry, or one recorded under another validator, is named
 * exactly, with what can be done instead. Nothing here ever calls a model or re-reads a sentence.
 */

export const LEDGER_VERSION = 1;
/** what every external input is held to: the belief language, the villager-decision validator and the dialogue check */
export const VALIDATOR_VERSION = 'reality-1/npc-2/talk-1';
/** a run with more external inputs than this is not saved with a ledger (it cannot be produced by play: see core/actions.ts limits) */
export const MAX_LEDGER_ENTRIES = 2000;

export type LedgerKind = 'interpretation' | 'npc_decisions' | 'dialogue';

export interface LedgerEntry {
  /** stable within the run: its place and a prefix of its hash */
  id: string;
  seq: number;
  /** index of the action that carried it, in the run's action log */
  action: number;
  day: number;
  /** the run revision (next event id) the input was made against */
  rev: number;
  kind: LedgerKind;
  claim?: string;
  villagers?: string[];
  source: { reader: string; provider: string | null; model: string | null; prompt: string | null; request: string | null };
  versions: { ledger: number; rules: string; validator: string; lang: string | null };
  /** exactly what the engine used: the belief's structure, the decisions, the checked line */
  output: unknown;
  hash: string;
  /** the previous entry's chain value, and this one's: an entry moved or removed breaks every chain value after it */
  parent: string | null;
  chain: string;
  /** a hash of the words a belief was read from (the words themselves are in the belief's own text, kept on this device) */
  digest?: string;
  /** what the inference service reported for this input, when it came from one (never a key or a prompt) */
  meta?: InferenceMeta;
}

export interface Ledger {
  v: number;
  entries: LedgerEntry[];
  /** the last entry's chain value (null when the run had no external input) */
  head: string | null;
}

const short = (x: unknown, n: number): string | null => (typeof x === 'string' && x ? x.slice(0, n) : null);

type Draft = Omit<LedgerEntry, 'id' | 'seq' | 'action' | 'day' | 'rev' | 'hash' | 'parent' | 'chain' | 'versions'> & { lang: string | null };

/** The external input an action carries, if any. */
function externalOf(a: Action): Draft | null {
  if (a.type === 'COMPOSE') {
    const c = a.claim;
    const meta = cleanMeta(a.meta);
    if (c.reality) {
      const ast = c.reality.ast;
      return {
        kind: 'interpretation', claim: c.id, lang: ast.lang, output: ast, digest: hashValue(ast.text),
        source: { reader: ast.source.reader, provider: meta?.provider ?? null, model: ast.source.model ?? null, prompt: ast.source.prompt ?? null, request: ast.source.id ?? null },
        ...(meta ? { meta } : {}),
      };
    }
    if (c.custom) {
      return {
        kind: 'interpretation', claim: c.id, lang: `nl-${c.custom.nl}`, output: c.custom.ast, digest: hashValue(c.custom.text),
        source: { reader: c.custom.source === 'model' ? 'model' : c.custom.parser, provider: meta?.provider ?? null, model: c.custom.source === 'model' ? (meta?.model ?? 'model') : null, prompt: null, request: null },
        ...(meta ? { meta } : {}),
      };
    }
    return null;
  }
  if (a.type === 'NPC_DECIDE') {
    const meta = cleanMeta(a.meta);
    return {
      kind: 'npc_decisions', lang: null, output: a.decisions, villagers: a.decisions.map((d) => String(d?.citizenId ?? '')),
      source: { reader: 'model', provider: meta?.provider ?? null, model: short(a.model, 80), prompt: meta?.promptVersion ?? null, request: short(a.id, 60) },
      ...(meta ? { meta } : {}),
    };
  }
  if (a.type === 'TALK' && a.reply) {
    const meta = cleanMeta(a.meta);
    return {
      kind: 'dialogue', lang: null, output: a.reply, villagers: [a.target], ...(a.claim ? { claim: a.claim } : {}),
      source: { reader: 'model', provider: meta?.provider ?? null, model: meta?.model ?? null, prompt: meta?.promptVersion ?? null, request: meta?.id ?? null },
      ...(meta ? { meta } : {}),
    };
  }
  return null;
}

/** What a run starts from: the options of a fresh village, or (an imported run) the saved state its log continues from. */
export type ReplayStart = CreateRunOptions | RunState;
const isState = (x: ReplayStart): x is RunState => 'world' in x && 'villagers' in x;

export interface Derived {
  ledger: Ledger;
  state: RunState;
  hash: string;
  /** actions the engine refused on replay (a sound log has none) */
  rejected: { index: number; code: string }[];
}

export const emptyLedger = (): Ledger => ({ v: LEDGER_VERSION, entries: [], head: null });

/**
 * A run's own action log, as the run state keeps it: every accepted action of every finished day (`history`), each day closed by
 * END_DAY, then today's. With the run's options (optionsFromState) it replays to the identical state.
 */
export function actionsOfState(s: RunState): Action[] {
  const out: Action[] = [];
  for (const h of s.history) {
    out.push(...h.actions);
    out.push({ type: 'END_DAY' });
  }
  for (const r of s.today) out.push(r.action);
  return out;
}

/** How many actions the run has accepted so far (the index the next one will have in actionsOfState). */
export function actionCount(s: RunState): number {
  return s.history.reduce((n, h) => n + h.actions.length + 1, 0) + s.today.length;
}

/**
 * The ledger with one more input, if `action` (just accepted by the engine against `pre`, at position `index` of the run's log)
 * carries one. Used as play goes on (GameSession), so saving never has to replay the run; a load derives it again to check it.
 */
export function appendExternal(ledger: Ledger, pre: RunState, action: Action, index: number): Ledger {
  const ext = externalOf(action);
  if (!ext || ledger.entries.length >= MAX_LEDGER_ENTRIES) return ledger;
  const rev = action.type === 'COMPOSE' && action.claim.reality ? action.claim.reality.rev : action.type === 'NPC_DECIDE' ? action.rev : pre.nextEventId;
  const { lang, ...rest } = ext;
  const hash = hashValue(ext.output);
  const parent = ledger.head;
  const chain: string = hashValue([parent, hash, ext.kind, rev, index]);
  const seq = ledger.entries.length;
  const entry: LedgerEntry = { ...rest, id: `x${seq}-${hash.slice(0, 8)}`, seq, action: index, day: pre.day, rev, hash, parent, chain, versions: { ledger: LEDGER_VERSION, rules: RULES_VERSION, validator: VALIDATOR_VERSION, lang } };
  return { v: LEDGER_VERSION, entries: [...ledger.entries, entry], head: chain };
}

/** The ledger without the entries of actions at or after `index` (an undone action). */
export function truncateLedger(ledger: Ledger, index: number): Ledger {
  const entries = ledger.entries.filter((e) => e.action < index);
  return entries.length === ledger.entries.length ? ledger : { v: LEDGER_VERSION, entries, head: entries.length ? entries[entries.length - 1].chain : null };
}

/** Replay a run's action log from its start and derive its ledger. Deterministic; no network, no model. */
export function deriveLedger(start: ReplayStart, actions: Action[]): Derived {
  const session = isState(start) ? new GameSession(cloneState(start)) : GameSession.create(start);
  let ledger = emptyLedger();
  const rejected: Derived['rejected'] = [];
  for (let i = 0; i < actions.length; i++) {
    // a finished run takes no more actions (replayRun stops here too); anything after the ending is not part of the run
    if (session.state.outcome) break;
    const a = actions[i];
    const before = session.state;
    const index = actionCount(before);
    const r = session.act(a);
    if (!r.ok) {
      rejected.push({ index: i, code: r.error.code });
      continue;
    }
    ledger = appendExternal(ledger, before, a, index);
  }
  return { ledger, state: session.state, hash: stateHash(session.state), rejected };
}

export type LedgerProblem = 'LEDGER_MISSING' | 'LEDGER_EXTRA' | 'LEDGER_REORDERED' | 'LEDGER_EDITED' | 'LEDGER_VERSION' | 'REPLAY_DIVERGES';
export type LedgerCheck = { ok: true; entries: number; hash: string } | { ok: false; code: LedgerProblem; at: number | null; message: string; recovery: string };

const RECOVER_OPEN = 'Nothing is asked of any model again. The run can still be opened as it was saved (its state is kept and checked on its own); only its replay cannot be vouched for. To replay it, use the file exactly as it was exported.';
const RECOVER_VERSION = 'Open it with the engine version that recorded it; this one will not re-read or re-validate its inputs into a different run.';

function describe(e: LedgerEntry): string {
  return `${e.kind.replace('_', ' ')} on day ${e.day}${e.claim ? ` (${e.claim})` : e.villagers?.length ? ` (${e.villagers.slice(0, 3).join(', ')})` : ''}`;
}

/**
 * Check a recorded ledger against the run's action log (derived by replaying it), and the replay against the recorded final state.
 * The first problem is named exactly: which entry, what is wrong, and what can be done instead. Never repairs anything.
 */
export function checkLedger(recorded: Ledger | undefined | null, derived: Derived, expectedHash?: string): LedgerCheck {
  if (derived.rejected.length) {
    const r = derived.rejected[0];
    return { ok: false, code: 'REPLAY_DIVERGES', at: r.index, message: `The action log does not replay: action ${r.index} is refused by this engine (${r.code}).`, recovery: RECOVER_OPEN };
  }
  const d = derived.ledger;
  if (!recorded) {
    if (d.entries.length === 0) return expectedHash && expectedHash !== derived.hash ? diverged(expectedHash, derived.hash) : { ok: true, entries: 0, hash: derived.hash };
    return { ok: false, code: 'LEDGER_MISSING', at: null, message: `This run carries no record of its ${d.entries.length} external input${d.entries.length === 1 ? '' : 's'}.`, recovery: RECOVER_OPEN };
  }
  if (typeof recorded.v !== 'number' || recorded.v > LEDGER_VERSION) return { ok: false, code: 'LEDGER_VERSION', at: null, message: `The record of external inputs was written by a newer engine (ledger ${String(recorded.v)}; this one reads ${LEDGER_VERSION}).`, recovery: RECOVER_VERSION };
  const rec = Array.isArray(recorded.entries) ? recorded.entries : [];
  const n = Math.max(rec.length, d.entries.length);
  for (let i = 0; i < n; i++) {
    const r = rec[i];
    const x = d.entries[i];
    if (!r) return { ok: false, code: 'LEDGER_MISSING', at: i, message: `The record stops before the action log does: entry ${i}, ${describe(x)}, is not in it.`, recovery: RECOVER_OPEN };
    if (!x) return { ok: false, code: 'LEDGER_EXTRA', at: i, message: `The record has an entry the action log never used: entry ${i}${r.kind ? `, ${r.kind}` : ''}.`, recovery: RECOVER_OPEN };
    if (r.versions?.validator !== VALIDATOR_VERSION || r.versions?.rules !== RULES_VERSION)
      return { ok: false, code: 'LEDGER_VERSION', at: i, message: `Entry ${i} (${describe(x)}) was validated under ${String(r.versions?.validator)} and rules ${String(r.versions?.rules)}; this engine uses ${VALIDATOR_VERSION} and rules ${RULES_VERSION}.`, recovery: RECOVER_VERSION };
    if (r.hash !== x.hash || hashValue(r.output) !== r.hash) {
      const elsewhere = d.entries.findIndex((y) => y.hash === r.hash);
      return elsewhere >= 0 && elsewhere !== i
        ? { ok: false, code: 'LEDGER_REORDERED', at: i, message: `Entry ${i} of the record is the action log's entry ${elsewhere}: the external inputs are out of order.`, recovery: RECOVER_OPEN }
        : { ok: false, code: 'LEDGER_EDITED', at: i, message: `Entry ${i} (${describe(x)}) does not match what the run used: it was changed after it was recorded.`, recovery: RECOVER_OPEN };
    }
    if (r.chain !== x.chain || r.rev !== x.rev || r.action !== x.action)
      return { ok: false, code: 'LEDGER_REORDERED', at: i, message: `Entry ${i} (${describe(x)}) is recorded at another place in the run (revision ${String(r.rev)}, action ${String(r.action)}; the log has ${x.rev}, ${x.action}).`, recovery: RECOVER_OPEN };
  }
  if (expectedHash && expectedHash !== derived.hash) return diverged(expectedHash, derived.hash);
  return { ok: true, entries: d.entries.length, hash: derived.hash };
}

function diverged(expected: string, got: string): LedgerCheck {
  return { ok: false, code: 'REPLAY_DIVERGES', at: null, message: `The action log replays to state ${got}, not the saved ${expected}.`, recovery: RECOVER_OPEN };
}

/** One line per kind for people: "2 beliefs read (1 by a model), 3 villager decision sets, 1 voiced line". */
export function ledgerSummary(l: Ledger): { interpretations: number; byModel: number; decisions: number; dialogue: number; text: string } {
  const interpretations = l.entries.filter((e) => e.kind === 'interpretation').length;
  const byModel = l.entries.filter((e) => e.source.reader === 'model').length;
  const decisions = l.entries.filter((e) => e.kind === 'npc_decisions').length;
  const dialogue = l.entries.filter((e) => e.kind === 'dialogue').length;
  const parts = [`${interpretations} belief${interpretations === 1 ? '' : 's'} read`, ...(decisions ? [`${decisions} set${decisions === 1 ? '' : 's'} of villager decisions`] : []), ...(dialogue ? [`${dialogue} voiced line${dialogue === 1 ? '' : 's'}`] : [])];
  return { interpretations, byModel, decisions, dialogue, text: `${parts.join(', ')}${byModel ? `; ${byModel} from a model` : '; none from a model'}` };
}

/** Whether a run can hold external inputs at all (a V2 run, or a Classic Inventor run); a plain Classic run never has any. */
export function mayHaveExternal(s: RunState): boolean {
  return !!s.v2 || !!s.flags.inventor;
}

/**
 * Check a run as it stands against its recorded ledger: replay its own action log from its options (no network, no model), confirm it
 * reaches this very state, and compare the ledger the replay derives with the recorded one. `derived` is the ledger of record from
 * then on when the replay holds, whatever the recorded one said.
 */
export function checkRun(s: RunState, recorded: Ledger | undefined | null): { check: LedgerCheck; derived: Derived } {
  const derived = deriveLedger(optionsFromState(s), actionsOfState(s));
  return { check: checkLedger(recorded, derived, stateHash(s)), derived };
}

/** A replay file anyone can check offline (scripts/verify-replay.ts): the options, the action log, the ledger and the hashes. */
export interface ReplayFile {
  format: 'belief-engine-replay';
  v: 1;
  options: CreateRunOptions;
  actions: Action[];
  ledger: Ledger;
  stateHash: string;
  eventHash: string;
}
