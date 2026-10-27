import { Stream } from '../core/rng.ts';
import type { ClaimDef, Faction, ScenarioRuntime, ThreatDay } from '../core/types.ts';
import { ashwood } from '../content/scenarios/ashwood.ts';
import type { ScenarioDef, VillagerDef } from '../content/types.ts';
import type { LandmarkDef, MapDef, MapOp, Rect } from '../world/build.ts';
import { Placer, buildGraph, castVillagers, mkFaction, FACTION_COLORS, villageName, type Slot } from './kit.ts';
import { clone, type Blueprint } from './blueprint.ts';

/**
 * Biome 3: a wood of distrustful hamlets under wolf pressure. Pens must survive the packs; smoke protects and sickens.
 * Variation: where the wild lies (east or west), the hamlet layout and which hamlet holds the market, how many packs and
 * animals, who walks between hamlets, and the pace of the hunt.
 */
export function genWolves(seed: number, id: string): { def: ScenarioDef; bp: Blueprint } {
  const st = new Stream(seed, 'wolves');
  const village = villageName(st);
  const W = 30;
  const H = st.pick([17, 18, 18]);
  const flip = st.chance(0.5);
  const X = (x: number) => (flip ? W - 1 - x : x);
  const R = (r: Rect): Rect => (flip ? [W - 1 - r[2], r[1], W - 1 - r[0], r[3]] : r);
  const wx = st.range(19, 22);
  const D = st.pick([8, 8, 9]);
  const maxPack = st.pick([2, 3, 3]);
  const placer = new Placer(W, H);
  const ops: MapOp[] = [
    { op: 'terrain', rect: [0, 0, W - 1, H - 1], t: 'FOREST' },
    { op: 'elev', rect: [0, 0, W - 1, H - 1], v: 3 },
  ];
  const L: LandmarkDef[] = [];
  const clearing = (r: Rect, t: 'GRASS' = 'GRASS') => {
    const q = R(r);
    ops.push({ op: 'terrain', rect: q, t });
    return q;
  };
  // hamlet zones in "unflipped" coordinates; the wild is x >= wx
  const zones: { key: string; region: string; box: Rect }[] = [
    { key: 'A', region: 'north', box: [3, 2, 9, 7] },
    { key: 'B', region: 'mill', box: [12, 6, 18, 11] },
    { key: 'C', region: 'ash', box: [4, 12, 10, 16] },
  ];
  for (const z of zones) {
    const jx = st.range(-1, 1);
    const jy = st.range(-1, 1);
    z.box = [z.box[0] + jx, Math.max(1, z.box[1] + jy), z.box[2] + jx, Math.min(H - 2, z.box[3] + jy)];
    clearing(z.box);
  }
  const wildTiles = [R([wx + 1, 7, wx + 3, 9]), R([wx + 1, 12, wx + 3, 14])];
  for (const w of wildTiles) clearing(w);
  const pathRoad = (a: [number, number], b: [number, number]) => {
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    ops.push({ op: 'terrain', rect: R([x0, a[1], x1, a[1]]), t: 'ROAD' });
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    ops.push({ op: 'terrain', rect: R([b[0], y0, b[0], y1]), t: 'ROAD' });
  };
  const center = (z: { box: Rect }): [number, number] => [Math.floor((z.box[0] + z.box[2]) / 2), Math.floor((z.box[1] + z.box[3]) / 2)];
  pathRoad(center(zones[0]), center(zones[1]));
  pathRoad(center(zones[1]), center(zones[2]));

  // civic buildings are shuffled over the hamlets
  const civicKinds = st.shuffle<'hall' | 'chapel' | 'market'>(['hall', 'chapel', 'market']);
  const civicName = { hall: 'Watch Post', chapel: 'The Green', market: 'The Stalls' } as const;
  const civicId: Record<string, string> = {};
  const penStock = zones.map(() => st.range(4, 6));
  const penId: Record<string, string> = {};
  const fireIds: Record<string, string[]> = {};
  const hamletName: Record<string, string> = { A: `${village} North`, B: `${village} Mill`, C: `${village} Ashfold` };
  zones.forEach((z, zi) => {
    const box = z.box;
    const bx0 = X(box[0]);
    void bx0;
    const u = (r: Rect): Rect => r;
    const cxy = center(z);
    const civ = civicKinds[zi];
    civicId[z.key] = `civic_${z.key}`;
    const cp = placer.place(st, u([cxy[0] - 1, cxy[1] - 1, cxy[0] + 1, cxy[1] + 1]), 0) ?? cxy;
    L.push({ id: civicId[z.key], kind: civ, name: `${hamletName[z.key]} ${civicName[civ]}`, x: X(cp[0]), y: cp[1] });
    placer.block(cp[0], cp[1]);
    // pen near the center
    const pp = placer.place(st, [cxy[0] - 2, cxy[1] - 2, cxy[0] + 2, cxy[1] + 2], 1) ?? [cxy[0] + 2, cxy[1]];
    penId[z.key] = `pen_${z.key}`;
    L.push({ id: penId[z.key], kind: 'pen', name: `${hamletName[z.key]} Pens`, x: X(pp[0]), y: pp[1], data: { stock: penStock[zi], stockMax: penStock[zi] } });
    // two fires: a hearth tucked beside the pen and a watchfire a little farther out
    const f1 = placer.place(st, [pp[0] - 2, pp[1] - 1, pp[0] + 2, pp[1] + 1], 0) ?? [pp[0] + 1, pp[1] + 1];
    const f2 = placer.place(st, [pp[0] - 3, pp[1] - 3, pp[0] + 3, pp[1] + 3], 0) ?? [pp[0] - 2, pp[1] - 2];
    fireIds[z.key] = [`c_${z.key}1`, `c_${z.key}2`];
    L.push({ id: fireIds[z.key][0], kind: 'campfire', name: `${hamletName[z.key]} Hearth`, x: X(f1[0]), y: f1[1] });
    L.push({ id: fireIds[z.key][1], kind: 'campfire', name: `${hamletName[z.key]} Watchfire`, x: X(f2[0]), y: f2[1] });
  });
  // decoy fires deep in the wood
  const decoys: [number, number][] = [
    [wx + 2, st.range(7, 9)],
    [wx + 2, st.range(12, 14)],
  ];
  decoys.forEach((p, i) => L.push({ id: `c_d${i + 1}`, kind: 'campfire', name: i === 0 ? 'Old Clearing Fire' : 'Stone Ring Fire', x: X(p[0]), y: p[1] }));

  // homes per hamlet (unflipped coordinates -> placed then mirrored)
  const homeIn = (zk: string, idv: string, name: string) => {
    const z = zones.find((q) => q.key === zk)!;
    const p = placer.place(st, [z.box[0], z.box[1], z.box[2], z.box[3]], 1) ?? [z.box[0], z.box[1]];
    L.push({ id: idv, kind: 'home', name, x: X(p[0]), y: p[1] });
    return idv;
  };

  const slots: Slot[] = [];
  const S = (s: Slot) => slots.push(s);
  // hamlet A
  S({ key: 'warden', role: 'Warden', archetype: 'reeve', faction: 'wardens', cluster: 'A', work: civicId.A, home: homeIn('A', 'h_warden', "Warden's Lodge"), trust: [30, 38], want: 'Has sworn that no beast takes an animal on their watch. Cannot afford to be wrong twice.' });
  S({ key: 'herdA', role: 'Herder', archetype: 'parent', faction: 'herders', cluster: 'A', work: penId.A, home: homeIn('A', 'h_herdA', "Herder's Croft"), trust: [42, 50], want: 'The herd is the children’s future. The little one sleeps beside the pens.' });
  S({ key: 'kidA', role: 'Child', archetype: 'child', faction: 'herders', cluster: 'A', work: penId.A, home: 'h_herdA', trust: [52, 60], want: 'Names every animal in the pens. Heard the howling first.', household: 'herdA' });
  S({ key: 'cutter', role: 'Woodcutter', archetype: 'farmer', faction: 'wardens', cluster: 'A', work: 'h_cutter', home: homeIn('A', 'h_cutter', "Woodcutter's Hut"), trust: [34, 42], traits: { stubbornness: 70 }, want: 'Cuts the fuel everyone burns. Proud, and hunts on the quiet nights.' });
  // hamlet B
  S({ key: 'miller', role: 'Miller', archetype: 'farmer', faction: 'millers', cluster: 'B', work: 'h_miller', home: homeIn('B', 'h_miller', 'Mill House'), trust: [32, 40], want: 'Needs the mill-race clear of fog and the roads open to the other hamlets.' });
  S({ key: 'healer', role: 'Healer', archetype: 'scholar', faction: 'millers', cluster: 'B', work: civicId.B, home: homeIn('B', 'h_healer', "Healer's Cottage"), trust: [26, 34], want: 'Counts every cough. Will say the smoke is poison if they hear it often enough.' });
  S({ key: 'hunter', role: 'Hunter', archetype: 'rival', faction: 'hunters', cluster: 'B', work: 'h_hunter', home: homeIn('B', 'h_hunter', "Hunter's Lodge"), trust: [14, 22], want: 'Swears the wolves track smoke like hounds. Has lost three dogs proving it.' });
  S({ key: 'elder', role: 'Elder', archetype: 'elder', faction: 'millers', cluster: 'B', work: civicId.B, home: homeIn('B', 'h_elder', "Elder's House"), trust: [28, 36], want: 'Remembers the winter the wolves took a child. Does not forget, and does not forgive the Warden.' });
  S({ key: 'grandchild', role: 'Child', archetype: 'child', faction: 'millers', cluster: 'B', work: civicId.B, home: 'h_elder', trust: [56, 64], want: 'The elder’s grandchild. Repeats everything heard at the green.', household: 'elder' });
  // hamlet C
  S({ key: 'trader', role: 'Trader', archetype: 'trader', faction: 'travellers', cluster: 'C', work: civicId.C, home: homeIn('C', 'h_trader', "Trader's Wagon-house"), trust: [38, 46], want: 'Walks the forest paths between all three hamlets. Needs the roads open.' });
  S({ key: 'herdC', role: 'Herder', archetype: 'farmer', faction: 'herders', cluster: 'C', work: penId.C, home: homeIn('C', 'h_herdC', "Herder's Croft"), trust: [40, 48], want: 'A few animals left. Sleeps with an axe by the gate.' });
  S({ key: 'shepherd', role: 'Shepherd', archetype: 'hermit', faction: 'herders', cluster: 'C', work: 'h_shep', home: homeIn('C', 'h_shep', "Shepherd's Hut"), trust: [28, 34], want: 'Lives on the edge of the hamlet, closest to the wolves. Trusts only the herder.' });
  S({ key: 'singer', role: 'Storyteller', archetype: 'preacher', faction: 'travellers', cluster: 'C', work: civicId.C, home: homeIn('C', 'h_singer', "Singer's House"), trust: [60, 70], want: 'Sings the hamlets’ news from fire to fire. People believe a song before a warning.' });
  if (st.chance(0.5)) S({ key: 'herdB', role: 'Herder', archetype: 'witness_truster', faction: 'herders', cluster: 'B', work: penId.B, home: homeIn('B', 'h_herdB', "Herder's Hut"), trust: [44, 54], want: 'Believes what he sees. Counts the sheep twice every night.' });
  S({ key: 'cutter2', role: 'Woodcutter', archetype: 'witness_truster', faction: 'travellers', cluster: 'C', work: 'h_cutter2', home: homeIn('C', 'h_cutter2', "Woodcutter's Lean-to"), trust: [42, 52], want: 'Splits the logs that keep the hearths burning. Reads tracks too, and tells it plainly.' });
  if (st.chance(0.5)) S({ key: 'tracker', role: 'Tracker', archetype: 'witness_truster', faction: 'travellers', cluster: 'A', work: penId.A, home: homeIn('A', 'h_tracker', "Tracker's Lean-to"), trust: [42, 52], want: 'Reads tracks and tells it plainly. Nobody quite believes the numbers.' });

  const villagers: VillagerDef[] = castVillagers(st, slots);
  const bottleneck = st.chance(0.5);
  const edges = buildGraph(st, villagers, slots, ['A', 'B', 'C'], { density: 0.28, connectors: ['trader', 'hunter', 'healer', 'singer'], bottleneck });

  const factions: Faction[] = [
    mkFaction('wardens', `${hamletName.A} Wardens`, 'council', 'warden', FACTION_COLORS.council, 'Keep the pens. Keep the oath.', 30, 2),
    mkFaction('millers', `${village} Mill Folk`, 'scholars', 'healer', FACTION_COLORS.scholars, 'Keep the roads open and the lungs clear.', 30, 2),
    mkFaction('travellers', 'Travellers', 'storykeepers', 'singer', FACTION_COLORS.storykeepers, 'Carry the news between fires.', 58, 2),
    mkFaction('herders', 'Herders', 'hearth', 'herdA', FACTION_COLORS.hearth, 'Keep the animals alive.', 44, 2),
    mkFaction('hunters', 'Hunters', 'scholars', 'hunter', FACTION_COLORS.hunters, 'Wolves are hunted, not feared.', 18, 3),
  ];

  const aw = ashwood.runtime;
  const claimDefs: ClaimDef[] = clone(aw.claimDefs);
  const regions3 = ['north', 'mill', 'ash'];
  for (const c of claimDefs) if (c.id === 'wolves_follow_smoke') c.electorate = { wild: regions3 };
  const rituals = clone(aw.rituals);
  const starters = ['wolves_fear_smoke', 'wolves_follow_smoke'];

  // ---- threat
  const packs: number[] = [];
  for (let i = 0; i < D; i++) packs.push(i < 2 ? 0 : Math.min(maxPack, 1 + Math.floor((i - 2) / 2)));
  packs[D - 1] = Math.max(1, maxPack - 1);
  if (maxPack >= 3 && D - 3 >= 3) packs[D - 3] = 3;
  const threat: ThreatDay[] = packs.map((pack, i) => {
    const prev = i === 0 ? pack : packs[i - 1];
    return {
      day: i + 1, level: 0, rain: 0, wind: 1, heat: 1, pack, trend: pack > prev ? 'rising' : pack < prev ? 'ebbing' : 'steady',
      label: i === 0 ? 'A hush in the mist' : pack > prev ? (pack >= 3 ? 'All three packs hunt' : 'A second pack answers') : pack < prev ? 'The packs tire' : i === D - 3 ? 'The worst night' : 'Fog thickens',
      warning: i === 1 ? 'The tracker: "Grey is on the move. One pack, three miles off, and it is hungry."' : i === 3 ? 'The woodcutter: "Black has joined the hunt. Two packs now."' : i === D - 1 ? 'The singer: "They are leaving. If we hold tonight, we hold the winter."' : undefined,
    };
  });

  const total = penStock.reduce((a, b) => a + b, 0);
  const n = villagers.length;
  const anchor = Object.entries(civicId).find(([k]) => civicKinds[zones.findIndex((z) => z.key === k)] === 'market')![1];
  const runtime: ScenarioRuntime = {
    id,
    version: 1,
    name: `Wolves of ${village}`,
    tagline: `${D} nights. Three hamlets. ${maxPack} packs. Smoke protects, smoke sickens, and a hunter has a theory.`,
    briefing: [
      `${village} is three hamlets in a mist-covered wood, and none of them trusts the others.`,
      'The packs are coming, one by one. A hamlet that believes the wolves fear smoke can keep them off — but smoke sickens the people it protects.',
      'The hunter says wolves follow smoke. He might be a nuisance. Or he might be useful.',
    ],
    durationDays: D,
    threatKind: 'wolves',
    claimDefs,
    rituals,
    threat,
    objectives: [
      { id: 'livestock', label: `At least ${Math.ceil(total * 0.62)} of ${total} animals alive`, metric: 'livestock', op: '>=', value: Math.ceil(total * 0.62), required: true },
      { id: 'survivors', label: `At least ${n - 2} of ${n} villagers alive`, metric: 'alive', op: '>=', value: n - 2, required: true },
      { id: 'sick', label: 'No more than 3 people sick on the last day', metric: 'sick', op: '<=', value: 3, required: true },
      { id: 'collapse', label: `Never fewer than ${Math.ceil(n * 0.66)} alive`, metric: 'alive', op: '>=', value: Math.ceil(n * 0.66), required: false, instantLoss: true },
      { id: 'heroic', label: `Heroic: ${Math.ceil(total * 0.85)}+ animals alive`, metric: 'livestock', op: '>=', value: Math.ceil(total * 0.85), required: false, heroic: true },
    ],
    rivals: [{ factionId: 'hunters', claim: 'wolves_follow_smoke', watches: 'wolves_fear_smoke', trigger: 0.3, telegraph: 1, budget: 3, cooldown: 2, leader: 'hunter' }],
    beats: clone(aw.beats),
    features: { smoke: true, wolves: true },
    consts: { fuelPerDay: 2 },
    score: { ...aw.score },
    difficulty: 3,
    anchor,
    starters,
    finale: 'the wolf winter',
    hints: aw.hints.slice(),
    hud: ['alive', 'livestock', 'sick', 'fuel'],
  };
  const map: MapDef = {
    w: W, h: H, ops,
    regions: [
      { id: 'wild', name: 'The Deep Wood', rects: [R([wx, 0, W - 1, H - 1])] },
      { id: 'north', name: `${hamletName.A}`, rects: [R([0, 0, 11, 10])] },
      { id: 'mill', name: hamletName.B, rects: [R([12, 0, W - 1, 11])] },
      { id: 'ash', name: hamletName.C, rects: [R([0, 11, 11, H - 1]), R([12, 12, W - 1, H - 1])] },
    ],
    stocks: { food: st.range(40, 48), fuel: st.range(9, 12) },
    packs: [
      { id: 'Grey', x: X(wx + 1), y: st.range(4, 7), size: 2 },
      { id: 'Black', x: X(1), y: st.range(9, 11), size: 2 },
      { id: 'Red', x: X(wx + 2), y: H - 3, size: 2 },
    ].slice(0, 3),
    landmarks: L,
  };
  const def: ScenarioDef = { runtime, map, villagers, edges, factions, ap: { start: 3, perDay: 3, max: 5 }, jitter: new Array<number>(D).fill(0) };
  const bp: Blueprint = {
    biome: 'wolves', village, size: [W, H], population: n, days: D, bottleneck, starters: starters.slice(), rival: 'wolves_follow_smoke', modifiers: [],
    claims: claimDefs.map((c) => c.id), extras: { flip, maxPack, animals: total, wx },
  };
  return { def, bp };
}
