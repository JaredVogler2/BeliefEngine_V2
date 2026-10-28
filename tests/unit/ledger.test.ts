import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameSession, checkLedger, deriveLedger, ledgerSummary, optionsFromState, stateHash, type Action, type CreateRunOptions, type Ledger } from '../../src/engine/index.ts';
import { hashValue } from '../../src/engine/core/hash.ts';
import { actionsOfState } from '../../src/engine/save/ledger.ts';
import { realityPolicyById } from '../../src/engine/ai/bots/reality.ts';
import { playInstrumented } from '../../src/engine/ai/bots/telemetry.ts';
import { traces } from '../e2e/helpers.ts';

/**
 * Phase 14: the external-decision ledger. Derived from a run's action log by replaying it (no network, no model), it names every input
 * that did not come from the engine's own rules, and a recorded ledger is checked against it: missing, extra, reordered or edited
 * entries, or entries validated under another version, are refused by name, never repaired or re-asked.
 */

interface Trace { opts: CreateRunOptions; stateHash: string; actions: Action[] }
const fx = JSON.parse(readFileSync(new URL('../fixtures/v2-bridge-traces.json', import.meta.url), 'utf8')) as Record<string, Trace>;
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// a whole Generative Reality run with many external inputs: written beliefs, and a scripted adversary proposing villagers' moves
const AD: CreateRunOptions = { scenarioId: 'redbank', seed: 1, difficulty: 'normal', mode: 'story', reality: true };
const adversary = playInstrumented(realityPolicyById('rival-antagonist'), AD);
const adLog = adversary.session.log;

describe('the external-decision ledger', () => {
  it('a Classic run has no external input: an empty ledger, and the replay is the recorded run', () => {
    const d = deriveLedger({ scenarioId: 'redbank', seed: traces.canonicalSeed }, traces.fireWall.actions);
    expect(d.ledger.entries).toEqual([]);
    expect(d.ledger.head).toBeNull();
    expect(d.hash).toBe(traces.fireWall.stateHash);
    expect(checkLedger(undefined, d, traces.fireWall.stateHash)).toMatchObject({ ok: true, entries: 0 });
  });

  it('a written belief is one entry: its structure, the revision it was read at, the reader, a digest of the words, never the model', () => {
    const t = fx.hens;
    const d = deriveLedger(t.opts, t.actions);
    expect(d.hash).toBe(t.stateHash);
    expect(d.ledger.entries).toHaveLength(1);
    const e = d.ledger.entries[0];
    const compose = t.actions[e.action] as Extract<Action, { type: 'COMPOSE' }>;
    expect(compose.type).toBe('COMPOSE');
    expect(e).toMatchObject({ kind: 'interpretation', claim: compose.claim.id, rev: compose.claim.reality!.rev, source: { reader: 'offline-v2', model: null }, versions: { lang: 'reality-1' } });
    expect(e.output).toEqual(compose.claim.reality!.ast);
    expect(e.digest).toMatch(/^[0-9a-f]{14}$/);
    expect(JSON.stringify(e)).not.toContain('"meta"');
    expect(checkLedger(copy(d.ledger), d, t.stateHash)).toMatchObject({ ok: true, entries: 1 });
    expect(ledgerSummary(d.ledger).text).toBe('1 belief read; none from a model');
  });

  it('a run with a scripted adversary records each set of proposed decisions, and replays to the same state without asking anyone', () => {
    const d = deriveLedger(AD, adLog);
    expect(d.rejected).toEqual([]);
    expect(d.hash).toBe(stateHash(adversary.session.state));
    const kinds = d.ledger.entries.map((e) => e.kind);
    expect(kinds).toContain('interpretation');
    expect(kinds.filter((k) => k === 'npc_decisions').length).toBe(adLog.filter((a) => a.type === 'NPC_DECIDE').length);
    const dec = d.ledger.entries.find((e) => e.kind === 'npc_decisions')!;
    expect(dec.source).toMatchObject({ reader: 'model', model: 'antagonist (scripted)' });
    expect(dec.villagers!.length).toBeGreaterThan(0);
    // the chain links every entry to the one before
    for (let i = 1; i < d.ledger.entries.length; i++) expect(d.ledger.entries[i].parent).toBe(d.ledger.entries[i - 1].chain);
    expect(d.ledger.head).toBe(d.ledger.entries.at(-1)!.chain);
    expect(checkLedger(copy(d.ledger), d, stateHash(adversary.session.state))).toMatchObject({ ok: true });
  });

  it('refuses by name: an edited, missing, extra, reordered or differently validated entry; and a log that no longer replays', () => {
    const d = deriveLedger(AD, adLog);
    const good = (): Ledger => copy(d.ledger);
    const edited = good();
    (edited.entries[0].output as { text: string }).text = 'Chickens rule the village.';
    expect(checkLedger(edited, d)).toMatchObject({ ok: false, code: 'LEDGER_EDITED', at: 0 });
    // re-hashing the edited output does not help: it is not what the run used
    const rehashed = good();
    (rehashed.entries[0].output as { text: string }).text = 'Chickens rule the village.';
    rehashed.entries[0].hash = hashValue(rehashed.entries[0].output);
    expect(checkLedger(rehashed, d)).toMatchObject({ ok: false, code: 'LEDGER_EDITED', at: 0 });
    const missing = good();
    missing.entries.pop();
    expect(checkLedger(missing, d)).toMatchObject({ ok: false, code: 'LEDGER_MISSING', at: d.ledger.entries.length - 1 });
    const extra = good();
    extra.entries.push(copy(extra.entries[0]));
    expect(checkLedger(extra, d)).toMatchObject({ ok: false, code: 'LEDGER_EXTRA' });
    const swapped = good();
    [swapped.entries[1], swapped.entries[2]] = [swapped.entries[2], swapped.entries[1]];
    expect(checkLedger(swapped, d)).toMatchObject({ ok: false, code: 'LEDGER_REORDERED', at: 1 });
    const older = good();
    older.entries[0].versions.validator = 'reality-0/npc-1/talk-0';
    const v = checkLedger(older, d);
    expect(v).toMatchObject({ ok: false, code: 'LEDGER_VERSION', at: 0 });
    if (!v.ok) expect(v.recovery).toMatch(/engine version that recorded it/);
    expect(checkLedger(undefined, d)).toMatchObject({ ok: false, code: 'LEDGER_MISSING', at: null });
    expect(checkLedger({ v: 99, entries: [], head: null }, d)).toMatchObject({ ok: false, code: 'LEDGER_VERSION' });
    // decisions moved to another day are refused by the engine itself (they were asked about another village): the replay diverges
    const firstDecide = adLog.findIndex((a) => a.type === 'NPC_DECIDE');
    const lastEnd = adLog.map((a) => a.type).lastIndexOf('END_DAY');
    const moved = [...adLog];
    const [x] = moved.splice(firstDecide, 1);
    moved.splice(lastEnd, 0, x);
    const dm = deriveLedger(AD, moved);
    expect(checkLedger(d.ledger, dm)).toMatchObject({ ok: false, code: 'REPLAY_DIVERGES' });
    // and a recorded final state the log does not reach is named too
    expect(checkLedger(good(), d, 'ffffffffffffff')).toMatchObject({ ok: false, code: 'REPLAY_DIVERGES', at: null });
  });

  it('inference metadata travels in the action and the ledger, cleaned: no key, no prompt, bounded fields; the rules never read it', () => {
    const t = fx.hens;
    const withMeta = t.actions.map((a) => (a.type === 'COMPOSE' ? { ...a, meta: { provider: 'mock', model: 'm'.repeat(200), latencyMs: 12.4, costUsd: 0, tokens: 600, apiKey: 'sk-should-never-appear', prompt: 'secret system prompt' } as never } : a));
    const d = deriveLedger(t.opts, withMeta);
    const plain = deriveLedger(t.opts, t.actions);
    // the metadata is recorded with the action (the day's history), so the run's hash covers it; the world it played out is the same
    const world = (x: typeof d.state) => hashValue({ ...x, scn: undefined, history: undefined, today: undefined });
    expect(world(d.state)).toBe(world(plain.state));
    expect(d.state.outcome).toEqual(plain.state.outcome);
    const e = d.ledger.entries[0];
    expect(e.meta).toEqual({ provider: 'mock', model: 'm'.repeat(80), latencyMs: 12, costUsd: 0, tokens: 600 });
    expect(JSON.stringify(d.ledger)).not.toMatch(/sk-should-never-appear|secret system prompt/);
    expect(JSON.stringify(d.state.history)).not.toMatch(/sk-should-never-appear|secret system prompt/);
  });

  it('kept as play goes on: the session\'s own ledger equals the one derived by replaying the run, through undo too', () => {
    const live = adversary.session.ledger;
    const d = deriveLedger(AD, adLog);
    expect(live).toEqual(d.ledger);
    // and from the run state alone (what a browser save holds): the same log, the same ledger, the same state
    const fromState = deriveLedger(optionsFromState(adversary.session.state), actionsOfState(adversary.session.state));
    expect(fromState.ledger).toEqual(d.ledger);
    expect(fromState.hash).toBe(stateHash(adversary.session.state));
    // undo takes an entry back out
    const t = fx.hens;
    const g = GameSession.create(t.opts);
    const at = t.actions.findIndex((a) => a.type === 'COMPOSE');
    for (const a of t.actions.slice(0, at + 1)) g.act(a);
    expect(g.ledger.entries).toHaveLength(1);
    expect(g.undo()).toBe(true);
    expect(g.ledger.entries).toHaveLength(0);
    expect(g.ledger.head).toBeNull();
  });

  it('no memory or other state leaks between runs: the same seed after another run is the same as a fresh one', () => {
    const fresh = GameSession.create(AD);
    // play another run in between (other seed, villagers think, remember, decide)
    playInstrumented(realityPolicyById('rival-antagonist'), { ...AD, seed: 7 });
    const after = GameSession.create(AD);
    expect(stateHash(after.state)).toBe(stateHash(fresh.state));
    expect(deriveLedger(AD, adLog).hash).toBe(stateHash(adversary.session.state));
  });
});
