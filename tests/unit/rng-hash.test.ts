import { describe, expect, it } from 'vitest';
import { hashValue, canonicalize } from '../../src/engine/core/hash.ts';
import { rand, randInt, Stream } from '../../src/engine/core/rng.ts';

describe('stateless rng', () => {
  it('is deterministic and domain separated', () => {
    expect(rand(5, 'a', 1, 2)).toBe(rand(5, 'a', 1, 2));
    expect(rand(5, 'a', 1, 2)).not.toBe(rand(5, 'b', 1, 2));
    expect(rand(5, 'a', 1, 2)).not.toBe(rand(6, 'a', 1, 2));
    expect(rand(5, 'a', 1, 2)).not.toBe(rand(5, 'a', 2, 1));
  });
  it('accepts seed 0 and stays in [0,1)', () => {
    for (let i = 0; i < 2000; i++) {
      const r = rand(0, 'x', i);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
  it('is roughly uniform', () => {
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) buckets[randInt(7, 'u', 10, i)]++;
    for (const b of buckets) expect(b).toBeGreaterThan(1700);
  });
  it('Stream is reproducible', () => {
    const a = new Stream(3, 'g');
    const b = new Stream(3, 'g');
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });
});

describe('canonical hashing', () => {
  it('ignores key order and undefined', () => {
    expect(hashValue({ a: 1, b: [1, 2], c: undefined })).toBe(hashValue({ b: [1, 2], a: 1 }));
    expect(canonicalize({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
  });
  it('distinguishes values and normalises -0 / NaN', () => {
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
    expect(hashValue({ a: -0 })).toBe(hashValue({ a: 0 }));
    expect(canonicalize(NaN)).toBe('null');
  });
});
