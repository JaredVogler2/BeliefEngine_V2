import { GameSession } from '../../core/session.ts';
import { stateHash, eventHash } from '../../core/replay.ts';
import type { Action, ActionType, CreateRunOptions, RunState } from '../../core/types.ts';
import { aliveCount, homesStanding } from '../../world/economy.ts';
import type { Policy } from './types.ts';

/** One line of the run's curve, taken at the start of each day (after the night resolved). */
export interface DayPoint {
  day: number;
  alive: number;
  homes: number;
  food: number;
  fuel: number;
  /** living villagers who believe (conviction >= 50) at least one story the Keeper can tell */
  believers: number;
  lawsOn: number;
  ap: number;
}

export interface LawRecord {
  claim: string;
  region: string;
  day: number | null;
  nights: number;
  status: string;
}

/** Everything the tournament records about one finished run. No wall-clock fields: callers add timing around it. */
export interface RunTelemetry {
  scenario: string;
  seed: number;
  policy: string;
  difficulty: string;
  result: 'victory' | 'defeat' | 'timeout';
  /** loss reason or victory note from the engine's own evaluator */
  cause: string;
  /** objectives that were not met at the end (empty on victory) */
  failed: string[];
  medal: string;
  endDay: number;
  maxDay: number;
  score: number;
  population: number;
  alive: number;
  homes: number;
  food: number;
  apSpent: number;
  apOffered: number;
  apUnspent: number;
  actions: number;
  actionMix: Partial<Record<ActionType, number>>;
  /** days on which the policy spent no Influence at all */
  passDays: number;
  firstBeliefDay: number | null;
  firstLawDay: number | null;
  /** peak share of living villagers who believed a story the Keeper tells */
  reach: number;
  laws: LawRecord[];
  lawsCollapsed: number;
  lawsWavered: number;
  /** codes of events with side effects, counted */
  sideEffects: Record<string, number>;
  rival: { actions: number; countered: number; campaigns: number; rebuttals: number };
  /** events of importance >= 2 and how many of them carry a cause chain or a stated reason */
  causal: { important: number; explained: number };
  curve: DayPoint[];
  stateHash: string;
  eventHash: string;
  /** violations an exploit probe recorded (empty for every other policy) */
  audit: string[];
}

const SIDE_CODES = ['FIRE_STARTED', 'FIRE_SPREAD', 'FIELD_BURNED', 'FIELD_FLOODED', 'FIELD_PARCHED', 'SMOKE_SICKNESS', 'NIGHT_LABOR', 'PACK_LURED', 'MUDSLIDE', 'RAIN_DISPLACED', 'BEACON_OUT', 'FAMINE', 'LIVESTOCK_KILLED', 'LAW_DISCREDITED'];

export function playerBelievers(s: RunState): number {
  const claims = s.claims.filter((c) => c.available).map((c) => c.id);
  let n = 0;
  for (const v of s.villagers) if (v.status !== 'dead' && claims.some((c) => (v.beliefs[c]?.conv ?? 0) >= 50)) n++;
  return n;
}

function point(s: RunState): DayPoint {
  return {
    day: s.day,
    alive: aliveCount(s),
    homes: homesStanding(s),
    food: s.world.stocks.food ?? 0,
    fuel: s.world.stocks.fuel ?? 0,
    believers: playerBelievers(s),
    lawsOn: s.laws.filter((l) => l.status === 'active' || l.status === 'wavering').length,
    ap: s.ap,
  };
}

export interface InstrumentedRun {
  t: RunTelemetry;
  session: GameSession;
  /** the start-of-day state for each day played (for late-game rescue experiments); index = day - 1 */
  starts: RunState[];
}

/** Play one run with a policy and record everything the tournament reports. Pure: no clock, no randomness of its own. */
export function playInstrumented(policy: Policy, opts: CreateRunOptions, audit: string[] = [], maxDays = 60): InstrumentedRun {
  const g = GameSession.create(opts);
  const starts: RunState[] = [g.state];
  const curve: DayPoint[] = [point(g.state)];
  const pop = g.state.villagers.length;
  let apOffered = g.state.ap;
  let passDays = 0;
  let guard = 0;
  let reach = 0;
  while (!g.state.outcome && guard++ < maxDays) {
    const before = g.log.length;
    policy.playDay(g);
    const acted = g.log.slice(before).filter((a) => a.type !== 'END_DAY' && a.type !== 'PICK_STARTER' && a.type !== 'SCOUT').length;
    if (acted === 0) passDays++;
    reach = Math.max(reach, playerBelievers(g.state) / Math.max(1, aliveCount(g.state)));
    if (!g.state.outcome) {
      starts.push(g.state);
      curve.push(point(g.state));
      apOffered += g.state.ap;
    }
  }
  const s = g.state;
  const mix: Partial<Record<ActionType, number>> = {};
  for (const a of g.log as Action[]) if (a.type !== 'END_DAY') mix[a.type] = (mix[a.type] ?? 0) + 1;
  const count = (code: string) => s.log.filter((e) => e.code === code).length;
  const important = s.log.filter((e) => e.importance >= 2 && e.step !== 'action' && e.step !== 'dawn');
  const side: Record<string, number> = {};
  for (const c of SIDE_CODES) if (count(c)) side[c] = count(c);
  const out = s.outcome;
  const t: RunTelemetry = {
    scenario: opts.scenarioId,
    seed: opts.seed,
    policy: policy.name,
    difficulty: opts.difficulty ?? 'normal',
    result: out ? out.result : 'timeout',
    cause: out ? out.reason : 'did not finish within the day cap',
    failed: out ? out.failedObjectives.slice() : [],
    medal: out?.medal ?? 'none',
    endDay: out ? out.day : s.day,
    maxDay: s.maxDay,
    score: out?.score ?? 0,
    population: pop,
    alive: aliveCount(s),
    homes: homesStanding(s),
    food: s.world.stocks.food ?? 0,
    apSpent: s.stats.apSpent,
    apOffered,
    apUnspent: Math.max(0, apOffered - s.stats.apSpent),
    actions: s.stats.actions,
    actionMix: mix,
    passDays,
    firstBeliefDay: s.stats.firstBeliefDay,
    firstLawDay: s.stats.firstLawDay,
    reach: Math.round(reach * 1000) / 1000,
    laws: s.laws.filter((l) => l.activatedDay !== null || l.status !== 'dormant').map((l) => ({ claim: l.claimId, region: l.regionId, day: l.activatedDay, nights: l.activeNights, status: l.status })),
    lawsCollapsed: s.stats.lawsCollapsed,
    lawsWavered: count('LAW_WAVERING'),
    sideEffects: side,
    rival: { actions: s.stats.rivalActions, countered: s.stats.rivalCountered, campaigns: count('RIVAL_CAMPAIGN'), rebuttals: count('RIVAL_REBUTTAL') },
    causal: { important: important.length, explained: important.filter((e) => (e.cause && e.cause.length > 0) || !!e.reason).length },
    curve,
    stateHash: stateHash(s),
    eventHash: eventHash(s),
    audit: audit.slice(),
  };
  return { t, session: g, starts };
}
