/**
 * Pure aggregation, pairing and rendering for the tournament harness. No process, file or clock access here, so the same code is
 * used by the CLI (`scripts/tournament.ts`), by the quick smoke benchmark and by the unit tests.
 */
import type { RunTelemetry } from '../../src/engine/ai/bots/telemetry.ts';

export interface Density {
  /** planning days inspected */
  days: number;
  /** enabled actions that cost Influence, summed over the days */
  options: number;
  /** options with a positive value (they raise law support or lower the forecast risk) */
  positive: number;
  /** positive options at least half as good as the day's best: genuine alternatives */
  contested: number;
  /** days on which at most one option was contested: an obvious move */
  forcedDays: number;
  /** days on which nothing at all helped */
  emptyDays: number;
  /** distinct action types among the contested options, summed over days */
  kindsContested: number;
}

export interface Row extends RunTelemetry {
  /** the report group this run belongs to (a scenario id, or "expedition" for generated villages) */
  cohort: string;
  ms: number;
  /** second run with the same seed and policy produced identical hashes (undefined: not checked) */
  repeatOk?: boolean;
  /** lost runs only: could any thoughtful policy still have won with k days left? */
  rescue?: Record<string, boolean>;
  density?: Density;
  /** exception text when the run crashed */
  crash?: string;
}

// ------------------------------------------------------------------ small statistics

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1) + 0.5)))];
}
export const median = (xs: number[]): number => quantile(xs, 0.5);
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
export const pct = (a: number, b: number): number => (b ? r1((a / b) * 100) : 0);

/** 95% Wilson score interval for a proportion, in percent. */
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [r1(Math.max(0, (c - h) / d) * 100), r1(Math.min(1, (c + h) / d) * 100)];
}

/** Exact two-sided sign-test p-value for b vs c discordant pairs (McNemar). */
export function signTest(b: number, c: number): number {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  // P(X <= k) for X ~ Binomial(n, 1/2), doubled; terms accumulated in log space so large n cannot overflow
  const logHalf = -n * Math.LN2;
  let sum = 0;
  let logC = 0;
  for (let i = 0; i <= k; i++) {
    if (i > 0) logC += Math.log((n - i + 1) / i);
    sum += Math.exp(logC + logHalf);
  }
  return Math.min(1, 2 * sum);
}

// ------------------------------------------------------------------ aggregation

export interface PolicyStats {
  n: number;
  wins: number;
  winRate: number;
  ci: [number, number];
  timeouts: number;
  crashes: number;
  medianEndDay: number;
  meanScore: number;
  meanScoreWins: number;
  meanAlive: number;
  meanHomes: number;
  firstBeliefDay: number | null;
  firstLawDay: number | null;
  runsWithLaw: number;
  meanLawNights: number;
  meanReach: number;
  lawChurn: number;
  foodLeft: number;
  apSpentMean: number;
  apUnspentMean: number;
  passDayShare: number;
  actionMix: Record<string, number>;
  sideEffectsPerRun: Record<string, number>;
  rivalActionsPerRun: number;
  rivalCounteredPerRun: number;
  causalPct: number;
  noPhysicalChangePct: number;
  lossCauses: Record<string, number>;
  duration: { medianMs: number; p95Ms: number; maxMs: number };
  determinism: { checked: number; mismatches: number };
  auditViolations: number;
  rescue: Record<string, { lost: number; checked: number; rescuable: number }>;
  density: { days: number; optionsPerDay: number; positivePerDay: number; contestedPerDay: number; kindsPerDay: number; forcedDayShare: number; emptyDayShare: number } | null;
  curve: { day: number; alive: number; homes: number; food: number; believers: number; lawsOn: number }[];
  distinctOutcomes: number;
}

export function policyStats(rows: Row[]): PolicyStats {
  const ok = rows.filter((r) => !r.crash);
  const wins = ok.filter((r) => r.result === 'victory');
  const dayed = (f: (r: Row) => number | null) => {
    const xs = ok.map(f).filter((x): x is number => x !== null);
    return xs.length ? median(xs) : null;
  };
  const mix: Record<string, number> = {};
  let totalActs = 0;
  for (const r of ok) for (const [k, v] of Object.entries(r.actionMix)) {
    mix[k] = (mix[k] ?? 0) + (v ?? 0);
    totalActs += v ?? 0;
  }
  for (const k of Object.keys(mix)) mix[k] = r3(mix[k] / Math.max(1, totalActs));
  const side: Record<string, number> = {};
  for (const r of ok) for (const [k, v] of Object.entries(r.sideEffects)) side[k] = (side[k] ?? 0) + v;
  for (const k of Object.keys(side)) side[k] = r3(side[k] / Math.max(1, ok.length));
  const causes: Record<string, number> = {};
  for (const r of ok.filter((x) => x.result !== 'victory')) {
    const k = r.failed.length ? r.failed.join('+') : r.result === 'timeout' ? 'timeout' : r.cause.replace(/\d+/g, 'N').slice(0, 60);
    causes[k] = (causes[k] ?? 0) + 1;
  }
  const rescue: PolicyStats['rescue'] = {};
  for (const r of ok.filter((x) => x.result === 'defeat')) {
    for (const k of ['1', '2', '3']) {
      const e = (rescue[k] ??= { lost: 0, checked: 0, rescuable: 0 });
      e.lost++;
      if (r.rescue && k in r.rescue) {
        e.checked++;
        if (r.rescue[k]) e.rescuable++;
      }
    }
  }
  const dens = ok.map((r) => r.density).filter((d): d is Density => !!d);
  const maxDay = Math.max(0, ...ok.map((r) => r.curve.length));
  const curve: PolicyStats['curve'] = [];
  for (let i = 0; i < maxDay; i++) {
    const pts = ok.map((r) => r.curve[i]).filter(Boolean);
    if (pts.length < Math.max(3, ok.length * 0.2)) break;
    curve.push({ day: pts[0].day, alive: r1(mean(pts.map((p) => p.alive))), homes: r1(mean(pts.map((p) => p.homes))), food: r1(mean(pts.map((p) => p.food))), believers: r1(mean(pts.map((p) => p.believers))), lawsOn: r3(mean(pts.map((p) => p.lawsOn))) });
  }
  const outcomes = new Set(ok.map((r) => `${r.result}|${r.endDay}|${r.alive}|${r.homes}|${r.laws.map((l) => l.claim + '@' + l.region).sort().join(',')}`));
  const lawRuns = ok.filter((r) => r.laws.some((l) => l.day !== null));
  const ms = ok.map((r) => r.ms);
  const checked = ok.filter((r) => r.repeatOk !== undefined);
  return {
    n: rows.length,
    wins: wins.length,
    winRate: pct(wins.length, ok.length),
    ci: wilson(wins.length, ok.length),
    timeouts: ok.filter((r) => r.result === 'timeout').length,
    crashes: rows.length - ok.length,
    medianEndDay: median(ok.map((r) => r.endDay)),
    meanScore: r1(mean(ok.map((r) => r.score))),
    meanScoreWins: r1(mean(wins.map((r) => r.score))),
    meanAlive: r1(mean(ok.map((r) => r.alive))),
    meanHomes: r1(mean(ok.map((r) => r.homes))),
    firstBeliefDay: dayed((r) => r.firstBeliefDay),
    firstLawDay: dayed((r) => r.firstLawDay),
    runsWithLaw: pct(lawRuns.length, ok.length),
    meanLawNights: r1(mean(lawRuns.map((r) => mean(r.laws.filter((l) => l.day !== null).map((l) => l.nights))))),
    meanReach: r3(mean(ok.map((r) => r.reach))),
    lawChurn: r3(mean(ok.map((r) => r.lawsWavered + r.lawsCollapsed))),
    foodLeft: r1(mean(ok.map((r) => r.food))),
    apSpentMean: r1(mean(ok.map((r) => r.apSpent))),
    apUnspentMean: r1(mean(ok.map((r) => r.apUnspent))),
    passDayShare: r3(ok.reduce((a, r) => a + r.passDays, 0) / Math.max(1, ok.reduce((a, r) => a + r.endDay, 0))),
    actionMix: mix,
    sideEffectsPerRun: side,
    rivalActionsPerRun: r3(mean(ok.map((r) => r.rival.actions))),
    rivalCounteredPerRun: r3(mean(ok.map((r) => r.rival.countered))),
    causalPct: pct(ok.reduce((a, r) => a + r.causal.explained, 0), Math.max(1, ok.reduce((a, r) => a + r.causal.important, 0))),
    noPhysicalChangePct: pct(ok.filter((r) => !r.laws.some((l) => l.day !== null) && Object.keys(r.sideEffects).length === 0 && r.actionMix.RITUAL === undefined).length, ok.length),
    lossCauses: causes,
    duration: { medianMs: Math.round(median(ms)), p95Ms: Math.round(quantile(ms, 0.95)), maxMs: Math.round(Math.max(0, ...ms)) },
    determinism: { checked: checked.length, mismatches: checked.filter((r) => !r.repeatOk).length },
    auditViolations: ok.reduce((a, r) => a + r.audit.length, 0),
    rescue,
    density: dens.length
      ? (() => {
          const days = Math.max(1, dens.reduce((a, d) => a + d.days, 0));
          const sum = (f: (d: Density) => number) => dens.reduce((a, d) => a + f(d), 0);
          return {
            days: sum((d) => d.days),
            optionsPerDay: r1(sum((d) => d.options) / days),
            positivePerDay: r1(sum((d) => d.positive) / days),
            contestedPerDay: r1(sum((d) => d.contested) / days),
            kindsPerDay: r1(sum((d) => d.kindsContested) / days),
            forcedDayShare: r3(sum((d) => d.forcedDays) / days),
            emptyDayShare: r3(sum((d) => d.emptyDays) / days),
          };
        })()
      : null,
    curve,
    distinctOutcomes: outcomes.size,
  };
}

export interface PairStat {
  a: string;
  b: string;
  seeds: number;
  both: number;
  aOnly: number;
  bOnly: number;
  neither: number;
  p: number;
  /** half the L1 distance between the two action-type distributions (0 identical .. 1 disjoint) */
  mixDistance: number;
  /** share of paired seeds on which the two end with a different result */
  disagree: number;
  /** mean absolute difference in survivors on paired seeds */
  aliveGap: number;
  /** the two play materially differently: different action mix OR different winners */
  separated: boolean;
}

export function pairStats(rows: Record<string, Map<number, Row>>, mixes: Record<string, Record<string, number>>, a: string, b: string): PairStat {
  const A = rows[a];
  const B = rows[b];
  let both = 0;
  let aOnly = 0;
  let bOnly = 0;
  let neither = 0;
  let gap = 0;
  let n = 0;
  for (const [seed, ra] of A) {
    const rb = B.get(seed);
    if (!rb || ra.crash || rb.crash) continue;
    n++;
    const wa = ra.result === 'victory';
    const wb = rb.result === 'victory';
    if (wa && wb) both++;
    else if (wa) aOnly++;
    else if (wb) bOnly++;
    else neither++;
    gap += Math.abs(ra.alive - rb.alive);
  }
  const keys = new Set([...Object.keys(mixes[a] ?? {}), ...Object.keys(mixes[b] ?? {})]);
  let l1 = 0;
  for (const k of keys) l1 += Math.abs((mixes[a]?.[k] ?? 0) - (mixes[b]?.[k] ?? 0));
  const dis = n ? (aOnly + bOnly) / n : 0;
  return { a, b, seeds: n, both, aOnly, bOnly, neither, p: r3(signTest(aOnly, bOnly)), mixDistance: r3(l1 / 2), disagree: r3(dis), aliveGap: r1(n ? gap / n : 0), separated: l1 / 2 >= 0.25 || dis >= 0.2 };
}

export interface CohortSummary {
  scenario: string;
  seeds: number;
  policies: Record<string, PolicyStats>;
  /** fair (non-privileged, non-control) policy pairs */
  pairs: PairStat[];
  /** regret against the best fair policy and against the oracle where it ran */
  regret: Record<string, { seeds: number; lostWhenSomeFairPolicyWon: number; lostWhenOracleWon: number | null; oracleSeeds: number }>;
  /** per story: share of winning runs in which it took hold, and its win rate when it did */
  claimUse: Record<string, { runsWithLaw: number; wins: number; winRate: number; shareOfWins: number }>;
  /** most common failed-objective set across all non-control policies */
  commonFailure: { cause: string; runs: number } | null;
  /** hand-made comparisons the harness reports without judging them */
  verdicts: Verdict[];
}

export interface Verdict {
  level: 'ok' | 'warn' | 'fail';
  text: string;
}

export const CONTROL = new Set(['noop', 'random']);
export const PRIVILEGED = new Set(['oracle']);
export const isFair = (p: string): boolean => !PRIVILEGED.has(p) && !CONTROL.has(p) && p !== 'exploit-seeker';

export function cohortSummary(scenario: string, rows: Row[], seeds: number): CohortSummary {
  const by: Record<string, Row[]> = {};
  for (const r of rows) (by[r.policy] ??= []).push(r);
  const policies: Record<string, PolicyStats> = {};
  for (const [p, rs] of Object.entries(by)) policies[p] = policyStats(rs);
  const index: Record<string, Map<number, Row>> = {};
  for (const [p, rs] of Object.entries(by)) index[p] = new Map(rs.map((r) => [r.seed, r]));
  const mixes = Object.fromEntries(Object.entries(policies).map(([p, s]) => [p, s.actionMix]));
  const fair = Object.keys(by).filter(isFair).sort();
  const pairs: PairStat[] = [];
  for (let i = 0; i < fair.length; i++) for (let j = i + 1; j < fair.length; j++) pairs.push(pairStats(index, mixes, fair[i], fair[j]));

  const regret: CohortSummary['regret'] = {};
  const orc = index['oracle'];
  for (const p of Object.keys(by)) {
    if (PRIVILEGED.has(p)) continue;
    let lostFair = 0;
    let lostOracle = 0;
    let oracleSeeds = 0;
    for (const [seed, r] of index[p]) {
      const mine = r.result === 'victory';
      if (!mine && fair.some((f) => f !== p && index[f].get(seed)?.result === 'victory')) lostFair++;
      const o = orc?.get(seed);
      if (o) {
        oracleSeeds++;
        if (!mine && o.result === 'victory') lostOracle++;
      }
    }
    regret[p] = { seeds: index[p].size, lostWhenSomeFairPolicyWon: lostFair, lostWhenOracleWon: orc ? lostOracle : null, oracleSeeds };
  }

  const claimUse: CohortSummary['claimUse'] = {};
  const thoughtful = rows.filter((r) => !CONTROL.has(r.policy) && !r.crash);
  const winsAll = thoughtful.filter((r) => r.result === 'victory').length;
  const tally: Record<string, { runs: number; wins: number }> = {};
  for (const r of thoughtful) {
    const claims = new Set(r.laws.filter((l) => l.day !== null).map((l) => l.claim));
    for (const c of claims) {
      const e = (tally[c] ??= { runs: 0, wins: 0 });
      e.runs++;
      if (r.result === 'victory') e.wins++;
    }
  }
  for (const [c, e] of Object.entries(tally)) claimUse[c] = { runsWithLaw: e.runs, wins: e.wins, winRate: pct(e.wins, e.runs), shareOfWins: pct(e.wins, winsAll) };

  const causes: Record<string, number> = {};
  for (const p of Object.keys(by).filter((x) => !CONTROL.has(x))) for (const [k, v] of Object.entries(policies[p].lossCauses)) causes[k] = (causes[k] ?? 0) + v;
  const top = Object.entries(causes).sort((a, b) => b[1] - a[1])[0];
  return { scenario, seeds, policies, pairs, regret, claimUse, commonFailure: top ? { cause: top[0], runs: top[1] } : null, verdicts: verdicts(scenario, policies, pairs) };
}

/** The balance targets from the brief, stated as checks. They only report; changing the game on them is a human decision. */
function verdicts(scenario: string, P: Record<string, PolicyStats>, pairs: PairStat[]): Verdict[] {
  const out: Verdict[] = [];
  const authored = !scenario.startsWith('expedition');
  const noop = P['noop'];
  if (noop) out.push(noop.wins === 0 ? { level: 'ok', text: `The no-op control wins ${noop.wins} of ${noop.n}.` } : { level: authored ? 'fail' : 'warn', text: `The no-op control wins ${noop.wins} of ${noop.n} (${noop.winRate}%): doing nothing should lose.` });
  const fairNames = Object.keys(P).filter(isFair);
  const best = fairNames.map((p) => ({ p, w: P[p].winRate })).sort((a, b) => b.w - a.w)[0];
  const rnd = P['random'];
  if (rnd && best) out.push(best.w > rnd.winRate + 5 ? { level: 'ok', text: `The best thoughtful policy (${best.p}, ${best.w}%) beats random-legal (${rnd.winRate}%).` } : { level: 'fail', text: `Random-legal (${rnd.winRate}%) is within 5 points of the best thoughtful policy (${best.p}, ${best.w}%): choices do not matter enough.` });
  const strong = fairNames.filter((p) => P[p].winRate >= 95);
  if (strong.length) out.push({ level: authored ? 'warn' : 'ok', text: `${strong.join(', ')} win${strong.length === 1 ? 's' : ''} 95% or more of seeds: close to a trivially winning route.` });
  const winning = fairNames.filter((p) => P[p].winRate >= 10);
  out.push(winning.length >= 3 ? { level: 'ok', text: `${winning.length} distinct thoughtful policies win at least 10% of seeds (${winning.join(', ')}).` } : { level: 'warn', text: `Only ${winning.length} thoughtful polic${winning.length === 1 ? 'y' : 'ies'} win at least 10% of seeds (${winning.join(', ') || 'none'}).` });
  const overlap = pairs.filter((p) => p.both > 0 && p.aOnly + p.bOnly > 0);
  if (pairs.length) out.push({ level: overlap.length ? 'ok' : 'warn', text: `${overlap.length} of ${pairs.length} thoughtful pairs win some of the same seeds and also some different ones.` });
  const sep = pairs.filter((p) => p.separated).length;
  if (pairs.length) out.push({ level: sep >= pairs.length * 0.6 ? 'ok' : 'warn', text: `${sep} of ${pairs.length} thoughtful pairs play materially differently (action mix distance >= 0.25 or different winners on >= 20% of seeds).` });
  const ex = P['exploit-seeker'];
  if (ex) {
    out.push(ex.auditViolations === 0 ? { level: 'ok', text: 'The exploit-seeker recorded 0 engine violations (no free Influence through undo, no invalid actions accepted, no double-telling).' } : { level: 'fail', text: `The exploit-seeker recorded ${ex.auditViolations} engine violation(s).` });
    if (best && ex.winRate > best.w + 5) out.push({ level: 'fail', text: `The exploit-seeker (${ex.winRate}%) beats every thoughtful policy (best ${best.w}%).` });
  }
  const bad = Object.entries(P).filter(([, s]) => s.timeouts + s.crashes > 0);
  out.push(bad.length ? { level: 'fail', text: `Softlock or crash: ${bad.map(([p, s]) => `${p} ${s.timeouts} timeouts, ${s.crashes} crashes`).join('; ')}.` } : { level: 'ok', text: 'No timeouts, softlocks or crashes in any run.' });
  const det = Object.values(P).reduce((a, s) => ({ c: a.c + s.determinism.checked, m: a.m + s.determinism.mismatches }), { c: 0, m: 0 });
  if (det.c) out.push(det.m === 0 ? { level: 'ok', text: `Determinism: ${det.c} runs repeated, identical state and event hashes every time.` } : { level: 'fail', text: `Determinism: ${det.m} of ${det.c} repeated runs differ.` });
  return out;
}

// ------------------------------------------------------------------ CSV and comparisons

export const CSV_COLUMNS = ['cohort', 'scenario', 'seed', 'policy', 'difficulty', 'result', 'endDay', 'maxDay', 'score', 'alive', 'population', 'homes', 'food', 'apSpent', 'apUnspent', 'actions', 'passDays', 'firstBeliefDay', 'firstLawDay', 'reach', 'lawsActivated', 'lawsCollapsed', 'failed', 'ms', 'stateHash'] as const;

export function toCsv(rows: Row[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rows) {
    const cell = (c: (typeof CSV_COLUMNS)[number]): string => {
      switch (c) {
        case 'lawsActivated':
          return String(r.laws.filter((l) => l.day !== null).length);
        case 'failed':
          return `"${r.failed.join('+')}"`;
        default: {
          const v = (r as unknown as Record<string, unknown>)[c];
          return v === null || v === undefined ? '' : String(v);
        }
      }
    };
    lines.push(CSV_COLUMNS.map(cell).join(','));
  }
  return lines.join('\n') + '\n';
}

export interface CsvRun {
  scenario: string;
  seed: number;
  policy: string;
  result: string;
  score: number;
  alive: number;
}

export function parseCsv(text: string): CsvRun[] {
  const [head, ...rest] = text.trim().split('\n');
  const cols = head.split(',');
  const at = (name: string) => cols.indexOf(name);
  const out: CsvRun[] = [];
  for (const line of rest) {
    const f = line.split(',');
    out.push({ scenario: f[at('cohort')], seed: Number(f[at('seed')]), policy: f[at('policy')], result: f[at('result')], score: Number(f[at('score')]), alive: Number(f[at('alive')]) });
  }
  return out;
}

export interface PairedChange {
  scenario: string;
  policy: string;
  seeds: number;
  before: number;
  after: number;
  gained: number;
  lost: number;
  p: number;
  deltaPts: number;
  scoreDelta: number;
}

/** Same-seed paired comparison of two tournament runs (before/after a balance change): McNemar counts per scenario and policy. */
export function comparePaired(before: CsvRun[], after: CsvRun[]): PairedChange[] {
  const key = (r: CsvRun) => `${r.scenario}|${r.policy}|${r.seed}`;
  const old = new Map(before.map((r) => [key(r), r]));
  const groups = new Map<string, { gained: number; lost: number; n: number; bw: number; aw: number; ds: number }>();
  for (const a of after) {
    const b = old.get(key(a));
    if (!b) continue;
    const g = groups.get(`${a.scenario}|${a.policy}`) ?? { gained: 0, lost: 0, n: 0, bw: 0, aw: 0, ds: 0 };
    g.n++;
    const bw = b.result === 'victory';
    const aw = a.result === 'victory';
    if (bw) g.bw++;
    if (aw) g.aw++;
    if (!bw && aw) g.gained++;
    if (bw && !aw) g.lost++;
    g.ds += a.score - b.score;
    groups.set(`${a.scenario}|${a.policy}`, g);
  }
  return [...groups.entries()].map(([k, g]) => {
    const [scenario, policy] = k.split('|');
    return { scenario, policy, seeds: g.n, before: pct(g.bw, g.n), after: pct(g.aw, g.n), gained: g.gained, lost: g.lost, p: r3(signTest(g.gained, g.lost)), deltaPts: r1(pct(g.aw, g.n) - pct(g.bw, g.n)), scoreDelta: r1(g.n ? g.ds / g.n : 0) };
  });
}

// ------------------------------------------------------------------ markdown

export interface RunMeta {
  name: string;
  command: string;
  rulesVersion: string;
  genVersion: number;
  seeds: { from: number; to: number };
  difficulty: string;
  capDays: number;
  workers: number;
  wallSeconds: number;
  node: string;
  oracleSeeds: number;
  rescueSample: number;
  determinismSample: number;
  densitySample: number;
  partial: boolean;
  notes: string[];
}

export interface Summary {
  meta: RunMeta;
  cohorts: Record<string, CohortSummary>;
}

const ORDER = ['noop', 'random', 'greedy', 'broadcaster', 'evidence-first', 'bridge-builder', 'threat-aware', 'exploit-seeker', 'oracle'];
const sortedPolicies = (p: string[]): string[] => p.slice().sort((a, b) => (ORDER.indexOf(a) + 100) % 100 - ((ORDER.indexOf(b) + 100) % 100) || (a < b ? -1 : 1));

export function renderMarkdown(sum: Summary): string {
  const m = sum.meta;
  const L: string[] = [];
  L.push(`# Tournament report: ${m.name}`, '');
  L.push('Generated by `scripts/tournament.ts`. Every number below was computed by that run; nothing is estimated by hand. Bots are *proxies* for challenge and diversity: they say what the simulation allows, not whether a person has fun.', '');
  L.push('## Reproduce', '', '```', m.command, '```', '');
  L.push(`| Parameter | Value |`, `| --- | --- |`);
  L.push(`| Rules version | ${m.rulesVersion} (generator v${m.genVersion}) |`, `| Seeds | ${m.seeds.from} – ${m.seeds.to} per scenario (identical for every policy: paired) |`, `| Difficulty | ${m.difficulty} |`, `| Day cap per run | ${m.capDays} |`, `| Workers | ${m.workers} child processes |`, `| Wall time | ${m.wallSeconds} s${m.partial ? ' (**partial: time budget reached**)' : ''} |`, `| Oracle seeds | ${m.oracleSeeds} per scenario (privileged rollouts) |`, `| Rescue sample | up to ${m.rescueSample} lost runs per scenario and policy |`, `| Determinism re-runs | ${m.determinismSample} seeds per scenario and policy |`, `| Decision-density sample | ${m.densitySample} seeds per scenario and policy |`, `| Node | ${m.node} |`, '');
  for (const n of m.notes) L.push(`> ${n}`, '');
  L.push('## Definitions', '');
  L.push('* **Win rate**: share of seeds ending in victory; the bracket is the 95% Wilson interval. **n** is the number of seeds played, the same for every policy.');
  L.push('* **Paired**: every policy plays exactly the same seeds, so differences between policies are not luck of the draw. *aOnly / bOnly* count seeds that only one of the two wins; *p* is the exact two-sided sign test on those.');
  L.push('* **Reach**: peak share of living villagers holding conviction >= 50 in a story the Keeper can tell. **First belief / first law**: median day.');
  L.push('* **Unspent AP**: Influence offered by the game and not used. **Pass days**: share of days with no Influence spent. **Law churn**: laws that wavered or collapsed, per run. **No physical change**: runs in which no law ever took hold, no ritual was performed and no side effect fired (the Keeper\'s belief changed nothing visible). **Food left**: stock at the end (very high values mean resource overproduction).');
  L.push('* **Decision density**: on sampled planning days every enabled Influence-costing action is valued by its exact preview (best rise in law support over any tellable story, plus three times the drop in forecast risk). *Positive* options have value above 0.05; *contested* ones are positive and at least half as good as the day\'s best (real alternatives); a day is *forced* when at most one option is contested and *empty* when none is positive.');
  L.push('* **Separated**: two policies differ materially when their action mixes are at least 0.25 apart (half L1 distance) or they win different seeds on at least 20% of the seeds.');
  L.push('* **Rescue**: of runs that were lost, the share where some *other* thoughtful policy, taking over with 1 / 2 / 3 planning days left, still wins. High values mean the last turns offered a realistic way out; near zero means the loss was already decided.');
  L.push('* **Regret**: seeds this policy loses although another thoughtful policy (or the oracle, where it ran) wins them.', '');
  for (const [name, c] of Object.entries(sum.cohorts)) {
    L.push(`## ${name} (${c.seeds} seeds)`, '');
    L.push('### Checks against the balance targets', '');
    for (const v of c.verdicts) L.push(`* ${v.level === 'ok' ? 'PASS' : v.level === 'warn' ? 'WARN' : 'FAIL'}: ${v.text}`);
    L.push('');
    const names = sortedPolicies(Object.keys(c.policies));
    L.push('### Win rate and outcome', '', '| Policy | n | Win % | 95% CI | Median end day | Mean score | Mean alive | Mean homes | Regret vs fair | Regret vs oracle |', '| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const p of names) {
      const s = c.policies[p];
      const rg = c.regret[p];
      L.push(`| ${p} | ${s.n} | ${s.winRate} | ${s.ci[0]}–${s.ci[1]} | ${s.medianEndDay} | ${s.meanScore} | ${s.meanAlive} | ${s.meanHomes} | ${rg ? rg.lostWhenSomeFairPolicyWon : '–'} | ${rg && rg.lostWhenOracleWon !== null ? `${rg.lostWhenOracleWon} of ${rg.oracleSeeds}` : '–'} |`);
    }
    L.push('', '### Progress arc and efficiency', '', '| Policy | First belief | First law | Runs with a law % | Law nights | Law churn | No physical change % | Food left | Reach | AP spent | AP unspent | Pass days | Causal % |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const p of names) {
      const s = c.policies[p];
      L.push(`| ${p} | ${s.firstBeliefDay ?? '–'} | ${s.firstLawDay ?? '–'} | ${s.runsWithLaw} | ${s.meanLawNights} | ${s.lawChurn} | ${s.noPhysicalChangePct} | ${s.foodLeft} | ${s.meanReach} | ${s.apSpentMean} | ${s.apUnspentMean} | ${Math.round(s.passDayShare * 100)}% | ${s.causalPct} |`);
    }
    L.push('', '### What each policy does (share of its actions)', '', '| Policy | ' + ['SEED', 'MESSENGER', 'GATHER', 'RITUAL', 'COUNTER', 'TRADE', 'SCOUT'].join(' | ') + ' |', '| --- |' + ' ---: |'.repeat(7));
    for (const p of names) L.push(`| ${p} | ${['SEED', 'MESSENGER', 'GATHER', 'RITUAL', 'COUNTER', 'TRADE', 'SCOUT'].map((k) => Math.round((c.policies[p].actionMix[k] ?? 0) * 100) + '%').join(' | ')} |`);
    L.push('', '### Why runs are lost', '');
    for (const p of names) {
      const e = Object.entries(c.policies[p].lossCauses).sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (e.length) L.push(`* **${p}**: ${e.map(([k, v]) => `${k} (${v})`).join('; ')}`);
    }
    if (c.commonFailure) L.push('', `Most common failure across all non-control policies: **${c.commonFailure.cause}** (${c.commonFailure.runs} runs).`);
    L.push('', '### Which stories carry the wins', '', '| Story | Runs where it took hold | Wins | Win % | Share of all wins |', '| --- | ---: | ---: | ---: | ---: |');
    for (const [k, v] of Object.entries(c.claimUse).sort((a, b) => b[1].wins - a[1].wins)) L.push(`| ${k} | ${v.runsWithLaw} | ${v.wins} | ${v.winRate} | ${v.shareOfWins} |`);
    L.push('', '### Strategic separation (thoughtful policies, same seeds)', '', '| A | B | Both win | A only | B only | Neither | p | Mix distance | Result differs | Separated |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const p of c.pairs) L.push(`| ${p.a} | ${p.b} | ${p.both} | ${p.aOnly} | ${p.bOnly} | ${p.neither} | ${p.p} | ${p.mixDistance} | ${Math.round(p.disagree * 100)}% | ${p.separated ? 'yes' : 'no'} |`);
    L.push('', '### Decision density, side effects, rivals, duration', '', '| Policy | Options / positive / contested per day | Action kinds contested | Forced days | Empty days | Side effects per run | Rival acts / run (countered) | Distinct outcomes | ms/run median (p95) | Determinism | Exploit violations |', '| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- | --- | ---: |');
    for (const p of names) {
      const s = c.policies[p];
      const se = Object.entries(s.sideEffectsPerRun).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ') || '–';
      L.push(`| ${p} | ${s.density ? `${s.density.optionsPerDay} / ${s.density.positivePerDay} / ${s.density.contestedPerDay}` : '–'} | ${s.density ? s.density.kindsPerDay : '–'} | ${s.density ? Math.round(s.density.forcedDayShare * 100) + '%' : '–'} | ${s.density ? Math.round(s.density.emptyDayShare * 100) + '%' : '–'} | ${se} | ${s.rivalActionsPerRun} (${s.rivalCounteredPerRun}) | ${s.distinctOutcomes} | ${s.duration.medianMs} (${s.duration.p95Ms}) | ${s.determinism.checked ? `${s.determinism.checked - s.determinism.mismatches}/${s.determinism.checked} identical` : '–'} | ${s.auditViolations} |`);
    }
    L.push('', '### Failure fairness (rescue)', '', '| Policy | Lost runs | Rescuable with 3 days left | with 2 | with 1 | Checked |', '| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const p of names) {
      const r = c.policies[p].rescue;
      if (!r['1'] || r['1'].lost === 0) continue;
      const f = (k: string) => (r[k] && r[k].checked ? `${pct(r[k].rescuable, r[k].checked)}%` : '–');
      L.push(`| ${p} | ${r['1'].lost} | ${f('3')} | ${f('2')} | ${f('1')} | ${r['1'].checked} |`);
    }
    L.push('');
  }
  return L.join('\n') + '\n';
}
