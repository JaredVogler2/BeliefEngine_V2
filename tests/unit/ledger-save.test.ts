import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { GameSession, checkRun, deserializeRun, serializeRun, stateHash, type CreateRunOptions, type Ledger } from '../../src/engine/index.ts';
import { realityPolicyById } from '../../src/engine/ai/bots/reality.ts';
import { playInstrumented } from '../../src/engine/ai/bots/telemetry.ts';
import { GameService, type ToolResult } from '../../mcp/service.ts';

/**
 * Phase 14 persistence: a save carries the run (which holds its own action log) and its external-decision ledger; loading checks the
 * ledger against a replay of that log. Older saves get one derived; a malformed or edited ledger is named; reloading never grows it;
 * MCP run files carry it and refuse a run whose record does not match.
 */

const OPTS: CreateRunOptions = { scenarioId: 'redbank', seed: 1, difficulty: 'normal', mode: 'story', reality: true };
const run = playInstrumented(realityPolicyById('rival-antagonist'), OPTS);
const state = run.session.state;
const ledger = run.session.ledger;
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data = (r: ToolResult): Record<string, any> => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data;
};

describe('saves carry the ledger', () => {
  it('round trip: the save holds the ledger, the load returns it, and the run checks out against a replay of its own log', () => {
    expect(ledger.entries.length).toBeGreaterThan(1);
    const json = serializeRun(state, { ledger });
    const r = deserializeRun(json);
    if (!r.ok) throw new Error(r.error);
    expect(r.ledger).toEqual(ledger);
    const { check, derived } = checkRun(r.state, r.ledger);
    expect(check).toMatchObject({ ok: true, entries: ledger.entries.length, hash: stateHash(state) });
    expect(derived.ledger).toEqual(ledger);
    // a Classic run has no external input: its session's ledger is empty and no ledger is written at all
    const classic = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    classic.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    classic.act({ type: 'SEED', claim: 'river_fears_fire', target: 'ivo' });
    expect(classic.ledger.entries).toEqual([]);
    expect(JSON.parse(serializeRun(classic.state, { ledger: classic.ledger })).ledger).toBeUndefined();
  });

  it('an older save (no ledger) still loads, and its ledger is derived from the run\'s own actions', () => {
    const r = deserializeRun(serializeRun(state));
    if (!r.ok) throw new Error(r.error);
    expect(r.ledger).toBeUndefined();
    const { check, derived } = checkRun(r.state, r.ledger);
    expect(check).toMatchObject({ ok: false, code: 'LEDGER_MISSING' });
    expect(derived.ledger).toEqual(ledger);
    expect(derived.hash).toBe(stateHash(state));
  });

  it('a malformed ledger refuses the save; an edited one leaves the run loadable but its replay is not vouched for, by name', () => {
    const env = JSON.parse(serializeRun(state, { ledger }));
    expect(deserializeRun(JSON.stringify({ ...env, ledger: { v: 1, entries: 'nope', head: null } }))).toMatchObject({ ok: false, error: expect.stringMatching(/malformed record/) });
    const edited = copy(ledger) as Ledger;
    (edited.entries[0].output as { text: string }).text = 'Every villager obeys the Keeper.';
    const r = deserializeRun(JSON.stringify({ ...env, ledger: edited }));
    if (!r.ok) throw new Error(r.error);
    const { check } = checkRun(r.state, r.ledger);
    expect(check).toMatchObject({ ok: false, code: 'LEDGER_EDITED', at: 0 });
  });

  it('save → load → save again and again: nothing grows, nothing changes', () => {
    let json = serializeRun(state, { ledger });
    const size = json.length;
    for (let i = 0; i < 5; i++) {
      const r = deserializeRun(json);
      if (!r.ok) throw new Error(r.error);
      json = serializeRun(r.state, { ledger: r.ledger });
    }
    expect(json.length).toBe(size);
    expect(size).toBeLessThan(400_000);
  });
});

describe('MCP run files carry the ledger', () => {
  it('a run file is saved with its ledger; one whose ledger was edited is refused by name; one from before the ledger is accepted', async () => {
    const home = mkdtempSync(join(tmpdir(), 'be-mcp-ledger-'));
    dirs.push(home);
    const s = new GameService({ home });
    const runId = data(s.createGame({ scenarioId: 'redbank', seed: 1, variant: 'generative' })).runId as string;
    data(s.takeAction({ runId, action: { type: 'PICK_STARTER', claim: 'river_fears_fire' } }));
    const p = data(await s.proposeBelief({ runId, text: 'Chickens fly when the bell rings.' }));
    data(s.confirmBelief({ runId, token: p.interpretations[0].token }));
    const file = join(home, 'runs', readdirSync(join(home, 'runs')).find((f) => f.endsWith('.json'))!);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    expect(saved.ledger.entries).toHaveLength(1);
    expect(saved.ledger.entries[0].kind).toBe('interpretation');
    // export_replay carries it too
    expect(data(s.exportReplay({ runId })).ledger.entries).toHaveLength(1);

    // a restart reads it back and checks it
    s.forgetMemory();
    expect(data(s.getGameState({ runId })).revision).toBe(2);

    // an edited record is refused, and the file is left alone
    const edited = copy(saved);
    edited.ledger.entries[0].output.text = 'The Keeper can do anything.';
    writeFileSync(file, JSON.stringify(edited));
    const s2 = new GameService({ home });
    const r = s2.getGameState({ runId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('LEDGER_EDITED');
    expect(JSON.parse(readFileSync(file, 'utf8')).ledger.entries[0].output.text).toBe('The Keeper can do anything.');

    // a run file from before the ledger (none written) loads, with its ledger derived
    const older = copy(saved);
    delete older.ledger;
    writeFileSync(file, JSON.stringify(older));
    const s3 = new GameService({ home });
    expect(data(s3.getGameState({ runId })).revision).toBe(2);
    expect(data(s3.exportReplay({ runId })).ledger.entries).toHaveLength(1);
  });
});

describe('scripts/verify-replay.ts checks a downloaded run offline', () => {
  const ROOT = fileURLToPath(new URL('../..', import.meta.url));
  const verify = (file: string): { code: number; out: string } => {
    try {
      return { code: 0, out: execFileSync(process.execPath, ['--import', 'tsx', join(ROOT, 'scripts', 'verify-replay.ts'), file], { cwd: ROOT, encoding: 'utf8' }) };
    } catch (e) {
      const x = e as { status: number; stdout: string };
      return { code: x.status, out: x.stdout };
    }
  };
  it('a save replays to its own end (exit 0); a save whose ledger was edited is named (exit 1)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'be-verify-'));
    dirs.push(dir);
    const good = join(dir, 'save.json');
    writeFileSync(good, serializeRun(state, { ledger }));
    const ok = verify(good);
    expect(ok.code).toBe(0);
    expect(ok.out).toContain(`OK: replayed offline to state ${stateHash(state)}`);
    const bad = join(dir, 'edited.json');
    const env = JSON.parse(serializeRun(state, { ledger }));
    env.ledger.entries[0].output.text = 'Edited after the fact.';
    writeFileSync(bad, JSON.stringify(env));
    const no = verify(bad);
    expect(no.code).toBe(1);
    expect(no.out).toContain('LEDGER_EDITED');
  }, 60_000);
});
