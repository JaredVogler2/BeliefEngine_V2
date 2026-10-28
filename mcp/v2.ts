import { getLawViews, getVillagerView, stagingOmen } from '../src/engine/index.ts';
import type { CreateRunOptions, RunState } from '../src/engine/index.ts';
import { findClaimDef } from '../src/engine/core/lookup.ts';
import { computePressure, electorateOf } from '../src/engine/laws/resolver.ts';
import { clauseText, sideEffectsOf, type RealityDraft } from '../src/engine/reality/build.ts';
import { describeDraft } from '../src/engine/reality/preview.ts';
import { provenanceOf } from '../src/engine/reality/provenance.ts';
import type { ReadCandidate, Reading } from '../src/engine/reality/read.ts';
import { realityRules } from '../src/engine/reality/state.ts';
import { getMindView } from '../src/engine/mind/view.ts';
import { regionAt } from '../src/engine/world/grid.ts';

/**
 * The V2 side of the MCP interface (phase 13): which game a run is (Classic, Generative Chronicle, Living Village, Reality Lab),
 * the versioned error kinds every failure carries, and the read-only views an agent gets of written beliefs, regions, objects,
 * the trust graph and a rule's explanation. Everything here is a pure function of the run state and shows what a browser player
 * can see: private convictions stay hidden exactly as in getVillagerView.
 */

export type Variant = 'classic' | 'generative' | 'living' | 'lab';
export const VARIANTS: Variant[] = ['classic', 'generative', 'living', 'lab'];

export function variantOptions(v: Variant): Pick<CreateRunOptions, 'reality' | 'realityLab' | 'living'> {
  return v === 'generative' ? { reality: true } : v === 'lab' ? { realityLab: true } : v === 'living' ? { living: true } : {};
}

export function variantOfOptions(o: CreateRunOptions): Variant {
  return o.realityLab ? 'lab' : o.living ? 'living' : o.reality ? 'generative' : 'classic';
}

export function variantOf(s: RunState): Variant {
  return s.flags.reality === 2 ? 'lab' : s.flags.reality === 3 ? 'living' : s.flags.reality === 1 ? 'generative' : 'classic';
}

/** Whether beliefs of the agent's own can be written in this run, and with which reader. */
export function writing(s: RunState): 'reality' | 'inventor' | null {
  if (s.v2 && !s.v2.living) return 'reality';
  if (s.flags.inventor) return 'inventor';
  return null;
}

// ------------------------------------------------------------------------------------------ errors

/**
 * Versioned error kinds (errorsVersion 2). `code` stays the fine-grained reason (it may grow); `kind` is the stable category a client
 * branches on. Codes the engine adds later fall into ACTION_REFUSED, a rule of the game saying no.
 */
export const ERRORS_VERSION = 2;
export const ERROR_KINDS = ['INVALID_ARGUMENT', 'NOT_FOUND', 'INVALID_CLAIM', 'STALE_REVISION', 'OUT_OF_BUDGET', 'LLM_UNAVAILABLE', 'UNSUPPORTED_EFFECT', 'NOT_AUTHORIZED', 'INVALID_STATE', 'ACTION_REFUSED', 'INTERNAL'] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

const KIND_OF: Record<string, ErrorKind> = {
  STALE_REVISION: 'STALE_REVISION',
  TOKEN_INVALID: 'INVALID_CLAIM', UNKNOWN_CLAIM: 'INVALID_CLAIM', CLAIM_LOCKED: 'INVALID_CLAIM', RIVAL_CLAIM: 'INVALID_CLAIM', INVALID_CLAIM: 'INVALID_CLAIM', BAD_CLAIM: 'INVALID_CLAIM', TOO_MANY_CLAIMS: 'INVALID_CLAIM', NOT_BUILDABLE: 'INVALID_CLAIM',
  NO_INFLUENCE: 'OUT_OF_BUDGET', OUT_OF_BUDGET: 'OUT_OF_BUDGET', over_budget: 'OUT_OF_BUDGET', over_quota: 'OUT_OF_BUDGET', rate_limited: 'OUT_OF_BUDGET', busy: 'OUT_OF_BUDGET',
  LLM_UNAVAILABLE: 'LLM_UNAVAILABLE', disabled: 'LLM_UNAVAILABLE', not_configured: 'LLM_UNAVAILABLE', quota_unavailable: 'LLM_UNAVAILABLE', provider_unavailable: 'LLM_UNAVAILABLE', timeout: 'LLM_UNAVAILABLE', network: 'LLM_UNAVAILABLE', bad_output: 'LLM_UNAVAILABLE', refused: 'LLM_UNAVAILABLE', unauthorized: 'LLM_UNAVAILABLE',
  UNSUPPORTED_EFFECT: 'UNSUPPORTED_EFFECT',
  READ_ONLY: 'NOT_AUTHORIZED', CAPABILITY_NOT_ENABLED: 'NOT_AUTHORIZED', DEBUG_OFF: 'NOT_AUTHORIZED', NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  UNKNOWN_RUN: 'NOT_FOUND', UNKNOWN_VILLAGER: 'NOT_FOUND', UNKNOWN_OBJECT: 'NOT_FOUND', BAD_REGION: 'NOT_FOUND', RUN_VERSION_MISMATCH: 'NOT_FOUND',
  BAD_RUN_ID: 'INVALID_ARGUMENT', BAD_SCENARIO: 'INVALID_ARGUMENT', BAD_SEED: 'INVALID_ARGUMENT', BAD_SAVE: 'INVALID_ARGUMENT', TOO_LARGE: 'INVALID_ARGUMENT', INVALID_ARGUMENT: 'INVALID_ARGUMENT', RUN_LIMIT: 'INVALID_ARGUMENT',
  RUN_OVER: 'INVALID_STATE', NOT_FINISHED: 'INVALID_STATE', CHOOSE_STORY: 'INVALID_STATE', NO_RITUAL: 'INVALID_STATE',
  INTERNAL: 'INTERNAL',
};

export function errorKind(code: string): ErrorKind {
  return KIND_OF[code] ?? 'ACTION_REFUSED';
}

// ------------------------------------------------------------------------------------------ readings

/** What the browser composer shows for one interpretation: said beside done, the full preview, its cost, and what it leaves out. */
export function describeCandidate(s: RunState, c: ReadCandidate, token: string | null, needsYes: boolean): Record<string, unknown> {
  const said = c.map.map((m) => ({ target: m.target, effect: m.effect, trigger: m.trigger, condition: m.condition ?? null, place: m.place ?? null }));
  const source = c.ast.source.reader === 'model' ? { reader: 'model', model: c.ast.source.model, prompt: c.ast.source.prompt } : { reader: 'offline', model: null };
  if (!c.build.ok) return { buildable: false, confidence: c.confidence, said, assumed: c.assumed, why: c.build.message, issues: c.build.issues, source };
  const d: RealityDraft = c.build.draft;
  const x = describeDraft(s, d);
  return {
    buildable: true,
    token,
    needsAcknowledgement: needsYes,
    title: d.title,
    rating: d.rating,
    power: d.power,
    confidence: c.confidence,
    said,
    willDo: d.mechanics,
    requires: d.requires,
    leftOut: d.omitted,
    whatItActsOn: x.plan.map((p) => ({ target: p.target, countNow: p.count, reach: p.reach, duration: p.duration, setOffWhen: p.catalyst, couldActTonight: p.ready.now, why: p.ready.why })),
    support: { percentNeeded: x.threshold.percent, fadesBelowPercent: x.threshold.off, firmBelievers: x.threshold.believers, voters: x.threshold.voters, where: x.threshold.where },
    upkeep: x.upkeep,
    sideEffects: d.risks,
    whoMayPushBack: x.opposition,
    adjustments: d.adjustments,
    assumed: [...c.assumed, ...d.notes],
    cost: { influenceToWrite: d.cost.compose, influencePerTelling: d.cost.perTelling },
    demonstratedAt: d.claim.ritual ?? null,
    structure: d.ast,
    source,
  };
}

/** The candidates of a reading, whatever its kind (the browser shows the same list). */
export function candidatesOf(r: Reading): ReadCandidate[] {
  return r.kind === 'ambiguous' ? r.choices : r.kind === 'unsupported' ? r.alternatives : r.candidates;
}

/** Writing something other than what was said needs an explicit yes, as in the browser (partial, a substitute, or low confidence). */
export function needsAcknowledgement(r: Reading, c: ReadCandidate): boolean {
  return r.kind === 'partial' || r.kind === 'unsupported' || c.confidence === 'low';
}

// ------------------------------------------------------------------------------------------ places, objects, people

const regionName = (s: RunState, id: string): string => s.world.regions.find((r) => r.id === id)?.name ?? id;

export function regionView(s: RunState, regionId: string): Record<string, unknown> | null {
  const reg = s.world.regions.find((r) => r.id === regionId);
  if (!reg) return null;
  const people = s.villagers.filter((v) => v.district === regionId);
  const landmarks = s.world.landmarks.filter((l) => l.district === regionId || regionAt(s.world, l.x, l.y) === regionId);
  const laws = getLawViews(s).filter((l) => l.regionId === regionId && (l.status !== 'dormant' || l.pressure > 0));
  const written = s.claims.filter((c) => c.def?.reality && c.def.regions.includes(regionId));
  return {
    id: reg.id,
    name: reg.name,
    people: people.map((v) => ({ id: v.id, name: v.name, role: v.role, faction: v.faction, status: v.status })),
    alive: people.filter((v) => v.status !== 'dead').length,
    landmarks: landmarks.map((l) => ({ id: l.id, kind: l.kind, name: l.name })),
    laws: laws.map((l) => ({ id: l.id, claim: l.claimId, short: l.short, status: l.status, supportPercent: Math.round(l.pressure * 100), neededPercent: Math.round(l.on * 100), firmBelievers: l.supporters.length, needsFirmBelievers: l.minSupporters, rival: l.rival })),
    writtenBeliefs: written.map((c) => {
      const p = computePressure(s, c.id, regionId);
      return { claim: c.id, short: c.def!.short, voters: electorateOf(s, c.id, regionId), supportPercent: Math.round(p.pressure * 100), firmBelievers: p.supporters.length, rival: !!c.def!.rival };
    }),
    ...(s.v2 ? { hens: s.v2.chickens.filter((h) => h.alive && regionAt(s.world, h.x, h.y) === regionId).length, looseStones: s.v2.stones.filter((t) => t.state === 'loose' && regionAt(s.world, t.x, t.y) === regionId).length } : {}),
  };
}

/** A landmark (or, in a V2 run, a coop, a stone or a hen) as the map card shows it, with the proofs that can be staged there. */
export function objectView(s: RunState, objectId: string, activeClaims: string[]): Record<string, unknown> | null {
  const l = s.world.landmarks.find((x) => x.id === objectId);
  if (l) {
    const rituals = s.scn.rituals.filter((r) => r.landmark === l.kind).map((r) => ({
      ritual: r.id, label: r.label, cost: r.ap, fuel: r.fuel, what: r.desc,
      stagesProofOf: activeClaims.filter((c) => findClaimDef(s, c)?.ritual === r.id).map((c) => ({ claim: c, omen: stagingOmen(s, r, c) })),
    }));
    return {
      kind: 'landmark', id: l.id, landmarkKind: l.kind, name: l.name, region: regionAt(s.world, l.x, l.y) ?? l.district, x: l.x, y: l.y, hp: l.hp, maxHp: l.maxHp,
      lit: l.kind === 'beacon' || l.kind === 'campfire' ? l.lit : undefined, fuelNights: l.lit ? l.fuelNights : undefined,
      ...(l.kind === 'bridge' ? { watchers: l.data.watchers ?? 0 } : {}), ...(l.kind === 'pen' ? { stock: l.data.stock ?? 0 } : {}),
      hereNow: s.villagers.filter((v) => v.status !== 'dead' && v.place === l.id).map((v) => ({ id: v.id, name: v.name })),
      rituals,
    };
  }
  if (!s.v2) return null;
  const coop = s.v2.coops.find((c) => c.id === objectId);
  if (coop) return { kind: 'coop', id: coop.id, region: coop.region, x: coop.x, y: coop.y, home: coop.home, hensAlive: s.v2.chickens.filter((h) => h.coop === coop.id && h.alive).length, hensStray: s.v2.chickens.filter((h) => h.coop === coop.id && h.alive && h.stray).length };
  const stone = s.v2.stones.find((t) => t.id === objectId);
  if (stone) return { kind: 'stone', id: stone.id, x: stone.x, y: stone.y, region: regionAt(s.world, stone.x, stone.y), weightLoads: stone.base, wetness: stone.wet, state: stone.state };
  const hen = s.v2.chickens.find((h) => h.id === objectId);
  if (hen) return { kind: 'hen', id: hen.id, coop: hen.coop, x: hen.x, y: hen.y, alive: hen.alive, stray: hen.stray, heightLastNight: hen.alt, fate: hen.fate };
  return null;
}

/**
 * The trust ties everyone can see in the browser (the villager card's "who they trust"), as a graph. Whole village, or one person
 * and the people within two ties. No conviction is in it.
 */
export function socialGraph(s: RunState, center?: string): Record<string, unknown> | null {
  let ids: Set<string>;
  if (center) {
    if (!s.villagers.some((v) => v.id === center)) return null;
    ids = new Set([center]);
    for (let hop = 0; hop < 2; hop++) {
      const ring = [...ids];
      for (const e of s.edges) {
        if (ring.includes(e.a)) ids.add(e.b);
        if (ring.includes(e.b)) ids.add(e.a);
      }
    }
  } else ids = new Set(s.villagers.map((v) => v.id));
  const nodes = s.villagers.filter((v) => ids.has(v.id)).map((v) => ({ id: v.id, name: v.name, role: v.role, faction: v.faction, region: v.district, status: v.status, keeperTrust: Math.round(v.keeperTrust) }));
  const edges = s.edges.filter((e) => ids.has(e.a) && ids.has(e.b)).map((e) => ({ a: e.a, b: e.b, kind: e.kind, aTrustsB: Math.round(e.ab), bTrustsA: Math.round(e.ba), rate: e.rate }));
  return { center: center ?? null, nodes, edges, factions: s.factions.map((f) => ({ id: f.id, name: f.name, kind: f.kind, leader: f.leader })) };
}

/** A villager's mind as the browser's card shows it (V2 runs): traits, goals, what they remember and how they know. */
export function mindView(s: RunState, id: string): Record<string, unknown> | null {
  const m = getMindView(s, id);
  if (!m) return null;
  return { traits: m.traits, goals: m.goals, thinkingToday: m.thinking, lastDusk: m.last, memories: m.memories.map((x) => ({ day: x.day, how: x.how, text: x.text })) };
}

// ------------------------------------------------------------------------------------------ rules

/** What a story or written belief does, what it cannot, what else it does, and (for a written one) how it became real so far. */
export function ruleExplanation(s: RunState, claimId: string): Record<string, unknown> | null {
  const def = findClaimDef(s, claimId);
  if (!def) return null;
  const laws = getLawViews(s).filter((l) => l.claimId === claimId).map((l) => ({ id: l.id, region: l.regionName, status: l.status, supportPercent: Math.round(l.pressure * 100), neededPercent: Math.round(l.on * 100), progress: l.progress, firmBelievers: l.supporters.length, needsFirmBelievers: l.minSupporters, threats: l.threats }));
  const common = {
    claim: def.id, short: def.short, text: def.text, rival: !!def.rival, regions: def.regions.map((r) => ({ id: r, name: regionName(s, r) })),
    thresholds: { supportPercent: Math.round(def.spec.thresholds.on * 100), fadesBelowPercent: Math.round(def.spec.thresholds.off * 100), firmBelievers: def.spec.thresholds.minSupporters },
    demonstratedAt: def.ritual ?? null, laws,
  };
  if (def.reality) {
    const ast = def.reality.ast;
    return {
      ...common,
      written: true,
      rules: realityRules(s),
      rating: def.reality.rating,
      power: def.reality.power,
      supported: ast.clauses.map((c) => clauseText(s, c, ast.regions)),
      unsupported: ast.omitted,
      sideEffects: [...new Set(ast.clauses.flatMap((c) => sideEffectsOf(s, c, ast.regions)))],
      readBy: ast.source,
      structure: ast,
      provenance: provenanceOf(s, claimId),
    };
  }
  return {
    ...common,
    written: !!def.custom,
    supported: [def.benefit],
    unsupported: [],
    sideEffects: [def.risk, ...def.spec.side],
    trigger: def.spec.trigger,
    provenance: null,
    recentEvents: s.log.filter((e) => e.claim === claimId && (e.code.startsWith('LAW_') || e.code === 'EVIDENCE_STAGED')).slice(-10).map((e) => ({ id: e.id, day: e.day, code: e.code, text: e.text })),
  };
}

/** The villager view an agent may read: the browser card's public facts (hidden convictions stay hidden), plus the V2 mind. */
export function villagerPublic(s: RunState, id: string): Record<string, unknown> {
  const v = getVillagerView(s, id);
  const mind = mindView(s, id);
  return { ...v, ...(mind ? { mind } : {}) };
}
