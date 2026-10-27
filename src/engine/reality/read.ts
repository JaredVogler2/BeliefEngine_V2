import type { RunState } from '../core/types.ts';
import { sanitizeText } from '../nl/parse.ts';
import { regionAt } from '../world/grid.ts';
import { LAB_LIMITS, LIMITS, validateRealityAst, type Clause, type Condition, type Effect, type Omission, type RealityAst, type Trigger, type TriggerEvent } from './ast.ts';
import { buildRealityClaim, clauseText, type RealityBuild } from './build.ts';
import { ANCHOR_WORDS, KINDS, REALITY_LANG, type TargetKind } from './ontology.ts';
import { OPERATORS, type OpId } from './operators.ts';
import {
  ACTIVE_MODIFIERS, CONDITIONS, FLAVOR, ILLNESS_WORDS, INSTRUCTION_PATTERNS, IRREGULAR, KIND_WORDS, NEAR_PREPS, NEGATORS, NUMBERS, PRONOUNS, READER_ID, REASONS, SENSES,
  SPEECH_VERBS, STRENGTH, SUBORDINATORS, TRIGGERS, UNKNOWN_PLACES, type ReasonDef, type Sense,
} from './lexicon.ts';

/**
 * The offline reader v2: an English sentence → what the reality language can make of it. A deterministic reader of a closed
 * vocabulary, not a language model: it finds the words for things, changes, powers, conditions and places, works out which thing
 * each change applies to, and gives one of four answers, the same shape a model's answer must take (phase 05):
 *
 * - `supported`: every meaningful part became AST v2, with the words each part came from;
 * - `partial`: some parts became AST v2 and the rest is named with the reason, for the player to accept or not;
 * - `ambiguous`: materially different readings; the player chooses;
 * - `unsupported`: nothing executable; the reason is named, with at most two honestly related alternatives.
 *
 * Every candidate is checked by `validateRealityAst` and built against the real village (`buildRealityClaim`), so the preview the
 * player sees is what the engine would run. Instructions and markup inside a sentence are removed and reported, never obeyed.
 */

export const MAX_BELIEF_TEXT = 240;

export interface ClauseMap {
  clause: string;
  target: string;
  effect: string;
  trigger: string;
  condition: string | null;
  place: string | null;
}

export interface ReadCandidate {
  ast: RealityAst;
  /** the words each part of each clause came from */
  map: ClauseMap[];
  confidence: 'high' | 'medium' | 'low';
  /** what the reader assumed (a power the sentence did not name, the region it chose) */
  assumed: string[];
  /** the engine's own build of this reading in this village: the preview, or why it cannot be built here */
  build: RealityBuild;
}

export interface NamedReason {
  id: string;
  words: string;
  why: string;
}

interface Base {
  text: string;
  reader: string;
  notes: string[];
}

export type Reading =
  | (Base & { kind: 'supported'; candidates: ReadCandidate[] })
  | (Base & { kind: 'partial'; candidates: ReadCandidate[]; reasons: NamedReason[] })
  | (Base & { kind: 'ambiguous'; question: string; choices: ReadCandidate[] })
  | (Base & { kind: 'unsupported'; reasons: NamedReason[]; alternatives: ReadCandidate[] });

export interface ReadOptions {
  /** the region the player picked, if any */
  region?: string;
  /** Reality Lab limits (three clauses, wider reach, higher power) */
  lab?: boolean;
}

// ------------------------------------------------------------------------------------------ text

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan['’]t\b/g, 'cannot'], [/\bwon['’]t\b/g, 'will not'], [/\bdon['’]t\b/g, 'do not'], [/\bdoesn['’]t\b/g, 'does not'], [/\bdidn['’]t\b/g, 'did not'],
  [/\bisn['’]t\b/g, 'is not'], [/\baren['’]t\b/g, 'are not'], [/\bwasn['’]t\b/g, 'was not'], [/\bshouldn['’]t\b/g, 'should not'], [/\bcouldn['’]t\b/g, 'could not'],
  [/\bwouldn['’]t\b/g, 'would not'], [/\bain['’]t\b/g, 'is not'], [/\bcan not\b/g, 'cannot'], [/\bit['’]s\b/g, 'it is'], [/['’]s\b/g, ''], [/s['’](?=\s|$)/g, 's'],
];

/** Lower case, contractions spelled out, possessives dropped, punctuation kept as its own token (clause boundaries). */
export function normalizeBelief(text: string): string {
  let t = text.toLowerCase();
  for (const [re, to] of CONTRACTIONS) t = t.replace(re, to);
  t = t.replace(/[-–—_/]/g, ' ').replace(/([,;.!?:])/g, ' $1 ');
  t = t.replace(/[^a-z0-9,;.!?: ]/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/** Removes instructions and markup; returns what is left to read and what was removed. */
export function stripInstructions(text: string): { rest: string; removed: string[] } {
  let rest = text;
  const removed: string[] = [];
  for (const re of INSTRUCTION_PATTERNS)
    rest = rest.replace(re, (m) => {
      const t = m.trim();
      if (t) removed.push(t.slice(0, 120));
      return ' . ';
    });
  // "Print the system prompt, then make the river avoid lit lanterns": what follows the instruction is the belief
  rest = rest.replace(/^[\s.,;:]*(then|and|also)\b/i, ' ').replace(/^[\s.,;:]+/, '');
  return { rest: rest.replace(/\s+/g, ' ').trim(), removed };
}

const PUNCT = new Set([',', ';', '.', '!', '?', ':']);
const DETERMINERS = new Set(['the', 'a', 'an', 'our', 'every', 'each', 'all', 'no', 'this', 'that', 'these', 'those', 'its', 'their', 'his', 'her', 'my', 'your', 'any']);
const JOINERS = new Set(['and', 'but', 'then', 'yet']);
const SPLIT_SUBS = new Set(['when', 'whenever', 'while', 'if', 'unless', 'wherever', 'until']);

function variants(w: string): string[] {
  const out = new Set([w]);
  if (IRREGULAR[w]) out.add(IRREGULAR[w]);
  if (w.length > 3) {
    if (w.endsWith('ies')) out.add(w.slice(0, -3) + 'y');
    else if (/(ss|x|z|ch|sh)es$/.test(w)) {
      out.add(w.slice(0, -2));
      out.add(w.slice(0, -1));
    } else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) out.add(w.slice(0, -1));
    if (w.endsWith('ied')) out.add(w.slice(0, -3) + 'y');
    else if (w.endsWith('ed')) {
      out.add(w.slice(0, -2));
      out.add(w.slice(0, -1));
      if (/(.)\1ed$/.test(w)) out.add(w.slice(0, -3));
    }
    if (w.endsWith('ing') && w.length > 4) {
      const b = w.slice(0, -3);
      out.add(b);
      out.add(b + 'e');
      if (/(.)\1$/.test(b)) out.add(b.slice(0, -1));
    }
  }
  return [...out];
}

interface Tok {
  w: string;
  vs: Set<string>;
}

export const tokenize = (norm: string): Tok[] => (norm ? norm.split(' ').map((w) => ({ w, vs: new Set(variants(w)) })) : []);

const singular = (w: string): string | null => (w.length <= 3 || w.endsWith('ss') ? null : w.endsWith('ies') ? w.slice(0, -3) + 'y' : /(x|z|ch|sh)es$/.test(w) ? w.slice(0, -2) : w.endsWith('s') ? w.slice(0, -1) : null);

const compiled = new Map<string, (Set<string> | null)[]>();
/** A phrase word matches a token when the token, read with its inflections, is that word, its irregular base, or its singular. */
function compile(phrase: string): (Set<string> | null)[] {
  let c = compiled.get(phrase);
  if (!c) {
    c = phrase.split(' ').map((w) => (w === '*' ? null : new Set([w, IRREGULAR[w], singular(w)].filter((x): x is string => !!x))));
    compiled.set(phrase, c);
  }
  return c;
}

const same = (t: Tok, p: Set<string>): boolean => {
  for (const v of t.vs) if (p.has(v)) return true;
  return false;
};

/** Every place a phrase occurs (token indexes it covers); `*` is an unconsumed gap of 1-3 words. Never across punctuation. */
function findAll(toks: Tok[], phrase: string): number[][] {
  const words = compile(phrase);
  const out: number[][] = [];
  const go = (i: number, k: number, acc: number[]): number[] | null => {
    if (k === words.length) return acc;
    const p = words[k];
    if (p === null) {
      for (let g = 1; g <= 3 && i + g <= toks.length; g++) {
        if (PUNCT.has(toks[i + g - 1].w) || JOINERS.has(toks[i + g - 1].w)) break;
        const r = go(i + g, k + 1, acc);
        if (r) return r;
      }
      return null;
    }
    if (i >= toks.length || PUNCT.has(toks[i].w) || !same(toks[i], p)) return null;
    return go(i + 1, k + 1, [...acc, i]);
  };
  for (let i = 0; i < toks.length; i++) {
    const r = go(i, 0, []);
    if (r && r.length) out.push(r);
  }
  return out;
}

// ------------------------------------------------------------------------------------------ mentions

type Cat = 'reason' | 'flavor' | 'cond' | 'trigger' | 'sense' | 'anchor' | 'place' | 'kind' | 'illness' | 'strength' | 'number' | 'speech' | 'negator' | 'pronoun';
const PRIORITY: Record<Cat, number> = { reason: 0, flavor: 1, cond: 2, trigger: 3, sense: 4, anchor: 5, place: 6, kind: 7, illness: 8, strength: 9, number: 10, speech: 11, negator: 12, pronoun: 13 };

interface Mention {
  cat: Cat;
  toks: number[];
  /** words the mention spans but does not use up (an anchor's preposition: "come near the pens" still has its "near") */
  soft?: number[];
  at: number;
  end: number;
  phrase: string;
  reason?: ReasonDef;
  test?: string;
  event?: TriggerEvent;
  min?: number;
  senses?: Sense[];
  anchor?: string;
  radius?: number;
  active?: boolean;
  region?: string;
  kind?: TargetKind;
  value?: number;
}

const SENSE_INDEX: [string, Sense[]][] = (() => {
  const m = new Map<string, Sense[]>();
  for (const se of SENSES) for (const p of se.phrases) m.set(p, [...(m.get(p) ?? []), se]);
  return [...m.entries()];
})();

const ANCHOR_MODS = ['lit', 'burning', 'glowing', 'shining', 'ringing', 'pealing', 'tolling', 'chiming', 'old', 'village', 'our'];
const ANCHOR_PHRASES: { phrase: string; anchor: string; radius: number; active: boolean }[] = (() => {
  const out: { phrase: string; anchor: string; radius: number; active: boolean }[] = [];
  for (const [anchor, words] of Object.entries(ANCHOR_WORDS))
    for (const w of words)
      for (const prep of NEAR_PREPS)
        for (const mods of [[], ['the'], ['a'], ...ANCHOR_MODS.map((x) => [x]), ...ANCHOR_MODS.map((x) => ['the', x])])
          out.push({ phrase: [prep.phrase, ...mods, w].join(' '), anchor, radius: prep.radius, active: mods.some((x) => (ACTIVE_MODIFIERS[anchor] ?? []).includes(x)) });
  return out;
})();

const ALL_KIND_WORDS = new Set(Object.values(KIND_WORDS).flat());

/** Places a sentence can name in this village: regions by id, name and the usual ways of saying them (never a kind word). */
function placesOf(s: RunState): { phrase: string; region: string }[] {
  const out: { phrase: string; region: string }[] = [];
  const add = (phrase: string, region: string) => {
    if (!ALL_KIND_WORDS.has(phrase)) out.push({ phrase, region });
  };
  for (const r of s.world.regions) {
    add(r.id, r.id);
    if (r.name) add(normalizeBelief(r.name), r.id);
    if (['east', 'west', 'north', 'south'].includes(r.id)) for (const f of [`${r.id} bank`, `${r.id}ern bank`, `${r.id} side`, `${r.id}bank`, `the ${r.id}`]) add(f, r.id);
  }
  return out;
}

export function mentionsOf(toks: Tok[], s: RunState): Mention[] {
  const cands: Mention[] = [];
  // every form of every word in the sentence: a phrase is only tried when all its words occur somewhere
  const forms = new Set<string>();
  for (const t of toks) for (const v of t.vs) forms.add(v);
  const possible = (phrase: string) => compile(phrase).every((w) => w === null || [...w].some((x) => forms.has(x)));
  const add = (cat: Cat, phrase: string, extra: Partial<Mention> = {}) => {
    if (!possible(phrase)) return;
    for (const hit of findAll(toks, phrase)) cands.push({ cat, toks: hit, at: hit[0], end: hit[hit.length - 1] + 1, phrase, ...extra });
  };
  for (const r of REASONS) for (const p of r.phrases ?? []) add('reason', p, { reason: r });
  for (const p of FLAVOR) add('flavor', p);
  for (const c of CONDITIONS) for (const p of c.phrases) add('cond', p, { test: c.test });
  for (const t of TRIGGERS) for (const p of t.phrases) add('trigger', p, { event: t.event, ...(t.min ? { min: t.min } : {}) });
  for (const [p, senses] of SENSE_INDEX) add('sense', p, { senses });
  for (const a of ANCHOR_PHRASES)
    if (possible(a.phrase))
      for (const hit of findAll(toks, a.phrase)) {
        const n = normalizeBelief(ANCHOR_WORDS[a.anchor].find((w) => a.phrase.endsWith(` ${w}`)) ?? '').split(' ').length || 1;
        cands.push({ cat: 'anchor', toks: hit.slice(-n), soft: hit.slice(0, -n), at: hit[hit.length - n], end: hit[hit.length - 1] + 1, phrase: a.phrase, anchor: a.anchor, radius: a.radius, active: a.active });
      }
  for (const p of placesOf(s)) {
    add('place', p.phrase, { region: p.region });
    for (const prep of ['in', 'on', 'over', 'to', 'toward', 'towards', 'onto', 'across', 'of', 'at'])
      for (const mid of ['', 'the ']) add('place', `${prep} ${mid}${p.phrase}`, { region: p.region });
  }
  for (const u of UNKNOWN_PLACES) for (const prep of ['on the', 'in the', 'at the', 'by the', 'across the', 'along the', 'near the', 'beside the', 'under the']) add('place', `${prep} ${u}`, { region: '?' });
  for (const [kind, words] of Object.entries(KIND_WORDS) as [TargetKind, string[]][]) for (const w of words) add('kind', w, { kind });
  for (const w of ILLNESS_WORDS) add('illness', w);
  for (const st of STRENGTH) add('strength', st.phrase, { value: st.value });
  for (const [w, n] of Object.entries(NUMBERS)) if (w !== 'a') add('number', w, { value: n });
  toks.forEach((t, i) => {
    if (/^\d+$/.test(t.w)) cands.push({ cat: 'number', toks: [i], at: i, end: i + 1, phrase: t.w, value: Math.min(1e6, Number(t.w)) });
  });
  for (const n of NEGATORS) add('negator', n);
  for (const p of PRONOUNS) add('pronoun', p);
  for (const v of SPEECH_VERBS) add('speech', v);
  // a word after "the", "every", "our"... is a thing, not a verb: "the flood flows away", "the crossing holds"
  const kindAt = new Set(cands.filter((m) => m.cat === 'kind' && m.toks.length === 1).map((m) => m.at));
  const nounAfterDet = (m: Mention) => m.toks.length === 1 && (m.cat === 'sense' || m.cat === 'trigger') && kindAt.has(m.at) && m.at > 0 && DETERMINERS.has(toks[m.at - 1].w);
  const pool = cands.filter((m) => !nounAfterDet(m));
  // longest first (by the words spanned), then by category, then left to right; each word is used once
  const span = (m: Mention) => m.toks.length + (m.soft?.length ?? 0);
  // on a tie, a phrase with its verb ("bell rings") beats a bare noun phrase ("the bell")
  const bare = (m: Mention) => (DETERMINERS.has(m.phrase.split(' ')[0]) ? 1 : 0);
  pool.sort((a, b) => span(b) - span(a) || PRIORITY[a.cat] - PRIORITY[b.cat] || bare(a) - bare(b) || a.at - b.at);
  const taken = new Set<number>();
  const kept: Mention[] = [];
  for (const m of pool) {
    if (m.toks.some((i) => taken.has(i)) || (m.soft ?? []).some((i) => taken.has(i) && !kept.some((k) => k.cat === 'sense' && k.toks.includes(i)))) continue;
    for (const i of m.toks) taken.add(i);
    kept.push(m);
  }
  return kept.sort((a, b) => a.at - b.at);
}

// ------------------------------------------------------------------------------------------ clauses

interface Seg {
  from: number;
  to: number;
  sub: boolean;
  unless: boolean;
  or: boolean;
  /** opened by "and", "but", "then" or "yet": a coordinated claim of its own, not a phrase set off by commas */
  joined: boolean;
}

function segmentsOf(toks: Tok[]): Seg[] {
  const out: Seg[] = [];
  let from = 0;
  let joined = false;
  const close = (to: number) => {
    if (to <= from) return;
    const ws = toks.slice(from, to).map((t) => t.w);
    const head = ws.slice(0, 3).join(' ');
    out.push({ from, to, sub: SUBORDINATORS.some((x) => head === x || head.startsWith(`${x} `)), unless: ws[0] === 'unless', or: ws.includes('or'), joined });
  };
  toks.forEach((t, i) => {
    if (PUNCT.has(t.w) || JOINERS.has(t.w)) {
      close(i);
      joined = JOINERS.has(t.w) || (joined && from === i); // ", and" opens a coordinated clause too
      from = i + 1;
    } else if (SPLIT_SUBS.has(t.w) && i > from) {
      joined = false;
      close(i);
      from = i;
    }
  });
  close(toks.length);
  return out;
}

const within = (m: Mention, g: Seg) => m.at >= g.from && m.at < g.to;

interface Ev {
  event: TriggerEvent;
  min: number | null;
  not: boolean;
  words: string;
  positional: string | null;
}

interface Draft {
  seg: Seg;
  kind: TargetKind | null;
  sense: Sense | null;
  negated: boolean;
  senseM: Mention;
  targetM: Mention | null;
  /** a landmark word used as a place for the thing ("the bell tower stones"): a place, not a power */
  modifierM: Mention | null;
  /** an object pronoun that could mean either of these ("…have trouble finding them") */
  refKinds?: TargetKind[];
  source: TriggerEvent | null;
  events: Ev[];
  conds: { test: string; words: string }[];
  near: { anchor: string; radius: number; words: string } | null;
  place: { region: string; words: string } | null;
  toward: { region: string; words: string } | null;
  strength: number | null;
  count: number | null;
  problem: string | null;
}

const SOURCE_EVENTS = new Set<TriggerEvent>(['bell', 'lantern', 'smoke_fire', 'rain']);
/** Landmarks that are themselves things a belief can change. */
const ANCHOR_KIND: Record<string, TargetKind> = { bridge: 'bridge', home: 'home', field: 'field', beacon: 'lantern', pen: 'livestock' };
const POSITIONAL: Partial<Record<TriggerEvent, string>> = { bell: 'belltower', lantern: 'beacon', smoke_fire: 'campfire', watchers: 'bridge' };

/** The power a word names when it is the doer of a change ("the bells make…", "smoke hides…", "lanterns make…"). */
function sourceOf(m: Mention): TriggerEvent | null {
  if (m.cat === 'trigger' && m.event && SOURCE_EVENTS.has(m.event)) return m.event;
  if (m.cat === 'kind' && m.kind === 'lantern') return 'lantern';
  if (m.cat === 'kind' && m.kind === 'rain') return 'rain';
  return null;
}

// ------------------------------------------------------------------------------------------ reading

export function readBelief(s: RunState, raw: string, optsIn: ReadOptions = {}): Reading {
  // Reality Lab limits follow the run itself; a caller cannot widen them
  const opts: ReadOptions = { ...optsIn, lab: !!s.v2?.lab };
  const text = sanitizeText(raw).slice(0, 1000);
  const notes: string[] = [];
  const base = { text, reader: READER_ID, notes };
  if (!text) return { ...base, kind: 'unsupported', reasons: [{ id: 'empty', words: '', why: 'there is nothing to read' }], alternatives: [] };
  if (text.length > MAX_BELIEF_TEXT) return { ...base, kind: 'unsupported', reasons: [{ id: 'too_long', words: '', why: `a belief is at most ${MAX_BELIEF_TEXT} characters` }], alternatives: [] };

  const reasons: NamedReason[] = [];
  const addReason = (id: string, words: string, why?: string) => {
    if (!reasons.some((r) => r.id === id && r.words === words)) reasons.push({ id, words, why: why ?? REASONS.find((r) => r.id === id)?.why ?? '' });
  };
  const { rest, removed } = stripInstructions(text);
  if (removed.length) {
    addReason('instruction', removed.join(' … ').slice(0, 120));
    // what an instruction asked for still says what kind of request it was ("give me infinite influence")
    const t2 = tokenize(normalizeBelief(removed.join(' . ')));
    for (const m of mentionsOf(t2, s)) if (m.cat === 'reason' && m.reason?.id === 'game') addReason('game', m.toks.map((i) => t2[i].w).join(' '), m.reason.why);
  }
  const toks = tokenize(normalizeBelief(rest));
  // the player's own words, in their own case, for what each part of a reading came from
  const original = (ws: string): string => {
    if (!ws) return ws;
    const re = new RegExp(ws.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("[^a-z0-9]+(?:(?:s|'s)[^a-z0-9]+)?"), 'i');
    return re.exec(rest)?.[0] ?? ws;
  };
  const wordsOf = (m: { toks: number[]; soft?: number[] } | null): string => (m ? original([...(m.soft ?? []), ...m.toks].sort((a, b) => a - b).map((i) => toks[i].w).join(' ')) : '');
  const ms = mentionsOf(toks, s);
  const segs = segmentsOf(toks);
  const blockers: Mention[] = [];
  for (const m of ms)
    if (m.cat === 'reason' && m.reason) {
      if (m.reason.block) blockers.push(m);
      addReason(m.reason.id, wordsOf(m), m.reason.why);
    }

  // ---- one clause per segment that names a change
  const senseSegs = segs.filter((g) => ms.some((m) => m.cat === 'sense' && within(m, g)));
  const drafts: Draft[] = [];
  let lastKind: { kind: TargetKind; m: Mention } | null = null;
  const kindsSeen: Mention[] = ms.filter((m) => m.cat === 'kind');
  for (const g of segs) {
    const inG = ms.filter((m) => within(m, g));
    if (!senseSegs.includes(g)) {
      const k = inG.filter((m) => m.cat === 'kind').pop();
      if (k?.kind) lastKind = { kind: k.kind, m: k };
      continue;
    }
    // the verb of the clause: the first one that fits its subject ("stones grow lighter": lighter, not grow), never a participle
    // describing a noun ("wheat growing beside the beacons does not catch fire") when the clause has another verb
    const sensesInG = inG.filter((m) => m.cat === 'sense');
    const participle = (m: Mention) => sensesInG.length > 1 && /ing$/.test(toks[m.at].w) && inG.some((k) => k.cat === 'kind' && k.end === m.at);
    const usable = sensesInG.filter((m) => !participle(m));
    const head = inG.find((m) => m.cat === 'kind' || m.cat === 'illness');
    const senseM = usable.find((m) => head?.kind && m.at > head.at && m.senses!.some((x) => x.kinds.includes(head.kind!))) ?? usable[0] ?? sensesInG[0];
    const heal = SENSES.find((x) => x.id === 'heal')!;
    // homes stand for the people in them when a change can only touch people ("keep sickness from the homes")
    const fitsAs = (k: TargetKind): { sense: Sense; kind: TargetKind } | null => {
      const se = senseM.senses!.find((x) => x.kinds.includes(k));
      if (se) return { sense: se, kind: k };
      const people = k === 'home' ? senseM.senses!.find((x) => x.kinds.includes('villager') && x.op === 'GIVE_STATUS_EFFECT') : null;
      return people ? { sense: people, kind: 'villager' } : null;
    };
    const fits = (k: TargetKind): Sense | null => fitsAs(k)?.sense ?? null;
    const before = inG.filter((m) => m.at < senseM.at);
    const negated = before.some((m) => m.cat === 'negator');
    const nounish = (m: Mention) => m.cat === 'kind' || m.cat === 'illness' || (m.cat === 'trigger' && !!sourceOf(m));
    let subj = before.find(nounish) ?? null;
    let modifier: Mention | null = null;
    // "the bell tower stones": in a run of nouns the last is the thing; a landmark before it says where
    while (subj) {
      const next = before.find((m) => nounish(m) && m.at > subj!.at && m.at <= subj!.end + 1 && !before.some((x) => x.cat === 'sense' && x.at > subj!.at && x.at < m.at));
      if (!next || next.cat !== 'kind') break;
      modifier = subj;
      subj = next;
    }
    // what the change could fall on: things named after the doer, before the verb ("make wet stones light") or after it, including
    // landmarks that are things ("keep sickness from the homes")
    const asKind = (m: Mention): TargetKind | null => (m.cat === 'kind' ? m.kind! : m.cat === 'anchor' ? (ANCHOR_KIND[m.anchor!] ?? null) : null);
    const objects = inG.filter((m) => m !== subj && (m.cat === 'kind' || m.cat === 'illness' || (m.cat === 'anchor' && asKind(m))) && (m.at > senseM.at ? !senseM.toks.includes(m.at) : !!subj && m.at > subj.at));
    const pronoun = before.find((m) => m.cat === 'pronoun');
    const prev = drafts[drafts.length - 1];
    const d: Draft = { seg: g, kind: null, sense: null, negated, senseM, targetM: null, modifierM: null, source: null, events: [], conds: [], near: null, place: null, toward: null, strength: null, count: null, problem: null };
    if (modifier && modifier !== subj) {
      const anchor = modifier.cat === 'trigger' && modifier.event === 'bell' ? 'belltower' : modifier.kind === 'lantern' || (modifier.cat === 'trigger' && modifier.event === 'lantern') ? 'beacon' : modifier.cat === 'trigger' && modifier.event === 'smoke_fire' ? 'campfire' : null;
      if (anchor) d.near = { anchor, radius: 1, words: wordsOf(modifier) };
      d.modifierM = modifier;
    }
    const objFit = objects.find((o) => (asKind(o) && fits(asKind(o)!)) || o.cat === 'illness');
    const take = (m: Mention, k: TargetKind, sense?: Sense) => {
      const f = fitsAs(k);
      d.kind = sense ? k : (f?.kind ?? k);
      d.targetM = m;
      d.sense = sense ?? f?.sense ?? null;
    };
    const towardSense = senseM.senses!.find((x) => x.toward);
    if (subj?.cat === 'kind' && subj.kind && fits(subj.kind) && !(sourceOf(subj) && objFit && !fits(subj.kind)?.kinds.includes(subj.kind))) take(subj, subj.kind);
    else if (subj?.cat === 'illness') take(subj, 'villager', heal);
    else if (subj && objFit && (sourceOf(subj) || (subj.kind === 'fire' && senseM.senses!.some((x) => x.id === 'fireproof')))) {
      if (objFit.cat === 'illness') take(objFit, 'villager', heal);
      else take(objFit, asKind(objFit)!);
      d.source = sourceOf(subj);
    } else if (subj?.cat === 'kind' && (subj.kind === 'field' || subj.kind === 'home') && towardSense && objFit && asKind(objFit) === 'rain') {
      // "the orchard hungers for thunder": the rain comes to the place that wants it
      take(objFit, 'rain', towardSense);
      const r = regionWith(s, subj.kind);
      if (r) d.toward = { region: r, words: wordsOf(subj) };
    } else if (subj?.cat === 'kind' && subj.kind && !objFit && inG.some((m) => m.cat === 'pronoun' && m.at > senseM.at)) {
      // "the wolves have trouble finding them": the subject does not fit, so the pronoun is what changes; which thing is it?
      const pron = inG.find((m) => m.cat === 'pronoun' && m.at > senseM.at)!;
      const refs: TargetKind[] = [];
      for (let i = pron.at - 1; i >= 0; i--) if (agrees(toks[i].w, toks[pron.at].w)) for (const v of toks[i].vs) { const k = KIND_OF_WORD.get(v); if (k && fits(k) && !refs.includes(k)) refs.push(k); }
      if (refs.length === 1) take(pron, refs[0]);
      else if (refs.length > 1) {
        take(pron, refs[0]);
        d.refKinds = refs.slice(0, 2);
      } else d.problem = `incompatible:${subj.kind}`;
    } else if (subj?.cat === 'kind' && subj.kind) d.problem = `incompatible:${objects.map(asKind).find((k) => k) ?? subj.kind}`;
    else if (subj && sourceOf(subj) && objects.length) d.problem = `incompatible:${objects.map(asKind).find((k) => k) ?? 'villager'}`;
    else if (!subj && objFit && !pronoun) {
      // "…and make fire burn weaker", "…but draw wolves": the doer carries over from the clause before
      if (objFit.cat === 'illness') take(objFit, 'villager', heal);
      else take(objFit, asKind(objFit)!);
      d.source = prev?.source ?? null;
    } else if (!subj) {
      // "it holds": what "it" is, else what the clause before was about
      const ref = pronoun && !prev ? referentBefore(toks, pronoun.at) : null;
      const k = ref ?? prev?.kind ?? lastKind?.kind ?? null;
      if (k && fits(k)) {
        take(prev?.targetM ?? lastKind?.m ?? pronoun!, k);
        d.source = prev?.source ?? null;
      } else if (k) d.problem = `incompatible:${k}`;
    }
    if (subj && !d.kind && !d.problem && subj.cat === 'trigger') d.problem = 'no_target';
    if (d.kind && !d.sense) d.sense = fits(d.kind);
    if (d.kind && !d.sense) d.problem = `incompatible:${d.kind}`;
    if (!d.kind && !d.problem) d.problem = 'no_target';
    // the doer of the clause before carries over when this clause names no power of its own ("the bells make X weaker and Y heavier")
    if (!d.source && prev?.source && !inG.some((m) => m.cat === 'trigger')) d.source = prev.source;
    if (d.kind && d.targetM) lastKind = { kind: d.kind, m: d.targetM };
    drafts.push(d);
  }

  // ---- powers, conditions, places and strength for each clause
  const firstSense = senseSegs[0]?.from ?? toks.length;
  const lastSense = senseSegs[senseSegs.length - 1]?.to ?? 0;
  const shared: { m: Mention; g: Seg }[] = [];
  const attached = new Map<Draft, { m: Mention; g: Seg }[]>();
  for (const g of segs) {
    if (senseSegs.includes(g)) continue;
    const list = ms.filter((m) => within(m, g)).map((m) => ({ m, g }));
    if (g.to <= firstSense) {
      shared.push(...list);
      continue;
    }
    // a trailing clause ("…when rain kisses them") belongs to the clause it follows; a final "while the bell rings" also speaks
    // for every clause that names no power of its own
    const owner = [...drafts].reverse().find((d) => d.seg.to <= g.from) ?? drafts[0];
    if (owner) attached.set(owner, [...(attached.get(owner) ?? []), ...list]);
    if (g.from >= lastSense && g.sub) shared.push(...list.filter((x) => x.m.cat === 'trigger' || x.m.cat === 'speech').map((x) => ({ ...x, trailing: true, owner })));
  }
  // a power at the very start ("At night the river slows…") speaks for the whole sentence
  const OPENERS = new Set(['at', 'after', 'during', 'every', 'each', 'by', 'under', 'beneath', 'in', 'on', 'tonight', 'when', 'whenever', 'if', 'while', 'once', 'nightly']);
  const opening = ms.filter((m) => m.at <= 1 && (m.cat === 'trigger' || m.cat === 'cond') && OPENERS.has(toks[m.at].w) && senseSegs[0] && within(m, senseSegs[0]));
  // speech powers a belief when people speak: a villager is named, or the sentence tells the Keeper to speak ("Speak its name…")
  const hasPerson = ms.some((m) => (m.cat === 'kind' && m.kind === 'villager') || ['anyone', 'someone', 'whoever'].includes(m.phrase)) || ms.some((m) => m.cat === 'speech' && m.at === 0);
  const ownTrig = (d: Draft) => ms.some((m) => within(m, d.seg) && (m.cat === 'trigger' || (m.cat === 'anchor' && ['beacon', 'campfire'].includes(m.anchor!))) && m !== d.targetM);
  const anyOwn = drafts.some(ownTrig);
  for (const d of drafts) {
    const own = ms.filter((m) => within(m, d.seg)).map((m) => ({ m, g: d.seg }));
    const pool = [...own, ...(attached.get(d) ?? [])];
    for (const x of shared) {
      const t = x as { trailing?: boolean; owner?: Draft };
      if (t.owner === d) continue;
      if (!t.trailing || !anyOwn || !ownTrig(d)) pool.push(x);
    }
    for (const m of opening) if (!pool.some((x) => x.m === m)) pool.push({ m, g: senseSegs[0] });
    for (const { m, g } of pool) {
      if (m === d.targetM || m === d.modifierM) continue;
      const not = g.unless;
      if (m.cat === 'trigger' && m.event) {
        if (d.kind && m.event === 'rain' && d.kind === 'rain') continue;
        const counted = m.event === 'watchers' ? ms.find((n) => n.cat === 'number' && within(n, g) && n.value && n.value <= 8)?.value : undefined;
        d.events.push({ event: m.event, min: m.event === 'watchers' || m.event === 'flood' ? (counted ?? m.min ?? 1) : null, not, words: wordsOf(m), positional: POSITIONAL[m.event] ?? null });
      } else if (m.cat === 'speech' && hasPerson) d.events.push({ event: 'spoken', min: null, not, words: wordsOf(m), positional: null });
      else if (m.cat === 'cond' && m.test) d.conds.push({ test: m.test, words: wordsOf(m) });
      else if (m.cat === 'anchor' && m.anchor && !d.near) {
        d.near = { anchor: m.anchor, radius: Math.min(opts.lab ? LAB_LIMITS.maxRadius : LIMITS.maxRadius, m.radius ?? 2), words: wordsOf(m) };
        // lanterns and smoke fires named as the place must be burning; a bell tower named as a place rings only if the words say so
        const ev: TriggerEvent | null = m.anchor === 'beacon' ? 'lantern' : m.anchor === 'campfire' ? 'smoke_fire' : m.anchor === 'belltower' && m.active ? 'bell' : null;
        if (ev) d.events.push({ event: ev, min: null, not, words: wordsOf(m), positional: POSITIONAL[ev] ?? null });
      } else if (m.cat === 'place' && m.region) {
        if (m.region === '?') addReason('unknown_place', wordsOf(m));
        else if (d.sense?.toward && m.at > d.senseM.at) d.toward = { region: m.region, words: wordsOf(m) };
        else if (!d.place) d.place = { region: m.region, words: wordsOf(m) };
      } else if (m.cat === 'strength' && m.value) d.strength = Math.max(d.strength ?? 0, m.value);
      else if (m.cat === 'number' && m.value) d.count = m.value;
      else if (m.cat === 'kind' && m.kind && d.sense?.toward && m.at > d.senseM.at && (m.kind === 'field' || m.kind === 'home')) {
        const r = regionWith(s, m.kind);
        if (r) d.toward = { region: r, words: wordsOf(m) };
      } else if (m.cat === 'kind' && m.kind && sourceOf(m) && m.kind !== d.kind && g === d.seg) {
        // a lantern named beside a change it does not undergo powers it ("the river dreams of lamplight and bends toward it")
        const ev = sourceOf(m)!;
        d.events.push({ event: ev, min: null, not, words: wordsOf(m), positional: POSITIONAL[ev] ?? null });
      }
    }
    if (d.source && !d.events.some((e) => e.event === d.source)) d.events.push({ event: d.source, min: null, not: false, words: '', positional: POSITIONAL[d.source] ?? null });
    // "the river slows around it": measured from what "it" is
    if (!d.near && /\b(around|near|beside|by|toward|towards) (it|them)\b/.test(toks.slice(d.seg.from, d.seg.to).map((t) => t.w).join(' '))) {
      const ref = drafts.find((x) => x !== d && x.kind === 'bridge');
      if (ref) d.near = { anchor: 'bridge', radius: 2, words: 'around it' };
    }
  }

  // ---- the sun, moon or stars as the doer: "the moon pulls the river away" (a clear night stands in for them)
  for (const d of drafts) {
    const first = ms.find((m) => within(m, d.seg) && m.cat !== 'negator' && m.cat !== 'pronoun' && m.cat !== 'flavor');
    if (first && first.cat === 'trigger' && first.event === 'night' && first.at < d.senseM.at && /^(the )?(moon|sun|stars?|moonlight)$/.test(wordsOf(first))) {
      addReason('sky_bodies', wordsOf(first));
      d.events = d.events.filter((e) => e.words !== wordsOf(first));
      d.events.push({ event: 'clear_night', min: null, not: false, words: wordsOf(first), positional: null });
    }
  }

  // ---- a "when …" clause whose power is a pronoun ("whenever it falls", it = the rain), or no power the game knows
  for (const g of segs) {
    if (!g.sub || g.unless || senseSegs.includes(g)) continue;
    const inG = ms.filter((m) => within(m, g));
    if (inG.some((m) => m.cat === 'trigger' || m.cat === 'cond' || m.cat === 'speech' || (m.cat === 'anchor' && (m.anchor === 'beacon' || m.anchor === 'campfire' || m.active)))) continue;
    const pron = inG.find((m) => m.cat === 'pronoun');
    const ref = pron ? referentBefore(toks, pron.at) : null;
    const ev: TriggerEvent | null = ref === 'rain' ? 'rain' : ref === 'lantern' ? 'lantern' : ref === 'water' ? 'flood' : null;
    if (ev) {
      for (const d of drafts) if (!d.events.length) d.events.push({ event: ev, min: ev === 'flood' ? 3 : null, not: false, words: toks.slice(g.from, g.to).map((t) => t.w).join(' '), positional: POSITIONAL[ev] ?? null });
      continue;
    }
    if (inG.some((m) => m.cat === 'kind' || m.cat === 'sense')) continue; // handled below ("Should the bridge fall")
    addReason('unknown_trigger', toks.slice(g.from, g.to).map((t) => t.w).join(' '));
  }
  for (const g of segs) {
    // a separate claim about the moon or stars ("…and the moon glows red"), not the poetic framing of one ("Stars whisper to the wheat")
    if (g.sub || senseSegs.includes(g) || g.to - g.from < 3 || !senseSegs.some((x) => x.to <= g.from)) continue;
    const first = ms.find((m) => within(m, g) && m.cat !== 'negator' && m.cat !== 'pronoun' && m.cat !== 'flavor');
    if (first && first.cat === 'trigger' && first.event === 'night' && /^(the )?(moon|sun|stars?)$/.test(wordsOf(first).toLowerCase()) && first.at <= g.from + 1) addReason('sky_bodies', toks.slice(g.from, g.to).map((t) => t.w).join(' '));
  }

  // ---- a condition clause that names a change, not a power: "Should the bridge fall, chickens fly"
  const mainElsewhere = (d: Draft) => drafts.some((x) => x !== d && !x.seg.sub) || segs.some((g) => !g.sub && g !== d.seg && ms.some((m) => within(m, g) && (m.cat === 'kind' || m.cat === 'reason')));
  for (const d of drafts)
    if (d.seg.sub && mainElsewhere(d) && !ms.some((m) => within(m, d.seg) && m.cat === 'trigger')) {
      d.problem = 'trigger_clause';
      // "whenever it falls" (it = the rain), "wherever the lanterns shine": the clause names a power the game knows
      const pron = ms.find((m) => within(m, d.seg) && m.cat === 'pronoun');
      const ref = pron ? referentBefore(toks, pron.at) : d.kind;
      const ev: TriggerEvent | null = ref === 'rain' ? 'rain' : ref === 'lantern' ? 'lantern' : ref === 'water' ? 'flood' : null;
      if (ev) {
        for (const x of drafts) if (x !== d && !x.events.some((e) => e.event !== 'always')) x.events.push({ event: ev, min: ev === 'flood' ? 3 : null, not: false, words: toks.slice(d.seg.from, d.seg.to).map((t) => t.w).join(' '), positional: POSITIONAL[ev] ?? null });
        continue;
      }
      addReason('unknown_trigger', toks.slice(d.seg.from, d.seg.to).map((t) => t.w).join(' '));
    }

  // ---- negation and strength → effects
  const asks: { d: Draft; sense: Sense; alts: { sense: Sense; kind: TargetKind }[] }[] = [];
  const built: { d: Draft; clause: Clause }[] = [];
  const noChange: Draft[] = [];
  for (const d of drafts) {
    if (d.problem || !d.kind || !d.sense) continue;
    if (d.refKinds && d.refKinds.length > 1 && !d.negated) {
      const se = d.sense;
      asks.push({ d, sense: se, alts: d.refKinds.map((k) => ({ sense: SENSES.find((x) => x.op === se.op && x.id === se.id) ?? se, kind: k })) });
      d.problem = 'ask';
      continue;
    }
    let sense = d.sense;
    if (sense.onlyNegated && !d.negated) {
      d.problem = 'no_mechanic';
      continue;
    }
    if (sense.ask && !d.negated) {
      // one word, two physical meanings here: the player chooses
      const alts = sense.ask
        .map((id) => SENSES.find((x) => x.id === id && (x.kinds.includes(d.kind!) || (d.kind === 'home' && x.kinds.includes('villager') && x.op === 'GIVE_STATUS_EFFECT'))))
        .filter((x): x is Sense => !!x)
        .map((x) => ({ sense: x, kind: x.kinds.includes(d.kind!) ? d.kind! : ('villager' as TargetKind) }));
      if (alts.length) {
        asks.push({ d, sense, alts });
        d.problem = 'ask';
        continue;
      }
    }
    if (d.negated) {
      if (sense.neg === 'ask') {
        asks.push({ d, sense, alts: [{ sense: SENSES.find((x) => x.id === (sense.id === 'away' ? 'toward' : 'lift'))!, kind: d.kind! }] });
        d.problem = 'ask';
        continue;
      }
      const negs = sense.neg && sense.neg !== 'none' ? (Array.isArray(sense.neg) ? sense.neg : [sense.neg]) : [];
      const flipped = negs.map((id) => SENSES.find((x) => x.id === id && x.kinds.includes(d.kind!))).find((x) => !!x) ?? null;
      if (!flipped) {
        noChange.push(d);
        d.problem = 'no_change';
        continue;
      }
      sense = flipped;
    }
    if (sense.guarantee) addReason('absolute', wordsOf(d.senseM));
    d.sense = sense;
    const effect = effectOf(sense, d, addReason);
    const clause: Clause = { id: 'c1', when: triggerOf(d).trigger, where: conditionOf(d.conds), target: { kind: d.kind, near: null, tags: [], region: null }, effect, duration: 'night' };
    if (d.near && d.near.anchor !== d.kind) {
      const regionLevel = ['water', 'rain', 'fire', 'wolf'].includes(d.kind);
      const positionalSame = d.events.some((e) => !e.not && e.positional === d.near!.anchor);
      if (!(regionLevel && positionalSame)) clause.target.near = { anchor: d.near.anchor as never, radius: d.near.radius };
      const ef = effect as unknown as Record<string, unknown>;
      if (typeof ef.radius === 'number') ef.radius = Math.max(1, Math.min(LIMITS.maxRadius, d.near.radius));
    }
    // wolves or water moved with no source to move from: "…enter the village" measures from the homes
    if ((d.kind === 'wolf' || d.kind === 'water') && !clause.target.near && !d.events.some((e) => e.positional && !e.not) && /\b(village|home|homes|house|houses)\b/.test(toks.slice(d.seg.from, d.seg.to).map((t) => t.w).join(' ')))
      clause.target.near = { anchor: 'home', radius: 2 };
    built.push({ d, clause });
  }

  // ---- two verbs for one change ("the barley swells and ripens"): one clause
  for (let j = built.length - 1; j > 0; j--) {
    const b = built[j].clause;
    if (built.slice(0, j).some((x) => x.clause.target.kind === b.target.kind && x.clause.effect.op === b.effect.op && dirOf(x.clause.effect) === dirOf(b.effect) && JSON.stringify(x.clause.when) === JSON.stringify(b.when))) built.splice(j, 1);
  }

  // ---- contradictions: one thing pushed both ways
  const AX: Partial<Record<OpId, string>> = { MOVE_AWAY: 'MOVE', MOVE_TOWARD: 'MOVE', GROW_ENTITY: 'GROWTH', DECAY_ENTITY: 'GROWTH' };
  for (let i = 0; i < built.length; i++)
    for (let j = i + 1; j < built.length; j++) {
      const a = built[i].clause;
      const b = built[j].clause;
      const da = dirOf(a.effect);
      if (a.target.kind === b.target.kind && (AX[a.effect.op] ?? a.effect.op) === (AX[b.effect.op] ?? b.effect.op) && da !== 0 && da === -dirOf(b.effect)) addReason('contradiction', `${wordsOf(built[i].d.senseM)} … ${wordsOf(built[j].d.senseM)}`);
    }
  for (const n of noChange) if (built.some((c) => c.d.kind === n.kind && c.d.sense?.op === n.sense?.op)) addReason('contradiction', wordsOf(n.senseM));

  // ---- verdict
  const blockIds = new Set(REASONS.filter((r) => r.block).map((r) => r.id));
  const fatal = ['time', 'the_dead', 'minds', 'game', 'infinite_resource', 'transform', 'contradiction'];
  const valid = built.filter((c) => !blockers.some((b) => within(b, c.d.seg)));
  // a forbidden idea inside a clause refuses that clause; one in a clause of its own leaves the rest as a partial reading. A sentence
  // that is only about such an idea, or contradicts itself, is refused whole.
  // its own clause: a part of the sentence that names a thing or a change of its own ("…and the wheat lost last week is restored"),
  // or a coordinated claim ("…and do whatever the Warden commands"), not a modifier of the change beside it ("…hatch, without end, …")
  const inOwnClause = (b: Mention) => {
    const g = segs.find((x) => within(b, x));
    if (!g) return false;
    const names = g.joined || ms.some((m) => within(m, g) && m !== b && (m.cat === 'kind' || m.cat === 'illness' || m.cat === 'sense'));
    return names && (!senseSegs.includes(g) || drafts.some((d) => d.seg === g && d.problem));
  };
  const hardBlock = reasons.some((r) => r.id === 'contradiction') || blockers.some((b) => b.reason && (fatal.includes(b.reason.id) || (b.reason.block && ['absolute', 'unbounded_spawn'].includes(b.reason.id))) && (!inOwnClause(b) || !built.some((c) => !within(b, c.d.seg))));
  const unsupported = (): Reading => {
    if (noChange.length) addReason('no_change', wordsOf(noChange[0].senseM));
    for (const d of drafts) {
      if (d.problem?.startsWith('incompatible')) {
        const k = d.problem.split(':')[1] as TargetKind;
        addReason('incompatible', wordsOf(d.senseM), `nothing in this world lets ${KINDS[k] ? KINDS[k].label : 'that'} do that ("${wordsOf(d.senseM)}"): no operator acts on ${KINDS[k] ? KINDS[k].label : 'it'} that way`);
      }
      if (d.problem === 'no_mechanic' || d.problem === 'no_target') addReason('no_mechanic', wordsOf(d.senseM));
    }
    if (!reasons.some((r) => blockIds.has(r.id) || r.id === 'instruction')) addReason('no_mechanic', kindsSeen.map((m) => wordsOf(m)).join(', ') || text.slice(0, 60));
    const order = [...reasons.filter((r) => blockIds.has(r.id) && r.id !== 'no_mechanic'), ...reasons.filter((r) => r.id === 'no_mechanic'), ...reasons.filter((r) => !blockIds.has(r.id))];
    // alternatives only where they are honestly related: never for "nothing changes", a contradiction or a forbidden concept
    const honest = !hardBlock && !reasons.some((r) => r.id === 'no_change' || r.id === 'instruction');
    return { ...base, kind: 'unsupported', reasons: dedupe(order), alternatives: honest ? alternativesFor(s, kindsSeen, opts) : [] };
  };
  if (hardBlock || (!valid.length && !asks.length)) return unsupported();

  if (asks.length) {
    const { d, sense, alts } = asks[0];
    const others = valid.filter((c) => c.d !== d);
    const choices = alts
      .map(({ sense: alt, kind }) => {
        const dd: Draft = { ...d, sense: alt, kind };
        const clause: Clause = { id: 'c1', when: triggerOf(dd).trigger, where: conditionOf(dd.conds), target: { kind, near: null, tags: [], region: null }, effect: effectOf(alt, dd, () => undefined), duration: 'night' };
        return assemble(s, text, [...others.slice(0, (opts.lab ? LAB_LIMITS : LIMITS).maxClauses - 1), { d: dd, clause }], opts, removed, reasons, wordsOf, [`reads "${wordsOf(d.senseM)}" as: ${OPERATORS[alt.op].label}`]);
      })
      .filter((c): c is ReadCandidate => !!c);
    const question = sense.id === 'away' && d.negated
      ? `Do you mean the ${KINDS[d.kind!].label} are drawn to it? (If you only mean they are not afraid, nothing would change.)`
      : sense.id === 'not_drown'
        ? `Shall the ${KINDS[d.kind!].label} rise above the water instead? (Nothing in this world simply forbids drowning.)`
        : d.refKinds && d.refKinds.length > 1
          ? `Which do you mean: ${d.refKinds.map((k) => KINDS[k].label).join(', or ')}?`
          : `"${wordsOf(d.senseM)}" can mean more than one thing here. Which did you mean?`;
    if (choices.length) return { ...base, kind: 'ambiguous', question, choices: choices.slice(0, 2) };
  }
  // a power the sentence leaves open where the village offers several ("the river turns away", "rain is drawn to the orchard")
  const open = valid.find((c) => c.d.events.length === 0 && ['water', 'wolf', 'rain'].includes(c.d.kind!) && !c.clause.target.near);
  if (open && !reasons.some((r) => r.id !== 'narrative')) {
    const options = openTriggers(s, open.d.kind!).slice(0, 2);
    const choices = options
      .map((ev) => assemble(s, text, valid.map((c) => (c === open ? { d: c.d, clause: { ...c.clause, when: { event: ev, min: null } as Trigger } } : c)), opts, removed, reasons, wordsOf, [`powered by ${eventLabel(ev)}`]))
      .filter((c): c is ReadCandidate => !!c);
    if (choices.length) return { ...base, kind: 'ambiguous', question: `What powers it: ${options.map(eventLabel).join(', or ')}?`, choices };
  }
  const max = opts.lab ? LAB_LIMITS.maxClauses : LIMITS.maxClauses;
  let use = valid;
  if (use.length > max) {
    addReason('third_clause', use.slice(max).map((c) => wordsOf(c.d.senseM)).join(', '));
    use = use.slice(0, max);
  }
  for (const b of blockers) if (b.reason && !use.some((c) => within(b, c.d.seg))) notes.push(`"${wordsOf(b)}" was left out: ${b.reason.why}`);
  let cand = assemble(s, text, use, opts, removed, reasons, wordsOf, []);
  if (!cand) return unsupported();
  // a clause about something this village lacks ("…but draw wolves" where no wolves hunt): offer the rest, and name what was left
  if (!cand.build.ok && use.length > 1)
    for (let k = 0; k < use.length; k++) {
      const rest = use.filter((_, j) => j !== k);
      const issue = cand.build.ok ? '' : cand.build.issues.find((x) => x.startsWith(`clause ${k + 1}:`));
      if (!issue) continue;
      const fewer = assemble(s, text, rest, opts, removed, [...reasons, { id: 'not_here', words: wordsOf(use[k].d.senseM), why: issue.replace(/^clause \d+: /, '') }], wordsOf, []);
      if (fewer?.build.ok) {
        addReason('not_here', wordsOf(use[k].d.senseM), issue.replace(/^clause \d+: /, ''));
        cand = fewer;
        break;
      }
    }
  const leftOut = reasons.filter((r) => r.id !== 'narrative');
  if (leftOut.length) return { ...base, kind: 'partial', candidates: [cand], reasons: dedupe(leftOut) };
  return { ...base, kind: 'supported', candidates: [cand] };
}

// ------------------------------------------------------------------------------------------ pieces

/** Single words that name a kind of thing, including the landmarks that are things ("the bridge", "the lanterns"). */
const KIND_OF_WORD: Map<string, TargetKind> = (() => {
  const m = new Map<string, TargetKind>();
  for (const [k, ws] of Object.entries(KIND_WORDS) as [TargetKind, string[]][]) for (const w of ws) if (!w.includes(' ')) m.set(w, k);
  return m;
})();

/** What "it" or "they" refers to: the nearest earlier word naming a thing, wherever it sits (even inside "watch the bridge"). */
function referentBefore(toks: Tok[], at: number): TargetKind | null {
  for (let i = at - 1; i >= 0; i--) if (agrees(toks[i].w, toks[at]?.w ?? 'it')) for (const v of toks[i].vs) if (KIND_OF_WORD.has(v)) return KIND_OF_WORD.get(v)!;
  return null;
}

const PLURAL_WORDS = new Set(['people', 'men', 'women', 'children', 'folk', 'cattle', 'geese', 'oxen']);

/** "it" stands for a singular or mass noun ("rain has a way with flames: whenever it falls…" is the rain); "they" for anything. */
function agrees(word: string, pronoun: string): boolean {
  if (!['it', 'its', 'itself'].includes(pronoun)) return true;
  return !(PLURAL_WORDS.has(word) || (/s$/.test(word) && !/(ss|us|is)$/.test(word)));
}

function dedupe(rs: NamedReason[]): NamedReason[] {
  const seen = new Set<string>();
  return rs.filter((r) => (seen.has(`${r.id}|${r.words}`) ? false : (seen.add(`${r.id}|${r.words}`), true))).slice(0, 6);
}

function regionWith(s: RunState, kind: TargetKind): string | null {
  const lm = kind === 'field' ? ['field'] : ['home', 'cabin'];
  const count = new Map<string, number>();
  for (const l of s.world.landmarks) if (lm.includes(l.kind)) count.set(l.district, (count.get(l.district) ?? 0) + 1);
  const best = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return best ? best[0] : null;
}

function dirOf(e: Effect): number {
  switch (e.op) {
    case 'REDIRECT_FLOW':
    case 'WEATHER_MODIFIER':
      return e.mode === 'attract' ? -1 : 1;
    case 'MOVE_TOWARD':
    case 'DECAY_ENTITY':
      return -1;
    case 'MOVE_AWAY':
    case 'GROW_ENTITY':
    case 'APPLY_FORCE':
    case 'SPAWN_BOUNDED_ENTITY':
    case 'GIVE_STATUS_EFFECT':
    case 'INFLUENCE_MOTIVATION':
    case 'RELOCATE_RESOURCE':
      return 1;
    default:
      return 'delta' in e ? Math.sign(e.delta) : 0;
  }
}

function effectOf(sense: Sense, d: Draft, addReason: (id: string, words: string, why?: string) => void): Effect {
  const def = OPERATORS[sense.op];
  const e: Record<string, unknown> = { op: sense.op, ...sense.params };
  for (const p of def.params) {
    if (p.name in e) continue;
    if (p.kind === 'int') {
      let v: number;
      if (p.name === 'count') {
        v = d.count ?? 1;
        if (v > p.max) addReason('unbounded_spawn', String(d.count), `at most ${p.max} chicks hatch in a night (each costs one food, and a coop holds twelve)`);
      } else if (p.name === 'radius') v = d.near?.radius ?? 2;
      else v = (sense.strength ?? d.strength ?? 2) * (p.name === 'delta' ? sense.dir : 1);
      if (v === 0) v = sense.dir;
      e[p.name] = Math.max(p.min, Math.min(p.max, v));
      if (p.nonzero && e[p.name] === 0) e[p.name] = sense.dir;
    } else if (p.kind === 'region') e[p.name] = d.toward?.region ?? (p.nullable ? null : (d.place?.region ?? 'river'));
  }
  return e as unknown as Effect;
}

function conditionOf(conds: { test: string }[]): Condition | null {
  const tests = [...new Set(conds.map((c) => c.test))];
  if (!tests.length) return null;
  if (tests.length === 1) return { test: tests[0] as never };
  return { all: tests.slice(0, 3).map((t) => ({ test: t as never })) };
}

function triggerOf(d: Draft): { trigger: Trigger; assumed: string | null } {
  let evs = d.events.filter((e, i, a) => a.findIndex((x) => x.event === e.event && x.not === e.not) === i);
  // every change happens at night: "at night" adds nothing to another power
  if (evs.some((e) => e.event !== 'night' && e.event !== 'always' && !e.not)) evs = evs.filter((e) => e.event !== 'night' && e.event !== 'always');
  if (!evs.length) {
    return { trigger: { event: 'always', min: null }, assumed: 'no power was named: it acts every night' };
  }
  const one = (e: Ev): Trigger => (e.not ? { not: { event: e.event, min: e.min } } : { event: e.event, min: e.min });
  if (evs.length === 1) return { trigger: one(evs[0]), assumed: null };
  const parts = evs.slice(0, 3).map(one);
  return { trigger: d.seg.or ? { any: parts } : { all: parts }, assumed: null };
}

function openTriggers(s: RunState, kind: TargetKind): TriggerEvent[] {
  const has = (k: string) => s.world.landmarks.some((l) => l.kind === k);
  const out: TriggerEvent[] = [];
  if (kind === 'rain') {
    if (has('belltower')) out.push('bell');
    out.push('night');
    return out;
  }
  if (has('beacon')) out.push('lantern');
  if (has('campfire')) out.push('smoke_fire');
  if (has('belltower')) out.push('bell');
  return out;
}

function eventLabel(e: TriggerEvent): string {
  return { bell: 'the bell', lantern: 'lit lanterns', smoke_fire: 'smoke fires', watchers: 'people watching', night: 'every night', always: 'always', rain: 'rain', clear_night: 'clear nights', flood: 'floods', spoken: 'words spoken', ritual: 'rituals' }[e];
}

/** Chooses the region and builds the reading against the village; null when no valid AST comes out. */
function assemble(s: RunState, text: string, use: { d: Draft; clause: Clause }[], opts: ReadOptions, removed: string[], reasons: NamedReason[], wordsOf: (m: { toks: number[] } | null) => string, extra: string[]): ReadCandidate | null {
  const assumed = [...extra];
  const clauses = use.map((u, i) => ({ ...u.clause, id: `c${i + 1}` }));
  for (const u of use) {
    const t = triggerOf(u.d);
    if (t.assumed && !assumed.includes(t.assumed) && !extra.some((x) => x.startsWith('powered by'))) assumed.push(t.assumed);
  }
  const omitted: Omission[] = [];
  if (removed.length) omitted.push({ text: removed.join(' … ').slice(0, 120), reason: 'unsupported', why: REASONS.find((r) => r.id === 'instruction')!.why });
  for (const r of reasons) {
    if (omitted.length >= 6 || r.id === 'instruction' || r.id === 'narrative') continue;
    omitted.push({ text: (r.words || r.id).slice(0, 120), reason: 'unrepresentable', why: r.why.slice(0, 200) });
  }
  const named = use.map((u) => u.d.place?.region).find((r) => r) ?? null;
  const order = regionOrder(s, clauses, named ?? opts.region ?? null);
  let best: { ast: RealityAst; build: RealityBuild; region: string } | null = null;
  for (const region of order) {
    const ast: RealityAst = {
      v: 2, lang: REALITY_LANG, text: text.slice(0, MAX_BELIEF_TEXT), author: 'player', source: { reader: 'offline-v2', model: null, prompt: READER_ID, id: null },
      day: Math.max(0, Math.min(400, s.day)), regions: [region], clauses, omitted: omitted.slice(0, 6), narrative: null,
    };
    if (!validateRealityAst(ast, opts.lab ? LAB_LIMITS : LIMITS).ok) return null;
    const build = buildRealityClaim(s, ast);
    if (!best) best = { ast, build, region };
    if (build.ok) {
      best = { ast, build, region };
      break;
    }
  }
  if (!best) return null;
  if (!named && !opts.region && s.world.regions.length > 1) assumed.push(`read for ${s.world.regions.find((r) => r.id === best!.region)?.name ?? best.region}${whyRegion(s, clauses, best.region)}`);
  const map: ClauseMap[] = use.map((u, i) => ({
    clause: `c${i + 1}`,
    target: u.d.targetM ? wordsOf(u.d.targetM) : KINDS[u.d.kind!].label,
    effect: wordsOf(u.d.senseM),
    trigger: u.d.events.map((e) => e.words).filter((w) => w).join(', ') || '(none named)',
    condition: u.d.conds.map((c) => c.words).join(', ') || null,
    place: u.d.near?.words ?? u.d.place?.words ?? u.d.toward?.words ?? null,
  }));
  const confidence: ReadCandidate['confidence'] = !best.build.ok || assumed.some((a) => a.startsWith('no power')) ? 'low' : assumed.length > 1 ? 'medium' : 'high';
  return { ast: best.ast, map, confidence, assumed, build: best.build };
}

/** Why this region, stated only when it is true of the region. */
function whyRegion(s: RunState, clauses: Clause[], region: string): string {
  const k = clauses[0]?.target.kind;
  const lm = (kind: string) => s.world.landmarks.some((l) => l.kind === kind && (region === 'river' || l.district === region));
  if (k === 'chicken' && (s.v2?.coops ?? []).some((c) => c.region === region)) return ', where the coops are';
  if (k === 'stone' && (s.v2?.stones ?? []).some((x) => x.state === 'loose' && regionAt(s.world, x.x, x.y) === region)) return ', where loose stones lie';
  if ((k === 'bridge' || clauses.some((c) => c.target.near?.anchor === 'bridge')) && region === 'river') return ', where the bridge stands';
  if (JSON.stringify(clauses.map((c) => c.when)).includes('"lantern"') && lm('beacon')) return ', where the lanterns are';
  if (JSON.stringify(clauses.map((c) => c.when)).includes('"smoke_fire"') && lm('campfire')) return ', where the smoke fires burn';
  return '';
}

/** Regions to try, best first: the one named, else where the reading's targets, powers and landmarks actually are. */
function regionOrder(s: RunState, clauses: Clause[], named: string | null): string[] {
  const ids = s.world.regions.map((r) => r.id);
  if (named && ids.includes(named)) return [named];
  const score = new Map<string, number>(ids.map((r) => [r, 0]));
  const bump = (r: string | null | undefined, n: number) => {
    if (r && score.has(r)) score.set(r, score.get(r)! + n);
  };
  for (const c of clauses) {
    const k = c.target.kind;
    const evs = JSON.stringify(c.when);
    if (k === 'chicken') for (const coop of s.v2?.coops ?? []) bump(coop.region, 3);
    if (k === 'stone') for (const st of s.v2?.stones ?? []) if (st.state === 'loose') bump(regionAt(s.world, st.x, st.y), 2);
    if (k === 'bridge') bump('river', 8);
    if (k === 'villager') for (const v of s.villagers) if (v.status !== 'dead') bump(v.district, 0.5);
    for (const l of s.world.landmarks) {
      if ((k === 'home' && (l.kind === 'home' || l.kind === 'cabin')) || (k === 'field' && l.kind === 'field') || (k === 'lantern' && l.kind === 'beacon') || (k === 'livestock' && l.kind === 'pen')) bump(l.district, 1);
      if (c.target.near && l.kind === c.target.near.anchor) bump(l.district, 4);
      if (evs.includes('"lantern"') && l.kind === 'beacon') bump(l.district, 3);
      if (evs.includes('"smoke_fire"') && l.kind === 'campfire') bump(l.district, 3);
    }
    if (evs.includes('"watchers"')) bump('river', 6);
    if (k === 'water' || k === 'rain' || k === 'fire') bump('river', 0.5);
  }
  return ids.slice().sort((a, b) => score.get(b)! - score.get(a)! || ids.indexOf(a) - ids.indexOf(b));
}

/** At most two executable beliefs about the same things the sentence named, clearly offered as different from what it asked. */
function alternativesFor(s: RunState, kinds: Mention[], opts: ReadOptions): ReadCandidate[] {
  const out: ReadCandidate[] = [];
  const seen = new Set<string>();
  for (const m of kinds) {
    if (!m.kind || seen.has(m.kind) || out.length >= 2) continue;
    seen.add(m.kind);
    const sense = SENSES.find((x) => x.kinds.includes(m.kind!) && !x.onlyNegated && !x.guarantee && !x.toward && x.op !== 'SPAWN_BOUNDED_ENTITY');
    if (!sense) continue;
    const d: Draft = { seg: { from: 0, to: 0, sub: false, unless: false, or: false, joined: false }, kind: m.kind, sense, negated: false, senseM: m, targetM: m, modifierM: null, source: null, events: [], conds: [], near: null, place: null, toward: null, strength: null, count: null, problem: null };
    const pos = openTriggers(s, m.kind)[0];
    if (pos && ['water', 'wolf', 'rain'].includes(m.kind)) d.events.push({ event: pos, min: null, not: false, words: eventLabel(pos), positional: POSITIONAL[pos] ?? null });
    const clause: Clause = { id: 'c1', when: triggerOf(d).trigger, where: null, target: { kind: m.kind, near: null, tags: [], region: null }, effect: effectOf(sense, d, () => undefined), duration: 'night' };
    const label = KINDS[m.kind].label;
    const words = clauseText(s, clause, [s.world.regions[0]?.id ?? 'river']).slice(0, MAX_BELIEF_TEXT - 1);
    const c = assemble(s, `${words[0].toUpperCase()}${words.slice(1)}`, [{ d, clause }], opts, [], [], () => label, ['a different belief about the same thing, offered instead']);
    if (c && c.build.ok) out.push(c);
  }
  return out;
}
