import { rand, randInt } from '../core/rng.ts';
import type { Landmark, RunState, WorldState } from '../core/types.ts';
import { DIRS4, T, idx, inBounds, regionAt } from '../world/grid.ts';
import { REALITY_LANG } from './ontology.ts';
import type { OpId } from './operators.ts';
import type { MindsState } from '../mind/types.ts';

/**
 * The state a Generative Reality run adds to V1's RunState, under `s.v2`. Classic runs never have it, so their hashes, saves
 * and replays are exactly V1's. Everything here is plain JSON (it is cloned, hashed and saved with the run).
 *
 * Two new kinds of thing live here, with real rules (entities.ts): chickens in coops by the homes, and loose stones by the
 * river. The world's terrain and elevation arrays are shared between state copies and never change; a lasting change to the
 * ground (a bank raised with hauled stones) is kept in `bank` and applied as a flood shield every night instead.
 */

export interface Coop {
  id: string;
  x: number;
  y: number;
  home: string;
  region: string;
}

export interface Chicken {
  id: string;
  coop: string;
  x: number;
  y: number;
  alive: boolean;
  /** across the river from its coop, or otherwise unable to walk home */
  stray: boolean;
  /** height reached last night (for the renderer and the log): 0 on the ground */
  alt: number;
  /** how it died, if it did */
  fate: 'drowned' | 'taken' | null;
}

export interface Stone {
  id: string;
  x: number;
  y: number;
  /** natural weight in loads, 2..4 (1 a basket, 3 what one person carries, 5 immovable) */
  base: number;
  /** 0 dry, 1 damp, 2 soaked */
  wet: number;
  state: 'loose' | 'placed' | 'lost';
}

export interface AppliedEffect {
  day: number;
  law: string;
  claim: string;
  clause: string;
  op: OpId;
  /** ids of what it touched (entity, landmark, villager or tile ids), at most 40 */
  targets: string[];
  /** the event that records it */
  event: number;
  text: string;
  /** what it amounted to once every law's pull was combined, where one number says it: tiles of lift, loads of weight */
  amount?: number;
}

export interface RealityState {
  lang: typeof REALITY_LANG;
  /** Reality Lab: unranked, with relaxed balance (never relaxed computation or safety limits) */
  lab: boolean;
  coops: Coop[];
  chickens: Chicken[];
  stones: Stone[];
  nextId: number;
  /** lasting ground raised on the bank by hauled stones: tile index → tiles of height (applied as a flood shield) */
  bank: Record<string, number>;
  /** law ids whose 'while_active' clauses have fired at least once */
  primed: string[];
  /** what reality laws did last night */
  lastNight: AppliedEffect[];
  eggs: number;
  /** villager minds (phase 07): personality, goals and memories; absent in reality saves made before them */
  minds?: MindsState;
}

export const MAX_CHICKENS = 24;
export const COOP_CAP = 12;
export const MAX_STONES = 12;

function landTile(w: WorldState, x: number, y: number): boolean {
  if (!inBounds(w, x, y)) return false;
  const t = w.terrain[idx(w, x, y)];
  return t !== T.RIVER && t !== T.ROCK;
}

function occupied(w: WorldState, x: number, y: number, extra: { x: number; y: number }[]): boolean {
  return w.landmarks.some((l) => (l.x === x && l.y === y) || l.tiles.some(([a, b]) => a === x && b === y)) || extra.some((e) => e.x === x && e.y === y);
}

/** A free land tile next to a landmark, in a fixed search order (deterministic). */
function besideLandmark(w: WorldState, l: Landmark, taken: { x: number; y: number }[]): { x: number; y: number } | null {
  for (const [dx, dy] of [...DIRS4, [1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
    const x = l.x + dx;
    const y = l.y + dy;
    if (landTile(w, x, y) && !occupied(w, x, y, taken)) return { x, y };
  }
  return null;
}

/** Land tiles touching the river (or, in a village without one, tiles beside the mill and fields), sorted for determinism. */
export function bankTiles(w: WorldState): number[] {
  const out: number[] = [];
  for (let y = 0; y < w.h; y++)
    for (let x = 0; x < w.w; x++) {
      if (!landTile(w, x, y)) continue;
      if (DIRS4.some(([dx, dy]) => inBounds(w, x + dx, y + dy) && w.terrain[idx(w, x + dx, y + dy)] === T.RIVER)) out.push(idx(w, x, y));
    }
  return out;
}

/** Coops by every other home, a flock in each; loose stones on the riverbank. Seeded, so the same run always gets the same world. */
export function initReality(s: RunState, lab = false): RealityState {
  const w = s.world;
  const st: RealityState = { lang: REALITY_LANG, lab, coops: [], chickens: [], stones: [], nextId: 1, bank: {}, primed: [], lastNight: [], eggs: 0 };
  const taken: { x: number; y: number }[] = [];
  const homes = w.landmarks.filter((l) => l.kind === 'home').sort((a, b) => (a.id < b.id ? -1 : 1));
  homes.forEach((h, i) => {
    if (i % 2 === 1 || st.coops.length >= 4) return;
    const at = besideLandmark(w, h, taken);
    if (!at) return;
    taken.push(at);
    const coop: Coop = { id: `coop${st.coops.length + 1}`, x: at.x, y: at.y, home: h.id, region: regionAt(w, at.x, at.y) || h.district };
    st.coops.push(coop);
    const n = 4 + randInt(s.seed, 'reality-flock', 3, coop.id);
    for (let k = 0; k < n && st.chickens.length < MAX_CHICKENS; k++) st.chickens.push({ id: `hen${st.nextId++}`, coop: coop.id, x: coop.x, y: coop.y, alive: true, stray: false, alt: 0, fate: null });
  });
  const banks = bankTiles(w).filter((i) => !occupied(w, i % w.w, Math.floor(i / w.w), taken));
  const candidates = banks.length ? banks : w.landmarks.filter((l) => l.kind === 'mill' || l.kind === 'field').flatMap((l) => { const b = besideLandmark(w, l, taken); return b ? [idx(w, b.x, b.y)] : []; });
  const want = Math.min(MAX_STONES, Math.max(4, Math.round(candidates.length / 6)));
  const picked = new Set<number>();
  // the bank is mended where the lanterns mark its weak places: the nearest stretch of bank within two tiles of each lantern keeps a
  // stone pulled from the river (at most half of them); the rest lie wherever the river left them
  for (const b of w.landmarks.filter((l) => l.kind === 'beacon').sort((a, c) => (a.id < c.id ? -1 : 1))) {
    if (picked.size >= Math.floor(want / 2)) break;
    const near = candidates.filter((i) => !picked.has(i) && Math.hypot((i % w.w) - b.x, Math.floor(i / w.w) - b.y) <= 2.5).sort((a, c) => Math.hypot((a % w.w) - b.x, Math.floor(a / w.w) - b.y) - Math.hypot((c % w.w) - b.x, Math.floor(c / w.w) - b.y) || a - c);
    if (near.length) picked.add(near[0]);
  }
  for (let k = 0; k < 4 * want && picked.size < want && candidates.length; k++) picked.add(candidates[Math.floor(rand(s.seed, 'reality-stone', k) * candidates.length)]);
  [...picked].sort((a, b) => a - b).forEach((i) => st.stones.push({ id: `stone${st.nextId++}`, x: i % w.w, y: Math.floor(i / w.w), base: 2 + randInt(s.seed, 'reality-stone-mass', 3, i), wet: 0, state: 'loose' }));
  return st;
}
