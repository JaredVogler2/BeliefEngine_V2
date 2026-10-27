import type { RunState } from '../core/types.ts';

export function regionName(s: RunState, id: string): string {
  return s.world.regions.find((r) => r.id === id)?.name ?? id;
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
