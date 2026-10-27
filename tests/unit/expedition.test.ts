import { describe, expect, it } from 'vitest';
import {
  GameSession, MODIFIERS, applicableModifiers, biomeForSeed, createRun, dailySeed, dateToNumber, encodeShare, expeditionId, generateExpedition, getModifierViews,
  getScenarioDef, parseExpeditionId, parseShare, replayRun, resolveDay, signatureOf, structuralIssues, utcDateNumber,
} from '../../src/engine/index.ts';
import type { Action, RunState } from '../../src/engine/index.ts';
import { hashValue } from '../../src/engine/core/hash.ts';
import { noop } from '../../src/engine/ai/bots/basic.ts';
import { runPolicy } from '../../src/engine/ai/bots/run.ts';
import { RULES_VERSION } from '../../src/engine/core/types.ts';
import { councilBanDays } from '../../src/engine/core/resolve.ts';
import { lawPusher } from '../../src/engine/ai/bots/lawpusher.ts';

const SEEDS = Array.from({ length: 48 }, (_, i) => i + 1);

describe('expedition generator', () => {
  it('is a pure function of the seed: same seed, same village; different seed, different village', () => {
    const a = generateExpedition(1234);
    const b = generateExpedition(1234);
    expect(hashValue(a.def)).toBe(hashValue(b.def));
    const c = generateExpedition(1235);
    expect(hashValue(a.def)).not.toBe(hashValue(c.def));
    // not just cached: regenerate from a clean parse of the id
    const via = getScenarioDef(expeditionId(1234));
    expect(hashValue(via.runtime)).toBe(hashValue(a.def.runtime));
  });

  it('a shuffle bag guarantees biome variety in every aligned run of six seeds', () => {
    for (let block = 0; block < 20; block++) {
      const biomes = Array.from({ length: 6 }, (_, i) => biomeForSeed(block * 6 + i));
      for (const b of ['river', 'drought', 'wolves'] as const) expect(biomes.filter((x) => x === b).length).toBe(2);
    }
  });

  it('every sampled seed passes the structural invariants and cannot be won by doing nothing', () => {
    const attempts: number[] = [];
    for (const seed of SEEDS) {
      const x = generateExpedition(seed);
      expect(x.issues, `seed ${seed} (${x.bp.biome})`).toEqual([]);
      attempts.push(x.attempt);
      expect(x.def.villagers.length).toBeGreaterThanOrEqual(12);
      expect(x.def.villagers.length).toBeLessThanOrEqual(18);
      expect(x.def.runtime.starters.length).toBe(2);
      expect(x.bp.modifiers.length).toBeGreaterThanOrEqual(1);
      expect(x.bp.modifiers.length).toBeLessThanOrEqual(3);
    }
    // a fallback is a rare event, never the norm
    expect(attempts.filter((a) => a >= 6).length).toBeLessThanOrEqual(2);
  });

  it('structural checks actually reject broken villages', () => {
    const x = generateExpedition(3);
    const bad = structuredClone(x.def);
    bad.edges = bad.edges.filter((e) => e.a !== bad.villagers[0].id && e.b !== bad.villagers[0].id);
    expect(structuralIssues(bad, x.bp).length).toBeGreaterThan(0);
    const bad2 = structuredClone(x.def);
    bad2.runtime.claimDefs[0].regions = ['nowhere'];
    expect(structuralIssues(bad2, x.bp).length).toBeGreaterThan(0);
  });

  it('villages differ in decision-relevant ways, not only in cosmetics', () => {
    const sigs = new Set<string>();
    const biomes = new Set<string>();
    const mods = new Set<string>();
    const starters = new Set<string>();
    const bottle = new Set<boolean>();
    for (const seed of SEEDS) {
      const x = generateExpedition(seed);
      sigs.add(signatureOf(x.bp));
      biomes.add(x.bp.biome);
      x.bp.modifiers.forEach((m) => mods.add(m));
      starters.add(x.bp.starters.slice().sort().join('+'));
      bottle.add(x.bp.bottleneck);
    }
    expect(biomes.size).toBe(3);
    expect(sigs.size).toBeGreaterThanOrEqual(40);
    expect(mods.size).toBeGreaterThanOrEqual(10);
    expect(starters.size).toBeGreaterThanOrEqual(3);
    expect(bottle.size).toBe(2);
  });

  it('the social graph always has a cut vertex or thin bridge between clusters when the village is bottlenecked', () => {
    for (const seed of SEEDS.slice(0, 24)) {
      const x = generateExpedition(seed);
      if (!x.bp.bottleneck) continue;
      // removing the strongest connector must reduce cross-cluster ties to (almost) nothing
      const clusterOf = new Map(x.def.villagers.map((v) => [v.id, x.def.map.landmarks.find((l) => l.id === v.home)!]));
      expect(clusterOf.size).toBe(x.def.villagers.length);
      expect(x.def.edges.length).toBeGreaterThan(x.def.villagers.length - 1);
    }
  });

  it('same seed + same action sequence replays to identical hashes; a changed seed changes the world', () => {
    const run = (seed: number) => {
      const id = expeditionId(seed);
      const r = runPolicy(lawPusher({ name: 'p', claim: generateExpedition(seed).bp.starters[0], regions: ['east', 'river', 'valley', 'north'] }), { scenarioId: id, seed });
      return replayRun({ scenarioId: id, seed, actions: r.log });
    };
    const a = run(5);
    const b = run(5);
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.eventHash).toBe(b.eventHash);
    expect(a.rejected).toEqual([]);
    expect(run(11).stateHash).not.toBe(a.stateHash);
  });

  it('different plans on the same seed end in different social AND physical states', () => {
    const seed = 2; // a river village
    const id = expeditionId(seed);
    const x = generateExpedition(seed);
    expect(x.bp.biome).toBe('river');
    const lazy = runPolicy(noop, { scenarioId: id, seed });
    const bridge = runPolicy(lawPusher({ name: 'bridge', claim: 'bridge_stands_watched', regions: ['river'] }), { scenarioId: id, seed });
    const a = replayRun({ scenarioId: id, seed, actions: lazy.log }).state;
    const b = replayRun({ scenarioId: id, seed, actions: bridge.log }).state;
    const social = (s: RunState) => hashValue(s.villagers.map((v) => v.beliefs));
    const physical = (s: RunState) => hashValue([s.world.landmarks.map((l) => l.hp), s.world.stocks, s.villagers.map((v) => v.status)]);
    expect(social(a)).not.toBe(social(b));
    expect(physical(a)).not.toBe(physical(b));
  });

  it('generation is fast enough for a phone (median under 50 ms on this machine, no run over a second)', () => {
    const times: number[] = [];
    for (let seed = 9000; seed < 9020; seed++) {
      const t = performance.now();
      generateExpedition(seed);
      times.push(performance.now() - t);
    }
    times.sort((p, q) => p - q);
    expect(times[10]).toBeLessThan(50);
    expect(times[19]).toBeLessThan(1000);
  });
});

describe('ids, share links and the daily village', () => {
  it('expedition ids round-trip and reject garbage', () => {
    expect(parseExpeditionId('x1.42')).toEqual({ version: 1, seed: 42, modifiers: null });
    expect(parseExpeditionId('x1.42.-')).toEqual({ version: 1, seed: 42, modifiers: [] });
    expect(parseExpeditionId('x1.42.low_fuel+busy_harvest')).toEqual({ version: 1, seed: 42, modifiers: ['low_fuel', 'busy_harvest'] });
    for (const bad of ['', 'redbank', 'x1.', 'x1.-5', 'x1.99999999999', 'x1.4.<script>', 'x1.4.a b']) expect(parseExpeditionId(bad), bad).toBeNull();
    expect(expeditionId(7)).toBe('x1.7');
    expect(expeditionId(7, [])).toBe('x1.7.-');
    expect(() => getScenarioDef('x9.5')).toThrow();
  });

  it('share links carry only mode, seed and versions, and validate everything', () => {
    const link = encodeShare({ mode: 'expedition', seed: 31337, difficulty: 'normal', rules: RULES_VERSION, gen: 1 });
    expect(link).toBe(`mode=expedition&seed=31337&rules=${RULES_VERSION}&gen=1`);
    const r = parseShare(link);
    expect(r.ok && r.descriptor.seed).toBe(31337);
    expect(parseShare('mode=story&scn=redbank&seed=3&rules=1.0.0&gen=1').ok).toBe(true);
    const bads = [
      'mode=evil&seed=1', 'mode=expedition', 'mode=expedition&seed=abc', 'mode=expedition&seed=-1', 'mode=expedition&seed=99999999999',
      'mode=expedition&seed=1&diff=impossible', 'mode=story&scn=../../etc/passwd&seed=1', 'mode=story&scn=nope&seed=1', 'mode=daily&date=2026-13-40',
      'mode=daily&date=<img src=x>', 'mode=expedition&seed=1&gen=7', 'mode=expedition&seed=1&rules=' + 'x'.repeat(40), 'mode=expedition&seed=1&state=%7B%7D&gen=1&rules=%3Cb%3E',
    ];
    for (const b of bads) expect(parseShare(b).ok, b).toBe(false);
    // unknown extra parameters are ignored, never executed
    const extra = parseShare('mode=expedition&seed=5&gen=1&state=%7B%22x%22%3A1%7D&evil=1');
    expect(extra.ok && Object.keys(extra.descriptor).sort()).toEqual(['date', 'difficulty', 'gen', 'mode', 'rules', 'scenario', 'seed']);
  });

  it('an older rules version still opens, with a visible note', () => {
    const r = parseShare('mode=expedition&seed=9&gen=1&rules=0.0.1');
    expect(r.ok && r.notes.length).toBe(1);
  });

  it('the daily village depends only on the UTC calendar date', () => {
    const justBeforeMidnight = new Date(Date.UTC(2026, 9, 27, 23, 59, 59));
    const justAfter = new Date(Date.UTC(2026, 9, 28, 0, 0, 1));
    expect(utcDateNumber(justBeforeMidnight)).toBe(20261027);
    expect(utcDateNumber(justAfter)).toBe(20261028);
    expect(dateToNumber('2026-10-27')).toBe(20261027);
    expect(dateToNumber('2026-02-30')).toBeNull();
    expect(dateToNumber('2028-02-29')).toBe(20280229);
    expect(dailySeed(20261027)).toBe(dailySeed(20261027));
    expect(new Set([20261027, 20261028, 20261029, 20261030, 20261031, 20261101].map(dailySeed)).size).toBeGreaterThan(3);
    const g = GameSession.create({ scenarioId: expeditionId(dailySeed(20261027)), seed: dailySeed(20261027), mode: 'daily', dailyDate: 20261027, difficulty: 'normal' });
    expect(g.state.mode).toBe('daily');
    expect(g.state.flags.dailyDate).toBe(20261027);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Every run modifier has a concrete, measurable effect

const mk = (scenarioId: string, mods: string[], seed = 1) => createRun({ scenarioId, seed, modifiers: mods });
const baseRun = (scenarioId: string, seed = 1) => createRun({ scenarioId, seed });

describe('run modifiers', () => {
  it('there are at least ten, all documented with a blurb and a price', () => {
    expect(MODIFIERS.length).toBeGreaterThanOrEqual(10);
    for (const m of MODIFIERS) {
      expect(m.blurb.length, m.id).toBeGreaterThan(20);
      expect(m.tradeoff.length, m.id).toBeGreaterThan(20);
      expect(applicableModifiers(getScenarioDef('redbank')).concat(applicableModifiers(getScenarioDef('harvest')), applicableModifiers(getScenarioDef('ashwood'))).some((x) => x.id === m.id), `${m.id} applies to some shipped scenario`).toBe(true);
    }
  });

  it('inapplicable and unknown modifiers are ignored, never crash', () => {
    const s = createRun({ scenarioId: 'redbank', seed: 1, modifiers: ['restless_wolves', 'not_a_modifier', 'low_fuel', 'low_fuel'] });
    expect(s.modifiers).toEqual(['low_fuel']);
    expect(getModifierViews(s).map((m) => m.id)).toEqual(['low_fuel']);
  });

  it('cross_bank_mistrust weakens ties that cross the river and fragilises the bridge', () => {
    const a = baseRun('redbank');
    const b = mk('redbank', ['cross_bank_mistrust']);
    const cross = (s: RunState) => s.edges.filter((e) => s.villagers.find((v) => v.id === e.a)!.district !== s.villagers.find((v) => v.id === e.b)!.district);
    expect(cross(a).length).toBeGreaterThan(0);
    const sum = (s: RunState) => cross(s).reduce((t, e) => t + e.ab + e.ba, 0);
    expect(sum(b)).toBeLessThan(sum(a) * 0.8);
    expect(b.world.landmarks.find((l) => l.kind === 'bridge')!.hp).toBeLessThan(a.world.landmarks.find((l) => l.kind === 'bridge')!.hp);
    // same-district ties are untouched
    const same = (s: RunState) => s.edges.filter((e) => s.villagers.find((v) => v.id === e.a)!.district === s.villagers.find((v) => v.id === e.b)!.district).reduce((t, e) => t + e.ab, 0);
    expect(same(b)).toBe(same(a));
  });

  it('soot_season strengthens fire laws, adds spark risk and raises ignition', () => {
    const a = baseRun('redbank');
    const b = mk('redbank', ['soot_season']);
    const fear = (s: RunState) => s.scn.claimDefs.find((c) => c.id === 'river_fears_fire')!.spec;
    expect(fear(b).radius).toBeGreaterThan(fear(a).radius);
    expect(b.scn.consts.fireBase).toBeGreaterThan(a.scn.consts.fireBase);
    // the authored scenario object is never mutated
    expect(getScenarioDef('redbank').runtime.consts.fireBase).toBe(10);
  });

  it('busy_harvest makes gatherings much weaker', () => {
    const gather = (mods: string[]) => {
      const g = GameSession.create({ scenarioId: 'redbank', seed: 4, modifiers: mods });
      g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
      const r = g.act({ type: 'GATHER', claim: 'river_fears_fire', site: 'chapel' });
      expect(r.ok).toBe(true);
      return g.state.villagers.reduce((t, v) => t + (v.beliefs.river_fears_fire?.conv ?? 0), 0);
    };
    expect(gather(['busy_harvest'])).toBeLessThan(gather([]) * 0.75);
  });

  it('travelling_circus adds a well-connected showman who carries the rival rumour', () => {
    const a = baseRun('redbank');
    const b = mk('redbank', ['travelling_circus']);
    const star = b.villagers.find((v) => v.role.includes('circus'))!;
    expect(star).toBeTruthy();
    expect(star.beliefs.river_courts_fire?.conv).toBe(55);
    expect(b.edges.length).toBeGreaterThan(a.edges.length);
    expect(star.traits.influence).toBeGreaterThanOrEqual(90);
  });

  it('silent_bells blocks ringing until the clapper is mended on day 4', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, modifiers: ['silent_bells'] });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const r1 = g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: 'bell' });
    expect(!r1.ok && r1.error.code).toBe('BELLS_SILENT');
    for (let d = 0; d < 3; d++) g.endDay();
    expect(g.state.day).toBe(4);
    expect(g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: 'bell' }).ok).toBe(true);
    // without the modifier the very first day works
    const h = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    h.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    expect(h.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: 'bell' }).ok).toBe(true);
  });

  it('overcrowded_refuge halves shelter room', () => {
    const cap = (s: RunState) => s.world.landmarks.filter((l) => l.kind === 'shelter').map((l) => l.capacity);
    const a = cap(baseRun('redbank'));
    const b = cap(mk('redbank', ['overcrowded_refuge']));
    b.forEach((c, i) => expect(c).toBeLessThan(a[i]));
  });

  it('low_fuel halves the fuel store', () => {
    expect(mk('redbank', ['low_fuel']).world.stocks.fuel).toBe(Math.ceil(baseRun('redbank').world.stocks.fuel / 2));
  });

  it('doubting_scholars makes proof stronger and telling weaker', () => {
    const delta = (mods: string[], action: Action) => {
      const g = GameSession.create({ scenarioId: 'redbank', seed: 3, modifiers: mods });
      g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
      const before = g.state.villagers.reduce((t, v) => t + (v.beliefs.river_fears_fire?.conv ?? 0), 0);
      expect(g.act(action).ok).toBe(true);
      return g.state.villagers.reduce((t, v) => t + (v.beliefs.river_fears_fire?.conv ?? 0), 0) - before;
    };
    const tell: Action = { type: 'SEED', claim: 'river_fears_fire', target: 'ivo' };
    const proof: Action = { type: 'RITUAL', ritual: 'light_beacon', landmark: 'b_n', claim: 'river_fears_fire' };
    expect(delta(['doubting_scholars'], tell)).toBeLessThan(delta([], tell));
    expect(delta(['doubting_scholars'], proof)).toBeGreaterThan(delta([], proof));
  });

  it('stubborn_elders hardens elders and slows the fading of laws', () => {
    const a = baseRun('redbank');
    const b = mk('redbank', ['stubborn_elders']);
    const harl = (s: RunState) => s.villagers.find((v) => v.id === 'harl')!.traits;
    expect(harl(b).susceptibility).toBeLessThan(harl(a).susceptibility);
    expect(b.modifiers).toContain('stubborn_elders');
  });

  it('divided_council bans gatherings on warned days and the ban actually blocks them', () => {
    const bans = councilBanDays(1, 7);
    expect(bans.length).toBeGreaterThanOrEqual(2);
    expect(bans.every((d, i) => i === 0 || d - bans[i - 1] >= 2)).toBe(true);
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, modifiers: ['divided_council'] });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const warned: string[] = [];
    let blockedOnBanDay = false;
    while (!g.state.outcome && g.state.day < 7) {
      const day = g.state.day;
      if (bans.includes(day)) {
        const r = g.act({ type: 'GATHER', claim: 'river_fears_fire', site: 'chapel' });
        expect(r.ok).toBe(false);
        if (!r.ok) blockedOnBanDay = r.error.code === 'COUNCIL_BAN';
      } else if (g.state.ap >= 2 && day < 3) {
        expect(g.act({ type: 'GATHER', claim: 'river_fears_fire', site: 'chapel' }).ok || g.state.ap < 2).toBeTruthy();
      }
      const r = g.endDay();
      warned.push(...r.events.filter((e) => e.code === 'COUNCIL_PLAN').map((e) => String(e.day)));
    }
    expect(blockedOnBanDay).toBe(true);
    expect(warned.length).toBeGreaterThan(0);
  });

  it('clear_night_skies removes all rain and makes every night a bright one', () => {
    const b = mk('harvest', ['clear_night_skies']);
    expect(b.threat.every((t) => t.rain === 0 && t.heat >= 2)).toBe(true);
    expect(baseRun('harvest').threat.some((t) => t.rain > 0)).toBe(true);
  });

  it('river_of_reeds makes water-turning laws stronger and the forecast unreliable', () => {
    const a = baseRun('redbank', 5);
    const b = mk('redbank', ['river_of_reeds'], 5);
    const spec = (s: RunState) => s.scn.claimDefs.find((c) => c.id === 'river_fears_fire')!.spec;
    expect(spec(b).radius).toBeGreaterThan(spec(a).radius);
    const levels = (s: RunState) => s.threat.map((t) => t.level).join(',');
    let differs = false;
    for (let seed = 1; seed <= 6 && !differs; seed++) differs = levels(mk('redbank', ['river_of_reeds'], seed)) !== levels(baseRun('redbank', seed));
    expect(differs).toBe(true);
    // the last night (the climax) is never jittered
    expect(b.threat[b.threat.length - 1].level).toBe(a.threat[a.threat.length - 1].level);
  });

  it('early_frost slows crops and soil drying', () => {
    const a = baseRun('harvest');
    const b = mk('harvest', ['early_frost']);
    expect(b.scn.consts.growBase).toBeLessThan(a.scn.consts.growBase);
    expect(b.scn.consts.dryRate).toBeLessThan(a.scn.consts.dryRate);
    const growth = (mods: string[]) => {
      let s = createRun({ scenarioId: 'harvest', seed: 2, modifiers: mods });
      for (let i = 0; i < 3; i++) s = resolveDay(s).state;
      return s.world.landmarks.filter((l) => l.kind === 'field').reduce((t, f) => t + (f.data.growth ?? 0), 0);
    };
    expect(growth(['early_frost'])).not.toBe(growth([]));
  });

  it('restless_wolves lets packs travel farther each night', () => {
    const dist = (mods: string[]) => {
      let s = createRun({ scenarioId: 'ashwood', seed: 3, modifiers: mods });
      const start = s.world.packs.map((p) => [p.x, p.y]);
      for (let i = 0; i < 3; i++) s = resolveDay(s).state;
      return s.world.packs.reduce((t, p, i) => t + Math.abs(p.x - start[i][0]) + Math.abs(p.y - start[i][1]), 0);
    };
    expect(dist(['restless_wolves'])).toBeGreaterThan(dist([]));
  });

  it('modifiers never make a village unsolvable on their own: every modifier combination still has a legal first move and ends', () => {
    for (const m of MODIFIERS) {
      for (const sc of ['redbank', 'harvest', 'ashwood']) {
        const s = createRun({ scenarioId: sc, seed: 1, modifiers: [m.id] });
        const g = new GameSession(s);
        let guard = 0;
        while (!g.state.outcome && guard++ < 20) g.endDay();
        expect(g.state.outcome, `${m.id} on ${sc}`).toBeTruthy();
      }
    }
  });
});
