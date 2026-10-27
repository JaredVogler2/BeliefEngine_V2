import { emit, type Ctx } from '../core/events.ts';
import { claimDef, faction, findVillager, neighborsOf, trustOf } from '../core/lookup.ts';
import type { RivalState, RunState, Villager } from '../core/types.ts';
import { ensureBelief, gossipDelta, relevance, round1 } from '../social/persuasion.ts';

/**
 * Rival factions act on observable triggers (not the calendar), announce their move one day ahead, and the
 * player has real counters: challenge the rumour with the targeted villager, win the leader over, or deny them
 * the opening. Every move is logged with its reason.
 */

function rivalDef(s: RunState, r: RivalState) {
  return s.scn.rivals.find((d) => d.factionId === r.factionId && d.claim === r.claim)!;
}

function topLawPressure(s: RunState, claimId: string): number {
  let p = 0;
  for (const l of s.laws) if (l.claimId === claimId) p = Math.max(p, l.pressure);
  return p;
}

function bestTarget(s: RunState, leader: Villager, watches: string): Villager | null {
  let best: Villager | null = null;
  let bestScore = -1;
  for (const v of s.villagers) {
    if (v.status === 'dead' || v.id === leader.id) continue;
    const c = v.beliefs[watches]?.conv ?? 0;
    if (c < 15) continue;
    // undermine the most influential supporter who still trusts the rival's circle
    const t = Math.max(0, trustOf(s, v.id, leader.id));
    const score = v.traits.influence + c * 0.5 + t * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

/** Execute a move announced earlier whose day has arrived (start of resolution). */
export function runRivalExecute(ctx: Ctx): void {
  const s = ctx.s;
  for (const r of s.rivals) {
    const plan = r.plan;
    if (!plan || plan.day !== s.day) continue;
    const def = rivalDef(s, r);
    const leader = findVillager(s, def.leader);
    r.plan = null;
    if (!leader || leader.status === 'dead') continue;
    const fac = faction(s, r.factionId);
    const watchConv = leader.beliefs[def.watches]?.conv ?? 0;
    if (watchConv >= 50) {
      r.active = false;
      emit(ctx, { step: 'rival', code: 'RIVAL_STANDS_DOWN', importance: 3, actor: leader.id, text: `${leader.name} has seen enough to doubt his own doubts. The ${fac.name} stands down.` });
      continue;
    }
    r.budget -= 1;
    r.actions += 1;
    r.lastActionDay = s.day;
    s.stats.rivalActions++;
    if (plan.kind === 'campaign') {
      const target = findVillager(s, plan.target ?? '');
      if (!target || target.status === 'dead') continue;
      const rc = s.claims.find((c) => c.id === r.claim)!;
      rc.available = true;
      rc.introduced = true;
      rc.introducedDay ??= s.day;
      ensureBelief(leader, r.claim).conv = Math.max(ensureBelief(leader, r.claim).conv, 70);
      let blunted = 1;
      for (let k = 0; k < r.countered; k++) blunted *= 0.45;
      const spoken: string[] = [];
      const targets = [target, ...neighborsOf(s, leader.id).map((n) => findVillager(s, n.id)!).filter((v) => v && v.status !== 'dead' && v.id !== target.id && trustOf(s, v.id, leader.id) > 20).slice(0, 2)];
      for (let i = 0; i < targets.length; i++) {
        const v = targets[i];
        const b = ensureBelief(v, r.claim);
        const g = gossipDelta({
          speakerConv: 70, speakerEvidence: 0, speakerInfluence: leader.traits.influence + 10, speakerId: leader.id,
          trust: Math.max(15, trustOf(s, v.id, leader.id)), edge: null, listener: v, listenerConv: b.conv, listenerEvidence: b.evidence,
          heard: b.heard, lastSource: b.lastSource, lastDay: b.lastDay, day: s.day, relevance: relevance(claimDef(s, r.claim), v),
        });
        const delta = Math.max(4, g.delta * 1.8 + (i === 0 ? 8 : 0)) * (i === 0 ? blunted : 0.6);
        const before = b.conv;
        b.conv = round1(b.conv + delta);
        b.heard += 1;
        b.lastDay = s.day;
        b.stale = 0;
        b.lastSource = leader.id;
        spoken.push(`${v.name} ${Math.round(before)}→${Math.round(b.conv)}`);
        // the rival's rumour crowds out the Keeper's claim in their mind
        for (const other of claimDef(s, r.claim).contradicts) {
          const ob = v.beliefs[other];
          if (ob && ob.conv > 0) ob.conv = round1(Math.max(0, ob.conv - delta * 0.6));
        }
      }
      emit(ctx, {
        step: 'rival', code: 'RIVAL_CAMPAIGN', importance: 3, actor: leader.id, target: target.id, claim: r.claim, reason: 'RIVAL_CAMPAIGN', cause: [plan.eventId],
        text: `${leader.name} campaigns: “${claimDef(s, r.claim).text}” ${spoken.join(', ')}.${r.countered ? ' Your challenge blunted it.' : ''}`,
      });
    } else if (plan.kind === 'sabotage' && def.sabotage) {
      const key = 'caravan:0';
      if (r.countered > 0) {
        emit(ctx, { step: 'rival', code: 'RIVAL_FOILED', importance: 3, actor: leader.id, target: plan.target ?? undefined, cause: [plan.eventId], text: `${leader.name} tried to talk ${findVillager(s, plan.target ?? '')?.name ?? 'the broker'} out of the deal, but your challenge held. The shipment is safe.` });
        r.countered = 0;
      } else if (s.flags[key] !== undefined) {
        s.flags[key] += def.sabotage.delay;
        emit(ctx, { step: 'rival', code: 'RIVAL_SABOTAGE', importance: 3, actor: leader.id, target: plan.target ?? undefined, cause: [plan.eventId], text: `${leader.name} warns ${findVillager(s, plan.target ?? '')?.name ?? 'the broker'} the valley is a poor risk. The shipment is delayed ${def.sabotage.delay} days.` });
      }
    } else if (plan.kind === 'rebuttal') {
      let n = 0;
      for (const v of s.villagers) {
        if (v.status === 'dead') continue;
        const b = v.beliefs[def.watches];
        if (!b || b.conv <= 0 || b.cause == null) continue;
        if (trustOf(s, v.id, leader.id) <= 10) continue;
        const dmg = Math.min(b.conv, 7 * (1 - b.evidence / 120));
        b.conv = round1(b.conv - dmg);
        v.keeperTrust = Math.max(0, v.keeperTrust - 3);
        n++;
      }
      emit(ctx, {
        step: 'rival', code: 'RIVAL_REBUTTAL', importance: 3, actor: leader.id, claim: def.watches, reason: 'RIVAL_CAMPAIGN', cause: [plan.eventId],
        text: `${leader.name} publicly exposes the failed demonstration. ${n} people who trust him doubt you more.`,
      });
    }
  }
}

/** After the night: decide whether to announce a move for tomorrow (and why). */
export function runRivalPlan(ctx: Ctx): void {
  const s = ctx.s;
  for (const r of s.rivals) {
    const def = rivalDef(s, r);
    const leader = findVillager(s, def.leader);
    if (!leader || leader.status === 'dead') continue;
    if (r.plan || r.budget <= 0) continue;
    if (s.day - r.lastActionDay < def.cooldown) continue;
    if ((leader.beliefs[def.watches]?.conv ?? 0) >= 50) continue;
    const execDay = s.day + def.telegraph;
    if (execDay > s.maxDay) continue;
    const fac = faction(s, r.factionId);
    const failedToday = (s.flags.failedEvidenceDay ?? -1) === s.day;
    if (def.sabotage && s.flags['caravan:0'] !== undefined && !r.plan && (s.flags[`sabotaged:${r.factionId}`] ?? 0) < 1) {
      const broker = s.scn.deals?.find((d) => d.id === def.sabotage!.deal)?.broker;
      if (broker) {
        s.flags[`sabotaged:${r.factionId}`] = 1;
        const id = emit(ctx, {
          step: 'rival', code: 'RIVAL_TELEGRAPH', importance: 3, actor: leader.id, target: broker, claim: def.watches, reason: 'RIVAL_CAMPAIGN',
          text: `${leader.name} means to talk ${findVillager(s, broker)?.name ?? 'the broker'} out of the grain deal. Challenge him with ${findVillager(s, broker)?.name ?? 'her'} before he does.`,
        });
        r.plan = { day: execDay, kind: 'sabotage', target: broker, reason: 'a shipment is on the road', eventId: id };
        r.active = true;
        continue;
      }
    }
    const pressure = topLawPressure(s, def.watches);
    if (failedToday) {
      const id = emit(ctx, {
        step: 'rival', code: 'RIVAL_TELEGRAPH', importance: 3, actor: leader.id, claim: def.watches, reason: 'RIVAL_CAMPAIGN',
        text: `${leader.name} saw your demonstration fail. The ${fac.name} will expose it tomorrow.`,
      });
      r.plan = { day: execDay, kind: 'rebuttal', target: null, reason: 'failed evidence', eventId: id };
      r.active = true;
    } else if (pressure >= def.trigger) {
      const target = bestTarget(s, leader, def.watches);
      if (!target) continue;
      const id = emit(ctx, {
        step: 'rival', code: 'RIVAL_TELEGRAPH', importance: 3, actor: leader.id, target: target.id, claim: def.watches, reason: 'RIVAL_CAMPAIGN',
        text: `${leader.name} is preparing a rebuttal aimed at ${target.name}. Challenge the rumour with ${target.name} before it lands, or win ${leader.name} over.`,
      });
      r.plan = { day: execDay, kind: 'campaign', target: target.id, reason: `${Math.round(pressure * 100)}% support for the Keeper's claim`, eventId: id };
      r.active = true;
    }
  }
}
