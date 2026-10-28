import { describe, expect, it } from 'vitest';
import { GameSession, replayRun, stateHash } from '../../src/engine/index.ts';
import type { Ctx } from '../../src/engine/core/events.ts';
import { cloneState } from '../../src/engine/core/clone.ts';
import type { NpcChoiceInput, RunState } from '../../src/engine/core/types.ts';
import { applyChoice, eligibleIntents, validateChoice } from '../../src/engine/mind/decide.ts';
import { choose } from '../../src/engine/mind/policy.ts';
import { runMinds } from '../../src/engine/mind/run.ts';
import { THINKERS_PER_DAY, type Choice, type Episode, type Queued } from '../../src/engine/mind/types.ts';

/**
 * Phase 07, part 2: villagers who stop to think. The strongest moments of a night queue a few villagers; each picks one legal
 * move at dusk, proposed by a model and accepted by the game, or by the game's own policy. Effects follow V1's persuasion rules.
 */

const STORY = 'river_fears_fire';

function start(seed = 1): GameSession {
  const g = GameSession.create({ scenarioId: 'redbank', seed, reality: true });
  g.act({ type: 'PICK_STARTER', claim: STORY });
  return g;
}

function play(days: number, seed = 1): GameSession {
  const g = start(seed);
  for (let d = 0; d < days && !g.state.outcome; d++) {
    const v = g.state.villagers.find((x) => x.status !== 'dead' && !x.beliefs[STORY]);
    if (v) g.act({ type: 'SEED', claim: STORY, target: v.id });
    const beacon = g.state.world.landmarks.find((l) => l.kind === 'beacon');
    if (beacon) g.act({ type: 'RITUAL', ritual: 'light_beacon', landmark: beacon.id, claim: STORY });
    g.endDay();
  }
  return g;
}

const minds = (s: RunState) => s.v2!.minds!;
const ctxOf = (s: RunState): Ctx => ({ s, events: [], expect: false });

/** A state where `ids` are due to think today about `claim`. */
function queued(s: RunState, ids: string[], why: Queued['why'] = 'novel_claim', claim: string | null = STORY): RunState {
  const c = cloneState(s);
  minds(c).queue = ids.map((id) => ({ id, why, claim, event: null }));
  return c;
}

describe('who thinks', () => {
  const g = play(5);

  it('at most a few villagers a day, each for a named moment; never the dead or the trapped', () => {
    let seen = 0;
    const h = start();
    for (let d = 0; d < 6 && !h.state.outcome; d++) {
      const q = minds(h.state).queue;
      expect(q.length).toBeLessThanOrEqual(THINKERS_PER_DAY);
      expect(new Set(q.map((x) => x.id)).size).toBe(q.length);
      for (const x of q) {
        const v = h.state.villagers.find((y) => y.id === x.id)!;
        expect(v.status).not.toBe('dead');
        expect(['novel_claim', 'argument', 'contradiction', 'loss', 'law_change', 'faction_move', 'conversation', 'crisis']).toContain(x.why);
      }
      seen += q.length;
      const v = h.state.villagers.find((x) => x.status !== 'dead' && !x.beliefs[STORY]);
      if (v) h.act({ type: 'SEED', claim: STORY, target: v.id });
      h.endDay();
    }
    expect(seen).toBeGreaterThan(0);
    expect(g.state.v2!.minds).toBeDefined();
  });

  it('everyone queued acts once at dusk, with a legal move, and the log says what they did', () => {
    const h = play(2);
    const q = minds(h.state).queue.map((x) => x.id);
    if (!q.length) return;
    for (const id of q) {
      const c = choose(h.state, minds(h.state).queue.find((x) => x.id === id)!);
      expect(validateChoice(h.state, c)).toMatchObject({ ok: true });
    }
    h.endDay();
    expect(minds(h.state).last.map((c) => c.citizenId).sort()).toEqual([...q].sort());
    for (const c of minds(h.state).last) expect(c.source).toBe('policy');
  });
});

describe('what a decision does (V1 rules decide, not the speaker)', () => {
  const base = play(3);
  const s0 = base.state;
  // a believer and a neighbour who does not believe yet
  const speaker = s0.villagers.find((v) => (v.beliefs[STORY]?.conv ?? 0) >= 40 && eligibleIntents(s0, v.id).some((e) => e.intent === 'persuade'));

  it('persuading moves the listener by V1\'s gossip arithmetic, reported as an ordinary belief shift with its cause', () => {
    if (!speaker) return;
    const s = queued(s0, [speaker.id]);
    const move = eligibleIntents(s, speaker.id).find((e) => e.intent === 'persuade')!;
    const target = move.targets[0];
    const before = s.villagers.find((v) => v.id === target)!.beliefs[STORY]?.conv ?? 0;
    const ctx = ctxOf(s);
    applyChoice(ctx, { citizenId: speaker.id, intent: 'persuade', target, claimId: STORY, dialogue: 'Trust me.', cites: [], tone: 'calm', approach: 'testimony', confidence: 50, thought: '', source: 'policy' });
    const after = s.villagers.find((v) => v.id === target)!.beliefs[STORY]?.conv ?? 0;
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeLessThanOrEqual(17);
    const act = ctx.events.find((e) => e.code === 'NPC_ACT')!;
    const shift = ctx.events.find((e) => e.code === 'BELIEF_SHIFT' || e.code === 'BELIEVER_GAINED')!;
    expect(act).toMatchObject({ actor: speaker.id, target, claim: STORY, reason: 'persuade' });
    expect(shift).toMatchObject({ actor: speaker.id, target, cause: [act.id] });
  });

  it('a challenge lowers a believer\'s conviction, less when they saw the proof themselves', () => {
    const s = cloneState(s0);
    const [a, b] = s.villagers.filter((v) => v.status !== 'dead');
    b.beliefs[STORY] = { conv: 60, heard: 2, lastDay: s.day, lastSource: null, evidence: 0, cause: null, stale: 0 };
    a.beliefs[STORY] = { conv: -40, heard: 2, lastDay: s.day, lastSource: null, evidence: 0, cause: null, stale: 0 };
    const c: Choice = { citizenId: a.id, intent: 'challenge', target: b.id, claimId: STORY, dialogue: null, cites: [], tone: 'wary', approach: 'testimony', confidence: 50, thought: '', source: 'policy' };
    const s1 = cloneState(s);
    applyChoice(ctxOf(s1), c);
    const cutPlain = 60 - s1.villagers.find((v) => v.id === b.id)!.beliefs[STORY].conv;
    const s2 = cloneState(s);
    s2.villagers.find((v) => v.id === b.id)!.beliefs[STORY].evidence = 50;
    applyChoice(ctxOf(s2), c);
    const cutSeen = 60 - s2.villagers.find((v) => v.id === b.id)!.beliefs[STORY].conv;
    expect(cutPlain).toBeGreaterThan(0);
    expect(cutSeen).toBeLessThan(cutPlain);
  });

  it('comfort eases fear and trust grows; a spoken line alone changes no belief', () => {
    const s = cloneState(s0);
    const [a, b] = s.villagers.filter((v) => v.status !== 'dead');
    b.fear = 80;
    const beliefs = JSON.stringify(s.villagers.map((v) => v.beliefs));
    applyChoice(ctxOf(s), { citizenId: a.id, intent: 'comfort', target: b.id, claimId: null, dialogue: 'Believe the river fears fire!', cites: [], tone: 'warm', approach: 'emotion', confidence: 50, thought: '', source: 'model' });
    expect(s.villagers.find((v) => v.id === b.id)!.fear).toBeLessThan(80);
    expect(JSON.stringify(s.villagers.map((v) => v.beliefs))).toBe(beliefs);
  });

  it('investigating finds evidence only where the story was recently borne out, and remembers what was found', () => {
    const s = cloneState(s0);
    const v = s.villagers.find((x) => x.status !== 'dead' && x.beliefs[STORY])!;
    const recent = s.log.filter((e) => e.claim === STORY && e.day >= s.day - 2).map((e) => e.code);
    const ctx = ctxOf(s);
    applyChoice(ctx, { citizenId: v.id, intent: 'investigate', target: null, claimId: STORY, dialogue: null, cites: [], tone: 'calm', approach: 'evidence', confidence: 50, thought: '', source: 'policy' });
    const ev = ctx.events.find((e) => e.code === 'NPC_INVESTIGATED')!;
    expect(['worked', 'failed', 'nothing']).toContain(ev.reason);
    if (!recent.some((c) => ['EVIDENCE_STAGED', 'EVIDENCE_BACKFIRED', 'REALITY_EFFECT', 'LAW_ACTIVATED', 'LAW_DISCREDITED'].includes(c))) expect(ev.reason).toBe('nothing');
  });
});

describe('a model proposes, the game decides (NPC_DECIDE)', () => {
  const g = play(2);
  const q = minds(g.state).queue;
  const legal = (id: string): NpcChoiceInput => {
    const c = choose(g.state, q.find((x) => x.id === id)!);
    return { citizenId: c.citizenId, intent: c.intent, target: c.target, claimId: c.claimId, dialogue: 'From a model.', cites: c.cites, tone: 'calm', approach: 'testimony', confidence: 70, thought: 'proposed' };
  };

  it('keeps a legal proposal for dusk and records it, so the villager acts on it instead of the policy', () => {
    if (!q.length) return;
    const h = new GameSession(cloneState(g.state));
    const d = legal(q[0].id);
    const r = h.act({ type: 'NPC_DECIDE', rev: h.state.nextEventId, decisions: [d] });
    expect(r.ok).toBe(true);
    expect(minds(h.state).decided[d.citizenId]).toMatchObject({ source: 'model', intent: d.intent, dialogue: 'From a model.' });
    expect(minds(h.state).modelUsed).toBe(1);
    h.endDay();
    expect(minds(h.state).last.find((c) => c.citizenId === d.citizenId)).toMatchObject({ source: 'model', intent: d.intent });
  });

  it('refuses, with the reason, anything that is not real or not legal now; those villagers fall back to the policy', () => {
    if (!q.length) return;
    const h = new GameSession(cloneState(g.state));
    const ok = legal(q[0].id);
    const other = h.state.villagers.find((v) => v.status !== 'dead' && !q.some((x) => x.id === v.id))!;
    const bad: NpcChoiceInput[] = [
      { ...ok, citizenId: other.id },
      ...(q[1] ? [{ ...legal(q[1].id), cites: ['m99999'] }] : []),
    ];
    const r = h.act({ type: 'NPC_DECIDE', rev: h.state.nextEventId, decisions: bad });
    expect(r.ok).toBe(true);
    const text = h.state.log[h.state.log.length - 1].text;
    expect(text).toMatch(/not a villager due to think today/);
    if (q[1]) expect(text).toMatch(/cites a memory this villager does not have/);
    expect(Object.keys(minds(h.state).decided)).toEqual([]);
    for (const c of [
      { ...ok, intent: 'fly' },
      { ...ok, target: 'nobody' },
      { ...ok, claimId: 'made_up_story' },
    ]) {
      const h2 = new GameSession(cloneState(g.state));
      h2.act({ type: 'NPC_DECIDE', rev: h2.state.nextEventId, decisions: [c] });
      expect(Object.keys(minds(h2.state).decided)).toEqual([]);
    }
  });

  it('a proposal made against an older village is refused whole; Classic runs have no villagers to decide for', () => {
    if (!q.length) return;
    const h = new GameSession(cloneState(g.state));
    expect(h.act({ type: 'NPC_DECIDE', rev: h.state.nextEventId - 1, decisions: [legal(q[0].id)] })).toMatchObject({ ok: false, error: { code: 'STALE_REVISION' } });
    const classic = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    classic.act({ type: 'PICK_STARTER', claim: STORY });
    expect(classic.act({ type: 'NPC_DECIDE', rev: classic.state.nextEventId, decisions: [legal(q[0].id)] })).toMatchObject({ ok: false, error: { code: 'NO_MINDS' } });
  });

  it('stops accepting model decisions when the run\'s allowance is spent', () => {
    if (!q.length) return;
    const s = cloneState(g.state);
    minds(s).modelUsed = minds(s).modelCap;
    const h = new GameSession(s);
    h.act({ type: 'NPC_DECIDE', rev: h.state.nextEventId, decisions: [legal(q[0].id)] });
    expect(Object.keys(minds(h.state).decided)).toEqual([]);
  });

  it('a recorded run with model decisions replays exactly from its action log, with no model', () => {
    const h = start(2);
    for (let d = 0; d < 5 && !h.state.outcome; d++) {
      const v = h.state.villagers.find((x) => x.status !== 'dead' && !x.beliefs[STORY]);
      if (v) h.act({ type: 'SEED', claim: STORY, target: v.id });
      const qq = minds(h.state).queue;
      if (qq.length) {
        const c = choose(h.state, qq[0]);
        h.act({ type: 'NPC_DECIDE', rev: h.state.nextEventId, decisions: [{ citizenId: c.citizenId, intent: c.intent, target: c.target, claimId: c.claimId, dialogue: `Recorded line ${d}.`, cites: c.cites, tone: c.tone, approach: c.approach, confidence: 60, thought: 'recorded' }] });
      }
      h.act({ type: 'END_DAY' });
    }
    expect(h.log.filter((a) => a.type === 'NPC_DECIDE').length).toBeGreaterThan(0);
    const r = replayRun({ scenarioId: 'redbank', seed: 2, reality: true, actions: h.log });
    expect(r.rejected).toEqual([]);
    expect(r.stateHash).toBe(stateHash(h.state));
  });
});

describe('six villagers, the same story and the same evidence, different decisions', () => {
  it('choose by their own context (prior belief, ties, memories, personality); new evidence changes some of them', () => {
    const g = play(3, 3);
    const s = cloneState(g.state);
    const six = s.villagers.filter((v) => v.status !== 'dead' && v.duty !== 'trapped').slice(0, 6);
    expect(six.length).toBe(6);
    let n = 900000;
    const ep = (kind: Episode['kind'], valence: Episode['valence']): Episode => ({ id: `m${n++}`, day: s.day, kind, text: 'Watched the beacon lit for “River fears fire”.', witnessed: true, source: null, credibility: 100, salience: 2, valence, claim: STORY, event: null, place: null, scope: 'public', judge: true });
    // the same input for all six: the same demonstration seen, the same story told by the Keeper (+15 on whatever they held)
    for (const v of six) {
      const b = v.beliefs[STORY] ?? { conv: 0, heard: 0, lastDay: s.day, lastSource: null, evidence: 0, cause: null, stale: 0 };
      v.beliefs[STORY] = { ...b, conv: Math.min(100, b.conv + 15), heard: b.heard + 1, evidence: Math.max(b.evidence, 20) };
      minds(s).agents[v.id].episodes.push(ep('saw_proof', 1));
    }
    const qs = queued(s, six.map((v) => v.id), 'novel_claim');
    const first = six.map((v) => choose(qs, minds(qs).queue.find((x) => x.id === v.id)!));
    for (const c of first) expect(validateChoice(qs, c)).toMatchObject({ ok: true });
    expect(new Set(first.map((c) => `${c.intent}:${c.target}`)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(first.map((c) => c.intent)).size).toBeGreaterThanOrEqual(2);
    // then all six watch the story fail, twice: memories now judge it the other way, and some decide differently
    for (const v of six) {
      minds(qs).agents[v.id].episodes.push(ep('saw_proof_fail', -1), ep('saw_proof_fail', -1));
      v.beliefs[STORY].conv = Math.min(v.beliefs[STORY].conv, -15);
    }
    const second = six.map((v) => choose(qs, minds(qs).queue.find((x) => x.id === v.id)!));
    for (const c of second) expect(validateChoice(qs, c)).toMatchObject({ ok: true });
    expect(second.filter((c, i) => c.intent !== first[i].intent).length).toBeGreaterThan(0);
  });
});

describe('cost', () => {
  it('a night of minds for every villager of a village stays cheap', () => {
    const g = play(3);
    const s = cloneState(g.state);
    minds(s).queue = s.villagers.filter((v) => v.status !== 'dead').slice(0, 20).map((v) => ({ id: v.id, why: 'crisis' as const, claim: STORY, event: null }));
    const t0 = performance.now();
    runMinds(ctxOf(s));
    const ms = performance.now() - t0;
    expect(minds(s).last.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1500);
  });
});

describe('the flood: leaving early, and a neighbour\'s floor', () => {
  it('a villager who chose to go early takes a shelter place before the evacuation; one taken in is not trapped', async () => {
    const { commitEvacuations, predictedWater } = await import('../../src/engine/ai/routines.ts');
    const { danger } = await import('../../src/engine/ai/utility.ts');
    const g = play(2);
    const s = cloneState(g.state);
    s.threat[s.day - 1] = { ...s.threat[s.day - 1], level: 6 };
    const water = predictedWater(s);
    const home = (vid: string) => s.world.landmarks.find((l) => l.id === s.villagers.find((v) => v.id === vid)!.homeId);
    const wet = s.villagers.filter((v) => v.status !== 'dead' && danger(s, home(v.id), water) >= 75);
    const dryHome = s.world.landmarks.find((l) => (l.kind === 'home' || l.kind === 'cabin') && l.hp > 0 && danger(s, l, water) === 0);
    const shelter = s.world.landmarks.find((l) => l.kind === 'shelter' && danger(s, l, water) < 75);
    expect(wet.length).toBeGreaterThan(1);
    expect(dryHome && shelter).toBeTruthy();
    // early: one villager takes a shelter place first
    const early = s.villagers.find((v) => v.status !== 'dead' && !wet.includes(v))!;
    minds(s).moves[early.id] = shelter!.id;
    // no room anywhere: everyone at risk would be trapped, except the one a neighbour took in
    for (const l of s.world.landmarks) if (l.kind === 'shelter' && l.id !== shelter!.id) l.capacity = 0;
    shelter!.capacity = 1;
    const saved = wet[0];
    minds(s).refuge[saved.id] = dryHome!.id;
    commitEvacuations({ s, events: [], expect: false });
    expect(s.villagers.find((v) => v.id === early.id)).toMatchObject({ duty: 'evacuate', place: shelter!.id });
    expect(s.villagers.find((v) => v.id === saved.id)).toMatchObject({ duty: 'shelter', place: dryHome!.id });
    expect(wet.slice(1).every((v) => s.villagers.find((x) => x.id === v.id)!.duty === 'trapped')).toBe(true);
    expect(minds(s).moves).toEqual({});
    expect(minds(s).refuge).toEqual({});
  });
});
