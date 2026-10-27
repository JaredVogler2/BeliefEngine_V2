import { describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/engine/index.ts';
import { askOnline, INTERPRETER_URL } from '../../src/ui/interpreter.ts';

/** The browser side of the optional online interpreter, against a mocked fetch only. */
const state = GameSession.create({ scenarioId: 'redbank', seed: 1, inventor: true }).state;
const OK = { ok: true, cached: false, reply: { schema: 1, understood: true, candidates: [{ subject: 'river', effect: 'repel', trigger: 'lit_beacon', intensity: 2, radius: 2 }] } };
const reply = (body: unknown) => vi.fn(async () => ({ json: async () => body }) as unknown as Response) as unknown as typeof fetch;

describe('online interpreter client (mocked)', () => {
  it('is off unless the site was built with an interpreter URL', async () => {
    expect(INTERPRETER_URL).toBeNull();
    const r = await askOnline(state, 'The river turns aside from lit lanterns.');
    expect(r.ok).toBe(false);
  });

  it('sends only the sentence, the ontology version and coarse village names: never the save, villagers or progress', async () => {
    const f = reply(OK);
    const r = await askOnline(state, 'The river turns aside from lit lanterns.', { fetchImpl: f, url: 'https://interp.example/api' });
    expect(r.ok).toBe(true);
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe('https://interp.example/api');
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(['context', 'ontology', 'text']);
    expect(Object.keys(body.context).sort()).toEqual(['features', 'regions']);
    const wire = init.body as string;
    for (const v of state.villagers.slice(0, 5)) expect(wire).not.toContain(v.name);
    expect(wire.length).toBeLessThan(600);
  });

  it('turns a valid reply into readings, and every failure into "use the offline reading"', async () => {
    const good = await askOnline(state, 'x', { fetchImpl: reply(OK), url: 'u' });
    expect(good.ok && good.readings[0].subject).toBe('river');
    const cases: [string, unknown][] = [
      ['proxy says no', { ok: false, reason: 'not_configured', message: 'The online interpreter is not configured.', fallback: 'offline' }],
      ['garbage', 'nope'],
      ['null', null],
      ['schema drift', { ok: true, reply: { schema: 9, understood: true, candidates: [] } }],
      ['extra field', { ok: true, reply: { ...OK.reply, evil: 'x' } }],
      ['not understood', { ok: true, reply: { schema: 1, understood: false, candidates: [] } }],
      ['outside the ontology', { ok: true, reply: { schema: 1, understood: true, candidates: [{ subject: 'time', effect: 'stop', trigger: 'always' }] } }],
    ];
    for (const [name, body] of cases) {
      const r = await askOnline(state, 'x', { fetchImpl: reply(body), url: 'u' });
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.why.length, name).toBeGreaterThan(5);
    }
  });

  it('gives up after its timeout and on network errors', async () => {
    const hang = vi.fn((_u: unknown, init?: RequestInit) => new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    const t = await askOnline(state, 'x', { fetchImpl: hang, url: 'u', timeoutMs: 30 });
    expect(t).toEqual({ ok: false, why: 'The online interpreter took too long.' });
    const down = await askOnline(state, 'x', { fetchImpl: vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch, url: 'u' });
    expect(down.ok).toBe(false);
  });
});
