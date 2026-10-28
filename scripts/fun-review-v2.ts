/**
 * Phase 17 evidence, headless (docs/FUN_REVIEW_V2.md): the measurements behind the adversarial review of Belief Engine V2. Every
 * number the review quotes from this script is printed by it and saved to docs/data/fun-review-v2/probes.json. No model is called;
 * "a model" below is a scripted stand-in, and nothing here measures how a person feels.
 *
 *   npx tsx scripts/fun-review-v2.ts                          this checkout
 *   npx tsx scripts/fun-review-v2.ts --root <checkout> --out <file>   another checkout (the "before" numbers: a checkout of 5132f26)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const root = resolve(arg('root', '.'));
const outFile = arg('out', 'docs/data/fun-review-v2/probes.json');
const fixtures = resolve('tests/fixtures');

/* eslint-disable @typescript-eslint/no-explicit-any */
const load = async (path: string): Promise<any> => import(`${root}/${path}`).catch(() => null);
const engine = await load('src/engine/index.ts');
const read = await load('src/engine/reality/read.ts');
const costMod = await load('src/engine/reality/cost.ts');
const fid = await load('src/engine/reality/fidelity.ts');
const lex = await load('src/engine/reality/lexicon.ts');
const ast = await load('src/engine/reality/ast.ts');
const bots = await load('src/engine/ai/bots/reality.ts');
const ideasMod = await load('src/engine/reality/ideas.ts');
const stateMod = await load('src/engine/reality/state.ts');
const { GameSession } = engine;
// the written-belief rules this checkout knows (a checkout from before phase 17 has no rules 3)
const RULES = [1, 2, 3].filter((x) => x <= stateMod.REALITY_RULES);
const { readBelief } = read;

const out: Record<string, unknown> = { root: arg('root', '.'), reader: lex.READER_ID, rules: stateMod.REALITY_RULES };
const run = (scenarioId: string, extra: Record<string, unknown> = {}) => {
  const g = GameSession.create({ scenarioId, seed: 1, difficulty: 'normal', mode: 'story', reality: true, ...extra });
  g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
  return g;
};
const first = (r: any) => (r.kind === 'ambiguous' ? r.choices[0] : r.kind === 'unsupported' ? undefined : r.candidates[0]);
const pct = (n: number, d: number) => (d ? `${n}/${d} (${Math.round((1000 * n) / d) / 10}%)` : '0/0');

// 1. the price shown is the price charged (every book sentence, chapters x rules x Reality Lab)
{
  let checked = 0;
  const mismatched: string[] = [];
  for (const [scenarioId, book] of Object.entries(bots.BOOKS as Record<string, Record<string, string>>))
    for (const realityRules of RULES)
      for (const lab of [false, true]) {
        const g = run(scenarioId, { realityRules, ...(lab ? { realityLab: true, reality: false } : {}) });
        if ((g.state.v2?.rules ?? 1) !== realityRules) continue;
        for (const [role, text] of Object.entries(book)) {
          const c = first(readBelief(g.state, text));
          if (!c?.build.ok) continue;
          const h = new GameSession(JSON.parse(JSON.stringify(g.state)));
          h.state.ap = 9;
          if (!h.act({ type: 'COMPOSE', claim: c.build.draft.claim }).ok) continue;
          checked++;
          const paid = 9 - h.state.ap;
          if (paid !== c.build.draft.cost.compose) mismatched.push(`${scenarioId} rules ${realityRules}${lab ? ' lab' : ''} ${role}: shown ${c.build.draft.cost.compose}, charged ${paid} (“${text}”)`);
        }
      }
  out.price = { checked, mismatched: mismatched.length, examples: mismatched.slice(0, 6) };
  console.log(`1. price shown = price charged: ${checked - mismatched.length} of ${checked} written beliefs (${mismatched.length} mismatched)`);
  for (const m of mismatched.slice(0, 4)) console.log(`     ${m}`);
}

// 2. a "clever but wrong" model: the sentence's thing and power kept, the change swapped for another one on the same thing
{
  const S = lex.SENSES as any[];
  let honest = 0;
  let honestKept = 0;
  let swaps = 0;
  let trusted = 0;
  let flagged = 0;
  const examples: string[] = [];
  const states = new Map<string, any>();
  for (const f of ['reality-corpus-1.json', 'reality-corpus-holdout-1.json', 'reality-corpus-holdout-2.json']) {
    const corpus = JSON.parse(readFileSync(`${fixtures}/${f}`, 'utf8'));
    for (const c of corpus.cases) {
      const s = states.get(c.scenario) ?? states.set(c.scenario, run(c.scenario).state).get(c.scenario);
      const r = readBelief(s, c.text);
      for (const cand of r.kind === 'ambiguous' ? r.choices : r.kind === 'unsupported' ? [] : r.candidates) {
        honest++;
        if (fid.fidelity(s, c.text, cand.ast, cand.map).ok) honestKept++;
        cand.ast.clauses.forEach((cl: any, i: number) => {
          for (const op of new Set(S.filter((x) => x.kinds.includes(cl.target.kind) && x.op !== cl.effect.op && !x.ask && !x.onlyNegated && !x.toward).map((x) => x.op))) {
            const se = S.find((x) => x.op === op && x.kinds.includes(cl.target.kind) && !x.ask && !x.onlyNegated && !x.toward);
            const e: Record<string, unknown> = { op, ...se.params, [se.mag]: se.mag === 'delta' ? 2 * se.dir : 2 };
            if (op === 'REDIRECT_FLOW' || op === 'MOVE_AWAY' || op === 'MOVE_TOWARD') e.radius = 2;
            const a = JSON.parse(JSON.stringify(cand.ast));
            a.clauses[i].effect = e;
            const v = ast.validateRealityAst(a, ast.LIMITS);
            if (!v.ok) continue;
            swaps++;
            const res = fid.fidelity(s, c.text, v.ast, cand.map);
            if (res.ok && res.confident) {
              trusted++;
              if (examples.length < 5) examples.push(`“${c.text}” read as ${op} instead of ${cl.effect.op} (citing “${cand.map[i]?.effect}”)`);
            } else if (res.ok) flagged++;
          }
        });
      }
    }
  }
  out.swappedEffects = { honest, honestKept, swaps, acceptedAtFullConfidence: trusted, keptAtLowConfidence: flagged, dropped: swaps - trusted - flagged, examples };
  console.log(`2. swapped-effect model readings accepted at full confidence: ${pct(trusted, swaps)}; kept only at low confidence (the player must say yes) ${flagged}; dropped ${swaps - trusted - flagged}. Honest readings kept: ${honestKept}/${honest}`);
  for (const x of examples.slice(0, 3)) console.log(`     ${x}`);
}

// 3. the ideas the composer offers: can this village make each one real?
{
  const OLD = ['Chickens fly when the bell rings.', 'Wet stone becomes light beside lanterns.', 'At night, bell ringing pulls rain toward the orchard and makes local flames burn weaker.'];
  const rows: Record<string, unknown> = {};
  for (const scenarioId of ['redbank', 'harvest', 'ashwood']) {
    const s = run(scenarioId).state;
    const ideas: string[] = ideasMod ? ideasMod.realityIdeas(s) : OLD;
    const readable = ideas.filter((t) => readBelief(s, t).kind === 'supported').length;
    rows[scenarioId] = { offered: ideas.length, understood: readable, ideas };
    console.log(`3. ideas in ${scenarioId}: ${readable} of ${ideas.length} offered are understood here${ideasMod ? '' : ' (a fixed list)'}`);
  }
  out.ideas = rows;
}

// 4. what an unsupported sentence is offered instead: a belief that helps, or one that harms the village?
{
  const HARM = new Set(['ignite', 'weaker', 'decay', 'attract_water', 'flood_verb', 'hotter', 'spread', 'faster', 'reveal', 'dimmer', 'toward', 'heavier']);
  const harmful = (e: any): boolean =>
    (lex.SENSES as any[]).some((se) => HARM.has(se.id) && se.op === e.op && Object.entries(se.params).every(([k, v]) => e[k] === v) && (se.mag !== 'delta' || Math.sign(e.delta) === se.dir));
  const SENT: [string, string][] = [
    ['redbank', 'Homes cannot be damaged.'], ['redbank', 'Nobody in the village can die.'], ['redbank', 'The village is protected from all harm.'], ['redbank', 'The river always stays low.'],
    ['redbank', 'The flood is always weak.'], ['harvest', 'The fields can never fail.'], ['harvest', 'The harvest is always perfect.'], ['ashwood', 'The pens are safe forever.'],
    ['ashwood', 'No wolf can ever hurt us.'], ['ashwood', 'The houses cannot be harmed.'],
  ];
  let offered = 0;
  let harms = 0;
  const examples: string[] = [];
  for (const [scenarioId, text] of SENT) {
    const s = run(scenarioId).state;
    const r = readBelief(s, text);
    if (r.kind !== 'unsupported') continue;
    for (const alt of r.alternatives) {
      offered++;
      const bad = alt.ast.clauses.some((c: any) => harmful(c.effect));
      if (bad) harms++;
      if (examples.length < 6) examples.push(`“${text}” → ${bad ? 'HARMFUL ' : ''}“${alt.ast.text.slice(0, 90)}”`);
    }
  }
  out.alternatives = { sentences: SENT.length, offered, harmful: harms, examples };
  console.log(`4. beliefs offered instead of an unsupported one that would harm the village: ${harms} of ${offered}`);
  for (const x of examples.slice(0, 4)) console.log(`     ${x}`);
}

// 5. words that only colour a sentence: kept and shown, or dropped without a word?
{
  const SENT: [string, string][] = [['redbank', 'Chickens fly into the night when the bell rings.'], ['ashwood', 'Sickness keeps away from homes with open doors.'], ['ashwood', 'Wolves melt like mist in the smoke.']];
  const rows = SENT.map(([scenarioId, text]) => {
    const c = first(readBelief(run(scenarioId).state, text));
    return { text, narrative: c?.ast.narrative ?? null };
  });
  out.flavour = rows;
  console.log(`5. flavour words kept and shown: ${rows.filter((x) => x.narrative).length} of ${rows.length} (${rows.map((x) => JSON.stringify(x.narrative)).join(', ')})`);
}

// 6. a ward measured from every home: what it covers, what it costs
{
  const rows = [];
  for (const realityRules of RULES.filter((x) => x >= 2)) {
    const g = run('redbank', { realityRules });
    if ((g.state.v2?.rules ?? 1) !== realityRules) continue;
    for (const text of ['Floodwater always flows away from every home.', 'The river turns away from the village.', 'The river turns away from lit lanterns.']) {
      const c = first(readBelief(g.state, text));
      if (!c?.build.ok) continue;
      const d = c.build.draft;
      rows.push({ rules: realityRules, text, power: d.power, rating: d.rating, influence: d.cost.compose, support: d.support, charged: costMod.realityComposeCost(g.state, d.claim.reality.ast) });
      console.log(`6. rules ${realityRules}: “${text}” power ${d.power} (${d.rating}), ${d.support.percent}% and ${d.support.believers} believers, ${d.cost.compose} Influence`);
    }
  }
  out.wards = rows;
}

// 6b. the ground a ward measured from every home of Eastbank covers, against the one circle rules 2 priced it as
{
  const exec = await load('src/engine/reality/execute.ts');
  const s = run('redbank').state;
  const disc = (r: number) => {
    const out: [number, number][] = [];
    const R = Math.ceil(r + 0.5);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (Math.hypot(x, y) <= r + 0.5) out.push([x, y]);
    return out;
  };
  const homes = exec.anchorsIn(s, 'home', 'east');
  const seen = new Set<number>();
  for (const h of homes) for (const [dx, dy] of disc(2)) if (h.x + dx >= 0 && h.y + dy >= 0 && h.x + dx < s.world.w && h.y + dy < s.world.h && s.world.terrain[(h.y + dy) * s.world.w + h.x + dx] !== 1) seen.add((h.y + dy) * s.world.w + h.x + dx);
  out.coverage = { homes: homes.length, tilesWithin2: seen.size, oneCircle: disc(2).length };
  console.log(`6b. around the ${homes.length} homes of Eastbank a 2-tile ward covers ${seen.size} tiles; one 2-tile circle is ${disc(2).length}`);
}

// 7. first-time players' sentences, written blind by independent agents (the dev set the reader was tuned on, and a held-out set)
{
  const score = (file: string) => {
    const data = JSON.parse(readFileSync(`${fixtures}/${file}`, 'utf8'));
    const states = new Map<string, any>();
    const t = { doable: 0, understood: 0, impossible: 0, wronglyAccepted: 0, byChapter: {} as Record<string, [number, number]> };
    for (const c of data.cases) {
      const s = states.get(c.scenario) ?? states.set(c.scenario, run(c.scenario).state).get(c.scenario);
      const r = readBelief(s, c.text);
      if (c.intent === 'none') {
        t.impossible++;
        if (r.kind !== 'unsupported') t.wronglyAccepted++;
        continue;
      }
      const cands = (r.kind === 'ambiguous' ? r.choices : r.kind === 'unsupported' ? [] : r.candidates).filter((x: any) => x.build.ok);
      const hit = cands.some((x: any) => c.ops.length > 0 && c.ops.every((op: string) => x.ast.clauses.some((k: any) => k.effect.op === op && (c.kinds.includes(k.target.kind) || (k.target.kind === 'villager' && c.kinds.includes('home'))))));
      t.doable++;
      if (hit) t.understood++;
      const ch = (t.byChapter[c.scenario] ??= [0, 0]);
      ch[1]++;
      if (hit) ch[0]++;
    }
    return t;
  };
  const dev = score('novice-dev-4.json');
  const held = score('novice-holdout-3.json');
  out.novice = { dev, heldOut: held };
  console.log(`7. first-time sentences understood (dev set, tuned on): ${pct(dev.understood, dev.doable)}; impossible ones accepted ${dev.wronglyAccepted}/${dev.impossible}`);
  console.log(`   held-out set (never tuned on): ${pct(held.understood, held.doable)} (${Object.entries(held.byChapter).map(([k, v]) => `${k} ${v[0]}/${v[1]}`).join(', ')}); impossible ones accepted ${held.wronglyAccepted}/${held.impossible}`);
}

// 8. do personalities change what villagers do (Living Village, the game's own policy deciding; 8 seeds a chapter)?
{
  const generic = await load('src/engine/ai/bots/generic.ts');
  const tally: Record<string, Record<string, number>> = { skeptic: {}, trusting: {}, middle: {} };
  const people: Record<string, number> = { skeptic: 0, trusting: 0, middle: 0 };
  let doubtSpreads = 0;
  let spreads = 0;
  for (const scenarioId of ['redbank', 'harvest', 'ashwood'])
    for (let seed = 1; seed <= 8; seed++) {
      const g = GameSession.create({ scenarioId, seed, difficulty: 'normal', mode: 'story', living: true });
      const agents = () => g.state.v2.minds.agents;
      const band = (id: string) => {
        const sk = agents()[id]?.personality.skepticism ?? 50;
        return sk >= 60 ? 'skeptic' : sk <= 35 ? 'trusting' : 'middle';
      };
      for (const id of Object.keys(agents())) people[band(id)]++;
      const pol = generic.policyById('evidence-first');
      for (let d = 0; d < 40 && !g.state.outcome; d++) pol.playDay(g);
      for (const e of g.state.log) {
        if (e.code !== 'NPC_ACT' || !e.actor) continue;
        tally[band(e.actor)][e.reason] = (tally[band(e.actor)][e.reason] ?? 0) + 1;
        if (e.reason === 'spread') {
          spreads++;
          const next = g.state.log.find((x: any) => x.cause?.includes(e.id) && x.delta?.conviction);
          if (next && next.delta.conviction[1] < next.delta.conviction[0]) doubtSpreads++;
        }
      }
    }
  const rows = Object.fromEntries(Object.entries(tally).map(([b, t]) => [b, { villagerRuns: people[b], acts: Object.values(t).reduce((a, x) => a + x, 0), byIntent: t }]));
  out.personas = { runs: 24, rows, spreads, spreadsThatCooledTheListener: doubtSpreads };
  for (const [b, r] of Object.entries(rows)) console.log(`8. ${b}: ${r.acts} acts by ${r.villagerRuns} villager-runs (${Object.entries(r.byIntent).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  console.log(`8. villagers' spreads that cooled the listener (a doubter "telling" a story): ${doubtSpreads} of ${spreads}`);
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(out, null, 1)}\n`);
console.log(`\nsaved ${outFile}`);
