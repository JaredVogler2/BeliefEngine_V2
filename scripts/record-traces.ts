/* Records verified action traces for regression fixtures: npx tsx scripts/record-traces.ts [scenario...] */
import { writeFileSync } from 'node:fs';
import { runPolicy } from '../src/engine/ai/bots/run.ts';
import * as S from '../src/engine/ai/bots/strategies.ts';
import { noop } from '../src/engine/ai/bots/basic.ts';
import type { Policy } from '../src/engine/ai/bots/types.ts';
import { replayRun } from '../src/engine/core/replay.ts';

const PLAN: Record<string, [string, Policy][]> = {
  redbank: [['fireWall', S.fireWall], ['witnessBridge', S.witnessBridge]],
  harvest: [['moonlight', S.moonlight], ['caravans', S.caravans]],
  ashwood: [['smokeRing', S.smokeRing], ['decoy', S.decoy]],
};

const wanted = process.argv.slice(2);
for (const [scenarioId, pols] of Object.entries(PLAN)) {
  if (wanted.length && !wanted.includes(scenarioId)) continue;
  const out: Record<string, unknown> = { scenarioId };
  let found = false;
  for (let seed = 1; seed <= 120 && !found; seed++) {
    const runs = pols.map(([key, p]) => [key, runPolicy(p, { scenarioId, seed })] as const);
    if (runs.every(([, r]) => r.result === 'victory')) {
      found = true;
      out.canonicalSeed = seed;
      for (const [key, r] of runs) {
        const rep = replayRun({ scenarioId, seed, actions: r.log });
        out[key] = { seed, result: r.result, alive: r.alive, homes: r.homes, food: r.food, score: r.score, lawsActivated: r.lawsActivated, stateHash: rep.stateHash, eventHash: rep.eventHash, actions: r.log };
      }
    }
  }
  if (!found) {
    console.log(`${scenarioId}: no seed in 1..120 where both strategies win`);
    continue;
  }
  const seed = out.canonicalSeed as number;
  const loss = runPolicy(noop, { scenarioId, seed });
  const rep = replayRun({ scenarioId, seed, actions: loss.log });
  out.noop = { seed, result: loss.result, alive: loss.alive, homes: loss.homes, food: loss.food, stateHash: rep.stateHash, eventHash: rep.eventHash, actions: loss.log };
  // a plausible failing attempt: the first strategy on the nearest seed where it loses
  for (let s2 = 1; s2 <= 120; s2++) {
    const r = runPolicy(pols[0][1], { scenarioId, seed: s2 });
    if (r.result === 'defeat') {
      const rp = replayRun({ scenarioId, seed: s2, actions: r.log });
      out.failedAttempt = { seed: s2, policy: pols[0][0], result: r.result, alive: r.alive, stateHash: rp.stateHash, eventHash: rp.eventHash, actions: r.log };
      break;
    }
  }
  writeFileSync(`tests/fixtures/${scenarioId}-traces.json`, JSON.stringify(out, null, 1));
  console.log(`${scenarioId}: canonical seed ${seed}; ${pols.map(([k]) => k).join(' + ')} win; noop ${loss.result}; failedAttempt ${out.failedAttempt ? 'recorded' : 'none'}`);
}
