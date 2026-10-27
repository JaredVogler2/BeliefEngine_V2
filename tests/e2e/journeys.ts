import { GameSession, interpretBelief, resolveDay, stateHash } from '../../src/engine/index.ts';
import type { Action, RunState } from '../../src/engine/index.ts';
import { lawPusher, lightBeaconsByCoverage } from '../../src/engine/ai/bots/lawpusher.ts';
import { cloneState } from '../../src/engine/core/clone.ts';

/**
 * Node-side planning for Journey C (phase 18): interpret a sentence exactly as the browser will, write it, spread it with the same
 * public actions a player has, and record (1) the action list the browser then replays by real clicks, (2) the engine's state at the
 * point the browser's run must reach, and (3) what the written law does to the world on the night after it wakes, measured by
 * playing that night twice from the same state, once with the law and once with it forced asleep.
 */
export interface ComposedPlan {
  text: string;
  title: string;
  claimId: string;
  /** actions after PICK_STARTER and COMPOSE, up to and including the END_DAY of the first night the law is awake */
  actions: Action[];
  wokeOnDay: number;
  stateHashAfter: string;
  /** the engine state at the browser's end point */
  state: RunState;
  counterfactual: { floodedWith: number; floodedWithout: number; bridgeHpWith: number; bridgeHpWithout: number; homesStandingWith: number; homesStandingWithout: number };
}

const flooded = (s: RunState): number => s.world.water.filter((w) => w > 0).length;
const bridgeHp = (s: RunState): number => s.world.landmarks.filter((l) => l.kind === 'bridge').reduce((a, l) => a + l.hp, 0);
const homes = (s: RunState): number => s.world.landmarks.filter((l) => l.kind === 'home' && l.hp > 0).length;

export function planComposed(text: string, kind: 'lanterns' | 'bridge', seed = 1): ComposedPlan {
  const starter = 'river_fears_fire';
  const g = GameSession.create({ scenarioId: 'redbank', seed, difficulty: 'normal', inventor: true });
  g.act({ type: 'PICK_STARTER', claim: starter });
  const draft = interpretBelief(g.state, text).drafts[0];
  if (!draft) throw new Error(`no reading for ${text}`);
  const compose = g.act({ type: 'COMPOSE', claim: draft.claim });
  if (!compose.ok) throw new Error(compose.error.message);
  const startAt = g.log.length;
  const id = draft.claim.id;
  let before: RunState | null = null;
  let cut = -1;
  let wokeOnDay = 0;
  const pol = lawPusher({
    name: 'journey-c', claim: id, regions: draft.claim.regions, stage: true, counter: true,
    reserve: kind === 'lanterns' ? (s) => (s.day >= 5 ? Math.min(s.ap, 4) : 0) : () => 0,
    physical: (gg) => {
      if (kind === 'lanterns' && gg.state.day >= 5) lightBeaconsByCoverage(gg);
      // the moment just before the night: is the written law awake? then remember exactly this state
      if (!before && gg.state.laws.some((l) => l.claimId === id && l.status === 'active')) {
        before = cloneState(gg.state);
        wokeOnDay = gg.state.day;
        cut = gg.log.length;
      }
    },
  });
  for (let i = 0; i < 10 && !g.state.outcome && cut < 0; i++) pol.playDay(g);
  if (!before || cut < 0) throw new Error(`the law never woke for ${text}`);
  // the browser replays up to and including the END_DAY of that night
  const actions = g.log.slice(startAt, g.log.length) as Action[];
  const withLaw = resolveDay(cloneState(before)).state;
  const asleep = cloneState(before);
  for (const l of asleep.laws.filter((x) => x.claimId === id)) {
    l.status = 'dormant';
    l.progress = 0;
    l.pressure = 0;
    l.strength = 0;
  }
  for (const v of asleep.villagers) delete v.beliefs[id];
  const without = resolveDay(asleep).state;
  // the engine state the browser must reproduce: this plan's own log, replayed from scratch, stopped at the same END_DAY
  const rep = GameSession.create({ scenarioId: 'redbank', seed, difficulty: 'normal', inventor: true });
  rep.act({ type: 'PICK_STARTER', claim: starter });
  rep.act({ type: 'COMPOSE', claim: draft.claim });
  for (const a of actions) {
    if (a.type === 'END_DAY') rep.endDay();
    else if (!rep.act(a).ok) throw new Error(`replay rejected ${JSON.stringify(a)}`);
  }
  void cut;
  return {
    text, title: draft.title, claimId: id, actions, wokeOnDay, stateHashAfter: stateHash(rep.state), state: rep.state,
    counterfactual: {
      floodedWith: flooded(withLaw), floodedWithout: flooded(without), bridgeHpWith: bridgeHp(withLaw), bridgeHpWithout: bridgeHp(without), homesStandingWith: homes(withLaw), homesStandingWithout: homes(without),
    },
  };
}
