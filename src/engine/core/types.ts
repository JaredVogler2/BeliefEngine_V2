/**
 * Core data model for the Belief Engine simulator. Everything in RunState is plain JSON-serialisable data
 * (no classes, Maps, functions or typed arrays) so it can be cloned, hashed, saved and replayed.
 * Convention: conviction is an integer-ish value in [-100, 100]; traits and needs are 0..100.
 */

import type { BeliefAST } from '../nl/ast.ts';
import type { RealityAst } from '../reality/ast.ts';
import type { RealityState } from '../reality/state.ts';

export const SCHEMA_VERSION = 1;
export const RULES_VERSION = '1.0.0';

export type Id = string;
export type Difficulty = 'story' | 'normal' | 'hard';
export type RunMode = 'story' | 'expedition' | 'daily' | 'sandbox';
export type Phase = 'planning' | 'over';

// ------------------------------------------------------------------ rules / content-facing types

export type Subject = 'river' | 'rain' | 'bridge' | 'grain' | 'wolf' | 'stone' | 'smoke' | 'illness' | 'fire';
export type Effect = 'repel' | 'attract' | 'redirect' | 'strengthen' | 'weaken' | 'grow' | 'slow' | 'conceal';
export type TriggerKind = 'lit_beacon' | 'bell' | 'watchers' | 'night' | 'smoke_fire' | 'evidence' | 'always';
export type SideEffectId =
  | 'ignition' // beacons/campfires may ignite neighbouring fuel
  | 'labor_drain' // night work exhausts villagers
  | 'rain_displace' // water pushed elsewhere
  | 'smoke_sickness' // smoke harms lungs
  | 'stone_unstable' // praised stone loosens buildings
  | 'complacency' // fire watch relaxes
  | 'cold'; // open doors / exposure

export interface RuleThresholds {
  /** support pressure needed to start awakening (0..1) */
  on: number;
  /** pressure below which an active law starts to waver / decay (hysteresis) */
  off: number;
  /** minimum number of local believers (conviction >= 50) */
  minSupporters: number;
  /** progress points gained per day at threshold (plus a bonus for more pressure) */
  ramp: number;
  /** progress points lost per day below the off threshold */
  decay: number;
}

/** A bounded, typed physical effect. Authored laws and player-composed laws are both RuleSpecs. */
export interface RuleSpec {
  id: string;
  version: 1;
  subject: Subject;
  effect: Effect;
  trigger: { kind: TriggerKind; min?: number };
  /** reach in tiles around each trigger source */
  radius: number;
  /** 1..3 strength in physical units (tiles of elevation, % damage cut, rain units, ...) */
  intensity: number;
  thresholds: RuleThresholds;
  upkeep: { fuel: number };
  side: SideEffectId[];
  tags: string[];
}

export interface ClaimDef {
  id: Id;
  /** exact player-facing claim text */
  text: string;
  short: string;
  icon: string;
  spec: RuleSpec;
  /** region ids where this claim can form a law */
  regions: Id[];
  /** districts whose residents vote (support pressure) for each region; defaults to the region itself */
  electorate?: Record<Id, Id[]>;
  /** ritual that stages evidence for this claim */
  ritual?: Id;
  contradicts: Id[];
  /** card copy; must match what the code does */
  benefit: string;
  risk: string;
  flavor: string;
  /** rival/propaganda claims are not in the player's hand but spread and can form laws */
  rival?: boolean;
  /** a rival claim the Keeper may nevertheless adopt and spread (e.g. a hunter's decoy-fire theory) */
  adoptable?: boolean;
  /** free-form scenario parameters, e.g. { sink: 'west' } for displaced rain */
  params?: Record<string, string | number>;
  startsAvailable: boolean;
  unlockDay?: number;
  /** a compound belief's second clause (laws/effects.ts runs each); thresholds and costs live on `spec` */
  extra?: RuleSpec[];
  /** custom (player composed) claim bookkeeping: what was typed, the structure it became, who read it, and a checksum of the balance */
  custom?: { text: string; astHash: string; parser: string; balance: number; ast: BeliefAST; source: 'offline' | 'model'; nl: number };
  /**
   * A Generative Reality belief (src/engine/reality): its validated AST v2 runs in the reality executor; `spec` then carries only
   * the derived thresholds and a neutral subject that V1's effect table ignores. Absent on every V1 claim.
   */
  reality?: RealityClaim;
}

export interface RealityClaim {
  ast: RealityAst;
  /** mechanics hash (same mechanics, same id, whatever the words) */
  hash: string;
  power: number;
  rating: 'light' | 'moderate' | 'strong';
  /** fingerprint of the derived numbers */
  checksum: string;
  /** the run revision the reading was confirmed against (stale confirmations are refused) */
  rev: number;
}

export type OmenKind = 'river_trend' | 'bridge_calm' | 'rain_tonight' | 'pack_quiet' | 'moon_clear' | 'fire_calm' | 'none';

export interface RitualDef {
  id: Id;
  label: string;
  verb: string;
  /** landmark kind the ritual is performed at */
  landmark: string;
  ap: number;
  fuel: number;
  /** how many witnesses within this many tiles see it */
  witnessRadius: number;
  /** base evidence strength (conviction points before omen/skepticism scaling) */
  strength: number;
  omen: OmenKind;
  /** physical action performed (for laws that react to it) */
  physical: 'light' | 'ring' | 'vigil' | 'smoke' | 'night_labor' | 'none';
  desc: string;
}

export interface ThreatDay {
  day: number;
  /** river level (flood) / dryness / pack pressure / heat: scenario-defined meaning per field */
  level: number;
  rain: number;
  wind: number;
  heat: number;
  pack: number;
  trend: 'rising' | 'steady' | 'ebbing';
  label: string;
  warning?: string;
}

export interface ObjectiveDef {
  id: Id;
  label: string;
  /** what to measure */
  metric: 'alive' | 'homes' | 'food' | 'fed' | 'livestock' | 'trust' | 'fields' | 'bridge' | 'legit' | 'sick';
  op: '>=' | '<=';
  value: number;
  /** required for victory */
  required: boolean;
  /** if violated at any end-of-day check the run is lost immediately */
  instantLoss?: boolean;
  /** only evaluated on the final day (otherwise continuously for instantLoss) */
  heroic?: boolean;
}

export interface RivalDef {
  factionId: Id;
  /** claim this rival pushes */
  claim: Id;
  /** claim whose rise triggers the rival */
  watches: Id;
  /** pressure of the watched claim that triggers the campaign */
  trigger: number;
  /** days of warning before the rival acts */
  telegraph: number;
  budget: number;
  cooldown: number;
  leader: Id;
  /** also move against an arranged deal: delays its goods unless the Keeper answers */
  sabotage?: { deal: Id; delay: number };
}

export interface BeatDef {
  id: Id;
  /** observable condition */
  when: { kind: string; arg?: string | number; arg2?: string | number };
  title: string;
  text: string;
  once: boolean;
}

export interface DealDef {
  id: Id;
  label: string;
  ap: number;
  /** villager whose goodwill gates the deal */
  broker: Id;
  /** broker must hold at least this conviction in any non-rival claim (they want proof first) */
  minConviction: number;
  food: number;
  /** nights until the goods arrive */
  delay: number;
  limit: number;
  /** landmark kind that must be open (not blocked) for goods to arrive */
  via: string;
  desc: string;
}

export interface ScenarioRuntime {
  id: Id;
  version: number;
  name: string;
  tagline: string;
  briefing: string[];
  durationDays: number;
  threatKind: 'flood' | 'drought' | 'wolves' | 'fire' | 'mixed';
  claimDefs: ClaimDef[];
  rituals: RitualDef[];
  threat: ThreatDay[];
  objectives: ObjectiveDef[];
  rivals: RivalDef[];
  beats: BeatDef[];
  features: Record<string, boolean>;
  consts: Record<string, number>;
  /** score weights etc. */
  score: { survivors: number; homes: number; food: number; trust: number; efficiency: number; bonus: number };
  difficulty: number; // 1..5 label
  /** landmark where the Keeper stands; people the Keeper cannot walk to cannot be reached directly */
  anchor: Id;
  /** claims offered as the starter choice on day 1 */
  starters: Id[];
  hints: string[];
  /** the climax, as a noun phrase for the debrief: "the night of the Great Surge" */
  finale?: string;
  deals?: DealDef[];
  /** which resource counters the HUD shows */
  hud?: string[];
}

// ------------------------------------------------------------------ world

export type LandmarkKind =
  | 'home'
  | 'field'
  | 'bridge'
  | 'belltower'
  | 'beacon'
  | 'mill'
  | 'market'
  | 'shelter'
  | 'hall'
  | 'chapel'
  | 'well'
  | 'pen'
  | 'campfire'
  | 'rubble'
  | 'road'
  | 'granary'
  | 'cabin';

export interface Landmark {
  id: Id;
  kind: LandmarkKind;
  name: string;
  x: number;
  y: number;
  district: Id;
  hp: number;
  maxHp: number;
  /** beacons/campfires: lit now */
  lit: boolean;
  /** nights of fuel remaining while lit */
  fuelNights: number;
  capacity: number;
  /** fields / bridge deck / multi-tile footprints */
  tiles: [number, number][];
  /** misc numeric state: crop growth, yield, livestock, watchers, ringing, ... */
  data: Record<string, number>;
}

export interface RegionDef {
  id: Id;
  name: string;
  rects: [number, number, number, number][];
}

export interface WorldState {
  w: number;
  h: number;
  terrain: number[];
  elev: number[];
  /** region index per tile (index into regions, -1 none) */
  region: number[];
  regions: RegionDef[];
  /** flood depth tonight */
  water: number[];
  /** fire intensity 0..3 */
  fire: number[];
  /** 1 if tile burned */
  burned: number[];
  /** smoke density 0..3 */
  smoke: number[];
  landmarks: Landmark[];
  stocks: Record<string, number>;
  /** current river level (flood) */
  level: number;
  /** predator packs (wolves scenario) */
  packs: Pack[];
}

export interface Pack {
  id: Id;
  x: number;
  y: number;
  size: number;
  hunger: number;
  /** tiles it will probe next (for forecast) */
  target: Id | null;
  lastKill: number;
}

// ------------------------------------------------------------------ people

export interface Traits {
  skepticism: number;
  openness: number;
  stubbornness: number;
  susceptibility: number;
  influence: number;
}

export interface Belief {
  conv: number;
  /** times this claim was heard (saturating) */
  heard: number;
  lastDay: number;
  lastSource: Id | null;
  /** firsthand evidence weight 0..100 */
  evidence: number;
  /** event id that last raised conviction (for causal chains) */
  cause: number | null;
  /** days since last reinforcement (fatigue) */
  stale: number;
}

export type Duty = 'work' | 'rest' | 'evacuate' | 'shelter' | 'watch' | 'messenger' | 'trapped' | 'hide' | 'guard';

/** A bounded record of something a villager saw: a law failing or working, a proof backfiring. */
export interface MemoryItem {
  /** law_harmed (V2): a belief the Keeper wrote damaged their livelihood */
  kind: 'law_failed' | 'law_worked' | 'proof_failed' | 'law_harmed';
  day: number;
  claim?: Id;
  text: string;
}

export interface Villager {
  id: Id;
  name: string;
  role: string;
  archetype: string;
  faction: Id;
  household: Id;
  homeId: Id;
  workId: Id;
  district: Id;
  x: number;
  y: number;
  place: Id;
  status: 'ok' | 'injured' | 'sick' | 'dead';
  duty: Duty;
  dutyNote: string;
  traits: Traits;
  health: number;
  fear: number;
  energy: number;
  hunger: number;
  keeperTrust: number;
  beliefs: Record<Id, Belief>;
  want: string;
  look: { hue: number; skin: number; hair: number; hat: number; build: number };
  scoutedUntil: number;
  grudge: number;
  busyUntil: number;
  deathDay: number | null;
  deathCause: string | null;
  /** capped list of what they have witnessed; absent until something is remembered */
  memory?: MemoryItem[];
}

export interface Edge {
  a: Id;
  b: Id;
  /** what a thinks of b (credibility of b's words to a) */
  ab: number;
  ba: number;
  rate: number;
  kind: 'household' | 'friend' | 'work' | 'faction' | 'rival' | 'kin' | 'trade' | 'neighbor';
}

export interface Faction {
  id: Id;
  name: string;
  kind: 'council' | 'scholars' | 'storykeepers' | 'hearth';
  leader: Id;
  color: string;
  priorities: string;
  trustInKeeper: number;
  budget: number;
  cooldownUntil: number;
  grievance: number;
}

export interface ClaimState {
  id: Id;
  available: boolean;
  introduced: boolean;
  introducedDay: number | null;
  /** copied definition for custom claims (so replays do not depend on registry drift) */
  def: ClaimDef | null;
}

export type LawStatus = 'dormant' | 'awakening' | 'active' | 'wavering' | 'suppressed';

export interface LawState {
  id: Id;
  claimId: Id;
  regionId: Id;
  status: LawStatus;
  progress: number;
  pressure: number;
  /** effect strength 0..1 applied last night */
  strength: number;
  supporters: Id[];
  opponents: Id[];
  topShare: number;
  activatedDay: number | null;
  changedDay: number;
  /** last reason the status changed or is held back */
  note: string;
  activeNights: number;
}

export interface RivalState {
  factionId: Id;
  claim: Id;
  /** planned action to execute on a given day (telegraphed) */
  plan: { day: number; kind: 'campaign' | 'rebuttal' | 'ban' | 'sabotage'; target: Id | null; reason: string; eventId: number } | null;
  budget: number;
  actions: number;
  lastActionDay: number;
  countered: number;
  active: boolean;
}

// ------------------------------------------------------------------ actions & events

export type Action =
  | { type: 'SCOUT'; target: Id }
  | { type: 'SEED'; claim: Id; target: Id }
  | { type: 'MESSENGER'; claim: Id; from: Id; to: Id }
  | { type: 'RITUAL'; ritual: Id; landmark: Id; claim?: Id }
  | { type: 'GATHER'; claim: Id; site: Id; invite?: Id[] }
  | { type: 'COUNTER'; claim: Id; against: Id; target: Id }
  | { type: 'PICK_STARTER'; claim: Id }
  | { type: 'TRADE'; deal: Id; target: Id }
  /** `meta`: what the inference service reported for a model's reading (kept in the action log for the ledger; the engine ignores it) */
  | { type: 'COMPOSE'; claim: ClaimDef; meta?: InferenceMeta }
  /** decisions a model proposed for villagers due to think today (V2 minds); bound to the run revision the request was built at */
  | { type: 'NPC_DECIDE'; rev: number; decisions: NpcChoiceInput[]; model?: string; id?: string; meta?: InferenceMeta }
  /** the Keeper talks with a villager (V2 minds): ask, argue for, challenge, or ask what they make of things; `reply` is a model's line */
  | { type: 'TALK'; target: Id; mode: 'ask' | 'persuade' | 'challenge' | 'guess'; claim?: Id; reply?: { line: string; cites: string[] }; meta?: InferenceMeta }
  | { type: 'END_DAY' };

/** What the inference service reported about one model call (save/ledger.ts): never a key, a prompt or a raw answer. */
export interface InferenceMeta {
  provider?: string;
  model?: string;
  tier?: string;
  promptVersion?: string;
  id?: string;
  latencyMs?: number;
  cached?: boolean;
  costUsd?: number;
  tokens?: number;
}

/** A villager decision as it arrives from outside the engine (validated against the live run before anything uses it). */
export interface NpcChoiceInput {
  citizenId: string;
  intent: string;
  target: string | null;
  claimId: string | null;
  dialogue: string | null;
  cites: string[];
  tone: string;
  approach: string;
  confidence: number;
  thought: string;
}

export type ActionType = Action['type'];

export type EventStep = 'action' | 'social' | 'law' | 'rival' | 'hazard' | 'needs' | 'eval' | 'dawn';

export interface GameEvent {
  id: number;
  day: number;
  step: EventStep;
  code: string;
  actor?: Id;
  target?: Id;
  claim?: Id;
  law?: Id;
  tile?: [number, number];
  /** numeric deltas keyed by label: [before, after] */
  delta?: Record<string, [number, number]>;
  reason?: string;
  /** earlier event ids that caused this one */
  cause?: number[];
  /** 0 noise, 1 normal, 2 important, 3 headline */
  importance: 0 | 1 | 2 | 3;
  text: string;
}

export interface ActionRecord {
  day: number;
  action: Action;
  cost: number;
}

export interface DayRecord {
  day: number;
  actions: Action[];
  summary: DaySummary;
}

export interface DaySummary {
  day: number;
  headline: string;
  lines: string[];
  newBelievers: number;
  lawsChanged: string[];
  homesSpared: number;
  homesLost: number;
  deaths: number;
  eventIds: number[];
}

export interface RunStats {
  apSpent: number;
  actions: number;
  seeds: number;
  rituals: number;
  gatherings: number;
  counters: number;
  messengers: number;
  scouts: number;
  failedEvidence: number;
  goodEvidence: number;
  lawsActivated: string[];
  lawsCollapsed: number;
  peakPressure: Record<Id, number>;
  homesSpared: number;
  livesSaved: number;
  fieldsBurned: number;
  rivalActions: number;
  rivalCountered: number;
  firstBeliefDay: number | null;
  firstLawDay: number | null;
  noBeacons: boolean;
  usedClaims: Id[];
  customLaws: number;
  tradeDeals: number;
}

export interface Outcome {
  result: 'victory' | 'defeat';
  day: number;
  reason: string;
  heroic: boolean;
  score: number;
  breakdown: Record<string, number>;
  /** product of difficulty, pledges, draft and twists applied to the breakdown total */
  multiplier: number;
  medal: 'none' | 'bronze' | 'silver' | 'gold';
  failedObjectives: Id[];
}

export interface RunState {
  schemaVersion: number;
  rulesVersion: string;
  scenarioId: Id;
  scenarioVersion: number;
  seed: number;
  difficulty: Difficulty;
  mode: RunMode;
  modifiers: Id[];
  day: number;
  maxDay: number;
  phase: Phase;
  outcome: Outcome | null;
  ap: number;
  apMax: number;
  apPerDay: number;
  freeScoutUsed: boolean;
  starter: Id | null;
  villagers: Villager[];
  edges: Edge[];
  factions: Faction[];
  claims: ClaimState[];
  laws: LawState[];
  rivals: RivalState[];
  world: WorldState;
  /** actual (jittered) threat schedule */
  threat: ThreatDay[];
  log: GameEvent[];
  nextEventId: number;
  today: ActionRecord[];
  history: DayRecord[];
  stats: RunStats;
  flags: Record<string, number>;
  beatsSeen: Id[];
  /** static scenario definition; shared by reference between clones, never mutated */
  scn: ScenarioRuntime;
  /** Generative Reality runs only (src/engine/reality/state.ts); absent in every classic run */
  v2?: RealityState;
}

// ------------------------------------------------------------------ results

export interface ActionError {
  code: string;
  message: string;
  alternatives?: string[];
}

export type ActionResult =
  | { ok: true; state: RunState; events: GameEvent[]; cost: number; summary: string }
  | { ok: false; error: ActionError };

export interface ResolveResult {
  state: RunState;
  events: GameEvent[];
  summary: DaySummary;
}

export interface CreateRunOptions {
  scenarioId: Id;
  seed: number;
  difficulty?: Difficulty;
  mode?: RunMode;
  modifiers?: Id[];
  /** Daily Village: the UTC date (YYYYMMDD) the run was made for; stored in the run so it never changes mid-run */
  dailyDate?: number;
  /** self-imposed restrictions (unlockable); each is enforced by the engine and raises the score multiplier */
  pledges?: Id[];
  /** keep only these player-side stories (unlockable draft) */
  draft?: Id[];
  /** unlocked optional starting stories to add to the opening choice */
  extraClaims?: Id[];
  /** Inventor run: the Keeper may write beliefs of their own (unranked: it earns no scores, badges or atlas entries except its own) */
  inventor?: boolean;
  /** Generative Reality run: beliefs written in the reality language, chickens and loose stones (separate records from Classic) */
  reality?: boolean;
  /** Reality Lab: a Generative Reality run with relaxed balance, unranked (computation and safety limits are never relaxed) */
  realityLab?: boolean;
  /** the written-belief rules to create a Generative Reality run under (default: the current ones); for replaying older records */
  realityRules?: number;
  /** Living Village: the chapter with villager minds at full voice (more of them think each day); its own stories only, own records */
  living?: boolean;
}
