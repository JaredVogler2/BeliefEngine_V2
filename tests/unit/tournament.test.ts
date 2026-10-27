import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { policyStats, cohortSummary, comparePaired, parseCsv, quantile, signTest, toCsv, wilson, type Row } from '../../scripts/lib/tournament-core.ts';
import { MANDATORY_POLICIES, ORACLE_ENTRY, claimRelevance, playableClaims, policyById } from '../../src/engine/ai/bots/generic.ts';
import { playInstrumented } from '../../src/engine/ai/bots/telemetry.ts';
import { createRun, replayRun } from '../../src/engine/index.ts';
import type { Action } from '../../src/engine/index.ts';

function row(policy: string, seed: number, scenarioId = 'redbank'): Row {
  const { t } = playInstrumented(policyById(policy), { scenarioId, seed });
  return { ...t, cohort: scenarioId, ms: 1 };
}

describe('tournament statistics', () => {
  it('Wilson interval brackets the observed rate and shrinks with n', () => {
    const [lo, hi] = wilson(50, 100);
    expect(lo).toBeLessThan(50);
    expect(hi).toBeGreaterThan(50);
    const [lo2, hi2] = wilson(500, 1000);
    expect(hi2 - lo2).toBeLessThan(hi - lo);
    expect(wilson(0, 0)).toEqual([0, 0]);
    expect(wilson(10, 10)[1]).toBe(100);
  });
  it('the sign test is exact on small counts and symmetric', () => {
    expect(signTest(0, 0)).toBe(1);
    expect(signTest(5, 5)).toBe(1);
    expect(signTest(10, 0)).toBeCloseTo(2 / 1024, 5);
    expect(signTest(3, 12)).toBe(signTest(12, 3));
    expect(signTest(30, 5)).toBeLessThan(0.001);
  });
  it('quantiles are order statistics', () => {
    expect(quantile([5, 1, 3], 0.5)).toBe(3);
    expect(quantile([], 0.5)).toBe(0);
    expect(quantile([1, 2, 3, 4, 100], 1)).toBe(100);
  });
});

describe('the eight mandatory policies', () => {
  it('are all present, named as the brief names them, and use only the public session API', () => {
    expect(MANDATORY_POLICIES.map((p) => p.id)).toEqual(['noop', 'random', 'greedy', 'broadcaster', 'evidence-first', 'bridge-builder', 'threat-aware', 'exploit-seeker']);
    expect(ORACLE_ENTRY.privileged).toBe(true);
    for (const p of MANDATORY_POLICIES) expect(p.make().name).toBe(p.id);
    const src = readFileSync(new URL('../../src/engine/ai/bots/generic.ts', import.meta.url), 'utf8');
    // scenario-agnostic: no authored claim, landmark or villager id appears in the policy code
    for (const banned of ['river_fears_fire', 'bridge_stands_watched', 'moonlight', 'wolves_fear', "'ivo'", "'osric'", "'br'"]) expect(src.includes(banned), `generic.ts must not mention ${banned}`).toBe(false);
  });
  it('read only what a player can read: claims, relevance and forecast', () => {
    for (const sc of ['redbank', 'harvest', 'ashwood']) {
      const s = createRun({ scenarioId: sc, seed: 1 });
      const claims = playableClaims(s);
      expect(claims.length, sc).toBeGreaterThan(0);
      for (const c of claims) expect(claimRelevance(s, c)).toBeGreaterThan(0);
    }
  });
  it('produce deterministic, strategically different play on the same seed', () => {
    const a = row('threat-aware', 3);
    const b = row('threat-aware', 3);
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.eventHash).toBe(b.eventHash);
    const mixes = ['greedy', 'broadcaster', 'evidence-first', 'bridge-builder', 'threat-aware'].map((p) => JSON.stringify(row(p, 3).actionMix));
    expect(new Set(mixes).size).toBeGreaterThanOrEqual(4);
  });
  it('the no-op control loses and spends nothing; every policy terminates', () => {
    for (const sc of ['redbank', 'harvest', 'ashwood']) {
      const idle = row('noop', 2, sc);
      expect(idle.result).toBe('defeat');
      expect(idle.apSpent).toBe(0);
      for (const p of MANDATORY_POLICIES) expect(row(p.id, 2, sc).result, `${p.id} on ${sc}`).not.toBe('timeout');
    }
  }, 60_000);
});

describe('telemetry and aggregation', () => {
  const rows = ['noop', 'random', 'greedy', 'evidence-first', 'threat-aware'].flatMap((p) => [1, 2, 3, 4].map((s) => row(p, s)));

  it('records the curve, laws, side effects, causal clarity and hashes the brief asks for', () => {
    for (const r of rows) {
      expect(r.curve.length).toBeGreaterThanOrEqual(1);
      expect(r.curve[0].day).toBe(1);
      expect(r.endDay).toBeGreaterThanOrEqual(1);
      expect(r.stateHash).toMatch(/^[0-9a-f]{8,}$/);
      expect(r.apUnspent).toBeGreaterThanOrEqual(0);
      expect(r.causal.explained).toBeLessThanOrEqual(r.causal.important);
      expect(r.population).toBeGreaterThan(5);
    }
    expect(rows.some((r) => r.laws.some((l) => l.day !== null))).toBe(true);
  });

  it('summarises per policy and per cohort, with paired pair statistics', () => {
    const s = policyStats(rows.filter((r) => r.policy === 'threat-aware'));
    expect(s.n).toBe(4);
    expect(s.winRate).toBeGreaterThanOrEqual(0);
    expect(s.ci[0]).toBeLessThanOrEqual(s.winRate);
    expect(s.ci[1]).toBeGreaterThanOrEqual(s.winRate);
    const c = cohortSummary('redbank', rows, 4);
    expect(Object.keys(c.policies).sort()).toEqual(['evidence-first', 'greedy', 'noop', 'random', 'threat-aware']);
    expect(c.pairs.length).toBe(3); // greedy, evidence-first, threat-aware
    for (const p of c.pairs) expect(p.both + p.aOnly + p.bOnly + p.neither).toBe(4);
    expect(c.verdicts.some((v) => /no-op/i.test(v.text) && v.level === 'ok')).toBe(true);
  });

  it('CSV round-trips the fields a paired comparison needs, and comparePaired counts wins gained and lost', () => {
    const csv = toCsv(rows);
    const back = parseCsv(csv);
    expect(back.length).toBe(rows.length);
    expect(back[0].policy).toBe(rows[0].policy);
    const after = back.map((r) => (r.policy === 'greedy' && r.seed === 1 ? { ...r, result: r.result === 'victory' ? 'defeat' : 'victory' } : r));
    const diffs = comparePaired(back, after);
    const g = diffs.find((d) => d.policy === 'greedy')!;
    expect(g.gained + g.lost).toBe(1);
    expect(diffs.filter((d) => d.policy !== 'greedy').every((d) => d.gained === 0 && d.lost === 0 && d.p === 1)).toBe(true);
  });
});

describe('saved regression traces', () => {
  const file = new URL('../fixtures/tournament-traces.json', import.meta.url);
  it.skipIf(!existsSync(file))('every saved winning and losing trace replays to the same result and hashes', () => {
    const fx = JSON.parse(readFileSync(file, 'utf8')) as {
      traces: { scenarioId: string; seed: number; difficulty: 'story' | 'normal' | 'hard'; policy: string; kind: string; result: string; endDay: number; score: number; stateHash: string; eventHash: string; actions: Action[] }[];
    };
    expect(fx.traces.length).toBeGreaterThanOrEqual(10);
    expect(new Set(fx.traces.map((t) => t.kind))).toEqual(new Set(['victory', 'defeat']));
    for (const t of fx.traces) {
      const r = replayRun({ scenarioId: t.scenarioId, seed: t.seed, difficulty: t.difficulty, actions: t.actions });
      expect(r.rejected, `${t.scenarioId}/${t.policy}/${t.seed}`).toEqual([]);
      expect(r.state.outcome?.result, `${t.scenarioId}/${t.policy}/${t.seed}`).toBe(t.result);
      expect(r.state.outcome?.score).toBe(t.score);
      expect(r.stateHash, `${t.scenarioId}/${t.policy}/${t.seed}`).toBe(t.stateHash);
      expect(r.eventHash).toBe(t.eventHash);
    }
  }, 60_000);
});
