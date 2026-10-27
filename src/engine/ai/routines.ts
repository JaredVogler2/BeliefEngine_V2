import { emit, type Ctx } from '../core/events.ts';
import { allClaimDefs, claimDef, findLandmark, findVillager, landmark } from '../core/lookup.ts';
import { hashKeys } from '../core/rng.ts';
import type { Landmark, RunState, Villager } from '../core/types.ts';
import { computeModifiers } from '../laws/effects.ts';
import { computeWater } from '../world/flood.ts';
import { idx } from '../world/grid.ts';
import { bfsDist, passableMask } from '../world/nav.ts';
import { bridgeClaimName, scoreIntents } from './utility.ts';

/** A stable standing spot inside/near a landmark so people do not stack on one pixel. */
export function spotAt(lm: Landmark, key: string, slot = 0): [number, number] {
  if (lm.kind === 'field' && lm.tiles.length > 1) {
    const t = lm.tiles[hashKeys(7, 'spot', key) % lm.tiles.length];
    return [t[0], t[1]];
  }
  if (lm.kind === 'shelter' || lm.kind === 'chapel' || lm.kind === 'market' || lm.kind === 'hall') {
    const offs: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [2, 1]];
    const o = offs[slot % offs.length];
    return [lm.x + o[0], lm.y + o[1]];
  }
  return [lm.x, lm.y];
}

export function placeVillager(v: Villager, lm: Landmark, slot = 0): void {
  const [x, y] = spotAt(lm, v.id, slot);
  v.x = x;
  v.y = y;
  v.place = lm.id;
}

/** Predicted flood depth per tile tonight given everything currently committed (lit beacons, active laws, rung bells). */
export function predictedWater(s: RunState): number[] {
  const L0 = s.threat[Math.min(s.day, s.threat.length) - 1]?.level ?? 0;
  const mods = computeModifiers(s);
  return computeWater(s.world, Math.max(0, L0 + mods.levelDelta), mods.floodShield);
}

export function homeLandmark(s: RunState, v: Villager): Landmark | undefined {
  return findLandmark(s, v.homeId);
}

/** Morning: everyone who can reach their post goes to work. Nobody teleports across a broken bridge. */
export function assignDay(ctx: Ctx): void {
  const s = ctx.s;
  const mask = passableMask(s.world);
  for (const v of s.villagers) {
    if (v.status === 'dead') continue;
    const home = homeLandmark(s, v);
    const displaced = !home || home.hp <= 0;
    v.busyUntil = Math.min(v.busyUntil, s.day - 1);
    const reach = bfsDist(s.world, mask, v.x, v.y, 120);
    const canReach = (lm: Landmark | undefined) => !!lm && reach[idx(s.world, lm.x, lm.y)] >= 0;
    if (displaced) {
      const sh = nearestShelterId(s, v);
      const lm = sh ? findLandmark(s, sh) : home;
      if (lm) {
        placeVillager(v, lm, slotIndex(s, lm.id, v.id));
        v.duty = 'shelter';
        v.dutyNote = home ? 'Their home is ruined; they sleep in the shelter.' : 'Without a home.';
        continue;
      }
    }
    const sick = v.status === 'sick' || v.energy < 25;
    const work = findLandmark(s, v.workId) ?? home!;
    const target = sick ? home ?? work : work;
    if (!canReach(target)) {
      // cut off from their post: stay put (shelter if that is where they are)
      const here = findLandmark(s, v.place);
      v.duty = here?.kind === 'shelter' ? 'shelter' : 'rest';
      v.dutyNote = here?.kind === 'shelter' ? 'Stays at the shelter; the way home is cut.' : 'Cut off from their work.';
      continue;
    }
    placeVillager(v, target, 0);
    v.duty = sick ? 'rest' : 'work';
    v.dutyNote = sick ? 'Too weak to work today.' : `Working at ${work.name}.`;
  }
}

function slotIndex(s: RunState, lmId: string, vid: string): number {
  let n = 0;
  for (const v of s.villagers) {
    if (v.status === 'dead') continue;
    if (v.id === vid) return n;
    if (v.place === lmId) n++;
  }
  return n;
}

function nearestShelterId(s: RunState, v: Villager): string | null {
  const mask = passableMask(s.world);
  const d = bfsDist(s.world, mask, v.x, v.y, 60);
  let best: string | null = null;
  let bestD = 1e9;
  for (const l of s.world.landmarks) {
    if (l.kind !== 'shelter') continue;
    const dd = d[idx(s.world, l.x, l.y)];
    if (dd >= 0 && dd < bestD) {
      bestD = dd;
      best = l.id;
    }
  }
  return best;
}

/**
 * Committing the day: villagers whose home would be dangerously flooded tonight try to reach a shelter with
 * room, children and parents first. If the bridge is gone or the shelter is full they are trapped.
 */
export function commitEvacuations(ctx: Ctx): void {
  const s = ctx.s;
  if (!s.scn.features.flood) return;
  const water = predictedWater(s);
  const mask = passableMask(s.world);
  const used = new Map<string, number>();
  for (const v of s.villagers) if (v.status !== 'dead' && v.duty === 'shelter') used.set(v.place, (used.get(v.place) ?? 0) + 1);
  const hh = new Map<string, number>();
  for (const v of s.villagers) hh.set(v.household, (hh.get(v.household) ?? 0) + (v.archetype === 'child' ? 1 : 0));
  const order = s.villagers
    .filter((v) => v.status !== 'dead' && v.duty !== 'shelter')
    .sort((a, b) => {
      const pa = (a.archetype === 'child' ? 0 : (hh.get(a.household) ?? 0) > 0 ? 1 : 2) * 1000 + (a.id < b.id ? 0 : 1);
      const pb = (b.archetype === 'child' ? 0 : (hh.get(b.household) ?? 0) > 0 ? 1 : 2) * 1000 + (b.id < a.id ? 0 : 1);
      return pa - pb || (a.id < b.id ? -1 : 1);
    });
  const sent: string[] = [];
  const trapped: string[] = [];
  // V2 minds: those who chose to go to a shelter early take their place first; a neighbour's offered floor saves the trapped
  const minds = s.v2?.minds;
  if (minds) {
    for (const vid of Object.keys(minds.moves).sort()) {
      const v = s.villagers.find((x) => x.id === vid && x.status !== 'dead' && x.duty !== 'shelter');
      const sh = findLandmark(s, minds.moves[vid]);
      if (!v || !sh || (used.get(sh.id) ?? 0) >= sh.capacity || water[idx(s.world, sh.x, sh.y)] >= 2) continue;
      used.set(sh.id, (used.get(sh.id) ?? 0) + 1);
      placeVillager(v, sh, (used.get(sh.id) ?? 1) - 1);
      v.duty = 'evacuate';
      v.dutyNote = `Chose to go to ${sh.name} before the water came.`;
      sent.push(v.name);
    }
    minds.moves = {};
  }
  for (const v of order) {
    if (minds && v.duty === 'evacuate') continue;
    const home = homeLandmark(s, v);
    if (!home) continue;
    const depth = water[idx(s.world, home.x, home.y)];
    const burning = s.world.fire[idx(s.world, home.x, home.y)] >= 1;
    if (depth < 2 && !burning) continue;
    if (v.traits.stubbornness >= 85 && depth < 3 && !burning && v.keeperTrust < 45) {
      v.dutyNote = 'Refuses to leave their home. "I have seen worse."';
      continue;
    }
    const d = bfsDist(s.world, mask, v.x, v.y, 60);
    let best: Landmark | null = null;
    let bestD = 1e9;
    for (const l of s.world.landmarks) {
      if (l.kind !== 'shelter') continue;
      const dd = d[idx(s.world, l.x, l.y)];
      if (dd < 0) continue;
      if ((used.get(l.id) ?? 0) >= l.capacity) continue;
      if (water[idx(s.world, l.x, l.y)] >= 2) continue;
      if (dd < bestD || (dd === bestD && best && l.id < best.id)) {
        bestD = dd;
        best = l;
      }
    }
    if (best) {
      used.set(best.id, (used.get(best.id) ?? 0) + 1);
      const slot = (used.get(best.id) ?? 1) - 1;
      placeVillager(v, best, slot);
      v.duty = 'evacuate';
      v.dutyNote = `Evacuating to ${best.name}.`;
      sent.push(v.name);
    } else {
      const refuge = minds?.refuge[v.id] ? findLandmark(s, minds.refuge[v.id]) : undefined;
      if (refuge && refuge.hp > 0 && water[idx(s.world, refuge.x, refuge.y)] === 0) {
        placeVillager(v, refuge, 1);
        v.duty = 'shelter';
        v.dutyNote = `Taken in for the night at ${refuge.name}.`;
        sent.push(v.name);
        continue;
      }
      v.duty = 'trapped';
      v.dutyNote = 'No way out: the road is cut or the shelter is full.';
      trapped.push(v.name);
    }
  }
  if (minds) minds.refuge = {};
  if (sent.length)
    emit(ctx, { step: 'hazard', code: 'EVACUATION', importance: 2, text: `${sent.length} evacuate: ${sent.slice(0, 5).join(', ')}${sent.length > 5 ? '…' : ''}.` });
  if (trapped.length)
    emit(ctx, { step: 'hazard', code: 'TRAPPED', importance: 3, text: `${trapped.join(', ')} cannot reach safety tonight.` });
}

/** At dusk, believers walk to the bridge to keep watch (law active, or a vigil ritual today). */
export function assignWatchers(ctx: Ctx): void {
  const s = ctx.s;
  const br = s.world.landmarks.find((l) => l.kind === 'bridge' && l.hp > 0);
  if (!br) return;
  br.data.watchers = 0;
  // only the Keeper's own bridge stories send believers to the deck; a rival's ("crowds break bridges") never does
  // (a composed belief that *weakens* the bridge, or one powered by bells, sends nobody to watch it)
  const bridgeClaims = allClaimDefs(s).filter((c) => c.spec.subject === 'bridge' && c.spec.effect === 'strengthen' && c.spec.trigger.kind === 'watchers' && !c.rival);
  const claimIds = new Set(bridgeClaims.map((c) => c.id));
  if (!claimIds.size) return;
  const lawLive = s.laws.some((l) => claimIds.has(l.claimId) && (l.status === 'active' || l.status === 'wavering'));
  const vigil = (s.flags.vigilDay ?? -1) === s.day;
  if (!lawLive && !vigil) return;
  const mask = passableMask(s.world);
  const d = bfsDist(s.world, mask, br.x, br.y, 80);
  const cands: { v: Villager; c: number }[] = [];
  for (const v of s.villagers) {
    if (v.status === 'dead' || v.duty === 'evacuate' || v.duty === 'trapped' || v.duty === 'shelter') continue;
    if (d[idx(s.world, v.x, v.y)] < 0) continue;
    let best = 0;
    for (const id of claimIds) best = Math.max(best, v.beliefs[id]?.conv ?? 0);
    const keeperOfBridge = v.role.toLowerCase().includes('bridge');
    const willing = lawLive ? best >= 45 || (keeperOfBridge && best >= 20) : best >= 25 || keeperOfBridge || v.keeperTrust >= 60;
    if (willing) cands.push({ v, c: best + (keeperOfBridge ? 30 : 0) });
  }
  cands.sort((a, b) => b.c - a.c || (a.v.id < b.v.id ? -1 : 1));
  const cap = lawLive ? 4 : 3;
  // Each willing believer weighs the post against their own household (utility model): a parent whose child faces the water
  // stays home. The player sees who defected and why, and the watch they lose.
  const water = predictedWater(s);
  const defected: { v: Villager; why: string }[] = [];
  const staying: { v: Villager; c: number }[] = [];
  for (const c of cands) {
    const intents = scoreIntents(s, c.v, water);
    const top = intents[0];
    if (top.kind === 'family' || top.kind === 'safety') defected.push({ v: c.v, why: top.why });
    else staying.push(c);
  }
  const chosen = staying.slice(0, cap);
  for (const d of defected) {
    d.v.dutyNote = `Skips the bridge watch. ${d.why}.`;
    d.v.duty = 'rest';
  }
  if (defected.length) {
    const need = bridgeClaims[0]?.spec.trigger.min ?? 3;
    emit(ctx, {
      step: 'hazard', code: 'WATCHER_DEFECTS', importance: 2,
      text: `${defected.map((d) => `${d.v.name} stays home (${d.why.toLowerCase()})`).join('; ')}. ${chosen.length} keep${chosen.length === 1 ? 's' : ''} watch${lawLive ? `; “${bridgeClaimName(s)}” needs ${need}` : ''}.`,
    });
  }
  for (let i = 0; i < chosen.length; i++) {
    const v = chosen[i].v;
    const tile = br.tiles[i % br.tiles.length];
    v.x = tile[0];
    v.y = tile[1];
    v.place = br.id;
    v.duty = 'watch';
    v.dutyNote = 'Standing watch on the bridge tonight.';
  }
  br.data.watchers = chosen.length;
  if (chosen.length)
    emit(ctx, {
      step: 'hazard', code: 'WATCHERS', importance: 1,
      text: `${chosen.length} watch the bridge tonight: ${chosen.map((c) => c.v.name).join(', ')}.`,
    });
}

/** Night positions: everyone not evacuated, trapped or on watch is at home. */
export function moveToNight(ctx: Ctx): void {
  const s = ctx.s;
  for (const v of s.villagers) {
    if (v.status === 'dead') continue;
    if (v.duty === 'evacuate' || v.duty === 'shelter' || v.duty === 'watch') continue;
    const home = homeLandmark(s, v);
    if (home) {
      placeVillager(v, home, 0);
      if (v.duty === 'work') v.duty = 'rest';
    }
  }
}

export function villagerName(s: RunState, id: string): string {
  return findVillager(s, id)?.name ?? id;
}

export { claimDef, landmark };
