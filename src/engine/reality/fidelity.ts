import type { RunState } from '../core/types.ts';
import { triggerEvents, type Effect, type RealityAst, type TriggerEvent } from './ast.ts';
import { SENSES, type Sense } from './lexicon.ts';
import type { TargetKind } from './ontology.ts';
import { OPERATORS } from './operators.ts';
import { mentionsOf, normalizeBelief, segmentsOf, tokenize, type ClauseMap } from './read.ts';

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

const senseById = (id: string): Sense[] => SENSES.filter((x) => x.id === id);

/** Does an effect make the change a sense names: its operator, the parameters the sense fixes, and its direction? */
function makes(e: Effect, se: Sense): boolean {
  const x = e as unknown as Record<string, unknown>;
  if (e.op !== se.op || !Object.entries(se.params).every(([k, v]) => x[k] === v)) return false;
  return se.mag !== 'delta' || Math.sign(x.delta as number) === se.dir;
}

/** What a phrase means said plainly, and said with a "not" before it (the offline reader's own rules, read.ts). */
const plainly = (se: Sense): Sense[] => [se, ...(se.ask ?? []).flatMap(senseById)];
function negated(se: Sense): Sense[] {
  if (se.neg === 'ask') return senseById(se.id === 'away' ? 'toward' : 'lift');
  if (!se.neg || se.neg === 'none') return [];
  return (Array.isArray(se.neg) ? se.neg : [se.neg]).flatMap(senseById);
}

/**
 * The changes a sentence names, as the offline reader's vocabulary sees them: for each phrase, what it means where it stands
 * (after a "not" in its clause, the opposite) and what it would mean the other way round.
 */
export function changesNamed(s: RunState, text: string): { words: string; meant: Sense[]; opposite: Sense[] }[] {
  const toks = tokenize(normalizeBelief(text));
  const ms = mentionsOf(toks, s);
  const segs = segmentsOf(toks);
  return ms
    .filter((m) => m.cat === 'sense' && m.senses?.length)
    .map((m) => {
      const g = segs.find((x) => m.at >= x.from && m.at < x.to);
      const not = ms.some((x) => x.cat === 'negator' && x.at < m.at && (!g || x.at >= g.from));
      // a sickness that "keeps away" or "stays out" is people shielded from it, whatever the verb (read.ts)
      const ill = ms.some((x) => x.cat === 'illness' && (!g || (x.at >= g.from && x.at < g.to)));
      const yes = [...m.senses!.flatMap(plainly), ...(ill ? senseById('heal') : [])];
      const no = m.senses!.flatMap(negated);
      return { words: m.toks.map((i) => toks[i].w).join(' '), meant: not ? no : yes, opposite: not ? yes : no };
    });
}

const MORE_LESS: Partial<Record<Effect['op'], [string, string]>> = {
  ALTER_TEMPERATURE: ['makes flames cooler', 'makes flames hotter'],
  CHANGE_LIGHT: ['makes lantern light reach less far', 'makes lantern light reach further'],
  MODIFY_DURABILITY: ['makes it weaker', 'makes it stronger'],
  MODIFY_VISIBILITY: ['hides it from the wolves', 'shows it to the wolves'],
  MODIFY_MOVEMENT: ['makes it move slower', 'makes it move faster'],
};

/** What an effect does, in a few words, for a note. */
export function changeWords(e: Effect): string {
  switch (e.op) {
    case 'REDIRECT_FLOW':
      return e.mode === 'attract' ? 'draws floodwater in' : e.mode === 'slow' ? 'slows floodwater' : 'turns floodwater away';
    case 'WEATHER_MODIFIER':
      return e.mode === 'attract' ? 'calls the rain in' : e.mode === 'redirect' ? 'sends the rain elsewhere' : 'holds the rain back';
    case 'APPLY_FORCE':
      return e.direction === 'up' ? 'lifts it into the air' : e.direction === 'away' ? 'pushes it away' : 'pulls it in';
    case 'SET_MATERIAL_PROPERTY':
      return e.property === 'mass' ? (e.delta < 0 ? 'makes it lighter' : 'makes it heavier') : e.property === 'flammability' ? (e.delta < 0 ? 'makes it slow to burn' : 'makes it quick to burn') : e.delta > 0 ? 'makes it harder' : 'makes it softer';
    case 'MOVE_AWAY':
      return 'drives it away';
    case 'MOVE_TOWARD':
      return 'draws it in';
    case 'INFLUENCE_MOTIVATION':
      return e.motive === 'calm' ? 'makes people calmer' : e.motive === 'courage' ? 'makes people braver' : 'makes people work harder';
    case 'GIVE_STATUS_EFFECT':
      return e.status === 'fireproof' ? 'protects it from fire' : e.status === 'sick_resistant' ? 'protects people from sickness' : 'keeps people warm';
    case 'SPAWN_BOUNDED_ENTITY':
      return 'hatches chicks';
    default: {
      const pair = MORE_LESS[e.op];
      return pair && 'delta' in e ? pair[e.delta < 0 ? 0 : 1] : OPERATORS[e.op].label;
    }
  }
}

/**
 * Does a reading stay with what the sentence said? A clause acting on something the sentence never names, powered by something
 * it never mentions, or making a change its words do not say ("chickens fly" read as chickens drawn in; "no wolf can enter" read as
 * wolves lured) is either a misreading or an attempt to slip in a different law. `strict` failures drop the candidate; the rest are
 * kept with a note and low confidence (so the player must say yes to it), because a model may know a word the offline vocabulary
 * does not, or read a "not" differently.
 */
export function fidelity(s: RunState, text: string, ast: RealityAst, map: ClauseMap[]): { ok: boolean; notes: string[]; confident: boolean } {
  const named = namedIn(s, text);
  const changes = changesNamed(s, text);
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
    // the change itself: what the words say, the other way round from how the game reads them, or something else altogether
    if (changes.some((ch) => ch.meant.some((se) => makes(c.effect, se)))) return;
    const flipped = changes.find((ch) => ch.opposite.some((se) => makes(c.effect, se)));
    if (flipped) {
      confident = false;
      notes.push(`the game's own reader takes "${flipped.words}" the other way round; this reading ${changeWords(c.effect)}`);
    } else if (cited(m?.effect)) {
      if (changesNamed(s, m!.effect).length) {
        ok = false;
        notes.push(`a reading took "${m!.effect}" to mean it ${changeWords(c.effect)}, which those words do not say`);
      } else {
        confident = false;
        notes.push(`the game's own reader does not know "${m!.effect}"; the reading takes it to mean it ${changeWords(c.effect)}`);
      }
    } else {
      ok = false;
      notes.push(`a reading ${changeWords(c.effect)}, which the sentence does not say`);
    }
  });
  return { ok, notes, confident };
}
