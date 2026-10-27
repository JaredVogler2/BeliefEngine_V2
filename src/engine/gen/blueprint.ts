import type { Id } from '../core/types.ts';

export type Biome = 'river' | 'drought' | 'wolves';

/** A compact, serialisable description of a generated village; used for signatures, the briefing and debug logs. */
export interface Blueprint {
  biome: Biome;
  village: string;
  size: [number, number];
  population: number;
  days: number;
  /** biome-specific headline numbers (surge level, pack count, dry spell length ...) */
  surge?: number;
  bridgeX?: number;
  bridgeY?: number;
  bottleneck: boolean;
  starters: Id[];
  rival: Id | null;
  modifiers: Id[];
  claims: Id[];
  /** free-form extras for the signature and the briefing */
  extras?: Record<string, number | string | boolean>;
}

export function clone<T>(x: T): T {
  return structuredClone(x);
}
