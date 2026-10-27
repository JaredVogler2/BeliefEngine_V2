import type { Faction, Traits } from '../core/types.ts';
import { Stream } from '../core/rng.ts';
import type { EdgeDef, VillagerDef } from '../content/types.ts';
import type { LandmarkDef, Rect } from '../world/build.ts';

/** Shared building blocks for the expedition generator: name pools, placement, cast and social-graph construction. */

export const FIRST_NAMES = [
  'Ada', 'Bram', 'Cora', 'Dov', 'Edda', 'Finn', 'Greta', 'Hale', 'Isla', 'Jory', 'Kit', 'Lena', 'Mace', 'Nia', 'Orin', 'Pell',
  'Quin', 'Rhea', 'Sten', 'Tess', 'Ulric', 'Vera', 'Wick', 'Xan', 'Yara', 'Zane', 'Alder', 'Birch', 'Clem', 'Dena', 'Eli', 'Fern',
  'Gus', 'Hana', 'Ivor', 'June', 'Kell', 'Lark', 'Moss', 'Neve', 'Otto', 'Posy', 'Rafe', 'Sage', 'Tove', 'Una', 'Vale', 'Wren',
  'Yule', 'Zora', 'Abel', 'Bea', 'Corin', 'Dilys', 'Emrys', 'Faye', 'Garth', 'Hild', 'Ines', 'Joss',
];

export const SURNAMES = [
  'Ashby', 'Barrow', 'Carver', 'Dunmore', 'Ellery', 'Fallow', 'Garner', 'Hollis', 'Ingram', 'Jessop', 'Kemble', 'Lathe', 'Marsh',
  'Nettle', 'Orchard', 'Penrose', 'Quarry', 'Rushby', 'Sorrel', 'Thorne', 'Underhill', 'Vance', 'Wicker', 'Yarrow', 'Arden',
  'Bishop', 'Cobb', 'Draper', 'Eames', 'Finch', 'Gale', 'Heron', 'Isham', 'Kerr', 'Lowry', 'Mercer', 'Noakes', 'Oakes', 'Pike',
  'Reeve', 'Sutton', 'Tanner', 'Upton', 'Vickers', 'Wells', 'Yates',
];

export const VILLAGE_ADJ = ['Red', 'Grey', 'Low', 'High', 'Old', 'Stone', 'Willow', 'Alder', 'Hollow', 'Mossy', 'Fennel', 'Ember'];
export const VILLAGE_NOUN = ['bank', 'ford', 'hollow', 'wick', 'mere', 'stead', 'dale', 'brook', 'combe', 'holt', 'marsh', 'cross'];

export function villageName(st: Stream): string {
  return `${st.pick(VILLAGE_ADJ)}${st.pick(VILLAGE_NOUN)}`;
}

export const e = (a: string, b: string, ab: number, ba: number, rate: number, kind: EdgeDef['kind']): EdgeDef => ({ a, b, ab, ba, rate, kind });

export const fieldTiles = (x0: number, y0: number, w: number, h: number): [number, number][] => {
  const tiles: [number, number][] = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) tiles.push([x, y]);
  return tiles;
};

export const rectOf = (x0: number, y0: number, w: number, h: number): Rect => [x0, y0, x0 + w - 1, y0 + h - 1];

/** Tracks occupied tiles so generated landmarks never overlap or sit in water, and keeps road corridors open. */
export class Placer {
  private taken = new Set<number>();
  constructor(readonly w: number, readonly h: number) {}
  private k(x: number, y: number): number {
    return y * this.w + x;
  }
  block(x: number, y: number): void {
    this.taken.add(this.k(x, y));
  }
  blockRect(r: Rect): void {
    for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) this.block(x, y);
  }
  free(x: number, y: number, gap = 0): boolean {
    for (let dy = -gap; dy <= gap; dy++)
      for (let dx = -gap; dx <= gap; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) return false;
        if (this.taken.has(this.k(xx, yy))) return false;
      }
    return true;
  }
  /** Find a free spot in rect; tries `tries` random cells then falls back to a scan. Reserves it. */
  place(st: Stream, r: Rect, gap = 1): [number, number] | null {
    for (let i = 0; i < 60; i++) {
      const x = st.range(r[0], r[2]);
      const y = st.range(r[1], r[3]);
      if (this.free(x, y, gap)) {
        this.block(x, y);
        return [x, y];
      }
    }
    for (let g = gap; g >= 0; g--)
      for (let y = r[1]; y <= r[3]; y++)
        for (let x = r[0]; x <= r[2]; x++)
          if (this.free(x, y, g)) {
            this.block(x, y);
            return [x, y];
          }
    return null;
  }
}

/** Which role template fills a cast slot, with the data needed to build a VillagerDef. */
export interface Slot {
  key: string;
  role: string;
  archetype: string;
  faction: string;
  cluster: string;
  /** landmark id the person works at (resolved by the biome) */
  work: string;
  /** home landmark id */
  home: string;
  trust: [number, number];
  want: string;
  household?: string;
  /** shares surname with this slot key */
  kinOf?: string;
  traits?: Partial<Traits>;
  child?: boolean;
}

/** Build villager defs with unique names; households share a surname. */
export function castVillagers(st: Stream, slots: Slot[]): VillagerDef[] {
  const firsts = st.shuffle(FIRST_NAMES);
  const lasts = st.shuffle(SURNAMES);
  const surnameOf = new Map<string, string>();
  let fi = 0;
  let li = 0;
  const out: VillagerDef[] = [];
  for (const s of slots) {
    const hh = s.household ?? s.key;
    if (!surnameOf.has(hh)) surnameOf.set(hh, lasts[li++ % lasts.length]);
    const first = firsts[fi++ % firsts.length];
    const sur = surnameOf.get(hh)!;
    out.push({
      id: s.key, name: `${first} ${sur}`, role: s.role, archetype: s.archetype, faction: s.faction, household: hh,
      home: s.home, work: s.work, trust: st.range(s.trust[0], s.trust[1]), want: s.want, traits: s.traits,
    });
  }
  return out;
}

export interface GraphOptions {
  /** probability of a tie between two people of the same cluster */
  density: number;
  /** keys allowed to link clusters */
  connectors: string[];
  /** if true, only the first connector links the clusters strongly; others are thin */
  bottleneck: boolean;
}

/**
 * Sparse social graph: households are cliques, each cluster is a connected random graph, and clusters are joined only
 * through named connectors. With `bottleneck` the first connector is the single strong cross-cluster tie holder.
 */
export function buildGraph(st: Stream, v: VillagerDef[], slots: Slot[], clusters: string[], opt: GraphOptions): EdgeDef[] {
  const edges: EdgeDef[] = [];
  const seen = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const add = (ed: EdgeDef) => {
    const k = key(ed.a, ed.b);
    if (ed.a === ed.b || seen.has(k)) return;
    seen.add(k);
    edges.push(ed);
  };
  const by = new Map(slots.map((s) => [s.key, s]));
  // households
  const households = new Map<string, string[]>();
  for (const s of slots) {
    const h = s.household ?? s.key;
    households.set(h, [...(households.get(h) ?? []), s.key]);
  }
  for (const members of households.values())
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) add(e(members[i], members[j], st.range(86, 94), st.range(86, 94), 0.95, 'household'));
  // clusters: spanning chain over a shuffled order guarantees connectivity, then extra random ties
  for (const c of clusters) {
    const members = st.shuffle(slots.filter((s) => s.cluster === c).map((s) => s.key));
    for (let i = 1; i < members.length; i++) {
      const a = members[i];
      const b = members[st.int(i)];
      add(e(a, b, st.range(42, 70), st.range(42, 70), 0.3 + st.next() * 0.35, st.pick(['friend', 'neighbor', 'work', 'faction'] as const)));
    }
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++)
        if (st.chance(opt.density)) add(e(members[i], members[j], st.range(35, 68), st.range(35, 68), 0.25 + st.next() * 0.35, st.pick(['friend', 'neighbor', 'work', 'faction'] as const)));
  }
  // rivalries between skeptics and storytellers inside a cluster raise the drama without being the whole story
  const skeptics = slots.filter((s) => ['rival', 'scholar'].includes(s.archetype));
  const preachers = slots.filter((s) => s.archetype === 'preacher');
  for (const sk of skeptics.slice(0, 2)) for (const pr of preachers.slice(0, 1)) add(e(sk.key, pr.key, st.range(-45, -20), st.range(-40, -20), 0.35, 'rival'));
  // cross-cluster connectors
  const conns = opt.connectors.filter((k) => by.has(k));
  const other = (k: string) => {
    const mine = by.get(k)!.cluster;
    const pool = slots.filter((s) => s.cluster !== mine && !opt.connectors.includes(s.key));
    return pool.length ? st.pick(pool) : null;
  };
  conns.forEach((k, i) => {
    const strong = !opt.bottleneck || i === 0;
    const reach = strong ? 2 : 1;
    for (let r = 0; r < reach; r++) {
      const t = other(k);
      if (t) add(e(k, t.key, strong ? st.range(48, 66) : st.range(28, 40), strong ? st.range(48, 66) : st.range(28, 40), strong ? 0.4 + st.next() * 0.2 : 0.2, 'trade'));
    }
  });
  // connectors of different clusters tie to each other so the network is one component when not bottlenecked
  for (let i = 0; i < conns.length; i++)
    for (let j = i + 1; j < conns.length; j++)
      if (by.get(conns[i])!.cluster !== by.get(conns[j])!.cluster && (!opt.bottleneck || i === 0)) add(e(conns[i], conns[j], st.range(50, 66), st.range(50, 66), 0.45, 'trade'));
  void v;
  return edges;
}

/** Union-find connectivity over living ties. */
export function componentsOf(ids: string[], edges: { a: string; b: string }[]): string[][] {
  const parent = new Map(ids.map((i) => [i, i]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  for (const ed of edges) if (parent.has(ed.a) && parent.has(ed.b)) parent.set(find(ed.a), find(ed.b));
  const groups = new Map<string, string[]>();
  for (const i of ids) {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  }
  return [...groups.values()];
}

export function mkFaction(id: string, name: string, kind: Faction['kind'], leader: string, color: string, priorities: string, trust: number, budget: number): Faction {
  return { id, name, kind, leader, color, priorities, trustInKeeper: trust, budget, cooldownUntil: 0, grievance: 0 };
}

export const FACTION_COLORS = { council: '#d4a72c', scholars: '#5fa8d3', storykeepers: '#e07a5f', hearth: '#81b29a', hunters: '#c97a4a' };

export function homeDef(id: string, name: string, x: number, y: number): LandmarkDef {
  return { id, kind: 'home', name, x, y };
}
