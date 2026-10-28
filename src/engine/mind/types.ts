import type { RealityAst } from '../reality/ast.ts';

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

export const INTENTS = ['spread', 'ask', 'investigate', 'challenge', 'comfort', 'persuade', 'move', 'stage_evidence', 'support_rescue', 'request_test', 'wait'] as const;
export type Intent = (typeof INTENTS)[number];
export const TONES = ['calm', 'warm', 'wary', 'angry', 'fearful', 'hopeful', 'amused', 'grieving'] as const;
export type Tone = (typeof TONES)[number];
export const APPROACHES = ['evidence', 'testimony', 'emotion', 'authority', 'humor', 'silence'] as const;
export type Approach = (typeof APPROACHES)[number];
/** why a villager stops to think: the salient moments of phase 07 */
export const MOMENTS = ['novel_claim', 'argument', 'contradiction', 'loss', 'law_change', 'faction_move', 'conversation', 'crisis', 'proof_seen'] as const;
export type Moment = (typeof MOMENTS)[number];

/** A decision, whoever proposed it (a model or the game's own policy). The engine decides what it does. */
export interface Choice {
  citizenId: string;
  intent: Intent;
  /** a villager or landmark id from that move's legal targets, or null when the move takes none */
  target: string | null;
  claimId: string | null;
  /** one short spoken line, shown, never followed */
  dialogue: string | null;
  /** ids of this villager's own memories the decision rests on */
  cites: string[];
  tone: Tone;
  approach: Approach;
  /** the villager's own guess, never authoritative */
  confidence: number;
  /** one plain sentence for the audit trail */
  thought: string;
  source: 'model' | 'policy';
}

/** A skeptic's demand to see a story shown before they will believe it (phase 08). */
export interface TruthTest {
  by: string;
  claim: string;
  /** asked on this day; answered by a demonstration they see on or before `until` */
  day: number;
  until: number;
  /** where it could be shown (a landmark id), or null */
  place: string | null;
}

/** A competing claim a villager announced (a day ahead) or made, in the reality language (phase 08). */
export interface NpcClaim {
  by: string;
  /** the Keeper story it answers */
  against: string;
  text: string;
  ast: RealityAst;
  day: number;
  state: 'announced' | 'made' | 'withdrawn';
  claim: string | null;
}

/** A villager due to think today, and why. */
export interface Queued {
  id: string;
  why: Moment;
  claim: string | null;
  /** the event that made the moment */
  event: number | null;
}

export interface MindsState {
  v: 1;
  agents: Record<string, Mind>;
  nextEpisode: number;
  /** the last log event already turned into memories */
  seen: number;
  /** who thinks today (planned last night), at most THINKERS_PER_DAY */
  queue: Queued[];
  /** decisions a model proposed today and the game accepted; the rest of the queue uses the policy at dusk */
  decided: Record<string, Choice>;
  /** what villagers decided at the last dusk, for the player to read */
  last: Choice[];
  /** tonight only: villager id → a home whose owner took them in (support_rescue) */
  refuge: Record<string, string>;
  /** tonight only: villager id → the shelter they chose to go to early (move) */
  moves: Record<string, string>;
  /** model decisions accepted in this run, and the most it may use */
  modelUsed: number;
  modelCap: number;
  /** open demands for proof (phase 08); absent in runs made before them */
  tests?: TruthTest[];
  /** competing claims villagers announced or made (phase 08) */
  npcClaims?: NpcClaim[];
  /** Keeper story id → villager claims that contest it (they crowd each other out both ways) */
  contested?: Record<string, string[]>;
  /** tonight only: villager id → the story they argued at dusk (they do not also gossip it that night: one day's social energy) */
  argued?: Record<string, string>;
}

export const THINKERS_PER_DAY = 4;
/** a Living Village gives more villagers a moment to think each day (the request to a model still carries at most six) */
export const LIVING_THINKERS_PER_DAY = 6;
export const thinkersPerDay = (s: { v2?: { living?: boolean } }): number => (s.v2?.living ? LIVING_THINKERS_PER_DAY : THINKERS_PER_DAY);
export const MODEL_DECISIONS_PER_RUN = 120;

export const MAX_EPISODES = 24;
export const MAX_SUMMARY = 8;
/** new memories a villager keeps from one day (the most salient) */
export const MAX_NEW_PER_DAY = 5;
/** how far personality may drift from where it started */
export const DRIFT = 15;
/** how far (tiles) a villager sees what happens around them */
export const SIGHT = 6;
