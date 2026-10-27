/**
 * Phase 18: re-evaluate the game as a game, not only as software. Three parts, all offline and deterministic:
 *
 *   1  ten varied seeded runs (two winning routes in Redbank, three authored chapters, a loss, generated expeditions) and how their
 *      traces differ
 *   2  two written beliefs against no belief at all, on the same seed: do they produce visibly different outcomes?
 *   3  an exploit hunt over written beliefs: for every belief the vocabulary offers, at its strongest, in every chapter that can
 *      host it, (a) what it would do if it were somehow believed and powered from day 2 (the ceiling), and (b) how soon a bot can
 *      actually make the village believe it (the price). A belief that wins outright when powered, and is believed cheaply, would
 *      be an exploit.
 *
 *   npx tsx scripts/acceptance-fun.ts [--seeds 8] [--out docs/data/acceptance]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { GameSession, OFFERED, buildDebrief, catalogEntries, expeditionId, generateExpedition, listScenarios } from '../src/engine/index.ts';
import type { CreateRunOptions, RunState } from '../src/engine/index.ts';
import * as S from '../src/engine/ai/bots/strategies.ts';
import { lawPusher, lightBeaconsByCoverage } from '../src/engine/ai/bots/lawpusher.ts';
import { noop } from '../src/engine/ai/bots/basic.ts';
import type { Policy } from '../src/engine/ai/bots/types.ts';
import { buildClaim } from '../src/engine/nl/build.ts';
import { witnessPolicies } from '../src/engine/gen/witness.ts';
import { planComposed } from '../tests/e2e/journeys.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const SEEDS = Number(arg('seeds', '8'));
/** a comma list of chapter/belief cells to run (the follow-up for anything the sweep flagged); empty runs every cell */
const ONLY = arg('only', '').split(',').filter(Boolean);
const FILE = arg('file', 'fun-evaluation.json');
const SKIP12 = args.includes('--skip-parts-1-2');
const outDir = arg('out', 'docs/data/acceptance');
mkdirSync(outDir, { recursive: true });
const traces = (n: string) => JSON.parse(readFileSync(new URL(`../tests/fixtures/${n}-traces.json`, import.meta.url), 'utf8')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function play(opts: CreateRunOptions, p: Policy): RunState {
  const g = GameSession.create(opts);
  for (let i = 0; i < 40 && !g.state.outcome; i++) p.playDay(g);
  return g.state;
}
const line = (s: RunState) => ({
  result: s.outcome?.result ?? 'none', score: s.outcome?.score ?? 0, medal: s.outcome?.medal ?? null, firstLawDay: s.stats.firstLawDay, firstBeliefDay: s.stats.firstBeliefDay,
  homesSpared: s.stats.homesSpared, livesSaved: s.stats.livesSaved, apSpent: s.stats.apSpent, alive: s.villagers.filter((v) => v.status !== 'dead').length, of: s.villagers.length,
});

// ------------------------------------------------------------------------------------------------------------------ part 1
if (!SKIP12) console.log('Part 1: ten varied seeded runs');
const rb = traces('redbank').canonicalSeed as number;
const runs: { id: string; what: string; opts: CreateRunOptions; policy: Policy }[] = [
  { id: '1', what: 'Redbank, seed 1: Fire Wall (belief in Eastbank, beacons lit)', opts: { scenarioId: 'redbank', seed: rb }, policy: S.fireWall },
  { id: '2', what: 'Redbank, seed 1: Witness Bridge (belief on both banks, watchers on the deck)', opts: { scenarioId: 'redbank', seed: rb }, policy: S.witnessBridge },
  { id: '3', what: 'Redbank, seed 1: no action (control)', opts: { scenarioId: 'redbank', seed: rb }, policy: noop },
  { id: '4', what: 'Harvest, seed 1: Moonlight', opts: { scenarioId: 'harvest', seed: traces('harvest').canonicalSeed }, policy: S.moonlight },
  { id: '5', what: 'Harvest, seed 1: Caravans (a trader who wants proof)', opts: { scenarioId: 'harvest', seed: traces('harvest').canonicalSeed }, policy: S.caravans },
  { id: '6', what: 'Ashwood: Smoke Ring', opts: { scenarioId: 'ashwood', seed: traces('ashwood').canonicalSeed }, policy: S.smokeRing },
  { id: '7', what: 'Ashwood: Decoy Fire', opts: { scenarioId: 'ashwood', seed: traces('ashwood').canonicalSeed }, policy: S.decoy },
];
for (const biome of ['river', 'drought', 'wolves']) {
  const e = catalogEntries().find((x) => x.biome === biome)!;
  const x = generateExpedition(e.seed);
  const pol = witnessPolicies(x.bp, x.def).find((q) => q.name === e.wins[0])!;
  runs.push({ id: String(runs.length + 1), what: `Generated expedition (${biome}, seed ${e.seed}, ${x.def.runtime.name}): ${e.wins[0]}`, opts: { scenarioId: expeditionId(e.seed), seed: e.seed, mode: 'expedition' }, policy: pol });
}
const part1 = (SKIP12 ? [] : runs).map((r) => {
  const s = play(r.opts, r.policy);
  const d = buildDebrief(s);
  return { id: r.id, what: r.what, ...line(s), medal: d.medal, laws: [...new Set(s.laws.filter((l) => l.activatedDay !== null).map((l) => l.claimId))], threat: s.scn.threatKind, twists: s.modifiers.filter((m) => !m.startsWith('pledge:')) };
});
// how each generated village differs from its campaign relative: size, length, modifiers, which scripted routes win it and how well
const divergence = SKIP12 ? [] : ['river', 'drought', 'wolves'].map((biome) => {
  const e = catalogEntries().find((q) => q.biome === biome)!;
  const x = generateExpedition(e.seed);
  const opts: CreateRunOptions = { scenarioId: expeditionId(e.seed), seed: e.seed, mode: 'expedition' };
  const analog = biome === 'river' ? 'redbank' : biome === 'drought' ? 'harvest' : 'ashwood';
  const base = GameSession.create({ scenarioId: analog, seed: traces(analog).canonicalSeed as number }).state;
  const start = GameSession.create(opts).state;
  const routes = witnessPolicies(x.bp, x.def).map((q) => ({ route: q.name, ...line(play(opts, q)) }));
  const kinds = (st: RunState) => Object.fromEntries([...new Set(st.world.landmarks.map((l) => l.kind))].sort().map((k) => [k, st.world.landmarks.filter((l) => l.kind === k).length]));
  return {
    biome, seed: e.seed, name: x.def.runtime.name, analog,
    villagers: [start.villagers.length, base.villagers.length], days: [start.maxDay, base.maxDay], modifiers: start.modifiers, landmarks: [kinds(start), kinds(base)],
    stories: [start.scn.claimDefs.filter((c) => !c.rival).map((c) => c.id), base.scn.claimDefs.filter((c) => !c.rival).map((c) => c.id)],
    routes: routes.map((r) => ({ route: r.route, result: r.result, score: r.score, firstLawDay: r.firstLawDay })),
    verifiedWinningRoutes: e.wins,
  };
});
for (const d of divergence) console.log(`  ${d.biome}: ${d.name} vs ${d.analog}: villagers ${d.villagers[0]} vs ${d.villagers[1]}, days ${d.days[0]} vs ${d.days[1]}, modifiers ${d.modifiers.join('+') || '-'}; routes ${d.routes.map((r) => `${r.route}=${r.result}`).join(', ')}`);
for (const r of part1) console.log(`  ${r.id.padStart(2)}  ${r.result.padEnd(8)} score ${String(r.score).padStart(4)}  law day ${r.firstLawDay ?? '-'}  ${r.what}`);
const wins = part1.filter((r) => r.result === 'victory').length;

// ------------------------------------------------------------------------------------------------------------------ part 2
if (!SKIP12) console.log('\nPart 2: two written beliefs against none, same seed');
const lantern = SKIP12 ? null! : planComposed('The river turns away from lantern flames.', 'lanterns');
const bridge = SKIP12 ? null! : planComposed('The watched bridge cannot break.', 'bridge');
const part2 = SKIP12
  ? null
  : {
      none: line(play({ scenarioId: 'redbank', seed: rb }, noop)),
      lantern: { text: lantern.text, title: lantern.title, wokeOnDay: lantern.wokeOnDay, nightAfterWaking: lantern.counterfactual },
      bridge: { text: bridge.text, title: bridge.title, wokeOnDay: bridge.wokeOnDay, nightAfterWaking: bridge.counterfactual },
    };
if (!SKIP12) {
  console.log(`  lantern law woke on day ${lantern.wokeOnDay}: flooded tiles ${lantern.counterfactual.floodedWithout} -> ${lantern.counterfactual.floodedWith}; bridge hp ${lantern.counterfactual.bridgeHpWithout} -> ${lantern.counterfactual.bridgeHpWith}`);
  console.log(`  bridge law woke on day ${bridge.wokeOnDay}: flooded tiles ${bridge.counterfactual.floodedWithout} -> ${bridge.counterfactual.floodedWith}; bridge hp ${bridge.counterfactual.bridgeHpWithout} -> ${bridge.counterfactual.bridgeHpWith}`);
}

// ------------------------------------------------------------------------------------------------------------------ part 3
console.log(`\nPart 3: exploit hunt over written beliefs (${SEEDS} seeds per cell)`);
const TRIGGER_RITUAL: Record<string, string> = { lit_beacon: 'light', smoke_fire: 'smoke', bell: 'ring', watchers: 'vigil', night: 'night_labor' };

/** Give a belief every physical source it names, each day from day 3, with the Influence a player would have to spend. */
function powerIt(g: GameSession, trigger: string): void {
  const s = g.state;
  if (trigger === 'always' || s.day < 3) return;
  if (trigger === 'lit_beacon') return void lightBeaconsByCoverage(g, s.world.regions.find((r) => r.id === 'east') ? 'east' : s.world.regions[0].id);
  const ritual = s.scn.rituals.find((r) => r.physical === TRIGGER_RITUAL[trigger]);
  if (!ritual || s.ap < 1) return;
  const lm = s.world.landmarks.find((l) => l.kind === ritual.landmark && l.hp > 0 && !(l.lit && l.fuelNights >= 2));
  if (lm) g.act({ type: 'RITUAL', ritual: ritual.id, landmark: lm.id });
}

/** The ceiling: the belief is awake and believed by everyone from day 2, and its sources are present every night. Nobody else plays. */
function ceiling(opts: CreateRunOptions, def: ReturnType<typeof buildClaim> & { ok: true }): string {
  const g = GameSession.create(opts);
  g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
  const claim = def.draft.claim;
  g.state.ap = 5;
  if (!g.act({ type: 'COMPOSE', claim }).ok) return 'refused';
  const trigger = claim.spec.trigger.kind;
  for (let i = 0; i < 40 && !g.state.outcome; i++) {
    const s = g.state;
    for (const v of s.villagers) v.beliefs[claim.id] = { conv: 90, heard: 5, lastDay: s.day, lastSource: 'keeper', evidence: 20, cause: null, stale: 0 };
    for (const l of s.laws.filter((x) => x.claimId === claim.id)) { l.status = 'active'; l.progress = 100; l.pressure = 1; l.strength = 1; }
    for (const lm of s.world.landmarks) {
      if (trigger === 'lit_beacon' && lm.kind === 'beacon' && lm.hp > 0) { lm.lit = true; lm.fuelNights = Math.max(lm.fuelNights, 3); }
      if (trigger === 'smoke_fire' && lm.kind === 'campfire' && lm.hp > 0) { lm.lit = true; lm.fuelNights = Math.max(lm.fuelNights, 3); }
      if (trigger === 'bell' && lm.kind === 'belltower') lm.data.ringing = 1;
      if (trigger === 'watchers' && lm.kind === 'bridge' && lm.hp > 0) lm.data.watchers = 4;
      if (trigger === 'night' && lm.kind === 'field') lm.data.moonlit = 1;
    }
    g.endDay();
  }
  return g.state.outcome?.result ?? 'none';
}

interface Cell { chapter: string; belief: string; power: number; apToWrite: number; ceilingWins: number; botWins: number; botWokeBy: (number | null)[]; baselineWins: number; note: string }
const cells: Cell[] = [];
const chapters = listScenarios().map((l) => ({ id: l.id, seed0: l.id === 'redbank' ? 1 : l.id === 'harvest' ? 1 : 6 }));
const authoredBest: Record<string, Policy> = { redbank: S.fireWall, harvest: S.moonlight, ashwood: S.smokeRing };
const baseline: Record<string, number> = {};
for (const ch of chapters) {
  let w = 0;
  for (let k = 0; k < SEEDS; k++) if (play({ scenarioId: ch.id, seed: ch.seed0 + k }, authoredBest[ch.id]).outcome?.result === 'victory') w++;
  baseline[ch.id] = w;
  console.log(`  baseline ${ch.id}: the built-in best route wins ${w}/${SEEDS}`);
}
const regionsFor = (probe: GameSession, subject: string): string[] => {
  const r = probe.state.world.regions.map((x) => x.id);
  if (subject === 'river' || subject === 'bridge' || subject === 'rain') return r.includes('river') ? ['river'] : [r[0]];
  if (subject === 'grain') return r.includes('valley') ? ['valley'] : [r[0]];
  if (subject === 'wolf' || subject === 'illness') return r.filter((x) => ['north', 'mill', 'ash'].includes(x)).length ? r.filter((x) => ['north', 'mill', 'ash'].includes(x)) : [r[0]];
  return r.includes('east') ? ['east'] : [r[0]];
};
type Clause = { subject: string; effect: string; trigger: string; radius: number; intensity: number; watchers?: number };
const clauseOf = (subject: string, effect: string, trigger: string): Clause => ({ subject, effect, trigger, radius: subject === 'river' || subject === 'wolf' ? 4 : 0, intensity: 3, ...(subject === 'bridge' && trigger === 'watchers' ? { watchers: 1 } : {}) });
/** two clauses in one belief, the strongest pairings the chapter can host: a compound belief is the most Influence-efficient way to ask for a lot */
const COMPOUNDS: Record<string, [string, string][]> = {
  redbank: [['river.repel.lit_beacon', 'bridge.strengthen.watchers'], ['river.slow.lit_beacon', 'rain.repel.bell'], ['bridge.strengthen.watchers', 'rain.repel.bell']],
  harvest: [['grain.grow.night', 'rain.attract.bell'], ['grain.grow.bell', 'rain.attract.bell'], ['grain.grow.always', 'rain.attract.bell']],
  ashwood: [['wolf.repel.smoke_fire', 'illness.repel.smoke_fire'], ['wolf.repel.smoke_fire', 'illness.repel.always'], ['wolf.repel.lit_beacon', 'illness.repel.smoke_fire']],
};

function measure(ch: { id: string; seed0: number }, probe: GameSession, clauses: Clause[], label: string): void {
  const regions = [...new Set(clauses.flatMap((c) => regionsFor(probe, c.subject)))];
  const built = buildClaim(probe.state, { version: 1, clauses, regions } as never, `${label} at full strength`, { stress: false });
  if (!built.ok) return;
  let ceilingWins = 0;
  let botWins = 0;
  const woke: (number | null)[] = [];
  const triggers = [...new Set(clauses.map((c) => c.trigger))];
  for (let k = 0; k < SEEDS; k++) {
    const opts: CreateRunOptions = { scenarioId: ch.id, seed: ch.seed0 + k, inventor: true };
    if (ceiling(opts, built) === 'victory') ceilingWins++;
    // the price
    const g = GameSession.create(opts);
    g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
    const b2 = buildClaim(g.state, { version: 1, clauses, regions } as never, `${label} at full strength`, { stress: false });
    if (!b2.ok || !g.act({ type: 'COMPOSE', claim: b2.draft.claim }).ok) { woke.push(null); continue; }
    const id = b2.draft.claim.id;
    const pol = lawPusher({ name: 'exploit-hunt', claim: id, regions: b2.draft.claim.regions, stage: true, counter: true, reserve: () => 0, physical: (gg) => triggers.forEach((t) => powerIt(gg, t)) });
    let wokeOn: number | null = null;
    for (let i = 0; i < 12 && !g.state.outcome; i++) {
      pol.playDay(g);
      if (wokeOn === null && g.state.laws.some((l) => l.claimId === id && l.status === 'active')) wokeOn = g.state.day;
    }
    woke.push(wokeOn);
    if (g.state.outcome?.result === 'victory') botWins++;
  }
  cells.push({
    chapter: ch.id, belief: label, power: built.draft.power, apToWrite: built.draft.cost.compose, ceilingWins, botWins, botWokeBy: woke,
    baselineWins: baseline[ch.id], note: ceilingWins >= SEEDS * 0.8 && botWins >= baseline[ch.id] ? 'win button that a bot can also make believed' : ceilingWins >= SEEDS * 0.8 ? 'wins if believed; the cost of believing it is what stops it' : '',
  });
}

for (const ch of chapters) {
  const probe = GameSession.create({ scenarioId: ch.id, seed: ch.seed0, inventor: true });
  probe.act({ type: 'PICK_STARTER', claim: probe.state.scn.starters[0] });
  for (const [subject, o] of Object.entries(OFFERED))
    for (const effect of o.effects)
      for (const trigger of o.triggers) {
        if (ONLY.length && !ONLY.includes(`${ch.id}/${subject}.${effect}.${trigger}`)) continue;
        measure(ch, probe, [clauseOf(subject, effect, trigger)], `${subject}.${effect}.${trigger}`);
      }
  for (const [a, b] of COMPOUNDS[ch.id] ?? []) {
    const label = `${a} + ${b}`;
    if (ONLY.length && !ONLY.includes(`${ch.id}/${label}`)) continue;
    const mk = (x: string) => { const [subject, effect, trigger] = x.split('.'); return clauseOf(subject, effect, trigger); };
    measure(ch, probe, [mk(a), mk(b)], label);
  }
}
cells.sort((a, b) => a.chapter.localeCompare(b.chapter) || b.botWins - a.botWins || b.ceilingWins - a.ceilingWins);
for (const c of cells) console.log(`  ${c.chapter.padEnd(8)} ${c.belief.padEnd(40)} power ${String(c.power).padStart(4)}  ceiling ${c.ceilingWins}/${SEEDS}  bot ${c.botWins}/${SEEDS}  woke by day ${c.botWokeBy.map((d) => d ?? '-').join(',')}  ${c.note}`);
const exploits = cells.filter((c) => c.botWins > c.baselineWins);
const buttons = cells.filter((c) => c.ceilingWins >= SEEDS * 0.8);
console.log(`\n  ${cells.length} cells; ${buttons.length} would win outright if believed and powered; ${exploits.length} win more often in practice than the built-in best route (${exploits.map((c) => `${c.chapter}/${c.belief}`).join(', ') || 'none'})`);

writeFileSync(`${outDir}/${FILE}`, JSON.stringify({ about: 'Written by scripts/acceptance-fun.ts (phase 18).', date: new Date().toISOString().slice(0, 10), seeds: SEEDS, part1: { wins, runs: part1, divergence }, part2, part3: { baselineWins: baseline, cells, exploits: exploits.map((c) => `${c.chapter}/${c.belief}`) } }, null, 1) + '\n');
console.log(`\nwritten ${outDir}/${FILE}`);
