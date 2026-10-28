import { findClaimDef, findVillager } from '../core/lookup.ts';
import type { RunState, Villager } from '../core/types.ts';
import { cleanLine, judged } from './decide.ts';
import { recall } from './memory.ts';
import type { Episode } from './types.ts';

/**
 * Talking with a villager (phase 07). The Keeper asks what they think of a story, argues for it, challenges it, or asks what they
 * make of what has happened. They answer only from what they saw or were told: a villager who never saw the bridge hold cannot
 * describe it, only repeat who told them. The answer is words; what the conversation changes is decided by the engine's own
 * trust and evidence rules (core/actions.ts), whoever wrote the words (this offline voice, or a model whose line is checked here).
 */

export const TALK_MODES = ['ask', 'persuade', 'challenge', 'guess'] as const;
export type TalkMode = (typeof TALK_MODES)[number];

/** Asking costs nothing; arguing either way is the Keeper's word, and costs Influence like telling a story does. */
export const talkCost = (mode: TalkMode): number => (mode === 'persuade' || mode === 'challenge' ? 1 : 0);

export interface Reply {
  line: string;
  /** the memories the answer rests on (theirs) */
  cites: string[];
  source: 'offline' | 'model';
}

function nameOf(s: RunState, id: string | null): string {
  if (!id) return 'people';
  if (id === 'keeper') return 'you';
  return findVillager(s, id)?.name.split(' ')[0] ?? 'someone';
}

function about(s: RunState, vid: string, claim: string | null): { saw: Episode | undefined; heard: Episode | undefined } {
  const eps = s.v2?.minds?.agents[vid]?.episodes ?? [];
  const mine = claim ? eps.filter((e) => e.claim === claim) : eps;
  const by = (a: Episode, b: Episode) => b.salience - a.salience || b.day - a.day;
  return { saw: mine.filter((e) => e.witnessed && e.judge).sort(by)[0], heard: mine.filter((e) => !e.witnessed).sort(by)[0] };
}

/** The villager's own answer, from their memories and beliefs only. `moved` is the conviction change the conversation caused. */
export function offlineReply(s: RunState, v: Villager, mode: TalkMode, claim: string | null, moved = 0): Reply {
  const short = claim ? (findClaimDef(s, claim)?.short ?? claim) : '';
  const b = claim ? v.beliefs[claim] : undefined;
  const conv = b?.conv ?? 0;
  const { saw, heard } = about(s, v.id, claim);
  const basis = saw
    ? saw.kind === 'saw_proof_fail' ? `I watched it fail on day ${saw.day}.` : `I saw it with my own eyes on day ${saw.day}.`
    : heard ? `${nameOf(s, heard.source)} told me about it on day ${heard.day}.` : 'I have not seen anything of it myself.';
  const cites = [saw?.id, heard?.id].filter((x): x is string => !!x);
  const sawSign = claim ? judged(s, v.id, claim) : 0;
  switch (mode) {
    case 'ask': {
      if (!b) return { line: `"${short}"? I have never heard that told.`, cites: [], source: 'offline' };
      const stance = conv >= 50 ? 'I believe it.' : conv >= 15 ? 'I am coming round to it.' : conv > -15 ? 'I do not know what to make of it.' : 'I do not believe it.';
      return { line: `${stance} ${basis}`, cites, source: 'offline' };
    }
    case 'guess': {
      const m = s.v2?.minds?.agents[v.id];
      const top = m ? recall(m, 1, claim)[0] : undefined;
      if (!top) return { line: 'I could not say. I have not seen enough.', cites: [], source: 'offline' };
      return { line: top.witnessed ? `If you ask me, it comes down to what I saw on day ${top.day}: ${top.text}` : `All I know is what ${nameOf(s, top.source)} told me on day ${top.day}: ${top.text}`, cites: [top.id], source: 'offline' };
    }
    case 'persuade':
      return { line: moved >= 8 ? 'Maybe you are right.' : moved >= 3 ? 'I will think on it.' : sawSign < 0 ? 'Words will not change what I saw.' : 'You will need more than words.', cites, source: 'offline' };
    case 'challenge':
      return { line: moved <= -8 ? 'Perhaps I was too quick to believe it.' : sawSign > 0 ? 'You were not there. I saw it.' : 'I am not so sure you are right.', cites, source: 'offline' };
  }
}

/** A model's line for the villager, held to their memories; null when it cannot be used (the offline voice answers instead). */
export function checkedReply(s: RunState, vid: string, r: { line?: unknown; cites?: unknown } | undefined): Reply | null {
  if (!r) return null;
  const line = cleanLine(typeof r.line === 'string' ? r.line : null, 160);
  if (!line) return null;
  const mine = new Set((s.v2?.minds?.agents[vid]?.episodes ?? []).map((e) => e.id));
  const cites = Array.isArray(r.cites) ? r.cites.filter((c): c is string => typeof c === 'string') : [];
  if (cites.length > 3 || cites.some((c) => !mine.has(c))) return null;
  return { line, cites, source: 'model' };
}
