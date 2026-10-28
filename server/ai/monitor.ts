import type { MetricsSummary } from './meter.ts';

/**
 * The operator's view of GET /api/ai-metrics as plain text (`npm run ai:monitor`): today's calls and fallbacks, tokens, spend per
 * model, cache hit rate, latency and the budget. Pure: it formats what the route answered and adds nothing. The route never
 * returns a key, a sentence or a session, so neither can this.
 */

export interface MetricsBody {
  ok: boolean;
  configured?: boolean;
  missing?: string[];
  credential?: string;
  store?: string;
  provider?: string | null;
  models?: Record<string, string>;
  budget?: { dailyUsd: number; reservedOrSpentUsd: number; callsToday: number; callsPerDay: number };
  today?: MetricsSummary;
}

const n = (x: number) => x.toLocaleString('en-US');
const usd = (x: number) => (x === 0 ? '$0' : x < 0.01 ? `$${x.toFixed(6)}` : x < 1 ? `$${x.toFixed(4)}` : `$${x.toFixed(2)}`);
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

export function formatMetrics(m: MetricsBody): string {
  const lines: string[] = [];
  if (!m.today || !m.budget) {
    lines.push('Inference service: no usage store is configured, so there is nothing to count.');
    if (m.missing?.length) lines.push(`Missing settings (names only): ${m.missing.join(', ')}`);
    return lines.join('\n');
  }
  const t = m.today;
  const b = m.budget;
  lines.push(`Inference service, UTC day ${t.day.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')}`);
  lines.push(`  service    ${m.configured ? 'ready' : `not ready${m.missing?.length ? ` (missing: ${m.missing.join(', ')})` : ''}`} · provider ${m.provider ?? 'none'} · credential ${m.credential ?? 'none'} · store ${m.store ?? 'none'}`);
  lines.push(`  budget     ${usd(b.reservedOrSpentUsd)} of ${usd(b.dailyUsd)} reserved or spent (${pct(b.dailyUsd ? b.reservedOrSpentUsd / b.dailyUsd : 0)}) · ${n(b.callsToday)} of ${n(b.callsPerDay)} calls`);
  const hits = t.outcomes['interpret.cache_hit'] ?? 0;
  lines.push(`  calls      readings ${n(t.calls.interpret)} (cache hits ${n(hits)}${t.cacheHitRate === null ? '' : `, ${pct(t.cacheHitRate)}`}) · villager batches ${n(t.calls.npc)}`);
  const answered = t.calls.interpret + t.calls.npc + (t.outcomes['interpret.over_quota'] ?? 0) + (t.outcomes['interpret.over_budget'] ?? 0) + (t.outcomes['npc.over_quota'] ?? 0) + (t.outcomes['npc.over_budget'] ?? 0);
  lines.push(`  fallbacks  ${n(t.fallbacks)}${answered ? ` of ${n(answered)} (${pct(t.fallbacks / answered)})` : ''}: answered by the offline reader or the villagers' own rules`);
  const outcomes = Object.entries(t.outcomes).sort((a, z) => z[1] - a[1] || (a[0] < z[0] ? -1 : 1));
  lines.push(`  outcomes   ${outcomes.length ? outcomes.map(([k, v]) => `${k} ${n(v)}`).join(' · ') : 'none yet'}`);
  lines.push(`  tokens     in ${n(t.tokens.input)} · out ${n(t.tokens.output)} · cached in ${n(t.tokens.cachedInput)}`);
  lines.push(`  spend      ${usd(t.costUsd)} today (the gateway's reported cost where it gave one, else list price x tokens)`);
  lines.push(`  latency    ${t.latencyMs.samples ? `p50 <= ${n(t.latencyMs.p50!)} ms · p95 <= ${n(t.latencyMs.p95!)} ms (${n(t.latencyMs.samples)} calls; bucket edges, not exact)` : 'no calls yet'}`);
  const models = Object.keys({ ...t.models, ...t.spendByModelUsd }).sort();
  if (models.length) for (const id of models) lines.push(`  model      ${id}: ${n(t.models[id] ?? 0)} calls, ${usd(t.spendByModelUsd[id] ?? 0)}`);
  else lines.push('  model      none called yet');
  if (m.models) lines.push(`  tiers      fast ${m.models.fast ?? '?'} · accurate ${m.models.accurate ?? '?'}`);
  return lines.join('\n');
}
