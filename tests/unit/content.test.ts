import { describe, expect, it } from 'vitest';
import { getScenarioDef, listScenarios } from '../../src/engine/index.ts';
import { validateScenario } from '../../src/engine/content/validate.ts';
import { COMPAT, RULES, TRIGGERS, validateSpec } from '../../src/engine/laws/rules.ts';
import type { RuleSpec } from '../../src/engine/index.ts';

describe('scenario content validation', () => {
  for (const sc of listScenarios()) {
    it(`${sc.id} is valid`, () => {
      expect(validateScenario(getScenarioDef(sc.id))).toEqual([]);
    });
  }
  it('catches dangling references', () => {
    const def = structuredClone(getScenarioDef('redbank'));
    def.villagers[0].home = 'nowhere';
    def.edges.push({ a: 'ivo', b: 'ghost', ab: 10, ba: 10, rate: 0.5, kind: 'friend' });
    def.runtime.claimDefs[0].ritual = 'missing';
    const issues = validateScenario(def);
    expect(issues.join('\n')).toMatch(/home nowhere missing/);
    expect(issues.join('\n')).toMatch(/unknown endpoint/);
    expect(issues.join('\n')).toMatch(/ritual missing missing/);
  });
});

describe('rule vocabulary', () => {
  it('every authored rule validates', () => {
    for (const r of Object.values(RULES)) expect(validateSpec(r), r.id).toEqual([]);
  });
  it('rejects nonsensical subject/effect/trigger combinations', () => {
    const base = RULES.river_fears_fire;
    const bad = (patch: Partial<RuleSpec>) => validateSpec({ ...base, ...patch }).length > 0;
    expect(bad({ subject: 'bridge', effect: 'grow' })).toBe(true);
    expect(bad({ subject: 'rain', effect: 'strengthen' })).toBe(true);
    expect(bad({ trigger: { kind: 'night' } })).toBe(true);
    expect(bad({ radius: 99 })).toBe(true);
    expect(bad({ intensity: 9 })).toBe(true);
    expect(bad({ side: ['teleport' as never] })).toBe(true);
    expect(bad({ thresholds: { ...base.thresholds, off: 0.9, on: 0.5 } })).toBe(true);
  });
  it('every compatible pair has at least one valid trigger', () => {
    for (const s of Object.keys(COMPAT)) expect(TRIGGERS[s as keyof typeof TRIGGERS].length).toBeGreaterThan(0);
  });
});
