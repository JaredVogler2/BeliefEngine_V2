import type { RunState } from '../core/types.ts';
import { LAB_LIMITS, LIMITS, triggerEvents, validateRealityAst, type RealityAst, type TriggerEvent } from './ast.ts';
import { buildRealityClaim } from './build.ts';
import type { TargetKind } from './ontology.ts';
import { mentionsOf, normalizeBelief, tokenize, type ClauseMap, type NamedReason, type ReadCandidate, type Reading } from './read.ts';

/**
 * A reading as it crosses the network: the same four answers as the offline reader, without the engine's build. Whoever receives
 * one (the browser, from the server; the server, from its cache) validates every AST again and builds it against its own state,
 * so a reading can never carry a preview, a price or a threshold of its own: the engine computes those.
 */

export interface WireCandidate {
  ast: RealityAst;
  map: ClauseMap[];
  confidence: 'high' | 'medium' | 'low';
  assumed: string[];
}

interface WireBase {
  text: string;
  reader: string;
  notes: string[];
}

export type WireReading =
  | (WireBase & { kind: 'supported'; candidates: WireCandidate[] })
  | (WireBase & { kind: 'partial'; candidates: WireCandidate[]; reasons: NamedReason[] })
  | (WireBase & { kind: 'ambiguous'; question: string; choices: WireCandidate[] })
  | (WireBase & { kind: 'unsupported'; reasons: NamedReason[]; alternatives: WireCandidate[] });

const strip = (c: ReadCandidate): WireCandidate => ({ ast: c.ast, map: c.map, confidence: c.confidence, assumed: c.assumed });

export function toWire(r: Reading): WireReading {
  switch (r.kind) {
    case 'supported':
      return { ...r, candidates: r.candidates.map(strip) };
    case 'partial':
      return { ...r, candidates: r.candidates.map(strip) };
    case 'ambiguous':
      return { ...r, choices: r.choices.map(strip) };
    case 'unsupported':
      return { ...r, alternatives: r.alternatives.map(strip) };
  }
}

/**
 * Rebuilds a received reading against this state: every candidate is validated (the run's own limits) and built by the engine.
 * Candidates that are not valid AST v2 are dropped; a supported or partial reading left with none becomes unsupported.
 */
export function fromWire(s: RunState, w: WireReading): Reading {
  const limits = s.v2?.lab ? LAB_LIMITS : LIMITS;
  const notes = [...w.notes];
  const build = (list: WireCandidate[]): ReadCandidate[] => {
    const out: ReadCandidate[] = [];
    for (const c of list) {
      const v = validateRealityAst(c.ast, limits);
      if (!v.ok) {
        notes.push(`a reading was dropped: ${v.issues[0]?.message ?? 'not valid'}`);
        continue;
      }
      out.push({ ast: v.ast, map: c.map, confidence: c.confidence, assumed: c.assumed, build: buildRealityClaim(s, v.ast) });
    }
    return out;
  };
  switch (w.kind) {
    case 'supported':
    case 'partial': {
      const candidates = build(w.candidates);
      if (!candidates.length) return { text: w.text, reader: w.reader, notes, kind: 'unsupported', reasons: [{ id: 'invalid', words: '', why: 'the reading could not be used by the game' }], alternatives: [] };
      return w.kind === 'supported' ? { text: w.text, reader: w.reader, notes, kind: 'supported', candidates } : { text: w.text, reader: w.reader, notes, kind: 'partial', candidates, reasons: w.reasons };
    }
    case 'ambiguous': {
      const choices = build(w.choices);
      if (!choices.length) return { text: w.text, reader: w.reader, notes, kind: 'unsupported', reasons: [{ id: 'invalid', words: '', why: 'the reading could not be used by the game' }], alternatives: [] };
      return { text: w.text, reader: w.reader, notes, kind: 'ambiguous', question: w.question, choices };
    }
    case 'unsupported':
      return { text: w.text, reader: w.reader, notes, kind: 'unsupported', reasons: w.reasons, alternatives: build(w.alternatives) };
  }
}

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
