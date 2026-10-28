import type { Id, MemoryItem, Villager } from './types.ts';

/** Per-villager memory is capped, so nothing grows without bound; the aggregate effect is a bounded multiplier on persuasion. */
export const MEMORY_CAP = 6;

export function remember(v: Villager, item: MemoryItem): void {
  const mem = (v.memory ??= []);
  // the same kind of memory about the same claim on the same day is not recorded twice
  if (mem.some((m) => m.kind === item.kind && m.claim === item.claim && m.day === item.day)) return;
  mem.push(item);
  if (mem.length > MEMORY_CAP) mem.shift();
}

/**
 * How receptive a villager is to a claim given what they have seen: a law that visibly failed (or a proof that backfired) makes them
 * warier, a law that visibly worked makes them a little keener. Bounded to 0.55 .. 1.15.
 */
export function memoryFactor(v: Villager, claim: Id): number {
  if (!v.memory || !v.memory.length) return 1;
  let f = 1;
  for (const m of v.memory) {
    if (m.claim !== claim) continue;
    if (m.kind === 'law_failed') f -= 0.14;
    else if (m.kind === 'proof_failed') f -= 0.08;
    else if (m.kind === 'law_harmed') f -= 0.1;
    else if (m.kind === 'law_worked') f += 0.05;
  }
  return Math.max(0.55, Math.min(1.15, f));
}

export function memoryLines(v: Villager): string[] {
  return (v.memory ?? []).slice().reverse().map((m) => `Day ${m.day}: ${m.text}`);
}
