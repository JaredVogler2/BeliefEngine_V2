/**
 * Verify a run the MCP server persisted: replay its accepted actions in the engine from scratch and compare the result with the
 * state the server stored. The server does this itself on load (a tampered file is refused); this prints the hashes so a person can
 * see them, and check them against the browser (`window.__belief.hash()` with ?debug=1) or the `verification` block of get_results.
 *
 *   npx tsx mcp/verify-run.ts ~/.belief-engine/mcp/runs/<runId>.json
 */
import { readFileSync } from 'node:fs';
import { replayRun, stateHash, eventHash, deserializeRun } from '../src/engine/index.ts';
import { replayVersions, versionDrift } from '../src/engine/save/versions.ts';

const file = process.argv[2];
if (!file) {
  console.error('usage: npx tsx mcp/verify-run.ts <run file>');
  process.exit(2);
}
const run = JSON.parse(readFileSync(file, 'utf8')) as { id: string; options: Parameters<typeof replayRun>[0]; actions: Parameters<typeof replayRun>[0]['actions']; state: string; base?: string; versions?: Parameters<typeof versionDrift>[0] };
if (run.base) {
  console.log('this run was imported from a browser save; its replay starts at that save, so a from-scratch replay does not apply');
  process.exit(0);
}
const drift = versionDrift(run.versions, replayVersions(run.options));
if (run.versions) console.log(drift.length ? `VERSION DIFFERENCE: recorded under ${drift.join('; ')}` : `recorded under the versions this engine has (rules ${run.versions.rules}, schema ${run.versions.schema}, belief language ${run.versions.beliefLanguage}, opening state ${run.versions.start})`);
else console.log('this run file carries no version stamp (recorded before they were written)');
const rep = replayRun({ ...run.options, actions: run.actions });
const stored = deserializeRun(run.state);
const same = stored.ok && stateHash(stored.state) === stateHash(rep.state) && eventHash(stored.state) === eventHash(rep.state);
console.log(`run ${run.id}: ${run.actions.length} accepted actions, ${rep.rejected.length} rejected on replay`);
console.log(`replayed from scratch: state ${stateHash(rep.state)}, events ${eventHash(rep.state)}, ${rep.state.outcome ? `${rep.state.outcome.result}, score ${rep.state.outcome.score}` : `day ${rep.state.day}, not finished`}`);
console.log(same ? 'the replay is IDENTICAL to the state the server stored' : 'MISMATCH with the state the server stored');
process.exit(same && rep.rejected.length === 0 && drift.length === 0 ? 0 : 1);
