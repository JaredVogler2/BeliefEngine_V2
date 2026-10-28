/**
 * The Belief Engine game service behind the MCP adapter. Transport-free: `mcp/server.ts` (stdio) and the tests both call it.
 *
 * It is an *adapter*, not a second simulation. Every mutation goes through the same `GameSession` / `applyAction` / `resolveDay`
 * the browser uses; the only things added here are run bookkeeping (ids, revisions, idempotency, persistence) and read-only views built
 * from the same selectors the browser draws. Agents see exactly what a player sees: villagers' private convictions stay masked unless
 * scouted or just spoken to, nothing about future dice is exposed, and no tool can set a random outcome, move a villager or skip a cost.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  GEN_VERSION, GameSession, MAX_SEED, RULES_VERSION, buildDebrief, nightReport, findCounterfactual, deserializeRun, describeAction, eventHash, expeditionId, getAvailableActions, getForecast, getHud, getLawViews, getScenarioDef,
  getVillagerView, listScenarios, parseExpeditionId, previewAction, serializeRun, stateHash, influenceRanks, getHand, objectiveStatuses, interpretBelief, allOffers, MAX_CUSTOM_CLAIMS,
  MAX_REALITY_CLAIMS, optionsFromState, stagingOmen, deriveLedger, checkLedger, ledgerSummary,
} from '../src/engine/index.ts';
import type { InferenceMeta, Ledger } from '../src/engine/index.ts';
import type { Draft } from '../src/engine/index.ts';
import type { RealityDraft } from '../src/engine/reality/build.ts';
import { readBelief } from '../src/engine/reality/read.ts';
import { realityRules } from '../src/engine/reality/state.ts';
import { findClaimDef } from '../src/engine/core/lookup.ts';
import type { AiClient } from '../src/ai/client.ts';
import type { OnlineReader } from './online.ts';
import {
  ERRORS_VERSION, candidatesOf, describeCandidate, errorKind, needsAcknowledgement, objectView, regionView, ruleExplanation, socialGraph, variantOf, variantOfOptions, variantOptions, villagerPublic, writing, type Variant,
} from './v2.ts';
import type { Action, CreateRunOptions, Difficulty, GameEvent, RunState } from '../src/engine/index.ts';
import { replayVersions, versionDrift, type ReplayVersions } from '../src/engine/save/versions.ts';
import { claimDef } from '../src/engine/core/lookup.ts';
import { computePressure } from '../src/engine/laws/resolver.ts';
import { effectText } from '../src/engine/core/selectors.ts';
import { predictedWater } from '../src/engine/ai/routines.ts';
import { TERRAIN_NAMES } from '../src/engine/world/grid.ts';

export const SERVER_VERSION = '0.1.0';

// ------------------------------------------------------------------ input schemas (shared with the MCP tool registrations)

const id = z.string().regex(/^[A-Za-z0-9_.:@+-]{1,80}$/, 'ids contain only letters, digits and _ . : @ + -');
export const runIdSchema = z.string().regex(/^r_[0-9a-f]{32}$/, 'a run id looks like r_ followed by 32 hex characters');

/** Every action an agent may take. END_DAY has its own tool; COMPOSE goes through submit_belief / confirm_belief. */
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PICK_STARTER'), claim: id }),
  z.object({ type: z.literal('SCOUT'), target: id }),
  z.object({ type: z.literal('SEED'), claim: id, target: id }),
  z.object({ type: z.literal('MESSENGER'), claim: id, from: id, to: id }),
  z.object({ type: z.literal('RITUAL'), ritual: id, landmark: id, claim: id.optional() }),
  z.object({ type: z.literal('GATHER'), claim: id, site: id, invite: z.array(id).max(8).optional() }),
  z.object({ type: z.literal('COUNTER'), claim: id, against: id, target: id }),
  z.object({ type: z.literal('TRADE'), deal: id, target: id }),
]);
export type AgentAction = z.infer<typeof actionSchema>;

// ------------------------------------------------------------------ results

export interface ToolError {
  code: string;
  message: string;
  alternatives?: string[];
  currentRevision?: number;
  /** the stable category (mcp/v2.ts ERROR_KINDS, errorsVersion 2); `code` is the detail */
  kind?: string;
  errorsVersion?: number;
}
export type ToolResult = { ok: true; data: Record<string, unknown>; text: string } | { ok: false; error: ToolError };
const ok = (text: string, data: Record<string, unknown>): ToolResult => ({ ok: true, text, data });
const fail = (code: string, message: string, extra: Partial<ToolError> = {}): ToolResult => ({ ok: false, error: { code, message, ...extra, kind: errorKind(code), errorsVersion: ERRORS_VERSION } });

// ------------------------------------------------------------------ runs

type Mode = 'delegate' | 'coach';

interface RunRecord {
  id: string;
  mode: Mode;
  options: CreateRunOptions;
  session: GameSession;
  revision: number;
  /** accepted actions in order, END_DAY included: the replay log (the session's own log is lost on reload) */
  actions: Action[];
  idem: Map<string, ToolResult>;
  createdAt: number;
  updatedAt: number;
  /** for imported runs: the save the run started from (the replay log starts there, not at day 1) */
  base?: string;
}

export interface ServiceOptions {
  /** directory for run files; null keeps everything in memory (tests) */
  home: string | null;
  maxRuns?: number;
  /** register the clearly-flagged debug tools (never on by default, never on a public endpoint) */
  debugTools?: boolean;
  clock?: () => number;
  /** the game's own inference service, in-process, when the person running the server switched it on (mcp/online.ts); null: offline only */
  online?: OnlineReader | null;
}

/** How an agent asks for a model's reading or voice: never (default), if available (the offline reader otherwise), or only then. */
export type OnlineChoice = 'off' | 'prefer' | 'require';

const SAVE_FORMAT = 'belief-engine-mcp-run';
const IDEM_KEEP = 100;
const MAX_IMPORT_BYTES = 2_000_000;

function brief(e: GameEvent): Record<string, unknown> {
  const o: Record<string, unknown> = { id: e.id, day: e.day, code: e.code, importance: e.importance, text: e.text };
  if (e.actor) o.actor = e.actor;
  if (e.target) o.target = e.target;
  if (e.claim) o.claim = e.claim;
  if (e.law) o.law = e.law;
  if (e.reason) o.reason = e.reason;
  if (e.delta) o.delta = e.delta;
  if (e.cause?.length) o.cause = e.cause;
  return o;
}

const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_TOKENS = 200;

interface BeliefToken {
  runId: string;
  /** the revision it was interpreted at: informational for Inventor drafts (rebuilt at confirm time); binding for written reality beliefs */
  revision: number;
  astHash: string;
  /** an Inventor draft (submit_belief), or a reality draft (propose_belief) with whether writing it needs the agent's explicit yes */
  draft?: Draft;
  reality?: { draft: RealityDraft; needsYes: boolean; meta?: InferenceMeta };
  expiresAt: number;
  /** set once confirmed, so confirming the same token again returns the same answer instead of paying twice */
  done?: ToolResult;
}

function conciseAction(a: Action): Record<string, unknown> {
  return { ...a };
}

export class GameService {
  private runs = new Map<string, RunRecord>();
  private readonly home: string | null;
  private readonly maxRuns: number;
  readonly debugTools: boolean;
  private readonly clock: () => number;
  /** confirmation tokens for interpreted beliefs: in memory only, short-lived, bound to one run and one structure */
  private tokens = new Map<string, BeliefToken>();
  /** runs on disk that were refused on load, with the reason (a version difference, a ledger that does not match), so the caller is told why */
  private refused = new Map<string, { code: string; message: string }>();
  private readonly online: OnlineReader | null;

  constructor(opts: ServiceOptions) {
    this.online = opts.online ?? null;
    this.home = opts.home;
    this.maxRuns = opts.maxRuns ?? 50;
    this.debugTools = !!opts.debugTools;
    this.clock = opts.clock ?? (() => Date.now());
    if (this.home) mkdirSync(join(this.home, 'runs'), { recursive: true });
  }

  // ---------------------------------------------------------------- persistence

  private file(runId: string): string {
    return join(this.home!, 'runs', `${runId}.json`);
  }

  private save(r: RunRecord): void {
    if (!this.home) return;
    const body = JSON.stringify({
      format: SAVE_FORMAT, v: 1, id: r.id, mode: r.mode, options: r.options, revision: r.revision, createdAt: r.createdAt, updatedAt: r.updatedAt,
      versions: r.base ? undefined : replayVersions(r.options), actions: r.actions, idem: [...r.idem.entries()].slice(-IDEM_KEEP), base: r.base, state: serializeRun(r.session.state),
      ledger: r.session.ledger,
    });
    const tmp = this.file(r.id) + '.tmp';
    writeFileSync(tmp, body);
    renameSync(tmp, this.file(r.id));
  }

  /** Load a run from disk, refusing anything whose saved state does not match a fresh replay of its own action log. */
  private load(runId: string): RunRecord | null {
    if (!this.home || !runIdSchema.safeParse(runId).success) return null;
    const f = this.file(runId);
    if (!existsSync(f)) return null;
    try {
      const raw = JSON.parse(readFileSync(f, 'utf8')) as {
        format: string; id: string; mode: Mode; options: CreateRunOptions; revision: number; createdAt: number; updatedAt: number; actions: Action[]; idem: [string, ToolResult][]; state: string; base?: string;
        versions?: Partial<ReplayVersions>; ledger?: Ledger;
      };
      if (raw.format !== SAVE_FORMAT || raw.id !== runId) return null;
      // a run recorded under other rules, content or belief language is not silently re-played into a different result: say what differs
      const drift = raw.base ? [] : versionDrift(raw.versions, replayVersions(raw.options));
      if (drift.length) {
        this.refused.set(runId, { code: 'RUN_VERSION_MISMATCH', message: `This run was recorded under different versions than this engine has, so replaying it would not reproduce what happened: ${drift.join('; ')}. The file is kept untouched on disk; open it with the engine version that recorded it.` });
        return null;
      }
      const loaded = deserializeRun(raw.state);
      if (!loaded.ok) return null;
      // replay the run's own log from where it started (no network, no model): it must reach the saved state exactly
      let start: CreateRunOptions | RunState = raw.options;
      if (raw.base) {
        const b = deserializeRun(raw.base);
        if (!b.ok) return null;
        start = b.state;
      }
      const derived = deriveLedger(start, raw.actions);
      if (derived.rejected.length || derived.hash !== stateHash(loaded.state)) return null; // tampered or corrupt: never trust it
      // and its record of external inputs must be what that replay used (a file from before the ledger has none: derived here)
      const check = checkLedger(raw.ledger, derived, derived.hash);
      if (!check.ok && !(check.code === 'LEDGER_MISSING' && raw.ledger === undefined)) {
        this.refused.set(runId, { code: check.code, message: `${check.message} ${check.recovery} The file is kept untouched on disk.` });
        return null;
      }
      return {
        id: runId, mode: raw.mode, options: raw.options, session: new GameSession(loaded.state, derived.ledger), revision: raw.revision, actions: raw.actions,
        idem: new Map(raw.idem), createdAt: raw.createdAt, updatedAt: raw.updatedAt, base: raw.base,
      };
    } catch {
      return null;
    }
  }

  private get(runId: string): RunRecord | ToolResult {
    const parsed = runIdSchema.safeParse(runId);
    if (!parsed.success) return fail('BAD_RUN_ID', 'That is not a run id. Use the runId returned by create_game.');
    let r = this.runs.get(runId);
    if (!r) {
      const loaded = this.load(runId);
      if (loaded) {
        this.runs.set(runId, loaded);
        r = loaded;
      }
    }
    const why = this.refused.get(runId);
    if (!r && why) return fail(why.code, why.message);
    return r ?? fail('UNKNOWN_RUN', 'No such run on this server. Start one with create_game, or import_game.');
  }

  private newId(): string {
    return `r_${randomBytes(16).toString('hex')}`;
  }

  private register(options: CreateRunOptions, mode: Mode, session?: GameSession, actions: Action[] = []): RunRecord | ToolResult {
    if (this.runs.size >= this.maxRuns) return fail('RUN_LIMIT', `This server keeps at most ${this.maxRuns} runs. Finish or forget one first.`, { alternatives: ['get_results on a finished run', 'restart the server to clear memory-only runs'] });
    const now = this.clock();
    const r: RunRecord = { id: this.newId(), mode, options, session: session ?? GameSession.create(options), revision: 0, actions, idem: new Map(), createdAt: now, updatedAt: now };
    this.runs.set(r.id, r);
    this.save(r);
    return r;
  }

  // ---------------------------------------------------------------- views shared by several tools

  private stateView(r: RunRecord, detail: 'brief' | 'full' = 'brief'): Record<string, unknown> {
    const s = r.session.state;
    const hud = getHud(s);
    const laws = getLawViews(s).filter((l) => l.status !== 'dormant' || l.pressure > 0 || !l.rival);
    const fc = getForecast(s);
    const recent = s.log.filter((e) => e.importance >= 2).slice(-8).map(brief);
    const view: Record<string, unknown> = {
      runId: r.id,
      revision: r.revision,
      // who may act on this run (delegate: the agent, coach: read-only); not the game mode, which is gameMode
      controller: r.mode,
      gameMode: s.mode,
      variant: variantOf(s),
      ...(s.v2 ? { generative: { realityRules: realityRules(s), canWriteBeliefs: !s.v2.living, beliefsWritten: s.claims.filter((c) => c.def?.reality && !c.def.rival).length, maxBeliefs: MAX_REALITY_CLAIMS + (s.v2.lab ? 2 : 0), ranked: !s.v2.lab } } : {}),
      scenario: { id: s.scenarioId, name: s.scn.name },
      seed: s.seed,
      difficulty: s.difficulty,
      day: s.day,
      maxDay: s.maxDay,
      phase: s.phase,
      influence: { remaining: s.ap, max: s.apMax, perDay: s.apPerDay },
      openingStoryChosen: s.starter !== null,
      ...(s.flags.inventor ? { inventor: { unranked: true, beliefsWritten: s.claims.filter((c) => c.def?.custom).length, maxBeliefs: MAX_CUSTOM_CLAIMS } } : {}),
      starters: s.starter === null ? s.scn.starters.map((c) => ({ claim: c, text: claimDef(s, c).text, short: claimDef(s, c).short })) : undefined,
      objectives: objectiveStatuses(s),
      tonight: { label: hud.threatLabel, warning: hud.warning ?? null, kind: fc.kind, omens: fc.tonight.omen },
      resources: { alive: hud.alive, population: hud.total, homesStanding: hud.homes, homes: hud.homesTotal, food: hud.food, fuel: hud.fuel, livestock: hud.livestock, sick: hud.sick },
      laws: laws.map((l) => ({ id: l.id, claim: l.claimId, short: l.short, region: l.regionName, status: l.status, support: Math.round(l.pressure * 100), supportNeeded: Math.round(l.on * 100), progress: Math.round(l.progress), firmBelievers: l.supporters.length, needsFirmBelievers: l.minSupporters, trigger: l.trigger, rival: l.rival, note: l.note })),
      recentEvents: recent,
    };
    if (detail === 'full') {
      view.forecast = {
        homesAtRisk: fc.homesAtRisk.length,
        peopleAtRisk: fc.peopleAtRisk.map((p) => ({ id: p.id, name: p.name, note: p.note })),
        bridge: fc.bridge,
        food: fc.food,
        packs: fc.packs,
        pens: fc.pens,
        crops: fc.crops ? { ripe: fc.crops.ripe, total: fc.crops.total, avgGrowth: fc.crops.avgGrowth, avgMoisture: fc.crops.avgMoisture } : null,
        caravans: fc.caravans,
        upcoming: fc.upcoming,
        lawNotes: fc.lawNotes,
      };
      view.hand = getHand(s).filter((c) => c.available || c.unlockDay !== null).map((c) => ({ id: c.id, text: c.text, available: c.available, unlockDay: c.unlockDay, rival: c.rival, believers: c.believers, ritual: c.ritualLabel }));
    }
    if (s.outcome) view.outcome = { result: s.outcome.result, reason: s.outcome.reason, day: s.outcome.day, score: s.outcome.score, medal: s.outcome.medal };
    return view;
  }

  private nextSteps(r: RunRecord): string[] {
    const s = r.session.state;
    if (s.outcome) return ['get_results to read the debrief', 'retry_or_new_game to play again'];
    if (s.starter === null) return ['take_action with PICK_STARTER (see starters in get_game_state)'];
    if (r.mode === 'coach') return ['This run is read-only (coach mode). Recommend actions; the human plays them in the browser, or call grant_control.'];
    return s.ap > 0 ? ['list_actions or compare_possible_actions, then take_action', 'end_day when you are done planning'] : ['end_day (no Influence left today)'];
  }

  // ---------------------------------------------------------------- tools

  listScenarios(): ToolResult {
    const list = listScenarios().map((l) => {
      const def = getScenarioDef(l.id).runtime;
      return {
        id: l.id, name: l.name, tagline: l.tagline, days: l.days, difficulty: l.difficulty, danger: l.threat, version: l.version,
        mission: def.briefing, objectives: def.objectives.filter((o) => !o.instantLoss).map((o) => o.label), openingStories: def.starters.map((c) => ({ claim: c, text: def.claimDefs.find((d) => d.id === c)!.text })),
      };
    });
    return ok(`${list.length} story chapters plus generated villages. Rules ${RULES_VERSION}.`, {
      rulesVersion: RULES_VERSION,
      serverVersion: SERVER_VERSION,
      scenarios: list,
      modes: [
        { mode: 'story', how: 'create_game({scenarioId: "redbank" | "harvest" | "ashwood", seed?, difficulty?})' },
        { mode: 'expedition', how: `create_game({mode: "expedition", seed: 0..${MAX_SEED}}) builds the generated village x${GEN_VERSION}.<seed>; the same seed always gives the same village` },
      ],
      difficulties: ['story', 'normal', 'hard'],
      variants: [
        { variant: 'classic', what: 'the hand-made stories, offline; Classic records' },
        { variant: 'generative', what: 'Generative Chronicle: write beliefs of your own (propose_belief, confirm_belief); its own records' },
        { variant: 'living', what: 'Living Village: the chapter\'s own stories with villagers who remember, argue and demand proof; no writing; its own records' },
        { variant: 'lab', what: 'Reality Lab: stronger written beliefs (three clauses, wider reach), never ranked' },
      ],
    });
  }

  createGame(a: { scenarioId?: string; seed?: number; difficulty?: Difficulty; mode?: 'story' | 'expedition'; controller?: Mode; inventor?: boolean; variant?: Variant }): ToolResult {
    const difficulty = a.difficulty ?? 'normal';
    const variant = a.variant ?? 'classic';
    if (a.inventor && variant !== 'classic')
      return fail('INVALID_ARGUMENT', 'Inventor is the Classic composer. A Generative run writes beliefs of its own with propose_belief; leave inventor out.', { alternatives: ['create_game { variant: "generative" }', 'create_game { inventor: true } (Classic)'] });
    const mode = a.mode ?? 'story';
    let seed = a.seed;
    if (seed === undefined) seed = randomBytes(4).readUInt32LE(0) % (mode === 'expedition' ? MAX_SEED + 1 : 1_000_000);
    let scenarioId = a.scenarioId;
    if (mode === 'expedition') {
      if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) return fail('BAD_SEED', `Expedition seeds are whole numbers from 0 to ${MAX_SEED}.`);
      scenarioId = expeditionId(seed);
    }
    if (!scenarioId) return fail('BAD_SCENARIO', 'Give a scenarioId (see list_scenarios) or mode "expedition" with a seed.', { alternatives: listScenarios().map((l) => l.id) });
    if (!listScenarios().some((l) => l.id === scenarioId) && !parseExpeditionId(scenarioId)) return fail('BAD_SCENARIO', `Unknown scenario "${scenarioId}".`, { alternatives: listScenarios().map((l) => l.id) });
    if (!Number.isInteger(seed)) return fail('BAD_SEED', 'The seed must be a whole number.');
    const options: CreateRunOptions = { scenarioId, seed, difficulty, mode: mode === 'expedition' ? 'expedition' : 'story', ...(a.inventor ? { inventor: true } : {}), ...variantOptions(variant) };
    let session: GameSession;
    try {
      session = GameSession.create(options);
    } catch (e) {
      return fail('BAD_SCENARIO', e instanceof Error ? e.message : 'The village could not be built.');
    }
    const r = this.register(options, a.controller ?? 'delegate', session);
    if (!('id' in r)) return r;
    const s = r.session.state;
    const label = { classic: '', generative: ', Generative Chronicle: write beliefs with propose_belief', living: ', Living Village', lab: ', Reality Lab: unranked' }[variant];
    return ok(`Started ${s.scn.name} (seed ${s.seed}, ${s.difficulty}${a.inventor ? ', Inventor run: unranked' : ''}${label}). Day 1 of ${s.maxDay}; ${s.ap} Influence. Choose an opening story first.`, {
      runId: r.id,
      access: { scope: 'this server process and its home directory only', controller: r.mode, note: 'Run ids are unguessable but are not a security boundary; do not expose this server over a network.' },
      briefing: s.scn.briefing,
      ...this.stateView(r),
      nextValidActions: this.actionTemplates(r, undefined, 12),
    });
  }

  getGameState(a: { runId: string; detail?: 'brief' | 'full' }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const v = this.stateView(r, a.detail ?? 'brief');
    return ok(this.headline(r), { ...v, nextSteps: this.nextSteps(r) });
  }

  private headline(r: RunRecord): string {
    const s = r.session.state;
    const hud = getHud(s);
    if (s.outcome) return `${s.scn.name}: ${s.outcome.result === 'victory' ? 'VICTORY' : 'DEFEAT'} on day ${s.outcome.day}. ${s.outcome.reason}`;
    return `${s.scn.name}, day ${s.day}/${s.maxDay}. Influence ${s.ap}/${s.apMax}. ${hud.alive}/${hud.total} alive, ${hud.homes}/${hud.homesTotal} homes, food ${hud.food}. ${hud.threatLabel}.`;
  }

  inspectMap(a: { runId: string; region?: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    const w = s.world;
    let region: { id: string; rects: [number, number, number, number][] } | undefined;
    if (a.region) {
      region = w.regions.find((x) => x.id === a.region);
      if (!region) return fail('BAD_REGION', `Unknown region "${a.region}".`, { alternatives: w.regions.map((x) => x.id) });
    }
    const inside = (x: number, y: number) => !region || region.rects.some((q) => x >= q[0] && x <= q[2] && y >= q[1] && y <= q[3]);
    const water = s.scn.features.flood ? predictedWater(s) : null;
    const glyph = (x: number, y: number): string => {
      const i = y * w.w + x;
      const lm = w.landmarks.find((l) => l.x === x && l.y === y);
      if (lm) {
        const g: Record<string, string> = { home: 'H', cabin: 'h', bridge: 'B', belltower: 'Q', beacon: lm.lit ? '*' : 'b', mill: 'M', market: 'K', shelter: 'S', hall: 'A', chapel: 'C', well: 'O', pen: 'P', campfire: lm.lit ? '+' : 'c', rubble: 'x', road: '=', granary: 'G', field: 'F' };
        return g[lm.kind] ?? '?';
      }
      if (s.villagers.some((v) => v.status !== 'dead' && v.x === x && v.y === y)) return '@';
      if (w.fire[i] > 0) return '!';
      if (water && water[i] > 0 && w.terrain[i] !== 1) return String(Math.min(9, water[i]));
      const t = w.terrain[i];
      return t === 1 ? '~' : t === 3 ? '^' : t === 4 ? 'T' : t === 5 ? '=' : t === 2 ? 'f' : t === 6 ? '#' : t === 7 ? ',' : t === 8 ? ':' : '.';
    };
    const rows: string[] = [];
    const xs: number[] = [];
    for (let x = 0; x < w.w; x++) if (!region || [...Array(w.h).keys()].some((y) => inside(x, y))) xs.push(x);
    for (let y = 0; y < w.h; y++) {
      if (region && !xs.some((x) => inside(x, y))) continue;
      rows.push(`${String(y).padStart(2)} ` + xs.map((x) => (inside(x, y) ? glyph(x, y) : ' ')).join(''));
    }
    const header = '   ' + xs.map((x) => (x % 5 === 0 ? String(x % 10) : ' ')).join('');
    const landmarks = w.landmarks.filter((l) => inside(l.x, l.y)).map((l) => ({
      id: l.id, kind: l.kind, name: l.name, x: l.x, y: l.y, district: l.district, hp: l.hp, maxHp: l.maxHp, lit: l.kind === 'beacon' || l.kind === 'campfire' ? l.lit : undefined, fuelNights: l.lit ? l.fuelNights : undefined,
      ...(l.kind === 'bridge' ? { watchers: l.data.watchers ?? 0, standing: l.hp > 0 } : {}), ...(l.kind === 'pen' ? { stock: l.data.stock ?? 0 } : {}),
    }));
    const people = s.villagers.filter((v) => inside(v.x, v.y)).map((v) => ({ id: v.id, name: v.name, x: v.x, y: v.y, place: v.place, status: v.status, duty: v.duty }));
    const cutOff = s.villagers.filter((v) => v.status !== 'dead' && !getVillagerView(s, v.id).canBeReached).map((v) => v.id);
    return ok(`${w.w}x${w.h} map${region ? ` (region ${region.id})` : ''}. ${landmarks.length} landmarks, ${people.length} people.`, {
      runId: r.id, revision: r.revision, grid: { width: w.w, height: w.h, rows: [header, ...rows] },
      legend: { '~': 'river', '.': 'grass', f: 'field soil', '^': 'hill', T: 'forest', '=': 'road or bridge deck', '#': 'rock', ',': 'marsh', ':': 'sand', '@': 'villager', '!': 'fire', '1-9': "depth of tonight's predicted floodwater (forecast, assuming nothing else changes)", H: 'home', h: 'cabin', B: 'bridge', Q: 'bell tower', '*': 'lit beacon', b: 'unlit beacon', '+': 'lit smoke fire', c: 'unlit fire', M: 'mill', K: 'market', S: 'shelter', A: 'hall', C: 'chapel', O: 'well', P: 'pen', G: 'granary', F: 'field', x: 'rubble' },
      terrainNames: TERRAIN_NAMES,
      regions: w.regions.map((x) => ({ id: x.id, name: x.name })),
      landmarks, villagers: people, peopleTheKeeperCannotReach: cutOff,
    });
  }

  inspectVillager(a: { runId: string; villagerId: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    if (!s.villagers.some((v) => v.id === a.villagerId)) return fail('UNKNOWN_VILLAGER', `No villager "${a.villagerId}".`, { alternatives: s.villagers.slice(0, 20).map((v) => v.id) });
    const v = getVillagerView(s, a.villagerId);
    const acts = getAvailableActions(s, { villager: a.villagerId }).filter((o) => o.cost > 0).slice(0, 12).map((o) => ({ action: conciseAction(o.action), label: o.label, cost: o.cost }));
    return ok(`${v.name}, ${v.role}. ${v.scouted ? 'Their convictions are known right now.' : 'Their private convictions are hidden (scout them or speak to them to see exact numbers).'}`, {
      runId: r.id, revision: r.revision, villager: villagerPublic(s, a.villagerId), feasibleActions: acts,
    });
  }

  inspectClaim(a: { runId: string; claimId: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    let def;
    try {
      def = claimDef(s, a.claimId);
    } catch {
      return fail('UNKNOWN_CLAIM', `No claim "${a.claimId}".`, { alternatives: s.scn.claimDefs.map((c) => c.id) });
    }
    const state = s.claims.find((c) => c.id === a.claimId);
    const laws = getLawViews(s).filter((l) => l.claimId === a.claimId);
    const ranks = influenceRanks(s);
    const top = s.villagers.filter((v) => v.status !== 'dead').sort((x, y) => (ranks.get(x.id) ?? 99) - (ranks.get(y.id) ?? 99)).slice(0, 5).map((v) => ({ id: v.id, name: v.name, influenceRank: ranks.get(v.id) }));
    return ok(`“${def.text}” (${def.rival ? 'a rival rumour' : state?.available ? 'in your hand' : 'not yet available'}).`, {
      runId: r.id, revision: r.revision,
      claim: {
        id: def.id, text: def.text, short: def.short, rival: !!def.rival, adoptable: !!def.adoptable, available: !!state?.available, unlockDay: def.unlockDay ?? null,
        effect: effectText(def), benefit: def.benefit, risk: def.risk,
        subject: def.spec.subject, effectKind: def.spec.effect, trigger: def.spec.trigger, radius: def.spec.radius, intensity: def.spec.intensity, upkeepFuel: def.spec.upkeep.fuel, sideEffects: def.spec.side,
        thresholds: def.spec.thresholds, contradicts: def.contradicts, regions: def.regions, ritual: def.ritual ?? null,
      },
      support: def.regions.map((reg) => {
        const p = computePressure(s, def.id, reg);
        return { region: reg, supportPercent: Math.round(p.pressure * 100), neededPercent: Math.round(def.spec.thresholds.on * 100), firmBelievers: p.supporters.length, neededFirmBelievers: def.spec.thresholds.minSupporters, voters: p.eligible };
      }),
      laws: laws.map((l) => ({ id: l.id, region: l.regionName, status: l.status, progress: l.progress, strength: l.strength, note: l.note, threats: l.threats, nextSteps: l.nextSteps })),
      mostInfluentialVillagers: top,
    });
  }

  private actionTemplates(r: RunRecord, targetId: string | undefined, limit: number, includeDisabled = false): Record<string, unknown>[] {
    const s = r.session.state;
    const sel = targetId ? (s.villagers.some((v) => v.id === targetId) ? { villager: targetId } : { landmark: targetId }) : {};
    const opts = getAvailableActions(s, sel, { includeDisabled });
    return opts.slice(0, limit).map((o) => ({ action: conciseAction(o.action), label: o.label, cost: o.cost, enabled: o.enabled, ...(o.reason ? { whyNot: o.reason } : {}) }));
  }

  listActions(a: { runId: string; targetId?: string; claimId?: string; includeDisabled?: boolean; limit?: number }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    if (s.outcome) return ok('The run is over; there are no actions.', { runId: r.id, revision: r.revision, actions: [] });
    let all = getAvailableActions(s, a.targetId ? (s.villagers.some((v) => v.id === a.targetId) ? { villager: a.targetId } : { landmark: a.targetId }) : {}, { includeDisabled: !!a.includeDisabled });
    // one story's actions only (a belief just written is far down a long list otherwise)
    if (a.claimId) all = all.filter((o) => (o.action as { claim?: string }).claim === a.claimId);
    const limit = Math.min(a.limit ?? 60, 120);
    const grouped: Record<string, number> = {};
    for (const o of all) grouped[o.action.type] = (grouped[o.action.type] ?? 0) + 1;
    return ok(`${all.length} legal action${all.length === 1 ? '' : 's'}${a.targetId ? ` involving ${a.targetId}` : ''}${a.claimId ? ` for ${a.claimId}` : ''}, Influence ${s.ap}. END_DAY is always available through end_day.`, {
      runId: r.id, revision: r.revision, influence: s.ap, total: all.length, shown: Math.min(all.length, limit), byType: grouped,
      actions: all.slice(0, limit).map((o) => ({ action: conciseAction(o.action), label: o.label, cost: o.cost, enabled: o.enabled, ...(o.reason ? { whyNot: o.reason } : {}) })),
    });
  }

  /** Exact, bounded dry-runs: the same previews the browser shows on hover. Nothing is changed. */
  compareActions(a: { runId: string; actions?: AgentAction[]; top?: number }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    if (s.outcome) return fail('RUN_OVER', 'The run is over.');
    const candidates: Action[] = a.actions?.length ? a.actions.slice(0, 12) : getAvailableActions(s).filter((o) => o.cost > 0).map((o) => o.action).slice(0, 40);
    const rows = candidates.map((act) => {
      const p = previewAction(s, act);
      const gain = p.deltas.reduce((t, d) => t + Math.max(0, d.after - d.before), 0);
      return { action: conciseAction(act), label: describeAction(s, act), ok: p.ok, cost: p.cost, convictionGained: Math.round(gain), peopleMoved: p.deltas.length, warnings: p.warnings, preview: p.lines.slice(0, 3), ...(p.error ? { error: p.error.message } : {}), perInfluence: p.ok && p.cost > 0 ? Math.round((gain / p.cost) * 10) / 10 : 0 };
    });
    rows.sort((x, y) => y.perInfluence - x.perInfluence);
    const top = rows.slice(0, Math.min(a.top ?? 10, 20));
    return ok(`Compared ${rows.length} actions with exact previews; best first by conviction gained per Influence.`, { runId: r.id, revision: r.revision, note: 'Conviction is a proxy: a law also needs the right people, proof, physical set-up and time. Read inspect_claim and the forecast.', comparison: top });
  }

  private guard(r: RunRecord, a: { expectedRevision?: number; idempotencyKey?: string }): ToolResult | null {
    if (a.idempotencyKey) {
      const prior = r.idem.get(a.idempotencyKey);
      if (prior) return prior.ok ? { ...prior, data: { ...prior.data, replayedFromIdempotencyKey: true } } : prior;
    }
    if (a.expectedRevision !== undefined && a.expectedRevision !== r.revision)
      return fail('STALE_REVISION', `The run is at revision ${r.revision}, not ${a.expectedRevision}. Someone (or an earlier call) changed it; read get_game_state and decide again.`, { currentRevision: r.revision, alternatives: ['get_game_state'] });
    if (r.mode === 'coach') return fail('READ_ONLY', 'This run is in coach mode: read-only until the human grants control (grant_control).', { alternatives: ['compare_possible_actions', 'inspect_claim', 'grant_control'] });
    return null;
  }

  private remember(r: RunRecord, key: string | undefined, res: ToolResult): ToolResult {
    if (key) {
      r.idem.set(key, res);
      while (r.idem.size > IDEM_KEEP) r.idem.delete(r.idem.keys().next().value as string);
    }
    return res;
  }

  takeAction(a: { runId: string; action: AgentAction; expectedRevision?: number; idempotencyKey?: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const early = this.guard(r, a);
    if (early) return early;
    const act = a.action as Action;
    const before = r.session.state;
    const res = r.session.act(act);
    if (!res.ok) {
      const alts = getAvailableActions(before).filter((o) => o.cost > 0).slice(0, 4).map((o) => o.label);
      return fail(res.error.code, res.error.message, { alternatives: [...(res.error.alternatives ?? []), ...alts.map((l) => `e.g. ${l}`)], currentRevision: r.revision });
    }
    r.actions.push(act);
    r.revision += 1;
    r.updatedAt = this.clock();
    const s = r.session.state;
    const changed: Record<string, unknown>[] = [];
    // only what the engine's own events already reveal: the people the action touched
    for (const e of res.events) if (e.target && e.delta) changed.push({ villager: e.target, claim: e.claim, ...e.delta });
    const result = ok(res.summary || 'Done.', {
      runId: r.id, revision: r.revision, accepted: true, cost: res.cost, remainingInfluence: s.ap,
      events: res.events.map(brief), changed,
      nextValidActions: this.actionTemplates(r, undefined, 8),
      humanSummary: res.summary,
    });
    this.save(r);
    return this.remember(r, a.idempotencyKey, result);
  }

  endDay(a: { runId: string; expectedRevision?: number; idempotencyKey?: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const early = this.guard(r, a);
    if (early) return early;
    const s0 = r.session.state;
    if (s0.outcome) return fail('RUN_OVER', 'The run is over. Use get_results.', { alternatives: ['get_results', 'retry_or_new_game'] });
    if (s0.starter === null) {
      // the engine would auto-pick; an agent should choose, so refuse and say how
      return fail('CHOOSE_STORY', 'Choose your opening story before ending the day.', { alternatives: s0.scn.starters.map((c) => `take_action PICK_STARTER ${c}`) });
    }
    const res = r.session.endDay();
    r.actions.push({ type: 'END_DAY' });
    r.revision += 1;
    r.updatedAt = this.clock();
    const s = res.state;
    const important = res.events.filter((e) => e.importance >= 2).slice(0, 30).map(brief);
    // the same morning report the browser shows: who the Keeper's stories reached, or why they stayed put
    const report = nightReport(s, res.events, res.summary);
    const result = ok(report.headline || 'A quiet night.', {
      runId: r.id, revision: r.revision, day: s0.day, headline: report.headline, story: report.story, lines: res.summary.lines,
      lawChanges: res.events.filter((e) => e.code.startsWith('LAW_')).map(brief), importantEvents: important,
      finished: !!s.outcome, ...(s.outcome ? { outcome: { result: s.outcome.result, reason: s.outcome.reason, score: s.outcome.score, medal: s.outcome.medal } } : {}),
      next: this.stateView(r), nextSteps: this.nextSteps(r),
    });
    this.save(r);
    return this.remember(r, a.idempotencyKey, result);
  }

  // ---------------------------------------------------------------- natural-language beliefs (Inventor runs)

  private describeDraft(d: Draft, token: string): Record<string, unknown> {
    return {
      token,
      title: d.title,
      rating: d.rating,
      mechanics: d.mechanics,
      requires: d.requires,
      support: { localSupportPercent: d.support.percent, firmBelievers: d.support.believers },
      cost: { influenceToWrite: d.cost.compose, influencePerTelling: d.cost.perTelling },
      risks: d.risks,
      adjustments: d.adjustments,
      assumptions: d.assumptions,
      contradicts: d.contradicts,
      safetyCheck: { passed: d.stress.invariantsOk && d.stress.powered, nightsSimulated: d.stress.nights, changed: d.stress.changed, problems: d.stress.problems },
      alreadyAStory: d.existing ? { id: d.existing.id, short: d.existing.short, available: d.existing.available, unlockDay: d.existing.unlockDay } : null,
      structure: d.ast,
    };
  }

  /**
   * Interpret a sentence into bounded, balanced proposals. Changes nothing and costs nothing: no revision, no Influence. The text is
   * data: it goes to the offline reader, never to a model, a shell or a file. Each proposal carries a short-lived confirmation token.
   */
  submitBelief(a: { runId: string; text: string; targetRegion?: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    if (!s.flags.inventor)
      return fail('CAPABILITY_NOT_ENABLED', 'Writing beliefs of your own is part of Inventor runs, and this run was not started as one. Start one with create_game { inventor: true }; Inventor runs are unranked.', {
        alternatives: ['create_game { inventor: true, ... }', 'inspect_claim on a built-in story', 'take_action with a built-in claim id'],
      });
    if (s.outcome) return fail('RUN_OVER', 'The run is over. Use get_results.', { alternatives: ['get_results', 'retry_or_new_game'] });
    if (a.targetRegion && !s.world.regions.some((x) => x.id === a.targetRegion))
      return fail('BAD_REGION', `This village has no region "${a.targetRegion.slice(0, 40)}".`, { alternatives: s.world.regions.map((x) => x.id) });
    const result = interpretBelief(s, a.text, { region: a.targetRegion });
    // forget expired tokens, and keep the table small
    const now = this.clock();
    for (const [k, t] of this.tokens) if (t.expiresAt <= now) this.tokens.delete(k);
    while (this.tokens.size >= MAX_TOKENS) this.tokens.delete(this.tokens.keys().next().value as string);
    const interpretations = result.drafts.map((d) => {
      const token = randomBytes(16).toString('hex');
      this.tokens.set(token, { runId: r.id, revision: r.revision, astHash: d.claim.custom?.astHash ?? '', draft: d, expiresAt: now + TOKEN_TTL_MS });
      return this.describeDraft(d, token);
    });
    const dup = result.drafts.find((d) => d.existing);
    const dupNote = dup?.existing
      ? ` Note: reading “${dup.title}” is already the built-in story “${dup.existing.short}” (${dup.existing.available ? 'it is in your hand now: you can tell it with claim ' + dup.existing.id + ' without paying to write your own version' : `available from day ${dup.existing.unlockDay ?? 'later'}`}).`
      : '';
    const text = interpretations.length
      ? `${result.message}${dupNote} ${interpretations.length} interpretation${interpretations.length === 1 ? '' : 's'}; nothing is written until confirm_belief is called with a token.`
      : result.message;
    return ok(text, {
      runId: r.id, revision: r.revision, status: result.status, message: `${result.message}${dupNote}`, source: result.source, parser: result.parser, version: result.version,
      interpretations, rejected: result.rejected, offers: result.offers.map((o) => ({ sentence: o.sentence, builtInStory: o.builtIn })), ignoredWords: result.ignored,
      influence: { remaining: s.ap },
      confirmWith: interpretations.length ? 'confirm_belief { runId, token, expectedRevision, idempotencyKey }' : undefined,
      tokenValidSeconds: TOKEN_TTL_MS / 1000,
      note: 'Interpretations are proposals. The game rebuilds the belief from its structure when you confirm; nothing here can make it stronger or cheaper.',
    });
  }

  /** The beliefs this village can host, as sentences the composer always understands (the only guide to the vocabulary is this list and the refusals). */
  listBeliefExamples(a: { runId: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    if (!s.flags.inventor) return fail('CAPABILITY_NOT_ENABLED', 'Writing beliefs of your own is part of Inventor runs, and this run was not started as one. Start one with create_game { inventor: true }.', { alternatives: ['create_game { inventor: true, ... }'] });
    const offers = allOffers(s);
    return ok(`${offers.length} beliefs this village can host. Any of these sentences is understood exactly; a sentence of your own must name what behaves (river, rain, bridge, crops, wolves, sickness, fire), how, and what powers it (lit beacons, smoke fires, ringing bells, watchers, night).`, {
      runId: r.id, revision: r.revision, influence: { remaining: s.ap },
      examples: offers.map((o) => ({ sentence: o.sentence, title: o.title, subject: o.subject, effect: o.effect, poweredBy: o.trigger, alreadyABuiltInStory: o.builtIn })),
      beliefsWritten: s.claims.filter((c) => c.def?.custom).length, maxBeliefs: MAX_CUSTOM_CLAIMS,
      note: 'A sentence may combine two of these into one stronger belief (it costs more). Sentences about time, immortality, free food or wealth, controlling minds, or instructions to the game are refused.',
    });
  }

  /**
   * Pay for and write one interpreted belief: the same COMPOSE action the browser performs. Confirming a token twice answers the same,
   * once. A written reality belief is bound to the village as it was read (a token from an older revision is refused: read it again,
   * reading is free) and, like the browser's checkbox, one that does not do everything the sentence said needs `acknowledge: true`.
   */
  confirmBelief(a: { runId: string; token: string; expectedRevision?: number; idempotencyKey?: string; acknowledge?: boolean; title?: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const now = this.clock();
    const t = this.tokens.get(a.token);
    if (!t || t.runId !== r.id || t.expiresAt <= now)
      return fail('TOKEN_INVALID', 'That confirmation token is unknown, expired, or belongs to another run. Call submit_belief (Inventor) or propose_belief again.', { alternatives: ['propose_belief', 'submit_belief'] });
    if (t.done) return t.done.ok ? { ...t.done, data: { ...t.done.data, replayedFromToken: true } } : t.done;
    const early = this.guard(r, a);
    if (early) return early;
    if (t.reality) return this.confirmReality(r, t, a);
    const act: Action = { type: 'COMPOSE', claim: t.draft!.claim };
    const res = r.session.act(act);
    if (!res.ok) return fail(res.error.code, res.error.message, { alternatives: res.error.alternatives, currentRevision: r.revision });
    r.actions.push(act);
    r.revision += 1;
    r.updatedAt = this.clock();
    const s = r.session.state;
    const claim = t.draft!.claim;
    const result = ok(res.summary || `Wrote “${claim.short}”.`, {
      runId: r.id, revision: r.revision, accepted: true, cost: res.cost, remainingInfluence: s.ap,
      claim: { id: claim.id, short: claim.short, text: claim.text, regions: claim.regions, ritual: claim.ritual ?? null, supportNeededPercent: Math.round(claim.spec.thresholds.on * 100), firmBelieversNeeded: claim.spec.thresholds.minSupporters },
      events: res.events.map(brief),
      availableFromDay: claim.unlockDay !== undefined && s.day < claim.unlockDay ? claim.unlockDay : s.day,
      next: claim.unlockDay !== undefined && s.day < claim.unlockDay
        ? `The village will not take this belief up until day ${claim.unlockDay} (the day the built-in story of its kind unlocks), so no action can tell it before then: spend today's influence on a belief that is already in your hand, end the day, and come back to list_actions { claimId: "${claim.id}" } on day ${claim.unlockDay}.`
        : 'It is a law only if villagers come to believe it: tell people with take_action SEED, then carry it with MESSENGER, and provide whatever physical trigger it needs. list_actions { claimId } shows only this belief\'s actions.',
      nextValidActions: getAvailableActions(s, {}).filter((o) => (o.action as { claim?: string }).claim === claim.id).slice(0, 8).map((o) => ({ action: conciseAction(o.action), label: o.label, cost: o.cost, enabled: o.enabled })),
    });
    t.done = result;
    this.tokens.set(a.token, t);
    this.save(r);
    return this.remember(r, a.idempotencyKey, result);
  }

  // ---------------------------------------------------------------- Generative Reality (phase 13)

  /** Whether online reading can be used, and on what: the offline reader is always there; a model only if the server was started with it. */
  async interpreterStatus(): Promise<ToolResult> {
    const offline = { available: true, reader: 'offline-v2', note: 'The game\'s own reader, on this machine: free, deterministic, always available.' };
    if (!this.online) {
      return ok('Online reading is off on this MCP server (it was not started with BE_AI_ENABLED=1). The offline reader works as always.', {
        offline, online: { available: false, reason: 'disabled', provider: null, note: 'The person running this server can switch on the game\'s inference service with environment variables (docs/MCP_V2.md); no tool argument can.' },
      });
    }
    const st = await this.online.client.status();
    if ('ok' in st) return ok(`Online reading is unavailable: ${st.why} The offline reader works as always.`, { offline, online: { available: false, reason: st.reason, provider: this.online.provider } });
    return ok(st.available ? `Online reading is available (${st.provider === 'mock' ? 'a scripted stand-in: no model is called' : 'a language model through the Vercel AI Gateway: each call is paid by whoever runs this server'}).` : `Online reading is unavailable (${st.reason}). The offline reader works as always.`, {
      offline,
      online: { available: st.available, reason: st.reason, provider: st.provider, models: st.models, limits: st.limits, privacy: st.privacy },
    });
  }

  private pruneTokens(): void {
    const now = this.clock();
    for (const [k, t] of this.tokens) if (t.expiresAt <= now) this.tokens.delete(k);
    while (this.tokens.size >= MAX_TOKENS) this.tokens.delete(this.tokens.keys().next().value as string);
  }

  /**
   * A sentence to safe, bounded previews: what the game would make of it in this village, side by side with the words, with its cost,
   * support, upkeep, side effects and what it leaves out, and a short-lived token per buildable interpretation. Free: no Influence, no
   * revision. Inventor runs (Classic) read it with the Inventor composer instead (the same as submit_belief). With `online` the game's
   * inference service reads it, when the server offers one, under its quotas; the engine rebuilds and checks every proposal either way.
   */
  async proposeBelief(a: { runId: string; text: string; region?: string; online?: OnlineChoice }): Promise<ToolResult> {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s0 = r.session.state;
    const how = writing(s0);
    if (how === 'inventor') return this.submitBelief({ runId: a.runId, text: a.text, targetRegion: a.region });
    if (!how)
      return fail('CAPABILITY_NOT_ENABLED', s0.v2?.living ? 'A Living Village plays the chapter\'s own stories: beliefs of your own are written in a Generative Chronicle or the Reality Lab.' : 'Beliefs of your own are written in Generative runs (create_game { variant: "generative" }) or Classic Inventor runs.', {
        alternatives: ['create_game { variant: "generative" }', 'create_game { variant: "lab" }', 'create_game { inventor: true }'],
      });
    if (s0.outcome) return fail('RUN_OVER', 'The run is over. Use get_results.', { alternatives: ['get_results', 'retry_or_new_game'] });
    if (a.region && !s0.world.regions.some((x) => x.id === a.region)) return fail('BAD_REGION', `This village has no region "${a.region.slice(0, 40)}".`, { alternatives: s0.world.regions.map((x) => x.id) });
    const want = a.online ?? 'off';
    let reading = null as ReturnType<typeof readBelief> | null;
    let online: Record<string, unknown> = { used: false, asked: want };
    if (want !== 'off') {
      if (!this.online) {
        if (want === 'require') return fail('LLM_UNAVAILABLE', 'Online reading is off on this MCP server. Ask without `online` for the offline reading (free, always available).', { alternatives: ['propose_belief without online', 'get_interpreter_status'] });
        online = { used: false, asked: want, why: 'Online reading is off on this server; this is the offline reading.' };
      } else {
        const res = await this.online.client.interpretReality(s0, a.text, { region: a.region ?? null });
        // the run may have moved while the reading was out: a reading is only kept for the village it was asked about
        if (r.session.state !== s0) return fail('STALE_REVISION', 'The run changed while the reading was being made. Ask again.', { currentRevision: r.revision, alternatives: ['propose_belief'] });
        if (res.ok) {
          reading = res.reading;
          online = { used: true, provider: res.meta.provider, model: res.meta.model, cached: res.meta.cached, id: res.meta.id, latencyMs: res.meta.latencyMs };
        } else if (want === 'require') {
          return fail(res.reason, `${res.why} Nothing was spent.`, { alternatives: ['propose_belief without online (the offline reader)'] });
        } else online = { used: false, asked: want, why: `${res.why} This is the offline reading; nothing was spent.`, reason: res.reason };
      }
    }
    let meta: InferenceMeta | undefined;
    if (online.used) meta = { provider: String(online.provider ?? ''), model: String(online.model ?? ''), id: String(online.id ?? ''), cached: online.cached === true, ...(typeof online.latencyMs === 'number' ? { latencyMs: online.latencyMs } : {}) };
    reading ??= readBelief(s0, a.text, a.region ? { region: a.region } : {});
    this.pruneTokens();
    const now = this.clock();
    const interpretations = candidatesOf(reading).map((c) => {
      const yes = needsAcknowledgement(reading!, c);
      let token: string | null = null;
      if (c.build.ok) {
        token = randomBytes(16).toString('hex');
        this.tokens.set(token, { runId: r.id, revision: r.revision, astHash: c.build.draft.claim.reality?.hash ?? '', reality: { draft: c.build.draft, needsYes: yes, ...(meta && c.ast.source.reader === 'model' ? { meta } : {}) }, expiresAt: now + TOKEN_TTL_MS });
      }
      return describeCandidate(s0, c, token, yes);
    });
    const buildable = interpretations.filter((i) => i.buildable).length;
    const kindText = { supported: 'Understood', partial: 'Partly possible', ambiguous: 'It can be read more than one way', unsupported: 'It cannot be made real here' }[reading.kind];
    return ok(`${kindText}. ${buildable} interpretation${buildable === 1 ? '' : 's'} can be written${reading.kind === 'unsupported' && buildable ? ' (beliefs about the same things, not what you wrote)' : ''}; nothing is written until confirm_belief.`, {
      runId: r.id, revision: r.revision, kind: reading.kind, text: reading.text,
      ...(reading.kind === 'ambiguous' ? { question: reading.question } : {}),
      ...(reading.kind === 'partial' || reading.kind === 'unsupported' ? { cannotBeMadeReal: reading.reasons } : {}),
      notes: reading.notes, interpretations, online, influence: { remaining: s0.ap },
      written: { count: s0.claims.filter((c) => c.def?.reality && !c.def.rival).length, max: MAX_REALITY_CLAIMS + (s0.v2!.lab ? 2 : 0) },
      confirmWith: buildable ? 'confirm_belief { runId, token, expectedRevision, idempotencyKey, acknowledge? (when needsAcknowledgement), title? }' : undefined,
      tokenValidSeconds: TOKEN_TTL_MS / 1000,
      note: 'Interpretations are proposals. The engine rebuilds the belief from its structure when you confirm, at this revision only; nothing here can make it stronger or cheaper.',
    });
  }

  private confirmReality(r: RunRecord, t: BeliefToken, a: { idempotencyKey?: string; acknowledge?: boolean; title?: string }): ToolResult {
    const d = t.reality!.draft;
    if (t.reality!.needsYes && !a.acknowledge)
      return fail('UNSUPPORTED_EFFECT', `This reading does not do everything the sentence said${d.omitted.length ? ` (left out: ${d.omitted.map((o) => `“${o.text}”`).join(', ')})` : ''}, or it is a belief other than the one written. Confirm with acknowledge: true to write it anyway.`, {
        alternatives: ['confirm_belief { ..., acknowledge: true }', 'propose_belief with other words'],
      });
    if (t.revision !== r.revision)
      return fail('STALE_REVISION', `The village changed since this belief was read (revision ${t.revision}, now ${r.revision}). Read it again: propose_belief is free.`, { currentRevision: r.revision, alternatives: ['propose_belief'] });
    const title = (a.title ?? '').replace(/[<>]/g, '').trim().slice(0, 40);
    const claim = title ? { ...d.claim, short: title } : d.claim;
    const act: Action = { type: 'COMPOSE', claim, ...(t.reality!.meta ? { meta: t.reality!.meta } : {}) };
    const res = r.session.act(act);
    if (!res.ok) return fail(res.error.code, res.error.message, { alternatives: res.error.alternatives, currentRevision: r.revision });
    r.actions.push(act);
    r.revision += 1;
    r.updatedAt = this.clock();
    const s = r.session.state;
    const written = findClaimDef(s, d.claim.id)!;
    const later = written.unlockDay !== undefined && s.day < written.unlockDay ? written.unlockDay : null;
    const result = ok(res.summary || `Wrote “${written.short}”.`, {
      runId: r.id, revision: r.revision, accepted: true, cost: res.cost, remainingInfluence: s.ap,
      claim: { id: written.id, short: written.short, text: written.text, regions: written.regions, demonstratedAt: written.ritual ?? null, supportNeededPercent: Math.round(written.spec.thresholds.on * 100), firmBelieversNeeded: written.spec.thresholds.minSupporters, readBy: written.reality!.ast.source },
      events: res.events.map(brief),
      availableFromDay: later ?? s.day,
      next: later
        ? `The village will not take this belief up until day ${later} (the day the story it copies unlocks): spend today on something else, and come back to list_actions { claimId: "${written.id}" } then.`
        : 'It becomes law only once enough of the people who vote on it believe it: tell them (take_action SEED, or speak_to_villager persuade), let believers carry it (MESSENGER), and stage proof where it acts (stage_evidence). list_actions { claimId } shows this belief\'s actions.',
      nextValidActions: getAvailableActions(s, {}).filter((o) => (o.action as { claim?: string }).claim === written.id).slice(0, 8).map((o) => ({ action: conciseAction(o.action), label: o.label, cost: o.cost, enabled: o.enabled })),
    });
    t.done = result;
    this.save(r);
    return this.remember(r, a.idempotencyKey, result);
  }

  /**
   * Talk with a villager (V2 runs): ask what they think of a story, argue for it, challenge it, or ask what they make of things. The
   * effect is the engine's (trust and evidence rules, and the Influence an argument costs); the words are the villager's own, from
   * what they saw and were told, or a model's line under the inference service's quotas when `online` is asked for and offered,
   * checked against their memories and recorded in the action so a replay needs no model.
   */
  async speakToVillager(a: { runId: string; villagerId: string; mode: 'ask' | 'persuade' | 'challenge' | 'guess'; claimId?: string; online?: OnlineChoice; expectedRevision?: number; idempotencyKey?: string }): Promise<ToolResult> {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const early = this.guard(r, a);
    if (early) return early;
    const s0 = r.session.state;
    if (!s0.v2?.minds) return fail('CAPABILITY_NOT_ENABLED', 'Conversations are part of V2 runs (variant generative, living or lab). In Classic, tell stories with take_action SEED.', { alternatives: ['create_game { variant: "living" }', 'take_action SEED'] });
    if (!s0.villagers.some((v) => v.id === a.villagerId)) return fail('UNKNOWN_VILLAGER', `No villager "${a.villagerId}".`, { alternatives: s0.villagers.slice(0, 20).map((v) => v.id) });
    if (a.claimId && !findClaimDef(s0, a.claimId)) return fail('UNKNOWN_CLAIM', `No claim "${a.claimId}".`, { alternatives: s0.claims.filter((c) => c.available).map((c) => c.id) });
    const want = a.online ?? 'off';
    let reply: { line: string; cites: string[] } | undefined;
    let online: Record<string, unknown> = { used: false, asked: want };
    if (want !== 'off') {
      if (!this.online) {
        if (want === 'require') return fail('LLM_UNAVAILABLE', 'Online voices are off on this MCP server. Ask without `online`: the villager answers in their own words.', { alternatives: ['speak_to_villager without online'] });
        online = { used: false, asked: want, why: 'Online voices are off on this server; the villager answers in their own words.' };
      } else {
        const client: AiClient = this.online.client;
        const res = await client.talkReply(s0, a.villagerId, a.mode, a.claimId ?? null);
        if (r.session.state !== s0) return fail('STALE_REVISION', 'The run changed while the villager was being asked. Ask again.', { currentRevision: r.revision, alternatives: ['speak_to_villager'] });
        if (res.ok) {
          reply = { line: res.line, cites: res.cites };
          online = { used: true, provider: this.online.provider };
        } else if (want === 'require') return fail(res.reason, `${res.why} Nothing was spent.`, { alternatives: ['speak_to_villager without online'] });
        else online = { used: false, asked: want, why: `${res.why} The villager answers in their own words.`, reason: res.reason };
      }
    }
    const act: Action = { type: 'TALK', target: a.villagerId, mode: a.mode, ...(a.claimId ? { claim: a.claimId } : {}), ...(reply ? { reply } : {}) };
    const res = r.session.act(act);
    if (!res.ok) return fail(res.error.code, res.error.message, { alternatives: res.error.alternatives, currentRevision: r.revision });
    r.actions.push(act);
    r.revision += 1;
    r.updatedAt = this.clock();
    const said = res.events.find((e) => e.code === 'KEEPER_TALKED');
    const result = ok(said?.text ?? res.summary ?? 'Spoken.', {
      runId: r.id, revision: r.revision, accepted: true, cost: res.cost, remainingInfluence: r.session.state.ap, reply: said?.text ?? null,
      voice: reply ? 'model (checked against their memories)' : 'their own words (offline)', online, events: res.events.map(brief),
    });
    this.save(r);
    return this.remember(r, a.idempotencyKey, result);
  }

  /** Stage proof of a story or written belief at the place its rite is performed: the same RITUAL action, with tonight's omen for it first. */
  stageEvidence(a: { runId: string; claimId: string; landmarkId?: string; expectedRevision?: number; idempotencyKey?: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    const def = findClaimDef(s, a.claimId);
    if (!def) return fail('UNKNOWN_CLAIM', `No claim "${a.claimId}".`, { alternatives: s.claims.filter((c) => c.available).map((c) => c.id) });
    const ritual = def.ritual ? s.scn.rituals.find((x) => x.id === def.ritual) : undefined;
    if (!ritual) return fail('NO_RITUAL', `“${def.short}” has no rite to stage it with: tell people instead, or let them see it work once it is law.`, { alternatives: ['take_action SEED', 'speak_to_villager persuade'] });
    const places = s.world.landmarks.filter((l) => l.kind === ritual.landmark);
    const place = a.landmarkId ? places.find((l) => l.id === a.landmarkId) : places[0];
    if (!place) return fail('UNKNOWN_OBJECT', a.landmarkId ? `“${def.short}” is staged at a ${ritual.landmark}; "${a.landmarkId}" is not one.` : `This village has no ${ritual.landmark}.`, { alternatives: places.map((l) => l.id) });
    const omen = stagingOmen(s, ritual, def.id);
    const res = this.takeAction({ runId: a.runId, action: { type: 'RITUAL', ritual: ritual.id, landmark: place.id, claim: def.id }, expectedRevision: a.expectedRevision, idempotencyKey: a.idempotencyKey });
    if (!res.ok) return res;
    return ok(`${res.text} Omen: ${omen.text}`, { ...res.data, omen: { value: omen.value, text: omen.text }, place: { id: place.id, name: place.name }, ritual: ritual.id });
  }

  inspectObject(a: { runId: string; objectId: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    const active = s.claims.filter((c) => c.available).map((c) => c.id);
    const v = objectView(s, a.objectId, active);
    if (!v) return fail('UNKNOWN_OBJECT', `No landmark${s.v2 ? ', coop, stone or hen' : ''} "${a.objectId}".`, { alternatives: s.world.landmarks.slice(0, 20).map((l) => l.id) });
    return ok(`${String(v.name ?? v.id)} (${String(v.landmarkKind ?? v.kind)}).`, { runId: r.id, revision: r.revision, object: v });
  }

  inspectRegion(a: { runId: string; regionId: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    const v = regionView(s, a.regionId);
    if (!v) return fail('BAD_REGION', `Unknown region "${a.regionId}".`, { alternatives: s.world.regions.map((x) => x.id) });
    return ok(`${String(v.name)}: ${String(v.alive)} people alive.`, { runId: r.id, revision: r.revision, region: v });
  }

  getSocialGraph(a: { runId: string; villagerId?: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const g = socialGraph(r.session.state, a.villagerId);
    if (!g) return fail('UNKNOWN_VILLAGER', `No villager "${a.villagerId}".`, { alternatives: r.session.state.villagers.slice(0, 20).map((v) => v.id) });
    return ok(`${(g.nodes as unknown[]).length} people, ${(g.edges as unknown[]).length} ties${a.villagerId ? ` within two ties of ${a.villagerId}` : ''}. Trust values are the ones the browser shows; convictions are not in it.`, { runId: r.id, revision: r.revision, ...g });
  }

  getRuleExplanation(a: { runId: string; claimId: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    const x = ruleExplanation(s, a.claimId);
    if (!x) return fail('UNKNOWN_CLAIM', `No claim "${a.claimId}".`, { alternatives: s.claims.map((c) => c.id).slice(0, 30) });
    return ok(`“${String(x.short)}”${x.written ? ' (written)' : ''}: what it does, what it cannot, what else it does${x.provenance ? ', and how it became real so far' : ''}.`, { runId: r.id, revision: r.revision, rule: x });
  }

  getHistory(a: { runId: string; fromDay?: number; afterEventId?: number; limit?: number; minImportance?: 0 | 1 | 2 | 3 }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    const limit = Math.min(a.limit ?? 40, 100);
    const min = a.minImportance ?? 1;
    const all = s.log.filter((e) => e.importance >= min && (a.fromDay === undefined || e.day >= a.fromDay) && (a.afterEventId === undefined || e.id > a.afterEventId));
    const page = all.slice(0, limit);
    return ok(`${page.length} of ${all.length} events (importance >= ${min}).`, {
      runId: r.id, revision: r.revision, events: page.map(brief), hasMore: all.length > page.length, nextAfterEventId: page.length ? page[page.length - 1].id : a.afterEventId ?? 0,
      reasonCodes: 'Every event may carry `reason` (why a belief moved) and `cause` (earlier event ids): follow them to explain an outcome.',
    });
  }

  getResults(a: { runId: string; whatIf?: boolean }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    if (!s.outcome) return fail('NOT_FINISHED', 'Results exist only after the run ends (day resolution decides victory or defeat).', { alternatives: ['get_game_state', 'end_day'] });
    const d = buildDebrief(s);
    // optional and slow (a few seconds): replay a lost run from each day with other plans, as the browser's debrief does
    const cf = a.whatIf && d.result === 'defeat' ? findCounterfactual(s) : null;
    const alt = (x: NonNullable<typeof cf>['latest']) => (x ? { day: x.day, youDid: x.yours, insteadDo: x.instead, thenFollow: x.plan, survivedWith: { alive: x.alive, homes: x.homes } } : null);
    return ok(`${d.result === 'victory' ? 'Victory' : 'Defeat'}: ${d.headline}`, {
      ...(cf ? { whatIf: { lastDayItCouldStillBeSaved: alt(cf.latest), earliestDifferentOpening: alt(cf.earliest), plansTried: cf.plans, note: 'Replays on this seed with the real dice, played by a simple program: it shows a route existed, not that it was easy to see. Finding none does not prove the run was unwinnable.' } } : {}),
      runId: r.id, revision: r.revision, result: d.result, headline: d.headline, story: d.story, score: d.score, breakdown: d.breakdown, medal: d.medal, saved: d.saved, lost: d.lost,
      causalChains: d.chains.map((c) => ({ title: c.title, kind: c.kind, steps: c.steps })), missed: d.missed, tips: d.tips, seedInfo: d.seedInfo,
      verification: { stateHash: stateHash(s), eventHash: eventHash(s), rulesVersion: RULES_VERSION, versions: r.base ? undefined : replayVersions(r.options), actions: r.actions.length },
    });
  }

  retryOrNew(a: { runId: string; reuseSeed?: boolean; controller?: Mode }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const o = r.options;
    const opts: CreateRunOptions = a.reuseSeed ? { ...o } : { ...o, seed: (randomBytes(4).readUInt32LE(0) % 1_000_000) | 0 };
    if (!a.reuseSeed && o.mode === 'expedition') {
      const seed = randomBytes(4).readUInt32LE(0) % (MAX_SEED + 1);
      opts.seed = seed;
      opts.scenarioId = expeditionId(seed);
    }
    return this.createGame({ scenarioId: opts.scenarioId, seed: opts.seed, difficulty: opts.difficulty, mode: o.mode === 'expedition' ? 'expedition' : 'story', controller: a.controller ?? r.mode, inventor: !!o.inventor, variant: variantOfOptions(o) });
  }

  exportReplay(a: { runId: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    const s = r.session.state;
    // what a model proposed and the engine accepted is part of the action log itself (a written belief's structure, villagers' decisions,
    // a villager's checked line), so the replay reproduces the run without asking any model again
    const proposals = r.actions.filter((x) => (x.type === 'COMPOSE' && x.claim.reality?.ast.source.reader === 'model') || x.type === 'NPC_DECIDE' || (x.type === 'TALK' && !!x.reply)).length;
    return ok(`Replay of ${r.actions.length} accepted actions. Feed it to the browser engine or replayRun to reproduce the run exactly.`, {
      runId: r.id, revision: r.revision, replay: { ...r.options, actions: r.actions }, rulesVersion: RULES_VERSION, versions: replayVersions(r.options), stateHash: stateHash(s), eventHash: eventHash(s), finished: !!s.outcome,
      modelProposals: { recorded: proposals, note: 'Model proposals the engine accepted are inside the actions; replaying needs no model and no network.' },
      ledger: r.session.ledger, externalInputs: ledgerSummary(r.session.ledger).text,
    });
  }

  /** Hand a run between the browser and an agent: the browser's own save file, validated exactly as the browser validates it. */
  importGame(a: { saveJson: string; controller?: Mode }): ToolResult {
    if (a.saveJson.length > MAX_IMPORT_BYTES) return fail('TOO_LARGE', `Saves are limited to ${MAX_IMPORT_BYTES} bytes.`);
    const loaded = deserializeRun(a.saveJson);
    if (!loaded.ok) return fail('BAD_SAVE', loaded.error);
    const s = loaded.state;
    const options: CreateRunOptions = optionsFromState(s);
    const r = this.register(options, a.controller ?? 'coach', new GameSession(s), []);
    if (!('id' in r)) return r;
    // an imported run's replay log starts at the import (the save is kept as its base), so it still verifies after a restart
    r.base = a.saveJson;
    this.save(r);
    return ok(`Imported ${s.scn.name}, day ${s.day}. Controller: ${r.mode}.`, { runId: r.id, ...this.stateView(r), note: 'The imported save is the starting point of this run\'s replay; export_game gives the current save back.' });
  }

  exportGame(a: { runId: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    return ok('Save file for the browser (Continue or the debug loader).', { runId: r.id, revision: r.revision, saveJson: serializeRun(r.session.state) });
  }

  grantControl(a: { runId: string }): ToolResult {
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    r.mode = 'delegate';
    r.revision += 1;
    r.updatedAt = this.clock();
    this.save(r);
    return ok('The agent may now take actions on this run. Every action still needs expectedRevision to avoid surprising a human who is also playing.', { runId: r.id, revision: r.revision, controller: r.mode });
  }

  /** Flagged debug tool: the whole RunState including hidden beliefs. Registered only when BELIEF_ENGINE_DEBUG_TOOLS=1. */
  debugDump(a: { runId: string }): ToolResult {
    if (!this.debugTools) return fail('DEBUG_OFF', 'Debug tools are off.');
    const r = this.get(a.runId);
    if (!('id' in r)) return r;
    return ok('DEBUG: the full run state, including every private conviction. Local testing only; never share it with a player-facing agent.', { runId: r.id, state: JSON.parse(serializeRun(r.session.state)) as Record<string, unknown> });
  }

  /** Runs this server knows about (memory plus disk), newest first, for the "forget old games" housekeeping and tests. */
  listRuns(): { id: string; scenario: string; day: number; finished: boolean; revision: number; mode: Mode }[] {
    const out: { id: string; scenario: string; day: number; finished: boolean; revision: number; mode: Mode; at: number }[] = [];
    for (const r of this.runs.values()) out.push({ id: r.id, scenario: r.session.state.scenarioId, day: r.session.state.day, finished: !!r.session.state.outcome, revision: r.revision, mode: r.mode, at: r.updatedAt });
    if (this.home) {
      for (const f of readdirSync(join(this.home, 'runs'))) {
        const rid = f.replace(/\.json$/, '');
        if (!f.endsWith('.json') || this.runs.has(rid) || !runIdSchema.safeParse(rid).success) continue;
        const r = this.get(rid);
        if ('id' in r) out.push({ id: r.id, scenario: r.session.state.scenarioId, day: r.session.state.day, finished: !!r.session.state.outcome, revision: r.revision, mode: r.mode, at: r.updatedAt });
      }
    }
    return out.sort((a, b) => b.at - a.at).map(({ at: _at, ...x }) => x);
  }

  /** Test hook: drop the in-memory copy so the next call must come back from disk (a server restart). */
  forgetMemory(): void {
    this.runs.clear();
  }

  state(runId: string): RunState | null {
    const r = this.get(runId);
    return 'id' in r ? r.session.state : null;
  }
}
