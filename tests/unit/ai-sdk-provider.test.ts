import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { SdkProvider, classify } from '../../server/ai/sdk-provider.ts';
import type { ModelCall } from '../../server/ai/provider.ts';
import { InterpretV1Output, interpretV1Instructions } from '../../server/ai/tasks/interpret-v1.ts';

/**
 * The real provider code path, `generateText` + `Output.object` from the installed AI SDK 7, driven by the SDK's own mock language
 * model instead of the gateway. This proves the adapter's use of the SDK (structured output, usage, finish reasons, error
 * classification, timeouts) without a network or a key. It does NOT prove anything about a live model: that is the LIVE smoke
 * test in docs/AI_SETUP.md, still UNVERIFIED.
 */

type GenResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;

function result(text: string, finish: 'stop' | 'length' | 'content-filter' = 'stop', inTok = 321, outTok = 45): GenResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: finish, raw: finish },
    usage: { inputTokens: { total: inTok, noCache: inTok - 21, cacheRead: 21, cacheWrite: 0 }, outputTokens: { total: outTok, text: outTok, reasoning: 0 } },
    warnings: [],
  } as unknown as GenResult;
}

function call(over: Partial<ModelCall<InterpretV1Output>> = {}): ModelCall<InterpretV1Output> {
  return { task: 'interpret', tier: 'fast', modelId: 'anthropic/claude-haiku-5.5', instructions: interpretV1Instructions(), prompt: JSON.stringify({ claim: 'The river fears lanterns.', village: { features: [], regions: ['east'] } }), schema: InterpretV1Output, schemaName: 'belief_reading', schemaDescription: 'test', maxOutputTokens: 400, timeoutMs: 2000, temperature: 0, ...over };
}

const GOOD = { understood: true, candidates: [{ subject: 'river', effect: 'repel', trigger: 'lit_beacon', intensity: 2, radius: 2, watchers: null, title: null }] };

describe('SdkProvider over the AI SDK (mock language model, no network)', () => {
  it('returns the schema-checked object, usage including cached input, and sends instructions and data separately', async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => result(JSON.stringify(GOOD)) });
    const p = new SdkProvider({ model: () => model });
    const r = await p.call(call());
    expect(r).toMatchObject({ ok: true, value: GOOD, usage: { inputTokens: 321, outputTokens: 45, cachedInputTokens: 21 }, finishReason: 'stop' });
    const sent = model.doGenerateCalls[0];
    // the structured-output request carries a JSON schema; the claim is only in the user message, as JSON data
    expect(sent.responseFormat).toMatchObject({ type: 'json', name: 'belief_reading' });
    const system = sent.prompt.find((m) => m.role === 'system');
    const user = sent.prompt.find((m) => m.role === 'user');
    expect(JSON.stringify(system)).not.toContain('fears lanterns');
    expect(JSON.stringify(user)).toContain('fears lanterns');
    expect(sent.maxOutputTokens).toBe(400);
    expect(sent.temperature).toBe(0);
  });

  it('classifies malformed JSON and schema mismatches as "malformed", keeping the usage for metering', async () => {
    for (const text of ['not json at all', '{"understood": true, "candidates": [{"subject": "time", "effect": "reverse"}]}', '{"understood": "yes"}']) {
      const p = new SdkProvider({ model: () => new MockLanguageModelV4({ doGenerate: async () => result(text, 'stop', 100, 10) }) });
      const r = await p.call(call());
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.kind).toBe('malformed');
        expect(r.usage.inputTokens).toBe(100);
      }
    }
  });

  it('asks the gateway, on every call, for providers that do not train on the data; and for zero data retention when configured', async () => {
    for (const zeroRetention of [false, true]) {
      const model = new MockLanguageModelV4({ doGenerate: async () => result(JSON.stringify(GOOD)) });
      expect((await new SdkProvider({ model: () => model, zeroRetention }).call(call())).ok).toBe(true);
      const gateway = (model.doGenerateCalls[0].providerOptions as { gateway?: Record<string, unknown> } | undefined)?.gateway;
      expect(gateway).toEqual(zeroRetention ? { disallowPromptTraining: true, zeroDataRetention: true } : { disallowPromptTraining: true });
    }
  });

  it('treats a content-filter finish as a refusal', async () => {
    const p = new SdkProvider({ model: () => new MockLanguageModelV4({ doGenerate: async () => result(JSON.stringify(GOOD), 'content-filter') }) });
    expect(await p.call(call())).toMatchObject({ ok: false, kind: 'refused' });
  });

  it('times out a model that never answers, at the call deadline', async () => {
    const hang = new MockLanguageModelV4({ doGenerate: ({ abortSignal }) => new Promise((_, reject) => abortSignal?.addEventListener('abort', () => reject(abortSignal.reason))) });
    const p = new SdkProvider({ model: () => hang });
    const t0 = Date.now();
    const r = await p.call(call({ timeoutMs: 150 }));
    expect(r).toMatchObject({ ok: false, kind: 'timeout' });
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('classifies gateway and HTTP errors without leaking their messages', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ name: 'GatewayRateLimitError', statusCode: 429 }, 'rate_limited'],
      [{ name: 'GatewayAuthenticationError', statusCode: 401 }, 'auth'],
      [{ name: 'GatewayInternalServerError', statusCode: 402, type: 'quota_for_entity_exceeded' }, 'budget'],
      [{ name: 'GatewayModelNotFoundError', statusCode: 404 }, 'bad_model'],
      [{ name: 'GatewayInvalidRequestError', statusCode: 400, type: 'no_providers_available' }, 'unavailable'],
      [{ name: 'AI_APICallError', statusCode: 503 }, 'unavailable'],
      [{ name: 'TypeError' }, 'unavailable'],
    ];
    for (const [shape, kind] of cases) {
      const err = Object.assign(new Error('upstream said: key sk-live-SECRET was wrong'), shape);
      const p = new SdkProvider({ model: () => new MockLanguageModelV4({ doGenerate: async () => Promise.reject(err) }) });
      const r = await p.call(call());
      expect(r).toMatchObject({ ok: false, kind });
      expect(JSON.stringify(r)).not.toContain('SECRET');
      expect(classify(err).kind).toBe(kind);
    }
  });
});
