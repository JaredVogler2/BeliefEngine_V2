import { GameSession, type RunState } from '../../src/engine/index.ts';
import { realityPolicyById } from '../../src/engine/ai/bots/reality.ts';
import { buildNpcRequest, type NpcAgentV2, type NpcRequestV2 } from '../../src/engine/mind/request.ts';
import { choose } from '../../src/engine/mind/policy.ts';
import { validateChoice } from '../../src/engine/mind/decide.ts';
import type { Approach, Choice, Intent, Tone } from '../../src/engine/mind/types.ts';
import { demoNpc, npcPrompt, validateDecisions, type NpcRequest } from '../../server/ai/tasks/npc.ts';

/**
 * Villager-decision cases for the evaluation (phase 14): real situations from seeded Generative Reality runs (a bot plays the
 * chapter; each morning the villagers due to think become cases), each with exactly what a model would be told about the villager
 * (their memories, beliefs, ties, the moment, the moves open to them) and the constraints any answer must meet. A decision is judged
 * on legality (the engine's own validator), memory provenance (it cites only memories the villager has) and three persona checks
 * read from the villager's own facts. Deterministic: the same arguments give the same cases.
 */

export interface NpcCase {
  id: string;
  scenario: string;
  seed: number;
  day: number;
  moment: string;
  agent: NpcAgentV2;
  expect: { intents: string[]; memories: string[]; firm: string[]; disbelieved: string[]; skeptic: boolean };
}

export interface Situation {
  scenario: string;
  seed: number;
  day: number;
  state: RunState;
  request: NpcRequestV2;
}

export interface Judged {
  legal: boolean;
  why: string | null;
  provenance: boolean;
  /** persona checks: spreading or arguing for a story they disbelieve; challenging one they firmly hold; a skeptic spreading hearsay */
  spreadsDisbelieved: boolean;
  challengesFirm: boolean;
  skepticHearsay: boolean;
}

/** Every morning of seeded runs, the request a model would get for the villagers due to think (at most six a request). */
export function situations(scenarios: string[], seeds: number[], policyId = 'evidence-first'): Situation[] {
  const out: Situation[] = [];
  for (const scenario of scenarios)
    for (const seed of seeds) {
      const g = GameSession.create({ scenarioId: scenario, seed, difficulty: 'normal', mode: 'story', reality: true });
      const p = realityPolicyById(policyId);
      for (let d = 0; d < 20 && !g.state.outcome; d++) {
        p.playDay(g);
        if (g.state.outcome) break;
        const req = buildNpcRequest(g.state, `eval-${scenario}-${seed}`);
        if (req) out.push({ scenario, seed, day: g.state.day, state: g.state, request: req });
      }
    }
  return out;
}

export function casesOf(sit: Situation): NpcCase[] {
  return sit.request.agents.map((a) => ({
    id: `${sit.scenario}-${sit.seed}-d${sit.day}-${a.id}`,
    scenario: sit.scenario,
    seed: sit.seed,
    day: sit.day,
    moment: a.moment.kind,
    agent: a,
    expect: {
      intents: a.eligible.map((e) => e.intent),
      memories: a.memories.map((m) => m.id),
      firm: a.beliefs.filter((b) => b.conviction >= 60).map((b) => b.claimId),
      disbelieved: a.beliefs.filter((b) => b.conviction < 0).map((b) => b.claimId),
      skeptic: a.traits.skepticism >= 65,
    },
  }));
}

/** Judge one decision for one case; `engineCheck` is the engine's own validator on the live state (null when not applicable). */
export function judge(c: NpcCase, d: { intent: string; target: string | null; claimId: string | null; cites: string[] }, engineCheck: { ok: boolean; why?: string } | null): Judged {
  const e = c.agent.eligible.find((x) => x.intent === d.intent);
  let why: string | null = null;
  if (!e) why = `"${d.intent}" is not open to them`;
  else if (e.targets.length && d.target !== null && !e.targets.includes(d.target)) why = 'a target that is not open to them';
  else if (e.claims.length && d.claimId !== null && !e.claims.includes(d.claimId)) why = 'a story that is not open to them';
  else if (engineCheck && !engineCheck.ok) why = engineCheck.why ?? 'refused by the engine';
  const belief = d.claimId ? c.agent.beliefs.find((b) => b.claimId === d.claimId) : undefined;
  return {
    legal: why === null,
    why,
    provenance: d.cites.every((id) => c.expect.memories.includes(id)),
    spreadsDisbelieved: (d.intent === 'spread' || d.intent === 'persuade' || d.intent === 'stage_evidence') && !!d.claimId && c.expect.disbelieved.includes(d.claimId),
    challengesFirm: d.intent === 'challenge' && !!d.claimId && c.expect.firm.includes(d.claimId),
    skepticHearsay: c.expect.skeptic && d.intent === 'spread' && !!belief && belief.evidence < 10,
  };
}

/** The game's own policy deciding each case (what every villager does when no model is asked). */
export function policyDecisions(sit: Situation): Map<string, Choice> {
  const out = new Map<string, Choice>();
  for (const a of sit.request.agents) {
    const q = sit.state.v2!.minds!.queue.find((x) => x.id === a.id);
    if (q) out.set(a.id, choose(sit.state, q));
  }
  return out;
}

/** The scripted stand-in a local server uses instead of a model (`demoNpc`), held to the server's checks and then the engine's. */
export function mockDecisions(sit: Situation): { accepted: Map<string, Choice>; refusedByServer: number } {
  const req = sit.request as unknown as NpcRequest;
  const out = demoNpc(npcPrompt(req));
  const v = validateDecisions(req, out);
  const accepted = new Map<string, Choice>();
  for (const d of v.accepted) accepted.set(d.citizenId, { ...d, intent: d.intent as Intent, tone: d.tone as Tone, approach: d.approach as Approach, thought: d.thought ?? '', source: 'model' } as Choice);
  return { accepted, refusedByServer: v.rejected.length };
}

export { validateChoice };
