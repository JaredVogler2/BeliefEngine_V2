import { NoObjectGeneratedError, Output, createGateway, generateText, type LanguageModel, type LanguageModelUsage } from 'ai';
import { NO_USAGE, type FailureKind, type InferenceProvider, type ModelCall, type ModelResult, type Usage } from './provider.ts';

/**
 * The real provider: Vercel AI SDK 7 (`generateText` with `output: Output.object({ schema })`, the structured-output API of the
 * installed `ai@7.0.155`) through the Vercel AI Gateway. Authentication is the gateway's own: `AI_GATEWAY_API_KEY` when set
 * (local development), otherwise the deployment's OIDC token. Nothing here reads or logs a credential.
 *
 * Deliberate choices: no retries (`maxRetries: 0`; a failed call costs at most one reservation and the player falls back to the
 * offline reader), a hard timeout, temperature fixed by the task, and the model's text is never trusted: the SDK checks it
 * against the schema, and the routes check it again against the game's own validators.
 */

export interface SdkProviderOptions {
  /** model id → language model. Production: the AI Gateway. Tests: `MockLanguageModelV4` from `ai/test`. */
  model: (modelId: string) => LanguageModel;
  now?: () => number;
}

export function gatewayModels(apiKey: string | null): (modelId: string) => LanguageModel {
  const gw = createGateway(apiKey ? { apiKey } : {});
  return (modelId) => gw(modelId);
}

function usageOf(u: LanguageModelUsage | undefined): Usage {
  if (!u) return NO_USAGE;
  return { inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0, cachedInputTokens: u.inputTokenDetails?.cacheReadTokens ?? 0 };
}

/** The gateway reports a call's cost in its provider metadata; its exact shape is not part of the typed API, so read it defensively. */
function reportedCost(meta: unknown): number | null {
  const g = meta && typeof meta === 'object' ? (meta as Record<string, unknown>).gateway : undefined;
  const c = g && typeof g === 'object' ? (g as Record<string, unknown>).cost : undefined;
  const n = typeof c === 'number' ? c : typeof c === 'string' ? Number(c) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Errors are classified by name and status, without importing the gateway's error classes (a transitive dependency). */
export function classify(err: unknown): { kind: FailureKind; detail: string } {
  const e = (err ?? {}) as { name?: string; statusCode?: number; type?: string; message?: string };
  const name = String(e.name ?? '');
  const status = typeof e.statusCode === 'number' ? e.statusCode : 0;
  if (name === 'TimeoutError' || name === 'AbortError') return { kind: 'timeout', detail: name };
  if (NoObjectGeneratedError.isInstance(err)) return { kind: 'malformed', detail: 'output did not match the schema' };
  if (status === 402 || e.type === 'quota_for_entity_exceeded') return { kind: 'budget', detail: 'gateway budget exceeded' };
  if (name === 'GatewayRateLimitError' || status === 429) return { kind: 'rate_limited', detail: 'rate limited upstream' };
  if (name === 'GatewayAuthenticationError' || status === 401 || status === 403) return { kind: 'auth', detail: 'gateway authentication failed' };
  if (name === 'GatewayModelNotFoundError' || status === 404) return { kind: 'bad_model', detail: 'model not found' };
  if (name === 'GatewayInvalidRequestError' || status === 400) return { kind: 'unavailable', detail: 'request rejected upstream' };
  return { kind: 'unavailable', detail: name || 'provider error' };
}

export class SdkProvider implements InferenceProvider {
  readonly name = 'gateway';
  private readonly now: () => number;

  constructor(private readonly opts: SdkProviderOptions) {
    this.now = opts.now ?? (() => Date.now());
  }

  async call<T>(c: ModelCall<T>): Promise<ModelResult<T>> {
    const t0 = this.now();
    const signals = [AbortSignal.timeout(c.timeoutMs), ...(c.signal ? [c.signal] : [])];
    try {
      const result = await generateText({
        model: this.opts.model(c.modelId),
        instructions: c.instructions,
        prompt: c.prompt,
        output: Output.object({ schema: c.schema, name: c.schemaName, description: c.schemaDescription }),
        maxOutputTokens: c.maxOutputTokens,
        temperature: c.temperature,
        maxRetries: 0,
        abortSignal: AbortSignal.any(signals),
      });
      const usage = usageOf(result.totalUsage);
      const finish = String(result.finishReason);
      if (finish === 'content-filter') return { ok: false, kind: 'refused', modelId: result.response?.modelId ?? c.modelId, usage, latencyMs: this.now() - t0, detail: 'the provider declined' };
      const value = result.output as T;
      return { ok: true, value, modelId: result.response?.modelId ?? c.modelId, usage, latencyMs: this.now() - t0, reportedCostUsd: reportedCost(result.providerMetadata), finishReason: finish };
    } catch (err) {
      const { kind, detail } = classify(err);
      const usage = NoObjectGeneratedError.isInstance(err) ? usageOf(err.usage) : NO_USAGE;
      return { ok: false, kind, modelId: c.modelId, usage, latencyMs: this.now() - t0, detail };
    }
  }
}
