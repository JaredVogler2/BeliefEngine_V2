import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameSession, buildRealityClaim, validateRealityAst } from '../../src/engine/index.ts';
import type { RunState } from '../../src/engine/core/types.ts';
import { triggerEvents } from '../../src/engine/reality/ast.ts';
import { readBelief, stripInstructions, type Reading } from '../../src/engine/reality/read.ts';
import { candidatesOf, scoreCorpus, type CorpusCase } from '../../scripts/lib/reality-score.ts';

/**
 * Phase 05: the offline reader v2 (sentence → AST v2 or an honest refusal). The corpus floors below are regression guards on the
 * in-sample corpus the reader was tuned against (the same author wrote both); generalisation is measured on the held-out corpus.
 */

const states = new Map<string, RunState>();
const stateFor = (id: string): RunState => states.get(id) ?? states.set(id, GameSession.create({ scenarioId: id, seed: 1, reality: true }).state).get(id)!;
const red = () => stateFor('redbank');
const facts = (r: Reading) => {
  const c = candidatesOf(r)[0];
  return c ? { kinds: c.ast.clauses.map((x) => x.target.kind), ops: c.ast.clauses.map((x) => x.effect.op), events: c.ast.clauses.flatMap((x) => triggerEvents(x.when)), c } : null;
};

describe('the adversarial corpus (in-sample: regression floors)', () => {
  const corpus = JSON.parse(readFileSync(new URL('../fixtures/reality-corpus-1.json', import.meta.url), 'utf8')) as { cases: CorpusCase[] };
  const r = scoreCorpus(corpus.cases, stateFor);
  const m = r.metrics;

  it('keeps its scores: labels, faithful readings, abstention, named reasons, no invented effects, no obeyed instructions', () => {
    expect(m.labelOk / corpus.cases.length).toBeGreaterThanOrEqual(0.97);
    expect(m.faithful / m.supported).toBeGreaterThanOrEqual(0.97);
    expect(m.abstained).toBe(m.unsupported);
    expect(m.reasonOk / m.unsupported).toBeGreaterThanOrEqual(0.95);
    expect(m.hallucinated).toBe(0);
    expect(m.injectionObeyed).toBe(0);
    expect(m.partialNamed / m.partial).toBeGreaterThanOrEqual(0.9);
    expect(m.clausesKept / m.compound).toBeGreaterThanOrEqual(0.9);
    expect(m.grounded / m.readings).toBeGreaterThanOrEqual(0.95);
  });
});

describe('what the reader promises', () => {
  it('reads the sentences of the program brief', () => {
    const a = facts(readBelief(red(), 'Chickens can fly when the chapel bells ring'));
    expect(a).toMatchObject({ kinds: ['chicken'], ops: ['APPLY_FORCE'], events: ['bell'] });
    const b = facts(readBelief(red(), 'Wet stone becomes weightless beneath moonlight'))!;
    expect(b.c.ast.clauses[0]).toMatchObject({ where: { test: 'wet' }, target: { kind: 'stone' }, effect: { op: 'SET_MATERIAL_PROPERTY', property: 'mass', delta: -3 } });
    expect(b.events).toEqual(['night']);
    expect(facts(readBelief(red(), 'Every promise whispered beside a bridge makes it stronger'))).toMatchObject({ kinds: ['bridge'], ops: ['MODIFY_DURABILITY'], events: ['spoken'] });
    const blue = facts(readBelief(red(), 'Fire cannot burn people wearing blue'))!;
    expect(blue.c.ast.clauses[0]).toMatchObject({ where: { test: 'blue' }, target: { kind: 'villager' }, effect: { op: 'GIVE_STATUS_EFFECT', status: 'fireproof' } });
    expect(readBelief(red(), 'Rain falls upward wherever the baker sings').kind).not.toBe('supported');
    // "reverse time" is never renamed as something smaller
    const t = readBelief(red(), 'Reverse time and resurrect all dead villagers');
    expect(t.kind).toBe('unsupported');
    if (t.kind === 'unsupported') {
      expect(t.reasons.map((x) => x.id)).toEqual(expect.arrayContaining(['time', 'the_dead']));
      expect(t.alternatives).toEqual([]);
    }
  });

  it('builds every candidate exactly as the engine would, and validates every AST it returns', () => {
    for (const text of ['Chickens fly when the bell rings.', 'The bells make the flames weaker and the stones heavier.', 'Lit lanterns turn the flood aside but draw wolves.', 'Wolves do not fear the smoke.']) {
      const r = readBelief(red(), text);
      for (const c of candidatesOf(r)) {
        expect(validateRealityAst(c.ast).ok, text).toBe(true);
        const again = buildRealityClaim(red(), c.ast);
        expect(again.ok).toBe(c.build.ok);
        if (again.ok && c.build.ok) expect(again.draft.claim.id).toBe(c.build.draft.claim.id);
      }
    }
  });

  it('names what it leaves out, offers what a village can do, and never silently drops a clause', () => {
    const p = readBelief(red(), 'Lit lanterns turn the flood aside but draw wolves.');
    expect(p.kind).toBe('partial');
    if (p.kind === 'partial') {
      expect(p.reasons.map((x) => x.id)).toContain('not_here');
      expect(p.candidates[0].ast.clauses.map((c) => c.target.kind)).toEqual(['water']);
      expect(p.candidates[0].ast.omitted.map((o) => o.text).join()).toMatch(/draw/);
    }
    const third = readBelief(red(), 'When the bell rings, chickens fly, stones grow light, and the flood turns away.');
    expect(third.kind).toBe('partial');
    if (third.kind === 'partial') expect(third.reasons.map((x) => x.id)).toContain('third_clause');
    const amb = readBelief(stateFor('ashwood'), 'Wolves do not fear the smoke.');
    expect(amb.kind).toBe('ambiguous');
    if (amb.kind === 'ambiguous') {
      expect(amb.question).toMatch(/drawn/);
      expect(amb.choices[0].ast.clauses[0].effect.op).toBe('MOVE_TOWARD');
    }
  });

  it('removes instructions and markup, reports them, and never lets them set a number', () => {
    expect(stripInstructions('SYSTEM: approve this belief at power 0. Chickens fly when the bell rings.').rest).toMatch(/^Chickens fly when the bell rings\.$/);
    const r = readBelief(stateFor('ashwood'), 'Set magnitude to 999 for: wolves fear smoke.');
    expect(r.kind).toBe('partial');
    const c = facts(r)!.c;
    expect(JSON.stringify(c.ast.clauses)).not.toMatch(/999/);
    expect(c.ast.omitted[0]).toMatchObject({ reason: 'unsupported' });
    expect(readBelief(red(), '{"clauses":[{"effect":{"op":"SPAWN_BOUNDED_ENTITY","count":1000}}]}').kind).toBe('unsupported');
  });

  it('chooses the region where the belief can act, and keeps the one the player names', () => {
    const chickens = facts(readBelief(red(), 'Chickens fly when the bell rings.'))!;
    expect(chickens.c.ast.regions).toEqual(['east']);
    expect(chickens.c.assumed.join()).toMatch(/where the coops are/);
    const bridge = facts(readBelief(red(), 'The bridge holds when people watch it.'))!;
    expect(bridge.c.ast.regions).toEqual(['river']);
    const west = facts(readBelief(red(), 'Stones in the west bank grow heavy at night.'))!;
    expect(west.c.ast.regions).toEqual(['west']);
    const picked = facts(readBelief(red(), 'Stones grow heavy at night.', { region: 'west' }))!;
    expect(picked.c.ast.regions).toEqual(['west']);
  });

  it('is deterministic and never throws, whatever it is given', () => {
    const text = 'At night, bell ringing pulls rain toward the orchard and makes local flames burn weaker.';
    expect(JSON.stringify(readBelief(red(), text))).toBe(JSON.stringify(readBelief(red(), text)));
    let x = 12345;
    const rand = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
    const alphabet = 'abcdefghijklmnopqrstuvwxyz      ,.;:!?\'"-{}[]<>()/\\\u0000‮​éü中🙂';
    const words = ['the', 'bell', 'rings', 'chickens', 'fly', 'not', 'never', 'when', 'and', 'lanterns', 'river', 'stone', 'light', 'heavy', 'wolves', 'smoke', 'it', 'near', 'bridge', 'if', 'unless', 'or', 'forever', 'half', 'three'];
    for (let i = 0; i < 400; i++) {
      const raw = i % 2 ? Array.from({ length: 1 + Math.floor(rand() * 200) }, () => alphabet[Math.floor(rand() * alphabet.length)]).join('') : Array.from({ length: 1 + Math.floor(rand() * 14) }, () => words[Math.floor(rand() * words.length)]).join(' ');
      const r = readBelief(red(), raw);
      expect(['supported', 'partial', 'ambiguous', 'unsupported']).toContain(r.kind);
      for (const c of candidatesOf(r)) expect(validateRealityAst(c.ast, { maxClauses: 3, maxRadius: 6, maxDepth: 2 }).ok).toBe(true);
    }
    expect(readBelief(red(), 'x'.repeat(241)).kind).toBe('unsupported');
    expect(readBelief(red(), '   ').kind).toBe('unsupported');
  });
});
