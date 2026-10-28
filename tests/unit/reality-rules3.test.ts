import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/engine/index.ts';
import type { CreateRunOptions, RunState } from '../../src/engine/core/types.ts';
import { optionsFromState } from '../../src/engine/progress/options.ts';
import { replayRun } from '../../src/engine/core/replay.ts';
import { BOOKS } from '../../src/engine/ai/bots/reality.ts';
import { readBelief, type ReadCandidate, type Reading } from '../../src/engine/reality/read.ts';
import { realityComposeCost } from '../../src/engine/reality/cost.ts';
import { balanceReality } from '../../src/engine/reality/balance.ts';
import { realityIdeas } from '../../src/engine/reality/ideas.ts';
import { fidelity } from '../../src/engine/reality/fidelity.ts';
import { SENSES } from '../../src/engine/reality/lexicon.ts';
import { LIMITS, validateRealityAst, type Effect } from '../../src/engine/reality/ast.ts';
import { REALITY_RULES } from '../../src/engine/reality/state.ts';

/**
 * Phase 17 (docs/FUN_REVIEW_V2.md): written-belief rules 3 and what the adversarial review fixed. A ward measured from every home is
 * priced for the ground those homes cover; the composer's price is the charge, for every run; previews say what they do; a Living
 * Village is unchanged; ideas are ones the village can make real; and a model cannot swap what a sentence's change is.
 */

const run = (scenarioId: string, extra: Partial<CreateRunOptions> = {}): GameSession => {
  const g = GameSession.create({ scenarioId, seed: 1, difficulty: 'normal', mode: 'story', reality: true, ...extra });
  g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
  return g;
};
const first = (r: Reading): ReadCandidate | undefined => (r.kind === 'ambiguous' ? r.choices[0] : r.kind === 'unsupported' ? undefined : r.candidates[0]);
const draftOf = (s: RunState, text: string) => {
  const c = first(readBelief(s, text));
  if (!c?.build.ok) throw new Error(`no reading for ${text}`);
  return c.build.draft;
};

describe('written-belief rules 3', () => {
  it('is what a run made now is created under; a Living Village stays under 2 and records no rules of its own', () => {
    expect(REALITY_RULES).toBe(3);
    expect(run('redbank').state.v2?.rules).toBe(3);
    const living = GameSession.create({ scenarioId: 'redbank', seed: 1, difficulty: 'normal', mode: 'story', living: true });
    expect(living.state.v2?.rules).toBe(2);
    expect(optionsFromState(living.state).realityRules).toBeUndefined();
    expect(optionsFromState(run('redbank', { realityRules: 2 }).state).realityRules).toBe(2);
    expect(optionsFromState(run('redbank').state).realityRules).toBeUndefined();
    // a Living Village replays from its options alone (no rules recorded, none needed)
    living.act({ type: 'END_DAY' });
    const r = replayRun({ ...optionsFromState(living.state), actions: living.log });
    expect(r.rejected).toEqual([]);
    expect(r.state.v2?.rules).toBe(2);
  });

  it('prices a ward measured from every home for the ground the homes cover; one measured from the lit lanterns is unchanged', () => {
    const now = run('redbank').state;
    const before = run('redbank', { realityRules: 2 }).state;
    const every = 'Floodwater always flows away from every home.';
    const lanterns = 'The river turns away from lit lanterns.';
    const w3 = draftOf(now, every);
    const w2 = draftOf(before, every);
    const l3 = draftOf(now, lanterns);
    const l2 = draftOf(before, lanterns);
    // rules 2 priced the eight homes of Eastbank as one circle: the very ward rules 3 writes would have been a moderate belief there
    const asOneCircle = balanceReality(w3.claim.reality!.ast, { rules: 2 });
    expect(asOneCircle.power).toBeLessThan(30);
    expect(w3.power).toBeGreaterThan(2 * asOneCircle.power);
    expect(w3.power).toBeGreaterThan(w2.power);
    // rules 3: the ground of all eight, a strong belief that asks far more of the village than the lantern ward, which is unchanged
    expect(w3.power).toBeGreaterThan(l3.power);
    expect(w3.rating).toBe('strong');
    expect(w3.cost.compose).toBe(3);
    expect(w3.support.percent).toBeGreaterThanOrEqual(75);
    expect(w3.support.believers).toBeGreaterThan(l3.support.believers);
    expect([l3.power, l3.support, l3.cost.compose]).toEqual([l2.power, l2.support, l2.cost.compose]);
  });

  it('charges exactly the price the composer shows, under every rules version (MCP reports the same number)', () => {
    let checked = 0;
    for (const [scenarioId, book] of Object.entries(BOOKS))
      for (const realityRules of [1, 2, 3])
        for (const lab of [false, true]) {
          const g = run(scenarioId, { realityRules, ...(lab ? { realityLab: true, reality: false } : {}) });
          for (const text of Object.values(book)) {
            const c = first(readBelief(g.state, text));
            if (!c?.build.ok) continue;
            const d = c.build.draft;
            expect(d.cost.compose, `${scenarioId} rules ${realityRules} ${text}`).toBe(realityComposeCost(g.state, d.claim.reality!.ast));
            const h = new GameSession(JSON.parse(JSON.stringify(g.state)));
            h.state.ap = 9;
            expect(h.act({ type: 'COMPOSE', claim: d.claim }).ok).toBe(true);
            expect(9 - h.state.ap, `${scenarioId} rules ${realityRules} ${text}`).toBe(d.cost.compose);
            checked++;
          }
        }
    expect(checked).toBeGreaterThan(90);
  });

  it('says "Every night" and "any home" in what it writes into the village; older runs keep the words they were written with', () => {
    const text = 'Floodwater always flows away from every home.';
    const now = draftOf(run('redbank').state, text);
    const before = draftOf(run('redbank', { realityRules: 2 }).state, text);
    expect(now.mechanics[0]).toMatch(/^Every night: floodwater within \d tiles? of any home in Eastbank/);
    expect(now.claim.benefit).toBe(now.mechanics.join(' '));
    expect(before.mechanics[0]).toMatch(/^When always: floodwater within \d tiles? of the home in Eastbank/);
    // and the reach it names is the reach it acts with (a narrowed ward says the narrowed radius)
    const e = now.claim.reality!.ast.clauses[0].effect as { radius: number };
    expect(now.mechanics[0]).toContain(`within ${e.radius} tiles of any home`);
  });
});

describe('ideas the composer offers', () => {
  it('are beliefs this village can make real: understood and buildable in every chapter, and none about a bell Ashwood lacks', () => {
    for (const scenarioId of ['redbank', 'harvest', 'ashwood']) {
      const s = run(scenarioId).state;
      const ideas = realityIdeas(s);
      expect(ideas.length, scenarioId).toBeGreaterThanOrEqual(3);
      for (const text of ideas) {
        const r = readBelief(s, text);
        expect(r.kind, `${scenarioId}: ${text}`).toBe('supported');
        expect(first(r)?.build.ok).toBe(true);
      }
      if (scenarioId === 'ashwood') expect(ideas.join(' ')).not.toMatch(/bell|lantern/i);
    }
  });
});

describe('a model reading keeps the change the words name', () => {
  it('drops or flags nearly every reading that swaps the change for another one on the same thing; honest readings pass', () => {
    const corpus = JSON.parse(readFileSync(new URL('../fixtures/reality-corpus-1.json', import.meta.url), 'utf8')) as { cases: { scenario: string; text: string }[] };
    const states = new Map<string, RunState>();
    const stateOf = (id: string) => states.get(id) ?? states.set(id, run(id).state).get(id)!;
    let honest = 0;
    let honestKept = 0;
    let swaps = 0;
    let swapsTrusted = 0;
    for (const c of corpus.cases) {
      const s = stateOf(c.scenario);
      const r = readBelief(s, c.text);
      for (const cand of r.kind === 'ambiguous' ? r.choices : r.kind === 'unsupported' ? [] : r.candidates) {
        honest++;
        // (one in-sample reading, "The orchard hungers for thunder.", assumes the bell as its power and has always been dropped for it)
        const own = fidelity(s, c.text, cand.ast, cand.map);
        if (own.ok || !own.notes.some((n) => /does not say|do not say|other way round/.test(n))) honestKept++;
        cand.ast.clauses.forEach((cl, i) => {
          for (const op of new Set(SENSES.filter((x) => x.kinds.includes(cl.target.kind) && x.op !== cl.effect.op && !x.ask && !x.onlyNegated && !x.toward).map((x) => x.op))) {
            const se = SENSES.find((x) => x.op === op && x.kinds.includes(cl.target.kind) && !x.ask && !x.onlyNegated && !x.toward)!;
            const e: Record<string, unknown> = { op, ...se.params, [se.mag]: se.mag === 'delta' ? 2 * se.dir : 2 };
            if (op === 'REDIRECT_FLOW' || op === 'MOVE_AWAY' || op === 'MOVE_TOWARD') e.radius = 2;
            const ast = structuredClone(cand.ast);
            ast.clauses[i].effect = e as unknown as Effect;
            const v = validateRealityAst(ast, LIMITS);
            if (!v.ok) continue;
            swaps++;
            const f = fidelity(s, c.text, v.ast, cand.map);
            if (f.ok && f.confident) swapsTrusted++;
          }
        });
      }
    }
    expect(honestKept).toBe(honest);
    expect(swaps).toBeGreaterThan(100);
    // before phase 17 every one of these passed at full confidence; what may remain is a word the game itself reads two ways ("spared")
    expect(swapsTrusted / swaps).toBeLessThan(0.05);
  });
});
