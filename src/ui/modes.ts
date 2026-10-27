import {
  GEN_VERSION, catalogEntries, dailySeed, encodeShare, expeditionId, generateExpedition, isVerifiedSeed, numberToDate, parseExpeditionId, pickVerified, utcDateNumber,
} from '../engine/index.ts';
import type { CreateRunOptions, Difficulty, RunState, ShareDescriptor } from '../engine/index.ts';
import { RULES_VERSION } from '../engine/core/types.ts';

/** Run setup helpers shared by the mode screens, the briefing, the debrief and share-link handling. */

export const todayUtc = (): number => utcDateNumber(new Date());

export function storyOptions(scenarioId: string, seed = 1, difficulty: Difficulty = 'normal'): CreateRunOptions {
  return { scenarioId, seed, difficulty, mode: 'story' };
}

export function expeditionOptions(seed: number, difficulty: Difficulty = 'normal'): CreateRunOptions {
  return { scenarioId: expeditionId(seed), seed, difficulty, mode: 'expedition' };
}

export function dailyOptions(date: number): CreateRunOptions {
  const seed = dailySeed(date);
  return { scenarioId: expeditionId(seed), seed, difficulty: 'normal', mode: 'daily', dailyDate: date };
}

export function randomEntropy(): number {
  const a = new Uint32Array(1);
  window.crypto.getRandomValues(a);
  return a[0];
}

/** A random verified village, avoiding the ones already played when possible. */
export function freshExpeditionSeed(played: readonly number[]): number {
  if (catalogEntries().length === 0) return randomEntropy() % 1000000;
  return pickVerified(randomEntropy(), played);
}

export interface VillagePreview {
  seed: number;
  id: string;
  name: string;
  biome: string;
  population: number;
  days: number;
  modifiers: string[];
  verified: boolean;
  attempt: number;
}

export function previewVillage(seed: number): VillagePreview {
  const x = generateExpedition(seed);
  return { seed, id: x.id, name: x.def.runtime.name, biome: x.bp.biome, population: x.bp.population, days: x.def.runtime.durationDays, modifiers: x.bp.modifiers, verified: isVerifiedSeed(seed), attempt: x.attempt };
}

export const BIOME_LABEL: Record<string, string> = { river: 'Flood', drought: 'Drought', wolves: 'Wolves' };

export function runKind(s: RunState): 'story' | 'expedition' | 'daily' {
  return s.mode === 'daily' ? 'daily' : s.mode === 'expedition' || parseExpeditionId(s.scenarioId) ? 'expedition' : 'story';
}

export function shareDescriptor(s: RunState): ShareDescriptor {
  const kind = runKind(s);
  return {
    mode: kind, scenario: kind === 'story' ? s.scenarioId : undefined, seed: s.seed, date: kind === 'daily' ? s.flags.dailyDate : undefined,
    difficulty: s.difficulty, rules: RULES_VERSION, gen: GEN_VERSION,
  };
}

export function shareLink(s: RunState): string {
  return `${window.location.origin}${window.location.pathname}?${encodeShare(shareDescriptor(s))}`;
}

export function optionsFromDescriptor(d: ShareDescriptor): CreateRunOptions {
  if (d.mode === 'story') return storyOptions(d.scenario ?? 'redbank', d.seed, d.difficulty);
  if (d.mode === 'daily') return { scenarioId: expeditionId(d.seed), seed: d.seed, difficulty: 'normal', mode: 'daily', dailyDate: d.date };
  return expeditionOptions(d.seed, d.difficulty);
}

export function dailyLabel(date: number): string {
  return numberToDate(date);
}
