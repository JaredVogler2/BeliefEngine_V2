import { lawPusher, lightBeaconsByCoverage } from './lawpusher.ts';
import { noop, randomLegal } from './basic.ts';
import type { Policy } from './types.ts';

/** Strategy A - The Fire Wall: build belief that the river fears fire in Eastbank, then light beacons by coverage. */
export const fireWall: Policy = lawPusher({
  name: 'fire-wall',
  claim: 'river_fears_fire',
  regions: ['east'],
  reserve: (s) => (s.day >= 5 ? Math.min(s.ap, 4) : 0),
  physical: (g) => {
    if (g.state.day >= 5) lightBeaconsByCoverage(g);
  },
});

/** Strategy B - The Witness Bridge: build belief across both banks that a watched bridge cannot break. */
export const witnessBridge: Policy = lawPusher({
  name: 'witness-bridge',
  claim: 'bridge_stands_watched',
  regions: ['river'],
});

export const REDBANK_POLICIES: Policy[] = [noop, randomLegal, fireWall, witnessBridge];

import { brokerRoute } from './lawpusher.ts';

/** Harvest strategy A - Moonlight: ripen the fields by moonlight (and live with exhausted workers). */
export const moonlight: Policy = lawPusher({ name: 'moonlight', claim: 'moonlight_ripens_grain', regions: ['valley'] });

/** Harvest strategy B - Caravans: win the merchant's trust with a demonstration and keep the road clear. */
export const caravans: Policy = brokerRoute({ name: 'caravans', claims: ['moonlight_ripens_grain', 'rain_follows_bells'], broker: 'dalia', deal: 'caravan' });

import { lightFiresForThreat } from './lawpusher.ts';

/** Ashwood strategy A - Smoke Ring: believe the wolves fear smoke, light hearth fires beside threatened pens. */
export const smokeRing: Policy = lawPusher({
  name: 'smoke-ring', claim: 'wolves_fear_smoke', regions: ['mill', 'ash'], reserve: (s) => (s.day >= 3 ? Math.min(s.ap, 2) : 0),
  physical: (g) => lightFiresForThreat(g, 'ring'),
});

/** Ashwood strategy B - Decoy: adopt the hunter's theory and keep a fire burning deep in the wood. */
export const decoy: Policy = lawPusher({
  name: 'decoy', claim: 'wolves_follow_smoke', regions: ['wild'], reserve: (s) => (s.day >= 2 ? Math.min(s.ap, 2) : 0),
  physical: (g) => lightFiresForThreat(g, 'decoy'),
});
