import { b64url, fromB64url, hmacHex, randomId, safeEqual } from './crypto.ts';

/**
 * Anonymous capability tokens. `POST /api/session` mints one after its own checks (allowed origin, a per-address rate limit and
 * the player's consent); every inference route then requires it as `Authorization: Bearer <token>`. A token is a signed,
 * short-lived statement "session S may use these routes until T". It names no person and holds no game data.
 *
 * Why a header token and not a cookie: a token a script must attach cannot be replayed by another site's form or image (no
 * CSRF), and nothing is stored in the browser beyond the page's memory. Why not the Origin header alone: any non-browser client
 * can send any Origin, so Origin is a defence in depth, never the authorisation.
 */

export const TOKEN_VERSION = 1;
export type Scope = 'interpret' | 'npc';
export const ALL_SCOPES: Scope[] = ['interpret', 'npc'];

export interface SessionClaims {
  v: number;
  /** random session id; quotas are counted per session id */
  sid: string;
  /** issued at / expires at, in seconds since the epoch */
  iat: number;
  exp: number;
  scp: Scope[];
}

const DOMAIN = 'be-session.v1.';

export function issueToken(secret: string, nowMs: number, ttlMs: number, scopes: Scope[] = ALL_SCOPES): { token: string; claims: SessionClaims } {
  const iat = Math.floor(nowMs / 1000);
  const claims: SessionClaims = { v: TOKEN_VERSION, sid: randomId(16), iat, exp: iat + Math.max(60, Math.floor(ttlMs / 1000)), scp: [...scopes] };
  const body = b64url(JSON.stringify(claims));
  return { token: `${body}.${sign(secret, body)}`, claims };
}

function sign(secret: string, body: string): string {
  return b64url(Buffer.from(hmacHex(secret, DOMAIN + body), 'hex'));
}

export type TokenCheck = { ok: true; claims: SessionClaims } | { ok: false; why: 'missing' | 'malformed' | 'signature' | 'expired' | 'scope' };

/** Verifies signature first (constant time), then shape, expiry and scope. A token is never trusted for anything else. */
export function verifyToken(secret: string, token: string | null | undefined, nowMs: number, scope: Scope): TokenCheck {
  if (!token) return { ok: false, why: 'missing' };
  if (token.length > 600) return { ok: false, why: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, why: 'malformed' };
  if (!safeEqual(sign(secret, parts[0]), parts[1])) return { ok: false, why: 'signature' };
  const raw = fromB64url(parts[0]);
  if (!raw) return { ok: false, why: 'malformed' };
  let c: unknown;
  try {
    c = JSON.parse(raw.toString('utf8'));
  } catch {
    return { ok: false, why: 'malformed' };
  }
  if (!c || typeof c !== 'object') return { ok: false, why: 'malformed' };
  const k = c as Partial<SessionClaims>;
  if (k.v !== TOKEN_VERSION || typeof k.sid !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(k.sid) || !Number.isInteger(k.iat) || !Number.isInteger(k.exp) || !Array.isArray(k.scp)) return { ok: false, why: 'malformed' };
  const now = Math.floor(nowMs / 1000);
  if ((k.exp as number) <= now || (k.iat as number) > now + 60) return { ok: false, why: 'expired' };
  if (!k.scp.includes(scope)) return { ok: false, why: 'scope' };
  return { ok: true, claims: k as SessionClaims };
}

/** "Bearer <token>" → token */
export function bearer(header: string | null): string | null {
  const m = /^Bearer ([A-Za-z0-9_.-]{1,600})$/.exec((header ?? '').trim());
  return m ? m[1] : null;
}
