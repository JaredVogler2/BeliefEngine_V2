import type { Effect, Subject, TriggerKind } from '../core/types.ts';
import {
  CANONICAL, EFFECT_PHRASES, NARROW_WORDS, NEAR_WORDS, NEGATION, OFFERED, STOPWORDS, STRONG_WORDS, SUBJECT_WORDS, TRIGGER_PHRASES, UNSUPPORTED, WEAK_WORDS, WIDE_WORDS,
} from './ontology.ts';

/**
 * The offline reader. It does not "understand" language; it finds the words a person uses for the parts of a rule (what, how,
 * powered by what), pairs them up, scores the pairs, and either returns the pairs it is sure of, several when it is not, or
 * nothing with a reason. Deterministic: the same text always gives the same answer. Anything it cannot place is reported back
 * (`ignored`), never silently dropped into a different meaning.
 */
export const MAX_TEXT = 280;

export interface Candidate {
  subject: Subject;
  effect: Effect;
  /** the trigger the text names; null when it names none and the default for the subject was assumed */
  trigger: TriggerKind;
  triggerNamed: boolean;
  score: number;
  intensity: 1 | 2 | 3;
  radius: number;
  watchers?: number;
  /** negation turned the stated effect into its opposite */
  flipped: boolean;
  notes: string[];
  /** token indexes this reading used, so two readings can be checked for overlap */
  used: number[];
}

export interface Unsupported {
  id: string;
  label: string;
  why: string;
}

export interface ParseResult {
  /** the text after cleaning (control and invisible characters removed, whitespace collapsed) */
  text: string;
  norm: string;
  candidates: Candidate[];
  /** a belief made of two separate clauses, when the text has two readable ones about different things */
  compound: Candidate[] | null;
  unsupported: Unsupported[];
  /** subjects the text is about that the village has no physical model of (stone, smoke) */
  unmodelled: { subject: Subject; why: string }[];
  /** a trigger the text names that the subject cannot use ("a bridge that holds when bells ring") */
  conflict: string | null;
  ignored: string[];
  coverage: number;
  problem: null | 'empty' | 'too_long' | 'no_words';
  regionWords: string[];
}

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan['’]t\b/g, 'cannot'], [/\bwon['’]t\b/g, 'will not'], [/\bdon['’]t\b/g, 'do not'], [/\bdoesn['’]t\b/g, 'does not'], [/\bdidn['’]t\b/g, 'did not'],
  [/\bisn['’]t\b/g, 'is not'], [/\baren['’]t\b/g, 'are not'], [/\bwasn['’]t\b/g, 'was not'], [/\bwouldn['’]t\b/g, 'would not'], [/\bshouldn['’]t\b/g, 'should not'],
  [/\bcouldn['’]t\b/g, 'could not'], [/\bhasn['’]t\b/g, 'has not'], [/\bhaven['’]t\b/g, 'have not'], [/\bain['’]t\b/g, 'is not'], [/\bcan not\b/g, 'cannot'],
];

/** Remove what is never part of a sentence: control and invisible characters, directional overrides, runs of whitespace. */
export function sanitizeText(raw: string): string {
  let t = String(raw ?? '').normalize('NFKC');
  // eslint-disable-next-line no-control-regex
  t = t.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff0-\uffff]/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

const tokenize = (norm: string): string[] => (norm ? norm.split(' ') : []);
const singular = (w: string): string => (w.length > 3 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const same = (a: string, b: string): boolean => a === b || singular(a) === singular(b) || a === b + 's' || a === b + 'es' || b === a + 's';

interface Hit {
  at: number;
  len: number;
}

/** Find a phrase (one or more words) in the token list; the last word may be a plural. */
function findPhrase(tokens: string[], phrase: string, from = 0): Hit | null {
  const p = phrase.split(' ');
  for (let i = from; i + p.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < p.length; j++) if (!(j === p.length - 1 || p.length === 1 || p[j].length > 3 ? same(tokens[i + j], p[j]) : tokens[i + j] === p[j])) { ok = false; break; }
    if (ok) return { at: i, len: p.length };
  }
  return null;
}

function findAll(tokens: string[], phrase: string): Hit[] {
  const out: Hit[] = [];
  let from = 0;
  for (;;) {
    const h = findPhrase(tokens, phrase, from);
    if (!h) return out;
    out.push(h);
    from = h.at + 1;
  }
}

const OPPOSITE: Partial<Record<Effect, Effect>> = { repel: 'attract', attract: 'repel', strengthen: 'weaken', weaken: 'strengthen' };
const opposite = (subject: Subject, effect: Effect): Effect | null => {
  if (subject === 'grain' && effect === 'grow') return 'weaken';
  if (subject === 'grain' && effect === 'weaken') return 'grow';
  const o = OPPOSITE[effect];
  return o && OFFERED[subject].effects.includes(o) ? o : null;
};

const DEFAULT_TRIGGER: Record<Subject, TriggerKind> = { river: 'lit_beacon', rain: 'bell', bridge: 'watchers', grain: 'night', wolf: 'smoke_fire', illness: 'always', fire: 'always', stone: 'always', smoke: 'smoke_fire' };
/** Subjects with several possible power sources and no obvious default: when the text names none, one reading per source is offered. */
const ASK_TRIGGER = new Set<Subject>(['river', 'wolf']);
const DEFAULT_RADIUS: Record<Subject, number> = { river: 2, rain: 0, bridge: 0, grain: 0, wolf: 3, illness: 0, fire: 0, stone: 0, smoke: 0 };
const NUMBER_WORDS: Record<string, number> = { one: 1, a: 1, single: 1, two: 2, three: 3, four: 4 };

interface Mention<T> { value: T; at: number; len: number; selfNegated?: boolean; phrase: string }

function mentions(tokens: string[]): { subjects: Mention<Subject>[]; effects: Mention<Effect>[]; triggers: Mention<TriggerKind>[] } {
  const subjects: Mention<Subject>[] = [];
  for (const [subject, words] of Object.entries(SUBJECT_WORDS) as [Subject, string[]][])
    for (const w of words) for (const h of findAll(tokens, w)) subjects.push({ value: subject, at: h.at, len: h.len, phrase: w });

  // effects: longest phrase first, and a word already taken by a longer phrase cannot be read again
  const taken = new Set<number>();
  const effects: Mention<Effect>[] = [];
  const all = EFFECT_FORMS.sort((a, b) => b.phrase.split(' ').length - a.phrase.split(' ').length);
  for (const e of all)
    for (const h of findAll(tokens, e.phrase)) {
      const span = Array.from({ length: h.len }, (_, k) => h.at + k);
      if (span.some((i) => taken.has(i))) continue;
      span.forEach((i) => taken.add(i));
      effects.push({ value: e.effect, at: h.at, len: h.len, selfNegated: e.selfNegated, phrase: e.phrase });
    }
  // "keeps the water away", "keep the wolves out": a gap idiom the phrase table cannot hold
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'keep' && tokens[i] !== 'keeps') continue;
    for (let j = i + 2; j <= Math.min(tokens.length - 1, i + 6); j++)
      if ((tokens[j] === 'away' || tokens[j] === 'out') && !Array.from({ length: j - i + 1 }, (_, k) => i + k).some((x) => taken.has(x))) {
        for (let k = i; k <= j; k++) taken.add(k);
        effects.push({ value: 'repel', at: i, len: j - i + 1, phrase: 'keeps away', selfNegated: false });
        break;
      }
  }
  const triggers: Mention<TriggerKind>[] = [];
  for (const t of TRIGGER_PHRASES) for (const w of t.words) for (const h of findAll(tokens, w)) triggers.push({ value: t.trigger, at: h.at, len: h.len, phrase: w });
  // "smoke fires" is one thing: the words inside a longer match are part of it ("fires" is not also a lit beacon)
  const kept = triggers.filter((t) => !triggers.some((u) => u !== t && u.len > t.len && u.at <= t.at && t.at + t.len <= u.at + u.len));
  return { subjects, effects, triggers: kept };
}

/** Every effect phrase plus its passive and continuous forms ("slow" -> "slowed", "slowing"), built once. */
const EFFECT_FORMS: { effect: Effect; phrase: string; selfNegated: boolean }[] = (() => {
  const out: { effect: Effect; phrase: string; selfNegated: boolean }[] = [];
  const seen = new Set<string>();
  const push = (effect: Effect, phrase: string, selfNegated: boolean) => {
    const k = `${effect}|${phrase}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ effect, phrase, selfNegated });
    }
  };
  for (const e of EFFECT_PHRASES)
    for (const p of e.phrases) {
      push(e.effect, p, !!e.selfNegated);
      const words = p.split(' ');
      const last = words[words.length - 1];
      if (words.length === 1 && last.length >= 4 && !e.selfNegated && /^[a-z]+$/.test(last)) {
        const base = last.endsWith('es') && !last.endsWith('ses') ? last.slice(0, -2) : last.endsWith('s') ? last.slice(0, -1) : last;
        for (const f of [`${base}ed`, `${base}d`, `${base}ing`]) push(e.effect, f, false);
      }
    }
  return out;
})();

const hasAny = (tokens: string[], words: string[]): boolean => words.some((w) => findPhrase(tokens, w) !== null);

/** Words in the text that name a region of the village; the caller matches them against the village's own region names. */
const REGION_WORDS = ['east', 'eastbank', 'west', 'westbank', 'valley', 'hillside', 'hill', 'north', 'northwatch', 'mill', 'millbrook', 'ash', 'ashfold', 'wood', 'both', 'banks'];
function regionWords(tokens: string[]): string[] {
  return tokens.filter((t) => REGION_WORDS.includes(t));
}

/** Parse one clause (a single sentence or part of one) into scored readings. */
function parseClause(tokens: string[], offset = 0): { candidates: Candidate[]; conflict: string | null; unmodelled: { subject: Subject; why: string }[] } {
  const { subjects, effects, triggers } = mentions(tokens);
  const candidates: Candidate[] = [];
  const unmodelled: { subject: Subject; why: string }[] = [];
  let conflict: string | null = null;
  const strong = hasAny(tokens, STRONG_WORDS);
  const weak = hasAny(tokens, WEAK_WORDS);
  const wide = hasAny(tokens, WIDE_WORDS);
  const narrow = hasAny(tokens, NARROW_WORDS) && !hasAny(tokens, ['one of', 'no one']);

  for (const sm of subjects) {
    if (OFFERED[sm.value].effects.length === 0) {
      if (!unmodelled.some((u) => u.subject === sm.value)) unmodelled.push({ subject: sm.value, why: sm.value === 'stone' ? 'stone only matters where rubble lies, and no village you can start has any' : 'smoke has no effect of its own yet; fires that make smoke are what wolves and sickness respond to' });
      continue;
    }
    for (const em of effects) {
      // negation: a negating word within three words before the effect, unless the phrase already carries it
      let effect = em.value;
      let flipped = false;
      const notes: string[] = [];
      if (!em.selfNegated) {
        const before = tokens.slice(Math.max(0, em.at - 3), em.at);
        const neg = before.some((t) => NEGATION.includes(t)) || (em.at >= 2 && tokens[em.at - 2] === 'fails' && tokens[em.at - 1] === 'to');
        if (neg) {
          const o = opposite(sm.value, effect);
          if (!o) continue;
          effect = o;
          flipped = true;
          notes.push(`"not ${em.phrase}" read as the opposite: ${effect}`);
        }
      }
      if (!OFFERED[sm.value].effects.includes(effect)) continue;
      // which trigger: every distinct one the subject can use, nearest first (the village decides later which can work there)
      const usable = triggers.filter((t) => OFFERED[sm.value].triggers.includes(t.value) && !(t.at >= sm.at && t.at < sm.at + sm.len) && !(t.at >= em.at && t.at < em.at + em.len));
      const nearestOfKind = new Map<TriggerKind, Mention<TriggerKind>>();
      for (const t of usable) {
        const prev = nearestOfKind.get(t.value);
        if (!prev || Math.abs(t.at - em.at) < Math.abs(prev.at - em.at)) nearestOfKind.set(t.value, t);
      }
      const chosenList: (Mention<TriggerKind> | undefined)[] = [...nearestOfKind.values()].sort((a, b) => Math.abs(a.at - em.at) - Math.abs(b.at - em.at));
      const foreign = triggers.filter((t) => !OFFERED[sm.value].triggers.includes(t.value) && !(t.at >= sm.at && t.at < sm.at + sm.len) && !(t.at >= em.at && t.at < em.at + em.len));
      if (!chosenList.length && foreign.length && !(sm.value === 'fire')) {
        const named = foreign.map((f) => f.phrase).slice(0, 2).join(', ');
        conflict = `${SUBJECT_WORDS[sm.value][0]} cannot be powered by ${named}`;
        continue;
      }
      // nothing says what powers it: where the subject has several possible sources, ask (one reading per source) instead of assuming
      const askAll = !chosenList.length && ASK_TRIGGER.has(sm.value);
      if (!chosenList.length) chosenList.push(undefined);
      const askTriggers: (TriggerKind | undefined)[] = askAll ? OFFERED[sm.value].triggers : [undefined];
      chosenList.forEach((chosen, rank0) => askTriggers.forEach((askT, askRank) => {
        const rank = rank0 + askRank * 0.25;
        const nts = notes.slice();
        const dist = Math.abs(sm.at - em.at);
        let score = 3 + 3 + (chosen ? 2 : 0);
        score -= Math.max(0, dist - 5) * 0.12;
        score -= rank * 0.4;
        if (sm.at < em.at) score += 0.5;
        // "the river" appears as the thing something happens near ("near fire", "wherever lanterns burn"): not the subject then
        const prev = tokens[sm.at - 1];
        if (prev && ['near', 'by', 'beside', 'around', 'at', 'with', 'to', 'of'].includes(prev) && subjects.length > 1) score -= 0.7;
        const trigger = chosen?.value ?? askT ?? DEFAULT_TRIGGER[sm.value];
        if (!chosen) nts.push(`you did not say what powers it; ${askAll ? 'this reading uses' : 'I assumed'} ${trigger.replace('_', ' ')}`);
        if (!OFFERED[sm.value].triggers.includes(trigger)) return;
        let intensity: 1 | 2 | 3 = em.selfNegated && /cannot|never|will not|does not/.test(em.phrase) ? 3 : 2;
        if (strong) intensity = Math.min(3, intensity + 1) as 1 | 2 | 3;
        if (weak) intensity = Math.max(1, intensity - 1) as 1 | 2 | 3;
        let radius = DEFAULT_RADIUS[sm.value];
        if (radius > 0) {
          if (wide) radius = Math.min(4, radius + 1);
          if (narrow) radius = 1;
        }
        // verbs that describe a milder or wider physical result than "repel"
        if (sm.value === 'river' && effect === 'redirect') {
          radius = Math.min(4, radius + 1);
          intensity = Math.max(1, intensity - 1) as 1 | 2 | 3;
        }
        if (sm.value === 'river' && effect === 'slow') {
          radius = Math.min(4, radius + 1);
          intensity = 1;
        }
        let watchers: number | undefined;
        if (sm.value === 'bridge' && trigger === 'watchers') {
          const near = tokens.slice(Math.max(0, em.at - 4), em.at + em.len + 6);
          const num = near.map((t) => (/^\d$/.test(t) ? Number(t) : NUMBER_WORDS[t])).find((n) => n !== undefined && n >= 1 && n <= 4);
          const watchHint = near.some((t) => ['child', 'someone', 'one', 'single', 'a'].includes(t)) && near.some((t) => ['watched', 'watching', 'watcher', 'watch'].includes(t));
          watchers = num ?? (watchHint ? 1 : 3);
        }
        const used = new Set<number>();
        for (const m of [sm, em, ...(chosen ? [chosen] : [])]) for (let k = 0; k < m.len; k++) used.add(offset + m.at + k);
        // "wheat and barley": every word for the same thing is the same thing; "bells are rung": every word for the same source is that source
        for (const m of subjects) if (m.value === sm.value) for (let k = 0; k < m.len; k++) used.add(offset + m.at + k);
        if (chosen) for (const m of triggers) if (m.value === chosen.value) for (let k = 0; k < m.len; k++) used.add(offset + m.at + k);
        if (chosen) {
          // "lit beacons": the whole noun phrase for the source was used, not only the word that matched first
          const words = (TRIGGER_PHRASES.find((t) => t.trigger === chosen.value)?.words ?? []).filter((w) => !w.includes(' '));
          const part = (i: number) => i >= 0 && i < tokens.length && !used.has(offset + i) && words.some((w) => same(tokens[i], w));
          for (let i = chosen.at - 1; part(i); i--) used.add(offset + i);
          for (let i = chosen.at + chosen.len; part(i); i++) used.add(offset + i);
        }
        candidates.push({ subject: sm.value, effect, trigger, triggerNamed: !!chosen, score, intensity, radius, watchers, flipped, notes: nts, used: [...used] });
      }));
    }
  }
  // the best reading per (subject, effect, trigger)
  const best = new Map<string, Candidate>();
  for (const c of candidates) {
    const k = `${c.subject}|${c.effect}|${c.trigger}`;
    const prev = best.get(k);
    if (!prev || c.score > prev.score) best.set(k, c);
  }
  return { candidates: [...best.values()].sort((a, b) => b.score - a.score || (a.subject + a.effect + a.trigger < b.subject + b.effect + b.trigger ? -1 : 1)), conflict, unmodelled };
}

export const MIN_SCORE = 6;
export const AMBIGUOUS_MARGIN = 1.5;

/** Words that change how big or how strong a belief is, or name who it applies to: used by the reader without being part of a reading. */
const MODIFIER_WORDS = new Set([
  ...[...STRONG_WORDS, ...WEAK_WORDS, ...WIDE_WORDS, ...NARROW_WORDS, ...NEAR_WORDS].filter((w) => !w.includes(' ')),
  // who or what a fire or a sickness does its harm to: the effect already applies to all of them, so naming them loses nothing
  'home', 'homes', 'house', 'houses', 'village', 'villages', 'villagers', 'people', 'folk', 'town',
  // the place a belief is held: the village's own region names are used to place it, not to read it
  ...REGION_WORDS,
]);

export function parseBelief(raw: string): ParseResult {
  const text = sanitizeText(raw);
  const empty: ParseResult = { text, norm: '', candidates: [], compound: null, unsupported: [], unmodelled: [], conflict: null, ignored: [], coverage: 0, problem: null, regionWords: [] };
  if (!text) return { ...empty, problem: 'empty' };
  if (text.length > MAX_TEXT) return { ...empty, problem: 'too_long' };

  const lower = text.toLowerCase();
  const unsupported = UNSUPPORTED.filter((u) => u.patterns.some((p) => p.test(lower))).map((u) => ({ id: u.id, label: u.label, why: u.why }));

  let norm = lower;
  for (const [re, to] of CONTRACTIONS) norm = norm.replace(re, to);
  norm = norm.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const tokens = tokenize(norm);
  if (tokens.length === 0 || !tokens.some((t) => /^[a-z]+$/.test(t))) return { ...empty, norm, unsupported, problem: 'no_words' };

  const whole = parseClause(tokens);
  let candidates = whole.candidates.filter((c) => c.score >= MIN_SCORE);

  // two readable clauses about different things make a compound belief
  let compound: Candidate[] | null = null;
  const cuts = tokens.map((t, i) => (t === 'and' || t === 'but' || t === 'then' || t === 'also' ? i : -1)).filter((i) => i > 1 && i < tokens.length - 2);
  for (const cut of cuts) {
    const left = parseClause(tokens.slice(0, cut), 0).candidates.filter((c) => c.score >= MIN_SCORE)[0];
    const right = parseClause(tokens.slice(cut + 1), cut + 1).candidates.filter((c) => c.score >= MIN_SCORE)[0];
    if (left && right && left.subject !== right.subject) {
      compound = [left, right];
      break;
    }
  }
  if (compound) candidates = candidates.filter((c) => c.subject !== undefined);

  const consumed = new Set<number>();
  for (const c of candidates.slice(0, 3)) c.used.forEach((i) => consumed.add(i));
  if (compound) for (const c of compound) c.used.forEach((i) => consumed.add(i));
  // words that carry the meaning but that no reading used
  const content = tokens.map((t, i) => ({ t, i })).filter(({ t }) => t.length > 2 && !STOPWORDS.has(t) && !MODIFIER_WORDS.has(t) && /[a-z]/.test(t));
  const ignored = content.filter(({ i }) => !consumed.has(i)).map(({ t }) => t).filter((t, i, a) => a.indexOf(t) === i);
  const coverage = content.length ? (content.length - content.filter(({ i }) => !consumed.has(i)).length) / content.length : 0;

  return { text, norm, candidates, compound, unsupported, unmodelled: whole.unmodelled, conflict: candidates.length ? null : whole.conflict, ignored: ignored.slice(0, 8), coverage, problem: null, regionWords: regionWords(tokens) };
}

export { CANONICAL };
