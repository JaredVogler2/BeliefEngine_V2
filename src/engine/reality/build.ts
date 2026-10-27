import { canonicalize } from '../core/hash.ts';
import type { ClaimDef, RunState } from '../core/types.ts';
import { believerCap, electorateOfRegion } from '../nl/build.ts';
import { sanitizeText } from '../nl/parse.ts';
import { validateRealityAst, LAB_LIMITS, LIMITS, type Clause, type Condition, type RealityAst, type Selector, type Trigger } from './ast.ts';
import { balanceReality, type Rating } from './balance.ts';
import { groundAst } from './ground.ts';
import { ANCHOR_LABEL, KINDS } from './ontology.ts';
import { OPERATORS } from './operators.ts';

/**
 * From a validated AST v2 to a claim the game can run, and the honest preview the player confirms. The composer, MCP tools and
 * the Compose action all call `buildRealityClaim`, so a reality belief means the same thing everywhere, and a confirmation that
 * arrives later (or from outside) is rebuilt from its structure and checked against the run revision it was read under.
 */

export const MAX_REALITY_CLAIMS = 3;
export const MAX_TITLE = 40;

export interface RealityDraft {
  id: string;
  title: string;
  ast: RealityAst;
  claim: ClaimDef;
  /** one line per clause: exactly what changes, on what, where and when */
  mechanics: string[];
  /** what has to physically happen for it to act */
  requires: string[];
  /** the costs the world charges (operator downsides) */
  risks: string[];
  /** what the balance changed and why */
  adjustments: string[];
  /** words of the sentence that are NOT represented, with why */
  omitted: { text: string; why: string }[];
  /** grounding notes: allowed, but may make it rare or weak */
  notes: string[];
  narrative: string | null;
  support: { percent: number; believers: number };
  rating: Rating;
  power: number;
  cost: { compose: number; perTelling: number };
  /** run revision this preview was made against; a confirmation must carry it */
  rev: number;
}

export type RealityBuild = { ok: true; draft: RealityDraft } | { ok: false; code: string; message: string; issues: string[] };

const fail = (code: string, message: string, issues: string[] = []): RealityBuild => ({ ok: false, code, message, issues });

const regionName = (s: RunState, id: string): string => s.world.regions.find((r) => r.id === id)?.name ?? id;

export function triggerText(t: Trigger): string {
  if ('all' in t) return t.all.map(triggerText).join(' and ');
  if ('any' in t) return t.any.map(triggerText).join(' or ');
  if ('not' in t) return `not when ${triggerText(t.not)}`;
  switch (t.event) {
    case 'bell':
      return 'the bell is rung';
    case 'lantern':
      return 'a lantern (beacon) is lit';
    case 'smoke_fire':
      return 'a smoke fire burns';
    case 'watchers':
      return `at least ${t.min ?? 1} ${(t.min ?? 1) === 1 ? 'person watches' : 'people watch'} the bridge`;
    case 'night':
      return 'night falls';
    case 'rain':
      return 'it rains';
    case 'clear_night':
      return 'the night is clear';
    case 'flood':
      return `the river reaches level ${t.min ?? 3}`;
    case 'spoken':
      return `you tell at least ${t.min ?? 1} ${(t.min ?? 1) === 1 ? 'person' : 'people'} something that day`;
    case 'ritual':
      return 'a ritual is performed that day';
    case 'always':
      return 'always';
  }
}

function condText(c: Condition): string {
  if ('all' in c) return c.all.map(condText).join(' and ');
  if ('any' in c) return c.any.map(condText).join(' or ');
  if ('not' in c) return `not ${condText(c.not)}`;
  return { wet: 'wet', dry: 'dry', raining: 'it is raining', clear: 'the sky is clear', windy: 'it is windy', flooding: 'the river is high', lit: 'lit', blue: 'wearing blue', airborne: 'in the air', healthy: 'healthy' }[c.test];
}

function selectorText(s: RunState, sel: Selector, regions: string[]): string {
  const k = KINDS[sel.kind];
  const tags = sel.tags.length ? `${sel.tags.map((t) => ({ wet: 'wet', dry: 'dry', blue: 'blue-clad', healthy: 'healthy' })[t]).join(' ')} ` : '';
  const near = sel.near ? ` within ${sel.near.radius} tile${sel.near.radius === 1 ? '' : 's'} of ${sel.near.anchor === 'beacon' ? 'a lantern' : `the ${ANCHOR_LABEL[sel.near.anchor] ?? sel.near.anchor}`}` : '';
  const where = sel.region ? regionName(s, sel.region) : regions.map((r) => regionName(s, r)).join(' or ');
  return `${tags}${k.label}${near} in ${where}`;
}

function effectText(c: Clause): string {
  const e = c.effect;
  switch (e.op) {
    case 'APPLY_FORCE':
      return e.direction === 'up' ? `rise up to ${e.magnitude} tile${e.magnitude === 1 ? '' : 's'} into the air for the night (out of reach of water and wolves; a lift of 2 or more drifts with a strong wind)` : `are pushed up to ${e.magnitude} tile${e.magnitude === 1 ? '' : 's'} ${e.direction === 'away' ? 'away from' : 'toward'} the source`;
    case 'REDIRECT_FLOW':
      return `${e.mode === 'attract' ? 'draw floodwater in: the ground counts as up to' : 'turn floodwater aside: the ground counts as up to'} ${e.magnitude} tile${e.magnitude === 1 ? '' : 's'} ${e.mode === 'attract' ? 'lower' : 'higher'} within ${e.radius} tiles of each source`;
    case 'WEATHER_MODIFIER':
      return e.mode === 'redirect' ? `draw up to ${e.magnitude} steps of rain off the river${e.toward ? ` onto ${e.toward}` : ''}` : e.mode === 'repel' ? 'push the rain back: the river rises one step less' : `call up to ${e.magnitude} steps of rain${e.toward ? ` onto ${e.toward}` : ' there'} (rain is moved, not made: it lands on the low ground)`;
    case 'SET_MATERIAL_PROPERTY':
      return e.property === 'mass' ? `weigh ${Math.abs(e.delta)} load${Math.abs(e.delta) === 1 ? '' : 's'} ${e.delta < 0 ? 'less' : 'more'} (a stone of 1 load or less is carried to the bank by anyone working nearby, and floats in floodwater)` : e.property === 'flammability' ? `burn ${e.delta < 0 ? 'less' : 'more'} readily (fire damage ${e.delta < 0 ? '-' : '+'}${Math.abs(e.delta) * 20}%)` : `become ${e.delta > 0 ? 'harder' : 'softer'} (damage ${e.delta > 0 ? 'reduced' : 'increased'})`;
    case 'GROW_ENTITY':
      return `ripen up to ${10 * e.magnitude}% faster each night`;
    case 'DECAY_ENTITY':
      return `wither: up to ${6 * e.magnitude}% growth lost each night`;
    case 'ALTER_TEMPERATURE':
      return e.delta < 0 ? `burn weaker: fire damage cut by up to ${25 * Math.abs(e.delta)}%` : `burn hotter: fire damage raised by up to ${20 * e.delta}%`;
    case 'CHANGE_LIGHT':
      return `${e.delta > 0 ? 'shine' : 'dim'}: lantern-powered beliefs reach ${Math.abs(e.delta)} tile${Math.abs(e.delta) === 1 ? '' : 's'} ${e.delta > 0 ? 'further' : 'less far'}`;
    case 'MODIFY_DURABILITY':
      return e.delta > 0 ? `hold stronger: up to ${[0, 45, 70, 90][e.delta]}% of flood damage prevented (whether watched or not)` : `grow weaker: up to ${30 * Math.abs(e.delta)}% more damage`;
    case 'MODIFY_VISIBILITY':
      return `${e.delta < 0 ? 'are hidden from' : 'are shown to'} the wolves within ${Math.abs(e.delta)} tiles`;
    case 'MODIFY_MOVEMENT':
      return c.target.kind === 'fire' ? `spread ${e.delta < 0 ? 'slower' : 'faster'} (×${(1 + 0.2 * e.delta).toFixed(1)} at full support)` : `${e.delta < 0 ? 'cover one tile less' : 'cover one tile more'} each night`;
    case 'MOVE_AWAY':
    case 'MOVE_TOWARD':
      return `are ${e.op === 'MOVE_AWAY' ? 'driven away from' : 'drawn toward'} the source within ${e.radius} tiles`;
    case 'INFLUENCE_MOTIVATION':
      return e.motive === 'diligence' ? `tire less from night work (exhaustion -${15 * e.magnitude})` : `feel ${e.motive === 'calm' ? 'calmer' : 'braver'}: fear -${10 * e.magnitude} at dawn (feelings only; what they believe is their own)`;
    case 'SPAWN_BOUNDED_ENTITY':
      return `hatch up to ${e.count} chick${e.count === 1 ? '' : 's'} per coop at dawn, each costing one food (at most 12 a coop, 24 in all)`;
    case 'RELOCATE_RESOURCE':
      return `draw up to ${e.magnitude} steps of water from the river onto ${e.toward}`;
    case 'GIVE_STATUS_EFFECT':
      return e.status === 'fireproof' ? 'are untouched by fire for the night' : e.status === 'sick_resistant' ? `fall sick less: sickness -${25 * e.magnitude}%` : `keep warm: cold drain -${2 * e.magnitude}`;
    default:
      return 'cannot act in this version';
  }
}

export function clauseText(s: RunState, c: Clause, regions: string[]): string {
  const when = `When ${triggerText(c.when)}${c.where ? ` and ${condText(c.where)}` : ''}`;
  const dur = c.duration === 'while_active' ? ', and from then on every night while the belief holds' : '';
  return `${when}${dur}: ${selectorText(s, c.target, regions)} ${effectText(c)}.`;
}

function requiresOf(s: RunState, ast: RealityAst): string[] {
  const out = new Set<string>();
  const walk = (t: Trigger) => {
    if ('all' in t) return t.all.forEach(walk);
    if ('any' in t) return t.any.forEach(walk);
    if ('not' in t) return;
    const r = ast.regions.map((x) => regionName(s, x)).join(' or ');
    switch (t.event) {
      case 'bell':
        out.add('someone rings the bell (the bell ritual) on the day it should act');
        break;
      case 'lantern':
        out.add(`lit beacons with fuel in ${r}`);
        break;
      case 'smoke_fire':
        out.add(`a lit smoke fire in ${r}`);
        break;
      case 'watchers':
        out.add(`at least ${t.min ?? 1} believer${(t.min ?? 1) === 1 ? '' : 's'} keeping watch on the bridge`);
        break;
      case 'spoken':
        out.add('telling people about it that day');
        break;
      case 'ritual':
        out.add('a ritual that day');
        break;
      case 'rain':
        out.add('a rainy night (see the forecast)');
        break;
      case 'clear_night':
        out.add('a clear night (see the forecast)');
        break;
      case 'flood':
        out.add('a high river');
        break;
      default:
        break;
    }
  };
  ast.clauses.forEach((c) => walk(c.when));
  return [...out];
}

/** The canonical, balanced, grounded claim for an AST v2, or the exact reasons it cannot be one. */
export function buildRealityClaim(s: RunState, astIn: unknown, opts: { title?: string; rev?: number } = {}): RealityBuild {
  if (!s.v2) return fail('NOT_REALITY_RUN', 'Beliefs in the reality language are written in Generative Reality runs.');
  const lab = s.v2.lab;
  const checked = validateRealityAst(astIn, lab ? LAB_LIMITS : LIMITS);
  if (!checked.ok) return fail('INVALID_CLAIM', 'That belief is not one the village can run.', checked.issues.map((i) => `${i.at}: ${i.message}`));
  const ground = groundAst(s, checked.ast);
  if (!ground.ok) return fail('UNSUPPORTED_EFFECT', 'That belief names something this village cannot do.', ground.issues);
  const notes = [...ground.notes];
  const text = sanitizeText(checked.ast.text);
  const bal = balanceReality({ ...checked.ast, text }, { lab, maxBelievers: believerCap(s.villagers, checked.ast.regions) });
  const ast = bal.ast;
  const id = `reality_${bal.hash.slice(0, 10)}`;
  const title = sanitizeText(opts.title ?? '').replace(/[<>]/g, '').slice(0, MAX_TITLE) || defaultTitle(ast);
  const electorate: Record<string, string[]> = {};
  for (const r of ast.regions) {
    const e = electorateOfRegion(s.villagers, r);
    if (e) electorate[r] = e;
  }
  const mechanics = ast.clauses.map((c) => clauseText(s, c, ast.regions));
  const risks = [...new Set(ast.clauses.map((c) => OPERATORS[c.effect.op].downside).filter(Boolean))];
  const rev = opts.rev ?? s.nextEventId;
  const unlockDay = realityUnlockDay(s, ast);
  if (unlockDay !== undefined && s.day < unlockDay) notes.push(`The village will take this up on day ${unlockDay}: the chapter holds back its own answer of this kind until then, and a written one cannot jump the queue.`);
  const claim: ClaimDef = {
    id,
    text,
    short: title,
    icon: '✦',
    // a neutral V1 spec: V1's effect table does nothing for smoke.conceal, so only the reality executor acts; the thresholds are real
    spec: { id, version: 1, subject: 'smoke', effect: 'conceal', trigger: { kind: 'lit_beacon' }, radius: 0, intensity: 1, thresholds: bal.thresholds, upkeep: { fuel: 0 }, side: [], tags: ['reality', lab ? 'lab' : 'chronicle'] },
    regions: ast.regions.slice(),
    ...(Object.keys(electorate).length ? { electorate } : {}),
    contradicts: [],
    benefit: mechanics.join(' '),
    risk: risks.join('; '),
    flavor: ast.narrative ?? '',
    startsAvailable: true,
    ...(unlockDay !== undefined ? { unlockDay } : {}),
    reality: { ast, hash: bal.hash, power: bal.power, rating: bal.rating, checksum: bal.checksum, rev },
  };
  return {
    ok: true,
    draft: {
      id,
      title,
      ast,
      claim,
      mechanics,
      requires: requiresOf(s, ast),
      risks,
      adjustments: bal.adjustments,
      omitted: ast.omitted.map((o) => ({ text: o.text, why: o.why })),
      notes,
      narrative: ast.narrative,
      support: { percent: Math.round(bal.thresholds.on * 100), believers: bal.thresholds.minSupporters },
      rating: bal.rating,
      power: bal.power,
      cost: { compose: bal.apCost, perTelling: 1 },
      rev,
    },
  };
}

/** Which V1 subject an operator on a target competes with, for the chapter's pacing rule. */
function v1SubjectOf(c: Clause): string | null {
  const e = c.effect;
  if (e.op === 'WEATHER_MODIFIER' || e.op === 'RELOCATE_RESOURCE') return 'rain';
  if (e.op === 'REDIRECT_FLOW' || ((e.op === 'MOVE_AWAY' || e.op === 'MOVE_TOWARD') && c.target.kind === 'water')) return 'river';
  if ((e.op === 'MODIFY_DURABILITY' || e.op === 'SET_MATERIAL_PROPERTY') && c.target.kind === 'bridge') return 'bridge';
  if (e.op === 'GROW_ENTITY' || e.op === 'DECAY_ENTITY') return 'grain';
  if ((e.op === 'MOVE_AWAY' || e.op === 'MOVE_TOWARD' || e.op === 'MODIFY_MOVEMENT') && c.target.kind === 'wolf') return 'wolf';
  if (e.op === 'ALTER_TEMPERATURE' || (e.op === 'MODIFY_MOVEMENT' && c.target.kind === 'fire')) return 'fire';
  if (e.op === 'GIVE_STATUS_EFFECT' && e.status === 'sick_resistant') return 'illness';
  return null;
}

/**
 * V1's pacing rule, kept for reality beliefs: an answer the chapter deliberately holds back (it unlocks on a set day) cannot be
 * skipped by writing a belief that does the same kind of thing. V1's exploit hunt found a written rain belief winning Redbank 40
 * times in 40 when it could be told before the chapter's own (docs/FINAL_ACCEPTANCE.md). Opening stories are not held back.
 */
export function realityUnlockDay(s: RunState, ast: RealityAst): number | undefined {
  let day = 0;
  for (const c of ast.clauses) {
    const subject = v1SubjectOf(c);
    if (!subject) continue;
    let first = Infinity;
    for (const d of s.scn.claimDefs) if (!d.rival && d.unlockDay !== undefined && !s.scn.starters.includes(d.id) && d.spec.subject === subject) first = Math.min(first, d.unlockDay);
    if (first !== Infinity) day = Math.max(day, first);
  }
  return day > 0 ? day : undefined;
}

function defaultTitle(ast: RealityAst): string {
  const t = ast.text.replace(/[.!?]+$/, '');
  return t.length <= MAX_TITLE ? t : `${t.slice(0, MAX_TITLE - 1).replace(/\s+\S*$/, '')}…`;
}

/**
 * A reality belief that arrives from a save or an import must be exactly what this builder makes of its own AST in that run: the
 * id, thresholds and fingerprint are derived, so an edit shows. Returns why not, or null.
 */
export function verifyRealityClaim(s: RunState, def: ClaimDef): string | null {
  const r = def.reality;
  if (!r) return null;
  const built = buildRealityClaim(s, r.ast, { title: def.short, rev: r.rev });
  if (!built.ok) return `its structure no longer checks out (${built.issues[0] ?? built.message})`;
  const b = built.draft.claim;
  if (b.id !== def.id || b.reality!.hash !== r.hash || b.reality!.checksum !== r.checksum) return 'its numbers or fingerprint were changed';
  if (canonicalize(b.spec.thresholds) !== canonicalize(def.spec.thresholds)) return 'its thresholds were changed';
  if (canonicalize(b.regions) !== canonicalize(def.regions)) return 'its regions were changed';
  if ((b.unlockDay ?? null) !== (def.unlockDay ?? null)) return 'the day it can first be told was changed';
  return null;
}
