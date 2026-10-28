import { describe, expect, it } from 'vitest';
import { GameSession, buildRealityClaim, verifyRealityClaim } from '../../src/engine/index.ts';
import { cloneState } from '../../src/engine/core/clone.ts';
import { emptyModifiers } from '../../src/engine/laws/effects.ts';
import { COND_TESTS, TAGS, TRIGGER_EVENTS, mechanicsHash, validateRealityAst, type RealityAst, type Trigger } from '../../src/engine/reality/ast.ts';
import { MAX_POWER, balanceReality } from '../../src/engine/reality/balance.ts';
import { coverageOf, realityComposeCost } from '../../src/engine/reality/cost.ts';
import { authoredTwin } from '../../src/engine/reality/twin.ts';
import { runRealityLaws } from '../../src/engine/reality/execute.ts';
import { ANCHORS } from '../../src/engine/reality/ontology.ts';
import { EXECUTABLE_OPS, OPERATORS, type OpId } from '../../src/engine/reality/operators.ts';
import { chickensFly, lightEast, wetStoneLight } from '../helpers/reality.ts';
import type { RunState } from '../../src/engine/core/types.ts';

/**
 * Phases 04 and 06, property style: a seeded generator writes thousands of beliefs, well-formed and malformed, and the language's
 * guarantees must hold for every one of them. Then two runs check what happens over time: a law whose belief drains away, and a
 * law whose effect would feed its own trigger.
 */

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const REGIONS = ['east', 'west', 'river', 'north', 'valley'];
const GARBAGE: unknown[] = [null, undefined, Number.NaN, Infinity, -1, 1e9, '', 'x'.repeat(300), {}, [], true, 'constructor', '__proto__', { op: 'EVAL' }];

function randomAst(r: () => number): RealityAst {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const trig = (depth: number): Trigger => {
    const roll = r();
    if (depth > 0 && roll < 0.15) return { all: [trig(depth - 1), trig(depth - 1)] };
    if (depth > 0 && roll < 0.25) return { any: [trig(depth - 1), trig(depth - 1)] };
    if (depth > 0 && roll < 0.3) return { not: trig(depth - 1) };
    const event = pick(TRIGGER_EVENTS);
    return { event, min: event === 'watchers' || event === 'flood' ? int(1, 4) : null };
  };
  const clauses = Array.from({ length: int(1, 3) }, (_, k) => {
    const op: OpId = pick(EXECUTABLE_OPS);
    const def = OPERATORS[op];
    const effect: Record<string, unknown> = { op };
    for (const p of def.params) {
      if (p.kind === 'int') {
        let v = int(p.min, p.max);
        if (p.nonzero && v === 0) v = p.max;
        effect[p.name] = v;
      } else if (p.kind === 'enum') effect[p.name] = pick(p.values);
      else if (p.kind === 'region') effect[p.name] = p.nullable && r() < 0.5 ? null : pick(REGIONS);
      else if (p.kind === 'bool') effect[p.name] = r() < 0.5;
      else effect[p.name] = 'stone';
    }
    const kind = pick(def.targets);
    if (op === 'SET_MATERIAL_PROPERTY' && r() < 0.8) effect.property = kind === 'stone' ? 'mass' : kind === 'bridge' ? 'hardness' : pick(['flammability', 'hardness']);
    return {
      id: `c${k + 1}`,
      when: trig(int(0, 3)),
      where: r() < 0.3 ? { test: pick(COND_TESTS) } : null,
      target: { kind, near: r() < 0.4 ? { anchor: pick(ANCHORS), radius: int(0, 5) } : null, tags: r() < 0.2 ? [pick(TAGS)] : [], region: null },
      effect,
      duration: r() < 0.2 ? 'while_active' : 'night',
    };
  });
  return { v: 2, lang: 'reality-1', text: 'A generated belief.', author: 'player', source: { reader: 'offline-v2', model: null, prompt: null, id: null }, day: 1, regions: [pick(REGIONS)], clauses, omitted: [], narrative: null } as unknown as RealityAst;
}

/** Overwrite one random field anywhere in the tree with garbage. */
function corrupt(x: unknown, r: () => number): unknown {
  const copy = JSON.parse(JSON.stringify(x)) as Record<string, unknown>;
  const paths: [Record<string, unknown>, string][] = [];
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      paths.push([o as Record<string, unknown>, k]);
      walk((o as Record<string, unknown>)[k]);
    }
  };
  walk(copy);
  const [o, k] = paths[Math.floor(r() * paths.length)];
  o[k] = GARBAGE[Math.floor(r() * GARBAGE.length)];
  return copy;
}

describe('the language holds its guarantees for any belief (seeded property tests)', () => {
  const s = GameSession.create({ scenarioId: 'redbank', seed: 1, reality: true }).state;
  const r = rng(20261027);
  const N = 1500;
  const stats = { valid: 0, built: 0, refused: 0, corruptValid: 0 };

  it('never throws, never accepts garbage, and keeps every accepted belief within its bounds', () => {
    for (let i = 0; i < N; i++) {
      const ast = randomAst(r);
      const check = validateRealityAst(ast);
      if (check.ok) {
        stats.valid++;
        // a valid belief survives serialisation unchanged, with the same fingerprint
        const again = validateRealityAst(JSON.parse(JSON.stringify(check.ast)));
        expect(again.ok).toBe(true);
        if (again.ok) expect(mechanicsHash(again.ast)).toBe(mechanicsHash(check.ast));
        // the run's own balance rules (3 for a run made now: the floor of the chapter's own law that does the same thing, and the
        // ground a belief measured from many landmarks covers); rules 2 and 1 keep their bounds for older saves
        const twin = authoredTwin(s, check.ast);
        const floor = twin ? { short: twin.short, thresholds: twin.spec.thresholds, watchers: twin.spec.trigger.kind === 'watchers' ? (twin.spec.trigger.min ?? 1) : undefined } : null;
        expect(s.v2!.rules).toBe(3);
        const coverage = coverageOf(s, check.ast.regions);
        const b = balanceReality(check.ast, { rules: 3, floor, coverage });
        const b2 = balanceReality(check.ast, { rules: 2, floor });
        const b1 = balanceReality(check.ast, { rules: 1 });
        for (const x of [b, b2]) {
          expect(x.power).toBeLessThanOrEqual(MAX_POWER);
          expect(Number.isFinite(x.power)).toBe(true);
          expect(x.thresholds.on).toBeGreaterThanOrEqual(0.55);
          expect(x.thresholds.on).toBeLessThanOrEqual(0.85);
          expect(x.thresholds.minSupporters).toBeGreaterThanOrEqual(2);
          expect(x.thresholds.minSupporters).toBeLessThanOrEqual(7);
          expect(validateRealityAst(x.ast).ok).toBe(true);
        }
        expect(b2.power).toBe(b1.power);
        expect(b2.apCost).toBe(b1.apCost);
        expect(b2.thresholds.on).toBeLessThanOrEqual(b1.thresholds.on);
        expect(b1.thresholds.on).toBeGreaterThanOrEqual(0.6);
        expect(b1.thresholds.on).toBeLessThanOrEqual(0.9);
        expect(b1.thresholds.minSupporters).toBeLessThanOrEqual(8);
        // the price the composer shows is exactly what writing it is charged
        expect(realityComposeCost(s, b.ast)).toBe(b.apCost);
        expect(balanceReality(check.ast, { rules: 3, floor, coverage })).toEqual(b);
        // a copy never asks less than the law it copies
        if (twin) {
          expect(b.thresholds.on).toBeGreaterThanOrEqual(twin.spec.thresholds.on);
          expect(b.thresholds.ramp).toBeLessThanOrEqual(twin.spec.thresholds.ramp);
        }
        const built = buildRealityClaim(s, check.ast);
        if (built.ok) {
          stats.built++;
          expect(verifyRealityClaim(s, built.draft.claim)).toBeNull();
          // the build may only lower the believers asked for (to what the region's electorate can give), never the share
          const t = built.draft.claim.spec.thresholds;
          expect({ ...t, minSupporters: 0 }).toEqual({ ...b.thresholds, minSupporters: 0 });
          expect(t.minSupporters).toBeLessThanOrEqual(b.thresholds.minSupporters);
        } else {
          stats.refused++;
          expect(built.code).toMatch(/^[A-Z_]+$/);
          expect(built.issues.length + built.message.length).toBeGreaterThan(0);
        }
      } else expect(check.issues.length).toBeGreaterThan(0);
      // the same belief with one field overwritten by garbage: never a crash, and never valid unless the garbage was harmless
      const bad = corrupt(ast, r);
      const c = (() => {
        try {
          return validateRealityAst(bad);
        } catch (e) {
          throw new Error(`validator threw on ${JSON.stringify(bad)}`, { cause: e });
        }
      })();
      if (c.ok) {
        stats.corruptValid++;
        expect(balanceReality(c.ast).power).toBeLessThanOrEqual(MAX_POWER);
      }
    }
    // the generator must exercise all three paths, or the property says nothing
    expect(stats.valid).toBeGreaterThan(N / 5);
    expect(stats.built).toBeGreaterThan(50);
    expect(stats.refused).toBeGreaterThan(50);
    expect(stats.corruptValid).toBeLessThan(N / 10);
  });

  it('refuses whatever is not a belief at all', () => {
    for (const x of [...GARBAGE, 'Chickens fly when the bell rings.', { v: 2 }, [chickensFly()], { ...chickensFly(), clauses: 'all of them' }])
      expect(validateRealityAst(x).ok).toBe(false);
  });
});

describe('over time', () => {
  it('when belief drains away the law collapses: its effects stop, and what it built stays built', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, reality: true });
    g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
    const b = buildRealityClaim(g.state, wetStoneLight());
    if (!b.ok) throw new Error(b.issues.join());
    expect(g.act({ type: 'COMPOSE', claim: b.draft.claim }).ok).toBe(true);
    const id = b.draft.claim.id;
    let peak = 0;
    for (let d = 0; d < 9 && !g.state.outcome; d++) {
      const conv = d < 2 ? 85 : 0;
      for (const v of g.state.villagers) if (v.district === 'east' && v.status !== 'dead') v.beliefs[id] = { conv, heard: 3, lastDay: g.state.day, lastSource: null, evidence: conv ? 30 : 0, cause: null, stale: 0 };
      lightEast(g);
      g.endDay();
      peak = Math.max(peak, Object.keys(g.state.v2!.bank).length);
    }
    const log = g.state.log;
    const collapsed = log.find((e) => e.code === 'LAW_COLLAPSED' && e.claim === id);
    expect(collapsed).toBeDefined();
    expect(log.some((e) => e.code === 'LAW_WAVERING' && e.claim === id && e.day < collapsed!.day)).toBe(true);
    // no reality event names the law on the night it collapsed or after
    expect(log.filter((e) => e.claim === id && e.day >= collapsed!.day && /^REALITY_/.test(e.code))).toEqual([]);
    // the raised bank is lasting: it outlives the belief that built it
    expect(peak).toBeGreaterThan(0);
    expect(Object.keys(g.state.v2!.bank).length).toBe(peak);
  });

  it('a law whose effect would feed its own trigger fires once a night and never compounds', () => {
    // "floods call more water to the bridge": the effect makes flooding worse, and flooding is its trigger
    const feed: RealityAst = { ...chickensFly(), regions: ['river'], text: 'Floods call more water to the bridge.', clauses: [{ id: 'c1', when: { event: 'flood', min: 1 }, where: null, target: { kind: 'water', near: { anchor: 'bridge', radius: 2 }, tags: [], region: null }, effect: { op: 'REDIRECT_FLOW', mode: 'attract', magnitude: 3, radius: 2 }, duration: 'night' }] };
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, reality: true });
    g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
    const b = buildRealityClaim(g.state, feed);
    if (!b.ok) throw new Error(b.issues.join());
    expect(g.act({ type: 'COMPOSE', claim: b.draft.claim }).ok).toBe(true);
    const id = b.draft.claim.id;
    const nights: { day: number; shield: number[] }[] = [];
    for (let d = 0; d < 9 && !g.state.outcome; d++) {
      for (const v of g.state.villagers) if (v.status !== 'dead') v.beliefs[id] = { conv: 85, heard: 3, lastDay: g.state.day, lastSource: null, evidence: 30, cause: null, stale: 0 };
      // what the law would do tonight, planned twice on copies of the same state: planning is a pure function of tonight's inputs
      const plan = (st: RunState) => {
        const c = cloneState(st);
        const mods = emptyModifiers(c);
        runRealityLaws({ s: c, events: [], expect: false }, mods);
        return mods.floodShield;
      };
      expect(plan(g.state)).toEqual(plan(g.state));
      nights.push({ day: g.state.day, shield: plan(g.state) });
      g.endDay();
    }
    const fx = g.state.log.filter((e) => e.claim === id && e.code === 'REALITY_EFFECT');
    expect(fx.length).toBeGreaterThan(0);
    // at most one firing per clause per night
    const perNight = new Map<number, number>();
    for (const e of fx) perNight.set(e.day, (perNight.get(e.day) ?? 0) + 1);
    expect(Math.max(...perNight.values())).toBe(1);
    // and the stamp is the same size every night it fires: nothing it did last night makes tonight's effect larger
    const stamps = nights.map((n) => n.shield.reduce((a, v) => a + Math.min(0, v), 0)).filter((x) => x < 0);
    expect(stamps.length).toBeGreaterThan(1);
    expect(new Set(stamps).size).toBe(1);
  });
});
