import { AiClient } from '../src/ai/client.ts';
import { ROUTES, type Route } from '../server/ai/app.ts';
import { withDevDefaults } from '../server/ai/config.ts';
import { buildApp } from '../server/ai/vercel.ts';

/**
 * Online reading for the local MCP server (phase 13): OFF unless the person who starts the server sets `BE_AI_ENABLED=1` in its
 * environment, the same switch as the game's own inference service. When on, the MCP process runs that same service in-process
 * (`server/ai/app.ts`: consent session, cooldowns, one-at-a-time lease, daily call and spend reservations, provider timeout, and the
 * engine's validation of every answer) and talks to it with the browser's own client, so an agent gets exactly what a browser player
 * gets: proposals the engine rebuilds and checks, never a model's word taken on trust. MCP itself never supplies inference.
 *
 * Credentials stay in the environment (AI_GATEWAY_API_KEY locally, never in a tool argument); `BE_AI_DEV_PROVIDER=mock` runs the
 * scripted stand-in instead of a model, and every answer from it is labelled "mock".
 */

export interface OnlineReader {
  client: AiClient;
  /** 'mock' (scripted, no model), 'vercel-ai-gateway' (paid calls), or null when the service is not ready (it then refuses each call) */
  provider: 'mock' | 'vercel-ai-gateway' | null;
}

export function onlineReaderFromEnv(env: Record<string, string | undefined>, log: (line: string) => void = () => {}): OnlineReader | null {
  if (env.BE_AI_ENABLED !== '1') return null;
  const full = withDevDefaults({ ...env }, `mcp-${crypto.randomUUID()}-${crypto.randomUUID()}`);
  const { app, config } = buildApp(full, { log });
  const origin = config.origins[0] ?? 'http://127.0.0.1:4173';
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const route = url.replace(/^\/api\//, '') as Route;
    if (!ROUTES.includes(route)) return new Response('{"ok":false,"reason":"not_found"}', { status: 404, headers: { 'content-type': 'application/json' } });
    const headers = new Headers(init.headers as HeadersInit | undefined);
    // the in-process caller is this server, on behalf of the agent the person connected: it presents the service's own first origin
    headers.set('origin', origin);
    headers.set('x-real-ip', '127.0.0.1');
    return app(route, new Request(`http://127.0.0.1${url}`, { method: init.method ?? 'GET', headers, body: init.method === 'GET' ? undefined : (init.body as BodyInit | null | undefined), signal: init.signal ?? undefined }));
  }) as unknown as typeof fetch;
  const provider = env.BE_AI_DEV_PROVIDER === 'mock' ? 'mock' : config.credential !== 'none' ? 'vercel-ai-gateway' : null;
  return { client: new AiClient({ fetch: fetchImpl }), provider };
}
