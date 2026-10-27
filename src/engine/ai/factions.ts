import { emit, type Ctx } from '../core/events.ts';
import { claimDef, findVillager } from '../core/lookup.ts';
import type { Faction, RunState } from '../core/types.ts';
import { round1 } from '../social/persuasion.ts';
import { components, connected, passableMask } from '../world/nav.ts';

/**
 * Faction politics beyond the rival's counter-rumours. Everything here acts on what the Keeper has done (not on the calendar),
 * is announced a day ahead with its reason, is paid for from a small budget and a cooldown, and can be answered:
 *  - the Council bars public gatherings when the Keeper keeps calling crowds without convincing the Council's own leader
 *    (answer: win the leader over, or stop calling crowds);
 *  - a faction whose leader firmly believes a law and trusts the Keeper publicly endorses it (a gift, once per law).
 * Plans live in `flags` as numbers (execution day) so they replay and save like everything else.
 */

const planKey = (f: Faction) => `fplan:${f.id}`;
export const BAN_LEADER_CONVICTION = 40;

function playerClaims(s: RunState): string[] {
  return s.scn.claimDefs.filter((c) => !c.rival).map((c) => c.id).concat(s.claims.filter((c) => c.def && !c.def.rival && !s.scn.claimDefs.some((d) => d.id === c.id)).map((c) => c.id));
}

function leaderBest(s: RunState, f: Faction): number {
  const leader = findVillager(s, f.leader);
  if (!leader || leader.status === 'dead') return 100;
  return Math.max(0, ...playerClaims(s).map((c) => leader.beliefs[c]?.conv ?? 0));
}

/** How many gatherings the Keeper called in the last three days. During resolution today is already in the history. */
export function recentGatherings(s: RunState, includeToday = false): number {
  let n = includeToday ? s.today.filter((a) => a.action.type === 'GATHER').length : 0;
  for (const h of s.history.slice(includeToday ? -2 : -3)) n += h.actions.filter((a) => a.type === 'GATHER').length;
  return n;
}

/** Start of resolution: carry out a faction move whose day has come, unless the Keeper has already answered it. */
export function runFactionExecute(ctx: Ctx): void {
  const s = ctx.s;
  for (const f of s.factions) {
    const due = s.flags[planKey(f)];
    if (due === undefined || due !== s.day) continue;
    delete s.flags[planKey(f)];
    const leader = findVillager(s, f.leader);
    if (!leader || leader.status === 'dead') continue;
    if (leaderBest(s, f) >= BAN_LEADER_CONVICTION) {
      emit(ctx, { step: 'rival', code: 'FACTION_STANDS_DOWN', importance: 3, actor: leader.id, text: `${leader.name} has seen enough to be persuaded. The ${f.name} does not bar the gatherings.` });
      f.grievance = Math.max(0, f.grievance - 1);
      continue;
    }
    f.budget -= 1;
    f.cooldownUntil = s.day + 3;
    f.grievance += 1;
    s.flags.gatherBanUntil = s.day + 1;
    s.stats.rivalActions++;
    emit(ctx, {
      step: 'rival', code: 'FACTION_BAN', importance: 3, actor: leader.id,
      text: `${leader.name} and the ${f.name} bar public gatherings tomorrow: they have seen crowds called and no proof. Speak to people one at a time, or stage a demonstration.`,
    });
  }
}

/** After the night: decide whether to announce a move for tomorrow, and endorse what deserves it. */
export function runFactionPlan(ctx: Ctx): void {
  const s = ctx.s;
  const crowds = recentGatherings(s);
  const comp = components(s.world, passableMask(s.world));
  for (const f of s.factions) {
    const leader = findVillager(s, f.leader);
    if (!leader || leader.status === 'dead') continue;
    // --- endorsement: a firm believer who trusts the Keeper vouches for the law to their own people, once per law
    for (const cid of playerClaims(s)) {
      const lc = leader.beliefs[cid]?.conv ?? 0;
      const key = `fend:${f.id}:${cid}`;
      if (lc < 65 || (s.flags[key] ?? 0) > 0 || leader.keeperTrust < 40 || s.day < f.cooldownUntil) continue;
      // word only travels where people can walk: a leader cut off by a fallen bridge cannot reach the other bank
      const members = s.villagers.filter((v) => v.faction === f.id && v.id !== leader.id && v.status !== 'dead' && connected(s.world, comp, leader.x, leader.y, v.x, v.y));
      if (!members.length) continue;
      s.flags[key] = 1;
      let moved = 0;
      for (const m of members) {
        const b = m.beliefs[cid] ?? (m.beliefs[cid] = { conv: 0, heard: 0, lastDay: -1, lastSource: null, evidence: 0, cause: null, stale: 0 });
        if (b.conv >= 85) continue;
        b.conv = round1(b.conv + 6);
        b.heard += 1;
        b.lastDay = s.day;
        b.lastSource = leader.id;
        moved++;
      }
      emit(ctx, {
        step: 'rival', code: 'FACTION_ENDORSES', importance: 3, actor: leader.id, claim: cid, reason: 'FRIEND_TRUST',
        text: `${leader.name} tells the ${f.name} to take “${claimDef(s, cid).short}” seriously (${moved} people move).`,
      });
    }
    // --- hostile: the Council bars crowds that arrive without proof
    if (f.kind !== 'council' || f.budget <= 0 || s.day < f.cooldownUntil || s.flags[planKey(f)] !== undefined) continue;
    if (crowds < 2 || leaderBest(s, f) >= BAN_LEADER_CONVICTION || f.trustInKeeper >= 55) continue;
    const execDay = s.day + 1;
    if (execDay + 1 > s.maxDay) continue;
    s.flags[planKey(f)] = execDay;
    emit(ctx, {
      step: 'rival', code: 'FACTION_TELEGRAPH', importance: 3, actor: leader.id, reason: 'COUNCIL',
      text: `${leader.name} and the ${f.name} are preparing to bar public gatherings: you have called ${crowds} crowds in three days and they have been shown no proof. Win ${leader.name} over (conviction ${BAN_LEADER_CONVICTION}) before tomorrow ends, or call no more crowds.`,
    });
  }
}

/** Open faction plans, for forecasts and callouts. */
export function pendingFactionPlans(s: RunState): { faction: Faction; day: number; leaderName: string; leaderId: string; conviction: number }[] {
  const out: { faction: Faction; day: number; leaderName: string; leaderId: string; conviction: number }[] = [];
  for (const f of s.factions) {
    const d = s.flags[planKey(f)];
    if (d === undefined) continue;
    const leader = findVillager(s, f.leader);
    out.push({ faction: f, day: d, leaderName: leader?.name ?? f.leader, leaderId: f.leader, conviction: Math.round(leaderBest(s, f)) });
  }
  return out;
}
