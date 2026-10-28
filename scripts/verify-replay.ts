/*
 * Check a replay offline: npx tsx scripts/verify-replay.ts <file.json>
 *
 * Accepts the debrief's "Download the replay" file (format belief-engine-replay), a save file (belief-engine-save: the run replays
 * from its own action log), or an MCP export_replay result. Replays the actions from the options with no network and no model, checks
 * the external-decision ledger against what the replay used, and the final state against the recorded hash. Exit 0 when it all holds.
 */
import { readFileSync } from 'node:fs';
import { checkLedger, checkRun, deriveLedger, deserializeRun, ledgerSummary, type Action, type CreateRunOptions, type Ledger } from '../src/engine/index.ts';

const file = process.argv[2];
if (!file) {
  console.error('usage: npx tsx scripts/verify-replay.ts <replay, save or MCP export file>');
  process.exit(2);
}
// network is not needed and must not be used: make any attempt fail loudly
globalThis.fetch = (() => {
  throw new Error('verify-replay makes no network requests');
}) as typeof fetch;

const text = readFileSync(file, 'utf8');
const raw = JSON.parse(text) as Record<string, unknown>;
let verdict;
let summary: string;
if (raw.format === 'belief-engine-save') {
  const r = deserializeRun(text);
  if (!r.ok) {
    console.error(`not a valid save: ${r.error}`);
    process.exit(1);
  }
  const { check, derived } = checkRun(r.state, r.ledger);
  verdict = check;
  summary = ledgerSummary(derived.ledger).text;
} else {
  // a replay file, or an MCP export_replay result ({ replay: { ...options, actions }, ledger, stateHash })
  const body = (raw.format === 'belief-engine-replay' ? raw : ((raw.structuredContent as Record<string, unknown> | undefined) ?? raw)) as Record<string, unknown>;
  const replay = body.replay as (CreateRunOptions & { actions: Action[] }) | undefined;
  const options = (body.options as CreateRunOptions | undefined) ?? (replay ? (({ actions: _a, ...o }) => o)(replay) : undefined);
  const actions = (body.actions as Action[] | undefined) ?? replay?.actions;
  if (!options || !actions) {
    console.error('this file has no options and actions to replay');
    process.exit(1);
  }
  const derived = deriveLedger(options, actions);
  verdict = checkLedger(body.ledger as Ledger | undefined, derived, body.stateHash as string | undefined);
  summary = ledgerSummary(derived.ledger).text;
}
if (verdict.ok) {
  console.log(`OK: replayed offline to state ${verdict.hash}; external inputs: ${summary}.`);
  process.exit(0);
}
console.log(`FAILED (${verdict.code}${verdict.at !== null ? ` at ${verdict.at}` : ''}): ${verdict.message}\n${verdict.recovery}`);
process.exit(1);
