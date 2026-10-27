/**
 * The shared, durable store behind every quota, lease, cooldown, spend counter and cached interpretation.
 *
 * Serverless functions run as many short-lived instances, so a counter in process memory limits nothing (V1's proxy had exactly
 * this hole). Production uses a Redis database over its REST interface (Upstash, or the Vercel Marketplace integration that
 * provides the same interface), where each multi-counter reservation is ONE Lua script and therefore atomic across instances.
 *
 * Failure policy: FAIL CLOSED. Any store error, timeout or unexpected answer throws `StoreUnavailableError`, and the routes turn
 * that into "online interpretation unavailable" instead of calling the provider unmetered.
 */

export class StoreUnavailableError extends Error {
  override name = 'StoreUnavailableError';
}

export interface CounterSpec {
  key: string;
  amount: number;
  limit: number;
  ttlMs: number;
}

/** `index` is the position of the first counter that would have passed its limit. */
export type ReserveResult = { ok: true } | { ok: false; index: number; current: number };

export interface QuotaStore {
  readonly kind: 'memory' | 'redis-rest';
  /** true only for a store shared by every instance */
  readonly durable: boolean;
  /** All-or-nothing: adds every amount only if no counter would pass its limit. Counters expire `ttlMs` after creation. */
  reserve(counters: CounterSpec[]): Promise<ReserveResult>;
  /** Gives amounts back (a counter never goes below zero). */
  refund(items: { key: string; amount: number }[]): Promise<void>;
  /** Set-if-absent with expiry: one in-flight request per session, and cooldowns. */
  claim(key: string, token: string, ttlMs: number): Promise<boolean>;
  /** Deletes the key only if it still holds `token` (a lease that expired and was re-claimed is not released by mistake). */
  unclaim(key: string, token: string): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Adds to integer fields of a hash and (re)sets its expiry: the daily metrics. */
  hincr(key: string, fields: Record<string, number>, ttlMs: number): Promise<void>;
  hgetall(key: string): Promise<Record<string, number>>;
}

// ------------------------------------------------------------------------------------------------ Lua (executed by Redis)

/** KEYS: counters. ARGV: (amount, limit, ttlMs) per key. Checks every limit first, then increments all: atomic as one script. */
export const LUA_RESERVE = `
for i, k in ipairs(KEYS) do
  local amt = tonumber(ARGV[3 * i - 2])
  local lim = tonumber(ARGV[3 * i - 1])
  local cur = tonumber(redis.call('GET', k) or '0')
  if cur + amt > lim then return {0, i, cur} end
end
for i, k in ipairs(KEYS) do
  redis.call('INCRBY', k, ARGV[3 * i - 2])
  if redis.call('PTTL', k) < 0 then redis.call('PEXPIRE', k, ARGV[3 * i]) end
end
return {1, 0, 0}
`.trim();

/** KEYS: counters. ARGV: amount per key. Never leaves a counter below zero. */
export const LUA_REFUND = `
for i, k in ipairs(KEYS) do
  local v = redis.call('DECRBY', k, ARGV[i])
  if v < 0 then redis.call('INCRBY', k, -v) end
end
return 1
`.trim();

/** KEYS[1]: lease. ARGV[1]: token. Compare-and-delete. */
export const LUA_UNCLAIM = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`.trim();

/** KEYS[1]: hash. ARGV[1]: ttlMs, then field/amount pairs. */
export const LUA_HINCR = `
for i = 2, #ARGV, 2 do redis.call('HINCRBY', KEYS[1], ARGV[i], ARGV[i + 1]) end
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return 1
`.trim();

const intArg = (n: number): string => String(Math.max(0, Math.round(n)));

// ------------------------------------------------------------------------------------------------ Redis over REST

export interface RedisRestOptions {
  fetch?: typeof fetch;
  /** per-command timeout; a slow store is treated as an unavailable one */
  timeoutMs?: number;
}

/** The Upstash REST protocol: POST the command as a JSON array, `Authorization: Bearer <token>`, answer `{result}` or `{error}`. */
export class RedisRestStore implements QuotaStore {
  readonly kind = 'redis-rest';
  readonly durable = true;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly url: string,
    private readonly token: string,
    opts: RedisRestOptions = {},
  ) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 1_500;
  }

  private async cmd(args: (string | number)[]): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(args.map(String)),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // never echo the request: it carries the store token
      throw new StoreUnavailableError('the quota store could not be reached');
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new StoreUnavailableError(`the quota store answered ${res.status} without JSON`);
    }
    if (!res.ok || !body || typeof body !== 'object' || 'error' in body) throw new StoreUnavailableError(`the quota store refused a command (${res.status})`);
    return (body as { result?: unknown }).result ?? null;
  }

  private evalScript(script: string, keys: string[], args: (string | number)[]): Promise<unknown> {
    return this.cmd(['EVAL', script, keys.length, ...keys, ...args]);
  }

  async reserve(counters: CounterSpec[]): Promise<ReserveResult> {
    if (!counters.length) return { ok: true };
    const args = counters.flatMap((c) => [intArg(c.amount), intArg(c.limit), intArg(Math.max(1, c.ttlMs))]);
    const r = await this.evalScript(LUA_RESERVE, counters.map((c) => c.key), args);
    if (!Array.isArray(r) || r.length !== 3) throw new StoreUnavailableError('the quota store gave an unexpected answer');
    const [ok, index, current] = r.map(Number);
    return ok === 1 ? { ok: true } : { ok: false, index: index - 1, current };
  }

  async refund(items: { key: string; amount: number }[]): Promise<void> {
    const real = items.filter((x) => x.amount > 0);
    if (real.length) await this.evalScript(LUA_REFUND, real.map((x) => x.key), real.map((x) => intArg(x.amount)));
  }

  async claim(key: string, token: string, ttlMs: number): Promise<boolean> {
    return (await this.cmd(['SET', key, token, 'NX', 'PX', intArg(Math.max(1, ttlMs))])) === 'OK';
  }

  async unclaim(key: string, token: string): Promise<void> {
    await this.evalScript(LUA_UNCLAIM, [key], [token]);
  }

  async get(key: string): Promise<string | null> {
    const r = await this.cmd(['GET', key]);
    return typeof r === 'string' ? r : null;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    await this.cmd(['SET', key, value, 'PX', intArg(Math.max(1, ttlMs))]);
  }

  async del(key: string): Promise<void> {
    await this.cmd(['DEL', key]);
  }

  async hincr(key: string, fields: Record<string, number>, ttlMs: number): Promise<void> {
    const pairs = Object.entries(fields).filter(([, v]) => Number.isFinite(v) && v !== 0).flatMap(([f, v]) => [f, String(Math.round(v))]);
    if (pairs.length) await this.evalScript(LUA_HINCR, [key], [intArg(ttlMs), ...pairs]);
  }

  async hgetall(key: string): Promise<Record<string, number>> {
    const r = await this.cmd(['HGETALL', key]);
    const out: Record<string, number> = {};
    if (Array.isArray(r)) for (let i = 0; i + 1 < r.length; i += 2) out[String(r[i])] = Number(r[i + 1]) || 0;
    else if (r && typeof r === 'object') for (const [k, v] of Object.entries(r)) out[k] = Number(v) || 0;
    return out;
  }
}

// ------------------------------------------------------------------------------------------------ in-memory (tests, local only)

/**
 * A per-process store with the same semantics. It is NOT durable and is refused on any deployment (config.ts); tests use it to
 * check the routes' logic, and share one instance between several app instances to simulate a shared store. `down` simulates an
 * outage; `delayMs` makes calls genuinely asynchronous so concurrent requests interleave.
 */
export class MemoryStore implements QuotaStore {
  readonly kind = 'memory';
  readonly durable = false;
  down = false;
  delayMs = 0;
  private readonly data = new Map<string, { v: string; exp: number }>();
  private readonly hashes = new Map<string, { v: Record<string, number>; exp: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private async tick(): Promise<void> {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    else await Promise.resolve();
    if (this.down) throw new StoreUnavailableError('the quota store could not be reached');
  }

  private live(key: string): string | null {
    const e = this.data.get(key);
    if (!e) return null;
    if (e.exp <= this.now()) {
      this.data.delete(key);
      return null;
    }
    return e.v;
  }

  async reserve(counters: CounterSpec[]): Promise<ReserveResult> {
    await this.tick();
    // no await between the check and the write: atomic within this process, like the Lua script in Redis
    for (let i = 0; i < counters.length; i++) {
      const cur = Number(this.live(counters[i].key) ?? '0');
      if (cur + Math.round(counters[i].amount) > Math.round(counters[i].limit)) return { ok: false, index: i, current: cur };
    }
    for (const c of counters) {
      const prev = this.data.get(c.key);
      const exp = prev && prev.exp > this.now() ? prev.exp : this.now() + Math.max(1, c.ttlMs);
      this.data.set(c.key, { v: String(Number(this.live(c.key) ?? '0') + Math.round(c.amount)), exp });
    }
    return { ok: true };
  }

  async refund(items: { key: string; amount: number }[]): Promise<void> {
    await this.tick();
    for (const { key, amount } of items) {
      const e = this.data.get(key);
      if (e && e.exp > this.now()) e.v = String(Math.max(0, Number(e.v) - Math.round(amount)));
    }
  }

  async claim(key: string, token: string, ttlMs: number): Promise<boolean> {
    await this.tick();
    if (this.live(key) !== null) return false;
    this.data.set(key, { v: token, exp: this.now() + Math.max(1, ttlMs) });
    return true;
  }

  async unclaim(key: string, token: string): Promise<void> {
    await this.tick();
    if (this.live(key) === token) this.data.delete(key);
  }

  async get(key: string): Promise<string | null> {
    await this.tick();
    return this.live(key);
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    await this.tick();
    this.data.set(key, { v: value, exp: this.now() + Math.max(1, ttlMs) });
  }

  async del(key: string): Promise<void> {
    await this.tick();
    this.data.delete(key);
  }

  async hincr(key: string, fields: Record<string, number>, ttlMs: number): Promise<void> {
    await this.tick();
    const e = this.hashes.get(key);
    const h = e && e.exp > this.now() ? e.v : {};
    for (const [f, v] of Object.entries(fields)) if (Number.isFinite(v) && v !== 0) h[f] = (h[f] ?? 0) + Math.round(v);
    this.hashes.set(key, { v: h, exp: this.now() + ttlMs });
  }

  async hgetall(key: string): Promise<Record<string, number>> {
    await this.tick();
    const e = this.hashes.get(key);
    return e && e.exp > this.now() ? { ...e.v } : {};
  }

  /** test helper: the raw value of a counter */
  peek(key: string): number {
    return Number(this.live(key) ?? '0');
  }
}
