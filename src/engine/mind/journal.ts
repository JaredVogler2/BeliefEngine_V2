import { findClaimDef, findVillager } from '../core/lookup.ts';
import type { GameEvent, RunState } from '../core/types.ts';
import { REASON_TEXT } from '../social/persuasion.ts';

/**
 * The influence journal (phase 08): who influenced whom, why, and what changed in the world because of it, read from the engine's
 * own log and the cause links each event carries. Nothing here is stored or decided: it explains what the rules already did.
 */

export type JournalKind = 'keeper' | 'told' | 'villager' | 'witnessed' | 'law' | 'reality' | 'faction' | 'rival' | 'test' | 'npc_claim' | 'lie';

export interface JournalEntry {
  day: number;
  event: number;
  kind: JournalKind;
  /** a villager id, 'keeper', or null (the world) */
  who: string | null;
  whom: string | null;
  claim: string | null;
  /** what happened, in the log's own words */
  text: string;
  /** why it worked (the persuasion reason), when the rules give one */
  why: string | null;
  conviction: [number, number] | null;
  /** earlier events that caused this one */
  causes: number[];
}

const KIND: Record<string, JournalKind> = {
  RUMOR_SEEDED: 'keeper',
  KEEPER_TALKED: 'keeper',
  RUMOR_CHALLENGED: 'keeper',
  EVIDENCE_STAGED: 'witnessed',
  EVIDENCE_BACKFIRED: 'witnessed',
  BELIEVER_GAINED: 'told',
  BELIEVER_LOST: 'told',
  BELIEF_SHIFT: 'told',
  NPC_ACT: 'villager',
  NPC_INVESTIGATED: 'villager',
  LAW_ACTIVATED: 'law',
  LAW_WAVERING: 'law',
  LAW_COLLAPSED: 'law',
  LAW_DISCREDITED: 'law',
  REALITY_EFFECT: 'reality',
  REALITY_CONFLICT: 'reality',
  FACTION_ENDORSES: 'faction',
  RIVAL_CAMPAIGN: 'rival',
  RIVAL_REBUTTAL: 'rival',
  TEST_REQUESTED: 'test',
  TEST_MET: 'test',
  TEST_FAILED: 'test',
  TEST_LAPSED: 'test',
  NPC_CLAIM_TELEGRAPHED: 'npc_claim',
  NPC_CLAIM_MADE: 'npc_claim',
  LIE_TOLD: 'lie',
  LIE_DISCOVERED: 'lie',
};

function entryOf(e: GameEvent): JournalEntry | null {
  const kind = KIND[e.code];
  if (!kind) return null;
  // small drifts in one person's conviction are noise; crossings, and anything a person or the Keeper did, are not
  if (e.code === 'BELIEF_SHIFT' && e.importance < 1) return null;
  const conv = e.delta?.conviction ?? null;
  return {
    day: e.day,
    event: e.id,
    kind,
    who: e.actor ?? (kind === 'keeper' ? 'keeper' : null),
    whom: e.target ?? null,
    claim: e.claim ?? null,
    text: e.text,
    why: e.reason ? (REASON_TEXT[e.reason] ?? null) : null,
    conviction: conv ? [conv[0], conv[1]] : null,
    causes: e.cause ?? [],
  };
}

export interface JournalQuery {
  day?: number;
  /** entries where this villager acted or was acted on */
  villager?: string;
  claim?: string;
  limit?: number;
}

/** The journal, newest first. */
export function journalOf(s: RunState, q: JournalQuery = {}): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (let i = s.log.length - 1; i >= 0 && out.length < (q.limit ?? 60); i--) {
    const e = s.log[i];
    if (q.day !== undefined && e.day !== q.day) continue;
    if (q.claim && e.claim !== q.claim) continue;
    if (q.villager && e.actor !== q.villager && e.target !== q.villager) continue;
    const j = entryOf(e);
    if (j) out.push(j);
  }
  return out;
}

/**
 * How it happened: from one event (a law taking hold, a belief at work) back along its causes, oldest first. Each step is an
 * event the log still holds; the chain stops where the log was compacted or nothing caused it.
 */
export function chainOf(s: RunState, eventId: number, max = 8): JournalEntry[] {
  const byId = new Map(s.log.map((e) => [e.id, e]));
  const out: JournalEntry[] = [];
  const seen = new Set<number>();
  let frontier = [eventId];
  while (frontier.length && out.length < max) {
    const next: number[] = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      const e = byId.get(id);
      if (!e) continue;
      const j = entryOf(e) ?? { day: e.day, event: e.id, kind: 'witnessed' as const, who: e.actor ?? null, whom: e.target ?? null, claim: e.claim ?? null, text: e.text, why: null, conviction: null, causes: e.cause ?? [] };
      out.push(j);
      next.push(...(e.cause ?? []));
    }
    frontier = next;
  }
  return out.sort((a, b) => a.event - b.event).slice(-max);
}

/** One line for a journal entry, naming people the way the player sees them. */
export function journalLine(s: RunState, j: JournalEntry): string {
  const name = (id: string | null) => (id === 'keeper' ? 'You' : id ? (findVillager(s, id)?.name ?? id) : '');
  const claim = j.claim ? `“${findClaimDef(s, j.claim)?.short ?? j.claim}”` : '';
  if (j.kind === 'told' && j.who && j.whom && j.conviction)
    return `${name(j.who)} → ${name(j.whom)}: ${claim} ${j.conviction[0]} → ${j.conviction[1]}${j.why ? ` (${j.why})` : ''}`;
  return j.text;
}
