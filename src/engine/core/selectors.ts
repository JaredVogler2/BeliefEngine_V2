import { getModifier } from '../gen/modifiers.ts';
import { BAN_LEADER_CONVICTION, pendingFactionPlans } from '../ai/factions.ts';
import { scoreIntents } from '../ai/utility.ts';
import { commitEvacuations, moveToNight, predictedWater } from '../ai/routines.ts';
import { ARCHETYPES } from '../content/types.ts';
import { computePressure } from '../laws/resolver.ts';
import { SIDE_EFFECT_INFO } from '../laws/rules.ts';
import { K, REASON_TEXT } from '../social/persuasion.ts';
import { dailyConsumption, homesStanding, projectedProduction } from '../world/economy.ts';
import { fieldSummary, projectedGrowth } from '../world/crops.ts';
import { activePacks, packForecast } from '../world/wolves.ts';
import { idx } from '../world/grid.ts';
import { cloneState } from './clone.ts';
import type { Ctx } from './events.ts';
import { claimDef, faction, findLandmark, findVillager, neighborsOf, allClaimDefs } from './lookup.ts';
import { keeperCanReach, omenFor } from './actions.ts';
import { objectiveStatuses, type ObjectiveStatus } from './objectives.ts';
import type { ClaimDef, LawState, RunState, ScenarioRuntime, Villager } from './types.ts';

export function beliefLabel(conv: number): string {
  if (conv <= -40) return 'rejects';
  if (conv <= -K.SPREAD) return 'doubts';
  // 'curious' is exactly the point at which they start repeating it to friends
  if (conv < K.SPREAD) return 'unconvinced';
  if (conv < 30) return 'curious';
  if (conv < 50) return 'leaning';
  if (conv < 75) return 'believes';
  return 'firmly believes';
}

export function traitLabel(v: number): string {
  return v >= 80 ? 'very high' : v >= 60 ? 'high' : v >= 40 ? 'moderate' : v >= 20 ? 'low' : 'very low';
}

export interface BeliefView {
  claimId: string;
  short: string;
  /** exact only when scouted or just spoken to; otherwise null */
  conv: number | null;
  label: string;
  evidence: number | null;
  heard: number;
  why: string | null;
  /** the logged event `why` describes (a "Why?" link opens it), or null */
  whyEvent: number | null;
}

export interface VillagerView {
  id: string;
  name: string;
  role: string;
  archetype: { id: string; label: string; blurb: string };
  faction: { id: string; name: string; color: string };
  want: string;
  status: Villager['status'];
  duty: Villager['duty'];
  dutyNote: string;
  place: string;
  district: string;
  traits: { key: string; label: string; value: number; text: string }[];
  needs: { health: number; fear: number; energy: number; hunger: number };
  keeperTrust: number;
  scouted: boolean;
  beliefs: BeliefView[];
  trusts: { id: string; name: string; trust: number; kind: string; rate: number; reachable: boolean }[];
  influenceRank: number;
  reach2: number;
  canBeReached: boolean;
  needsToChangeMind: string;
  deathCause: string | null;
}

function influenceScore(s: RunState, v: Villager): number {
  const ties = neighborsOf(s, v.id).reduce((a, n) => a + Math.max(0, n.back) * n.edge.rate, 0);
  return v.traits.influence * 1.0 + ties * 0.35;
}

export function influenceRanks(s: RunState): Map<string, number> {
  const ranked = s.villagers.filter((v) => v.status !== 'dead').map((v) => ({ id: v.id, sc: influenceScore(s, v) })).sort((a, b) => b.sc - a.sc || (a.id < b.id ? -1 : 1));
  return new Map(ranked.map((r, i) => [r.id, i + 1]));
}

function whyLast(s: RunState, v: Villager, claimId: string): { text: string; event: number } | null {
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i];
    if (e.target === v.id && e.claim === claimId && e.reason && (e.code === 'BELIEF_SHIFT' || e.code === 'BELIEVER_GAINED' || e.code === 'BELIEVER_LOST' || e.code === 'RUMOR_SEEDED' || e.code === 'MESSENGER_SENT' || e.code === 'RUMOR_CHALLENGED')) {
      const src = e.actor ? findVillager(s, e.actor)?.name : undefined;
      return { text: `${REASON_TEXT[e.reason] ?? e.reason}${src ? ` (${src})` : ''}, day ${e.day}`, event: e.id };
    }
    if (e.code === 'EVIDENCE_STAGED' && e.claim === claimId && (v.beliefs[claimId]?.cause === e.id)) return { text: `they watched your demonstration, day ${e.day}`, event: e.id };
  }
  return null;
}

export function needsToChangeMind(v: Villager): string {
  const t = v.traits;
  if (t.skepticism >= 70) return 'Hearsay barely moves them. They need to witness a convincing demonstration themselves.';
  if (v.keeperTrust < 25) return 'They do not trust you yet. Reach them through someone they trust.';
  if (t.stubbornness >= 80) return 'Slow to change. Repetition from someone they trust, and time.';
  if (t.susceptibility >= 70) return 'Easily swayed, especially by family and fear.';
  if (t.influence >= 75) return 'Others follow their lead. Winning them wins their circle.';
  return 'Persuadable by friends they trust, and by what they see.';
}

export function getVillagerView(s: RunState, id: string): VillagerView {
  const v = findVillager(s, id);
  if (!v) throw new Error(`Unknown villager ${id}`);
  const scouted = v.scoutedUntil >= s.day || (s.flags[`spoke:${v.id}`] ?? -1) === s.day;
  const arch = ARCHETYPES[v.archetype] ?? { label: v.archetype, blurb: '', traits: v.traits };
  const f = faction(s, v.faction);
  const beliefs: BeliefView[] = [];
  for (const def of allClaimDefs(s)) {
    const b = v.beliefs[def.id];
    if (!b && !(s.claims.find((c) => c.id === def.id)?.introduced)) continue;
    if (!b) continue;
    const why = whyLast(s, v, def.id);
    beliefs.push({
      claimId: def.id,
      short: def.short,
      conv: scouted ? Math.round(b.conv) : null,
      label: beliefLabel(b.conv),
      evidence: scouted ? Math.round(b.evidence) : null,
      heard: b.heard,
      why: why?.text ?? null,
      whyEvent: why?.event ?? null,
    });
  }
  beliefs.sort((a, b) => Math.abs(b.conv ?? 0) - Math.abs(a.conv ?? 0));
  const trusts = neighborsOf(s, v.id)
    .map((n) => {
      const o = findVillager(s, n.id)!;
      return { id: n.id, name: o.name, trust: Math.round(n.trust), kind: n.edge.kind, rate: n.edge.rate, reachable: o.status !== 'dead' };
    })
    .sort((a, b) => Math.abs(b.trust) - Math.abs(a.trust));
  const ranks = influenceRanks(s);
  const two = new Set<string>();
  for (const n of neighborsOf(s, v.id)) {
    two.add(n.id);
    for (const m of neighborsOf(s, n.id)) if (m.id !== v.id) two.add(m.id);
  }
  const trait = (key: string, label: string, value: number, text: string) => ({ key, label, value, text: `${label}: ${traitLabel(value)}${text ? ` — ${text}` : ''}` });
  return {
    id: v.id,
    name: v.name,
    role: v.role,
    archetype: { id: v.archetype, label: arch.label, blurb: arch.blurb },
    faction: { id: f.id, name: f.name, color: f.color },
    want: v.want,
    status: v.status,
    duty: v.duty,
    dutyNote: v.dutyNote,
    place: findLandmark(s, v.place)?.name ?? '',
    district: s.world.regions.find((r) => r.id === v.district)?.name ?? v.district,
    traits: [
      trait('skepticism', 'Skepticism', v.traits.skepticism, v.traits.skepticism >= 70 ? 'needs proof' : ''),
      trait('influence', 'Influence', v.traits.influence, ''),
      trait('stubbornness', 'Stubbornness', v.traits.stubbornness, ''),
      trait('susceptibility', 'Susceptibility', v.traits.susceptibility, ''),
      trait('openness', 'Openness', v.traits.openness, ''),
    ],
    needs: { health: Math.round(v.health), fear: Math.round(v.fear), energy: Math.round(v.energy), hunger: Math.round(v.hunger) },
    keeperTrust: Math.round(v.keeperTrust),
    scouted,
    beliefs,
    trusts,
    influenceRank: ranks.get(v.id) ?? 0,
    reach2: two.size,
    canBeReached: v.status !== 'dead' && keeperCanReach(s, v.x, v.y),
    needsToChangeMind: needsToChangeMind(v),
    deathCause: v.deathCause,
  };
}

// ------------------------------------------------------------------ laws

export const LAW_STATUS_LABEL: Record<LawState['status'], string> = {
  dormant: 'Dormant',
  awakening: 'Awakening',
  active: 'Active',
  wavering: 'Wavering',
  suppressed: 'Suppressed',
};

export function effectText(def: ClaimDef): string {
  return def.benefit;
}

export interface LawView {
  id: string;
  claimId: string;
  claimText: string;
  short: string;
  icon: string;
  regionId: string;
  regionName: string;
  status: LawState['status'];
  statusLabel: string;
  progress: number;
  pressure: number;
  on: number;
  off: number;
  supporters: { id: string; name: string }[];
  opponents: { id: string; name: string }[];
  minSupporters: number;
  topShare: number;
  note: string;
  benefit: string;
  risk: string;
  sideEffects: string[];
  trigger: string;
  strength: number;
  poweredBy: number;
  threats: string[];
  nextSteps: { id: string; name: string; why: string }[];
  rival: boolean;
}

function triggerText(def: ClaimDef): string {
  switch (def.spec.trigger.kind) {
    case 'lit_beacon':
      return 'Needs lit beacons nearby';
    case 'bell':
      return 'Needs the bells rung that night';
    case 'watchers':
      return `Needs ${def.spec.trigger.min ?? 1}+ watchers on the bridge`;
    case 'smoke_fire':
      return 'Needs burning smoke fires';
    case 'night':
      return 'Works by night';
    default:
      return 'Always in effect';
  }
}

export function getLawViews(s: RunState): LawView[] {
  const out: LawView[] = [];
  for (const law of s.laws) {
    const def = claimDef(s, law.claimId);
    const claimState = s.claims.find((c) => c.id === law.claimId);
    if (!claimState) continue;
    if (def.rival && !claimState.available && law.progress === 0 && law.pressure === 0) continue;
    const th = def.spec.thresholds;
    const info = computePressure(s, law.claimId, law.regionId);
    const threats: string[] = [];
    for (const rv of s.rivals) {
      if (rv.claim !== law.claimId && s.scn.rivals.some((d) => d.watches === law.claimId && d.claim === rv.claim)) {
        const rdef = claimDef(s, rv.claim);
        const rp = s.laws.find((l) => l.claimId === rv.claim && l.regionId === law.regionId);
        if (rv.plan) threats.push(`${s.villagers.find((v) => v.id === s.scn.rivals.find((d) => d.claim === rv.claim)?.leader)?.name ?? 'A rival'} will move against it on day ${rv.plan.day}.`);
        if (rp && rp.pressure > 0.1) threats.push(`“${rdef.short}” has ${Math.round(rp.pressure * 100)}% support here.`);
      }
    }
    if (law.status === 'active' && info.pressure < th.on) threats.push('Support is below the activation line; it could start to fade.');
    const districts = new Set(def.electorate?.[law.regionId] ?? [law.regionId]);
    const steps = s.villagers
      .filter((v) => v.status !== 'dead' && districts.has(v.district) && (v.beliefs[law.claimId]?.conv ?? 0) < 50)
      .map((v) => ({ v, score: v.traits.influence + (v.keeperTrust * 0.3) - (v.traits.skepticism * 0.2) }))
      .sort((a, b) => b.score - a.score || (a.v.id < b.v.id ? -1 : 1))
      .slice(0, 3)
      .map(({ v }) => ({
        id: v.id,
        name: v.name,
        why: v.traits.skepticism >= 70 ? 'a skeptic: needs to witness proof' : v.traits.influence >= 65 ? 'others follow them' : v.keeperTrust >= 55 ? 'trusts you' : 'reachable through friends',
      }));
    out.push({
      id: law.id,
      claimId: law.claimId,
      claimText: def.text,
      short: def.short,
      icon: def.icon,
      regionId: law.regionId,
      regionName: s.world.regions.find((r) => r.id === law.regionId)?.name ?? law.regionId,
      status: law.status,
      statusLabel: LAW_STATUS_LABEL[law.status],
      progress: Math.round(law.progress),
      pressure: Math.round(info.pressure * 100) / 100,
      on: th.on,
      off: th.off,
      supporters: info.supporters.map((id) => ({ id, name: findVillager(s, id)?.name ?? id })),
      opponents: info.opponents.map((id) => ({ id, name: findVillager(s, id)?.name ?? id })),
      minSupporters: th.minSupporters,
      topShare: Math.round(info.topShare * 100) / 100,
      note: law.note,
      benefit: def.benefit,
      risk: def.risk,
      sideEffects: def.spec.side.map((x) => `${SIDE_EFFECT_INFO[x].label}: ${SIDE_EFFECT_INFO[x].text}`),
      trigger: triggerText(def),
      strength: law.strength,
      poweredBy: 0,
      threats,
      nextSteps: law.status === 'active' ? [] : steps,
      rival: !!def.rival,
    });
  }
  return out;
}

// ------------------------------------------------------------------ hand

export interface ClaimCard {
  id: string;
  text: string;
  short: string;
  icon: string;
  benefit: string;
  risk: string;
  flavor: string;
  available: boolean;
  /** written by the player in an Inventor run */
  custom: boolean;
  unlockDay: number | null;
  rival: boolean;
  laws: { regionId: string; regionName: string; pressure: number; status: LawState['status']; progress: number }[];
  believers: number;
  ritualLabel: string | null;
}

export function getHand(s: RunState): ClaimCard[] {
  return allClaimDefs(s)
    .filter((d) => !d.rival || s.claims.find((c) => c.id === d.id)?.available || (s.starter === null && s.scn.starters.includes(d.id)))
    .map((d) => {
      const c = s.claims.find((x) => x.id === d.id)!;
      const ritual = d.ritual ? s.scn.rituals.find((r) => r.id === d.ritual) : undefined;
      return {
        id: d.id, text: d.text, short: d.short, icon: d.icon, benefit: d.benefit, risk: d.risk, flavor: d.flavor,
        available: c.available, custom: !!d.custom, unlockDay: d.unlockDay ?? null, rival: !!d.rival,
        laws: s.laws.filter((l) => l.claimId === d.id).map((l) => ({
          regionId: l.regionId, regionName: s.world.regions.find((r) => r.id === l.regionId)?.name ?? l.regionId,
          pressure: Math.round(l.pressure * 100) / 100, status: l.status, progress: Math.round(l.progress),
        })),
        believers: s.villagers.filter((v) => v.status !== 'dead' && (v.beliefs[d.id]?.conv ?? 0) >= 50).length,
        ritualLabel: ritual ? ritual.label : null,
      };
    });
}

// ------------------------------------------------------------------ forecast

export interface ForecastView {
  day: number;
  tonight: { label: string; level: number; trend: string; rain: number; warning?: string; omen: string[] };
  upcoming: { day: number; label: string; level: number | null; trend: string; warning?: string }[];
  effectiveLevel: number;
  homesAtRisk: { id: string; name: string; depth: number; destroyed: boolean }[];
  peopleAtRisk: { id: string; name: string; depth: number; note: string }[];
  bridge: { hp: number; maxHp: number; projectedDamage: number; standing: boolean; watchers: number } | null;
  evacuating: string[];
  trapped: string[];
  beacons: { id: string; name: string; lit: boolean; nights: number; sparkPct: number }[];
  fuel: number;
  food: { stock: number; eat: number; produce: number; projected: number };
  fireRiskNote: string;
  lawNotes: string[];
  kind: ScenarioRuntime['threatKind'];
  crops: { ripe: number; total: number; avgGrowth: number; avgMoisture: number; fields: { id: string; name: string; growth: number; moisture: number; ripe: boolean; harvested: boolean; tonight: number }[] } | null;
  packs: { id: string; target: string | null; dist: number; eta: string }[];
  pens: { id: string; name: string; stock: number; guarded: boolean }[];
  caravans: { arrives: number; food: number; blocked: boolean }[];
  sick: string[];
}

/** Honest "what happens tonight if nothing else changes" projection. Fire ignition is shown as a probability. */
export function getForecast(s: RunState): ForecastView {
  const th = s.threat[Math.min(s.day, s.threat.length) - 1];
  const sim = cloneState(s);
  const ctx: Ctx = { s: sim, events: [], expect: true };
  commitEvacuations(ctx);
  moveToNight(ctx);
  const water = predictedWater(sim);
  const L0 = th?.level ?? 0;
  const homesAtRisk: ForecastView['homesAtRisk'] = [];
  for (const l of sim.world.landmarks) {
    if ((l.kind !== 'home' && l.kind !== 'cabin') || l.hp <= 0) continue;
    const d = water[idx(sim.world, l.x, l.y)];
    if (d >= 1) homesAtRisk.push({ id: l.id, name: l.name, depth: d, destroyed: d >= 3 || l.hp - (d === 2 ? 45 : 20) <= 0 });
  }
  homesAtRisk.sort((a, b) => b.depth - a.depth || (a.id < b.id ? -1 : 1));
  const peopleAtRisk: ForecastView['peopleAtRisk'] = [];
  for (const v of sim.villagers) {
    if (v.status === 'dead') continue;
    const d = water[idx(sim.world, v.x, v.y)];
    if (d >= 1) peopleAtRisk.push({ id: v.id, name: v.name, depth: d, note: d >= 2 ? 'will drown' : 'will be hurt' });
  }
  const br = s.world.landmarks.find((l) => l.kind === 'bridge');
  let bridge: ForecastView['bridge'] = null;
  if (br && s.scn.features.bridge) {
    const raw = Math.max(0, (th?.level ?? 0) - 1) * (s.scn.consts.dmgBridge ?? 11);
    bridge = { hp: br.hp, maxHp: br.maxHp, projectedDamage: raw, standing: br.hp > 0, watchers: br.data.watchers ?? 0 };
  }
  const upcoming: ForecastView['upcoming'] = [];
  for (let k = 1; k <= 3; k++) {
    const t = s.threat[Math.min(s.day, s.threat.length) - 1 + k];
    if (!t) break;
    upcoming.push({ day: t.day, label: t.label, level: k === 1 ? t.level : null, trend: t.trend, warning: k <= 2 ? t.warning : undefined });
  }
  const base = (s.scn.consts.fireBase ?? 10) / 100;
  const beacons = s.world.landmarks.filter((l) => l.kind === 'beacon' || l.kind === 'campfire').map((l) => ({
    id: l.id, name: l.name, lit: l.lit, nights: l.fuelNights,
    sparkPct: l.lit ? Math.round(Math.min(95, base * (1 + (s.laws.some((x) => x.status === 'active' && claimDef(s, x.claimId).spec.side.includes('ignition')) ? 1 : 0)) * 100)) : 0,
  }));
  const eat = dailyConsumption(s);
  const produce = projectedProduction(s);
  const omens = s.scn.rituals.map((r) => omenFor(s, r.omen).text).filter((t, i, a) => t && a.indexOf(t) === i);
  const lawNotes: string[] = [];
  const fs = s.world.landmarks.filter((l) => l.kind === 'field');
  const crops = s.scn.features.crops
    ? {
        ...fieldSummary(s),
        fields: fs.map((f) => ({ id: f.id, name: f.name, growth: Math.round(f.data.growth ?? 0), moisture: Math.round(f.data.moisture ?? 0), ripe: !!f.data.ripe, harvested: !!f.data.harvested, tonight: projectedGrowth(s, f) })),
      }
    : null;
  const packs = s.scn.features.wolves
    ? packForecast(s).map((p) => ({ ...p, eta: p.dist <= 1 ? 'at the pens' : `${Math.max(1, Math.ceil((p.dist - 1) / 3))} night${Math.ceil((p.dist - 1) / 3) > 1 ? 's' : ''} away` }))
    : [];
  void activePacks;
  const pens = s.world.landmarks.filter((l) => l.kind === 'pen').map((l) => ({ id: l.id, name: l.name, stock: l.data.stock ?? 0, guarded: sim.world.smoke[idx(sim.world, l.x, l.y)] >= 1 || s.world.landmarks.some((c) => c.kind === 'campfire' && c.lit && Math.abs(c.x - l.x) + Math.abs(c.y - l.y) <= 4) }));
  const roadBlocked = s.world.landmarks.some((l) => l.kind === 'road' && (l.data.blockedUntil ?? -1) >= s.day);
  const caravans: ForecastView['caravans'] = [];
  for (let k = 0; k < 12; k++) if (s.flags[`caravan:${k}`] !== undefined) caravans.push({ arrives: s.flags[`caravan:${k}`], food: s.flags[`caravanFood:${k}`] ?? 0, blocked: roadBlocked });
  for (const l of s.laws) if ((l.status === 'active' || l.status === 'wavering')) lawNotes.push(`“${claimDef(s, l.claimId).short}” is ${l.status}.`);
  return {
    day: s.day,
    tonight: { label: th?.label ?? '', level: L0, trend: th?.trend ?? 'steady', rain: th?.rain ?? 0, warning: th?.warning, omen: omens },
    upcoming,
    effectiveLevel: Math.max(0, Math.round(sim.world.level || L0)),
    homesAtRisk,
    peopleAtRisk,
    bridge,
    evacuating: sim.villagers.filter((v) => v.status !== 'dead' && v.duty === 'evacuate').map((v) => v.name),
    trapped: sim.villagers.filter((v) => v.status !== 'dead' && v.duty === 'trapped').map((v) => v.name),
    beacons,
    fuel: s.world.stocks.fuel ?? 0,
    food: { stock: s.world.stocks.food ?? 0, eat, produce, projected: Math.max(0, (s.world.stocks.food ?? 0) + produce - eat) },
    fireRiskNote: beacons.some((b) => b.lit) && s.scn.features.fire ? 'Lit flames can spark adjacent fields, trees and cottages overnight.' : '',
    lawNotes,
    kind: s.scn.threatKind,
    crops,
    packs,
    pens,
    caravans,
    sick: s.villagers.filter((v) => v.status === 'sick').map((v) => v.name),
  };
}

// ------------------------------------------------------------------ HUD

export interface HudView {
  day: number;
  maxDay: number;
  ap: number;
  apMax: number;
  apPerDay: number;
  alive: number;
  total: number;
  homes: number;
  homesTotal: number;
  food: number;
  fuel: number;
  livestock: number;
  livestockTotal: number;
  sick: number;
  stats: string[];
  objectives: ObjectiveStatus[];
  threatLabel: string;
  warning?: string;
  phase: RunState['phase'];
  freeScout: boolean;
}

export function getHud(s: RunState): HudView {
  const th = s.threat[Math.min(s.day, s.threat.length) - 1];
  return {
    day: s.day, maxDay: s.maxDay, ap: s.ap, apMax: s.apMax, apPerDay: s.apPerDay,
    alive: s.villagers.filter((v) => v.status !== 'dead').length, total: s.villagers.length,
    homes: homesStanding(s), homesTotal: s.world.landmarks.filter((l) => l.kind === 'home').length,
    food: s.world.stocks.food ?? 0, fuel: s.world.stocks.fuel ?? 0,
    livestock: s.world.landmarks.filter((l) => l.kind === 'pen').reduce((a, l) => a + (l.data.stock ?? 0), 0),
    livestockTotal: s.world.landmarks.filter((l) => l.kind === 'pen').reduce((a, l) => a + (l.data.stockMax ?? l.data.stock ?? 0), 0),
    sick: s.villagers.filter((v) => v.status === 'sick').length,
    stats: s.scn.hud ?? ['alive', 'homes', 'food', 'fuel'],
    objectives: objectiveStatuses(s),
    threatLabel: th?.label ?? '', warning: th?.warning, phase: s.phase, freeScout: !s.freeScoutUsed,
  };
}

// ------------------------------------------------------------------ run modifiers

export interface ModifierView {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  tradeoff: string;
}

/** The twists in play, with plain-language effect and price (shown in the briefing and the Tonight tab). */
export function getModifierViews(s: RunState): ModifierView[] {
  const out: ModifierView[] = [];
  for (const id of s.modifiers) {
    const m = getModifier(id);
    if (m) out.push({ id: m.id, name: m.name, icon: m.icon, blurb: m.blurb, tradeoff: m.tradeoff });
  }
  return out;
}

// ------------------------------------------------------------------ why people do what they do

export interface IntentView {
  kind: string;
  label: string;
  score: number;
  why: string;
  chosen: boolean;
}

/** What a villager is weighing tonight, best first, with the sentence behind each score. */
export function getIntents(s: RunState, id: string): IntentView[] {
  const v = findVillager(s, id);
  if (!v || v.status === 'dead') return [];
  return scoreIntents(s, v, predictedWater(s)).slice(0, 3).map((i, n) => ({ kind: i.kind, label: i.label, score: i.score, why: i.why, chosen: n === 0 }));
}

export interface Callout {
  kind: 'warn' | 'info' | 'good';
  text: string;
}

/** Short authored lines tied to the actual state (who doubts, what the factions are about to do, who left their post). */
export function getCallouts(s: RunState): Callout[] {
  const out: Callout[] = [];
  for (const r of s.rivals) {
    if (!r.plan) continue;
    const def = s.scn.rivals.find((d) => d.factionId === r.factionId && d.claim === r.claim);
    const leader = findVillager(s, def?.leader ?? '');
    const target = r.plan.target ? findVillager(s, r.plan.target) : null;
    out.push({ kind: 'warn', text: r.plan.kind === 'rebuttal' ? `${leader?.name ?? 'The rival'} will expose your failed demonstration tomorrow.` : r.plan.kind === 'sabotage' ? `${leader?.name ?? 'The rival'} will try to talk ${target?.name ?? 'the broker'} out of the grain deal tomorrow.` : `${leader?.name ?? 'The rival'} will campaign against your story${target ? `, starting with ${target.name}` : ''} tomorrow.` });
  }
  for (const p of pendingFactionPlans(s)) {
    out.push({ kind: 'warn', text: `The ${p.faction.name} will bar public gatherings unless ${p.leaderName} is won over (conviction ${p.conviction} of ${BAN_LEADER_CONVICTION}).` });
  }
  const todayDefect = s.log.filter((e) => e.code === 'WATCHER_DEFECTS' && e.day === s.day - 1).pop();
  if (todayDefect) out.push({ kind: 'warn', text: todayDefect.text });
  // the Keeper's main story: who hears it, who doubts it
  const claim = s.starter ?? s.scn.starters[0];
  if (claim && s.claims.find((c) => c.id === claim)?.available) {
    const def = claimDef(s, claim);
    const byDistrict = new Map<string, number[]>();
    for (const v of s.villagers) {
      if (v.status === 'dead') continue;
      const arr = byDistrict.get(v.district) ?? [];
      arr.push(v.beliefs[claim]?.conv ?? 0);
      byDistrict.set(v.district, arr);
    }
    const avg = [...byDistrict.entries()].map(([d, xs]) => ({ d, a: xs.reduce((p, q) => p + q, 0) / xs.length })).filter((x) => x.d);
    const high = avg.filter((x) => x.a >= 35).sort((p, q) => q.a - p.a)[0];
    const low = avg.filter((x) => x.a <= 12 && x.d !== high?.d).sort((p, q) => p.a - q.a)[0];
    const name = (id: string) => s.world.regions.find((r) => r.id === id)?.name ?? id;
    if (high && low) out.push({ kind: 'info', text: `${name(high.d)} hears “${def.short}”; ${name(low.d)} still doubts.` });
    // someone who trusts the Keeper but not the believer who carries the word
    for (const v of s.villagers) {
      if (v.status === 'dead' || v.keeperTrust < 50 || (v.beliefs[claim]?.conv ?? 0) >= 20) continue;
      const bad = neighborsOf(s, v.id).find((n) => n.trust < 15 && n.id !== v.id && (findVillager(s, n.id)?.beliefs[claim]?.conv ?? 0) >= 50);
      if (bad) {
        out.push({ kind: 'info', text: `${v.name.split(' ')[0]} trusts you, but not ${findVillager(s, bad.id)!.name.split(' ')[0]}, who is carrying your story.` });
        break;
      }
    }
  }
  // contradictory laws held in different places
  const live = s.laws.filter((l) => l.status === 'active' || l.status === 'wavering');
  for (const a of live)
    for (const b of live) {
      if (a.id >= b.id || a.regionId === b.regionId) continue;
      if (claimDef(s, a.claimId).contradicts.includes(b.claimId) || claimDef(s, b.claimId).contradicts.includes(a.claimId)) {
        out.push({ kind: 'warn', text: `Two places believe opposite things (“${claimDef(s, a.claimId).short}” and “${claimDef(s, b.claimId).short}”). Both pull on the world.` });
      }
    }
  const worked = s.log.filter((e) => (e.code === 'BRIDGE_HELD' || e.code === 'HOME_SPARED') && e.day === s.day - 1).pop();
  if (worked) out.push({ kind: 'good', text: `Last night: ${worked.text}` });
  const failed = s.log.filter((e) => e.code === 'LAW_DISCREDITED' && e.day === s.day - 1).pop();
  if (failed) out.push({ kind: 'warn', text: failed.text });
  return out.slice(0, 5);
}
