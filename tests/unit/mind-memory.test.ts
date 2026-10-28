import { describe, expect, it } from 'vitest';
import { GameSession, deserializeRun, serializeRun, stateHash } from '../../src/engine/index.ts';
import type { RunState } from '../../src/engine/core/types.ts';
import { recall } from '../../src/engine/mind/memory.ts';
import { MAX_EPISODES, MAX_SUMMARY, TRAITS } from '../../src/engine/mind/types.ts';

/**
 * Phase 07, part 1: villager minds. A personality and goals derived from what the run already holds, and memories the engine
 * records from its own log, each with where it came from. Minds exist only in V2 (Generative Reality) runs.
 */

function play(scenarioId = 'redbank', days = 7, seed = 1): GameSession {
  const g = GameSession.create({ scenarioId, seed, reality: true });
  const story = g.state.scn.starters[0];
  g.act({ type: 'PICK_STARTER', claim: story });
  for (let d = 0; d < days && !g.state.outcome; d++) {
    const v = g.state.villagers.find((x) => x.status !== 'dead' && !x.beliefs[story]);
    if (v) g.act({ type: 'SEED', claim: story, target: v.id });
    for (const r of g.state.scn.rituals) {
      const lm = g.state.world.landmarks.find((l) => l.kind === r.landmark);
      if (lm && g.act({ type: 'RITUAL', ritual: r.id, landmark: lm.id, claim: story }).ok) break;
    }
    g.endDay();
  }
  return g;
}

const minds = (s: RunState) => s.v2!.minds!;

describe('minds', () => {
  it('exist in V2 runs only, one per villager', () => {
    expect(GameSession.create({ scenarioId: 'redbank', seed: 1 }).state.v2).toBeUndefined();
    const s = GameSession.create({ scenarioId: 'redbank', seed: 1, reality: true }).state;
    expect(Object.keys(minds(s).agents).sort()).toEqual(s.villagers.map((v) => v.id).sort());
  });

  it('take skepticism and stubbornness from V1 exactly, keep every trait in bounds, and are the same for the same seed', () => {
    for (const id of ['redbank', 'harvest', 'ashwood']) {
      const s = GameSession.create({ scenarioId: id, seed: 4, reality: true }).state;
      for (const v of s.villagers) {
        const p = minds(s).agents[v.id].personality;
        expect(p.skepticism).toBe(Math.max(5, Math.min(95, v.traits.skepticism)));
        expect(p.stubbornness).toBe(Math.max(5, Math.min(95, v.traits.stubbornness)));
        for (const t of TRAITS) {
          expect(p[t]).toBeGreaterThanOrEqual(5);
          expect(p[t]).toBeLessThanOrEqual(95);
        }
        expect(minds(s).agents[v.id].goals.length).toBeLessThanOrEqual(3);
      }
      expect(JSON.stringify(minds(GameSession.create({ scenarioId: id, seed: 4, reality: true }).state))).toBe(JSON.stringify(minds(s)));
    }
  });

  it('gives goals from household, work and character: parents feed their family, field hands protect the fields', () => {
    const s = GameSession.create({ scenarioId: 'redbank', seed: 1, reality: true }).state;
    const parent = s.villagers.find((v) => v.archetype === 'parent')!;
    expect(minds(s).agents[parent.id].goals).toContain('feed_family');
    const hand = s.villagers.find((v) => s.world.landmarks.some((l) => l.id === v.workId && l.kind === 'field'))!;
    expect(minds(s).agents[hand.id].goals).toContain('protect_fields');
  });
});

describe('memories', () => {
  const g = play();
  const s = g.state;

  it('the person the Keeper spoke to remembers it, from the Keeper, with their trust in the Keeper as credibility', () => {
    const seeded = s.log.find((e) => e.code === 'RUMOR_SEEDED')!;
    const ep = minds(s).agents[seeded.target!].episodes.find((e) => e.event === seeded.id);
    expect(ep).toMatchObject({ kind: 'keeper_told', source: 'keeper', witnessed: true, claim: seeded.claim, day: seeded.day });
  });

  it('a demonstration is remembered by those within sight of it, as something seen that judges the story', () => {
    const shown = s.log.find((e) => e.code === 'EVIDENCE_STAGED' || e.code === 'EVIDENCE_BACKFIRED')!;
    const saw = Object.entries(minds(s).agents).filter(([, m]) => m.episodes.some((e) => e.event === shown.id) || m.summary.some((l) => l.events.includes(shown.id)));
    expect(saw.length).toBeGreaterThan(0);
    for (const [vid, m] of saw) {
      const ep = m.episodes.find((e) => e.event === shown.id);
      if (ep) expect(ep).toMatchObject({ witnessed: true, judge: true, credibility: 100 });
      expect(s.villagers.find((v) => v.id === vid)).toBeDefined();
    }
  });

  it('what a neighbour said is hearsay: it names who said it, and credibility follows trust in them', () => {
    const told = Object.values(minds(s).agents).flatMap((m) => m.episodes).filter((e) => e.kind === 'told');
    expect(told.length).toBeGreaterThan(0);
    for (const e of told) {
      expect(e.witnessed).toBe(false);
      expect(s.villagers.some((v) => v.id === e.source)).toBe(true);
      expect(e.credibility).toBeGreaterThanOrEqual(0);
      expect(e.credibility).toBeLessThanOrEqual(100);
    }
  });

  it('a death is grief for the household, privately; neighbours who saw it remember seeing it', () => {
    const death = s.log.find((e) => e.code === 'DEATH');
    if (!death) return;
    const dead = s.villagers.find((v) => v.id === death.target)!;
    for (const v of s.villagers.filter((x) => x.household === dead.household && x.id !== dead.id && x.status !== 'dead'))
      expect(minds(s).agents[v.id].episodes.some((e) => e.kind === 'lost_kin' && e.event === death.id && e.scope === 'private')).toBe(true);
  });

  it('every memory points at a real event of its day, and no memory is invented for the dead after they died', () => {
    const ids = new Set(s.log.map((e) => e.id));
    for (const v of s.villagers) {
      for (const e of minds(s).agents[v.id].episodes) {
        if (e.event !== null && ids.has(e.event)) expect(s.log.find((x) => x.id === e.event)!.day).toBe(e.day);
        if (v.deathDay !== null) expect(e.day).toBeLessThanOrEqual(v.deathDay);
      }
    }
  });

  it('stays bounded over a long run: old, minor memories fold into summary lines that keep their sources', () => {
    const long = play('ashwood', 14);
    for (const m of Object.values(minds(long.state).agents)) {
      expect(m.episodes.filter((e) => !e.judge).length).toBeLessThanOrEqual(MAX_EPISODES);
      expect(m.episodes.length).toBeLessThanOrEqual(2 * MAX_EPISODES);
      expect(m.summary.length).toBeLessThanOrEqual(MAX_SUMMARY);
      for (const l of m.summary) {
        expect(l.count).toBeGreaterThan(0);
        expect(l.text).toMatch(/^Days? \d/);
      }
    }
    const folded = Object.values(minds(long.state).agents).flatMap((m) => m.summary);
    if (folded.length) expect(folded.some((l) => l.events.length > 0)).toBe(true);
  });

  it('personality drifts a little after major events, never more than its bound', () => {
    for (const m of Object.values(minds(s).agents)) for (const t of TRAITS) expect(Math.abs(m.personality[t] - m.base[t])).toBeLessThanOrEqual(15);
  });

  it('recall puts what matters first, and what is about the asked story before anything else', () => {
    const [vid, m] = Object.entries(minds(s).agents).find(([, x]) => x.episodes.some((e) => e.claim) && x.episodes.length > 4)!;
    const claim = m.episodes.find((e) => e.claim)!.claim!;
    const top = recall(m, 3, claim);
    expect(top[0].claim).toBe(claim);
    expect(recall(m, 100).length).toBe(m.episodes.length);
    expect(vid).toBeTruthy();
  });
});

describe('saves and replays', () => {
  it('a save keeps every memory, and the loaded run continues exactly as the original', () => {
    const a = play('redbank', 3);
    const loaded = deserializeRun(serializeRun(a.state));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(JSON.stringify(loaded.state.v2!.minds)).toBe(JSON.stringify(a.state.v2!.minds));
    const b = new GameSession(loaded.state);
    a.endDay();
    b.endDay();
    expect(stateHash(b.state)).toBe(stateHash(a.state));
  });

  it('the same run twice remembers the same things', () => {
    expect(JSON.stringify(minds(play('harvest', 5).state))).toBe(JSON.stringify(minds(play('harvest', 5).state)));
  });
});
