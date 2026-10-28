/*
 * The evaluation (phase 14): npm run eval  (writes docs/data/evals/REPORT.md, report.json and tests/fixtures/npc-cases-1.json)
 *
 * Beliefs: the three labelled reality corpora (332 sentences: supported, partial, ambiguous, unsupported, injections, impossible
 * requests, compounds) read by (a) the offline reader, (b) the MOCK online pipeline (the offline reader reshaped as a model's answer,
 * then the server's schema, conversion and fidelity checks and the client's rebuild: it measures the plumbing, not a model), and
 * (c) V1's composer through the V1 → v2 bridge, as the baseline. V1 saved-belief migration: V1 corpora through astFromV1.
 * Villagers: decision cases from seeded runs, decided by the game's policy and by the MOCK stand-in, judged on legality, memory
 * provenance and persona checks. Latency p50/p95 for everything run here; tokens and cost are list-price ESTIMATES from prompt
 * sizes; win diversity from the phase 11 tournament reports. LIVE: not run (no provider configured).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { GameSession, interpretBelief, type RunState } from '../src/engine/index.ts';
import { astFromV1 } from '../src/engine/reality/v1.ts';
import { validateRealityAst, LIMITS } from '../src/engine/reality/ast.ts';
import { buildRealityClaim } from '../src/engine/reality/build.ts';
import { readBelief, type Reading } from '../src/engine/reality/read.ts';
import { fromWire } from '../src/engine/reality/wire.ts';
import { InterpretV2Output, demoInterpretV2, interpretV2Prompt, interpretV2Tier, toWireV2 } from '../server/ai/tasks/interpret-v2.ts';
import { npcPrompt, type NpcRequest } from '../server/ai/tasks/npc.ts';
import { estimateTokens, priceOf } from '../server/ai/budget.ts';
import { scoreCorpus, v1Reading, type CorpusCase } from './lib/reality-score.ts';
import { casesOf, judge, mockDecisions, policyDecisions, situations, validateChoice, type Judged, type NpcCase } from './lib/npc-cases.ts';

const ROOT = new URL('..', import.meta.url);
const read = (p: string) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const now = () => performance.now();
const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null);
function quantiles(xs: number[]): { p50: number; p95: number; n: number } {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => (s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 100) / 100 : 0);
  return { p50: q(0.5), p95: q(0.95), n: s.length };
}

// ------------------------------------------------------------------------------------------ beliefs

const states = new Map<string, RunState>();
const stateFor = (id: string) => states.get(id) ?? states.set(id, GameSession.create({ scenarioId: id, seed: 1, reality: true }).state).get(id)!;

function mockReading(s: RunState, text: string): Reading {
  const req = { scenario: { id: s.scenarioId, seed: s.seed, lab: !!s.v2?.lab }, region: null };
  const out = InterpretV2Output.parse(demoInterpretV2(interpretV2Prompt(text, req, s)));
  const wire = toWireV2(out, { text, state: s, day: s.day, modelId: 'mock', interpretationId: 'eval' });
  if (!wire) return { kind: 'unsupported', text, reader: 'mock', notes: ['the pipeline left nothing usable'], reasons: [{ id: 'no_mechanic', words: '', why: 'nothing usable' }], alternatives: [] };
  return fromWire(s, wire);
}

const CORPORA = [
  { file: 'tests/fixtures/reality-corpus-1.json', note: 'in-sample (the reader was tuned on it): regression, not accuracy' },
  { file: 'tests/fixtures/reality-corpus-holdout-1.json', note: 'held out once (written by an independent agent), in-sample after its first scoring' },
  { file: 'tests/fixtures/reality-corpus-holdout-2.json', note: 'held out, scored untuned at phase 05' },
];

type Score = ReturnType<typeof scoreCorpus>;
const timed = (f: (s: RunState, t: string) => Reading, ms: number[]) => (s: RunState, t: string) => {
  const t0 = now();
  const r = f(s, t);
  ms.push(now() - t0);
  return r;
};

const beliefRows: { corpus: string; note: string; n: number; reader: string; m: Score['metrics'] }[] = [];
const latency: Record<string, number[]> = { offline: [], mock: [], v1: [] };
let allCases = 0;
const promptChars: number[] = [];
const tiers = { fast: 0, accurate: 0 };
for (const c of CORPORA) {
  const corpus = read(c.file) as { name: string; cases: CorpusCase[] };
  allCases += corpus.cases.length;
  const off = scoreCorpus(corpus.cases, stateFor, timed((s, t) => readBelief(s, t), latency.offline));
  const mock = scoreCorpus(corpus.cases, stateFor, timed(mockReading, latency.mock), 'MOCK online pipeline (offline reader as the model; no model)');
  const v1 = scoreCorpus(corpus.cases, stateFor, timed(v1Reading, latency.v1), 'V1 composer via astFromV1');
  for (const [reader, r] of [['offline', off], ['mock', mock], ['v1', v1]] as const) beliefRows.push({ corpus: corpus.name, note: c.note, n: corpus.cases.length, reader, m: r.metrics });
  for (const k of corpus.cases) {
    const s = stateFor(k.scenario);
    promptChars.push(interpretV2Prompt(k.text, { scenario: { id: s.scenarioId, seed: s.seed, lab: false }, region: null }, s).length);
    tiers[interpretV2Tier(k.text)]++;
  }
}

// ------------------------------------------------------------------------------------------ V1 saved beliefs, migrated

const v1Files = ['tests/fixtures/belief-corpus.json', 'tests/fixtures/belief-holdout.json', 'tests/fixtures/belief-holdout-2.json'];
let v1Drafts = 0;
let v1Valid = 0;
let v1Built = 0;
let v1Untranslated = 0;
for (const f of v1Files)
  for (const k of read(f) as { village: string; text: string }[]) {
    const s = stateFor(k.village);
    for (const d of interpretBelief(s, k.text).drafts) {
      v1Drafts++;
      const t = astFromV1(d.claim);
      if (!t) continue;
      if (t.untranslated.length) v1Untranslated++;
      const v = validateRealityAst(t.ast, LIMITS);
      if (!v.ok) continue;
      v1Valid++;
      if (buildRealityClaim(s, v.ast).ok) v1Built++;
    }
  }

// ------------------------------------------------------------------------------------------ villagers

const sits = situations(['redbank', 'harvest', 'ashwood'], [1, 2, 3, 4]);
const cases: NpcCase[] = [];
const policyJ: Judged[] = [];
const mockJ: Judged[] = [];
const policyMs: number[] = [];
let mockRefusedByServer = 0;
let mockAsked = 0;
const npcPromptChars: number[] = [];
for (const sit of sits) {
  const cs = casesOf(sit);
  cases.push(...cs);
  npcPromptChars.push(npcPrompt(sit.request as unknown as NpcRequest).length);
  const t0 = now();
  const pol = policyDecisions(sit);
  policyMs.push((now() - t0) / Math.max(1, cs.length));
  const mock = mockDecisions(sit);
  mockAsked += cs.length;
  mockRefusedByServer += mock.refusedByServer;
  for (const c of cs) {
    const p = pol.get(c.agent.id);
    if (p) policyJ.push(judge(c, p, validateChoice(sit.state, p)));
    const m = mock.accepted.get(c.agent.id);
    if (m) mockJ.push(judge(c, m, validateChoice(sit.state, m)));
  }
}
const rate = (js: Judged[], f: (j: Judged) => boolean) => ({ n: js.filter(f).length, of: js.length, pct: pct(js.filter(f).length, js.length) });
const npcRows = [
  { reader: 'policy (the game\'s own)', legal: rate(policyJ, (j) => j.legal), provenance: rate(policyJ, (j) => j.provenance), spreadsDisbelieved: rate(policyJ, (j) => j.spreadsDisbelieved), challengesFirm: rate(policyJ, (j) => j.challengesFirm), skepticHearsay: rate(policyJ, (j) => j.skepticHearsay) },
  { reader: 'MOCK stand-in (demoNpc; no model)', legal: rate(mockJ, (j) => j.legal), provenance: rate(mockJ, (j) => j.provenance), spreadsDisbelieved: rate(mockJ, (j) => j.spreadsDisbelieved), challengesFirm: rate(mockJ, (j) => j.challengesFirm), skepticHearsay: rate(mockJ, (j) => j.skepticHearsay) },
];
const illegalWhy = [...new Set(policyJ.concat(mockJ).filter((j) => !j.legal).map((j) => j.why))].slice(0, 5);
// how often each persona check could fire at all: a check with no opportunity proves nothing
const opportunity = {
  spreadsDisbelieved: cases.filter((c) => c.expect.disbelieved.length && c.agent.eligible.some((e) => ['spread', 'persuade', 'stage_evidence'].includes(e.intent) && (e.claims.length === 0 || e.claims.some((x) => c.expect.disbelieved.includes(x))))).length,
  challengesFirm: cases.filter((c) => c.expect.firm.length && c.agent.eligible.some((e) => e.intent === 'challenge' && (e.claims.length === 0 || e.claims.some((x) => c.expect.firm.includes(x))))).length,
  skepticHearsay: cases.filter((c) => c.expect.skeptic && c.agent.eligible.some((e) => e.intent === 'spread')).length,
  skeptics: cases.filter((c) => c.expect.skeptic).length,
  withMemories: cases.filter((c) => c.expect.memories.length > 0).length,
};

// ------------------------------------------------------------------------------------------ cost estimates (not measured)

const fast = 'anthropic/claude-haiku-5.5';
const accurate = 'anthropic/claude-sonnet-5.5';
const meanChars = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const INSTR_BELIEF = 1609;
const INSTR_NPC = 1247;
const est = (model: string, inChars: number, outTokens: number) => {
  const p = priceOf(model);
  return Math.round((estimateTokens(inChars) * p.input + outTokens * p.output) * 1e6) / 1e6;
};
const costs = {
  readingFast: est(fast, INSTR_BELIEF + meanChars(promptChars), 150),
  readingAccurate: est(accurate, INSTR_BELIEF + meanChars(promptChars), 150),
  npcBatchFast: est(fast, INSTR_NPC + meanChars(npcPromptChars), 700),
  tokensPerReading: estimateTokens(INSTR_BELIEF + meanChars(promptChars)),
  tokensPerNpcBatch: estimateTokens(INSTR_NPC + meanChars(npcPromptChars)),
  tierShare: tiers,
};

// ------------------------------------------------------------------------------------------ win diversity (phase 11 tournament)

const diversity = ['redbank', 'harvest', 'ashwood'].map((sc) => {
  const sum = read(`docs/data/tournament-v2/rules3-${sc}/summary.json`) as { seeds: number; cells: { policy: string; wins: number }[] };
  const winners = sum.cells.filter((c) => c.wins > 0);
  return { scenario: sc, seeds: sum.seeds, policiesThatWin: winners.length, of: sum.cells.length, best: winners.sort((a, b) => b.wins - a.wins).slice(0, 3).map((c) => `${c.policy} ${c.wins}/${sum.seeds}`) };
});

// ------------------------------------------------------------------------------------------ write

const report = {
  generated: 'npm run eval',
  live: { run: false, why: 'no provider is configured in this repository; every number here is offline or MOCK' },
  beliefs: { cases: allCases, rows: beliefRows.map((r) => ({ corpus: r.corpus, reader: r.reader, n: r.n, ...r.m })) },
  v1Migration: { corpora: v1Files, drafts: v1Drafts, validAst: v1Valid, buildsHere: v1Built, partlyUntranslated: v1Untranslated },
  npc: { situations: sits.length, cases: cases.length, policyDecisions: policyJ.length, mockAsked, mockAccepted: mockJ.length, mockRefusedByServer, rows: npcRows, opportunity, illegalExamples: illegalWhy },
  latencyMs: { offlineReading: quantiles(latency.offline), mockPipelineReading: quantiles(latency.mock), v1Reading: quantiles(latency.v1), policyDecision: quantiles(policyMs) },
  costEstimates: costs,
  winDiversity: diversity,
};
mkdirSync(new URL('docs/data/evals/', ROOT), { recursive: true });
writeFileSync(new URL('docs/data/evals/report.json', ROOT), JSON.stringify(report, null, 1));
// the corpus on disk: what a model would be told, trimmed for size (memory text clipped, the closest ties only); judging uses ids
const trimmed = cases.map((c) => ({
  ...c,
  agent: {
    ...c.agent,
    moment: { ...c.agent.moment, summary: c.agent.moment.summary.slice(0, 80) },
    memories: [...c.agent.memories].sort((a, b) => b.salience - a.salience || b.day - a.day).slice(0, 6).map((m) => ({ ...m, text: m.text.length > 60 ? `${m.text.slice(0, 59)}…` : m.text })),
    relations: [...c.agent.relations].sort((a, b) => b.trust - a.trust).slice(0, 4),
  },
}));
writeFileSync(new URL('tests/fixtures/npc-cases-1.json', ROOT), JSON.stringify({ name: 'npc-cases-1', generated: 'npm run eval (scripts/lib/npc-cases.ts: redbank, harvest, ashwood × seeds 1-4, evidence-first bot; the 6 most salient memories, clipped to 60 characters, the moment to 80, the 4 closest ties; expect.memories lists every memory id)', cases: trimmed }));

const md: string[] = [];
const P = (x: number | null) => (x === null ? 'n/a' : `${x}%`);
md.push('# Evaluation report (phase 14)', '');
md.push('Generated by `npm run eval` (`scripts/eval.ts`). **LIVE: not run** (no provider is configured): every number is from the offline reader, the game\'s own policy, or a **MOCK** stand-in that runs no model. Mock numbers measure the online pipeline\'s plumbing (schema, conversion, checks, rebuild), never a model\'s understanding.', '');
md.push('## Beliefs: 332 labelled sentences in three corpora', '');
md.push('| Corpus | Reader | Labels right | Supported read faithfully | Unsupported: abstained | Reason named | Hallucinated an effect (false acceptance) | Partial: left-out part named | Ambiguous: choice offered | Injections obeyed | Readings that build here |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of beliefRows) {
  const m = r.m;
  md.push(`| ${r.corpus} (${r.n}) | ${r.reader} | ${m.labelOk}/${r.n} (${P(pct(m.labelOk, r.n))}) | ${m.faithful}/${m.supported} | ${m.abstained}/${m.unsupported} | ${m.reasonOk}/${m.unsupported} | ${m.hallucinated}/${m.unsupported} | ${m.partialNamed}/${m.partial} | ${m.ambiguousOk}/${m.ambiguous} | ${m.injectionObeyed}/${m.injection} | ${m.grounded}/${m.readings} |`);
}
md.push('', 'Corpus notes: ' + CORPORA.map((c) => `\`${c.file.split('/').pop()}\` ${c.note}`).join('; ') + '. V1\'s composer cannot name v2 reasons, so its "reason named" column is not comparable.', '');
md.push('## V1 saved beliefs, migrated', '');
md.push(`V1's three corpora read by V1's composer: ${v1Drafts} beliefs; ${v1Valid} become valid AST v2 through \`astFromV1\` (${P(pct(v1Valid, v1Drafts))}), ${v1Built} build in their village; ${v1Untranslated} carry a part with no v2 equivalent (named in \`untranslated\`).`, '');
md.push('## Villager decisions', '');
md.push(`${cases.length} cases from ${sits.length} mornings of seeded runs (redbank, harvest, ashwood × seeds 1-4, the evidence-first bot playing), saved as \`tests/fixtures/npc-cases-1.json\`: what a model would be told about each villager and the constraints any answer must meet. The MOCK stand-in was asked about ${mockAsked}; the server refused ${mockRefusedByServer} of its decisions and ${mockJ.length} reached the engine.`, '');
md.push('| Decided by | Legal (engine) | Cites only their own memories | Spreads a story they disbelieve | Challenges one they firmly hold | Skeptic spreading hearsay |');
md.push('|---|---|---|---|---|---|');
for (const r of npcRows) md.push(`| ${r.reader} | ${r.legal.n}/${r.legal.of} (${P(r.legal.pct)}) | ${r.provenance.n}/${r.provenance.of} (${P(r.provenance.pct)}) | ${r.spreadsDisbelieved.n} | ${r.challengesFirm.n} | ${r.skepticHearsay.n} |`);
md.push('', `Where each check could fire at all (cases): a disbelieved story with a move to spread it open ${opportunity.spreadsDisbelieved}; a firmly held story with a challenge open ${opportunity.challengesFirm}; a skeptic with spreading open ${opportunity.skepticHearsay} (of ${opportunity.skeptics} skeptics); a villager with memories to cite ${opportunity.withMemories}. Both deciders here are rule-based, so the checks are there for a model's answers (LIVE UNVERIFIED); a check with no opportunity proves nothing.`);
if (illegalWhy.length) md.push('', `Refusals seen: ${illegalWhy.join('; ')}.`);
md.push('', '## Latency (this machine, ms)', '');
md.push('| Step | p50 | p95 | n |', '|---|---|---|---|');
for (const [k, q] of Object.entries(report.latencyMs)) md.push(`| ${k} | ${q.p50} | ${q.p95} | ${q.n} |`);
md.push('', '## Tokens and cost: list-price ESTIMATES, not measured', '');
md.push(`Prompt sizes measured from these corpora and cases (one token per three characters, the service's own estimate): a reading ≈ ${costs.tokensPerReading} input tokens, a six-villager batch ≈ ${costs.tokensPerNpcBatch}. At list prices: a fast reading ≈ $${costs.readingFast}, an accurate one ≈ $${costs.readingAccurate}, a fast villager batch ≈ $${costs.npcBatchFast}. Tier split for these sentences: ${tiers.fast} fast, ${tiers.accurate} accurate. Measured tokens, latency and cost need a provider (LIVE UNVERIFIED).`, '');
md.push('## Win diversity (phase 17 tournament, written-belief rules 3, 30 seeds per chapter)', '');
for (const d of diversity) md.push(`- ${d.scenario}: ${d.policiesThatWin} of ${d.of} policies win at least once; best: ${d.best.join(', ')}.`);
md.push('');
writeFileSync(new URL('docs/data/evals/REPORT.md', ROOT), md.join('\n'));
process.stdout.write(md.join('\n') + '\n');
