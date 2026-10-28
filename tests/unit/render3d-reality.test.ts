import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameSession, type Action, type CreateRunOptions, type GameEvent, type RunState } from '../../src/engine/index.ts';
import { planResolution, lawVisuals, type EffectPlan } from '../../src/render3d/plan.ts';
import { getSceneSnapshot } from '../../src/render3d/snapshot.ts';

/**
 * Phase 10: what the 3D world shows of a written law is decided as plain data from what the engine logged and recorded (plan.ts),
 * and checked here against the recorded phase 09 chains: every effect names an event the engine logged, a lift plays exactly the
 * hens the executor lifted to the height it computed, and a law that never woke shows nothing.
 */

interface Trace { opts: CreateRunOptions; claimId: string; actions: Action[] }
const fx = JSON.parse(readFileSync(new URL('../fixtures/v2-bridge-traces.json', import.meta.url), 'utf8')) as Record<string, Trace>;

/** every night of a recorded chain: the state before, the events of the resolution, the state after */
function nights(key: string): { day: number; before: RunState; events: GameEvent[]; after: RunState }[] {
  const t = fx[key];
  const g = GameSession.create(t.opts);
  const out: { day: number; before: RunState; events: GameEvent[]; after: RunState }[] = [];
  for (const a of t.actions) {
    if (a.type !== 'END_DAY') {
      expect(g.act(a).ok).toBe(true);
      continue;
    }
    const before = g.state;
    const r = g.endDay();
    out.push({ day: before.day, before, events: r.events, after: g.state });
  }
  return out;
}

function plansOf(key: string): { day: number; plans: EffectPlan[]; events: GameEvent[]; after: RunState }[] {
  return nights(key).map((n) => ({ day: n.day, events: n.events, after: n.after, plans: planResolution(n.events, getSceneSnapshot(n.after), getSceneSnapshot(n.before), { reduced: false }) }));
}

describe('the 3D world plays only what the engine logged', () => {
  it.each(['hens', 'stones', 'rain', 'win'])('%s: every planned effect names an event of that very night', (key) => {
    for (const n of plansOf(key)) {
      const ids = new Set(n.events.map((e) => e.id));
      for (const p of n.plans) expect(ids.has(p.eventId), `${p.kind} for ${p.code} on day ${n.day}`).toBe(true);
    }
  });

  it('claim A: on each night the law acted, a lift plays exactly the hens the executor lifted, to the height it computed', () => {
    const lifts = plansOf('hens').flatMap((n) => n.plans.filter((p) => p.kind === 'lift').map((p) => ({ day: n.day, p, after: n.after })));
    expect(lifts.map((x) => x.day)).toEqual([6, 7]);
    for (const { p, after } of lifts) {
      const applied = after.v2!.lastNight.find((a) => a.event === p.eventId)!;
      expect(applied.op).toBe('APPLY_FORCE');
      expect(p.height).toBe(applied.amount);
      expect(p.height).toBe(2);
      // the hens it lifts are the live hens it targeted (all 22 here), nothing else
      expect(new Set(p.targets)).toEqual(new Set(applied.targets.filter((id) => after.v2!.chickens.some((c) => c.id === id && c.alive))));
      expect(p.targets).toHaveLength(22);
    }
  });

  it('a law that never woke shows nothing: the bell rang every day, no lift, no reality effect', () => {
    for (const n of plansOf('hensBelow')) {
      expect(n.plans.filter((p) => p.kind === 'lift' || p.code === 'REALITY_EFFECT')).toEqual([]);
    }
  });

  it('claim B: the stones whose weight changed glow, the carried stone is drawn from the villager to the bank, and the bank raises dust', () => {
    const night6 = plansOf('stones').find((n) => n.day === 6)!;
    expect(night6.plans.some((p) => p.code === 'REALITY_EFFECT' && p.kind === 'ring')).toBe(true);
    const haul = night6.plans.filter((p) => p.code === 'BANK_RAISED');
    expect(haul.map((p) => p.kind).sort()).toEqual(['arc', 'dust']);
    const ev = night6.events.find((e) => e.code === 'BANK_RAISED')!;
    expect(haul.find((p) => p.kind === 'arc')!.from).toBe(ev.actor);
  });

  it('claim C: pooled water is shown where the engine pooled it, and the flames it cooled shimmer', () => {
    const last = plansOf('rain').at(-1)!;
    const pooled = last.events.find((e) => e.code === 'WATER_POOLED')!;
    expect(pooled.tile).toBeDefined();
    expect(pooled.delta?.tiles?.[1]).toBe(7);
    const drops = last.plans.find((p) => p.code === 'WATER_POOLED')!;
    expect(drops.kind).toBe('drops');
    expect(drops.at).toEqual({ x: pooled.tile![0] + 0.5, z: pooled.tile![1] + 0.5 });
    // the cooled flames: shimmer over the lit fires, or, with none lit that night, a cool ring where the law holds
    expect(last.plans.some((p) => p.code === 'REALITY_EFFECT' && (p.kind === 'chill' || (p.kind === 'ring' && p.vocab === 'rain')))).toBe(true);
  });
});

describe('written laws are described by their own clauses, never by the placeholder spec they carry', () => {
  it('the hens law needs the bell: powered only on days the bell rang, and never shown as wanting a lantern', () => {
    const t = fx.hens;
    const g = GameSession.create(t.opts);
    let checked = 0;
    for (const a of t.actions) {
      if (a.type === 'END_DAY') {
        const snap = getSceneSnapshot(g.state);
        const law = snap.laws.find((l) => l.claimId === t.claimId);
        if (law) {
          checked++;
          expect(law.trigger).toBe('bell');
          expect(law.subject).toBe('reality:chicken');
          expect(law.effect).toBe('APPLY_FORCE');
          const rung = g.state.world.landmarks.some((l) => l.kind === 'belltower' && (l.data.ringing ?? 0) > 0);
          expect(law.sources.length > 0).toBe(rung);
          const v = lawVisuals(snap).find((x) => x.claim === t.claimId);
          if (v && !v.powered) expect(v.missing).toBe('a rung bell');
        }
      }
      g.act(a);
    }
    expect(checked).toBeGreaterThan(3);
  });
});
