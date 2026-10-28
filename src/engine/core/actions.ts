import { emit, type Ctx } from './events.ts';
import { cloneState } from './clone.ts';
import { claimDef, findClaimDef, findLandmark, findVillager, trustOf, neighborsOf, edgeBetween, allClaimDefs, evidenceMult, modActive, repeatMult } from './lookup.ts';
import { pledgeKey } from '../progress/options.ts';
import { MAX_CUSTOM_CLAIMS, buildClaim, composeCostOf } from '../nl/build.ts';
import { MAX_REALITY_CLAIMS, buildRealityClaim } from '../reality/build.ts';
import { realityComposeCost } from '../reality/cost.ts';
import { coincidenceOf, NO_COINCIDENCE_OMEN, poweredBy, WAKING_OMEN, WRITTEN_OMEN_TEXT } from '../reality/demonstrate.ts';
import { realityRules } from '../reality/state.ts';
import { installClaim } from '../nl/stress.ts';
import { NL_VERSION } from '../nl/ontology.ts';
import { memoryFactor, remember } from './memory.ts';
import type { Action, ActionError, ActionResult, ClaimDef, GameEvent, Landmark, RitualDef, RunState, Villager } from './types.ts';
import { K, ensureBelief, evidenceGain, gossipDelta, REASON_TEXT, relevance, round1, seedGain } from '../social/persuasion.ts';
import { judged, validateChoice } from '../mind/decide.ts';
import { TALK_MODES, checkedReply, offlineReply, talkCost } from '../mind/talk.ts';
import { thinkersPerDay, type Approach, type Intent, type Tone } from '../mind/types.ts';
import { bfsDist, components, connected, passableMask } from '../world/nav.ts';
import { idx } from '../world/grid.ts';

export const STAGE_EXTRA_AP = 1;
export const GATHER_AP = 2;

type Fail = { ok: false; error: ActionError };
const fail = (code: string, message: string, alternatives?: string[]): Fail => ({ ok: false, error: { code, message, alternatives } });

export function keeperAnchor(s: RunState): Landmark | undefined {
  return findLandmark(s, s.scn.anchor);
}

/** Can the Keeper walk to this tile today? */
export function keeperCanReach(s: RunState, x: number, y: number): boolean {
  const a = keeperAnchor(s);
  if (!a) return true;
  const mask = passableMask(s.world);
  const comp = components(s.world, mask);
  return connected(s.world, comp, a.x, a.y, x, y);
}

export function actionCost(s: RunState, a: Action): number {
  switch (a.type) {
    case 'SCOUT':
      return s.freeScoutUsed ? 1 : 0;
    case 'SEED':
    case 'MESSENGER':
    case 'COUNTER':
      return 1;
    case 'GATHER':
      return GATHER_AP;
    case 'RITUAL': {
      const r = s.scn.rituals.find((x) => x.id === a.ritual);
      return r ? r.ap + (a.claim ? STAGE_EXTRA_AP : 0) : 1;
    }
    case 'PICK_STARTER':
      return 0;
    case 'TRADE':
      return s.scn.deals?.find((d) => d.id === a.deal)?.ap ?? 1;
    case 'COMPOSE':
      // what a belief costs to write follows from its strength (nl/balance.ts, reality/balance.ts), never from what the request says
      return a.claim?.reality ? realityComposeCost(s, a.claim.reality.ast) : composeCostOf(a.claim?.custom?.ast);
    case 'TALK':
      return talkCost(a.mode);
    case 'NPC_DECIDE':
    case 'END_DAY':
      return 0;
  }
}

/** Omen for a ritual tonight: +1 convincing, 0 weak, -1 backfires. Derived from the visible forecast. */
export function omenFor(s: RunState, kind: RitualDef['omen']): { value: -1 | 0 | 1; text: string } {
  const th = s.threat[Math.min(s.day, s.threat.length) - 1];
  if (!th) return { value: 0, text: 'No omen.' };
  switch (kind) {
    case 'river_trend':
      return th.trend === 'ebbing'
        ? { value: 1, text: 'Good omen: the river is ebbing tonight. It will look like the fire turned it.' }
        : th.trend === 'steady'
          ? { value: 0, text: 'Weak omen: the river holds steady. Few will be impressed.' }
          : { value: -1, text: 'Bad omen: the river is rising tonight. A fire now will look foolish.' };
    case 'bridge_calm':
      return th.level <= 2
        ? { value: 1, text: 'Good omen: a calm night. The bridge will stand, and be seen to stand.' }
        : th.level === 3
          ? { value: 0, text: 'Weak omen: the river is working at the piers.' }
          : { value: -1, text: 'Bad omen: the flood is heavy. The bridge may be seen to fail.' };
    case 'rain_tonight':
      return th.rain > 0
        ? { value: 1, text: 'Good omen: rain is coming. If it veers, they will believe.' }
        : { value: -1, text: 'Bad omen: a dry night. Ringing the bells will change nothing.' };
    case 'pack_quiet':
      return th.pack <= 1 ? { value: 1, text: 'Good omen: the pack is quiet tonight.' } : th.pack === 2 ? { value: 0, text: 'Weak omen: wolves are restless.' } : { value: -1, text: 'Bad omen: the pack is hunting.' };
    case 'moon_clear':
      return th.heat >= 2 ? { value: 1, text: 'Good omen: a clear, bright night.' } : { value: 0, text: 'Weak omen: haze over the moon.' };
    case 'fire_calm':
      return th.wind <= 1 ? { value: 1, text: 'Good omen: no wind tonight.' } : { value: -1, text: 'Bad omen: wind stirs the embers.' };
    case 'none':
      return { value: 0, text: '' };
  }
}

/**
 * The omen for staging a ritual as proof of a story. An authored story reads its ritual's omen (V1); a written belief under rules 2
 * reads it from what the belief does (reality/demonstrate.ts), and is a kind night as soon as it is waking, because then it acts.
 */
export function stagingOmen(s: RunState, ritual: RitualDef, claim?: string | null): { value: -1 | 0 | 1; text: string } {
  const def = claim ? findClaimDef(s, claim) : undefined;
  if (!def?.reality || realityRules(s) < 2) return omenFor(s, ritual.omen);
  if (s.laws.some((l) => l.claimId === def.id && (l.progress > 0 || l.status === 'active' || l.status === 'wavering'))) return { value: 1, text: WAKING_OMEN };
  // a rite that powers none of its clauses (a copy proved the way its authored twin is) reads that rite's own omen
  const kind = coincidenceOf(def.reality.ast, ritual.id);
  if (kind === 'none' && ritual.omen !== 'none' && !poweredBy(def.reality.ast, ritual.id)) return omenFor(s, ritual.omen);
  if (kind === 'none') return { value: -1, text: NO_COINCIDENCE_OMEN };
  const value = omenFor(s, kind).value;
  return { value, text: WRITTEN_OMEN_TEXT[kind][value] };
}

function spokeToday(s: RunState, vid: string): boolean {
  return (s.flags[`spoke:${vid}`] ?? -1) === s.day;
}

function ensureIntroduced(s: RunState, claimId: string): void {
  const c = s.claims.find((x) => x.id === claimId);
  if (c && !c.introduced) {
    c.introduced = true;
    c.introducedDay = s.day;
  }
}

function claimAvailable(s: RunState, claimId: string): boolean {
  return !!s.claims.find((c) => c.id === claimId)?.available;
}

function reachableTargets(s: RunState): { mask: Uint8Array; comp: Int16Array } {
  const mask = passableMask(s.world);
  return { mask, comp: components(s.world, mask) };
}

/** Validate and apply an action to a COPY of the state. Pure from the caller's point of view. */
export function applyAction(state: RunState, action: Action): ActionResult {
  if (state.phase !== 'planning' || state.outcome) return fail('RUN_OVER', 'The run is over. Start a new one or review the debrief.');
  if (action.type === 'END_DAY') return fail('USE_END_DAY', 'End the day with resolveDay().');
  const cost = actionCost(state, action);
  if (cost > state.ap) return fail('NO_INFLUENCE', `This needs ${cost} Influence; you have ${state.ap}.`, ['Spend Influence on something cheaper', 'End the day to recover Influence']);
  if (state.starter === null && action.type !== 'PICK_STARTER' && action.type !== 'SCOUT')
    return fail('CHOOSE_STORY', 'Choose your first story before acting.', state.scn.starters.map((c) => `PICK_STARTER ${c}`));

  const s = cloneState(state);
  const ctx: Ctx = { s, events: [], expect: false };
  const err = perform(ctx, action);
  if (err) return err;
  s.ap -= cost;
  s.stats.apSpent += cost;
  s.stats.actions += 1;
  s.today.push({ day: s.day, action, cost });
  return { ok: true, state: s, events: ctx.events, cost, summary: ctx.events.filter((e) => e.step === 'action' && e.importance >= 1).map((e) => e.text).join(' ') };
}

function perform(ctx: Ctx, a: Action): Fail | null {
  const s = ctx.s;
  switch (a.type) {
    case 'PICK_STARTER': {
      if (s.starter !== null) return fail('ALREADY_PICKED', 'You already chose your first story.');
      if (!s.scn.starters.includes(a.claim)) return fail('BAD_STARTER', 'That is not one of the opening stories.', s.scn.starters);
      s.starter = a.claim;
      const c = s.claims.find((x) => x.id === a.claim)!;
      c.available = true;
      emit(ctx, { step: 'action', code: 'STARTER_CHOSEN', importance: 2, claim: a.claim, text: `You choose to tell: “${claimDef(s, a.claim).text}”` });
      return null;
    }
    case 'SCOUT': {
      const v = findVillager(s, a.target);
      if (!v) {
        const lm = findLandmark(s, a.target);
        if (!lm) return fail('UNKNOWN_TARGET', `Nothing here is called ${a.target}.`);
        s.stats.scouts++;
        s.freeScoutUsed = true;
        emit(ctx, { step: 'action', code: 'SCOUT', importance: 1, text: `You study ${lm.name}.` });
        return null;
      }
      if (v.status === 'dead') return fail('DEAD', `${v.name} is gone.`);
      v.scoutedUntil = s.day + 1;
      s.freeScoutUsed = true;
      s.stats.scouts++;
      emit(ctx, { step: 'action', code: 'SCOUT', importance: 1, target: v.id, text: `You watch ${v.name} closely. Their private convictions are now clear for two days.` });
      return null;
    }
    case 'SEED': {
      const v = findVillager(s, a.target);
      if (!v || v.status === 'dead') return fail('BAD_TARGET', 'That person cannot be reached.');
      if (!claimAvailable(s, a.claim)) return fail('CLAIM_LOCKED', 'You have not learned that story yet.');
      const def = claimDef(s, a.claim);
      if (def.rival && !def.adoptable) return fail('RIVAL_CLAIM', 'That is a rival rumour. You can only challenge it.');
      if (spokeToday(s, v.id)) return fail('ALREADY_SPOKE', `You have already spoken with ${v.name} today.`);
      if (!keeperCanReach(s, v.x, v.y)) return fail('NO_PATH', `${v.name} is cut off. Without the bridge you cannot reach them. A messenger already on their side still can.`);
      const b = ensureBelief(v, a.claim);
      if (b.conv >= 88) return fail('ALREADY_CONVINCED', `${v.name} already believes it.`);
      if (v.keeperTrust < 8) return fail('NO_TRUST', `${v.name} will not hear you.`);
      const gain = seedGain(v, b) * repeatMult(s) * memoryFactor(v, a.claim);
      const before = b.conv;
      b.conv = round1(b.conv + gain);
      b.heard += 1;
      b.lastDay = s.day;
      b.stale = 0;
      b.lastSource = 'keeper';
      ensureIntroduced(s, a.claim);
      s.flags[`spoke:${v.id}`] = s.day;
      s.stats.seeds++;
      if (!s.stats.usedClaims.includes(a.claim)) s.stats.usedClaims.push(a.claim);
      const id = emit(ctx, {
        step: 'action', code: 'RUMOR_SEEDED', importance: 2, target: v.id, claim: a.claim, reason: 'KEEPER_WORD',
        delta: { conviction: [Math.round(before), Math.round(b.conv)] },
        text: `You tell ${v.name}: “${def.short}”. Conviction ${Math.round(before)} → ${Math.round(b.conv)}${v.traits.skepticism >= 70 ? ' (a skeptic: words alone barely move them)' : ''}.`,
      });
      b.cause = id;
      if (s.stats.firstBeliefDay === null && b.conv >= 50) s.stats.firstBeliefDay = s.day;
      return null;
    }
    case 'MESSENGER': {
      const from = findVillager(s, a.from);
      const to = findVillager(s, a.to);
      if (!from || !to || from.status === 'dead' || to.status === 'dead' || from.id === to.id) return fail('BAD_TARGET', 'Choose two living, different people.');
      if (!claimAvailable(s, a.claim)) return fail('CLAIM_LOCKED', 'You have not learned that story yet.');
      const def = claimDef(s, a.claim);
      const fb = from.beliefs[a.claim];
      if (!fb || fb.conv < 35) return fail('NOT_A_BELIEVER', `${from.name} does not believe it firmly enough (needs 35+) to carry it.`);
      if (from.busyUntil >= s.day) return fail('BUSY', `${from.name} is already carrying a message today.`);
      const t = messengerTrust(s, from, to);
      if (t < 15) return fail('NO_TIE', `${to.name} has no tie of trust to ${from.name}.`);
      const { comp } = reachableTargets(s);
      if (!connected(s.world, comp, from.x, from.y, to.x, to.y)) return fail('NO_PATH', `${from.name} cannot reach ${to.name} today.`);
      const tb = ensureBelief(to, a.claim);
      if (tb.conv >= 88) return fail('ALREADY_CONVINCED', `${to.name} already believes it.`);
      const edge = edgeBetween(s, from.id, to.id) ?? null;
      const g = gossipDelta({
        speakerConv: fb.conv, speakerEvidence: fb.evidence, speakerInfluence: from.traits.influence + 15, speakerId: from.id, trust: t, edge,
        listener: to, listenerConv: tb.conv, listenerEvidence: tb.evidence, heard: tb.heard, lastSource: tb.lastSource, lastDay: tb.lastDay, day: s.day, relevance: relevance(def, to),
      });
      const gain = g.delta * K.MESSENGER * repeatMult(s) * (g.delta > 0 ? memoryFactor(to, a.claim) : 1);
      const before = tb.conv;
      tb.conv = round1(tb.conv + Math.max(-30, Math.min(40, gain)));
      tb.heard += 1;
      tb.lastDay = s.day;
      tb.stale = 0;
      tb.lastSource = from.id;
      ensureIntroduced(s, a.claim);
      from.busyUntil = s.day;
      from.duty = 'messenger';
      from.dutyNote = `Carrying the story to ${to.name}.`;
      s.stats.messengers++;
      const id = emit(ctx, {
        step: 'action', code: 'MESSENGER_SENT', importance: 2, actor: from.id, target: to.id, claim: a.claim, reason: g.reason === 'DISTRUST_REVERSAL' ? g.reason : 'MESSENGER',
        cause: fb.cause != null ? [fb.cause] : [],
        delta: { conviction: [Math.round(before), Math.round(tb.conv)] },
        text: `${from.name} carries “${def.short}” to ${to.name} (trust ${Math.round(t)}). Conviction ${Math.round(before)} → ${Math.round(tb.conv)}.`,
      });
      if (tb.conv > before) tb.cause = id;
      return null;
    }
    case 'RITUAL':
      return doRitual(ctx, a);
    case 'GATHER':
      return doGather(ctx, a);
    case 'COUNTER': {
      const v = findVillager(s, a.target);
      if (!v || v.status === 'dead') return fail('BAD_TARGET', 'That person cannot be reached.');
      if (!claimAvailable(s, a.claim)) return fail('CLAIM_LOCKED', 'You have not learned that story yet.');
      const against = s.claims.find((c) => c.id === a.against);
      if (!against) {
        const rivals = s.claims.filter((c) => (s.scn.claimDefs.find((d) => d.id === c.id) ?? c.def)?.rival).map((c) => c.id);
        return fail('BAD_CLAIM', `Unknown rumour “${a.against}”.${rivals.length ? ` Rival rumours you can challenge: ${rivals.join(', ')}.` : ' This village has no rival rumour to challenge.'}`, rivals.map((id) => `COUNTER against ${id}`));
      }
      const myDef = claimDef(s, a.claim);
      const rivalDef = claimDef(s, a.against);
      if (!myDef.contradicts.includes(a.against) && !rivalDef.contradicts.includes(a.claim)) return fail('NOT_CONTESTED', 'Those two stories do not compete.');
      if (!keeperCanReach(s, v.x, v.y)) return fail('NO_PATH', `${v.name} is cut off.`);
      const planned = s.rivals.find((r) => r.plan?.target === v.id && r.claim === a.against);
      const rb = v.beliefs[a.against] ?? (planned ? ensureBelief(v, a.against) : undefined);
      if (!rb || (rb.conv < 10 && !planned)) return fail('NOTHING_TO_COUNTER', `${v.name} does not hold that rumour.`);
      const mb = ensureBelief(v, a.claim);
      const reduce = 14 * (0.5 + (0.6 * v.keeperTrust) / 100 + mb.evidence / 200) * (1 - (0.5 * v.traits.stubbornness) / 100);
      const before = rb.conv;
      rb.conv = round1(Math.max(-20, rb.conv - reduce));
      let erode = 0;
      if (mb.evidence < 20 && mb.conv > 0) {
        erode = Math.min(mb.conv, 3);
        mb.conv = round1(mb.conv - erode);
      }
      s.stats.counters++;
      const plan = s.rivals.find((r) => r.plan?.target === v.id && r.claim === a.against);
      if (plan?.plan) {
        plan.countered += 1;
        s.stats.rivalCountered++;
      }
      emit(ctx, {
        step: 'action', code: 'RUMOR_CHALLENGED', importance: 2, target: v.id, claim: a.against, reason: 'COUNTER',
        delta: { rival: [Math.round(before), Math.round(rb.conv)] },
        text: `You challenge “${rivalDef.short}” with ${v.name}: ${Math.round(before)} → ${Math.round(rb.conv)}${erode ? `. Without proof it cost you credibility (${myDef.short} −${Math.round(erode)})` : ''}${plan?.plan ? '. The planned campaign against them is blunted' : ''}.`,
      });
      return null;
    }
    case 'TRADE':
      return doTrade(ctx, a);
    case 'COMPOSE':
      return doCompose(ctx, a);
    case 'NPC_DECIDE':
      return doNpcDecide(ctx, a);
    case 'TALK':
      return doTalk(ctx, a);
    case 'END_DAY':
      return fail('USE_END_DAY', 'End the day with resolveDay().');
  }
}

/**
 * Compose Belief. The request carries a structure and the player's words; everything else (the rule, its thresholds, what it costs,
 * what it contradicts, whether it passes the safety test) is rebuilt here by the same function the composer used, so a stale,
 * edited or invented claim is refused and nothing the client says about its own strength is believed.
 */
/**
 * Decisions a model proposed for the villagers due to think today. Each is held to the live run (validateChoice); the accepted
 * ones are kept for dusk, the rest are named and left to the game's own policy. A request built against an older village
 * (another action happened since) is refused whole: the policy decides instead, and nothing asks the model again.
 */
function doNpcDecide(ctx: Ctx, a: Extract<Action, { type: 'NPC_DECIDE' }>): Fail | null {
  const s = ctx.s;
  const minds = s.v2?.minds;
  if (!minds) return fail('NO_MINDS', 'Villager decisions belong to Generative Reality runs.');
  if (a.rev !== s.nextEventId) return fail('STALE_REVISION', 'The village has changed since these decisions were asked for. The villagers will decide for themselves at dusk.');
  if (!Array.isArray(a.decisions) || a.decisions.length < 1 || a.decisions.length > thinkersPerDay(s)) return fail('BAD_DECISIONS', `Send 1 to ${thinkersPerDay(s)} decisions.`);
  const accepted: string[] = [];
  const refused: string[] = [];
  for (const d of a.decisions) {
    const who = findVillager(s, String(d?.citizenId ?? ''))?.name ?? String(d?.citizenId ?? '?').slice(0, 40);
    if (minds.decided[d.citizenId]) {
      refused.push(`${who} (already decided today)`);
      continue;
    }
    if (minds.modelUsed >= minds.modelCap) {
      refused.push(`${who} (this run's allowance of model decisions is spent)`);
      continue;
    }
    const r = validateChoice(s, { ...d, intent: d.intent as Intent, tone: d.tone as Tone, approach: d.approach as Approach, source: 'model' });
    if (!r.ok) {
      refused.push(`${who} (${r.why})`);
      continue;
    }
    minds.decided[d.citizenId] = r.choice;
    minds.modelUsed += 1;
    accepted.push(who);
  }
  emit(ctx, {
    step: 'action', code: 'NPC_DECISIONS', importance: 1,
    text: `${accepted.length ? `${accepted.join(', ')} will act on what they decided` : 'No proposed decision could be used'}${refused.length ? `; the game decides for ${refused.join('; ')}` : ''}.`,
  });
  return null;
}

/**
 * The Keeper talks with a villager. They answer from their own memories (or a model's line, checked against those memories); what
 * changes is decided here: asking changes nothing but what you learn; arguing for a story is the Keeper's word (V1's seeding,
 * stronger if they saw it work, weaker if they saw it fail); challenging one weighs trust and stubbornness against what they saw.
 */
function doTalk(ctx: Ctx, a: Extract<Action, { type: 'TALK' }>): Fail | null {
  const s = ctx.s;
  if (!s.v2?.minds) return fail('NO_MINDS', 'Conversations belong to Generative Reality runs. In this run, tell villagers a story.');
  if (!(TALK_MODES as readonly string[]).includes(a.mode)) return fail('BAD_MODE', 'Ask, argue, challenge, or ask what they make of things.');
  const v = findVillager(s, a.target);
  if (!v || v.status === 'dead') return fail('BAD_TARGET', 'That person cannot be reached.');
  if (!keeperCanReach(s, v.x, v.y)) return fail('NO_PATH', `${v.name} is cut off. Without the bridge you cannot reach them.`);
  const claim = a.claim ?? null;
  if (a.mode !== 'guess' && !claim) return fail('NO_CLAIM', 'Choose the story to talk about.');
  const def = claim ? findClaimDef(s, claim) : undefined;
  if (claim && !def) return fail('BAD_CLAIM', 'The village does not know that story.');
  const arguing = a.mode === 'persuade' || a.mode === 'challenge';
  if (arguing ? spokeToday(s, v.id) : (s.flags[`talk:${v.id}`] ?? -1) === s.day) return fail('ALREADY_SPOKE', `You have already ${arguing ? 'argued with' : 'talked with'} ${v.name} today.`);
  if (arguing && v.keeperTrust < 8) return fail('NO_TRUST', `${v.name} will not hear you.`);
  // asking never plants a story: only arguing about it does
  const b = claim ? (arguing ? ensureBelief(v, claim) : (v.beliefs[claim] ?? null)) : null;
  const seen = claim ? judged(s, v.id, claim) : 0;
  let before = b?.conv ?? 0;
  if (a.mode === 'persuade' && b && claim) {
    if (!claimAvailable(s, claim)) return fail('CLAIM_LOCKED', 'You have not learned that story yet.');
    if (def!.rival && !def!.adoptable) return fail('RIVAL_CLAIM', 'That is a rival rumour. You can only challenge it.');
    if (b.conv >= 88) return fail('ALREADY_CONVINCED', `${v.name} already believes it.`);
    const gain = seedGain(v, b) * repeatMult(s) * memoryFactor(v, claim) * (seen > 0 ? 1.2 : seen < 0 ? 0.6 : 1);
    before = b.conv;
    b.conv = round1(b.conv + gain);
    b.heard += 1;
    b.lastSource = 'keeper';
    ensureIntroduced(s, claim);
    s.stats.seeds++;
  } else if (a.mode === 'challenge' && b) {
    if (b.conv < 10) return fail('NOTHING_TO_COUNTER', `${v.name} does not hold that story.`);
    const reduce = 14 * (0.5 + (0.6 * v.keeperTrust) / 100) * (1 - (0.5 * v.traits.stubbornness) / 100) * (seen > 0 ? 0.5 : 1) * (b.evidence >= 40 ? 0.6 : 1);
    before = b.conv;
    b.conv = round1(Math.max(-20, b.conv - reduce));
    s.stats.counters++;
  }
  if (b) {
    b.lastDay = s.day;
    b.stale = 0;
  }
  if (arguing) s.flags[`spoke:${v.id}`] = s.day;
  else s.flags[`talk:${v.id}`] = s.day;
  const moved = b ? b.conv - before : 0;
  const reply = checkedReply(s, v.id, a.reply) ?? offlineReply(s, v, a.mode, claim, moved);
  const first = v.name.split(' ')[0];
  const opener = a.mode === 'ask' ? `You ask ${v.name} about “${def!.short}”.` : a.mode === 'persuade' ? `You argue for “${def!.short}” with ${v.name}.` : a.mode === 'challenge' ? `You challenge ${v.name} over “${def!.short}”.` : `You ask ${v.name} what they make of things${def ? ` (“${def.short}”)` : ''}.`;
  const id = emit(ctx, {
    step: 'action', code: 'KEEPER_TALKED', importance: arguing ? 2 : 1, target: v.id, reason: a.mode,
    ...(claim ? { claim } : {}),
    ...(arguing && b ? { delta: { conviction: [Math.round(before), Math.round(b.conv)] as [number, number] } } : {}),
    text: `${opener} ${first}${reply.source === 'model' ? ' (voiced by a model)' : ''}: “${reply.line}”${arguing && b ? ` Conviction ${Math.round(before)} → ${Math.round(b.conv)}.` : ''}`,
  });
  if (b && moved > 0) b.cause = id;
  return null;
}

function doCompose(ctx: Ctx, a: Extract<Action, { type: 'COMPOSE' }>): Fail | null {
  const s = ctx.s;
  if (a.claim?.reality) return doComposeReality(ctx, a);
  if (!s.flags.inventor) return fail('NOT_AVAILABLE', 'Writing your own belief is part of Inventor runs. Start one from the briefing (Inventor mode is unranked).');
  const made = s.claims.filter((c) => c.def?.custom).length;
  if (made >= MAX_CUSTOM_CLAIMS) return fail('TOO_MANY', `You can write at most ${MAX_CUSTOM_CLAIMS} beliefs in one run.`);
  const custom = a.claim?.custom;
  if (!custom || typeof custom.text !== 'string') return fail('BAD_BELIEF', 'A composed belief must carry the text it was written from and its structure.');
  if (custom.nl !== NL_VERSION) return fail('STALE_BELIEF', `That belief was written for version ${String(custom.nl)} of the belief language; this game reads version ${NL_VERSION}, and the same words could now mean something else. Write it again.`);
  const built = buildClaim(s, custom.ast, custom.text, { title: a.claim.short, source: custom.source === 'model' ? 'model' : 'offline', stress: true });
  if (!built.ok) return fail(built.code, built.message, built.alternatives);
  const def = built.draft.claim;
  if (def.custom?.astHash !== custom.astHash) return fail('STALE_BELIEF', 'That belief was prepared under other rules or for another village. Interpret it again.');
  if (s.claims.some((c) => c.id === def.id)) return fail('ALREADY_WRITTEN', 'You already wrote that belief.');
  installClaim(s, def);
  s.flags.composed = ((s.flags.composed as number | undefined) ?? 0) + 1;
  emit(ctx, {
    step: 'action', code: 'BELIEF_WRITTEN', importance: 2, claim: def.id,
    text: `You write a new belief into the village: “${def.short}”. It needs ${Math.round(def.spec.thresholds.on * 100)}% local support and ${def.spec.thresholds.minSupporters} firm believers before it can wake. ${def.unlockDay !== undefined && s.day < def.unlockDay ? `The village will take it up on day ${def.unlockDay}.` : 'Now tell someone.'}`,
  });
  return null;
}

/**
 * Compose a Generative Reality belief. The request carries an AST v2 and the run revision it was previewed against; the claim is
 * rebuilt here from that structure alone (validation, grounding in this village, balance, costs), so nothing the client says about
 * its strength is believed, and a confirmation made against a village that has since changed is refused (STALE_REVISION).
 */
function doComposeReality(ctx: Ctx, a: Extract<Action, { type: 'COMPOSE' }>): Fail | null {
  const s = ctx.s;
  const r = a.claim.reality!;
  if (!s.v2) return fail('NOT_AVAILABLE', 'Beliefs in the reality language are written in Generative Reality runs.');
  if (s.v2.living) return fail('NOT_AVAILABLE', 'A Living Village is won with its own stories and its people’s arguments: written beliefs belong to Generative Reality runs.');
  const made = s.claims.filter((c) => c.def?.reality && !c.def.rival).length;
  if (made >= MAX_REALITY_CLAIMS + (s.v2.lab ? 2 : 0)) return fail('TOO_MANY', `You can write at most ${MAX_REALITY_CLAIMS + (s.v2.lab ? 2 : 0)} beliefs in one run.`);
  if (r.rev !== s.nextEventId) return fail('STALE_REVISION', 'The village has changed since this belief was read. Read it again (reading is free).');
  const built = buildRealityClaim(s, r.ast, { title: a.claim.short, rev: r.rev });
  if (!built.ok) return fail(built.code, `${built.message}${built.issues.length ? ` ${built.issues.slice(0, 3).join('; ')}.` : ''}`);
  const def = built.draft.claim;
  if (def.reality!.hash !== r.hash) return fail('STALE_BELIEF', 'That belief was prepared under other rules. Read it again.');
  if (s.claims.some((c) => c.id === def.id)) return fail('ALREADY_WRITTEN', 'You already wrote a belief that does exactly this.');
  installClaim(s, def);
  s.flags.composed = ((s.flags.composed as number | undefined) ?? 0) + 1;
  emit(ctx, {
    step: 'action', code: 'BELIEF_WRITTEN', importance: 2, claim: def.id,
    text: `You write a new belief into the village: “${def.short}”. It needs ${Math.round(def.spec.thresholds.on * 100)}% local support and ${def.spec.thresholds.minSupporters} firm believers before it can wake. Now tell someone.`,
  });
  return null;
}

function doTrade(ctx: Ctx, a: Extract<Action, { type: 'TRADE' }>): Fail | null {
  const s = ctx.s;
  const deal = s.scn.deals?.find((d) => d.id === a.deal);
  if (!deal) return fail('NO_DEAL', 'There is no such deal here.');
  const broker = findVillager(s, deal.broker);
  if (!broker || broker.status === 'dead') return fail('NO_BROKER', 'The merchant is gone.');
  if (!keeperCanReach(s, broker.x, broker.y)) return fail('NO_PATH', `${broker.name} is cut off.`);
  const used = (s.flags[`deal:${deal.id}`] ?? 0) as number;
  if (used >= deal.limit) return fail('DEAL_USED', `${broker.name} will not send more than ${deal.limit} shipments.`);
  const best = Math.max(0, ...allClaimDefs(s).filter((c) => !c.rival).map((c) => broker.beliefs[c.id]?.conv ?? 0));
  if (best < deal.minConviction) return fail('WANTS_PROOF', `${broker.name} wants proof before sharing grain: she must firmly believe one of your stories (her conviction in your best one is ${Math.round(best)} on a scale of 100; she needs ${deal.minConviction}).`, ['Stage proof where she can see it', 'Have a trusted friend carry the story to her']);
  let slot = 0;
  while (s.flags[`caravan:${slot}`] !== undefined) slot++;
  if (slot >= 1) return fail('IN_TRANSIT', 'A shipment is already on the road. Dalia will not send a second until it arrives.');
  s.flags[`caravan:${slot}`] = s.day + deal.delay;
  s.flags[`caravanFood:${slot}`] = deal.food;
  s.flags[`deal:${deal.id}`] = used + 1;
  emit(ctx, { step: 'action', code: 'TRADE_AGREED', importance: 2, target: broker.id, text: `${broker.name} agrees: ${deal.food} food will arrive in ${deal.delay} days, if the hillside road stays open.` });
  return null;
}

function messengerTrust(s: RunState, from: Villager, to: Villager): number {
  const direct = trustOf(s, to.id, from.id);
  if (edgeBetween(s, from.id, to.id)) return direct;
  let best = 0;
  for (const n of neighborsOf(s, from.id)) {
    const t2 = trustOf(s, to.id, n.id);
    if (t2 > 0 && n.back > 0) best = Math.max(best, (t2 * n.back * 0.8) / 100);
  }
  return best;
}

function doRitual(ctx: Ctx, a: Extract<Action, { type: 'RITUAL' }>): Fail | null {
  const s = ctx.s;
  const ritual = s.scn.rituals.find((r) => r.id === a.ritual);
  if (!ritual) return fail('BAD_RITUAL', 'Unknown ritual.');
  const lm = findLandmark(s, a.landmark);
  if (!lm || lm.kind !== ritual.landmark) return fail('BAD_SITE', `${ritual.label} must be done at a ${ritual.landmark}.`);
  if (!keeperCanReach(s, lm.x, lm.y)) return fail('NO_PATH', `You cannot reach ${lm.name} today.`);
  if ((ritual.physical === 'light' || ritual.physical === 'smoke') && modActive(s, pledgeKey('no_fire'))) return fail('PLEDGE', 'You swore to light no fire. The oath holds.');
  if (ritual.physical === 'light' || ritual.physical === 'smoke') {
    if (lm.hp <= 0) return fail('DESTROYED', `${lm.name} is gone.`);
    if (lm.lit && lm.fuelNights >= 3) return fail('ALREADY_LIT', `${lm.name} is already burning well.`);
    if ((s.world.stocks.fuel ?? 0) < ritual.fuel) return fail('NO_FUEL', `You need ${ritual.fuel} fuel; ${s.world.stocks.fuel ?? 0} left.`);
  }
  if (ritual.physical === 'ring' && (lm.data.ringing ?? 0) > 0) return fail('ALREADY_RUNG', 'The bells are already set to ring tonight.');
  if (ritual.physical === 'ring' && modActive(s, 'silent_bells') && s.day < (s.scn.consts.bellsMendedDay ?? 4)) return fail('BELLS_SILENT', `The clapper is cracked. The bells cannot ring before day ${s.scn.consts.bellsMendedDay ?? 4}.`);
  if (ritual.physical === 'vigil' && lm.hp <= 0) return fail('DESTROYED', 'There is no bridge left to watch.');
  if (ritual.physical === 'vigil' && (s.flags.vigilDay ?? -1) === s.day) return fail('ALREADY_VIGIL', 'A vigil is already planned for tonight.');
  let def: ClaimDef | null = null;
  if (a.claim) {
    if (!claimAvailable(s, a.claim)) return fail('CLAIM_LOCKED', 'You have not learned that story yet.');
    def = claimDef(s, a.claim);
    if (def.ritual !== ritual.id) return fail('WRONG_PROOF', `${ritual.label} does not prove “${def.short}”.`);
  }
  // physical effect
  if (ritual.physical === 'light' || ritual.physical === 'smoke') {
    lm.lit = true;
    lm.fuelNights = Math.min(5, lm.fuelNights + 3);
    s.world.stocks.fuel = (s.world.stocks.fuel ?? 0) - ritual.fuel;
    s.stats.noBeacons = false;
  } else if (ritual.physical === 'ring') lm.data.ringing = 1;
  else if (ritual.physical === 'vigil') s.flags.vigilDay = s.day;
  else if (ritual.physical === 'night_labor') lm.data.moonlit = 1;
  s.stats.rituals++;
  const omen = stagingOmen(s, ritual, a.claim);
  const rid = emit(ctx, {
    step: 'action', code: 'RITUAL', importance: 2, claim: a.claim, tile: [lm.x, lm.y],
    text: `${ritual.verb} — ${lm.name}.${a.claim ? ` ${omen.text}` : ''}`,
  });
  if (!def || !a.claim) return null;
  ensureIntroduced(s, a.claim);
  if (!s.stats.usedClaims.includes(a.claim)) s.stats.usedClaims.push(a.claim);
  // witnesses
  const E = ritual.strength * (omen.value > 0 ? 1.35 : omen.value === 0 ? 0.45 : -0.9) * stagingFatigue(s, ritual.id, lm.id) * (omen.value > 0 || omen.value === 0 ? evidenceMult(s) : 1);
  const { comp } = reachableTargets(s);
  const witnesses: Villager[] = [];
  for (const v of s.villagers) {
    if (v.status === 'dead') continue;
    const d = Math.sqrt((v.x - lm.x) * (v.x - lm.x) + (v.y - lm.y) * (v.y - lm.y));
    if (d > ritual.witnessRadius) continue;
    if (!connected(s.world, comp, v.x, v.y, lm.x, lm.y)) continue;
    witnesses.push(v);
  }
  s.flags[`stage:${ritual.id}:${lm.id}`] = ((s.flags[`stage:${ritual.id}:${lm.id}`] ?? 0) as number) + 1;
  const lines: string[] = [];
  for (const v of witnesses) {
    const b = ensureBelief(v, a.claim);
    const before = b.conv;
    const gain = evidenceGain(v, b, E) * (b.heard === 0 ? 0.8 : 1);
    b.conv = round1(b.conv + gain);
    b.heard += 1;
    b.lastDay = s.day;
    b.stale = 0;
    b.lastSource = 'keeper';
    if (E > 0) b.evidence = Math.min(100, b.evidence + E * 0.9);
    else {
      v.keeperTrust = Math.max(0, v.keeperTrust - 6);
      remember(v, { kind: 'proof_failed', day: s.day, claim: a.claim, text: `watched a demonstration of “${def.short}” go wrong` });
    }
    if (E > 0) v.keeperTrust = Math.min(100, v.keeperTrust + 2);
    b.cause = rid;
    lines.push(`${v.name} ${Math.round(before)}→${Math.round(b.conv)}`);
  }
  if (E > 0) s.stats.goodEvidence++;
  else {
    s.stats.failedEvidence++;
    s.flags.failedEvidenceDay = s.day;
    s.flags.failedEvidenceLandmark = 0;
  }
  const ev = emit(ctx, {
    step: 'action', code: E > 0 ? 'EVIDENCE_STAGED' : 'EVIDENCE_BACKFIRED', importance: 2, claim: a.claim, cause: [rid], tile: [lm.x, lm.y],
    reason: E > 0 ? 'PUBLIC_DEMONSTRATION' : 'CONTRADICTORY_WITNESS',
    text: `${witnesses.length} watch${witnesses.length === 1 ? 'es' : ''}: ${lines.slice(0, 6).join(', ')}${lines.length > 6 ? '…' : ''}. ${E > 0 ? 'They saw it with their own eyes.' : 'It looked foolish. Trust in you suffers.'}`,
  });
  for (const v of witnesses) {
    const b = v.beliefs[a.claim];
    if (b) b.cause = ev;
  }
  return null;
}

/** Repeating the same stunt in the same place loses its shine. */
function stagingFatigue(s: RunState, ritualId: string, lmId: string): number {
  const n = (s.flags[`stage:${ritualId}:${lmId}`] ?? 0) as number;
  return n <= 0 ? 1 : n === 1 ? 0.6 : 0.3;
}

function doGather(ctx: Ctx, a: Extract<Action, { type: 'GATHER' }>): Fail | null {
  const s = ctx.s;
  const site = findLandmark(s, a.site);
  if (!site || !['chapel', 'market', 'hall', 'shelter', 'well'].includes(site.kind)) return fail('BAD_SITE', 'Choose a gathering place: chapel, market, hall or shelter.');
  if (!claimAvailable(s, a.claim)) return fail('CLAIM_LOCKED', 'You have not learned that story yet.');
  const def = claimDef(s, a.claim);
  if (def.rival && !def.adoptable) return fail('RIVAL_CLAIM', 'That is a rival rumour.');
  if (modActive(s, pledgeKey('no_gathering'))) return fail('PLEDGE', 'You swore to hold no public gatherings. The pledge holds.');
  if ((s.flags.gatherBanUntil ?? -1) >= s.day) return fail('COUNCIL_BAN', 'The Council has forbidden public gatherings today. Speak to people one at a time.');
  if (!keeperCanReach(s, site.x, site.y)) return fail('NO_PATH', `You cannot reach ${site.name} today.`);
  const { comp } = reachableTargets(s);
  const cands = s.villagers
    .filter((v) => v.status !== 'dead')
    .filter((v) => Math.sqrt((v.x - site.x) * (v.x - site.x) + (v.y - site.y) * (v.y - site.y)) <= 9 && connected(s.world, comp, v.x, v.y, site.x, site.y))
    .filter((v) => (v.beliefs[a.claim]?.conv ?? 0) < 88);
  const invite = new Set(a.invite ?? []);
  cands.sort((x, y) => (invite.has(y.id) ? 1 : 0) - (invite.has(x.id) ? 1 : 0) || y.traits.influence - x.traits.influence || (x.id < y.id ? -1 : 1));
  const attendees = cands.slice(0, 6);
  if (attendees.length === 0) return fail('EMPTY', 'Nobody is near enough to hear you there today.');
  const recent = (s.flags.gatherDay1 ?? -9) >= s.day - 2 ? 1 : 0;
  const recent2 = (s.flags.gatherDay2 ?? -9) >= s.day - 2 ? 1 : 0;
  const fatigue = recent + recent2 >= 1 ? 0.6 : 1;
  s.flags.gatherDay2 = s.flags.gatherDay1 ?? -9;
  s.flags.gatherDay1 = s.day;
  const believers = attendees.filter((v) => (v.beliefs[a.claim]?.conv ?? 0) >= 40).length;
  const opposers = attendees.filter((v) => (v.beliefs[a.claim]?.conv ?? 0) <= -25 || (def.contradicts.some((c) => (v.beliefs[c]?.conv ?? 0) >= 40))).length;
  const crowd = (1 + 0.1 * believers) * Math.max(0.5, 1 - 0.15 * opposers) * fatigue;
  const lines: string[] = [];
  const gid = emit(ctx, { step: 'action', code: 'GATHERING', importance: 2, claim: a.claim, tile: [site.x, site.y], text: `You gather ${attendees.length} at ${site.name}.` });
  for (const v of attendees) {
    const b = ensureBelief(v, a.claim);
    const before = b.conv;
    const gain = seedGain(v, b) * K.GATHER * crowd * repeatMult(s) * (modActive(s, 'busy_harvest') ? 0.55 : 1) * memoryFactor(v, a.claim);
    b.conv = round1(b.conv + gain);
    b.heard += 1;
    b.lastDay = s.day;
    b.stale = 0;
    b.lastSource = 'keeper';
    b.cause = gid;
    lines.push(`${v.name} ${Math.round(before)}→${Math.round(b.conv)}`);
    if (fatigue < 1) v.traits.skepticism = Math.min(100, v.traits.skepticism + 1);
  }
  ensureIntroduced(s, a.claim);
  if (!s.stats.usedClaims.includes(a.claim)) s.stats.usedClaims.push(a.claim);
  s.stats.gatherings++;
  s.flags.gatheringsTotal = (s.flags.gatheringsTotal ?? 0) + 1;
  emit(ctx, {
    step: 'action', code: 'GATHERING_RESULT', importance: 1, claim: a.claim, cause: [gid],
    text: `${lines.join(', ')}.${fatigue < 1 ? ' The crowd has heard this before; it lands softer.' : ''}${opposers ? ` ${opposers} doubter${opposers === 1 ? '' : 's'} muttered.` : ''}`,
  });
  return null;
}

// ------------------------------------------------------------------ listing + previews

export interface Selection {
  villager?: string;
  landmark?: string;
  claim?: string;
}

export interface ActionOption {
  action: Action;
  label: string;
  cost: number;
  enabled: boolean;
  reason?: string;
}

function labelOf(s: RunState, a: Action): string {
  const nm = (id: string) => findVillager(s, id)?.name ?? findLandmark(s, id)?.name ?? id;
  const cl = (id: string) => {
    try {
      return claimDef(s, id).short;
    } catch {
      return id;
    }
  };
  switch (a.type) {
    case 'SCOUT':
      return `Scout ${nm(a.target)}`;
    case 'SEED':
      return `Tell ${nm(a.target)}: ${cl(a.claim)}`;
    case 'MESSENGER':
      return `${nm(a.from)} tells ${nm(a.to)}: ${cl(a.claim)}`;
    case 'RITUAL': {
      const r = s.scn.rituals.find((x) => x.id === a.ritual);
      return `${r?.label ?? a.ritual} at ${nm(a.landmark)}${a.claim ? ` as proof of ${cl(a.claim)}` : ''}`;
    }
    case 'GATHER':
      return `Gather at ${nm(a.site)}: ${cl(a.claim)}`;
    case 'COUNTER':
      return `Challenge ${cl(a.against)} with ${nm(a.target)}`;
    case 'PICK_STARTER':
      return `Begin with: ${cl(a.claim)}`;
    case 'TRADE':
      return s.scn.deals?.find((d) => d.id === a.deal)?.label ?? `Trade: ${a.deal}`;
    case 'COMPOSE':
      return `Write a belief: “${a.claim.short || a.claim.text}”`;
    case 'NPC_DECIDE':
      return `Villagers decide (${a.decisions.length})`;
    case 'TALK':
      return `${a.mode === 'ask' ? 'Ask' : a.mode === 'persuade' ? 'Argue with' : a.mode === 'challenge' ? 'Challenge' : 'Ask what they make of it:'} ${nm(a.target)}${a.claim ? ` about ${cl(a.claim)}` : ''}`;
    case 'END_DAY':
      return 'End the day';
  }
}

export function describeAction(s: RunState, a: Action): string {
  return labelOf(s, a);
}

/** Enumerate every legal action (and optionally disabled ones with reasons). Bots and the UI both use this. */
export function getAvailableActions(s: RunState, sel: Selection = {}, opts: { includeDisabled?: boolean } = {}): ActionOption[] {
  const out: ActionOption[] = [];
  if (s.phase !== 'planning' || s.outcome) return out;
  const push = (action: Action) => {
    const cost = actionCost(s, action);
    let enabled = true;
    let reason: string | undefined;
    const probe = applyAction(s, action);
    if (!probe.ok) {
      enabled = false;
      reason = probe.error.message;
    }
    if (enabled || opts.includeDisabled) out.push({ action, label: labelOf(s, action), cost, enabled, reason });
  };
  if (s.starter === null) {
    for (const c of s.scn.starters) push({ type: 'PICK_STARTER', claim: c });
    return out;
  }
  const claims = s.claims.filter((c) => c.available);
  const living = s.villagers.filter((v) => v.status !== 'dead');
  // a rival's announced campaign can be challenged before their rumour has even started to spread
  for (const r of s.rivals) {
    const t = r.plan?.target;
    if (!t || !r.plan || claims.some((c) => c.id === r.claim)) continue;
    if (sel.villager && sel.villager !== t) continue;
    for (const mine of claims) if (!claimDef(s, mine.id).rival) push({ type: 'COUNTER', claim: mine.id, against: r.claim, target: t });
  }
  const match = (id: string) => !sel.villager || sel.villager === id;
  for (const c of claims) {
    if (sel.claim && sel.claim !== c.id) continue;
    const def = claimDef(s, c.id);
    if (def.rival) {
      for (const v of living) if (match(v.id) && ((v.beliefs[c.id]?.conv ?? 0) >= 10 || s.rivals.some((r) => r.plan?.target === v.id && r.claim === c.id))) for (const mine of claims) if (!claimDef(s, mine.id).rival) push({ type: 'COUNTER', claim: mine.id, against: c.id, target: v.id });
      if (!def.adoptable) continue;
    }
    for (const v of living) if (match(v.id)) push({ type: 'SEED', claim: c.id, target: v.id });
    if (!sel.villager) {
      for (const f of living) {
        if ((f.beliefs[c.id]?.conv ?? 0) < 35) continue;
        for (const n of neighborsOf(s, f.id)) {
          const to = findVillager(s, n.id);
          if (to && to.status !== 'dead' && (to.beliefs[c.id]?.conv ?? 0) < 60) push({ type: 'MESSENGER', claim: c.id, from: f.id, to: n.id });
        }
      }
    } else {
      const f = findVillager(s, sel.villager);
      if (f && (f.beliefs[c.id]?.conv ?? 0) >= 35)
        for (const n of neighborsOf(s, f.id)) push({ type: 'MESSENGER', claim: c.id, from: f.id, to: n.id });
    }
    for (const lm of s.world.landmarks) {
      if (!['chapel', 'market', 'hall', 'shelter', 'well'].includes(lm.kind)) continue;
      if (sel.landmark && sel.landmark !== lm.id) continue;
      if (!sel.villager) push({ type: 'GATHER', claim: c.id, site: lm.id });
    }
    if (def.ritual) {
      const r = s.scn.rituals.find((x) => x.id === def.ritual);
      if (r) for (const lm of s.world.landmarks) if (lm.kind === r.landmark && (!sel.landmark || sel.landmark === lm.id) && !sel.villager) push({ type: 'RITUAL', ritual: r.id, landmark: lm.id, claim: c.id });
    }
  }
  if (!sel.villager) {
    for (const r of s.scn.rituals)
      for (const lm of s.world.landmarks) if (lm.kind === r.landmark && (!sel.landmark || sel.landmark === lm.id)) push({ type: 'RITUAL', ritual: r.id, landmark: lm.id });
  }
  for (const d of s.scn.deals ?? []) if (!sel.claim) push({ type: 'TRADE', deal: d.id, target: d.broker });
  for (const v of living) if (match(v.id) && !sel.claim) push({ type: 'SCOUT', target: v.id });
  return out;
}

export interface Preview {
  ok: boolean;
  cost: number;
  error?: ActionError;
  lines: string[];
  deltas: { id: string; name: string; before: number; after: number; claim: string }[];
  warnings: string[];
}

/** Exact dry-run of an action on a clone: what changes, what it costs, what could go wrong. */
export function previewAction(s: RunState, action: Action): Preview {
  const res = applyAction(s, action);
  if (!res.ok) return { ok: false, cost: actionCost(s, action), error: res.error, lines: [res.error.message], deltas: [], warnings: [] };
  const deltas: Preview['deltas'] = [];
  for (const v of res.state.villagers) {
    const old = s.villagers.find((x) => x.id === v.id)!;
    for (const [cid, b] of Object.entries(v.beliefs)) {
      const before = old.beliefs[cid]?.conv ?? 0;
      if (Math.abs(b.conv - before) >= 0.5) deltas.push({ id: v.id, name: v.name, before: Math.round(before), after: Math.round(b.conv), claim: cid });
    }
  }
  const warnings: string[] = [];
  if (action.type === 'RITUAL') {
    const r = s.scn.rituals.find((x) => x.id === action.ritual);
    if (r && action.claim) {
      const o = stagingOmen(s, r, action.claim);
      if (o.value < 0) warnings.push(o.text);
    }
    if (r?.physical === 'light') warnings.push('Lit flames can ignite adjacent fields, trees and cottages.');
  }
  if (action.type === 'GATHER' && s.stats.gatherings >= 1) warnings.push('Repeated gatherings draw the Council’s attention.');
  // a story only travels overnight from people who hold it at K.SPREAD or more: say so before the Influence is spent
  const told = action.type === 'SEED' || action.type === 'MESSENGER' || action.type === 'GATHER' || action.type === 'RITUAL' ? action.claim : undefined;
  if (told) {
    const moved = deltas.filter((d) => d.claim === told && d.after > d.before);
    const alreadyCarried = s.villagers.some((v) => v.status !== 'dead' && (v.beliefs[told]?.conv ?? 0) >= K.SPREAD);
    if (moved.length && !alreadyCarried && !moved.some((d) => d.after >= K.SPREAD)) {
      warnings.push(`${moved[0].name.split(' ')[0]} would hold it at ${moved[0].after}: below ${K.SPREAD}, nobody repeats a story yet, so it will not spread tonight.`);
    }
  }
  return { ok: true, cost: res.cost, lines: res.events.filter((e) => e.step === 'action').map((e) => e.text), deltas, warnings };
}

export function reasonText(code: string): string {
  return REASON_TEXT[code] ?? code;
}

export function allClaims(s: RunState): ClaimDef[] {
  return allClaimDefs(s);
}

export type { GameEvent };
export { idx, bfsDist };
