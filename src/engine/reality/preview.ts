import { allClaimDefs } from '../core/lookup.ts';
import type { ClaimDef, LawState, RunState } from '../core/types.ts';
import { electorateOfRegion } from '../nl/build.ts';
import { direction, triggerEvents, type Clause, type Effect, type RealityAst, type Selector, type Trigger } from './ast.ts';
import { clauseText, sideEffectsOf, triggerText, type RealityDraft } from './build.ts';
import { districtsOf, fires, resolveTargets } from './execute.ts';
import { ANCHOR_LABEL, KINDS } from './ontology.ts';
import { astFromV1 } from './v1.ts';

/**
 * Everything the player should know before confirming a written belief (phase 09), read from the engine's own rules: for each
 * clause what it acts on and how many of those there are now, how far it reaches, how long it lasts, what physically sets it off
 * and whether that could happen tonight as things stand, and what else it does to the world; then what keeping it working costs,
 * how much of the village must believe it, and who is likely to push back. Nothing here changes the run or the claim.
 */

export interface ClausePlan {
  id: string;
  /** the clause in one sentence (the same words as the draft's mechanics) */
  line: string;
  target: string;
  /** how many of the targets exist now (null for things the village has one of everywhere: water, rain, fire, smoke) */
  count: number | null;
  reach: string;
  duration: string;
  catalyst: string;
  /** could the catalyst fire tonight as things stand */
  ready: { now: boolean; why: string };
  /** what else it does, as the engine plays it */
  side: string[];
}

export interface DraftDetails {
  plan: ClausePlan[];
  /** how much of the village has to believe it */
  threshold: { percent: number; off: number; believers: number; voters: number; where: string };
  upkeep: string[];
  opposition: string[];
}

const regionName = (s: RunState, id: string): string => s.world.regions.find((r) => r.id === id)?.name ?? id;
const REGION_LEVEL = new Set(['water', 'rain', 'fire', 'smoke']);
/** Landmarks a village has many of: a belief measured from them acts around each one. */
const MANY = new Set(['home', 'field', 'pen', 'campfire']);
const everyNight = (t: Trigger): boolean => 'event' in t && t.event === 'always';

/** A stand-in law at full strength in one region, to ask the executor what a clause would touch there tonight. */
function pseudoLaw(region: string): LawState {
  return { id: `preview:${region}`, claimId: 'preview', regionId: region, status: 'active', pressure: 1, progress: 100, strength: 1, supporters: [], opponents: [], topShare: 0, note: '', changedDay: 0, activatedDay: null, activeNights: 0 };
}

function reachText(s: RunState, sel: Selector, regions: string[]): string {
  const where = sel.region ? regionName(s, sel.region) : regions.map((r) => regionName(s, r)).join(' or ');
  if (!sel.near) return REGION_LEVEL.has(sel.kind) ? `all of ${where}` : `everywhere in ${where}`;
  const anchor = sel.near.anchor === 'beacon' ? 'a lit lantern' : `${MANY.has(sel.near.anchor) ? 'any' : 'the'} ${ANCHOR_LABEL[sel.near.anchor] ?? sel.near.anchor}`;
  return `within ${sel.near.radius} tile${sel.near.radius === 1 ? '' : 's'} of ${anchor}, in ${where}`;
}

/** Whether the trigger would fire tonight given what has physically happened today (bells rung, lanterns lit, the forecast). */
function readyNow(s: RunState, t: Trigger, regions: string[]): { now: boolean; why: string } {
  const on = regions.some((r) => fires(s, t, pseudoLaw(r)).on);
  const ev = triggerEvents(t);
  const hint = ev.includes('bell') ? 'ring the bell today' : ev.includes('lantern') ? 'light a lantern there' : ev.includes('smoke_fire') ? 'light a smoke fire there' : ev.includes('watchers') ? 'have believers keep watch on the bridge' : ev.includes('spoken') ? 'tell people something today' : ev.includes('ritual') ? 'perform a ritual today' : ev.includes('rain') || ev.includes('clear_night') || ev.includes('flood') ? 'it depends on tonight’s weather' : '';
  const when = everyNight(t) ? 'every night' : triggerText(t);
  return on ? { now: true, why: `${when}: yes, tonight as things stand` } : { now: false, why: `${when}: not tonight as things stand${hint ? ` (${hint})` : ''}` };
}

function planOf(s: RunState, ast: RealityAst): ClausePlan[] {
  return ast.clauses.map((c) => {
    const regions = c.target.region ? [c.target.region] : ast.regions;
    const level = REGION_LEVEL.has(c.target.kind);
    let count: number | null = null;
    if (!level) {
      const seen = new Set<string>();
      for (const r of regions) for (const t of resolveTargets(s, { ...c.target, tags: [] }, pseudoLaw(r), [], 0, null)) seen.add(t.id);
      count = seen.size;
    }
    const where = c.where ? ' (and only while the condition holds)' : '';
    return {
      id: c.id,
      line: clauseText(s, c, ast.regions),
      target: KINDS[c.target.kind].label,
      count,
      // the reach an effect acts with: its own radius where it has one (a narrowed ward), as the mechanics line says
      reach: reachText(s, typeof (c.effect as { radius?: number }).radius === 'number' && c.target.near ? { ...c.target, near: { ...c.target.near, radius: (c.effect as { radius: number }).radius } } : c.target, ast.regions),
      duration: c.duration === 'while_active' ? 'every night once it has first acted, for as long as the belief holds' : everyNight(c.when) ? `every night${where}` : `only on nights it is set off${where}`,
      catalyst: everyNight(c.when) ? 'night falls (it needs nothing else)' : triggerText(c.when),
      ready: readyNow(s, c.when, ast.regions),
      side: sideEffectsOf(s, c, ast.regions),
    };
  });
}

function upkeepOf(s: RunState, ast: RealityAst, draft: RealityDraft): string[] {
  const out = new Set<string>();
  const ritual = (physical: string) => s.scn.rituals.find((r) => r.physical === physical);
  const where = ast.regions.map((r) => regionName(s, r)).join(' or ');
  for (const c of ast.clauses) {
    for (const ev of triggerEvents(c.when)) {
      if (ev === 'bell') {
        const r = ritual('ring');
        out.add(`Ring the bell on each day you want it to act (${r ? `${r.ap} Influence` : 'a ritual'}); it rings that night only.`);
      } else if (ev === 'lantern') {
        const r = ritual('light');
        out.add(`Keep a lantern lit in ${where}${r ? ` (${r.ap} Influence and ${r.fuel} fuel light one for three nights)` : ''}; when it goes out, the belief stops.`);
      } else if (ev === 'smoke_fire') {
        const r = ritual('smoke');
        out.add(`Keep a smoke fire burning in ${where}${r ? ` (${r.ap} Influence and ${r.fuel} fuel for three nights)` : ''}.`);
      } else if (ev === 'watchers') out.add(`At least ${c.when && 'event' in c.when ? (c.when.min ?? 1) : 1} believers spend the night on the bridge instead of at home.`);
      else if (ev === 'spoken') out.add('Tell people something on each day you want it to act (1 Influence each telling).');
      else if (ev === 'ritual') out.add('Perform a ritual on each day you want it to act.');
    }
    if (c.effect.op === 'CHANGE_LIGHT' && c.effect.delta > 0) out.add('Lanterns it brightens burn two fuel a night instead of one.');
    if (c.effect.op === 'SPAWN_BOUNDED_ENTITY') out.add('One food from the store for every chick that hatches.');
  }
  if (!out.size) out.add('Nothing to keep lit or rung: it acts by itself whenever it is set off.');
  out.add(`Belief must stay above ${Math.round(draft.claim.spec.thresholds.off * 100)}% support where it acts, or it fades; telling people costs ${draft.cost.perTelling} Influence each.`);
  return [...out];
}

/** Which way one clause pushes which property of which kind of thing (to find stories that push the other way). */
function axis(c: Clause): string {
  const e: Effect = c.effect;
  const op = e.op === 'MOVE_AWAY' || e.op === 'MOVE_TOWARD' ? 'MOVE' : e.op === 'GROW_ENTITY' || e.op === 'DECAY_ENTITY' ? 'GROWTH' : e.op;
  const sub = e.op === 'SET_MATERIAL_PROPERTY' ? e.property : e.op === 'INFLUENCE_MOTIVATION' ? e.motive : e.op === 'GIVE_STATUS_EFFECT' ? e.status : '';
  return `${c.target.kind}|${op}|${sub}`;
}

function astOf(def: ClaimDef): RealityAst | null {
  return def.reality?.ast ?? astFromV1(def)?.ast ?? null;
}

function oppositionOf(s: RunState, ast: RealityAst, selfId: string): string[] {
  const out: string[] = [];
  // stories (the chapter's, a rival's, a villager's or your own) that push the same thing the other way
  const against: string[] = [];
  for (const def of allClaimDefs(s)) {
    if (def.id === selfId) continue;
    const other = astOf(def);
    if (!other) continue;
    const clash = ast.clauses.some((c) => other.clauses.some((o) => axis(o) === axis(c) && direction(o.effect) !== 0 && direction(o.effect) === -direction(c.effect)));
    if (clash) against.push(`“${def.short}”${def.rival ? ' (a rival story)' : ''}`);
  }
  if (against.length) out.push(`${against.slice(0, 3).join(', ')} push${against.length === 1 ? 'es' : ''} the same thing the other way: on nights both act, the one with more support behind it wins.`);
  // who votes on it, and who among them will want proof
  const districts = new Set(ast.regions.flatMap((r) => electorateOfRegion(s.villagers, r) ?? districtsOf(s, [r])));
  const voters = s.villagers.filter((v) => v.status !== 'dead' && districts.has(v.district));
  const skeptics = voters.filter((v) => v.traits.skepticism >= 65).sort((a, b) => b.traits.skepticism - a.traits.skepticism || (a.id < b.id ? -1 : 1));
  if (skeptics.length) out.push(`${skeptics.slice(0, 3).map((v) => v.name).join(', ')}${skeptics.length > 3 ? ` and ${skeptics.length - 3} more` : ''} ${skeptics.length === 1 ? 'is a skeptic who wants' : 'are skeptics who want'} to see it work before believing, and may argue against it until they do.`);
  for (const f of s.factions) {
    if (!voters.some((v) => v.faction === f.id)) continue;
    if (f.kind === 'scholars') out.push(`${f.name} (empiricists) ask for a test where they can see it before they follow.`);
    if (f.kind === 'council') out.push(`${f.name} weighs the damage to homes and fields: if this belief costs them, its leader may answer it with its opposite.`);
  }
  // harm the clauses do to the people who vote on it
  const harms = ast.clauses.flatMap((c) => sideEffectsOf(s, c, ast.regions)).filter((x) => /homes|health|drown/.test(x));
  if (harms.length) out.push('Households it harms (see “what else it does”) are likely to turn against it after the first night it costs them.');
  return out;
}

/** The full preview of a built draft. */
export function describeDraft(s: RunState, draft: RealityDraft): DraftDetails {
  const ast = draft.ast;
  const districts = new Set(ast.regions.flatMap((r) => draft.claim.electorate?.[r] ?? [r]));
  const voters = s.villagers.filter((v) => v.status !== 'dead' && (districts.has(v.district) || districts.has('river'))).length;
  const th = draft.claim.spec.thresholds;
  return {
    plan: planOf(s, ast),
    threshold: { percent: Math.round(th.on * 100), off: Math.round(th.off * 100), believers: th.minSupporters, voters, where: ast.regions.map((r) => regionName(s, r)).join(' or ') },
    upkeep: upkeepOf(s, ast, draft),
    opposition: oppositionOf(s, ast, draft.claim.id),
  };
}
