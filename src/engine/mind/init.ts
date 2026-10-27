import { clamp, rand } from '../core/rng.ts';
import type { RunState, Villager } from '../core/types.ts';
import { TRAITS, type GoalId, type Mind, type MindsState, type Personality } from './types.ts';

/**
 * A mind for each villager, derived only from what the run already holds: V1's traits (skepticism, openness, stubbornness,
 * influence), the archetype the scenario gave them, their household, work and home, and the run seed. Bounded tendencies, not
 * stereotypes: every trait keeps seeded spread around its archetype's centre, and nothing here is ever written by a model.
 */

const ARCHETYPE: Record<string, Partial<Personality>> = {
  farmer: { courage: 55, altruism: 50, ambition: 35, curiosity: 35 },
  child: { curiosity: 80, fear: 60, courage: 35, ambition: 20, altruism: 55 },
  parent: { fear: 60, altruism: 75, courage: 50, ambition: 30 },
  trader: { ambition: 70, curiosity: 50, altruism: 35 },
  scholar: { curiosity: 80, ambition: 45, altruism: 45 },
  rival: { ambition: 80, courage: 60, altruism: 25 },
  reeve: { ambition: 60, altruism: 45, courage: 55 },
  preacher: { altruism: 70, courage: 55, ambition: 45 },
  hermit: { curiosity: 40, altruism: 30, ambition: 15, courage: 60 },
  elder: { curiosity: 35, altruism: 60, courage: 45, ambition: 30 },
  ringer: { courage: 55, altruism: 55, curiosity: 45 },
  keeper: { courage: 60, ambition: 50, altruism: 50 },
  witness_truster: { curiosity: 55, altruism: 50 },
};

const spread = (s: RunState, v: Villager, t: string, width: number) => Math.round((rand(s.seed, 'mind-trait', v.id, t) - 0.5) * 2 * width);

export function personalityOf(s: RunState, v: Villager): Personality {
  const a = ARCHETYPE[v.archetype] ?? {};
  const p = {} as Personality;
  for (const t of TRAITS) {
    let centre: number;
    if (t === 'skepticism') centre = v.traits.skepticism;
    else if (t === 'stubbornness') centre = v.traits.stubbornness;
    else if (t === 'curiosity') centre = Math.round(0.5 * (a.curiosity ?? 50) + 0.5 * v.traits.openness);
    else if (t === 'ambition') centre = Math.round(0.6 * (a.ambition ?? 45) + 0.4 * v.traits.influence);
    else centre = a[t] ?? (t === 'fear' ? 40 : 50);
    // skepticism and stubbornness are V1's own numbers: they keep them exactly
    p[t] = clamp(t === 'skepticism' || t === 'stubbornness' ? centre : centre + spread(s, v, t, 10), 5, 95);
  }
  return p;
}

export function goalsOf(s: RunState, v: Villager, p: Personality): GoalId[] {
  const work = s.world.landmarks.find((l) => l.id === v.workId);
  const kids = s.villagers.some((x) => x.household === v.household && x.archetype === 'child' && x.id !== v.id);
  const role = v.role.toLowerCase();
  const wanted: [GoalId, boolean][] = [
    ['feed_family', kids || v.archetype === 'parent'],
    ['protect_bridge', role.includes('bridge') || role.includes('ferry') || v.district === 'river'],
    ['protect_herd', work?.kind === 'pen' || role.includes('herd') || role.includes('shepherd')],
    ['protect_fields', work?.kind === 'field'],
    ['protect_home', !!(s.scn.features.flood || s.scn.features.fire) && v.archetype !== 'child'],
    ['keep_safe', p.fear >= 65],
    ['find_proof', p.skepticism >= 65],
    ['oppose_rumours', p.skepticism >= 75 || v.archetype === 'rival'],
    ['keep_order', v.archetype === 'elder' || v.archetype === 'reeve' || v.archetype === 'preacher'],
    ['gain_standing', p.ambition >= 65],
  ];
  return wanted.filter(([, on]) => on).map(([g]) => g).slice(0, 3);
}

export function initMinds(s: RunState): MindsState {
  const agents: Record<string, Mind> = {};
  for (const v of s.villagers) {
    const personality = personalityOf(s, v);
    agents[v.id] = { personality, base: { ...personality }, goals: goalsOf(s, v, personality), episodes: [], summary: [] };
  }
  return { v: 1, agents, nextEpisode: 1, seen: s.nextEventId - 1 };
}
