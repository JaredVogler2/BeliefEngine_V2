import { ARCHETYPES, type ScenarioDef, type VillagerDef } from '../content/types.ts';
import { getScenarioDef } from '../content/registry.ts';
import { applyModifiers, sanitizeModifiers } from '../gen/modifiers.ts';
import { applyDraft, applyExtraClaims, pledgeKey, sanitizePledges } from '../progress/options.ts';
import { clone } from '../gen/blueprint.ts';
import { buildWorld } from '../world/build.ts';
import { assignDay } from '../ai/routines.ts';
import { initReality } from '../reality/state.ts';
import { emit, type Ctx } from './events.ts';
import { hashKeys, rand } from './rng.ts';
import {
  RULES_VERSION, SCHEMA_VERSION,
  type CreateRunOptions, type LawState, type RunState, type RunStats, type Traits, type Villager,
} from './types.ts';

function emptyStats(): RunStats {
  return {
    apSpent: 0, actions: 0, seeds: 0, rituals: 0, gatherings: 0, counters: 0, messengers: 0, scouts: 0,
    failedEvidence: 0, goodEvidence: 0, lawsActivated: [], lawsCollapsed: 0, peakPressure: {},
    homesSpared: 0, livesSaved: 0, fieldsBurned: 0, rivalActions: 0, rivalCountered: 0,
    firstBeliefDay: null, firstLawDay: null, noBeacons: true, usedClaims: [], customLaws: 0, tradeDeals: 0,
  };
}

function makeVillager(def: VillagerDef, s: { district: string }, difficulty: string): Villager {
  const base = ARCHETYPES[def.archetype]?.traits ?? ARCHETYPES.farmer.traits;
  const traits: Traits = { ...base, ...(def.traits ?? {}) };
  const h = hashKeys(11, 'look', def.id);
  const look = {
    hue: def.look?.hue ?? h % 360,
    skin: def.look?.skin ?? (h >>> 9) % 4,
    hair: def.look?.hair ?? (h >>> 13) % 5,
    hat: def.look?.hat ?? (h >>> 17) % 7,
    build: def.look?.build ?? (h >>> 21) % 3,
  };
  const trustAdj = difficulty === 'story' ? 6 : difficulty === 'hard' ? -4 : 0;
  return {
    id: def.id, name: def.name, role: def.role, archetype: def.archetype, faction: def.faction, household: def.household,
    homeId: def.home, workId: def.work, district: s.district, x: 0, y: 0, place: def.home,
    status: 'ok', duty: 'work', dutyNote: '', traits,
    health: 100, fear: 10, energy: 100, hunger: 10,
    keeperTrust: Math.max(0, Math.min(100, def.trust + trustAdj)),
    beliefs: Object.fromEntries(Object.entries(def.beliefs ?? {}).map(([k, v]) => [k, { conv: v, heard: 1, lastDay: 0, lastSource: null, evidence: 0, cause: null, stale: 0 }])),
    want: def.want, look, scoutedUntil: 0, grudge: 0, busyUntil: 0, deathDay: null, deathCause: null,
  };
}

/** Build the actual (jittered) threat schedule. Authored forecasts stay within bounded, seeded variation. */
function actualThreat(def: ScenarioDef, seed: number) {
  return def.runtime.threat.map((t, i) => {
    const j = def.jitter[i] ?? 0;
    if (!j) return { ...t };
    const r = rand(seed, 'threat', i);
    const d = r < 0.33 ? -j : r > 0.66 ? j : 0;
    return { ...t, level: Math.max(0, t.level + d) };
  });
}

export function createRun(opts: CreateRunOptions): RunState {
  return createRunFromDef(getScenarioDef(opts.scenarioId), opts);
}

/** Build a run from an explicit scenario definition (used by the generator to verify a village before it is registered). */
export function createRunFromDef(base: ScenarioDef, opts: CreateRunOptions): RunState {
  const staged = applyDraft(applyExtraClaims(base, opts.extraClaims ?? []), opts.draft);
  const voluntary = opts.modifiers !== undefined && opts.modifiers.length > 0 && !base.modifiers;
  const modifiers = sanitizeModifiers(staged, opts.modifiers ?? staged.modifiers ?? []);
  const pledges = sanitizePledges(staged, opts.pledges ?? []);
  let def = applyModifiers(staged, modifiers, opts.seed | 0);
  if (pledges.includes('all_alive')) {
    if (def === base) def = clone(base);
    def.runtime.objectives = [...def.runtime.objectives, { id: 'pledge_all_alive', label: 'Pledge: not one villager lost', metric: 'alive', op: '>=', value: def.villagers.length, required: false, instantLoss: true }];
  }
  const thin = pledges.includes('thin_voice') ? 1 : 0;
  const difficulty = opts.difficulty ?? 'normal';
  const world = buildWorld(def.map);
  const apPerDay = Math.max(1, def.ap.perDay + (difficulty === 'story' ? 1 : 0) - thin);
  const villagers = def.villagers.map((vd) => {
    const home = world.landmarks.find((l) => l.id === vd.home);
    return makeVillager(vd, { district: home?.district ?? '' }, difficulty);
  });
  const laws: LawState[] = [];
  const claims = def.runtime.claimDefs.map((c) => ({
    id: c.id,
    available: !!c.startsAvailable,
    introduced: false,
    introducedDay: null as number | null,
    def: null,
  }));
  for (const c of def.runtime.claimDefs)
    for (const r of c.regions)
      laws.push({
        id: `${c.id}@${r}`, claimId: c.id, regionId: r, status: 'dormant', progress: 0, pressure: 0, strength: 0,
        supporters: [], opponents: [], topShare: 0, activatedDay: null, changedDay: 1, note: 'Nobody has heard of it yet.', activeNights: 0,
      });
  const factions = def.factions.map((f) => ({ ...f }));
  const rivals = def.runtime.rivals.map((r) => ({
    factionId: r.factionId, claim: r.claim, plan: null, budget: r.budget + (difficulty === 'hard' ? 1 : 0), actions: 0, lastActionDay: -9, countered: 0, active: false,
  }));
  if (difficulty === 'hard') world.stocks.fuel = Math.max(0, (world.stocks.fuel ?? 0) - 2);
  const s: RunState = {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    scenarioId: def.runtime.id,
    scenarioVersion: def.runtime.version,
    seed: opts.seed | 0,
    difficulty,
    mode: opts.mode ?? 'story',
    modifiers: [...modifiers, ...pledges.map(pledgeKey)],
    day: 1,
    maxDay: def.runtime.durationDays,
    phase: 'planning',
    outcome: null,
    ap: Math.max(1, def.ap.start + (difficulty === 'story' ? 1 : 0) - thin),
    apMax: def.ap.max,
    apPerDay,
    freeScoutUsed: false,
    starter: null,
    villagers,
    edges: def.edges.map((e) => ({ ...e })),
    factions,
    claims,
    laws,
    rivals,
    world,
    threat: actualThreat(def, opts.seed | 0),
    log: [],
    nextEventId: 1,
    today: [],
    history: [],
    stats: emptyStats(),
    flags: { ...(opts.dailyDate ? { dailyDate: opts.dailyDate } : {}), ...(opts.draft && staged !== base && staged.runtime.claimDefs.length < base.runtime.claimDefs.length ? { drafted: 1 } : {}), ...(voluntary ? { twisted: modifiers.length } : {}), ...(opts.inventor && (opts.mode ?? 'story') !== 'daily' ? { inventor: 1 } : {}) },
    beatsSeen: [],
    scn: def.runtime,
  };
  // Generative Reality: the reality block exists only in these runs, so every classic run (and its hash) is exactly V1's
  if (opts.reality || opts.realityLab) {
    s.v2 = initReality(s, !!opts.realityLab);
    s.flags.reality = opts.realityLab ? 2 : 1;
  }
  const ctx: Ctx = { s, events: [], expect: false };
  if (def.runtime.starters.length === 1) {
    s.starter = def.runtime.starters[0];
    const c = s.claims.find((x) => x.id === s.starter);
    if (c) c.available = true;
  }
  for (const v of s.villagers) {
    const home = world.landmarks.find((l) => l.id === v.homeId);
    if (home) {
      v.x = home.x;
      v.y = home.y;
      v.place = home.id;
    }
  }
  assignDay(ctx);
  emit(ctx, {
    step: 'dawn', code: 'DAY_START', importance: 2,
    text: `Day 1 of ${s.maxDay}. ${s.scn.threat[0]?.label ?? ''}`,
  });
  return s;
}
