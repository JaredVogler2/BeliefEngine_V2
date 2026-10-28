import { cloneState } from '../core/clone.ts';
import type { Ctx } from '../core/events.ts';
import type { RunState, WorldState } from '../core/types.ts';
import type { Modifiers } from '../laws/effects.ts';
import { T } from '../world/grid.ts';
import { realityDusk } from './entities.ts';
import { runRealityLaws } from './execute.ts';

/**
 * What Generative Reality laws will do to tonight's water, without touching the run: the executor and the stone haul at dusk run
 * on a copy, and only `mods` (the caller's own) changes. The flood forecast, the map overlay, villagers deciding whether to
 * evacuate and the minds' flood moves all read the same prediction, so a written belief that turns or draws water is reflected
 * everywhere the village looks ahead, exactly as the night will play it.
 */
export function projectReality(s: RunState, mods: Modifiers): void {
  if (!s.v2) return;
  const sim = cloneState(s);
  const ctx: Ctx = { s: sim, events: [], expect: true };
  realityDusk(ctx, runRealityLaws(ctx, mods), mods);
}

/**
 * Water moved by reality laws, by volume: each step is six tile-depths, laid one deep on the region's lowest dry ground (dry
 * after the flood itself). Writes into `water`; returns the tiles each sink filled, in order.
 */
export function poolSinks(w: WorldState, water: number[], sinks: { region: string; amount: number; laws?: string[] }[]): { region: string; tiles: number[]; laws: string[] }[] {
  const out: { region: string; tiles: number[]; laws: string[] }[] = [];
  for (const sink of sinks) {
    const tiles: number[] = [];
    for (let i = 0; i < w.region.length; i++) if (w.regions[w.region[i]]?.id === sink.region && w.terrain[i] !== T.RIVER && water[i] === 0) tiles.push(i);
    tiles.sort((a, b) => w.elev[a] - w.elev[b] || a - b);
    const pooled = tiles.slice(0, 6 * sink.amount);
    for (const i of pooled) water[i] += 1;
    out.push({ region: sink.region, tiles: pooled, laws: sink.laws ?? [] });
  }
  return out;
}
