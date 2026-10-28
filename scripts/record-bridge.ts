/*
 * Records the phase 09 belief-to-reality chains as replayable traces: npx tsx scripts/record-bridge.ts
 *
 * Each chain starts from a sentence, read by the offline reader in the live village, written with an ordinary COMPOSE action and then
 * spread by the same greedy, preview-driven bot the balance tournaments use (lawPusher: tellings, gatherings, messengers, proofs),
 * with the physical catalyst (the bell, a lit lantern) supplied by the policy below. Nothing is set directly: belief moves only by
 * the engine's own rules. The traces are fixtures for tests/unit/belief-bridge.test.ts and the browser specs.
 */
import { writeFileSync } from 'node:fs';
import { GameSession } from '../src/engine/core/session.ts';
import { replayRun, stateHash } from '../src/engine/core/replay.ts';
import { lawPusher, lightBeaconsByCoverage } from '../src/engine/ai/bots/lawpusher.ts';
import { readBelief } from '../src/engine/reality/read.ts';
import type { Action, RunState } from '../src/engine/core/types.ts';

interface Chain {
  key: string;
  why: string;
  scenarioId: string;
  seed: number;
  sentence: string;
  region?: string;
  /** the story the bot pushes; null: the written belief itself */
  push: string | null;
  /** from this day the catalyst is supplied every day (also as soon as the written law starts to wake) */
  catalystFrom: number;
  /** tell only this many people on day 1, then never again (the below-threshold control) */
  starve?: boolean;
}

const A = 'Chickens fly when the bell rings.';
const B = 'Wet stone becomes light beside lanterns.';
const C = 'At night, bell ringing pulls rain toward the orchard and makes local flames burn weaker.';

const CHAINS: Chain[] = [
  { key: 'hens', why: 'claim A through real persuasion: law on day 6, the hens ride out two flood nights; all Influence went to the hens, so four villagers drown (a complete loss)', scenarioId: 'redbank', seed: 2, sentence: A, push: null, catalystFrom: 6 },
  { key: 'hensBelow', why: 'the same village and sentence, told to one person and never again: the bell rings every night, the law never wakes, nothing flies and the hens drown', scenarioId: 'redbank', seed: 2, sentence: A, push: null, catalystFrom: 1, starve: true },
  { key: 'stones', why: 'claim B through real persuasion: law on day 6; wet stones by the lit lanterns weigh almost nothing, a villager carries one to the bank and the bank stands higher for good', scenarioId: 'redbank', seed: 3, sentence: B, push: null, catalystFrom: 4 },
  { key: 'rain', why: 'claim C through real persuasion in a nine-day generated village (held in Eastbank): law on the last day; the rain is drawn onto Eastbank (it pools on the low ground), flames burn weaker and the hearths cool', scenarioId: 'x1.2', seed: 1, sentence: C, region: 'east', push: null, catalystFrom: 4 },
  { key: 'win', why: 'a complete win in a Generative Reality run: the written belief is composed and spread, but the authored Fire Wall decides the chapter', scenarioId: 'redbank', seed: 1, sentence: A, push: 'river_fears_fire', catalystFrom: 5 },
];

function record(c: Chain): Record<string, unknown> {
  const g = GameSession.create({ scenarioId: c.scenarioId, seed: c.seed, reality: true });
  const opening = c.push && g.state.scn.starters.includes(c.push) ? c.push : g.state.scn.starters[0];
  g.act({ type: 'PICK_STARTER', claim: opening });
  const reading = readBelief(g.state, c.sentence, c.region ? { region: c.region } : {});
  const cand = reading.kind === 'supported' || reading.kind === 'partial' ? reading.candidates[0] : null;
  if (!cand?.build.ok) throw new Error(`${c.key}: the sentence has no buildable reading (${reading.kind})`);
  const draft = cand.build.draft;
  const composed = g.act({ type: 'COMPOSE', claim: draft.claim });
  if (!composed.ok) throw new Error(`${c.key}: compose refused: ${composed.error.message}`);
  const id = draft.claim.id;
  const lawUp = (s: RunState) => s.laws.some((l) => l.claimId === id && l.progress > 0);
  const catalyst = (gg: GameSession) => {
    const s = gg.state;
    if (c.push === 'river_fears_fire' && s.day >= 5) lightBeaconsByCoverage(gg);
    if (c.push || (s.day < c.catalystFrom && !lawUp(s))) return;
    if (/bell/.test(c.sentence)) {
      const bt = s.world.landmarks.find((l) => l.kind === 'belltower');
      if (bt && gg.state.ap >= 1) gg.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: bt.id });
    }
    if (/lantern/.test(c.sentence))
      for (const b of s.world.landmarks.filter((l) => l.kind === 'beacon' && draft.ast.regions.includes(l.district) && !(l.lit && l.fuelNights >= 2)))
        if (gg.state.ap >= 1) gg.act({ type: 'RITUAL', ritual: 'light_beacon', landmark: b.id });
  };
  if (c.starve) {
    const first = g.state.villagers.filter((v) => draft.ast.regions.includes(v.district)).sort((a, b) => b.traits.influence - a.traits.influence || (a.id < b.id ? -1 : 1))[0];
    g.act({ type: 'SEED', claim: id, target: first.id });
    while (!g.state.outcome) {
      catalyst(g);
      g.endDay();
    }
  } else {
    const main = c.push ?? id;
    const bot = lawPusher({
      name: c.key, claim: main, regions: c.push === 'river_fears_fire' ? ['east'] : draft.ast.regions,
      reserve: (s) => (c.push === 'river_fears_fire' ? (s.day >= 5 ? Math.min(s.ap, 4) : 0) : s.day >= c.catalystFrom || lawUp(s) ? 1 : 0),
      physical: catalyst,
    });
    for (let d = 0; d < 20 && !g.state.outcome; d++) bot.playDay(g);
  }
  const actions: Action[] = g.log.slice();
  const rep = replayRun({ scenarioId: c.scenarioId, seed: c.seed, actions, reality: true });
  if (rep.rejected.length || rep.stateHash !== stateHash(g.state)) throw new Error(`${c.key}: the trace does not replay to the live run (${JSON.stringify(rep.rejected)})`);
  const s = g.state;
  const lawDay = s.log.find((e) => e.code === 'LAW_ACTIVATED' && e.claim === id)?.day ?? null;
  const out = {
    why: c.why, scenarioId: c.scenarioId, seed: c.seed, sentence: c.sentence, region: c.region ?? null, claimId: id,
    result: s.outcome?.result ?? null, lawDay, alive: s.villagers.filter((v) => v.status !== 'dead').length,
    hens: s.v2!.chickens.filter((h) => h.alive).length, bank: Object.keys(s.v2!.bank).length,
    stateHash: rep.stateHash, eventHash: rep.eventHash, actions,
  };
  console.log(`${c.key}: ${out.result} law ${lawDay ?? 'never'} alive ${out.alive} hens ${out.hens} bank ${out.bank} (${actions.length} actions)`);
  return out;
}

const out: Record<string, unknown> = { note: 'Recorded by scripts/record-bridge.ts; re-record after any change to the reader, the balance, the social rules or the executor.' };
for (const c of CHAINS) out[c.key] = record(c);
writeFileSync('tests/fixtures/v2-bridge-traces.json', `${JSON.stringify(out, null, 1)}\n`);
