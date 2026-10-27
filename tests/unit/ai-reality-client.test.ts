import { describe, expect, it, vi } from 'vitest';
import { AiClient, runRef } from '../../src/ai/client.ts';
import { GameSession } from '../../src/engine/index.ts';
import { demoInterpretV2 } from '../../server/ai/tasks/interpret-v2.ts';
import type { Route } from '../../server/ai/app.ts';
import { ORIGIN, harness } from '../helpers/ai.ts';

/**
 * The browser's reality-language reader against the real transport-free app (scripted provider: TESTED MOCK ONLY). Every reading
 * the server sends is validated and rebuilt by the engine against the live run before the player sees it.
 */

function wired(script = (c: { prompt: string }) => ({ kind: 'ok' as const, value: demoInterpretV2(c.prompt) })) {
  const h = harness(script as never);
  const f = vi.fn(async (url: string, init: RequestInit) => {
    const route = url.replace(/^\/api\//, '') as Route;
    const headers = new Headers(init.headers as Record<string, string>);
    headers.set('origin', ORIGIN);
    return h.app(route, new Request(`https://game.example${url}`, { method: init.method, headers, body: init.body as string | undefined }));
  });
  return { h, f, client: new AiClient({ fetch: f as unknown as typeof fetch, now: () => h.clock.t }) };
}

describe('reality reading client', () => {
  const reality = () => GameSession.create({ scenarioId: 'redbank', seed: 1, reality: true }).state;

  it('asks nothing of a Classic run, and nothing at all until asked', async () => {
    const { f, client } = wired();
    expect(f).not.toHaveBeenCalled();
    const classic = GameSession.create({ scenarioId: 'redbank', seed: 1 }).state;
    expect(await client.interpretReality(classic, 'Chickens fly when the bell rings.')).toMatchObject({ ok: false });
    expect(f).not.toHaveBeenCalled();
  });

  it('sends the sentence, the village\'s name and seed, the day and a hashed run reference; gets readings built for this run', async () => {
    const { f, client } = wired();
    const s = reality();
    const r = await client.interpretReality(s, 'Chickens fly when the bell rings.');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.meta.provider).toBe('mock');
    expect(r.reading.kind).toBe('supported');
    if (r.reading.kind === 'supported') {
      const c = r.reading.candidates[0];
      expect(c.build.ok).toBe(true);
      expect(c.ast.source).toMatchObject({ reader: 'model', id: r.meta.id });
    }
    const body = JSON.parse((f.mock.calls.find(([u]) => u === '/api/interpret-reality')![1] as RequestInit).body as string);
    expect(Object.keys(body).sort()).toEqual(['day', 'lang', 'region', 'run', 'scenario', 'text', 'v']);
    expect(body).toMatchObject({ v: 2, scenario: { id: 'redbank', seed: 1, lab: false }, run: runRef(s) });
    for (const v of s.villagers) expect(JSON.stringify(body)).not.toContain(v.name);
  });

  it('drops a reading the engine will not accept, whatever the server sent', async () => {
    const { client } = wired((c) => {
      const out = demoInterpretV2(c.prompt);
      return { kind: 'ok' as const, value: out };
    });
    const s = reality();
    // a server answer with a forged, invalid AST: the client rebuilds and refuses it
    const bad = {
      ok: true, contract: 2, id: 'x', provider: 'mock', model: { id: 'm', tier: 'fast' }, promptVersion: 'p', cached: false, usage: {},
      reading: { kind: 'supported', text: 't', reader: 'r', notes: [], candidates: [{ ast: { v: 2, lang: 'reality-1', text: 't', clauses: [{ effect: { op: 'EVAL' } }] }, map: [], confidence: 'high', assumed: [] }] },
    };
    const forged = new AiClient({ fetch: (async (url: string) => ({ status: 200, json: async () => (url.endsWith('/api/session') ? { ok: true, token: 'a.b', expiresAt: Date.now() + 3600_000 } : bad) })) as unknown as typeof fetch });
    const r = await forged.interpretReality(s, 'Chickens fly when the bell rings.');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reading.kind).toBe('unsupported');
    void client;
  });
});
