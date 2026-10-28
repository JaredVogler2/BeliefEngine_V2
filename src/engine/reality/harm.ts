import { emit, type Ctx } from '../core/events.ts';
import { remember } from '../core/memory.ts';
import type { GameEvent, RunState } from '../core/types.ts';
import { ensureBelief, round1 } from '../social/persuasion.ts';
import { regionAt } from '../world/grid.ts';
import { realityRules } from './state.ts';

/**
 * The price of hazardous magic (rules 2, phase 11). When a belief the Keeper wrote does real damage to the livelihood of the people
 * living where it acts (rain it moved pools on their low ground, the fire-kept wards their flood defence rests on sink, a stone it
 * made light rams their bridge, crops wither), the people of that region remember who wrote it: their trust in the Keeper drops a
 * little, and the belief that hurt them loses some of its hold on them (LAW_HARMED). Nobody is told twice in one night about the same
 * belief, and the harm is read only from what the engine logged that night, never guessed.
 *
 * A faction leader of a harmed region who does not firmly hold the belief may then stand against it in public (mind/claims.ts): the
 * choice between a quick, hazardous win and the village's trust is the player's.
 */

export interface LawHarm {
  law: string;
  claim: string;
  region: string;
  /** a tile of the harmed ground (where the water pooled, a ward, the bridge, a field), so the event can be placed and its region read */
  tile: [number, number] | null;
  /** what it did, in a few words that name the place */
  what: string;
  /** the event that shows it */
  event: number;
}

const TRUST_COST = 3;
const CONVICTION_COST = 5;

/** What written laws did to people's livelihoods tonight, one entry per law and region (from tonight's events). */
export function lawHarms(s: RunState, events: GameEvent[]): LawHarm[] {
  const out: LawHarm[] = [];
  const add = (h: LawHarm) => {
    if (!out.some((x) => x.law === h.law && x.region === h.region)) out.push(h);
  };
  const written = (lawId: string | undefined) => {
    const law = lawId ? s.laws.find((l) => l.id === lawId) : undefined;
    const def = law ? s.claims.find((c) => c.id === law.claimId)?.def : undefined;
    return law && def?.reality && !def.rival ? law : null;
  };
  const name = (r: string) => s.world.regions.find((x) => x.id === r)?.name ?? r;
  const first = (kind: string, r: string): [number, number] | null => {
    const l = s.world.landmarks.find((x) => x.kind === kind && (r === 'river' || x.district === r));
    return l ? [l.x, l.y] : null;
  };
  for (const e of events) {
    const law = written(e.law);
    if (!law) continue;
    if (e.code === 'WATER_POOLED' && e.tile) {
      const region = regionAt(s.world, e.tile[0], e.tile[1]);
      if (region) add({ law: law.id, claim: law.claimId, region, tile: e.tile, what: `the water it moved pooled on ${e.delta?.tiles?.[1] ?? 'some'} tiles of low ground in ${name(region)}`, event: e.id });
    } else if (e.code === 'FIRE_WARDS_COOLED') add({ law: law.id, claim: law.claimId, region: law.regionId, tile: first('beacon', law.regionId), what: `the fire-kept flood wards of ${name(law.regionId)} sank`, event: e.id });
    else if (e.code === 'STONE_RAMS_BRIDGE') add({ law: law.id, claim: law.claimId, region: 'river', tile: e.tile ?? first('bridge', 'river'), what: 'a stone it made light rammed the bridge', event: e.id });
    else if (e.code === 'REALITY_EFFECT' && /wither/.test(e.text)) add({ law: law.id, claim: law.claimId, region: law.regionId, tile: first('field', law.regionId), what: `crops withered in ${name(law.regionId)}`, event: e.id });
  }
  return out;
}

/** Night, after the hazards: the harmed remember. V2 runs under rules 2 only (older runs replay exactly as they were). */
export function settleLawHarm(ctx: Ctx): LawHarm[] {
  const s = ctx.s;
  if (!s.v2 || realityRules(s) < 2) return [];
  const harms = lawHarms(s, ctx.events);
  for (const h of harms) {
    const people = s.villagers.filter((v) => v.status !== 'dead' && (h.region === 'river' || v.district === h.region));
    if (!people.length) continue;
    const short = s.claims.find((c) => c.id === h.claim)?.def?.short ?? h.claim;
    for (const v of people) {
      v.keeperTrust = Math.max(0, v.keeperTrust - TRUST_COST);
      const b = ensureBelief(v, h.claim);
      b.conv = round1(b.conv - CONVICTION_COST);
      remember(v, { kind: 'law_harmed', day: s.day, claim: h.claim, text: `“${short}”: ${h.what}` });
    }
    emit(ctx, {
      step: 'social', code: 'LAW_HARMED', importance: 2, law: h.law, claim: h.claim, cause: [h.event], reason: 'LAW_HARMED', ...(h.tile ? { tile: h.tile } : {}),
      text: `“${short}” did harm: ${h.what}. ${people.length} people who live with it trust you a little less, and hold the belief less.`,
    });
  }
  return harms;
}
