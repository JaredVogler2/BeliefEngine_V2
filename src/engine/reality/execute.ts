import { emit, type Ctx } from '../core/events.ts';
import { claimDef, modActive } from '../core/lookup.ts';
import type { ClaimDef, LawState, RunState } from '../core/types.ts';
import { stampShield, triggerSources, type Modifiers, type Source } from '../laws/effects.ts';
import { activeLaws } from '../laws/resolver.ts';
import { cheb, idx, regionAt } from '../world/grid.ts';
import { triggerEvents, type Clause, type CondTest, type Condition, type Selector, type Trigger } from './ast.ts';
import { ANCHOR_LABEL, KINDS, type TargetKind } from './ontology.ts';
import { OPERATORS, type OpId } from './operators.ts';
import type { AppliedEffect } from './state.ts';

/**
 * The Generative Reality executor. Each night, after V1's own laws have produced their modifiers and before the hazards run:
 *
 *   1. every active reality law's clauses are taken in a fixed order (operator tick order, then law id, then clause id);
 *   2. its trigger is tested against what physically happened today (a bell rung, a beacon lit, rain, watchers, words spoken...);
 *   3. its selector is resolved to at most 40 concrete targets (entities, landmarks, villagers, tiles) in the law's region;
 *   4. its operator turns that into *contributions*: intended changes, nothing is written yet;
 *   5. contributions to the same property are combined: same direction by the property's rule (strongest or capped sum), opposite
 *      directions by support-weighted competition (each side's pull times the support behind it), never by whichever law ran last;
 *   6. the result is written into the night's modifiers (so V1's flood, fire, crop, wolf and sickness code carries the physical
 *      consequence) and into entity intents (entities.ts), and every change becomes an event with the law that caused it.
 *
 * Nothing here can recurse: an effect never fires a trigger the same night, and the number of clauses and targets is bounded.
 */

export interface EntityIntents {
  /** chicken or stone id → height lifted tonight (tiles) */
  lift: Record<string, number>;
  /** chicken or stone id → push in tiles [dx, dy] */
  push: Record<string, [number, number]>;
  /** stone id → change of weight tonight (loads) */
  mass: Record<string, number>;
  /** villager id → change of fear at dawn */
  fear: Record<string, number>;
  /** coop id → chicks to hatch at dawn */
  hatch: Record<string, number>;
  /** field id → extra food its tireless workers bring in at dawn (villages whose crops are not grown night by night) */
  yield: Record<string, number>;
  /** beacons burning double fuel tonight */
  extraFuel: string[];
  /** which law and clause produced each entity intent (for credit and the debrief) */
  by: Record<string, { law: string; claim: string; clause: string }>;
}

export interface RealityPlan {
  intents: EntityIntents;
  applied: AppliedEffect[];
}

interface Contribution {
  key: string;
  value: number;
  /** support behind it: law pressure x law strength */
  weight: number;
  law: string;
}

/** How contributions to one property combine when they agree: the strongest wins, or they add up within the property's range. */
const COMBINE: Record<string, { mode: 'max' | 'sum'; lo: number; hi: number; int?: boolean }> = {
  flood: { mode: 'max', lo: -3, hi: 3, int: true },
  predBlock: { mode: 'max', lo: 0, hi: 3, int: true },
  predLure: { mode: 'max', lo: 0, hi: 3, int: true },
  level: { mode: 'sum', lo: -3, hi: 0, int: true },
  sink: { mode: 'sum', lo: 0, hi: 3, int: true },
  rainBonus: { mode: 'sum', lo: -3, hi: 3, int: true },
  cropBoost: { mode: 'sum', lo: -30, hi: 60, int: true },
  fireCut: { mode: 'sum', lo: -0.5, hi: 0.8 },
  spread: { mode: 'sum', lo: -0.8, hi: 1 },
  sick: { mode: 'sum', lo: -0.8, hi: 0 },
  cold: { mode: 'sum', lo: -10, hi: 10, int: true },
  labor: { mode: 'sum', lo: -60, hi: 60, int: true },
  bridgeHard: { mode: 'max', lo: -0.5, hi: 0.9 },
  bridgeFlow: { mode: 'max', lo: -3, hi: 3, int: true },
  homeShield: { mode: 'max', lo: -0.5, hi: 0.7 },
  homeFire: { mode: 'sum', lo: -0.6, hi: 0.9 },
  fireproof: { mode: 'max', lo: 0, hi: 1, int: true },
  wolfSteps: { mode: 'sum', lo: -2, hi: 2, int: true },
  lift: { mode: 'max', lo: 0, hi: 3, int: true },
  pushx: { mode: 'sum', lo: -3, hi: 3, int: true },
  pushy: { mode: 'sum', lo: -3, hi: 3, int: true },
  mass: { mode: 'sum', lo: -5, hi: 3, int: true },
  fear: { mode: 'sum', lo: -40, hi: 40, int: true },
  hatch: { mode: 'sum', lo: 0, hi: 3, int: true },
  yield: { mode: 'max', lo: 0, hi: 1, int: true },
  fuel: { mode: 'max', lo: 0, hi: 1, int: true },
  light: { mode: 'sum', lo: -2, hi: 2, int: true },
};

const scaled = (mag: number, st: number): number => Math.max(1, Math.round(mag * (0.5 + 0.5 * st)));
const tonight = (s: RunState) => s.threat[Math.min(s.day, s.threat.length) - 1];

// ------------------------------------------------------------------------------------------ triggers

interface Fire {
  on: boolean;
  /** where the power comes from (positions), possibly empty for region-wide triggers */
  sources: Source[];
  count: number;
}

const OFF: Fire = { on: false, sources: [], count: 0 };
const ON: Fire = { on: true, sources: [], count: 1 };

/** Is a place inside a region? The river commons ('river') spans the whole village, as in V1. */
export function inRegion(s: RunState, region: string, x: number, y: number, district?: string): boolean {
  if (region === 'river') return true;
  return (district ?? regionAt(s.world, x, y)) === region || regionAt(s.world, x, y) === region;
}

const inLawRegion = (s: RunState, law: LawState, x: number, y: number, district?: string): boolean => inRegion(s, law.regionId, x, y, district);

/** Landmarks a "near" selector measures from: those of the anchor's kind inside the law's region. */
export function anchorsIn(s: RunState, anchor: string, region: string): Source[] {
  return s.world.landmarks.filter((l) => l.kind === anchor && inRegion(s, region, l.x, l.y, l.district)).map((l) => ({ id: l.id, x: l.x, y: l.y }));
}

export function fires(s: RunState, t: Trigger, law: LawState): Fire {
  if ('all' in t) {
    const parts = t.all.map((x) => fires(s, x, law));
    if (!parts.every((p) => p.on)) return OFF;
    const positional = parts.find((p) => p.sources.length);
    return { on: true, sources: positional?.sources ?? [], count: Math.min(...parts.map((p) => p.count)) };
  }
  if ('any' in t) {
    const parts = t.any.map((x) => fires(s, x, law)).filter((p) => p.on);
    if (!parts.length) return OFF;
    const seen = new Set<string>();
    const sources = parts.flatMap((p) => p.sources).filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
    return { on: true, sources, count: Math.max(...parts.map((p) => p.count)) };
  }
  if ('not' in t) return fires(s, t.not, law).on ? OFF : ON;
  const lm = s.world.landmarks;
  const th = tonight(s);
  const min = t.min ?? 1;
  const listed = (xs: { id: string; x: number; y: number }[]): Fire => (xs.length >= 1 ? { on: true, sources: xs.map((l) => ({ id: l.id, x: l.x, y: l.y })), count: xs.length } : OFF);
  switch (t.event) {
    case 'bell':
      return listed(lm.filter((l) => l.kind === 'belltower' && (l.data.ringing ?? 0) > 0));
    case 'lantern':
      return listed(lm.filter((l) => l.kind === 'beacon' && l.lit && l.fuelNights > 0 && inLawRegion(s, law, l.x, l.y, l.district)));
    case 'smoke_fire':
      return listed(lm.filter((l) => l.kind === 'campfire' && l.lit && l.fuelNights > 0 && inLawRegion(s, law, l.x, l.y, l.district)));
    case 'watchers': {
      const br = lm.find((l) => l.kind === 'bridge' && l.hp > 0);
      return br && (br.data.watchers ?? 0) >= min ? { on: true, sources: [{ id: br.id, x: br.x, y: br.y }], count: br.data.watchers ?? 0 } : OFF;
    }
    case 'night':
    case 'always':
      return ON;
    case 'rain':
      return (th?.rain ?? 0) > 0 ? { on: true, sources: [], count: th!.rain } : OFF;
    case 'clear_night':
      return (th?.rain ?? 0) === 0 ? ON : OFF;
    case 'flood':
      return (th?.level ?? 0) >= (t.min ?? 3) ? { on: true, sources: [], count: th!.level } : OFF;
    case 'spoken': {
      // words said today: each villager the Keeper told or gathered counts once, at the place they heard it
      const heard = new Map<string, Source>();
      for (const r of s.today) {
        const a = r.action;
        const ids = a.type === 'SEED' || a.type === 'COUNTER' ? [a.target] : a.type === 'MESSENGER' ? [a.to] : a.type === 'GATHER' ? (a.invite ?? []) : [];
        for (const id of ids) {
          const v = s.villagers.find((x) => x.id === id && x.status !== 'dead');
          if (v && !heard.has(v.id)) heard.set(v.id, { id: v.id, x: v.x, y: v.y });
        }
      }
      return heard.size >= min ? { on: true, sources: [...heard.values()].sort((a, b) => (a.id < b.id ? -1 : 1)), count: heard.size } : OFF;
    }
    case 'ritual': {
      const done = s.today.filter((r) => r.action.type === 'RITUAL').map((r) => (r.action as { landmark: string }).landmark);
      return listed(lm.filter((l) => done.includes(l.id)));
    }
  }
}

// ------------------------------------------------------------------------------------------ conditions

function envTest(s: RunState, t: CondTest): boolean | null {
  const th = tonight(s);
  switch (t) {
    case 'raining':
      return (th?.rain ?? 0) > 0;
    case 'clear':
      return (th?.rain ?? 0) === 0;
    case 'windy':
      return (th?.wind ?? 0) >= 2;
    case 'flooding':
      return (th?.level ?? 0) >= 3;
    default:
      return null;
  }
}

export interface Target {
  id: string;
  kind: TargetKind;
  x: number;
  y: number;
}

function targetTest(s: RunState, t: CondTest, tg: Target): boolean {
  const env = envTest(s, t);
  if (env !== null) return env;
  const raining = (tonight(s)?.rain ?? 0) > 0;
  switch (t) {
    case 'wet':
    case 'dry': {
      const stone = tg.kind === 'stone' ? s.v2?.stones.find((x) => x.id === tg.id) : undefined;
      const wet = stone ? stone.wet > 0 || raining : raining || (tg.x >= 0 && s.world.water[idx(s.world, tg.x, tg.y)] > 0);
      return t === 'wet' ? wet : !wet;
    }
    case 'lit':
      return tg.kind === 'lantern' ? !!s.world.landmarks.find((l) => l.id === tg.id && l.lit && l.fuelNights > 0) : s.world.landmarks.some((l) => l.kind === 'beacon' && l.lit && l.fuelNights > 0 && cheb(l.x, l.y, tg.x, tg.y) <= 2);
    case 'blue': {
      const v = tg.kind === 'villager' ? s.villagers.find((x) => x.id === tg.id) : undefined;
      return !!v && v.look.hue >= 190 && v.look.hue <= 260;
    }
    case 'airborne':
      return (tg.kind === 'chicken' ? s.v2?.chickens.find((c) => c.id === tg.id)?.alt ?? 0 : 0) > 0;
    case 'healthy': {
      const v = tg.kind === 'villager' ? s.villagers.find((x) => x.id === tg.id) : undefined;
      return v ? v.status === 'ok' : true;
    }
    default:
      return true;
  }
}

/** A condition tree: environment tests apply to the night, target tests to each target (a region-level target uses the night). */
export function holds(s: RunState, c: Condition | null, tg: Target | null): boolean {
  if (!c) return true;
  if ('all' in c) return c.all.every((x) => holds(s, x, tg));
  if ('any' in c) return c.any.some((x) => holds(s, x, tg));
  if ('not' in c) return !holds(s, c.not, tg);
  if (!tg) return envTest(s, c.test) ?? true;
  return targetTest(s, c.test, tg);
}

// ------------------------------------------------------------------------------------------ selectors

export const MAX_TARGETS = 40;
const REGION_LEVEL: TargetKind[] = ['water', 'rain', 'fire', 'smoke'];

function candidates(s: RunState, kind: TargetKind): Target[] {
  const w = s.world;
  const lms = (kinds: string[], ok: (l: (typeof w.landmarks)[number]) => boolean = () => true) => w.landmarks.filter((l) => kinds.includes(l.kind) && ok(l)).map((l) => ({ id: l.id, kind, x: l.x, y: l.y }));
  switch (kind) {
    case 'chicken':
      return (s.v2?.chickens ?? []).filter((c) => c.alive).map((c) => ({ id: c.id, kind, x: c.x, y: c.y }));
    case 'stone':
      return (s.v2?.stones ?? []).filter((x) => x.state === 'loose').map((x) => ({ id: x.id, kind, x: x.x, y: x.y }));
    case 'bridge':
      return lms(['bridge'], (l) => l.hp > 0);
    case 'home':
      return lms(['home', 'cabin'], (l) => l.hp > 0);
    case 'field':
      return lms(['field'], (l) => !l.data.ruined);
    case 'lantern':
      return lms(['beacon']);
    case 'bell':
      return lms(['belltower']);
    case 'livestock':
      return lms(['pen'], (l) => (l.data.stock ?? 0) > 0);
    case 'villager':
      return s.villagers.filter((v) => v.status !== 'dead').map((v) => ({ id: v.id, kind, x: v.x, y: v.y }));
    case 'wolf':
      return w.packs.map((p) => ({ id: p.id, kind, x: p.x, y: p.y }));
    default:
      return [];
  }
}

/**
 * Concrete targets for a selector tonight, in the law's region, near the anchor if one is named (the trigger's own sources when
 * they are of the anchor's kind: "chickens near the ringing bell"), carrying the tags and meeting the per-target conditions.
 */
export function resolveTargets(s: RunState, sel: Selector, law: LawState, sources: Source[], light: number, where: Condition | null): Target[] {
  if (REGION_LEVEL.includes(sel.kind)) return [{ id: sel.region ?? law.regionId, kind: sel.kind, x: -1, y: -1 }];
  const region = sel.region ?? law.regionId;
  let list = candidates(s, sel.kind).filter((t) => region === 'river' || regionAt(s.world, t.x, t.y) === region || sel.kind === 'bridge' || sel.kind === 'bell' || sel.kind === 'wolf');
  if (sel.near) {
    const anchorSources = sources.filter((src) => s.world.landmarks.find((l) => l.id === src.id)?.kind === sel.near!.anchor);
    const anchors = anchorSources.length ? anchorSources : anchorsIn(s, sel.near.anchor, law.regionId);
    const r = sel.near.radius + (sel.near.anchor === 'beacon' ? light : 0);
    list = list.filter((t) => anchors.some((a) => Math.hypot(a.x - t.x, a.y - t.y) <= r + 0.5));
  }
  for (const tag of sel.tags) list = list.filter((t) => targetTest(s, tag, t));
  list = list.filter((t) => holds(s, where, t));
  return list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, MAX_TARGETS);
}

// ------------------------------------------------------------------------------------------ operators → contributions

interface Work {
  law: LawState;
  def: ClaimDef;
  clause: Clause;
}

function regionsOf(t: Target[], law: LawState): string[] {
  const out = new Set<string>();
  for (const x of t) out.add(x.x < 0 ? x.id : law.regionId);
  return [...out].filter((r) => r && r !== 'river');
}

/**
 * The districts a region-wide effect reaches. The river commons runs through every district, so an effect on it ("flames burn
 * weaker" in a belief held along the river) reaches all of them; the hazards read their modifiers by district, never by 'river'.
 */
export function districtsOf(s: RunState, regions: string[]): string[] {
  const out = new Set<string>();
  for (const r of regions) {
    if (r === 'river') for (const x of s.world.regions) if (x.id !== 'river') out.add(x.id);
    if (r !== 'river') out.add(r);
  }
  return [...out].sort();
}

function describe(clause: Clause, n: number, s: RunState, def: ClaimDef): string {
  const e = clause.effect;
  const what = KINDS[clause.target.kind].label;
  const count = clause.target.kind === 'water' || clause.target.kind === 'rain' || clause.target.kind === 'fire' || clause.target.kind === 'smoke' ? '' : `${n} `;
  const why = `“${def.short}”`;
  switch (e.op) {
    case 'APPLY_FORCE':
      return e.direction === 'up' ? `${why}: ${count}${what} rise ${e.magnitude} tile${e.magnitude === 1 ? '' : 's'} into the air.` : `${why}: ${count}${what} are pushed ${e.direction === 'away' ? 'away from' : 'toward'} ${fromWhat(clause)}.`;
    case 'REDIRECT_FLOW':
      return `${why}: floodwater is ${e.mode === 'attract' ? 'drawn toward' : e.mode === 'slow' ? 'slowed around' : 'turned away from'} ${fromWhat(clause)} within ${e.radius} tiles.`;
    case 'WEATHER_MODIFIER':
      return `${why}: the rain is ${e.mode === 'repel' ? 'pushed back' : e.mode === 'redirect' ? 'drawn off the river' : 'called in'}${e.toward ? ` toward ${s.world.regions.find((r) => r.id === e.toward)?.name ?? e.toward}` : ''}.`;
    case 'SET_MATERIAL_PROPERTY':
      return `${why}: ${count}${what} become ${e.property === 'mass' ? (e.delta < 0 ? 'lighter' : 'heavier') : e.property === 'flammability' ? (e.delta < 0 ? 'slow to burn' : 'quick to burn') : e.delta > 0 ? 'harder' : 'softer'} (${e.delta > 0 ? '+' : ''}${e.delta}).`;
    case 'GROW_ENTITY':
      return `${why}: crops in ${count}fields ripen faster tonight.`;
    case 'DECAY_ENTITY':
      return `${why}: crops in ${count}fields wither tonight.`;
    case 'ALTER_TEMPERATURE':
      return e.delta < 0 ? `${why}: flames burn weaker here tonight, and the hearths warm less (the weak feel the cold).` : `${why}: flames burn hotter here tonight.`;
    case 'CHANGE_LIGHT':
      return `${why}: lantern light reaches ${e.delta > 0 ? 'further' : 'less far'} (${e.delta > 0 ? '+' : ''}${e.delta} tiles).`;
    case 'MODIFY_DURABILITY':
      return `${why}: ${count}${what} ${e.delta > 0 ? 'hold stronger' : 'grow weaker'} tonight.`;
    case 'MODIFY_VISIBILITY':
      return `${why}: ${count}${what} are ${e.delta < 0 ? 'hidden from' : 'shown to'} the wolves.`;
    case 'MODIFY_MOVEMENT':
      return `${why}: ${what} move ${e.delta < 0 ? 'slower' : 'faster'} tonight.`;
    case 'MOVE_AWAY':
    case 'MOVE_TOWARD':
      return `${why}: ${what} are ${e.op === 'MOVE_AWAY' ? 'driven away from' : 'drawn toward'} ${fromWhat(clause)} within ${e.radius} tiles.`;
    case 'INFLUENCE_MOTIVATION':
      return e.motive === 'diligence'
        ? `${why}: ${count}villagers work without tiring, and the fields they tend give a little more (feelings only; beliefs are their own).`
        : `${why}: ${count}villagers feel ${e.motive === 'calm' ? 'calmer' : 'braver'} (feelings only; beliefs are their own).`;
    case 'SPAWN_BOUNDED_ENTITY':
      return `${why}: eggs will hatch at dawn (each chick costs one food).`;
    case 'RELOCATE_RESOURCE':
      return `${why}: water is drawn from the river toward ${s.world.regions.find((r) => r.id === e.toward)?.name ?? e.toward}.`;
    case 'GIVE_STATUS_EFFECT':
      return `${why}: ${count}${what} are ${e.status === 'fireproof' ? 'untouched by fire' : e.status === 'sick_resistant' ? 'shielded from sickness' : 'kept warm'} tonight.`;
    default:
      return `${why} acts.`;
  }
}

const POWER_PLACE: Partial<Record<string, string>> = { bell: 'the ringing bell tower', lantern: 'the lit lanterns', smoke_fire: 'the smoke fires', watchers: 'the watched bridge' };
const MANY = new Set(['beacon', 'campfire', 'home', 'field', 'pen']);

/** What a positional effect is measured from, in words: the landmark the clause names, else the place that powers it. */
function fromWhat(clause: Clause): string {
  const near = clause.target.near;
  if (near) return `the ${ANCHOR_LABEL[near.anchor] ?? near.anchor}${MANY.has(near.anchor) ? 's' : ''}`;
  const ev = triggerEvents(clause.when).find((x) => POWER_PLACE[x]);
  return ev ? POWER_PLACE[ev]! : 'where it is powered';
}

function contribute(s: RunState, wk: Work, sources: Source[], targets: Target[], light: number, out: Contribution[], intents: EntityIntents, mods: Modifiers, cool: Record<string, number>): void {
  const { law, clause } = wk;
  const e = clause.effect;
  const st = law.strength;
  const weight = Math.max(0.01, law.pressure * st);
  const push = (key: string, value: number) => {
    if (value !== 0 && Number.isFinite(value)) out.push({ key, value, weight, law: law.id });
  };
  const by = (id: string) => (intents.by[id] ??= { law: law.id, claim: wk.def.id, clause: clause.id });
  // what a positional effect is measured from: the landmark the clause names ("…keeps clear of the bridge"), preferring the ones
  // powering it tonight (the lit lanterns), else what powers it (the ringing bell tower)
  const anchorSources = (): Source[] => {
    const near = clause.target.near;
    if (!near) return sources;
    const lit = sources.filter((src) => s.world.landmarks.find((l) => l.id === src.id)?.kind === near.anchor);
    return lit.length ? lit : anchorsIn(s, near.anchor, law.regionId);
  };
  const stamp = (prefix: 'flood' | 'predBlock' | 'predLure', radius: number, mag: number, sign: 1 | -1) => {
    const n = s.world.w * s.world.h;
    const arr = new Array<number>(n).fill(0);
    for (const src of anchorSources()) {
      // a flood ward powered by a fire the night has cooled stands lower (see coolingOf)
      const lm = s.world.landmarks.find((l) => l.id === src.id);
      const dim = prefix === 'flood' && sign === 1 && lm && (lm.kind === 'beacon' || lm.kind === 'campfire') ? (cool[lm.district] ?? 0) : 0;
      const b = scaled(mag, st) - dim;
      if (b > 0) stampShield(s, arr, src, radius, b, sign);
    }
    for (let i = 0; i < n; i++) if (arr[i] !== 0) push(`${prefix}:${i}`, arr[i]);
    // the bridge stands in the river, which a shield on the banks never touches: water turned from it (or drawn to it) changes the
    // flood it takes
    const br = prefix === 'flood' ? s.world.landmarks.find((l) => l.kind === 'bridge' && l.hp > 0) : undefined;
    if (br && anchorSources().some((a) => Math.hypot(a.x - br.x, a.y - br.y) <= radius + 0.5)) push('bridgeFlow', sign * scaled(mag, st));
  };
  const regions = regionsOf(targets, law);
  const areas = districtsOf(s, regions.length ? regions : [law.regionId]);
  switch (e.op) {
    case 'APPLY_FORCE':
      for (const t of targets) {
        by(t.id);
        if (e.direction === 'up') push(`lift:${t.id}`, scaled(e.magnitude, st));
        else {
          const src = anchorSources().reduce<Source | null>((b, x) => (!b || Math.hypot(x.x - t.x, x.y - t.y) < Math.hypot(b.x - t.x, b.y - t.y) ? x : b), null);
          if (!src) continue;
          const dx = Math.sign(t.x - src.x) * (e.direction === 'away' ? 1 : -1);
          const dy = Math.sign(t.y - src.y) * (e.direction === 'away' ? 1 : -1);
          push(`pushx:${t.id}`, dx * scaled(e.magnitude, st));
          push(`pushy:${t.id}`, dy * scaled(e.magnitude, st));
        }
      }
      break;
    case 'REDIRECT_FLOW':
      stamp('flood', e.radius + light * (sources.some((x) => s.world.landmarks.find((l) => l.id === x.id)?.kind === 'beacon') ? 1 : 0), e.magnitude, e.mode === 'attract' ? -1 : 1);
      break;
    case 'MOVE_AWAY':
    case 'MOVE_TOWARD':
      if (clause.target.kind === 'wolf') stamp(e.op === 'MOVE_AWAY' ? 'predBlock' : 'predLure', e.radius, e.magnitude, 1);
      else if (clause.target.kind === 'water') stamp('flood', e.radius, e.magnitude, e.op === 'MOVE_AWAY' ? 1 : -1);
      else
        for (const t of targets) {
          by(t.id);
          const src = anchorSources().reduce<Source | null>((b, x) => (!b || Math.hypot(x.x - t.x, x.y - t.y) < Math.hypot(b.x - t.x, b.y - t.y) ? x : b), null);
          if (!src) continue;
          const sgn = e.op === 'MOVE_AWAY' ? 1 : -1;
          push(`pushx:${t.id}`, Math.sign(t.x - src.x) * sgn * scaled(e.magnitude, st));
          push(`pushy:${t.id}`, Math.sign(t.y - src.y) * sgn * scaled(e.magnitude, st));
        }
      break;
    case 'WEATHER_MODIFIER': {
      const shift = scaled(e.magnitude, st);
      const dest = e.toward ?? regions[0] ?? law.regionId;
      if (e.mode === 'redirect') {
        push('level', -shift);
        push(`sink:${dest}`, shift);
      } else if (e.mode === 'repel') push('level', -1);
      else {
        // rain called to a place falls there instead of in the hills that feed the river: the river rises a little less, and the
        // water lands on that ground (crops drink it; without crops it pools on the low ground)
        push('level', -Math.ceil(shift / 2));
        push(`rainBonus:${dest}`, shift);
        if (!s.scn.features.crops) push(`sink:${dest}`, shift);
      }
      break;
    }
    case 'RELOCATE_RESOURCE': {
      const shift = scaled(e.magnitude, st);
      push('level', -shift);
      push(`sink:${e.toward}`, shift);
      break;
    }
    case 'SET_MATERIAL_PROPERTY':
      for (const t of targets) {
        if (e.property === 'mass' && t.kind === 'stone') {
          by(t.id);
          const d = Math.round(e.delta * (0.5 + 0.5 * st));
          push(`mass:${t.id}`, e.delta < 0 ? Math.min(-1, d) : Math.max(1, d));
        } else if (e.property === 'flammability' && t.kind === 'home') push(`homeFire:${t.id}`, -0.2 * e.delta * st);
        else if (e.property === 'flammability' && t.kind === 'field') {
          const d = s.world.landmarks.find((l) => l.id === t.id)?.district;
          if (d) push(`spread:${d}`, 0.1 * e.delta * st);
        }
        else if (e.property === 'hardness' && t.kind === 'bridge') push('bridgeHard', e.delta > 0 ? [0, 0.45, 0.7, 0.9][e.delta] * (0.6 + 0.4 * st) : -0.3 * Math.abs(e.delta) * st);
        else if (e.property === 'hardness' && t.kind === 'home') push(`homeShield:${t.id}`, e.delta > 0 ? [0, 0.3, 0.5, 0.7][e.delta] * st : -0.2 * Math.abs(e.delta) * st);
      }
      break;
    case 'GROW_ENTITY':
      for (const r of areas) push(`cropBoost:${r}`, Math.round(10 * e.magnitude * st * (modActive(s, 'clear_night_skies') ? 1.5 : 1)));
      break;
    case 'DECAY_ENTITY':
      for (const r of areas) push(`cropBoost:${r}`, -Math.round(6 * e.magnitude * st));
      break;
    case 'ALTER_TEMPERATURE':
      for (const r of areas) {
        push(`fireCut:${r}`, e.delta < 0 ? 0.25 * Math.abs(e.delta) * st : -0.2 * e.delta * st);
        // cooler flames warm less: the hearths no longer keep the cold out, and the weak feel it (V1's cold rule)
        if (e.delta < 0) push(`cold:${r}`, Math.max(1, Math.round(Math.abs(e.delta) * st)));
      }
      break;
    case 'MODIFY_MOVEMENT':
      if (clause.target.kind === 'fire') for (const r of areas) push(`spread:${r}`, 0.2 * e.delta * st);
      else if (clause.target.kind === 'wolf') push('wolfSteps', e.delta > 0 ? 1 : -1);
      break;
    case 'CHANGE_LIGHT':
      // handled in the light pre-pass (reach) and here (fuel): brighter lanterns burn twice the fuel
      if (e.delta > 0) for (const t of targets) push(`fuel:${t.id}`, 1);
      break;
    case 'MODIFY_DURABILITY':
      for (const t of targets) {
        if (t.kind === 'bridge') push('bridgeHard', e.delta > 0 ? [0, 0.45, 0.7, 0.9][e.delta] * (0.6 + 0.4 * st) : -0.3 * Math.abs(e.delta) * st);
        else push(`homeShield:${t.id}`, e.delta > 0 ? [0, 0.3, 0.5, 0.7][e.delta] * st : -0.2 * Math.abs(e.delta) * st);
      }
      break;
    case 'MODIFY_VISIBILITY': {
      const r = Math.abs(e.delta);
      for (const t of targets) {
        const arr = new Array<number>(s.world.w * s.world.h).fill(0);
        stampShield(s, arr, { id: t.id, x: t.x, y: t.y }, r, 1, 1);
        for (let i = 0; i < arr.length; i++) if (arr[i] > 0) push(`${e.delta < 0 ? 'predBlock' : 'predLure'}:${i}`, 1);
      }
      break;
    }
    case 'INFLUENCE_MOTIVATION':
      if (e.motive === 'diligence') {
        // tireless people ease the drain of night labour where a law asks for it, and the fields they work give a little more:
        // faster growth where crops grow night by night, otherwise a little more food at dawn from a field with two of them on it
        for (const r of areas) if ((mods.laborDrain[r] ?? 0) > 0) push(`labor:${r}`, -15 * e.magnitude * st);
        const hands = new Map<string, number>();
        for (const t of targets) {
          const v = s.villagers.find((x) => x.id === t.id && x.status !== 'dead');
          const f = v?.workId ? s.world.landmarks.find((l) => l.id === v.workId && l.kind === 'field' && !l.data.ruined && !l.data.harvested) : undefined;
          if (f) hands.set(f.id, (hands.get(f.id) ?? 0) + 1);
        }
        const byRegion = new Map<string, number>();
        for (const [fid, n] of [...hands.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
          const f = s.world.landmarks.find((l) => l.id === fid)!;
          if (s.scn.features.crops) byRegion.set(f.district, (byRegion.get(f.district) ?? 0) + n);
          else if (n >= 2) {
            by(fid);
            push(`yield:${fid}`, 1);
          }
        }
        for (const [r, n] of [...byRegion.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) push(`cropBoost:${r}`, Math.max(1, Math.round(Math.min(n, 4) * 0.75 * e.magnitude * st)));
      } else
        for (const t of targets) {
          by(t.id);
          push(`fear:${t.id}`, -Math.round(10 * e.magnitude * st) || -1);
        }
      break;
    case 'SPAWN_BOUNDED_ENTITY':
      for (const c of (s.v2?.coops ?? []).filter((k) => law.regionId === 'river' || k.region === law.regionId)) {
        by(c.id);
        push(`hatch:${c.id}`, e.count);
      }
      break;
    case 'GIVE_STATUS_EFFECT':
      if (e.status === 'fireproof')
        for (const t of targets) {
          if (t.kind === 'villager') push(`fireproof:${t.id}`, 1);
          else push(`homeFire:${t.id}`, 0.3 * e.magnitude * st);
        }
      else if (targets.length) {
        // a district-wide protection counts once per district, however many people or homes it reaches there
        const where = districtsOf(s, [...new Set(targets.map((t) => (t.x < 0 ? law.regionId : regionAt(s.world, t.x, t.y) || law.regionId)))]);
        for (const r of where) push(e.status === 'sick_resistant' ? `sick:${r}` : `cold:${r}`, e.status === 'sick_resistant' ? -0.25 * e.magnitude * st : -2 * e.magnitude);
      }
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------------------------------------ conflicts and application

export interface Resolved {
  value: number;
  conflict: { laws: string[]; pos: number; neg: number } | null;
}

/**
 * Combines every contribution to one property. Agreeing contributions combine by the property's rule; opposing ones compete by
 * support: net = (P x W+ - N x W-) / (W+ + W-), where P and N are each side's combined pull and W the support behind it. The
 * result never depends on the order the laws are listed in.
 */
export function resolveKey(key: string, cs: Contribution[]): Resolved {
  const rule = COMBINE[key.split(':')[0]] ?? { mode: 'sum', lo: -1e9, hi: 1e9 };
  const comb = (vals: number[]): number => (vals.length ? (rule.mode === 'max' ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0)) : 0);
  const pos = cs.filter((c) => c.value > 0);
  const neg = cs.filter((c) => c.value < 0);
  let value: number;
  let conflict: Resolved['conflict'] = null;
  if (pos.length && neg.length) {
    const P = comb(pos.map((c) => c.value));
    const N = comb(neg.map((c) => -c.value));
    const wp = pos.reduce((a, c) => a + c.weight, 0);
    const wn = neg.reduce((a, c) => a + c.weight, 0);
    value = (P * wp - N * wn) / (wp + wn);
    conflict = { laws: [...new Set(cs.map((c) => c.law))].sort(), pos: wp, neg: wn };
  } else value = pos.length ? comb(pos.map((c) => c.value)) : -comb(neg.map((c) => -c.value));
  value = Math.max(rule.lo, Math.min(rule.hi, value));
  if (rule.int) value = Math.round(value);
  return { value, conflict };
}

function emptyIntents(): EntityIntents {
  return { lift: {}, push: {}, mass: {}, fear: {}, hatch: {}, yield: {}, extraFuel: [], by: {} };
}

/**
 * Runs every active reality law for tonight. Writes the V1 modifier inputs in `mods` and returns entity intents for entities.ts.
 * The lasting bank raised by hauled stones is applied first, as a flood shield on its tiles.
 */
export function runRealityLaws(ctx: Ctx, mods: Modifiers): RealityPlan {
  const s = ctx.s;
  const v2 = s.v2!;
  for (const [k, h] of Object.entries(v2.bank)) {
    const i = Number(k);
    if (Number.isInteger(i) && i >= 0 && i < mods.floodShield.length) mods.floodShield[i] = Math.max(mods.floodShield[i], h);
  }
  const intents = emptyIntents();
  const applied: AppliedEffect[] = [];
  const work: Work[] = [];
  for (const law of activeLaws(s)) {
    const def = claimDef(s, law.claimId);
    if (!def.reality || law.strength <= 0) continue;
    for (const clause of def.reality.ast.clauses) work.push({ law, def, clause });
  }
  const order = (w: Work) => OPERATORS[w.clause.effect.op].tickOrder;
  work.sort((a, b) => order(a) - order(b) || (a.law.id < b.law.id ? -1 : a.law.id > b.law.id ? 1 : 0) || (a.clause.id < b.clause.id ? -1 : 1));

  const firing = new Map<Work, { fire: Fire; targets: Target[] }>();
  const contribs: Contribution[] = [];
  // pass 1: light and heat first, because they change what everything lantern- or fire-powered does tonight
  let light = 0;
  const cool: Record<string, number> = {};
  const cooledBy: Record<string, Work> = {};
  for (const wk of work) {
    const f = firedTonight(s, wk);
    if (!f.on || !holds(s, wk.clause.where, null)) continue;
    const e = wk.clause.effect;
    if (e.op === 'CHANGE_LIGHT') light += e.delta;
    // clearly cooler flames (two steps or more) are a fire the river fears less: its fire-powered wards stand a step lower
    if (e.op === 'ALTER_TEMPERATURE' && e.delta <= -2)
      for (const d of districtsOf(s, [wk.clause.target.region ?? wk.law.regionId])) {
        cool[d] = 1;
        cooledBy[d] ??= wk;
      }
  }
  light = Math.max(-2, Math.min(2, light));
  const lowered = dimFireWards(s, mods, cool);
  const cooler = Object.keys(cooledBy).sort().map((d) => cooledBy[d])[0];
  if (cooler) for (const [lawId, n] of [...lowered.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const wk = cooler;
    emit(ctx, { step: 'law', code: 'FIRE_WARDS_COOLED', importance: 2, law: wk.law.id, claim: wk.def.id, text: `“${wk.def.short}” cools the flames, and the river fears a cooler fire less: ${n} tiles of the ward “${claimDef(s, s.laws.find((l) => l.id === lawId)?.claimId ?? lawId).short}” keeps around the fires stand a step lower tonight.` });
  }
  // pass 2: every clause
  for (const wk of work) {
    const fire = firedTonight(s, wk);
    if (!fire.on || !holds(s, wk.clause.where, null)) continue;
    const targets = resolveTargets(s, wk.clause.target, wk.law, fire.sources, light, wk.clause.where);
    firing.set(wk, { fire, targets });
    const before = contribs.length;
    contribute(s, wk, fire.sources, targets, light, contribs, intents, mods, cool);
    const touched = contribs.length - before;
    const op: OpId = wk.clause.effect.op;
    if (!touched && op !== 'SPAWN_BOUNDED_ENTITY') {
      const label = KINDS[wk.clause.target.kind].label;
      const found = targets.length ? `reached ${targets.length} ${label} and found nothing in them it could change` : `found no ${label} to act on`;
      emit(ctx, { step: 'law', code: 'REALITY_IDLE', importance: 1, law: wk.law.id, claim: wk.def.id, text: `“${wk.def.short}” was powered tonight but ${found}.` });
      continue;
    }
    const text = describe(wk.clause, targets.length, s, wk.def);
    const event = emit(ctx, { step: 'law', code: 'REALITY_EFFECT', importance: 2, law: wk.law.id, claim: wk.def.id, text, ...(fire.sources[0] ? { tile: [fire.sources[0].x, fire.sources[0].y] as [number, number] } : {}) });
    applied.push({ day: s.day, law: wk.law.id, claim: wk.def.id, clause: wk.clause.id, op, targets: targets.map((t) => t.id).slice(0, MAX_TARGETS), event, text });
  }

  // combine and apply
  const byKey = new Map<string, Contribution[]>();
  for (const c of contribs) (byKey.get(c.key) ?? byKey.set(c.key, []).get(c.key)!).push(c);
  const conflicts = new Map<string, { laws: string[]; pos: number; neg: number; keys: number }>();
  for (const key of [...byKey.keys()].sort()) {
    const r = resolveKey(key, byKey.get(key)!);
    if (r.conflict) {
      const ck = `${key.split(':')[0]}|${r.conflict.laws.join(',')}`;
      const prev = conflicts.get(ck);
      conflicts.set(ck, { ...r.conflict, keys: (prev?.keys ?? 0) + 1 });
    }
    applyKey(mods, intents, key, r.value, [...new Set(byKey.get(key)!.map((c) => c.law))].sort());
  }
  // what each entity effect came to after combining (the renderer animates exactly this: hens to the height they reached)
  for (const a of applied) {
    const first = a.targets[0];
    if (!first) continue;
    if (a.op === 'APPLY_FORCE' && intents.lift[first] !== undefined) a.amount = intents.lift[first];
    else if (a.op === 'SET_MATERIAL_PROPERTY' && intents.mass[first] !== undefined) a.amount = intents.mass[first];
  }
  for (const [ck, c] of [...conflicts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const prop = ck.split('|')[0];
    const names = c.laws.map((id) => `“${claimDef(s, s.laws.find((l) => l.id === id)?.claimId ?? id).short}”`);
    emit(ctx, { step: 'law', code: 'REALITY_CONFLICT', importance: 2, law: c.laws[0], text: `${names.join(' and ')} pull ${prop} opposite ways; the outcome follows the support behind each (${Math.round(c.pos * 100)} against ${Math.round(c.neg * 100)}).` });
  }
  v2.lastNight = applied;
  return { intents, applied };
}

/**
 * V1's flood wards powered by fire (laws triggered by lit beacons or smoke fires, such as Redbank's "River fears fire") stand one
 * step lower around fires in a district whose flames a reality belief has cooled. Ground raised by hauled stones never sinks.
 * Returns, per V1 law, how many tiles it lowered.
 */
function dimFireWards(s: RunState, mods: Modifiers, cool: Record<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  if (!Object.keys(cool).length) return out;
  const n = s.world.w * s.world.h;
  for (const law of activeLaws(s)) {
    const def = claimDef(s, law.claimId);
    if (def.reality || law.strength <= 0) continue;
    const mask = new Array<number>(n).fill(0);
    for (const spec of [def.spec, ...(def.extra ?? [])]) {
      if (spec.trigger.kind !== 'lit_beacon' && spec.trigger.kind !== 'smoke_fire') continue;
      if (spec.subject !== 'river' || (spec.effect !== 'repel' && spec.effect !== 'redirect' && spec.effect !== 'slow')) continue;
      const B = Math.max(1, Math.round(spec.intensity * (0.5 + 0.5 * law.strength)));
      for (const src of triggerSources(s, law, def, spec)) {
        const lm = s.world.landmarks.find((l) => l.id === src.id);
        if (lm && cool[lm.district]) stampShield(s, mask, src, spec.radius, B, 1);
      }
    }
    let lowered = 0;
    for (let i = 0; i < n; i++) {
      if (mask[i] <= 0 || mods.floodShield[i] <= 0) continue;
      const next = Math.max(s.v2?.bank[String(i)] ?? 0, mods.floodShield[i] - 1);
      if (next < mods.floodShield[i]) {
        mods.floodShield[i] = next;
        lowered++;
      }
    }
    if (lowered) out.set(law.id, lowered);
  }
  return out;
}

/** A clause fires on a night its trigger fires; a 'while_active' clause, once it has fired, keeps acting while its law holds. */
function firedTonight(s: RunState, wk: Work): Fire {
  const f = fires(s, wk.clause.when, wk.law);
  const key = `${wk.law.id}#${wk.clause.id}`;
  const v2 = s.v2!;
  if (wk.clause.duration === 'while_active') {
    if (f.on && !v2.primed.includes(key)) v2.primed.push(key);
    if (!f.on && v2.primed.includes(key)) return { on: true, sources: [], count: 1 };
  }
  return f;
}

function applyKey(mods: Modifiers, it: EntityIntents, key: string, v: number, laws: string[] = []): void {
  if (v === 0) return;
  const [kind, rest] = [key.slice(0, key.indexOf(':') < 0 ? key.length : key.indexOf(':')), key.indexOf(':') < 0 ? '' : key.slice(key.indexOf(':') + 1)];
  switch (kind) {
    case 'flood': {
      const i = Number(rest);
      mods.floodShield[i] = v > 0 ? Math.max(mods.floodShield[i], v) : Math.min(mods.floodShield[i], v);
      break;
    }
    case 'predBlock':
      mods.predatorBlock[Number(rest)] = Math.max(mods.predatorBlock[Number(rest)], v);
      break;
    case 'predLure':
      mods.predatorLure[Number(rest)] = Math.max(mods.predatorLure[Number(rest)], v);
      break;
    case 'level':
      mods.levelDelta += v;
      break;
    case 'sink':
      (mods.sinks ??= []).push({ region: rest, amount: v, laws });
      break;
    case 'rainBonus':
      mods.rainBonus[rest] = (mods.rainBonus[rest] ?? 0) + v;
      break;
    case 'cropBoost':
      mods.cropBoost[rest] = (mods.cropBoost[rest] ?? 0) + v;
      break;
    case 'fireCut':
      mods.fireDamageCut[rest] = Math.max(-0.5, Math.min(0.8, (mods.fireDamageCut[rest] ?? 0) + v));
      break;
    case 'spread':
      mods.spreadMult[rest] = Math.max(0.2, Math.min(2, (mods.spreadMult[rest] ?? 1) + v));
      break;
    case 'sick':
      mods.sickMult[rest] = Math.max(0.2, (mods.sickMult[rest] ?? 1) + v);
      break;
    case 'cold':
      mods.coldDrain[rest] = Math.max(0, (mods.coldDrain[rest] ?? 0) + v);
      break;
    case 'labor':
      mods.laborDrain[rest] = Math.max(0, (mods.laborDrain[rest] ?? 0) + v);
      break;
    case 'bridgeHard':
      mods.bridgeHardness = Math.max(-0.5, Math.min(0.9, (mods.bridgeHardness ?? 0) + v));
      break;
    case 'bridgeFlow':
      mods.bridgeFlow = v;
      break;
    case 'homeShield':
      (mods.homeShield ??= {})[rest] = v;
      break;
    case 'homeFire':
      (mods.homeFireCut ??= {})[rest] = v;
      break;
    case 'fireproof':
      (mods.fireproof ??= []).push(rest);
      break;
    case 'wolfSteps':
      mods.wolfStepDelta = Math.max(-2, Math.min(2, (mods.wolfStepDelta ?? 0) + v));
      break;
    case 'lift':
      it.lift[rest] = v;
      break;
    case 'pushx':
      it.push[rest] = [v, it.push[rest]?.[1] ?? 0];
      break;
    case 'pushy':
      it.push[rest] = [it.push[rest]?.[0] ?? 0, v];
      break;
    case 'mass':
      it.mass[rest] = v;
      break;
    case 'fear':
      it.fear[rest] = v;
      break;
    case 'hatch':
      it.hatch[rest] = v;
      break;
    case 'yield':
      it.yield[rest] = v;
      break;
    case 'fuel':
      it.extraFuel.push(rest);
      break;
    default:
      break;
  }
}
