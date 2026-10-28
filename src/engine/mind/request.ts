import { findClaimDef, findVillager, neighborsOf, trustOf } from '../core/lookup.ts';
import type { RunState } from '../core/types.ts';
import { eligibleIntents } from './decide.ts';
import { recall } from './memory.ts';
import type { Moment, Queued } from './types.ts';

/**
 * The `npc v2` request for the villagers due to think: for each, only what they know (their own memories, beliefs, ties and
 * the moves open to them with legal targets and stories), never another villager's private memories, the map, the forecast or
 * the save. The server and the engine both hold the answer to exactly this request.
 */

export interface NpcAgentV2 {
  id: string;
  name: string;
  role: string;
  faction: string;
  traits: { skepticism: number; openness: number; stubbornness: number; courage: number; altruism: number; ambition: number };
  goals: string[];
  beliefs: { claimId: string; conviction: number; evidence: number; heardFrom: string | null }[];
  memories: { id: string; day: number; kind: string; text: string; witnessed: boolean; source: string | null; salience: number }[];
  relations: { id: string; trust: number }[];
  moment: { kind: Moment; summary: string };
  eligible: { intent: string; targets: string[]; claims: string[] }[];
}

export interface NpcRequestV2 {
  v: 2;
  run: { id: string; rev: number };
  event: { id: string; kind: Moment; day: number; summary: string; claimId: string | null };
  agents: NpcAgentV2[];
  known: { villagers: { id: string; name: string }[]; claims: { id: string; short: string }[] };
  playerMessage: string | null;
}

const MOMENT_TEXT: Record<Moment, string> = {
  novel_claim: 'heard a story that is new to them',
  argument: 'was argued with',
  contradiction: 'saw something that goes against what they were told',
  loss: 'suffered a loss',
  law_change: 'heard a law took hold or failed',
  faction_move: 'was told by their faction to take a story seriously',
  conversation: 'is talking with the Keeper',
  crisis: 'saw danger close to home',
  proof_seen: 'saw with their own eyes the proof they asked for (or saw it fail)',
};

const ID = /^[A-Za-z0-9_.:-]{1,40}$/;
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t) || '…';
const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function agentOf(s: RunState, q: Queued): NpcAgentV2 | null {
  const v = findVillager(s, q.id);
  const m = s.v2?.minds?.agents[q.id];
  if (!v || !m || v.status === 'dead' || !ID.test(v.id)) return null;
  const p = m.personality;
  const ev = q.event !== null ? s.log.find((e) => e.id === q.event) : undefined;
  return {
    id: v.id,
    name: clip(v.name, 40),
    role: clip(v.role, 40),
    faction: clip(s.factions.find((f) => f.id === v.faction)?.name ?? v.faction ?? 'none', 40),
    traits: { skepticism: pct(p.skepticism), openness: pct(p.curiosity), stubbornness: pct(p.stubbornness), courage: pct(p.courage), altruism: pct(p.altruism), ambition: pct(p.ambition) },
    goals: m.goals.slice(0, 4),
    beliefs: Object.entries(v.beliefs)
      .filter(([c]) => ID.test(c) && !!findClaimDef(s, c))
      .sort((a, b) => Math.abs(b[1].conv) - Math.abs(a[1].conv) || (a[0] < b[0] ? -1 : 1))
      .slice(0, 6)
      .map(([c, b]) => ({ claimId: c, conviction: Math.max(-100, Math.min(100, Math.round(b.conv))), evidence: pct(b.evidence), heardFrom: b.lastSource && ID.test(b.lastSource) ? b.lastSource : null })),
    memories: recall(m, 8, q.claim).map((e) => ({ id: e.id, day: Math.max(0, Math.min(999, e.day)), kind: e.kind, text: clip(e.text, 160), witnessed: e.witnessed, source: e.source && ID.test(e.source) ? e.source : null, salience: e.salience })),
    relations: neighborsOf(s, v.id)
      .filter((n) => findVillager(s, n.id)?.status !== 'dead' && ID.test(n.id))
      .map((n) => ({ id: n.id, trust: Math.max(-100, Math.min(100, Math.round(trustOf(s, v.id, n.id)))) }))
      .sort((a, b) => Math.abs(b.trust) - Math.abs(a.trust) || (a.id < b.id ? -1 : 1))
      .slice(0, 8),
    moment: { kind: q.why, summary: clip(`${v.name} ${MOMENT_TEXT[q.why]}${ev ? `: ${ev.text}` : ''}`, 160) },
    eligible: eligibleIntents(s, v.id)
      .slice(0, 10)
      .map((e) => ({ intent: e.intent, targets: e.targets.filter((t) => ID.test(t)).slice(0, 12), claims: e.claims.filter((c) => ID.test(c)).slice(0, 6) })),
  };
}

/** The request for today's thinkers (at most six), or null when nobody is due to think. */
export function buildNpcRequest(s: RunState, runId: string, playerMessage: string | null = null, only: string[] | null = null): NpcRequestV2 | null {
  const minds = s.v2?.minds;
  if (!minds) return null;
  const queue = minds.queue.filter((q) => !minds.decided[q.id] && (!only || only.includes(q.id)));
  const agents = queue.map((q) => agentOf(s, q)).filter((a): a is NpcAgentV2 => !!a).slice(0, 6);
  if (!agents.length) return null;
  const lead = queue.find((q) => q.id === agents[0].id)!;
  const claimIds = [...new Set(agents.flatMap((a) => [...a.beliefs.map((b) => b.claimId), ...a.eligible.flatMap((e) => e.claims)]))].slice(0, 16);
  return {
    v: 2,
    run: { id: runId, rev: s.nextEventId },
    event: { id: `d${s.day}.q${lead.event ?? 0}`, kind: lead.why, day: Math.max(0, Math.min(999, s.day)), summary: clip(agents.map((a) => a.moment.summary).join(' / '), 240), claimId: lead.claim && claimIds.includes(lead.claim) ? lead.claim : null },
    agents,
    known: {
      villagers: s.villagers.filter((v) => v.status !== 'dead' && ID.test(v.id)).slice(0, 60).map((v) => ({ id: v.id, name: clip(v.name, 40) })),
      claims: claimIds.map((id) => ({ id, short: clip(findClaimDef(s, id)?.short ?? id, 80) })),
    },
    playerMessage: playerMessage ? clip(playerMessage, 240) : null,
  };
}

const ASK: Record<string, (short: string) => string> = {
  ask: (c) => `The Keeper asks what you think of "${c}".`,
  persuade: (c) => `The Keeper argues that "${c}" is true.`,
  challenge: (c) => `The Keeper challenges your belief in "${c}".`,
  guess: (c) => (c ? `The Keeper asks what you make of what has happened with "${c}".` : 'The Keeper asks what you make of what has happened lately.'),
};

/** A conversation: one villager, the moment "conversation", and what the Keeper said (typed text is untrusted, and optional). */
export function buildTalkRequest(s: RunState, runId: string, vid: string, mode: string, claim: string | null, typed: string | null = null): NpcRequestV2 | null {
  const a = agentOf(s, { id: vid, why: 'conversation', claim, event: null });
  if (!a) return null;
  const short = claim ? (findClaimDef(s, claim)?.short ?? claim) : '';
  const said = typed && typed.trim() ? typed.trim() : (ASK[mode] ?? ASK.guess)(short);
  const claimIds = [...new Set([...(claim && ID.test(claim) ? [claim] : []), ...a.beliefs.map((b) => b.claimId), ...a.eligible.flatMap((e) => e.claims)])].slice(0, 16);
  return {
    v: 2,
    run: { id: runId, rev: s.nextEventId },
    event: { id: `d${s.day}.talk.${vid}`.slice(0, 40), kind: 'conversation', day: Math.max(0, Math.min(999, s.day)), summary: clip(`The Keeper talks with ${a.name}.`, 240), claimId: claim && claimIds.includes(claim) ? claim : null },
    agents: [{ ...a, moment: { kind: 'conversation', summary: clip(`${a.name} is talking with the Keeper.`, 160) } }],
    known: {
      villagers: s.villagers.filter((v) => v.status !== 'dead' && ID.test(v.id)).slice(0, 60).map((v) => ({ id: v.id, name: clip(v.name, 40) })),
      claims: claimIds.map((id) => ({ id, short: clip(findClaimDef(s, id)?.short ?? id, 80) })),
    },
    playerMessage: clip(said, 240),
  };
}
