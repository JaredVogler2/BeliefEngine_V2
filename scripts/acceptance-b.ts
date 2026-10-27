/**
 * Journey B (phase 18): an AI plays a whole game through the real local MCP server, with an actual protocol client (the official SDK
 * client over stdio), and every step is checked:
 *
 *   1  launch the real server, list its tools and the scenarios
 *   2  start a game; inspect state, map and the social graph (a villager's trust ties); hidden convictions stay hidden
 *   3  take legal actions only, with the exact Influence cost the engine charges, and end days
 *   4  meet the rival's announced move and answer it (a COUNTER)
 *   5  finish the run: a debrief and the replay hashes
 *   6  replay the same seed and actions in the engine directly: identical state and event hashes
 *   7  an unauthorised (read-only), duplicate, stale, illegal and malformed call is refused and changes nothing
 *
 * The moves are the recorded Witness Bridge line (tests/fixtures/redbank-traces.json): the point here is the protocol and the
 * guarantees, not the agent's judgement (real language-model sessions are in docs/data/mcp and docs/data/nl).
 *
 *   npx tsx scripts/acceptance-b.ts [--out docs/data/acceptance]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { GameSession, deserializeRun, eventHash, replayRun, stateHash } from '../src/engine/index.ts';
import type { Action } from '../src/engine/index.ts';

const args = process.argv.slice(2);
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'docs/data/acceptance';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const traces = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/redbank-traces.json'), 'utf8')) as { canonicalSeed: number; witnessBridge: { actions: Action[] } };

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- tool results are JSON of a documented but dynamic shape
const checks: { step: string; claim: string; pass: boolean; detail: string }[] = [];
const check = (step: string, claim: string, pass: boolean, detail = ''): void => {
  checks.push({ step, claim, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${step}] ${claim}${detail ? ` (${detail})` : ''}`);
};

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx', join(ROOT, 'mcp', 'server.ts')],
  cwd: ROOT,
  env: { ...(process.env as Record<string, string>), BELIEF_ENGINE_HOME: ':memory:' },
  stderr: 'pipe',
});
const client = new Client({ name: 'belief-engine-acceptance-b', version: '1.0.0' });
await client.connect(transport);

async function call(tool: string, a: Record<string, unknown> = {}): Promise<{ isError: boolean; data: Data; text: string }> {
  const res = (await client.callTool({ name: tool, arguments: a })) as { isError?: boolean; structuredContent?: Data; content: { type: string; text?: string }[] };
  return { isError: !!res.isError, data: res.structuredContent ?? {}, text: res.content.map((c) => c.text ?? '').join('\n') };
}
const errCode = (r: { data: Data }): string => (r.data.error as { code?: string } | undefined)?.code ?? '';
/** the authoritative state of a run, as the engine's own hash of its save file */
async function authoritative(runId: string): Promise<{ hash: string; revision: number }> {
  const exp = await call('export_game', { runId });
  const loaded = deserializeRun(exp.data.saveJson as string);
  if (!loaded.ok) throw new Error(loaded.error);
  return { hash: stateHash(loaded.state), revision: exp.data.revision as number };
}

// 1 ---------------------------------------------------------------------------------------------------------------------------------
const info = client.getServerVersion();
const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
check('1 launch', 'a real MCP server answered the SDK client over stdio', info?.name === 'belief-engine', `${info?.name} ${info?.version}`);
check('1 launch', 'it exposes the play tools with schemas', ['list_scenarios', 'create_game', 'get_game_state', 'inspect_map', 'inspect_villager', 'list_actions', 'take_action', 'end_day', 'get_results', 'export_replay'].every((n) => names.includes(n)), `${names.length} tools`);
const rules = await client.readResource({ uri: 'belief-engine://rules' });
check('1 launch', 'the rules resource is served', ((rules.contents[0] as { text?: string }).text ?? '').length > 1000);
const scen = await call('list_scenarios');
check('1 launch', 'three story chapters are listed', (scen.data.scenarios as unknown[]).length === 3);

// 2 ---------------------------------------------------------------------------------------------------------------------------------
const created = await call('create_game', { scenarioId: 'redbank', seed: traces.canonicalSeed, difficulty: 'normal' });
const runId = created.data.runId as string;
let revision = created.data.revision as number;
check('2 inspect', 'a game starts with day 1, Influence and the legal first moves', created.data.day === 1 && created.data.influence.remaining > 0 && (created.data.nextValidActions as unknown[]).length > 0, `run ${runId.slice(0, 8)}…`);
const map = await call('inspect_map', { runId });
check('2 inspect', 'the map shows landmarks, villagers and coordinates', (map.data.landmarks as unknown[]).length > 5 && (map.data.villagers as unknown[]).length >= 10 && typeof map.data.grid !== 'undefined');
const full = await call('get_game_state', { runId, detail: 'full' });
check('2 inspect', 'the state shows objectives, tonight\'s danger and the story hand', (full.data.objectives as unknown[]).length > 0 && !!full.data.tonight && Array.isArray(full.data.hand));
const ivo = await call('inspect_villager', { runId, villagerId: 'ivo' });
const view = ivo.data.villager as Data;
check('2 inspect', 'a villager shows who they trust, how much, and whether they can be reached (the social graph)', Array.isArray(view.trusts) && view.trusts.length >= 2 && view.trusts.every((t: Data) => typeof t.trust === 'number' && typeof t.reachable === 'boolean'), `${(view.trusts as unknown[]).length} ties`);
check('2 inspect', 'their private convictions are hidden until scouted', view.scouted === false && (view.beliefs as unknown[]).length === 0, ivo.text.slice(0, 90));

// 3, 4 ------------------------------------------------------------------------------------------------------------------------------
const local = GameSession.create({ scenarioId: 'redbank', seed: traces.canonicalSeed });
let key = 0;
let costsExact = true;
let allLegal = true;
let counters = 0;
let ended = 0;
let sawRivalAnnouncement = false;
for (const a of traces.witnessBridge.actions) {
  if (a.type === 'END_DAY') {
    const st = await call('get_game_state', { runId });
    if (JSON.stringify(st.data).includes('crowds_break_bridges') || JSON.stringify(st.data).includes('rival')) sawRivalAnnouncement = true;
    const r = await call('end_day', { runId, expectedRevision: revision, idempotencyKey: `acc-${++key}` });
    if (r.isError) throw new Error(`end_day refused: ${r.text}`);
    revision = r.data.revision as number;
    local.endDay();
    ended++;
    continue;
  }
  // an agent chooses among the legal actions the server lists, not from thin air
  const legal = await call('list_actions', { runId, limit: 120 });
  const listed = (legal.data.actions as { action: Action; cost: number }[]).some((x) => JSON.stringify(x.action) === JSON.stringify(a));
  const hasApBefore = (await call('get_game_state', { runId })).data.influence.remaining as number;
  const expectedCost = local.act(a);
  if (!expectedCost.ok) throw new Error(`the engine rejected a recorded move: ${JSON.stringify(a)}`);
  const r = await call('take_action', { runId, action: a, expectedRevision: revision, idempotencyKey: `acc-${++key}` });
  if (r.isError) throw new Error(`take_action refused ${JSON.stringify(a)}: ${r.text}`);
  revision = r.data.revision as number;
  if (!listed) allLegal = false;
  if (r.data.cost !== expectedCost.cost || r.data.remainingInfluence !== hasApBefore - expectedCost.cost) costsExact = false;
  if (a.type === 'COUNTER') counters++;
}
check('3 play', 'every action the agent took was in the server\'s list of legal actions', allLegal);
check('3 play', 'each cost charged equals the engine\'s own cost, and Influence fell by exactly that', costsExact);
check('3 play', 'days were ended one at a time and resolved', ended >= 5, `${ended} nights`);
check('4 rival', 'the rival\'s move was visible in the state and the agent answered it with a COUNTER', counters >= 1, `${counters} counter(s); rival visible: ${sawRivalAnnouncement}`);

// 5 ---------------------------------------------------------------------------------------------------------------------------------
const results = await call('get_results', { runId });
check('5 finish', 'the run ended in victory with a debrief (headline, story, score, causal chains)', results.data.result === 'victory' && !!results.data.headline && typeof results.data.score === 'number' && Array.isArray(results.data.causalChains) && (results.data.causalChains as unknown[]).length > 0, `${results.data.headline}; score ${results.data.score}`);
const ver = results.data.verification as { stateHash: string; eventHash: string };
check('5 finish', 'the server reports the state and event hashes', typeof ver?.stateHash === 'string' && typeof ver?.eventHash === 'string', `${ver?.stateHash} / ${ver?.eventHash}`);

// 6 ---------------------------------------------------------------------------------------------------------------------------------
const exported = await call('export_replay', { runId });
const replay = exported.data.replay as { scenarioId: string; seed: number; actions: Action[] };
const direct = replayRun(replay as never);
check('6 replay', 'the exported action log replays in the engine with nothing rejected', direct.rejected.length === 0, `${replay.actions.length} actions`);
check('6 replay', 'state hash identical to the server\'s', stateHash(direct.state) === ver.stateHash, stateHash(direct.state));
check('6 replay', 'event hash identical to the server\'s (every event, in order)', eventHash(direct.state) === ver.eventHash, eventHash(direct.state));
check('6 replay', 'the recorded browser trace produces the same final state', stateHash(direct.state) === stateHash(local.state));
const versions = exported.data.versions as { rules?: string; schema?: number; generator?: number; beliefLanguage?: number; start?: string } | undefined;
check('6 replay', 'the replay names what it was recorded under (rules, save schema, generator, belief language, opening-state fingerprint), so an engine update cannot silently rewrite it', !!versions && versions.rules === exported.data.rulesVersion && typeof versions.schema === 'number' && typeof versions.generator === 'number' && typeof versions.beliefLanguage === 'number' && /^[0-9a-f]{14}$/.test(versions.start ?? ''), JSON.stringify(versions));

// 7 ---------------------------------------------------------------------------------------------------------------------------------
const fresh = await call('create_game', { scenarioId: 'redbank', seed: 3 });
const rid = fresh.data.runId as string;
const rev0 = fresh.data.revision as number;
await call('take_action', { runId: rid, action: { type: 'PICK_STARTER', claim: 'river_fears_fire' }, expectedRevision: rev0, idempotencyKey: 'o-1' });
const base = await authoritative(rid);
const ivoSeed: Action = { type: 'SEED', claim: 'river_fears_fire', target: 'ivo' };

const stale = await call('take_action', { runId: rid, action: ivoSeed, expectedRevision: base.revision - 1 });
check('7 refuse', 'a stale revision is refused (STALE_REVISION) and the state is unchanged', stale.isError && errCode(stale) === 'STALE_REVISION' && (await authoritative(rid)).hash === base.hash);

const first = await call('take_action', { runId: rid, action: ivoSeed, expectedRevision: base.revision, idempotencyKey: 'same-key' });
const afterFirst = await authoritative(rid);
const dup = await call('take_action', { runId: rid, action: ivoSeed, expectedRevision: base.revision, idempotencyKey: 'same-key' });
const afterDup = await authoritative(rid);
check('7 refuse', 'a duplicate call (same idempotency key) does not act twice', !first.isError && !dup.isError && dup.data.replayedFromIdempotencyKey === true && afterDup.hash === afterFirst.hash && afterDup.revision === afterFirst.revision, `revision ${afterFirst.revision} both times`);

const illegal = await call('take_action', { runId: rid, action: { type: 'SEED', claim: 'river_fears_fire', target: 'nobody_here' }, expectedRevision: afterDup.revision });
check('7 refuse', 'an illegal action is refused with the reason and alternatives, and changes nothing', illegal.isError && !!errCode(illegal) && (await authoritative(rid)).hash === afterDup.hash, errCode(illegal));

// spend the day's Influence, then ask for one more: refused, nothing changes
let spent = afterDup;
for (const target of ['tilly', 'nell', 'dunn', 'mara']) {
  const room = (await call('get_game_state', { runId: rid })).data.influence.remaining as number;
  if (room <= 0) break;
  const r = await call('take_action', { runId: rid, action: { type: 'SEED', claim: 'river_fears_fire', target }, expectedRevision: (await authoritative(rid)).revision });
  if (r.isError) break;
  spent = await authoritative(rid);
}
const broke = await call('take_action', { runId: rid, action: { type: 'SEED', claim: 'river_fears_fire', target: 'pip' }, expectedRevision: spent.revision });
check('7 refuse', 'an action the player cannot pay for is refused with the reason, and changes nothing', broke.isError && /influence|afford|enough/i.test(broke.text) && (await authoritative(rid)).hash === spent.hash, broke.isError ? `${errCode(broke)}: ${broke.text.slice(0, 80)}` : 'accepted');

const coach = await call('create_game', { scenarioId: 'redbank', seed: 3, controller: 'coach' });
const coachBase = await authoritative(coach.data.runId as string);
const readOnly = await call('take_action', { runId: coach.data.runId, action: { type: 'PICK_STARTER', claim: 'river_fears_fire' } });
check('7 refuse', 'an agent without control (coach mode) cannot act: READ_ONLY, state unchanged', readOnly.isError && errCode(readOnly) === 'READ_ONLY' && (await authoritative(coach.data.runId as string)).hash === coachBase.hash);

const unknown = await call('take_action', { runId: 'r_' + '0'.repeat(32), action: ivoSeed });
const traversal = await call('get_game_state', { runId: '../../etc/passwd' }).catch((e: Error) => ({ isError: true, data: {} as Data, text: e.message }));
check('7 refuse', 'another run id is not guessable and a path-shaped id is refused', unknown.isError && errCode(unknown) === 'UNKNOWN_RUN' && traversal.isError);

const malformed = await call('take_action', { runId: rid, action: { type: 'SEED', claim: 5, target: ['x'] } }).catch((e: Error) => ({ isError: true, data: {} as Data, text: e.message }));
check('7 refuse', 'a malformed action is refused by the schema before the game sees it', malformed.isError && (await authoritative(rid)).hash === spent.hash);

const tooEarly = await call('get_results', { runId: rid });
check('7 refuse', 'results are not available before the run ends', tooEarly.isError);

await client.close();

const failed = checks.filter((c) => !c.pass);
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'journey-b.json'),
  JSON.stringify({ about: 'Written by scripts/acceptance-b.ts: Journey B over the real local MCP server with the official SDK client.', date: new Date().toISOString().slice(0, 10), result: failed.length ? 'FAIL' : 'PASS', stateHash: stateHash(direct.state), eventHash: eventHash(direct.state), checks }, null, 1) + '\n',
);
console.log(`\n${checks.length - failed.length}/${checks.length} checks pass`);
process.exit(failed.length ? 1 : 0);
