import type { Duty, RunState } from '../engine/index.ts';
import { allClaimDefs, claimDef } from '../engine/core/lookup.ts';
import { passableMask } from '../engine/world/nav.ts';
import { triggerSources } from '../engine/laws/effects.ts';

/**
 * A read-only picture of the run for the renderer. The renderer never reads the run state directly and never writes to it: it gets this
 * snapshot, draws it, and sends player intent back through the same validated action API the old interface and the MCP server use.
 * Nothing in here is computed per frame; it is rebuilt when the run changes.
 */
export interface SceneLandmark {
  id: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  tiles: [number, number][];
  hp: number;
  maxHp: number;
  lit: boolean;
  fuelNights: number;
  data: Record<string, number>;
}

export interface SceneVillager {
  id: string;
  name: string;
  role: string;
  faction: string;
  factionColor: string;
  archetype: string;
  /** conviction in each story (the renderer shows it only for people the player has scouted) */
  conv: Record<string, number>;
  /** for each story: the event that last changed this person's mind about it (to light the people one event reached) */
  cause: Record<string, number | null>;
  x: number;
  y: number;
  status: 'ok' | 'injured' | 'sick' | 'dead';
  duty: Duty;
  dutyNote: string;
  look: { hue: number; skin: number; hair: number; hat: number; build: number };
  homeId: string;
  workId: string;
  place: string;
}

export interface SceneLaw {
  id: string;
  claimId: string;
  regionId: string;
  status: string;
  strength: number;
  /** what the law does and what powers it, so the effects can speak its own vocabulary */
  trigger: string;
  radius: number;
  subject: string;
  effect: string;
  rival: boolean;
  /** last night's note on why the law is held back, in the engine's words */
  note: string;
  /** what powers the law tonight, as the engine itself works it out (lit beacons, a rung bell, enough bridge watchers); empty means nothing is powering it */
  sources: { id: string; x: number; y: number }[];
  /** the law needs no single source: it covers its region (night, evidence, always) */
  regionWide: boolean;
  progress: number;
  supporters: number;
  activeNights: number;
}

export interface SceneTie {
  a: string;
  b: string;
  /** how far each trusts the other, 0..100 */
  ab: number;
  ba: number;
  kind: string;
}

export interface SceneSnapshot {
  version: 1;
  scenarioId: string;
  seed: number;
  day: number;
  /** changes whenever the run does (number of resolved days and logged events): a cheap key, not a hash of the state */
  revision: string;
  w: number;
  h: number;
  terrain: Uint8Array;
  elev: Int8Array;
  water: Float32Array;
  fire: Uint8Array;
  burned: Uint8Array;
  smoke: Uint8Array;
  /** where people can walk (the engine's own mask: the river blocks unless a bridge stands) */
  passable: Uint8Array;
  /** the river's own level (flood stage) */
  level: number;
  outcome: 'victory' | 'defeat' | null;
  landmarks: SceneLandmark[];
  villagers: SceneVillager[];
  laws: SceneLaw[];
  ties: SceneTie[];
  regions: { id: string; rects: [number, number, number, number][] }[];
  packs: { id: string; x: number; y: number; size: number }[];
  /** the regions where each story can become law, so choosing a story can show the ground it would govern */
  claimRegions: Record<string, string[]>;
  /** what kind of danger the chapter has, so the sky can say so */
  threat: string;
  /** a Generative Reality run's hens, loose stones and the bank raised with them (null in Classic) */
  reality: SceneReality | null;
}

export interface SceneReality {
  coops: { id: string; x: number; y: number }[];
  hens: { id: string; x: number; y: number; alt: number; stray: boolean }[];
  stones: { id: string; x: number; y: number; state: 'loose' | 'placed'; wet: number; base: number }[];
  /** tile index and how many levels the bank stands raised there */
  bank: [number, number][];
}

export function getSceneSnapshot(s: RunState): SceneSnapshot {
  const w = s.world;
  return {
    version: 1,
    scenarioId: s.scenarioId,
    seed: s.seed,
    day: s.day,
    revision: `${s.day}:${s.history.length}:${s.log.length}:${s.today.length}`,
    w: w.w,
    h: w.h,
    terrain: Uint8Array.from(w.terrain),
    elev: Int8Array.from(w.elev),
    water: Float32Array.from(w.water),
    fire: Uint8Array.from(w.fire),
    burned: Uint8Array.from(w.burned),
    smoke: Uint8Array.from(w.smoke),
    passable: passableMask(w),
    level: w.level,
    outcome: s.outcome ? s.outcome.result : null,
    landmarks: w.landmarks.map((l) => ({
      id: l.id, kind: l.kind, name: l.name, x: l.x, y: l.y, tiles: l.tiles.map((t) => [t[0], t[1]] as [number, number]), hp: l.hp, maxHp: l.maxHp, lit: l.lit, fuelNights: l.fuelNights, data: { ...l.data },
    })),
    villagers: s.villagers.map((v) => ({
      id: v.id, name: v.name, role: v.role, faction: v.faction, factionColor: s.factions.find((f) => f.id === v.faction)?.color ?? '#999999', archetype: v.archetype, conv: Object.fromEntries(Object.entries(v.beliefs).map(([c, b]) => [c, b.conv])), cause: Object.fromEntries(Object.entries(v.beliefs).map(([c, b]) => [c, b.cause])), x: v.x, y: v.y, status: v.status, duty: v.duty, dutyNote: v.dutyNote, look: { ...v.look }, homeId: v.homeId, workId: v.workId, place: v.place,
    })),
    laws: s.laws.map((l) => {
      let spec = { trigger: 'always', radius: 0, subject: '', effect: '', rival: false };
      let sources: { id: string; x: number; y: number }[] = [];
      let regionWide = false;
      try {
        const d = claimDef(s, l.claimId);
        spec = { trigger: d.spec.trigger.kind, radius: d.spec.radius, subject: d.spec.subject, effect: d.spec.effect, rival: !!d.rival };
        regionWide = ['night', 'evidence', 'always'].includes(d.spec.trigger.kind) && d.spec.subject !== 'stone';
        sources = regionWide ? [] : triggerSources(s, l, d).map((q) => ({ id: q.id, x: q.x, y: q.y }));
      } catch {
        /* a law whose story is gone draws nothing special */
      }
      return { id: l.id, claimId: l.claimId, regionId: l.regionId, status: l.status, strength: l.strength, ...spec, note: l.note, sources, regionWide, progress: l.progress, supporters: l.supporters.length, activeNights: l.activeNights };
    }),
    ties: s.edges.map((e) => ({ a: e.a, b: e.b, ab: e.ab, ba: e.ba, kind: e.kind })),
    regions: w.regions.map((r) => ({ id: r.id, rects: r.rects.map((q) => [q[0], q[1], q[2], q[3]] as [number, number, number, number]) })),
    packs: w.packs.map((p) => ({ id: p.id, x: p.x, y: p.y, size: p.size })),
    claimRegions: Object.fromEntries(allClaimDefs(s).map((d) => [d.id, d.regions.slice()])),
    threat: s.scn.threatKind,
    reality: s.v2
      ? {
          coops: s.v2.coops.map((c) => ({ id: c.id, x: c.x, y: c.y })),
          hens: s.v2.chickens.filter((c) => c.alive).map((c) => ({ id: c.id, x: c.x, y: c.y, alt: c.alt, stray: c.stray })),
          stones: s.v2.stones.filter((x) => x.state !== 'lost').map((x) => ({ id: x.id, x: x.x, y: x.y, state: x.state as 'loose' | 'placed', wet: x.wet, base: x.base })),
          bank: Object.entries(s.v2.bank).filter(([, h]) => h > 0).map(([k, h]) => [Number(k), h] as [number, number]).sort((a, b) => a[0] - b[0]),
        }
      : null,
  };
}

export interface SceneChanges {
  /** a different village altogether (new seed, retry, load): rebuild the world and dispose the old one */
  rebuild: boolean;
  terrain: boolean;
  water: boolean;
  fire: boolean;
  /** landmark ids whose look changed (health, lit, fuel, growth) */
  landmarks: string[];
  villagers: string[];
  laws: boolean;
  /** the hens, stones or raised bank of a Generative Reality run changed */
  reality: boolean;
}

const sameArr = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/** What the renderer has to touch to get from `prev` to `next`: a stable diff by entity id, so unchanged things are left alone. */
export function getSceneChanges(prev: SceneSnapshot | null, next: SceneSnapshot): SceneChanges {
  if (!prev || prev.scenarioId !== next.scenarioId || prev.seed !== next.seed || prev.w !== next.w || prev.h !== next.h || prev.day > next.day) {
    return { rebuild: true, terrain: true, water: true, fire: true, landmarks: next.landmarks.map((l) => l.id), villagers: next.villagers.map((v) => v.id), laws: true, reality: true };
  }
  const lm: string[] = [];
  const old = new Map(prev.landmarks.map((l) => [l.id, l]));
  for (const l of next.landmarks) {
    const o = old.get(l.id);
    if (!o || o.hp !== l.hp || o.lit !== l.lit || o.fuelNights !== l.fuelNights || JSON.stringify(o.data) !== JSON.stringify(l.data) || o.kind !== l.kind) lm.push(l.id);
  }
  if (old.size !== next.landmarks.length) for (const id of old.keys()) if (!next.landmarks.some((l) => l.id === id)) lm.push(id);
  const vv: string[] = [];
  const oldV = new Map(prev.villagers.map((v) => [v.id, v]));
  for (const v of next.villagers) {
    const o = oldV.get(v.id);
    if (!o || o.x !== v.x || o.y !== v.y || o.status !== v.status || o.duty !== v.duty || o.place !== v.place) vv.push(v.id);
  }
  return {
    rebuild: false,
    terrain: !sameArr(prev.terrain, next.terrain) || !sameArr(prev.elev, next.elev),
    water: !sameArr(prev.water, next.water) || prev.level !== next.level,
    fire: !sameArr(prev.fire, next.fire) || !sameArr(prev.burned, next.burned) || !sameArr(prev.smoke, next.smoke),
    landmarks: lm,
    villagers: vv,
    laws: JSON.stringify(prev.laws) !== JSON.stringify(next.laws),
    reality: JSON.stringify(prev.reality) !== JSON.stringify(next.reality),
  };
}
