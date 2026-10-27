import type { RunState } from '../core/types.ts';
import { regionAt } from '../world/grid.ts';
import { conditionTests, triggerEvents, type Clause, type RealityAst, type Trigger, type TriggerEvent } from './ast.ts';
import { anchorsIn } from './execute.ts';
import { ANCHOR_LABEL, KINDS, kindAvailable } from './ontology.ts';
import { OPERATORS } from './operators.ts';

/**
 * Grounding: does this village actually contain what a valid belief talks about? A belief can be well formed and still name a
 * bell in a village without one, wolves where there are none, or rain in a chapter whose forecast never rains. Problems that
 * make a clause impossible are `issues` (the belief is refused); things that make it weak or rare are `notes` (shown, allowed).
 */

export interface Grounding {
  ok: boolean;
  issues: string[];
  notes: string[];
}

const POSITIONAL: TriggerEvent[] = ['bell', 'lantern', 'smoke_fire', 'watchers', 'spoken', 'ritual'];

function eventAvailable(s: RunState, e: TriggerEvent, kinds: Set<string>): string | null {
  switch (e) {
    case 'bell':
      return kinds.has('belltower') ? null : 'this village has no bell tower to ring';
    case 'lantern':
      return kinds.has('beacon') ? null : 'this village has no lanterns or beacons to light';
    case 'smoke_fire':
      return kinds.has('campfire') ? null : 'this village has no smoke fires';
    case 'watchers':
      return kinds.has('bridge') ? null : 'this village has no bridge to watch';
    case 'flood':
      return s.scn.features.flood ? null : 'this village has no flood';
    default:
      return null;
  }
}

/** Triggers whose sources are heard or watched by the whole village (as in V1): the bell, and watchers on the bridge. */
const GLOBAL_SOURCE: Partial<Record<TriggerEvent, string>> = { bell: 'belltower', watchers: 'bridge' };
/** Triggers powered only by sources inside the law's own region (as in V1): lanterns and smoke fires. */
const LOCAL_SOURCE: Partial<Record<TriggerEvent, string>> = { lantern: 'beacon', smoke_fire: 'campfire' };

/** Why a trigger can never fire for a law of `region`, or null when it can. "Not" can always fire; "any" needs one part. */
function neverFires(s: RunState, t: Trigger, region: string, name: string): string | null {
  if ('event' in t) {
    const kind = LOCAL_SOURCE[t.event];
    return kind && !anchorsIn(s, kind, region).length ? `there ${t.event === 'lantern' ? 'are no lanterns' : 'are no smoke fires'} in ${name} to power it` : null;
  }
  if ('not' in t) return null;
  if ('all' in t) return t.all.map((x) => neverFires(s, x, region, name)).find((x) => x) ?? null;
  const why = t.any.map((x) => neverFires(s, x, region, name));
  return why.every((x) => x) ? why[0] : null;
}

export function groundAst(s: RunState, ast: RealityAst): Grounding {
  const issues: string[] = [];
  const notes: string[] = [];
  const v2 = s.v2;
  if (!v2) return { ok: false, issues: ['written beliefs in the reality language belong to Generative Reality runs'], notes };
  const kinds = new Set(s.world.landmarks.map((l) => l.kind as string));
  const regionIds = new Set(s.world.regions.map((r) => r.id));
  for (const r of ast.regions) if (!regionIds.has(r)) issues.push(`there is no region "${r}" in this village`);
  ast.clauses.forEach((c: Clause, i) => {
    const at = ast.clauses.length > 1 ? `clause ${i + 1}: ` : '';
    const k = KINDS[c.target.kind];
    if (!kindAvailable(c.target.kind, s.scn.features, kinds, true)) issues.push(`${at}this village has no ${k.label}`);
    if (c.target.region && !regionIds.has(c.target.region)) issues.push(`${at}there is no region "${c.target.region}"`);
    if (c.target.near && !kinds.has(c.target.near.anchor)) issues.push(`${at}there is no ${c.target.near.anchor} here to measure from`);
    const events = triggerEvents(c.when);
    for (const e of events) {
      const why = eventAvailable(s, e, kinds);
      if (why) issues.push(`${at}${why}`);
    }
    // each region's law needs its own power and its own landmark to measure from (the executor uses exactly these)
    for (const r of ast.regions) {
      if (!regionIds.has(r)) continue;
      const name = s.world.regions.find((x) => x.id === r)?.name ?? r;
      const never = neverFires(s, c.when, r, name);
      if (never) issues.push(`${at}${never}`);
      const anchor = c.target.near?.anchor;
      if (anchor && kinds.has(anchor) && !events.some((e) => GLOBAL_SOURCE[e] === anchor) && !anchorsIn(s, anchor, r).length)
        issues.push(`${at}there is no ${ANCHOR_LABEL[anchor] ?? anchor} in ${name} to measure from (beliefs act where their believers live)`);
    }
    if (events.includes('rain') && !s.threat.some((t) => t.rain > 0)) notes.push(`${at}the forecast for this chapter has no rain, so this may never fire`);
    if (events.includes('flood') && !s.threat.some((t) => t.level >= 3)) notes.push(`${at}the river is not forecast to rise that high`);
    const e = c.effect;
    const op = OPERATORS[e.op];
    if (!op.executes) issues.push(`${at}${op.why}`);
    if ((e.op === 'GROW_ENTITY' || e.op === 'DECAY_ENTITY') && !s.scn.features.crops) issues.push(`${at}the fields here are not grown night by night, so nothing would change`);
    if ((e.op === 'ALTER_TEMPERATURE' || (e.op === 'MODIFY_MOVEMENT' && c.target.kind === 'fire')) && !s.scn.features.fire) issues.push(`${at}fire does not spread in this village, so nothing would change`);
    if (e.op === 'MODIFY_VISIBILITY' && !s.scn.features.wolves) issues.push(`${at}there are no wolves here to hide anything from`);
    if ((e.op === 'REDIRECT_FLOW' || ((e.op === 'MOVE_AWAY' || e.op === 'MOVE_TOWARD') && c.target.kind !== 'chicken')) && !events.some((x) => POSITIONAL.includes(x)) && !c.target.near)
      issues.push(`${at}moving water or wolves needs a place to act from: a lantern, a bell, a fire, the bridge, or "near" something`);
    if ((e.op === 'WEATHER_MODIFIER' && e.toward && !regionIds.has(e.toward)) || (e.op === 'RELOCATE_RESOURCE' && !regionIds.has(e.toward))) issues.push(`${at}there is no region to send the water to by that name`);
    if (e.op === 'SPAWN_BOUNDED_ENTITY' && !v2.coops.length) issues.push(`${at}there are no coops in this village`);
    if (c.target.kind === 'chicken' && v2.chickens.filter((x) => x.alive).length === 0) notes.push(`${at}no chickens are alive right now`);
    // a belief can be well grounded and still find nothing where its believers live
    for (const r of ast.regions) {
      if (!regionIds.has(r) || r === 'river') continue;
      const name = s.world.regions.find((x) => x.id === r)?.name ?? r;
      const none = (what: string) => notes.push(`${at}there are no ${what} in ${name} right now, so it would find nothing to act on there`);
      if (c.target.kind === 'chicken' && !v2.chickens.some((x) => x.alive && (v2.coops.find((k) => k.id === x.coop)?.region ?? '') === r)) none('chickens');
      if (c.target.kind === 'stone' && !v2.stones.some((x) => x.state === 'loose' && regionAt(s.world, x.x, x.y) === r)) none('loose stones');
      if (c.target.kind === 'livestock' && !s.world.landmarks.some((l) => l.kind === 'pen' && l.district === r)) none('pens');
      if (c.target.kind === 'field' && !s.world.landmarks.some((l) => l.kind === 'field' && l.district === r)) none('fields');
    }
    if (c.target.kind === 'stone' && v2.stones.filter((x) => x.state === 'loose').length === 0) notes.push(`${at}no loose stones are left`);
    if (conditionTests(c.where).includes('blue') && !s.villagers.some((v) => v.status !== 'dead' && v.look.hue >= 190 && v.look.hue <= 260)) notes.push(`${at}nobody here wears blue right now`);
  });
  return { ok: issues.length === 0, issues, notes };
}
