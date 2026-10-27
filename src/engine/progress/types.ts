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
  /** short integrity fingerprint of the key outcome fields (for local comparison only; not a security feature) */
  signature: string;
  finishedAt?: string;
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
  };
}

export function emptyProgress(): Progress {
  return { version: PROGRESS_VERSION, runs: [], achievements: {}, unlocks: {}, atlas: { laws: {}, knowledge: {}, postcards: {} } };
}
