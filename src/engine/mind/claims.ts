import { emit, type Ctx } from '../core/events.ts';
import { claimDef, findClaimDef, findVillager } from '../core/lookup.ts';
import type { ClaimDef, RunState, Villager } from '../core/types.ts';
import { installClaim } from '../nl/stress.ts';
import type { Clause, Effect, RealityAst } from '../reality/ast.ts';
import { buildRealityClaim, clauseText } from '../reality/build.ts';
import { astFromV1 } from '../reality/v1.ts';
import { ensureBelief, round1 } from '../social/persuasion.ts';
import { judged } from './decide.ts';
import { realityRules } from '../reality/state.ts';
import { regionAt } from '../world/grid.ts';
import type { Episode } from './types.ts';

/**
 * Competing claims villagers write (phase 08). A faction leader who disbelieves a story the village now lives by, and has just
 * lost something or seen it fail, may put the opposite to the village: the same belief language, built, grounded and priced by
 * the same engine as the player's own (`buildRealityClaim`), with the story's effects turned around. Rare and fair: one per
 * faction per run, none within three days of another, announced a day ahead (so the Keeper can change the author's mind, and the
 * claim is withdrawn), and contestable like any rival story once made.
 */

const LOSS = new Set(['lost_kin', 'lost_home', 'lost_herd', 'lost_crop', 'trapped', 'saw_proof_fail']);

/** The opposite of an effect, where the language has one. */
function mirror(e: Effect): Effect | null {
  switch (e.op) {
    case 'REDIRECT_FLOW':
      return { ...e, mode: e.mode === 'attract' ? 'repel' : 'attract' };
    case 'WEATHER_MODIFIER':
      return e.mode === 'attract' ? { ...e, mode: 'redirect' } : { ...e, mode: 'attract' };
    case 'MOVE_AWAY':
      return { ...e, op: 'MOVE_TOWARD' } as Effect;
    case 'MOVE_TOWARD':
      return { ...e, op: 'MOVE_AWAY' } as Effect;
    case 'GROW_ENTITY':
      return { ...e, op: 'DECAY_ENTITY' } as Effect;
    case 'DECAY_ENTITY':
      return { ...e, op: 'GROW_ENTITY' } as Effect;
    case 'SET_MATERIAL_PROPERTY':
    case 'ALTER_TEMPERATURE':
    case 'MODIFY_DURABILITY':
    case 'MODIFY_VISIBILITY':
    case 'MODIFY_MOVEMENT':
    case 'CHANGE_LIGHT':
      return { ...e, delta: -e.delta } as Effect;
    case 'APPLY_FORCE':
      return e.direction === 'away' ? { ...e, direction: 'toward' } : e.direction === 'toward' ? { ...e, direction: 'away' } : null;
    default:
      return null;
  }
}

function astOf(def: ClaimDef): RealityAst | null {
  return def.reality?.ast ?? astFromV1(def)?.ast ?? null;
}

/** The story turned around, in the reality language; null when no part of it has an opposite. */
export function opposite(s: RunState, def: ClaimDef, author: Villager): { ast: RealityAst; text: string } | null {
  const base = astOf(def);
  if (!base) return null;
  const clauses: Clause[] = [];
  for (const c of base.clauses) {
    const e = mirror(c.effect);
    if (e) clauses.push({ ...c, id: `c${clauses.length + 1}`, effect: e });
  }
  if (!clauses.length) return null;
  const said = clauses.map((c) => clauseText(s, c, base.regions)).join(' ');
  const text = `“${def.short}” has it backwards. ${said}`.slice(0, 240);
  return {
    text,
    ast: { v: 2, lang: base.lang, text, author: 'npc', source: { reader: 'offline-v2', model: null, prompt: `npc:${author.id}`.slice(0, 60), id: null }, day: Math.max(0, Math.min(400, s.day)), regions: base.regions, clauses, omitted: [], narrative: null },
  };
}

/** Did this harm (a LAW_HARMED event, placed on a tile of the harmed ground) fall on the leader's own region (the bridge is both banks')? */
function leaderRegionHarmed(s: RunState, e: { tile?: [number, number] }, district: string): boolean {
  if (!e.tile) return false;
  const r = regionAt(s.world, e.tile[0], e.tile[1]);
  return r === district || r === 'river';
}

/** The harm in a LAW_HARMED event's own words (between "did harm:" and the first full stop). */
const harmWhat = (text: string): string => text.split(' did harm: ')[1]?.split('. ')[0] ?? 'to the village';

/** Night: does a faction leader announce a competing claim for tomorrow? */
export function considerNpcClaims(ctx: Ctx, fresh: Map<string, Episode[]>): void {
  const s = ctx.s;
  const minds = s.v2?.minds;
  if (!minds) return;
  const list = (minds.npcClaims ??= []);
  if (list.some((c) => c.day > s.day - 3)) return;
  for (const f of [...s.factions].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (f.kind !== 'council' && f.kind !== 'scholars') continue;
    if (list.some((c) => findVillager(s, c.by)?.faction === f.id)) continue;
    const leader = findVillager(s, f.leader);
    if (!leader || leader.status === 'dead' || leader.duty === 'trapped') continue;
    // rules 2: a written belief that harmed people's livelihood tonight (reality/harm.ts) is reason enough to stand against it, unless
    // the leader firmly holds it: the council's leader answers for the whole village (it is the public's livelihood), a scholar for
    // their own people
    const harms = realityRules(s) >= 2 ? ctx.events.filter((e) => e.code === 'LAW_HARMED' && e.law && (f.kind === 'council' || leaderRegionHarmed(s, e, leader.district))) : [];
    const harmedBy = new Map(harms.map((e) => [e.law!, e]));
    // a loss, a failed proof, or news that a story they strongly doubt now rules them
    const shaken = harmedBy.size > 0 || (fresh.get(leader.id) ?? []).some((e) => LOSS.has(e.kind) || (e.kind === 'law_news' && e.claim !== null && (leader.beliefs[e.claim]?.conv ?? 0) <= -30));
    if (!shaken) continue;
    const laws = s.laws
      .filter((l) => (l.status === 'active' || l.status === 'wavering') && !claimDef(s, l.claimId).rival)
      .filter((l) => harmedBy.has(l.id) || (claimDef(s, l.claimId).electorate?.[l.regionId] ?? [l.regionId]).includes(leader.district))
      .filter((l) => (harmedBy.has(l.id) && (leader.beliefs[l.claimId]?.conv ?? 0) < 50) || (leader.beliefs[l.claimId]?.conv ?? 0) <= -10 || judged(s, leader.id, l.claimId) < 0)
      // a story the scenario already gave a rival answers itself
      .filter((l) => !claimDef(s, l.claimId).contradicts.some((c) => findClaimDef(s, c)?.rival))
      .sort((a, b) => Number(harmedBy.has(b.id)) - Number(harmedBy.has(a.id)));
    for (const law of laws) {
      const def = claimDef(s, law.claimId);
      const o = opposite(s, def, leader);
      if (!o || !buildRealityClaim(s, o.ast).ok) continue;
      const harm = harmedBy.get(law.id);
      list.push({ by: leader.id, against: def.id, text: o.text, ast: o.ast, day: s.day, state: 'announced', claim: null });
      emit(ctx, {
        step: 'rival', code: harm ? 'LEADER_OPPOSES' : 'NPC_CLAIM_TELEGRAPHED', importance: 3, actor: leader.id, claim: def.id, ...(harm ? { cause: [harm.id], reason: 'LIVELIHOOD' } : {}),
        text: harm
          ? `${leader.name} stands against “${def.short}” for the harm it did (${harmWhat(harm.text)}). Tomorrow they will tell the village that ${o.text.charAt(0).toLowerCase()}${o.text.slice(1)} You can still change their mind, or let the belief go.`
          : `${leader.name} will tell the village tomorrow that ${o.text.charAt(0).toLowerCase()}${o.text.slice(1)} You can still change their mind, or show the story working.`,
      });
      return;
    }
  }
}

/** Dusk: an announced claim is made, unless the author has come round in the meantime. */
export function makeNpcClaims(ctx: Ctx): void {
  const s = ctx.s;
  const minds = s.v2?.minds;
  for (const c of minds?.npcClaims ?? []) {
    if (c.state !== 'announced' || c.day >= s.day) continue;
    const by = findVillager(s, c.by);
    const keeper = claimDef(s, c.against);
    if (!by || by.status === 'dead' || (by.beliefs[c.against]?.conv ?? 0) > 0) {
      c.state = 'withdrawn';
      emit(ctx, { step: 'rival', code: 'NPC_CLAIM_WITHDRAWN', importance: 2, actor: c.by, claim: c.against, text: `${by?.name ?? 'The author'} keeps it to themselves: they no longer doubt “${keeper.short}”.` });
      continue;
    }
    const who = by.name.split(' ')[0];
    const room = 40 - `${who}'s answer`.length;
    const title = room >= 12 ? `${who}'s answer to “${keeper.short.length > room - 8 ? `${keeper.short.slice(0, room - 9).trimEnd()}…` : keeper.short}”` : `${who}'s answer`;
    const built = buildRealityClaim(s, { ...c.ast, day: Math.max(0, Math.min(400, s.day)) }, { title: title.slice(0, 40) });
    if (!built.ok || s.claims.some((x) => x.id === built.draft.claim.id)) {
      c.state = 'withdrawn';
      continue;
    }
    const def: ClaimDef = { ...built.draft.claim, rival: true, adoptable: false, contradicts: [c.against] };
    installClaim(s, def);
    ((minds!.contested ??= {})[c.against] ??= []).push(def.id);
    c.state = 'made';
    c.claim = def.id;
    const id = emit(ctx, { step: 'rival', code: 'NPC_CLAIM_MADE', importance: 3, actor: by.id, claim: def.id, text: `${by.name} puts it to the village: ${c.text}` });
    // the author believes it, and their faction hears it from them first
    const mine = ensureBelief(by, def.id);
    mine.conv = Math.max(mine.conv, 70);
    mine.heard += 1;
    mine.lastDay = s.day;
    mine.cause = id;
    for (const v of s.villagers) {
      if (v.id === by.id || v.status === 'dead' || v.faction !== by.faction) continue;
      const b = ensureBelief(v, def.id);
      b.conv = round1(Math.min(100, b.conv + 15));
      b.heard += 1;
      b.lastDay = s.day;
      b.lastSource = by.id;
      b.cause = id;
    }
  }
}
