import { describe, expect, it } from 'vitest';
import { catalogEntries, catalogInfo, dailySeed, generateExpedition, isVerifiedSeed, pickVerified } from '../../src/engine/index.ts';
import { runPolicy } from '../../src/engine/ai/bots/run.ts';
import { witnessPolicies } from '../../src/engine/gen/witness.ts';
import { expeditionId } from '../../src/engine/index.ts';

describe('verified village catalog', () => {
  const entries = catalogEntries();

  it('exists, is large, and covers every biome', () => {
    expect(entries.length).toBeGreaterThan(300);
    expect(new Set(entries.map((e) => e.biome))).toEqual(new Set(['river', 'drought', 'wolves']));
    expect(catalogInfo().verified).toBe(entries.length);
    expect(catalogInfo().tried).toBeGreaterThanOrEqual(entries.length);
  });

  it('every entry names the planners that won it and matches what the generator builds now', () => {
    for (const e of entries.filter((_, i) => i % 11 === 0)) {
      const x = generateExpedition(e.seed);
      expect(x.bp.biome, `seed ${e.seed}`).toBe(e.biome);
      expect(x.bp.modifiers, `seed ${e.seed}`).toEqual(e.modifiers);
      expect(x.def.villagers.length).toBe(e.population);
      expect(e.wins.length).toBeGreaterThan(0);
    }
  });

  it('a sample of catalog entries is still won by the planner recorded for it (guards against a stale catalog)', () => {
    const pick = [0, 1, 2].flatMap((k) => ['river', 'drought', 'wolves'].map((b) => entries.filter((e) => e.biome === b)[k * 17 + 3]));
    for (const e of pick) {
      const x = generateExpedition(e.seed);
      const policy = witnessPolicies(x.bp, x.def).find((p) => p.name === e.wins[0])!;
      expect(policy, `planner ${e.wins[0]} for seed ${e.seed}`).toBeTruthy();
      const r = runPolicy(policy, { scenarioId: expeditionId(e.seed), seed: e.seed });
      expect(r.result, `seed ${e.seed} (${e.biome}) via ${policy.name}`).toBe('victory');
    }
  });

  it('the daily village is always a verified one and is stable for a date', () => {
    for (const d of [20261027, 20261028, 20270101, 20280229]) {
      expect(isVerifiedSeed(dailySeed(d))).toBe(true);
      expect(catalogEntries().find((e) => e.seed === dailySeed(d))!.wins.length).toBeGreaterThanOrEqual(2);
      expect(dailySeed(d)).toBe(dailySeed(d));
    }
    expect(new Set(Array.from({ length: 60 }, (_, i) => dailySeed(20261001 + i))).size).toBeGreaterThan(40);
  });

  it('"another village" avoids villages already played and is deterministic for fixed entropy', () => {
    const a = pickVerified(12345);
    expect(pickVerified(12345)).toBe(a);
    expect(pickVerified(12345, [a])).not.toBe(a);
    expect(isVerifiedSeed(pickVerified(99, [], 'wolves'))).toBe(true);
    expect(generateExpedition(pickVerified(99, [], 'wolves')).bp.biome).toBe('wolves');
  });
});
