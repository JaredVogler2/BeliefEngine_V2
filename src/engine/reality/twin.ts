import type { ClaimDef, RunState } from '../core/types.ts';
import type { Clause, RealityAst } from './ast.ts';
import { clauseFromSpec } from './v1.ts';

/**
 * The chapter's own law that does what a written belief does (rules 2, phase 11). The phase 11 tournament found the dominant cheap
 * win: in Redbank "The bridge grows stronger when people watch it" (power 8: 55% support, 3 believers) won 20 of 20 seeds, while
 * the chapter's own "A bridge never breaks while it is watched" (55%, 4 believers, a slower ramp), pushed the same way, won 1. A
 * written copy of an authored law must never be the cheaper road to the same physics, so a belief whose clause acts on the same kind
 * of thing with the same operator in the same direction as one of the chapter's (non-rival) laws asks at least what that law asks.
 * What powers it does not matter: the price is for the effect.
 */

function direction(c: Clause): string | number {
  const e = c.effect as Record<string, unknown>;
  if (typeof e.mode === 'string') return e.mode;
  if (typeof e.direction === 'string') return e.direction;
  if (typeof e.delta === 'number') return Math.sign(e.delta);
  if (typeof e.status === 'string') return e.status;
  return 1;
}

export function sameMechanics(a: Clause, b: Clause): boolean {
  return a.target.kind === b.target.kind && a.effect.op === b.effect.op && direction(a) === direction(b);
}

/** The authored law a written belief copies, if any: the first of the chapter's own laws (rivals excepted) with a matching clause. */
export function authoredTwin(s: Pick<RunState, 'scn'>, ast: RealityAst): ClaimDef | null {
  for (const def of s.scn.claimDefs) {
    if (def.rival || def.reality || def.custom) continue;
    const theirs = clauseFromSpec(def.spec, def.id);
    if (theirs && ast.clauses.some((c) => sameMechanics(c, theirs))) return def;
  }
  return null;
}
