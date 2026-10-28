import { edgeBetween, findClaimDef, findLandmark, findVillager, trustOf } from '../core/lookup.ts';
import { rand } from '../core/rng.ts';
import type { RunState, Villager } from '../core/types.ts';
import { eligibleIntents, judged, motiveToDeny } from './decide.ts';
import { recall } from './memory.ts';
import type { Approach, Choice, Episode, Intent, Mind, Queued, Tone } from './types.ts';

/**
 * The game's own policy: what a villager does when no model is asked, or when a model's proposal is refused. A small utility
 * model over the moves open to them, scored from their personality, goals, memories and ties, with a seeded tiebreak. It is the
 * offline game; a model is an optional voice on top of it, never a requirement.
 */

const LOSS = new Set(['lost_kin', 'lost_home', 'lost_herd', 'lost_crop', 'trapped']);

const LINES: Record<Intent, (o: { claim: string; place: string; saw: boolean }) => string | null> = {
  spread: (o) => `Have you heard? ${o.claim}.`,
  persuade: (o) => (o.saw ? `I saw it with my own eyes: ${o.claim}.` : `Trust me on this: ${o.claim}.`),
  challenge: (o) => (o.saw ? `I watched it fail. I don't believe ${o.claim.toLowerCase()}.` : `Show me proof before you tell me ${o.claim.toLowerCase()}.`),
  ask: (o) => `What do you make of "${o.claim}"?`,
  investigate: (o) => `I'll go and see for myself whether ${o.claim.toLowerCase()}.`,
  comfort: () => `You're not alone in this.`,
  move: (o) => `We sleep at ${o.place} tonight. I won't wait for the water.`,
  stage_evidence: (o) => `Listen: I saw it happen. ${o.claim}.`,
  support_rescue: (o) => `Bring your family to ${o.place} tonight. It stays dry.`,
  request_test: (o) => `Show me. If ${o.claim.toLowerCase()}, let me see it with my own eyes.`,
  wait: () => null,
};

/**
 * What each kind of faction leans toward (phase 08): empiricists (V1's "scholars" factions) want evidence before belief, mystics
 * (storykeepers) carry stories, the council weighs order and property, hearths put families first. Leanings, not rules: they add
 * to a villager's own scores.
 */
const LEAN: Record<string, Partial<Record<Intent, number>>> = {
  scholars: { request_test: 10, investigate: 8, challenge: 5, spread: -4, stage_evidence: 2 },
  storykeepers: { spread: 6, stage_evidence: 6, persuade: 3, challenge: -4, investigate: -4, request_test: -6 },
  council: { ask: 3, challenge: 2, comfort: 2, spread: 2 },
  hearth: { comfort: 6, support_rescue: 6, move: 4, persuade: 2 },
};

interface Option {
  intent: Intent;
  target: string | null;
  claim: string | null;
  score: number;
}

function scoreOf(s: RunState, v: Villager, m: Mind, q: Queued, intent: Intent, target: string | null, claim: string | null): number {
  return baseScore(s, v, m, q, intent, target, claim) + (LEAN[s.factions.find((f) => f.id === v.faction)?.kind ?? '']?.[intent] ?? 0);
}

function baseScore(s: RunState, v: Villager, m: Mind, q: Queued, intent: Intent, target: string | null, claim: string | null): number {
  const p = m.personality;
  const goals = new Set(m.goals);
  const t = target ? findVillager(s, target) : undefined;
  const trust = t ? trustOf(s, v.id, t.id) : 0;
  const mine = claim ? (v.beliefs[claim]?.conv ?? 0) : 0;
  const theirs = t && claim ? (t.beliefs[claim]?.conv ?? 0) : 0;
  const seen = claim ? judged(s, v.id, claim) : 0;
  const about = claim !== null && claim === q.claim ? 6 : 0;
  const close = t ? ['household', 'kin'].includes(edgeBetween(s, v.id, t.id)?.kind ?? '') : false;
  switch (intent) {
    case 'wait':
      return 8 + (q.why === 'loss' ? 4 : 0);
    case 'spread':
      return 12 + Math.abs(mine) / 5 + p.ambition / 10 + (goals.has('gain_standing') ? 6 : 0) + trust / 12 + about + (q.why === 'novel_claim' ? 4 : 0) - (theirs * mine > 0 ? Math.abs(theirs) / 8 : 0);
    case 'persuade':
      return 16 + (v.beliefs[claim!]?.evidence ?? 0) / 5 + (seen > 0 ? 12 : 0) + p.altruism / 20 + trust / 12 + about - (theirs < 0 ? 4 : 0) - p.fear / 20;
    case 'challenge':
      // arguing against what one saw work is a lie: only a family or property under threat makes a villager consider it
      if (seen > 0) return claim && motiveToDeny(s, v, claim) ? 14 + p.ambition / 10 - p.altruism / 10 + (q.why === 'loss' ? 6 : 0) : -50;
      return 10 + p.skepticism / 5 + (seen < 0 ? 18 : 0) + (goals.has('oppose_rumours') ? 8 : 0) + p.courage / 10 + Math.max(0, -mine) / 10 + about + (q.why === 'contradiction' || q.why === 'argument' ? 6 : 0) - Math.max(0, trust) / 25;
    case 'ask':
      return 9 + p.curiosity / 5 - p.skepticism / 25 + trust / 12 + about + (q.why === 'novel_claim' ? 6 : 0) + (q.why === 'law_change' ? 3 : 0);
    case 'investigate':
      return 9 + p.skepticism / 5 + p.curiosity / 7 + (goals.has('find_proof') ? 10 : 0) + about + (q.why === 'contradiction' || q.why === 'law_change' ? 7 : 0) - (seen !== 0 ? 6 : 0);
    case 'comfort': {
      const grieving = t ? (s.v2?.minds?.agents[t.id]?.episodes ?? []).some((e) => LOSS.has(e.kind) && e.day >= s.day - 2) : false;
      return 8 + p.altruism / 5 + (grieving ? 12 : 0) + (close ? 6 : 0) + (q.why === 'loss' ? 6 : 0) + (t ? t.fear / 20 : 0);
    }
    case 'move': {
      const kids = s.villagers.some((x) => x.household === v.household && x.archetype === 'child' && x.status !== 'dead');
      return 10 + p.fear / 3 + (goals.has('keep_safe') ? 10 : 0) + (kids ? 6 : 0) - p.courage / 8 + (q.why === 'crisis' ? 6 : 0);
    }
    case 'stage_evidence':
      return 13 + (seen > 0 ? 14 : 0) + p.courage / 10 + p.ambition / 12 + (goals.has('gain_standing') ? 4 : 0) + about - p.fear / 25 + (q.why === 'proof_seen' && seen > 0 ? 10 : 0);
    case 'support_rescue':
      return 12 + p.courage / 5 + p.altruism / 5 + (close ? 12 : edgeBetween(s, v.id, target ?? '') ? 4 : 0) + (q.why === 'crisis' ? 4 : 0);
    case 'request_test':
      return 8 + p.skepticism / 4 + (goals.has('find_proof') ? 8 : 0) + about + (q.why === 'novel_claim' || q.why === 'law_change' ? 6 : 0) - Math.abs(mine) / 10;
  }
}

function toneOf(m: Mind, intent: Intent, q: Queued): Tone {
  if (q.why === 'loss') return intent === 'comfort' ? 'warm' : 'grieving';
  if (intent === 'challenge') return m.personality.courage >= 60 ? 'angry' : 'wary';
  if (intent === 'comfort' || intent === 'support_rescue') return 'warm';
  if (intent === 'move') return 'fearful';
  if (m.personality.skepticism >= 65) return 'wary';
  return intent === 'spread' || intent === 'stage_evidence' || intent === 'persuade' ? 'hopeful' : 'calm';
}

function approachOf(intent: Intent, saw: boolean): Approach {
  if (intent === 'wait') return 'silence';
  if (intent === 'comfort' || intent === 'support_rescue' || intent === 'move') return 'emotion';
  return saw ? 'evidence' : 'testimony';
}

/** The policy's decision for a villager due to think. Deterministic: the same run makes the same choice. */
export function choose(s: RunState, q: Queued): Choice {
  const v = findVillager(s, q.id)!;
  const m = s.v2!.minds!.agents[q.id];
  const opts: Option[] = [];
  for (const e of eligibleIntents(s, q.id)) {
    const targets = e.targets.length ? e.targets.slice(0, 4) : [null];
    const claims = e.claims.length ? [...e.claims].sort((a, b) => Number(b === q.claim) - Number(a === q.claim)).slice(0, 3) : [null];
    for (const target of targets)
      for (const claim of claims) {
        const noise = rand(s.seed, 'mind-choice', s.day, q.id, e.intent, target ?? '-', claim ?? '-') * 4;
        opts.push({ intent: e.intent, target, claim, score: scoreOf(s, v, m, q, e.intent, target, claim) + noise });
      }
  }
  opts.sort((a, b) => b.score - a.score || (a.intent < b.intent ? -1 : 1));
  const best = opts[0] ?? { intent: 'wait' as Intent, target: null, claim: null, score: 0 };
  const memories: Episode[] = recall(m, 3, best.claim);
  const cites = memories.filter((e) => best.claim === null || e.claim === best.claim || e.salience >= 2).slice(0, 2).map((e) => e.id);
  const saw = best.claim ? judged(s, v.id, best.claim) !== 0 : false;
  const place = best.intent === 'move' ? (findLandmark(s, best.target ?? '')?.name ?? 'the shelter') : (findLandmark(s, v.homeId)?.name ?? 'my house');
  const claimText = best.claim ? (findClaimDef(s, best.claim)?.short ?? best.claim) : '';
  return {
    citizenId: q.id,
    intent: best.intent,
    target: best.target,
    claimId: best.claim,
    dialogue: LINES[best.intent]({ claim: claimText, place, saw }),
    cites,
    tone: toneOf(m, best.intent, q),
    approach: approachOf(best.intent, saw),
    confidence: Math.max(5, Math.min(95, Math.round(40 + (best.score - (opts[1]?.score ?? best.score - 10)) * 3))),
    thought: `${q.why.replace('_', ' ')}: ${best.intent.replace('_', ' ')} scored highest for them (${Math.round(best.score)}).`,
    source: 'policy',
  };
}
