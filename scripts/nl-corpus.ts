/**
 * Runs the belief corpus through the offline composer and prints what it got right and wrong, with every failure listed.
 *
 *   npx tsx scripts/nl-corpus.ts [tests/fixtures/belief-corpus.json] [--json out.json]
 */
import { writeFileSync } from 'node:fs';
import { loadCorpus, runCorpus, summarise } from './lib/nl-corpus-core.ts';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : '';
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--json') ?? 'tests/fixtures/belief-corpus.json';
const outcomes = runCorpus(loadCorpus(file));
const sum = summarise(outcomes);
console.log(`${file}: ${sum.passed}/${sum.total} as expected`);
for (const [c, v] of Object.entries(sum.byCategory)) console.log(`  ${c.padEnd(14)} ${v.pass}/${v.n}`);
console.log(`  readings that answered when they should not, or answered wrongly: ${sum.wrongReadings}`);
console.log(`  answers expected: ${sum.answerPrecision.correct}/${sum.answerPrecision.of} correct; refusals expected: ${sum.abstentionCorrect.correct}/${sum.abstentionCorrect.of} correct`);
for (const o of outcomes.filter((x) => !x.pass)) console.log(`  FAIL [${o.entry.category}/${o.entry.village}] ${JSON.stringify(o.entry.text.slice(0, 70))}: ${o.why}; got ${o.got.slice(0, 90)}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ file, summary: sum, failures: outcomes.filter((o) => !o.pass).map((o) => ({ category: o.entry.category, village: o.entry.village, text: o.entry.text.slice(0, 120), expected: o.entry.status, got: o.got, why: o.why })) }, null, 1) + '\n');
