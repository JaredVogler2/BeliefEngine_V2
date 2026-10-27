import { hashKeys } from '../core/rng.ts';
import { canonicalize } from '../core/hash.ts';
import { allClaimDefs, findClaimDef } from '../core/lookup.ts';
import type { ClaimDef, Effect, Id, RuleSpec, RunState, SideEffectId, TriggerKind } from '../core/types.ts';
import { SIDE_EFFECT_INFO } from '../laws/rules.ts';
import { astHash, canonicalAst, validateBeliefAst, type BeliefAST, type BeliefClause } from './ast.ts';
import { balanceAst, type Balanced, type Rating } from './balance.ts';
import { CANONICAL, NL_VERSION, OFFERED, PARSER_ID, SUBJECT_ICON } from './ontology.ts';
import { sanitizeText } from './parse.ts';
import { stressTest, type StressReport } from './stress.ts';

/**
 * From a validated structure to a claim the game can run: where it applies, what it needs, what it does, what it costs, what it
 * contradicts and whether it survives a stress test. `buildClaim` is the single place this happens: the browser's composer, the
 * MCP tools and the Compose Belief action itself all call it, so a belief means the same thing everywhere and a tampered or stale
 * request is rebuilt from its structure rather than trusted.
 */
export const MAX_CUSTOM_CLAIMS = 2;
export const MAX_CLAIM_TEXT = 160;
export const MAX_TITLE = 40;

export interface Draft {
  id: string;
  title: string;
  ast: BeliefAST;
  claim: ClaimDef;
  mechanics: string[];
  requires: string[];
  risks: string[];
  adjustments: string[];
  support: { percent: number; believers: number };
  rating: Rating;
  power: number;
  cost: { compose: number; perTelling: number };
  contradicts: { id: Id; short: string }[];
  stress: StressReport;
  /** the belief is one the player can already tell: no need to write it */
  existing: { id: Id; short: string; available: boolean; unlockDay: number | null } | null;
  /** how many words of the text this reading used, for the player's judgement */
  assumptions: string[];
}

export type BuildResult = { ok: true; draft: Draft } | { ok: false; code: string; message: string; alternatives?: string[] };

const fail = (code: string, message: string, alternatives?: string[]): BuildResult => ({ ok: false, code, message, alternatives });

const OPPOSITE: Partial<Record<Effect, Effect>> = { repel: 'attract', attract: 'repel', strengthen: 'weaken', weaken: 'strengthen', grow: 'weaken' };
const opposed = (subject: string, a: Effect, b: Effect): boolean => OPPOSITE[a] === b || (subject === 'grain' && ((a === 'grow' && b === 'weaken') || (a === 'weaken' && b === 'grow')));

const SOURCE_NAME: Record<TriggerKind, [string, string]> = {
  lit_beacon: ['lit beacon', 'lit beacons'], smoke_fire: ['smoke fire', 'smoke fires'], bell: ['ringing bell', 'ringing bells'], watchers: ['watched bridge', 'watched bridges'], night: ['night', 'nights'], always: ['always', 'always'], evidence: ['proof', 'proof'],
};

const regionName = (s: RunState, id: string): string => s.world.regions.find((r) => r.id === id)?.name ?? id;

/** Districts that vote on a belief placed in a region; the pseudo-region "river" (and "wild") is every bank. */
export function electorateOfRegion(villagers: { district: string }[], regionId: string): string[] | undefined {
  if (regionId !== 'river' && regionId !== 'wild') return undefined;
  return [...new Set(villagers.map((v) => v.district))].filter(Boolean);
}
const electorateFor = (s: RunState, regionId: string): string[] | undefined => electorateOfRegion(s.villagers, regionId);

/**
 * The most firm believers a belief in these regions can ever have: three quarters of the people who vote on the smallest of them
 * (everyone counted, living or not, so it never changes during a run). A hamlet of four cannot supply eight believers.
 */
export function believerCap(villagers: { district: string }[], regions: string[]): number {
  const caps = regions.map((r) => {
    const d = new Set(electorateOfRegion(villagers, r) ?? [r]);
    const n = villagers.filter((v) => d.has(v.district)).length;
    return Math.max(2, Math.floor(0.75 * n));
  });
  return Math.min(8, ...caps);
}

/** Regions a subject's belief is placed in by default: where the authored belief about the same thing lives, else the village's own regions. */
export function defaultRegions(s: RunState, subject: BeliefClause['subject']): string[] {
  const authored = s.scn.claimDefs.find((c) => !c.rival && c.spec.subject === subject);
  if (authored) return authored.regions.slice();
  const real = s.world.regions.filter((r) => r.id !== 'river' && r.id !== 'wild' && s.villagers.some((v) => v.district === r.id)).map((r) => r.id);
  return real.slice(0, 2);
}

/**
 * The day a belief of this kind can first be told. A built-in answer the chapter holds back (it unlocks on a set day: the game paces
 * its strongest answers on purpose) must not be skipped by writing a copy, or the copy would be the cheapest way past the pacing:
 * an exploit hunt found a written bell-and-rain belief winning Redbank 40 times in 40 because the built-in one, unlocked on day 4,
 * was available from day 1 in written form (docs/FINAL_ACCEPTANCE.md). The opening choices (starters) are not held back, so a copy
 * of one is told at once and pays its writing cost instead. Derived from the structure and the chapter's built-in beliefs only.
 */
export function unlockDayFor(claimDefs: ClaimDef[], clauses: BeliefClause[], starters: string[] = []): number | undefined {
  let day = 0;
  for (const c of clauses) {
    // per clause: the earliest day a built-in belief of that kind is told; for the whole belief: the last of its clauses
    let first = Infinity;
    for (const d of claimDefs)
      if (!d.rival && d.unlockDay !== undefined && !starters.includes(d.id) && d.spec.subject === c.subject && d.spec.effect === c.effect && d.spec.trigger.kind === c.trigger) first = Math.min(first, d.unlockDay);
    if (first !== Infinity) day = Math.max(day, first);
  }
  return day > 0 ? day : undefined;
}

/** Which of the village's regions the text points at ("east bank", "the valley"), by the village's own names. */
export function regionFromWords(s: RunState, words: string[]): string | null {
  for (const r of s.world.regions) {
    const names = [r.id, ...r.name.toLowerCase().replace(/[^a-z\s]/g, ' ').split(' ').filter((w) => w.length > 3 && w !== 'the' && w !== 'deep')];
    if (words.some((w) => names.includes(w) || (w === 'east' && r.id === 'east') || (w === 'west' && r.id === 'west') || (w === 'eastbank' && r.id === 'east') || (w === 'westbank' && r.id === 'west'))) return r.id;
  }
  return null;
}

/** Why a clause could do nothing in this village, or null when it can. */
export function missingInVillage(s: RunState, c: BeliefClause, regions: string[]): string | null {
  const f = s.scn.features;
  const lm = s.world.landmarks;
  const inRegions = (l: { district: string }) => regions.includes('river') || regions.includes(l.district);
  const place = regions.map((r) => regionName(s, r)).join(' or ');
  switch (c.subject) {
    case 'river':
      if (!f.flood) return 'this village has no flood, so the river has nothing to do';
      break;
    case 'rain':
      if (c.effect === 'attract' && !f.crops) return 'rain only matters here where crops are tended; in a flood village clouds gathering would change nothing you could see';
      if (c.effect !== 'attract' && !f.flood) return 'there is no river to rise here, so turning rain away would change nothing you could see';
      break;
    case 'bridge':
      if (!lm.some((l) => l.kind === 'bridge' && l.hp > 0)) return 'there is no bridge in this village';
      break;
    case 'grain':
      if (!f.crops) return 'no crops are tended in this village';
      break;
    case 'wolf':
      if (!f.wolves) return 'no wolves hunt this village';
      break;
    case 'illness':
      if (!f.smoke) return 'sickness only follows smoke in this village, and none is burning here';
      break;
    case 'fire':
      if (!f.fire) return 'no fire threatens this village';
      break;
    default:
      return 'the village cannot model that';
  }
  switch (c.trigger) {
    case 'lit_beacon':
      if (!lm.some((l) => l.kind === 'beacon' && l.hp > 0 && inRegions(l))) return `there are no beacons to light in ${place}`;
      break;
    case 'smoke_fire':
      if (!lm.some((l) => l.kind === 'campfire' && l.hp > 0 && inRegions(l))) return `there are no smoke fires to burn in ${place}`;
      break;
    case 'bell':
      if (!lm.some((l) => l.kind === 'belltower' && l.hp > 0)) return 'this village has no bells to ring';
      break;
    case 'watchers':
      if (!lm.some((l) => l.kind === 'bridge' && l.hp > 0)) return 'there is no bridge to watch';
      break;
    case 'night':
      if (!lm.some((l) => l.kind === 'field' && regions.includes(l.district))) return `no fields are worked in ${place}`;
      break;
    default:
      break;
  }
  return null;
}

function clauseSentences(s: RunState, c: BeliefClause, regions: string[], sides: SideEffectId[]): { mechanic: string; requires: string } {
  const place = regions.map((r) => regionName(s, r)).join(' and ');
  const i = c.intensity;
  const src = SOURCE_NAME[c.trigger][0];
  const lm = s.world.landmarks;
  const countBy = (kind: string) => lm.filter((l) => l.kind === kind && l.hp > 0 && (regions.includes('river') || regions.includes(l.district))).length;
  const litBy = (kind: string) => lm.filter((l) => l.kind === kind && l.hp > 0 && l.lit && (regions.includes('river') || regions.includes(l.district))).length;
  let mechanic = '';
  let requires: string;
  switch (`${c.subject}.${c.effect}`) {
    case 'river.repel': case 'river.redirect': case 'river.slow':
      mechanic = `While ${place} believes it, each powered ${src} raises the ground by up to ${i} within ${c.radius} tile${c.radius === 1 ? '' : 's'}, so floodwater stays out of that ground.`;
      break;
    case 'river.attract':
      mechanic = `While ${place} believes it, each powered ${src} lowers the ground by up to ${i} within ${c.radius} tile${c.radius === 1 ? '' : 's'}: floodwater is drawn in. This makes floods worse there.`;
      break;
    case 'rain.redirect':
      mechanic = `On nights the bells ring, up to ${i} step${i === 1 ? '' : 's'} of river level are drawn off into the hills. The water that is moved pools elsewhere and can bury a road.`;
      break;
    case 'rain.attract':
      mechanic = `On nights the bells ring, the fields of ${place} drink ${i} extra step${i === 1 ? '' : 's'} of rain, so crops grow faster. The water drawn in is taken from somewhere else.`;
      break;
    case 'rain.repel':
      mechanic = 'On nights the bells ring, clouds turn away: the river drops by one step.';
      break;
    case 'bridge.strengthen':
      mechanic = c.trigger === 'bell'
        ? `On nights the bells ring, the bridge takes up to ${[0, 45, 70, 90][i]}% less flood damage.`
        : `With at least ${c.watchers ?? 3} watcher${(c.watchers ?? 3) === 1 ? '' : 's'} on the deck at night, the bridge takes up to ${[0, 45, 70, 90][i]}% less flood damage.`;
      break;
    case 'bridge.weaken':
      mechanic = c.trigger === 'bell'
        ? `On nights the bells ring, the bridge's protection falls by 30%: floods hurt it more. A belief that harms.`
        : `While watchers stand on the deck, the bridge's protection falls by 30%: floods hurt it more. A belief that harms.`;
      break;
    case 'grain.grow':
      mechanic = `${c.trigger === 'bell' ? 'On nights the bells ring, crops' : 'Crops'} in ${place} ripen about ${10 * i}% faster${c.trigger === 'bell' ? '' : ' each night'}.`;
      break;
    case 'grain.weaken':
      mechanic = `${c.trigger === 'bell' ? 'On nights the bells ring, crops' : 'Crops'} in ${place} ripen about ${6 * i}% slower${c.trigger === 'bell' ? '' : ' each night'}. A belief that harms.`;
      break;
    case 'wolf.repel':
      mechanic = `Wolves will not step within ${c.radius} tile${c.radius === 1 ? '' : 's'} of a powered ${src}, so animals inside are safe.`;
      break;
    case 'wolf.attract':
      mechanic = `Wolves are drawn toward each powered ${src} within ${c.radius} tile${c.radius === 1 ? '' : 's'}. It can lead them away from the pens, or onto people.`;
      break;
    case 'illness.repel': case 'illness.weaken':
      mechanic = `People in ${place} take ${Math.min(80, 25 * i)}% less harm from smoke.`;
      break;
    case 'fire.weaken':
      mechanic = `Fire damage to buildings in ${place} falls by ${Math.min(80, 25 * i)}%.`;
      break;
    case 'fire.strengthen':
      mechanic = `Fire damage to buildings in ${place} rises by ${20 * i}%. A belief that harms.`;
      break;
    case 'fire.slow':
      mechanic = `Fire spreads ${Math.min(80, 20 * i)}% slower in ${place}.`;
      break;
  }
  switch (c.trigger) {
    case 'lit_beacon': requires = `lit beacons in ${place}: ${countBy('beacon')} stand there, ${litBy('beacon')} lit now. Light one with a ritual.`; break;
    case 'smoke_fire': requires = `burning smoke fires in ${place}: ${countBy('campfire')} sites, ${litBy('campfire')} burning now.`; break;
    case 'bell': requires = 'the bells rung that night (a ritual at the bell tower).'; break;
    case 'watchers': requires = `${c.watchers ?? 3} or more watchers on the bridge: believers walk there at dusk once the law is live, or after a vigil.`; break;
    case 'night': requires = 'field work done by night.'; break;
    default: requires = 'nothing: it is always in effect.';
  }
  void sides;
  return { mechanic, requires };
}

const HARMFUL = new Set(['river.attract', 'wolf.attract', 'bridge.weaken', 'grain.weaken', 'fire.strengthen']);

/** The title shown on the card: the player's own when given, else the canonical title for what it does. */
function titleFor(clauses: BeliefClause[], given?: string): string {
  const clean = (given ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  if (clean) return clean;
  const c = clauses[0];
  const canon = CANONICAL.find((x) => x.subject === c.subject && x.effect === c.effect && x.trigger === c.trigger);
  const second = clauses[1] ? CANONICAL.find((x) => x.subject === clauses[1].subject && x.effect === clauses[1].effect && x.trigger === clauses[1].trigger) : null;
  return (second && canon ? `${canon.title} and ${second.title.charAt(0).toLowerCase()}${second.title.slice(1)}` : canon?.title ?? `${c.subject} ${c.effect}`).slice(0, MAX_TITLE + 12);
}

const memo = new WeakMap<RunState, Map<string, BuildResult>>();

export interface BuildOptions {
  /** run the three-night stress test (the Compose action and the preview both do) */
  stress?: boolean;
  source?: 'offline' | 'model';
  assumptions?: string[];
  title?: string;
}

/** Everything the engine needs to accept a belief, rebuilt from its structure and the player's words. Deterministic. */
export function buildClaim(s: RunState, astIn: unknown, textIn: string, opts: BuildOptions = {}): BuildResult {
  const checked = validateBeliefAst(astIn);
  if (!checked.ok) return fail('BAD_BELIEF', `That belief is not one the village can model: ${checked.issues.slice(0, 3).join('; ')}.`);
  const text = sanitizeText(textIn).slice(0, MAX_CLAIM_TEXT);
  if (!text) return fail('BAD_TEXT', 'A belief needs words.');
  const known = new Set(s.world.regions.map((r) => r.id));
  const bad = checked.ast.regions.find((r) => !known.has(r));
  if (bad) return fail('BAD_REGION', `This village has no region called "${bad.slice(0, 24)}". Its regions are: ${s.world.regions.map((r) => r.id).join(', ')}.`, s.world.regions.map((r) => r.id));
  for (const c of checked.ast.clauses) {
    const missing = missingInVillage(s, c, checked.ast.regions);
    if (missing) return fail('NOT_HERE', `In this village that belief would change nothing you could see: ${missing}.`);
  }

  const key = `${astHash(checked.ast)}|${text}|${opts.title ?? ''}|${opts.stress !== false}|${opts.source ?? 'offline'}`;
  let cache = memo.get(s);
  if (!cache) memo.set(s, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;

  const bal: Balanced = balanceAst(checked.ast, { maxBelievers: believerCap(s.villagers, checked.ast.regions) });
  const ast = bal.ast;
  const regions = ast.regions;
  const title = titleFor(ast.clauses, opts.title);
  const electorate: Record<string, string[]> = {};
  for (const r of regions) {
    const e = electorateFor(s, r);
    if (e) electorate[r] = e;
  }
  const authoredSame = s.scn.claimDefs.find((c) => c.spec.subject === ast.clauses[0].subject && c.params);
  const params: Record<string, string | number> | undefined = authoredSame?.params ? { ...authoredSame.params } : undefined;
  const physical: Record<TriggerKind, string | null> = { lit_beacon: 'light', smoke_fire: 'smoke', bell: 'ring', watchers: 'vigil', night: 'night_labor', always: null, evidence: null };
  const ritual = s.scn.rituals.find((r) => r.physical === physical[ast.clauses[0].trigger])?.id;

  const unlockDay = unlockDayFor(s.scn.claimDefs, ast.clauses, s.scn.starters);
  if (unlockDay !== undefined && s.day < unlockDay) bal.adjustments.push(`The village will not take this belief up until day ${unlockDay}, the day the built-in story of the same kind unlocks: you can write it now, and tell it then.`);
  const parts = ast.clauses.map((c) => clauseSentences(s, c, regions, bal.sides));
  const risks = [
    ...bal.sides.map((x) => `${SIDE_EFFECT_INFO[x].label}: ${SIDE_EFFECT_INFO[x].text}`),
    ...ast.clauses.filter((c) => HARMFUL.has(`${c.subject}.${c.effect}`)).map((c) => `Careful: "${c.subject} ${c.effect}" works against you if it is the wrong thing to believe.`),
  ];

  const def: ClaimDef = {
    id: `custom_${bal.hash.slice(0, 10)}`,
    text,
    short: title,
    icon: SUBJECT_ICON[ast.clauses[0].subject],
    spec: bal.spec,
    ...(bal.extra.length ? { extra: bal.extra } : {}),
    regions: regions.slice(),
    ...(Object.keys(electorate).length ? { electorate } : {}),
    ...(ritual ? { ritual } : {}),
    contradicts: [],
    benefit: parts.map((p) => p.mechanic).join(' '),
    risk: risks.join(' ') || 'No side effects, but it only works while its trigger is met.',
    flavor: text,
    startsAvailable: true,
    ...(unlockDay !== undefined ? { unlockDay } : {}),
    ...(params ? { params } : {}),
    custom: { text, astHash: bal.hash, parser: opts.source === 'model' ? `model+${PARSER_ID}` : PARSER_ID, balance: Number.parseInt(bal.checksum.slice(0, 8), 16), ast, source: opts.source ?? 'offline', nl: NL_VERSION },
  };

  // contradictions and duplicates are computed here, never taken from the request
  const contradicts: { id: Id; short: string }[] = [];
  let existing: Draft['existing'] = null;
  for (const other of allClaimDefs(s)) {
    if (other.id === def.id) continue;
    const overlap = other.regions.some((r) => regions.includes(r)) || other.regions.includes('river') || regions.includes('river');
    if (!overlap) continue;
    for (const c of ast.clauses)
      if (other.spec.subject === c.subject && opposed(c.subject, c.effect, other.spec.effect)) {
        contradicts.push({ id: other.id, short: other.short });
        break;
      }
    if (!other.rival && !other.custom && ast.clauses.length === 1 && other.spec.subject === ast.clauses[0].subject && other.spec.effect === ast.clauses[0].effect && other.spec.trigger.kind === ast.clauses[0].trigger && regions.every((r) => other.regions.includes(r))) {
      const st = s.claims.find((c) => c.id === other.id);
      existing = { id: other.id, short: other.short, available: !!st?.available, unlockDay: other.unlockDay ?? null };
    }
  }
  def.contradicts = contradicts.map((c) => c.id);
  if (contradicts.length) risks.push(`Contradicts ${contradicts.map((c) => `“${c.short}”`).join(' and ')}: only one of them can hold the same ground.`);

  const stress = opts.stress === false ? { nights: 0, invariantsOk: true, powered: true, changed: [], problems: [] } : stressTest(s, def);
  if (!stress.invariantsOk || !stress.powered) {
    const r = fail('UNSAFE', `That belief did not pass the village's safety test (${stress.problems.join('; ') || 'unpowered'}), so it cannot be written.`);
    cache.set(key, r);
    return r;
  }
  const draft: Draft = {
    id: bal.hash,
    title,
    ast,
    claim: def,
    mechanics: parts.map((p) => p.mechanic),
    requires: parts.map((p) => p.requires),
    risks,
    adjustments: bal.adjustments,
    support: { percent: Math.round(bal.spec.thresholds.on * 100), believers: bal.spec.thresholds.minSupporters },
    rating: bal.rating,
    power: bal.power,
    cost: { compose: bal.apCost, perTelling: 1 },
    contradicts,
    stress,
    existing,
    assumptions: opts.assumptions ?? [],
  };
  const r: BuildResult = { ok: true, draft };
  cache.set(key, r);
  return r;
}

/** Influence a belief costs to write, derived from its structure alone (the action cost function needs no village for it). */
export function composeCostOf(astIn: unknown): number {
  const checked = validateBeliefAst(astIn);
  return checked.ok ? balanceAst(checked.ast).apCost : 1;
}

export { canonicalAst, OFFERED, hashKeys, findClaimDef };
export type { RuleSpec };

/**
 * A written belief that arrives from outside (a save file, an import) must be exactly what the composer would have built from its
 * own structure: the numbers, the thresholds and the fingerprint are all derived, so any edit shows. Returns why not, or null.
 */
export function verifyCustomClaim(def: ClaimDef, villagers: { district: string }[], claimDefs: ClaimDef[] = [], starters: string[] = []): string | null {
  const c = def.custom;
  if (!c || typeof c !== 'object') return null;
  const checked = validateBeliefAst(c.ast);
  if (!checked.ok) return 'its structure is not one the village can model';
  let bal: Balanced;
  try {
    bal = balanceAst(checked.ast, { maxBelievers: believerCap(villagers, checked.ast.regions) });
  } catch {
    return 'its structure cannot be balanced';
  }
  if (bal.hash !== c.astHash) return 'its structure does not match its fingerprint';
  if (Number.parseInt(bal.checksum.slice(0, 8), 16) !== c.balance) return 'its balance record does not match';
  if (canonicalize(def.spec) !== canonicalize(bal.spec) || canonicalize(def.extra ?? []) !== canonicalize(bal.extra)) return 'its numbers were changed after it was balanced';
  if (def.id !== `custom_${bal.hash.slice(0, 10)}`) return 'its name does not match its structure';
  const expected: Record<string, string[]> = {};
  for (const r of bal.ast.regions) {
    const e = electorateOfRegion(villagers, r);
    if (e) expected[r] = e;
  }
  if (canonicalize(def.electorate ?? {}) !== canonicalize(expected)) return 'the people who vote on it were changed';
  if ((def.unlockDay ?? null) !== (unlockDayFor(claimDefs, bal.ast.clauses, starters) ?? null)) return 'the day it can first be told was changed';
  return null;
}
