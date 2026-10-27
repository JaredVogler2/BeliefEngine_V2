import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameSession, OFFERED, buildRealityClaim, getScenarioDef, listScenarios, stateHash } from '../../src/engine/index.ts';
import { LAB_LIMITS, beliefHash, direction, mechanicsHash, validateRealityAst, type RealityAst } from '../../src/engine/reality/ast.ts';
import { balanceReality, beliefPower, clausePower } from '../../src/engine/reality/balance.ts';
import { groundAst } from '../../src/engine/reality/ground.ts';
import { KINDS } from '../../src/engine/reality/ontology.ts';
import { EXECUTABLE_OPS, OPERATORS } from '../../src/engine/reality/operators.ts';
import { realityUnlockDay } from '../../src/engine/reality/build.ts';
import { specPower } from '../../src/engine/laws/rules.ts';
import { astFromV1, clauseFromSpec } from '../../src/engine/reality/v1.ts';
import { bellRainFire, chickensFly, wetStoneLight } from '../helpers/reality.ts';

/** Phase 04: the typed, data-only belief language (AST v2), its operator library, balance and grounding. */

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const reality = (scenarioId = 'redbank') => GameSession.create({ scenarioId, seed: 1, reality: true }).state;

describe('AST v2 validation', () => {
  it('accepts the three proof beliefs of the program, one of them a two-clause compound', () => {
    for (const ast of [chickensFly(), wetStoneLight(), bellRainFire()]) expect(validateRealityAst(ast)).toEqual({ ok: true, ast });
    expect(bellRainFire().clauses).toHaveLength(2);
  });

  it('refuses unknown fields, wrong types, out-of-range numbers and non-finite values anywhere', () => {
    const bad: [string, (a: RealityAst) => void][] = [
      ['extra top field', (a) => Object.assign(a, { power: 999 })],
      ['extra clause field', (a) => Object.assign(a.clauses[0], { code: 'x' })],
      ['extra effect field', (a) => Object.assign(a.clauses[0].effect, { strength: 9 })],
      ['magnitude 9', (a) => Object.assign(a.clauses[0].effect, { magnitude: 9 })],
      ['magnitude NaN', (a) => Object.assign(a.clauses[0].effect, { magnitude: Number.NaN })],
      ['magnitude Infinity', (a) => Object.assign(a.clauses[0].effect, { magnitude: Infinity })],
      ['radius 50', (a) => Object.assign(a.clauses[0].target, { near: { anchor: 'belltower', radius: 50 } })],
      ['unknown anchor', (a) => Object.assign(a.clauses[0].target, { near: { anchor: 'castle', radius: 2 } })],
      ['unknown target', (a) => Object.assign(a.clauses[0].target, { kind: 'dragon' })],
      ['unknown trigger', (a) => Object.assign(a.clauses[0], { when: { event: 'eclipse', min: null } })],
      ['bad tag', (a) => Object.assign(a.clauses[0].target, { tags: ['invisible'] })],
      ['no regions', (a) => Object.assign(a, { regions: [] })],
      ['duplicate regions', (a) => Object.assign(a, { regions: ['east', 'east'] })],
      ['region injection', (a) => Object.assign(a, { regions: ['east; DROP TABLE'] })],
      ['text too long', (a) => Object.assign(a, { text: 'x'.repeat(241) })],
      ['wrong version', (a) => Object.assign(a, { v: 3 })],
      ['wrong language', (a) => Object.assign(a, { lang: 'reality-9' })],
      ['bad duration', (a) => Object.assign(a.clauses[0], { duration: 'forever' })],
      ['bad clause id', (a) => Object.assign(a.clauses[0], { id: 'x1' })],
      ['bad provenance', (a) => Object.assign(a, { source: { reader: 'telepathy', model: null, prompt: null, id: null } })],
    ];
    for (const [name, mutate] of bad) {
      const a = clone(chickensFly());
      mutate(a);
      expect(validateRealityAst(a).ok, name).toBe(false);
    }
  });

  it('bounds composition: two clauses in balanced play (three in Reality Lab), two levels of AND/OR/NOT', () => {
    const three = clone(bellRainFire());
    three.clauses.push({ ...clone(chickensFly().clauses[0]), id: 'c3' });
    expect(validateRealityAst(three).ok).toBe(false);
    expect(validateRealityAst(three, LAB_LIMITS).ok).toBe(true);
    const deep = clone(chickensFly());
    deep.clauses[0].when = { all: [{ event: 'bell', min: null }, { any: [{ event: 'rain', min: null }, { not: { event: 'night', min: null } }] }] };
    const r = validateRealityAst(deep);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === 'DEPTH')).toBe(true);
    const ok = clone(chickensFly());
    ok.clauses[0].when = { all: [{ event: 'bell', min: null }, { not: { event: 'rain', min: null } }] };
    expect(validateRealityAst(ok).ok).toBe(true);
  });

  it('refuses operators that are named but not executable, and operators on targets they cannot act on', () => {
    const t = clone(wetStoneLight());
    t.clauses[0].effect = { op: 'TRANSFORM_MATERIAL', into: 'bread' };
    const r = validateRealityAst(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain('OP_NOT_EXECUTABLE');
    const wrong = clone(chickensFly());
    wrong.clauses[0].target.kind = 'bridge';
    const w = validateRealityAst(wrong);
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.issues.map((i) => i.code)).toContain('TARGET');
    const ghost = clone(chickensFly());
    (ghost.clauses[0].effect as { op: string }).op = 'REVERSE_TIME';
    expect(validateRealityAst(ghost).ok).toBe(false);
  });

  it('refuses a belief whose clauses contradict or repeat each other', () => {
    const a = clone(wetStoneLight());
    a.clauses.push({ ...clone(a.clauses[0]), id: 'c2', effect: { op: 'SET_MATERIAL_PROPERTY', property: 'mass', delta: 2 } });
    const r = validateRealityAst(a);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0].code).toBe('CONTRADICTION');
    expect(direction({ op: 'SET_MATERIAL_PROPERTY', property: 'mass', delta: -2 })).toBe(-1);
    expect(direction({ op: 'REDIRECT_FLOW', mode: 'attract', magnitude: 1, radius: 1 })).toBe(-1);
  });

  it('hashes mechanics apart from wording, and wording plus provenance apart from mechanics', () => {
    const a = chickensFly();
    const b = { ...clone(a), text: 'When the bells sound, the hens take to the air.', regions: ['east'] };
    expect(mechanicsHash(a)).toBe(mechanicsHash(b));
    expect(beliefHash(a)).not.toBe(beliefHash(b));
    const c = clone(a);
    (c.clauses[0].effect as { magnitude: number }).magnitude = 3;
    expect(mechanicsHash(c)).not.toBe(mechanicsHash(a));
  });
});

describe('operators and the world vocabulary', () => {
  it('has at least twelve executable operators spanning the six mandatory families', () => {
    expect(EXECUTABLE_OPS.length).toBeGreaterThanOrEqual(12);
    const families = new Set(EXECUTABLE_OPS.map((o) => OPERATORS[o].family));
    for (const f of ['dynamics', 'hydrology', 'materials', 'growth', 'thermal', 'structure', 'behavior']) expect(families.has(f as never), f).toBe(true);
    for (const o of EXECUTABLE_OPS) {
      const d = OPERATORS[o];
      expect(d.targets.length, o).toBeGreaterThan(0);
      expect(d.downside.length, `${o} must state its downside`).toBeGreaterThan(10);
      expect(d.weight).toBeGreaterThan(0);
    }
    expect(OPERATORS.TRANSFORM_MATERIAL.executes).toBe(false);
    expect(OPERATORS.MODIFY_STRUCTURE_CONNECTION.executes).toBe(false);
  });

  it('marks what the world really holds, including two new kinds that only Generative Reality runs contain', () => {
    expect(KINDS.chicken.support).toBe('simulated');
    expect(KINDS.stone.support).toBe('simulated');
    expect(KINDS.chicken.needs).toBe('reality');
    const s = reality();
    expect(s.v2!.chickens.length).toBeGreaterThan(8);
    expect(s.v2!.stones.length).toBeGreaterThanOrEqual(4);
    expect(GameSession.create({ scenarioId: 'redbank', seed: 1 }).state.v2).toBeUndefined();
  });
});

describe('balance', () => {
  it('prices a lantern flood belief exactly like V1 prices the same law', () => {
    const v1 = specPower({ radius: 3, intensity: 3, trigger: { kind: 'lit_beacon' } });
    const v2 = clausePower({ id: 'c1', when: { event: 'lantern', min: null }, where: null, target: { kind: 'water', near: null, tags: [], region: null }, effect: { op: 'REDIRECT_FLOW', mode: 'repel', magnitude: 3, radius: 3 }, duration: 'night' }, 1);
    expect(v2).toBeCloseTo(v1, 9);
  });

  it('derives every threshold and cost from power, and asks more of stronger beliefs', () => {
    const weak = balanceReality(chickensFly('east', 1));
    const strong = balanceReality(bellRainFire());
    expect(strong.power).toBeGreaterThan(weak.power);
    expect(strong.thresholds.on).toBeGreaterThanOrEqual(weak.thresholds.on);
    expect(strong.thresholds.minSupporters).toBeGreaterThanOrEqual(weak.thresholds.minSupporters);
    expect(strong.apCost).toBeGreaterThanOrEqual(weak.apCost);
    expect(weak.thresholds.on).toBeGreaterThanOrEqual(0.6);
  });

  it('narrows a belief that is too large, and says how', () => {
    const big = clone(chickensFly('east', 3));
    big.clauses[0] = { ...big.clauses[0], when: { event: 'always', min: null }, target: { kind: 'chicken', near: { anchor: 'belltower', radius: 4 }, tags: [], region: null }, duration: 'while_active' };
    expect(beliefPower(big)).toBeGreaterThan(60);
    const b = balanceReality(big);
    expect(b.power).toBeLessThanOrEqual(60);
    expect(b.adjustments.length).toBeGreaterThan(0);
    expect(balanceReality(big, { lab: true }).power).toBeGreaterThan(60);
  });
});

describe('grounding in the actual village', () => {
  it('builds the proof beliefs in Redbank, and refuses them outside Generative Reality runs', () => {
    const s = reality();
    for (const ast of [chickensFly(), wetStoneLight(), bellRainFire()]) {
      const b = buildRealityClaim(s, ast);
      expect(b.ok, ast.text).toBe(true);
    }
    const classic = GameSession.create({ scenarioId: 'redbank', seed: 1 }).state;
    expect(buildRealityClaim(classic, chickensFly())).toMatchObject({ ok: false, code: 'NOT_REALITY_RUN' });
  });

  it('refuses what the village does not contain, with the reason', () => {
    const ash = reality('ashwood');
    const g = groundAst(ash, chickensFly('north'));
    expect(g.ok).toBe(false);
    expect(g.issues.join()).toMatch(/no bell tower/);
    const red = reality();
    const grow = clone(chickensFly());
    grow.clauses[0] = { ...grow.clauses[0], target: { kind: 'field', near: null, tags: [], region: null }, effect: { op: 'GROW_ENTITY', magnitude: 2 } };
    expect(groundAst(red, grow).issues.join()).toMatch(/not grown night by night/);
    expect(groundAst(reality('harvest'), { ...grow, regions: ['valley'] }).ok).toBe(true);
    const wolves = clone(chickensFly());
    wolves.clauses[0] = { ...wolves.clauses[0], target: { kind: 'wolf', near: null, tags: [], region: null }, effect: { op: 'MOVE_AWAY', magnitude: 2, radius: 2 } };
    expect(groundAst(red, wolves).issues.join()).toMatch(/no wolves/);
    expect(groundAst(red, { ...chickensFly(), regions: ['narnia'] }).issues.join()).toMatch(/no region "narnia"/);
    // beliefs act where their believers live: the bridge stands in the river commons, not in Eastbank, and Westbank has no lanterns
    const bridge = clone(chickensFly());
    bridge.clauses[0].target.near = { anchor: 'bridge', radius: 2 };
    expect(groundAst(red, bridge).issues.join()).toMatch(/no bridge in Eastbank to measure from/);
    expect(groundAst(red, { ...bridge, regions: ['river'] }).ok).toBe(true);
    expect(groundAst(red, { ...wetStoneLight('west') }).issues.join()).toMatch(/no lanterns in Westbank/);
    const either = clone(wetStoneLight('west'));
    either.clauses[0] = { ...either.clauses[0], when: { any: [{ event: 'lantern', min: null }, { event: 'bell', min: null }] }, target: { kind: 'stone', near: null, tags: [], region: null } };
    expect(groundAst(red, either).issues.join()).not.toMatch(/lanterns/);
  });

  it('keeps the chapter\'s pacing: a written rain belief waits for the day the chapter\'s own rain answer unlocks', () => {
    const s = reality();
    expect(realityUnlockDay(s, bellRainFire())).toBe(4);
    expect(realityUnlockDay(s, chickensFly())).toBeUndefined();
    const b = buildRealityClaim(s, bellRainFire());
    expect(b.ok && b.draft.claim.unlockDay).toBe(4);
    expect(b.ok && b.draft.notes.join()).toMatch(/day 4/);
  });

  it('gives the honest preview: mechanics with units, what it needs, risks, omissions, support and cost', () => {
    const b = buildRealityClaim(reality(), bellRainFire());
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const d = b.draft;
    expect(d.mechanics).toHaveLength(2);
    expect(d.mechanics[0]).toMatch(/When the bell is rung/);
    expect(d.mechanics[1]).toMatch(/fire damage cut by up to 50%/);
    expect(d.requires.join()).toMatch(/rings the bell/);
    expect(d.risks.join()).toMatch(/moved, not made/);
    expect(d.omitted[0].text).toBe('the orchard');
    expect(d.support.percent).toBeGreaterThanOrEqual(60);
    expect(d.cost.compose).toBeGreaterThanOrEqual(1);
    expect(stateHash(reality())).toBe(stateHash(reality()));
  });
});

describe('V1 laws in the V2 language', () => {
  it('reads every authored and rival claim of every chapter as a valid AST v2 with nothing left untranslated', () => {
    let n = 0;
    for (const l of listScenarios())
      for (const def of getScenarioDef(l.id).runtime.claimDefs) {
        const t = astFromV1(def);
        expect(t, def.id).not.toBeNull();
        if (!t) continue;
        expect(validateRealityAst(t.ast, LAB_LIMITS).ok, def.id).toBe(true);
        expect(t.untranslated, def.id).toEqual([]);
        expect(t.ast.source.reader).toBe('legacy-v1');
        expect(t.ast.author).toBe(def.rival ? 'npc' : 'scenario');
        expect(t.ast.omitted.length).toBe(def.spec.side.length);
        n++;
      }
    expect(n).toBeGreaterThanOrEqual(11);
  });

  it('reads every subject, effect and trigger the V1 composer offers, and nothing it does not', () => {
    const base = getScenarioDef('redbank').runtime.claimDefs[0].spec;
    for (const [subject, o] of Object.entries(OFFERED))
      for (const effect of o.effects)
        for (const kind of o.triggers) {
          const spec = { ...base, subject, effect, trigger: { kind, min: kind === 'watchers' ? 2 : undefined }, radius: 2, intensity: 2 } as typeof base;
          const c = clauseFromSpec(spec, 'c1');
          expect(c, `${subject}.${effect}/${kind}`).not.toBeNull();
          const ast = { ...chickensFly(), clauses: [c!] };
          expect(validateRealityAst(ast).ok, `${subject}.${effect}/${kind}`).toBe(true);
        }
    expect(clauseFromSpec({ ...base, subject: 'smoke', effect: 'conceal' }, 'c1')).toBeNull();
    expect(clauseFromSpec({ ...base, subject: 'stone', effect: 'strengthen' }, 'c1')).toBeNull();
  });

  it('keeps V1 meaning: same strength, reach and trigger, and the bridge still needs someone standing on it', () => {
    const t = astFromV1(getScenarioDef('redbank').runtime.claimDefs.find((d) => d.id === 'river_fears_fire')!)!;
    expect(t.ast.clauses[0]).toMatchObject({ when: { event: 'lantern' }, target: { kind: 'water' }, effect: { op: 'REDIRECT_FLOW', mode: 'repel', magnitude: 3, radius: 3 } });
    expect(clausePower(t.ast.clauses[0], 1)).toBeCloseTo(specPower({ radius: 3, intensity: 3, trigger: { kind: 'lit_beacon' } }), 9);
    const bell = clauseFromSpec({ ...getScenarioDef('redbank').runtime.claimDefs[0].spec, subject: 'bridge', effect: 'strengthen', trigger: { kind: 'bell' } }, 'c1')!;
    expect(bell.when).toEqual({ all: [{ event: 'bell', min: null }, { event: 'watchers', min: 1 }] });
    expect(astFromV1({ ...getScenarioDef('redbank').runtime.claimDefs[0], reality: { ast: chickensFly(), hash: 'x', power: 1, rating: 'light', checksum: 'x', rev: 0 } } as never)).toBeNull();
  });
});

describe('the adversarial belief corpus (tests/fixtures/reality-corpus-1.json)', () => {
  const corpus = JSON.parse(readFileSync(new URL('../fixtures/reality-corpus-1.json', import.meta.url), 'utf8')) as {
    language: string;
    cases: { id: string; scenario: string; category: string; text: string; expect: string; kinds: string[]; ops: string[]; triggers: string[]; absent: string[] }[];
  };

  it('holds at least 150 labelled sentences over at least eight kinds of thing, in every category the program names', () => {
    expect(corpus.language).toBe('reality-1');
    expect(corpus.cases.length).toBeGreaterThanOrEqual(150);
    expect(new Set(corpus.cases.map((c) => c.id)).size).toBe(corpus.cases.length);
    expect(new Set(corpus.cases.flatMap((c) => c.kinds)).size).toBeGreaterThanOrEqual(8);
    const cats = new Set(corpus.cases.map((c) => c.category));
    for (const k of ['synonym', 'negation', 'conditional', 'reference', 'quantifier', 'compound', 'poetic', 'contradiction', 'incompatible', 'unknown', 'global', 'time', 'coercion', 'injection']) expect(cats.has(k), k).toBe(true);
  });

  it('uses only the language\'s own names, and every label says what a correct reading must contain', () => {
    const scenarios = new Set(listScenarios().map((s) => s.id));
    const events = new Set(['bell', 'lantern', 'smoke_fire', 'watchers', 'night', 'always', 'rain', 'clear_night', 'flood', 'spoken', 'ritual']);
    for (const c of corpus.cases) {
      expect(scenarios.has(c.scenario), c.id).toBe(true);
      expect(['supported', 'partial', 'ambiguous', 'unsupported'], c.id).toContain(c.expect);
      expect(c.text.length, c.id).toBeGreaterThan(0);
      for (const k of c.kinds) expect(k in KINDS, `${c.id} kind ${k}`).toBe(true);
      for (const o of c.ops) expect(o in OPERATORS, `${c.id} op ${o}`).toBe(true);
      for (const t of c.triggers) expect(events.has(t), `${c.id} trigger ${t}`).toBe(true);
      if (c.expect === 'supported') expect(c.kinds.length * c.ops.length, c.id).toBeGreaterThan(0);
      if (c.expect === 'unsupported' || c.expect === 'partial') expect(c.absent.length, c.id).toBeGreaterThan(0);
    }
  });
});
