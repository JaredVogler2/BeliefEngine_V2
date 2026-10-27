import { createAiApp, type AiApp, type Route } from '../../server/ai/app.ts';
import { loadAiConfig, type AiConfig } from '../../server/ai/config.ts';
import { MockProvider, type MockScript } from '../../server/ai/mock-provider.ts';
import { MemoryStore, type QuotaStore } from '../../server/ai/store.ts';

/** Shared fixtures for the inference-service tests. Every value here is a fake; nothing reaches a network or a real provider. */

export const SECRET = 'test-session-secret-0123456789abcdef-XYZ';
export const ORIGIN = 'https://game.example';
export const GATEWAY_KEY = 'test-gateway-key-not-real-0123456789';
export const STORE_TOKEN = 'test-store-token-SHOULD-NOT-LEAK';

export const FULL_ENV: Record<string, string | undefined> = {
  BE_AI_ENABLED: '1',
  AI_GATEWAY_API_KEY: GATEWAY_KEY,
  BE_SESSION_SECRET: SECRET,
  BE_ALLOWED_ORIGINS: `${ORIGIN}, https://preview.game.example`,
  UPSTASH_REDIS_REST_URL: 'https://store.example',
  UPSTASH_REDIS_REST_TOKEN: STORE_TOKEN,
  BE_ADMIN_TOKEN: 'test-admin-token-0123456789abcdef-0123',
};

export interface Harness {
  app: AiApp;
  store: QuotaStore;
  provider: MockProvider;
  config: AiConfig;
  logs: string[];
  clock: { t: number };
  call: (route: Route, init?: { method?: string; body?: unknown; token?: string | null; origin?: string | null; ip?: string; headers?: Record<string, string> }) => Promise<{ status: number; body: Record<string, unknown>; headers: Headers }>;
  session: (ip?: string) => Promise<string>;
}

export function harness(script: MockScript, opts: { env?: Record<string, string | undefined>; store?: QuotaStore; t0?: number } = {}): Harness {
  const config = loadAiConfig({ ...FULL_ENV, ...(opts.env ?? {}) });
  const store = opts.store ?? new MemoryStore(() => clock.t);
  const provider = new MockProvider(script);
  const logs: string[] = [];
  const clock = { t: opts.t0 ?? Date.UTC(2026, 9, 27, 12, 0, 0) };
  const app = createAiApp({ config, store, provider, now: () => clock.t, log: (l) => logs.push(l) });
  const call: Harness['call'] = async (route, init = {}) => {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (init.body !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';
    if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
    if (init.token) headers.authorization = `Bearer ${init.token}`;
    headers['x-real-ip'] = init.ip ?? '203.0.113.7';
    const req = new Request(`https://game.example/api/${route}`, { method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'), headers, body: init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body) });
    const res = await app(route, req);
    return { status: res.status, body: (await res.json()) as Record<string, unknown>, headers: res.headers };
  };
  const session = async (ip?: string) => {
    const r = await call('session', { body: { consent: true }, ip });
    if (r.status !== 200) throw new Error(`session failed: ${JSON.stringify(r.body)}`);
    return r.body.token as string;
  };
  return { app, store, provider, config, logs, clock, call, session };
}
