import { applyAction, getAvailableActions, omenFor } from '../../core/actions.ts';
import { cloneState } from '../../core/clone.ts';
import { claimDef, neighborsOf } from '../../core/lookup.ts';
import { getForecast, type ForecastView } from '../../core/selectors.ts';
import { GameSession } from '../../core/session.ts';
import type { Action, RunState, ScenarioRuntime, Subject, Villager } from '../../core/types.ts';
import { noop, randomLegal } from './basic.ts';
import { support } from './lawpusher.ts';
import type { Policy } from './types.ts';

/**
 * Scenario-agnostic bot policies (phase 11). None of them knows a scenario, a claim id, a landmark id or a villager id: they read
 * the claims, rituals, forecast and social graph that the public API shows to a player, and spend Influence through the same
 * `GameSession.act` a person or an MCP agent uses. They differ in what they believe makes a plan good, which is exactly the
 * difference the tournament measures.
 */

// ------------------------------------------------------------------ shared reading of the state

const RELEVANT: Record<ScenarioRuntime['threatKind'], Subject[]> = {
  flood: ['river', 'bridge', 'rain'],
  drought: ['grain', 'rain'],
  wolves: ['wolf', 'smoke'],
  fire: ['fire', 'rain'],
  mixed: ['river', 'bridge', 'rain', 'grain', 'wolf', 'smoke', 'fire'],
};

/** Claims the Keeper can actually tell: unlocked, and not somebody else's rumour. */
export function playableClaims(s: RunState): string[] {
  // before the opening story is chosen only the starters can be told
  if (s.starter === null) return s.scn.starters.filter((id) => !claimDef(s, id).rival);
  return s.claims
    .filter((c) => c.available)
    .map((c) => c.id)
    .filter((id) => {
      const d = claimDef(s, id);
      return !d.rival || d.adoptable;
    });
}

/** How directly a claim speaks to tonight's kind of danger, scaled by how strong its law would be (0..1). */
export function claimRelevance(s: RunState, id: string): number {
  const d = claimDef(s, id);
  const fits = RELEVANT[s.scn.threatKind].includes(d.spec.subject);
  return ((fits ? 1 : 0.15) * d.spec.intensity) / 3;
}

/** Share of all conviction in the village (about this claim) that already exists: used so a policy sticks to its plan. */
function commitment(s: RunState, id: string): number {
  let mass = 0;
  for (const v of s.villagers) if (v.status !== 'dead') mass += Math.max(0, v.beliefs[id]?.conv ?? 0);
  return mass / Math.max(1, s.villagers.length * 60);
}

function conv(v: Villager, claim: string): number {
  return v.beliefs[claim]?.conv ?? 0;
}

function living(s: RunState): Villager[] {
  return s.villagers.filter((v) => v.status !== 'dead');
}

function districts(s: RunState): string[] {
  return [...new Set(living(s).map((v) => v.district))].sort();
}

/** Number of distinct districts a villager has a direct tie into (>= 2 means a bridge between neighbourhoods). */
function crossTies(s: RunState, v: Villager): number {
  const ds = new Set<string>();
  for (const n of neighborsOf(s, v.id)) {
    const o = s.villagers.find((x) => x.id === n.id);
    if (o && o.status !== 'dead' && o.district !== v.district) ds.add(o.district);
  }
  return ds.size;
}

function hubScore(v: Villager): number {
  return v.traits.influence;
}

function lawIsOn(s: RunState, claim: string): boolean {
  return s.laws.some((l) => l.claimId === claim && (l.status === 'active' || l.status === 'wavering'));
}

function lawActive(s: RunState, claim: string): boolean {
  return s.laws.some((l) => l.claimId === claim && l.status === 'active');
}

// ------------------------------------------------------------------ the shared playbook

export interface Tactic {
  name: string;
  /** which story to push (null: none worth pushing) */
  pick(s: RunState): string | null;
  /** may this action be considered at all? */
  allow(s: RunState, a: Action, claim: string): boolean;
  /** how much better state b is than a, in this tactic's own currency (divided by Influence cost) */
  gain(a: RunState, b: RunState, claim: string, act: Action): number;
  /** Influence left untouched for the physical step */
  reserve?(s: RunState): number;
  /** physical step with whatever Influence is left */
  after?(g: GameSession, claim: string | null): void;
  /** answer announced rival campaigns (default true) */
  counter?: boolean;
  /** keep pushing a second, compatible story once the first law holds (default false) */
  second?: boolean;
  minGain?: number;
}

function pickStarter(g: GameSession, t: Pick<Tactic, 'pick'> | null): void {
  const s = g.state;
  if (s.starter !== null) return;
  const chosen = t?.pick(s);
  const best = chosen && s.scn.starters.includes(chosen) ? chosen : s.scn.starters[0];
  g.act({ type: 'PICK_STARTER', claim: best });
}

function counterRivals(g: GameSession, claim: string | null): void {
  if (!claim) return;
  for (const r of g.state.rivals) {
    const tgt = r.plan?.target;
    if (!tgt || g.state.ap < 1) continue;
    if (!g.state.claims.find((c) => c.id === claim && c.available)) continue;
    g.act({ type: 'COUNTER', claim, against: r.claim, target: tgt });
  }
}

/** A policy is "pick a story, then repeatedly take the best-looking affordable action by this tactic's own measure". */
export function playbook(t: Tactic): Policy {
  return {
    name: t.name,
    playDay(g: GameSession) {
      pickStarter(g, t);
      const claim = t.pick(g.state);
      if (t.counter !== false) counterRivals(g, claim);
      let guard = 0;
      while (claim && g.state.ap > (t.reserve?.(g.state) ?? 0) && guard++ < 14) {
        const s = g.state;
        const res = t.reserve?.(s) ?? 0;
        const main = claim;
        const done = lawActive(s, main);
        const claims = done && t.second ? playableClaims(s).filter((c) => c !== main && !claimDef(s, main).contradicts.includes(c) && claimRelevance(s, c) >= 0.3) : [main];
        if (done && !t.second) break;
        if (!claims.length) break;
        let best: { a: Action; score: number } | null = null;
        for (const o of getAvailableActions(s)) {
          const a = o.action;
          if (o.cost <= 0 || o.cost > s.ap - res) continue;
          if (a.type === 'SCOUT' || a.type === 'PICK_STARTER' || a.type === 'TRADE' || a.type === 'COMPOSE' || a.type === 'COUNTER') continue;
          if (a.type === 'RITUAL' && !a.claim) continue;
          const c = ('claim' in a && a.claim) || main;
          if (!claims.includes(c) || !t.allow(s, a, c)) continue;
          const r = applyAction(s, a);
          if (!r.ok) continue;
          const score = t.gain(s, r.state, c, a) / o.cost;
          if (score > (t.minGain ?? 0.04) && (!best || score > best.score)) best = { a, score };
        }
        if (!best || !g.act(best.a).ok) break;
      }
      t.after?.(g, claim);
      g.endDay();
    },
  };
}

// ------------------------------------------------------------------ claim choosers

/** The claim whose law would be strongest against this scenario's kind of danger; sticks with a story already being told. */
function strongestClaim(s: RunState): string | null {
  const ids = playableClaims(s);
  let best: string | null = null;
  let bestV = -1;
  for (const id of ids) {
    const v = claimRelevance(s, id) + commitment(s, id) * 1.5;
    if (v > bestV + 1e-9) {
      bestV = v;
      best = id;
    }
  }
  return best;
}

/** Cost-aware choice for the planner: danger fit, fuel it can afford to burn, side effects it brings, and what is already believed. */
function plannedClaim(s: RunState): string | null {
  const ids = playableClaims(s);
  let best: string | null = null;
  let bestV = -Infinity;
  for (const id of ids) {
    const d = claimDef(s, id);
    const nights = Math.max(1, s.maxDay - s.day);
    const fuelNeed = d.spec.upkeep.fuel * Math.min(3, nights);
    const fuelPenalty = fuelNeed > (s.world.stocks.fuel ?? 0) ? 0.25 : 0;
    const v = claimRelevance(s, id) - 0.08 * d.spec.side.length - fuelPenalty + commitment(s, id) * 1.5;
    if (v > bestV + 1e-9) {
      bestV = v;
      best = id;
    }
  }
  return best;
}

/** The claim that the most of the village can vote on: widest electorate, then strongest. */
function widestClaim(s: RunState): string | null {
  const ids = playableClaims(s);
  let best: string | null = null;
  let bestV = -1;
  for (const id of ids) {
    const d = claimDef(s, id);
    const reach = new Set<string>();
    for (const r of d.regions) for (const x of d.electorate?.[r] ?? [r]) reach.add(x);
    const v = reach.size * 0.3 + claimRelevance(s, id) + commitment(s, id) * 1.5;
    if (v > bestV + 1e-9) {
      bestV = v;
      best = id;
    }
  }
  return best;
}

/** The claim that has a ritual to stage proof with, preferring one whose omen is kind tonight. */
function provableClaim(s: RunState): string | null {
  const ids = playableClaims(s);
  let best: string | null = null;
  let bestV = -1;
  for (const id of ids) {
    const d = claimDef(s, id);
    const ritual = d.ritual ? s.scn.rituals.find((r) => r.id === d.ritual) : undefined;
    const omen = ritual ? omenFor(s, ritual.omen).value : -1;
    const v = (ritual ? 0.5 + 0.25 * omen : 0) + claimRelevance(s, id) + commitment(s, id) * 1.5;
    if (v > bestV + 1e-9) {
      bestV = v;
      best = id;
    }
  }
  return best;
}

// ------------------------------------------------------------------ forecast risk (what a careful player reads off the Forecast tab)

/** One number for "how bad is tonight if I stop here", built only from the player-visible forecast. Lower is better. */
export function forecastRisk(f: ForecastView): number {
  let r = 0;
  for (const h of f.homesAtRisk) r += h.destroyed ? 4 : 1.2;
  for (const p of f.peopleAtRisk) r += p.note === 'will drown' ? 14 : 6;
  r += f.trapped.length * 5;
  if (f.bridge) r += !f.bridge.standing ? 0 : f.bridge.projectedDamage >= f.bridge.hp ? 12 : (f.bridge.projectedDamage / Math.max(1, f.bridge.maxHp)) * 8;
  if (f.food.projected <= 0) r += 6;
  if (f.crops) {
    let gain = 0;
    for (const x of f.crops.fields) if (!x.harvested) gain += x.tonight;
    r -= gain * 0.05;
  }
  for (const pen of f.pens) {
    if (pen.stock <= 0 || pen.guarded) continue;
    const near = f.packs.some((p) => p.dist <= 6);
    if (near) r += pen.stock * 1.2;
  }
  for (const b of f.beacons) if (b.lit) r += b.sparkPct / 100;
  r += f.sick.length * 0.8;
  return r;
}

/** Spend leftover Influence on whichever physical or trade action most lowers the forecast risk per Influence (and per fuel). */
export function forecastGuard(g: GameSession, maxSteps = 4): void {
  for (let step = 0; step < maxSteps && g.state.ap >= 1; step++) {
    const s = g.state;
    const base = forecastRisk(getForecast(s));
    const fuel0 = s.world.stocks.fuel ?? 0;
    let best: { a: Action; score: number } | null = null;
    for (const o of getAvailableActions(s)) {
      const a = o.action;
      if (o.cost <= 0 || (a.type !== 'RITUAL' && a.type !== 'TRADE')) continue;
      if (a.type === 'RITUAL' && a.claim) {
        // staging a proof also teaches the village, but never on a night that makes the proof fail
        const rit = s.scn.rituals.find((x) => x.id === a.ritual);
        if (rit && omenFor(s, rit.omen).value < 0) continue;
      }
      const r = applyAction(s, a);
      if (!r.ok) continue;
      const fuelSpent = Math.max(0, fuel0 - (r.state.world.stocks.fuel ?? 0));
      const d = base - forecastRisk(getForecast(r.state)) - 0.25 * fuelSpent;
      const score = d / o.cost;
      if (d > 0.4 && (!best || score > best.score)) best = { a, score };
    }
    if (!best || !g.act(best.a).ok) break;
  }
}

// ------------------------------------------------------------------ the policies

/** 3. Greedy: pour Influence into whichever action raises law pressure the most for one chosen law. Never touches the physical world. */
export const greedy: Policy = playbook({
  name: 'greedy',
  pick: strongestClaim,
  allow: () => true,
  gain: (a, b, claim) => support(b, claim, claimDef(a, claim).regions) - support(a, claim, claimDef(a, claim).regions),
});

/** 4. Broadcaster: tell the charismatic, and call crowds. Values each point of conviction by how much of the village follows its holder. */
const hubIds = (s: RunState, n: number): Set<string> => new Set(living(s).sort((x, y) => hubScore(y) - hubScore(x) || (x.id < y.id ? -1 : 1)).slice(0, n).map((v) => v.id));
export const broadcaster: Policy = playbook({
  name: 'broadcaster',
  pick: strongestClaim,
  allow: (s, a) => {
    if (a.type === 'SEED') return hubIds(s, 6).has(a.target);
    if (a.type === 'MESSENGER') return hubIds(s, 6).has(a.from);
    return a.type === 'GATHER';
  },
  gain: (a, b, claim, act) => {
    let total = 0;
    for (const v of b.villagers) {
      if (v.status === 'dead') continue;
      const before = a.villagers.find((x) => x.id === v.id)!;
      total += (conv(v, claim) - conv(before, claim)) * (0.5 + v.traits.influence / 50);
    }
    return act.type === 'GATHER' ? total * 1.15 : total;
  },
  minGain: 1,
});

/** 5. Evidence-first: show, don't tell. Stage proofs on kind nights and talk only to the people words cannot move. */
export const evidenceFirst: Policy = playbook({
  name: 'evidence-first',
  pick: provableClaim,
  allow: (s, a) => {
    if (a.type === 'RITUAL') {
      const rit = s.scn.rituals.find((x) => x.id === a.ritual);
      return !!rit && omenFor(s, rit.omen).value >= 0;
    }
    if (a.type === 'SEED') return (s.villagers.find((v) => v.id === a.target)?.traits.skepticism ?? 0) >= 50;
    if (a.type === 'MESSENGER') return (s.villagers.find((v) => v.id === a.from)?.beliefs[a.claim]?.evidence ?? 0) >= 15;
    return false;
  },
  gain: (a, b, claim) => {
    let total = 0;
    for (const v of b.villagers) {
      if (v.status === 'dead') continue;
      const before = a.villagers.find((x) => x.id === v.id)!;
      total += (conv(v, claim) - conv(before, claim)) * (1 + v.traits.skepticism / 40);
      total += ((v.beliefs[claim]?.evidence ?? 0) - (before.beliefs[claim]?.evidence ?? 0)) * 0.25;
    }
    return total;
  },
  minGain: 1,
});

/** 6. Community bridge-builder: lift the weakest neighbourhood first, through the people who have ties into several of them. */
export const bridgeBuilder: Policy = playbook({
  name: 'bridge-builder',
  pick: widestClaim,
  allow: (s, a) => a.type === 'SEED' || a.type === 'MESSENGER' || a.type === 'GATHER' || (a.type === 'RITUAL' && !!a.claim && s.day >= 3),
  gain: (a, b, claim, act) => {
    let total = 0;
    for (const d of districts(a)) {
      const pop = living(a).filter((v) => v.district === d);
      const mean = (s: RunState) => {
        const vs = living(s).filter((v) => v.district === d);
        return vs.reduce((x, v) => x + Math.max(0, conv(v, claim)), 0) / Math.max(1, vs.length);
      };
      void pop;
      total += (mean(b) - mean(a)) / (8 + mean(a));
    }
    let bonus = 1;
    if (act.type === 'MESSENGER') {
      const f = a.villagers.find((v) => v.id === act.from);
      const to = a.villagers.find((v) => v.id === act.to);
      if (f && to && f.district !== to.district) bonus = 1.6;
    } else if (act.type === 'SEED') {
      const v = a.villagers.find((x) => x.id === act.target);
      if (v && crossTies(a, v) >= 1) bonus = 1.3;
    }
    return total * bonus * 100;
  },
  minGain: 0.5,
});

/** 7. Threat-aware planner: choose the law that fits the danger and the stores, hold Influence back for the night, and read the forecast. */
export const threatAware: Policy = playbook({
  name: 'threat-aware',
  pick: plannedClaim,
  allow: () => true,
  gain: (a, b, claim) => support(b, claim, claimDef(a, claim).regions) - support(a, claim, claimDef(a, claim).regions),
  reserve: (s) => {
    const claim = plannedClaim(s);
    if (claim && lawIsOn(s, claim)) return Math.min(s.ap, 3);
    return s.day >= s.maxDay - 3 ? Math.min(s.ap, 2) : 0;
  },
  after: (g) => forecastGuard(g),
  second: true,
});

/**
 * 8. Exploit-seeker. Tries to get ahead by means the rules are supposed to forbid: re-doing the same cheap action over and over,
 * probing every action with undo to keep only the lucky ones, refunding Influence through undo, feeding invalid targets, flipping
 * between contradicting stories so a law's hysteresis is gamed, and sending the same proof to every listener. Whenever the engine
 * lets something through that it should not, the violation is pushed to `audit`. A healthy engine leaves `audit` empty.
 */
export function exploitSeeker(audit: string[] = []): Policy {
  const note = (s: RunState, msg: string) => audit.push(`day ${s.day}: ${msg}`);
  return {
    name: 'exploit-seeker',
    playDay(g: GameSession) {
      pickStarter(g, { pick: strongestClaim });
      const s0 = g.state;
      const ap0 = s0.ap;
      // 1. undo must give back exactly what an action cost, never more
      const cheap = g.options().filter((o) => o.cost > 0 && o.cost <= 1);
      if (cheap.length) {
        const o = cheap[0];
        const before = g.state.ap;
        if (g.act(o.action).ok) {
          g.undo();
          if (g.state.ap !== before) note(g.state, `undo changed Influence from ${before} to ${g.state.ap}`);
          if (g.log.length && g.log[g.log.length - 1].type !== 'END_DAY' && g.state.today.length !== 0 && !g.canUndo) note(g.state, 'undo left a stale action record');
        }
      }
      // 2. invalid targets must cost nothing and change nothing
      const junk: Action[] = [
        { type: 'SEED', claim: 'no_such_claim', target: s0.villagers[0].id },
        { type: 'SEED', claim: s0.starter ?? s0.scn.starters[0], target: 'nobody' },
        { type: 'MESSENGER', claim: s0.starter ?? s0.scn.starters[0], from: 'nobody', to: s0.villagers[0].id },
        { type: 'RITUAL', ritual: 'nope', landmark: 'nowhere' },
        { type: 'GATHER', claim: s0.starter ?? s0.scn.starters[0], site: 'nowhere' },
      ];
      for (const a of junk) {
        const before = g.state;
        const r = g.act(a);
        if (r.ok) note(before, `invalid action ${a.type} was accepted`);
        else if (g.state.ap !== before.ap) note(before, `rejected ${a.type} still changed Influence`);
      }
      // 3. spam the cheapest actions, probing each with undo and keeping only what helps; never the same person twice
      let guard = 0;
      while (g.state.ap > 0 && guard++ < 30) {
        const s = g.state;
        let best: { a: Action; score: number } | null = null;
        const seen = new Set<string>();
        for (const o of getAvailableActions(s)) {
          const a = o.action;
          if (o.cost <= 0 || a.type === 'PICK_STARTER' || a.type === 'COMPOSE' || a.type === 'SCOUT') continue;
          const key = JSON.stringify(a);
          if (seen.has(key)) continue;
          seen.add(key);
          const r = applyAction(s, a);
          if (!r.ok) continue;
          const score = progress(r.state) - progress(s);
          const per = score / o.cost;
          if (per > 0.01 && (!best || per > best.score)) best = { a, score: per };
        }
        if (!best) break;
        const apBefore = g.state.ap;
        const r = g.act(best.a);
        if (!r.ok) break;
        if (g.state.ap > apBefore) note(s, `an action increased Influence (${apBefore} -> ${g.state.ap})`);
        if (g.state.ap < 0) note(s, `Influence went negative (${g.state.ap})`);
        // repeating the very same action immediately must not farm belief indefinitely
        const again = g.act(best.a);
        if (again.ok && best.a.type === 'SEED') note(s, 'the same person could be told the same story twice in one day');
      }
      // 4. flip to a contradicting story right after a law holds, hoping to keep both
      const on = g.state.laws.filter((l) => l.status === 'active');
      for (const l of on) {
        for (const other of claimDef(g.state, l.claimId).contradicts) {
          const c = g.state.claims.find((x) => x.id === other && x.available);
          const d = c && claimDef(g.state, other);
          if (!c || !d || (d.rival && !d.adoptable)) continue;
          const tgt = g.state.villagers.find((v) => v.status !== 'dead' && !g.state.flags[`spoke:${v.id}`]);
          if (tgt && g.state.ap >= 1) g.act({ type: 'SEED', claim: other, target: tgt.id });
        }
      }
      if (g.state.ap > ap0) note(g.state, `Influence grew during the day (${ap0} -> ${g.state.ap})`);
      g.endDay();
    },
  };
}

/** Everything a cheater would count as progress: believers, law progress and the score the engine would pay out. */
function progress(s: RunState): number {
  let total = 0;
  for (const v of s.villagers) if (v.status !== 'dead') for (const b of Object.values(v.beliefs)) total += Math.max(0, b.conv) * 0.05;
  for (const l of s.laws) total += l.progress * 0.3;
  return total;
}

// ------------------------------------------------------------------ the bounded oracle (documented as privileged)

/**
 * A bounded rollout oracle over the other policies. Every real day it plays each candidate to the END of the run on a private
 * copy, keeps the one whose finish is best, and plays only that candidate's first day for real. It PEEKS at the dice of every
 * night, so it is not a fair opponent and is never offered to players: the tournament reports it apart, as an upper bound that
 * policy regret is measured against. Because the future it inspects is the real future, it can never do worse than the best
 * single candidate. Compute is explicit: `candidates.length` rollouts per real day, no state outside the public run.
 */
export function oracle(candidates: Policy[], maxDays = 40): Policy {
  const finish = (s: RunState): number => {
    if (s.outcome) return (s.outcome.result === 'victory' ? 100000 : -100000) + s.outcome.score;
    return -50000;
  };
  return {
    name: 'oracle',
    playDay(g: GameSession) {
      let bestPolicy = candidates[0];
      let bestV = -Infinity;
      for (const p of candidates) {
        const h = new GameSession(cloneState(g.state));
        let n = 0;
        while (!h.state.outcome && n++ < maxDays) p.playDay(h);
        const v = finish(h.state);
        if (v > bestV + 1e-9) {
          bestV = v;
          bestPolicy = p;
        }
      }
      bestPolicy.playDay(g);
    },
  };
}

// ------------------------------------------------------------------ registry

export interface PolicyEntry {
  id: string;
  /** one-line description, copied into reports */
  about: string;
  make(audit?: string[]): Policy;
  /** privileged policies (oracle) are reported apart from the fair ones */
  privileged?: boolean;
}

export const MANDATORY_POLICIES: PolicyEntry[] = [
  { id: 'noop', about: 'Control: picks the first opening story and ends every day.', make: () => noop },
  { id: 'random', about: 'Spends Influence on uniformly random legal actions.', make: () => randomLegal },
  { id: 'greedy', about: 'Maximises immediate pressure on one law; no physical actions.', make: () => greedy },
  { id: 'broadcaster', about: 'Tells the most charismatic villagers and convenes gatherings.', make: () => broadcaster },
  { id: 'evidence-first', about: 'Stages proofs on kind nights and speaks to skeptics.', make: () => evidenceFirst },
  { id: 'bridge-builder', about: 'Lifts the weakest district first through cross-district ties.', make: () => bridgeBuilder },
  { id: 'threat-aware', about: 'Chooses the law that fits the danger, reserves Influence, acts on the forecast.', make: () => threatAware },
  { id: 'exploit-seeker', about: 'Probes undo, invalid targets, repeats and contradictions; records engine violations.', make: (audit) => exploitSeeker(audit) },
];

export const ORACLE_ENTRY: PolicyEntry = {
  id: 'oracle',
  about: 'PRIVILEGED one-day lookahead over the policies above (sees the night). Upper bound for regret, not a fair opponent.',
  privileged: true,
  make: () => oracle([greedy, broadcaster, evidenceFirst, bridgeBuilder, threatAware]),
};

export function policyById(id: string, audit?: string[]): Policy {
  const e = [...MANDATORY_POLICIES, ORACLE_ENTRY].find((p) => p.id === id);
  if (!e) throw new Error(`unknown policy "${id}"`);
  return e.make(audit);
}
