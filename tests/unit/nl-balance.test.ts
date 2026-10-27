import { describe, expect, it } from 'vitest';
import { GameSession, catalogEntries, generateExpedition, getScenarioDef, listScenarios } from '../../src/engine/index.ts';
import { buildClaim, verifyCustomClaim } from '../../src/engine/nl/build.ts';
import type { RuleSpec } from '../../src/engine/index.ts';
import { validateSpec } from '../../src/engine/laws/rules.ts';
import { astHash, canonicalAst, validateBeliefAst, type BeliefAST } from '../../src/engine/nl/ast.ts';
import { MAX_POWER, balanceAst, maxIntensityFor } from '../../src/engine/nl/balance.ts';
import { CANONICAL, OFFERED } from '../../src/engine/nl/ontology.ts';
import { parseBelief } from '../../src/engine/nl/parse.ts';

const clause = (subject: string, effect: string, trigger: string, radius = 2, intensity = 2, watchers?: number) => ({ subject, effect, trigger, radius, intensity, ...(watchers ? { watchers } : {}) });
const ast = (clauses: unknown[], regions = ['east']): BeliefAST => ({ version: 1, clauses, regions }) as unknown as BeliefAST;

describe('the sentences the composer offers are sentences it understands', () => {
  it('every canonical sentence reads back as exactly its own combination, as the single best reading', () => {
    for (const o of CANONICAL) {
      const p = parseBelief(o.sentence);
      const top = p.candidates[0];
      expect(p.unsupported, o.sentence).toEqual([]);
      expect(top && `${top.subject}.${top.effect}.${top.trigger}`, o.sentence).toBe(`${o.subject}.${o.effect}.${o.trigger}`);
      // no second reading close enough to turn an offer into a question
      const rivals = p.candidates.filter((c) => c !== top && c.score >= top.score - 1.5);
      expect(rivals.map((c) => `${c.subject}.${c.effect}.${c.trigger}`), o.sentence).toEqual([]);
      expect(p.ignored, o.sentence).toEqual([]);
    }
  });
});

describe('the belief structure: a union where nonsense cannot be written', () => {
  it('accepts every combination the vocabulary offers and no other pairing of subject, effect and trigger', () => {
    const combos: [string, string, string][] = [];
    for (const [subject, o] of Object.entries(OFFERED)) for (const e of o.effects) for (const t of o.triggers) combos.push([subject, e, t]);
    expect(combos.length).toBeGreaterThanOrEqual(30);
    for (const [s, e, t] of combos) expect(validateBeliefAst(ast([clause(s, e, t, 0, 1)])).ok, `${s} ${e} ${t}`).toBe(true);
    // every offered combination has a sentence the offline composer will accept, and every sentence is an offered combination
    for (const [s, e, t] of combos) expect(CANONICAL.some((c) => c.subject === s && c.effect === e && c.trigger === t), `${s} ${e} ${t} has no canonical sentence`).toBe(true);
    for (const c of CANONICAL) expect(combos.some(([s, e, t]) => s === c.subject && e === c.effect && t === c.trigger), c.sentence).toBe(true);
  });

  it('refuses nonsense pairings, unmodelled subjects, out-of-range numbers and anything smuggled in', () => {
    const bad = (x: unknown) => expect(validateBeliefAst(x).ok).toBe(false);
    bad(ast([clause('bridge', 'grow', 'watchers')])); // a bridge cannot grow
    bad(ast([clause('rain', 'repel', 'lit_beacon')])); // rain is not powered by lanterns
    bad(ast([clause('river', 'grow', 'bell')]));
    bad(ast([clause('stone', 'strengthen', 'always')])); // not modelled
    bad(ast([clause('smoke', 'conceal', 'smoke_fire')]));
    bad(ast([clause('river', 'repel', 'lit_beacon', 9)]));
    bad(ast([clause('river', 'repel', 'lit_beacon', 2, 4)]));
    bad(ast([clause('river', 'repel', 'lit_beacon', 1.5)]));
    bad(ast([clause('grain', 'grow', 'night', 0, 2, 3)])); // watchers belong to bridges
    bad(ast([clause('river', 'repel', 'lit_beacon'), clause('river', 'repel', 'bell')])); // two clauses must differ
    bad(ast([clause('river', 'repel', 'lit_beacon'), clause('bridge', 'strengthen', 'watchers', 0, 2), clause('grain', 'grow', 'night', 0)]));
    bad(ast([clause('river', 'repel', 'lit_beacon')], ['../../etc']));
    bad(ast([clause('river', 'repel', 'lit_beacon')], []));
    bad({ ...ast([clause('river', 'repel', 'lit_beacon')]), extra: 1 });
    bad(JSON.parse('{"version":1,"clauses":[{"subject":"river","effect":"repel","trigger":"lit_beacon","radius":2,"intensity":2,"__proto__":{"polluted":true}}],"regions":["east"]}'));
    bad(JSON.parse('{"version":1,"clauses":[{"subject":"constructor","effect":"repel","trigger":"lit_beacon","radius":2,"intensity":2}],"regions":["east"]}'));
    bad(null);
    bad('river repel');
    bad([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('gives a belief one name however it is spelled: key order, region order and clause order do not matter', () => {
    const a = ast([clause('river', 'repel', 'lit_beacon'), clause('bridge', 'strengthen', 'watchers', 0, 3, 3)], ['east', 'west']);
    const b = { regions: ['west', 'east'], clauses: [{ intensity: 3, radius: 0, trigger: 'watchers', effect: 'strengthen', subject: 'bridge' }, { trigger: 'lit_beacon', effect: 'repel', subject: 'river', intensity: 2, radius: 2 }], version: 1 } as unknown as BeliefAST;
    expect(astHash(a)).toBe(astHash(b));
    expect(canonicalAst(a)).toEqual(canonicalAst(b));
    expect(astHash(a)).not.toBe(astHash(ast([clause('river', 'repel', 'lit_beacon', 3)], ['east'])));
  });
});

describe('the power budget: stronger beliefs pay more', () => {
  const triples: [string, string, string][] = [];
  for (const [subject, o] of Object.entries(OFFERED)) for (const e of o.effects) for (const t of o.triggers) triples.push([subject, e, t]);

  it('every offered combination at every strength and reach makes a valid, bounded, priced rule', () => {
    for (const [s, e, t] of triples)
      for (const intensity of [1, 2, 3])
        for (const radius of [0, 1, 2, 3, 4]) {
          const b = balanceAst(ast([clause(s, e, t, radius, intensity, s === 'bridge' ? 3 : undefined)]));
          expect(validateSpec(b.spec), `${s} ${e} ${t} r${radius} i${intensity}`).toEqual([]);
          expect(b.power).toBeLessThanOrEqual(MAX_POWER + 1e-9);
          expect(b.spec.thresholds.on).toBeGreaterThanOrEqual(b.minOn - 0.001);
          expect(b.spec.side.length).toBeGreaterThanOrEqual(b.power > 28 ? 2 : b.power > 12 ? 1 : 0);
          expect(b.apCost).toBeGreaterThanOrEqual(1);
          expect(b.apCost).toBeLessThanOrEqual(3);
          expect(b.hash).toBe(astHash(b.ast));
        }
  });

  it('is monotone: more power never means a lower bar, a cheaper price, a slower fade or fewer costs', () => {
    const rows = [1, 2, 3].flatMap((i) => [0, 1, 2, 3, 4].map((r) => balanceAst(ast([clause('wolf', 'repel', 'smoke_fire', r, i)])))).sort((a, b) => a.power - b.power);
    for (let k = 1; k < rows.length; k++) {
      expect(rows[k].spec.thresholds.on).toBeGreaterThanOrEqual(rows[k - 1].spec.thresholds.on);
      expect(rows[k].spec.thresholds.minSupporters).toBeGreaterThanOrEqual(rows[k - 1].spec.thresholds.minSupporters);
      expect(rows[k].spec.thresholds.decay).toBeGreaterThanOrEqual(rows[k - 1].spec.thresholds.decay);
      expect(rows[k].spec.thresholds.ramp).toBeLessThanOrEqual(rows[k - 1].spec.thresholds.ramp);
      expect(rows[k].apCost).toBeGreaterThanOrEqual(rows[k - 1].apCost);
    }
  });

  it('a compound belief is bounded too: its two clauses are narrowed until together they fit, and the player is told', () => {
    const big = balanceAst(ast([clause('wolf', 'repel', 'lit_beacon', 4, 3), clause('river', 'repel', 'bell', 4, 3)]));
    expect(big.power).toBeLessThanOrEqual(MAX_POWER);
    expect(big.adjustments.some((a) => /Narrowed|Lowered/.test(a))).toBe(true);
    expect(big.extra).toHaveLength(1);
    expect(big.apCost).toBe(3);
  });

  it('is deterministic: the same structure always gets the same numbers and the same checksum', () => {
    const a = balanceAst(ast([clause('river', 'repel', 'lit_beacon', 3, 2)]));
    const b = balanceAst(ast([clause('river', 'repel', 'lit_beacon', 3, 2)]));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.checksum).toBe(b.checksum);
  });

  it('asks more of a written belief than the built-in law of the same kind, never less: every non-rival law in every chapter and in generated villages', () => {
    const defs: { id: string; spec: RuleSpec }[] = [];
    for (const l of listScenarios()) for (const c of getScenarioDef(l.id).runtime.claimDefs) if (!c.rival) defs.push({ id: `${l.id}/${c.id}`, spec: c.spec });
    for (const e of catalogEntries().slice(0, 40)) for (const c of generateExpedition(e.seed).def.runtime.claimDefs) if (!c.rival) defs.push({ id: `${e.seed}/${c.id}`, spec: c.spec });
    let compared = 0;
    for (const { id, spec } of defs) {
      const o = OFFERED[spec.subject];
      if (!o?.effects.includes(spec.effect) || !o.triggers.includes(spec.trigger.kind)) continue;
      const mine = balanceAst(ast([clause(spec.subject, spec.effect, spec.trigger.kind, spec.radius, spec.intensity, spec.subject === 'bridge' && spec.trigger.kind === 'watchers' ? spec.trigger.min ?? 3 : undefined)])).spec;
      compared++;
      expect(mine.thresholds.on, `${id} support`).toBeGreaterThanOrEqual(spec.thresholds.on);
      expect(mine.thresholds.minSupporters, `${id} believers`).toBeGreaterThanOrEqual(spec.thresholds.minSupporters);
      expect(mine.thresholds.ramp, `${id} speed`).toBeLessThanOrEqual(spec.thresholds.ramp);
      expect(mine.thresholds.decay, `${id} durability`).toBeGreaterThanOrEqual(spec.thresholds.decay);
      expect(mine.side.length, `${id} downsides`).toBeGreaterThanOrEqual(Math.min(1, spec.side.length));
    }
    expect(compared).toBeGreaterThanOrEqual(9);
  });

  it('in the real villages, with the electorate cap, a written belief is still never easier than the built-in law it copies, and is never impossible', () => {
    let compared = 0;
    for (const sc of ['redbank', 'harvest', 'ashwood']) {
      const g = GameSession.create({ scenarioId: sc, seed: 1, difficulty: 'normal', inventor: true });
      for (const c of g.state.scn.claimDefs) {
        const sp = c.spec;
        if (c.rival || !OFFERED[sp.subject]?.effects.includes(sp.effect) || !OFFERED[sp.subject]?.triggers.includes(sp.trigger.kind)) continue;
        const b = buildClaim(g.state, { version: 1, clauses: [clause(sp.subject, sp.effect, sp.trigger.kind, sp.radius, sp.intensity, sp.subject === 'bridge' && sp.trigger.kind === 'watchers' ? sp.trigger.min ?? 3 : undefined)], regions: c.regions.slice() }, 'copy', { stress: false });
        expect(b.ok, `${sc}/${c.id}`).toBe(true);
        if (!b.ok) continue;
        compared++;
        const mine = b.draft.claim.spec.thresholds;
        expect(mine.on, `${sc}/${c.id} support`).toBeGreaterThanOrEqual(sp.thresholds.on);
        expect(mine.minSupporters, `${sc}/${c.id} believers`).toBeGreaterThanOrEqual(sp.thresholds.minSupporters);
        expect(mine.ramp, `${sc}/${c.id} speed`).toBeLessThanOrEqual(sp.thresholds.ramp);
        // possible at all: fewer firm believers needed than people who vote
        for (const r of b.draft.claim.regions) {
          const voters = new Set(b.draft.claim.electorate?.[r] ?? [r]);
          const n = g.state.villagers.filter((v) => voters.has(v.district)).length;
          expect(mine.minSupporters, `${sc}/${c.id} in ${r}: ${n} people`).toBeLessThanOrEqual(n);
        }
      }
    }
    expect(compared).toBeGreaterThanOrEqual(7);
  });

  it('a belief placed in a small hamlet asks for no more firm believers than the hamlet could give, and says so', () => {
    const g = GameSession.create({ scenarioId: 'ashwood', seed: 1, difficulty: 'normal', inventor: true });
    const b = buildClaim(g.state, { version: 1, clauses: [clause('wolf', 'repel', 'smoke_fire', 4, 3)], regions: ['north'] } as unknown as BeliefAST, 'The wolves will never come near the smoke.', { stress: false });
    expect(b.ok).toBe(true);
    if (b.ok) {
      const n = g.state.villagers.filter((v) => v.district === 'north').length;
      expect(b.draft.claim.spec.thresholds.minSupporters).toBeLessThanOrEqual(Math.floor(0.75 * n));
      expect(b.draft.adjustments.join(' ')).toContain('Firm believers needed lowered');
    }
  });

});

describe('a written belief cannot skip what the built-in one of its kind has to wait for', () => {
  it('a belief about the whole of something is never stronger than the strongest built-in belief of its kind, and says it was lowered', () => {
    expect(maxIntensityFor('rain', 'redirect')).toBe(2);
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, difficulty: 'normal', inventor: true });
    const b = buildClaim(g.state, { version: 1, clauses: [clause('rain', 'redirect', 'bell', 0, 3)], regions: ['river'] } as unknown as BeliefAST, 'The rain turns away from the bells.', { stress: false });
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(b.draft.claim.spec.intensity).toBe(2);
      expect(b.draft.adjustments.join(' ')).toContain('never stronger than the strongest built-in belief');
    }
    // a belief with reach (radius above 0) is priced for it instead of capped: the river keeps its full range
    const wide = buildClaim(g.state, { version: 1, clauses: [clause('river', 'repel', 'lit_beacon', 2, 3)], regions: ['east'] } as unknown as BeliefAST, 'The river turns aside from lit lanterns.', { stress: false });
    expect(wide.ok).toBe(true);
    if (wide.ok) expect(wide.draft.claim.spec.intensity).toBe(3);
  });

  it('is told from the day the chapter\'s held-back answer of the same kind unlocks, in every village; opening choices and unmatched ideas are told at once', () => {
    let held = 0;
    let starters = 0;
    for (const sc of ['redbank', 'harvest', 'ashwood']) {
      const g = GameSession.create({ scenarioId: sc, seed: 1, difficulty: 'normal', inventor: true });
      for (const c of g.state.scn.claimDefs) {
        const sp = c.spec;
        if (c.rival || c.unlockDay === undefined || !OFFERED[sp.subject]?.effects.includes(sp.effect) || !OFFERED[sp.subject]?.triggers.includes(sp.trigger.kind)) continue;
        const b = buildClaim(g.state, { version: 1, clauses: [clause(sp.subject, sp.effect, sp.trigger.kind, sp.radius, sp.intensity, sp.subject === 'bridge' && sp.trigger.kind === 'watchers' ? sp.trigger.min ?? 3 : undefined)], regions: c.regions.slice() }, 'copy', { stress: false });
        expect(b.ok, `${sc}/${c.id}`).toBe(true);
        if (!b.ok) continue;
        if (g.state.scn.starters.includes(c.id)) {
          starters++;
          expect(b.draft.claim.unlockDay, `${sc}/${c.id} is an opening choice`).toBeUndefined();
        } else {
          held++;
          expect(b.draft.claim.unlockDay, `${sc}/${c.id}`).toBe(c.unlockDay);
        }
      }
    }
    expect(held).toBeGreaterThanOrEqual(1);
    expect(starters).toBeGreaterThanOrEqual(4);
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, difficulty: 'normal', inventor: true });
    const fresh = buildClaim(g.state, { version: 1, clauses: [clause('fire', 'slow', 'always', 2, 1)], regions: ['east'] } as unknown as BeliefAST, 'Fire creeps slowly.', { stress: false });
    expect(fresh.ok).toBe(true);
    if (fresh.ok) expect(fresh.draft.claim.unlockDay).toBeUndefined();
  });

  it('a save cannot erase the wait: a written belief whose unlock day was removed or shortened is refused', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, difficulty: 'normal', inventor: true });
    const b = buildClaim(g.state, { version: 1, clauses: [clause('rain', 'redirect', 'bell', 0, 2)], regions: ['river'] } as unknown as BeliefAST, 'The rain turns aside when the bells ring.', { stress: false });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const def = b.draft.claim;
    const { claimDefs, starters } = g.state.scn;
    expect(def.unlockDay).toBe(4);
    expect(verifyCustomClaim(def, g.state.villagers, claimDefs, starters)).toBeNull();
    expect(verifyCustomClaim({ ...def, unlockDay: undefined }, g.state.villagers, claimDefs, starters)).toContain('first be told');
    expect(verifyCustomClaim({ ...def, unlockDay: 1 }, g.state.villagers, claimDefs, starters)).toContain('first be told');
  });
});
