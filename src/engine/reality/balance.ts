import { canonicalize, hash53 } from '../core/hash.ts';
import type { RuleThresholds } from '../core/types.ts';
import { mechanicsHash, type Clause, type RealityAst, type Trigger } from './ast.ts';
import { OPERATORS } from './operators.ts';

/**
 * What a Generative Reality belief costs, from its mechanics alone (never from its wording or a model's enthusiasm). The scale is
 * V1's (laws/rules.ts `specPower`): a lantern belief that turns floodwater within 3 tiles at strength 3 has the same power, 40, in
 * both languages, so written V2 beliefs and V1's authored laws are priced against each other.
 *
 *   clause power  = reach x magnitude x trigger ease x operator weight / 8 x conditions x duration
 *   reach         = an operator's radius r: pi (r + 0.5)^2 x 0.35;  a whole region: 4 per region; a "near" selector on a
 *                   region-wide effect: the smaller of its circle and the region (narrowing never costs more)
 *   ease          = always 1.6, night 1.15, watchers 1, lantern/bell/smoke 1, rain 0.9, ritual or spoken 0.9, flood 0.8;
 *                   all-of: the hardest x 0.85; any-of: the easiest x 1.1; not: 1.4
 *   conditions    = x 0.8 per condition test (at least 0.5);  duration: one night 1, while the law holds 1.25
 *   belief power  = sum of clauses x (1 + 0.1 per extra clause)
 *
 * And from power. Rules 1 (phases 04-10), exactly as for V1's written beliefs: support needed max(60%, 0.5 + power/160) rounded up
 * to 5%; firm believers 3 + power/8 (3..8); ramp 72 - power; decay 18 + power/2. Rules 2 (phase 11) brings written beliefs closer to
 * authored laws of equal power, which ask 55-60% and 2-4 believers (V1's Fire Wall, power about 40: 60% and 3): support
 * 0.5 + p/200 rounded up to 5% (55%..85%), believers 3 + p/15 (3..7), ramp 80 - p/2 (50..80), decay 18 + 0.4 p, where p is the
 * power per region the belief is held in (each region is its own law and gets its own share; a radius is paid once per region);
 * never less than the chapter's own law that does the same thing asks (reality/twin.ts).
 * Rules 3 (phase 17): an effect measured from every landmark of a kind ("floodwater flows away from every home") acts around each of
 * them, so its reach is the ground all of them cover together, in circles of its radius (never less than one a region); one measured
 * from the trigger's own sources (the lit lanterns, the ringing bell) keeps one circle a region. Writing it costs what its whole power
 * says (under rules 1 and 2 the Influence charged was read from the rules-1 power, whatever the run's rules).
 * Measured against the tournament (scripts/tournament-v2.ts): under rules 1 no written belief reached law within a chapter.
 * Either way never more believers than the electorate can give; Influence 1 / 2 / 3 below power 10 / 30 / above. Balanced play
 * caps power at 60, narrowing reach and then magnitude; Reality Lab caps it at 120.
 */

export const MAX_POWER = 60;
export const LAB_MAX_POWER = 120;

export type Rating = 'light' | 'moderate' | 'strong';
export const ratingOf = (p: number): Rating => (p < 10 ? 'light' : p < 30 ? 'moderate' : 'strong');
export const apCostOf = (p: number): number => (p < 10 ? 1 : p < 30 ? 2 : 3);

const EASE: Record<string, number> = { always: 1.6, night: 1.15, watchers: 1, lantern: 1, bell: 1, smoke_fire: 1, rain: 0.9, clear_night: 1, ritual: 0.9, spoken: 0.9, flood: 0.8 };

/** Parts that fire every night restrict nothing: "at night, when the bell rings" is priced as "when the bell rings". */
const everyNight = (t: Trigger): boolean => 'event' in t && (t.event === 'night' || t.event === 'always');

export function triggerEase(t: Trigger): number {
  if ('event' in t) return EASE[t.event] ?? 1;
  if ('not' in t) return 1.4;
  if ('all' in t) {
    const real = t.all.filter((x) => !everyNight(x));
    if (!real.length) return Math.min(...t.all.map(triggerEase));
    return real.length === 1 ? triggerEase(real[0]) : Math.min(...real.map(triggerEase)) * 0.85;
  }
  if (t.any.some(everyNight)) return 1.6;
  return Math.min(1.6, Math.max(...t.any.map(triggerEase)) * 1.1);
}

const reachOf = (r: number): number => Math.PI * (r + 0.5) ** 2 * 0.35;

function magnitudeOf(c: Clause): number {
  const e = c.effect as Record<string, unknown>;
  if (typeof e.magnitude === 'number') return e.magnitude;
  if (typeof e.delta === 'number') return Math.abs(e.delta);
  if (typeof e.count === 'number') return e.count;
  return 1;
}

function countTests(c: Clause['where']): number {
  if (!c) return 0;
  if ('test' in c) return 1;
  if ('not' in c) return countTests(c.not);
  return ('all' in c ? c.all : c.any).reduce((a, x) => a + countTests(x), 0);
}

/**
 * Rules 3: how much ground a clause covers at a radius, in circles of that radius, all the belief's regions together (reality/cost.ts
 * measures it in the village); null where it acts around the trigger's own sources, which keep one circle a region.
 */
export type Coverage = (c: Clause, radius: number) => number | null;

export function clausePower(c: Clause, regions: number, rules = 1, coverage?: Coverage): number {
  const e = c.effect as Record<string, unknown>;
  const whole = 4 * Math.max(1, regions);
  // an operator's own radius is its reach (V1's stamps); a "near" selector only narrows a region-wide effect, so it never costs more.
  // Rules 2: a belief held in several regions acts around its sources in each of them, so a radius is paid once per region.
  // Rules 3: around every landmark of a kind, it is paid for the ground they cover together.
  const per = rules >= 2 ? Math.max(1, regions) : 1;
  const circles = (r: number): number => (rules >= 3 && coverage ? (coverage(c, r) ?? per) : per);
  const reach = typeof e.radius === 'number' ? reachOf(e.radius) * circles(e.radius) : c.target.near ? Math.min(whole, reachOf(c.target.near.radius) * circles(c.target.near.radius)) : whole;
  const op = OPERATORS[c.effect.op];
  const cond = Math.max(0.5, 0.8 ** countTests(c.where));
  const dur = c.duration === 'while_active' ? 1.25 : 1;
  return reach * magnitudeOf(c) * triggerEase(c.when) * (op.weight / 8) * cond * dur;
}

export function beliefPower(ast: RealityAst, rules = 1, coverage?: Coverage): number {
  const sum = ast.clauses.reduce((a, c) => a + clausePower(c, ast.regions.length, rules, coverage), 0);
  return sum * (1 + 0.1 * (ast.clauses.length - 1));
}

export interface RealityBalance {
  ast: RealityAst;
  hash: string;
  power: number;
  rating: Rating;
  apCost: number;
  thresholds: RuleThresholds;
  adjustments: string[];
  /** fingerprint of the derived numbers: a save whose numbers were edited does not match */
  checksum: string;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const roundUp05 = (x: number): number => Math.ceil(x * 20 - 1e-9) / 20;

/** Narrow the strongest clause (reach first, then magnitude) until the belief fits the cap; every change is reported. */
function narrow(ast: RealityAst, cap: number, notes: string[], rules: number, coverage?: Coverage): RealityAst {
  const out: RealityAst = JSON.parse(JSON.stringify(ast)) as RealityAst;
  for (let guard = 0; guard < 16 && beliefPower(out, rules, coverage) > cap; guard++) {
    const powers = out.clauses.map((c) => clausePower(c, out.regions.length, rules, coverage));
    const k = powers.indexOf(Math.max(...powers));
    const c = out.clauses[k];
    const e = c.effect as Record<string, unknown>;
    if (typeof e.radius === 'number' && e.radius > 1) {
      e.radius -= 1;
      notes.push(`Narrowed the reach of clause ${k + 1} to ${e.radius as number} tiles: a belief this wide is more than one village can hold.`);
    } else if (c.target.near && c.target.near.radius > 1) {
      c.target.near.radius -= 1;
      notes.push(`Narrowed clause ${k + 1} to things within ${c.target.near.radius} tiles of the ${c.target.near.anchor}.`);
    } else if (typeof e.magnitude === 'number' && e.magnitude > 1) {
      e.magnitude -= 1;
      notes.push(`Lowered the strength of clause ${k + 1} to ${e.magnitude as number} to keep the whole belief within bounds.`);
    } else if (typeof e.delta === 'number' && Math.abs(e.delta) > 1) {
      e.delta -= Math.sign(e.delta);
      notes.push(`Lowered the size of the change in clause ${k + 1} to ${e.delta as number} to keep the whole belief within bounds.`);
    } else if (typeof e.count === 'number' && e.count > 1) {
      e.count -= 1;
      notes.push(`Lowered clause ${k + 1} to ${e.count as number} per night to keep the whole belief within bounds.`);
    } else break;
  }
  return out;
}

/** An authored law of the chapter that does what the belief does (reality/twin.ts): a written belief never asks less than it. */
export interface AuthoredFloor {
  short: string;
  thresholds: RuleThresholds;
  /** the watchers that law needs on the deck: a written copy never needs fewer */
  watchers?: number;
}

/** Raise a copy's watcher count to its authored twin's (an adjustment the player is told about, like any narrowing). */
function floorWatchers(ast: RealityAst, min: number, short: string, notes: string[]): RealityAst {
  let raised = false;
  const fix = (t: Trigger): Trigger => {
    if ('event' in t) {
      if (t.event === 'watchers' && (t.min ?? 1) < min) {
        raised = true;
        return { ...t, min };
      }
      return t;
    }
    if ('all' in t) return { all: t.all.map(fix) };
    if ('any' in t) return { any: t.any.map(fix) };
    return { not: fix(t.not) };
  };
  const out: RealityAst = { ...ast, clauses: ast.clauses.map((c) => ({ ...c, when: fix(c.when) })) };
  if (raised) notes.push(`Needs at least ${min} watchers on the deck, as “${short}” does.`);
  return raised ? out : ast;
}

export function balanceReality(input: RealityAst, opts: { lab?: boolean; maxBelievers?: number; rules?: number; floor?: AuthoredFloor | null; coverage?: Coverage } = {}): RealityBalance {
  const adjustments: string[] = [];
  const cap = opts.lab ? LAB_MAX_POWER : MAX_POWER;
  const rules = opts.rules ?? 1;
  const floored = rules >= 2 && opts.floor?.watchers ? floorWatchers(input, opts.floor.watchers, opts.floor.short, adjustments) : input;
  const ast = narrow(floored, cap, adjustments, rules, opts.coverage);
  const power = Math.round(beliefPower(ast, rules, opts.coverage) * 10) / 10;
  const r2 = rules >= 2;
  const f = r2 ? (opts.floor ?? null) : null;
  // rules 2: a belief held in several regions is a law in each, and each region gets only its own share of the effect, so each
  // region's adoption is priced by that share; the whole power is what it costs to write (Influence) and how it is rated
  const local = r2 ? power / Math.max(1, ast.regions.length) : power;
  let on = r2 ? clamp(roundUp05(0.5 + local / 200), 0.55, 0.85) : clamp(roundUp05(0.5 + power / 160), 0.6, 0.9);
  let wanted = r2 ? clamp(3 + Math.floor(local / 15), 3, 7) : clamp(3 + Math.floor(power / 8), 3, 8);
  if (f && (f.thresholds.on > on || f.thresholds.minSupporters > wanted)) {
    on = Math.max(on, f.thresholds.on);
    wanted = Math.max(wanted, f.thresholds.minSupporters);
    adjustments.push(`Asks at least what “${f.short}” asks (${Math.round(on * 100)}% support, ${wanted} firm believers): this belief does what that story of the village does, and a written copy is never the cheaper road.`);
  }
  const off = Math.max(0.25, Math.round((on - 0.15) * 100) / 100);
  const minSupporters = opts.maxBelievers !== undefined ? clamp(Math.min(wanted, opts.maxBelievers), 2, 8) : wanted;
  if (minSupporters < wanted) adjustments.push(`Firm believers needed lowered from ${wanted} to ${minSupporters}: not enough people live there to ever give more. (The share of support needed is not lowered.)`);
  const ramp = r2 ? Math.min(clamp(Math.round(80 - local / 2), 50, 80), f?.thresholds.ramp ?? 100) : clamp(Math.round(72 - power), 40, 70);
  const decay = r2 ? Math.max(clamp(Math.round(18 + local * 0.4), 18, 40), f?.thresholds.decay ?? 0) : clamp(Math.round(18 + power * 0.5), 18, 40);
  const thresholds: RuleThresholds = { on, off, minSupporters, ramp, decay };
  const hash = mechanicsHash(ast);
  return { ast, hash, power, rating: ratingOf(power), apCost: apCostOf(power), thresholds, adjustments, checksum: hash53(canonicalize({ hash, power, thresholds })) };
}
