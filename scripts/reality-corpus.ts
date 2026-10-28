/**
 * Scores the offline reader v2 against the adversarial corpus (tests/fixtures/reality-corpus-1.json) and prints the table.
 * `npm run reality:corpus` (add `--holdout` or `--holdout2` for a held-out corpus, `--v1` to score V1's offline composer through the
 * V1→v2 bridge instead, `--cases` to list every case, `--fails` for the misses only, `--json` for machine output).
 *
 * The same author wrote the first corpus and the reader, so its numbers measure regressions and honesty, not unbiased accuracy. The
 * held-out corpora were written by independent agents; each is scored once before any change it informs, and is in-sample after.
 */
import { readFileSync } from 'node:fs';
import { GameSession } from '../src/engine/index.ts';
import { scoreCorpus, v1Reading, type CorpusCase } from './lib/reality-score.ts';

const argv = process.argv.slice(2);
const file = argv.includes('--holdout2') ? 'reality-corpus-holdout-2.json' : argv.includes('--holdout') ? 'reality-corpus-holdout-1.json' : 'reality-corpus-1.json';
const corpus = JSON.parse(readFileSync(new URL(`../tests/fixtures/${file}`, import.meta.url), 'utf8')) as { name: string; cases: CorpusCase[] };
const states = new Map<string, ReturnType<typeof GameSession.create>['state']>();
const stateFor = (id: string) => states.get(id) ?? states.set(id, GameSession.create({ scenarioId: id, seed: 1, reality: true }).state).get(id)!;
const r = argv.includes('--v1') ? scoreCorpus(corpus.cases, stateFor, v1Reading, 'V1 offline composer (nl/interpret.ts) via astFromV1') : scoreCorpus(corpus.cases, stateFor);
const args = new Set(argv);
if (args.has('--json')) {
  console.log(JSON.stringify(r, null, 1));
  process.exit(0);
}
if (args.has('--cases') || args.has('--fails'))
  for (const c of r.cases) {
    if (args.has('--fails') && c.ok) continue;
    console.log(`${c.ok ? 'ok  ' : 'MISS'} ${c.id.padEnd(8)} ${c.expect.padEnd(11)} → ${c.got.padEnd(11)} ${c.detail}  | ${c.text}`);
  }
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
const m = r.metrics;
console.log(`\n${corpus.name} · ${r.cases.length} cases · reader ${r.reader}`);
console.log(`label exactly right            ${m.labelOk}/${r.cases.length}  ${pct(m.labelOk, r.cases.length)}`);
console.log(`supported read faithfully      ${m.faithful}/${m.supported}  ${pct(m.faithful, m.supported)}   (right kinds, operators and triggers in the reading)`);
console.log(`unsupported: abstained         ${m.abstained}/${m.unsupported}  ${pct(m.abstained, m.unsupported)}`);
console.log(`unsupported: reason named      ${m.reasonOk}/${m.unsupported}  ${pct(m.reasonOk, m.unsupported)}`);
console.log(`hallucinated an effect         ${m.hallucinated}/${m.unsupported}  ${pct(m.hallucinated, m.unsupported)}   (an executable reading for an unsupported sentence)`);
console.log(`partial: left-out part named   ${m.partialNamed}/${m.partial}  ${pct(m.partialNamed, m.partial)}`);
console.log(`ambiguous: offered a choice    ${m.ambiguousOk}/${m.ambiguous}  ${pct(m.ambiguousOk, m.ambiguous)}`);
console.log(`compound clauses kept          ${m.clausesKept}/${m.compound}  ${pct(m.clausesKept, m.compound)}`);
console.log(`injected instructions obeyed   ${m.injectionObeyed}/${m.injection}`);
console.log(`readings that build here       ${m.grounded}/${m.readings}  ${pct(m.grounded, m.readings)}   (the engine accepts them in this village)`);
console.log(`per category:`);
for (const [k, v] of Object.entries(r.byCategory)) console.log(`  ${k.padEnd(14)} ${v.ok}/${v.n}`);
