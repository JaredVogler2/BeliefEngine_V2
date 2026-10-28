/**
 * Operator monitor for the inference service (phase 15): today's calls, fallbacks, tokens, spend per model, cache hit rate,
 * latency p50/p95 and the budget, read from GET /api/ai-metrics.
 *
 *   BE_ADMIN_TOKEN=... npm run ai:monitor                        # the local simulator (npm run dev:api) on 127.0.0.1:8787
 *   BE_ADMIN_TOKEN=... npm run ai:monitor -- --url https://<project>.vercel.app/api/ai-metrics --watch 30
 *   npm run ai:monitor -- --demo                                 # no server and no key: an in-process service, scripted provider
 *
 * The operator token comes from the environment (or an untracked .env.local) and is sent only in the Authorization header; it is
 * never printed. --demo runs no model: its numbers are the simulator's (zero cost), which shows the monitor works, nothing more.
 */
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { formatMetrics, type MetricsBody } from '../server/ai/monitor.ts';
import { buildApp } from '../server/ai/vercel.ts';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function fromServer(url: string, token: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  } catch {
    return `Could not reach ${url}. Is the service running (npm run dev:api)?`;
  }
  if (res.status === 404) return 'The metrics route is off on that server: set BE_ADMIN_TOKEN (32+ characters) in its environment.';
  if (res.status === 401) return 'The server refused the operator token.';
  if (!res.ok) return `The metrics route answered ${res.status}.`;
  return formatMetrics((await res.json()) as MetricsBody);
}

/** An in-process service with the scripted provider and a memory store; a few requests, then its metrics. */
async function demo(): Promise<string> {
  const admin = randomBytes(24).toString('hex');
  const origin = 'http://127.0.0.1:5173';
  const { app } = buildApp({ BE_AI_ENABLED: '1', BE_AI_DEV_PROVIDER: 'mock', BE_AI_DEV_MEMORY_STORE: '1', BE_SESSION_SECRET: randomBytes(32).toString('hex'), BE_ALLOWED_ORIGINS: origin, BE_ADMIN_TOKEN: admin }, { log: () => undefined });
  const call = async (route: 'session' | 'interpret-reality' | 'ai-metrics', body?: unknown, token?: string) => {
    const headers: Record<string, string> = { origin, 'x-real-ip': '127.0.0.1' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const r = await app(route, new Request(`${origin}/api/${route}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }));
    return (await r.json()) as Record<string, unknown>;
  };
  const token = (await call('session', { consent: true })).token as string;
  const read = (text: string) => call('interpret-reality', { v: 2, text, lang: 'reality-1', scenario: { id: 'redbank', seed: 1, lab: false }, region: null, day: 1, run: { id: 'run-demo', rev: 1 } }, token);
  for (const text of ['Chickens fly when the bell rings.', 'Wet stone becomes light beside lanterns.', 'Chickens fly when the bell rings.']) {
    await read(text);
    await new Promise((r) => setTimeout(r, 3100)); // the per-session cooldown between readings
  }
  return `DEMO: in-process service, scripted provider (no model was called; cost is zero by construction)\n${formatMetrics((await call('ai-metrics', undefined, admin)) as unknown as MetricsBody)}`;
}

async function main(): Promise<void> {
  if (args.includes('--demo')) {
    console.log(await demo());
    return;
  }
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const token = process.env.BE_ADMIN_TOKEN;
  if (!token) {
    console.log('Set BE_ADMIN_TOKEN in your environment (the same value the server has). Or run with --demo to see the monitor without a server.');
    process.exitCode = 2;
    return;
  }
  const url = opt('--url') ?? `http://127.0.0.1:${process.env.BE_AI_DEV_PORT ?? 8787}/api/ai-metrics`;
  const every = Number(opt('--watch') ?? 0);
  for (;;) {
    console.log(`${new Date().toISOString()}  ${url}\n${await fromServer(url, token)}\n`);
    if (!every) return;
    await new Promise((r) => setTimeout(r, Math.max(5, every) * 1000));
  }
}

await main();
