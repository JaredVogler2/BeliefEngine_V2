/**
 * Headless tournament harness (phase 11). No DOM, no rendering, no network.
 *
 *   npm run test:sim -- --scenario redbank --seeds 1000 --out tmp/tournament/redbank
 *   npm run test:sim -- --smoke                       quick CI benchmark (about a minute), exits 1 on a hard failure
 *   npm run test:sim -- --scenario all --seeds 1000 --oracle 40 --rescue 120 --density 8 --determinism 12 --name baseline --publish
 *   npm run test:sim -- --scenario all --seeds 1000 --name after --compare tmp/tournament/baseline/runs.csv
 *
 * Every policy plays exactly the same seeds (paired), through the same GameSession API a person or an agent uses. Seeds are split
 * across child processes; each child bounds its own memory (--max-heap-mb) and the whole run honours --time-budget.
 *
 * Options
 *   --scenario  redbank | harvest | ashwood | expedition | all (comma list allowed)     default redbank
 *   --seeds N   seeds 1..N per scenario   |  --from A --to B for an explicit range     default 100
 *   --difficulty story|normal|hard        --cap-days N (hard stop per run)            default normal / 60
 *   --policies  comma list of ids, or "all" (the eight mandatory policies)           default all
 *   --oracle N  also run the PRIVILEGED rollout oracle on the first N seeds           default 0
 *   --rescue N  failure-fairness experiment on lost runs among the first N seeds     default 0
 *   --determinism N  repeat the first N seeds of every policy and compare hashes      default 0
 *   --density N decision-density probe on the first N seeds of every policy           default 0
 *   --workers N child processes (default: CPU count, at most 4)    --max-heap-mb N  per child (default 1536)
 *   --time-budget S stop starting new work after S seconds (the report says it is partial)   default 3300
 *   --out DIR   where JSON, CSV and Markdown go (default tmp/tournament/<name>)   --name NAME
 *   --publish   also copy summary.json, REPORT.md and by-policy.csv to docs/data/tournament/<name>/
 *   --fixtures FILE  save representative winning and losing traces as regression fixtures
 *   --compare FILE   paired before/after comparison against an earlier runs.csv
 */
import { spawn } from 'node:child_process';
import { cpus, setPriority } from 'node:os';
import { createInterface } from 'node:readline';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyAction, getAvailableActions } from '../src/engine/core/actions.ts';
import { claimDef } from '../src/engine/core/lookup.ts';
import { getForecast } from '../src/engine/core/selectors.ts';
import { cloneState } from '../src/engine/core/clone.ts';
import { GameSession } from '../src/engine/core/session.ts';
import { RULES_VERSION } from '../src/engine/core/types.ts';
import type { Action, RunState } from '../src/engine/core/types.ts';
import { GEN_VERSION, expeditionId } from '../src/engine/gen/expedition.ts';
import { MANDATORY_POLICIES, ORACLE_ENTRY, forecastRisk, playableClaims, policyById } from '../src/engine/ai/bots/generic.ts';
import { support } from '../src/engine/ai/bots/lawpusher.ts';
import { playInstrumented } from '../src/engine/ai/bots/telemetry.ts';
import { CONTROL, cohortSummary, comparePaired, parseCsv, renderMarkdown, toCsv, type Density, type Row, type Summary } from './lib/tournament-core.ts';

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const flag = (k: string): boolean => args.includes(`--${k}`);

const AUTHORED = ['redbank', 'harvest', 'ashwood'];
const RESCUERS = ['threat-aware', 'evidence-first', 'bridge-builder', 'greedy', 'broadcaster'];

/** The scenario id the engine is given for a report cohort and seed. */
function scenarioIdFor(cohort: string, seed: number): string {
  return cohort === 'expedition' ? expeditionId(seed) : cohort;
}

// ------------------------------------------------------------------ child: play assigned (cohort, seed) jobs

interface ChildConfig {
  policies: string[];
  difficulty: 'story' | 'normal' | 'hard';
  cap: number;
  from: number;
  oracle: number;
  rescue: number;
  determinism: number;
  density: number;
  maxHeapMb: number;
}

/**
 * Decision density. For each sampled planning day, every enabled Influence-costing action is valued by what its exact preview does:
 * the best rise in law support over any story the Keeper can tell, plus three times the drop in forecast risk (the Forecast tab's
 * own homes/people/bridge/food/pens projection). "Positive" options have a value above 0.05; "contested" ones are positive and at least
 * half as good as the best option that day. A day is "forced" when at most one option is contested (an obvious move) and "empty" when
 * no option is positive. These are proxies: they count real alternatives the simulation offers, not whether a person finds them interesting.
 */
function densityOf(starts: RunState[]): Density {
  const d: Density = { days: 0, options: 0, positive: 0, contested: 0, forcedDays: 0, emptyDays: 0, kindsContested: 0 };
  for (const s of starts) {
    if (s.outcome || s.starter === null) continue;
    d.days++;
    const claims = playableClaims(s);
    const base = claims.map((c) => support(s, c, claimDef(s, c).regions));
    const baseRisk = forecastRisk(getForecast(s));
    const vals: { v: number; type: string }[] = [];
    for (const o of getAvailableActions(s)) {
      if (o.cost <= 0) continue;
      d.options++;
      const r = applyAction(s, o.action);
      if (!r.ok) continue;
      let best = 0;
      for (let i = 0; i < claims.length; i++) best = Math.max(best, support(r.state, claims[i], claimDef(s, claims[i]).regions) - base[i]);
      const physical = o.action.type === 'RITUAL' || o.action.type === 'TRADE';
      const drop = physical ? Math.max(0, baseRisk - forecastRisk(getForecast(r.state))) : 0;
      vals.push({ v: best + 3 * drop, type: o.action.type });
    }
    const top = Math.max(0, ...vals.map((x) => x.v));
    const positive = vals.filter((x) => x.v > 0.05);
    const contested = top > 0.05 ? positive.filter((x) => x.v >= top * 0.5) : [];
    d.positive += positive.length;
    d.contested += contested.length;
    d.kindsContested += new Set(contested.map((x) => x.type)).size;
    if (!positive.length) d.emptyDays++;
    else if (contested.length <= 1) d.forcedDays++;
  }
  return d;
}

function rescue(policy: string, starts: RunState[], endDay: number, cfg: ChildConfig): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of [1, 2, 3]) {
    const start = starts[endDay - k];
    if (!start || start.outcome) continue;
    let won = false;
    for (const id of RESCUERS) {
      if (id === policy || won) continue;
      const g = new GameSession(cloneState(start));
      const p = policyById(id);
      let n = 0;
      while (!g.state.outcome && n++ < cfg.cap) p.playDay(g);
      if (g.state.outcome?.result === 'victory') won = true;
    }
    out[String(k)] = won;
  }
  return out;
}

function runOne(cohort: string, seed: number, id: string, cfg: ChildConfig): Row {
  const idx = seed - cfg.from;
  const audit: string[] = [];
  const opts = { scenarioId: scenarioIdFor(cohort, seed), seed, difficulty: cfg.difficulty } as const;
  const t0 = performance.now();
  try {
    const { t, starts } = playInstrumented(policyById(id, audit), opts, audit, cfg.cap);
    const row: Row = { ...t, cohort, ms: Math.round((performance.now() - t0) * 10) / 10 };
    if (idx < cfg.determinism) {
      const again = playInstrumented(policyById(id, []), opts, [], cfg.cap).t;
      row.repeatOk = again.stateHash === t.stateHash && again.eventHash === t.eventHash;
    }
    if (idx < cfg.density) row.density = densityOf(starts);
    if (idx < cfg.rescue && t.result === 'defeat') row.rescue = rescue(id, starts, t.endDay, cfg);
    return row;
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack?.split('\n').slice(1, 4).join('\n') ?? ''}` : String(err);
    return {
      cohort, scenario: opts.scenarioId, seed, policy: id, difficulty: cfg.difficulty, result: 'timeout', cause: 'crash', failed: [], medal: 'none', endDay: 0, maxDay: 0, score: 0, population: 0, alive: 0, homes: 0, food: 0,
      apSpent: 0, apOffered: 0, apUnspent: 0, actions: 0, actionMix: {}, passDays: 0, firstBeliefDay: null, firstLawDay: null, reach: 0, laws: [], lawsCollapsed: 0, lawsWavered: 0, sideEffects: {},
      rival: { actions: 0, countered: 0, campaigns: 0, rebuttals: 0 }, causal: { important: 0, explained: 0 }, curve: [], stateHash: '', eventHash: '', audit: [], ms: Math.round(performance.now() - t0), crash: msg,
    };
  }
}

if (flag('child')) {
  const cfg = JSON.parse(arg('config', '{}')) as ChildConfig;
  const jobs = arg('jobs', '').split(',').filter(Boolean).map((j) => {
    const [c, s] = j.split(':');
    return { cohort: c, seed: Number(s) };
  });
  for (const j of jobs) {
    for (const id of cfg.policies) {
      if (id === 'oracle' && j.seed - cfg.from >= cfg.oracle) continue;
      process.stdout.write(JSON.stringify(runOne(j.cohort, j.seed, id, cfg)) + '\n');
    }
    if (process.memoryUsage().heapUsed / 1e6 > cfg.maxHeapMb) {
      process.stderr.write(`child exceeded ${cfg.maxHeapMb} MB of heap; stopping\n`);
      process.exit(3);
    }
  }
} else {
  await main();
}

// ------------------------------------------------------------------ parent

async function main(): Promise<void> {
  const smoke = flag('smoke');
  const cohorts = (arg('scenario', smoke ? 'all' : 'redbank') === 'all' ? [...AUTHORED, 'expedition'] : arg('scenario', 'redbank').split(',')).filter(Boolean);
  const from = Number(arg('from', '1'));
  const to = arg('to', '') ? Number(arg('to', '')) : from + Number(arg('seeds', smoke ? '8' : '100')) - 1;
  const policyArg = arg('policies', 'all');
  const policies = policyArg === 'all' ? MANDATORY_POLICIES.map((p) => p.id) : policyArg.split(',');
  const oracleN = Number(arg('oracle', '0'));
  if (oracleN > 0 && !policies.includes('oracle')) policies.push('oracle');
  for (const p of policies) if (![...MANDATORY_POLICIES, ORACLE_ENTRY].some((e) => e.id === p)) throw new Error(`unknown policy "${p}"`);
  const cfg: ChildConfig = {
    policies,
    difficulty: arg('difficulty', 'normal') as ChildConfig['difficulty'],
    cap: Number(arg('cap-days', '60')),
    from,
    oracle: oracleN,
    rescue: Number(arg('rescue', smoke ? '4' : '0')),
    determinism: Number(arg('determinism', smoke ? '4' : '0')),
    density: Number(arg('density', smoke ? '2' : '0')),
    maxHeapMb: Number(arg('max-heap-mb', '1536')),
  };
  const name = arg('name', smoke ? 'smoke' : `${cohorts.join('-')}-${from}-${to}`);
  const out = arg('out', join('tmp', 'tournament', name));
  const nWorkers = Math.max(1, Math.min(Number(arg('workers', String(Math.min(4, cpus().length)))), (to - from + 1) * cohorts.length));
  const budgetMs = Number(arg('time-budget', '3300')) * 1000;

  const jobs: string[] = [];
  for (let s = from; s <= to; s++) for (const c of cohorts) jobs.push(`${c}:${s}`);
  const chunks: string[][] = Array.from({ length: nWorkers }, () => []);
  // spread jobs so every worker sees every cohort and the slow early seeds (oracle, rescue samples) are shared out
  jobs.forEach((j, i) => chunks[((i % nWorkers) + Math.floor(i / nWorkers)) % nWorkers].push(j));

  const started = Date.now();
  const rows: Row[] = [];
  let finished = 0;
  let partial = false;
  const children: ReturnType<typeof spawn>[] = [];
  const oracleJobs = policies.includes('oracle') ? cohorts.length * Math.min(oracleN, to - from + 1) : 0;
  const total = jobs.length * policies.filter((p) => p !== 'oracle').length + oracleJobs;
  console.log(`tournament "${name}": ${cohorts.join(', ')} · seeds ${from}-${to} · ${policies.length} policies · ${nWorkers} workers`);

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      partial = true;
      console.error(`time budget of ${budgetMs / 1000} s reached: stopping workers, the report will be marked partial`);
      for (const c of children) c.kill('SIGTERM');
    }, budgetMs);
    for (const chunk of chunks) {
      const child = spawn(process.execPath, [`--max-old-space-size=${cfg.maxHeapMb + 256}`, '--import', 'tsx', HERE, '--child', '--jobs', chunk.join(','), '--config', JSON.stringify(cfg)], { stdio: ['ignore', 'pipe', 'inherit'] });
      children.push(child);
      try {
        if (child.pid) setPriority(child.pid, 5); // be a polite neighbour on shared CPUs
      } catch {
        /* priority is a courtesy, not a requirement */
      }
      const rl = createInterface({ input: child.stdout! });
      rl.on('line', (line) => {
        rows.push(JSON.parse(line) as Row);
        if (rows.length % 500 === 0) console.log(`  ${rows.length}/${total} runs, ${Math.round((Date.now() - started) / 1000)} s`);
      });
      rl.on('close', () => {
        if (++finished === chunks.length) {
          clearTimeout(timer);
          resolve();
        }
      });
    }
  });

  rows.sort((a, b) => (a.cohort < b.cohort ? -1 : a.cohort > b.cohort ? 1 : a.seed - b.seed || (a.policy < b.policy ? -1 : 1)));
  const wall = Math.round((Date.now() - started) / 1000);
  const seedCount = to - from + 1;
  const sum: Summary = {
    meta: {
      name, command: `npm run test:sim -- ${args.join(' ')}`.trim(), rulesVersion: RULES_VERSION, genVersion: GEN_VERSION, seeds: { from, to }, difficulty: cfg.difficulty, capDays: cfg.cap, workers: nWorkers, wallSeconds: wall,
      node: process.version, oracleSeeds: oracleN, rescueSample: cfg.rescue, determinismSample: cfg.determinism, densitySample: cfg.density, partial: partial || rows.length < total,
      notes: [
        'The oracle (when present) is PRIVILEGED: it plays each candidate to the end on a private copy, so it sees every night\'s dice. It is an upper bound for regret, never a fair opponent.',
        'The exploit-seeker and the controls (noop, random) are excluded from the "thoughtful" comparisons.',
        ...(cohorts.includes('expedition') ? ['Expedition seeds are all generated villages in the range, including ones the offline witnesses could not win; win rates there are over every seed, not only verified ones.'] : []),
      ],
    },
    cohorts: {},
  };
  for (const c of cohorts) sum.cohorts[c] = cohortSummary(c, rows.filter((r) => r.cohort === c), seedCount);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'runs.csv'), toCsv(rows));
  writeFileSync(join(out, 'summary.json'), JSON.stringify(sum, null, 1) + '\n');
  const md = renderMarkdown(sum);
  writeFileSync(join(out, 'REPORT.md'), md);
  const byPolicy = ['cohort,policy,n,wins,win_pct,ci_lo,ci_hi,median_end_day,mean_score,mean_alive,mean_homes,first_law_day,reach,ap_spent,ap_unspent,median_ms'];
  for (const [c, cs] of Object.entries(sum.cohorts)) for (const [p, s] of Object.entries(cs.policies)) byPolicy.push([c, p, s.n, s.wins, s.winRate, s.ci[0], s.ci[1], s.medianEndDay, s.meanScore, s.meanAlive, s.meanHomes, s.firstLawDay ?? '', s.meanReach, s.apSpentMean, s.apUnspentMean, s.duration.medianMs].join(','));
  writeFileSync(join(out, 'by-policy.csv'), byPolicy.join('\n') + '\n');
  if (flag('fixtures')) saveFixtures(arg('fixtures', ''), rows, cfg, from);
  if (arg('compare', '')) comparison(arg('compare', ''), rows, out);
  if (flag('publish')) {
    const pub = join(ROOT, 'docs', 'data', 'tournament', name);
    mkdirSync(pub, { recursive: true });
    for (const f of ['summary.json', 'REPORT.md', 'by-policy.csv']) writeFileSync(join(pub, f), readFileSync(join(out, f)));
    // per-run results, compressed: the input a later paired comparison (--compare docs/data/tournament/<name>/runs.csv.gz) needs
    writeFileSync(join(pub, 'runs.csv.gz'), gzipSync(readFileSync(join(out, 'runs.csv')), { level: 9 }));
    for (const f of ['COMPARISON.md', 'comparison.json']) {
      try {
        writeFileSync(join(pub, f), readFileSync(join(out, f)));
      } catch {
        /* only present when --compare was given */
      }
    }
    console.log(`published to ${pub}`);
  }


  // console summary
  for (const [c, cs] of Object.entries(sum.cohorts)) {
    console.log(`\n${c}`);
    for (const [p, s] of Object.entries(cs.policies)) console.log(`  ${p.padEnd(15)} ${String(s.wins).padStart(4)}/${String(s.n).padEnd(4)} ${String(s.winRate).padStart(5)}%  ci ${s.ci[0]}–${s.ci[1]}  end d${s.medianEndDay}  ${s.duration.medianMs} ms/run${s.crashes ? `  CRASHES ${s.crashes}` : ''}${s.timeouts ? `  TIMEOUTS ${s.timeouts}` : ''}${s.auditViolations ? `  AUDIT ${s.auditViolations}` : ''}`);
    for (const v of cs.verdicts) console.log(`  ${v.level === 'ok' ? 'PASS' : v.level === 'warn' ? 'WARN' : 'FAIL'} ${v.text}`);
  }
  console.log(`\n${rows.length}/${total} runs in ${wall} s · wrote ${out}`);

  const hard = Object.values(sum.cohorts).flatMap((c) => c.verdicts.filter((v) => v.level === 'fail' && /Softlock|crash|Determinism|violation|no-op/i.test(v.text)));
  if (rows.length < total && !partial) hard.push({ level: 'fail', text: `only ${rows.length} of ${total} runs reported (a worker died)` });
  if (smoke && hard.length) {
    console.error('\nSMOKE FAILED');
    for (const h of hard) console.error(' - ' + h.text);
    process.exit(1);
  }
  if (smoke) console.log('SMOKE OK');
}

// ------------------------------------------------------------------ fixtures and comparisons

function saveFixtures(file: string, rows: Row[], cfg: ChildConfig, from: number): void {
  const picks: { cohort: string; seed: number; policy: string; kind: 'victory' | 'defeat' }[] = [];
  for (const c of AUTHORED) {
    for (const p of ['threat-aware', 'evidence-first', 'bridge-builder', 'greedy', 'exploit-seeker']) {
      const mine = rows.filter((r) => r.cohort === c && r.policy === p && !r.crash);
      const w = mine.find((r) => r.result === 'victory');
      const d = mine.find((r) => r.result === 'defeat');
      if (w) picks.push({ cohort: c, seed: w.seed, policy: p, kind: 'victory' });
      if (d) picks.push({ cohort: c, seed: d.seed, policy: p, kind: 'defeat' });
    }
  }
  const exp = rows.filter((r) => r.cohort === 'expedition' && r.policy === 'threat-aware' && !r.crash);
  const ew = exp.find((r) => r.result === 'victory');
  const ed = exp.find((r) => r.result === 'defeat');
  if (ew) picks.push({ cohort: 'expedition', seed: ew.seed, policy: 'threat-aware', kind: 'victory' });
  if (ed) picks.push({ cohort: 'expedition', seed: ed.seed, policy: 'threat-aware', kind: 'defeat' });
  const traces = picks.map((p) => {
    const audit: string[] = [];
    const opts = { scenarioId: scenarioIdFor(p.cohort, p.seed), seed: p.seed, difficulty: cfg.difficulty } as const;
    const { t, session } = playInstrumented(policyById(p.policy, audit), opts, audit, cfg.cap);
    const actions: Action[] = session.log.slice();
    return { scenarioId: opts.scenarioId, seed: p.seed, difficulty: cfg.difficulty, policy: p.policy, kind: p.kind, result: t.result, endDay: t.endDay, score: t.score, stateHash: t.stateHash, eventHash: t.eventHash, actions };
  });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ createdBy: 'scripts/tournament.ts --fixtures', rulesVersion: RULES_VERSION, generatorVersion: GEN_VERSION, seedsFrom: from, traces }, null, 1) + '\n');
  console.log(`saved ${traces.length} regression traces to ${file}`);
}

function comparison(file: string, rows: Row[], out: string): void {
  const raw = readFileSync(file);
  const before = parseCsv((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));
  const after = parseCsv(toCsv(rows));
  const diffs = comparePaired(before, after).sort((a, b) => (a.scenario < b.scenario ? -1 : a.scenario > b.scenario ? 1 : a.policy < b.policy ? -1 : 1));
  const L = ['# Paired comparison', '', `Before: \`${file}\`. After: this run. Same scenario, policy and seed in both; "gained" = lost before, won now; "lost" = won before, lost now; p = exact two-sided sign test on those.`, '', '| Scenario | Policy | Seeds | Win % before | Win % after | Δ pts | Gained | Lost | p | Δ mean score |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const d of diffs) L.push(`| ${d.scenario} | ${d.policy} | ${d.seeds} | ${d.before} | ${d.after} | ${d.deltaPts > 0 ? '+' : ''}${d.deltaPts} | ${d.gained} | ${d.lost} | ${d.p} | ${d.scoreDelta} |`);
  writeFileSync(join(out, 'COMPARISON.md'), L.join('\n') + '\n');
  writeFileSync(join(out, 'comparison.json'), JSON.stringify(diffs, null, 1) + '\n');
  console.log(`\npaired comparison vs ${file}`);
  for (const d of diffs.filter((x) => !CONTROL.has(x.policy))) console.log(`  ${d.scenario.padEnd(10)} ${d.policy.padEnd(15)} ${String(d.before).padStart(5)}% → ${String(d.after).padStart(5)}%  (+${d.gained} / -${d.lost}, p=${d.p})`);
}
