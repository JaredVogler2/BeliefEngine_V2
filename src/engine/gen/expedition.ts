import { hashKeys, Stream } from '../core/rng.ts';
import type { Id } from '../core/types.ts';
import type { ScenarioDef } from '../content/types.ts';
import { validateScenario } from '../content/validate.ts';
import { buildWorld } from '../world/build.ts';
import { computeWater } from '../world/flood.ts';
import { components, connected, passableMask } from '../world/nav.ts';
import { idx } from '../world/grid.ts';
import { componentsOf } from './kit.ts';
import { idleRunLoses } from './dynamic.ts';
import { applicableModifiers, sanitizeModifiers } from './modifiers.ts';
import { genRiver } from './river.ts';
import { genDrought } from './drought.ts';
import { genWolves } from './wolves.ts';
import type { Biome, Blueprint } from './blueprint.ts';

/**
 * Expedition generator. A village is a pure function of (generator version, seed): same inputs, same village, on every machine.
 * The pipeline is constrained composition (biome -> map -> cast -> sparse social graph with a bottleneck -> crisis schedule ->
 * claim pool -> rival -> modifiers). Cheap structural invariants are checked here and the generator retries with a derived seed
 * if any fail; behavioural verification (a bot actually wins it) lives in gen/verify.ts and is reported honestly, never assumed.
 */
export const GEN_VERSION = 1;
export const MAX_SEED = 2147483647;


/** A shuffle bag: every aligned run of six seeds contains each biome exactly twice, in a seed-dependent order. */
export function biomeForSeed(seed: number): Biome {
  const bag: Biome[] = new Stream(Math.floor(seed / 6), 'biome-bag').shuffle<Biome>(['river', 'river', 'drought', 'drought', 'wolves', 'wolves']);
  return bag[((seed % 6) + 6) % 6];
}

export interface ExpeditionRef {
  version: number;
  seed: number;
  /** explicit modifiers; null means "whatever the generator draws for this seed" */
  modifiers: Id[] | null;
}

export function expeditionId(seed: number, modifiers?: readonly Id[] | null): string {
  const base = `x${GEN_VERSION}.${seed}`;
  if (modifiers === undefined || modifiers === null) return base;
  return `${base}.${modifiers.length ? modifiers.join('+') : '-'}`;
}

const ID_RE = /^x(\d{1,2})\.(\d{1,10})(?:\.([a-z_+-]{1,160}))?$/;

export function parseExpeditionId(id: string): ExpeditionRef | null {
  const m = ID_RE.exec(id);
  if (!m) return null;
  const version = Number(m[1]);
  const seed = Number(m[2]);
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) return null;
  const mods = m[3] === undefined ? null : m[3] === '-' ? [] : m[3].split('+').filter(Boolean);
  return { version, seed, modifiers: mods };
}

export interface Expedition {
  def: ScenarioDef;
  bp: Blueprint;
  id: string;
  /** which derived seed produced the village (0 = the first draw) */
  attempt: number;
  /** structural problems of the final attempt (empty = passed) */
  issues: string[];
}

/** Draw 1-3 applicable modifiers for a seed (stable order, no duplicates). */
export function drawModifiers(seed: number, def: ScenarioDef): Id[] {
  const st = new Stream(seed, 'modifiers');
  const r = st.next();
  const n = r < 0.4 ? 1 : r < 0.85 ? 2 : 3;
  const pool = st.shuffle(applicableModifiers(def).map((m) => m.id));
  return sanitizeModifiers(def, pool.slice(0, n));
}

/** Cheap structural invariants (no simulation). Returns human-readable problems; empty means the village passes. */
export function structuralIssues(def: ScenarioDef, bp: Blueprint): string[] {
  const out: string[] = [];
  out.push(...validateScenario(def));
  const rt = def.runtime;
  const n = def.villagers.length;
  if (n < 12 || n > 18) out.push(`population ${n} outside 12..18`);
  const comps = componentsOf(def.villagers.map((v) => v.id), def.edges);
  if (comps.length !== 1) out.push(`social graph has ${comps.length} components`);
  // the Keeper can walk to every home, civic building and field while the bridge stands
  const world = buildWorld(def.map);
  const mask = passableMask(world);
  const comp = components(world, mask);
  const anchor = world.landmarks.find((l) => l.id === rt.anchor);
  if (!anchor) out.push('anchor missing');
  else {
    const unreachable = world.landmarks.filter((l) => ['home', 'chapel', 'market', 'hall', 'field', 'pen', 'belltower', 'campfire', 'beacon'].includes(l.kind) && !connected(world, comp, anchor.x, anchor.y, l.x, l.y));
    if (unreachable.length) out.push(`unreachable from the anchor: ${unreachable.slice(0, 4).map((l) => l.id).join(', ')}`);
  }
  // every villager's home and workplace exist, and no two landmarks share a tile
  const seen = new Set<string>();
  for (const l of world.landmarks) {
    const k = `${l.x},${l.y}`;
    if (seen.has(k)) out.push(`two landmarks share tile ${k} (${l.id})`);
    seen.add(k);
  }
  // claims: every playable claim can be learned with time to use it
  for (const c of rt.claimDefs) {
    if (c.rival && !c.adoptable) continue;
    const day = rt.starters.includes(c.id) ? 1 : c.unlockDay ?? (c.startsAvailable ? 1 : 99);
    if (day > rt.durationDays - 2) out.push(`claim ${c.id} arrives on day ${day}, too late to matter`);
  }
  if (rt.starters.length < 2) out.push('fewer than two starter stories');
  if (bp.biome === 'river') {
    const level = rt.threat[rt.threat.length - 1].level;
    const water = computeWater(world, level, null);
    const homes = world.landmarks.filter((l) => l.kind === 'home');
    const wet = homes.filter((l) => water[idx(world, l.x, l.y)] >= 1).length;
    if (wet < 3) out.push(`the surge floods only ${wet} homes: no real danger`);
    if (wet > Math.ceil(homes.length * 0.85)) out.push(`the surge floods ${wet} of ${homes.length} homes: hopeless`);
  }
  if (bp.biome === 'wolves') {
    const pens = world.landmarks.filter((l) => l.kind === 'pen');
    const fires = world.landmarks.filter((l) => l.kind === 'campfire');
    for (const p of pens) {
      const near = fires.filter((f) => Math.abs(f.x - p.x) + Math.abs(f.y - p.y) <= 4).length;
      if (near < 1) out.push(`${p.id} has no fire within reach`);
    }
    if (rt.threat.every((t) => t.pack === 0)) out.push('no pack ever hunts');
  }
  if (bp.biome === 'drought') {
    if (world.landmarks.filter((l) => l.kind === 'field').length < 3) out.push('fewer than three fields');
  }
  return out;
}

function build(seed: number, biome: Biome, id: string): { def: ScenarioDef; bp: Blueprint } {
  switch (biome) {
    case 'river':
      return genRiver(seed, id);
    case 'drought':
      return genDrought(seed, id);
    case 'wolves':
      return genWolves(seed, id);
  }
}

const cache = new Map<string, Expedition>();

/**
 * Generate the village for a seed. If a draw fails the structural invariants the generator tries up to eight derived seeds,
 * and records which one it used. The result is cached.
 */
export function generateExpedition(seed: number, modifiers: readonly Id[] | null = null): Expedition {
  const id = expeditionId(seed, modifiers);
  const hit = cache.get(id);
  if (hit) return hit;
  const biome = biomeForSeed(seed);
  let last: Expedition | null = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const s2 = attempt === 0 ? seed : hashKeys(seed, 'regen', attempt) & MAX_SEED;
    const { def, bp } = build(s2, biome, id);
    const mods = modifiers === null ? drawModifiers(seed, def) : sanitizeModifiers(def, modifiers);
    def.modifiers = mods;
    bp.modifiers = mods;
    const issues = structuralIssues(def, bp);
    if (!issues.length && !idleRunLoses(def, seed, mods)) issues.push('doing nothing wins: no real danger');
    last = { def, bp, id, attempt, issues };
    if (!issues.length) break;
  }
  cache.set(id, last!);
  if (cache.size > 24) cache.delete(cache.keys().next().value as string);
  return last!;
}

/** Hook for the scenario registry: resolve an expedition id to a scenario definition. */
export function resolveExpedition(id: string): ScenarioDef | null {
  const ref = parseExpeditionId(id);
  if (!ref || ref.version !== GEN_VERSION) return null;
  return generateExpedition(ref.seed, ref.modifiers).def;
}

/** A short fingerprint of what makes a village play differently; used for variety statistics. */
export function signatureOf(bp: Blueprint): string {
  const ex = bp.extras ?? {};
  return [bp.biome, bp.population >= 15 ? 'big' : bp.population >= 13 ? 'mid' : 'small', bp.bottleneck ? 'choke' : 'web', bp.surge ?? ex.maxPack ?? ex.fields ?? '', bp.starters.slice().sort().join('+'), bp.modifiers.slice().sort().join('+')].join('|');
}
