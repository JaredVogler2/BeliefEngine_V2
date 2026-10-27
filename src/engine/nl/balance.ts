import { hash53, canonicalize } from '../core/hash.ts';
import type { RuleSpec, SideEffectId } from '../core/types.ts';
import { SIDE_EFFECT_INFO, specPower, powerBudget, validateSpec } from '../laws/rules.ts';
import { canonicalAst, astHash, type BeliefAST, type BeliefClause } from './ast.ts';
import { getScenarioDef, listScenarios } from '../content/registry.ts';
import { thematicSides } from './ontology.ts';

/**
 * Turns a belief's structure into a law the game can run, and makes it pay for its strength. The formula is the one in
 * laws/rules.ts (`specPower`, `powerBudget`): reach x intensity x how easily the trigger is met, with every threshold, cost and
 * durability derived from that single number, so nothing is a judgement call:
 *
 *   support needed      on  = max(0.60, 0.5 + power / 160 - 0.012 x sidePower), rounded up to 5%
 *   firm believers      3 + floor(power / 8), at most 8
 *   ramp (speed)        72 - power, 40..70            slower for stronger laws
 *   decay (durability)  18 + 0.5 x power, 18..40      fades faster for stronger laws
 *   Influence to write  1 below power 10, 2 below 30, 3 above
 *   downsides           1 from power 12, 2 from power 28 (the thematic cost of what the belief does)
 *   cap                 power 60: a larger belief is narrowed until it fits, and the player is told
 */
export const MAX_POWER = 60;

/**
 * The least support any written belief asks for. The built-in laws ask for 55-60%; a written belief must never be easier than the
 * built-in law of the same kind, so its floor is the highest of theirs (tests/unit/nl-balance.test.ts checks this against every one).
 */
const ON_FLOOR = 0.6;

export type Rating = 'light' | 'moderate' | 'strong';

export interface Balanced {
  ast: BeliefAST;
  hash: string;
  spec: RuleSpec;
  extra: RuleSpec[];
  power: number;
  rating: Rating;
  apCost: number;
  minOn: number;
  sides: SideEffectId[];
  adjustments: string[];
  /** checksum of the derived specs: stored with the claim so a replay can prove the numbers were not edited */
  checksum: string;
}

export const ratingOf = (power: number): Rating => (power < 10 ? 'light' : power < 30 ? 'moderate' : 'strong');
export const apCostOf = (power: number): number => (power < 10 ? 1 : power < 30 ? 2 : 3);

const clausePower = (c: BeliefClause): number => specPower({ radius: c.radius, intensity: c.intensity, trigger: { kind: c.trigger, min: c.subject === 'bridge' && c.trigger === 'watchers' ? c.watchers ?? 3 : undefined } });
const roundUp05 = (x: number): number => Math.ceil(x * 20 - 1e-9) / 20;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

function clauseSpec(c: BeliefClause, id: string): RuleSpec {
  return {
    id,
    version: 1,
    subject: c.subject,
    effect: c.effect,
    trigger: { kind: c.trigger, ...(c.subject === 'bridge' && c.trigger === 'watchers' ? { min: c.watchers ?? 3 } : {}) },
    radius: c.radius,
    intensity: c.intensity,
    thresholds: { on: 0.6, off: 0.45, minSupporters: 3, ramp: 60, decay: 25 },
    upkeep: { fuel: 0 },
    side: [],
    tags: ['custom', 'inventor', c.subject],
  };
}

/**
 * The strongest a belief about the whole of something (the rain, a field, a bridge, a region's sickness) may be: the strongest
 * built-in belief of the same kind (subject and effect), or 2 when the game has none. A belief with no reach to price (radius 0)
 * acts everywhere it is believed, so its strength is capped rather than only priced: found by an exploit hunt, where a written
 * full-strength rain belief won Redbank 40 times in 40 against 36 for the best built-in route (docs/FINAL_ACCEPTANCE.md).
 */
let strongest: Map<string, number> | null = null;
export function maxIntensityFor(subject: string, effect: string): 1 | 2 | 3 {
  if (!strongest) {
    strongest = new Map();
    for (const l of listScenarios())
      for (const c of getScenarioDef(l.id).runtime.claimDefs) {
        if (c.rival || c.spec.radius !== 0) continue;
        const k = `${c.spec.subject}.${c.spec.effect}`;
        strongest.set(k, Math.max(strongest.get(k) ?? 0, c.spec.intensity));
      }
  }
  return (strongest.get(`${subject}.${effect}`) ?? 2) as 1 | 2 | 3;
}

/** Narrow the largest clause (radius first, then intensity) until the whole belief fits the power cap. */
function narrow(ast: BeliefAST, notes: string[]): BeliefAST {
  let clauses = ast.clauses.map((c) => ({ ...c })) as BeliefClause[];
  for (const c of clauses) {
    const cap = c.radius === 0 ? maxIntensityFor(c.subject, c.effect) : 3;
    if (c.intensity > cap) {
      notes.push(`Lowered the strength of "${c.subject} ${c.effect}" to ${cap}: a belief about the whole of something is never stronger than the strongest built-in belief of its kind.`);
      c.intensity = cap;
    }
  }
  for (let guard = 0; guard < 12; guard++) {
    const total = clauses.reduce((a, c) => a + clausePower(c), 0);
    if (total <= MAX_POWER) break;
    const big = clauses.reduce((m, c) => (clausePower(c) > clausePower(m) ? c : m), clauses[0]);
    if (big.radius > 1) {
      big.radius -= 1;
      notes.push(`Narrowed the reach of "${big.subject} ${big.effect}" to ${big.radius} tile${big.radius === 1 ? '' : 's'}: a belief this wide is more than one village can hold.`);
    } else if (big.intensity > 1) {
      big.intensity = (big.intensity - 1) as 1 | 2;
      notes.push(`Lowered the strength of "${big.subject} ${big.effect}" to ${big.intensity} to keep the whole belief within bounds.`);
    } else break;
  }
  clauses = clauses.map((c) => ({ ...c }));
  return { ...ast, clauses: clauses as BeliefAST['clauses'] };
}

/** The deterministic balance of a belief. Same structure, same numbers, in every browser and every replay. */
export interface BalanceOptions {
  /**
   * The most firm believers the village can possibly supply (derived from the size of the electorate: see `believerCap` in build.ts).
   * A belief that asks for more than the people who vote on it could ever give can never become law, so the requirement is capped.
   */
  maxBelievers?: number;
}

export function balanceAst(input: BeliefAST, opts: BalanceOptions = {}): Balanced {
  const adjustments: string[] = [];
  const ast = canonicalAst(narrow(canonicalAst(input), adjustments));
  const hash = astHash(ast);
  const power = ast.clauses.reduce((a, c) => a + clausePower(c), 0);

  // costs, thematically tied to what the belief does; padded from the generic ones only when the budget demands more
  const themed = ast.clauses.flatMap((c) => thematicSides(c.subject, c.effect, c.trigger));
  const sides: SideEffectId[] = themed.filter((s, i) => themed.indexOf(s) === i).slice(0, 3);
  const needed = power > 28 ? 2 : power > 12 ? 1 : 0;
  for (const pad of ['labor_drain', 'complacency'] as SideEffectId[]) if (sides.length < needed && !sides.includes(pad)) {
    sides.push(pad);
    adjustments.push(`Added the downside "${SIDE_EFFECT_INFO[pad].label}" (${SIDE_EFFECT_INFO[pad].text}): a belief this strong has to cost something.`);
  }
  const sidePower = sides.reduce((a, s) => a + SIDE_EFFECT_INFO[s].power, 0);
  const minOn = Math.min(0.9, 0.5 + power / 160 - sidePower * 0.012);
  const on = Math.min(0.9, Math.max(ON_FLOOR, roundUp05(minOn)));
  const off = Math.max(0.25, Math.round((on - 0.15) * 100) / 100);
  const wanted = clamp(3 + Math.floor(power / 8), 3, 8);
  const minSupporters = opts.maxBelievers !== undefined ? clamp(Math.min(wanted, opts.maxBelievers), 2, 8) : wanted;
  if (minSupporters < wanted) adjustments.push(`Firm believers needed lowered from ${wanted} to ${minSupporters}: not enough people live there to ever give more. (The share of the village that must support it is not lowered.)`);
  const ramp = clamp(Math.round(72 - power), 40, 70);
  const decay = clamp(Math.round(18 + power * 0.5), 18, 40);

  const specs = ast.clauses.map((c, i) => clauseSpec(c, i === 0 ? `custom_${hash.slice(0, 10)}` : `custom_${hash.slice(0, 10)}_${i + 1}`));
  const spec: RuleSpec = { ...specs[0], thresholds: { on, off, minSupporters, ramp, decay }, side: sides };
  const extra = specs.slice(1).map((s) => ({ ...s, thresholds: { ...spec.thresholds }, side: [] as SideEffectId[] }));
  if (on > ON_FLOOR) adjustments.push(`Local support needed set to ${Math.round(on * 100)}%: the formula asks more of stronger beliefs.`);
  if (minSupporters > 3) adjustments.push(`${minSupporters} firm believers are needed before it can wake.`);

  for (const sp of [spec, ...extra]) {
    const issues = validateSpec(sp);
    if (issues.length) throw new Error(`composer produced an invalid rule: ${issues.map((i) => `${i.field}: ${i.message}`).join('; ')}`);
  }
  if (!powerBudget({ ...spec, radius: spec.radius, intensity: spec.intensity }).balanced && ast.clauses.length === 1 && power <= MAX_POWER) {
    // the single-clause budget in rules.ts must agree with the thresholds derived above
    throw new Error('composer produced an unbalanced rule');
  }
  const checksum = hash53(canonicalize({ spec, extra }));
  return { ast, hash, spec, extra, power: Math.round(power * 10) / 10, rating: ratingOf(power), apCost: apCostOf(power), minOn, sides, adjustments, checksum };
}
