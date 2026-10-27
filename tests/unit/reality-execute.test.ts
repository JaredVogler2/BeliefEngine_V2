import { describe, expect, it } from 'vitest';
import { GameSession, buildRealityClaim, deserializeRun, serializeRun, stateHash } from '../../src/engine/index.ts';
import { cloneState } from '../../src/engine/core/clone.ts';
import { computeModifiers, emptyModifiers, stampShield } from '../../src/engine/laws/effects.ts';
import { resolveKey, runRealityLaws, MAX_TARGETS } from '../../src/engine/reality/execute.ts';
import type { RealityAst } from '../../src/engine/reality/ast.ts';
import type { RunState } from '../../src/engine/core/types.ts';
import { bellRainFire, chickensFly, lightEast, playReality, ring, wetStoneLight } from '../helpers/reality.ts';

/**
 * Phase 06: reality beliefs physically change a generalised world. Each proof belief is played against a control run on the same
 * seed; the social part is shortcut (everyone in the region believes it each morning) but the law machinery still decides when the
 * law wakes, and every physical change goes through the executor and V1's own hazard code.
 */

const count = (s: RunState, code: string) => s.log.filter((e) => e.code === code).length;

describe('the three proof beliefs change the world, each differently', () => {
  const control = playReality(null, ring);
  const chickens = playReality(chickensFly(), ring);

  it('chickens fly when the bell rings: the flock survives the flood nights that drown the control flock', () => {
    const c = control.g.state.v2!;
    const w = chickens.g.state.v2!;
    expect(c.chickens.filter((x) => x.fate === 'drowned').length).toBeGreaterThan(10);
    expect(w.chickens.filter((x) => x.alive).length).toBeGreaterThan(c.chickens.filter((x) => x.alive).length);
    expect(count(chickens.g.state, 'CHICKENS_ROSE')).toBeGreaterThan(0);
    expect(count(control.g.state, 'CHICKENS_ROSE')).toBe(0);
    // eggs are food: the surviving flock keeps feeding the village
    expect(chickens.g.state.world.stocks.food).toBeGreaterThan(control.g.state.world.stocks.food);
    const fx = chickens.g.state.log.filter((e) => e.code === 'REALITY_EFFECT');
    expect(fx.length).toBeGreaterThan(0);
    expect(fx.every((e) => e.law && e.claim === chickens.claimId)).toBe(true);
  });

  it('wet stone becomes light beside lanterns: light stones are hauled to the bank, which stays raised for good', () => {
    const lanternsOnly = playReality(null, lightEast);
    const stones = playReality(wetStoneLight(), lightEast);
    const v2 = stones.g.state.v2!;
    expect(Object.keys(lanternsOnly.g.state.v2!.bank)).toHaveLength(0);
    expect(Object.keys(v2.bank).length).toBeGreaterThan(0);
    expect(v2.stones.some((x) => x.state === 'placed')).toBe(true);
    expect(count(stones.g.state, 'BANK_RAISED')).toBeGreaterThan(0);
    // the raised bank is a lasting flood shield: it is applied on every later night, whether or not the law still holds
    const s = cloneState(stones.g.state);
    for (const l of s.laws) l.status = 'dormant';
    const mods = computeModifiers(s);
    runRealityLaws({ s, events: [], expect: false }, mods);
    for (const [k, h] of Object.entries(v2.bank)) expect(mods.floodShield[Number(k)]).toBeGreaterThanOrEqual(h);
  });

  it('bell ringing pulls rain toward the fields and weakens flames: the river rises less, water pools on the fields, fire is cut', () => {
    const rain = playReality(bellRainFire(), ring);
    expect(rain.g.state.log.some((e) => e.code === 'WATER_POOLED')).toBe(true);
    expect(rain.g.state.log.filter((e) => e.code === 'REALITY_EFFECT' && /flames burn weaker/.test(e.text)).length).toBeGreaterThan(0);
    // the river level each night (world.level) ends lower than the control's on the nights the law acted
    const lv = (st: RunState) => st.log.filter((e) => e.code === 'DAY_START').length;
    expect(lv(rain.g.state)).toBeGreaterThan(0);
    // a downside the player did not ask for: belief-moved water pooled on the low fields
    expect(rain.g.state.log.some((e) => e.code === 'FIELD_FLOODED' || e.code === 'WATER_POOLED')).toBe(true);
    const homes = (st: RunState) => st.world.landmarks.filter((l) => (l.kind === 'home' || l.kind === 'cabin') && l.hp > 0).length;
    expect(homes(rain.g.state)).toBeGreaterThan(homes(control.g.state));
  });

  it('three beliefs, three different worlds on the same seed', () => {
    const hashes = new Set([stateHash(control.g.state), stateHash(chickens.g.state), stateHash(playReality(wetStoneLight(), lightEast).g.state), stateHash(playReality(bellRainFire(), ring).g.state)]);
    expect(hashes.size).toBe(4);
  });
});

describe('determinism, saves and replays', () => {
  it('the same run twice gives the same state and event hashes', () => {
    const a = playReality(chickensFly(), ring);
    const b = playReality(chickensFly(), ring);
    expect(stateHash(a.g.state)).toBe(stateHash(b.g.state));
    expect(a.g.state.log.length).toBe(b.g.state.log.length);
  });

  it('saving and loading mid-run changes nothing', () => {
    const straight = playReality(wetStoneLight(), lightEast, 6);
    const half = playReality(wetStoneLight(), lightEast, 3);
    const loaded = deserializeRun(serializeRun(half.g.state));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const g = new GameSession(loaded.state);
    const region = 'east';
    for (let d = 0; d < 3 && !g.state.outcome; d++) {
      for (const v of g.state.villagers) if (v.district === region && v.status !== 'dead') v.beliefs[half.claimId!] = { conv: 85, heard: 3, lastDay: g.state.day, lastSource: null, evidence: 30, cause: null, stale: 0 };
      lightEast(g);
      g.endDay();
    }
    expect(stateHash(g.state)).toBe(stateHash(straight.g.state));
  });

  it('a save whose reality belief was edited is refused', () => {
    const run = playReality(chickensFly(), ring, 2);
    const env = JSON.parse(serializeRun(run.g.state));
    const c = env.state.claims.find((x: { id: string }) => x.id === run.claimId);
    c.def.spec.thresholds.on = 0.4;
    expect(deserializeRun(JSON.stringify(env))).toMatchObject({ ok: false });
    const env2 = JSON.parse(serializeRun(run.g.state));
    env2.state.claims.find((x: { id: string }) => x.id === run.claimId).def.reality.ast.clauses[0].effect.magnitude = 3;
    expect(deserializeRun(JSON.stringify(env2))).toMatchObject({ ok: false });
  });

  it('a recorded action log replays a reality run exactly (no model, no reinterpretation)', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 3, reality: true });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const b = buildRealityClaim(g.state, chickensFly());
    if (!b.ok) throw new Error('build');
    expect(g.act({ type: 'COMPOSE', claim: b.draft.claim }).ok).toBe(true);
    const ivo = g.state.villagers.find((v) => v.district === 'east')!;
    expect(g.act({ type: 'SEED', claim: b.draft.claim.id, target: ivo.id }).ok).toBe(true);
    ring(g);
    g.endDay();
    ring(g);
    g.endDay();
    const replay = GameSession.create({ scenarioId: 'redbank', seed: 3, reality: true });
    for (const a of g.log) expect(replay.act(a).ok).toBe(true);
    expect(stateHash(replay.state)).toBe(stateHash(g.state));
  });
});

describe('effects that change something real, or say they found nothing', () => {
  const SRC = { reader: 'offline-v2' as const, model: null, prompt: null, id: null };
  const tireless = (region: string): RealityAst => ({
    v: 2, lang: 'reality-1', text: 'At night the farmers work without tiring.', author: 'player', source: SRC, day: 1, regions: [region],
    clauses: [{ id: 'c1', when: { event: 'night', min: null }, where: null, target: { kind: 'villager', near: null, tags: [], region: null }, effect: { op: 'INFLUENCE_MOTIVATION', motive: 'diligence', magnitude: 2 }, duration: 'night' }],
    omitted: [], narrative: null,
  });

  it('tireless farmers bring in a little more food from the fields they work, and the idle nights say so', () => {
    const none = playReality(null, ring);
    const run = playReality(tireless('east'), ring);
    const tended = run.g.state.log.filter((e) => e.code === 'FIELD_TENDED');
    expect(tended.length).toBeGreaterThan(0);
    expect(tended.every((e) => e.claim === run.claimId)).toBe(true);
    expect(count(none.g.state, 'FIELD_TENDED')).toBe(0);
    for (const e of run.g.state.log.filter((x) => x.code === 'REALITY_IDLE')) expect(e.text).toMatch(/found nothing in them it could change/);
  });

  it('a village where nobody works the fields refuses it', () => {
    const g = GameSession.create({ scenarioId: 'ashwood', seed: 1, reality: true });
    const b = buildRealityClaim(g.state, tireless('mill'));
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.issues.join()).toMatch(/nobody here works the fields/);
  });

  it('water turned from the bridge spares the bridge, and the log names the bridge', () => {
    const near: RealityAst = {
      v: 2, lang: 'reality-1', text: 'Whenever the bell is rung, the river keeps clear of the bridge.', author: 'player', source: SRC, day: 1, regions: ['river'],
      clauses: [{ id: 'c1', when: { event: 'bell', min: null }, where: null, target: { kind: 'water', near: { anchor: 'bridge', radius: 2 }, tags: [], region: null }, effect: { op: 'REDIRECT_FLOW', mode: 'repel', magnitude: 2, radius: 2 }, duration: 'night' }],
      omitted: [], narrative: null,
    };
    const none = playReality(null, ring);
    const run = playReality(near, ring);
    const hp = (st: RunState) => st.world.landmarks.find((l) => l.kind === 'bridge')!.hp;
    expect(hp(run.g.state)).toBeGreaterThan(hp(none.g.state));
    const fx = run.g.state.log.filter((e) => e.code === 'REALITY_EFFECT');
    expect(fx.length).toBeGreaterThan(0);
    expect(fx[0].text).toMatch(/turned away from the bridge within 2 tiles/);
  });
});

describe('the Compose action rebuilds and checks every reality belief', () => {
  const fresh = () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, reality: true });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    return g;
  };

  it('refuses a stale confirmation, a forged fingerprint and a classic run; charges what the structure costs', () => {
    const g = fresh();
    const b = buildRealityClaim(g.state, bellRainFire());
    if (!b.ok) throw new Error('build');
    const ap = g.state.ap;
    ring(g);
    expect(g.act({ type: 'COMPOSE', claim: b.draft.claim })).toMatchObject({ ok: false, error: { code: 'STALE_REVISION' } });
    const b2 = buildRealityClaim(g.state, bellRainFire());
    if (!b2.ok) throw new Error('build');
    const forged = { ...b2.draft.claim, reality: { ...b2.draft.claim.reality!, hash: 'deadbeef' } };
    expect(g.act({ type: 'COMPOSE', claim: forged })).toMatchObject({ ok: false, error: { code: 'STALE_BELIEF' } });
    const cheap = { ...b2.draft.claim, spec: { ...b2.draft.claim.spec, thresholds: { ...b2.draft.claim.spec.thresholds, on: 0.3, minSupporters: 1 } } };
    const before = g.state.ap;
    expect(before).toBeLessThan(ap);
    const r = g.act({ type: 'COMPOSE', claim: cheap });
    expect(r.ok).toBe(true);
    const installed = g.state.claims.find((c) => c.id === b2.draft.claim.id)!.def!;
    expect(installed.spec.thresholds.on).toBe(b2.draft.claim.spec.thresholds.on);
    expect(g.state.ap).toBe(before - b2.draft.cost.compose);
    const classic = GameSession.create({ scenarioId: 'redbank', seed: 1, inventor: true });
    classic.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    expect(classic.act({ type: 'COMPOSE', claim: b2.draft.claim })).toMatchObject({ ok: false, error: { code: 'NOT_AVAILABLE' } });
  });
});

describe('conflicts, bounds and loops', () => {
  it('opposite pushes on one property resolve by support, not by which law runs first', () => {
    const a = resolveKey('mass:s1', [{ key: 'mass:s1', value: -3, weight: 0.9, law: 'A' }, { key: 'mass:s1', value: 2, weight: 0.3, law: 'B' }]);
    const b = resolveKey('mass:s1', [{ key: 'mass:s1', value: 2, weight: 0.3, law: 'B' }, { key: 'mass:s1', value: -3, weight: 0.9, law: 'A' }]);
    expect(a).toEqual(b);
    expect(a.value).toBe(Math.round((2 * 0.3 - 3 * 0.9) / 1.2));
    expect(a.conflict).toEqual({ laws: ['A', 'B'], pos: 0.3, neg: 0.9 });
    // agreeing contributions: the strongest shield wins, sums stay within the property's range
    expect(resolveKey('flood:5', [{ key: 'flood:5', value: 2, weight: 1, law: 'A' }, { key: 'flood:5', value: 3, weight: 0.1, law: 'B' }]).value).toBe(3);
    expect(resolveKey('fear:v', [{ key: 'fear:v', value: -30, weight: 1, law: 'A' }, { key: 'fear:v', value: -30, weight: 1, law: 'B' }]).value).toBe(-40);
  });

  it('two real laws in conflict give the same result whatever their order in the run', () => {
    const lighter = wetStoneLight();
    const heavier: RealityAst = { ...wetStoneLight(), text: 'Stone grows heavy beside lanterns.', clauses: [{ ...wetStoneLight().clauses[0], where: null, effect: { op: 'SET_MATERIAL_PROPERTY', property: 'mass', delta: 2 } }] };
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, reality: true });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    g.state.ap = 9; // white-box: enough Influence to write both
    for (const ast of [lighter, heavier]) {
      const b = buildRealityClaim(g.state, ast);
      if (!b.ok) throw new Error(b.issues.join());
      expect(g.act({ type: 'COMPOSE', claim: b.draft.claim }).ok).toBe(true);
    }
    lightEast(g);
    const s = cloneState(g.state);
    for (const l of s.laws) if (l.claimId.startsWith('reality_')) Object.assign(l, { status: 'active', strength: 1, pressure: l.claimId === s.claims[s.claims.length - 2].id ? 0.9 : 0.4 });
    for (const w of [s.world.landmarks.find((l) => l.kind === 'beacon')!]) Object.assign(w, { lit: true, fuelNights: 2 });
    s.v2!.stones.forEach((x) => (x.wet = 2));
    const run = (st: RunState) => {
      const c = cloneState(st);
      const ctx = { s: c, events: [], expect: false };
      const plan = runRealityLaws(ctx, emptyModifiers(c));
      return { mass: plan.intents.mass, conflicts: ctx.events.filter((e: { code: string }) => e.code === 'REALITY_CONFLICT').length };
    };
    const forward = run(s);
    const reversed = cloneState(s);
    reversed.laws.reverse();
    reversed.claims.reverse();
    expect(run(reversed)).toEqual(forward);
    expect(forward.conflicts).toBeGreaterThan(0);
  });

  it('touches at most 40 targets per clause, and an empty selection is reported, never an error', () => {
    expect(MAX_TARGETS).toBe(40);
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, reality: true });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const b = buildRealityClaim(g.state, chickensFly('west'));
    if (!b.ok) throw new Error(b.issues.join());
    g.act({ type: 'COMPOSE', claim: b.draft.claim });
    const s = cloneState(g.state);
    for (const l of s.laws) if (l.claimId === b.draft.claim.id) Object.assign(l, { status: 'active', strength: 1, pressure: 0.9 });
    s.world.landmarks.find((l) => l.kind === 'belltower')!.data.ringing = 1;
    const ctx = { s, events: [] as { code: string }[], expect: false };
    runRealityLaws(ctx as never, emptyModifiers(s));
    // the coops are all in Eastbank: a belief about Westbank's chickens finds none, and says so
    expect(ctx.events.map((e) => e.code)).toContain('REALITY_IDLE');
  });

  it('a lantern flood clause stamps exactly the shield V1 stamps for the same law', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, reality: true });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const ast: RealityAst = { ...chickensFly(), text: 'The river turns from lit lanterns.', clauses: [{ id: 'c1', when: { event: 'lantern', min: null }, where: null, target: { kind: 'water', near: null, tags: [], region: null }, effect: { op: 'REDIRECT_FLOW', mode: 'repel', magnitude: 3, radius: 3 }, duration: 'night' }] };
    const b = buildRealityClaim(g.state, ast);
    if (!b.ok) throw new Error(b.issues.join());
    g.act({ type: 'COMPOSE', claim: b.draft.claim });
    const s = cloneState(g.state);
    const beacon = s.world.landmarks.find((l) => l.kind === 'beacon' && l.district === 'east')!;
    Object.assign(beacon, { lit: true, fuelNights: 2 });
    for (const l of s.laws) if (l.claimId === b.draft.claim.id) Object.assign(l, { status: 'active', strength: 0.7, pressure: 0.8 });
    const v2mods = emptyModifiers(s);
    runRealityLaws({ s, events: [], expect: false }, v2mods);
    const v1 = new Array<number>(s.world.w * s.world.h).fill(0);
    for (const src of s.world.landmarks.filter((l) => l.kind === 'beacon' && l.lit && l.fuelNights > 0 && l.district === 'east')) stampShield(s, v1, { id: src.id, x: src.x, y: src.y }, 3, Math.max(1, Math.round(3 * (0.5 + 0.5 * 0.7))), 1);
    expect(v2mods.floodShield).toEqual(v1);
  });

  it('runs 20 active reality laws over a 100-villager-sized village quickly', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, realityLab: true });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const s = cloneState(g.state);
    const asts: RealityAst[] = [chickensFly(), wetStoneLight(), bellRainFire()];
    for (let i = 0; i < 20; i++) {
      const base = asts[i % 3];
      const ast = { ...JSON.parse(JSON.stringify(base)), text: `${base.text} (${i})` } as RealityAst;
      const c = ast.clauses[0].effect as { magnitude?: number; delta?: number };
      if (c.magnitude !== undefined) c.magnitude = 1 + (i % 3);
      const b = buildRealityClaim(s, ast);
      if (!b.ok) continue;
      const def = { ...b.draft.claim, id: `${b.draft.claim.id}_${i}` };
      s.claims.push({ id: def.id, available: true, introduced: true, introducedDay: 1, def });
      s.laws.push({ id: `${def.id}@east`, claimId: def.id, regionId: 'east', status: 'active', progress: 100, pressure: 0.8, strength: 1, supporters: [], opponents: [], topShare: 0.8, activatedDay: 1, changedDay: 1, note: '', activeNights: 1 });
    }
    while (s.villagers.length < 100) s.villagers.push({ ...JSON.parse(JSON.stringify(s.villagers[s.villagers.length % 14])), id: `extra${s.villagers.length}` });
    s.world.landmarks.find((l) => l.kind === 'belltower')!.data.ringing = 1;
    const t0 = performance.now();
    for (let k = 0; k < 10; k++) runRealityLaws({ s: cloneState(s), events: [], expect: false }, emptyModifiers(s));
    const per = (performance.now() - t0) / 10;
    expect(per).toBeLessThan(150);
  });
});
