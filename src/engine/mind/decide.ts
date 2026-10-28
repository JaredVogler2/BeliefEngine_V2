import { emit, type Ctx } from '../core/events.ts';
import { claimDef, edgeBetween, findClaimDef, findLandmark, findVillager, neighborsOf, trustOf } from '../core/lookup.ts';
import { clamp } from '../core/rng.ts';
import { sanitizeText } from '../nl/parse.ts';
import type { RunState, Villager } from '../core/types.ts';
import { danger } from '../ai/utility.ts';
import { predictedWater } from '../ai/routines.ts';
import { ensureBelief, evidenceGain, gossipDelta, REASON_TEXT, relevance, round1, type ReasonCode } from '../social/persuasion.ts';
import { components, connected, passableMask } from '../world/nav.ts';
import { APPROACHES, INTENTS, THINKERS_PER_DAY, TONES, type Choice, type Episode, type Intent, type Moment, type MindsState, type Queued } from './types.ts';

/**
 * Decisions (phase 07). A villager due to think picks one move from those open to them right now; a model may propose it, and
 * otherwise the game's own policy does. Either way the proposal is held to the live run (legal move, legal target, a story the
 * village knows, memories that are really theirs), and its effect is decided here by V1's own persuasion and evidence rules: a
 * spoken line never changes anyone's mind by itself. Accepted decisions are recorded as actions, so replays never ask a model.
 */

export interface Eligible {
  intent: Intent;
  /** legal targets (villager or landmark ids); empty: the move takes none */
  targets: string[];
  /** stories the move may be about; empty: it is about none */
  claims: string[];
}

const LOSS = new Set(['lost_kin', 'lost_home', 'lost_herd', 'lost_crop', 'trapped']);
/**
 * How much a deliberate retelling (on top of the night's gossip) and a witness's account (instead of it) weigh against one
 * exposure of V1 gossip. Measured against Classic win rates with the strategy bots: see docs/PROGRESS.md (phase 08).
 */
const SPREAD_MULT = 0.6;
const STAGE_MULT = 0.8;
const WORKED = new Set(['REALITY_EFFECT', 'BRIDGE_HELD', 'HOME_SPARED', 'LIFE_SPARED', 'FIELD_SPARED', 'PEN_SPARED', 'EVIDENCE_STAGED', 'LAW_ACTIVATED']);
const FAILED = new Set(['EVIDENCE_BACKFIRED', 'LAW_DISCREDITED', 'LAW_COLLAPSED']);

const alive = (v: Villager | undefined): v is Villager => !!v && v.status !== 'dead';
const conv = (v: Villager, c: string) => v.beliefs[c]?.conv ?? 0;
const short = (s: RunState, c: string) => findClaimDef(s, c)?.short ?? c;

function episodes(s: RunState, vid: string): Episode[] {
  return s.v2?.minds?.agents[vid]?.episodes ?? [];
}

/** Stories a villager has seen judged: +1 worked, -1 failed, 0 neither. */
export function judged(s: RunState, vid: string, claim: string): number {
  let n = 0;
  for (const e of episodes(s, vid)) if (e.claim === claim && e.judge && e.witnessed) n += e.kind === 'saw_proof_fail' ? -1 : 1;
  return Math.sign(n);
}

/**
 * A reason to deny what one saw (phase 08): a villager whose household just lost something while a story's law held over them,
 * and who puts family or property first, may argue against it anyway. The engine knows it is untrue (it holds their memories).
 */
export function motiveToDeny(s: RunState, v: Villager, claim: string): boolean {
  const m = s.v2?.minds?.agents[v.id];
  if (!m || !m.goals.some((g) => g === 'feed_family' || g === 'protect_home' || g === 'protect_herd' || g === 'protect_fields')) return false;
  if (!m.episodes.some((e) => LOSS.has(e.kind) && e.day >= s.day - 3 && e.kind !== 'trapped')) return false;
  return s.laws.some((l) => l.claimId === claim && (l.status === 'active' || l.status === 'wavering') && (findClaimDef(s, claim)?.electorate?.[l.regionId] ?? [l.regionId]).includes(v.district));
}

/** The moves open to a villager right now, each with its legal targets and stories. `wait` is always open. */
export function eligibleIntents(s: RunState, vid: string): Eligible[] {
  const v = findVillager(s, vid);
  const out: Eligible[] = [];
  if (!alive(v) || v.duty === 'trapped') return [{ intent: 'wait', targets: [], claims: [] }];
  const comp = components(s.world, passableMask(s.world));
  const near = neighborsOf(s, v.id)
    .map((n) => ({ ...n, v: findVillager(s, n.id) }))
    .filter((n): n is typeof n & { v: Villager } => alive(n.v) && connected(s.world, comp, v.x, v.y, n.v.x, n.v.y))
    .sort((a, b) => b.trust - a.trust || (a.id < b.id ? -1 : 1))
    .slice(0, 12);
  const held = Object.keys(v.beliefs).filter((c) => !!findClaimDef(s, c)).sort();
  const push = (intent: Intent, targets: string[], claims: string[]) => out.push({ intent, targets: [...new Set(targets)].slice(0, 12), claims: [...new Set(claims)].slice(0, 6) });

  const loud = held.filter((c) => Math.abs(conv(v, c)) >= 12).sort((a, b) => Math.abs(conv(v, b)) - Math.abs(conv(v, a)) || (a < b ? -1 : 1));
  if (loud.length && near.length) push('spread', near.map((n) => n.id), loud);
  const sure = held.filter((c) => conv(v, c) >= 40);
  const unsure = near.filter((n) => sure.some((c) => conv(n.v, c) < 30));
  if (sure.length && unsure.length) push('persuade', unsure.map((n) => n.id), sure);
  // doubt: disbelief, a failed proof seen, a family reason to deny, or a skeptic's "nobody has shown me" (phase 08)
  const skeptic = (s.v2?.minds?.agents[v.id]?.personality.skepticism ?? 0) >= 60;
  const doubted = held.filter((c) => conv(v, c) <= -10 || judged(s, v.id, c) < 0 || motiveToDeny(s, v, c) || (skeptic && judged(s, v.id, c) === 0 && conv(v, c) < 20));
  const believers = near.filter((n) => doubted.some((c) => conv(n.v, c) >= 30));
  if (doubted.length && believers.length) push('challenge', believers.map((n) => n.id), doubted);
  const askable = [...new Set(near.flatMap((n) => Object.keys(n.v.beliefs).filter((c) => Math.abs(conv(n.v, c)) >= 30 && Math.abs(conv(v, c)) < 30 && !!findClaimDef(s, c))))].sort();
  if (askable.length) push('ask', near.filter((n) => askable.some((c) => Math.abs(conv(n.v, c)) >= 30)).map((n) => n.id), askable);
  const testable = held.filter((c) => s.laws.some((l) => l.claimId === c) || s.log.some((e) => e.claim === c && e.day >= s.day - 2 && (WORKED.has(e.code) || FAILED.has(e.code))));
  if (testable.length) push('investigate', [], testable);
  const close = near.filter((n) => ['household', 'kin', 'friend'].includes(n.edge.kind) && (n.v.fear >= 45 || episodes(s, n.id).some((e) => LOSS.has(e.kind) && e.day >= s.day - 2)));
  if (close.length) push('comfort', close.map((n) => n.id), []);
  const proven = held.filter((c) => conv(v, c) >= 40 && judged(s, v.id, c) > 0);
  if (proven.length && s.villagers.some((x) => alive(x) && x.id !== v.id && x.district === v.district)) push('stage_evidence', [], proven);
  // the flood: leaving early, and taking in a neighbour the shelters cannot hold (children decide neither; V1 shelters them first)
  if (s.scn.features.flood && v.duty !== 'evacuate' && v.duty !== 'shelter' && v.archetype !== 'child') {
    const water = predictedWater(s);
    const home = findLandmark(s, v.homeId);
    const mine = danger(s, home, water);
    const used = new Map<string, number>();
    for (const x of s.villagers) if (alive(x) && (x.duty === 'shelter' || x.duty === 'evacuate')) used.set(x.place, (used.get(x.place) ?? 0) + 1);
    for (const vid of Object.keys(s.v2?.minds?.moves ?? {})) {
      const sh = s.v2!.minds!.moves[vid];
      used.set(sh, (used.get(sh) ?? 0) + 1);
    }
    const open = (from: Villager) => s.world.landmarks.filter((l) => l.kind === 'shelter' && (used.get(l.id) ?? 0) < l.capacity && danger(s, l, water) < 75 && connected(s.world, comp, from.x, from.y, l.x, l.y));
    // a home that will take some water but not enough for the village to evacuate it: going early is a real choice
    if (mine >= 35 && mine < 75) {
      const shelters = open(v);
      if (shelters.length) push('move', shelters.map((l) => l.id), []);
    }
    if (mine === 0 && home && home.hp > 0) {
      const atRisk = s.villagers.filter((x) => alive(x) && x.duty !== 'shelter' && x.duty !== 'evacuate' && x.duty !== 'watch' && danger(s, findLandmark(s, x.homeId), water) >= 75);
      const room = s.world.landmarks.filter((l) => l.kind === 'shelter' && danger(s, l, water) < 75).reduce((a, l) => a + Math.max(0, l.capacity - (used.get(l.id) ?? 0)), 0);
      const needy = atRisk.filter((x) => x.homeId !== v.homeId && !s.v2?.minds?.refuge[x.id] && connected(s.world, comp, v.x, v.y, x.x, x.y) && (room < atRisk.length || !open(x).length));
      const mineFirst = needy.sort((a, b) => Number(!!edgeBetween(s, v.id, b.id)) - Number(!!edgeBetween(s, v.id, a.id)) || (a.id < b.id ? -1 : 1));
      if (mineFirst.length) push('support_rescue', mineFirst.slice(0, 6).map((x) => x.id), []);
    }
  }
  // an empiricist, or anyone skeptical enough, may ask to see an undecided story shown before they believe it
  const m = s.v2?.minds;
  const empiricist = s.factions.find((f) => f.id === v.faction)?.kind === 'scholars';
  if (m && ((m.agents[v.id]?.personality.skepticism ?? 0) >= 55 || empiricist)) {
    const open = new Set((m.tests ?? []).filter((t) => t.by === v.id).map((t) => t.claim));
    const showable = held.filter((c) => Math.abs(conv(v, c)) < 50 && !open.has(c) && judged(s, v.id, c) === 0 && !!testPlace(s, v, c));
    if (showable.length) push('request_test', [], showable);
  }
  out.push({ intent: 'wait', targets: [], claims: [] });
  return out;
}

/** Where a story could be shown to this villager: its ritual's landmark, or a written belief's anchor, nearest them. */
export function testPlace(s: RunState, v: Villager, claim: string): string | null {
  const def = findClaimDef(s, claim);
  if (!def) return null;
  const ritual = def.ritual ? s.scn.rituals.find((r) => r.id === def.ritual) : undefined;
  const ast = def.reality?.ast;
  const anchor = ritual?.landmark ?? (ast ? ({ bell: 'belltower', lantern: 'beacon', smoke_fire: 'campfire', watchers: 'bridge' } as Record<string, string>)[JSON.stringify(ast.clauses[0]?.when ?? {}).match(/"event":"([a-z_]+)"/)?.[1] ?? ''] : undefined);
  if (!anchor) return null;
  const sites = s.world.landmarks.filter((l) => l.kind === anchor && l.hp > 0);
  sites.sort((a, b) => Math.max(Math.abs(a.x - v.x), Math.abs(a.y - v.y)) - Math.max(Math.abs(b.x - v.x), Math.abs(b.y - v.y)) || (a.id < b.id ? -1 : 1));
  return sites[0]?.id ?? null;
}

/** Text a villager says or thinks: cleaned and bounded, link-like text removed (it is shown, never followed). */
export function cleanLine(t: string | null | undefined, max: number): string | null {
  if (t === null || t === undefined) return null;
  const c = sanitizeText(String(t)).replace(/\b(?:https?:\/\/|www\.)\S+/gi, '').replace(/[<>]/g, '').trim();
  return c ? c.slice(0, max) : null;
}

/** Holds a proposed decision to the live run. The villager must be due to think today; everything it names must be real. */
export function validateChoice(s: RunState, c: Choice): { ok: true; choice: Choice } | { ok: false; why: string } {
  const minds = s.v2?.minds;
  if (!minds) return { ok: false, why: 'this run has no villager minds' };
  if (!minds.queue.some((q) => q.id === c.citizenId)) return { ok: false, why: 'not a villager due to think today' };
  if (!(INTENTS as readonly string[]).includes(c.intent)) return { ok: false, why: 'not a move' };
  const move = eligibleIntents(s, c.citizenId).find((e) => e.intent === c.intent);
  if (!move) return { ok: false, why: `"${c.intent}" is not a move this villager can make now` };
  if (move.targets.length ? c.target === null || !move.targets.includes(c.target) : c.target !== null) return { ok: false, why: 'the target is not a legal one for that move' };
  if (move.claims.length ? c.claimId === null || !move.claims.includes(c.claimId) : c.claimId !== null) return { ok: false, why: 'the story is not one this move can be about' };
  const mine = new Set(episodes(s, c.citizenId).map((e) => e.id));
  if (!Array.isArray(c.cites) || c.cites.length > 3 || c.cites.some((x) => !mine.has(x))) return { ok: false, why: 'cites a memory this villager does not have' };
  return {
    ok: true,
    choice: {
      citizenId: c.citizenId, intent: c.intent, target: c.target, claimId: c.claimId, cites: c.cites.slice(0, 3),
      dialogue: cleanLine(c.dialogue, 160), thought: cleanLine(c.thought, 200) ?? '',
      tone: (TONES as readonly string[]).includes(c.tone) ? c.tone : 'calm', approach: (APPROACHES as readonly string[]).includes(c.approach) ? c.approach : 'testimony',
      confidence: clamp(Math.round(Number(c.confidence) || 0), 0, 100), source: c.source === 'model' ? 'model' : 'policy',
    },
  };
}

// ------------------------------------------------------------------------------------------ effects

/** A belief change caused by a villager, reported exactly as V1 reports gossip (so the log, debrief and memories read it). */
function shift(ctx: Ctx, listener: Villager, speaker: Villager, claim: string, delta: number, reason: ReasonCode, cause: number): void {
  const s = ctx.s;
  const b = ensureBelief(listener, claim);
  const before = b.conv;
  const after = round1(before + clamp(delta, -17, 17));
  b.heard += 1;
  b.lastDay = s.day;
  b.stale = 0;
  b.lastSource = speaker.id;
  if (Math.abs(after - before) < 0.05) return;
  b.conv = after;
  const up = before < 50 && after >= 50;
  const down = before >= 50 && after < 50;
  const id = emit(ctx, {
    step: 'social', code: up ? 'BELIEVER_GAINED' : down ? 'BELIEVER_LOST' : 'BELIEF_SHIFT', importance: up || down ? 2 : Math.abs(after - before) >= 6 ? 1 : 0,
    actor: speaker.id, target: listener.id, claim, reason, delta: { conviction: [Math.round(before), Math.round(after)] }, cause: [cause],
    text: `${listener.name} ${after > before ? 'warms to' : 'cools on'} “${claimDef(s, claim).short}” (${Math.round(before)} → ${Math.round(after)}) because ${REASON_TEXT[reason] ?? reason} — ${speaker.name}.`,
  });
  if (after > before) b.cause = id;
}

function gossip(s: RunState, speaker: Villager, listener: Villager, claim: string, evidence: number): number {
  const sb = speaker.beliefs[claim];
  const lb = listener.beliefs[claim];
  return gossipDelta({
    speakerConv: sb?.conv ?? 0, speakerEvidence: evidence, speakerInfluence: speaker.traits.influence, speakerId: speaker.id,
    trust: trustOf(s, listener.id, speaker.id), edge: edgeBetween(s, speaker.id, listener.id) ?? null, listener,
    listenerConv: lb?.conv ?? 0, listenerEvidence: lb?.evidence ?? 0, heard: lb?.heard ?? 0, lastSource: lb?.lastSource ?? null, lastDay: lb?.lastDay ?? -1,
    day: s.day, relevance: relevance(claimDef(s, claim), listener),
  }).delta;
}

function nudgeTrust(s: RunState, from: string, to: string, d: number): void {
  const e = edgeBetween(s, from, to);
  if (!e) return;
  if (e.a === from) e.ab = clamp(e.ab + d, -100, 100);
  else e.ba = clamp(e.ba + d, -100, 100);
}

const said = (c: Choice) => (c.dialogue ? `: “${c.dialogue}”` : '.');

/** Applies one accepted decision. Bounded, deterministic, and only through V1's own rules. */
export function applyChoice(ctx: Ctx, c: Choice): void {
  const s = ctx.s;
  const minds = s.v2!.minds!;
  const v = findVillager(s, c.citizenId);
  if (!alive(v)) return;
  const t = c.target ? findVillager(s, c.target) : undefined;
  const cited = episodes(s, v.id).filter((e) => c.cites.includes(e.id));
  const act = (text: string, target?: string, extra: { delta?: Record<string, [number, number]> } = {}) =>
    emit(ctx, { step: 'social', code: 'NPC_ACT', importance: 1, actor: v.id, ...(target ? { target } : {}), ...(c.claimId ? { claim: c.claimId } : {}), reason: c.intent, ...extra, text });
  const claim = c.claimId;
  // arguing a story at dusk spends the day's social energy on it: they do not also broadcast it in tonight's gossip
  if (claim && (c.intent === 'persuade' || c.intent === 'challenge' || c.intent === 'stage_evidence')) (minds.argued ??= {})[v.id] = claim;
  switch (c.intent) {
    case 'spread':
      // one deliberate retelling on top of the night's ordinary gossip: worth a little more than idle talk, not a second night of it
      if (t && claim) shift(ctx, t, v, claim, SPREAD_MULT * gossip(s, v, t, claim, v.beliefs[claim]?.evidence ?? 0), 'FRIEND_TRUST', act(`${v.name} tells ${t.name} “${short(s, claim)}”${said(c)}`, t.id));
      break;
    case 'persuade':
      if (t && claim) {
        const sawIt = cited.some((e) => e.witnessed && e.claim === claim) || judged(s, v.id, claim) > 0;
        const ev = Math.max(v.beliefs[claim]?.evidence ?? 0, sawIt ? 40 : 0);
        shift(ctx, t, v, claim, (sawIt ? 1 : 0.7) * gossip(s, v, t, claim, ev), sawIt ? 'WITNESS_ACCOUNT' : 'FRIEND_TRUST', act(`${v.name} tries to win ${t.name} over to “${short(s, claim)}”${said(c)}`, t.id));
      }
      break;
    case 'challenge':
      if (t && claim && judged(s, v.id, claim) > 0) {
        // they saw it work and argue against it anyway: a lie, which the engine knows; a listener who saw it too is not fooled
        const id = emit(ctx, { step: 'social', code: 'LIE_TOLD', importance: 1, actor: v.id, target: t.id, claim, reason: 'challenge', text: `${v.name} tells ${t.name} that “${short(s, claim)}” failed, though they saw it work${said(c)}` });
        if (judged(s, t.id, claim) > 0) {
          nudgeTrust(s, t.id, v.id, -20);
          emit(ctx, { step: 'social', code: 'LIE_DISCOVERED', importance: 2, actor: t.id, target: v.id, claim, cause: [id], text: `${t.name} saw “${short(s, claim)}” work with their own eyes and knows ${v.name} is lying; they trust ${v.name} far less now.` });
        } else shift(ctx, t, v, claim, -6 * (0.5 + Math.max(0, trustOf(s, t.id, v.id)) / 200), 'NEIGHBOUR_CHALLENGE', id);
      } else if (t && claim) {
        const sawFail = cited.some((e) => e.kind === 'saw_proof_fail' && e.claim === claim) || judged(s, v.id, claim) < 0;
        const trust = Math.max(0, trustOf(s, t.id, v.id));
        const theirs = t.beliefs[claim]?.evidence ?? 0;
        // "nobody has shown me" weighs less than "I saw it fail"
        const unshown = !sawFail && (v.beliefs[claim]?.conv ?? 0) > -10;
        const cut = 10 * (0.5 + trust / 200) * (1 + (sawFail ? 0.5 : 0) + Math.max(0, -(v.beliefs[claim]?.conv ?? 0)) / 200) * (1 - t.traits.stubbornness / 200) * (theirs >= 40 ? 0.5 : 1) * (unshown ? 0.6 : 1);
        shift(ctx, t, v, claim, -cut, 'NEIGHBOUR_CHALLENGE', act(`${v.name} argues with ${t.name} against “${short(s, claim)}”${said(c)}`, t.id));
        nudgeTrust(s, t.id, v.id, -1);
      }
      break;
    case 'ask':
      if (t && claim) {
        const id = act(`${v.name} asks ${t.name} what they make of “${short(s, claim)}”${said(c)}`, t.id);
        shift(ctx, v, t, claim, 0.8 * gossip(s, t, v, claim, t.beliefs[claim]?.evidence ?? 0), (t.beliefs[claim]?.evidence ?? 0) >= 30 ? 'WITNESS_ACCOUNT' : 'FRIEND_TRUST', id);
        nudgeTrust(s, v.id, t.id, 1);
        nudgeTrust(s, t.id, v.id, 1);
      }
      break;
    case 'investigate':
      if (claim) {
        const recent = s.log.filter((e) => e.claim === claim && e.day >= s.day - 2);
        const worked = recent.filter((e) => WORKED.has(e.code)).length;
        const failed = recent.filter((e) => FAILED.has(e.code)).length;
        const found = worked > failed ? 'worked' : failed > worked ? 'failed' : 'nothing';
        const b = ensureBelief(v, claim);
        const before = b.conv;
        if (found === 'worked') {
          b.evidence = clamp(b.evidence + 12, 0, 100);
          b.conv = round1(b.conv + evidenceGain(v, b, 10));
        } else if (found === 'failed') b.conv = round1(b.conv + evidenceGain(v, b, -10));
        b.lastDay = s.day;
        b.stale = 0;
        emit(ctx, {
          step: 'social', code: 'NPC_INVESTIGATED', importance: found === 'nothing' ? 0 : 1, actor: v.id, claim, reason: found,
          ...(found !== 'nothing' ? { delta: { conviction: [Math.round(before), Math.round(b.conv)] as [number, number] } } : {}),
          text: `${v.name} goes to see for themselves whether “${short(s, claim)}” holds: ${found === 'worked' ? 'what they find bears it out' : found === 'failed' ? 'what they find speaks against it' : 'there is nothing to see yet'}.`,
        });
      }
      break;
    case 'comfort':
      if (t) {
        const before = t.fear;
        t.fear = clamp(Math.round(t.fear - (8 + minds.agents[v.id].personality.altruism / 10)), 0, 100);
        act(`${v.name} sits with ${t.name}${said(c)}`, t.id, { delta: { fear: [Math.round(before), t.fear] } });
        nudgeTrust(s, t.id, v.id, 2);
      }
      break;
    case 'move': {
      const sh = c.target ? findLandmark(s, c.target) : undefined;
      if (sh) {
        minds.moves[v.id] = sh.id;
        act(`${v.name} will not wait for the water: they will spend the night at ${sh.name}${said(c)}`);
      }
      break;
    }
    case 'stage_evidence':
      if (claim) {
        const id = act(`${v.name} tells everyone nearby what they saw of “${short(s, claim)}”${said(c)}`);
        const ev = Math.max(v.beliefs[claim]?.evidence ?? 0, 40);
        const crowd = s.villagers
          .filter((x) => alive(x) && x.id !== v.id && x.district === v.district)
          .sort((a, b) => Number(b.place === v.place) - Number(a.place === v.place) || (a.id < b.id ? -1 : 1))
          .slice(0, 3);
        for (const x of crowd) shift(ctx, x, v, claim, STAGE_MULT * gossip(s, v, x, claim, ev), 'WITNESS_ACCOUNT', id);
      }
      break;
    case 'support_rescue':
      if (t) {
        const home = findLandmark(s, v.homeId);
        if (home && home.hp > 0) {
          minds.refuge[t.id] = home.id;
          act(`${v.name} offers ${t.name} a dry floor at ${home.name} tonight${said(c)}`, t.id);
        }
      }
      break;
    case 'request_test':
      if (claim) {
        const place = testPlace(s, v, claim);
        (minds.tests ??= []).push({ by: v.id, claim, day: s.day, until: s.day + 2, place });
        const where = place ? findLandmark(s, place)?.name : null;
        emit(ctx, {
          step: 'social', code: 'TEST_REQUESTED', importance: 2, actor: v.id, claim, reason: 'request_test',
          text: `${v.name} will believe “${short(s, claim)}” only if they see it: show it${where ? ` at ${where}` : ''} by day ${s.day + 2}${said(c)}`,
        });
      }
      break;
    case 'wait':
      break;
  }
}

/**
 * Open demands for proof, at the start of each dusk (after the day's memories are made): a demonstration the asker saw answers
 * it (they believe hard, and will carry it), one they saw fail settles it the other way, and a demand nobody answered in time
 * costs the story a little and the Keeper a little trust.
 */
export function resolveTests(ctx: Ctx, fresh: Map<string, Episode[]>): void {
  const s = ctx.s;
  const minds = s.v2?.minds;
  if (!minds?.tests?.length) return;
  const keep: typeof minds.tests = [];
  for (const t of minds.tests) {
    const v = findVillager(s, t.by);
    if (!alive(v)) continue;
    const seen = (fresh.get(t.by) ?? []).filter((e) => e.claim === t.claim && e.witnessed && e.judge);
    const met = seen.some((e) => e.kind !== 'saw_proof_fail');
    const failed = !met && seen.some((e) => e.kind === 'saw_proof_fail');
    const b = ensureBelief(v, t.claim);
    const before = b.conv;
    if (met) {
      b.evidence = clamp(b.evidence + 30, 0, 100);
      b.conv = round1(b.conv + 1.5 * evidenceGain(v, b, 20));
      emit(ctx, { step: 'social', code: 'TEST_MET', importance: 2, actor: v.id, claim: t.claim, reason: 'PUBLIC_DEMONSTRATION', delta: { conviction: [Math.round(before), Math.round(b.conv)] }, text: `${v.name} saw “${short(s, t.claim)}” shown, as they asked: ${Math.round(before)} → ${Math.round(b.conv)}. They will tell people what they saw.` });
    } else if (failed) {
      b.conv = round1(b.conv + 1.5 * evidenceGain(v, b, -20));
      emit(ctx, { step: 'social', code: 'TEST_FAILED', importance: 2, actor: v.id, claim: t.claim, reason: 'CONTRADICTORY_WITNESS', delta: { conviction: [Math.round(before), Math.round(b.conv)] }, text: `${v.name} watched the proof of “${short(s, t.claim)}” fail, as they suspected: ${Math.round(before)} → ${Math.round(b.conv)}.` });
    } else if (s.day > t.until) {
      b.conv = round1(b.conv - 5);
      v.keeperTrust = clamp(v.keeperTrust - 3, 0, 100);
      emit(ctx, { step: 'social', code: 'TEST_LAPSED', importance: 1, actor: v.id, claim: t.claim, delta: { conviction: [Math.round(before), Math.round(b.conv)] }, text: `Nobody showed ${v.name} “${short(s, t.claim)}”. They take that as an answer.` });
    } else {
      keep.push(t);
      continue;
    }
    b.lastDay = s.day;
    b.stale = 0;
  }
  minds.tests = keep;
}

/** What moment a new memory makes, if any. */
function momentOf(s: RunState, vid: string, e: Episode): { why: Moment; weight: number } | null {
  const v = findVillager(s, vid);
  if (!v) return null;
  if (LOSS.has(e.kind)) return { why: 'loss', weight: 3 };
  const c = e.claim ? conv(v, e.claim) : 0;
  if (e.kind === 'saw_proof_fail' || ((e.kind === 'saw_proof' || e.kind === 'saw_law_work') && e.claim && c < 0)) return { why: 'contradiction', weight: 3 };
  if ((e.kind === 'told' || e.kind === 'keeper_told' || e.kind === 'campaigned') && e.claim && (v.beliefs[e.claim]?.heard ?? 0) <= 1) return { why: 'novel_claim', weight: 2 };
  if (e.kind === 'npc_spoke' && e.valence < 0) return { why: 'argument', weight: 2 };
  if (e.kind === 'law_news' && e.salience >= 2) return { why: 'law_change', weight: 2 };
  if ((e.kind === 'saw_fire' || e.kind === 'saw_flood' || e.kind === 'saw_wolves' || e.kind === 'bridge_fell') && e.salience >= 2) return { why: 'crisis', weight: 2 };
  return null;
}

/**
 * Night: who will think tomorrow. Each villager's most salient new memory (or a faction call) makes a moment; the strongest few
 * moments are queued, one decision per villager per day.
 */
export function planMinds(s: RunState, fresh: Map<string, Episode[]>, events: { code: string; actor?: string; claim?: string; id: number }[]): void {
  const minds: MindsState | undefined = s.v2?.minds;
  if (!minds) return;
  const cands: (Queued & { score: number })[] = [];
  const add = (q: Queued, score: number) => {
    const old = cands.find((x) => x.id === q.id);
    if (old && old.score >= score) return;
    if (old) cands.splice(cands.indexOf(old), 1);
    cands.push({ ...q, score });
  };
  for (const [vid, eps] of [...fresh.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const v = findVillager(s, vid);
    const m = minds.agents[vid];
    if (!alive(v) || !m || v.duty === 'trapped') continue;
    for (const e of eps) {
      const mo = momentOf(s, vid, e);
      if (mo) add({ id: vid, why: mo.why, claim: e.claim, event: e.event }, mo.weight * 10 + e.salience * 3 + Math.round((m.personality.curiosity + m.personality.ambition) / 20));
    }
  }
  for (const e of events) {
    if ((e.code === 'TEST_MET' || e.code === 'TEST_FAILED') && e.actor && minds.agents[e.actor] && alive(findVillager(s, e.actor))) add({ id: e.actor, why: 'proof_seen', claim: e.claim ?? null, event: e.id }, 45);
    if (e.code === 'LIE_DISCOVERED' && e.actor && minds.agents[e.actor] && alive(findVillager(s, e.actor))) add({ id: e.actor, why: 'argument', claim: e.claim ?? null, event: e.id }, 40);
    if (e.code !== 'FACTION_ENDORSES' || !e.actor) continue;
    const leader = findVillager(s, e.actor);
    if (!leader) continue;
    for (const v of s.villagers) if (alive(v) && v.faction === leader.faction && v.id !== leader.id && minds.agents[v.id]) add({ id: v.id, why: 'faction_move', claim: e.claim ?? null, event: e.id }, 12);
  }
  minds.queue = cands
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
    .slice(0, THINKERS_PER_DAY)
    .map(({ score: _score, ...q }) => q);
}
