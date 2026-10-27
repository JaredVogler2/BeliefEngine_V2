/**
 * Replay a recorded run from nothing and print what it reproduces: the example in the README.
 *
 *   npx tsx scripts/replay-example.ts                       # Flood at Redbank, seed 1, the "Fire Wall" route
 *   npx tsx scripts/replay-example.ts witnessBridge         # the other winning route on the same seed
 *   npx tsx scripts/replay-example.ts noop                  # doing nothing: the village is lost
 *
 * The actions come from tests/fixtures/redbank-traces.json (the same files the unit and browser tests replay). The run is rebuilt by the
 * engine alone: no browser, no model, no network, nothing stored but the seed and the list of actions. Exit code 1 if the replay does not
 * reproduce the hashes recorded beside the actions.
 */
import { readFileSync } from 'node:fs';
import { buildDebrief, eventHash, replayRun, stateHash } from '../src/engine/index.ts';
import type { Action } from '../src/engine/index.ts';

interface Trace { actions: Action[]; stateHash: string; eventHash: string; result: string; score: number }
const file = JSON.parse(readFileSync(new URL('../tests/fixtures/redbank-traces.json', import.meta.url), 'utf8')) as { canonicalSeed: number } & Record<string, Trace | number>;
const name = process.argv[2] ?? 'fireWall';
const trace = file[name];
if (!trace || typeof trace === 'number') {
  console.error(`no such trace "${name}"; try: ${Object.keys(file).filter((k) => typeof file[k] === 'object').join(', ')}`);
  process.exit(2);
}

const run = replayRun({ scenarioId: 'redbank', seed: file.canonicalSeed, difficulty: 'normal', actions: trace.actions });
const s = run.state;
const d = buildDebrief(s);
const days = s.history.length + (s.outcome ? 0 : 1);
console.log(`Flood at Redbank, seed ${file.canonicalSeed}, "${name}": ${trace.actions.length} actions over ${days} days`);
console.log(`${s.outcome?.result ?? 'unfinished'}, score ${s.outcome?.score ?? 0}, ${s.villagers.filter((v) => v.status !== 'dead').length} of ${s.villagers.length} villagers alive${d.medal && d.medal !== 'none' ? `, ${d.medal} medal` : ''}`);
console.log(`laws woken: ${[...new Set(s.laws.filter((l) => l.activatedDay !== null).map((l) => l.claimId))].join(', ') || 'none'}`);
console.log(`state hash ${stateHash(s)}   event hash ${eventHash(s)}   (recorded: ${trace.stateHash}, ${trace.eventHash})`);
const same = run.rejected.length === 0 && stateHash(s) === trace.stateHash && eventHash(s) === trace.eventHash;
console.log(same ? 'IDENTICAL to the recorded run' : `MISMATCH (${run.rejected.length} rejected actions)`);
process.exit(same ? 0 : 1);
