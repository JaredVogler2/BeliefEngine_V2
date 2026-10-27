import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/engine/index.ts';
import type { RunState } from '../../src/engine/index.ts';

/**
 * Found while building the belief composer (phase 17): two costs that authored cards advertise were never executed. A law's card
 * has to match what the code does, so these tests fail on the code as it was.
 */
function believeEveryone(s: RunState, claim: string, regionId: string): void {
  for (const v of s.villagers) v.beliefs[claim] = { conv: 90, heard: 5, lastDay: s.day, lastSource: 'keeper', evidence: 20, cause: null, stale: 0 };
  const law = s.laws.find((l) => l.claimId === claim && l.regionId === regionId)!;
  law.status = 'active';
  law.progress = 100;
  law.pressure = 1;
  law.strength = 1;
}

describe('costs that cards promise are paid', () => {
  it('Harvest: ringing the bells under an active "Rain answers the bells" law buries the Hillside Road for two days', () => {
    const g = GameSession.create({ scenarioId: 'harvest', seed: 3 });
    g.act({ type: 'PICK_STARTER', claim: 'rain_follows_bells' });
    believeEveryone(g.state, 'rain_follows_bells', 'valley');
    const bell = g.state.world.landmarks.find((l) => l.kind === 'belltower')!;
    expect(g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: bell.id }).ok).toBe(true);
    const day = g.state.day;
    const res = g.endDay();
    expect(res.events.some((e) => e.code === 'MUDSLIDE')).toBe(true);
    expect(g.state.world.landmarks.find((l) => l.kind === 'road')!.data.blockedUntil).toBe(day + 2);
  });

  it('Harvest: without the law, ringing the bells buries nothing', () => {
    const g = GameSession.create({ scenarioId: 'harvest', seed: 3 });
    g.act({ type: 'PICK_STARTER', claim: 'rain_follows_bells' });
    const bell = g.state.world.landmarks.find((l) => l.kind === 'belltower')!;
    g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: bell.id });
    const res = g.endDay();
    expect(res.events.some((e) => e.code === 'MUDSLIDE')).toBe(false);
  });

  it('Ashwood: an active "Illness fears open doors" law makes the weak lose health to the cold, and a village without it does not', () => {
    const run = (law: boolean) => {
      const g = GameSession.create({ scenarioId: 'ashwood', seed: 4 });
      g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
      g.state.claims.find((c) => c.id === 'illness_fears_open_doors')!.available = true;
      if (law) for (const r of ['north', 'mill', 'ash']) believeEveryone(g.state, 'illness_fears_open_doors', r);
      const weak = g.state.villagers.filter((v) => v.archetype === 'child' || v.archetype === 'elder');
      const before = weak.map((v) => v.health);
      const res = g.endDay();
      const after = g.state.villagers.filter((v) => v.archetype === 'child' || v.archetype === 'elder').map((v) => v.health);
      return { lost: before.reduce((a, h, i) => a + Math.max(0, h - after[i]), 0), events: res.events, n: weak.length };
    };
    const without = run(false);
    const withLaw = run(true);
    expect(withLaw.n).toBeGreaterThan(0);
    expect(withLaw.lost).toBeGreaterThan(without.lost);
  });
});
