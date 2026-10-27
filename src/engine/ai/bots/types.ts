import type { GameSession } from '../../core/session.ts';

/** A bot plays through the SAME public GameSession API as a human or MCP agent. */
export interface Policy {
  name: string;
  /** play out one planning phase (spend Influence) and END the day */
  playDay(g: GameSession): void;
}

export interface BotRunResult {
  policy: string;
  seed: number;
  scenarioId: string;
  result: 'victory' | 'defeat' | 'timeout';
  day: number;
  score: number;
  alive: number;
  homes: number;
  food: number;
  apSpent: number;
  lawsActivated: string[];
  actions: number;
  log: import('../../core/types.ts').Action[];
}
