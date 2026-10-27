import { applyAction, getAvailableActions } from '../../core/actions.ts';
import { claimDef, findLandmark } from '../../core/lookup.ts';
import type { GameSession } from '../../core/session.ts';
import type { Action, RunState } from '../../core/types.ts';
import { computePressure } from '../../laws/resolver.ts';
import type { Policy } from './types.ts';

export interface LawPusherConfig {
  name: string;
  claim: string;
  regions: string[];
  /** day (inclusive) from which beacons are lit for flood protection; undefined = never */
  lightFrom?: number;
  /** Influence kept in reserve each day for physical actions */
  reserve?: (s: RunState) => number;
  /** whether rituals may be used to stage evidence */
  stage?: boolean;
  /** run scenario-specific physical actions after social spending */
  physical?: (g: GameSession) => void;
  /** extra claims to push once the main law is active */
  then?: string[];
  /** veto a candidate action (e.g. do not burn scarce fuel on proof that will not also protect anything) */
  allow?: (s: RunState, a: Action) => boolean;
  /** answer announced rival campaigns with a challenge (default true) */
  counter?: boolean;
}

/** Support objective for a claim across regions: pressure dominates, conviction mass breaks ties. */
export function support(s: RunState, claim: string, regions: string[]): number {
  let total = 0;
  for (const r of regions) {
    const info = computePressure(s, claim, r);
    const law = s.laws.find((l) => l.claimId === claim && l.regionId === r);
    total += info.pressure * 100 + (law ? law.progress * 0.4 : 0);
    const d = new Set(claimDef(s, claim).electorate?.[r] ?? [r]);
    let mass = 0;
    let n = 0;
    for (const v of s.villagers) {
      if (v.status === 'dead' || !d.has(v.district)) continue;
      n++;
      mass += Math.max(0, v.beliefs[claim]?.conv ?? 0);
    }
    total += n ? (mass / n) * 0.05 : 0;
  }
  return total;
}

/** Greedy influence-per-Influence maximiser using exact action previews (same public API as a human). */
export function lawPusher(cfg: LawPusherConfig): Policy {
  return {
    name: cfg.name,
    playDay(g: GameSession) {
      const s0 = g.state;
      if (s0.starter === null) {
        const pick = s0.scn.starters.includes(cfg.claim) ? cfg.claim : s0.scn.starters[0];
        g.act({ type: 'PICK_STARTER', claim: pick });
      }
      const claims = [cfg.claim, ...(cfg.then ?? [])];
      // answer announced rival campaigns first
      for (const r of cfg.counter === false ? [] : g.state.rivals) {
        const tgt = r.plan?.target;
        if (!tgt || g.state.ap < 1) continue;
        const mine = g.state.claims.find((c) => c.id === cfg.claim && c.available);
        if (mine) g.act({ type: 'COUNTER', claim: cfg.claim, against: r.claim, target: tgt });
      }
      let guard = 0;
      while (g.state.ap > (cfg.reserve ? cfg.reserve(g.state) : 0) && guard++ < 14) {
        const s = g.state;
        const active = claims.filter((c) => s.claims.find((x) => x.id === c)?.available);
        const mainDone = s.laws.some((l) => l.claimId === cfg.claim && l.status === 'active');
        const targets = mainDone ? active.filter((c) => c !== cfg.claim) : [cfg.claim];
        if (!targets.length) break;
        let best: { a: Action; score: number } | null = null;
        const reserve = cfg.reserve ? cfg.reserve(s) : 0;
        for (const o of getAvailableActions(s)) {
          const a = o.action;
          if (o.cost <= 0 || o.cost > s.ap - reserve) continue;
          if (a.type === 'SCOUT' || a.type === 'PICK_STARTER' || a.type === 'TRADE' || a.type === 'COMPOSE') continue;
          if (a.type === 'RITUAL' && !a.claim) continue;
          if (a.type === 'RITUAL' && cfg.stage === false) continue;
          if (cfg.allow && !cfg.allow(s, a)) continue;
          const claim = ('claim' in a && a.claim) || cfg.claim;
          if (!targets.includes(claim)) continue;
          const r = applyAction(s, a);
          if (!r.ok) continue;
          const delta = support(r.state, claim, cfg.regions) - support(s, claim, cfg.regions);
          const score = delta / o.cost;
          if (delta > 0.04 && (!best || score > best.score)) best = { a, score };
        }
        if (!best) break;
        if (!g.act(best.a).ok) break;
      }
      cfg.physical?.(g);
      g.endDay();
    },
  };
}

/** Light the beacons that cover the most standing east-bank homes, as fuel and Influence allow. */
export function lightBeaconsByCoverage(g: GameSession, region = 'east', maxLit = 4): void {
  const s = g.state;
  const beacons = s.world.landmarks.filter((l) => l.kind === 'beacon' && l.district === region && !(l.lit && l.fuelNights >= 3));
  const homes = s.world.landmarks.filter((l) => l.kind === 'home' && l.hp > 0 && l.district === region);
  const lit = s.world.landmarks.filter((l) => l.kind === 'beacon' && l.lit && l.fuelNights > 0).length;
  const scored = beacons
    .map((b) => ({ b, c: homes.filter((h) => Math.sqrt((h.x - b.x) ** 2 + (h.y - b.y) ** 2) <= 3.5).length }))
    .sort((x, y) => y.c - x.c || (x.b.id < y.b.id ? -1 : 1));
  let n = lit;
  for (const { b } of scored) {
    if (n >= maxLit) break;
    if (g.state.ap < 1 || (g.state.world.stocks.fuel ?? 0) < 2) break;
    const r = g.act({ type: 'RITUAL', ritual: 'light_beacon', landmark: b.id });
    if (r.ok) n++;
  }
  void findLandmark;
}

export interface BrokerConfig {
  name: string;
  /** stories to try on the broker; the first is the opening story */
  claims: string[];
  broker: string;
  deal: string;
}

/**
 * Brokered-aid route: convince one gatekeeper (a merchant) who wants proof, then place orders. Uses the same public API.
 * Objective: the broker's conviction, with a small bonus for people close to the broker.
 */
export function brokerRoute(cfg: BrokerConfig): Policy {
  const score = (s: RunState): number => {
    const v = s.villagers.find((x) => x.id === cfg.broker);
    return Math.max(0, ...cfg.claims.map((c) => v?.beliefs[c]?.conv ?? 0));
  };
  return {
    name: cfg.name,
    playDay(g: GameSession) {
      const s0 = g.state;
      if (s0.starter === null) g.act({ type: 'PICK_STARTER', claim: s0.scn.starters.includes(cfg.claims[0]) ? cfg.claims[0] : s0.scn.starters[0] });
      for (let i = 0; i < 4; i++) g.act({ type: 'TRADE', deal: cfg.deal, target: cfg.broker });
      for (const r of g.state.rivals) {
        const tgt = r.plan?.target;
        const mine = cfg.claims.find((c) => g.state.claims.find((x) => x.id === c)?.available);
        if (tgt && mine && g.state.ap >= 1) g.act({ type: 'COUNTER', claim: mine, against: r.claim, target: tgt });
      }
      let guard = 0;
      while (g.state.ap > 0 && guard++ < 10) {
        const s = g.state;
        if (!cfg.claims.some((c) => s.claims.find((x) => x.id === c)?.available)) break;
        if ((s.flags[`deal:${cfg.deal}`] ?? 0) >= (s.scn.deals?.find((d) => d.id === cfg.deal)?.limit ?? 1)) break;
        let best: { a: Action; score: number } | null = null;
        for (const o of getAvailableActions(s)) {
          const a = o.action;
          if (o.cost <= 0 || a.type === 'SCOUT' || a.type === 'PICK_STARTER' || a.type === 'TRADE' || a.type === 'COMPOSE' || a.type === 'COUNTER') continue;
          if (a.type === 'RITUAL' && !a.claim) continue;
          if (!cfg.claims.includes(('claim' in a && a.claim) || cfg.claims[0])) continue;
          const r = applyAction(s, a);
          if (!r.ok) continue;
          const delta = score(r.state) - score(s);
          if (delta > 0.5 && (!best || delta / o.cost > best.score)) best = { a, score: delta / o.cost };
        }
        if (!best) break;
        if (!g.act(best.a).ok) break;
        for (let i = 0; i < 4; i++) g.act({ type: 'TRADE', deal: cfg.deal, target: cfg.broker });
      }
      g.endDay();
    },
  };
}

/** Light hamlet fires beside pens that a pack is heading for (ring) or only the far decoy fires (decoy). */
export function lightFiresForThreat(g: GameSession, mode: 'ring' | 'decoy', horizon = 10): void {
  const s = g.state;
  const fires = s.world.landmarks.filter((l) => l.kind === 'campfire');
  const lit = (f: { lit: boolean; fuelNights: number }) => f.lit && f.fuelNights >= 2;
  const tonight = s.threat[Math.min(s.day, s.threat.length) - 1]?.pack ?? 0;
  const nextNight = s.threat[Math.min(s.day, s.threat.length - 1)]?.pack ?? 0;
  const packs = s.world.packs.slice(0, Math.max(tonight, nextNight));
  if (!packs.length) return;
  const want: string[] = [];
  if (mode === 'decoy') {
    for (const f of fires.filter((x) => x.id.startsWith('c_d'))) {
      const law = s.laws.find((l) => l.claimId === 'wolves_follow_smoke' && l.regionId === f.district);
      if (!lit(f) && law && (law.status === 'active' || law.status === 'wavering')) want.push(f.id);
    }
  } else {
    for (const pen of s.world.landmarks.filter((l) => l.kind === 'pen' && (l.data.stock ?? 0) > 0)) {
      const near = packs.some((p) => Math.abs(p.x - pen.x) + Math.abs(p.y - pen.y) <= horizon);
      if (!near) continue;
      const f = fires.filter((x) => !x.id.startsWith('c_d')).sort((a, b) => Math.abs(a.x - pen.x) + Math.abs(a.y - pen.y) - (Math.abs(b.x - pen.x) + Math.abs(b.y - pen.y)))[0];
      const law = f && s.laws.find((l) => l.claimId === 'wolves_fear_smoke' && l.regionId === f.district);
      if (f && !lit(f) && Math.abs(f.x - pen.x) + Math.abs(f.y - pen.y) <= 4 && law && (law.status === 'active' || law.status === 'wavering')) want.push(f.id);
    }
  }
  for (const id of want) {
    if (g.state.ap < 1 || (g.state.world.stocks.fuel ?? 0) < 2) break;
    g.act({ type: 'RITUAL', ritual: 'burn_smoke', landmark: id });
  }
}
