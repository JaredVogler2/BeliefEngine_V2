import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/engine/index.ts';
import { fromWire, type WireReading } from '../../src/engine/reality/wire.ts';
import { EXECUTABLE_OPS } from '../../src/engine/reality/operators.ts';
import { ABSENT } from '../../src/engine/reality/ontology.ts';
import { demoInterpretV2, interpretV2Instructions, type InterpretV2Output } from '../../server/ai/tasks/interpret-v2.ts';
import { NL_VERSION } from '../../src/engine/nl/ontology.ts';
import { harness } from '../helpers/ai.ts';
import { MemoryStore } from '../../server/ai/store.ts';
import type { MockStep } from '../../server/ai/mock-provider.ts';

/**
 * Contract `interpret v2` end to end on the transport-free app, with a scripted provider (TESTED MOCK ONLY: no model is called).
 * The demo answers are the offline reader reshaped as a model's output; the hand-written ones probe every check the server makes.
 */

const req = (text: string, extra: Record<string, unknown> = {}) => ({ v: 2, text, lang: 'reality-1', scenario: { id: 'redbank', seed: 1, lab: false }, region: null, day: 1, run: { id: 'run-abc', rev: 4 }, ...extra });
const demo = (): MockStep => ({ kind: 'ok', value: null });
const demoScript = (c: { prompt: string }): MockStep => ({ kind: 'ok', value: demoInterpretV2(c.prompt), usage: { inputTokens: 3000, outputTokens: 400 } });
const red = () => GameSession.create({ scenarioId: 'redbank', seed: 1, reality: true }).state;

/** A model answer for "Chickens fly when the bell rings." in the model's own schema, to be bent by each test. */
function chickens(over: Partial<InterpretV2Output['candidates'][number]> = {}): InterpretV2Output {
  return {
    kind: 'supported',
    candidates: [
      {
        regions: ['east'],
        clauses: [{ when: { combine: 'all', events: [{ event: 'bell', min: null, negate: false }] }, where: null, target: { kind: 'chicken', near: null, region: null }, effect: { op: 'APPLY_FORCE', direction: 'up', magnitude: 2 } as never, duration: 'night' }],
        map: [{ target: 'Chickens', effect: 'fly', trigger: 'when the bell rings', condition: null, place: null }],
        omitted: [],
        confidence: 'high',
        ...over,
      },
    ],
    question: null,
    reasons: [],
    narrative: null,
  };
}

async function ask(script: (c: { prompt: string }) => MockStep, text: string, extra: Record<string, unknown> = {}) {
  const h = harness(script as never);
  const token = await h.session();
  const r = await h.call('interpret-reality', { body: req(text, extra), token });
  return { h, r, token };
}

describe('POST /api/interpret-reality', () => {
  it('reads a sentence into AST v2 with the server\'s own provenance; the browser rebuilds it against the live run', async () => {
    const { r, h } = await ask(demoScript, 'Chickens fly when the bell rings.');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, contract: 2, provider: 'mock', cached: false, promptVersion: expect.stringMatching(/^interpret-v2\./) });
    const w = r.body.reading as WireReading;
    expect(w.kind).toBe('supported');
    if (w.kind !== 'supported') return;
    const ast = w.candidates[0].ast;
    expect(ast.source).toEqual({ reader: 'model', model: 'anthropic/claude-haiku-5.5', prompt: expect.stringMatching(/^interpret-v2\./), id: r.body.id });
    expect(String(r.body.id)).toMatch(/^[0-9a-f]{24}$/);
    const live = fromWire(red(), w);
    expect(live.kind).toBe('supported');
    if (live.kind === 'supported') expect(live.candidates[0].build.ok).toBe(true);
    // the sentence travels only inside the prompt's data, never in the instructions
    const call = h.provider.calls[0];
    expect(JSON.parse(call.prompt).sentence).toBe('Chickens fly when the bell rings.');
    expect(call.instructions).not.toContain('Chickens fly');
    expect(call.schemaName).toBe('reality_reading');
  });

  it('names the village; it cannot describe one: unknown villages, regions, fields and oversized text are refused', async () => {
    const h = harness(demoScript as never);
    const token = await h.session();
    expect((await h.call('interpret-reality', { body: req('x', { scenario: { id: 'atlantis', seed: 1, lab: false } }), token })).status).toBe(400);
    expect((await h.call('interpret-reality', { body: req('x', { region: 'narnia' }), token })).status).toBe(400);
    expect((await h.call('interpret-reality', { body: { ...req('x'), village: { things: ['dragon'] } }, token })).status).toBe(400);
    expect((await h.call('interpret-reality', { body: req('y'.repeat(241)), token })).status).toBe(400);
    expect((await h.call('interpret-reality', { body: req('Chickens fly.'), token: null })).status).toBe(401);
    expect(h.provider.calls.length).toBe(0);
    // what the model is told about the village comes from the engine, and names no villager
    await h.call('interpret-reality', { body: req('Chickens fly when the bell rings.'), token });
    const prompt = h.provider.calls[0].prompt;
    expect(JSON.parse(prompt).village.regions.map((x: { id: string }) => x.id).sort()).toEqual(['east', 'river', 'west']);
    for (const v of red().villagers) expect(prompt).not.toContain(v.name);
  });

  it('drops invented keys, never lets a model set provenance, power or price, and refuses out-of-range or non-executable effects', async () => {
    const extra = chickens();
    (extra.candidates[0] as Record<string, unknown>).power = 999;
    (extra.candidates[0].clauses[0].effect as Record<string, unknown>).strength = 9;
    (extra.candidates[0] as Record<string, unknown>).source = { reader: 'offline-v2' };
    const a = await ask(() => ({ kind: 'ok', value: extra }), 'Chickens fly when the bell rings.');
    const w = a.r.body.reading as WireReading;
    expect(w.kind).toBe('supported');
    if (w.kind === 'supported') {
      const txt = JSON.stringify(w.candidates[0].ast);
      expect(txt).not.toMatch(/999|strength|"power"/);
      expect(w.candidates[0].ast.source.reader).toBe('model');
    }
    const big = chickens();
    (big.candidates[0].clauses[0].effect as Record<string, unknown>).magnitude = 9;
    expect((await ask(() => ({ kind: 'ok', value: big }), 'Chickens fly when the bell rings.')).r.body).toMatchObject({ ok: false, reason: 'bad_output', fallback: 'offline' });
    const transform = chickens();
    transform.candidates[0].clauses[0].effect = { op: 'TRANSFORM_MATERIAL', into: 'gold' } as never;
    expect((await ask(() => ({ kind: 'ok', value: transform }), 'Chickens turn to gold.')).r.body).toMatchObject({ ok: false, reason: 'bad_output' });
  });

  it('keeps a reading to the words of the sentence: a law on something never mentioned, or an invented power, is dropped', async () => {
    const wolves = chickens();
    wolves.candidates[0].clauses[0].target.kind = 'water';
    wolves.candidates[0].clauses[0].effect = { op: 'REDIRECT_FLOW', mode: 'attract', magnitude: 3, radius: 4 } as never;
    wolves.candidates[0].map[0].target = 'the river';
    const r = await ask(() => ({ kind: 'ok', value: wolves }), 'Chickens fly when the bell rings.');
    expect(r.r.body).toMatchObject({ ok: false, reason: 'bad_output' });
    const power = chickens();
    power.candidates[0].clauses[0].when.events[0].event = 'lantern';
    power.candidates[0].map[0].trigger = 'when the lanterns are lit';
    expect((await ask(() => ({ kind: 'ok', value: power }), 'Chickens fly when the bell rings.')).r.body).toMatchObject({ ok: false, reason: 'bad_output' });
    // a good reading next to a bad one survives, and the bad one is named in the notes
    const mixed = chickens();
    mixed.candidates.push({ ...wolves.candidates[0] });
    const m = await ask(() => ({ kind: 'ok', value: mixed }), 'Chickens fly when the bell rings.');
    const w = m.r.body.reading as WireReading;
    expect(w.kind).toBe('supported');
    if (w.kind === 'supported') {
      expect(w.candidates).toHaveLength(1);
      expect(w.notes.join()).toMatch(/does not mention/);
    }
  });

  it('moves a reading to a region that can hold it, and turns a "supported" with omissions into a partial', async () => {
    const west = chickens({ regions: ['west'] });
    const a = await ask(() => ({ kind: 'ok', value: west }), 'Chickens fly when the bell rings.');
    const w = a.r.body.reading as WireReading;
    if (w.kind !== 'supported') throw new Error(w.kind);
    expect(w.candidates[0].ast.regions).toEqual(['east']);
    expect(w.candidates[0].assumed.join()).toMatch(/instead of/);
    const om = chickens({ omitted: [{ text: 'on the river bank', reason: 'unrepresentable', why: 'not a place a belief can be measured from' }] });
    const b = await ask(() => ({ kind: 'ok', value: om }), 'Chickens on the river bank fly when the bell rings.');
    expect((b.r.body.reading as WireReading).kind).toBe('partial');
  });

  it('passes on honest refusals and questions, with checked alternatives', async () => {
    const no: InterpretV2Output = { kind: 'unsupported', candidates: [], question: null, reasons: [{ id: 'time', words: 'reverse time', why: 'the village cannot change time' }], narrative: null };
    const a = await ask(() => ({ kind: 'ok', value: no }), 'Reverse time.');
    expect(a.r.body.reading).toMatchObject({ kind: 'unsupported', reasons: [{ id: 'time' }], alternatives: [] });
    const amb = await ask(demoScript, 'Wolves do not fear the smoke.', { scenario: { id: 'ashwood', seed: 1, lab: false } });
    expect(amb.r.body.reading).toMatchObject({ kind: 'ambiguous', question: expect.stringMatching(/drawn/) });
  });

  it('fails safe: refusal, timeout and a spent allowance (shared with the V1 contract) all leave the offline reader', async () => {
    expect((await ask(() => ({ kind: 'fail', failure: 'refused' }), 'Chickens fly.')).r.body).toMatchObject({ ok: false, reason: 'refused', fallback: 'offline' });
    const slow = harness((() => ({ kind: 'hang' })) as never, { env: { BE_AI_TIMEOUT_FAST_MS: '50' } });
    const t = await slow.session();
    const timed = await slow.call('interpret-reality', { body: req('Chickens fly when the bell rings.'), token: t });
    expect([504, 200]).toContain(timed.status);
    expect(timed.body).toMatchObject({ ok: false, fallback: 'offline' });
    // one allowance for both contracts
    const h = harness(((c: { prompt: string; schemaName: string }) => (c.schemaName === 'reality_reading' ? demoScript(c) : { kind: 'ok', value: { understood: false, candidates: [] } })) as never);
    const token = await h.session();
    for (let i = 0; i < h.config.limits.interpretPerSessionDay; i++) {
      h.clock.t += h.config.limits.interpretCooldownMs + 1;
      const r = await h.call('interpret-belief', { body: { v: 1, text: `the river turns ${i}`, ontology: NL_VERSION, context: { features: [], regions: [] } }, token });
      expect(r.status).toBe(200);
    }
    h.clock.t += h.config.limits.interpretCooldownMs + 1;
    expect((await h.call('interpret-reality', { body: req('Chickens fly when the bell rings.'), token })).body).toMatchObject({ ok: false, reason: 'over_quota' });
  });

  it('answers a repeat from its cache, and drops a cache entry that no longer passes the checks', async () => {
    class Recording extends MemoryStore {
      readonly cached: string[] = [];
      override async set(key: string, value: string, ttlMs: number): Promise<void> {
        if (key.startsWith('c:i2:')) this.cached.push(key);
        return super.set(key, value, ttlMs);
      }
    }
    const t0 = Date.UTC(2026, 9, 27, 12, 0, 0);
    let clockOf: (() => number) | null = null;
    const store = new Recording(() => (clockOf ? clockOf() : t0));
    const h = harness(demoScript as never, { store, t0 });
    clockOf = () => h.clock.t;
    const token = await h.session();
    const first = await h.call('interpret-reality', { body: req('Chickens fly when the bell rings.'), token });
    h.clock.t += 5000;
    const second = await h.call('interpret-reality', { body: req('Chickens fly when the bell rings.'), token });
    expect(second.body).toMatchObject({ ok: true, cached: true });
    expect(second.body.id).toBe(first.body.id);
    expect(h.provider.calls.length).toBe(1);
    // poison the cached entry: the server must not serve it
    expect(store.cached).toHaveLength(1);
    await store.set(store.cached[0], JSON.stringify({ model: 'anthropic/claude-haiku-5.5', output: { ...chickens(), candidates: [{ ...chickens().candidates[0], clauses: [{ ...chickens().candidates[0].clauses[0], effect: { op: 'TRANSFORM_MATERIAL', into: 'gold' } }] }] } }), 60_000);
    h.clock.t += 5000;
    const third = await h.call('interpret-reality', { body: req('Chickens fly when the bell rings.'), token });
    expect(third.body).toMatchObject({ ok: true, cached: false });
    expect(h.provider.calls.length).toBe(2);
  });
});

describe('the v2 instructions', () => {
  it('carry the whole executable vocabulary and every absent concept, and are the same every time', () => {
    const t = interpretV2Instructions();
    for (const op of EXECUTABLE_OPS) expect(t).toContain(op);
    for (const a of ABSENT) expect(t).toContain(a.id);
    expect(t).not.toContain('TRANSFORM_MATERIAL —');
    expect(interpretV2Instructions()).toBe(t);
    expect(t).toMatch(/never followed/);
    void demo;
  });
});
