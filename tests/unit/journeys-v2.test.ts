import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { AiClient } from '../../src/ai/client.ts';
import { GameSession, checkRun, deserializeRun, eventHash, serializeRun, stateHash } from '../../src/engine/index.ts';
import { cloneState } from '../../src/engine/core/clone.ts';
import { trustOf } from '../../src/engine/core/lookup.ts';
import { replayRun } from '../../src/engine/core/replay.ts';
import type { Action, CreateRunOptions, NpcChoiceInput, RunState } from '../../src/engine/core/types.ts';
import { validateChoice } from '../../src/engine/mind/decide.ts';
import { choose } from '../../src/engine/mind/policy.ts';
import { buildNpcRequest } from '../../src/engine/mind/request.ts';
import type { Queued } from '../../src/engine/mind/types.ts';
import { describeDraft } from '../../src/engine/reality/preview.ts';
import { readBelief } from '../../src/engine/reality/read.ts';
import type { Route } from '../../server/ai/app.ts';
import { demoInterpretV2 } from '../../server/ai/tasks/interpret-v2.ts';
import { demoNpc, npcPrompt, validateDecisions, type NpcRequest } from '../../server/ai/tasks/npc.ts';
import { ORIGIN, harness } from '../helpers/ai.ts';

/**
 * Phase 16's acceptance journeys, the parts a headless test can show (the browser parts are in tests/e2e/v2-journeys.spec.ts and
 * the specs it names; MCP is tests/unit/mcp-v2-stdio.test.ts). Every model here is the scripted stand-in: TESTED MOCK ONLY.
 *
 *   B: a novel sentence read honestly, with its preview; an impossible clause named exactly
 *   C: six named villagers answer one new belief by their own lights; failed proof changes minds; trust moves and factions answer;
 *      a model's proposals go through the engine's checks and change nothing outside legal moves
 *   D: a model upgrade cannot reinterpret history; corrupted saves are refused by name
 */

const NEW = 'Chickens rise into the air when the bells sound.';

function start(seed: number): GameSession {
  const g = GameSession.create({ scenarioId: 'redbank', seed, difficulty: 'normal', mode: 'story', reality: true });
  g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
  return g;
}

function written(g: GameSession, text = NEW) {
  const r = readBelief(g.state, text);
  if (r.kind !== 'supported' || !r.candidates[0].build.ok) throw new Error(`${r.kind}: ${text}`);
  return r.candidates[0].build.draft;
}

/** What a villager would do if they stopped to think now (the game's own policy), held to the engine's validator. */
function intention(s: RunState, id: string, why: Queued['why'], claim: string) {
  const c = cloneState(s);
  const q: Queued = { id, why, claim, event: null };
  c.v2!.minds!.queue = [q];
  const choice = choose(c, q);
  return { choice, legal: validateChoice(c, choice).ok };
}

describe('Journey B: a novel law, read honestly', () => {
  it('"chickens rise into the air when bells sound" is the hens\' lift on the bell, with the whole preview before anything is spent', () => {
    const g = start(1);
    const ap = g.state.ap;
    const r = readBelief(g.state, 'chickens rise into the air when bells sound');
    expect(r.kind).toBe('supported');
    if (r.kind !== 'supported' || !r.candidates[0].build.ok) return;
    const clause = r.candidates[0].ast.clauses[0];
    expect(clause.when).toMatchObject({ event: 'bell' });
    expect(clause.target.kind).toBe('chicken');
    expect(clause.effect).toMatchObject({ op: 'APPLY_FORCE', direction: 'up' });
    const d = describeDraft(g.state, r.candidates[0].build.draft);
    expect(d.plan.length).toBe(1);
    expect(d.threshold.believers).toBeGreaterThan(0);
    expect(d.threshold.voters).toBeGreaterThan(d.threshold.believers);
    // reading and previewing are free
    expect(g.state.ap).toBe(ap);
  });

  it('a time-reversal clause is named exactly and left out; time reversal on its own is refused', () => {
    const g = start(1);
    const mixed = readBelief(g.state, 'When the bell rings, chickens fly and time runs backwards.');
    expect(mixed.kind).toBe('partial');
    if (mixed.kind === 'partial') {
      expect(mixed.reasons).toContainEqual(expect.objectContaining({ id: 'time', words: 'time runs backwards' }));
      expect(mixed.candidates[0].ast.clauses.map((c) => c.effect.op)).toEqual(['APPLY_FORCE']);
    }
    const alone = readBelief(g.state, 'Reverse time so the flood never happened.');
    expect(alone.kind).toBe('unsupported');
    if (alone.kind === 'unsupported') expect(alone.reasons.map((x) => x.words)).toEqual(['Reverse time', 'never happened']);
  });
});

describe('Journey C: a living society', () => {
  it('six named villagers hear the same new belief at once and mean to answer it by their own lights; failed proof turns all six and changes plans', () => {
    const g = start(1);
    const draft = written(g);
    expect(g.act({ type: 'COMPOSE', claim: draft.claim }).ok).toBe(true);
    const id = draft.claim.id;
    const hall = g.state.world.landmarks.find((l) => ['chapel', 'market', 'hall'].includes(l.kind))!;
    expect(g.act({ type: 'GATHER', claim: id, site: hall.id }).ok).toBe(true);
    const six = g.state.villagers.filter((v) => v.beliefs[id]?.lastSource === 'keeper');
    expect(six.length).toBe(6);
    // the session replaces its state on every action: read minds afresh each time
    const minds = () => g.state.v2!.minds!;
    // six different people: their goals differ
    expect(new Set(six.map((v) => minds().agents[v.id].goals.join('+'))).size).toBeGreaterThanOrEqual(3);
    const heard = Object.fromEntries(six.map((v) => [v.id, v.beliefs[id].conv]));
    const before = six.map((v) => ({ v, ...intention(g.state, v.id, 'novel_claim', id) }));
    for (const b of before) expect(b.legal, `${b.v.name}: ${b.choice.intent}`).toBe(true);
    expect(new Set(before.map((b) => b.choice.intent)).size).toBeGreaterThanOrEqual(2);
    // whoever wants proof goes looking for it, by their own goals
    for (const b of before) if (minds().agents[b.v.id].goals.includes('find_proof')) expect(['investigate', 'request_test', 'ask']).toContain(b.choice.intent);

    // contradicting evidence: the Keeper stages it at the bell before it is law, and nothing flies
    g.endDay();
    g.endDay();
    g.state.ap = Math.max(g.state.ap, 3);
    expect(g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: 'bell', claim: id }).ok).toBe(true);
    expect(g.state.log.some((e) => e.day === g.state.day && e.code === 'EVIDENCE_BACKFIRED')).toBe(true);
    g.endDay();
    for (const v of six) {
      expect(minds().agents[v.id].episodes.some((e) => e.claim === id && e.kind === 'saw_proof_fail'), v.name).toBe(true);
      expect(g.state.villagers.find((x) => x.id === v.id)!.beliefs[id].conv, v.name).toBeLessThan(heard[v.id]);
    }
    const after = six.map((v) => ({ v, ...intention(g.state, v.id, 'contradiction', id) }));
    for (const a of after) expect(a.legal).toBe(true);
    expect(after.filter((a, i) => a.choice.intent !== before[i].choice.intent).length).toBeGreaterThan(0);
  });

  it('over a whole recorded run, trust between villagers moves and the factions answer (the generated village of the "rain" chain)', () => {
    const fx = JSON.parse(readFileSync(new URL('../fixtures/v2-bridge-traces.json', import.meta.url), 'utf8')) as Record<string, { opts: CreateRunOptions; actions: Action[] }>;
    const t = fx.rain;
    const r = replayRun({ ...t.opts, actions: t.actions });
    expect(r.rejected).toEqual([]);
    const s0 = GameSession.create(t.opts).state;
    const ids = r.state.villagers.map((v) => v.id);
    let moved = 0;
    for (const a of ids) for (const b of ids) if (a !== b && Math.abs(trustOf(r.state, a, b) - trustOf(s0, a, b)) >= 1) moved++;
    expect(moved).toBeGreaterThanOrEqual(5);
    const codes = r.state.log.map((e) => e.code);
    expect(codes).toContain('FACTION_ENDORSES');
    expect(codes).toContain('TEST_REQUESTED');
    expect(new Set(r.state.log.filter((e) => e.code === 'NPC_ACT').map((e) => e.reason)).size).toBeGreaterThanOrEqual(3);
  });

  it('a model\'s proposals (scripted stand-in) are checked by the server and the engine, change nothing until dusk, and replay with no model', () => {
    const g = start(1);
    expect(g.act({ type: 'COMPOSE', claim: written(g).claim }).ok).toBe(true);
    let req = buildNpcRequest(g.state, 'run-journey-c');
    for (let d = 0; !req && d < 4; d++) {
      g.endDay();
      req = buildNpcRequest(g.state, 'run-journey-c');
    }
    expect(req).not.toBeNull();
    if (!req) return;
    const v = validateDecisions(req as unknown as NpcRequest, demoNpc(npcPrompt(req as unknown as NpcRequest)));
    expect(v.accepted.length).toBeGreaterThan(0);
    const decisions: NpcChoiceInput[] = v.accepted.map((d) => ({ citizenId: d.citizenId, intent: d.intent, target: d.target, claimId: d.claimId, dialogue: d.dialogue ?? null, cites: d.cites, tone: d.tone, approach: d.approach, confidence: d.confidence, thought: d.thought ?? '' }));
    const world = (s: RunState) => JSON.stringify({ v: s.villagers, w: s.world, l: s.laws, c: s.claims, ap: s.ap });
    const was = world(g.state);
    expect(g.act({ type: 'NPC_DECIDE', rev: g.state.nextEventId, decisions, model: 'mock', id: 'journey-c' }).ok).toBe(true);
    // a decision is a plan for dusk: nothing in the village moves when it is accepted
    expect(world(g.state)).toBe(was);
    expect(Object.keys(g.state.v2!.minds!.decided).length).toBe(decisions.length);
    // invented people, memories and moves never get that far: the server drops them, and the engine refuses them on its own
    const forged = { ...v.accepted[0], citizenId: 'nobody' };
    expect(validateDecisions(req as unknown as NpcRequest, { decisions: [forged, { ...v.accepted[0], cites: ['m999999'] }, { ...v.accepted[0], intent: 'fly' as never }] }).accepted).toEqual([]);
    g.endDay();
    // at dusk each of those villagers did what the model proposed, recorded as the model's (the scripted stand-in mostly waits)
    for (const d of decisions) expect(g.state.v2!.minds!.last.find((c) => c.citizenId === d.citizenId)).toMatchObject({ source: 'model', intent: d.intent });
    const r = replayRun({ scenarioId: 'redbank', seed: 1, difficulty: 'normal', mode: 'story', reality: true, actions: g.log });
    expect(r.rejected).toEqual([]);
    expect(r.stateHash).toBe(stateHash(g.state));
  });
});

describe('Journey D: history is not reinterpreted', () => {
  function wired(model: string | undefined, script: (c: { prompt: string }) => unknown) {
    const h = harness(((c: { prompt: string }) => ({ kind: 'ok', value: script(c) })) as never, { env: model ? { BE_AI_MODEL_FAST: model } : {} });
    const f = vi.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers as Record<string, string>);
      headers.set('origin', ORIGIN);
      return h.app(url.replace(/^\/api\//, '') as Route, new Request(`https://game.example${url}`, { method: init.method, headers, body: init.body as string | undefined }));
    });
    return new AiClient({ fetch: f as unknown as typeof fetch, now: () => h.clock.t });
  }

  it('a belief a model read is replayed from its recorded structure: a newer model that reads the sentence differently changes nothing', async () => {
    const g = start(2);
    const before = await wired(undefined, (c) => demoInterpretV2(c.prompt)).interpretReality(g.state, 'Chickens fly when the bell rings.');
    expect(before.ok).toBe(true);
    if (!before.ok || before.reading.kind !== 'supported' || !before.reading.candidates[0].build.ok) return;
    const claim = before.reading.candidates[0].build.draft.claim;
    expect(g.act({ type: 'COMPOSE', claim }).ok).toBe(true);
    for (let d = 0; d < 3 && !g.state.outcome; d++) {
      const v = g.state.villagers.find((x) => x.status !== 'dead' && !x.beliefs[claim.id]);
      if (v) g.act({ type: 'SEED', claim: claim.id, target: v.id });
      g.endDay();
    }
    const hash = stateHash(g.state);
    const events = eventHash(g.state);

    // the model is upgraded and now reads the same words as a stronger lift
    const stronger = (c: { prompt: string }) => {
      const out = demoInterpretV2(c.prompt);
      for (const cand of out.candidates) for (const k of cand.clauses) if (typeof k.effect === 'object' && k.effect && 'magnitude' in k.effect) (k.effect as { magnitude: number }).magnitude = 3;
      return out;
    };
    const after = await wired('openai/gpt-6-luna', stronger).interpretReality(start(2).state, 'Chickens fly when the bell rings.');
    expect(after.ok).toBe(true);
    if (after.ok && after.reading.kind === 'supported') {
      expect(after.meta.model).toBe('openai/gpt-6-luna');
      expect(JSON.stringify(after.reading.candidates[0].ast.clauses)).not.toBe(JSON.stringify(claim.reality!.ast.clauses));
    }
    // the run itself replays from its log alone, to the same end, and its record still names who read it and how
    const r = replayRun({ scenarioId: 'redbank', seed: 2, difficulty: 'normal', mode: 'story', reality: true, actions: g.log });
    expect(r.rejected).toEqual([]);
    expect(r.stateHash).toBe(hash);
    expect(r.eventHash).toBe(events);
    const { check, derived } = checkRun(g.state, g.ledger);
    expect(check.ok).toBe(true);
    expect(derived.ledger.entries[0].source).toMatchObject({ reader: 'model', model: 'anthropic/claude-haiku-5.5' });
    expect(derived.ledger.entries[0].source.prompt).toMatch(/^interpret-v2\./);
  });

  it('corrupted saves are refused by name and change nothing; an edited record of a model\'s input is caught on replay', () => {
    const g = start(1);
    expect(g.act({ type: 'COMPOSE', claim: written(g, 'Chickens fly when the bell rings.').claim }).ok).toBe(true);
    g.endDay();
    const good = serializeRun(g.state, { ledger: g.ledger });
    expect(deserializeRun(good).ok).toBe(true);
    const env = () => JSON.parse(good) as { schemaVersion: number; state: Record<string, unknown>; ledger: { entries: { output: unknown }[] } };
    expect(deserializeRun(good.slice(0, good.length / 2))).toMatchObject({ ok: false, error: expect.stringMatching(/not valid JSON/) });
    const future = env();
    future.schemaVersion = 999;
    expect(deserializeRun(JSON.stringify(future))).toMatchObject({ ok: false, error: expect.stringMatching(/newer version/) });
    const edited = env();
    const claims = edited.state.claims as { def: { reality?: { ast: { clauses: { effect: { magnitude?: number } }[] } } } | null }[];
    claims.find((c) => c.def?.reality)!.def!.reality!.ast.clauses[0].effect.magnitude = 3;
    expect(deserializeRun(JSON.stringify(edited))).toMatchObject({ ok: false, error: expect.stringMatching(/does not check out/) });
    const ledger = env();
    (ledger.ledger.entries[0].output as { clauses: unknown[] }).clauses = [];
    const loaded = deserializeRun(JSON.stringify(ledger));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(checkRun(loaded.state, loaded.ledger).check).toMatchObject({ ok: false, code: 'LEDGER_EDITED' });
  });
});
