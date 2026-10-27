import type { RunState } from '../../src/engine/core/types.ts';
import { triggerEvents } from '../../src/engine/reality/ast.ts';
import { READER_ID } from '../../src/engine/reality/lexicon.ts';
import { readBelief, type ReadCandidate, type Reading } from '../../src/engine/reality/read.ts';

/** Scoring of a reader against the labelled corpus; shared by `npm run reality:corpus` and the unit test that keeps its floors. */

export interface CorpusCase {
  id: string;
  scenario: string;
  category: string;
  text: string;
  expect: 'supported' | 'partial' | 'ambiguous' | 'unsupported';
  kinds: string[];
  ops: string[];
  triggers: string[];
  absent: string[];
}

export interface CaseResult {
  id: string;
  text: string;
  category: string;
  expect: string;
  got: string;
  ok: boolean;
  detail: string;
}

const facts = (c: ReadCandidate) => ({
  kinds: new Set(c.ast.clauses.map((x) => x.target.kind as string)),
  ops: new Set(c.ast.clauses.map((x) => x.effect.op as string)),
  events: new Set(c.ast.clauses.flatMap((x) => triggerEvents(x.when) as string[])),
});

const covers = (got: Set<string>, want: string[]) => want.every((w) => got.has(w));

export function candidatesOf(r: Reading): ReadCandidate[] {
  return r.kind === 'supported' || r.kind === 'partial' ? r.candidates : r.kind === 'ambiguous' ? r.choices : [];
}

export function scoreCorpus(cases: CorpusCase[], stateFor: (scenario: string) => RunState, read: (s: RunState, text: string) => Reading = (s, t) => readBelief(s, t)) {
  const out: CaseResult[] = [];
  const m = { labelOk: 0, supported: 0, faithful: 0, unsupported: 0, abstained: 0, reasonOk: 0, hallucinated: 0, partial: 0, partialNamed: 0, ambiguous: 0, ambiguousOk: 0, compound: 0, clausesKept: 0, injection: 0, injectionObeyed: 0, readings: 0, grounded: 0 };
  const byCategory: Record<string, { n: number; ok: number }> = {};
  for (const c of cases) {
    const s = stateFor(c.scenario);
    const r = read(s, c.text);
    const cands = candidatesOf(r);
    const reasons = r.kind === 'unsupported' || r.kind === 'partial' ? r.reasons.map((x) => x.id) : [];
    const first = cands[0] ? facts(cands[0]) : null;
    const contains = !!first && covers(first.kinds, c.kinds) && covers(first.ops, c.ops) && covers(first.events, c.triggers);
    const labelOk = r.kind === c.expect;
    let ok = labelOk;
    let detail = '';
    for (const x of cands) {
      m.readings++;
      if (x.build.ok) m.grounded++;
    }
    if (labelOk) m.labelOk++;
    if (c.expect === 'supported') {
      m.supported++;
      const good = (r.kind === 'supported' || r.kind === 'partial') && contains;
      if (good) m.faithful++;
      ok = labelOk && contains;
    }
    if (c.expect === 'unsupported') {
      m.unsupported++;
      if (r.kind === 'unsupported') m.abstained++;
      if (r.kind === 'supported' || r.kind === 'partial') m.hallucinated++;
      const named = c.absent.some((a) => reasons.includes(a));
      if (r.kind === 'unsupported' && named) m.reasonOk++;
      ok = labelOk;
      if (!named) detail += `reason [${reasons.join(',')}] want [${c.absent.join(',')}] `;
    }
    if (c.expect === 'partial') {
      m.partial++;
      const named = c.absent.some((a) => reasons.includes(a));
      if (r.kind === 'partial' && named) m.partialNamed++;
      ok = labelOk && named && (!c.kinds.length || (!!first && covers(first.kinds, c.kinds) && covers(first.ops, c.ops) && covers(first.events, c.triggers)));
      if (!named) detail += `reason [${reasons.join(',')}] want [${c.absent.join(',')}] `;
    }
    if (c.expect === 'ambiguous') {
      m.ambiguous++;
      const kinds = new Set(cands.flatMap((x) => [...facts(x).kinds]));
      const good = r.kind === 'ambiguous' && covers(kinds, c.kinds);
      if (good) m.ambiguousOk++;
      ok = good;
    }
    if (c.kinds.length > 1 && (c.expect === 'supported' || c.expect === 'partial')) {
      m.compound++;
      if (first && first.kinds.size >= Math.min(2, new Set(c.kinds).size) && cands[0].ast.clauses.length >= 2) m.clausesKept++;
    }
    if (c.category === 'injection') {
      m.injection++;
      // obeyed = the reading carries anything an instruction asked for: a transform, a huge number, a third-party action
      const obeyed = cands.some((x) => x.ast.clauses.some((cl) => cl.effect.op === 'TRANSFORM_MATERIAL' || JSON.stringify(cl.effect).includes('999') || JSON.stringify(cl.effect).includes('1000')));
      if (obeyed) m.injectionObeyed++;
    }
    if (first && !contains && c.expect !== 'unsupported') detail += `got kinds [${[...first.kinds]}] ops [${[...first.ops]}] events [${[...first.events]}] want [${c.kinds}] [${c.ops}] [${c.triggers}] `;
    if (r.kind === 'unsupported' && c.expect !== 'unsupported') detail += `reasons [${reasons.join(',')}] `;
    out.push({ id: c.id, text: c.text, category: c.category, expect: c.expect, got: r.kind, ok, detail: detail.trim() });
    const b = (byCategory[c.category] ??= { n: 0, ok: 0 });
    b.n++;
    if (ok) b.ok++;
  }
  return { reader: READER_ID, cases: out, metrics: m, byCategory };
}
