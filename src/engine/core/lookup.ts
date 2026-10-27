import type { ClaimDef, Edge, Faction, Landmark, LawState, RunState, Villager } from './types.ts';

export function villager(s: RunState, id: string): Villager {
  const v = s.villagers.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown villager ${id}`);
  return v;
}

export function findVillager(s: RunState, id: string): Villager | undefined {
  return s.villagers.find((x) => x.id === id);
}

export function claimDef(s: RunState, id: string): ClaimDef {
  const d = s.scn.claimDefs.find((c) => c.id === id) ?? s.claims.find((c) => c.id === id)?.def ?? null;
  if (!d) throw new Error(`Unknown claim ${id}`);
  return d;
}

export function findClaimDef(s: RunState, id: string): ClaimDef | undefined {
  return s.scn.claimDefs.find((c) => c.id === id) ?? s.claims.find((c) => c.id === id)?.def ?? undefined;
}

/** All claim defs in play: authored plus player-composed. */
export function allClaimDefs(s: RunState): ClaimDef[] {
  const out = s.scn.claimDefs.slice();
  for (const c of s.claims) if (c.def && !out.some((o) => o.id === c.id)) out.push(c.def);
  return out;
}

export function faction(s: RunState, id: string): Faction {
  const f = s.factions.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown faction ${id}`);
  return f;
}

export function landmark(s: RunState, id: string): Landmark {
  const l = s.world.landmarks.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown landmark ${id}`);
  return l;
}

export function findLandmark(s: RunState, id: string): Landmark | undefined {
  return s.world.landmarks.find((x) => x.id === id);
}

export function lawFor(s: RunState, claimId: string, regionId: string): LawState | undefined {
  return s.laws.find((l) => l.claimId === claimId && l.regionId === regionId);
}

export function livingVillagers(s: RunState): Villager[] {
  return s.villagers.filter((v) => v.status !== 'dead');
}

/** What `a` thinks of `b` (credibility of b's words to a). 0 if no tie. */
export function trustOf(s: RunState, a: string, b: string): number {
  for (const e of s.edges) {
    if (e.a === a && e.b === b) return e.ab;
    if (e.b === a && e.a === b) return e.ba;
  }
  return 0;
}

export function edgeBetween(s: RunState, a: string, b: string): Edge | undefined {
  return s.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}

export function neighborsOf(s: RunState, id: string): { id: string; edge: Edge; trust: number; back: number }[] {
  const out: { id: string; edge: Edge; trust: number; back: number }[] = [];
  for (const e of s.edges) {
    if (e.a === id) out.push({ id: e.b, edge: e, trust: e.ab, back: e.ba });
    else if (e.b === id) out.push({ id: e.a, edge: e, trust: e.ba, back: e.ab });
  }
  out.sort((x, y) => (x.id < y.id ? -1 : 1));
  return out;
}

export function modActive(s: RunState, id: string): boolean {
  return s.modifiers.includes(id);
}

/** Multiplier on how well repetition (telling, gathering, messengers, gossip) persuades under the active modifiers. */
export function repeatMult(s: RunState): number {
  return modActive(s, 'doubting_scholars') ? 0.8 : 1;
}

/** Multiplier on how convincing a staged demonstration is. */
export function evidenceMult(s: RunState): number {
  return modActive(s, 'doubting_scholars') ? 1.35 : 1;
}
