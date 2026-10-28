import { describe, expect, it } from 'vitest';
import { formatMetrics, type MetricsBody } from '../../server/ai/monitor.ts';
import { demoInterpretV2 } from '../../server/ai/tasks/interpret-v2.ts';
import { FULL_ENV, GATEWAY_KEY, SECRET, STORE_TOKEN, harness } from '../helpers/ai.ts';

/** Phase 15: the operator's cost monitor (`npm run ai:monitor`), fed by GET /api/ai-metrics. Scripted provider; nothing is billed. */

const req = (text: string) => ({ v: 2, text, lang: 'reality-1', scenario: { id: 'redbank', seed: 1, lab: false }, region: null, day: 1, run: { id: 'run-abc', rev: 4 } });

describe('cost monitor', () => {
  it('shows calls, cache hits, fallbacks (a provider failure and a quota refusal), tokens, spend per model, latency and the budget; never a key, a token or a sentence', async () => {
    // a project cap of two calls a day: the third reading is refused by the application before any call
    const h = harness((c, n) => (n === 2 ? { kind: 'fail', failure: 'timeout' } : { kind: 'ok', value: demoInterpretV2(c.prompt), usage: { inputTokens: 600, outputTokens: 150 } }), { env: { BE_AI_CALLS_PER_DAY: '2' } });
    const token = await h.session();
    const read = async (text: string) => {
      h.clock.t += h.config.limits.interpretCooldownMs + 1;
      return h.call('interpret-reality', { body: req(text), token });
    };
    expect((await read('Chickens fly when the bell rings.')).body).toMatchObject({ ok: true, cached: false });
    expect((await read('Wet stone becomes light beside lanterns.')).body).toMatchObject({ ok: false, fallback: 'offline' });
    expect((await read('Chickens fly when the bell rings.')).body).toMatchObject({ ok: true, cached: true });
    expect((await read('Flames burn weaker at night.')).body).toMatchObject({ ok: false, reason: 'over_quota' });

    const m = await h.call('ai-metrics', { token: FULL_ENV.BE_ADMIN_TOKEN });
    const today = (m.body as unknown as MetricsBody).today!;
    expect(today.calls.interpret).toBe(3);
    expect(today.fallbacks).toBe(2);
    expect(today.outcomes).toMatchObject({ 'interpret.ok': 1, 'interpret.timeout': 1, 'interpret.cache_hit': 1, 'interpret.over_quota': 1 });
    expect(today.spendByModelUsd['anthropic/claude-haiku-5.5']).toBeGreaterThan(0);
    expect(today.costUsd).toBeCloseTo(today.spendByModelUsd['anthropic/claude-haiku-5.5'], 9);

    const panel = formatMetrics(m.body as unknown as MetricsBody);
    for (const want of ['readings 3 (cache hits 1, 33.3%)', 'fallbacks  2 of 4 (50%)', 'interpret.over_quota 1', 'interpret.timeout 1', 'anthropic/claude-haiku-5.5: 2 calls', 'of 2 calls', 'p95 <=', 'in 600 · out 150'])
      expect(panel, want).toContain(want);
    for (const never of [FULL_ENV.BE_ADMIN_TOKEN!, token, SECRET, GATEWAY_KEY, STORE_TOKEN, 'Chickens fly', 'lanterns']) expect(panel).not.toContain(never);
  });

  it('says what is missing (by name) when there is no usage store to count with', () => {
    expect(formatMetrics({ ok: true, configured: false, missing: ['BE_SESSION_SECRET', 'UPSTASH_REDIS_REST_URL'] })).toMatch(/no usage store.*\n.*BE_SESSION_SECRET, UPSTASH_REDIS_REST_URL/);
  });
});
