import { readFileSync } from 'node:fs';
import { GameSession } from '../../src/engine/index.ts';
import { interpretBelief, type Interpretation } from '../../src/engine/nl/interpret.ts';

export interface CorpusEntry {
  category: string;
  village: 'redbank' | 'harvest' | 'ashwood';
  text: string;
  status: 'ok' | 'ambiguous' | 'partial' | 'unsupported' | 'rejected' | 'never_wrong';
  accept: string[];
  contradicts?: string;
  compound?: boolean;
}

export interface Outcome {
  entry: CorpusEntry;
  pass: boolean;
  /** the interpreter put a belief in front of the player that was wrong for the text, or that should have been refused */
  wrong: boolean;
  /** it declined (unsupported, rejected) */
  abstained: boolean;
  got: string;
  why: string;
}

const key = (d: Interpretation['drafts'][number]): string =>
  d.ast.clauses.map((c) => `${c.subject}.${c.effect}.${c.trigger}`).sort().join('+');

export function loadCorpus(path: string): CorpusEntry[] {
  return JSON.parse(readFileSync(path, 'utf8')) as CorpusEntry[];
}

export function runEntry(e: CorpusEntry, cache = new Map<string, GameSession>()): { interp: Interpretation; outcome: Outcome } {
  let g = cache.get(e.village);
  if (!g) {
    g = GameSession.create({ scenarioId: e.village, seed: 1 });
    g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
    cache.set(e.village, g);
  }
  const interp = interpretBelief(g.state, e.text, { stress: false });
  const keys = interp.drafts.map(key);
  const accepted = new Set(e.accept.map((a) => a.split('+').sort().join('+')));
  const abstained = interp.drafts.length === 0;
  const got = abstained ? interp.status : `${interp.status}: ${keys.join(' | ')}`;
  let pass = false;
  let why = '';
  switch (e.status) {
    case 'ok':
      pass = (interp.status === 'ok' || interp.status === 'partial') && !abstained && accepted.has(keys[0]);
      why = pass ? '' : `expected ${[...accepted].join(' or ')} as the single reading`;
      break;
    case 'partial':
    case 'ambiguous':
      pass = !abstained && keys.some((k) => accepted.has(k)) && (!e.compound || interp.drafts.some((d) => d.ast.clauses.length === 2));
      why = pass ? '' : `expected ${[...accepted].join(' or ')} among the readings`;
      break;
    case 'unsupported':
      pass = abstained && (interp.status === 'unsupported' || interp.status === 'rejected');
      why = pass ? '' : 'should have declined';
      break;
    case 'rejected':
      pass = abstained && (interp.status === 'rejected' || interp.status === 'unsupported');
      why = pass ? '' : 'should have said it cannot work in this village';
      break;
    case 'never_wrong':
      pass = abstained || accepted.has(keys[0]);
      why = pass ? '' : 'offered a reading that is not the one meant';
      break;
  }
  if (pass && e.contradicts) {
    const has = interp.drafts.some((d) => d.contradicts.some((c) => c.id === e.contradicts));
    if (!has) {
      pass = false;
      why = `should have flagged the contradiction with ${e.contradicts}`;
    }
  }
  const wrong = !pass && !abstained;
  return { interp, outcome: { entry: e, pass, wrong, abstained, got, why } };
}

export function runCorpus(entries: CorpusEntry[]): Outcome[] {
  const cache = new Map<string, GameSession>();
  return entries.map((e) => runEntry(e, cache).outcome);
}

export function summarise(outcomes: Outcome[]) {
  const by: Record<string, { n: number; pass: number }> = {};
  for (const o of outcomes) {
    const c = (by[o.entry.category] ??= { n: 0, pass: 0 });
    c.n++;
    if (o.pass) c.pass++;
  }
  const expectsAnswer = outcomes.filter((o) => ['ok', 'ambiguous', 'partial'].includes(o.entry.status));
  const expectsAbstain = outcomes.filter((o) => ['unsupported', 'rejected'].includes(o.entry.status));
  return {
    total: outcomes.length,
    passed: outcomes.filter((o) => o.pass).length,
    byCategory: by,
    answerPrecision: { answered: expectsAnswer.filter((o) => !o.abstained).length, correct: expectsAnswer.filter((o) => o.pass).length, of: expectsAnswer.length },
    abstentionCorrect: { correct: expectsAbstain.filter((o) => o.pass).length, of: expectsAbstain.length },
    /** readings put in front of a player that were wrong for the text or that should have been refused */
    wrongReadings: outcomes.filter((o) => o.wrong).length,
  };
}
