import type { RunState } from '../engine/index.ts';
import { TS } from './palette.ts';

/**
 * What a Generative Reality run adds to the classic map: the coops and their hens, loose stones (darker when wet), stones carried
 * to the bank and the stretch of bank they raised. Drawn from the run state as it is; nothing here is animated beyond a hen's peck,
 * and nothing is drawn that the engine does not hold.
 */

export interface RealityDrawn {
  coops: number;
  hens: number;
  strays: number;
  stones: number;
  placed: number;
  bank: number;
}

export function realityCounts(s: RunState | null): RealityDrawn {
  const v2 = s?.v2;
  if (!v2) return { coops: 0, hens: 0, strays: 0, stones: 0, placed: 0, bank: 0 };
  return {
    coops: v2.coops.length,
    hens: v2.chickens.filter((c) => c.alive).length,
    strays: v2.chickens.filter((c) => c.alive && c.stray).length,
    stones: v2.stones.filter((x) => x.state === 'loose').length,
    placed: v2.stones.filter((x) => x.state === 'placed').length,
    bank: Object.values(v2.bank).filter((h) => h > 0).length,
  };
}

/** a small offset per hen so a flock reads as birds, not one dot (stable: from the hen's id) */
function jitter(id: string): [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return [((h % 17) / 16 - 0.5) * 0.7, (((h >> 5) % 17) / 16 - 0.5) * 0.6];
}

/** push draw calls (sorted by y with everything else on the map) for the reality entities */
export function realityDrawList(g: CanvasRenderingContext2D, s: RunState, t: number, list: { y: number; f: () => void }[]): void {
  const v2 = s.v2;
  if (!v2) return;
  const w = s.world;
  // the raised bank: a rim of fitted stones along each raised tile, one course per level
  for (const [k, h] of Object.entries(v2.bank)) {
    if (h <= 0) continue;
    const i = Number(k);
    const x = (i % w.w) * TS;
    const y = Math.floor(i / w.w) * TS;
    list.push({
      y: y + TS - 4,
      f: () => {
        for (let c = 0; c < h; c++) {
          g.fillStyle = c === 0 ? '#8a8172' : '#a39a88';
          g.fillRect(x + 2, y + TS - 8 - c * 5, TS - 4, 5);
          g.strokeStyle = 'rgba(40,34,26,0.55)';
          g.lineWidth = 1;
          for (let s2 = 0; s2 < 4; s2++) g.strokeRect(x + 2 + s2 * ((TS - 4) / 4), y + TS - 8 - c * 5, (TS - 4) / 4, 5);
        }
      },
    });
  }
  for (const c of v2.coops) {
    const x = c.x * TS;
    const y = c.y * TS;
    list.push({
      y: y + TS - 2,
      f: () => {
        g.fillStyle = '#8b5a33';
        g.fillRect(x + 8, y + 14, 16, 12);
        g.fillStyle = '#5b3a22';
        g.beginPath();
        g.moveTo(x + 6, y + 15);
        g.lineTo(x + 16, y + 7);
        g.lineTo(x + 26, y + 15);
        g.closePath();
        g.fill();
        g.fillStyle = '#2b1d12';
        g.fillRect(x + 14, y + 20, 4, 6);
      },
    });
  }
  for (const st of v2.stones) {
    if (st.state === 'lost') continue;
    const x = st.x * TS + TS / 2;
    const y = st.y * TS + TS / 2 + 6;
    const r = 3 + Math.min(4, st.base);
    list.push({
      y: y + r,
      f: () => {
        g.fillStyle = st.state === 'placed' ? '#b7ad98' : st.wet > 0 ? '#5f6168' : '#8d8f96';
        g.beginPath();
        g.ellipse(x, y, r + 1, r * 0.75, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.beginPath();
        g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.45, r * 0.3, 0, 0, Math.PI * 2);
        g.fill();
      },
    });
  }
  for (const h of v2.chickens) {
    if (!h.alive) continue;
    const [jx, jy] = jitter(h.id);
    const x = (h.x + 0.5 + jx) * TS;
    const y = (h.y + 0.62 + jy) * TS;
    const peck = Math.sin(t * 3 + x * 0.3) > 0.8 ? 1 : 0;
    list.push({
      y,
      f: () => {
        g.fillStyle = h.stray ? '#e9d7a8' : '#f4efe3';
        g.beginPath();
        g.ellipse(x, y, 3.2, 2.4, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(x + 2.6, y - 2 + peck, 1.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#e0672c';
        g.fillRect(x + 3.6, y - 2 + peck, 1.6, 1);
        g.fillStyle = '#c0392b';
        g.fillRect(x + 2.2, y - 3.6 + peck, 1.2, 1);
      },
    });
  }
}
