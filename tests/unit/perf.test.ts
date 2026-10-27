import { describe, expect, it } from 'vitest';
import { GameSession, createRun, resolveDay, getAvailableActions, getForecast } from '../../src/engine/index.ts';
import type { RunState } from '../../src/engine/index.ts';
import { policyById } from '../../src/engine/ai/bots/generic.ts';
import { serializeRun, deserializeRun } from '../../src/engine/index.ts';

/**
 * Engine stress and budget checks. The brief asks for a day to resolve in under 250 ms for the default population on a modest desktop
 * and for the engine to survive a much larger village; the numbers below are measured on whatever machine runs the tests, so the
 * assertions use generous ceilings (about four times the target) that catch a regression to quadratic behaviour without flaking on a
 * busy CI box. The measured values are printed so they can be copied into docs/PERFORMANCE.md.
 */

/** Grow a village to `copies` times its population: every villager is cloned with their ties, plus a kin tie to the previous copy. */
function inflate(s: RunState, copies: number): RunState {
  const out = structuredClone({ ...s, scn: undefined }) as unknown as RunState;
  out.scn = s.scn;
  const base = s.villagers;
  for (let k = 1; k < copies; k++) {
    for (const v of base) {
      const c = structuredClone(v);
      c.id = `${v.id}_${k}`;
      c.name = `${v.name} ${k}`;
      out.villagers.push(c);
    }
    for (const e of s.edges) out.edges.push({ ...structuredClone(e), a: `${e.a}_${k}`, b: `${e.b}_${k}` });
    for (const v of base) out.edges.push({ a: v.id + (k > 1 ? `_${k - 1}` : ''), b: `${v.id}_${k}`, ab: 40, ba: 40, rate: 0.2, kind: 'kin' });
  }
  return out;
}

const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('performance and stress', () => {
  it('resolves a day of the default village within the budget, and a 100-villager village within a looser one', () => {
    const run = (s0: RunState, label: string) => {
      const times: number[] = [];
      let s = s0;
      for (let d = 0; d < 5 && !s.outcome; d++) {
        const g = new GameSession(s);
        // warm the village with a real plan so gossip and laws have something to chew on
        policyById('evidence-first').playDay(g);
        s = g.state;
      }
      let state = s;
      for (let d = 0; d < 3 && !state.outcome; d++) {
        const t0 = performance.now();
        state = resolveDay(state).state;
        times.push(performance.now() - t0);
      }
      console.log(`[perf] ${label}: ${state.villagers.length} villagers, resolveDay median ${median(times).toFixed(1)} ms (n=${times.length})`);
      return median(times);
    };
    const base = createRun({ scenarioId: 'redbank', seed: 1 });
    const small = run(base, 'default village');
    expect(small).toBeLessThan(250);
    const big = inflate(base, 7);
    expect(big.villagers.length).toBeGreaterThanOrEqual(98);
    const large = run(big, '100-agent village');
    expect(large).toBeLessThan(250);
  }, 120_000);

  it('previews, forecasts and the action list stay cheap enough for an interactive turn', () => {
    const s = createRun({ scenarioId: 'redbank', seed: 1 });
    const g = new GameSession(s);
    g.act({ type: 'PICK_STARTER', claim: s.scn.starters[0] });
    const t0 = performance.now();
    const opts = getAvailableActions(g.state);
    const t1 = performance.now();
    getForecast(g.state);
    const t2 = performance.now();
    console.log(`[perf] action list (${opts.length} options) ${(t1 - t0).toFixed(1)} ms, forecast ${(t2 - t1).toFixed(1)} ms`);
    expect(t1 - t0).toBeLessThan(1500);
    expect(t2 - t1).toBeLessThan(500);
  });

  it('save and load are fast and exact for a late-game village', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    const p = policyById('threat-aware');
    for (let i = 0; i < 5 && !g.state.outcome; i++) p.playDay(g);
    const t0 = performance.now();
    const json = serializeRun(g.state);
    const back = deserializeRun(json);
    const dt = performance.now() - t0;
    console.log(`[perf] save+load ${(dt).toFixed(1)} ms, ${(json.length / 1024).toFixed(0)} KB`);
    expect(back.ok).toBe(true);
    expect(dt).toBeLessThan(500);
    expect(json.length).toBeLessThan(2_000_000);
  });

  it('a very large event history stays bounded in the saved run', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    const p = policyById('random');
    for (let i = 0; i < 7 && !g.state.outcome; i++) p.playDay(g);
    // the log is the only unbounded structure: it must stay in the tens of thousands of entries at most for a full run
    expect(g.state.log.length).toBeLessThan(20_000);
  });
});
