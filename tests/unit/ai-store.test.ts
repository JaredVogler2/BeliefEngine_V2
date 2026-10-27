import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryStore, RedisRestStore, StoreUnavailableError, type QuotaStore } from '../../server/ai/store.ts';
import { startRedisServer, startShim, type Shim } from '../../scripts/lib/redis-rest-shim.ts';

/**
 * The quota store's semantics, checked twice: on the in-memory double and on a REAL Redis (redis-server spawned for the test,
 * reached through an Upstash-style REST shim), so the Lua scripts that make reservations atomic are executed by Redis itself.
 * The Redis half is skipped, visibly, when no redis-server binary is installed; CI installs one.
 */

let redis: Awaited<ReturnType<typeof startRedisServer>> = null;
let shim: Shim | null = null;
const haveRedis = () => !!shim;

beforeAll(async () => {
  redis = await startRedisServer();
  if (redis) shim = await startShim(redis.port);
}, 20_000);

afterAll(async () => {
  await shim?.stop();
  redis?.stop();
});

let n = 0;
const k = (name: string) => `t:${process.pid}:${++n}:${name}`;

function stores(): [string, () => QuotaStore][] {
  const out: [string, () => QuotaStore][] = [['memory', () => new MemoryStore()]];
  if (haveRedis()) out.push(['redis', () => new RedisRestStore(shim!.url, shim!.token)]);
  return out;
}

describe('quota store semantics (memory double, and real Redis when installed)', () => {
  it('runs against a real Redis in this environment, or says why not (CI requires it)', () => {
    if (!haveRedis()) console.warn('redis-server not installed: the Redis half of ai-store.test.ts is skipped');
    if (process.env.BE_REQUIRE_REDIS === '1') expect(haveRedis()).toBe(true);
  });

  it('reserves all counters or none, and reports which limit refused', async () => {
    for (const [name, make] of stores()) {
      const s = make();
      const a = k(`${name}-a`);
      const b = k(`${name}-b`);
      expect(await s.reserve([{ key: a, amount: 2, limit: 3, ttlMs: 60_000 }, { key: b, amount: 5, limit: 10, ttlMs: 60_000 }])).toEqual({ ok: true });
      // a would pass its limit: nothing changes, b included
      expect(await s.reserve([{ key: a, amount: 2, limit: 3, ttlMs: 60_000 }, { key: b, amount: 1, limit: 10, ttlMs: 60_000 }])).toEqual({ ok: false, index: 0, current: 2 });
      expect(await s.reserve([{ key: b, amount: 6, limit: 10, ttlMs: 60_000 }])).toEqual({ ok: false, index: 0, current: 5 });
      expect(await s.reserve([{ key: a, amount: 1, limit: 3, ttlMs: 60_000 }, { key: b, amount: 5, limit: 10, ttlMs: 60_000 }])).toEqual({ ok: true });
      expect(await s.reserve([{ key: b, amount: 1, limit: 10, ttlMs: 60_000 }])).toEqual({ ok: false, index: 0, current: 10 });
    }
  });

  it('refunds never take a counter below zero', async () => {
    for (const [name, make] of stores()) {
      const s = make();
      const a = k(`${name}-refund`);
      await s.reserve([{ key: a, amount: 4, limit: 100, ttlMs: 60_000 }]);
      await s.refund([{ key: a, amount: 10 }]);
      expect(await s.reserve([{ key: a, amount: 100, limit: 100, ttlMs: 60_000 }])).toEqual({ ok: true });
    }
  });

  it('claims are exclusive until released by their own token or expired', async () => {
    for (const [name, make] of stores()) {
      const s = make();
      const l = k(`${name}-lease`);
      expect(await s.claim(l, 'tok1', 60_000)).toBe(true);
      expect(await s.claim(l, 'tok2', 60_000)).toBe(false);
      await s.unclaim(l, 'tok2'); // not the holder: no effect
      expect(await s.claim(l, 'tok3', 60_000)).toBe(false);
      await s.unclaim(l, 'tok1');
      expect(await s.claim(l, 'tok4', 60_000)).toBe(true);
      const short = k(`${name}-short`);
      expect(await s.claim(short, 'x', 30)).toBe(true);
      await new Promise((r) => setTimeout(r, 80));
      expect(await s.claim(short, 'y', 30)).toBe(true);
    }
  });

  it('keeps cached values and metrics hashes with expiry', async () => {
    for (const [name, make] of stores()) {
      const s = make();
      const c = k(`${name}-cache`);
      expect(await s.get(c)).toBeNull();
      await s.set(c, '{"a":1}', 60_000);
      expect(await s.get(c)).toBe('{"a":1}');
      await s.del(c);
      expect(await s.get(c)).toBeNull();
      const h = k(`${name}-hash`);
      await s.hincr(h, { 'interpret.calls': 1, 'tok.in': 120 }, 60_000);
      await s.hincr(h, { 'interpret.calls': 2, 'tok.in': 30, zero: 0 }, 60_000);
      expect(await s.hgetall(h)).toEqual({ 'interpret.calls': 3, 'tok.in': 150 });
    }
  });

  it('sets an expiry on every counter it creates (Redis TTL checked directly)', async () => {
    if (!haveRedis()) return;
    const s = new RedisRestStore(shim!.url, shim!.token);
    const a = k('ttl');
    await s.reserve([{ key: a, amount: 1, limit: 5, ttlMs: 90_000 }]);
    const ttl = Number(await shim!.redis.send(['PTTL', a]));
    expect(ttl).toBeGreaterThan(80_000);
    expect(ttl).toBeLessThanOrEqual(90_000);
  });

  it('admits exactly the limit when 100 reservations race on a real Redis (no lost updates)', async () => {
    if (!haveRedis()) return;
    // four "instances", each with its own client, all hitting the same counters at once
    const instances = Array.from({ length: 4 }, () => new RedisRestStore(shim!.url, shim!.token));
    const key = k('race');
    const spend = k('race-spend');
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => instances[i % 4].reserve([{ key, amount: 1, limit: 10, ttlMs: 60_000 }, { key: spend, amount: 7, limit: 1_000, ttlMs: 60_000 }])));
    expect(results.filter((r) => r.ok).length).toBe(10);
    expect(Number(await shim!.redis.send(['GET', key]))).toBe(10);
    expect(Number(await shim!.redis.send(['GET', spend]))).toBe(70);
  });

  it('fails closed: an outage, a wrong token, a timeout or garbage all raise StoreUnavailableError and never leak the token', async () => {
    const memory = new MemoryStore();
    memory.down = true;
    await expect(memory.reserve([{ key: 'x', amount: 1, limit: 1, ttlMs: 1000 }])).rejects.toBeInstanceOf(StoreUnavailableError);
    // a store that cannot be reached at all
    const unreachable = new RedisRestStore('http://127.0.0.1:9', 'secret-token-abcdef0123456789', { timeoutMs: 500 });
    const err = await unreachable.reserve([{ key: 'x', amount: 1, limit: 1, ttlMs: 1000 }]).catch((e: Error) => e);
    expect(err).toBeInstanceOf(StoreUnavailableError);
    expect(String((err as Error).message)).not.toContain('secret-token');
    // garbage answers
    const garbage = new RedisRestStore('http://x.invalid', 'secret-token-abcdef0123456789', { fetch: (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch });
    await expect(garbage.get('k')).rejects.toBeInstanceOf(StoreUnavailableError);
    const weird = new RedisRestStore('http://x.invalid', 't', { fetch: (async () => Response.json({ result: 'nope' })) as unknown as typeof fetch });
    await expect(weird.reserve([{ key: 'k', amount: 1, limit: 1, ttlMs: 1 }])).rejects.toBeInstanceOf(StoreUnavailableError);
    if (!haveRedis()) return;
    const wrong = new RedisRestStore(shim!.url, 'not-the-token');
    await expect(wrong.get('k')).rejects.toBeInstanceOf(StoreUnavailableError);
    shim!.setDown(true);
    try {
      await expect(new RedisRestStore(shim!.url, shim!.token).reserve([{ key: 'k', amount: 1, limit: 9, ttlMs: 1000 }])).rejects.toBeInstanceOf(StoreUnavailableError);
    } finally {
      shim!.setDown(false);
    }
    shim!.setDelay(400);
    try {
      await expect(new RedisRestStore(shim!.url, shim!.token, { timeoutMs: 100 }).get('k')).rejects.toBeInstanceOf(StoreUnavailableError);
    } finally {
      shim!.setDelay(0);
    }
  });
});
