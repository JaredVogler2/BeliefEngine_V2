import raw from './catalog.json' with { type: 'json' };
import { hashKeys, Stream } from '../core/rng.ts';
import { GEN_VERSION, MAX_SEED } from './expedition.ts';
import type { Biome } from './blueprint.ts';

/**
 * The verified-village catalog. Entries were produced offline by `npm run gen:verify`: each seed's village (generator version,
 * seed, drawn modifiers) was won by at least one scripted planner, and a do-nothing run lost. Any other seed still works, but is
 * shown to the player as unverified.
 */
export interface CatalogEntry {
  seed: number;
  biome: Biome;
  modifiers: string[];
  wins: string[];
  population: number;
  days: number;
}

interface CatalogFile {
  format: string;
  genVersion: number;
  rulesVersion: string;
  tried: number;
  verified: CatalogEntry[];
}

const file = raw as unknown as CatalogFile;

export function catalogEntries(): CatalogEntry[] {
  return file.genVersion === GEN_VERSION ? file.verified : [];
}

export function catalogInfo(): { genVersion: number; rulesVersion: string; tried: number; verified: number } {
  return { genVersion: file.genVersion, rulesVersion: file.rulesVersion, tried: file.tried, verified: catalogEntries().length };
}

export function isVerifiedSeed(seed: number): boolean {
  return catalogEntries().some((e) => e.seed === seed);
}

/**
 * The village for a UTC calendar day: a pure function of the date and the bundled catalog. It is drawn from the villages that at
 * least two different scripted planners won (so the day offers more than one road to victory); with an empty catalog a hashed
 * seed is used instead. Share links also carry the seed, so an old link keeps its village even if a later build bundles a
 * different catalog.
 */
export function dailySeed(dateNumber: number): number {
  const all = catalogEntries();
  if (all.length === 0) return hashKeys(GEN_VERSION, 'daily', dateNumber, 0) & MAX_SEED;
  const strong = all.filter((e) => e.wins.length >= 2);
  const list = strong.length >= 30 ? strong : all;
  return list[hashKeys(GEN_VERSION, 'daily-pick', dateNumber) % list.length].seed;
}

/** A different verified village: deterministic given the entropy value the caller supplies (so tests can fix it). */
export function pickVerified(entropy: number, avoid: readonly number[] = [], biome?: Biome): number {
  let list = catalogEntries();
  if (biome) list = list.filter((e) => e.biome === biome);
  const fresh = list.filter((e) => !avoid.includes(e.seed));
  const pool = fresh.length ? fresh : list;
  if (pool.length === 0) return new Stream(entropy, 'free-seed').int(MAX_SEED);
  return pool[Math.abs(Math.floor(entropy)) % pool.length].seed;
}
