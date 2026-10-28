import type { RunState } from '../core/types.ts';
import { readBelief } from './read.ts';

/**
 * Sentences to try, offered in the composer's "Ideas" (phase 17). Each one is shown only where this village can make it real: the
 * offline reader reads it as understood and it builds here. (A fixed list offered bells in Ashwood, which has none: the first thing a
 * new player clicked there was refused.)
 */
export const IDEA_POOL = [
  'Chickens fly when the bell rings.',
  'The river turns away from lit lanterns.',
  'Wet stone becomes light beside lanterns.',
  'Crops ripen faster under the night sky.',
  'Rain falls on the fields when the bell is rung.',
  'Wolves will not come near the smoke fires.',
  'Smoke hides the pens from the wolves.',
  'The bridge grows stronger when people watch it.',
  'Flames burn weaker when it rains.',
  'Sickness keeps away from homes with open doors.',
  'At night, bell ringing pulls rain toward the orchard and makes local flames burn weaker.',
];

export function realityIdeas(s: RunState, n = 3): string[] {
  const out: string[] = [];
  for (const text of IDEA_POOL) {
    if (out.length >= n) break;
    const r = readBelief(s, text);
    if (r.kind === 'supported' && r.candidates.some((c) => c.build.ok)) out.push(text);
  }
  return out;
}
