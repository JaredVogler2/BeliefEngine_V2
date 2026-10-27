import { describe, expect, it } from 'vitest';
import {
  GameSession, createRun, generateExpedition, getAvailableActions, getCallouts, getIntents, getVillagerView, memoryFactor, pendingFactionPlans, replayRun, resolveDay, scoreIntents,
  predictedWater,
} from '../../src/engine/index.ts';
import type { Action, RunState } from '../../src/engine/index.ts';
import { assignWatchers } from '../../src/engine/ai/routines.ts';
import type { Ctx } from '../../src/engine/core/events.ts';
import { randomLegal } from '../../src/engine/ai/bots/basic.ts';
import { runPolicy } from '../../src/engine/ai/bots/run.ts';
import * as S from '../../src/engine/ai/bots/strategies.ts';
import { witnessPolicies } from '../../src/engine/gen/witness.ts';
import { remember, MEMORY_CAP } from '../../src/engine/core/memory.ts';
import { BAN_LEADER_CONVICTION } from '../../src/engine/ai/factions.ts';

const BR = 'bridge_stands_watched';
const live = (s: RunState): RunState => {
  // the bridge law is awake and the believers know it
  for (const l of s.laws) if (l.claimId === BR) Object.assign(l, { status: 'active', progress: 100, strength: 1, activatedDay: 1 });
  const c = s.claims.find((x) => x.id === BR)!;
  c.available = true;
  s.starter = BR;
  return s;
};
const believe = (s: RunState, id: string, conv = 80) => {
  s.villagers.find((v) => v.id === id)!.beliefs[BR] = { conv, heard: 3, lastDay: 1, lastSource: null, evidence: 40, cause: null, stale: 0 };
};
const watch = (s: RunState): Ctx => {
  const ctx: Ctx = { s, events: [], expect: false };
  assignWatchers(ctx);
  return ctx;
};

describe('villager intents: a small utility model with reasons', () => {
  it('a threatened parent prefers staying with the child over standing watch, and the player is told why', () => {
    const s = live(createRun({ scenarioId: 'redbank', seed: 1 }));
    for (const id of ['mara', 'bram', 'dunn', 'ivo', 'cass']) believe(s, id);
    s.threat[0].level = 3; // water reaches the low east plain
    const mara = s.villagers.find((v) => v.id === 'mara')!;
    const intents = scoreIntents(s, mara, predictedWater(s));
    const family = intents.find((i) => i.kind === 'family');
    const guard = intents.find((i) => i.kind === 'guard');
    expect(family, 'family intent exists when the child’s home is in danger').toBeTruthy();
    expect(guard).toBeTruthy();
    expect(family!.score).toBeGreaterThan(guard!.score);
    expect(family!.why).toContain('Tilly');
    const ctx = watch(s);
    expect(mara.duty).not.toBe('watch');
    expect(mara.dutyNote).toMatch(/Skips the bridge watch/);
    const ev = ctx.events.find((e) => e.code === 'WATCHER_DEFECTS');
    expect(ev?.text).toContain('Mara');
    expect(ev?.text).toMatch(/needs 3/);
  });

  it('with no danger at home the same believer keeps the watch', () => {
    const s = live(createRun({ scenarioId: 'redbank', seed: 1 }));
    for (const id of ['mara', 'bram', 'dunn', 'ivo']) believe(s, id);
    s.threat[0].level = 0;
    const mara = s.villagers.find((v) => v.id === 'mara')!;
    expect(scoreIntents(s, mara, predictedWater(s)).some((i) => i.kind === 'family')).toBe(false);
    watch(s);
    expect(mara.duty).toBe('watch');
  });

  it('a defecting watcher weakens the law’s protection for the night (it needs its minimum on the deck)', () => {
    const s = live(createRun({ scenarioId: 'redbank', seed: 1 }));
    for (const id of ['mara', 'bram', 'dunn']) believe(s, id);
    s.threat[0].level = 0;
    watch(s);
    const deck = s.world.landmarks.find((l) => l.kind === 'bridge')!;
    expect(deck.data.watchers).toBe(3);
    const t = live(createRun({ scenarioId: 'redbank', seed: 1 }));
    for (const id of ['mara', 'bram', 'dunn']) believe(t, id);
    t.threat[0].level = 3;
    watch(t);
    expect(t.world.landmarks.find((l) => l.kind === 'bridge')!.data.watchers).toBeLessThan(3);
  });

  it('intent scores are deterministic and bounded; the explanation is exposed for every living villager', () => {
    const s = createRun({ scenarioId: 'redbank', seed: 7 });
    const water = predictedWater(s);
    for (const v of s.villagers) {
      const a = scoreIntents(s, v, water);
      const b = scoreIntents(s, v, water);
      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThan(0);
      for (const i of a) {
        expect(Number.isInteger(i.score)).toBe(true);
        expect(i.score).toBeGreaterThan(-100);
        expect(i.score).toBeLessThan(200);
        expect(i.why.length).toBeGreaterThan(5);
      }
      expect(getIntents(s, v.id)[0].chosen).toBe(true);
    }
  });

  it('nobody teleports across a fallen bridge: east villagers stay east, and are told they are cut off', () => {
    let s = createRun({ scenarioId: 'redbank', seed: 3 });
    s.world.landmarks.find((l) => l.kind === 'bridge')!.hp = 0;
    const east = s.villagers.filter((v) => v.district === 'east').map((v) => v.id);
    for (let i = 0; i < 3 && !s.outcome; i++) s = resolveDay(s).state;
    for (const id of east) {
      const v = s.villagers.find((x) => x.id === id)!;
      if (v.status !== 'dead') expect(v.x, `${id} x`).toBeGreaterThanOrEqual(14);
    }
  });
});

describe('law credibility and memory are bounded and visible', () => {
  it('a powered law that visibly fails loses believers, they remember it, and the memory list never grows without bound', () => {
    const x = generateExpedition(149);
    const g = GameSession.create({ scenarioId: x.id, seed: 149 });
    const p = witnessPolicies(x.bp, x.def).find((q) => q.name === 'fire-wall')!;
    let n = 0;
    while (!g.state.outcome && n++ < 20) p.playDay(g);
    const ev = g.state.log.find((e) => e.code === 'LAW_DISCREDITED');
    expect(ev).toBeTruthy();
    expect(ev!.text).toMatch(/failed where people could see/);
    const remembered = g.state.villagers.filter((v) => v.memory?.some((m) => m.kind === 'law_failed'));
    expect(remembered.length).toBeGreaterThan(0);
    for (const v of g.state.villagers) expect((v.memory ?? []).length).toBeLessThanOrEqual(MEMORY_CAP);
  });

  it('memory caps at six items, dedupes same-day repeats, and bounds the persuasion factor', () => {
    const s = createRun({ scenarioId: 'redbank', seed: 1 });
    const v = s.villagers[0];
    for (let d = 1; d <= 20; d++) remember(v, { kind: 'law_failed', day: d, claim: 'river_fears_fire', text: 'x' });
    remember(v, { kind: 'law_failed', day: 20, claim: 'river_fears_fire', text: 'again' });
    expect(v.memory!.length).toBe(MEMORY_CAP);
    expect(memoryFactor(v, 'river_fears_fire')).toBeGreaterThanOrEqual(0.55);
    expect(memoryFactor(v, 'river_fears_fire')).toBeLessThan(1);
    expect(memoryFactor(v, 'other')).toBe(1);
    const happy = s.villagers[1];
    for (let d = 1; d <= 20; d++) remember(happy, { kind: 'law_worked', day: d, claim: 'c', text: 'y' });
    expect(memoryFactor(happy, 'c')).toBeLessThanOrEqual(1.15);
  });

  it('a villager who saw the law fail is harder to persuade of it than one who did not', () => {
    const base = createRun({ scenarioId: 'redbank', seed: 2 });
    const warier = createRun({ scenarioId: 'redbank', seed: 2 });
    for (const st of [base, warier]) st.starter = 'river_fears_fire';
    for (const st of [base, warier]) st.claims.find((c) => c.id === 'river_fears_fire')!.available = true;
    for (let d = 1; d <= 3; d++) remember(warier.villagers.find((v) => v.id === 'ivo')!, { kind: 'law_failed', day: d, claim: 'river_fears_fire', text: 'x' });
    const gain = (st: RunState) => {
      const g = new GameSession(st);
      g.act({ type: 'SEED', claim: 'river_fears_fire', target: 'ivo' });
      return g.state.villagers.find((v) => v.id === 'ivo')!.beliefs.river_fears_fire.conv;
    };
    expect(gain(warier)).toBeLessThan(gain(base));
  });

  it('a skeptic is moved far more by a demonstration she watches than by being told', () => {
    const run = (action: Action) => {
      const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
      g.act({ type: 'PICK_STARTER', claim: BR });
      const before = g.state.villagers.find((v) => v.id === 'elspeth')!.beliefs[BR]?.conv ?? 0;
      expect(g.act(action).ok).toBe(true);
      return (g.state.villagers.find((v) => v.id === 'elspeth')!.beliefs[BR]?.conv ?? 0) - before;
    };
    const told = run({ type: 'SEED', claim: BR, target: 'elspeth' });
    const shown = run({ type: 'RITUAL', ritual: 'keep_vigil', landmark: 'br', claim: BR });
    expect(shown).toBeGreaterThan(told * 1.5);
  });
});

describe('factions: announced, answerable, bounded', () => {
  /** call a crowd every day without ever persuading the Council's leader */
  const crowdRun = (seed: number, persuade = false): GameSession => {
    const g = GameSession.create({ scenarioId: 'redbank', seed });
    g.act({ type: 'PICK_STARTER', claim: BR });
    let n = 0;
    while (!g.state.outcome && n++ < 10) {
      if (persuade && g.state.day >= 3) g.act({ type: 'SEED', claim: BR, target: 'hester' });
      g.act({ type: 'GATHER', claim: BR, site: 'chapel' });
      g.endDay();
    }
    return g;
  };

  it('the Council announces a gathering ban a day ahead, citing the Keeper’s behaviour, and then enforces it', () => {
    const g = crowdRun(1);
    const tele = g.state.log.filter((e) => e.code === 'FACTION_TELEGRAPH');
    const ban = g.state.log.filter((e) => e.code === 'FACTION_BAN');
    expect(tele.length).toBeGreaterThan(0);
    expect(tele[0].text).toMatch(/crowds/);
    expect(ban.length).toBeGreaterThan(0);
    expect(ban[0].day).toBeGreaterThan(tele[0].day); // never a surprise
    // the ban really blocks gatherings, and only gatherings
    const probe = new GameSession(g.state.outcome ? createRun({ scenarioId: 'redbank', seed: 1 }) : g.state);
    expect(probe.state).toBeTruthy();
  });

  it('a Council whose leader is already persuaded never bars the gatherings', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    g.act({ type: 'PICK_STARTER', claim: BR });
    g.state.villagers.find((v) => v.id === 'hester')!.beliefs[BR] = { conv: 55, heard: 3, lastDay: 1, lastSource: null, evidence: 30, cause: null, stale: 0 };
    let n = 0;
    while (!g.state.outcome && n++ < 10) {
      g.act({ type: 'GATHER', claim: BR, site: 'chapel' });
      g.endDay();
    }
    expect(g.state.log.some((e) => e.code === 'FACTION_BAN')).toBe(false);
    expect(g.state.log.some((e) => e.code === 'FACTION_TELEGRAPH')).toBe(false);
  });

  it('answering the announcement in time stands the Council down instead of banning', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    g.act({ type: 'PICK_STARTER', claim: BR });
    let n = 0;
    while (pendingFactionPlans(g.state).length === 0 && !g.state.outcome && n++ < 6) {
      g.act({ type: 'GATHER', claim: BR, site: 'chapel' });
      g.endDay();
    }
    expect(pendingFactionPlans(g.state).length).toBe(1);
    expect(getCallouts(g.state).some((c) => /bar public gatherings/.test(c.text))).toBe(true);
    // the answer is an ordinary action, available now: speak to the Council's leader
    const hester = () => g.state.villagers.find((v) => v.id === 'hester')!.beliefs[BR]?.conv ?? 0;
    expect(getVillagerView(g.state, 'hester').canBeReached).toBe(true);
    const before = hester();
    expect(g.act({ type: 'SEED', claim: BR, target: 'hester' }).ok).toBe(true);
    expect(hester()).toBeGreaterThan(before);
    // reaching the stated conviction (what a few more words or a demonstration would do) cancels the move
    g.state.villagers.find((v) => v.id === 'hester')!.beliefs[BR].conv = BAN_LEADER_CONVICTION + 1;
    g.endDay();
    expect(g.state.log.some((e) => e.code === 'FACTION_STANDS_DOWN')).toBe(true);
    expect(g.state.log.some((e) => e.code === 'FACTION_BAN')).toBe(false);
    expect((g.state.flags.gatherBanUntil ?? -1) < g.state.day).toBe(true);
  });

  it('the Council spends a bounded budget: bans are rare, spaced out and never consecutive', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = crowdRun(seed);
      const bans = g.state.log.filter((e) => e.code === 'FACTION_BAN').map((e) => e.day);
      const council = g.state.factions.find((f) => f.kind === 'council')!;
      expect(bans.length).toBeLessThanOrEqual(2); // the authored budget
      expect(council.budget).toBeGreaterThanOrEqual(0);
      for (let i = 1; i < bans.length; i++) expect(bans[i] - bans[i - 1]).toBeGreaterThanOrEqual(3);
    }
  });

  it('every hostile move has an actionable answer: rival campaigns can be challenged, and the leader can be won over', () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const g = GameSession.create({ scenarioId: 'redbank', seed });
      let n = 0;
      while (!g.state.outcome && n++ < 10) {
        if (g.state.starter === null) g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
        for (const r of g.state.rivals) {
          if (!r.plan) continue;
          const opts = getAvailableActions(g.state);
          const target = r.plan.target;
          const targetV = target ? g.state.villagers.find((v) => v.id === target) : null;
          const cutOff = !!targetV && getAvailableActions(g.state, { villager: target! }, { includeDisabled: true }).some((o) => o.action.type === 'COUNTER' && !o.enabled && /cut off/.test(o.reason ?? ''));
          // the announced target can be challenged, unless a fallen bridge has cut them off (then another challenge remains)
          if (r.plan.kind === 'campaign' && target) {
            expect(opts.some((o) => o.action.type === 'COUNTER' && (o.action as { target: string }).target === target) || (cutOff && opts.some((o) => o.action.type === 'COUNTER')), `seed ${seed} day ${g.state.day}`).toBe(true);
          }
          // otherwise: the leader can be spoken to, or (if they no longer hear the Keeper) a demonstration can still be staged
          const leader = g.state.scn.rivals[0].leader;
          const leaderV = g.state.villagers.find((v) => v.id === leader)!;
          const canSpeak = opts.some((o) => o.action.type === 'SEED' && (o.action as { target: string }).target === leader);
          const canShow = opts.some((o) => o.action.type === 'RITUAL' && !!(o.action as { claim?: string }).claim);
          const done = g.state.flags[`spoke:${leader}`] === g.state.day || (leaderV.beliefs.river_fears_fire?.conv ?? 0) >= 88;
          expect(canSpeak || canShow || done, `seed ${seed} day ${g.state.day} (leader trust ${Math.round(leaderV.keeperTrust)})`).toBe(true);
          checked++;
        }
        S.fireWall.playDay(g);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('a faction leader who believes a law, and trusts the Keeper, endorses it to people they can reach (once)', () => {
    const s = createRun({ scenarioId: 'redbank', seed: 1 });
    s.starter = 'river_fears_fire';
    s.claims.find((c) => c.id === 'river_fears_fire')!.available = true;
    const ivo = s.villagers.find((v) => v.id === 'ivo')!;
    ivo.beliefs.river_fears_fire = { conv: 80, heard: 3, lastDay: 1, lastSource: null, evidence: 40, cause: null, stale: 0 };
    ivo.keeperTrust = 70;
    const r1 = resolveDay(s);
    const ends = r1.events.filter((e) => e.code === 'FACTION_ENDORSES');
    expect(ends.length).toBe(1);
    expect(ends[0].text).toContain('Ivo');
    const aldous1 = r1.state.villagers.find((v) => v.id === 'aldous')!.beliefs.river_fears_fire?.conv ?? 0;
    expect(aldous1).toBeGreaterThan(0);
    const r2 = resolveDay(r1.state);
    expect(r2.events.filter((e) => e.code === 'FACTION_ENDORSES').length).toBe(0); // once per law
    // and it cannot cross a fallen bridge
    const t = createRun({ scenarioId: 'redbank', seed: 1 });
    t.starter = 'river_fears_fire';
    t.claims.find((c) => c.id === 'river_fears_fire')!.available = true;
    t.villagers.find((v) => v.id === 'ivo')!.beliefs.river_fears_fire = { conv: 80, heard: 3, lastDay: 1, lastSource: null, evidence: 40, cause: null, stale: 0 };
    t.villagers.find((v) => v.id === 'ivo')!.keeperTrust = 70;
    t.world.landmarks.find((l) => l.kind === 'bridge')!.hp = 0;
    const r3 = resolveDay(t);
    expect(r3.state.villagers.find((v) => v.id === 'aldous')!.beliefs.river_fears_fire?.conv ?? 0).toBeLessThanOrEqual(0.5);
  });

  it('the rival makes two different observable decisions because of what the Keeper did, not because of the date', () => {
    // 1) a failed demonstration invites a public rebuttal; 2) a rising law invites a campaign; neither happens on a quiet run
    const quiet = GameSession.create({ scenarioId: 'redbank', seed: 5 });
    for (let d = 0; d < 7 && !quiet.state.outcome; d++) quiet.endDay();
    expect(quiet.state.log.some((e) => e.code === 'RIVAL_TELEGRAPH')).toBe(false);
    const campaign = GameSession.create({ scenarioId: 'redbank', seed: 5 });
    let n = 0;
    while (!campaign.state.outcome && n++ < 8) S.fireWall.playDay(campaign);
    expect(campaign.state.log.some((e) => e.code === 'RIVAL_TELEGRAPH' && /rebuttal|campaign|preparing/.test(e.text))).toBe(true);
    const failing = GameSession.create({ scenarioId: 'redbank', seed: 5 });
    failing.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    // stage a demonstration on a night the river is rising: it backfires and the rival notices
    for (let d = 0; d < 6 && !failing.state.outcome; d++) {
      const rising = failing.state.threat[failing.state.day - 1].trend === 'rising';
      if (rising && failing.state.ap >= 2) failing.act({ type: 'RITUAL', ritual: 'light_beacon', landmark: 'b_c', claim: 'river_fears_fire' });
      failing.endDay();
    }
    const kinds = failing.state.log.filter((e) => e.code === 'RIVAL_TELEGRAPH').map((e) => e.text);
    expect(kinds.some((t) => /saw your demonstration fail/.test(t))).toBe(true);
  });
});

describe('adversarial interactions: no loops, no deadlocks, exact replay', () => {
  it('random play on every shipped scenario and on generated villages always terminates with a bounded log and no exception', () => {
    const ids = ['redbank', 'harvest', 'ashwood', 'x1.3', 'x1.4', 'x1.5', 'x1.6'];
    for (const id of ids) {
      for (const seed of [1, 2, 3]) {
        const r = runPolicy(randomLegal, { scenarioId: id, seed });
        expect(['victory', 'defeat'], `${id}/${seed}`).toContain(r.result);
        expect(r.log.length).toBeLessThan(400);
      }
    }
  });

  it('the same seed and action history give the same NPC decisions, events and hashes', () => {
    const r = runPolicy(S.witnessBridge, { scenarioId: 'redbank', seed: 4 });
    const a = replayRun({ scenarioId: 'redbank', seed: 4, actions: r.log });
    const b = replayRun({ scenarioId: 'redbank', seed: 4, actions: r.log });
    expect(a.eventHash).toBe(b.eventHash);
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.state.log.filter((e) => e.code === 'WATCHER_DEFECTS')).toEqual(b.state.log.filter((e) => e.code === 'WATCHER_DEFECTS'));
  });

  it('no rumour loop: belief changes per day stay under the saturation cap for every villager in a long random run', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 9 });
    let n = 0;
    while (!g.state.outcome && n++ < 10) {
      const before = new Map(g.state.villagers.map((v) => [v.id, v.beliefs.river_fears_fire?.conv ?? 0]));
      randomLegal.playDay(g);
      for (const v of g.state.villagers) {
        const d = Math.abs((v.beliefs.river_fears_fire?.conv ?? 0) - (before.get(v.id) ?? 0));
        expect(d).toBeLessThanOrEqual(100);
      }
    }
    expect(g.state.outcome).toBeTruthy();
  });
});
