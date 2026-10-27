import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/engine/index.ts';
import { policyById } from '../../src/engine/ai/bots/generic.ts';
import { claimDef } from '../../src/engine/core/lookup.ts';
import { computeModifiers, triggerSources } from '../../src/engine/laws/effects.ts';
import type { GameEvent, RunState } from '../../src/engine/index.ts';
import { getSceneSnapshot, type SceneSnapshot } from '../../src/render3d/snapshot.ts';
import { lawVisuals, planAction, planResolution, type EffectPlan } from '../../src/render3d/plan.ts';

/**
 * Parity between what the 3D world is told to show and what the engine did. Everything here runs a real, fixed-seed game with one of the
 * tournament's own bots; nothing is mocked. A visual that is planned must trace to a logged event or to a law the engine reports, and a
 * law's physical reach on screen must be the reach the engine used. These are the six fixtures of the belief-magic phase.
 */
interface Day {
  day: number;
  before: RunState;
  after: RunState;
  events: GameEvent[];
}

function play(policy: string, seed: number, days: number, scenario = 'redbank'): Day[] {
  const g = GameSession.create({ scenarioId: scenario, seed });
  const p = policyById(policy);
  const out: Day[] = [];
  for (let d = 1; d <= days && !g.state.outcome; d++) {
    const before = structuredClone(g.state);
    const from = g.state.log.length;
    p.playDay(g);
    out.push({ day: d, before, after: structuredClone(g.state), events: g.state.log.slice(from) });
  }
  return out;
}

const snapOf = (s: RunState): SceneSnapshot => getSceneSnapshot(s);
const resolve = (d: Day): EffectPlan[] => planResolution(d.events, snapOf(d.after), snapOf(d.before), { reduced: false });

describe('belief magic: what the world shows matches what the engine did', () => {
  it('1. a rumour below the threshold shows social effects only: no law ground, no reach, no water effects', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    const p = policyById('evidence-first');
    const from = g.state.log.length;
    p.playDay(g);
    const day1 = g.state.log.slice(from);
    const snap = snapOf(g.state);
    // some story was told, and the engine has no law above dormant yet
    expect(day1.some((e) => e.code === 'RUMOR_SEEDED')).toBe(true);
    expect(g.state.laws.every((l) => l.status === 'dormant' || l.status === 'awakening')).toBe(true);
    const plans = planAction(day1.filter((e) => e.code === 'RUMOR_SEEDED'), snap, { reduced: false });
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((x) => x.kind === 'rune' || x.kind === 'ring')).toBe(true);
    expect(plans.some((x) => x.kind === 'ripple' || x.kind === 'glyph' || x.kind === 'splash' || x.kind === 'drops')).toBe(false);
    const visuals = lawVisuals(snap);
    expect(visuals.filter((v) => v.status === 'active')).toHaveLength(0);
    expect(visuals.every((v) => v.sources.length === 0 || v.status !== 'active')).toBe(true);
  });

  it('2. a law that has its support but no lit beacon is shown as waiting for it, with nothing pretending to push the water', () => {
    // the broadcaster wins the support for the beacon law but never lights a beacon: the law is active on paper, nothing powers it
    const days = play('broadcaster', 1, 8);
    const hit = days.find((d) => d.after.laws.some((l) => l.status === 'active'));
    expect(hit, 'the fixture run should reach an active law').toBeTruthy();
    const d = hit as Day;
    const snap = snapOf(d.after);
    const lawState = d.after.laws.find((l) => l.status === 'active') as NonNullable<RunState['laws'][number]>;
    const def = claimDef(d.after, lawState.claimId);
    // the engine agrees that nothing is powering it
    expect(triggerSources(d.after, lawState, def)).toHaveLength(0);
    expect(d.after.world.landmarks.filter((l) => l.kind === 'beacon' && l.lit && l.fuelNights > 0)).toHaveLength(0);
    const v = lawVisuals(snap).find((x) => x.law === lawState.id);
    expect(v?.status).toBe('active');
    expect(v?.powered).toBe(false);
    expect(v?.missing).toMatch(/beacon/);
    expect(v?.sources).toHaveLength(0);
    // the cue is a cold empty marker where a beacon would stand, and no ripple goes out from nowhere
    expect(v?.candidates.length).toBeGreaterThan(0);
    const plans = resolve(d).filter((x) => x.law === lawState.id);
    expect(plans.filter((x) => x.kind === 'ripple')).toHaveLength(0);
  });

  it('3. support + fuel + a lit beacon: the law is powered and the reach drawn is exactly the ground the engine shields from the flood', () => {
    const days = play('threat-aware', 2, 7);
    const hit = days.find((d) => d.events.some((e) => e.code === 'LAW_ACTIVATED') && d.after.world.landmarks.some((l) => l.kind === 'beacon' && l.lit));
    expect(hit, 'the fixture run should wake the law with the beacon lit').toBeTruthy();
    const d = hit as Day;
    const snap = snapOf(d.after);
    const lawState = d.after.laws.find((l) => l.status === 'active');
    expect(lawState).toBeTruthy();
    const def = claimDef(d.after, (lawState as NonNullable<typeof lawState>).claimId);
    const engineSources = triggerSources(d.after, lawState as NonNullable<typeof lawState>, def);
    const v = lawVisuals(snap).find((x) => x.law === lawState?.id);
    expect(v?.powered).toBe(true);
    // the sources on screen are exactly what the engine says powers the law
    expect(v?.sources.length).toBe(engineSources.length);
    expect(v?.sources.length).toBeGreaterThan(0);
    // and the reach drawn around them is the law's own radius
    expect(v?.radius).toBe(def.spec.radius);
    // the ground drawn as reached is exactly the ground the engine shields from the flood (the river bed itself is never shielded)
    const mods = computeModifiers(d.after);
    const w = d.after.world.w;
    let drawn = 0;
    let shielded = 0;
    for (let i = 0; i < d.after.world.terrain.length; i++) {
      if (d.after.world.terrain[i] === 1) continue;
      const x = i % w;
      const y = Math.floor(i / w);
      const inReach = engineSources.some((q) => Math.hypot(x - q.x, y - q.y) <= def.spec.radius + 0.5);
      if (inReach) drawn++;
      if (mods.floodShield[i] > 0) shielded++;
      expect(inReach, `tile ${x},${y}`).toBe(mods.floodShield[i] > 0);
    }
    expect(drawn).toBeGreaterThan(0);
    expect(shielded).toBe(drawn);
    // the plan for the waking night: a rune on the ground, a ring, one ripple per source, and a look-here for the camera
    const plans = resolve(d).filter((x) => x.law === lawState?.id);
    expect(plans.filter((x) => x.kind === 'ripple')).toHaveLength(engineSources.length);
    expect(plans.some((x) => x.kind === 'glyph')).toBe(true);
    expect(plans.some((x) => x.kind === 'focus')).toBe(true);
    // every one of them names the engine event that caused it
    const ids = new Set(d.events.map((e) => e.id));
    for (const p of plans) expect(ids.has(p.eventId)).toBe(true);
  });

  it('4. a rival belief that gets in the way is shown as a contest, not as the warm effect', () => {
    // look through several runs for a law that was suppressed, collapsed or discredited
    let found: Day | null = null;
    for (const [pol, seed] of [['greedy', 1], ['threat-aware', 1], ['greedy', 2], ['broadcaster', 1]] as [string, number][]) {
      const days = play(pol, seed, 9);
      found = days.find((d) => d.events.some((e) => ['LAW_SUPPRESSED', 'LAW_COLLAPSED', 'LAW_DISCREDITED', 'LAW_FADED'].includes(e.code))) ?? null;
      if (found) break;
    }
    expect(found, 'some run should lose a law').toBeTruthy();
    const d = found as Day;
    const lost = d.events.filter((e) => ['LAW_SUPPRESSED', 'LAW_COLLAPSED', 'LAW_DISCREDITED', 'LAW_FADED'].includes(e.code));
    const plans = resolve(d).filter((p) => lost.some((e) => e.id === p.eventId));
    expect(plans.length).toBeGreaterThan(0);
    // a law that is lost is drawn as a coral ring, never as a waking glyph or ripple
    expect(plans.every((p) => p.kind === 'ring' && p.vocab === 'danger')).toBe(true);
    // and the ground no longer shows that law as powered and active
    const snap = snapOf(d.after);
    for (const e of lost) {
      const v = lawVisuals(snap).find((x) => x.law === e.law);
      if (v) expect(v.status === 'active' && v.powered).toBe(false);
    }
  });

  it('5. harm the flood or fire did stays in the scene after the law is gone', () => {
    const days = play('greedy', 1, 9);
    const collapsed = days.findIndex((d) => d.events.some((e) => e.code === 'BRIDGE_COLLAPSED'));
    expect(collapsed).toBeGreaterThanOrEqual(0);
    const bridgeAt = (s: RunState) => s.world.landmarks.find((l) => l.kind === 'bridge');
    // from the night it collapsed, the snapshot (and so the scene) never shows the bridge whole again
    for (const d of days.slice(collapsed)) {
      const b = snapOf(d.after).landmarks.find((l) => l.kind === 'bridge');
      expect(b?.hp, `day ${d.day}`).toBeLessThanOrEqual(0);
      expect(bridgeAt(d.after)?.hp).toBeLessThanOrEqual(0);
    }
    // and no plan in the whole run ever offers to mend it: the only effects at the bridge are dust and rings
    for (const d of days) {
      for (const p of resolve(d)) if (p.code === 'BRIDGE_COLLAPSED') expect(['dust', 'focus']).toContain(p.kind);
    }
  });

  it('6. no relationship, no gossip trail: arcs along ties exist only for pairs the engine links', () => {
    const days = play('broadcaster', 2, 6);
    let arcs = 0;
    for (const d of days) {
      const snap = snapOf(d.after);
      const linked = (a: string, b: string): boolean => snap.ties.some((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a));
      for (const p of resolve(d)) {
        if (p.kind === 'arc' && p.via === 'tie') {
          arcs++;
          expect(linked(p.from as string, p.to as string), `${p.code} ${p.from} -> ${p.to}`).toBe(true);
        }
      }
    }
    expect(arcs).toBeGreaterThan(0);
    // a belief shift between two people with no tie is a rune over the believer and nothing along a path
    const d = days[days.length - 1];
    const snap = snapOf(d.after);
    const people = snap.villagers.map((v) => v.id);
    let pair: [string, string] | null = null;
    for (const a of people) for (const b of people) if (!pair && a !== b && !snap.ties.some((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a))) pair = [a, b];
    expect(pair).toBeTruthy();
    const fake: GameEvent = { id: 99999, day: d.day, step: 'social', code: 'BELIEVER_GAINED', actor: (pair as [string, string])[0], target: (pair as [string, string])[1], importance: 1, text: 'synthetic' };
    const plans = planResolution([fake], snap, null, { reduced: false });
    expect(plans.some((p) => p.kind === 'arc')).toBe(false);
    expect(plans.some((p) => p.kind === 'rune')).toBe(true);
  });

  it('reduced motion shortens every effect and never adds one', () => {
    const days = play('threat-aware', 2, 7);
    for (const d of days) {
      const normal = planResolution(d.events, snapOf(d.after), snapOf(d.before), { reduced: false });
      const calm = planResolution(d.events, snapOf(d.after), snapOf(d.before), { reduced: true });
      expect(calm.length).toBe(normal.length);
      for (let i = 0; i < calm.length; i++) expect(calm[i].dur).toBeLessThanOrEqual(normal[i].dur);
    }
  });
});
