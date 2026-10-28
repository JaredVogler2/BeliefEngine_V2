import { canonicalize } from '../core/hash.ts';
import type { ClaimDef, RunState } from '../core/types.ts';
import { believerCap, electorateOfRegion } from '../nl/build.ts';
import { sanitizeText } from '../nl/parse.ts';
import { validateRealityAst, LAB_LIMITS, LIMITS, type Clause, type Condition, type RealityAst, type Selector, type Trigger } from './ast.ts';
import { balanceReality, type Rating } from './balance.ts';
import { demoRitualOf } from './demonstrate.ts';
import { groundAst } from './ground.ts';
import { ANCHOR_LABEL, KINDS } from './ontology.ts';
import { realityRules } from './state.ts';
import { authoredTwin } from './twin.ts';

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
  /** what else it does to the world, as the engine plays it (sideEffectsOf) */
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

/** Things named in the singular in previews (floodwater, rain, fire, smoke, the bridge); every other kind is plural. */
const SINGULAR = new Set(['water', 'rain', 'fire', 'smoke', 'bridge']);
const IRREGULAR_3RD: Record<string, string> = { are: 'is', have: 'has' };

/** The verb agreeing with its subject: "chickens rise", "rain rises". */
function v(base: string, sg: boolean): string {
  if (!sg) return base;
  if (IRREGULAR_3RD[base]) return IRREGULAR_3RD[base];
  return /(s|sh|ch|x|z)$/.test(base) ? `${base}es` : `${base}s`;
}

function effectText(s: RunState, c: Clause): string {
  const e = c.effect;
  const sg = SINGULAR.has(c.target.kind);
  const tiles = (n: number) => `${n} tile${n === 1 ? '' : 's'}`;
  switch (e.op) {
    case 'APPLY_FORCE':
      return e.direction === 'up' ? `${v('rise', sg)} up to ${tiles(e.magnitude)} into the air for the night (out of reach of water and wolves; a lift of 2 or more drifts with a strong wind)` : `${v('are', sg)} pushed up to ${tiles(e.magnitude)} ${e.direction === 'away' ? 'away from' : 'toward'} the source`;
    case 'REDIRECT_FLOW':
      return e.mode === 'slow' ? `${v('are', sg)} slowed and turned aside: the ground counts as up to ${tiles(e.magnitude)} higher within ${tiles(e.radius)} of each source` : `${v('are', sg)} ${e.mode === 'attract' ? 'drawn in: the ground counts as up to' : 'turned aside: the ground counts as up to'} ${tiles(e.magnitude)} ${e.mode === 'attract' ? 'lower' : 'higher'} within ${tiles(e.radius)} of each source`;
    case 'WEATHER_MODIFIER':
      return e.mode === 'redirect'
        ? `${v('are', sg)} drawn off the river: up to ${e.magnitude} steps of rain fall${e.toward ? ` on ${regionName(s, e.toward)}` : ' elsewhere'} instead`
        : e.mode === 'repel'
          ? `${v('are', sg)} pushed back: the river rises one step less`
          : `${v('are', sg)} called${e.toward ? ` onto ${regionName(s, e.toward)}` : ''}: up to ${e.magnitude} steps of rain fall there instead of upriver (moved, not made: it lands on the low ground)`;
    case 'SET_MATERIAL_PROPERTY':
      return e.property === 'mass' ? `${v('weigh', sg)} ${Math.abs(e.delta)} load${Math.abs(e.delta) === 1 ? '' : 's'} ${e.delta < 0 ? 'less' : 'more'} (a stone of 1 load or less is carried to the bank by anyone working nearby, and floats in floodwater)` : e.property === 'flammability' ? `${v('burn', sg)} ${e.delta < 0 ? 'less' : 'more'} readily (fire damage ${e.delta < 0 ? '-' : '+'}${Math.abs(e.delta) * 20}%)` : `${v('become', sg)} ${e.delta > 0 ? 'harder' : 'softer'} (damage ${e.delta > 0 ? 'reduced' : 'increased'})`;
    case 'GROW_ENTITY':
      return `${v('ripen', sg)} up to ${10 * e.magnitude}% faster each night`;
    case 'DECAY_ENTITY':
      return `${v('wither', sg)}: up to ${6 * e.magnitude}% growth lost each night`;
    case 'ALTER_TEMPERATURE':
      return e.delta < 0 ? `${v('burn', sg)} weaker: fire damage cut by up to ${25 * Math.abs(e.delta)}%` : `${v('burn', sg)} hotter: fire damage raised by up to ${20 * e.delta}%`;
    case 'CHANGE_LIGHT':
      return `${v(e.delta > 0 ? 'shine' : 'dim', sg)}: lantern-powered beliefs reach ${tiles(Math.abs(e.delta))} ${e.delta > 0 ? 'further' : 'less far'}`;
    case 'MODIFY_DURABILITY':
      return e.delta > 0 ? `${v('hold', sg)} stronger: up to ${[0, 45, 70, 90][e.delta]}% of flood damage prevented (whether watched or not)` : `${v('grow', sg)} weaker: up to ${30 * Math.abs(e.delta)}% more damage`;
    case 'MODIFY_VISIBILITY':
      return `${v('are', sg)} ${e.delta < 0 ? 'hidden from' : 'shown to'} the wolves within ${tiles(Math.abs(e.delta))}`;
    case 'MODIFY_MOVEMENT':
      return c.target.kind === 'fire' ? `${v('spread', sg)} ${e.delta < 0 ? 'slower' : 'faster'} (×${(1 + 0.2 * e.delta).toFixed(1)} at full support)` : `${v('cover', sg)} one tile ${e.delta < 0 ? 'less' : 'more'} each night`;
    case 'MOVE_AWAY':
    case 'MOVE_TOWARD':
      return `${v('are', sg)} ${e.op === 'MOVE_AWAY' ? 'driven away from' : 'drawn toward'} the source within ${tiles(e.radius)}`;
    case 'INFLUENCE_MOTIVATION':
      return e.motive === 'diligence' ? `${v('tire', sg)} less from night work (exhaustion -${15 * e.magnitude})` : `${v('feel', sg)} ${e.motive === 'calm' ? 'calmer' : 'braver'}: fear -${10 * e.magnitude} at dawn (feelings only; what they believe is their own)`;
    case 'SPAWN_BOUNDED_ENTITY':
      return `${v('hatch', sg)} up to ${e.count} chick${e.count === 1 ? '' : 's'} per coop at dawn, each costing one food (at most 12 a coop, 24 in all)`;
    case 'RELOCATE_RESOURCE':
      return `${v('are', sg)} drawn from the river: up to ${e.magnitude} steps of water land on ${regionName(s, e.toward)}`;
    case 'GIVE_STATUS_EFFECT':
      return e.status === 'fireproof' ? `${v('are', sg)} untouched by fire for the night` : e.status === 'sick_resistant' ? `${v('fall', sg)} sick less: sickness -${25 * e.magnitude}%` : `${v('keep', sg)} warm: cold drain -${2 * e.magnitude}`;
    default:
      return 'cannot act in this version';
  }
}

export function clauseText(s: RunState, c: Clause, regions: string[]): string {
  const when = `When ${triggerText(c.when)}${c.where ? ` and ${condText(c.where)}` : ''}`;
  const dur = c.duration === 'while_active' ? ', and from then on every night while the belief holds' : '';
  return `${when}${dur}: ${selectorText(s, c.target, regions)} ${effectText(s, c)}.`;
}

/** What else a clause does to the world, exactly as the engine plays it: never more than it does. */
export function sideEffectsOf(s: RunState, c: Clause, regions: string[]): string[] {
  const e = c.effect;
  const dest = (toward: string | null) => regionName(s, toward ?? regions.find((r) => r !== 'river') ?? regions[0]);
  switch (e.op) {
    case 'APPLY_FORCE':
      return e.direction === 'up'
        ? [`On a windy night a lift of 2 or more carries them downwind, across the river if it blows that way: a stray lays no eggs and walks home only over a standing bridge (on a still night a lifted stray flies home).`]
        : ['Pushed hens can be driven into floodwater, where they drown.'];
    case 'REDIRECT_FLOW':
      return e.mode === 'attract' ? ['Water drawn in stands deeper on the ground around each source: homes there flood worse.'] : [`It spares only the ground within ${e.radius} tile${e.radius === 1 ? '' : 's'} of each source; the river rises as high everywhere else.`];
    case 'WEATHER_MODIFIER':
      if (e.mode === 'repel') return [];
      return [s.scn.features.crops ? `The rain lands on ${dest(e.toward)}, where its fields drink it.` : `The rain lands on ${dest(e.toward)}: up to ${6 * e.magnitude} of its lowest dry tiles stand a tile deep, and homes there take flood damage.`];
    case 'RELOCATE_RESOURCE':
      return [`The water lands on ${regionName(s, e.toward)}: up to ${6 * e.magnitude} of its lowest dry tiles stand a tile deep, and homes there take flood damage.`];
    case 'SET_MATERIAL_PROPERTY':
      return e.property === 'mass' && e.delta < 0 ? ['A stone made light that stands in floodwater floats off and rams the bridge (6 integrity each).'] : [];
    case 'ALTER_TEMPERATURE':
      return e.delta < 0
        ? ['The hearths warm less: children, elders and anyone run down lose health each night it acts.', ...(e.delta <= -2 ? ['The river fears a cooler fire less: flood wards kept by lit beacons or smoke fires stand a step lower those nights.'] : [])]
        : ['Fires that start burn homes harder.'];
    case 'CHANGE_LIGHT':
      return e.delta > 0 ? ['Brighter lanterns burn their fuel twice as fast.'] : [];
    case 'MOVE_TOWARD':
      return c.target.kind === 'wolf' ? ['Lured packs come exactly where the source stands.'] : c.target.kind === 'water' ? ['Water drawn in stands deeper on the ground around each source.'] : [];
    case 'MODIFY_VISIBILITY':
      return e.delta > 0 ? ['Packs are drawn to what is shown to them.'] : [];
    case 'MODIFY_MOVEMENT':
      return e.delta > 0 ? [c.target.kind === 'fire' ? 'Faster flames spread further.' : 'Faster packs arrive sooner.'] : [];
    case 'INFLUENCE_MOTIVATION':
      return e.motive === 'diligence' ? [] : ['Calmer people are harder to convince of anything, your stories included (fear makes people listen).'];
    case 'SPAWN_BOUNDED_ENTITY':
      return ['Each chick costs one food from the store; a coop holds at most twelve.'];
    default:
      return [];
  }
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
  const rules = realityRules(s);
  const twin = rules >= 2 ? authoredTwin(s, checked.ast) : null;
  const bal = balanceReality({ ...checked.ast, text }, { lab, rules, maxBelievers: believerCap(s.villagers, checked.ast.regions), floor: twin ? { short: twin.short, thresholds: twin.spec.thresholds, watchers: twin.spec.trigger.kind === 'watchers' ? (twin.spec.trigger.min ?? 1) : undefined } : null });
  const ast = bal.ast;
  const id = `reality_${bal.hash.slice(0, 10)}`;
  const title = sanitizeText(opts.title ?? '').replace(/[<>]/g, '').slice(0, MAX_TITLE) || defaultTitle(ast);
  const electorate: Record<string, string[]> = {};
  for (const r of ast.regions) {
    const e = electorateOfRegion(s.villagers, r);
    if (e) electorate[r] = e;
  }
  const mechanics = ast.clauses.map((c) => clauseText(s, c, ast.regions));
  const risks = [...new Set(ast.clauses.flatMap((c) => sideEffectsOf(s, c, ast.regions)))];
  const rev = opts.rev ?? s.nextEventId;
  const unlockDay = realityUnlockDay(s, ast);
  // rules 2: a belief that waits for a catalyst the Keeper can make can be staged at it, like an authored story (demonstrate.ts);
  // one that does what a story of the village does can at least be proved the way that story is (a copy is as provable as it)
  const ritual = rules >= 2 ? (demoRitualOf(s, ast) ?? (twin?.ritual && s.scn.rituals.some((r) => r.id === twin.ritual) ? twin.ritual : undefined)) : undefined;
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
    ...(ritual ? { ritual } : {}),
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
  // rules 2: an opening story the player did not pick is held back too (it reaches the hand on its own day), so writing it on day 1
  // is not a way to have both openings; the one they picked is theirs from the start
  const held = (d: ClaimDef) => !s.scn.starters.includes(d.id) || (realityRules(s) >= 2 && s.starter !== null && s.starter !== d.id);
  for (const c of ast.clauses) {
    const subject = v1SubjectOf(c);
    if (!subject) continue;
    let first = Infinity;
    for (const d of s.scn.claimDefs) if (!d.rival && d.unlockDay !== undefined && held(d) && d.spec.subject === subject) first = Math.min(first, d.unlockDay);
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
  if ((b.ritual ?? null) !== (def.ritual ?? null)) return 'the rite that stages it was changed';
  return null;
}
