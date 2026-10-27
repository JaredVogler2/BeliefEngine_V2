/**
 * EXAMPLE adapter for hosting the optional online interpreter (server/interpreter.ts) as a Vercel Function. It lives here and not in
 * `api/` on purpose: anything in `api/` is built and deployed with the site, and this adapter has never been deployed or run on a
 * platform. To try it, copy it to `api/interpret.ts` in a deployment you control, set INTERPRETER_API_KEY, INTERPRETER_MODEL and
 * INTERPRETER_ALLOWED_ORIGINS in the project's server-side environment (never in the browser build), add the endpoint to the site's
 * `connect-src`, and accept that provider calls cost money; see docs/NL_BELIEFS.md. Without the key it answers 503 and the game uses
 * its offline composer.
 */
import { DEFAULT_CONFIG, handleInterpret, newState } from './interpreter.ts';

const state = newState();

export default async function handler(req: { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown; socket?: { remoteAddress?: string } }, res: { status: (n: number) => { json: (b: unknown) => void } }): Promise<void> {
  const h: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) h[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  const out = await handleInterpret(
    { method: req.method ?? 'GET', headers: h, body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}), client: h['x-forwarded-for']?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? 'unknown' },
    {
      fetch,
      now: () => Date.now(),
      config: {
        ...DEFAULT_CONFIG,
        apiKey: process.env.INTERPRETER_API_KEY,
        model: process.env.INTERPRETER_MODEL,
        allowedOrigins: (process.env.INTERPRETER_ALLOWED_ORIGINS ?? '').split(',').map((x) => x.trim()).filter(Boolean),
      },
    },
    state,
  );
  res.status(out.status).json(out.body);
}
