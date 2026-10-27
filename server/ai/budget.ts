/**
 * Cost accounting in integer micro-dollars (1e-6 USD), so counters stay exact in Redis.
 *
 * Before a call, the service reserves the most the call could cost (its input estimate plus the full output allowance) against
 * the day's spend cap; afterwards it refunds the difference to the real cost. Two parallel calls can therefore never both pass a
 * cap that only one fits under. Prices are USD per token from the Vercel AI Gateway catalog
 * (https://ai-gateway.vercel.sh/v1/models), read on 2026-10-27; when the gateway reports a call's actual cost, that is used instead.
 */

export interface Price {
  input: number;
  output: number;
}

export const PRICES_AS_OF = '2026-10-27';

export const PRICES: Record<string, Price> = {
  'anthropic/claude-haiku-5.5': { input: 0.0000001, output: 0.0000005 },
  'anthropic/claude-sonnet-5.5': { input: 0.000002, output: 0.00001 },
  'openai/gpt-6-luna': { input: 0.0000001, output: 0.0000005 },
  'openai/gpt-6.1-terra': { input: 0.000001, output: 0.000005 },
  'google/gemini-3.1-flash-lite': { input: 0.00000025, output: 0.0000015 },
};

/** An unknown model is costed like the most expensive non-"pro" tier in the catalog, so a reservation can only over-estimate. */
export const UNKNOWN_PRICE: Price = { input: 0.00001, output: 0.00005 };

export function priceOf(modelId: string): Price {
  return PRICES[modelId] ?? UNKNOWN_PRICE;
}

/** Conservative token estimate for text the service sends: about 3 characters per token (English averages nearer 4). */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 3) + 16;
}

export function microUsd(usd: number): number {
  return Math.ceil(usd * 1_000_000);
}

export function reserveMicros(modelId: string, inputChars: number, maxOutputTokens: number): number {
  const p = priceOf(modelId);
  return microUsd(estimateTokens(inputChars) * p.input + maxOutputTokens * p.output);
}

export function actualMicros(modelId: string, usage: { inputTokens: number; outputTokens: number }, reportedUsd: number | null): number {
  if (reportedUsd !== null && Number.isFinite(reportedUsd) && reportedUsd >= 0) return microUsd(reportedUsd);
  const p = priceOf(modelId);
  return microUsd(usage.inputTokens * p.input + usage.outputTokens * p.output);
}
