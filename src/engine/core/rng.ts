/**
 * Deterministic, stateless, domain-separated randomness.
 *
 * Every random draw in the simulator is a pure function of (seed, domain, keys...). There is no hidden
 * PRNG cursor, so draws do not depend on evaluation order, array insertion order or how many other draws
 * happened first. seed = 0 is valid. Nothing here touches Math.random() or the wall clock.
 */

/** 32-bit integer mixing (murmur3 finalizer style). */
function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash a string to a 32-bit unsigned integer (FNV-1a then mixed). */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h);
}

export type RngKey = string | number;

/** Combine a seed, a domain label and arbitrary keys into a 32-bit hash. */
export function hashKeys(seed: number, domain: string, ...keys: RngKey[]): number {
  let h = mix32((seed | 0) ^ 0x9e3779b9);
  h = mix32(h ^ hashString(domain));
  for (const k of keys) {
    const v = typeof k === 'number' ? (k | 0) ^ 0x51ed270b : hashString(k);
    h = mix32(Math.imul(h ^ v, 0x01000193) + 0x7f4a7c15);
  }
  return h >>> 0;
}

/** Uniform float in [0, 1) for (seed, domain, keys). */
export function rand(seed: number, domain: string, ...keys: RngKey[]): number {
  return hashKeys(seed, domain, ...keys) / 4294967296;
}

/** Integer in [0, n) for (seed, domain, keys). */
export function randInt(seed: number, domain: string, n: number, ...keys: RngKey[]): number {
  if (n <= 0) return 0;
  return Math.floor(rand(seed, domain, ...keys) * n);
}

/** Pick one element deterministically. */
export function pick<T>(seed: number, domain: string, items: readonly T[], ...keys: RngKey[]): T {
  return items[randInt(seed, domain, items.length, ...keys)];
}

/** Sequential PRNG (mulberry32) for generators that want a classic stream. State is a plain number. */
export class Stream {
  private s: number;
  constructor(seed: number, domain = '') {
    this.s = hashKeys(seed, domain || 'stream');
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return n <= 0 ? 0 : Math.floor(this.next() * n);
  }
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
  shuffle<T>(items: readonly T[]): T[] {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

export function round(v: number): number {
  return Math.round(Number.isFinite(v) ? v : 0);
}
