import type { Id, RunState } from '../core/types.ts';
import { aliveCount } from '../world/economy.ts';
import type { Progress, RunRecord } from './types.ts';
import { pledgesOf } from './options.ts';

/**
 * Achievements correspond to real strategic acts. Every one is evaluated from the finished run (and, for a few, from the local
 * archive), and every one has a proof in tests/unit/progress.test.ts: a seed and a planner (or a short run sequence) that earns it.
 */
export interface AchievementCtx {
  s: RunState;
  rec: RunRecord;
  /** the archive before this run */
  before: Progress;
  /** archive records including this run */
  runs: RunRecord[];
  /** law claim ids recorded in the Atlas after this run */
  atlasLaws: Set<string>;
  /** knowledge ids this run revealed for the first time */
  newKnowledge: string[];
}

export interface AchievementDef {
  id: Id;
  name: string;
  desc: string;
  icon: string;
  test(c: AchievementCtx): boolean;
}

const won = (c: AchievementCtx) => c.rec.result === 'victory';
const has = (s: RunState, code: string) => s.log.some((e) => e.code === code);
const hasFireRitual = (s: RunState) => s.scn.rituals.some((r) => r.physical === 'light' || r.physical === 'smoke');
/** Districts in which some law took hold at any point of the run. */
export const regionsOfLaws = (s: RunState) => new Set(s.laws.filter((l) => l.activatedDay !== null).map((l) => l.regionId));
const STARTER_LAWS = ['river_fears_fire', 'bridge_stands_watched', 'moonlight_ripens_grain', 'rain_follows_bells', 'wolves_fear_smoke', 'wolves_follow_smoke'];

/** Thrifty: a victory that never spent more than this many Influence per day on average. */
export const FRUGAL_AP_PER_DAY = 1.5;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_law', name: 'The first law', icon: 'scroll', desc: 'Get a story believed so widely that the world obeys it.', test: (c) => c.s.stats.lawsActivated.length > 0 },
  { id: 'counter_wave', name: 'Not on my watch', icon: 'eye', desc: 'Win after answering a rival’s campaign with a challenge that blunted it.', test: (c) => won(c) && c.s.stats.rivalCountered >= 1 },
  { id: 'no_beacons', name: 'Cold hands', icon: 'bridge', desc: 'Win a scenario where fire rituals are available without lighting a single fire.', test: (c) => won(c) && c.s.stats.noBeacons && hasFireRitual(c.s) },
  { id: 'hard_win', name: 'Against the grain', icon: 'star', desc: 'Win on Hard: less fuel, less trust, a bolder rival.', test: (c) => won(c) && c.rec.difficulty === 'hard' },
  { id: 'max_surge', name: 'The bridge held', icon: 'bridge', desc: 'Win a flood with the bridge still standing after a surge of level 6 or more.', test: (c) => won(c) && !!c.s.scn.features.bridge && c.s.scn.threat.some((t) => t.level >= 6) && c.s.world.landmarks.some((l) => l.kind === 'bridge' && l.hp > 0) },
  { id: 'unshaken', name: 'Unshaken', icon: 'flame', desc: 'Win after a law of yours failed in public before the final night and was still standing at the end.', test: (c) => won(c) && c.s.log.some((e) => e.code === 'LAW_DISCREDITED' && e.day < c.s.maxDay && c.s.laws.some((l) => l.claimId === e.claim && l.status === 'active')) },
  { id: 'two_districts', name: 'Two districts, two laws', icon: 'compass', desc: 'Have laws take hold in two different districts in one run.', test: (c) => regionsOfLaws(c.s).size >= 2 },
  { id: 'all_home', name: 'Nobody left behind', icon: 'home', desc: 'Win with every villager alive.', test: (c) => won(c) && aliveCount(c.s) === c.s.villagers.length },
  { id: 'rival_tune', name: 'Turn the rival’s tune', icon: 'skull', desc: 'Win with a law that began as a rival’s theory, adopted and put to work.', test: (c) => won(c) && c.s.laws.some((l) => l.activatedDay !== null && c.s.scn.claimDefs.find((d) => d.id === l.claimId)?.adoptable === true) },
  { id: 'few_words', name: 'Few words', icon: 'clock', desc: `Win spending at most ${FRUGAL_AP_PER_DAY} Influence per day on average.`, test: (c) => won(c) && c.s.stats.apSpent <= FRUGAL_AP_PER_DAY * c.s.maxDay },
  { id: 'two_roads', name: 'Two roads', icon: 'book', desc: 'Win two different story chapters.', test: (c) => new Set(c.runs.filter((r) => r.result === 'victory' && r.mode === 'story' && !r.debug).map((r) => r.scenarioId)).size >= 2 },
  { id: 'three_biomes', name: 'Wanderer', icon: 'compass', desc: 'Win an expedition in a flood, a drought and a wolf wood.', test: (c) => new Set(c.runs.filter((r) => r.result === 'victory' && r.mode === 'expedition' && !r.debug && r.biome).map((r) => r.biome)).size >= 3 },
  { id: 'grain_road', name: 'Grain on the road', icon: 'wheat', desc: 'Win after a grain caravan reached the village.', test: (c) => won(c) && has(c.s, 'CARAVAN_ARRIVES') },
  { id: 'unburned', name: 'Fields untouched', icon: 'wheat', desc: 'Win without losing a single field to fire, flood or ruin.', test: (c) => won(c) && c.s.world.landmarks.some((l) => l.kind === 'field') && c.s.stats.fieldsBurned === 0 && !has(c.s, 'FIELD_FLOODED') && !has(c.s, 'FIELD_BURNED') && c.s.world.landmarks.filter((l) => l.kind === 'field').every((f) => !f.data.ruined && !f.data.burned) },
  { id: 'daily_done', name: 'The day’s village', icon: 'clock', desc: 'Win a Daily Village.', test: (c) => won(c) && c.rec.mode === 'daily' },
  { id: 'cartographer', name: 'Cartographer of belief', icon: 'book', desc: 'Record all six starting laws in the Atlas.', test: (c) => STARTER_LAWS.every((id) => c.atlasLaws.has(id)) },
  { id: 'pledge_kept', name: 'A promise kept', icon: 'check', desc: 'Win while keeping a pledge.', test: (c) => won(c) && pledgesOf(c.s.modifiers).length > 0 },
  { id: 'heroic', name: 'Heroic', icon: 'star', desc: 'Meet a scenario’s heroic goal.', test: (c) => won(c) && c.s.outcome?.heroic === true },
  { id: 'five_paths', name: 'Five paths', icon: 'list', desc: 'Log five different strategies in the archive.', test: (c) => new Set(c.runs.filter((r) => !r.debug && r.laws.length > 0).map((r) => r.strategy)).size >= 5 },
  { id: 'custom_law', name: 'Author of a law', icon: 'scroll', desc: 'Write a belief of your own in an Inventor run and see it become law.', test: (c) => c.s.laws.some((l) => l.activatedDay !== null && !!c.s.claims.find((x) => x.id === l.claimId)?.def?.custom) },
  { id: 'hard_lesson', name: 'Learned the hard way', icon: 'warn', desc: 'Lose a run and learn something new about how the world works.', test: (c) => c.rec.result === 'defeat' && c.newKnowledge.length > 0 },
];

export function achievementDef(id: Id): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

