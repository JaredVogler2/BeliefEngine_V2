import type { RunState } from '../core/types.ts';
import { LAB_LIMITS, LIMITS, validateRealityAst, type Trigger, type TriggerEvent } from './ast.ts';
import { balanceReality, type Coverage } from './balance.ts';
import { anchorsIn } from './execute.ts';
import { realityRules } from './state.ts';

/** Landmarks a trigger lights or rings itself: an effect measured from them acts only around the ones powering it tonight. */
const OWN_SOURCES: Partial<Record<TriggerEvent, string>> = { lantern: 'beacon', smoke_fire: 'campfire', bell: 'belltower', watchers: 'bridge' };

function poweredFrom(t: Trigger, anchor: string): boolean {
  if ('event' in t) return OWN_SOURCES[t.event] === anchor;
  if ('all' in t) return t.all.some((x) => poweredFrom(x, anchor));
  if ('any' in t) return t.any.every((x) => poweredFrom(x, anchor));
  return false;
}

/** Offsets within `radius` of a place, as a stamp lays them (laws/effects.ts stampShield). */
const disc = (radius: number): [number, number][] => {
  const r = Math.ceil(radius + 0.5);
  const out: [number, number][] = [];
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (Math.sqrt(x * x + y * y) <= radius + 0.5) out.push([x, y]);
  return out;
};

/**
 * Rules 3: the ground a clause measured from landmarks covers in this village, in circles of its radius. "Floodwater flows away
 * from every home" acts around each home of its regions (reality/execute.ts), so it is priced for the ground all of them cover
 * (overlaps counted once, never the river bed): in each region the square root of that ground in circles, and never less than one
 * circle (the first circle costs in full and each further one less, so a village-wide ward is the dearest belief of its kind
 * without being out of reach: measured in docs/FUN_REVIEW_V2.md). One measured from what powers it tonight (the lit lanterns)
 * keeps one circle a region.
 */
export function coverageOf(s: RunState, regions: string[]): Coverage {
  const w = s.world;
  return (c, radius) => {
    const near = c.target.near;
    if (!near || poweredFrom(c.when, near.anchor)) return null;
    const d = disc(radius);
    let circles = 0;
    for (const region of regions) {
      const seen = new Set<number>();
      for (const a of anchorsIn(s, near.anchor, region))
        for (const [dx, dy] of d) {
          const x = a.x + dx;
          const y = a.y + dy;
          if (x >= 0 && y >= 0 && x < w.w && y < w.h && w.terrain[y * w.w + x] !== 1) seen.add(y * w.w + x);
        }
      circles += Math.max(1, Math.sqrt(seen.size / d.length));
    }
    return Math.max(1, circles);
  };
}

/**
 * Influence a reality belief costs to write, from its structure (and, from rules 3, the ground it covers in this village). The
 * composer shows exactly this number. Under rules 1 and 2 it is read from the rules-1 power, as those runs were played.
 */
export function realityComposeCost(s: RunState, astIn: unknown): number {
  const lab = !!s.v2?.lab;
  const checked = validateRealityAst(astIn, lab ? LAB_LIMITS : LIMITS);
  if (!checked.ok) return 1;
  const rules = realityRules(s);
  return rules >= 3 ? balanceReality(checked.ast, { lab, rules, coverage: coverageOf(s, checked.ast.regions) }).apCost : balanceReality(checked.ast, { lab }).apCost;
}
