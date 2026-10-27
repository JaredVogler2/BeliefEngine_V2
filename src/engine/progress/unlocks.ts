import type { Id } from '../core/types.ts';
import { regionsOfLaws, type AchievementCtx } from './achievements.ts';

/**
 * Unlocks widen what a player can *choose*; none makes a scenario easier to win by raw power, and every scenario stays beatable
 * with none of them. Each one names the accessible option it opens.
 */
export interface UnlockDef {
  id: Id;
  name: string;
  /** how it is earned */
  how: string;
  /** what it changes in the game */
  opens: string;
  test(c: AchievementCtx): boolean;
}

const won = (c: AchievementCtx) => c.rec.result === 'victory';

export const UNLOCKS: UnlockDef[] = [
  {
    id: 'starter_fireproof', name: 'Fireproof Hearts',
    how: 'Win Flood at Redbank with at least 12 survivors.',
    opens: 'An extra opening story for Redbank: “Flames cannot hurt us”. It cuts fire damage to homes by up to 75% and makes sparks up to 60% more frequent.',
    test: (c) => won(c) && c.s.scenarioId === 'redbank' && c.rec.alive >= 12,
  },
  {
    id: 'pledge_no_fire', name: 'Bridgekeeper’s Oath',
    how: 'Win a scenario with fire rituals without lighting a single fire.',
    opens: 'The Oath pledge in every briefing: light no fire this run, for +20% score.',
    test: (c) => won(c) && c.s.stats.noBeacons && c.s.scn.rituals.some((r) => r.physical === 'light' || r.physical === 'smoke'),
  },
  {
    id: 'story_twists', name: 'Challenge twists',
    how: 'Win any story chapter.',
    opens: 'You may add twists (the same ones expeditions draw) to story chapters, for +10% score each.',
    test: (c) => won(c) && c.rec.mode === 'story',
  },
  {
    id: 'preset_hostile_council', name: 'Hostile council',
    how: 'Win a run in which the Council banned gatherings.',
    opens: 'The Hostile council preset for story chapters: a divided Council and a travelling circus at once.',
    test: (c) => won(c) && c.s.modifiers.includes('divided_council'),
  },
  {
    id: 'draft_mode', name: 'Draft your stories',
    how: 'Have laws take hold in two different districts in one run.',
    opens: 'Draft mode in the briefing: keep only two of a scenario’s stories, for +15% score.',
    test: (c) => regionsOfLaws(c.s).size >= 2,
  },
  {
    id: 'challenge_board', name: 'The challenge board',
    how: 'Log five different strategies in the archive.',
    opens: 'Three more pledges in the briefing: Quiet streets (no gatherings), Thin voice (one less Influence a day) and Not one lost.',
    test: (c) => new Set(c.runs.filter((r) => !r.debug && r.laws.length > 0).map((r) => r.strategy)).size >= 5,
  },
];

export function unlockDef(id: Id): UnlockDef | undefined {
  return UNLOCKS.find((u) => u.id === id);
}

/** Which unlock opens each pledge. */
export const PLEDGE_UNLOCK: Record<string, string> = {
  no_fire: 'pledge_no_fire',
  no_gathering: 'challenge_board',
  thin_voice: 'challenge_board',
  all_alive: 'challenge_board',
};
