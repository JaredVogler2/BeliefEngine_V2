import type { RitualDef, RunState } from '../core/types.ts';
import type { Clause, RealityAst, Trigger } from './ast.ts';

/**
 * Staging a written belief (rules 2, phase 11). V1's stories are proved the way a storyteller proves things: by performing the rite
 * on a night when the world will seem to answer it (a beacon lit while the river is already ebbing). A written belief that waits for a
 * catalyst the Keeper can make (the bell, a lantern, a smoke fire, a vigil) can be staged the same way, at that catalyst's landmark.
 * What makes a night kind is read from what the belief does, never from its words:
 *   water turned or held off, rain kept away    -> the river ebbing
 *   rain drawn onto a place                     -> rain coming
 *   the bridge made stronger                    -> a calm night
 *   wolves kept off, hidden from, slowed, lured -> a quiet pack
 *   crops grown                                 -> a clear night
 *   flames cooled, slowed, homes fireproofed    -> no wind
 *   anything else (hens, stones, feelings, hatching, light): no coincidence can show it
 * And once the belief is waking (its law has any progress), it will really act tonight where people can see it: a kind night.
 * A belief that cannot be shown and is not yet waking fails in front of its witnesses, with V1's price for a failed proof.
 */

export type Coincidence = RitualDef['omen'] | 'none';

const CATALYST_RITUAL: Record<string, string> = { bell: 'ring_bells', lantern: 'light_beacon', smoke_fire: 'burn_smoke', watchers: 'keep_vigil' };

function catalysts(t: Trigger, out: string[]): string[] {
  if ('event' in t) {
    if (CATALYST_RITUAL[t.event] && !out.includes(t.event)) out.push(t.event);
  } else if ('all' in t) t.all.forEach((x) => catalysts(x, out));
  else if ('any' in t) t.any.forEach((x) => catalysts(x, out));
  return out;
}

/** The ritual that stages this belief: the first catalyst its first clause waits for (then any clause's), if the village has that rite. */
export function demoRitualOf(s: Pick<RunState, 'scn'>, ast: RealityAst): string | undefined {
  const order = [...catalysts(ast.clauses[0].when, []), ...ast.clauses.slice(1).flatMap((c) => catalysts(c.when, []))];
  for (const ev of order) {
    const id = CATALYST_RITUAL[ev];
    if (s.scn.rituals.some((r) => r.id === id)) return id;
  }
  return undefined;
}

/**
 * What a staging can show: of the clauses the staged catalyst powers, the first whose effect a kind night can mimic (people judge a
 * belief by the part they can see; "chickens fly and the river turns away" is shown by the river, never by the hens).
 */
/** Does this rite power any of the belief's clauses (rather than only proving it, as its authored twin's rite does)? */
export function poweredBy(ast: RealityAst, ritual: string): boolean {
  return ast.clauses.some((c) => catalysts(c.when, []).some((ev) => CATALYST_RITUAL[ev] === ritual));
}

export function coincidenceOf(ast: RealityAst, ritual: string): Coincidence {
  const powered = ast.clauses.filter((c) => catalysts(c.when, []).some((ev) => CATALYST_RITUAL[ev] === ritual));
  for (const c of powered.length ? powered : [ast.clauses[0]]) {
    const k = clauseCoincidence(c);
    if (k !== 'none') return k;
  }
  return 'none';
}

function clauseCoincidence(c: Clause): Coincidence {
  const e = c.effect;
  const k = c.target.kind;
  switch (e.op) {
    case 'REDIRECT_FLOW':
      return e.mode === 'attract' ? 'none' : 'river_trend';
    case 'WEATHER_MODIFIER':
      return e.mode === 'repel' || (e.mode === 'redirect' && e.toward === null) ? 'river_trend' : 'rain_tonight';
    case 'RELOCATE_RESOURCE':
      return 'rain_tonight';
    case 'MOVE_AWAY':
      return k === 'water' ? 'river_trend' : k === 'wolf' ? 'pack_quiet' : 'none';
    case 'MOVE_TOWARD':
      return k === 'wolf' ? 'pack_quiet' : 'none';
    case 'MODIFY_DURABILITY':
      return k === 'bridge' && e.delta > 0 ? 'bridge_calm' : 'none';
    case 'MODIFY_VISIBILITY':
      return e.delta < 0 ? 'pack_quiet' : 'none';
    case 'MODIFY_MOVEMENT':
      return e.delta < 0 ? (k === 'wolf' ? 'pack_quiet' : 'fire_calm') : 'none';
    case 'GROW_ENTITY':
      return 'moon_clear';
    case 'ALTER_TEMPERATURE':
      return e.delta < 0 ? 'fire_calm' : 'none';
    case 'GIVE_STATUS_EFFECT':
      return e.status === 'fireproof' ? 'fire_calm' : 'none';
    default:
      return 'none';
  }
}

/** What the Keeper is told before staging (and the log after), by coincidence and omen value. */
export const WRITTEN_OMEN_TEXT: Record<Exclude<Coincidence, 'none'>, Record<-1 | 0 | 1, string>> = {
  river_trend: {
    1: 'Good omen: the river is ebbing tonight. It will look as if the belief turned it.',
    0: 'Weak omen: the river holds steady. Few will be impressed.',
    [-1]: 'Bad omen: the river is rising tonight. Staging it now will look foolish.',
  },
  rain_tonight: {
    1: 'Good omen: rain is coming. If it falls where the belief says, they will believe.',
    0: 'Weak omen: the sky is undecided.',
    [-1]: 'Bad omen: a dry night. Nothing will fall, and they will see it.',
  },
  bridge_calm: {
    1: 'Good omen: a calm night. The bridge will stand, and be seen to stand.',
    0: 'Weak omen: the river is working at the piers.',
    [-1]: 'Bad omen: the flood is heavy. The bridge may be seen to fail.',
  },
  pack_quiet: {
    1: 'Good omen: the pack is quiet tonight. It will look as if the belief kept them off.',
    0: 'Weak omen: wolves are restless.',
    [-1]: 'Bad omen: the pack is hunting tonight.',
  },
  moon_clear: {
    1: 'Good omen: a clear, bright night. The crops will look as if they grew for it.',
    0: 'Weak omen: haze over the moon.',
    [-1]: 'Bad omen: a dark night.',
  },
  fire_calm: {
    1: 'Good omen: no wind tonight. Flames will sit low, as the belief says.',
    0: 'Weak omen: an uncertain night for fire.',
    [-1]: 'Bad omen: wind stirs the embers.',
  },
};

export const WAKING_OMEN = 'Good omen: the belief is already waking, so tonight it will really act where people can see it.';
export const NO_COINCIDENCE_OMEN = 'Bad omen: nothing tonight can make this look true, and too few believe it yet for it to act. People will watch it fail.';
