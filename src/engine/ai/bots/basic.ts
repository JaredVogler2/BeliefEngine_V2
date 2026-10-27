import { rand } from '../../core/rng.ts';
import type { GameSession } from '../../core/session.ts';
import type { Policy } from './types.ts';

export const noop: Policy = {
  name: 'noop',
  playDay(g: GameSession) {
    const s = g.state;
    if (s.starter === null) g.act({ type: 'PICK_STARTER', claim: s.scn.starters[0] });
    g.endDay();
  },
};

/** Random-legal: spends Influence on uniformly random legal actions. */
export const randomLegal: Policy = {
  name: 'random',
  playDay(g: GameSession) {
    let n = 0;
    while (g.state.ap > 0 && n++ < 12) {
      const opts = g.options().filter((o) => o.cost > 0 || o.action.type === 'PICK_STARTER');
      if (!opts.length) break;
      const s = g.state;
      const pick = opts[Math.floor(rand(s.seed, 'randombot', s.day, n) * opts.length)];
      if (!g.act(pick.action).ok) break;
    }
    g.endDay();
  },
};
