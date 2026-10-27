import { emit, type Ctx } from '../core/events.ts';
import { rand } from '../core/rng.ts';
import type { RunState } from '../core/types.ts';
import type { Modifiers } from '../laws/effects.ts';
import { ensureBelief, evidenceGain, round1 } from '../social/persuasion.ts';
import { remember } from '../core/memory.ts';
import { T, idx, inBounds, regionAt } from '../world/grid.ts';
import type { EntityIntents, RealityPlan } from './execute.ts';
import { COOP_CAP, MAX_CHICKENS, bankTiles } from './state.ts';

/**
 * The rules of the two kinds of thing Generative Reality adds, so that beliefs about them change a real simulation and not only a
 * picture. Deterministic: every random choice is the seeded hash rng.
 *
 * Chickens: by day they scratch about beside their coop; at night a flock on the ground drowns where floodwater stands a tile
 * deep and is taken by a hunting pack that comes within a tile. A lifted chicken is safe that night, but a strong lift on a windy
 * night drifts with the wind and may come down across the river: a stray, which walks home over the bridge if there is one. Each
 * coop's hens lay one egg-food for every five hens at home.
 *
 * Loose stones: wet after rain or beside water. A stone that weighs one load or less tonight is carried by any villager working
 * within four tiles to the nearest stretch of bank (at most two a night): the bank rises one tile there, for good. A stone that
 * light standing in floodwater floats off downstream and batters the bridge.
 */

const WIND_DIR = (s: RunState): 1 | -1 => (rand(s.seed, 'reality-wind', s.day) < 0.5 ? 1 : -1);

/** Dusk: light stones are hauled to the bank before the water comes. Called after the executor, before the hazards. */
export function realityDusk(ctx: Ctx, plan: RealityPlan, mods: Modifiers): void {
  const s = ctx.s;
  const v2 = s.v2!;
  const w = s.world;
  const banks = bankTiles(w);
  let hauled = 0;
  for (const st of v2.stones) {
    if (st.state !== 'loose' || hauled >= 2) continue;
    const mass = Math.max(0, st.base + (plan.intents.mass[st.id] ?? 0));
    if (mass > 1) continue;
    const worker = s.villagers.find((v) => v.status !== 'dead' && v.duty !== 'evacuate' && v.duty !== 'trapped' && Math.max(Math.abs(v.x - st.x), Math.abs(v.y - st.y)) <= 4);
    if (!worker) continue;
    const region = regionAt(w, st.x, st.y);
    let best = -1;
    let bd = Infinity;
    for (const i of banks) {
      if ((v2.bank[String(i)] ?? 0) >= 2) continue;
      const x = i % w.w;
      const y = Math.floor(i / w.w);
      if (region && regionAt(w, x, y) !== region) continue;
      const d = Math.abs(x - st.x) + Math.abs(y - st.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) continue;
    // one stone raises a short stretch of bank: the chosen tile and the two nearest bank tiles beside it (each at most 2 high)
    const bx = best % w.w;
    const by0 = Math.floor(best / w.w);
    const stretch = [best, ...banks.filter((i) => i !== best && (v2.bank[String(i)] ?? 0) < 2 && Math.max(Math.abs((i % w.w) - bx), Math.abs(Math.floor(i / w.w) - by0)) <= 1).sort((a, b) => Math.hypot((a % w.w) - bx, Math.floor(a / w.w) - by0) - Math.hypot((b % w.w) - bx, Math.floor(b / w.w) - by0) || a - b).slice(0, 2)];
    for (const i of stretch) {
      const key = String(i);
      v2.bank[key] = (v2.bank[key] ?? 0) + 1;
      mods.floodShield[i] = Math.max(mods.floodShield[i], v2.bank[key]);
    }
    st.state = 'placed';
    st.x = bx;
    st.y = by0;
    hauled++;
    const by = plan.intents.by[st.id];
    emit(ctx, { step: 'law', code: 'BANK_RAISED', importance: 2, actor: worker.id, ...(by ? { law: by.law, claim: by.claim } : {}), tile: [st.x, st.y], text: `${worker.name} carries a stone that weighs almost nothing tonight down to the bank: ${stretch.length} tiles of bank around (${st.x},${st.y}) now stand higher, for good.` });
    if (by) credit(ctx, by.law, by.claim, st.x, st.y, 'saw a stone made light enough to carry raise the bank');
  }
}

/** Night: chickens and stones meet tonight's water, wind and wolves. Called after V1's hazards. */
export function realityNight(ctx: Ctx, plan: RealityPlan): void {
  const s = ctx.s;
  const v2 = s.v2!;
  const w = s.world;
  const th = s.threat[Math.min(s.day, s.threat.length) - 1];
  const wind = th?.wind ?? 1;
  const dir = WIND_DIR(s);
  const it: EntityIntents = plan.intents;
  let lifted = 0;
  let saved = 0;
  let drowned = 0;
  let taken = 0;
  let strayed = 0;
  const savedBy = new Map<string, { law: string; claim: string; x: number; y: number; n: number }>();
  const huntsLeft = new Map<string, number>();
  const packs = s.scn.features.wolves ? w.packs.slice(0, Math.min(w.packs.length, th?.pack ?? 0)) : [];
  for (const c of v2.chickens) {
    if (!c.alive) continue;
    const lift = it.lift[c.id] ?? 0;
    c.alt = lift;
    const pushv = it.push[c.id];
    const step = (dx: number, dy: number, flying: boolean) => {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (!inBounds(w, nx, ny)) return false;
      const t = w.terrain[idx(w, nx, ny)];
      if (!flying && (t === T.RIVER || t === T.ROCK)) return false;
      c.x = nx;
      c.y = ny;
      return true;
    };
    if (pushv) {
      const n = Math.max(Math.abs(pushv[0]), Math.abs(pushv[1]));
      for (let k = 0; k < n; k++) if (!step(k < Math.abs(pushv[0]) ? Math.sign(pushv[0]) : 0, k < Math.abs(pushv[1]) ? Math.sign(pushv[1]) : 0, lift > 0)) break;
    }
    if (lift >= 2 && wind >= 2) for (let k = 0; k < wind - 1; k++) step(dir, 0, true);
    const coop = v2.coops.find((k) => k.id === c.coop);
    const wasStray = c.stray;
    c.stray = !!coop && regionAt(w, c.x, c.y) !== coop.region && w.terrain[idx(w, c.x, c.y)] !== T.RIVER;
    if (c.stray && !wasStray) strayed++;
    if (lift > 0) {
      lifted++;
      const deep = w.water[idx(w, c.x, c.y)] >= 1 || (coop ? w.water[idx(w, coop.x, coop.y)] >= 1 : false);
      if (deep) {
        saved++;
        const by = it.by[c.id];
        if (by) {
          const prev = savedBy.get(by.law);
          savedBy.set(by.law, { law: by.law, claim: by.claim, x: c.x, y: c.y, n: (prev?.n ?? 0) + 1 });
        }
      }
      continue;
    }
    if (w.water[idx(w, c.x, c.y)] >= 1) {
      c.alive = false;
      c.fate = 'drowned';
      drowned++;
      continue;
    }
    const pack = packs.find((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) <= 1 && (huntsLeft.get(p.id) ?? 2) > 0);
    if (pack) {
      huntsLeft.set(pack.id, (huntsLeft.get(pack.id) ?? 2) - 1);
      c.alive = false;
      c.fate = 'taken';
      taken++;
    }
  }
  if (lifted) emit(ctx, { step: 'hazard', code: 'CHICKENS_ROSE', importance: saved ? 3 : 2, text: `${lifted} chicken${lifted === 1 ? '' : 's'} rose into the night air${saved ? `; ${saved} rode out water that would have drowned them` : ''}${strayed ? `, and the wind carried ${strayed} across the river` : ''}.` });
  if (drowned) emit(ctx, { step: 'hazard', code: 'CHICKENS_DROWNED', importance: 2, text: `${drowned} chicken${drowned === 1 ? '' : 's'} drowned in the floodwater.` });
  if (taken) emit(ctx, { step: 'hazard', code: 'CHICKENS_TAKEN', importance: 2, text: `The wolves took ${taken} chicken${taken === 1 ? '' : 's'}.` });
  for (const v of savedBy.values()) credit(ctx, v.law, v.claim, v.x, v.y, `watched ${v.n} hen${v.n === 1 ? '' : 's'} fly clear of the flood`);

  // stones: wetness for tomorrow, and light stones in floodwater float off against the bridge
  const raining = (th?.rain ?? 0) > 0;
  const bridge = w.landmarks.find((l) => l.kind === 'bridge' && l.hp > 0);
  for (const st of v2.stones) {
    if (st.state !== 'loose') continue;
    const i = idx(w, st.x, st.y);
    const mass = Math.max(0, st.base + (it.mass[st.id] ?? 0));
    if (mass <= 1 && w.water[i] >= 1) {
      st.state = 'lost';
      if (bridge && bridge.hp > 0) {
        const before = bridge.hp;
        bridge.hp = Math.max(0, bridge.hp - 6);
        const by = it.by[st.id];
        emit(ctx, { step: 'hazard', code: 'STONE_RAMS_BRIDGE', importance: 2, ...(by ? { law: by.law, claim: by.claim } : {}), tile: [bridge.x, bridge.y], delta: { bridge: [before, bridge.hp] }, text: `A stone made light by belief floats off on the flood and slams into the ${bridge.name}: ${before} → ${bridge.hp}.` });
        if (bridge.hp <= 0) emit(ctx, { step: 'hazard', code: 'BRIDGE_COLLAPSED', importance: 3, text: `The ${bridge.name} gives way. The banks are cut off from each other.` });
      } else emit(ctx, { step: 'hazard', code: 'STONE_LOST', importance: 1, tile: [st.x, st.y], text: 'A stone made light by belief floats away on the flood.' });
      continue;
    }
    const nearWater = w.water[i] > 0 || [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => inBounds(w, st.x + dx, st.y + dy) && w.terrain[idx(w, st.x + dx, st.y + dy)] === T.RIVER);
    st.wet = raining || nearWater ? 2 : Math.max(0, st.wet - 1);
  }

  // brighter lanterns burn twice the fuel
  for (const id of it.extraFuel) {
    const l = w.landmarks.find((x) => x.id === id);
    if (!l || !l.lit) continue;
    l.fuelNights = Math.max(0, l.fuelNights - 1);
    if (l.fuelNights <= 0) {
      l.lit = false;
      emit(ctx, { step: 'hazard', code: 'BEACON_OUT', importance: 1, tile: [l.x, l.y], text: `${l.name} burned bright and burned out.` });
    }
  }
}

/** Dawn: feelings settle, chicks hatch, hens lay, strays walk home if they can, flocks scratch about. After V1's dawn needs. */
export function realityDawn(ctx: Ctx, plan: RealityPlan): void {
  const s = ctx.s;
  const v2 = s.v2!;
  const w = s.world;
  for (const [id, d] of Object.entries(plan.intents.fear).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const v = s.villagers.find((x) => x.id === id && x.status !== 'dead');
    if (v) v.fear = Math.max(0, Math.min(100, v.fear + d));
  }
  for (const [coopId, n] of Object.entries(plan.intents.hatch).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const coop = v2.coops.find((k) => k.id === coopId);
    if (!coop) continue;
    let hatched = 0;
    for (let k = 0; k < n; k++) {
      const flock = v2.chickens.filter((c) => c.alive && c.coop === coop.id).length;
      const total = v2.chickens.filter((c) => c.alive).length;
      if (flock >= COOP_CAP || total >= MAX_CHICKENS || (w.stocks.food ?? 0) < 1) break;
      w.stocks.food = (w.stocks.food ?? 0) - 1;
      v2.chickens.push({ id: `hen${v2.nextId++}`, coop: coop.id, x: coop.x, y: coop.y, alive: true, stray: false, alt: 0, fate: null });
      hatched++;
    }
    if (hatched) emit(ctx, { step: 'dawn', code: 'CHICKS_HATCHED', importance: 1, tile: [coop.x, coop.y], text: `${hatched} chick${hatched === 1 ? '' : 's'} hatched at ${coopId} (${hatched} food spent).` });
  }
  for (const [fid, n] of Object.entries(plan.intents.yield).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const f = w.landmarks.find((l) => l.id === fid && l.kind === 'field' && !l.data.ruined);
    if (!f || n <= 0) continue;
    w.stocks.food = (w.stocks.food ?? 0) + n;
    const by = plan.intents.by[fid];
    emit(ctx, { step: 'dawn', code: 'FIELD_TENDED', importance: 1, tile: [f.x, f.y], ...(by ? { law: by.law, claim: by.claim } : {}), text: `Tireless hands bring in ${n} more food from ${f.name}.` });
  }
  const bridgeUp = w.landmarks.some((l) => l.kind === 'bridge' && l.hp > 0);
  let home = 0;
  for (const c of v2.chickens) {
    c.alt = 0;
    if (!c.alive) continue;
    const coop = v2.coops.find((k) => k.id === c.coop);
    if (!coop) continue;
    if (c.stray && bridgeUp) {
      c.stray = false;
      home++;
    }
    if (c.stray) continue;
    const r = rand(s.seed, 'reality-scratch', s.day, c.id);
    const [dx, dy] = r < 0.25 ? [1, 0] : r < 0.5 ? [-1, 0] : r < 0.75 ? [0, 1] : [0, -1];
    const nx = coop.x + dx;
    const ny = coop.y + dy;
    const ok = inBounds(w, nx, ny) && w.terrain[idx(w, nx, ny)] !== T.RIVER && w.terrain[idx(w, nx, ny)] !== T.ROCK;
    c.x = ok ? nx : coop.x;
    c.y = ok ? ny : coop.y;
  }
  if (home) emit(ctx, { step: 'dawn', code: 'STRAYS_HOME', importance: 1, text: `${home} stray chicken${home === 1 ? '' : 's'} walked home over the bridge.` });
  let eggs = 0;
  for (const coop of v2.coops) eggs += Math.floor(v2.chickens.filter((c) => c.alive && !c.stray && c.coop === coop.id).length / 5);
  if (eggs) {
    w.stocks.food = (w.stocks.food ?? 0) + eggs;
    v2.eggs += eggs;
    emit(ctx, { step: 'dawn', code: 'EGGS_LAID', importance: 0, text: `The hens laid: +${eggs} food.` });
  }
}

/**
 * Seeing a belief work is evidence: villagers in the law's electorate within ten tiles who already lean toward it gain a little
 * conviction and remember why (the same bounded rule as V1's witnessed laws). Belief changes only through this, never directly.
 */
function credit(ctx: Ctx, lawId: string, claimId: string, x: number, y: number, why: string): void {
  const s = ctx.s;
  const law = s.laws.find((l) => l.id === lawId);
  if (!law) return;
  const def = s.claims.find((c) => c.id === claimId)?.def;
  if (!def) return;
  const districts = new Set(def.electorate?.[law.regionId] ?? [law.regionId]);
  for (const v of s.villagers) {
    if (v.status === 'dead' || (!districts.has(v.district) && law.regionId !== 'river')) continue;
    if (Math.hypot(v.x - x, v.y - y) > 10) continue;
    const b = ensureBelief(v, claimId);
    if (b.conv < 20) continue;
    const gain = Math.min(6, evidenceGain(v, b, 6));
    b.conv = round1(b.conv + gain);
    b.evidence = Math.min(60, b.evidence + 10);
    b.lastDay = s.day;
    remember(v, { kind: 'law_worked', day: s.day, claim: claimId, text: `${why} (“${def.short}”)` });
  }
}
