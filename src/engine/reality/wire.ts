import type { RunState } from '../core/types.ts';
import { LAB_LIMITS, LIMITS, validateRealityAst, type RealityAst } from './ast.ts';
import { buildRealityClaim } from './build.ts';
import type { ClauseMap, NamedReason, ReadCandidate, Reading } from './read.ts';

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
