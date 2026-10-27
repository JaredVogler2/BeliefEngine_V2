/**
 * Transport helpers on the web-standard Request/Response API, which Vercel Functions (`export default { fetch }`), the local
 * simulator and the tests all share. Every answer is JSON, never cached by a browser or CDN, and every failure has the same
 * shape: `{ ok: false, reason, message, fallback: "offline" }`, so the game can always explain itself and carry on offline.
 */

export type FailReason =
  | 'bad_request'
  | 'unsupported_media'
  | 'too_large'
  | 'method_not_allowed'
  | 'forbidden'
  | 'unauthorized'
  | 'disabled'
  | 'not_configured'
  | 'rate_limited'
  | 'busy'
  | 'over_quota'
  | 'over_budget'
  | 'quota_unavailable'
  | 'provider_unavailable'
  | 'timeout'
  | 'refused'
  | 'bad_output'
  | 'not_found';

export interface FailBody {
  ok: false;
  reason: FailReason;
  message: string;
  fallback: 'offline';
  retryAfterSec?: number;
}

const BASE_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function fail(status: number, reason: FailReason, message: string, retryAfterSec?: number): Response {
  const body: FailBody = { ok: false, reason, message, fallback: 'offline', ...(retryAfterSec !== undefined ? { retryAfterSec } : {}) };
  return json(status, body, retryAfterSec !== undefined ? { 'retry-after': String(retryAfterSec) } : {});
}

/** Reads a JSON body without ever holding more than `maxBytes` of it. */
export async function readJson(req: Request, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return { ok: false, response: fail(415, 'unsupported_media', 'Send application/json.') };
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, response: fail(413, 'too_large', 'The request is too large.') };
  if (!req.body) return { ok: false, response: fail(400, 'bad_request', 'The body is empty.') };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, response: fail(413, 'too_large', 'The request is too large.') };
    }
    chunks.push(value);
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: fail(400, 'bad_request', 'The body is not JSON.') };
  }
}

/**
 * The caller's address as the platform reports it. On Vercel the edge sets x-real-ip and x-vercel-forwarded-for itself; elsewhere
 * these are client-controlled, which is why an address only ever narrows a quota, never grants anything.
 */
export function clientAddress(req: Request): string {
  const h = req.headers;
  const first = (v: string | null) => (v ?? '').split(',')[0].trim();
  return first(h.get('x-real-ip')) || first(h.get('x-vercel-forwarded-for')) || first(h.get('x-forwarded-for')) || 'unknown';
}

/** 'absent' (no Origin header: not a browser cross-site request), 'allowed' (exact match) or 'denied'. */
export function originState(req: Request, allowed: string[]): 'absent' | 'allowed' | 'denied' {
  const o = req.headers.get('origin');
  if (!o) return 'absent';
  return allowed.includes(o) ? 'allowed' : 'denied';
}
