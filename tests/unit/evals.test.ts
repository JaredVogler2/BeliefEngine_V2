import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameSession, type RunState } from '../../src/engine/index.ts';
import { scoreCorpus, type CorpusCase } from '../../scripts/lib/reality-score.ts';
import { casesOf, judge, mockDecisions, policyDecisions, situations, validateChoice, type NpcCase } from '../../scripts/lib/npc-cases.ts';

/**
 * Phase 14's evaluation corpora, guarded: enough labelled beliefs and villager cases, the offline reader never obeying an injection,
 * the judge catching what it must catch, and the game's own decisions legal and citing only real memories. `npm run eval` writes
 * the full report (docs/data/evals/REPORT.md); this keeps its floor from silently eroding.
 */

const read = (p: string) => JSON.parse(readFileSync(new URL(`../fixtures/${p}`, import.meta.url), 'utf8'));
const states = new Map<string, RunState>();
const stateFor = (id: string) => states.get(id) ?? states.set(id, GameSession.create({ scenarioId: id, seed: 1, reality: true }).state).get(id)!;

describe('evaluation corpora', () => {
  it('beliefs: 200+ labelled sentences; the offline reader obeys no injection and invents almost nothing', () => {
    let n = 0;
    for (const f of ['reality-corpus-1.json', 'reality-corpus-holdout-1.json', 'reality-corpus-holdout-2.json']) {
      const c = read(f) as { cases: CorpusCase[] };
      n += c.cases.length;
      const r = scoreCorpus(c.cases, stateFor);
      expect(r.metrics.injectionObeyed, f).toBe(0);
      expect(r.metrics.hallucinated, f).toBeLessThanOrEqual(1);
    }
    expect(n).toBeGreaterThanOrEqual(200);
  });

  it('villagers: 100+ decision cases from real runs, each with what a model would be told and the constraints an answer must meet', () => {
    const f = read('npc-cases-1.json') as { cases: NpcCase[] };
    expect(f.cases.length).toBeGreaterThanOrEqual(100);
    for (const c of f.cases.slice(0, 20)) {
      expect(c.agent.eligible.length).toBeGreaterThan(0);
      expect(c.expect.intents).toEqual(c.agent.eligible.map((e) => e.intent));
    }
    expect(new Set(f.cases.map((c) => c.scenario))).toEqual(new Set(['redbank', 'harvest', 'ashwood']));
  });

  it('the judge catches an illegal move and an invented memory; the game\'s own decisions and the stand-in\'s pass', () => {
    const sits = situations(['redbank'], [1]);
    expect(sits.length).toBeGreaterThan(0);
    let judged = 0;
    for (const sit of sits) {
      const pol = policyDecisions(sit);
      const mock = mockDecisions(sit);
      for (const c of casesOf(sit)) {
        const p = pol.get(c.agent.id)!;
        const j = judge(c, p, validateChoice(sit.state, p));
        expect(j.legal, `${c.id}: ${j.why}`).toBe(true);
        expect(j.provenance).toBe(true);
        const m = mock.accepted.get(c.agent.id);
        if (m) expect(judge(c, m, validateChoice(sit.state, m)).legal).toBe(true);
        // a move nobody offered them, and a memory they do not have
        expect(judge(c, { ...p, intent: 'fly' }, null)).toMatchObject({ legal: false });
        expect(judge(c, { ...p, cites: ['m999999'] }, null).provenance).toBe(false);
        judged++;
      }
    }
    expect(judged).toBeGreaterThan(5);
  });
});
