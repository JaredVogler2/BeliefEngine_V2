import type { InferenceMeta } from './types.ts';

/**
 * The inference metadata an action may carry (what the inference service reported about the model call behind a reading, a set of
 * decisions or a voiced line), reduced to bounded, harmless fields. It is recorded with the action (the day's history, the ledger)
 * and never read by the rules; nothing a client sends can make it large or make it carry a key or a prompt.
 */
const short = (x: unknown, n: number): string | null => (typeof x === 'string' && x ? x.slice(0, n) : null);
const finite = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined);

export function cleanMeta(m: unknown): InferenceMeta | undefined {
  if (!m || typeof m !== 'object') return undefined;
  const o = m as Record<string, unknown>;
  const out: InferenceMeta = {};
  const s = (k: 'provider' | 'model' | 'tier' | 'promptVersion' | 'id', n: number) => {
    const v = short(o[k], n);
    if (v) out[k] = v;
  };
  s('provider', 40);
  s('model', 80);
  s('tier', 12);
  s('promptVersion', 60);
  s('id', 60);
  const lat = finite(o.latencyMs);
  if (lat !== undefined) out.latencyMs = Math.round(lat);
  const cost = finite(o.costUsd);
  if (cost !== undefined) out.costUsd = cost;
  const tokens = finite(o.tokens);
  if (tokens !== undefined) out.tokens = Math.round(tokens);
  if (typeof o.cached === 'boolean') out.cached = o.cached;
  return Object.keys(out).length ? out : undefined;
}
