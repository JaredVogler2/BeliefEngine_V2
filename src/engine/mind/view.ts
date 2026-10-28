import { findClaimDef, findVillager } from '../core/lookup.ts';
import type { RunState } from '../core/types.ts';
import { recall } from './memory.ts';
import type { GoalId, Intent, Moment, Personality } from './types.ts';

/** What the player can read of a villager's mind: their goals and tendencies in words, what they remember and from whom. */

const GOAL: Record<GoalId, string> = {
  feed_family: 'feed their family',
  protect_home: 'keep their home standing',
  protect_bridge: 'keep the bridge up',
  protect_herd: 'keep the herd safe',
  protect_fields: 'save the crop',
  gain_standing: 'be listened to',
  find_proof: 'see proof for themselves',
  keep_order: 'keep the village orderly',
  oppose_rumours: 'stop rumours',
  keep_safe: 'stay safe',
};

export const MOMENT: Record<Moment, string> = {
  novel_claim: 'a story new to them',
  argument: 'an argument',
  contradiction: 'something that went against what they were told',
  loss: 'a loss',
  law_change: 'news of a law',
  faction_move: 'their faction\'s call',
  conversation: 'a talk with you',
  crisis: 'danger close to home',
};

const DOING: Record<Intent, string> = {
  spread: 'passed a story on',
  ask: 'asked a neighbour what they thought',
  investigate: 'went to see for themselves',
  challenge: 'argued against a story',
  comfort: 'comforted someone close',
  persuade: 'tried to win someone over',
  move: 'left early for a shelter',
  stage_evidence: 'told everyone nearby what they saw',
  support_rescue: 'took in a neighbour for the night',
  wait: 'kept their own counsel',
};

function words(p: Personality): string[] {
  const out: string[] = [];
  if (p.skepticism >= 65) out.push('skeptical');
  else if (p.skepticism <= 30) out.push('trusting');
  if (p.curiosity >= 65) out.push('curious');
  if (p.courage >= 62) out.push('brave');
  if (p.fear >= 62) out.push('fearful');
  if (p.altruism >= 65) out.push('caring');
  if (p.ambition >= 65) out.push('ambitious');
  if (p.stubbornness >= 70) out.push('stubborn');
  return out.length ? out : ['even-tempered'];
}

export interface MindView {
  goals: string[];
  traits: string[];
  memories: { id: string; day: number; text: string; how: string; judges: boolean }[];
  summary: string[];
  thinking: string | null;
  last: string | null;
}

export function getMindView(s: RunState, vid: string): MindView | null {
  const m = s.v2?.minds?.agents[vid];
  const v = findVillager(s, vid);
  if (!m || !v) return null;
  const name = (id: string | null) => (id === 'keeper' ? 'you' : id ? (findVillager(s, id)?.name.split(' ')[0] ?? id) : 'the village');
  const q = s.v2!.minds!.queue.find((x) => x.id === vid);
  const last = s.v2!.minds!.last.find((c) => c.citizenId === vid);
  const claim = (id: string | null) => (id ? `“${findClaimDef(s, id)?.short ?? id}”` : '');
  return {
    goals: m.goals.map((g) => GOAL[g]),
    traits: words(m.personality),
    memories: recall(m, 6).map((e) => ({ id: e.id, day: e.day, text: e.text, how: e.source === 'keeper' ? 'from you' : e.witnessed ? 'saw it' : e.source ? `heard from ${name(e.source)}` : 'heard it', judges: e.judge })),
    summary: m.summary.map((l) => l.text),
    thinking: q ? `Thinking today, after ${MOMENT[q.why]}${q.claim ? ` (${claim(q.claim)})` : ''}.` : null,
    last: last ? `Last dusk they ${DOING[last.intent]}${last.claimId && last.intent !== 'comfort' ? ` (${claim(last.claimId)})` : ''}${last.dialogue ? `: “${last.dialogue}”` : '.'}${last.source === 'model' ? ' (a model chose this)' : ''}` : null,
  };
}
