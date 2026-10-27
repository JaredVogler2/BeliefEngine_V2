import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { replayRun, stateHash, eventHash, serializeRun, GameSession } from '../../src/engine/index.ts';
import type { Action } from '../../src/engine/index.ts';
import { GameService, type ToolResult } from '../../mcp/service.ts';

const traces = JSON.parse(readFileSync(new URL('../fixtures/redbank-traces.json', import.meta.url), 'utf8')) as { canonicalSeed: number; witnessBridge: { actions: Action[]; stateHash: string }; noop: { actions: Action[] } };

const dirs: string[] = [];
function service(opts: { home?: string | null; debug?: boolean; maxRuns?: number } = {}): GameService {
  let home: string | null = opts.home === undefined ? null : opts.home;
  if (home === 'tmp') {
    home = mkdtempSync(join(tmpdir(), 'be-mcp-'));
    dirs.push(home);
  }
  return new GameService({ home, debugTools: opts.debug, maxRuns: opts.maxRuns });
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function data(r: ToolResult): Record<string, unknown> {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data;
}
function newRun(s: GameService, seed = traces.canonicalSeed): string {
  return data(s.createGame({ scenarioId: 'redbank', seed })).runId as string;
}
/** Feed a recorded action list through the tool surface exactly as an agent would. */
function drive(s: GameService, runId: string, actions: Action[]): void {
  for (const a of actions) {
    const rev = (data(s.getGameState({ runId })).revision as number);
    const res = a.type === 'END_DAY' ? s.endDay({ runId, expectedRevision: rev }) : s.takeAction({ runId, action: a as never, expectedRevision: rev });
    if (!res.ok) throw new Error(`${JSON.stringify(a)} -> ${res.error.code}: ${res.error.message}`);
  }
}

describe('MCP game service: same engine, same results', () => {
  it('plays a recorded winning line through the tool surface to victory, with the browser engine\'s exact hashes', () => {
    const s = service();
    const runId = newRun(s);
    drive(s, runId, traces.witnessBridge.actions);
    const res = data(s.getResults({ runId }));
    expect(res.result).toBe('victory');
    const ver = res.verification as { stateHash: string; eventHash: string };
    const direct = replayRun({ scenarioId: 'redbank', seed: traces.canonicalSeed, difficulty: 'normal', actions: traces.witnessBridge.actions });
    expect(ver.stateHash).toBe(stateHash(direct.state));
    expect(ver.eventHash).toBe(eventHash(direct.state));
    expect(ver.stateHash).toBe(traces.witnessBridge.stateHash);
    // and the replay the service exports is accepted by the engine unchanged
    const rep = data(s.exportReplay({ runId })).replay as { scenarioId: string; seed: number; difficulty: 'normal'; actions: Action[] };
    expect(stateHash(replayRun(rep).state)).toBe(ver.stateHash);
  });

  it('start, inspect, seed, end a day, see a law form, and lose by doing nothing', () => {
    const s = service();
    const created = data(s.createGame({ scenarioId: 'redbank', seed: 1 }));
    const runId = created.runId as string;
    expect(created.day).toBe(1);
    expect((created.starters as unknown[]).length).toBe(2);
    expect(data(s.inspectMap({ runId })).landmarks).toBeTruthy();
    expect(data(s.inspectClaim({ runId, claimId: 'bridge_stands_watched' })).claim).toBeTruthy();
    expect(data(s.inspectVillager({ runId, villagerId: 'ivo' })).villager).toBeTruthy();
    expect(s.takeAction({ runId, action: { type: 'PICK_STARTER', claim: 'bridge_stands_watched' } }).ok).toBe(true);
    const seeded = data(s.takeAction({ runId, action: { type: 'SEED', claim: 'bridge_stands_watched', target: 'mara' } }));
    expect(seeded.remainingInfluence).toBe(2);
    expect((seeded.events as { code: string }[]).some((e) => e.code === 'RUMOR_SEEDED')).toBe(true);
    const day = data(s.endDay({ runId }));
    expect(day.finished).toBe(false);
    expect(((day.next as { day: number }).day)).toBe(2);
    // not finished: no debrief yet
    const early = s.getResults({ runId });
    expect(!early.ok && early.error.code).toBe('NOT_FINISHED');
    for (let i = 0; i < 6; i++) s.endDay({ runId });
    const end = data(s.getResults({ runId }));
    expect(end.result).toBe('defeat');
    expect((end.causalChains as unknown[]).length + (end.missed as unknown[]).length).toBeGreaterThan(0);
    expect(end.whatIf).toBeUndefined(); // the slow replay search only runs when asked for
  });

  it('a challenge aimed at a rumour that does not exist says which rival rumours do', () => {
    const s = service();
    const runId = newRun(s, 1);
    s.takeAction({ runId, action: { type: 'PICK_STARTER', claim: 'bridge_stands_watched' } });
    const r = s.takeAction({ runId, action: { type: 'COUNTER', claim: 'bridge_stands_watched', against: 'no_such_rumour', target: 'ivo' } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('BAD_CLAIM');
      expect(r.error.message).toContain('crowds_break_bridges');
      expect(JSON.stringify(r.error.alternatives)).toContain('crowds_break_bridges');
    }
  });

  it('end_day carries the same morning report as the browser: who the story reached, in plain words', () => {
    const s = service();
    const runId = newRun(s, 1);
    s.takeAction({ runId, action: { type: 'PICK_STARTER', claim: 'river_fears_fire' } });
    s.takeAction({ runId, action: { type: 'SEED', claim: 'river_fears_fire', target: 'ivo' } });
    const day = data(s.endDay({ runId }));
    expect(day.headline).toBe('Your story is spreading.');
    const story = day.story as string[];
    expect(story[0]).toContain('River fears fire');
    expect(story[0]).toContain('Ivo');
  });

  it('get_results with whatIf names the last day a lost run could still have been saved, and the replay it gives is accepted by the engine', () => {
    const s = service();
    const runId = newRun(s, 1);
    s.takeAction({ runId, action: { type: 'PICK_STARTER', claim: 'bridge_stands_watched' } });
    for (let i = 0; i < 7; i++) s.endDay({ runId });
    const end = data(s.getResults({ runId, whatIf: true }));
    expect(end.result).toBe('defeat');
    const w = end.whatIf as { lastDayItCouldStillBeSaved: { day: number; youDid: string[]; insteadDo: string[]; survivedWith: { alive: number } } | null; plansTried: string[]; note: string };
    expect(w.plansTried.length).toBeGreaterThan(0);
    expect(w.note).toMatch(/not that it was easy to see/);
    expect(w.lastDayItCouldStillBeSaved).not.toBeNull();
    expect(w.lastDayItCouldStillBeSaved!.insteadDo.length).toBeGreaterThan(0);
    expect(w.lastDayItCouldStillBeSaved!.survivedWith.alive).toBeGreaterThanOrEqual(12);
  });
});

describe('MCP game service: invalid, stale, duplicate and unauthorized calls change nothing', () => {
  it('unaffordable, illegal, junk-target, wrong-phase and out-of-order calls leave the run untouched', () => {
    const s = service();
    const runId = newRun(s);
    const before = s.state(runId)!;
    const h0 = stateHash(before);
    const bad: { action: unknown }[] = [
      { action: { type: 'SEED', claim: 'bridge_stands_watched', target: 'ivo' } }, // opening story not chosen yet
      { action: { type: 'PICK_STARTER', claim: 'no_such_claim' } },
    ];
    for (const b of bad) {
      const r = s.takeAction({ runId, action: b.action as never });
      expect(r.ok, JSON.stringify(b)).toBe(false);
    }
    expect(stateHash(s.state(runId)!)).toBe(h0);
    s.takeAction({ runId, action: { type: 'PICK_STARTER', claim: 'river_fears_fire' } });
    const afterPick = stateHash(s.state(runId)!);
    for (const a of [
      { type: 'SEED', claim: 'river_fears_fire', target: 'nobody' },
      { type: 'MESSENGER', claim: 'river_fears_fire', from: 'ivo', to: 'mara' }, // not a believer yet
      { type: 'RITUAL', ritual: 'nope', landmark: 'nowhere' },
      { type: 'GATHER', claim: 'river_fears_fire', site: 'nowhere' },
    ] as const) {
      const r = s.takeAction({ runId, action: a as never });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message.length).toBeGreaterThan(5);
    }
    expect(stateHash(s.state(runId)!)).toBe(afterPick);
    expect(data(s.getGameState({ runId })).revision).toBe(1);
  });

  it('cannot overspend Influence: the browser\'s budget applies to agents too', () => {
    const s = service();
    const runId = newRun(s);
    s.takeAction({ runId, action: { type: 'PICK_STARTER', claim: 'river_fears_fire' } });
    const names = ['ivo', 'mara', 'bram', 'nell', 'tilly'];
    let accepted = 0;
    for (const n of names) if (s.takeAction({ runId, action: { type: 'SEED', claim: 'river_fears_fire', target: n } }).ok) accepted++;
    expect(accepted).toBe(3); // three Influence on day 1
    const over = s.takeAction({ runId, action: { type: 'SEED', claim: 'river_fears_fire', target: 'pip' } });
    expect(!over.ok && over.error.code).toBe('NO_INFLUENCE');
    expect(data(s.getGameState({ runId })).influence).toEqual({ remaining: 0, max: 5, perDay: 3 });
  });

  it('a stale revision is refused and a duplicate idempotency key never acts twice', () => {
    const s = service();
    const runId = newRun(s);
    s.takeAction({ runId, action: { type: 'PICK_STARTER', claim: 'bridge_stands_watched' } });
    const rev = data(s.getGameState({ runId })).revision as number;
    // two clients read revision `rev`; the first ends the day, the second must not silently overwrite
    const first = s.endDay({ runId, expectedRevision: rev, idempotencyKey: 'k1' });
    expect(first.ok).toBe(true);
    const second = s.endDay({ runId, expectedRevision: rev });
    expect(!second.ok && second.error.code).toBe('STALE_REVISION');
    expect(!second.ok && second.error.currentRevision).toBe(rev + 1);
    expect(data(s.getGameState({ runId })).day).toBe(2);
    // a retried request (same key) returns the stored answer and does not advance a second day
    const retry = s.endDay({ runId, expectedRevision: rev, idempotencyKey: 'k1' });
    expect(retry.ok && retry.data.replayedFromIdempotencyKey).toBe(true);
    expect(data(s.getGameState({ runId })).day).toBe(2);
    const t1 = s.takeAction({ runId, action: { type: 'SEED', claim: 'bridge_stands_watched', target: 'mara' }, idempotencyKey: 'seed-1' });
    const t2 = s.takeAction({ runId, action: { type: 'SEED', claim: 'bridge_stands_watched', target: 'mara' }, idempotencyKey: 'seed-1' });
    expect(t1.ok && t2.ok).toBe(true);
    expect(data(s.getGameState({ runId })).influence).toMatchObject({ remaining: 5 - 1 });
  });

  it('refuses ids that are not run ids (including path traversal) and unknown runs', () => {
    const s = service({ home: 'tmp' });
    for (const bad of ['../../etc/passwd', 'r_../../x', 'r_' + 'g'.repeat(32), '', 'x'.repeat(200)]) {
      const r = s.getGameState({ runId: bad });
      expect(!r.ok && ['BAD_RUN_ID', 'UNKNOWN_RUN'].includes(r.error.code), bad).toBe(true);
    }
    expect(!s.getGameState({ runId: 'r_' + '0'.repeat(32) }).ok).toBe(true);
  });

  it('keeps at most the configured number of runs', () => {
    const s = service({ maxRuns: 2 });
    newRun(s);
    newRun(s);
    const r = s.createGame({ scenarioId: 'redbank', seed: 3 });
    expect(!r.ok && r.error.code).toBe('RUN_LIMIT');
  });
});

describe('MCP game service: no hidden state', () => {
  it('get_game_state never contains private convictions; inspect_villager masks them until scouted or spoken to', () => {
    const s = service();
    const runId = newRun(s);
    s.takeAction({ runId, action: { type: 'PICK_STARTER', claim: 'river_fears_fire' } });
    const state = JSON.stringify(data(s.getGameState({ runId, detail: 'full' })));
    expect(state).not.toMatch(/"beliefs"|"conv"|"keeperTrust"|"traits"/);
    const hidden = data(s.inspectVillager({ runId, villagerId: 'hester' })).villager as { scouted: boolean; beliefs: { conv: number | null }[] };
    expect(hidden.scouted).toBe(false);
    for (const b of hidden.beliefs) expect(b.conv).toBeNull();
    s.takeAction({ runId, action: { type: 'SCOUT', target: 'hester' } });
    const seen = data(s.inspectVillager({ runId, villagerId: 'hester' })).villager as { scouted: boolean };
    expect(seen.scouted).toBe(true);
    // the free scout is the only free action; the next one costs Influence like in the browser
    const again = data(s.takeAction({ runId, action: { type: 'SCOUT', target: 'mara' } }));
    expect(again.cost).toBe(1);
  });

  it('the debug dump does not exist unless the server is started with debug tools, and then it is flagged', () => {
    const plain = service();
    const r1 = plain.debugDump({ runId: newRun(plain) });
    expect(!r1.ok && r1.error.code).toBe('DEBUG_OFF');
    const dbg = service({ debug: true });
    const r2 = dbg.debugDump({ runId: newRun(dbg) });
    expect(r2.ok && r2.text).toMatch(/DEBUG/);
  });

  it('the server code uses no network or process-spawning module and needs no key', () => {
    for (const f of ['service.ts', 'server.ts', 'guide.ts']) {
      const src = readFileSync(new URL(`../../mcp/${f}`, import.meta.url), 'utf8');
      for (const banned of ['node:http', 'node:https', 'node:net', 'node:dgram', 'child_process', 'fetch(', 'XMLHttpRequest', 'eval(', 'new Function', 'API_KEY', 'ANTHROPIC', 'OPENAI']) expect(src.includes(banned), `${f} must not contain ${banned}`).toBe(false);
    }
  });
});

describe('MCP game service: persistence, handoff and coaching', () => {
  it('a server restart does not lose a run, and a tampered run file is refused', () => {
    const home = mkdtempSync(join(tmpdir(), 'be-mcp-'));
    dirs.push(home);
    const a = new GameService({ home });
    const runId = newRun(a);
    drive(a, runId, traces.witnessBridge.actions.slice(0, 12));
    const before = JSON.stringify(data(a.getGameState({ runId })));
    const beforeHash = stateHash(a.state(runId)!);
    const b = new GameService({ home }); // a fresh process reading the same directory
    expect(JSON.stringify(data(b.getGameState({ runId })))).toBe(before);
    expect(stateHash(b.state(runId)!)).toBe(beforeHash);
    // keep playing after the restart: the log still replays
    drive(b, runId, traces.witnessBridge.actions.slice(12));
    expect(data(b.getResults({ runId })).result).toBe('victory');
    // tamper: change the saved state but not the action log
    const f = join(home, 'runs', `${runId}.json`);
    const raw = JSON.parse(readFileSync(f, 'utf8')) as { state: string };
    raw.state = raw.state.replace(/"food":\d+/, '"food":99');
    writeFileSync(f, JSON.stringify(raw));
    const c = new GameService({ home });
    const bad = c.getGameState({ runId });
    expect(!bad.ok && bad.error.code).toBe('UNKNOWN_RUN');
    expect(readdirSync(join(home, 'runs')).some((x) => x.endsWith('.tmp'))).toBe(false);
  });

  it('a replay and a run file say what they were recorded under, and a run recorded under other versions is refused with the reason, not replayed into another result', () => {
    const home = mkdtempSync(join(tmpdir(), 'be-mcp-'));
    dirs.push(home);
    const a = new GameService({ home });
    const runId = newRun(a);
    drive(a, runId, traces.witnessBridge.actions.slice(0, 8));
    const rep = data(a.exportReplay({ runId }));
    const versions = rep.versions as { rules: string; schema: number; generator: number; beliefLanguage: number; start: string };
    expect(versions).toEqual({ rules: rep.rulesVersion, schema: expect.any(Number), generator: expect.any(Number), beliefLanguage: expect.any(Number), start: expect.stringMatching(/^[0-9a-f]{14}$/) });
    const f = join(home, 'runs', `${runId}.json`);
    const file = JSON.parse(readFileSync(f, 'utf8')) as { versions: typeof versions };
    expect(file.versions).toEqual(versions);
    // the opening state is a fingerprint of the chapter itself: another seed is another start
    const other = data(a.exportReplay({ runId: newRun(a, traces.canonicalSeed + 1) })).versions as typeof versions;
    expect(other.start).not.toBe(versions.start);

    // each kind of difference is named, the file is left as it was, and nothing is replayed
    for (const [field, value, words] of [['rules', '0.9.0', 'rules 0.9.0'], ['beliefLanguage', 99, 'belief language 99'], ['start', '00000000000000', 'opening state']] as const) {
      const raw = JSON.parse(readFileSync(f, 'utf8')) as { versions: Record<string, unknown> };
      const original = JSON.stringify(raw);
      raw.versions[field] = value;
      writeFileSync(f, JSON.stringify(raw));
      const edited = readFileSync(f, 'utf8');
      const r = new GameService({ home }).getGameState({ runId });
      expect(!r.ok && r.error.code, field).toBe('RUN_VERSION_MISMATCH');
      expect(!r.ok && r.error.message, field).toContain(words);
      expect(readFileSync(f, 'utf8'), 'the file is not touched').toBe(edited);
      writeFileSync(f, original);
    }
    // a file written before version stamps existed still loads: it is judged by its replay alone
    const old = JSON.parse(readFileSync(f, 'utf8')) as { versions?: unknown };
    delete old.versions;
    writeFileSync(f, JSON.stringify(old));
    expect(new GameService({ home }).getGameState({ runId }).ok).toBe(true);
  });

  it('coach mode is read-only until control is granted; import and export hand a browser save back and forth', () => {
    const s = service();
    const g = GameSession.create({ scenarioId: 'redbank', seed: 5 });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    g.act({ type: 'SEED', claim: 'river_fears_fire', target: 'ivo' });
    const imported = data(s.importGame({ saveJson: serializeRun(g.state) }));
    const runId = imported.runId as string;
    expect(imported.controller).toBe('coach');
    const blocked = s.takeAction({ runId, action: { type: 'SEED', claim: 'river_fears_fire', target: 'mara' } });
    expect(!blocked.ok && blocked.error.code).toBe('READ_ONLY');
    expect(!s.endDay({ runId }).ok).toBe(true);
    // read-only tools work: the agent can coach
    expect(s.compareActions({ runId }).ok).toBe(true);
    expect(s.grantControl({ runId }).ok).toBe(true);
    expect(s.takeAction({ runId, action: { type: 'SEED', claim: 'river_fears_fire', target: 'mara' } }).ok).toBe(true);
    const back = data(s.exportGame({ runId })).saveJson as string;
    const g2 = GameSession.create({ scenarioId: 'redbank', seed: 5 });
    g2.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    g2.act({ type: 'SEED', claim: 'river_fears_fire', target: 'ivo' });
    g2.act({ type: 'SEED', claim: 'river_fears_fire', target: 'mara' });
    expect(stateHash(JSON.parse(back).state)).toBe(stateHash(g2.state));
    for (const junk of ['not json', '{}', '{"format":"belief-engine-save","schemaVersion":99,"state":{}}']) expect(s.importGame({ saveJson: junk }).ok).toBe(false);
  });

  it('an imported run still verifies after a restart (its replay starts at the import)', () => {
    const home = mkdtempSync(join(tmpdir(), 'be-mcp-'));
    dirs.push(home);
    const a = new GameService({ home });
    const g = GameSession.create({ scenarioId: 'harvest', seed: 2 });
    g.act({ type: 'PICK_STARTER', claim: 'moonlight_ripens_grain' });
    const runId = data(a.importGame({ saveJson: serializeRun(g.state), controller: 'delegate' })).runId as string;
    expect(a.takeAction({ runId, action: { type: 'SEED', claim: 'moonlight_ripens_grain', target: 'nessa' } }).ok).toBe(true);
    expect(a.endDay({ runId }).ok).toBe(true);
    const hash = stateHash(a.state(runId)!);
    expect(stateHash(new GameService({ home }).state(runId)!)).toBe(hash);
  });
});

describe('MCP game service: other villages and tools', () => {
  it('lists the story chapters and how to start generated villages, and builds a generated village from a seed', () => {
    const s = service();
    const list = data(s.listScenarios());
    expect((list.scenarios as { id: string }[]).map((x) => x.id).sort()).toEqual(['ashwood', 'harvest', 'redbank']);
    const a = data(s.createGame({ mode: 'expedition', seed: 1234 }));
    const b = data(s.createGame({ mode: 'expedition', seed: 1234 }));
    expect((a.scenario as { id: string }).id).toBe('x1.1234');
    expect(a.briefing).toEqual(b.briefing);
    const bad = s.createGame({ mode: 'expedition', seed: -4 });
    expect(!bad.ok && bad.error.code).toBe('BAD_SEED');
    const unknown = s.createGame({ scenarioId: 'atlantis' });
    expect(!unknown.ok && unknown.error.code).toBe('BAD_SCENARIO');
  });

  it('list_actions, compare_possible_actions and get_history are bounded and consistent with the engine', () => {
    const s = service();
    const runId = newRun(s);
    s.takeAction({ runId, action: { type: 'PICK_STARTER', claim: 'bridge_stands_watched' } });
    const la = data(s.listActions({ runId, limit: 5 }));
    expect((la.actions as unknown[]).length).toBeLessThanOrEqual(5);
    expect(la.total as number).toBeGreaterThan(5);
    const mara = data(s.listActions({ runId, targetId: 'mara' }));
    for (const a of mara.actions as { action: { target?: string; from?: string; to?: string } }[]) expect([a.action.target, a.action.from, a.action.to].includes('mara')).toBe(true);
    const cmp = data(s.compareActions({ runId, top: 3 }));
    expect((cmp.comparison as unknown[]).length).toBe(3);
    // an agent cannot smuggle an action through compare: it is a dry run
    const h = stateHash(s.state(runId)!);
    s.compareActions({ runId, actions: [{ type: 'SEED', claim: 'bridge_stands_watched', target: 'mara' }] });
    expect(stateHash(s.state(runId)!)).toBe(h);
    s.endDay({ runId });
    const hist = data(s.getHistory({ runId, minImportance: 1, limit: 3 }));
    expect((hist.events as unknown[]).length).toBeLessThanOrEqual(3);
    expect(hist.hasMore).toBe(true);
  });

  it('retry_or_new_game gives a distinct run with no carried-over state', () => {
    const s = service();
    const runId = newRun(s);
    drive(s, runId, traces.noop.actions);
    const again = data(s.retryOrNew({ runId, reuseSeed: true }));
    expect(again.runId).not.toBe(runId);
    expect(again.day).toBe(1);
    expect(again.seed).toBe(traces.canonicalSeed);
    expect(((again.influence) as { remaining: number }).remaining).toBe(3);
    const fresh = data(s.retryOrNew({ runId }));
    expect(fresh.seed).not.toBe(undefined);
    expect(data(s.getResults({ runId })).result).toBe('defeat'); // the old run is untouched
  });
});
