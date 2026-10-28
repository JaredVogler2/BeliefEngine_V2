import type { Difficulty, Id, RunMode } from '../core/types.ts';

export const PROGRESS_VERSION = 2;

/** One finished run, kept locally. Contains no personal data: only what happened in the game. */
export interface RunRecord {
  /** scenario + seed + final state hash: the same finished run is never counted twice */
  id: string;
  scenarioId: Id;
  name: string;
  mode: RunMode;
  /** for expedition villages: river | drought | wolves */
  biome?: string;
  seed: number;
  difficulty: Difficulty;
  result: 'victory' | 'defeat';
  score: number;
  medal: 'none' | 'bronze' | 'silver' | 'gold';
  day: number;
  alive: number;
  total: number;
  rules: string;
  dailyDate?: number;
  modifiers: string[];
  pledges: string[];
  drafted: boolean;
  twisted: number;
  /** claim ids whose laws formed */
  laws: string[];
  /** coarse description of the plan: scenario or biome plus the laws used (and trade) */
  strategy: string;
  apSpent: number;
  rescued: number;
  /** true if the run used the debug loader; such runs never earn rewards */
  debug: boolean;
  /** an Inventor run (the player wrote beliefs): kept apart from ranked records, earns only its own badge */
  custom?: boolean;
  /**
   * the V2 mode it was played in (absent: Classic). Each keeps its own records and bests, apart from Classic's: a Generative
   * Chronicle (written beliefs) or a Living Village counts only among its own kind; Reality Lab is unranked, like an Inventor run.
   */
  variant?: RunVariant;
  /** short integrity fingerprint of the key outcome fields (for local comparison only; not a security feature) */
  signature: string;
  finishedAt?: string;
}

export type RunVariant = 'chronicle' | 'living' | 'lab';
export const VARIANT_LABEL: Record<RunVariant, string> = { chronicle: 'Generative Chronicle', living: 'Living Village', lab: 'Reality Lab' };

/** A belief the player wrote that became law, kept for remembering: it gives no power to any later run. */
export interface AtlasInvented {
  /** its mechanics fingerprint: the same belief written again in another run is the same entry */
  hash: string;
  text: string;
  short: string;
  /** what it did, in the engine's words (one line per clause) */
  mechanics: string;
  scenarios: string[];
  activations: number;
  /** event codes that showed it doing something in the world */
  effects: string[];
}

export interface AtlasLaw {
  claimId: Id;
  text: string;
  short: string;
  benefit: string;
  risk: string;
  scenarios: string[];
  regions: string[];
  activations: number;
  /** event codes that showed this law doing something in the world */
  effects: string[];
}

export interface Progress {
  version: typeof PROGRESS_VERSION;
  runs: RunRecord[];
  achievements: Record<Id, { run: string; at?: string }>;
  unlocks: Record<Id, { run: string; at?: string }>;
  atlas: {
    laws: Record<Id, AtlasLaw>;
    knowledge: Record<Id, { run: string }>;
    postcards: Record<Id, string[]>;
    /** beliefs written in Generative Chronicle runs that became law (keyed by mechanics hash) */
    invented?: Record<string, AtlasInvented>;
  };
}

export function emptyProgress(): Progress {
  return { version: PROGRESS_VERSION, runs: [], achievements: {}, unlocks: {}, atlas: { laws: {}, knowledge: {}, postcards: {} } };
}
