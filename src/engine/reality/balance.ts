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
 *   reach         = a radius r: pi (r + 0.5)^2 x 0.35;  a whole region: 4 per region
 *   ease          = always 1.6, night 1.15, watchers 1, lantern/bell/smoke 1, rain 0.9, ritual or spoken 0.9, flood 0.8;
 *                   all-of: the hardest x 0.85; any-of: the easiest x 1.1; not: 1.4
 *   conditions    = x 0.8 per condition test (at least 0.5);  duration: one night 1, while the law holds 1.25
 *   belief power  = sum of clauses x (1 + 0.1 per extra clause)
 *
 * And from power, exactly as for V1's written beliefs: support needed max(60%, 0.5 + power/160) rounded up to 5%; firm believers
 * 3 + power/8 (3..8, never more than the electorate can give); ramp 72 - power; decay 18 + power/2; Influence 1 / 2 / 3 below
 * power 10 / 30 / above. Balanced play caps power at 60, narrowing reach and then magnitude; Reality Lab caps it at 120.
 */

export const MAX_POWER = 60;
export const LAB_MAX_POWER = 120;

export type Rating = 'light' | 'moderate' | 'strong';
export const ratingOf = (p: number): Rating => (p < 10 ? 'light' : p < 30 ? 'moderate' : 'strong');
export const apCostOf = (p: number): number => (p < 10 ? 1 : p < 30 ? 2 : 3);

const EASE: Record<string, number> = { always: 1.6, night: 1.15, watchers: 1, lantern: 1, bell: 1, smoke_fire: 1, rain: 0.9, clear_night: 1, ritual: 0.9, spoken: 0.9, flood: 0.8 };

export function triggerEase(t: Trigger): number {
  if ('event' in t) return EASE[t.event] ?? 1;
  if ('not' in t) return 1.4;
  if ('all' in t) return Math.min(...t.all.map(triggerEase)) * 0.85;
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

export function clausePower(c: Clause, regions: number): number {
  const e = c.effect as Record<string, unknown>;
  const radius = typeof e.radius === 'number' ? e.radius : c.target.near ? c.target.near.radius : null;
  const reach = radius === null ? 4 * Math.max(1, regions) : reachOf(radius);
  const op = OPERATORS[c.effect.op];
  const cond = Math.max(0.5, 0.8 ** countTests(c.where));
  const dur = c.duration === 'while_active' ? 1.25 : 1;
  return reach * magnitudeOf(c) * triggerEase(c.when) * (op.weight / 8) * cond * dur;
}

export function beliefPower(ast: RealityAst): number {
  const sum = ast.clauses.reduce((a, c) => a + clausePower(c, ast.regions.length), 0);
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
function narrow(ast: RealityAst, cap: number, notes: string[]): RealityAst {
  const out: RealityAst = JSON.parse(JSON.stringify(ast)) as RealityAst;
  for (let guard = 0; guard < 16 && beliefPower(out) > cap; guard++) {
    const powers = out.clauses.map((c) => clausePower(c, out.regions.length));
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

export function balanceReality(input: RealityAst, opts: { lab?: boolean; maxBelievers?: number } = {}): RealityBalance {
  const adjustments: string[] = [];
  const cap = opts.lab ? LAB_MAX_POWER : MAX_POWER;
  const ast = narrow(input, cap, adjustments);
  const power = Math.round(beliefPower(ast) * 10) / 10;
  const on = clamp(roundUp05(0.5 + power / 160), 0.6, 0.9);
  const off = Math.max(0.25, Math.round((on - 0.15) * 100) / 100);
  const wanted = clamp(3 + Math.floor(power / 8), 3, 8);
  const minSupporters = opts.maxBelievers !== undefined ? clamp(Math.min(wanted, opts.maxBelievers), 2, 8) : wanted;
  if (minSupporters < wanted) adjustments.push(`Firm believers needed lowered from ${wanted} to ${minSupporters}: not enough people live there to ever give more. (The share of support needed is not lowered.)`);
  const thresholds: RuleThresholds = { on, off, minSupporters, ramp: clamp(Math.round(72 - power), 40, 70), decay: clamp(Math.round(18 + power * 0.5), 18, 40) };
  const hash = mechanicsHash(ast);
  return { ast, hash, power, rating: ratingOf(power), apCost: apCostOf(power), thresholds, adjustments, checksum: hash53(canonicalize({ hash, power, thresholds })) };
}
