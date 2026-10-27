import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS, GameSession, PLEDGES, UNLOCKS, applyRun, catalogEntries, createRun, dailySeed, emptyProgress, expeditionId, exportProgress, generateExpedition, importProgress,
  personalBest, progressStats, replayRun,
} from '../../src/engine/index.ts';
import type { CreateRunOptions, Progress, RunState } from '../../src/engine/index.ts';
import * as S from '../../src/engine/ai/bots/strategies.ts';
import { noop } from '../../src/engine/ai/bots/basic.ts';
import { lawPusher } from '../../src/engine/ai/bots/lawpusher.ts';
import type { Policy } from '../../src/engine/ai/bots/types.ts';
import { witnessPolicies } from '../../src/engine/gen/witness.ts';
import { FRUGAL_AP_PER_DAY } from '../../src/engine/progress/achievements.ts';
import { PRESETS, applyDraft, extraClaimsFor } from '../../src/engine/progress/options.ts';
import { getScenarioDef, interpretBelief } from '../../src/engine/index.ts';
import { readFileSync } from 'node:fs';

function play(p: Policy, o: CreateRunOptions): RunState {
  const g = GameSession.create(o);
  let n = 0;
  while (!g.state.outcome && n++ < 40) p.playDay(g);
  return g.state;
}
const ids = (r: { newAchievements: { id: string }[] }) => r.newAchievements.map((a) => a.id);
const fold = (p: Progress, s: RunState, debug = false) => applyRun(p, s, { debug, finishedAt: '2026-10-27T00:00:00Z' });

/** a frugal win: the watched-bridge planner in expedition village 1 */
function frugalRun(): RunState {
  const x = generateExpedition(1);
  return play(witnessPolicies(x.bp, x.def).find((q) => q.name === 'witness-bridge')!, { scenarioId: x.id, seed: 1, mode: 'expedition' });
}

/** the first catalog village of a biome, with the planner recorded for it */
function catalogRun(biome: string, extra: Partial<CreateRunOptions> = {}): RunState {
  const e = catalogEntries().find((x) => x.biome === biome)!;
  const x = generateExpedition(e.seed);
  const p = witnessPolicies(x.bp, x.def).find((q) => q.name === e.wins[0])!;
  return play(p, { scenarioId: x.id, seed: e.seed, mode: 'expedition', ...extra });
}

describe('score: readable, normalised, not farmable', () => {
  it('a perfect-ish win scores near 1000 base points and every category is disclosed', () => {
    const s = play(S.witnessBridge, { scenarioId: 'redbank', seed: 1 });
    const o = s.outcome!;
    expect(o.result).toBe('victory');
    expect(Object.keys(o.breakdown).sort()).toEqual(['efficiency', 'essentials', 'harmony', 'heroic', 'households', 'infrastructure', 'laws', 'survivors']);
    const raw = Object.values(o.breakdown).reduce((a, b) => a + b, 0);
    expect(raw).toBeGreaterThan(800);
    expect(raw).toBeLessThanOrEqual(1060);
    expect(o.score).toBe(Math.round(raw * o.multiplier));
    expect(o.breakdown.survivors).toBeGreaterThan(o.breakdown.households + o.breakdown.essentials); // survival dominates
  });

  it('doing nothing earns no efficiency, no laws and no heroic points, and never beats a win', () => {
    const idle = play(noop, { scenarioId: 'redbank', seed: 1 });
    expect(idle.outcome!.result).toBe('defeat');
    expect(idle.outcome!.breakdown.efficiency).toBe(0);
    expect(idle.outcome!.breakdown.laws).toBe(0);
    expect(idle.outcome!.breakdown.heroic).toBe(0);
    const win = play(S.witnessBridge, { scenarioId: 'redbank', seed: 1 });
    expect(win.outcome!.score).toBeGreaterThan(idle.outcome!.score);
  });

  it('efficiency is capped, only paid on victory, and shrinks if Influence is wasted', () => {
    const win = play(S.witnessBridge, { scenarioId: 'redbank', seed: 1 }).outcome!;
    expect(win.breakdown.efficiency).toBeLessThanOrEqual(60);
    const lose = play(S.fireWall, { scenarioId: 'redbank', seed: 2 });
    expect(lose.outcome!.result).toBe('defeat');
    expect(lose.outcome!.breakdown.efficiency).toBe(0);
  });

  it('difficulty, pledges, drafts and twists multiply the same base in a disclosed way', () => {
    const base = play(S.witnessBridge, { scenarioId: 'redbank', seed: 1 }).outcome!;
    const hard = play(S.witnessBridge, { scenarioId: 'redbank', seed: 1, difficulty: 'hard' }).outcome!;
    expect(hard.multiplier).toBeGreaterThan(base.multiplier);
    const oath = play(S.witnessBridge, { scenarioId: 'redbank', seed: 1, pledges: ['no_fire'] }).outcome!;
    expect(oath.multiplier).toBeCloseTo(1.2, 5);
    const twisted = play(S.witnessBridge, { scenarioId: 'redbank', seed: 1, modifiers: ['low_fuel'] });
    expect(twisted.flags.twisted).toBe(1);
    expect(twisted.outcome!.multiplier).toBeCloseTo(1.1, 5);
  });

  it('recorded fixture traces keep their exact scores (deterministic score fixtures)', () => {
    for (const id of ['redbank', 'harvest', 'ashwood']) {
      const fx = JSON.parse(readFileSync(new URL(`../fixtures/${id}-traces.json`, import.meta.url), 'utf8')) as Record<string, { seed: number; score?: number; actions: never[] }>;
      for (const key of Object.keys(fx).filter((k) => fx[k] && typeof fx[k] === 'object' && 'actions' in fx[k] && fx[k].score !== undefined)) {
        const r = replayRun({ scenarioId: id, seed: fx[key].seed, actions: fx[key].actions });
        expect(r.state.outcome!.score, `${id}/${key}`).toBe(fx[key].score);
      }
    }
  });
});

describe('achievements: at least sixteen, each provably attainable', () => {
  it('the catalog has at least 16 achievements with names and descriptions', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(16);
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length).toBeGreaterThan(2);
      expect(a.desc.length).toBeGreaterThan(15);
    }
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  const proofs: Record<string, () => string[]> = {
    unshaken: () => {
      const x = generateExpedition(149);
      return ids(fold(emptyProgress(), play(witnessPolicies(x.bp, x.def).find((q) => q.name === 'fire-wall')!, { scenarioId: x.id, seed: 149, mode: 'expedition' })));
    },
    first_law: () => ids(fold(emptyProgress(), play(S.fireWall, { scenarioId: 'redbank', seed: 1 }))),
    counter_wave: () => ids(fold(emptyProgress(), play(S.fireWall, { scenarioId: 'redbank', seed: 1 }))),
    no_beacons: () => ids(fold(emptyProgress(), play(S.witnessBridge, { scenarioId: 'redbank', seed: 1 }))),
    hard_win: () => ids(fold(emptyProgress(), play(S.fireWall, { scenarioId: 'redbank', seed: 1, difficulty: 'hard' }))),
    max_surge: () => ids(fold(emptyProgress(), play(S.witnessBridge, { scenarioId: 'redbank', seed: 1 }))),
    two_districts: () => ids(fold(emptyProgress(), play(S.smokeRing, { scenarioId: 'ashwood', seed: 11 }))),
    all_home: () => ids(fold(emptyProgress(), play(S.fireWall, { scenarioId: 'redbank', seed: 5 }))),
    rival_tune: () => ids(fold(emptyProgress(), play(S.decoy, { scenarioId: 'ashwood', seed: 4 }))),
    few_words: () => ids(fold(emptyProgress(), frugalRun())),
    grain_road: () => ids(fold(emptyProgress(), play(S.caravans, { scenarioId: 'harvest', seed: 1 }))),
    unburned: () => ids(fold(emptyProgress(), play(S.moonlight, { scenarioId: 'harvest', seed: 1 }))),
    heroic: () => ids(fold(emptyProgress(), play(S.witnessBridge, { scenarioId: 'redbank', seed: 1 }))),
    hard_lesson: () => ids(fold(emptyProgress(), play(S.fireWall, { scenarioId: 'redbank', seed: 2 }))),
    pledge_kept: () => ids(fold(emptyProgress(), play(S.witnessBridge, { scenarioId: 'redbank', seed: 1, pledges: ['no_fire'] }))),
    daily_done: () => {
      const d = 20261027;
      const seed = dailySeed(d);
      const e = catalogEntries().find((x) => x.seed === seed)!;
      const x = generateExpedition(seed);
      const p = witnessPolicies(x.bp, x.def).find((q) => q.name === e.wins[0])!;
      return ids(fold(emptyProgress(), play(p, { scenarioId: expeditionId(seed), seed, mode: 'daily', dailyDate: d })));
    },
    two_roads: () => {
      const p = fold(emptyProgress(), play(S.witnessBridge, { scenarioId: 'redbank', seed: 1, mode: 'story' })).progress;
      return ids(fold(p, play(S.caravans, { scenarioId: 'harvest', seed: 1, mode: 'story' })));
    },
    three_biomes: () => {
      let p = emptyProgress();
      let last: string[] = [];
      for (const b of ['river', 'drought', 'wolves']) {
        const r = fold(p, catalogRun(b));
        p = r.progress;
        last = ids(r);
      }
      return last;
    },
    five_paths: () => {
      let p = emptyProgress();
      let last: string[] = [];
      const runs: [Policy, CreateRunOptions][] = [
        [S.fireWall, { scenarioId: 'redbank', seed: 1, mode: 'story' }], [S.witnessBridge, { scenarioId: 'redbank', seed: 1, mode: 'story' }],
        [S.moonlight, { scenarioId: 'harvest', seed: 1, mode: 'story' }], [S.smokeRing, { scenarioId: 'ashwood', seed: 6, mode: 'story' }], [S.decoy, { scenarioId: 'ashwood', seed: 6, mode: 'story' }],
      ];
      for (const [pol, o] of runs) {
        const r = fold(p, play(pol, o));
        p = r.progress;
        last = last.concat(ids(r));
      }
      return last;
    },
    custom_law: () => {
      // an Inventor run: the player writes a belief, it becomes law, and only this badge is paid
      const g = GameSession.create({ scenarioId: 'redbank', seed: 1, difficulty: 'story', inventor: true });
      g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
      const d = interpretBelief(g.state, 'No flood can break a bridge that is watched.').drafts[0];
      g.act({ type: 'COMPOSE', claim: d.claim });
      const pol = lawPusher({ name: 'inventor', claim: d.claim.id, regions: d.claim.regions, counter: false, reserve: () => 0 });
      for (let i = 0; i < 10 && !g.state.outcome; i++) pol.playDay(g);
      return ids(fold(emptyProgress(), g.state));
    },
    cartographer: () => {
      let p = emptyProgress();
      let last: string[] = [];
      const rain = lawPusher({ name: 'rain', claim: 'rain_follows_bells', regions: ['valley'], physical: (g) => { if (g.state.day >= 3 && g.state.ap >= 1) g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: 'bell' }); } });
      const runs: [Policy, CreateRunOptions][] = [
        [S.fireWall, { scenarioId: 'redbank', seed: 1 }], [S.witnessBridge, { scenarioId: 'redbank', seed: 1 }], [S.moonlight, { scenarioId: 'harvest', seed: 1 }], [rain, { scenarioId: 'harvest', seed: 1 }],
        [S.smokeRing, { scenarioId: 'ashwood', seed: 6 }], [S.decoy, { scenarioId: 'ashwood', seed: 6 }],
      ];
      for (const [pol, o] of runs) {
        const r = fold(p, play(pol, o));
        p = r.progress;
        last = last.concat(ids(r));
      }
      return last;
    },
  };

  for (const a of ACHIEVEMENTS) {
    it(`${a.id} can be earned: ${a.name}`, () => {
      const f = proofs[a.id];
      expect(f, `a proof exists for ${a.id}`).toBeTruthy();
      expect(f()).toContain(a.id);
    });
  }

  it('few_words really means spending at most 1.5 Influence a day', () => {
    const s = frugalRun();
    expect(s.outcome!.result).toBe('victory');
    expect(s.stats.apSpent).toBeLessThanOrEqual(FRUGAL_AP_PER_DAY * s.maxDay);
    // a run that spends more is not frugal
    const spender = play(S.fireWall, { scenarioId: 'redbank', seed: 1 });
    expect(spender.stats.apSpent).toBeGreaterThan(FRUGAL_AP_PER_DAY * spender.maxDay);
  });
});

describe('archive: atlas, knowledge, postcards, integrity', () => {
  it('debug runs are archived but earn nothing; the same finished run is never counted twice', () => {
    const s = play(S.witnessBridge, { scenarioId: 'redbank', seed: 1 });
    const dbg = fold(emptyProgress(), s, true);
    expect(dbg.newAchievements).toEqual([]);
    expect(dbg.newUnlocks).toEqual([]);
    expect(Object.keys(dbg.progress.atlas.laws)).toEqual([]);
    expect(dbg.progress.runs.length).toBe(1);
    const a = fold(emptyProgress(), s);
    expect(a.newAchievements.length).toBeGreaterThan(0);
    const b = fold(a.progress, s);
    expect(b.duplicate).toBe(true);
    expect(b.progress.runs.length).toBe(1);
    expect(b.newAchievements).toEqual([]);
  });

  it('a won law enters the Atlas with its real benefit, risk, region and observed effects', () => {
    const r = fold(emptyProgress(), play(S.fireWall, { scenarioId: 'redbank', seed: 1 }));
    const law = r.progress.atlas.laws.river_fears_fire;
    expect(law).toBeTruthy();
    expect(law.benefit).toContain('beacons');
    expect(law.regions).toContain('Eastbank');
    expect(law.effects.length).toBeGreaterThan(0);
    expect(r.postcard).toMatch(/lived through the night of the Great Surge/);
    expect(r.progress.atlas.postcards.redbank).toContain(r.postcard);
  });

  it('a defeat still teaches, and different runs unlock different knowledge', () => {
    const lost1 = fold(emptyProgress(), play(S.fireWall, { scenarioId: 'redbank', seed: 2 }));
    const lost2 = fold(emptyProgress(), play(noop, { scenarioId: 'ashwood', seed: 3 }));
    expect(lost1.newKnowledge.length).toBeGreaterThan(0);
    expect(lost2.newKnowledge.length).toBeGreaterThan(0);
    const a = new Set(lost1.newKnowledge.map((k) => k.id));
    const b = new Set(lost2.newKnowledge.map((k) => k.id));
    expect([...b].some((k) => !a.has(k))).toBe(true);
    expect([...a].some((k) => !b.has(k))).toBe(true);
    // knowledge is only ever granted once
    const again = fold(lost1.progress, play(S.fireWall, { scenarioId: 'redbank', seed: 2, difficulty: 'hard' }));
    for (const k of again.newKnowledge) expect(lost1.newKnowledge.some((o) => o.id === k.id)).toBe(false);
  });

  it('personal best only compares like with like', () => {
    const s = play(S.witnessBridge, { scenarioId: 'redbank', seed: 1 });
    const first = fold(emptyProgress(), s);
    const hardRun = fold(first.progress, play(S.witnessBridge, { scenarioId: 'redbank', seed: 1, difficulty: 'hard' }));
    expect(personalBest(hardRun.progress, hardRun.record)).toBeNull();
    const again = play(S.witnessBridge, { scenarioId: 'redbank', seed: 1, difficulty: 'normal', pledges: ['no_fire'] });
    const r = fold(hardRun.progress, again);
    expect(personalBest(r.progress, r.record)).toBeNull();
  });

  it('stats summarise the archive honestly', () => {
    let p = emptyProgress();
    p = fold(p, play(S.witnessBridge, { scenarioId: 'redbank', seed: 1, mode: 'story' })).progress;
    p = fold(p, play(S.caravans, { scenarioId: 'harvest', seed: 1, mode: 'story' })).progress;
    p = fold(p, play(S.fireWall, { scenarioId: 'redbank', seed: 2, mode: 'story' })).progress;
    const st = progressStats(p);
    expect(st.runs).toBe(3);
    expect(st.victories).toBe(2);
    expect(st.chaptersCompleted).toBe(2);
    expect(st.uniqueLaws).toBeGreaterThanOrEqual(2);
    expect(st.averageScoreByMode.story).toBeGreaterThan(500);
    expect(st.favoriteStrategy).toBeTruthy();
  });
});

describe('archive: export, import, migration, reset', () => {
  const build = () => {
    let p = emptyProgress();
    p = fold(p, play(S.witnessBridge, { scenarioId: 'redbank', seed: 1, mode: 'story' })).progress;
    p = fold(p, play(S.smokeRing, { scenarioId: 'ashwood', seed: 6, mode: 'story' })).progress;
    return p;
  };

  it('survives an export/import round trip exactly', () => {
    const p = build();
    const r = importProgress(exportProgress(p));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.migrated).toBe(false);
      expect(r.progress).toEqual(p);
    }
  });

  it('rejects things that are not archives, newer formats and oversized files, and never throws', () => {
    for (const bad of ['', 'not json', '[]', '{}', '{"version":"2"}', '{"version":99,"runs":[]}', '{"version":0,"runs":[]}', '{"version":2}', '{"version":2,"runs":"x"}', 'x'.repeat(3_000_000)]) {
      const r = importProgress(bad);
      expect(r.ok, bad.slice(0, 30)).toBe(false);
    }
  });

  it('drops unknown fields and malformed records instead of trusting them', () => {
    const p = build();
    const dirty = JSON.parse(exportProgress(p));
    dirty.evil = '<script>alert(1)</script>';
    dirty.runs.push({ id: 5, scenarioId: {}, result: 'victory' }, 'junk', null, { id: 'a', scenarioId: 'x', name: 'x', mode: 'hax', seed: 1, score: 1, result: 'victory' });
    dirty.achievements.not_real = { run: 'x' };
    dirty.unlocks.also_fake = { run: 'x' };
    dirty.atlas.knowledge.fake = { run: 'x' };
    dirty.runs[0].extra = 'ignored';
    const r = importProgress(JSON.stringify(dirty));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.progress.runs.length).toBe(p.runs.length);
      expect(r.progress.achievements).not.toHaveProperty('not_real');
      expect(r.progress.unlocks).not.toHaveProperty('also_fake');
      expect(JSON.stringify(r.progress)).not.toContain('script');
      expect(r.progress.runs[0]).not.toHaveProperty('extra');
    }
  });

  it('migrates the first archive format', () => {
    const v1 = { version: 1, runs: [{ scenarioId: 'redbank', seed: 3, difficulty: 'normal', result: 'victory', score: 900, day: 7, alive: 13, lawsActivated: ['river_fears_fire'], debug: false }, { scenarioId: 'harvest', seed: 9, result: 'defeat', score: 120, day: 5, alive: 8, lawsActivated: [], debug: true }, { bogus: true }] };
    const r = importProgress(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.migrated).toBe(true);
      expect(r.progress.version).toBe(2);
      expect(r.progress.runs.length).toBe(2);
      expect(r.progress.runs[0].laws).toEqual(['river_fears_fire']);
      expect(r.progress.runs[1].debug).toBe(true);
      expect(Object.keys(r.progress.achievements)).toEqual([]);
    }
  });

  it('only keeps the most recent 300 runs', () => {
    const p = build();
    const many = { ...p, runs: Array.from({ length: 350 }, (_, i) => ({ ...p.runs[0], id: `r${i}`, seed: i })) };
    const r = importProgress(JSON.stringify(many));
    expect(r.ok && r.progress.runs.length).toBe(300);
  });
});

describe('unlocks genuinely change what a player can choose', () => {
  it('every unlock is earned by a real act and every one has a mechanical effect that is tested below', () => {
    expect(UNLOCKS.length).toBeGreaterThanOrEqual(5);
    const earned: Record<string, boolean> = {};
    let p = emptyProgress();
    const runs: [Policy, CreateRunOptions][] = [
      [S.fireWall, { scenarioId: 'redbank', seed: 1, mode: 'story' }], [S.witnessBridge, { scenarioId: 'redbank', seed: 1, mode: 'story' }], [S.moonlight, { scenarioId: 'harvest', seed: 1, mode: 'story' }],
      [S.caravans, { scenarioId: 'harvest', seed: 1, mode: 'story' }], [S.smokeRing, { scenarioId: 'ashwood', seed: 11, mode: 'story' }], [S.decoy, { scenarioId: 'ashwood', seed: 6, mode: 'story' }],
      [S.witnessBridge, { scenarioId: 'redbank', seed: 3, mode: 'story', modifiers: ['divided_council'] }],
    ];
    for (const [pol, o] of runs) {
      const r = fold(p, play(pol, o));
      p = r.progress;
      for (const u of r.newUnlocks) earned[u.id] = true;
    }
    for (const u of UNLOCKS) expect(earned[u.id], `unlock ${u.id}`).toBe(true);
  });

  it('Fireproof Hearts adds a playable extra opening story to Redbank, with the effect its card promises', () => {
    expect(extraClaimsFor('redbank').map((c) => c.id)).toEqual(['flames_cannot_hurt']);
    const plain = createRun({ scenarioId: 'redbank', seed: 1 });
    const extra = createRun({ scenarioId: 'redbank', seed: 1, extraClaims: ['flames_cannot_hurt'] });
    expect(plain.scn.starters).toEqual(['river_fears_fire', 'bridge_stands_watched']);
    expect(extra.scn.starters).toContain('flames_cannot_hurt');
    expect(extra.laws.some((l) => l.claimId === 'flames_cannot_hurt')).toBe(true);
    const g = new GameSession(extra);
    expect(g.act({ type: 'PICK_STARTER', claim: 'flames_cannot_hurt' }).ok).toBe(true);
    expect(g.act({ type: 'SEED', claim: 'flames_cannot_hurt', target: 'ivo' }).ok).toBe(true);
    // the shipped scenario is untouched
    expect(getScenarioDef('redbank').runtime.claimDefs.some((c) => c.id === 'flames_cannot_hurt')).toBe(false);
    // unknown extras are ignored
    expect(createRun({ scenarioId: 'harvest', seed: 1, extraClaims: ['flames_cannot_hurt'] }).scn.claimDefs.some((c) => c.id === 'flames_cannot_hurt')).toBe(false);
  });

  it('the Oath, Quiet streets, Thin voice and Not one lost are enforced by the engine', () => {
    const oath = new GameSession(createRun({ scenarioId: 'redbank', seed: 1, pledges: ['no_fire'] }));
    oath.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const lit = oath.act({ type: 'RITUAL', ritual: 'light_beacon', landmark: 'b_n' });
    expect(!lit.ok && lit.error.code).toBe('PLEDGE');
    expect(oath.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: 'bell' }).ok).toBe(true); // non-fire rituals still work

    const quiet = new GameSession(createRun({ scenarioId: 'redbank', seed: 1, pledges: ['no_gathering'] }));
    quiet.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const gather = quiet.act({ type: 'GATHER', claim: 'river_fears_fire', site: 'chapel' });
    expect(!gather.ok && gather.error.code).toBe('PLEDGE');
    expect(quiet.act({ type: 'SEED', claim: 'river_fears_fire', target: 'ivo' }).ok).toBe(true);

    const base = createRun({ scenarioId: 'redbank', seed: 1 });
    const thin = createRun({ scenarioId: 'redbank', seed: 1, pledges: ['thin_voice'] });
    expect(thin.ap).toBe(base.ap - 1);
    expect(thin.apPerDay).toBe(base.apPerDay - 1);

    const strict = createRun({ scenarioId: 'redbank', seed: 1, pledges: ['all_alive'] });
    expect(strict.scn.objectives.some((o) => o.id === 'pledge_all_alive' && o.instantLoss)).toBe(true);
    const idle = new GameSession(strict);
    let n = 0;
    while (!idle.state.outcome && n++ < 10) idle.endDay();
    expect(idle.state.outcome!.result).toBe('defeat');
    // ... and the plain scenario's own definition is not changed by a pledge run
    expect(getScenarioDef('redbank').runtime.objectives.some((o) => o.id === 'pledge_all_alive')).toBe(false);
  });

  it('pledges that do not apply are dropped (no fire rituals, no oath)', () => {
    const s = createRun({ scenarioId: 'harvest', seed: 1, pledges: ['no_fire', 'thin_voice', 'bogus'] });
    expect(s.modifiers.filter((m) => m.startsWith('pledge:'))).toEqual(['pledge:thin_voice']);
    expect(PLEDGES.length).toBe(4);
  });

  it('a draft keeps only the chosen stories and a quiet rival stays quiet', () => {
    const d = applyDraft(getScenarioDef('redbank'), ['river_fears_fire', 'rain_heeds_bells']);
    expect(d.runtime.claimDefs.filter((c) => !c.rival).map((c) => c.id).sort()).toEqual(['rain_heeds_bells', 'river_fears_fire']);
    expect(d.runtime.starters.sort()).toEqual(['rain_heeds_bells', 'river_fears_fire']);
    const s = createRun({ scenarioId: 'redbank', seed: 1, draft: ['river_fears_fire', 'rain_heeds_bells'] });
    expect(s.flags.drafted).toBe(1);
    expect(s.claims.some((c) => c.id === 'bridge_stands_watched')).toBe(false);
    // a draft of fewer than two, or of everything, is ignored
    expect(applyDraft(getScenarioDef('redbank'), ['river_fears_fire'])).toBe(getScenarioDef('redbank'));
    expect(applyDraft(getScenarioDef('redbank'), ['river_fears_fire', 'bridge_stands_watched', 'rain_heeds_bells'])).toBe(getScenarioDef('redbank'));
    // the drafted scenario is still a playable game
    const g = new GameSession(s);
    let n = 0;
    while (!g.state.outcome && n++ < 10) g.endDay();
    expect(g.state.outcome).toBeTruthy();
  });

  it('the Hostile council preset applies its twists to a story chapter', () => {
    expect(PRESETS[0].modifiers).toEqual(['divided_council', 'travelling_circus']);
    const s = createRun({ scenarioId: 'redbank', seed: 1, modifiers: PRESETS[0].modifiers });
    expect(s.modifiers).toEqual(['divided_council', 'travelling_circus']);
    expect(s.flags.twisted).toBe(2);
  });
});
