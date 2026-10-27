import { describe, expect, it } from 'vitest';
import { GameSession, applyAction, createRun, deserializeRun, replayRun, resolveDay, serializeRun, stateHash, getAvailableActions } from '../../src/engine/index.ts';
import type { Action, RunState } from '../../src/engine/index.ts';
import { cloneState } from '../../src/engine/core/clone.ts';

const C = 'river_fears_fire';
const script: Action[] = [
  { type: 'PICK_STARTER', claim: C },
  { type: 'SEED', claim: C, target: 'ivo' },
  { type: 'SEED', claim: C, target: 'nell' },
  { type: 'END_DAY' },
  { type: 'SEED', claim: C, target: 'bram' },
  { type: 'END_DAY' },
];

describe('createRun', () => {
  it('builds a valid initial state', () => {
    const s = createRun({ scenarioId: 'redbank', seed: 1 });
    expect(s.villagers).toHaveLength(14);
    expect(s.day).toBe(1);
    expect(s.ap).toBe(3);
    expect(s.phase).toBe('planning');
    expect(s.world.landmarks.length).toBeGreaterThan(20);
    for (const v of s.villagers) {
      expect(Number.isFinite(v.x)).toBe(true);
      expect(v.traits.skepticism).toBeGreaterThanOrEqual(0);
    }
    for (const e of s.edges) {
      expect(s.villagers.some((v) => v.id === e.a)).toBe(true);
      expect(s.villagers.some((v) => v.id === e.b)).toBe(true);
    }
  });
  it('accepts seed 0 and negative seeds', () => {
    expect(() => createRun({ scenarioId: 'redbank', seed: 0 })).not.toThrow();
    expect(() => createRun({ scenarioId: 'redbank', seed: -7 })).not.toThrow();
  });
  it('rejects unknown scenarios clearly', () => {
    expect(() => createRun({ scenarioId: 'nope', seed: 1 })).toThrow(/Unknown scenario/);
  });
});

describe('actions and Influence', () => {
  it('requires choosing a story first and never overdraws Influence', () => {
    const s = createRun({ scenarioId: 'redbank', seed: 1 });
    const early = applyAction(s, { type: 'SEED', claim: C, target: 'ivo' });
    expect(early.ok).toBe(false);
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    g.act({ type: 'PICK_STARTER', claim: C });
    for (const t of ['ivo', 'nell', 'dunn']) expect(g.act({ type: 'SEED', claim: C, target: t }).ok).toBe(true);
    expect(g.state.ap).toBe(0);
    const over = g.act({ type: 'SEED', claim: C, target: 'bram' });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.code).toBe('NO_INFLUENCE');
    expect(g.state.ap).toBe(0);
  });
  it('failed actions do not change state', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    g.act({ type: 'PICK_STARTER', claim: C });
    const before = stateHash(g.state);
    expect(g.act({ type: 'SEED', claim: 'bridge_stands_watched', target: 'ivo' }).ok).toBe(false); // locked
    expect(g.act({ type: 'SEED', claim: C, target: 'nobody' }).ok).toBe(false);
    expect(g.act({ type: 'MESSENGER', claim: C, from: 'ivo', to: 'nell' }).ok).toBe(false); // not a believer yet
    expect(stateHash(g.state)).toBe(before);
  });
  it('one conversation per villager per day', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    g.act({ type: 'PICK_STARTER', claim: C });
    expect(g.act({ type: 'SEED', claim: C, target: 'ivo' }).ok).toBe(true);
    const again = g.act({ type: 'SEED', claim: C, target: 'ivo' });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('ALREADY_SPOKE');
  });
  it('undo restores the exact state and cannot mint Influence', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    g.act({ type: 'PICK_STARTER', claim: C });
    const h0 = stateHash(g.state);
    g.act({ type: 'SEED', claim: C, target: 'ivo' });
    expect(g.state.ap).toBe(2);
    expect(g.undo()).toBe(true);
    expect(stateHash(g.state)).toBe(h0);
    expect(g.state.ap).toBe(3);
    expect(g.undo()).toBe(true); // undo the starter choice
    expect(g.state.ap).toBe(3);
    expect(g.undo()).toBe(false);
  });
  it('cannot undo across the end of a day', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    g.act({ type: 'PICK_STARTER', claim: C });
    g.act({ type: 'SEED', claim: C, target: 'ivo' });
    g.endDay();
    expect(g.canUndo).toBe(false);
  });
  it('Influence recovers up to the cap', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    for (let i = 0; i < 4; i++) g.endDay();
    expect(g.state.ap).toBeLessThanOrEqual(g.state.apMax);
    expect(g.state.ap).toBe(5);
  });
});

describe('determinism and replay', () => {
  it('same seed + same actions => identical hashes', () => {
    const a = replayRun({ scenarioId: 'redbank', seed: 11, actions: script });
    const b = replayRun({ scenarioId: 'redbank', seed: 11, actions: script });
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.eventHash).toBe(b.eventHash);
    expect(a.rejected).toHaveLength(0);
  });
  it('a different seed changes the outcome stream', () => {
    const long: Action[] = [...script, { type: 'END_DAY' }, { type: 'END_DAY' }, { type: 'END_DAY' }];
    const a = replayRun({ scenarioId: 'redbank', seed: 11, actions: long });
    const b = replayRun({ scenarioId: 'redbank', seed: 12, actions: long });
    expect(a.eventHash).not.toBe(b.eventHash);
  });
  it('a different action plan changes both social and physical state', () => {
    const base: Action[] = [{ type: 'PICK_STARTER', claim: C }];
    const A: Action[] = [...base, { type: 'SEED', claim: C, target: 'ivo' }, { type: 'END_DAY' }, { type: 'END_DAY' }, { type: 'END_DAY' }];
    const B: Action[] = [...base, { type: 'SEED', claim: C, target: 'osric' }, { type: 'END_DAY' }, { type: 'END_DAY' }, { type: 'END_DAY' }];
    const a = replayRun({ scenarioId: 'redbank', seed: 5, actions: A });
    const b = replayRun({ scenarioId: 'redbank', seed: 5, actions: B });
    const conv = (s: RunState) => s.villagers.map((v) => Math.round(v.beliefs[C]?.conv ?? 0)).join(',');
    expect(conv(a.state)).not.toBe(conv(b.state));
  });
  it('is independent of villager / edge insertion order', () => {
    const run = (shuffle: boolean) => {
      const g = GameSession.create({ scenarioId: 'redbank', seed: 21 });
      if (shuffle) {
        g.state.villagers.reverse();
        g.state.edges.reverse();
      }
      for (const a of script) g.act(a);
      const conv: Record<string, number> = {};
      for (const v of g.state.villagers) conv[v.id] = Math.round((v.beliefs[C]?.conv ?? 0) * 10) / 10;
      return conv;
    };
    expect(run(true)).toEqual(run(false));
  });
  it('has no hidden state between runs (no singleton leakage)', () => {
    const a = replayRun({ scenarioId: 'redbank', seed: 3, actions: script });
    replayRun({ scenarioId: 'redbank', seed: 99, actions: script });
    const c = replayRun({ scenarioId: 'redbank', seed: 3, actions: script });
    expect(c.stateHash).toBe(a.stateHash);
  });
});

describe('save / load', () => {
  it('round-trips and continues identically', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 8 });
    for (const a of script.slice(0, 4)) g.act(a);
    const json = serializeRun(g.state);
    const loaded = deserializeRun(json);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(stateHash(loaded.state)).toBe(stateHash(g.state));
    const g2 = new GameSession(loaded.state);
    for (const a of script.slice(4)) {
      g.act(a);
      g2.act(a);
    }
    expect(stateHash(g2.state)).toBe(stateHash(g.state));
  });
  it('rejects corrupt, foreign and future saves without throwing', () => {
    expect(deserializeRun('{not json').ok).toBe(false);
    expect(deserializeRun('{"format":"other"}').ok).toBe(false);
    const s = createRun({ scenarioId: 'redbank', seed: 1 });
    const env = JSON.parse(serializeRun(s));
    env.schemaVersion = 999;
    expect(deserializeRun(JSON.stringify(env)).ok).toBe(false);
    const env2 = JSON.parse(serializeRun(s));
    delete env2.state.villagers;
    expect(deserializeRun(JSON.stringify(env2)).ok).toBe(false);
    const env3 = JSON.parse(serializeRun(s));
    env3.state.ap = -5;
    expect(deserializeRun(JSON.stringify(env3)).ok).toBe(false);
    const env4 = JSON.parse(serializeRun(s));
    env4.state.world.terrain.length = 3;
    expect(deserializeRun(JSON.stringify(env4)).ok).toBe(false);
  });
});

describe('invariants over a full run', () => {
  it('keeps every number finite and counts non-negative', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 4 });
    g.act({ type: 'PICK_STARTER', claim: C });
    while (!g.state.outcome) {
      for (const o of getAvailableActions(g.state).filter((x) => x.cost > 0).slice(0, 3)) g.act(o.action);
      const r = g.endDay();
      const s = r.state;
      expect(s.ap).toBeGreaterThanOrEqual(0);
      expect(s.world.stocks.food).toBeGreaterThanOrEqual(0);
      expect(s.world.stocks.fuel).toBeGreaterThanOrEqual(0);
      for (const l of s.world.landmarks) expect(l.hp).toBeGreaterThanOrEqual(0);
      for (const v of s.villagers) {
        for (const b of Object.values(v.beliefs)) {
          expect(Number.isFinite(b.conv)).toBe(true);
          expect(Math.abs(b.conv)).toBeLessThanOrEqual(100);
        }
        expect(v.health).toBeGreaterThanOrEqual(0);
      }
      for (const w of s.world.water) expect(Number.isFinite(w)).toBe(true);
    }
    expect(g.state.phase).toBe('over');
    expect(() => resolveDay(g.state)).toThrow();
  });
  it('clone does not alias mutable state', () => {
    const s = createRun({ scenarioId: 'redbank', seed: 1 });
    const c = cloneState(s);
    c.villagers[0].health = 1;
    c.world.stocks.food = 0;
    expect(s.villagers[0].health).toBe(100);
    expect(s.world.stocks.food).toBeGreaterThan(0);
  });
});
