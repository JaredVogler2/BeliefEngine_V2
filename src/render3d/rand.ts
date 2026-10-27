import { hash53 } from '../engine/core/hash.ts';

/**
 * Render-only randomness. Nothing here reaches the engine: it places trees, tufts and the walk phase of a villager, from the scenario
 * id and seed, so a village looks the same every time it is opened and a reload never re-rolls a face or a roof. It is deliberately
 * separate from the engine's stateless generator, so that no amount of drawing can change a replay hash.
 */
export function seedFrom(...parts: (string | number)[]): number {
  return Number.parseInt(hash53(parts.join('|')).slice(0, 8), 16) >>> 0;
}

export type Rng = () => number;

/** mulberry32: small, fast, good enough for scatter */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (r: Rng, lo: number, hi: number): number => lo + (hi - lo) * r();
export const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];

/** smooth 2D value noise in [0,1] */
export function makeNoise(seed: number): (x: number, y: number) => number {
  const lat = (ix: number, iy: number): number => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = sm(x - ix);
    const fy = sm(y - iy);
    const a = lat(ix, iy);
    const b = lat(ix + 1, iy);
    const c = lat(ix, iy + 1);
    const d = lat(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

export function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
