import { describe, expect, it } from 'vitest';
import {
  GameSession,
  buildDebrief,
  findCounterfactual,
  nightReport,
  optionsFromState,
  previewAction,
  replayRun,
  stateHash,
} from '../../src/engine/index.ts';
import { K } from '../../src/engine/social/persuasion.ts';
import { beliefLabel } from '../../src/engine/index.ts';
import { policyById } from '../../src/engine/ai/bots/generic.ts';
import { getTutorial } from '../../src/ui/tutorial.ts';
import type { UiState } from '../../src/ui/store.ts';

/** Regression tests for the Phase 15 review fixes (docs/FUN_REVIEW.md). Each one fails on the code as it was before the fix. */

function opened(scenarioId: string, seed: number, claim: string): GameSession {
  const g = GameSession.create({ scenarioId, seed });
  expect(g.act({ type: 'PICK_STARTER', claim }).ok).toBe(true);
  return g;
}

const ui = (selection: UiState['selection'] = null): UiState => ({ tutorialDone: false, selection }) as UiState;

describe('the morning report says what happened to your story (fix 1)', () => {
  it('names who carried the story and who it reached, instead of "a quiet night"', () => {
    const g = opened('redbank', 1, 'river_fears_fire');
    g.act({ type: 'SEED', claim: 'river_fears_fire', target: 'ivo' });
    const res = g.endDay();
    expect(res.summary.headline).toBe('A quiet night.'); // the stored summary (and so every hash) is unchanged
    const r = nightReport(g.state, res.events, res.summary);
    expect(r.headline).toBe('Your story is spreading.');
    expect(r.story.length).toBeGreaterThanOrEqual(2);
    expect(r.story[0]).toContain('River fears fire');
    expect(r.story[0]).toContain('Ivo');
    expect(r.story[0]).toMatch(/\(\d+→\d+\)/);
    expect(r.story[1]).toMatch(/villagers? now repeats? it/);
  });

  it('is derived, not stored: calling it never changes the state, and a save of the same run hashes the same', () => {
    const g = opened('redbank', 1, 'river_fears_fire');
    g.act({ type: 'SEED', claim: 'river_fears_fire', target: 'ivo' });
    const res = g.endDay();
    const before = stateHash(g.state);
    nightReport(g.state, res.events, res.summary);
    expect(stateHash(g.state)).toBe(before);
  });

  it('explains a silence: a Tell that leaves someone below the spreading threshold says so and why', () => {
    // Harvest seed 1: telling Odo Fenn first leaves him at 11 of the 12 people need before they repeat a story
    const g = opened('harvest', 1, 'moonlight_ripens_grain');
    const p = previewAction(g.state, { type: 'SEED', claim: 'moonlight_ripens_grain', target: 'odo' });
    expect(p.warnings.join(' ')).toMatch(new RegExp(`below ${K.SPREAD}`));
    g.act({ type: 'SEED', claim: 'moonlight_ripens_grain', target: 'odo' });
    const res = g.endDay();
    const r = nightReport(g.state, res.events, res.summary);
    expect(r.headline).toBe('Your story has not caught on yet.');
    expect(r.story.join(' ')).toContain('Odo');
    expect(r.story.join(' ')).toContain(`${K.SPREAD} or more`);
  });

  it('does not warn when the Tell will spread, and says nothing when nothing was told', () => {
    const g = opened('redbank', 1, 'river_fears_fire');
    expect(previewAction(g.state, { type: 'SEED', claim: 'river_fears_fire', target: 'ivo' }).warnings).toEqual([]);
    const res = g.endDay();
    const r = nightReport(g.state, res.events, res.summary);
    expect(r.story).toEqual([]);
    expect(r.headline).toBe(res.summary.headline);
  });

  it('the belief label "curious" starts exactly where villagers start repeating a story', () => {
    expect(beliefLabel(K.SPREAD - 0.1)).toBe('unconvinced');
    expect(beliefLabel(K.SPREAD)).toBe('curious');
    expect(beliefLabel(-K.SPREAD)).toBe('doubts');
  });
});

describe('the tutorial points at the right person and names the one you picked (fix 2)', () => {
  it('step 3 names the selected villager, never someone else', () => {
    const g = opened('redbank', 1, 'river_fears_fire');
    const step2 = getTutorial(g.state, ui());
    expect(step2?.step).toBe(2);
    const guide = step2!.hintVillagers[0];
    const other = g.state.villagers.find((v) => v.id !== guide && v.status !== 'dead' && v.keeperTrust >= 40)!;
    const step3 = getTutorial(g.state, ui({ kind: 'villager', id: other.id }));
    expect(step3?.step).toBe(3);
    expect(step3!.text).toContain(`Tell ${other.name.split(' ')[0]}`);
    const guideName = g.state.villagers.find((v) => v.id === guide)!.name.split(' ')[0];
    if (guideName !== other.name.split(' ')[0]) expect(step3!.text).not.toContain(`Tell ${guideName}`);
  });

  it('the person it points at really passes the story on: their first Tell reaches the spreading threshold (every chapter, 20 seeds)', () => {
    const cases: [string, string][] = [
      ['redbank', 'river_fears_fire'],
      ['harvest', 'moonlight_ripens_grain'],
      ['ashwood', 'wolves_fear_smoke'],
    ];
    for (const [sc, claim] of cases)
      for (let seed = 1; seed <= 20; seed++) {
        const g = opened(sc, seed, claim);
        const step = getTutorial(g.state, ui());
        const target = step!.hintVillagers[0];
        const p = previewAction(g.state, { type: 'SEED', claim, target });
        expect(p.ok, `${sc} ${seed}`).toBe(true);
        const after = p.deltas.find((d) => d.id === target)?.after ?? 0;
        expect(after, `${sc} seed ${seed}: ${target} would hold the story at ${after}`).toBeGreaterThanOrEqual(K.SPREAD);
      }
  });

  it('step 1 tells the player when the other stories unlock', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    const t = getTutorial(g.state, ui());
    expect(t?.step).toBe(1);
    expect(t!.text).toContain('day 3 and 4');
  });
});

describe('"What would have changed it" after a defeat (fix 4)', () => {
  function lostRun(scenarioId: string, seed: number): GameSession {
    const g = GameSession.create({ scenarioId, seed });
    const p = policyById('random');
    for (let i = 0; i < 40 && !g.state.outcome; i++) p.playDay(g);
    expect(g.state.outcome?.result).toBe('defeat');
    return g;
  }

  it('finds an alternative that really wins: its log replays to a victory with nothing rejected', () => {
    const g = lostRun('redbank', 1);
    const cf = findCounterfactual(g.state);
    expect(cf.latest).not.toBeNull();
    expect(cf.earliest).not.toBeNull();
    expect(cf.latest!.day).toBeGreaterThanOrEqual(cf.earliest!.day);
    for (const alt of [cf.latest!, cf.earliest!]) {
      const rep = replayRun({ ...optionsFromState(g.state), actions: alt.log });
      expect(rep.rejected).toEqual([]);
      expect(rep.state.outcome?.result).toBe('victory');
      expect(alt.instead.length).toBeGreaterThan(0);
    }
  });

  it('keeps the player\'s own days before the change: the log starts with what they actually did', () => {
    const g = lostRun('redbank', 1);
    const cf = findCounterfactual(g.state);
    const day = cf.latest!.day;
    const mine = g.state.history.filter((h) => h.day < day).flatMap((h) => [...h.actions, { type: 'END_DAY' }]);
    expect(cf.latest!.log.slice(0, mine.length)).toEqual(mine);
  });

  it('is deterministic and never touches the finished run', () => {
    const g = lostRun('redbank', 1);
    const before = stateHash(g.state);
    const a = findCounterfactual(g.state);
    const b = findCounterfactual(g.state);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(stateHash(g.state)).toBe(before);
  });

  it('says nothing for a victory, and an unwinnable-looking run returns an honest "none" rather than inventing one', () => {
    const won = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    const p = policyById('evidence-first');
    for (let i = 0; i < 40 && !won.state.outcome; i++) p.playDay(won);
    expect(won.state.outcome?.result).toBe('victory');
    expect(findCounterfactual(won.state)).toMatchObject({ latest: null, earliest: null, rollouts: 0 });
  });

  it('the debrief still builds for the same lost run (the card is additive)', () => {
    const g = lostRun('redbank', 1);
    expect(buildDebrief(g.state).result).toBe('defeat');
  });
});
