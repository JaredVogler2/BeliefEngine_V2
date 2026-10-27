import { GameSession, buildRealityClaim } from '../../src/engine/index.ts';
import type { Action, RealityAst } from '../../src/engine/index.ts';

/** Fixtures for the Generative Reality tests: the three proof beliefs of prompts/09 as AST v2, and a run with a belief made real. */

const SRC = { reader: 'offline-v2' as const, model: null, prompt: null, id: null };

export function chickensFly(region = 'east', magnitude = 2): RealityAst {
  return {
    v: 2, lang: 'reality-1', text: 'Chickens fly when the bell rings.', author: 'player', source: SRC, day: 1, regions: [region],
    clauses: [{ id: 'c1', when: { event: 'bell', min: null }, where: null, target: { kind: 'chicken', near: null, tags: [], region: null }, effect: { op: 'APPLY_FORCE', direction: 'up', magnitude }, duration: 'night' }],
    omitted: [], narrative: null,
  };
}

export function wetStoneLight(region = 'east'): RealityAst {
  return {
    v: 2, lang: 'reality-1', text: 'Wet stone becomes light beside lanterns.', author: 'player', source: SRC, day: 1, regions: [region],
    clauses: [{ id: 'c1', when: { event: 'lantern', min: null }, where: { test: 'wet' }, target: { kind: 'stone', near: { anchor: 'beacon', radius: 3 }, tags: [], region: null }, effect: { op: 'SET_MATERIAL_PROPERTY', property: 'mass', delta: -3 }, duration: 'night' }],
    omitted: [], narrative: null,
  };
}

export function bellRainFire(region = 'east'): RealityAst {
  return {
    v: 2, lang: 'reality-1', text: 'At night, bell ringing pulls rain toward the orchard and makes local flames burn weaker.', author: 'player', source: SRC, day: 1, regions: [region],
    clauses: [
      { id: 'c1', when: { event: 'bell', min: null }, where: null, target: { kind: 'rain', near: null, tags: [], region: null }, effect: { op: 'WEATHER_MODIFIER', mode: 'attract', magnitude: 2, toward: region }, duration: 'night' },
      { id: 'c2', when: { event: 'bell', min: null }, where: null, target: { kind: 'fire', near: null, tags: [], region: null }, effect: { op: 'ALTER_TEMPERATURE', delta: -2 }, duration: 'night' },
    ],
    omitted: [{ text: 'the orchard', reason: 'unrepresentable', why: 'Redbank has no orchard; this reading uses its fields in Eastbank' }],
    narrative: null,
  };
}

export const ring = (g: GameSession): void => {
  const bt = g.state.world.landmarks.find((l) => l.kind === 'belltower');
  if (bt) g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: bt.id });
};

export const lightEast = (g: GameSession): void => {
  for (const b of g.state.world.landmarks.filter((l) => l.kind === 'beacon' && l.district === 'east')) g.act({ type: 'RITUAL', ritual: 'light_beacon', landmark: b.id });
};

/**
 * A Redbank Generative Reality run in which `ast` is written on day 1 and every villager of its region firmly believes it each
 * morning (a white-box shortcut for the social part, which phase 09 tests through real persuasion). The law machinery itself still
 * decides when the law wakes. `daily` runs each day before it ends.
 */
export function playReality(ast: RealityAst | null, daily: (g: GameSession) => void, days = 7, scenarioId = 'redbank', seed = 1): { g: GameSession; claimId: string | null; actions: Action[] } {
  const g = GameSession.create({ scenarioId, seed, reality: true });
  g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
  let claimId: string | null = null;
  if (ast) {
    const b = buildRealityClaim(g.state, ast);
    if (!b.ok) throw new Error(`build failed: ${b.code} ${b.issues.join('; ')}`);
    const r = g.act({ type: 'COMPOSE', claim: b.draft.claim });
    if (!r.ok) throw new Error(`compose failed: ${r.error.code}`);
    claimId = b.draft.claim.id;
  }
  for (let d = 0; d < days && !g.state.outcome; d++) {
    if (claimId) {
      const region = ast!.regions[0];
      for (const v of g.state.villagers) if (v.district === region && v.status !== 'dead') v.beliefs[claimId] = { conv: 85, heard: 3, lastDay: g.state.day, lastSource: null, evidence: 30, cause: null, stale: 0 };
    }
    daily(g);
    g.endDay();
  }
  return { g, claimId, actions: g.log.slice() };
}
