import { useEffect, useState } from 'react';
import { searchCounterfactual, type Counterfactual, type RunState } from '../engine/index.ts';

export type WhatIf = { status: 'idle' } | { status: 'searching'; done: number; planned: number } | { status: 'done'; result: Counterfactual };

const finished = new Map<string, Counterfactual>();

/** One run, one answer: the key is everything that makes the search's input what it is. */
function keyOf(s: RunState): string {
  return `${s.scenarioId}:${s.seed}:${s.difficulty}:${s.mode}:${s.modifiers.join(',')}:${s.history.length}:${s.outcome?.result ?? ''}:${s.stats.actions}`;
}

/**
 * Runs the "what would have changed it" search in the background after a defeat, one simulated day per timer tick so the page
 * stays responsive (a full search is a few seconds of engine time). Victories do not search.
 */
export function useWhatIf(state: RunState): WhatIf {
  const key = keyOf(state);
  const defeat = state.outcome?.result === 'defeat';
  const [now, setNow] = useState<{ key: string; value: WhatIf }>(() => ({ key, value: finished.has(key) ? { status: 'done', result: finished.get(key)! } : { status: defeat ? 'searching' : 'idle', done: 0, planned: 1 } as WhatIf }));
  useEffect(() => {
    if (!defeat || finished.has(key)) return;
    let cancelled = false;
    const it = searchCounterfactual(state);
    const step = () => {
      if (cancelled) return;
      const r = it.next();
      if (r.done) {
        finished.set(key, r.value);
        setNow({ key, value: { status: 'done', result: r.value } });
        return;
      }
      setNow({ key, value: { status: 'searching', done: r.value.rollouts, planned: Math.max(r.value.planned, r.value.rollouts + 1) } });
      window.setTimeout(step, 0);
    };
    const t = window.setTimeout(step, 250); // let the end-of-run scene paint first
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [key, defeat, state]);
  if (finished.has(key)) return { status: 'done', result: finished.get(key)! };
  if (now.key === key) return now.value;
  return { status: defeat ? 'searching' : 'idle', done: 0, planned: 1 } as WhatIf;
}
