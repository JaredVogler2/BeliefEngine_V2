import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/engine/index.ts';
import { candidatesFromReply, parseLlmReply, providerPrompt, type LlmReply } from '../../src/engine/nl/llm.ts';
import { interpretBelief } from '../../src/engine/nl/interpret.ts';

/**
 * The model-reply contract of the V1 vocabulary. V1's in-memory proxy (server/interpreter.ts) and its tests were replaced in V2 by the
 * server/ai service and tests/unit/ai-app.test.ts; what stays here is that a reply is only ever a proposal for the game's own checks.
 */

describe('online interpreter: a model reply is only ever a proposal', () => {
  it('drops suggestions outside the ontology and clamps numbers', () => {
    const reply: LlmReply = {
      schema: 1,
      understood: true,
      candidates: [
        { subject: 'river', effect: 'repel', trigger: 'always' }, // river cannot be powered by "always"
        { subject: 'time', effect: 'stop', trigger: 'always' }, // not a subject
        { subject: 'stone', effect: 'repel', trigger: 'always' }, // not modelled
        { subject: 'river', effect: 'repel', trigger: 'lit_beacon', intensity: 99, radius: 99 },
      ],
    };
    // schema allows up to three, so check the pieces separately
    const parsed = parseLlmReply({ ...reply, candidates: reply.candidates.slice(0, 3) });
    expect(parsed.ok).toBe(true);
    expect(candidatesFromReply({ ...reply, candidates: reply.candidates.slice(0, 3) })).toHaveLength(0);
    const c = candidatesFromReply({ schema: 1, understood: true, candidates: [reply.candidates[3]] });
    expect(c).toHaveLength(1);
    expect(c[0].intensity).toBe(3);
    expect(c[0].radius).toBeLessThanOrEqual(4);
    expect(c[0].notes[0]).toContain('online interpreter');
  });

  it('never lets a model\'s numbers or claims of safety through: the same balance, stress test and cost apply', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, difficulty: 'story', inventor: true });
    g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
    const readings = candidatesFromReply({ schema: 1, understood: true, candidates: [{ subject: 'river', effect: 'repel', trigger: 'lit_beacon', intensity: 3, radius: 4, title: 'Totally Safe and Free' }] });
    const offline = interpretBelief(g.state, 'The river turns aside from lit lanterns.');
    const viaModel = interpretBelief(g.state, 'The river turns aside from lit lanterns.', { readings });
    expect(viaModel.source).toBe('model');
    expect(viaModel.drafts[0].claim.custom?.nl).toBeTruthy();
    // the model asked for the strongest version; the formula prices it, so it costs at least as much and needs at least as many believers
    expect(viaModel.drafts[0].cost.compose).toBeGreaterThanOrEqual(offline.drafts[0].cost.compose);
    expect(viaModel.drafts[0].support.believers).toBeGreaterThanOrEqual(offline.drafts[0].support.believers);
    expect(viaModel.drafts[0].title).not.toContain('Totally Safe');
    expect(viaModel.drafts[0].claim.text).not.toContain('Totally Safe');
    expect(viaModel.drafts[0].power).toBeLessThanOrEqual(60);
  });

  it('still refuses a sentence the village cannot model, even if a model says it understood it', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, difficulty: 'story', inventor: true });
    g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
    const readings = candidatesFromReply({ schema: 1, understood: true, candidates: [{ subject: 'river', effect: 'repel', trigger: 'lit_beacon' }] });
    const r = interpretBelief(g.state, 'Everyone in the village becomes immortal and gold falls from the sky.', { readings });
    expect(r.status).toBe('unsupported');
    expect(r.drafts).toHaveLength(0);
  });

  it('parseLlmReply is strict about shape', () => {
    expect(parseLlmReply(null).ok).toBe(false);
    expect(parseLlmReply([]).ok).toBe(false);
    expect(parseLlmReply({ schema: 1, understood: false, candidates: [] }).ok).toBe(true);
    expect(parseLlmReply({ schema: 1, understood: false, candidates: [], note: 'hi' }).ok).toBe(false);
    expect(parseLlmReply({ schema: 1, understood: true, candidates: [5] }).ok).toBe(false);
    expect(parseLlmReply({ schema: 1, understood: true, candidates: [{ subject: 5, effect: 'a', trigger: 'b' }] }).ok).toBe(false);
  });

  it('the provider prompt carries the ontology and the refusal instruction, and nothing about this game\'s state', () => {
    const p = providerPrompt();
    expect(p.system).toContain('lit_beacon');
    expect(p.system).toContain('"understood":false');
    expect(p.system).toContain('DATA');
    expect(Object.keys(p.ontology)).not.toContain('stone');
    expect(Object.keys(p.ontology)).not.toContain('smoke');
  });
});
