import { describe, expect, it } from 'vitest';
import { DEFAULT_MODELS, loadAiConfig, parseOrigins, readiness } from '../../server/ai/config.ts';
import { bearer, issueToken, verifyToken } from '../../server/ai/session.ts';

import { FULL_ENV, SECRET } from '../helpers/ai.ts';

describe('inference configuration', () => {
  it('is "disabled" with an empty environment, and lists only variable NAMES as missing', () => {
    const c = loadAiConfig({});
    expect(readiness(c)).toMatchObject({ ready: false, reason: 'disabled' });
    expect(c.credential).toBe('none');
    expect(c.store).toEqual({ kind: 'none' });
    expect(c.missing.join(' ')).toMatch(/BE_AI_ENABLED.*AI_GATEWAY_API_KEY.*BE_SESSION_SECRET.*UPSTASH_REDIS_REST_URL.*BE_ALLOWED_ORIGINS/);
  });

  it('is "not_configured" when switched on without a key, and names what is missing without echoing any value', () => {
    const env = { ...FULL_ENV, AI_GATEWAY_API_KEY: '' };
    const c = loadAiConfig(env);
    expect(readiness(c)).toMatchObject({ ready: false, reason: 'not_configured' });
    expect(c.missing).toEqual(['AI_GATEWAY_API_KEY (or Vercel OIDC)']);
    const short = loadAiConfig({ ...FULL_ENV, BE_SESSION_SECRET: 'too-short' });
    expect(short.missing.join()).toContain('BE_SESSION_SECRET');
    expect(JSON.stringify(short.missing)).not.toContain('too-short');
  });

  it('is ready with a key, a secret, a durable store and an origin; uses the catalog defaults unless overridden', () => {
    const c = loadAiConfig(FULL_ENV);
    expect(readiness(c)).toEqual({ ready: true });
    expect(c.credential).toBe('api_key');
    expect(c.models).toEqual(DEFAULT_MODELS);
    const o = loadAiConfig({ ...FULL_ENV, BE_AI_MODEL_FAST: 'openai/gpt-6-luna', BE_AI_MODEL_ACCURATE: 'not a model id; rm -rf' });
    expect(o.models).toEqual({ fast: 'openai/gpt-6-luna', accurate: DEFAULT_MODELS.accurate });
  });

  it('uses OIDC on Vercel without a key, and never accepts the per-instance memory store there', () => {
    const c = loadAiConfig({ ...FULL_ENV, AI_GATEWAY_API_KEY: undefined, VERCEL: '1', UPSTASH_REDIS_REST_URL: undefined, BE_AI_DEV_MEMORY_STORE: '1' });
    expect(c.credential).toBe('oidc');
    expect(c.store).toEqual({ kind: 'none' });
    expect(readiness(c).ready).toBe(false);
    // the Vercel Marketplace integration's variable names work too
    const kv = loadAiConfig({ ...FULL_ENV, UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined, KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 't', VERCEL: '1' });
    expect(kv.store).toEqual({ kind: 'redis-rest', url: 'https://kv.example', token: 't' });
    // plain http is refused except for a store on the developer's own machine, and never on Vercel
    expect(loadAiConfig({ ...FULL_ENV, UPSTASH_REDIS_REST_URL: 'http://store.example' }).store.kind).toBe('none');
    expect(loadAiConfig({ ...FULL_ENV, UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:8079' }).store.kind).toBe('redis-rest');
    expect(loadAiConfig({ ...FULL_ENV, UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:8079', VERCEL: '1' }).store.kind).toBe('none');
  });

  it('accepts exact http(s) origins only', () => {
    expect(parseOrigins('https://a.example, http://localhost:5173 ,https://a.example/,javascript:alert(1),https://b.example/path,*')).toEqual(['https://a.example', 'http://localhost:5173']);
  });

  it('clamps the daily budget and call cap', () => {
    expect(loadAiConfig({ ...FULL_ENV, BE_AI_DAILY_BUDGET_USD: '-5' }).dailyBudgetUsd).toBe(0);
    expect(loadAiConfig({ ...FULL_ENV, BE_AI_DAILY_BUDGET_USD: 'lots' }).dailyBudgetUsd).toBe(1);
    expect(loadAiConfig({ ...FULL_ENV, BE_AI_CALLS_PER_DAY: '999999999' }).limits.callsPerDay).toBe(100_000);
  });
});

describe('session capability tokens', () => {
  const T0 = 1_800_000_000_000;

  it('round-trips, carries scopes, and expires', () => {
    const { token, claims } = issueToken(SECRET, T0, 3600_000, ['interpret']);
    expect(verifyToken(SECRET, token, T0 + 1000, 'interpret')).toEqual({ ok: true, claims });
    expect(verifyToken(SECRET, token, T0 + 1000, 'npc')).toEqual({ ok: false, why: 'scope' });
    expect(verifyToken(SECRET, token, T0 + 3600_000 + 1000, 'interpret')).toEqual({ ok: false, why: 'expired' });
    expect(claims.sid).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(issueToken(SECRET, T0, 3600_000).claims.sid).not.toBe(claims.sid);
  });

  it('rejects tampering, another secret, garbage and oversized input', () => {
    const { token } = issueToken(SECRET, T0, 3600_000);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), exp: 9_999_999_999 })).toString('base64url');
    expect(verifyToken(SECRET, `${forged}.${sig}`, T0, 'interpret')).toEqual({ ok: false, why: 'signature' });
    expect(verifyToken('another-secret-0123456789abcdef0123456789', token, T0, 'interpret')).toEqual({ ok: false, why: 'signature' });
    expect(verifyToken(SECRET, `${body}.${sig.slice(0, -2)}AA`, T0, 'interpret').ok).toBe(false);
    for (const bad of [null, '', 'abc', 'a.b.c', '.', `${body}.`, 'x'.repeat(700)]) expect(verifyToken(SECRET, bad, T0, 'interpret').ok).toBe(false);
  });

  it('reads only well-formed bearer headers', () => {
    expect(bearer('Bearer abc.def')).toBe('abc.def');
    expect(bearer('bearer abc')).toBeNull();
    expect(bearer('Bearer abc def')).toBeNull();
    expect(bearer(null)).toBeNull();
  });
});
