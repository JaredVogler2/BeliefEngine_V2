import { emit, type Ctx } from '../core/events.ts';
import { claimDef, findLandmark } from '../core/lookup.ts';
import type { Landmark, RunState, Villager } from '../core/types.ts';
import type { Modifiers } from '../laws/effects.ts';
import { ensureBelief, evidenceGain, round1 } from '../social/persuasion.ts';
import { remember } from '../core/memory.ts';
import { computeWater } from './flood.ts';
import { runCrops } from './crops.ts';
import { runSickness } from './sickness.ts';
import { runWolves } from './wolves.ts';
import { landmarkAtTile, runFire } from './fire.ts';
import { T, idx } from './grid.ts';
import { poolSinks } from '../reality/project.ts';

function lawsFor(s: RunState, subjects: string[]): string[] {
  const out: string[] = [];
  for (const l of s.laws) {
    if (l.status !== 'active' && l.status !== 'wavering') continue;
    if (subjects.includes(claimDef(s, l.claimId).spec.subject)) out.push(l.id);
  }
  return out;
}

function lawSummary(s: RunState, lawId: string, mods: Modifiers): string {
  const law = s.laws.find((l) => l.id === lawId)!;
  const def = claimDef(s, law.claimId);
  const src = mods.sourcesByLaw[lawId] ?? 0;
  const srcTxt = def.spec.trigger.kind === 'lit_beacon' ? `${src} lit beacon${src === 1 ? '' : 's'}` : def.spec.trigger.kind === 'watchers' ? 'watchers on the deck' : def.spec.trigger.kind === 'bell' ? 'the bells ringing' : `${src} source${src === 1 ? '' : 's'}`;
  return `“${def.short}” was active (${Math.round(law.pressure * 100)}% support, ${srcTxt})`;
}

function homeDamage(depth: number): number {
  if (depth >= 3) return 100;
  if (depth === 2) return 45;
  if (depth === 1) return 20;
  return 0;
}

/** Everything that happens overnight: floodwater, bridge strain, fire, damage and casualties. */
export function runNight(ctx: Ctx, mods: Modifiers): void {
  const s = ctx.s;
  const w = s.world;
  const day = s.day;
  const th = s.threat[Math.min(day, s.threat.length) - 1];
  const L0 = th?.level ?? 0;
  const L = Math.max(0, L0 + mods.levelDelta);
  w.level = L;
  const floodActive = !!s.scn.features.flood && L0 > 0;

  let water = w.water.map(() => 0);
  let cfWater = water;
  if (floodActive) {
    water = computeWater(w, L, mods.floodShield);
    cfWater = computeWater(w, L0, null);
    if (mods.sinkPool && mods.sinkPool.amount > 0) {
      const { region, amount } = mods.sinkPool;
      let minE = 99;
      for (let i = 0; i < w.region.length; i++) if (w.regions[w.region[i]]?.id === region && w.terrain[i] !== T.RIVER) minE = Math.min(minE, w.elev[i]);
      let pooled = 0;
      for (let i = 0; i < w.region.length; i++) {
        if (w.regions[w.region[i]]?.id !== region || w.terrain[i] === T.RIVER) continue;
        if (w.elev[i] <= minE + 1) {
          water[i] += amount;
          pooled++;
        }
      }
      if (pooled)
        emit(ctx, {
          step: 'hazard', code: 'RAIN_DISPLACED', importance: 2,
          text: `The rain the bells turned away pools on the low ground of ${w.regions.find((r) => r.id === region)?.name ?? region}: ${pooled} tiles take ${amount} extra depth.`,
        });
    }
    // Generative Reality moves water by volume: each step is six tile-depths, laid one deep on the region's lowest dry ground
    for (const pool of poolSinks(w, water, mods.sinks ?? []))
      if (pool.tiles.length)
        emit(ctx, {
          step: 'hazard', code: 'WATER_POOLED', importance: 2,
          ...(pool.laws[0] ? { law: pool.laws[0], claim: s.laws.find((l) => l.id === pool.laws[0])?.claimId } : {}),
          text: `Water moved by belief pools on the low ground of ${w.regions.find((r) => r.id === pool.region)?.name ?? pool.region}: ${pool.tiles.length} tiles stand a tile deep.`,
        });
  }
  w.water = water;

  const floodLaws = lawsFor(s, ['river', 'rain', 'stone']);
  const credit = floodLaws.length ? lawSummary(s, floodLaws[0], mods) : '';

  // ---- bridge
  const bridge = w.landmarks.find((l) => l.kind === 'bridge' && l.hp > 0);
  if (bridge && floodActive && s.scn.features.bridge) {
    const raw = Math.max(0, L - 1 - (mods.bridgeFlow ?? 0)) * (s.scn.consts.dmgBridge ?? 11);
    const watched = (bridge.data.watchers ?? 0) > 0 ? mods.bridgeShield : 0;
    const dmg = mods.bridgeHardness === undefined ? Math.round(raw * (1 - watched)) : Math.round(raw * (1 - watched) * (1 - mods.bridgeHardness));
    const saved = raw - dmg;
    const before = bridge.hp;
    bridge.hp = Math.max(0, bridge.hp - dmg);
    if (bridge.hp <= 0) {
      emit(ctx, { step: 'hazard', code: 'BRIDGE_COLLAPSED', importance: 3, delta: { bridge: [before, 0] }, text: `The ${bridge.name} gives way. The banks are cut off from each other.` });
    } else if (dmg > 0) {
      emit(ctx, { step: 'hazard', code: 'BRIDGE_DAMAGED', importance: bridge.hp < 40 ? 2 : 1, delta: { bridge: [before, bridge.hp] }, text: `The flood batters the bridge: ${before} → ${bridge.hp} integrity.` });
    }
    // credit and blame go to the Keeper's own bridge law, never to a rival rumour that happens to be about the bridge
    const keeperBridgeLaws = lawsFor(s, ['bridge']).filter((id) => !claimDef(s, s.laws.find((q) => q.id === id)!.claimId).rival);
    const bridgeLaw = keeperBridgeLaws[0];
    if (bridgeLaw && dmg >= 12 && (bridge.data.watchers ?? 0) < (claimDef(s, s.laws.find((q) => q.id === bridgeLaw)!.claimId).spec.trigger.min ?? 3)) {
      discredit(ctx, bridgeLaw, null, 8, `the bridge took ${dmg} damage with only ${bridge.data.watchers ?? 0} on watch.`);
    }
    if (saved >= 8 && watched > 0) {
      const bl = bridgeLaw;
      emit(ctx, {
        step: 'hazard', code: 'BRIDGE_HELD', importance: 3, law: bl,
        text: `The bridge holds. ${bl ? lawSummary(s, bl, mods) : 'Watchers stood the deck'} and took ${saved} damage out of the flood's ${raw}.`,
      });
      witnessLaw(ctx, bl, 'bridge');
    }
  }

  // ---- rain pushed off by a law lands on roads: mudslide blocks caravans
  if (!floodActive && mods.sinkPool && mods.sinkPool.amount > 0) {
    const sunk = w.landmarks.filter((l) => l.kind === 'road' && l.district === mods.sinkPool!.region);
    for (const r of sunk) {
      r.data.blockedUntil = day + 2;
      emit(ctx, { step: 'hazard', code: 'MUDSLIDE', importance: 3, tile: [r.x, r.y], text: `The rain the bells turned away slides down the hillside: ${r.name} is buried in mud for two days.` });
    }
  }

  // ---- fire
  if (s.scn.features.fire) runFire(ctx, mods);
  if (s.scn.features.crops) runCrops(ctx, mods);
  if (s.scn.features.wolves) runWolves(ctx, mods);
  if (s.scn.features.smoke) runSickness(ctx, mods);

  // ---- homes
  let spared = 0;
  const failedHomes: Landmark[] = [];
  for (const l of w.landmarks) {
    if (l.kind !== 'home' && l.kind !== 'cabin') continue;
    if (l.hp <= 0) continue;
    const i = idx(w, l.x, l.y);
    const d = water[i];
    const d0 = cfWater[i];
    let dmg = homeDamage(d);
    if (mods.homeShield?.[l.id] !== undefined) dmg = Math.round(dmg * (1 - mods.homeShield[l.id]));
    if (w.fire[i] >= 1) dmg += mods.homeFireCut?.[l.id] === undefined ? Math.round(40 * (1 - (mods.fireDamageCut[l.district] ?? 0))) : Math.round(40 * (1 - (mods.fireDamageCut[l.district] ?? 0)) * (1 - mods.homeFireCut[l.id]));
    for (const ss of mods.stoneStress) if (Math.abs(ss.x - l.x) + Math.abs(ss.y - l.y) <= ss.r) dmg += ss.amount;
    if (dmg <= 0) {
      if (d0 >= 1 && floodLaws.length) {
        spared++;
        s.stats.homesSpared++;
        emit(ctx, {
          step: 'hazard', code: 'HOME_SPARED', importance: 2, law: floodLaws[0], tile: [l.x, l.y],
          text: `${l.name} stayed dry: the flood would have reached ${d0} deep, but ${credit}.`,
        });
      }
      continue;
    }
    if (d >= 2 && floodLaws.length && (mods.sourcesByLaw[floodLaws[0]] ?? 0) > 0) failedHomes.push(l);
    const before = l.hp;
    l.hp = Math.max(0, l.hp - dmg);
    const cause = w.fire[i] >= 1 ? 'fire' : 'floodwater';
    if (l.hp <= 0) {
      emit(ctx, { step: 'hazard', code: 'HOME_DESTROYED', importance: 2, tile: [l.x, l.y], reason: cause.toUpperCase(), delta: { home: [before, 0] }, text: `${l.name} is destroyed by ${cause}${d > 0 ? ` (${d} deep)` : ''}.` });
    } else {
      emit(ctx, { step: 'hazard', code: 'HOME_DAMAGED', importance: 1, tile: [l.x, l.y], reason: cause.toUpperCase(), delta: { home: [before, l.hp] }, text: `${l.name} is damaged by ${cause}: ${before} → ${l.hp}.` });
      if (d0 > d && floodLaws.length) {
        s.stats.homesSpared++;
        spared++;
        emit(ctx, { step: 'hazard', code: 'HOME_SPARED', importance: 2, law: floodLaws[0], tile: [l.x, l.y], text: `${l.name} took ${d} of the ${d0} deep flood it would have faced: ${credit}.` });
      }
    }
  }
  if (spared) witnessLaw(ctx, floodLaws[0], 'flood');
  // a law that was powered tonight and still let the water into homes is seen to fail: those who watched trust it less
  if (failedHomes.length) {
    const cx = Math.round(failedHomes.reduce((a, l) => a + l.x, 0) / failedHomes.length);
    const cy = Math.round(failedHomes.reduce((a, l) => a + l.y, 0) / failedHomes.length);
    discredit(ctx, floodLaws[0], { x: cx, y: cy }, 6 + Math.min(6, 2 * (failedHomes.length - 1)), `${failedHomes.length} home${failedHomes.length === 1 ? '' : 's'} flooded despite it.`);
  }

  // ---- fields
  for (const l of w.landmarks) {
    if (l.kind !== 'field' || l.data.ruined) continue;
    const flooded = l.tiles.filter(([x, y]) => water[idx(w, x, y)] > 0).length >= Math.ceil(l.tiles.length * 0.4);
    const wouldFlood = l.tiles.some(([x, y]) => cfWater[idx(w, x, y)] > 0);
    const burning = l.tiles.some(([x, y]) => w.fire[idx(w, x, y)] > 0 || w.burned[idx(w, x, y)] > 0);
    if (burning) {
      l.data.ruined = 1;
      l.data.burned = 1;
      l.data.growth = 0;
      s.stats.fieldsBurned++;
      emit(ctx, { step: 'hazard', code: 'FIELD_BURNED', importance: 3, tile: [l.x, l.y], text: `${l.name} burns. The harvest there is lost.` });
    } else if (flooded) {
      l.data.ruined = 1;
      l.data.growth = 0;
      emit(ctx, { step: 'hazard', code: 'FIELD_FLOODED', importance: 2, tile: [l.x, l.y], text: `${l.name} is under water. The crop is lost.` });
    } else if (wouldFlood && floodLaws.length) {
      emit(ctx, { step: 'hazard', code: 'FIELD_SPARED', importance: 1, law: floodLaws[0], tile: [l.x, l.y], text: `${l.name} stayed dry: ${credit}.` });
    }
  }

  // ---- people
  for (const v of s.villagers) {
    if (v.status === 'dead') continue;
    const i = idx(w, v.x, v.y);
    let depth = water[i];
    if (v.place === 'br') depth = Math.max(0, L - (s.scn.consts.deckLevel ?? 6));
    const cf = cfWater[i];
    const fireHere = w.fire[i] >= 1 && !(mods.fireproof?.includes(v.id) ?? false);
    if (depth >= (s.scn.consts.waterDeath ?? 2)) {
      kill(ctx, v, 'drowned', `${v.name} drowned. The water stood ${depth} deep at ${placeName(s, v)}. ${v.duty === 'trapped' ? 'There was no way out.' : ''}`.trim());
    } else if (fireHere && w.fire[i] >= 2 && v.health <= 30) {
      kill(ctx, v, 'fire', `${v.name}, already hurt, was caught by the fire at ${placeName(s, v)}.`);
    } else {
      if (depth === 1 || fireHere) {
        v.health = Math.max(5, v.health - (fireHere ? 15 : 25));
        if (v.health < 70) v.status = 'injured';
      }
      if (cf >= 2 && depth < 2 && floodLaws.length) {
        s.stats.livesSaved += 1;
        emit(ctx, { step: 'hazard', code: 'LIFE_SPARED', importance: 3, target: v.id, law: floodLaws[0], text: `${v.name} would have drowned tonight; instead ${credit}.` });
      }
    }
  }

  // ---- upkeep: beacons burn down, bells go quiet, watchers go home
  for (const l of w.landmarks) {
    if ((l.kind === 'beacon' || l.kind === 'campfire') && l.lit) {
      l.fuelNights -= 1;
      if (l.fuelNights <= 0) {
        l.lit = false;
        l.fuelNights = 0;
        emit(ctx, { step: 'hazard', code: 'BEACON_OUT', importance: 1, tile: [l.x, l.y], text: `${l.name} burns out.` });
      }
    }
    if (l.kind === 'belltower') l.data.ringing = 0;
  }
}

function placeName(s: RunState, v: Villager): string {
  return findLandmark(s, v.place)?.name ?? 'their post';
}

function kill(ctx: Ctx, v: Villager, cause: string, text: string): void {
  const s = ctx.s;
  v.status = 'dead';
  v.health = 0;
  v.deathDay = s.day;
  v.deathCause = cause;
  emit(ctx, { step: 'hazard', code: 'DEATH', importance: 3, target: v.id, reason: cause.toUpperCase(), text });
}

/** Villagers in the law's electorate who see it work gain a little firsthand evidence (saturating). */
function witnessLaw(ctx: Ctx, lawId: string | undefined, _kind: string): void {
  if (!lawId) return;
  const s = ctx.s;
  const law = s.laws.find((l) => l.id === lawId);
  if (!law) return;
  const def = claimDef(s, law.claimId);
  const districts = new Set(def.electorate?.[law.regionId] ?? [law.regionId]);
  for (const v of s.villagers) {
    if (v.status === 'dead' || !districts.has(v.district)) continue;
    const b = ensureBelief(v, law.claimId);
    if (b.conv < 20) continue;
    const gain = Math.min(6, evidenceGain(v, b, 6));
    b.conv = round1(b.conv + gain);
    b.evidence = Math.min(60, b.evidence + 10);
    b.lastDay = s.day;
    remember(v, { kind: 'law_worked', day: s.day, claim: law.claimId, text: `watched “${def.short}” hold` });
  }
}

/**
 * Credibility damage: people in the law's electorate who could see it fail lose some conviction (less if they are stubborn or have
 * seen it work before), and remember. Bounded per night and per person, so one bad night is a setback, not a spiral.
 */
function discredit(ctx: Ctx, lawId: string | undefined, at: { x: number; y: number } | null, amount: number, why: string): void {
  if (!lawId) return;
  const s = ctx.s;
  const law = s.laws.find((l) => l.id === lawId);
  if (!law) return;
  const def = claimDef(s, law.claimId);
  const districts = new Set(def.electorate?.[law.regionId] ?? [law.regionId]);
  let n = 0;
  for (const v of s.villagers) {
    if (v.status === 'dead' || !districts.has(v.district)) continue;
    const b = v.beliefs[law.claimId];
    if (!b || b.conv < 15) continue;
    if (at && Math.hypot(v.x - at.x, v.y - at.y) > 10) continue;
    const drop = Math.min(b.conv - 5, amount * (1 - v.traits.stubbornness / 200) * (1 - b.evidence / 200));
    if (drop <= 0) continue;
    b.conv = round1(b.conv - drop);
    b.lastDay = s.day;
    remember(v, { kind: 'law_failed', day: s.day, claim: law.claimId, text: `saw “${def.short}” fail: ${why.replace(/\.$/, '')}` });
    n++;
  }
  if (n)
    emit(ctx, {
      step: 'hazard', code: 'LAW_DISCREDITED', importance: 2, law: lawId, claim: law.claimId,
      text: `“${def.short}” failed where people could see: ${why} ${n} lose faith in it.`,
    });
}

export { landmarkAtTile };
export type { Landmark };
