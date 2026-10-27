import type { RunState } from '../core/types.ts';
import { triggerEvents, type RealityAst, type TriggerEvent } from './ast.ts';
import type { TargetKind } from './ontology.ts';
import { mentionsOf, normalizeBelief, tokenize, type ClauseMap } from './read.ts';

/**
 * Fidelity: does a reading (a model's, usually) stay with what the sentence said? Uses the offline reader's vocabulary to see what
 * a sentence names. Server-side and in tools; the browser does not need it (the server has already applied it).
 */

const SOURCE_KIND: Partial<Record<TriggerEvent, string>> = { lantern: 'beacon', smoke_fire: 'campfire', bell: 'belltower', watchers: 'bridge' };
const ANCHOR_THING: Record<string, TargetKind> = { bridge: 'bridge', home: 'home', field: 'field', beacon: 'lantern', pen: 'livestock' };

/** What a sentence names, as the offline reader's vocabulary sees it: things, and powers. */
export function namedIn(s: RunState, text: string): { kinds: Set<TargetKind>; events: Set<TriggerEvent> } {
  const toks = tokenize(normalizeBelief(text));
  const kinds = new Set<TargetKind>();
  const events = new Set<TriggerEvent>();
  for (const m of mentionsOf(toks, s)) {
    if (m.cat === 'kind' && m.kind) kinds.add(m.kind);
    if (m.cat === 'illness') kinds.add('villager');
    if (m.cat === 'anchor' && m.anchor) {
      if (ANCHOR_THING[m.anchor]) kinds.add(ANCHOR_THING[m.anchor]);
      for (const [ev, a] of Object.entries(SOURCE_KIND)) if (a === m.anchor) events.add(ev as TriggerEvent);
    }
    if (m.cat === 'trigger' && m.event) events.add(m.event);
    if (m.cat === 'speech') events.add('spoken');
    if (m.cat === 'kind' && m.kind === 'lantern') events.add('lantern');
    if (m.cat === 'kind' && m.kind === 'rain') events.add('rain');
    if (m.cat === 'sense' && m.senses?.some((x) => x.id === 'heal')) kinds.add('villager');
  }
  // a home stands for the people in it when a change can only touch people
  if (kinds.has('home')) kinds.add('villager');
  return { kinds, events };
}

const FREE_EVENTS = new Set<TriggerEvent>(['always', 'night', 'clear_night']);

/**
 * Does a reading stay with what the sentence said? A clause acting on something the sentence never names, or powered by something
 * it never mentions, is either a misreading or an attempt to slip in a different law. `strict` failures drop the candidate; the
 * rest are kept with a note and low confidence, because a model may know a word the offline vocabulary does not.
 */
export function fidelity(s: RunState, text: string, ast: RealityAst, map: ClauseMap[]): { ok: boolean; notes: string[]; confident: boolean } {
  const named = namedIn(s, text);
  const lower = normalizeBelief(text);
  const notes: string[] = [];
  let ok = true;
  let confident = true;
  ast.clauses.forEach((c, i) => {
    const m = map[i];
    const cited = (words: string | null | undefined) => !!words && normalizeBelief(words).length > 1 && lower.includes(normalizeBelief(words));
    if (!named.kinds.has(c.target.kind)) {
      if (cited(m?.target)) {
        confident = false;
        notes.push(`the game's own reader does not know "${m!.target}"; the reading takes it to mean ${c.target.kind}`);
      } else {
        ok = false;
        notes.push(`a reading acted on ${c.target.kind}, which the sentence does not mention`);
      }
    }
    for (const e of triggerEvents(c.when)) {
      if (FREE_EVENTS.has(e) || named.events.has(e)) continue;
      if (cited(m?.trigger)) {
        confident = false;
        notes.push(`the game's own reader does not know "${m!.trigger}"; the reading takes it to mean ${e}`);
      } else {
        ok = false;
        notes.push(`a reading was powered by ${e}, which the sentence does not mention`);
      }
    }
  });
  return { ok, notes, confident };
}
