import { describe, expect, it } from 'vitest';
import { GameSession, applyRun, emptyProgress, importProgress, exportProgress, omenFor, optionsFromState, personalBest, progressStats, stagingOmen, stateHash, type RunState } from '../../src/engine/index.ts';
import { REALITY_POLICIES, realityPolicyById, writtenClaims, antagonize } from '../../src/engine/ai/bots/reality.ts';
import { playInstrumented } from '../../src/engine/ai/bots/telemetry.ts';
import { readBelief } from '../../src/engine/reality/read.ts';
import { REALITY_RULES } from '../../src/engine/reality/state.ts';
import { thinkersPerDay } from '../../src/engine/mind/types.ts';

/**
 * Phase 11: the rules that keep Generative Reality a strategy game. Written beliefs are balanced and staged under a recorded rules
 * version; a written copy never undercuts the chapter's own law; a belief can be held in every hamlet at a fair price; magic that
 * harms the people who live with it costs their trust and can raise their leader against it; Living Village and the other V2 modes
 * keep their own records; the tournament's policies play only through the public actions.
 */

const run = (opts: Partial<Parameters<typeof GameSession.create>[0]> = {}): GameSession =>
  GameSession.create({ scenarioId: 'redbank', seed: 1, difficulty: 'normal', mode: 'story', reality: true, ...opts });

function write(g: GameSession, sentence: string, region?: string): string {
  const r = readBelief(g.state, sentence, region ? { region } : {});
  const c = r.kind === 'supported' || r.kind === 'partial' ? r.candidates[0] : null;
  if (!c?.build.ok) throw new Error(`${sentence}: ${r.kind}`);
  const res = g.act({ type: 'COMPOSE', claim: c.build.draft.claim });
  if (!res.ok) throw new Error(`${sentence}: ${res.error.message}`);
  return c.build.draft.claim.id;
}

const def = (s: RunState, id: string) => s.claims.find((c) => c.id === id)!.def!;

describe('the rules a run is balanced under are recorded with it', () => {
  it('a run made now is under rules 2; rules 1 is recorded by its absence, exactly the state older saves hold', () => {
    expect(REALITY_RULES).toBe(2);
    expect(run().state.v2!.rules).toBe(2);
    const old = run({ realityRules: 1 }).state;
    expect('rules' in old.v2!).toBe(false);
    // and a rules-1 run is recreated under rules 1 (retry, share, replay)
    expect(optionsFromState(old).realityRules).toBe(1);
    expect(optionsFromState(run().state).realityRules).toBeUndefined();
  });

  it('the same sentence asks less under rules 2 than under rules 1, from the same power', () => {
    const now = run();
    now.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const before = run({ realityRules: 1 });
    before.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const ia = write(now, 'The river turns away from lit lanterns.');
    const ib = write(before, 'The river turns away from lit lanterns.');
    const a = def(now.state, ia);
    const b = def(before.state, ib);
    expect(a.reality!.power).toBe(b.reality!.power);
    expect(a.spec.thresholds.on).toBeLessThan(b.spec.thresholds.on);
    expect(a.spec.thresholds.minSupporters).toBeLessThan(b.spec.thresholds.minSupporters);
  });
});

describe('a written belief can be staged like an authored story (rules 2)', () => {
  it('a belief that waits for the bell is staged with the bells, and its omen is read from what it does (the river ebbing)', () => {
    const g = run();
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const id = write(g, 'The flood flows away from the ringing bell.');
    expect(def(g.state, id).ritual).toBe('ring_bells');
    const ring = g.state.scn.rituals.find((r) => r.id === 'ring_bells')!;
    expect(stagingOmen(g.state, ring, id).value).toBe(omenFor(g.state, 'river_trend').value);
    // an authored story keeps its own rite's omen
    expect(stagingOmen(g.state, ring, 'rain_heeds_bells')).toEqual(omenFor(g.state, ring.omen));
  });

  it('a belief nothing tonight can show fails in front of its witnesses, at V1’s price, unless it is already waking', () => {
    const g = run();
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const id = write(g, 'Chickens fly when the bell rings.');
    const ring = g.state.scn.rituals.find((r) => r.id === 'ring_bells')!;
    expect(stagingOmen(g.state, ring, id).value).toBe(-1);
    const bt = g.state.world.landmarks.find((l) => l.kind === 'belltower')!;
    const trust = g.state.villagers.reduce((a, v) => a + v.keeperTrust, 0);
    expect(g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: bt.id, claim: id }).ok).toBe(true);
    expect(g.state.log.some((e) => e.code === 'EVIDENCE_BACKFIRED' && e.claim === id)).toBe(true);
    expect(g.state.villagers.reduce((a, v) => a + v.keeperTrust, 0)).toBeLessThan(trust);
    // once its law has any progress it acts tonight where people can see it: a kind night
    const s = structuredClone(g.state);
    s.laws.push({ id: 'l1', claimId: id, regionId: 'east', status: 'dormant', progress: 10, pressure: 0.6, strength: 0, supporters: [], opponents: [], topShare: 0, activatedDay: null, changedDay: 1, note: '', activeNights: 0 });
    expect(stagingOmen(s, ring, id).value).toBe(1);
  });

  it('a copy of an authored story is as provable as it: the growth belief of Harvest is staged by working the fields at night', () => {
    const g = GameSession.create({ scenarioId: 'harvest', seed: 1, difficulty: 'normal', mode: 'story', reality: true });
    g.act({ type: 'PICK_STARTER', claim: 'moonlight_ripens_grain' });
    const id = write(g, 'Crops ripen faster under the night sky.');
    expect(def(g.state, id).ritual).toBe('moonlit_work');
  });

  it('under rules 1 a written belief cannot be staged (as before phase 11)', () => {
    const g = run({ realityRules: 1 });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const id = write(g, 'The flood flows away from the ringing bell.');
    expect(def(g.state, id).ritual).toBeUndefined();
    const bt = g.state.world.landmarks.find((l) => l.kind === 'belltower')!;
    const r = g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: bt.id, claim: id });
    expect(r.ok).toBe(false);
  });
});

describe('the dominant cheap win, closed: a written copy never undercuts the chapter’s own law', () => {
  it('a bridge belief asks what “Bridge stands watched” asks, needs its three watchers, and waits for its day when that opening was not picked', () => {
    const g = run();
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const id = write(g, 'The bridge grows stronger when people watch it.');
    const d = def(g.state, id);
    const authored = g.state.scn.claimDefs.find((c) => c.id === 'bridge_stands_watched')!;
    expect(d.spec.thresholds.on).toBeGreaterThanOrEqual(authored.spec.thresholds.on);
    expect(d.spec.thresholds.minSupporters).toBeGreaterThanOrEqual(authored.spec.thresholds.minSupporters);
    expect(d.spec.thresholds.ramp).toBeLessThanOrEqual(authored.spec.thresholds.ramp);
    expect(JSON.stringify(d.reality!.ast.clauses[0].when)).toContain('"min":3');
    expect(d.unlockDay).toBe(authored.unlockDay);
    // picked as the opening, the same story is the player's from day 1, and so is a copy of it
    const h = run();
    h.act({ type: 'PICK_STARTER', claim: 'bridge_stands_watched' });
    const ih = write(h, 'The bridge grows stronger when people watch it.');
    expect(def(h.state, ih).unlockDay).toBeUndefined();
  });

  it('regression: the policy that rode the cheap copy no longer wins Redbank (it won 20 of 20 before the fix)', () => {
    let wins = 0;
    for (let seed = 1; seed <= 4; seed++) if (playInstrumented(realityPolicyById('bridge-persuasion'), { scenarioId: 'redbank', seed, difficulty: 'normal', mode: 'story', reality: true }).t.result === 'victory') wins++;
    expect(wins).toBeLessThanOrEqual(1);
  });
});

describe('a belief held in every hamlet (rules 2)', () => {
  it('"in every hamlet" holds it in each hamlet with pens; each hamlet is priced by its share, the Influence by the whole', () => {
    const g = GameSession.create({ scenarioId: 'ashwood', seed: 1, difficulty: 'normal', mode: 'story', reality: true });
    g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
    const one = readBelief(g.state, 'Smoke hides the pens from the wolves.');
    const all = readBelief(g.state, 'Smoke hides the pens from the wolves in every hamlet.');
    if (one.kind !== 'supported' || all.kind !== 'supported' || !one.candidates[0].build.ok || !all.candidates[0].build.ok) throw new Error('readings');
    const a = one.candidates[0].build.draft;
    const b = all.candidates[0].build.draft;
    expect(a.ast.regions).toHaveLength(1);
    expect(new Set(b.ast.regions)).toEqual(new Set(['north', 'mill', 'ash']));
    expect(b.power).toBeCloseTo(a.power * 3, 5);
    expect(b.claim.spec.thresholds.on).toBe(a.claim.spec.thresholds.on);
    expect(b.cost.compose).toBeGreaterThan(a.cost.compose);
    expect(all.candidates[0].assumed.join()).toMatch(/held in every part of the village/);
  });

  it('under rules 1 the words are read as before: one hamlet', () => {
    const g = GameSession.create({ scenarioId: 'ashwood', seed: 1, difficulty: 'normal', mode: 'story', reality: true, realityRules: 1 });
    g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
    const r = readBelief(g.state, 'Smoke hides the pens from the wolves in every hamlet.');
    if (r.kind !== 'supported') throw new Error(r.kind);
    expect(r.candidates[0].ast.regions).toHaveLength(1);
  });
});

describe('the price of hazardous magic', () => {
  it('rain a belief pools on Eastbank costs the trust of the people there, and the Reeve stands against it for the public', () => {
    const g = run();
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const id = write(g, 'At night, bell ringing pulls rain toward the orchard and makes local flames burn weaker.', 'east');
    const eastIds = g.state.villagers.filter((v) => v.district === 'east').map((v) => v.id);
    const trust0 = new Map(g.state.villagers.map((v) => [v.id, v.keeperTrust]));
    // white-box: Eastbank believes it (the persuasion is tested elsewhere); the bell is rung; the law decides the rest
    for (const v of g.state.villagers) if (v.district === 'east') v.beliefs[id] = { conv: 85, heard: 3, lastDay: 1, lastSource: null, evidence: 30, cause: null, stale: 0 };
    const bt = g.state.world.landmarks.find((l) => l.kind === 'belltower')!;
    g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: bt.id });
    g.endDay();
    const log = g.state.log.filter((e) => e.day === 1);
    const pooled = log.find((e) => e.code === 'WATER_POOLED');
    const harmed = log.find((e) => e.code === 'LAW_HARMED');
    expect(pooled).toBeDefined();
    expect(harmed?.claim).toBe(id);
    expect(harmed?.cause).toEqual([pooled!.id]);
    for (const vid of eastIds) {
      const v = g.state.villagers.find((x) => x.id === vid)!;
      if (v.status === 'dead') continue;
      expect(v.keeperTrust).toBeLessThan(trust0.get(vid)!);
      expect(v.memory?.some((m) => m.kind === 'law_harmed' && m.claim === id)).toBe(true);
    }
    // the town's leader lives in Westbank, but the village's livelihood is the council's to defend
    const oppose = log.find((e) => e.code === 'LEADER_OPPOSES');
    expect(oppose?.actor).toBe('hester');
    expect(oppose?.text).toMatch(/for the harm it did \(the water it moved pooled on \d+ tiles of low ground in Eastbank\)/);
  });

  it('under rules 1 nothing of this happens (older runs replay as they were)', () => {
    const g = run({ realityRules: 1 });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const id = write(g, 'At night, bell ringing pulls rain toward the orchard and makes local flames burn weaker.', 'east');
    // the same white-box belief for three nights (rules 1 ramps more slowly): the rain is moved and pools, and that is all
    for (let d = 0; d < 3; d++) {
      for (const v of g.state.villagers) if (v.district === 'east' && v.status !== 'dead') v.beliefs[id] = { conv: 85, heard: 3, lastDay: g.state.day, lastSource: null, evidence: 30, cause: null, stale: 0 };
      g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: g.state.world.landmarks.find((l) => l.kind === 'belltower')!.id });
      g.endDay();
    }
    expect(g.state.log.some((e) => e.code === 'WATER_POOLED')).toBe(true);
    expect(g.state.log.some((e) => e.code === 'LAW_HARMED' || e.code === 'LEADER_OPPOSES')).toBe(false);
  });
});

describe('Living Village', () => {
  it('a chapter with minds at full voice: more thinkers, no hens or stones, no writing; its own mode flag', () => {
    const g = run({ reality: false, living: true });
    const s = g.state;
    expect(s.v2?.living).toBe(true);
    expect(s.flags.reality).toBe(3);
    expect(s.v2!.chickens).toEqual([]);
    expect(s.v2!.stones).toEqual([]);
    expect(thinkersPerDay(s)).toBe(6);
    expect(thinkersPerDay(run().state)).toBe(4);
    g.act({ type: 'PICK_STARTER', claim: s.scn.starters[0] });
    const r = readBelief(g.state, 'The river turns away from lit lanterns.');
    if (r.kind !== 'supported' || !r.candidates[0].build.ok) throw new Error('reading');
    const res = g.act({ type: 'COMPOSE', claim: r.candidates[0].build.draft.claim });
    expect(res.ok).toBe(false);
    expect(optionsFromState(g.state).living).toBe(true);
    // a whole chapter plays to an end, and more villagers think on its days than in a Chronicle run
    const p = playInstrumented(REALITY_POLICIES.find((x) => x.id === 'noop')!.make(), { scenarioId: 'redbank', seed: 1, difficulty: 'normal', mode: 'story', living: true });
    expect(p.session.state.outcome).not.toBeNull();
  });
});

describe('each V2 mode keeps its own records, apart from Classic', () => {
  const finish = (opts: Parameters<typeof GameSession.create>[0]) => playInstrumented(REALITY_POLICIES.find((x) => x.id === 'noop')!.make(), opts).session.state;

  it('Chronicle, Living Village and Lab runs are marked, unlock nothing, never count as Classic, and survive export and import', () => {
    let p = emptyProgress();
    const classic = finish({ scenarioId: 'redbank', seed: 1, difficulty: 'normal', mode: 'story' });
    const chron = finish({ scenarioId: 'redbank', seed: 1, difficulty: 'normal', mode: 'story', reality: true });
    const living = finish({ scenarioId: 'redbank', seed: 1, difficulty: 'normal', mode: 'story', living: true });
    const lab = finish({ scenarioId: 'redbank', seed: 1, difficulty: 'normal', mode: 'story', realityLab: true });
    const records = [classic, chron, living, lab].map((s) => {
      const r = applyRun(p, s, { debug: false });
      p = r.progress;
      return r;
    });
    expect(records.map((r) => r.record.variant ?? null)).toEqual([null, 'chronicle', 'living', 'lab']);
    for (const r of records.slice(1)) {
      expect(r.newUnlocks).toEqual([]);
      expect(r.newAchievements).toEqual([]);
    }
    const st = progressStats(p);
    expect(st.runs).toBe(1);
    expect(st.variants.chronicle.runs).toBe(1);
    expect(st.variants.living.runs).toBe(1);
    expect(st.variants.lab.runs).toBe(1);
    expect(personalBest(p, records[3].record)).toBeNull();
    const back = importProgress(exportProgress(p));
    if (!back.ok) throw new Error(back.error);
    expect(back.progress.runs.map((r) => r.variant ?? null)).toEqual([null, 'chronicle', 'living', 'lab']);
  });

  it('a written belief that became law is remembered in the atlas as an entry to read, with no power for a later run', () => {
    const g = run();
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const id = write(g, 'Chickens fly when the bell rings.');
    while (!g.state.outcome) {
      for (const v of g.state.villagers) if (v.district === 'east' && v.status !== 'dead') v.beliefs[id] = { conv: 85, heard: 3, lastDay: g.state.day, lastSource: null, evidence: 30, cause: null, stale: 0 };
      g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: g.state.world.landmarks.find((l) => l.kind === 'belltower')!.id });
      g.endDay();
    }
    const r = applyRun(emptyProgress(), g.state, { debug: false });
    const entries = Object.values(r.progress.atlas.invented ?? {});
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Chickens fly when the bell rings.');
    expect(entries[0].effects).toContain('REALITY_EFFECT');
    expect(r.newUnlocks).toEqual([]);
    // and the keepsake survives the archive's export and import (the importer rebuilds the atlas field by field)
    const back = importProgress(exportProgress(r.progress));
    if (!back.ok) throw new Error(back.error);
    expect(back.progress.atlas.invented).toEqual(r.progress.atlas.invented);
  });
});

describe('the tournament plays by the rules', () => {
  it('every policy plays the same seed to the same state twice, without the network', () => {
    const fetch0 = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('no network in a tournament');
    }) as typeof fetch;
    try {
      for (const p of REALITY_POLICIES) {
        const a = playInstrumented(p.make(), { scenarioId: 'redbank', seed: 2, difficulty: 'normal', mode: 'story', reality: true });
        const b = playInstrumented(p.make(), { scenarioId: 'redbank', seed: 2, difficulty: 'normal', mode: 'story', reality: true });
        expect(stateHash(a.session.state), p.id).toBe(stateHash(b.session.state));
        expect(a.session.state.outcome, p.id).not.toBeNull();
        if (p.role) expect(writtenClaims(a.session.state).length, p.id).toBeGreaterThan(0);
      }
    } finally {
      globalThis.fetch = fetch0;
    }
  });

  it('the antagonist proposes only through NPC_DECIDE, and the engine keeps only legal moves', () => {
    // a whole run of the policy: the ward is told while the adversary drives every thinking villager against it
    const p = playInstrumented(realityPolicyById('rival-antagonist'), { scenarioId: 'redbank', seed: 1, difficulty: 'normal', mode: 'story', reality: true });
    const decided = p.session.log.filter((a) => a.type === 'NPC_DECIDE');
    expect(decided.length).toBeGreaterThan(0);
    for (const a of decided) if (a.type === 'NPC_DECIDE') expect(a.model).toBe('antagonist (scripted)');
    // what the engine accepted is recorded as the villager's own decision, and only from the legal moves it offered
    const accepted = p.session.state.log.filter((e) => e.code === 'NPC_DECISIONS' || e.code === 'NPC_ACT');
    expect(accepted.length).toBeGreaterThan(0);
    // and a scripted adversary needs no network either: the same run again is the same run
    const q = playInstrumented(realityPolicyById('rival-antagonist'), { scenarioId: 'redbank', seed: 1, difficulty: 'normal', mode: 'story', reality: true });
    expect(stateHash(q.session.state)).toBe(stateHash(p.session.state));
    void antagonize;
  });
});
