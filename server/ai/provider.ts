import type { z } from 'zod';
import type { Tier } from './config.ts';

/**
 * The one seam between the game's server and any language model. A provider receives a fixed instruction, the request's data as
 * a JSON string and a schema, and returns either an object that already passed that schema or a classified failure. It never
 * throws for a model's misbehaviour: a timeout, a refusal, malformed output or an outage are all ordinary results, because every
 * one of them must end in "use the offline reader", never in a broken game.
 */

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export interface ModelCall<T> {
  task: 'interpret' | 'npc';
  tier: Tier;
  modelId: string;
  /** fixed, versioned instructions; never contains player text */
  instructions: string;
  /** the request's data, serialised as JSON: player text travels only here, as a string value */
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  schemaDescription: string;
  maxOutputTokens: number;
  timeoutMs: number;
  temperature: number;
  signal?: AbortSignal;
}

export type FailureKind = 'timeout' | 'unavailable' | 'rate_limited' | 'refused' | 'malformed' | 'auth' | 'budget' | 'bad_model';

export type ModelResult<T> =
  | { ok: true; value: T; modelId: string; usage: Usage; latencyMs: number; reportedCostUsd: number | null; finishReason: string }
  | { ok: false; kind: FailureKind; modelId: string; usage: Usage; latencyMs: number; detail: string };

export interface InferenceProvider {
  /** 'gateway' for the real AI SDK path, 'mock' for scripted tests; reported in logs and recorded with every decision */
  readonly name: 'gateway' | 'mock';
  call<T>(c: ModelCall<T>): Promise<ModelResult<T>>;
}

export const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
