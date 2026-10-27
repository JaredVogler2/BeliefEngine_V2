import { describe, expect, it, vi } from 'vitest';
import { AiClient, runRef } from '../../src/ai/client.ts';
import { GameSession } from '../../src/engine/index.ts';

/**
 * The browser side of online reading (src/ai/client.ts), against a mocked fetch only. In V2 it speaks to this site's own /api/*
 * functions with a session token (V1 posted to a build-time URL with no session); the guarantees V1 tested still hold.
 */
const state = GameSession.create({ scenarioId: 'redbank', seed: 1, inventor: true }).state;
const READING = { ok: true, contract: 1, id: 'abc123', cached: false, provider: 'gateway', model: { tier: 'fast', id: 'anthropic/claude-haiku-5.5' }, promptVersion: 'interpret-v1.x', reply: { schema: 1, understood: true, candidates: [{ subject: 'river', effect: 'repel', trigger: 'lit_beacon', intensity: 2, radius: 2 }] }, usage: { latencyMs: 812 } };
const SESSION = { ok: true, token: 'tok.sig', expiresAt: Date.now() + 3600_000, scopes: ['interpret', 'npc'] };

function server(routes: Record<string, (init: RequestInit) => [number, unknown]>) {
  return vi.fn(async (url: string, init: RequestInit) => {
    const route = Object.keys(routes).find((r) => url.endsWith(r));
    const [status, body] = route ? routes[route](init) : [404, { ok: false, reason: 'not_found' }];
    return { status, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch & { mock: { calls: [string, RequestInit][] } };
}

describe('online reading client (mocked)', () => {
  it('makes no request until asked', () => {
    const f = server({});
    new AiClient({ fetch: f });
    expect(f).not.toHaveBeenCalled();
  });

  it('opens a session with consent, then sends only the sentence, the vocabulary version, coarse village names and a hashed run reference', async () => {
    const f = server({ '/api/session': () => [200, SESSION], '/api/interpret-belief': () => [200, READING] });
    const c = new AiClient({ fetch: f });
    const r = await c.interpretV1(state, 'The river turns aside from lit lanterns.');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.meta).toMatchObject({ id: 'abc123', model: 'anthropic/claude-haiku-5.5', tier: 'fast', cached: false, latencyMs: 812 });
    const [[sUrl, sInit], [iUrl, iInit]] = f.mock.calls;
    expect(sUrl).toBe('/api/session');
    expect(JSON.parse(sInit.body as string)).toEqual({ consent: true });
    expect(iUrl).toBe('/api/interpret-belief');
    for (const init of [sInit, iInit]) {
      expect(init.credentials).toBe('omit');
      expect(init.referrerPolicy).toBe('no-referrer');
    }
    expect((iInit.headers as Record<string, string>).authorization).toBe('Bearer tok.sig');
    const body = JSON.parse(iInit.body as string);
    expect(Object.keys(body).sort()).toEqual(['context', 'ontology', 'run', 'text', 'v']);
    expect(Object.keys(body.context).sort()).toEqual(['features', 'regions']);
    expect(body.run).toEqual(runRef(state));
    const wire = iInit.body as string;
    for (const v of state.villagers.slice(0, 5)) expect(wire).not.toContain(v.name);
    expect(wire.length).toBeLessThan(600);
    // the session is reused
    await c.interpretV1(state, 'The river turns aside from lit lanterns.');
    expect(f.mock.calls.filter(([u]) => u === '/api/session').length).toBe(1);
  });

  it('turns every failure into an explained "use the offline reading", and drops the session on 401', async () => {
    const cases: [string, number, unknown][] = [
      ['server says not configured', 503, { ok: false, reason: 'not_configured', message: 'x', fallback: 'offline' }],
      ['over budget', 429, { ok: false, reason: 'over_budget', message: 'x', fallback: 'offline', retryAfterSec: 3600 }],
      ['garbage', 200, 'nope'],
      ['null', 200, null],
      ['schema drift', 200, { ...READING, reply: { schema: 9, understood: true, candidates: [] } }],
      ['extra field', 200, { ...READING, reply: { ...READING.reply, evil: 'x' } }],
      ['not understood', 200, { ...READING, reply: { schema: 1, understood: false, candidates: [] } }],
      ['outside the vocabulary', 200, { ...READING, reply: { schema: 1, understood: true, candidates: [{ subject: 'time', effect: 'stop', trigger: 'always' }] } }],
    ];
    for (const [name, status, body] of cases) {
      const c = new AiClient({ fetch: server({ '/api/session': () => [200, SESSION], '/api/interpret-belief': () => [status, body] }) });
      const r = await c.interpretV1(state, 'x');
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.why.length, name).toBeGreaterThan(5);
    }
    const c = new AiClient({ fetch: server({ '/api/session': () => [200, SESSION], '/api/interpret-belief': () => [401, { ok: false, reason: 'unauthorized', message: 'x' }] }) });
    await c.interpretV1(state, 'x');
    expect(c.hasSession()).toBe(false);
    const refused = new AiClient({ fetch: server({ '/api/session': () => [403, { ok: false, reason: 'forbidden', message: 'Online sessions can only be opened from the game itself.' }] }) });
    expect(await refused.interpretV1(state, 'x')).toMatchObject({ ok: false, reason: 'forbidden' });
  });

  it('gives up after its timeout and on network errors', async () => {
    const hang = vi.fn((_u: unknown, init?: RequestInit) => new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    const c = new AiClient({ fetch: hang });
    expect(await c.status()).toMatchObject({ ok: false, reason: 'timeout' });
    const down = new AiClient({ fetch: vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch });
    expect(await down.interpretV1(state, 'x')).toMatchObject({ ok: false, reason: 'network' });
  }, 20_000);

  it('reads the status honestly, including a simulated (mock) provider', async () => {
    const f = server({ '/api/ai-status': () => [200, { ok: true, available: true, reason: null, provider: 'mock', models: { fast: 'a/b', accurate: 'c/d' }, privacy: 'p', limits: { claimMaxChars: 240, interpretCooldownMs: 3000 } }] });
    expect(await new AiClient({ fetch: f }).status()).toMatchObject({ available: true, provider: 'mock' });
    const off = server({ '/api/ai-status': () => [200, { ok: true, available: false, reason: 'not_configured', provider: null, models: null, privacy: 'p', limits: {} }] });
    expect(await new AiClient({ fetch: off }).status()).toMatchObject({ available: false, reason: 'not_configured', provider: null });
  });
});
