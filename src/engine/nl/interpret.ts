import type { RunState } from '../core/types.ts';
import type { BeliefAST, BeliefClause } from './ast.ts';
import { buildClaim, defaultRegions, missingInVillage, regionFromWords, type Draft } from './build.ts';
import { CANONICAL, NL_VERSION, OFFERED, PARSER_ID } from './ontology.ts';
import { AMBIGUOUS_MARGIN, parseBelief, type Candidate, type ParseResult } from './parse.ts';

/**
 * Text to proposals. `interpretBelief` is what the browser composer, the MCP `submit_belief` tool and the optional online
 * interpreter all end in: whatever proposed a structure (the offline reader, a model), the structure is checked, balanced,
 * stress-tested and priced by `buildClaim`, and the player confirms what it says, not what anyone claimed it means.
 */
export type InterpretStatus = 'ok' | 'ambiguous' | 'partial' | 'unsupported' | 'rejected';

export interface Offer {
  sentence: string;
  title: string;
  subject: string;
  effect: string;
  trigger: string;
  /** the built-in story that already does exactly this in this village, if there is one (writing it again would only cost Influence) */
  builtIn: string | null;
}

export interface Interpretation {
  status: InterpretStatus;
  text: string;
  message: string;
  drafts: Draft[];
  offers: Offer[];
  /** readings that were understood but cannot work in this village, with the reason */
  rejected: { reading: string; reason: string }[];
  ignored: string[];
  parser: string;
  version: number;
  source: 'offline' | 'model';
}

export function clauseOf(c: Pick<Candidate, 'subject' | 'effect' | 'trigger' | 'radius' | 'intensity' | 'watchers'>): BeliefClause {
  return { subject: c.subject, effect: c.effect, trigger: c.trigger, radius: c.radius, intensity: c.intensity, ...(c.subject === 'bridge' && c.trigger === 'watchers' ? { watchers: c.watchers ?? 3 } : {}) } as BeliefClause;
}

const phrase = (c: Pick<Candidate, 'subject' | 'effect' | 'trigger'>): string => `${c.subject} ${c.effect} (powered by ${c.trigger.replace('_', ' ')})`;

/** The built-in story that already does exactly what a canonical belief does here, if any. */
function builtInFor(s: RunState, o: { subject: string; effect: string; trigger: string }): string | null {
  const d = s.scn.claimDefs.find((c) => !c.rival && c.spec.subject === o.subject && c.spec.effect === o.effect && c.spec.trigger.kind === o.trigger);
  return d ? d.short : null;
}

/** Every belief this village can host, as the sentence the composer certainly understands: what a player may always write. */
export function allOffers(s: RunState): Offer[] {
  return CANONICAL
    .filter((o) => !missingInVillage(s, { subject: o.subject, effect: o.effect, trigger: o.trigger, radius: 2, intensity: 2 } as BeliefClause, defaultRegions(s, o.subject as BeliefClause['subject'])))
    .map((o) => ({ sentence: o.sentence, title: o.title, subject: o.subject, effect: o.effect, trigger: o.trigger, builtIn: builtInFor(s, o) }));
}

/** Beliefs the village can model that are nearest to what the text was about, for when it cannot do what was asked. */
export function nearestOffers(s: RunState, parse: Pick<ParseResult, 'candidates' | 'norm'> | null, limit = 4): Offer[] {
  const subjects = new Set(parse?.candidates.map((c) => c.subject) ?? []);
  const effects = new Set(parse?.candidates.map((c) => c.effect) ?? []);
  const triggers = new Set(parse?.candidates.map((c) => c.trigger) ?? []);
  const ranked = allOffers(s)
    .map((o) => ({ o, score: (subjects.has(o.subject as never) ? 4 : 0) + (effects.has(o.effect as never) ? 2 : 0) + (triggers.has(o.trigger as never) ? 1 : 0) }))
    .sort((a, b) => b.score - a.score);
  const out: Offer[] = [];
  const seenSubject = new Map<string, number>();
  for (const x of ranked) {
    const n = seenSubject.get(x.o.subject) ?? 0;
    if (n >= 2 && x.score === 0) continue;
    seenSubject.set(x.o.subject, n + 1);
    out.push(x.o);
    if (out.length >= limit) break;
  }
  return out;
}

/** Districts where a bell tower stands: the ground a bell-powered belief raises is there, so that is where it has to be believed. */
function towerDistricts(s: RunState): string[] {
  return [...new Set(s.world.landmarks.filter((l) => l.kind === 'belltower' && l.hp > 0).map((l) => l.district))].filter((d) => s.world.regions.some((r) => r.id === d));
}

function regionsFor(s: RunState, parse: ParseResult, c: Pick<Candidate, 'subject' | 'trigger'>, assumptions: string[]): string[] {
  const subject = c.subject as BeliefClause['subject'];
  let base = defaultRegions(s, subject);
  // a river belief heard from the bells belongs to both banks (the built-in bell law does the same), the tower's own bank only otherwise
  if (c.trigger === 'bell' && subject === 'river' && !base.includes('river') && s.world.regions.some((r) => r.id === 'river')) {
    base = ['river'];
    assumptions.push('the bells are heard on both banks, so both banks vote on this belief');
  }
  const towers = c.trigger === 'bell' ? towerDistricts(s) : [];
  const nameOf = (id: string) => s.world.regions.find((r) => r.id === id)?.name ?? id;
  if (towers.length && !base.includes('river') && !base.some((r) => towers.includes(r))) {
    base = towers.slice(0, 2);
    assumptions.push(`the bell tower stands in ${base.map(nameOf).join(' and ')}, so that is where this belief has to be held`);
  }
  const named = regionFromWords(s, parse.regionWords);
  if (!named) return base;
  if (base.includes(named) || s.world.regions.some((r) => r.id === named && r.id !== 'wild' && s.villagers.some((v) => v.district === r.id))) {
    if (towers.length && !towers.includes(named)) assumptions.push(`the bell tower is in ${towers.map(nameOf).join(' and ')}, so the ground the bell raises is there, not in ${nameOf(named)}`);
    return [named];
  }
  assumptions.push(`you named ${named}, which cannot hold that belief; I placed it in ${base.join(' and ')}`);
  return base;
}

export interface InterpretOptions {
  stress?: boolean;
  /** readings proposed by an online interpreter (already validated by llm.ts): they replace the offline reader's, and nothing else changes */
  readings?: Candidate[];
  /** a region id the caller wants the belief placed in (MCP `targetRegion`); the village's own regions only */
  region?: string;
}

export function interpretBelief(s: RunState, rawText: string, opts: InterpretOptions = {}): Interpretation {
  const parse = parseBelief(rawText);
  const source: 'offline' | 'model' = opts.readings ? 'model' : 'offline';
  if (opts.region && s.world.regions.some((r) => r.id === opts.region)) parse.regionWords = [...parse.regionWords, opts.region];
  if (opts.readings) {
    // the sentence itself is still checked for ideas the village cannot model, whatever a model said about it
    parse.candidates = opts.readings.slice().sort((a, b) => b.score - a.score);
    parse.compound = null;
    parse.coverage = 1;
    parse.ignored = [];
  }
  const base = { text: parse.text, parser: opts.readings ? `model+${PARSER_ID}` : PARSER_ID, version: NL_VERSION, source };
  const out = (status: InterpretStatus, message: string, extra: Partial<Interpretation> = {}): Interpretation => ({ status, message, drafts: [], offers: [], rejected: [], ignored: parse.ignored, ...base, ...extra });

  if (parse.problem === 'empty') return out('unsupported', 'Write a belief first: one sentence about what the village comes to believe.', { offers: nearestOffers(s, null) });
  if (parse.problem === 'too_long') return out('unsupported', 'That is too long. A belief is one short sentence (up to 160 characters).', { offers: nearestOffers(s, null) });
  if (parse.problem === 'no_words') return out('unsupported', 'I could not find any words in that. Try a sentence such as “The river turns aside from lit lanterns.”', { offers: nearestOffers(s, null) });

  if (parse.unsupported.length) {
    const u = parse.unsupported[0];
    return out(
      'unsupported',
      `The village cannot model that: ${u.why}. ${parse.unsupported.length > 1 ? `Also not possible: ${parse.unsupported.slice(1).map((x) => x.label).join(', ')}. ` : ''}If you meant something smaller, say just that part. These are things it can model:`,
      { offers: nearestOffers(s, parse) },
    );
  }

  const readings: { cands: Candidate[]; score: number }[] = [];
  if (parse.compound) readings.push({ cands: parse.compound, score: parse.compound[0].score + parse.compound[1].score - 6 });
  for (const c of parse.candidates.slice(0, 3)) readings.push({ cands: [c], score: c.score });
  // the same single reading can appear twice (as a half of the compound); show each distinct structure once
  const seen = new Set<string>();
  const drafts: Draft[] = [];
  const draftScores: number[] = [];
  const rejected: Interpretation['rejected'] = [];
  // when the two-part reading cannot work here, the player must hear it rather than see only the readings that survive
  let compoundWhy = '';
  for (const r of readings) {
    const key = r.cands.map((c) => `${c.subject}.${c.effect}.${c.trigger}`).join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    const assumptions: string[] = r.cands.flatMap((c) => c.notes);
    const regions = [...new Set(r.cands.flatMap((c) => regionsFor(s, parse, c, assumptions)))].slice(0, 4);
    if (parse.ignored.length) assumptions.push(`I could not use these words: ${parse.ignored.slice(0, 5).join(', ')}`);
    const ast: BeliefAST = { version: 1, clauses: (r.cands.length === 2 ? [clauseOf(r.cands[0]), clauseOf(r.cands[1])] : [clauseOf(r.cands[0])]) as BeliefAST['clauses'], regions };
    const built = buildClaim(s, ast, parse.text, { stress: opts.stress, assumptions, source });
    if (built.ok) {
      drafts.push(built.draft);
      draftScores.push(r.score);
    } else {
      rejected.push({ reading: r.cands.map(phrase).join(' and '), reason: built.message });
      if (r.cands.length === 2 && !compoundWhy) compoundWhy = built.message;
    }
    if (drafts.length >= 3) break;
  }

  if (drafts.length === 0) {
    if (rejected.length) return out('rejected', `${rejected[0].reason} These are things this village can model:`, { rejected, offers: nearestOffers(s, parse) });
    if (parse.conflict) return out('unsupported', `The village cannot model that: ${parse.conflict}. These are things it can model:`, { offers: nearestOffers(s, parse) });
    if (parse.unmodelled.length) return out('unsupported', `The village cannot model that: ${parse.unmodelled[0].why}. These are things it can model:`, { offers: nearestOffers(s, parse) });
    return out('unsupported', 'I could not tell what you want to happen to what. A belief says what changes the world and how, for example “The river turns aside from lit lanterns.” These are things the village can model:', { offers: nearestOffers(s, parse) });
  }

  const compoundFirst = !!parse.compound && drafts[0].ast.clauses.length === 2;
  const top = draftScores[0];
  const second = draftScores[1];
  let status: InterpretStatus = 'ok';
  let message = 'This is how I understand it. Check what it would do before you write it.';
  if (drafts.length >= 2 && (compoundFirst || (second !== undefined && top - second < AMBIGUOUS_MARGIN))) {
    status = 'ambiguous';
    message = compoundFirst ? 'You described two things. I can write them as one belief with both effects (it costs more and needs more believers), or just one of them. Choose.' : 'That could mean more than one thing. Choose the one you meant.';
  } else if (parse.coverage < 0.4 && parse.ignored.length >= 3) {
    status = 'partial';
    message = `I only understood part of that (I could not use: ${parse.ignored.slice(0, 5).join(', ')}). Check that this is what you meant.`;
  } else if (parse.ignored.length && drafts[0].assumptions.some((a) => a.includes('did not say what powers it'))) {
    // words left over AND the power source guessed: the leftover words may have been the player's condition ("under the morning sun")
    const guess = drafts[0].assumptions.find((a) => a.includes('did not say what powers it')) ?? '';
    status = 'partial';
    message = `I understood what you want to happen, but not “${parse.ignored.slice(0, 4).join(' ')}”, and you did not name what powers it, so I assumed it: ${guess.replace(/^you did not say what powers it; (this reading uses |I assumed )/, '')}. Check that this is what you meant.`;
  }
  if (compoundWhy) message += ` Part of what you wrote cannot work here, so these leave it out: ${compoundWhy}`;
  if (drafts[0].existing && status === 'ok') {
    const e = drafts[0].existing;
    const wait = drafts[0].claim.unlockDay;
    message = `That is the story “${e.short}”, which ${e.available ? 'you can already tell: pick it from your hand' : `you will be able to tell${e.unlockDay ? ` from day ${e.unlockDay}` : ' later'}`}. You can still write your own version${wait !== undefined && wait > s.day ? `, which the village takes up from day ${wait}, as it does the built-in story` : ''}.`;
  }
  return out(status, message, { drafts, rejected, offers: status === 'ok' ? [] : nearestOffers(s, parse, 3) });
}

export { OFFERED };
