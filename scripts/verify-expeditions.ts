/**
 * Offline verification of generated villages.
 *   npx tsx scripts/verify-expeditions.ts --from 1 --to 1000 [--workers 4] [--catalog] [--out docs/data/expeditions.json]
 *
 * For every seed: generate (with the generator's own structural checks and idle-run check), then play it with the scripted
 * witness planners. A village is *verified* when at least one planner wins it. Seeds that no planner wins are reported, not hidden:
 * they may still be winnable by a human (the planners are heuristics), so this is evidence of solvability, never a proof.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { generateExpedition, GEN_VERSION } from '../src/engine/gen/expedition.ts';
import { verifyExpedition } from '../src/engine/gen/witness.ts';
import { RULES_VERSION } from '../src/engine/core/types.ts';

export interface SeedReport {
  seed: number;
  biome: string;
  name: string;
  population: number;
  days: number;
  modifiers: string[];
  attempt: number;
  structuralIssues: string[];
  idleLoses: boolean;
  wins: string[];
  tried: string[];
  results: { policy: string; result: string; alive: number; score: number }[];
  genMs: number;
  verifyMs: number;
}

function one(seed: number): SeedReport {
  const t0 = performance.now();
  const x = generateExpedition(seed);
  const genMs = performance.now() - t0;
  const t1 = performance.now();
  const v = verifyExpedition(seed, x.bp, x.def);
  return {
    seed, biome: x.bp.biome, name: x.def.runtime.name, population: x.bp.population, days: x.def.runtime.durationDays, modifiers: x.bp.modifiers, attempt: x.attempt,
    structuralIssues: x.issues, idleLoses: v.noopResult === 'defeat', wins: v.wins, tried: v.tried, results: v.results, genMs, verifyMs: performance.now() - t1,
  };
}

const args = process.argv.slice(2);
const argv = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};

if (args.includes('--child')) {
  // child process: verify the given seeds and print one JSON line per seed
  const seeds = argv('seeds', '').split(',').filter(Boolean).map(Number);
  for (const seed of seeds) {
    let rep: SeedReport;
    try {
      rep = one(seed);
    } catch (err) {
      rep = { seed, biome: 'crash', name: String(err), population: 0, days: 0, modifiers: [], attempt: 0, structuralIssues: ['crash'], idleLoses: false, wins: [], tried: [], results: [], genMs: 0, verifyMs: 0 };
    }
    process.stdout.write(JSON.stringify(rep) + '\n');
  }
} else {
  const arg = argv;
  const from = Number(arg('from', '1'));
  const to = Number(arg('to', '200'));
  const nWorkers = Math.max(1, Math.min(Number(arg('workers', String(Math.max(1, cpus().length)))), to - from + 1));
  const out = arg('out', 'docs/data/expeditions.json');
  const writeCatalog = args.includes('--catalog');
  const seeds: number[][] = Array.from({ length: nWorkers }, () => []);
  for (let s = from; s <= to; s++) seeds[(s - from) % nWorkers].push(s);
  const reports: SeedReport[] = [];
  let finished = 0;
  const started = Date.now();
  for (const chunk of seeds) {
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--child', '--seeds', chunk.join(',')], { stdio: ['ignore', 'pipe', 'inherit'] });
    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      reports.push(JSON.parse(line) as SeedReport);
      if (reports.length % 25 === 0) console.log(`  ${reports.length}/${to - from + 1} seeds, ${Math.round((Date.now() - started) / 1000)} s`);
    });
    rl.on('close', () => {
      finished++;
      if (finished === nWorkers) finish();
    });
  }

  function finish(): void {
    reports.sort((a, b) => a.seed - b.seed);
    const have = new Set(reports.map((r) => r.seed));
    const missing: number[] = [];
    for (let sd = from; sd <= to; sd++) if (!have.has(sd)) missing.push(sd);
    if (missing.length) console.error(`WARNING: no report for seeds ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? '…' : ''}`);
    const total = reports.length;
    const crashed = reports.filter((r) => r.biome === 'crash');
    const sound = reports.filter((r) => r.biome !== 'crash' && r.structuralIssues.length === 0);
    const verified = sound.filter((r) => r.wins.length > 0 && r.idleLoses);
    const strong = verified.filter((r) => r.wins.length >= 2);
    const byBiome = (b: string) => sound.filter((r) => r.biome === b);
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
    const median = (xs: number[]) => {
      const s = xs.slice().sort((p, q) => p - q);
      return s.length ? s[Math.floor(s.length / 2)] : 0;
    };
    const modStats: Record<string, { n: number; verified: number }> = {};
    for (const r of sound) for (const m of r.modifiers) {
      const k = (modStats[m] ??= { n: 0, verified: 0 });
      k.n++;
      if (r.wins.length) k.verified++;
    }
    const summary = {
      genVersion: GEN_VERSION, rulesVersion: RULES_VERSION, from, to, total, crashed: crashed.length,
      structurallyValid: sound.length, retried: reports.filter((r) => r.attempt > 0).length, fallbackUsed: reports.filter((r) => r.structuralIssues.length > 0).length,
      idleWins: sound.filter((r) => !r.idleLoses).length,
      verified: verified.length, verifiedPct: pct(verified.length, total), twoDistinctWins: strong.length, twoDistinctPct: pct(strong.length, total),
      medianGenMs: Math.round(median(reports.map((r) => r.genMs))), medianVerifyMs: Math.round(median(reports.map((r) => r.verifyMs))),
      byBiome: Object.fromEntries(['river', 'drought', 'wolves'].map((b) => [b, { n: byBiome(b).length, verified: byBiome(b).filter((r) => r.wins.length).length, pct: pct(byBiome(b).filter((r) => r.wins.length).length, byBiome(b).length), twoWins: byBiome(b).filter((r) => r.wins.length >= 2).length }])),
      byModifier: modStats,
      policyWins: reports.reduce<Record<string, number>>((acc, r) => {
        for (const w of r.wins) acc[w] = (acc[w] ?? 0) + 1;
        return acc;
      }, {}),
      elapsedSeconds: Math.round((Date.now() - started) / 1000),
    };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ summary, reports }, null, 0));
    console.log(JSON.stringify(summary, null, 2));
    if (writeCatalog) {
      const entries = verified.map((r) => ({ seed: r.seed, biome: r.biome, modifiers: r.modifiers, wins: r.wins, population: r.population, days: r.days }));
      writeFileSync(new URL('../src/engine/gen/catalog.json', import.meta.url), JSON.stringify({ format: 'belief-engine-expedition-catalog', genVersion: GEN_VERSION, rulesVersion: RULES_VERSION, tried: total, verified: entries }));
      console.log(`catalog written: ${entries.length} verified of ${total}`);
    }
    process.exit(crashed.length || missing.length ? 1 : 0);
  }
}
