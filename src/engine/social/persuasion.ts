import type { Belief, ClaimDef, Edge, RunState, Villager } from '../core/types.ts';
import { clamp } from '../core/rng.ts';

/**
 * Persuasion math. Everything is multiplication of bounded factors, so each term can be explained in the UI.
 * No transcendental functions (exp/pow/log) are used: results must be bit-identical across JS engines.
 */
export const K = {
  /** conviction points a perfect exposure would give */
  BASE: 28,
  /** conviction points a perfect Keeper seeding would give */
  SEED: 28,
  /** per-day cap on net change from gossip for one claim (saturation) */
  DAILY_CAP: 34,
  /** daily proportional decay of un-reinforced conviction */
  DECAY: 0.05,
  /** total positive conviction a villager can hold across all claims (finite attention) */
  ATTENTION: 190,
  GATHER: 0.7,
  MESSENGER: 2.0,
  /** fraction of a positive shift pushed against each contradicting claim */
  CONTRADICT: 0.4,
  /** conviction (either sign) at which a villager starts repeating a story to their friends overnight */
  SPREAD: 12,
};

export function emptyBelief(): Belief {
  return { conv: 0, heard: 0, lastDay: -1, lastSource: null, evidence: 0, cause: null, stale: 0 };
}

export function beliefOf(v: Villager, claimId: string): Belief {
  return v.beliefs[claimId] ?? emptyBelief();
}

export function ensureBelief(v: Villager, claimId: string): Belief {
  let b = v.beliefs[claimId];
  if (!b) {
    b = emptyBelief();
    v.beliefs[claimId] = b;
  }
  return b;
}

/** Is this claim about the listener's own neighbourhood? Local claims land harder. */
export function relevance(def: ClaimDef, listener: Villager): number {
  const districts = new Set<string>();
  for (const r of def.regions) for (const d of def.electorate?.[r] ?? [r]) districts.add(d);
  return districts.has(listener.district) ? 1 : 0.55;
}

export type ReasonCode =
  | 'FRIEND_TRUST'
  | 'FAMILY_TRUST'
  | 'WITNESS_ACCOUNT'
  | 'FACTION_PRESSURE'
  | 'THREAT_PANIC'
  | 'DISTRUST_REVERSAL'
  | 'KEEPER_WORD'
  | 'PUBLIC_DEMONSTRATION'
  | 'CONTRADICTORY_WITNESS'
  | 'GATHERING'
  | 'MESSENGER'
  | 'COUNTER'
  | 'CONTRADICTION'
  | 'FATIGUE'
  | 'DECAY'
  | 'RIVAL_CAMPAIGN'
  | 'LAW_WITNESS';

export const REASON_TEXT: Record<string, string> = {
  FRIEND_TRUST: 'a friend vouched for it',
  FAMILY_TRUST: 'family said so',
  WITNESS_ACCOUNT: 'someone who saw it told them',
  FACTION_PRESSURE: 'their circle repeated it',
  THREAT_PANIC: 'fear of the flood made them listen',
  DISTRUST_REVERSAL: 'they distrust the speaker, so it backfired',
  KEEPER_WORD: 'the Keeper told them directly',
  PUBLIC_DEMONSTRATION: 'they watched it happen',
  CONTRADICTORY_WITNESS: 'they saw something that contradicted it',
  GATHERING: 'the gathering moved them',
  MESSENGER: 'a trusted messenger carried it',
  COUNTER: 'the Keeper challenged a rumour',
  CONTRADICTION: 'a competing claim crowded it out',
  FATIGUE: 'repetition without proof wore thin',
  DECAY: 'the memory faded',
  RIVAL_CAMPAIGN: 'the rival campaign worked on them',
  LAW_WITNESS: 'they saw the law at work',
};

export interface GossipInput {
  speakerConv: number;
  speakerEvidence: number;
  speakerInfluence: number;
  speakerId: string;
  /** what the listener thinks of the speaker (-100..100) */
  trust: number;
  edge: Edge | null;
  listener: Villager;
  listenerConv: number;
  listenerEvidence: number;
  heard: number;
  lastSource: string | null;
  lastDay: number;
  day: number;
  relevance: number;
}

export function gossipDelta(g: GossipInput): { delta: number; reason: ReasonCode } {
  const L = g.listener.traits;
  const sig = Math.max(-1, Math.min(1, g.speakerConv / 50));
  const t = g.trust / 100;
  const trustTerm = t >= 0 ? t : 0.4 * t;
  const P = 0.6 + (0.8 * g.speakerInfluence) / 100 + (0.2 * g.speakerEvidence) / 100;
  const S = g.speakerEvidence >= 30 ? 1 - (0.25 * L.skepticism) / 100 : 1 - (0.65 * L.skepticism) / 100;
  const recentSame = g.lastSource === g.speakerId && g.day - g.lastDay <= 1 ? 0.6 : 1;
  const N = (1 / (1 + 0.12 * g.heard)) * recentSame;
  const Sc = 0.4 + (0.9 * L.susceptibility) / 100;
  const I = 0.7 + 0.5 * g.relevance;
  const F = 1 + (0.35 * g.listener.fear) / 100;
  let raw = K.BASE * sig * trustTerm * P * S * N * Sc * I * F;
  const sameSign = g.listenerConv === 0 || Math.sign(raw) === Math.sign(g.listenerConv);
  if (sameSign) {
    raw *= 1 - Math.abs(g.listenerConv) / 110;
  } else {
    raw *= 1 - (0.5 * L.stubbornness * Math.abs(g.listenerConv)) / 10000;
    raw *= 1 - (0.6 * g.listenerEvidence) / 100;
  }
  let reason: ReasonCode = 'FRIEND_TRUST';
  if (g.trust < 0) reason = 'DISTRUST_REVERSAL';
  else if (g.speakerEvidence >= 30) reason = 'WITNESS_ACCOUNT';
  else if (g.edge?.kind === 'household' || g.edge?.kind === 'kin') reason = 'FAMILY_TRUST';
  else if (g.edge?.kind === 'faction') reason = 'FACTION_PRESSURE';
  else if (g.listener.fear >= 60) reason = 'THREAT_PANIC';
  return { delta: raw, reason };
}

/** Keeper seeds a claim directly into a villager. Deterministic. */
export function seedGain(v: Villager, b: Belief): number {
  const T = v.traits;
  const trustTerm = 0.35 + (0.65 * v.keeperTrust) / 100;
  const sus = 0.55 + (0.7 * T.susceptibility) / 100;
  const skep = 1 - (0.6 * T.skepticism) / 100;
  const nov = 1 / (1 + 0.45 * b.heard);
  const fear = 1 + (0.3 * v.fear) / 100;
  let g = K.SEED * trustTerm * sus * skep * nov * fear;
  if (b.conv > 0) g *= 1 - b.conv / 110;
  else if (b.conv < 0) g *= 1 - (0.5 * T.stubbornness) / 100;
  return g;
}

/** Firsthand evidence landing on a witness. `strength` may be negative (a failed demonstration). */
export function evidenceGain(v: Villager, b: Belief, strength: number): number {
  const T = v.traits;
  const open = 0.55 + (0.45 * T.openness) / 100;
  const respect = 1 + (0.25 * T.skepticism) / 100;
  if (strength >= 0) {
    const head = b.conv > 0 ? 1 - b.conv / 115 : 1;
    return strength * open * respect * head;
  }
  // failure: harms existing belief more than it creates disbelief
  return strength * 0.8 * (b.conv > 0 ? 1 : 0.5);
}

export function round1(v: number): number {
  return Math.round(clamp(v, -100, 100) * 10) / 10;
}

export function viewConv(_s: RunState, v: Villager, claimId: string): number {
  return v.beliefs[claimId]?.conv ?? 0;
}
