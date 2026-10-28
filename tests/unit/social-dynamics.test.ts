import { describe, expect, it } from 'vitest';
import { GameSession, buildRealityClaim, replayRun, stateHash } from '../../src/engine/index.ts';
import type { Ctx } from '../../src/engine/core/events.ts';
import { cloneState } from '../../src/engine/core/clone.ts';
import type { RunState } from '../../src/engine/core/types.ts';
import { runPolicy } from '../../src/engine/ai/bots/run.ts';
import { noop } from '../../src/engine/ai/bots/basic.ts';
import { fireWall, smokeRing, caravans } from '../../src/engine/ai/bots/strategies.ts';
import { applyChoice, eligibleIntents, motiveToDeny } from '../../src/engine/mind/decide.ts';
import { chainOf, journalOf, journalLine } from '../../src/engine/mind/journal.ts';
import { choose } from '../../src/engine/mind/policy.ts';
import { buildNpcRequest } from '../../src/engine/mind/request.ts';
import { runMinds } from '../../src/engine/mind/run.ts';
import { THINKERS_PER_DAY, type Choice, type Episode } from '../../src/engine/mind/types.ts';
import { readBelief } from '../../src/engine/reality/read.ts';
import { candidatesOf } from '../../scripts/lib/reality-score.ts';
import { ring } from '../helpers/reality.ts';

/**
 * Phase 08: social dynamics that change outcomes, inside V1's rules. Every test plays the real engine; where a situation is rare
 * in a seven-day chapter it is set up white-box (memories, beliefs), and the engine's own machinery takes it from there.
 */

const STORY = 'river_fears_fire';
const minds = (s: RunState) => s.v2!.minds!;
const ctxOf = (s: RunState): Ctx => ({ s, events: [], expect: false });

function redbank(seed = 1): GameSession {
  const g = GameSession.create({ scenarioId: 'redbank', seed, reality: true });
  g.act({ type: 'PICK_STARTER', claim: STORY });
  return g;
}

/** Wren (a skeptic) is told the story and asks for proof; the Keeper answers by lighting the beacon she names, or does not. */
function truthTest(answer: boolean): GameSession {
  const g = redbank();
  g.act({ type: 'SEED', claim: STORY, target: 'wren' });
  for (let d = 0; d < 5 && !g.state.outcome; d++) {
    if (answer) for (const t of minds(g.state).tests ?? []) if (t.by === 'wren' && t.place) g.act({ type: 'RITUAL', ritual: 'light_beacon', landmark: t.place, claim: t.claim });
    g.endDay();
  }
  return g;
}

describe('the influence journal explains what the rules did', () => {
  const g = truthTest(true);

  it('lists who influenced whom and why, newest first, filterable by person and story', () => {
    const all = journalOf(g.state);
    expect(all.length).toBeGreaterThan(5);
    for (let i = 1; i < all.length; i++) expect(all[i - 1].event).toBeGreaterThan(all[i].event);
    const wren = journalOf(g.state, { villager: 'wren' });
    expect(wren.every((j) => j.who === 'wren' || j.whom === 'wren')).toBe(true);
    expect(wren.some((j) => j.kind === 'keeper')).toBe(true);
    expect(wren.some((j) => j.kind === 'test')).toBe(true);
    const told = all.find((j) => j.kind === 'told' && j.why);
    expect(told).toBeDefined();
    expect(journalLine(g.state, told!)).toMatch(/→/);
  });

  it('follows a change back along its causes to where it started', () => {
    const shift = g.state.log.find((e) => (e.code === 'BELIEF_SHIFT' || e.code === 'BELIEVER_GAINED') && e.cause?.length);
    expect(shift).toBeDefined();
    const chain = chainOf(g.state, shift!.id);
    expect(chain.length).toBeGreaterThan(1);
    expect(chain[chain.length - 1].event).toBe(shift!.id);
    for (let i = 1; i < chain.length; i++) expect(chain[i].event).toBeGreaterThan(chain[i - 1].event);
  });
});

describe('a skeptic asks for proof (paired: same seed and story, different evidence)', () => {
  const yes = truthTest(true);
  const no = truthTest(false);
  const conv = (g: GameSession, id: string) => g.state.villagers.find((v) => v.id === id)!.beliefs[STORY]?.conv ?? 0;

  it('shown it, she believes and carries it to her neighbours; ignored, she takes that as an answer', () => {
    expect(yes.state.log.some((e) => e.code === 'TEST_REQUESTED' && e.actor === 'wren')).toBe(true);
    expect(yes.state.log.some((e) => e.code === 'TEST_MET' && e.actor === 'wren')).toBe(true);
    expect(no.state.log.some((e) => e.code === 'TEST_LAPSED' && e.actor === 'wren')).toBe(true);
    expect(conv(yes, 'wren')).toBeGreaterThan(conv(no, 'wren') + 15);
    const ties = yes.state.edges.filter((e) => e.a === 'wren' || e.b === 'wren').map((e) => (e.a === 'wren' ? e.b : e.a));
    const sum = (g: GameSession) => ties.reduce((a, id) => a + conv(g, id), 0);
    expect(sum(yes)).toBeGreaterThan(sum(no));
    // and the journal says why
    expect(journalOf(yes.state, { villager: 'wren' }).some((j) => j.kind === 'test' && /saw/.test(j.text))).toBe(true);
  });

  it('only skeptics ask, and never twice for the same story while a demand is open', () => {
    const g = redbank();
    for (const v of g.state.villagers) {
      const open = eligibleIntents(g.state, v.id).some((e) => e.intent === 'request_test');
      if (open) expect(minds(g.state).agents[v.id].personality.skepticism >= 55 || g.state.factions.find((f) => f.id === v.faction)?.kind === 'scholars').toBe(true);
    }
    const asked = yes.state.log.filter((e) => e.code === 'TEST_REQUESTED');
    const keys = asked.map((e) => `${e.actor}|${e.claim}|${e.day}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('factions lean differently on the same moment', () => {
  it('an empiricist and a storykeeper with the same belief and evidence choose differently', () => {
    const g = redbank(1);
    g.act({ type: 'SEED', claim: STORY, target: 'ivo' });
    g.endDay();
    const s = cloneState(g.state);
    const scholar = s.villagers.find((v) => s.factions.find((f) => f.id === v.faction)?.kind === 'scholars' && v.status !== 'dead')!;
    const keeper = s.villagers.find((v) => s.factions.find((f) => f.id === v.faction)?.kind === 'storykeepers' && v.status !== 'dead')!;
    for (const v of [scholar, keeper]) v.beliefs[STORY] = { conv: 45, heard: 2, lastDay: s.day, lastSource: null, evidence: 10, cause: null, stale: 0 };
    minds(s).queue = [scholar, keeper].map((v) => ({ id: v.id, why: 'novel_claim' as const, claim: STORY, event: null }));
    const a = choose(s, minds(s).queue[0]);
    const b = choose(s, minds(s).queue[1]);
    expect(a.intent).not.toBe(b.intent);
    expect(['investigate', 'request_test', 'challenge', 'ask']).toContain(a.intent);
  });
});

describe('a faction leader answers a story they doubt with a competing claim (same language, announced, contestable)', () => {
  function withLaw(convinceLeaderOnDay?: number) {
    const g = redbank();
    const r = readBelief(g.state, 'Whenever the bell is rung, the river keeps clear of the bridge.');
    const b = buildRealityClaim(g.state, candidatesOf(r)[0].ast);
    if (!b.ok) throw new Error(b.message);
    g.act({ type: 'COMPOSE', claim: b.draft.claim });
    const id = b.draft.claim.id;
    for (let d = 0; d < 6 && !g.state.outcome; d++) {
      for (const v of g.state.villagers) if (v.status !== 'dead' && !['hester', 'osric'].includes(v.id)) v.beliefs[id] = { conv: 85, heard: 3, lastDay: g.state.day, lastSource: null, evidence: 30, cause: null, stale: 0 };
      for (const who of ['hester', 'osric']) {
        const v = g.state.villagers.find((x) => x.id === who)!;
        v.beliefs[id] = { conv: convinceLeaderOnDay !== undefined && g.state.day >= convinceLeaderOnDay ? 60 : -40, heard: 3, lastDay: g.state.day, lastSource: null, evidence: 0, cause: null, stale: 0 };
      }
      ring(g);
      g.endDay();
    }
    return { g, id };
  }

  it('announced a day ahead, then made: built and grounded by the engine like the player\'s own, the opposite effect, a rival', () => {
    const { g, id } = withLaw();
    const told = g.state.log.find((e) => e.code === 'NPC_CLAIM_TELEGRAPHED')!;
    const made = g.state.log.find((e) => e.code === 'NPC_CLAIM_MADE')!;
    expect(told).toBeDefined();
    expect(made.day).toBe(told.day + 1);
    const def = g.state.claims.find((c) => c.id === made.claim)!.def!;
    expect(def.rival).toBe(true);
    expect(def.contradicts).toEqual([id]);
    expect(def.reality!.ast.author).toBe('npc');
    const mine = g.state.claims.find((c) => c.id === id)!.def!.reality!.ast.clauses[0].effect;
    const theirs = def.reality!.ast.clauses[0].effect;
    expect(mine.op).toBe('REDIRECT_FLOW');
    expect(theirs).toMatchObject({ op: 'REDIRECT_FLOW', mode: 'attract' });
    expect(minds(g.state).contested?.[id]).toContain(def.id);
    // fair: rare, and it does not use up the player's own allowance of written beliefs
    expect(g.state.log.filter((e) => e.code === 'NPC_CLAIM_MADE')).toHaveLength(1);
    const r2 = readBelief(g.state, 'Chickens fly when the bell rings.');
    const b2 = buildRealityClaim(g.state, candidatesOf(r2)[0].ast);
    expect(b2.ok && g.act({ type: 'COMPOSE', claim: b2.draft.claim }).ok).toBe(true);
  });

  it('withdrawn when the Keeper changes the author\'s mind before they speak', () => {
    const { g } = withLaw(3);
    expect(g.state.log.find((e) => e.code === 'NPC_CLAIM_TELEGRAPHED')).toBeDefined();
    expect(g.state.log.some((e) => e.code === 'NPC_CLAIM_WITHDRAWN')).toBe(true);
    expect(g.state.log.some((e) => e.code === 'NPC_CLAIM_MADE')).toBe(false);
  });

  it('a story the scenario already answers with a rival is left to that rival', () => {
    const g = redbank();
    for (let d = 0; d < 6 && !g.state.outcome; d++) g.endDay();
    expect(g.state.log.some((e) => e.code === 'NPC_CLAIM_TELEGRAPHED' && e.claim === STORY)).toBe(false);
  });
});

describe('lies, and how they are found out', () => {
  /** Two villagers who both saw the story work; the first lost their home while its law held, and puts family first. */
  function setup() {
    const g = redbank();
    g.act({ type: 'SEED', claim: STORY, target: 'ivo' });
    g.endDay();
    const s = cloneState(g.state);
    const liar = s.villagers.find((v) => minds(s).agents[v.id].goals.includes('protect_home') && v.status !== 'dead')!;
    const friend = s.edges.filter((e) => e.a === liar.id || e.b === liar.id).map((e) => (e.a === liar.id ? e.b : e.a)).map((id) => s.villagers.find((v) => v.id === id)!).find((v) => v.status !== 'dead')!;
    let n = 990000;
    const ep = (kind: Episode['kind'], judge: boolean): Episode => ({ id: `m${n++}`, day: s.day, kind, text: kind, witnessed: true, source: null, credibility: 100, salience: 2, valence: 0, claim: STORY, event: null, place: null, scope: 'public', judge });
    for (const v of [liar, friend]) minds(s).agents[v.id].episodes.push(ep('saw_proof', true));
    minds(s).agents[liar.id].episodes.push(ep('lost_home', false));
    for (const v of [liar, friend]) v.beliefs[STORY] = { conv: 55, heard: 3, lastDay: s.day, lastSource: null, evidence: 30, cause: null, stale: 0 };
    const law = s.laws.find((l) => l.claimId === STORY && (s.scn.claimDefs.find((d) => d.id === STORY)!.electorate?.[l.regionId] ?? [l.regionId]).includes(liar.district))!;
    law.status = 'active';
    return { s, liar, friend };
  }

  it('only a family reason opens the lie, and the engine flags it; a witness sees through it and trusts the liar far less', () => {
    const { s, liar, friend } = setup();
    expect(motiveToDeny(s, liar, STORY)).toBe(true);
    expect(motiveToDeny(s, friend, STORY)).toBe(false);
    const trustBefore = s.edges.find((e) => (e.a === friend.id && e.b === liar.id) || (e.a === liar.id && e.b === friend.id))!;
    const before = trustBefore.a === friend.id ? trustBefore.ab : trustBefore.ba;
    const convBefore = s.villagers.find((v) => v.id === friend.id)!.beliefs[STORY].conv;
    const ctx = ctxOf(s);
    const c: Choice = { citizenId: liar.id, intent: 'challenge', target: friend.id, claimId: STORY, dialogue: 'It never worked.', cites: [], tone: 'wary', approach: 'testimony', confidence: 50, thought: '', source: 'policy' };
    applyChoice(ctx, c);
    expect(ctx.events.map((e) => e.code)).toEqual(expect.arrayContaining(['LIE_TOLD', 'LIE_DISCOVERED']));
    const e = s.edges.find((x) => (x.a === friend.id && x.b === liar.id) || (x.a === liar.id && x.b === friend.id))!;
    expect((e.a === friend.id ? e.ab : e.ba)).toBe(Math.max(-100, before - 20));
    // seeing it themselves, the friend is not moved
    expect(s.villagers.find((v) => v.id === friend.id)!.beliefs[STORY].conv).toBe(convBefore);
  });

  it('without a family reason, nobody argues against what they saw work', () => {
    const { s, friend } = setup();
    minds(s).queue = [{ id: friend.id, why: 'argument', claim: STORY, event: null }];
    for (let k = 0; k < 5; k++) expect(choose(s, minds(s).queue[0]).intent).not.toBe('challenge');
  });
});

describe('what people can and cannot know', () => {
  it('with the bridge down, no villager can reach the other bank to talk', () => {
    const g = redbank();
    g.act({ type: 'SEED', claim: STORY, target: 'ivo' });
    g.endDay();
    const s = cloneState(g.state);
    const bridge = s.world.landmarks.find((l) => l.kind === 'bridge')!;
    bridge.hp = 0;
    for (const v of s.villagers.filter((x) => x.status !== 'dead')) {
      for (const e of eligibleIntents(s, v.id)) {
        for (const t of e.targets) {
          const other = s.villagers.find((x) => x.id === t);
          if (!other || other.district === 'river' || v.district === 'river') continue;
          expect(other.district).toBe(v.district);
        }
      }
    }
  });

  it('a request for one villager never carries another villager\'s memories, private or not', () => {
    const g = redbank();
    for (let d = 0; d < 3; d++) {
      const v = g.state.villagers.find((x) => x.status !== 'dead' && !x.beliefs[STORY]);
      if (v) g.act({ type: 'SEED', claim: STORY, target: v.id });
      g.endDay();
    }
    // today's thinkers: villagers who remember something, so their requests carry memories
    const s = cloneState(g.state);
    minds(s).queue = s.villagers.filter((v) => minds(s).agents[v.id].episodes.length > 0).slice(0, 4).map((v) => ({ id: v.id, why: 'novel_claim' as const, claim: STORY, event: null }));
    const others = s.villagers.filter((v) => !minds(s).queue.some((q) => q.id === v.id));
    // give a non-thinker a private memory: it must never appear in anyone's request
    minds(s).agents[others[0].id].episodes.push({ id: 'm_private_x', day: s.day, kind: 'lost_kin', text: 'private grief', witnessed: true, source: null, credibility: 100, salience: 3, valence: -2, claim: null, event: null, place: null, scope: 'private', judge: false });
    const req = buildNpcRequest(s, 'run-abc')!;
    expect(req.agents.length).toBeGreaterThan(0);
    expect(JSON.stringify(req)).not.toContain('m_private_x');
    expect(JSON.stringify(req)).not.toContain('private grief');
    for (const a of req.agents) {
      const mine = new Set(minds(s).agents[a.id].episodes.map((e) => e.id));
      expect(a.memories.every((m) => mine.has(m.id))).toBe(true);
    }
    expect(req.agents.length).toBeLessThanOrEqual(THINKERS_PER_DAY);
  });
});

describe('bounds, scale and fairness', () => {
  it('model calls are bounded: at most one batch of today\'s thinkers a day, never more than four of them', () => {
    const g = redbank();
    for (let d = 0; d < 6 && !g.state.outcome; d++) {
      expect(minds(g.state).queue.length).toBeLessThanOrEqual(THINKERS_PER_DAY);
      g.endDay();
    }
  });

  it('a hundred villagers and thirty active laws: a night of minds stays cheap', () => {
    const g = redbank();
    g.endDay();
    const s = cloneState(g.state);
    const base = s.villagers.filter((v) => v.status !== 'dead');
    for (let i = 0; s.villagers.length < 100; i++) {
      const src = base[i % base.length];
      const id = `${src.id}_${i}`;
      s.villagers.push({ ...JSON.parse(JSON.stringify(src)), id, name: `${src.name} ${i}` });
      minds(s).agents[id] = JSON.parse(JSON.stringify(minds(s).agents[src.id]));
      s.edges.push({ a: id, b: src.id, ab: 40, ba: 40, rate: 0.5, kind: 'friend' });
    }
    for (let i = 0; i < 30; i++) s.laws.push({ ...s.laws[0], id: `law_x${i}`, status: 'active' });
    minds(s).queue = s.villagers.slice(0, THINKERS_PER_DAY).map((v) => ({ id: v.id, why: 'crisis' as const, claim: STORY, event: null }));
    const t0 = performance.now();
    runMinds(ctxOf(s));
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('the authored chapters can still be won and lost in V2 runs', () => {
    expect(runPolicy(noop, { scenarioId: 'redbank', seed: 1, reality: true }).result).toBe('defeat');
    expect(runPolicy(fireWall, { scenarioId: 'redbank', seed: 1, reality: true }).result).toBe('victory');
    expect(runPolicy(caravans, { scenarioId: 'harvest', seed: 1, reality: true }).result).toBe('victory');
    expect(runPolicy(noop, { scenarioId: 'harvest', seed: 1, reality: true }).result).toBe('defeat');
    const smoke = [1, 2, 5].map((seed) => runPolicy(smokeRing, { scenarioId: 'ashwood', seed, reality: true }).result);
    expect(smoke).toContain('victory');
  });

  it('the same seed and recorded actions replay exactly, social dynamics included', () => {
    const g = truthTest(true);
    const r = replayRun({ scenarioId: 'redbank', seed: 1, reality: true, actions: g.log });
    expect(r.rejected).toEqual([]);
    expect(r.stateHash).toBe(stateHash(g.state));
  });
});

describe('believing and knowing, for the player to inspect', () => {
  it('a villager\'s belief shows beside how they know it; a law shows how many of its believers saw it themselves', async () => {
    const { knowsOf, lawWitnesses } = await import('../../src/engine/mind/view.ts');
    const g = truthTest(true);
    const wren = knowsOf(g.state, 'wren').find((k) => k.claimId === STORY)!;
    expect(wren.saw).toBe(true);
    expect(wren.how).toMatch(/saw it work \(day \d+\)/);
    const told = knowsOf(g.state, g.state.log.find((e) => e.code === 'RUMOR_SEEDED')!.target!).find((k) => k.claimId === STORY);
    expect(told?.how).toMatch(/saw it|told by you|heard from/);
    const s = cloneState(g.state);
    const law = s.laws.find((l) => l.claimId === STORY)!;
    law.supporters = ['wren', ...s.villagers.filter((v) => v.id !== 'wren').slice(0, 2).map((v) => v.id)];
    const w = lawWitnesses(s, law.id)!;
    expect(w.supporters).toBe(3);
    expect(w.saw).toBeGreaterThanOrEqual(1);
    expect(w.saw).toBeLessThanOrEqual(3);
  });
});
