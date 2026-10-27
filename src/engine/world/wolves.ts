import { emit, type Ctx } from '../core/events.ts';
import { clamp } from '../core/rng.ts';
import type { Landmark, Pack, RunState } from '../core/types.ts';
import type { Modifiers } from '../laws/effects.ts';
import { DIRS4, T, idx, inBounds } from './grid.ts';

/**
 * Predator packs. Each night the active packs walk up to 3 tiles toward the nearest prey (a pen or a worker in the woods).
 * Tiles inside a wolf-repel zone (predatorBlock) cannot be entered; a wolf-attract zone (predatorLure) pulls packs toward its
 * source instead. A pack adjacent to a pen takes livestock; adjacent to a person outside shelter it injures them.
 */
export function activePacks(s: RunState): number {
  const th = s.threat[Math.min(s.day, s.threat.length) - 1];
  return Math.min(s.world.packs.length, th?.pack ?? 0);
}

function nearestPrey(s: RunState, p: Pack, mods: Modifiers): { x: number; y: number; id: string } | null {
  const w = s.world;
  // lure sources first: a decoy fire the wolves believe in
  let best: { x: number; y: number; id: string; d: number } | null = null;
  for (let i = 0; i < mods.predatorLure.length; i++) {
    if (mods.predatorLure[i] >= 1 && p.hunger < 75) {
      const x = i % w.w;
      const y = Math.floor(i / w.w);
      const d = Math.abs(x - p.x) + Math.abs(y - p.y);
      if (d <= 14 && (!best || d < best.d)) best = { x, y, id: `lure@${x},${y}`, d };
    }
  }
  if (best) return best;
  for (const l of w.landmarks) {
    if (l.kind !== 'pen' || (l.data.stock ?? 0) <= 0) continue;
    const d = Math.abs(l.x - p.x) + Math.abs(l.y - p.y);
    if (!best || d < best.d) best = { x: l.x, y: l.y, id: l.id, d };
  }
  return best;
}

function stepToward(s: RunState, p: Pack, tx: number, ty: number, mods: Modifiers): void {
  const w = s.world;
  const steps = s.scn.consts.wolfSteps ?? 3;
  for (let step = 0; step < steps; step++) {
    let bestD = Math.abs(tx - p.x) + Math.abs(ty - p.y);
    let bx = p.x;
    let by = p.y;
    for (const [dx, dy] of DIRS4) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!inBounds(w, nx, ny)) continue;
      const i = idx(w, nx, ny);
      if (w.terrain[i] === T.RIVER || w.terrain[i] === T.ROCK) continue;
      if (mods.predatorBlock[i] >= 1) continue;
      const d = Math.abs(tx - nx) + Math.abs(ty - ny);
      if (d < bestD || (d === bestD && (bx === p.x && by === p.y))) {
        bestD = d;
        bx = nx;
        by = ny;
      }
    }
    if (bx === p.x && by === p.y) break;
    p.x = bx;
    p.y = by;
  }
}

export function runWolves(ctx: Ctx, mods: Modifiers): void {
  const s = ctx.s;
  const w = s.world;
  const n = activePacks(s);
  for (let k = 0; k < w.packs.length; k++) {
    const p = w.packs[k];
    if (k >= n) {
      p.target = null;
      continue;
    }
    const prey = nearestPrey(s, p, mods);
    if (!prey) continue;
    p.target = prey.id;
    const before = `${p.x},${p.y}`;
    stepToward(s, p, prey.x, prey.y, mods);
    const dist = Math.abs(p.x - prey.x) + Math.abs(p.y - prey.y);
    if (before !== `${p.x},${p.y}`) emit(ctx, { step: 'hazard', code: 'PACK_MOVES', importance: 0, tile: [p.x, p.y], text: `Pack ${p.id} prowls toward ${prey.id.startsWith('lure') ? 'the smoke' : prey.id}.` });
    if (dist <= 1) {
      if (prey.id.startsWith('lure')) {
        emit(ctx, { step: 'hazard', code: 'PACK_LURED', importance: 3, tile: [p.x, p.y], text: `Pack ${p.id} circles the decoy fire and finds nothing to eat.` });
        p.hunger = clamp(p.hunger + 25, 0, 100);
        if (p.hunger >= 75) emit(ctx, { step: 'hazard', code: 'PACK_STARVING', importance: 2, tile: [p.x, p.y], text: `Pack ${p.id} is starving and will not be fooled by the decoy again. It turns on the pens.` });
        continue;
      }
      const pen = w.landmarks.find((l) => l.id === prey.id) as Landmark;
      const killed = Math.min(pen.data.stock ?? 0, Math.max(1, Math.min(2, p.size)));
      pen.data.stock = (pen.data.stock ?? 0) - killed;
      p.lastKill = s.day;
      p.hunger = clamp(p.hunger - 50, 15, 100);
      s.flags.livestockLost = (s.flags.livestockLost ?? 0) + killed;
      emit(ctx, { step: 'hazard', code: 'LIVESTOCK_KILLED', importance: 3, tile: [pen.x, pen.y], text: `Pack ${p.id} strikes ${pen.name}: ${killed} animals lost (${pen.data.stock} left).` });
    }
  }
  // spared pens: a pack that would have struck but could not enter the smoke
  for (const pen of w.landmarks.filter((l) => l.kind === 'pen')) {
    const guarded = mods.predatorBlock[idx(w, pen.x, pen.y)] >= 1;
    if (guarded && n > 0) {
      const near = w.packs.slice(0, n).some((p) => Math.abs(p.x - pen.x) + Math.abs(p.y - pen.y) <= 6);
      if (near) {
        s.flags.pensSaved = (s.flags.pensSaved ?? 0) + 1;
        emit(ctx, { step: 'hazard', code: 'PEN_SPARED', importance: 2, tile: [pen.x, pen.y], text: `${pen.name} is untouched: the wolves would not cross the smoke.` });
      }
    }
  }
}

export function packForecast(s: RunState): { id: string; target: string | null; dist: number }[] {
  const out: { id: string; target: string | null; dist: number }[] = [];
  const n = activePacks(s);
  for (let k = 0; k < n; k++) {
    const p = s.world.packs[k];
    let best: { id: string; d: number } | null = null;
    for (const l of s.world.landmarks) {
      if (l.kind !== 'pen' || (l.data.stock ?? 0) <= 0) continue;
      const d = Math.abs(l.x - p.x) + Math.abs(l.y - p.y);
      if (!best || d < best.d) best = { id: l.id, d };
    }
    out.push({ id: p.id, target: best?.id ?? null, dist: best?.d ?? 0 });
  }
  return out;
}
