import { createRunFromDef } from '../core/create.ts';
import { resolveDay } from '../core/resolve.ts';
import type { Id } from '../core/types.ts';
import type { ScenarioDef } from '../content/types.ts';

/** Does a village where the Keeper does nothing at all end in defeat? A village that passes this is not a free win. */
export function idleRunLoses(def: ScenarioDef, seed: number, modifiers: readonly Id[]): boolean {
  let s = createRunFromDef(def, { scenarioId: def.runtime.id, seed, difficulty: 'normal', modifiers: modifiers.slice() });
  let guard = 0;
  while (!s.outcome && guard++ < 40) s = resolveDay(s).state;
  return s.outcome?.result === 'defeat';
}
