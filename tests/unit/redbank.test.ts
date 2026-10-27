import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameSession, replayRun, resolveDay } from '../../src/engine/index.ts';
import type { Action, RunState } from '../../src/engine/index.ts';
import { cloneState } from '../../src/engine/core/clone.ts';
import { aliveCount, homesStanding } from '../../src/engine/world/economy.ts';
import { computePressure } from '../../src/engine/laws/resolver.ts';

interface Trace { seed: number; result: string; alive: number; homes: number; food: number; stateHash: string; eventHash: string; actions: Action[]; lawsActivated: string[] }
const fx = JSON.parse(readFileSync(new URL('../fixtures/redbank-traces.json', import.meta.url), 'utf8')) as { canonicalSeed: number; fireWall: Trace; witnessBridge: Trace; noop: Trace };

describe('Flood at Redbank: verified traces replay exactly', () => {
  for (const key of ['fireWall', 'witnessBridge', 'noop'] as const) {
    it(`${key} reproduces its recorded outcome and hashes`, () => {
      const t = fx[key];
      const r = replayRun({ scenarioId: 'redbank', seed: t.seed, actions: t.actions });
      expect(r.rejected).toEqual([]);
      expect(r.state.outcome?.result).toBe(t.result);
      expect(aliveCount(r.state)).toBe(t.alive);
      expect(homesStanding(r.state)).toBe(t.homes);
      expect(r.state.world.stocks.food).toBe(t.food);
      expect(r.stateHash).toBe(t.stateHash);
      expect(r.eventHash).toBe(t.eventHash);
    });
  }
  it('two mechanically distinct strategies both win the canonical seed; doing nothing loses', () => {
    expect(fx.fireWall.result).toBe('victory');
    expect(fx.witnessBridge.result).toBe('victory');
    expect(fx.noop.result).toBe('defeat');
    expect(fx.fireWall.lawsActivated).toContain('river_fears_fire');
    expect(fx.fireWall.lawsActivated).not.toContain('bridge_stands_watched');
    expect(fx.witnessBridge.lawsActivated).toContain('bridge_stands_watched');
    expect(fx.witnessBridge.lawsActivated).not.toContain('river_fears_fire');
    // different mechanisms leave different physical worlds
    const a = replayRun({ scenarioId: 'redbank', seed: fx.canonicalSeed, actions: fx.fireWall.actions }).state;
    const b = replayRun({ scenarioId: 'redbank', seed: fx.canonicalSeed, actions: fx.witnessBridge.actions }).state;
    expect(homesStanding(a)).toBeGreaterThan(homesStanding(b));
    const bridge = (s: RunState) => s.world.landmarks.find((l) => l.kind === 'bridge')!.hp;
    expect(bridge(b)).toBeGreaterThan(bridge(a));
  });
  it('the fire wall saved homes and lives through the law, with provenance in the log', () => {
    const s = replayRun({ scenarioId: 'redbank', seed: fx.canonicalSeed, actions: fx.fireWall.actions }).state;
    expect(s.stats.homesSpared).toBeGreaterThan(0);
    const spared = s.log.find((e) => e.code === 'HOME_SPARED');
    expect(spared?.law).toBe('river_fears_fire@east');
    expect(spared?.text).toMatch(/River fears fire/);
  });
  it('the witnessed bridge held and east-bank people walked out across it', () => {
    const s = replayRun({ scenarioId: 'redbank', seed: fx.canonicalSeed, actions: fx.witnessBridge.actions }).state;
    expect(s.log.some((e) => e.code === 'BRIDGE_HELD')).toBe(true);
    expect(s.log.some((e) => e.code === 'EVACUATION')).toBe(true);
    expect(s.log.some((e) => e.code === 'BRIDGE_COLLAPSED')).toBe(false);
  });
});

function stateAtDay(actions: Action[], day: number): GameSession {
  const g = GameSession.create({ scenarioId: 'redbank', seed: fx.canonicalSeed });
  for (const a of actions) {
    if (g.state.day === day) break;
    g.act(a);
  }
  return g;
}

describe('belief -> law -> world is causal', () => {
  it('with identical beacons and flood, only belief decides whether water is redirected', () => {
    const g = stateAtDay(fx.fireWall.actions, 7);
    const base = g.snapshot();
    // identical physical set-up: beacons are lit by the fire-wall strategy
    expect(base.world.landmarks.filter((l) => l.kind === 'beacon' && l.lit).length).toBeGreaterThanOrEqual(2);
    const believing = resolveDay(cloneState(base)).state;
    const doubting = cloneState(base);
    for (const v of doubting.villagers) delete v.beliefs['river_fears_fire'];
    for (const l of doubting.laws) {
      l.status = 'dormant';
      l.progress = 0;
      l.strength = 0;
    }
    const doubted = resolveDay(doubting).state;
    const wet = (s: RunState) => s.world.water.reduce((a, d) => a + (d > 0 ? 1 : 0), 0);
    const east = (s: RunState) => s.world.landmarks.filter((l) => l.kind === 'home' && l.district === 'east' && l.hp > 0).length;
    expect(wet(believing)).toBeLessThan(wet(doubted));
    expect(east(believing)).toBeGreaterThan(east(doubted));
    expect(aliveCount(believing)).toBeGreaterThanOrEqual(aliveCount(doubted));
  });
  it('a law without a lit beacon does not drain the river', () => {
    const g = stateAtDay(fx.fireWall.actions, 7);
    const s = g.snapshot();
    for (const l of s.world.landmarks) if (l.kind === 'beacon') {
      l.lit = false;
      l.fuelNights = 0;
    }
    const noBeacons = resolveDay(s).state;
    const withBeacons = resolveDay(g.snapshot()).state;
    const wet = (x: RunState) => x.world.water.reduce((a, d) => a + (d > 0 ? 1 : 0), 0);
    expect(wet(noBeacons)).toBeGreaterThan(wet(withBeacons));
  });
});

describe('laws: hysteresis, contradiction, collapse', () => {
  function withBelief(conv: number, claim = 'river_fears_fire'): RunState {
    const s = GameSession.create({ scenarioId: 'redbank', seed: 5 }).snapshot();
    s.starter = claim;
    for (const c of s.claims) if (c.id === claim) c.available = true;
    for (const v of s.villagers) if (v.district === 'east') v.beliefs[claim] = { conv, heard: 3, lastDay: 1, lastSource: null, evidence: 30, cause: null, stale: 0 };
    return s;
  }
  it('activates only above the threshold with enough firm believers', () => {
    const low = resolveDay(withBelief(30)).state;
    expect(low.laws.find((l) => l.id === 'river_fears_fire@east')!.status).toBe('dormant');
    let s = withBelief(75);
    for (let i = 0; i < 3 && s.phase === 'planning'; i++) s = resolveDay(s).state;
    expect(s.laws.find((l) => l.id === 'river_fears_fire@east')!.status).toBe('active');
  });
  it('stays active inside the hysteresis band and collapses only after support drains', () => {
    let s = withBelief(75);
    s.maxDay = 30;
    for (let i = 0; i < 3; i++) s = resolveDay(s).state;
    const law = () => s.laws.find((l) => l.id === 'river_fears_fire@east')!;
    expect(law().status).toBe('active');
    // pressure between off (0.45) and on (0.60): holds
    for (const v of s.villagers) if (v.district === 'east') {
      v.beliefs['river_fears_fire'].conv = 52;
      v.beliefs['river_fears_fire'].evidence = 80;
      v.beliefs['river_fears_fire'].stale = 0;
    }
    const info = computePressure(s, 'river_fears_fire', 'east');
    expect(info.pressure).toBeGreaterThan(0.45);
    expect(info.pressure).toBeLessThan(0.6);
    s = resolveDay(s).state;
    expect(law().status).toBe('active');
    // now drain support
    for (const v of s.villagers) if (v.district === 'east') {
      v.beliefs['river_fears_fire'].conv = 5;
      v.beliefs['river_fears_fire'].evidence = 0;
    }
    let collapsed = false;
    for (let i = 0; i < 5 && s.phase === 'planning'; i++) {
      s = resolveDay(s).state;
      if (law().status === 'dormant') collapsed = true;
    }
    expect(collapsed).toBe(true);
    expect(s.stats.lawsCollapsed).toBeGreaterThanOrEqual(1);
  });
  it('competing laws can never both be live in one region', () => {
    let s = withBelief(80);
    for (const v of s.villagers) if (v.district === 'east') v.beliefs['river_courts_fire'] = { conv: 85, heard: 3, lastDay: 1, lastSource: null, evidence: 40, cause: null, stale: 0 };
    s.claims.find((c) => c.id === 'river_courts_fire')!.available = true;
    for (let i = 0; i < 4 && s.phase === 'planning'; i++) {
      s = resolveDay(s).state;
      const live = s.laws.filter((l) => l.regionId === 'east' && (l.claimId === 'river_fears_fire' || l.claimId === 'river_courts_fire') && (l.status === 'active' || l.status === 'wavering'));
      expect(live.length).toBeLessThanOrEqual(1);
    }
  });
  it('a law cannot be created by one loud believer', () => {
    const s = withBelief(0);
    s.villagers.find((v) => v.id === 'ivo')!.beliefs['river_fears_fire'].conv = 100;
    for (const id of ['bram', 'dunn']) s.villagers.find((v) => v.id === id)!.beliefs['river_fears_fire'].conv = 60;
    let t = s;
    for (let i = 0; i < 4 && t.phase === 'planning'; i++) t = resolveDay(t).state;
    expect(t.laws.find((l) => l.id === 'river_fears_fire@east')!.status).not.toBe('active');
  });
});

describe('social network behaviour', () => {
  const C = 'river_fears_fire';
  function seeded(id: string, seed: number): RunState {
    const g = GameSession.create({ scenarioId: 'redbank', seed });
    g.act({ type: 'PICK_STARTER', claim: C });
    const v = g.state.villagers.find((x) => x.id === id)!;
    v.beliefs[C] = { conv: 80, heard: 2, lastDay: 1, lastSource: null, evidence: 40, cause: null, stale: 0 };
    return g.snapshot();
  }
  function spread(id: string, seed: number): number {
    let s = seeded(id, seed);
    for (let i = 0; i < 3; i++) s = resolveDay(s).state;
    return s.villagers.filter((v) => v.id !== id).reduce((a, v) => a + Math.max(0, v.beliefs[C]?.conv ?? 0), 0);
  }
  it('a well-connected, trusted hub spreads a story further than an isolated hermit', () => {
    let hub = 0;
    let hermit = 0;
    for (let seed = 1; seed <= 30; seed++) {
      hub += spread('mara', seed);
      hermit += spread('wren', seed);
    }
    expect(hub).toBeGreaterThan(hermit * 1.5);
  });
  it('gossip never crosses a cut: after the bridge falls, west villagers hear nothing from the east', () => {
    let s = seeded('ivo', 3);
    for (const v of s.villagers) if (v.district === 'east') v.beliefs[C] = { conv: 70, heard: 2, lastDay: 1, lastSource: null, evidence: 40, cause: null, stale: 0 };
    s.world.landmarks.find((l) => l.kind === 'bridge')!.hp = 0;
    for (let i = 0; i < 3 && s.phase === 'planning'; i++) s = resolveDay(s).state;
    for (const v of s.villagers.filter((x) => x.district === 'west')) expect(v.beliefs[C]?.conv ?? 0).toBeLessThanOrEqual(0.5);
    expect(s.flags.cutContactsToday).toBeGreaterThan(0);
    const g = new GameSession(s);
    const r = g.act({ type: 'SEED', claim: C, target: 'ivo' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['NO_PATH', 'ALREADY_SPOKE', 'ALREADY_CONVINCED']).toContain(r.error.code);
  });
  it('the Keeper cannot walk to the east bank once the bridge is gone', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 2 });
    g.act({ type: 'PICK_STARTER', claim: C });
    g.state.world.landmarks.find((l) => l.kind === 'bridge')!.hp = 0;
    const r = g.act({ type: 'SEED', claim: C, target: 'bram' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NO_PATH');
    expect(g.act({ type: 'SEED', claim: C, target: 'cass' }).ok).toBe(true);
  });
  it('repeating the same rumour saturates instead of guaranteeing conversion', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 4 });
    g.act({ type: 'PICK_STARTER', claim: C });
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      g.act({ type: 'SEED', claim: C, target: 'osric' });
      seen.push(g.state.villagers.find((v) => v.id === 'osric')!.beliefs[C]?.conv ?? 0);
      g.endDay();
    }
    expect(Math.max(...seen)).toBeLessThan(40);
    const gains = seen.map((v, i) => v - (seen[i - 1] ?? 0));
    expect(gains[3]).toBeLessThanOrEqual(gains[0] + 0.01);
  });
  it('failed demonstrations hurt and can reverse a strong conviction', () => {
    let s = seeded('ivo', 6);
    s.day = 2; // rising river: bad omen for beacons
    const g = new GameSession(s);
    for (const v of s.villagers) if (v.district === 'east') {
      g.state.villagers.find((x) => x.id === v.id)!.beliefs[C] = { conv: 70, heard: 3, lastDay: 1, lastSource: null, evidence: 0, cause: null, stale: 0 };
    }
    g.state.ap = 5;
    const before = g.state.villagers.find((v) => v.id === 'ivo')!.beliefs[C].conv;
    const r = g.act({ type: 'RITUAL', ritual: 'light_beacon', landmark: 'b_e', claim: C });
    expect(r.ok).toBe(true);
    const after = g.state.villagers.find((v) => v.id === 'ivo')!.beliefs[C].conv;
    expect(after).toBeLessThan(before);
    expect(g.state.log.some((e) => e.code === 'EVIDENCE_BACKFIRED')).toBe(true);
    s = g.snapshot();
    expect(s.stats.failedEvidence).toBe(1);
  });
  it('a distrusted speaker backfires (negative trust is a reverse signal, not support)', () => {
    let s = seeded('ivo', 9);
    s.villagers.find((v) => v.id === 'harl')!.beliefs[C] = { conv: 0, heard: 0, lastDay: -1, lastSource: null, evidence: 0, cause: null, stale: 0 };
    let worst = 0;
    for (let seed = 1; seed <= 15; seed++) {
      s = seeded('ivo', seed);
      s.villagers.find((v) => v.id === 'ivo')!.beliefs[C].conv = 90;
      const out = resolveDay(s).state;
      worst = Math.min(worst, out.villagers.find((v) => v.id === 'harl')!.beliefs[C]?.conv ?? 0);
    }
    expect(worst).toBeLessThan(0);
  });
});

describe('no-action baseline', () => {
  it('loses across many seeds', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = GameSession.create({ scenarioId: 'redbank', seed });
      while (!g.state.outcome) g.endDay();
      expect(g.state.outcome.result).toBe('defeat');
    }
  });
  it('never softlocks: a player with no legal action can always end the day', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 8 });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    g.state.ap = 0;
    expect(g.options().filter((o) => o.cost > 0)).toHaveLength(0);
    expect(() => g.endDay()).not.toThrow();
  });
});
