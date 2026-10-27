import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameSession, buildDebrief, listScenarios, replayRun } from '../../src/engine/index.ts';
import type { Action } from '../../src/engine/index.ts';
import { randomLegal } from '../../src/engine/ai/bots/basic.ts';
import { runPolicy } from '../../src/engine/ai/bots/run.ts';

interface Trace { seed: number; policy?: string; result: string; alive: number; stateHash: string; eventHash: string; actions: Action[]; lawsActivated?: string[] }
const load = (id: string) => JSON.parse(readFileSync(new URL(`../fixtures/${id}-traces.json`, import.meta.url), 'utf8')) as Record<string, unknown> & { canonicalSeed: number; noop: Trace; failedAttempt?: Trace };

const KEYS: Record<string, [string, string]> = {
  redbank: ['fireWall', 'witnessBridge'],
  harvest: ['moonlight', 'caravans'],
  ashwood: ['smokeRing', 'decoy'],
};

describe('every shipped scenario has two verified winning strategies, a loss and an educational failure', () => {
  for (const [id, [a, b]] of Object.entries(KEYS)) {
    describe(id, () => {
      const fx = load(id);
      for (const key of [a, b, 'noop', 'failedAttempt']) {
        it(`${key} replays to its recorded outcome and hashes`, () => {
          const t = fx[key] as Trace;
          expect(t, `${id} fixture has ${key}`).toBeTruthy();
          const r = replayRun({ scenarioId: id, seed: t.seed, actions: t.actions });
          expect(r.rejected).toEqual([]);
          expect(r.state.outcome?.result).toBe(t.result);
          expect(r.stateHash).toBe(t.stateHash);
          expect(r.eventHash).toBe(t.eventHash);
        });
      }
      it('the two winning strategies are mechanically different (different laws or different physical outcome)', () => {
        const ta = fx[a] as Trace;
        const tb = fx[b] as Trace;
        expect(ta.result).toBe('victory');
        expect(tb.result).toBe('victory');
        const ra = replayRun({ scenarioId: id, seed: ta.seed, actions: ta.actions }).state;
        const rb = replayRun({ scenarioId: id, seed: tb.seed, actions: tb.actions }).state;
        const kinds = (acts: Action[]) => new Set(acts.map((x) => x.type + ('ritual' in x ? ':' + x.ritual : '') + ('deal' in x ? ':' + x.deal : '')));
        const same = JSON.stringify([...ra.stats.lawsActivated].sort()) === JSON.stringify([...rb.stats.lawsActivated].sort()) && JSON.stringify([...kinds(ta.actions)].sort()) === JSON.stringify([...kinds(tb.actions)].sort());
        expect(same).toBe(false);
      });
      it('doing nothing loses', () => {
        expect((fx.noop as Trace).result).toBe('defeat');
      });
      it('a losing run produces a causal debrief with a concrete next step', () => {
        const t = fx.failedAttempt as Trace;
        const g = new GameSession(replayRun({ scenarioId: id, seed: t.seed, actions: t.actions }).state);
        const d = buildDebrief(g.state);
        expect(d.result).toBe('defeat');
        expect(d.missed.length).toBeGreaterThan(0);
        expect(d.story.length).toBeGreaterThan(20);
        expect(d.tips.length).toBeGreaterThan(0);
      });
    });
  }
});

describe('scenario-wide invariants and no softlocks', () => {
  for (const sc of listScenarios()) {
    it(`${sc.id}: random-legal play never breaks invariants, always terminates`, () => {
      for (let seed = 1; seed <= 3; seed++) {
        const r = runPolicy(randomLegal, { scenarioId: sc.id, seed });
        expect(['victory', 'defeat']).toContain(r.result);
        const g = new GameSession(replayRun({ scenarioId: sc.id, seed, actions: r.log }).state);
        for (const v of g.state.villagers) {
          expect(Number.isFinite(v.health) && v.health >= 0 && v.health <= 100).toBe(true);
          expect(v.hunger >= 0 && v.hunger <= 100).toBe(true);
          for (const b of Object.values(v.beliefs)) expect(Math.abs(b.conv)).toBeLessThanOrEqual(100);
        }
        for (const l of g.state.world.landmarks) {
          expect(l.hp).toBeGreaterThanOrEqual(0);
          if (l.kind === 'pen') expect(l.data.stock).toBeGreaterThanOrEqual(0);
        }
        expect(g.state.world.stocks.food).toBeGreaterThanOrEqual(0);
        expect(g.state.world.stocks.fuel).toBeGreaterThanOrEqual(0);
      }
    }, 120_000);
    it(`${sc.id}: a player with no Influence can always end the day`, () => {
      const g = GameSession.create({ scenarioId: sc.id, seed: 2 });
      g.state.starter ??= g.state.scn.starters[0];
      g.state.ap = 0;
      expect(() => g.endDay()).not.toThrow();
    });
  }
});

describe('scenario mechanics', () => {
  it('Harvest: a merchant wants proof before a shipment, one shipment travels at a time, and a mudslide blocks the road', () => {
    const g = GameSession.create({ scenarioId: 'harvest', seed: 3 });
    g.act({ type: 'PICK_STARTER', claim: 'moonlight_ripens_grain' });
    const early = g.act({ type: 'TRADE', deal: 'caravan', target: 'dalia' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.code).toBe('WANTS_PROOF');
    g.state.villagers.find((v) => v.id === 'dalia')!.beliefs['moonlight_ripens_grain'] = { conv: 70, heard: 3, lastDay: 1, lastSource: null, evidence: 30, cause: null, stale: 0 };
    expect(g.act({ type: 'TRADE', deal: 'caravan', target: 'dalia' }).ok).toBe(true);
    const second = g.act({ type: 'TRADE', deal: 'caravan', target: 'dalia' });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('IN_TRANSIT');
    // bury the road: the caravan waits
    g.state.world.landmarks.find((l) => l.kind === 'road')!.data.blockedUntil = 6;
    const food0 = g.state.world.stocks.food;
    for (let i = 0; i < 3; i++) g.endDay();
    expect(g.state.flags['caravan:0']).toBeDefined();
    expect(g.state.world.stocks.food).toBeLessThan(food0);
    for (let i = 0; i < 4; i++) g.endDay();
    expect(g.state.flags['caravan:0']).toBeUndefined();
  });
  it('Harvest: crops need moisture, ripen under a moonlight law, and are harvested by workers', () => {
    const g = GameSession.create({ scenarioId: 'harvest', seed: 1 });
    const g0 = g.state.world.landmarks.find((l) => l.id === 'f_a')!.data.growth;
    g.endDay();
    const g1 = g.state.world.landmarks.find((l) => l.id === 'f_a')!.data.growth;
    expect(g1).toBeGreaterThanOrEqual(g0);
    expect(g1 - g0).toBeLessThan(6); // no law, dry soil: crawling
  });
  it('Ashwood: packs advance toward pens, smoke fire plus belief keeps them out, and unbelieved smoke does nothing', () => {
    const run = (believe: boolean) => {
      const g = GameSession.create({ scenarioId: 'ashwood', seed: 4 });
      const s = g.state;
      const f = s.world.landmarks.find((l) => l.id === 'c_m1')!;
      f.lit = true;
      f.fuelNights = 8;
      f.data.keep = 1;
      if (believe)
        for (const v of s.villagers) if (v.district === 'mill') v.beliefs['wolves_fear_smoke'] = { conv: 80, heard: 3, lastDay: 1, lastSource: null, evidence: 40, cause: null, stale: 0 };
      for (let i = 0; i < 5; i++) {
        s.world.landmarks.find((l) => l.id === 'c_m2')!.lit = true;
        s.world.landmarks.find((l) => l.id === 'c_m2')!.fuelNights = 3;
        f.lit = true;
        f.fuelNights = 3;
        g.endDay();
      }
      return g.state.world.landmarks.find((l) => l.id === 'pen_m')!.data.stock;
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });
  it('Ashwood: smoke sickens people and hamlets lose contact in dense smoke', () => {
    const g = GameSession.create({ scenarioId: 'ashwood', seed: 4 });
    const f = g.state.world.landmarks.find((l) => l.id === 'c_n1')!;
    f.lit = true;
    f.fuelNights = 3;
    g.state.villagers.find((v) => v.id === 'gorm')!.x = f.x;
    g.state.villagers.find((v) => v.id === 'gorm')!.y = f.y;
    const h0 = g.state.villagers.find((v) => v.id === 'gorm')!.health;
    g.endDay();
    expect(g.state.villagers.find((v) => v.id === 'gorm')!.health).toBeLessThan(h0 + 8);
  });
});
