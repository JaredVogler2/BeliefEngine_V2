/** Turns docs/data/expeditions.json into a Markdown section: npx tsx scripts/report-expeditions.ts > docs/data/EXPEDITION_REPORT.md */
import { readFileSync } from 'node:fs';
import { signatureOf } from '../src/engine/gen/expedition.ts';
import { generateExpedition } from '../src/engine/gen/expedition.ts';
import type { SeedReport } from './verify-expeditions.ts';

interface Summary {
  genVersion: number; rulesVersion: string; from: number; to: number; total: number; crashed: number; structurallyValid: number; retried: number; fallbackUsed: number;
  idleWins: number; verified: number; twoDistinctWins: number; medianGenMs: number; elapsedSeconds: number;
  byBiome: Record<string, { n: number; verified: number; pct: number; twoWins: number }>;
  byModifier: Record<string, { n: number; verified: number }>;
  policyWins: Record<string, number>;
}
const data = JSON.parse(readFileSync(new URL('../docs/data/expeditions.json', import.meta.url), 'utf8')) as { summary: Summary; reports: SeedReport[] };
const s = data.summary;
const rows = data.reports;
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '–');

const out: string[] = [];
out.push(`### Procedural villages: generation and solvability (generator v${s.genVersion}, rules ${s.rulesVersion})`);
out.push('');
out.push(`Seeds ${s.from}–${s.to} (${s.total} villages) were generated, checked and played by scripted planners on this machine in ${s.elapsedSeconds} s of wall time (${(s.elapsedSeconds / s.total).toFixed(2)} s per village on 4 workers, each village played up to four times). Raw data: \`docs/data/expeditions.json\`.`);
out.push('');
out.push('| Check | Result |');
out.push('| --- | --- |');
out.push(`| Hard crashes | ${s.crashed} |`);
out.push(`| Villages that passed every structural invariant | ${s.structurallyValid} of ${s.total} |`);
out.push(`| Needed a derived seed (first draw rejected) | ${s.retried} of ${s.total} (${pct(s.retried, s.total)}) |`);
out.push(`| Still failed after 24 derived seeds | ${s.fallbackUsed} (reported, not hidden) |`);
out.push(`| "Do nothing" wins the village | ${s.idleWins} |`);
out.push(`| Won by at least one planner (verified) | ${s.verified} (${pct(s.verified, s.total)}) |`);
out.push(`| Won by two or more different planners | ${s.twoDistinctWins} (${pct(s.twoDistinctWins, s.total)}) |`);
out.push(`| Median generation time (incl. do-nothing check) | ${s.medianGenMs} ms |`);
out.push('');
out.push('| Biome | Villages | Verified | Rate | Two+ planners win |');
out.push('| --- | --- | --- | --- | --- |');
for (const [b, v] of Object.entries(s.byBiome as Record<string, { n: number; verified: number; pct: number; twoWins: number }>)) out.push(`| ${b} | ${v.n} | ${v.verified} | ${v.pct}% | ${v.twoWins} |`);
out.push('');
out.push('| Planner | Villages won |');
out.push('| --- | --- |');
for (const [p, n] of Object.entries(s.policyWins as Record<string, number>).sort((a, b) => b[1] - a[1])) out.push(`| ${p} | ${n} |`);
out.push('');
out.push('| Run modifier | Villages | Verified | Rate |');
out.push('| --- | --- | --- | --- |');
for (const [m, v] of Object.entries(s.byModifier as Record<string, { n: number; verified: number }>).sort()) out.push(`| ${m} | ${v.n} | ${v.verified} | ${pct(v.verified, v.n)} |`);
out.push('');

// variety: distinct signatures over the whole sample and over windows of successive seeds
const sigs = new Map<string, number>();
const window = 12;
let minDistinct = 99;
const sigList: string[] = [];
for (const r of rows) {
  if (r.biome === 'crash') continue;
  const x = generateExpedition(r.seed);
  const sg = signatureOf(x.bp);
  sigList.push(sg);
  sigs.set(sg, (sigs.get(sg) ?? 0) + 1);
}
for (let i = 0; i + window <= sigList.length; i += window) minDistinct = Math.min(minDistinct, new Set(sigList.slice(i, i + window)).size);
out.push(`**Variety.** ${sigs.size} distinct gameplay signatures in ${sigList.length} villages (signature = biome, size class, choke topology, headline crisis number, starting stories, run modifiers). In every aligned window of ${window} successive seeds there were at least ${minDistinct} distinct signatures. The biome shuffle bag guarantees each biome appears twice in every aligned run of six seeds.`);
out.push('');
const unverified = rows.filter((r) => r.biome !== 'crash' && !r.wins.length);
out.push(`**Known false negatives.** ${unverified.length} villages (${pct(unverified.length, s.total)}) were not won by any of the scripted planners (three per biome, deliberately simple). That is not proof that they cannot be won: a human who reads the omens and the social graph plays better than a greedy planner. These seeds are excluded from the verified catalog (daily villages and "another village" never choose them) and are labelled "Unverified seed" if a player types one in. Guaranteed solvability is **not** claimed.`);
out.push('');
console.log(out.join('\n'));
