import { dayKey } from './crypto.ts';
import type { QuotaStore } from './store.ts';

/**
 * Metering: per-day counters of calls, outcomes, tokens, cost and latency, kept in the shared store (so every instance adds to
 * the same totals) and one structured log line per call. Neither ever contains a claim, a villager's memory, a session id, an
 * address or a credential: only route, outcome, tier, model id, token counts, milliseconds and micro-dollars.
 */

export type Outcome = 'ok' | 'cache_hit' | 'invalid' | 'timeout' | 'unavailable' | 'rate_limited' | 'refused' | 'malformed' | 'auth' | 'budget' | 'bad_model';

export interface MeterEvent {
  route: 'interpret' | 'npc';
  outcome: Outcome;
  tier?: string;
  modelId?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  latencyMs?: number;
  costMicros?: number;
  agents?: number;
}

export const LATENCY_BUCKETS = [250, 500, 1000, 2000, 4000, 8000, 16000, 32000];
const METRICS_TTL_MS = 9 * 24 * 3600_000;

export class Meter {
  constructor(
    private readonly store: QuotaStore | null,
    private readonly log: (line: string) => void,
    private readonly now: () => number,
  ) {}

  async record(e: MeterEvent): Promise<void> {
    this.log(JSON.stringify({ evt: 'be.ai', route: e.route, outcome: e.outcome, tier: e.tier, model: e.modelId, provider: e.provider, inTok: e.inputTokens ?? 0, outTok: e.outputTokens ?? 0, cachedTok: e.cachedInputTokens ?? 0, ms: e.latencyMs ?? 0, micros: e.costMicros ?? 0, agents: e.agents }));
    if (!this.store) return;
    const fields: Record<string, number> = { [`${e.route}.calls`]: 1, [`${e.route}.${e.outcome}`]: 1 };
    if (e.outcome !== 'cache_hit') {
      fields['tok.in'] = e.inputTokens ?? 0;
      fields['tok.out'] = e.outputTokens ?? 0;
      fields['tok.cached'] = e.cachedInputTokens ?? 0;
      fields['cost.micros'] = e.costMicros ?? 0;
      if (e.latencyMs !== undefined) fields[`lat.${LATENCY_BUCKETS.find((b) => e.latencyMs! <= b) ?? 'inf'}`] = 1;
      if (e.modelId) fields[`model.${e.modelId}`] = 1;
    }
    if (e.agents) fields[`${e.route}.agents`] = e.agents;
    // metrics are best effort: a store hiccup after the call must not turn a paid answer into an error
    await this.store.hincr(`m:${dayKey(this.now())}`, fields, METRICS_TTL_MS).catch(() => undefined);
  }
}

export interface MetricsSummary {
  day: string;
  calls: { interpret: number; npc: number };
  outcomes: Record<string, number>;
  tokens: { input: number; output: number; cachedInput: number };
  costUsd: number;
  cacheHitRate: number | null;
  latencyMs: { p50: number | null; p95: number | null; samples: number };
  models: Record<string, number>;
}

/** Percentiles from the latency buckets: an upper bound (the bucket edge), never an invented precise number. */
export function summarize(day: string, raw: Record<string, number>): MetricsSummary {
  const outcomes: Record<string, number> = {};
  const models: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('model.')) models[k.slice(6)] = v;
    else if (/^(interpret|npc)\./.test(k) && !k.endsWith('.calls') && !k.endsWith('.agents')) outcomes[k] = v;
  }
  const buckets = [...LATENCY_BUCKETS.map(String), 'inf'].map((b) => ({ edge: b === 'inf' ? Infinity : Number(b), n: raw[`lat.${b}`] ?? 0 }));
  const samples = buckets.reduce((a, b) => a + b.n, 0);
  const pct = (p: number): number | null => {
    if (!samples) return null;
    let acc = 0;
    for (const b of buckets) {
      acc += b.n;
      if (acc >= p * samples) return Number.isFinite(b.edge) ? b.edge : LATENCY_BUCKETS[LATENCY_BUCKETS.length - 1] * 2;
    }
    return null;
  };
  const interpretCalls = raw['interpret.calls'] ?? 0;
  const hits = raw['interpret.cache_hit'] ?? 0;
  return {
    day,
    calls: { interpret: interpretCalls, npc: raw['npc.calls'] ?? 0 },
    outcomes,
    tokens: { input: raw['tok.in'] ?? 0, output: raw['tok.out'] ?? 0, cachedInput: raw['tok.cached'] ?? 0 },
    costUsd: (raw['cost.micros'] ?? 0) / 1_000_000,
    cacheHitRate: interpretCalls ? hits / interpretCalls : null,
    latencyMs: { p50: pct(0.5), p95: pct(0.95), samples },
    models,
  };
}
