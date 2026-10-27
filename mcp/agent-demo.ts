/**
 * A scripted "delegate" agent that plays a whole Belief Engine chapter through the MCP server, as any MCP client would: it spawns
 * the real server over stdio with the official SDK client, reads the rules resource, then plays by calling tools, passing
 * expectedRevision and an idempotencyKey on every write. It is NOT a language model: its judgement is a few lines of heuristics
 * over the exact previews the server returns (what a model would also read). The point is the evidence: a complete run, a
 * readable transcript, and a check that the same actions replayed in the browser engine give the identical state.
 *
 *   npm run mcp:demo -- [--scenario redbank] [--seed 7] [--opening bridge_stands_watched] [--out docs/data/mcp] [--passive]
 *
 * --passive plays no story at all (it only ends days) to show a loss and the what-if analysis.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { replayRun, stateHash, eventHash } from '../src/engine/index.ts';
import type { Action } from '../src/engine/index.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const scenario = arg('scenario', 'redbank');
const seed = Number(arg('seed', '7'));
const opening = arg('opening', '');
const outDir = arg('out', 'docs/data/mcp');
const passive = args.includes('--passive');
const ROOT = fileURLToPath(new URL('..', import.meta.url));

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- tool results are JSON of a documented but dynamic shape
interface Step {
  n: number;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
  revision?: number;
}
const steps: Step[] = [];

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx', join(ROOT, 'mcp', 'server.ts')],
  cwd: ROOT,
  env: { ...(process.env as Record<string, string>), BELIEF_ENGINE_HOME: ':memory:' },
  stderr: 'pipe',
});
const client = new Client({ name: 'belief-engine-demo-agent', version: '1.0.0' });
await client.connect(transport);

async function call(tool: string, a: Record<string, unknown> = {}): Promise<{ ok: boolean; data: Data; text: string }> {
  const res = (await client.callTool({ name: tool, arguments: a })) as { isError?: boolean; structuredContent?: Data; content: { type: string; text?: string }[] };
  const text = res.content.map((c) => c.text ?? '').join('\n');
  const data = res.structuredContent ?? {};
  steps.push({ n: steps.length + 1, tool, args: a, ok: !res.isError, summary: text.split('\n')[0].slice(0, 200), revision: typeof data.revision === 'number' ? data.revision : undefined });
  return { ok: !res.isError, data, text };
}

// 1. what the server says about itself
const rules = await client.readResource({ uri: 'belief-engine://rules' });
const rulesText = (rules.contents[0] as { text?: string }).text ?? '';
const tools = (await client.listTools()).tools.map((t) => t.name);
console.log(`connected: server ${client.getServerVersion()?.name} ${client.getServerVersion()?.version}, ${tools.length} tools, rules resource ${rulesText.length} chars`);

// 2. start a game
const created = await call('create_game', { scenarioId: scenario, seed });
if (!created.ok) throw new Error(created.text);
const runId = created.data.runId as string;
let revision = created.data.revision as number;
let key = 0;
const write = async (tool: string, a: Record<string, unknown>) => {
  const r = await call(tool, { runId, ...a, expectedRevision: revision, idempotencyKey: `demo-${++key}` });
  if (r.ok && typeof r.data.revision === 'number') revision = r.data.revision;
  return r;
};
console.log(`run ${runId}: ${created.data.scenario.name}, seed ${seed}, ${created.data.maxDay} days`);

// 3. play
let story = '';
if (!passive) {
  const starters = (created.data.starters as { claim: string; short: string }[]).map((s) => s.claim);
  story = opening && starters.includes(opening) ? opening : starters[starters.length - 1];
  const p = await write('take_action', { action: { type: 'PICK_STARTER', claim: story } });
  console.log(`opening story: ${story} -> ${p.text.split('\n')[0]}`);
}
let finished = false;
let lastDay = 0;
for (let guard = 0; guard < 80 && !finished; guard++) {
  const st = await call('get_game_state', { runId });
  const day = st.data.day as number;
  if (day !== lastDay) {
    lastDay = day;
    console.log(`day ${day}/${st.data.maxDay}: ${st.data.influence.remaining} Influence; tonight: ${st.data.tonight?.label ?? ''}`);
  }
  if (!passive) {
    // spend Influence on the best exact previews, skipping anything the preview warns about, and never the same action twice a day
    const tried = new Set<string>();
    for (let k = 0; k < 6; k++) {
      const remaining = (await call('get_game_state', { runId })).data.influence.remaining as number;
      if (remaining <= 0) break;
      const cmp = await call('compare_possible_actions', { runId, top: 12 });
      const rows = (cmp.data.comparison ?? []) as { action: Action; ok: boolean; cost: number; perInfluence: number; warnings: string[]; label: string }[];
      // all-in on the opening story: a second, contradicting story only splits the village
      const own = (r: { action: Action }) => !('claim' in r.action) || (r.action as { claim?: string }).claim === story;
      const best = rows.find((r) => r.ok && r.cost <= remaining && r.cost > 0 && r.warnings.length === 0 && r.perInfluence >= 4 && own(r) && !tried.has(JSON.stringify(r.action)));
      if (!best) break;
      tried.add(JSON.stringify(best.action));
      const r = await write('take_action', { action: best.action });
      console.log(`  ${best.label} -> ${r.ok ? r.text.split('\n')[0] : 'refused: ' + r.text.split('\n')[0]}`);
      if (!r.ok) break;
    }
  }
  const end = await write('end_day', {});
  if (!end.ok) throw new Error(`end_day refused: ${end.text}`);
  console.log(`  night ${day}: ${end.data.headline}${(end.data.story as string[] | undefined)?.length ? ' | ' + (end.data.story as string[])[0] : ''}`);
  finished = !!end.data.finished;
}

// 4. results, the replay, and the check against the browser engine
const results = await call('get_results', { runId, whatIf: true });
const replay = await call('export_replay', { runId });
const rep = replay.data.replay as { scenarioId: string; seed: number; difficulty: 'normal'; mode?: 'story'; actions: Action[] };
const local = replayRun(rep as never);
const server = results.data.verification as { stateHash: string; eventHash: string };
const identical = stateHash(local.state) === server.stateHash && eventHash(local.state) === server.eventHash && local.rejected.length === 0;
console.log(`result: ${results.data.result} (${results.data.headline}); score ${results.data.score}, ${rep.actions.length} accepted actions`);
console.log(`browser engine replay: state ${stateHash(local.state)}, events ${eventHash(local.state)} -> ${identical ? 'IDENTICAL to the server' : 'MISMATCH'}`);
if (results.data.whatIf) console.log(`what-if: ${JSON.stringify(results.data.whatIf.lastDayItCouldStillBeSaved ?? 'none found').slice(0, 300)}`);
await client.close();

mkdirSync(outDir, { recursive: true });
const base = join(outDir, `demo-${scenario}-seed${seed}${passive ? '-passive' : ''}`);
const trace = {
  about: 'Written by mcp/agent-demo.ts. A scripted agent played this run through the real MCP server over stdio with the official SDK client. replay.actions replayed in the browser engine reproduce the final state and event hashes.',
  scenario, seed, passive, result: results.data.result, headline: results.data.headline, score: results.data.score,
  verification: { server, browserEngine: { stateHash: stateHash(local.state), eventHash: eventHash(local.state), rejected: local.rejected }, identical },
  toolCalls: steps, replay: rep,
};
writeFileSync(`${base}.json`, JSON.stringify(trace, null, 1) + '\n');
const md = [
  `# MCP demo transcript: ${scenario}, seed ${seed}${passive ? ' (passive control)' : ''}`,
  '',
  `Played by \`mcp/agent-demo.ts\` through the real server over stdio (official SDK client). Not a language model: heuristics over the server's exact previews. Result: **${results.data.result}** (${results.data.headline}), score ${results.data.score}, ${rep.actions.length} accepted actions, ${steps.length} tool calls.`,
  '',
  `Browser-engine replay of the exported action log: state \`${stateHash(local.state)}\`, events \`${eventHash(local.state)}\` -> **${identical ? 'identical to the server' : 'MISMATCH'}**.`,
  '',
  '| # | tool | arguments | result |',
  '| ---: | --- | --- | --- |',
  ...steps.map((s) => `| ${s.n} | \`${s.tool}\` | \`${JSON.stringify(s.args).replace(/\|/g, '/').slice(0, 110)}\` | ${s.ok ? '' : '**error** '}${s.summary.replace(/\|/g, '/')} |`),
  '',
].join('\n');
writeFileSync(`${base}.md`, md);
console.log(`wrote ${base}.json and ${base}.md`);
process.exit(identical ? 0 : 1);
