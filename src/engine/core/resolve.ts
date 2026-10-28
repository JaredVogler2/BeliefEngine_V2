import { assignDay, assignWatchers, commitEvacuations, moveToNight } from '../ai/routines.ts';
import { runRivalExecute, runRivalPlan } from '../ai/rivals.ts';
import { runFactionExecute, runFactionPlan } from '../ai/factions.ts';
import { computeModifiers } from '../laws/effects.ts';
import { runLawStep } from '../laws/resolver.ts';
import { runSocialStep } from '../social/propagation.ts';
import { runCropHarvest } from '../world/crops.ts';
import { countWoodcutters, runDawnNeeds, runDeliveries, runHarvest } from '../world/economy.ts';
import { updateSmoke } from '../world/sickness.ts';
import { runNight } from '../world/hazards.ts';
import { runRealityLaws, type RealityPlan } from '../reality/execute.ts';
import { realityDawn, realityDusk, realityNight } from '../reality/entities.ts';
import { captureMemories } from '../mind/memory.ts';
import { planMinds } from '../mind/decide.ts';
import { runMinds } from '../mind/run.ts';
import { considerNpcClaims } from '../mind/claims.ts';
import { cloneState } from './clone.ts';
import { emit, type Ctx } from './events.ts';
import { claimDef, findLandmark, modActive } from './lookup.ts';
import { rand } from './rng.ts';
import { evaluate } from './objectives.ts';
import { buildOutcome } from './score.ts';
import type { DaySummary, GameEvent, ResolveResult, RunState } from './types.ts';

export interface ResolveOptions {
  /** expectation mode for forecasts: no randomness, nothing is logged to the run */
  expect?: boolean;
}

/**
 * Resolve the day: rival moves land, villagers react, gossip travels, laws wake or fade, night falls on the
 * physical world, then dawn. Pure from the caller's point of view (works on a clone).
 */
export function resolveDay(state: RunState, opts: ResolveOptions = {}): ResolveResult {
  if (state.phase !== 'planning' || state.outcome) throw new Error('resolveDay: run is not in planning phase');
  const s = cloneState(state);
  const ctx: Ctx = { s, events: [], expect: !!opts.expect };
  const day = s.day;

  if (s.starter === null) {
    s.starter = s.scn.starters[0];
    const c = s.claims.find((x) => x.id === s.starter);
    if (c) c.available = true;
    emit(ctx, { step: 'action', code: 'STARTER_AUTO', importance: 1, claim: s.starter, text: `With no story chosen, the village hears: “${claimDef(s, s.starter).text}”` });
  }
  s.history.push({ day, actions: s.today.map((a) => a.action), summary: emptySummary(day) });
  emit(ctx, { step: 'action', code: 'DAY_COMMITTED', importance: 1, text: `Day ${day}: night falls.` });
  // villager minds remember the day where they spent it, and those due to think act at dusk (V2 runs only)
  const dayMemories = captureMemories(s);
  runMinds(ctx, dayMemories);

  if (s.scn.features.smoke) updateSmoke(s);
  runRivalExecute(ctx); // A  queued / announced moves land
  runFactionExecute(ctx); // A' faction moves announced yesterday land unless answered
  commitEvacuations(ctx); // people react to what is coming tonight
  runSocialStep(ctx); // B-D exposure, propagation, evidence, decay
  runLawStep(ctx); // E-F pressure, contradictions, activation / decay
  assignWatchers(ctx); // dusk: believers take their posts
  if (s.scn.features.crops) runCropHarvest(ctx);
  else runHarvest(ctx);
  countWoodcutters(ctx);
  moveToNight(ctx);
  const mods = computeModifiers(s);
  // Generative Reality laws add their own contributions and entity intents (absent in classic runs: nothing changes there)
  let reality: RealityPlan | null = null;
  if (s.v2) {
    reality = runRealityLaws(ctx, mods);
    realityDusk(ctx, reality, mods);
  }
  for (const law of s.laws) if (law.status === 'active' || law.status === 'wavering') law.activeNights += 1;
  runNight(ctx, mods); // G  hazards and resources
  if (reality) realityNight(ctx, reality);
  runRivalPlan(ctx); // H  rivals decide (announced a day ahead)
  runFactionPlan(ctx); // H' factions endorse or announce
  runDawnNeeds(ctx);
  if (reality) realityDawn(ctx, reality);

  const ev = evaluate(s); // I  threat and win/loss
  if (ev.over) {
    s.outcome = buildOutcome(s, ev);
    s.phase = 'over';
    emit(ctx, {
      step: 'eval', code: ev.result === 'victory' ? 'VICTORY' : 'DEFEAT', importance: 3,
      text: ev.result === 'victory' ? `The village endures. ${ev.reason}` : `The village is lost. ${ev.reason}`,
    });
  }
  runBeats(ctx);
  // …and the night, where they spent it; the strongest moments decide who thinks tomorrow
  const nightMemories = captureMemories(s);
  for (const [vid, eps] of dayMemories) nightMemories.set(vid, [...eps, ...(nightMemories.get(vid) ?? [])]);
  planMinds(s, nightMemories, ctx.events);
  considerNpcClaims(ctx, nightMemories);
  const summary = buildSummary(ctx.events, day);
  s.history[s.history.length - 1].summary = summary;

  // dawn
  if (!s.outcome) {
    s.day += 1;
    s.ap = Math.min(s.apMax, s.ap + s.apPerDay);
    s.freeScoutUsed = false;
    s.today = [];
    for (const c of s.claims) {
      const def = s.scn.claimDefs.find((d) => d.id === c.id) ?? c.def;
      if (!c.available && def && (!def.rival || def.adoptable) && def.unlockDay !== undefined && s.day >= def.unlockDay) {
        c.available = true;
        emit(ctx, { step: 'dawn', code: 'CLAIM_UNLOCKED', importance: 2, claim: c.id, text: `A new story is within reach: “${def.text}”` });
      }
    }
    if (modActive(s, 'divided_council')) announceCouncil(ctx);
    runDeliveries(ctx);
    assignDay(ctx);
    const th = s.threat[Math.min(s.day, s.threat.length) - 1];
    emit(ctx, { step: 'dawn', code: 'DAY_START', importance: 2, text: `Day ${s.day} of ${s.maxDay}. ${th?.label ?? ''}${th?.warning ? ` — ${th.warning}` : ''}` });
    summary.eventIds = ctx.events.map((e) => e.id);
  }
  return { state: s, events: ctx.events, summary };
}

/** Mornings on which the divided Council forbids public gatherings (never two in a row, never before day 3). */
export function councilBanDays(seed: number, maxDay: number): number[] {
  const days: number[] = [];
  for (let d = 3; d < maxDay; d++) if (rand(seed, 'council-ban', d) < 0.34 && !days.includes(d - 1)) days.push(d);
  for (let d = 3; days.length < 2 && d < maxDay; d++) if (!days.includes(d) && !days.includes(d - 1) && !days.includes(d + 1)) days.push(d);
  return days.sort((a, b) => a - b);
}

function announceCouncil(ctx: Ctx): void {
  const s = ctx.s;
  const bans = councilBanDays(s.seed, s.maxDay);
  if (bans.includes(s.day)) {
    s.flags.gatherBanUntil = s.day;
    emit(ctx, { step: 'dawn', code: 'COUNCIL_BAN', importance: 2, text: 'The divided Council has forbidden public gatherings today. Speak to people one at a time, or stage proof.' });
  } else if (bans.includes(s.day + 1)) {
    emit(ctx, { step: 'dawn', code: 'COUNCIL_PLAN', importance: 2, text: 'The Council is preparing to ban public gatherings tomorrow. Gather today if you mean to.' });
  }
}

function emptySummary(day: number): DaySummary {
  return { day, headline: '', lines: [], newBelievers: 0, lawsChanged: [], homesSpared: 0, homesLost: 0, deaths: 0, eventIds: [] };
}

function buildSummary(events: GameEvent[], day: number): DaySummary {
  const important = events.filter((e) => e.importance >= 2).sort((a, b) => b.importance - a.importance || a.id - b.id);
  const lines = important.slice(0, 7).map((e) => e.text);
  const count = (code: string) => events.filter((e) => e.code === code).length;
  const parts: string[] = [];
  const nb = count('BELIEVER_GAINED');
  if (nb) parts.push(`${nb} new believer${nb === 1 ? '' : 's'}`);
  const la = count('LAW_ACTIVATED');
  if (la) parts.push(`${la} law${la === 1 ? '' : 's'} activated`);
  const lc = count('LAW_COLLAPSED');
  if (lc) parts.push(`${lc} law${lc === 1 ? '' : 's'} collapsed`);
  const sp = count('HOME_SPARED');
  if (sp) parts.push(`${sp} home${sp === 1 ? '' : 's'} spared`);
  const hl = count('HOME_DESTROYED');
  if (hl) parts.push(`${hl} home${hl === 1 ? '' : 's'} lost`);
  const dd = count('DEATH');
  if (dd) parts.push(`${dd} lost`);
  const fb = count('FIELD_BURNED');
  if (fb) parts.push(`${fb} field${fb === 1 ? '' : 's'} burned`);
  if (count('BRIDGE_COLLAPSED')) parts.push('the bridge fell');
  if (count('RIVAL_CAMPAIGN') || count('RIVAL_REBUTTAL')) parts.push('the rival struck');
  return {
    day,
    headline: parts.length ? parts.join(', ') : 'A quiet night.',
    lines,
    newBelievers: nb,
    lawsChanged: events.filter((e) => e.code.startsWith('LAW_')).map((e) => e.law ?? ''),
    homesSpared: sp,
    homesLost: hl,
    deaths: dd,
    eventIds: events.map((e) => e.id),
  };
}

/** Story beats triggered by observable state. */
function runBeats(ctx: Ctx): void {
  const s = ctx.s;
  for (const b of s.scn.beats) {
    if (s.beatsSeen.includes(b.id)) continue;
    let hit = false;
    switch (b.when.kind) {
      case 'first_belief':
        hit = s.stats.firstBeliefDay !== null;
        break;
      case 'bridge_hp_below': {
        const br = s.world.landmarks.find((l) => l.kind === 'bridge');
        hit = !!br && br.hp > 0 && br.hp < Number(b.when.arg);
        break;
      }
      case 'rival_telegraph':
        hit = s.rivals.some((r) => r.plan !== null);
        break;
      case 'law_active':
        hit = s.laws.some((l) => l.status === 'active' && (!b.when.arg || l.claimId === b.when.arg));
        break;
      case 'day':
        hit = s.day >= Number(b.when.arg);
        break;
      case 'sick_at_least':
        hit = s.villagers.filter((v) => v.status === 'sick').length >= Number(b.when.arg);
        break;
      case 'food_below':
        hit = (s.world.stocks.food ?? 0) < Number(b.when.arg);
        break;
      case 'landmark_destroyed':
        hit = (findLandmark(s, String(b.when.arg))?.hp ?? 1) <= 0;
        break;
    }
    if (!hit) continue;
    s.beatsSeen.push(b.id);
    emit(ctx, { step: 'eval', code: 'BEAT', importance: 2, text: `${b.title}. ${b.text}` });
  }
}
