import { NO_USAGE, type FailureKind, type InferenceProvider, type ModelCall, type ModelResult, type Usage } from './provider.ts';

/**
 * A scripted provider. It runs no model: tests give it a script, and the local simulator (`npm run dev:api` with
 * BE_AI_DEV_PROVIDER=mock) gives it the deterministic demo answers each task defines. Everything it returns still goes through
 * the same schema check as a real model's output, and every response it produces is labelled `provider: "mock"` all the way to
 * the screen. A mock answer is never evidence that a model works: it is TESTED MOCK ONLY.
 */

export type MockStep =
  /** a value the schema will check (so a wrong shape becomes a "malformed" failure, as with a real model) */
  | { kind: 'ok'; value: unknown; usage?: Partial<Usage>; latencyMs?: number; costUsd?: number; modelId?: string }
  /** raw text as a model might emit it: parsed as JSON, then checked */
  | { kind: 'text'; text: string; usage?: Partial<Usage> }
  | { kind: 'fail'; failure: FailureKind; usage?: Partial<Usage> }
  /** never answers: the call ends at its timeout (or its abort signal) */
  | { kind: 'hang' };

export type MockScript = (call: ModelCall<unknown>, n: number) => MockStep | Promise<MockStep>;

export class MockProvider implements InferenceProvider {
  readonly name = 'mock';
  readonly calls: ModelCall<unknown>[] = [];

  constructor(private readonly script: MockScript) {}

  async call<T>(c: ModelCall<T>): Promise<ModelResult<T>> {
    this.calls.push(c as ModelCall<unknown>);
    const t0 = Date.now();
    const step = await this.script(c as ModelCall<unknown>, this.calls.length);
    const usage = (u?: Partial<Usage>): Usage => ({ ...NO_USAGE, ...(u ?? {}) });
    if (step.kind === 'hang') {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, c.timeoutMs);
        c.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      return { ok: false, kind: 'timeout', modelId: c.modelId, usage: NO_USAGE, latencyMs: Date.now() - t0, detail: 'TimeoutError' };
    }
    if (step.kind === 'fail') return { ok: false, kind: step.failure, modelId: c.modelId, usage: usage(step.usage), latencyMs: Date.now() - t0, detail: `mock ${step.failure}` };
    let raw: unknown;
    if (step.kind === 'text') {
      try {
        raw = JSON.parse(step.text);
      } catch {
        return { ok: false, kind: 'malformed', modelId: c.modelId, usage: usage(step.usage), latencyMs: Date.now() - t0, detail: 'output was not JSON' };
      }
    } else raw = step.value;
    const parsed = c.schema.safeParse(raw);
    if (!parsed.success) return { ok: false, kind: 'malformed', modelId: c.modelId, usage: usage(step.usage), latencyMs: Date.now() - t0, detail: 'output did not match the schema' };
    const latency = step.kind === 'ok' && step.latencyMs !== undefined ? step.latencyMs : Date.now() - t0;
    return { ok: true, value: parsed.data, modelId: (step.kind === 'ok' && step.modelId) || c.modelId, usage: usage(step.usage ?? { inputTokens: Math.ceil(c.prompt.length / 4), outputTokens: 60 }), latencyMs: latency, reportedCostUsd: step.kind === 'ok' && step.costUsd !== undefined ? step.costUsd : null, finishReason: 'stop' };
  }
}
