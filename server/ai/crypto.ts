import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Small hashing helpers for the inference service. Raw client addresses, claims and session ids are only ever stored hashed. */

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function hmacHex(secret: string, s: string): string {
  return createHmac('sha256', secret).update(s, 'utf8').digest('hex');
}

export function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

export function fromB64url(s: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  return Buffer.from(s, 'base64url');
}

export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time comparison of two strings of possibly different length. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) {
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}

/** UTC day key, e.g. 20261027. Quotas and the spend cap reset at midnight UTC, like the gateway's own daily budgets. */
export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10).replace(/-/g, '');
}

/** Milliseconds until the next UTC midnight (plus a small margin), used as counter lifetimes. */
export function msToNextDay(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - nowMs + 60_000;
}
