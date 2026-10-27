/**
 * Local simulator for the inference service: the same app the Vercel Functions run, behind a small Node HTTP server on
 * 127.0.0.1, so `npm run dev` (Vite proxies /api here) or the browser tests can use the online flow on a developer's machine.
 *
 *   npm run dev:api                                  # reads .env.local if present
 *   BE_AI_ENABLED=1 BE_AI_DEV_PROVIDER=mock BE_AI_DEV_MEMORY_STORE=1 npm run dev:api   # no key, no store: scripted answers
 *
 * With BE_AI_DEV_PROVIDER=mock it runs NO model: answers come from deterministic stand-ins and the game labels them "simulated".
 * With AI_GATEWAY_API_KEY in .env.local it calls the real gateway, which costs money. It never runs on Vercel.
 */
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ROUTES, type Route } from './app.ts';
import { readiness, withDevDefaults } from './config.ts';
import { buildApp } from './vercel.ts';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const env = withDevDefaults({ ...process.env }, `dev-${crypto.randomUUID()}-${crypto.randomUUID()}`);

const { app, config } = buildApp(env, { log: (line) => process.stdout.write(`${line}\n`) });
const port = Number(env.BE_AI_DEV_PORT ?? 8787);

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  headers.set('x-real-ip', req.socket.remoteAddress ?? '127.0.0.1');
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(`http://127.0.0.1:${port}${req.url ?? '/'}`, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body });
}

async function send(res: ServerResponse, r: Response): Promise<void> {
  res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
  res.end(Buffer.from(await r.arrayBuffer()));
}

const server = createServer(async (req, res) => {
  const route = /^\/api\/([a-z-]+)\/?(?:\?.*)?$/.exec(req.url ?? '')?.[1] as Route | undefined;
  if (!route || !ROUTES.includes(route)) {
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"ok":false,"reason":"not_found"}');
    return;
  }
  try {
    await send(res, await app(route, await toRequest(req)));
  } catch {
    res.writeHead(500, { 'content-type': 'application/json' }).end('{"ok":false,"reason":"provider_unavailable"}');
  }
});

server.listen(port, '127.0.0.1', () => {
  const r = readiness(config);
  const provider = env.BE_AI_DEV_PROVIDER === 'mock' ? 'scripted mock (no model is called)' : config.credential === 'api_key' ? 'Vercel AI Gateway with AI_GATEWAY_API_KEY (paid calls)' : 'none';
  process.stdout.write(
    [
      `inference simulator on http://127.0.0.1:${port}/api/*`,
      `  status: ${r.ready ? 'ready' : `${r.reason}; missing: ${r.missing.join(', ')}`}`,
      `  provider: ${provider}`,
      `  store: ${config.store.kind}${config.store.kind === 'memory' ? ' (per-process, local only)' : ''}`,
      `  allowed origins: ${config.origins.join(', ')}`,
      '',
    ].join('\n'),
  );
});
