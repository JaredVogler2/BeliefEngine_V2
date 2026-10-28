import { createAiApp, type AiApp, type Route } from './app.ts';
import { loadAiConfig, withoutCredential, type AiConfig } from './config.ts';
import { MockProvider } from './mock-provider.ts';
import type { InferenceProvider } from './provider.ts';
import { gatewayModels, SdkProvider } from './sdk-provider.ts';
import { MemoryStore, RedisRestStore, type QuotaStore } from './store.ts';
import { demoInterpretV1 } from './tasks/interpret-v1.ts';
import { demoInterpretV2 } from './tasks/interpret-v2.ts';
import { demoNpc } from './tasks/npc.ts';

/**
 * Production wiring: the function's environment → configuration → store and provider → the app. Each `api/*.ts` file is a Vercel
 * Function that exports `handler(route)`, the web-standard `{ fetch }` object Vercel's Node.js runtime calls.
 *
 * The app object is cached per instance only for speed; it holds no state that matters across requests. Every quota, lease and
 * spend counter lives in the shared store, so a cold start or a new instance changes nothing.
 */

/** The deterministic stand-in the local simulator can use instead of a model (BE_AI_DEV_PROVIDER=mock, never on Vercel). */
export function demoProvider(): MockProvider {
  // a scripted answer costs nothing: its reported cost is 0, so the simulator's metrics never show invented spend
  return new MockProvider((c) => ({ kind: 'ok', value: c.task === 'npc' ? demoNpc(c.prompt) : c.schemaName === 'reality_reading' ? demoInterpretV2(c.prompt) : demoInterpretV1(c.prompt), latencyMs: 5, costUsd: 0 }));
}

export function buildApp(env: Record<string, string | undefined>, opts: { now?: () => number; log?: (line: string) => void } = {}): { app: AiApp; config: AiConfig } {
  const config = loadAiConfig(env);
  const store: QuotaStore | null = config.store.kind === 'redis-rest' ? new RedisRestStore(config.store.url, config.store.token) : config.store.kind === 'memory' ? new MemoryStore() : null;
  const mock = env.BE_AI_DEV_PROVIDER === 'mock' && !config.onVercel;
  const provider: InferenceProvider | null = mock ? demoProvider() : config.credential !== 'none' ? new SdkProvider({ model: gatewayModels(config.apiKey) }) : null;
  const effective: AiConfig = mock ? withoutCredential(config) : config;
  return { app: createAiApp({ config: effective, store, provider, now: opts.now, log: opts.log }), config: effective };
}

let cached: AiApp | null = null;

export function handler(route: Route): { fetch: (req: Request) => Promise<Response> } {
  return {
    fetch: (req: Request) => {
      cached ??= buildApp(process.env).app;
      return cached(route, req);
    },
  };
}
