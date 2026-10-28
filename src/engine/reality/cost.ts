import type { RunState } from '../core/types.ts';
import { LAB_LIMITS, LIMITS, validateRealityAst } from './ast.ts';
import { balanceReality } from './balance.ts';

/** Influence a reality belief costs to write, from its structure alone (the action cost check needs no grounding for it). */
export function realityComposeCost(s: RunState, astIn: unknown): number {
  const lab = !!s.v2?.lab;
  const checked = validateRealityAst(astIn, lab ? LAB_LIMITS : LIMITS);
  return checked.ok ? balanceReality(checked.ast, { lab }).apCost : 1;
}
