import { allClaimDefs, claimDef, findLandmark } from '../core/lookup.ts';
import { hashKeys } from '../core/rng.ts';
import type { Landmark, RunState, Villager } from '../core/types.ts';
import { idx } from '../world/grid.ts';

/**
 * Villager intents as a small utility model. Every intent gets a score from visible needs and relationships (danger to home, family,
 * fatigue, duty, belief in a law that asks for a post, distance), the highest score wins, and ties break on a seeded hash. Scores are
 * integers so a decision can be shown to the player as numbers and read back as a sentence.
 */
export type IntentKind = 'work' | 'guard' | 'family' | 'safety' | 'rest';

export interface Intent {
  kind: IntentKind;
  label: string;
  score: number;
  /** one authored sentence tied to the state that produced the score */
  why: string;
}

/** 0..100: how dangerous a place is tonight, given predicted floodwater and fire. */
export function danger(s: RunState, lm: Landmark | undefined, water: number[]): number {
  if (!lm) return 0;
  const i = idx(s.world, lm.x, lm.y);
  const d = water[i] ?? 0;
  let r = d >= 3 ? 100 : d === 2 ? 75 : d === 1 ? 35 : 0;
  if (s.world.fire[i] >= 1) r = Math.max(r, 80);
  return r;
}

/** Household members who are home tonight and whose home is in danger (children and elders weigh most). */
export function householdAtRisk(s: RunState, v: Villager, water: number[]): { members: Villager[]; danger: number } {
  const home = findLandmark(s, v.homeId);
  const dgr = danger(s, home, water);
  if (dgr <= 0) return { members: [], danger: 0 };
  const members = s.villagers.filter((m) => m.id !== v.id && m.status !== 'dead' && m.household === v.household && m.homeId === v.homeId);
  return { members, danger: dgr };
}

function bridgeBelief(s: RunState, v: Villager): number {
  let best = 0;
  for (const c of allClaimDefs(s)) if (c.spec.subject === 'bridge' && c.spec.effect === 'strengthen' && c.spec.trigger.kind === 'watchers' && !c.rival) best = Math.max(best, v.beliefs[c.id]?.conv ?? 0);
  return best;
}

/** Score the intents open to a villager tonight. Deterministic. */
export function scoreIntents(s: RunState, v: Villager, water: number[]): Intent[] {
  const out: Intent[] = [];
  const home = findLandmark(s, v.homeId);
  const work = findLandmark(s, v.workId);
  const noise = (k: string) => (hashKeys(s.seed, 'intent', s.day, v.id, k) % 5) - 2; // bounded, seeded: -2..+2
  const sick = v.status === 'sick' || v.status === 'injured';
  const workDanger = danger(s, work, water);
  out.push({
    kind: 'work', label: 'Work', score: 48 + (v.archetype === 'farmer' ? 6 : 0) - Math.round(workDanger * 0.5) - (v.energy < 30 ? 45 : 0) - (sick ? 70 : 0) + noise('work'),
    why: workDanger > 0 ? `${work?.name ?? 'Their post'} is in the water’s path tonight` : `${work ? `Their post is ${work.name}` : 'They have a day’s work'}`,
  });
  out.push({
    kind: 'rest', label: 'Rest', score: 12 + Math.round((100 - v.energy) * 0.5) + (sick ? 70 : 0) + noise('rest'),
    why: sick ? 'They are too ill to work' : v.energy < 40 ? 'They are worn out' : 'They could rest',
  });
  const kin = householdAtRisk(s, v, water);
  if (kin.members.length) {
    const young = kin.members.filter((m) => m.archetype === 'child' || m.archetype === 'elder' || m.status !== 'ok').length;
    const guardian = kin.members.some((m) => m.archetype === 'child') && v.archetype !== 'child';
    out.push({
      kind: 'family', label: 'Stay with family', score: 30 + Math.round(kin.danger * 0.55) + young * 22 + Math.round(v.fear * 0.25) + (guardian ? 15 : 0) + noise('family'),
      why: `${young ? kin.members.filter((m) => m.archetype === 'child' || m.archetype === 'elder' || m.status !== 'ok').map((m) => m.name.split(' ')[0]).join(' and ') : 'Their household'} would face the water at home`,
    });
  }
  const bb = bridgeBelief(s, v);
  if (bb >= 45 && s.world.landmarks.some((l) => l.kind === 'bridge' && l.hp > 0)) {
    const keeper = v.role.toLowerCase().includes('bridge');
    out.push({
      kind: 'guard', label: 'Keep watch on the bridge', score: 40 + Math.round(bb * 0.25) + (keeper ? 15 : 0) + noise('guard'),
      why: `They believe the bridge stands while watched (${Math.round(bb)})`,
    });
  }
  const homeDanger = danger(s, home, water);
  if (homeDanger >= 60) out.push({ kind: 'safety', label: 'Seek safety', score: Math.round(homeDanger * 0.9) + Math.round(v.fear * 0.2) + noise('safety'), why: 'Their own home is likely to flood' });
  out.sort((a, b) => b.score - a.score || (a.kind < b.kind ? -1 : 1));
  return out;
}

export function chooseIntent(s: RunState, v: Villager, water: number[]): Intent {
  return scoreIntents(s, v, water)[0];
}

/** Which claim a believer's bridge duty rests on, for explanations. */
export function bridgeClaimName(s: RunState): string {
  const c = allClaimDefs(s).find((d) => d.spec.subject === 'bridge' && d.spec.effect === 'strengthen' && d.spec.trigger.kind === 'watchers' && !d.rival);
  return c ? claimDef(s, c.id).short : 'the bridge law';
}
