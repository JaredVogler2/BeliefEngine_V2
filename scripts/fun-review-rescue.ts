/**
 * Phase 15 evidence: "can a lost run still be saved with N days left?" Phase 11 answered with the eight generic bots and found
 * none recoverable in Harvest. That proxy is blind to the routes only the scripted planners know (the grain caravan), so this
 * asks the same question twice on the same lost runs: with the generic plans, and with the scripted chapter planners.
 *
 *   npx tsx scripts/fun-review-rescue.ts [--seeds 40] [--out docs/data/fun-review/rescue.json]
 *
 * A lost run is rewound to the start of the planning day with 3, 2 or 1 days left (the player's own earlier choices intact),
 * and a plan plays on with the real dice. It is hindsight, played by bots; it bounds what exists, not what people find.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GameSession, replayRun, optionsFromState } from '../src/engine/index.ts';
import { policyById } from '../src/engine/ai/bots/generic.ts';
import { caravans, decoy, fireWall, moonlight, smokeRing, witnessBridge } from '../src/engine/ai/bots/strategies.ts';
import { cloneState } from '../src/engine/core/clone.ts';
import type { Policy } from '../src/engine/ai/bots/types.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const SEEDS = Number(arg('seeds', '40'));
const outFile = arg('out', 'docs/data/fun-review/rescue.json');

const cases: { scenario: string; scripted: Policy[]; losers: string[] }[] = [
  { scenario: 'redbank', scripted: [fireWall, witnessBridge], losers: ['greedy', 'threat-aware', 'broadcaster', 'random'] },
  { scenario: 'harvest', scripted: [moonlight, caravans], losers: ['greedy', 'threat-aware', 'broadcaster', 'random'] },
  { scenario: 'ashwood', scripted: [smokeRing, decoy], losers: ['greedy', 'threat-aware', 'broadcaster', 'random'] },
];
const GENERIC = ['greedy', 'threat-aware', 'evidence-first', 'bridge-builder', 'broadcaster'];

const out: Record<string, unknown> = {};
for (const c of cases) {
  const rows: Record<string, { lostRuns: number; savedByGenericPlans: number; savedByScriptedPlans: number }> = { '3 days left': { lostRuns: 0, savedByGenericPlans: 0, savedByScriptedPlans: 0 }, '2 days left': { lostRuns: 0, savedByGenericPlans: 0, savedByScriptedPlans: 0 }, '1 day left': { lostRuns: 0, savedByGenericPlans: 0, savedByScriptedPlans: 0 } };
  for (const pid of c.losers)
    for (let seed = 1; seed <= SEEDS; seed++) {
      const g = GameSession.create({ scenarioId: c.scenario, seed });
      const p = policyById(pid);
      for (let n = 0; !g.state.outcome && n < 40; n++) p.playDay(g);
      if (g.state.outcome?.result !== 'defeat') continue;
      const final = g.state;
      const days = final.history.length;
      for (const left of [3, 2, 1]) {
        const day = days - left + 1;
        if (day < 1) continue;
        const actions = final.history.filter((h) => h.day < day).flatMap((h) => [...h.actions, { type: 'END_DAY' as const }]);
        const base = replayRun({ ...optionsFromState(final), actions }).state;
        const wins = (pol: Policy) => {
          const s2 = new GameSession(cloneState(base));
          for (let k = 0; !s2.state.outcome && k < 40; k++) pol.playDay(s2);
          return s2.state.outcome?.result === 'victory';
        };
        const row = rows[`${left} day${left === 1 ? '' : 's'} left`];
        row.lostRuns++;
        if (GENERIC.some((id) => wins(policyById(id)))) row.savedByGenericPlans++;
        if (c.scripted.some(wins)) row.savedByScriptedPlans++;
      }
    }
  out[c.scenario] = rows;
  console.log(c.scenario, JSON.stringify(rows));
}
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ seedsPerLoser: SEEDS, losers: ['greedy', 'threat-aware', 'broadcaster', 'random'], results: out }, null, 1) + '\n');
console.log(`written ${outFile}`);
