/**
 * Phase 11: headless tournament for Generative Reality runs. No DOM, no rendering, and no network: `fetch` is replaced by a function
 * that throws, so a run that tried to call a model would fail loudly (none does; every model-facing decision is the engine's own
 * policy or, for the antagonist, a scripted NPC_DECIDE the engine validates like a model's).
 *
 *   npx tsx scripts/tournament-v2.ts --seeds 20                         all three chapters, every policy, seeds 1..20
 *   npx tsx scripts/tournament-v2.ts --scenarios redbank --policies evidence-first,noop --seeds 5
 *   npx tsx scripts/tournament-v2.ts --seeds 30 --name baseline --publish   also writes docs/data/tournament-v2/baseline/
 *   npx tsx scripts/tournament-v2.ts --role ward=The river turns away from lit lanterns.   override one sentence for every chapter
 *   npx tsx scripts/tournament-v2.ts --rules 1        the written-belief rules of phases 04-10 (default: the current ones)
 *
 * Every policy plays exactly the same seeds (paired) through the same GameSession API a person or an agent uses.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { REALITY_POLICIES, BOOKS, writtenClaims, type Role } from '../src/engine/ai/bots/reality.ts';
import { playInstrumented, type RunTelemetry } from '../src/engine/ai/bots/telemetry.ts';
import { claimDef } from '../src/engine/core/lookup.ts';
import type { RunState } from '../src/engine/core/types.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const flag = (k: string): boolean => args.includes(`--${k}`);

globalThis.fetch = (() => {
  throw new Error('the tournament never calls the network');
}) as typeof fetch;

const scenarios = arg('scenarios', 'redbank,harvest,ashwood').split(',');
const seeds = Number(arg('seeds', '10'));
const from = Number(arg('from', '1'));
const policies = arg('policies', 'all') === 'all' ? REALITY_POLICIES.map((p) => p.id) : arg('policies', '').split(',');
const name = arg('name', 'latest');
const out = arg('out', join('tmp', 'tournament-v2', name));
const difficulty = arg('difficulty', 'normal') as 'story' | 'normal' | 'hard';
const rules = args.includes('--rules') ? Number(arg('rules', '2')) : undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--role') continue;
  const [role, ...rest] = args[i + 1].split('=');
  for (const b of Object.values(BOOKS)) b[role as Role] = rest.join('=');
}

export interface V2Row {
  scenario: string;
  seed: number;
  policy: string;
  result: RunTelemetry['result'];
  /** objectives unmet at the end */
  failed: string[];
  endDay: number;
  maxDay: number;
  population: number;
  alive: number;
  homes: number;
  food: number;
  apSpent: number;
  apOffered: number;
  passDays: number;
  actions: number;
  /** the written belief, if one was written */
  written: { short: string; power: number; on: number; min: number; composedDay: number; lawDay: number | null; nights: number; status: string } | null;
  /** nights a written law acted (REALITY_EFFECT events) */
  effects: number;
  /** hens drowned, fields lost, pooled tiles, homes lost to the flood or fire, side-effect events */
  collateral: { hens: number; fields: number; pooled: number; homesLost: number; side: number; livestock: number };
  /** share of living villagers who firmly believe the written belief at the end; who had heard it at all */
  writtenReach: number;
  heard: number;
  tests: { met: number; failed: number; lapsed: number };
  /** demonstrations of the written belief that convinced, and that backfired */
  demos: { ok: number; failed: number };
  /** LEADER_OPPOSES and LAW_HARMED events (rules 2) */
  opposed: number;
  harmed: number;
  /** mean trust the living hold in the Keeper at the end (0..100) */
  keeperTrust: number;
  npcDecisions: number;
  ms: number;
}

const SIDE = ['FIRE_STARTED', 'FIRE_SPREAD', 'FIELD_BURNED', 'FIELD_FLOODED', 'FIELD_PARCHED', 'SMOKE_SICKNESS', 'NIGHT_LABOR', 'PACK_LURED', 'RAIN_DISPLACED', 'WATER_POOLED', 'FIRE_WARDS_COOLED', 'LIVESTOCK_KILLED'];

function rowOf(scenario: string, seed: number, policy: string, t: RunTelemetry, s: RunState, ms: number): V2Row {
  const w = writtenClaims(s)[0] ?? null;
  const count = (code: string) => s.log.filter((e) => e.code === code).length;
  let written: V2Row['written'] = null;
  let writtenReach = 0;
  let heard = 0;
  if (w) {
    const def = claimDef(s, w);
    const law = s.laws.find((l) => l.claimId === w);
    const composed = s.log.find((e) => e.code === 'BELIEF_WRITTEN' && e.claim === w);
    written = { short: def.short, power: def.reality?.power ?? 0, on: def.spec.thresholds.on, min: def.spec.thresholds.minSupporters, composedDay: composed?.day ?? 0, lawDay: law?.activatedDay ?? null, nights: law?.activeNights ?? 0, status: law?.status ?? 'none' };
    const living = s.villagers.filter((v) => v.status !== 'dead');
    writtenReach = living.filter((v) => (v.beliefs[w]?.conv ?? 0) >= 50).length / Math.max(1, living.length);
    heard = living.filter((v) => (v.beliefs[w]?.heard ?? 0) > 0).length / Math.max(1, living.length);
  }
  const pooled = s.log.filter((e) => e.code === 'WATER_POOLED').reduce((a, e) => a + (e.delta?.tiles?.[1] ?? 0), 0);
  const homes0 = s.world.landmarks.filter((l) => l.kind === 'home').length;
  return {
    scenario, seed, policy, result: t.result, failed: t.failed.slice(), endDay: t.endDay, maxDay: t.maxDay, population: t.population, alive: t.alive, homes: t.homes, food: t.food,
    apSpent: t.apSpent, apOffered: t.apOffered, passDays: t.passDays, actions: t.actions, written,
    effects: count('REALITY_EFFECT'),
    collateral: { livestock: s.world.landmarks.filter((l) => l.kind === 'pen').reduce((a, l) => a + Math.max(0, (l.data.stockMax ?? 0) - (l.data.stock ?? 0)), 0), hens: s.v2?.chickens.filter((c) => !c.alive).length ?? 0, fields: count('FIELD_FLOODED') + count('FIELD_BURNED') + count('FIELD_PARCHED'), pooled, homesLost: homes0 - t.homes, side: SIDE.reduce((a, c) => a + count(c), 0) },
    writtenReach, heard,
    tests: { met: count('TEST_MET'), failed: count('TEST_FAILED'), lapsed: count('TEST_LAPSED') },
    opposed: count('LEADER_OPPOSES'),
    harmed: count('LAW_HARMED'),
    demos: { ok: w ? s.log.filter((e) => e.code === 'EVIDENCE_STAGED' && e.claim === w).length : 0, failed: w ? s.log.filter((e) => e.code === 'EVIDENCE_BACKFIRED' && e.claim === w).length : 0 },
    keeperTrust: (() => {
      const living = s.villagers.filter((v) => v.status !== 'dead');
      return living.reduce((a, v) => a + v.keeperTrust, 0) / Math.max(1, living.length);
    })(),
    npcDecisions: count('NPC_DECIDED') + count('NPC_ACT'),
    ms,
  };
}

const rows: V2Row[] = [];
const t0 = performance.now();
for (const scenario of scenarios) {
  for (const id of policies) {
    const entry = REALITY_POLICIES.find((p) => p.id === id);
    if (!entry) throw new Error(`unknown policy ${id}`);
    for (let seed = from; seed < from + seeds; seed++) {
      const a = performance.now();
      const run = playInstrumented(entry.make(), { scenarioId: scenario, seed, difficulty, mode: 'story', reality: true, ...(rules !== undefined ? { realityRules: rules } : {}) });
      rows.push(rowOf(scenario, seed, id, run.t, run.session.state, performance.now() - a));
    }
    process.stderr.write(`${scenario} ${id}: ${rows.filter((r) => r.scenario === scenario && r.policy === id).filter((r) => r.result === 'victory').length}/${seeds} won\n`);
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

interface Cell {
  scenario: string;
  policy: string;
  n: number;
  wins: number;
  winRate: number;
  endDay: number;
  wroteRate: number;
  lawRate: number;
  lawDay: number | null;
  nights: number;
  apSpent: number;
  survival: number;
  homesLost: number;
  hens: number;
  fields: number;
  pooled: number;
  livestock: number;
  side: number;
  reach: number;
  heard: number;
  passDays: number;
  effects: number;
  tests: { met: number; failed: number; lapsed: number };
  demos: { ok: number; failed: number };
  keeperTrust: number;
  msPerRun: number;
  /** how often each objective was the one missed */
  fails: Record<string, number>;
  /** opposition from leaders a written belief harmed, and the harm events */
  opposed: number;
  harmed: number;
  power: number | null;
  on: number | null;
  min: number | null;
}

const cells: Cell[] = [];
for (const scenario of scenarios)
  for (const policy of policies) {
    const rs = rows.filter((r) => r.scenario === scenario && r.policy === policy);
    const wrote = rs.filter((r) => r.written);
    const laws = wrote.filter((r) => r.written!.lawDay !== null);
    cells.push({
      scenario, policy, n: rs.length, wins: rs.filter((r) => r.result === 'victory').length, winRate: mean(rs.map((r) => (r.result === 'victory' ? 1 : 0))),
      endDay: mean(rs.map((r) => r.endDay)), wroteRate: rs.length ? wrote.length / rs.length : 0, lawRate: wrote.length ? laws.length / wrote.length : 0,
      lawDay: laws.length ? mean(laws.map((r) => r.written!.lawDay!)) : null, nights: mean(wrote.map((r) => r.written!.nights)),
      apSpent: mean(rs.map((r) => r.apSpent)), survival: mean(rs.map((r) => r.alive / Math.max(1, r.population))), homesLost: mean(rs.map((r) => r.collateral.homesLost)),
      hens: mean(rs.map((r) => r.collateral.hens)), livestock: mean(rs.map((r) => r.collateral.livestock)), fields: mean(rs.map((r) => r.collateral.fields)), pooled: mean(rs.map((r) => r.collateral.pooled)), side: mean(rs.map((r) => r.collateral.side)),
      reach: mean(wrote.map((r) => r.writtenReach)), heard: mean(wrote.map((r) => r.heard)), passDays: mean(rs.map((r) => r.passDays)), effects: mean(rs.map((r) => r.effects)),
      tests: { met: mean(rs.map((r) => r.tests.met)), failed: mean(rs.map((r) => r.tests.failed)), lapsed: mean(rs.map((r) => r.tests.lapsed)) },
      demos: { ok: mean(rs.map((r) => r.demos.ok)), failed: mean(rs.map((r) => r.demos.failed)) },
      keeperTrust: mean(rs.map((r) => r.keeperTrust)),
      msPerRun: mean(rs.map((r) => r.ms)),
      fails: rs.reduce((acc, r) => { for (const f of r.failed) acc[f] = (acc[f] ?? 0) + 1; return acc; }, {} as Record<string, number>),
      opposed: mean(rs.map((r) => r.opposed)),
      harmed: mean(rs.map((r) => r.harmed)),
      power: wrote.length ? mean(wrote.map((r) => r.written!.power)) : null, on: wrote.length ? mean(wrote.map((r) => r.written!.on)) : null, min: wrote.length ? mean(wrote.map((r) => r.written!.min)) : null,
    });
  }

/** Strategy diversity: how many different policies win at least a third of a chapter's seeds, and the entropy of who wins. */
function diversity(scenario: string): { viable: string[]; entropy: number } {
  const cs = cells.filter((c) => c.scenario === scenario && c.policy !== 'noop');
  const viable = cs.filter((c) => c.winRate >= 1 / 3).map((c) => c.policy);
  const wins = cs.map((c) => c.wins);
  const total = wins.reduce((a, b) => a + b, 0);
  const entropy = total ? -wins.filter((w) => w > 0).reduce((a, w) => a + (w / total) * Math.log2(w / total), 0) : 0;
  return { viable, entropy: Math.round(entropy * 100) / 100 };
}

const lines: string[] = [];
lines.push(`# Generative Reality tournament: ${name}`, '');
lines.push(`Written-belief rules ${rules ?? 'current'}. Seeds ${from}..${from + seeds - 1}, difficulty ${difficulty}, chapters ${scenarios.join(', ')}; ${rows.length} runs in ${Math.round((performance.now() - t0) / 1000)} s; model calls: 0 (the network was switched off).`, '');
for (const scenario of scenarios) {
  const d = diversity(scenario);
  lines.push(`## ${scenario}`, '', `Policies winning at least a third of seeds: ${d.viable.length ? d.viable.join(', ') : 'none'}; entropy of winners ${d.entropy} bits.`, '');
  lines.push('| Policy | Wins | Written belief (power, support, believers) | Law reached | Law day | Nights acted | AP spent | Survival | Homes lost | Hens lost | Animals lost | Fields lost | Pooled tiles | Side events | Firm reach | Heard | Demos ok / failed | Keeper trust | Tests met / failed / lapsed | Harm / leader opposed | Missed objectives | Pass days | ms/run |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of cells.filter((x) => x.scenario === scenario)) {
    const w = rows.find((r) => r.scenario === scenario && r.policy === c.policy && r.written)?.written;
    lines.push(`| ${c.policy} | ${c.wins}/${c.n} | ${w ? `“${w.short}” (${f1(c.power ?? 0)}, ${pct(c.on ?? 0)}, ${f1(c.min ?? 0)})` : '—'} | ${w ? pct(c.lawRate) : '—'} | ${c.lawDay !== null ? f1(c.lawDay) : '—'} | ${w ? f1(c.nights) : '—'} | ${f1(c.apSpent)} | ${pct(c.survival)} | ${f1(c.homesLost)} | ${f1(c.hens)} | ${f1(c.livestock)} | ${f1(c.fields)} | ${f1(c.pooled)} | ${f1(c.side)} | ${w ? pct(c.reach) : '—'} | ${w ? pct(c.heard) : '—'} | ${f1(c.demos.ok)} / ${f1(c.demos.failed)} | ${Math.round(c.keeperTrust)} | ${f1(c.tests.met)} / ${f1(c.tests.failed)} / ${f1(c.tests.lapsed)} | ${f1(c.harmed)} / ${f1(c.opposed)} | ${Object.entries(c.fails).map(([k, v]) => `${k} ${v}`).join(', ') || '—'} | ${f1(c.passDays)} | ${Math.round(c.msPerRun)} |`);
  }
  lines.push('');
}
const md = lines.join('\n');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'runs.json'), JSON.stringify(rows));
writeFileSync(join(out, 'summary.json'), JSON.stringify({ name, from, seeds, difficulty, scenarios, policies, cells, diversity: Object.fromEntries(scenarios.map((s) => [s, diversity(s)])) }, null, 1));
writeFileSync(join(out, 'REPORT.md'), md);
if (flag('publish')) {
  const pub = join('docs', 'data', 'tournament-v2', name);
  mkdirSync(pub, { recursive: true });
  writeFileSync(join(pub, 'summary.json'), JSON.stringify({ name, from, seeds, difficulty, scenarios, policies, cells, diversity: Object.fromEntries(scenarios.map((s) => [s, diversity(s)])) }, null, 1));
  writeFileSync(join(pub, 'REPORT.md'), md);
}
console.log(md);
