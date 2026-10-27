/**
 * Plays two belief sentences, typed as a person would, from words to world: interpret, write, spread through real telling and
 * messengers until the village believes it, and measure what the law then does to the map. Everything after the interpretation is
 * the ordinary engine (no model, no network); the action log it prints replays to the same state in the browser or over MCP.
 *
 *   npx tsx scripts/nl-demo.ts [--village redbank] [--seed 1] [--out docs/data/nl/demo.json]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GameSession, optionsFromState, replayRun, stateHash, eventHash } from '../src/engine/index.ts';
import type { Action } from '../src/engine/index.ts';
import { cloneState } from '../src/engine/core/clone.ts';
import { lawPusher } from '../src/engine/ai/bots/lawpusher.ts';
import { computeModifiers } from '../src/engine/laws/effects.ts';
import { interpretBelief } from '../src/engine/nl/interpret.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const village = arg('village', 'redbank');
const seed = Number(arg('seed', '1'));
const out = arg('out', '');
const SENTENCES: Record<string, string[]> = {
  redbank: ['The river turns aside from lit lanterns.', 'No flood can break a bridge that is watched.', 'The bridge cannot fall while the bells ring.'],
  harvest: ['Crops ripen faster when the moon is up.', 'The clouds gather wherever the bells ring.', 'The crops grow faster when the bells ring.', 'The crops thrive everywhere.'],
  ashwood: ['The wolves flee the smoke of the hearths.', 'Sickness flees the open doors.', 'Sickness shuns smoke fires.'],
};

interface Result {
  text: string;
  status: string;
  title: string;
  structure: string;
  composedOnDay: number;
  activatedOnDay: number | null;
  support: string;
  physical: Record<string, number | string>;
  actions: number;
  replay: { stateHash: string; eventHash: string; identical: boolean; rejected: number };
  log: Action[];
}

function play(text: string): Result {
  const g = GameSession.create({ scenarioId: village, seed, difficulty: 'story', inventor: true });
  const starter = g.state.scn.starters[0];
  g.act({ type: 'PICK_STARTER', claim: starter });
  const interp = interpretBelief(g.state, text);
  const draft = interp.drafts.find((d) => !d.existing) ?? interp.drafts[0];
  if (!draft) throw new Error(`no reading of “${text}” in ${village}: ${interp.message}`);
  const composedOnDay = g.state.day;
  const res = g.act({ type: 'COMPOSE', claim: draft.claim });
  if (!res.ok) throw new Error(`compose refused: ${res.error.message}`);
  const id = draft.claim.id;
  const policy = lawPusher({ name: 'inventor', claim: id, regions: draft.claim.regions, stage: true, counter: false, reserve: () => 0 });
  let activatedOnDay: number | null = null;
  let supportAtWake = 'n/a';
  const physical: Record<string, number | string> = {};
  for (let d = 0; d < g.state.maxDay && !g.state.outcome; d++) {
    policy.playDay(g);
    const law = g.state.laws.find((l) => l.claimId === id && l.status === 'active');
    if (law && activatedOnDay === null) {
      activatedOnDay = law.activatedDay;
      supportAtWake = `${Math.round(law.pressure * 100)}% (needed ${Math.round(draft.claim.spec.thresholds.on * 100)}%), ${law.supporters.length} firm believers (needed ${draft.claim.spec.thresholds.minSupporters})`;
      // power every source the belief names, then read what the law does to the map tonight
      const probe = cloneState(g.state); // measure on a copy: the run itself is never touched
      for (const lm of probe.world.landmarks) {
        if ((lm.kind === 'beacon' || lm.kind === 'campfire') && lm.hp > 0) { lm.lit = true; lm.fuelNights = 3; }
        if (lm.kind === 'belltower') lm.data.ringing = 1;
        if (lm.kind === 'bridge') lm.data.watchers = 4;
      }
      const m = computeModifiers(probe);
      physical['ground raised against floodwater (tiles)'] = m.floodShield.filter((x) => x > 0).length;
      physical['bridge damage cut'] = `${Math.round(m.bridgeShield * 100)}%`;
      physical['crop growth boost (% per night)'] = Object.values(m.cropBoost).reduce((a, b) => a + b, 0);
      physical['river drawn off (steps)'] = -m.levelDelta;
      physical['rain added to fields (steps)'] = Object.values(m.rainBonus).reduce((a, b) => a + b, 0);
      physical['ground wolves will not enter (tiles)'] = m.predatorBlock.filter((x) => x > 0).length;
      physical['people shielded from smoke harm (regions)'] = Object.keys(m.sickMult).length;
      break;
    }
  }
  const s = g.state;
  const log = g.log.slice();
  const rep = replayRun({ ...optionsFromState(s), actions: log });
  const law = s.laws.find((l) => l.claimId === id);
  return {
    text, status: interp.status, title: draft.title,
    structure: draft.ast.clauses.map((c) => `${c.subject} ${c.effect} powered by ${c.trigger.replace('_', ' ')}`).join(' + ') + ` in ${draft.ast.regions.join(', ')}`,
    composedOnDay, activatedOnDay,
    support: law && activatedOnDay !== null ? supportAtWake : law ? `never woke; at the end ${Math.round(law.pressure * 100)}% (needed ${Math.round(draft.claim.spec.thresholds.on * 100)}%), ${law.supporters.length} firm believers (needed ${draft.claim.spec.thresholds.minSupporters})` : 'n/a',
    physical, actions: log.length,
    replay: { stateHash: stateHash(rep.state), eventHash: eventHash(rep.state), identical: stateHash(rep.state) === stateHash(s) && rep.rejected.length === 0, rejected: rep.rejected.length },
    log,
  };
}

const results = (SENTENCES[village] ?? SENTENCES.redbank).map(play);
for (const r of results) {
  console.log(`\n“${r.text}” -> ${r.status}: ${r.title} [${r.structure}]`);
  console.log(`  written on day ${r.composedOnDay}; law active on day ${r.activatedOnDay ?? 'never'}; ${r.activatedOnDay !== null ? 'when it woke: ' : ''}${r.support}`);
  console.log(`  physical effect once powered: ${JSON.stringify(Object.fromEntries(Object.entries(r.physical).filter(([, v]) => v !== 0 && v !== '0%')))}`);
  console.log(`  replay of ${r.actions} actions with no model: ${r.replay.identical ? 'IDENTICAL' : 'MISMATCH'} (state ${r.replay.stateHash})`);
}
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ village, seed, results }, null, 1) + '\n');
  console.log(`\nwritten ${out}`);
}
