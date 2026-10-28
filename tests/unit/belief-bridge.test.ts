import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession, buildRealityClaim, predictedWater, stateHash, eventHash } from '../../src/engine/index.ts';
import { canonicalize } from '../../src/engine/core/hash.ts';
import { cloneState } from '../../src/engine/core/clone.ts';
import { replayRun } from '../../src/engine/core/replay.ts';
import type { Action, ClaimDef, CreateRunOptions, RunState } from '../../src/engine/core/types.ts';
import { computeModifiers } from '../../src/engine/laws/effects.ts';
import { computeWater } from '../../src/engine/world/flood.ts';
import { chainOf } from '../../src/engine/mind/journal.ts';
import { runRealityLaws } from '../../src/engine/reality/execute.ts';
import { provenanceOf } from '../../src/engine/reality/provenance.ts';
import { describeDraft } from '../../src/engine/reality/preview.ts';
import { readBelief } from '../../src/engine/reality/read.ts';
import type { RealityAst } from '../../src/engine/reality/ast.ts';
import { lightEast, playReality, ring } from '../helpers/reality.ts';

/**
 * Phase 09: imagine → persuade → manifest → consequences. The chains in tests/fixtures/v2-bridge-traces.json were recorded by
 * scripts/record-bridge.ts: a sentence read by the offline reader in the live village, written with an ordinary COMPOSE, spread by
 * the preview-driven bot through tellings, gatherings and messengers (no belief is ever set), and set off by the bell or a lantern.
 * Here they are replayed from their actions alone and checked link by link. Where a rule is checked in isolation (an entity rule, a
 * conflict, a harm) the social part is shortcut with playReality and the test says so.
 */

interface Trace { opts: CreateRunOptions; sentence: string; region: string | null; claimId: string; result: string | null; lawDay: number | null; alive: number; hens: number; bank: number; stateHash: string; eventHash: string; actions: Action[] }
const fx = JSON.parse(readFileSync(new URL('../fixtures/v2-bridge-traces.json', import.meta.url), 'utf8')) as Record<string, Trace>;
const CHAINS = ['hens', 'hensBelow', 'stones', 'rain', 'win'] as const;

const replays = new Map<string, RunState>();
function play(key: (typeof CHAINS)[number]): RunState {
  if (!replays.has(key)) {
    const t = fx[key];
    const r = replayRun({ ...t.opts, actions: t.actions });
    expect(r.rejected, `${key}: every recorded action is still legal`).toEqual([]);
    replays.set(key, r.state);
  }
  return replays.get(key)!;
}
const events = (s: RunState, code: string, claim?: string) => s.log.filter((e) => e.code === code && (claim === undefined || e.claim === claim));

describe('each chain starts from the words and replays exactly', () => {
  it.each(CHAINS)('%s: the offline reader, in the live village, builds exactly the claim the trace wrote', (key) => {
    const t = fx[key];
    const g = GameSession.create(t.opts);
    expect(g.act(t.actions[0]).ok).toBe(true);
    const r = readBelief(g.state, t.sentence, t.region ? { region: t.region } : {});
    expect(r.kind === 'supported' || r.kind === 'partial').toBe(true);
    const cand = r.kind === 'supported' || r.kind === 'partial' ? r.candidates[0] : null;
    expect(cand?.build.ok).toBe(true);
    const compose = t.actions.find((a) => a.type === 'COMPOSE') as Extract<Action, { type: 'COMPOSE' }>;
    if (!cand?.build.ok) return;
    expect(cand.build.draft.claim.id).toBe(t.claimId);
    expect(canonicalize(compose.claim)).toBe(canonicalize(cand.build.draft.claim));
  });

  it.each(CHAINS)('%s: the stored actions alone give the recorded state and event hashes (no model, no network)', (key) => {
    const s = play(key);
    expect(stateHash(s)).toBe(fx[key].stateHash);
    expect(eventHash(s)).toBe(fx[key].eventHash);
    expect(s.outcome?.result ?? null).toBe(fx[key].result);
  });
});

describe('claim A, "Chickens fly when the bell rings": belief, threshold, catalyst, consequence', () => {
  it('below the threshold nothing happens, however often the bell rings', () => {
    const s = play('hensBelow');
    const id = fx.hensBelow.claimId;
    expect(s.history.flatMap((h) => h.actions).filter((a) => a.type === 'RITUAL').length).toBeGreaterThanOrEqual(6);
    expect(events(s, 'LAW_ACTIVATED', id)).toHaveLength(0);
    expect(events(s, 'REALITY_EFFECT', id)).toHaveLength(0);
    expect(events(s, 'CHICKENS_ROSE')).toHaveLength(0);
    expect(s.v2!.chickens.filter((c) => c.alive)).toHaveLength(0);
    expect(s.v2!.chickens.every((c) => c.fate === 'drowned')).toBe(true);
  });

  it('above the threshold, with the bell, the canonical state changes: the hens rise and ride out the flood the control flock drowns in', () => {
    const s = play('hens');
    const id = fx.hens.claimId;
    const law = s.laws.find((l) => l.claimId === id)!;
    expect(law.activatedDay).toBe(6);
    const woke = events(s, 'LAW_ACTIVATED', id)[0];
    const th = s.claims.find((c) => c.id === id)!.def!.spec.thresholds;
    expect(woke.text).toMatch(/(\d+) believers, (\d+)% support/);
    const [, n, pct] = /(\d+) believers, (\d+)% support/.exec(woke.text)!;
    expect(Number(n)).toBeGreaterThanOrEqual(th.minSupporters);
    expect(Number(pct) / 100).toBeGreaterThanOrEqual(th.on);
    const fxEvents = events(s, 'REALITY_EFFECT', id);
    expect(fxEvents.map((e) => e.day)).toEqual([6, 7]);
    expect(events(s, 'CHICKENS_ROSE').every((e) => /rode out water that would have drowned them/.test(e.text) && e.claim === id)).toBe(true);
    // the change is in the world, not in a picture of it: the flock is alive in the run state, the control flock is not
    expect(s.v2!.chickens.filter((c) => c.alive)).toHaveLength(fx.hens.hens);
    expect(fx.hens.hens).toBeGreaterThan(20);
    expect(play('hensBelow').v2!.chickens.filter((c) => c.alive)).toHaveLength(0);
    // the same nights, the same flood: the difference is the law
    expect(s.threat.slice(5, 7)).toEqual(play('hensBelow').threat.slice(5, 7));
  });

  it('the law woke because people believed it: its cause chain runs back through neighbours to the Keeper’s own words', () => {
    const s = play('hens');
    const id = fx.hens.claimId;
    const woke = events(s, 'LAW_ACTIVATED', id)[0];
    const chain = chainOf(s, woke.id, 40);
    const codes = new Set(chain.map((j) => s.log.find((e) => e.id === j.event)!.code));
    expect(codes.has('BELIEVER_GAINED') || codes.has('BELIEF_SHIFT')).toBe(true);
    expect(['RUMOR_SEEDED', 'GATHERING', 'MESSENGER_SENT'].some((c) => codes.has(c))).toBe(true);
  });

  it('a lifted hen crosses the river: with the bridge down, a stray flies home over the water on a still night, and only then (entity rule; support shortcut)', () => {
    const stranded = (bell: boolean): RunState => {
      const g = GameSession.create({ scenarioId: 'redbank', seed: 1, reality: true });
      g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
      // held along the river (the whole village), so a hen on the far bank is still within the belief's reach
      const b = buildRealityClaim(g.state, chickensWith('river', 2));
      if (!b.ok) throw new Error(b.message);
      expect(g.act({ type: 'COMPOSE', claim: b.draft.claim }).ok).toBe(true);
      const hen = g.state.v2!.chickens[0];
      Object.assign(hen, { x: 10, y: 6, stray: true });
      g.state.world.landmarks.find((l) => l.kind === 'bridge')!.hp = 0;
      for (let d = 0; d < 3; d++) {
        for (const v of g.state.villagers) v.beliefs[b.draft.claim.id] = { conv: 85, heard: 3, lastDay: g.state.day, lastSource: null, evidence: 30, cause: null, stale: 0 };
        for (const t of g.state.threat) t.wind = 1;
        if (bell) ring(g);
        g.endDay();
      }
      return g.state;
    };
    const flew = stranded(true);
    const walked = stranded(false);
    expect(flew.log.some((e) => e.code === 'STRAYS_FLEW_HOME')).toBe(true);
    expect(flew.v2!.chickens[0].stray).toBe(false);
    // without the law acting (no bell), the river stays in the way: no bridge, no way home
    expect(walked.log.some((e) => e.code === 'STRAYS_FLEW_HOME')).toBe(false);
    expect(walked.v2!.chickens[0].stray).toBe(true);
  });
});

function chickensWith(region: string, magnitude: number): RealityAst {
  return {
    v: 2, lang: 'reality-1', text: 'Chickens fly when the bell rings.', author: 'player', source: { reader: 'offline-v2', model: null, prompt: null, id: null }, day: 1, regions: [region],
    clauses: [{ id: 'c1', when: { event: 'bell', min: null }, where: null, target: { kind: 'chicken', near: null, tags: [], region: null }, effect: { op: 'APPLY_FORCE', direction: 'up', magnitude }, duration: 'night' }],
    omitted: [], narrative: null,
  };
}

describe('claim B, "Wet stone becomes light beside lanterns": weight, carrying, placement, and an end', () => {
  it('through real persuasion: wet stones by the lit lantern weigh almost nothing, one is carried to the bank, and the bank stays higher', () => {
    const s = play('stones');
    const id = fx.stones.claimId;
    expect(s.laws.find((l) => l.claimId === id)!.activatedDay).toBe(6);
    expect(events(s, 'REALITY_EFFECT', id).some((e) => /loose stones become lighter/.test(e.text))).toBe(true);
    const haul = events(s, 'BANK_RAISED', id);
    expect(haul.length).toBeGreaterThan(0);
    expect(s.v2!.stones.some((x) => x.state === 'placed')).toBe(true);
    expect(Object.keys(s.v2!.bank).length).toBe(fx.stones.bank);
    // the raised bank is part of every later night's flood shield
    const sim = cloneState(s);
    const mods = computeModifiers(sim);
    runRealityLaws({ s: sim, events: [], expect: true }, mods);
    for (const [k, h] of Object.entries(s.v2!.bank)) expect(mods.floodShield[Number(k)]).toBeGreaterThanOrEqual(h);
  });

  it('with the lantern out, or the belief let go, it ends as defined (executor and law rules; support shortcut)', () => {
    const ast = readStones();
    const lit = playReality(ast, lightEast, 7, 'redbank', 3);
    const dark = playReality(ast, () => {}, 7, 'redbank', 3);
    const lightened = (s: RunState, id: string | null) => s.log.filter((e) => e.code === 'REALITY_EFFECT' && e.claim === id).length;
    expect(lightened(lit.g.state, lit.claimId)).toBeGreaterThan(0);
    expect(lightened(dark.g.state, dark.claimId)).toBe(0);
    expect(dark.g.state.v2!.stones.every((x) => x.state !== 'placed')).toBe(true);
    // support withdrawn: the law collapses and the lit lantern alone does nothing
    const g = GameSession.create({ scenarioId: 'redbank', seed: 3, reality: true });
    g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
    const b = buildRealityClaim(g.state, ast);
    if (!b.ok) throw new Error('build');
    g.act({ type: 'COMPOSE', claim: b.draft.claim });
    for (let d = 0; d < 7 && !g.state.outcome; d++) {
      const believe = d < 2;
      for (const v of g.state.villagers) if (v.district === 'east') v.beliefs[b.draft.claim.id] = { conv: believe ? 85 : -20, heard: 3, lastDay: g.state.day, lastSource: null, evidence: 0, cause: null, stale: 0 };
      lightEast(g);
      g.endDay();
    }
    // it wavers first (V1's hysteresis: a law fades over days, at falling strength), then collapses; from then on nothing acts
    const collapsed = g.state.log.find((e) => e.code === 'LAW_COLLAPSED' && e.claim === b.draft.claim.id);
    expect(collapsed).toBeDefined();
    expect(g.state.log.some((e) => e.code === 'LAW_WAVERING' && e.claim === b.draft.claim.id)).toBe(true);
    const afterCollapse = g.state.log.filter((e) => e.code === 'REALITY_EFFECT' && e.claim === b.draft.claim.id && e.id > collapsed!.id);
    expect(afterCollapse).toHaveLength(0);
  });
});

function readStones(): RealityAst {
  const g = GameSession.create({ scenarioId: 'redbank', seed: 3, reality: true });
  g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
  const r = readBelief(g.state, 'Wet stone becomes light beside lanterns.');
  if (r.kind !== 'supported') throw new Error(r.kind);
  return r.candidates[0].ast;
}

describe('claim C, "At night, bell ringing pulls rain toward the orchard and makes local flames burn weaker"', () => {
  it('through real persuasion (a nine-day village, held in Eastbank): the rain is moved onto Eastbank, the flames weaken, the hearths cool', () => {
    const s = play('rain');
    const id = fx.rain.claimId;
    expect(s.laws.find((l) => l.claimId === id)!.activatedDay).toBe(9);
    const acts = events(s, 'REALITY_EFFECT', id);
    expect(acts.some((e) => /rain is called in toward Eastbank/.test(e.text))).toBe(true);
    expect(acts.some((e) => /flames burn weaker/.test(e.text) && /hearths warm less/.test(e.text))).toBe(true);
    const pooled = events(s, 'WATER_POOLED', id);
    expect(pooled).toHaveLength(1);
    expect(pooled[0].law).toBe(s.laws.find((l) => l.claimId === id)!.id);
    // the river stood one step lower that night than the forecast, because the rain fell on Eastbank instead
    expect(s.world.level).toBe(s.threat[8].level - 1);
  });

  it('the same night, measured in the modifiers V1’s hazards read: fire damage is cut and the cold reaches the weak in Eastbank', () => {
    const sim = cloneState(play('rain'));
    sim.world.landmarks.find((l) => l.kind === 'belltower')!.data.ringing = 1;
    const mods = computeModifiers(sim);
    runRealityLaws({ s: sim, events: [], expect: true }, mods);
    expect(mods.fireDamageCut.east ?? 0).toBeGreaterThan(0.3);
    expect(mods.coldDrain.east ?? 0).toBeGreaterThan(0);
    expect(mods.levelDelta).toBeLessThan(0);
    // and nothing of it reaches Westbank, where nobody holds the belief
    expect(mods.fireDamageCut.west ?? 0).toBe(0);
  });

  it('a skeptic pushes back: they demand to see it, nobody shows them, and the story pays for it', () => {
    const s = play('rain');
    const p = provenanceOf(s, fx.rain.claimId)!;
    const opposed = p.steps.filter((x) => x.kind === 'opposed');
    expect(opposed.some((x) => /only if they see it/.test(x.text))).toBe(true);
    expect(opposed.some((x) => /Nobody showed/.test(x.text))).toBe(true);
  });
});

describe('harm the player did not ask for, and conflicts that do not depend on order', () => {
  it('cooler flames lower the flood wards River fears fire keeps: homes behind them flood deeper (support shortcut), so ringing the bell on a flood night is a different choice', () => {
    const cool: RealityAst = {
      v: 2, lang: 'reality-1', text: 'Flames burn weaker when the bell rings.', author: 'player', source: { reader: 'offline-v2', model: null, prompt: null, id: null }, day: 1, regions: ['east'],
      clauses: [{ id: 'c1', when: { event: 'bell', min: null }, where: null, target: { kind: 'fire', near: null, tags: [], region: null }, effect: { op: 'ALTER_TEMPERATURE', delta: -2 }, duration: 'night' }],
      omitted: [], narrative: null,
    };
    const night = (ringIt: boolean): { lowered: number; water: (level: number) => number[]; s: RunState } => {
      const run = playReality(cool, (g) => {
        // the Fire Wall: everyone in Eastbank believes the river fears fire, and the lanterns burn
        for (const v of g.state.villagers) if (v.district === 'east') v.beliefs.river_fears_fire = { conv: 90, heard: 3, lastDay: g.state.day, lastSource: null, evidence: 30, cause: null, stale: 0 };
        lightEast(g);
      }, 4);
      const s = cloneState(run.g.state);
      if (ringIt) {
        const bt = s.world.landmarks.find((l) => l.kind === 'belltower')!;
        bt.data.ringing = 1;
      }
      const mods = computeModifiers(s);
      const ctx = { s, events: [] as RunState['log'], expect: true };
      runRealityLaws(ctx, mods);
      const lowered = ctx.events.filter((e) => e.code === 'FIRE_WARDS_COOLED').length;
      return { lowered, water: (level: number) => computeWater(s.world, Math.max(0, level + mods.levelDelta), mods.floodShield), s };
    };
    const rung = night(true);
    const silent = night(false);
    expect(rung.s.laws.some((l) => l.claimId === 'river_fears_fire' && l.status === 'active')).toBe(true);
    expect(rung.lowered).toBeGreaterThan(0);
    expect(silent.lowered).toBe(0);
    const homes = rung.s.world.landmarks.filter((l) => l.kind === 'home' && l.district === 'east');
    const depth = (w: number[]) => homes.reduce((a, h) => a + w[h.y * rung.s.world.w + h.x], 0);
    // at no river level are the homes better off with the bell rung, and at some they are worse: the wards that kept them dry sank
    const levels = [2, 3, 4, 5, 6, 7];
    for (const L of levels) expect(depth(rung.water(L))).toBeGreaterThanOrEqual(depth(silent.water(L)));
    expect(levels.some((L) => depth(rung.water(L)) > depth(silent.water(L)))).toBe(true);
  });

  it('two written laws pushing the same property opposite ways resolve by support, whichever was written first', () => {
    const make = (delta: number, text: string): RealityAst => ({
      v: 2, lang: 'reality-1', text, author: 'player', source: { reader: 'offline-v2', model: null, prompt: null, id: null }, day: 1, regions: ['east'],
      clauses: [{ id: 'c1', when: { event: 'bell', min: null }, where: null, target: { kind: 'fire', near: null, tags: [], region: null }, effect: { op: 'ALTER_TEMPERATURE', delta }, duration: 'night' }],
      omitted: [], narrative: null,
    });
    const hot = make(2, 'Flames burn hotter when the bell rings.');
    const cold = make(-2, 'Flames burn weaker when the bell rings.');
    const run = (order: RealityAst[]): number => {
      const g = GameSession.create({ scenarioId: 'redbank', seed: 1, reality: true });
      g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
      const ids: string[] = [];
      for (const a of order) {
        const b = buildRealityClaim(g.state, a);
        if (!b.ok) throw new Error(b.message);
        expect(g.act({ type: 'COMPOSE', claim: b.draft.claim }).ok).toBe(true);
        ids.push(b.draft.claim.id);
      }
      const hotId = ids[order.indexOf(hot)];
      for (let d = 0; d < 4; d++) {
        // more of Eastbank firmly believes the hot story than the cold one
        g.state.villagers.filter((v) => v.district === 'east').forEach((v, i) => {
          for (const id of ids) v.beliefs[id] = { conv: id === hotId ? 90 : i % 3 === 0 ? 20 : 85, heard: 3, lastDay: g.state.day, lastSource: null, evidence: 30, cause: null, stale: 0 };
        });
        g.endDay();
      }
      const s = cloneState(g.state);
      s.world.landmarks.find((l) => l.kind === 'belltower')!.data.ringing = 1;
      const mods = computeModifiers(s);
      runRealityLaws({ s, events: [], expect: true }, mods);
      return Math.round((mods.fireDamageCut.east ?? 0) * 1000);
    };
    const a = run([hot, cold]);
    const b = run([cold, hot]);
    expect(a).toBe(b);
    // the hotter story has more support behind it, so fire damage rises (a negative cut)
    expect(a).toBeLessThan(0);
  });
});

describe('the preview tells the whole chain before anything is spent', () => {
  it('per clause: what it acts on and how many, reach, how long, what sets it off and whether it could tonight, and what else it does', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 2, reality: true });
    g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
    const r = readBelief(g.state, 'At night, bell ringing pulls rain toward the orchard and makes local flames burn weaker.');
    if (r.kind !== 'supported') throw new Error(r.kind);
    const c = r.candidates[0];
    expect(c.assumed.join()).toMatch(/orchard.*read as the fields of Eastbank/);
    if (!c.build.ok) throw new Error('build');
    const x = describeDraft(g.state, c.build.draft);
    expect(x.plan).toHaveLength(2);
    expect(x.plan[0].catalyst).toMatch(/bell/);
    expect(x.plan[0].ready.now).toBe(false);
    expect(x.plan[0].ready.why).toMatch(/ring the bell today/);
    expect(x.threshold.percent).toBe(65);
    expect(x.threshold.voters).toBe(14);
    expect(x.upkeep.join()).toMatch(/Ring the bell on each day/);
    expect(x.opposition.join()).toMatch(/skeptic|ask for a test|weighs the damage/);
    expect(c.build.draft.risks.join()).toMatch(/lowest dry tiles stand a tile deep/);
    // ring the bell and the same preview says it could act tonight
    const bt = g.state.world.landmarks.find((l) => l.kind === 'belltower')!;
    g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: bt.id });
    expect(describeDraft(g.state, c.build.draft).plan[0].ready.now).toBe(true);
  });

  it('a stale or altered confirmation is refused, and the same belief cannot be paid for twice', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 2, reality: true });
    g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
    const r = readBelief(g.state, 'Chickens fly when the bell rings.');
    if (r.kind !== 'supported' || !r.candidates[0].build.ok) throw new Error('read');
    const claim = r.candidates[0].build.draft.claim;
    const ap = g.state.ap;
    expect(claim.reality!.rev).toBe(g.state.nextEventId);
    // the village changes (a telling) after the preview: the confirmation is stale
    g.act({ type: 'SEED', claim: g.state.scn.starters[0], target: g.state.villagers[0].id });
    const stale = g.act({ type: 'COMPOSE', claim });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe('STALE_REVISION');
    // an altered structure under the same revision does not match its fingerprint
    const fresh = readBelief(g.state, 'Chickens fly when the bell rings.');
    if (fresh.kind !== 'supported' || !fresh.candidates[0].build.ok) throw new Error('read');
    const good = fresh.candidates[0].build.draft.claim;
    const forged: ClaimDef = { ...good, reality: { ...good.reality!, hash: '0000000000' } };
    const bad = g.act({ type: 'COMPOSE', claim: forged });
    expect(bad.ok).toBe(false);
    expect(g.act({ type: 'COMPOSE', claim: good }).ok).toBe(true);
    const again = g.act({ type: 'COMPOSE', claim: good });
    expect(again.ok).toBe(false);
    // one telling and one written belief were paid for, nothing more
    expect(g.state.ap).toBe(ap - 1 - fresh.candidates[0].build.draft.cost.compose);
  });
});

describe('what the village looks ahead at includes written beliefs', () => {
  it('the flood forecast, the map overlay and evacuations see a bank raised by belief (and Classic stays V1’s prediction)', () => {
    const s = play('stones');
    const sim = cloneState(s);
    sim.outcome = null;
    const [tile, height] = Object.entries(s.v2!.bank).map(([k, h]) => [Number(k), h] as const)[0];
    // a river just high enough to reach that stretch of bank if it had not been raised
    const th = sim.threat[Math.min(sim.day, sim.threat.length) - 1];
    th.level = sim.world.elev[tile] + height;
    const mods = computeModifiers(sim);
    const v1Only = computeWater(sim.world, Math.max(0, th.level + mods.levelDelta), mods.floodShield);
    const seen = predictedWater(sim);
    expect(v1Only[tile]).toBeGreaterThan(0);
    expect(seen[tile]).toBe(0);
    const classic = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    const cm = computeModifiers(classic.state);
    expect(predictedWater(classic.state)).toEqual(computeWater(classic.state.world, Math.max(0, classic.state.threat[0].level + cm.levelDelta), cm.floodShield));
  });
});

describe('a complete win and a complete loss, with the composer used', () => {
  it('loss: the written law saved the hens, but everything went into it and four villagers drowned', () => {
    const s = play('hens');
    expect(s.outcome?.result).toBe('defeat');
    expect(s.villagers.filter((v) => v.status === 'dead').length).toBe(4);
    const p = provenanceOf(s, fx.hens.claimId)!;
    expect(p.status).toBe('law');
    expect(new Set(p.steps.map((x) => x.kind))).toEqual(new Set(['written', 'told', 'network', 'threshold', 'changed', 'outcome']));
    expect(p.believers.keeper + p.believers.neighbour + p.believers.witness).toBeGreaterThanOrEqual(3);
  });

  it('win: the written belief was composed and spread, the authored Fire Wall decided the chapter', () => {
    const s = play('win');
    expect(s.outcome?.result).toBe('victory');
    expect(s.claims.some((c) => c.id === fx.win.claimId)).toBe(true);
    const p = provenanceOf(s, fx.win.claimId)!;
    expect(p.steps.at(-1)!.text).toMatch(/endured.*never became law, so it changed nothing/);
  });
});

describe('replays need no model and no network', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a reading a model proposed (scripted here), once written, replays to the same hash with the network switched off', () => {
    const t = fx.hens;
    const g = GameSession.create(t.opts);
    g.act(t.actions[0]);
    const offline = readBelief(g.state, t.sentence);
    if (offline.kind !== 'supported') throw new Error('read');
    const proposed: RealityAst = { ...offline.candidates[0].ast, source: { reader: 'model', model: 'scripted-provider', prompt: 'interpret-v2', id: 'r-1' } };
    const built = buildRealityClaim(g.state, proposed);
    if (!built.ok) throw new Error(built.message);
    const id = built.draft.claim.id;
    const actions: Action[] = t.actions.map((a) => (a.type === 'COMPOSE' ? { type: 'COMPOSE', claim: built.draft.claim } : 'claim' in a && a.claim === t.claimId ? ({ ...a, claim: id } as Action) : a));
    const live = GameSession.create(t.opts);
    for (const a of actions) expect(live.act(a).ok, JSON.stringify(a).slice(0, 80)).toBe(true);
    vi.stubGlobal('fetch', () => {
      throw new Error('network is off');
    });
    const rep = replayRun({ ...t.opts, actions });
    expect(rep.rejected).toEqual([]);
    expect(rep.stateHash).toBe(stateHash(live.state));
    expect(rep.state.claims.find((c) => c.id === id)!.def!.reality!.ast.source.reader).toBe('model');
  });
});
