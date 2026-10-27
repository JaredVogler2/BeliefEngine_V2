/**
 * Villager minds (phase 07): a personality, goals and episodic memories for every villager of a V2 run, under `s.v2.minds`.
 * Classic runs never have it. Everything here is plain JSON (cloned, hashed and saved with the run).
 *
 * Memories are facts the engine recorded, each with where it came from: the event that produced it, whether the villager saw it
 * or was told, and by whom. A model may read them and cite them; it never writes them. Belief and trust numbers stay where V1
 * keeps them (`Villager.beliefs`, `edges`): a mind holds what a villager remembers and how they tend to act, not what they believe.
 */

export const TRAITS = ['curiosity', 'skepticism', 'ambition', 'fear', 'altruism', 'stubbornness', 'courage'] as const;
export type Trait = (typeof TRAITS)[number];
export type Personality = Record<Trait, number>;

export const GOALS = ['feed_family', 'protect_home', 'protect_bridge', 'protect_herd', 'protect_fields', 'gain_standing', 'find_proof', 'keep_order', 'oppose_rumours', 'keep_safe'] as const;
export type GoalId = (typeof GOALS)[number];

export const EPISODE_KINDS = [
  'keeper_told', // the Keeper told them a story
  'told', // another villager told them a story
  'campaigned', // a rival campaigned at them
  'saw_proof', // watched a demonstration work
  'saw_proof_fail', // watched one fail
  'saw_law_work', // saw a law (or a written belief) act
  'law_news', // heard a law took hold or failed
  'saw_fire',
  'saw_flood',
  'saw_wolves',
  'lost_kin',
  'lost_home',
  'lost_herd',
  'lost_crop',
  'trapped',
  'saw_death',
  'bridge_fell',
  'npc_spoke', // another villager acted toward them (asked, argued, comforted, persuaded)
  'talked_keeper', // the Keeper talked with them
] as const;
export type EpisodeKind = (typeof EPISODE_KINDS)[number];

export interface Episode {
  /** unique within the run: `m<number>` */
  id: string;
  day: number;
  kind: EpisodeKind;
  /** what happened, in plain words built from game facts (never the player's own free text) */
  text: string;
  /** saw it themselves (true) or were told (false) */
  witnessed: boolean;
  /** who told them: a villager id, 'keeper', or null for what the whole village talks about */
  source: string | null;
  /** how much they trust where it came from, 0..100 (100 when they saw it) */
  credibility: number;
  salience: 0 | 1 | 2 | 3;
  /** how it felt: -2 grief or fear .. +2 relief or hope */
  valence: -2 | -1 | 0 | 1 | 2;
  claim: string | null;
  /** provenance: the log event that recorded it */
  event: number | null;
  /** a region or landmark id */
  place: string | null;
  /** private: about their own household; public: anyone nearby could know it */
  scope: 'public' | 'private';
  /** needed to judge whether a story or law works: never forgotten */
  judge: boolean;
}

/** Older, less important memories folded into one line, keeping where they came from. */
export interface SummaryLine {
  text: string;
  days: [number, number];
  kind: EpisodeKind;
  claim: string | null;
  sources: string[];
  events: number[];
  count: number;
}

export interface Mind {
  personality: Personality;
  /** the personality they started with: drift from major events stays within DRIFT of it */
  base: Personality;
  goals: GoalId[];
  episodes: Episode[];
  summary: SummaryLine[];
}

export interface MindsState {
  v: 1;
  agents: Record<string, Mind>;
  nextEpisode: number;
  /** the last log event already turned into memories */
  seen: number;
}

export const MAX_EPISODES = 24;
export const MAX_SUMMARY = 8;
/** new memories a villager keeps from one day (the most salient) */
export const MAX_NEW_PER_DAY = 5;
/** how far personality may drift from where it started */
export const DRIFT = 15;
/** how far (tiles) a villager sees what happens around them */
export const SIGHT = 6;
