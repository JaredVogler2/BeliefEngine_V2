/**
 * Phase 16: Generative Reality at scale, with stored model outputs and no provider.
 *
 * Each run is played by one of the V2 policies (scripts/tournament-v2.ts). Every morning the villagers due to think are put to the
 * scripted model stand-in through the server's own task code (the prompt, the stand-in's answer, the server's checks) and the
 * accepted decisions reach the engine as NPC_DECIDE, as the online path sends them. Every belief a policy writes is read again by
 * the stand-in (the interpret-v2 task, then the browser's own rebuild, `fromWire`) and written with that reading when it is the
 * same law. The finished run's action log, which now stores every model output the run used, is then replayed from the run's
 * options alone, and must reach the same state and event hashes with a ledger identical to the one kept during play.
 *
 * `fetch` is replaced by a function that throws: nothing here can reach a network. MOCK ONLY: the stand-in runs no model, so this
 * measures the plumbing, the engine's checks and determinism at scale, never a model's judgement.
 *
 *   npm run test:sim:v2                                   three chapters x every policy x 8 seeds, plus generated villages
 *   npx tsx scripts/sim-v2.ts --seeds 30 --villages 40 --publish   and writes docs/data/sim-v2/REPORT.md
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { GameSession, checkRun, eventHash, stateHash } from '../src/engine/index.ts';
import { REALITY_POLICIES, realityPolicyById } from '../src/engine/ai/bots/reality.ts';
import { replayRun } from '../src/engine/core/replay.ts';
import type { Action, CreateRunOptions, NpcChoiceInput, RunState } from '../src/engine/core/types.ts';
import { expeditionId } from '../src/engine/gen/expedition.ts';
import { buildNpcRequest } from '../src/engine/mind/request.ts';
import { REALITY_LANG } from '../src/engine/reality/ontology.ts';
import { runRef } from '../src/ai/client.ts';
import { fromWire } from '../src/engine/reality/wire.ts';
import { demoInterpretV2, interpretV2Prompt, stampId, toWireV2, type InterpretV2Request } from '../server/ai/tasks/interpret-v2.ts';
import { NPC_PROMPT, demoNpc, npcPrompt, validateDecisions, type NpcRequest } from '../server/ai/tasks/npc.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};

globalThis.fetch = (() => {
  throw new Error('the simulation never calls the network');
}) as typeof fetch;

/** what the recorded inputs say produced them: the scripted stand-in, never a real model id */
const STAND_IN = 'mock/scripted-stand-in';
const seeds = Number(arg('seeds', '8'));
const villages = Number(arg('villages', '24'));
const chapters = arg('scenarios', 'redbank,harvest,ashwood').split(',');
const out = arg('out', join('tmp', 'sim-v2'));
const publish = args.includes('--publish');

interface Row {
  scenario: string;
  seed: number;
  policy: string;
  mode: 'chronicle' | 'lab' | 'living';
  result: string;
  days: number;
  modelDecisions: number;
  decisionsRefusedByServer: number;
  modelReadings: number;
  offlineReadings: number;
  ledgerEntries: number;
  replayed: boolean;
  problem: string | null;
  ms: number;
}

/** The stand-in reads a sentence as the server would answer it; the engine rebuilds it against the live run. */
function modelReading(s: RunState, text: string): RunState['claims'][number]['def'] | null {
  const req: InterpretV2Request = { v: 2, text, lang: REALITY_LANG, scenario: { id: s.scenarioId, seed: s.seed, lab: !!s.v2?.lab }, region: null, day: s.day, run: runRef(s) } as InterpretV2Request;
  const answer = demoInterpretV2(interpretV2Prompt(text, req, s));
  const wire = toWireV2(answer, { text, state: s, day: s.day, modelId: STAND_IN, interpretationId: null });
  if (!wire) return null;
  const reading = fromWire(s, stampId(wire, `sim-${s.seed}-${s.day}-${s.nextEventId}`));
  const list = reading.kind === 'supported' || reading.kind === 'partial' ? reading.candidates : [];
  for (const c of list) if (c.build.ok) return c.build.draft.claim;
  return null;
}

const sameLaw = (a: NonNullable<RunState['claims'][number]['def']>, b: NonNullable<RunState['claims'][number]['def']>) =>
  JSON.stringify({ r: a.reality?.ast.regions, c: a.reality?.ast.clauses }) === JSON.stringify({ r: b.reality?.ast.regions, c: b.reality?.ast.clauses });

function play(opts: CreateRunOptions, policyId: string, mode: Row['mode']): Row {
  const t0 = performance.now();
  const g = GameSession.create(opts);
  const policy = realityPolicyById(policyId);
  const row: Row = { scenario: opts.scenarioId, seed: opts.seed, policy: policyId, mode, result: 'none', days: 0, modelDecisions: 0, decisionsRefusedByServer: 0, modelReadings: 0, offlineReadings: 0, ledgerEntries: 0, replayed: false, problem: null, ms: 0 };
  // every belief the policy writes goes through the stand-in first, as an online player's would
  const act = g.act.bind(g);
  g.act = (a: Action) => {
    if (a.type === 'COMPOSE' && a.claim.reality && a.claim.reality.ast.source.reader === 'offline-v2') {
      const m = modelReading(g.state, a.claim.reality.ast.text);
      if (m && sameLaw(m, a.claim)) {
        row.modelReadings++;
        return act({ ...a, claim: m, meta: { provider: 'mock', model: STAND_IN, tier: 'fast', promptVersion: m.reality!.ast.source.prompt ?? undefined, id: m.reality!.ast.source.id ?? undefined, latencyMs: 0, cached: false, costUsd: 0 } });
      }
      row.offlineReadings++;
    }
    return act(a);
  };
  for (let guard = 0; !g.state.outcome && guard < 60; guard++) {
    // the antagonist proposes its own villager decisions; every other run asks the stand-in each morning
    if (policyId !== 'rival-antagonist') {
      const req = buildNpcRequest(g.state, `sim-${opts.scenarioId}-${opts.seed}`);
      if (req) {
        const v = validateDecisions(req as unknown as NpcRequest, demoNpc(npcPrompt(req as unknown as NpcRequest)));
        row.decisionsRefusedByServer += v.rejected.length;
        if (v.accepted.length) {
          const decisions: NpcChoiceInput[] = v.accepted.map((d) => ({ citizenId: d.citizenId, intent: d.intent, target: d.target, claimId: d.claimId, dialogue: d.dialogue ?? null, cites: d.cites, tone: d.tone, approach: d.approach, confidence: d.confidence, thought: d.thought ?? '' }));
          const r = act({ type: 'NPC_DECIDE', rev: g.state.nextEventId, decisions, model: STAND_IN, id: `${NPC_PROMPT}/${opts.seed}/${g.state.day}`, meta: { provider: 'mock', model: STAND_IN, tier: 'fast', promptVersion: NPC_PROMPT, latencyMs: 0, cached: false, costUsd: 0 } });
          if (r.ok) row.modelDecisions += decisions.length;
        }
      }
    }
    policy.playDay(g);
  }
  row.result = g.state.outcome?.result ?? 'unfinished';
  row.days = g.state.day;
  row.ledgerEntries = g.ledger.entries.length;
  // the stored outputs, and nothing else: options + action log → the same run, with an identical record of its inputs
  const r = replayRun({ ...opts, actions: g.log });
  const { check } = checkRun(g.state, g.ledger);
  if (r.rejected.length) row.problem = `replay refused action ${r.rejected[0].index}`;
  else if (r.stateHash !== stateHash(g.state) || r.eventHash !== eventHash(g.state)) row.problem = 'replay ended elsewhere';
  else if (!check.ok) row.problem = `ledger: ${check.code}`;
  row.replayed = row.problem === null;
  row.ms = Math.round(performance.now() - t0);
  return row;
}

const rows: Row[] = [];
const t0 = performance.now();
const policies = REALITY_POLICIES.map((p) => p.id);
for (const scenario of chapters)
  for (const policy of policies)
    for (let seed = 1; seed <= seeds; seed++) rows.push(play({ scenarioId: scenario, seed, difficulty: 'normal', mode: 'story', reality: true }, policy, 'chronicle'));
// the Reality Lab and the Living Village on the first chapter (the Living Village writes nothing: villagers only)
for (let seed = 1; seed <= seeds; seed++) {
  rows.push(play({ scenarioId: 'redbank', seed, difficulty: 'normal', mode: 'story', realityLab: true }, 'inventive-compound', 'lab'));
  rows.push(play({ scenarioId: 'redbank', seed, difficulty: 'normal', mode: 'story', reality: true, living: true }, 'noop', 'living'));
}
// generated villages: each a different map, people and twists
for (let n = 1; n <= villages; n++) rows.push(play({ scenarioId: expeditionId(n), seed: n, difficulty: 'normal', mode: 'expedition', reality: true }, n % 2 ? 'noop' : 'spam-broad', 'chronicle'));
const ms = Math.round(performance.now() - t0);

const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
const failures = rows.filter((r) => !r.replayed);
const totals = {
  runs: rows.length,
  states: sum((r) => r.days),
  modelDecisions: sum((r) => r.modelDecisions),
  decisionsRefusedByServer: sum((r) => r.decisionsRefusedByServer),
  modelReadings: sum((r) => r.modelReadings),
  offlineReadings: sum((r) => r.offlineReadings),
  ledgerEntries: sum((r) => r.ledgerEntries),
  replayedExactly: rows.length - failures.length,
  victories: rows.filter((r) => r.result === 'victory').length,
  defeats: rows.filter((r) => r.result === 'defeat').length,
  generatedVillages: villages,
  ms,
};
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'rows.json'), JSON.stringify(rows, null, 1));
const byPolicy = policies.map((p) => {
  const rs = rows.filter((r) => r.policy === p && r.mode === 'chronicle' && chapters.includes(r.scenario));
  return `| ${p} | ${rs.length} | ${rs.filter((r) => r.result === 'victory').length} | ${rs.reduce((a, r) => a + r.modelDecisions, 0)} | ${rs.reduce((a, r) => a + r.modelReadings, 0)} | ${rs.filter((r) => r.replayed).length} |`;
});
const md = [
  '# Generative Reality at scale, with stored model outputs (phase 16)',
  '',
  `\`npx tsx scripts/sim-v2.ts --seeds ${seeds} --villages ${villages}\`, ${new Date().toISOString().slice(0, 10)}. **MOCK ONLY**: every "model" output is the scripted stand-in's`,
  '(no model was called; `fetch` throws). What this measures: that model-shaped inputs pass the server\'s and the engine\'s checks at scale,',
  'and that a run whose action log stores them replays exactly with no provider. It says nothing about a real model\'s judgement.',
  '',
  '| Measure | Count |',
  '|---|---|',
  `| runs (3 chapters x ${policies.length} policies x ${seeds} seeds, ${seeds} Reality Lab, ${seeds} Living Village, ${villages} generated villages) | ${totals.runs} |`,
  `| simulated days (game states resolved) | ${totals.states} |`,
  `| villager decisions proposed by the stand-in and accepted by the engine | ${totals.modelDecisions} |`,
  `| stand-in decisions the server refused | ${totals.decisionsRefusedByServer} |`,
  `| beliefs written with the stand-in's reading / kept as the offline reader's | ${totals.modelReadings} / ${totals.offlineReadings} |`,
  `| ledger entries (inputs from outside the rules) | ${totals.ledgerEntries} |`,
  `| runs replayed from options + actions to the same state and event hashes, ledger identical | **${totals.replayedExactly} of ${totals.runs}** |`,
  `| victories / defeats | ${totals.victories} / ${totals.defeats} |`,
  `| wall time | ${(ms / 1000).toFixed(1)} s |`,
  '',
  '| Policy (chapters) | runs | wins | stand-in decisions | stand-in readings | replayed exactly |',
  '|---|---|---|---|---|---|',
  ...byPolicy,
  '',
  failures.length ? `Failures:\n\n${failures.map((f) => `- ${f.scenario} seed ${f.seed} ${f.policy} (${f.mode}): ${f.problem}`).join('\n')}` : 'No run failed to replay.',
  '',
].join('\n');
writeFileSync(join(out, 'REPORT.md'), md);
if (publish) {
  mkdirSync(join('docs', 'data', 'sim-v2'), { recursive: true });
  writeFileSync(join('docs', 'data', 'sim-v2', 'REPORT.md'), md);
}
console.log(md);
if (failures.length) process.exit(1);
