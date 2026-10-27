import { Stream } from '../core/rng.ts';
import type { ClaimDef, Faction, ScenarioRuntime, ThreatDay } from '../core/types.ts';
import { harvest } from '../content/scenarios/harvest.ts';
import type { ScenarioDef, VillagerDef } from '../content/types.ts';
import type { LandmarkDef, MapDef, MapOp } from '../world/build.ts';
import { Placer, buildGraph, castVillagers, fieldTiles, mkFaction, FACTION_COLORS, villageName, type Slot } from './kit.ts';
import { clone, type Blueprint } from './blueprint.ts';

/**
 * Biome 2: a dry valley. Fields must ripen before the last day; a grain trader will only open a caravan once she firmly
 * believes; the rival miller is ready to bury the road. Variation: field count and thirst, the creek and hillside positions,
 * which villagers the Keeper can reach, how many days the dry spell lasts and where the trader sits in the social graph.
 */
export function genDrought(seed: number, id: string): { def: ScenarioDef; bp: Blueprint } {
  const st = new Stream(seed, 'drought');
  const village = villageName(st);
  const W = st.pick([24, 26, 26]);
  const H = st.pick([15, 16, 16]);
  const cx = st.range(9, 12);
  const hx = st.range(W - 9, W - 7);
  const ry = st.range(6, H - 8);
  const D = st.pick([8, 9, 9, 10]);
  const placer = new Placer(W, H);
  placer.blockRect([cx, 0, cx + 1, H - 1]);
  placer.blockRect([0, ry, W - 1, ry]);
  const ops: MapOp[] = [
    { op: 'grad', rect: [0, 0, W - 1, H - 1], axis: 'x', from: 2, to: 5 },
    { op: 'terrain', rect: [cx, 0, cx + 1, H - 1], t: 'SAND' },
    { op: 'terrain', rect: [hx, 0, W - 1, H - 1], t: 'HILL' },
    { op: 'terrain', rect: [0, H - 3, 5, H - 1], t: 'FOREST' },
    { op: 'terrain', rect: [W - 6, H - 5, W - 1, H - 1], t: 'FOREST' },
    { op: 'terrain', rect: [5, ry, W - 1, ry], t: 'ROAD' },
  ];
  const L: LandmarkDef[] = [];
  const spot = (r: [number, number, number, number], gap = 1): [number, number] => placer.place(st, r, gap) ?? [r[0], r[1]];
  const townR: [number, number, number, number] = [3, 2, cx - 2, H - 3];
  const farmR: [number, number, number, number] = [cx + 3, 2, hx - 2, H - 3];

  // ---- fields: start parched. Growth/moisture decide how long they need.
  const thirst = st.pick([0, 0, 1]); // 1 = the whole valley starts a little drier
  const fieldNames = ['Terrace Wheat', 'South Terrace', 'Ford Barley', 'Eastside Rye', 'Creek Oats'];
  const fields: { id: string; x0: number; y0: number; g: number; m: number }[] = [];
  const nFields = st.range(4, 5);
  for (let i = 0; i < nFields; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const left = i % 2 === 0;
      const x0 = left ? st.range(1, Math.max(1, cx - 5)) : st.range(cx + 3, Math.max(cx + 3, hx - 5));
      const y0 = st.range(0, H - 3);
      const r: [number, number, number, number] = [x0, y0, x0 + 2, y0 + 2];
      if (r[3] >= H - 1 || r[2] >= W - 1) continue;
      let ok = true;
      for (let yy = r[1] - 1; yy <= r[3] + 1 && ok; yy++) for (let xx = r[0] - 1; xx <= r[2] + 1; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H && !placer.free(xx, yy, 0)) ok = false;
      if (!ok) continue;
      placer.blockRect(r);
      ops.push({ op: 'terrain', rect: r, t: 'FIELD' });
      fields.push({ id: `f_${i + 1}`, x0, y0, g: st.range(26, 42) - thirst * 6, m: st.range(20, 34) - thirst * 8 });
      break;
    }
  }
  for (const [i, f] of fields.entries())
    L.push({ id: f.id, kind: 'field', name: fieldNames[i], x: f.x0 + 1, y: f.y0 + 1, tiles: fieldTiles(f.x0, f.y0, 3, 3), data: { yield: 7, growth: f.g, moisture: f.m } });

  // ---- civic
  const granP = spot([4, 1, cx - 2, 5]);
  const hallP = spot([3, 2, cx - 3, 6]);
  const chapelP = spot([cx - 2, 2, cx + 6, 6]);
  const bellP = spot([chapelP[0] - 1, chapelP[1] - 2, chapelP[0] + 2, chapelP[1] - 1], 0);
  const marketP = spot([cx - 2, ry + 1, cx + 3, ry + 3]);
  const wellP = spot([5, ry + 1, cx - 2, ry + 3]);
  const millP = spot([hx - 4, ry + 2, hx - 1, ry + 5]);
  L.push({ id: 'granary', kind: 'granary', name: 'Valley Granary', x: granP[0], y: granP[1] });
  L.push({ id: 'hall', kind: 'hall', name: 'Reeve Hall', x: hallP[0], y: hallP[1] });
  L.push({ id: 'chapel', kind: 'chapel', name: 'Chapel Green', x: chapelP[0], y: chapelP[1] });
  L.push({ id: 'bell', kind: 'belltower', name: 'Bell Tower', x: bellP[0], y: bellP[1] });
  L.push({ id: 'market', kind: 'market', name: `${village} Market`, x: marketP[0], y: marketP[1] });
  L.push({ id: 'well', kind: 'well', name: 'The Old Well', x: wellP[0], y: wellP[1] });
  L.push({ id: 'mill', kind: 'mill', name: 'The Mill', x: millP[0], y: millP[1] });
  const roadTiles: [number, number][] = [];
  for (let x = hx; x < W; x++) roadTiles.push([x, ry]);
  L.push({ id: 'road', kind: 'road', name: 'Hillside Road', x: Math.min(W - 2, hx + 3), y: ry, tiles: roadTiles, data: { blockedUntil: -1 } });
  const cabinP = spot([hx + 1, 1, W - 3, Math.max(2, ry - 3)]);
  L.push({ id: 'cabin', kind: 'cabin', name: "Shepherd's Hut", x: cabinP[0], y: cabinP[1] });

  const homesAdded: string[] = [];
  const addHome = (idv: string, name: string, r: [number, number, number, number]) => {
    const p = spot(r);
    L.push({ id: idv, kind: 'home', name, x: p[0], y: p[1] });
    homesAdded.push(idv);
    return idv;
  };
  const wf = fields.map((f) => f.id);
  const fieldAt = (i: number) => wf[i % Math.max(1, wf.length)] ?? 'chapel';

  const slots: Slot[] = [];
  const S = (s: Slot) => slots.push(s);
  S({ key: 'reeve', role: 'Reeve', archetype: 'reeve', faction: 'council', cluster: 't', work: 'granary', home: addHome('h_reeve', "Reeve's House", townR), trust: [24, 34], want: 'Wants an honest tally and nobody hungry before the audit.' });
  S({ key: 'trader', role: 'Grain trader', archetype: 'trader', faction: 'council', cluster: 't', work: 'market', home: addHome('h_trader', 'Counting-house', townR), trust: [26, 36], want: 'Their caravans can feed the valley. They will not risk them on a lost cause.', traits: { skepticism: 62, susceptibility: 38 } });
  S({ key: 'miller', role: 'Miller', archetype: 'rival', faction: 'millers', cluster: 't', work: 'mill', home: addHome('h_miller', 'Mill House', [hx - 5, ry + 2, hx - 1, ry + 5]), trust: [8, 16], want: 'Swears moon-work sours the grain, and has the ledgers to prove it.' });
  S({ key: 'healer', role: 'Healer', archetype: 'scholar', faction: 'millers', cluster: 't', work: 'h_healer', home: addHome('h_healer', "Healer's House", townR), trust: [26, 36], want: 'Will believe a field they have measured themselves, and nothing less.' });
  S({ key: 'ringer', role: 'Bell-keeper', archetype: 'ringer', faction: 'storykeepers', cluster: 't', work: 'bell', home: addHome('h_ringer', 'Bell Lodge', [cx - 2, 2, cx + 6, 6]), trust: [55, 66], want: 'The bells called rain once, in his grandfather’s day. He rings them every dawn.' });
  S({ key: 'preacher', role: 'Storyteller', archetype: 'preacher', faction: 'storykeepers', cluster: 't', work: 'chapel', home: addHome('h_story', "Storyteller's Cottage", [cx - 2, 2, cx + 6, 7]), trust: [62, 74], want: 'Tells the old harvest tales at the chapel. People listen when they do.' });
  S({ key: 'warden', role: 'Well-warden', archetype: 'keeper', faction: 'council', cluster: 't', work: 'well', home: addHome('h_warden', "Well-warden's House", [5, ry + 1, cx - 2, ry + 4]), trust: [40, 48], want: 'Measures the well each dawn. Tells nobody how low it is.' });
  S({ key: 'farmer', role: 'Farmer', archetype: 'farmer', faction: 'growers', cluster: 'f', work: fieldAt(0), home: addHome('h_farm', 'Farmhouse', farmR), trust: [36, 44], want: 'Will not watch the wheat die. Owes the granary two sacks.' });
  S({ key: 'parent', role: 'Mother', archetype: 'parent', faction: 'growers', cluster: 'f', work: fieldAt(1), home: 'h_farm', trust: [46, 54], want: 'Would try any rite if it fed the little one.', household: 'farmer' });
  S({ key: 'fchild', role: 'Child', archetype: 'child', faction: 'growers', cluster: 'f', work: 'well', home: 'h_farm', trust: [54, 62], want: 'Counts the days since the last rain.', household: 'farmer' });
  S({ key: 'hand', role: 'Farmhand', archetype: 'witness_truster', faction: 'growers', cluster: 'f', work: fieldAt(2), home: 'h_farm', trust: [48, 56], want: 'Believes what he sees. Sleeps in the barn.', household: 'farmer' });
  S({ key: 'elder', role: 'Elder', archetype: 'elder', faction: 'storykeepers', cluster: 'f', work: fieldAt(0), home: addHome('h_elder', "Elder's House", farmR), trust: [30, 38], want: 'Remembers the rain songs. Trusts them more than the Reeve’s ledger.' });
  S({ key: 'orphan', role: 'Orphan', archetype: 'child', faction: 'storykeepers', cluster: 'f', work: 'well', home: 'h_elder', trust: [58, 66], want: 'Follows the elder everywhere and repeats whatever they say.', household: 'elder' });
  S({ key: 'shepherd', role: 'Shepherd', archetype: 'hermit', faction: 'growers', cluster: 'f', work: 'cabin', home: 'cabin', trust: [26, 34], want: 'Lives on the hillside. Sees the weather first, and tells only the elder.' });
  const extras: Slot[] = [
    { key: 'tinker', role: 'Tinker', archetype: 'trader', faction: 'storykeepers', cluster: 'f', work: 'market', home: addHome('h_tinker', "Tinker's Wagon", farmR), trust: [40, 52], want: 'Carries news from fire to fire, and a few embellishments.' },
    { key: 'weaver', role: 'Weaver', archetype: 'farmer', faction: 'growers', cluster: 't', work: 'market', home: addHome('h_weaver', "Weaver's Cottage", townR), trust: [38, 48], want: 'Trusts what has worked before. Sells cloth up and down the road.' },
  ];
  for (let i = 0; i < st.range(0, 2); i++) S(extras[i]);

  const villagers: VillagerDef[] = castVillagers(st, slots);
  const bottleneck = st.chance(0.5);
  const edges = buildGraph(st, villagers, slots, ['t', 'f'], { density: 0.2, connectors: ['trader', 'preacher', 'elder', 'warden'], bottleneck });
  const factions: Faction[] = [
    mkFaction('council', `${village} Council`, 'council', 'reeve', FACTION_COLORS.council, 'An honest tally and fair rations.', 30, 2),
    mkFaction('millers', "Millers' Guild", 'scholars', 'miller', FACTION_COLORS.scholars, 'Measure first. Believe later.', 15, 3),
    mkFaction('storykeepers', 'Song-keepers', 'storykeepers', 'preacher', FACTION_COLORS.storykeepers, 'The old songs knew the rain.', 62, 2),
    mkFaction('growers', 'Terrace Growers', 'hearth', 'farmer', FACTION_COLORS.hearth, 'Bring the crop in.', 40, 2),
  ];

  // ---- claims
  const hv = harvest.runtime;
  const claimDefs: ClaimDef[] = clone(hv.claimDefs);
  const starters = ['moonlight_ripens_grain', 'rain_follows_bells'];
  const rituals = clone(hv.rituals);
  const deal = clone(hv.deals![0]);
  deal.broker = 'trader';
  deal.label = 'Ask the grain trader to send for a caravan';
  deal.minConviction = st.range(54, 62);
  deal.food = st.range(8, 11);
  deal.desc = `The trader sends ${deal.food} food in 2 days if the Hillside Road is clear. Up to 2 shipments, and only once they firmly believe.`;

  // ---- threat
  const threat: ThreatDay[] = [];
  const stormDay = D - 2;
  for (let i = 0; i < D; i++) {
    const rain = i === stormDay ? 2 : i === 3 || i === Math.floor(D / 2) + 1 ? 1 : 0;
    const level = 3 + (i % 3 === 2 ? 1 : 0);
    const heat = i % 3 === 1 ? 1 : 2;
    threat.push({
      day: i + 1, level, rain, wind: 1, heat, pack: 0,
      trend: rain > 0 ? 'ebbing' : i % 3 === 2 ? 'rising' : 'steady',
      label: i === D - 1 ? 'Harvest day' : i === stormDay ? 'A storm gathers over the hills' : rain ? 'A tease of rain from the north' : heat >= 2 ? 'Cracked earth under a clear sky' : 'Dust devils on the terraces',
      warning: i === 1 ? 'The well-warden: "Nine days of water at this rate. Eleven if nobody washes."' : i === 4 ? 'The trader: "My caravans will not come unless they see the valley is worth saving."' : i === stormDay ? 'The elder: "The song says: ring when the sky leans."' : i === D - 2 + 1 ? 'The reeve: "Whatever stands tomorrow night is all we have."' : undefined,
    });
  }

  const n = villagers.length;
  const runtime: ScenarioRuntime = {
    id,
    version: 1,
    name: `Drought at ${village}`,
    tagline: `${D} dry days. ${n} mouths. ${fields.length} parched fields and a trader who wants proof.`,
    briefing: [
      `The valley of ${village} has had no rain for six weeks. The granary will not last the month.`,
      'Two old stories might feed it: that moonlight ripens grain, and that rain answers the bells. Each has a price.',
      'The grain trader could save everyone with a caravan, but wants proof the valley is worth saving.',
    ],
    durationDays: D,
    threatKind: 'drought',
    claimDefs,
    rituals,
    threat,
    objectives: [
      { id: 'survivors', label: `At least ${n - 2} of ${n} villagers alive`, metric: 'alive', op: '>=', value: n - 2, required: true },
      { id: 'collapse', label: `Never fewer than ${Math.ceil(n * 0.64)} alive`, metric: 'alive', op: '>=', value: Math.ceil(n * 0.64), required: false, instantLoss: true },
      { id: 'fed', label: `At least ${n - 2} villagers not hungry`, metric: 'fed', op: '>=', value: n - 2, required: true },
      { id: 'food', label: 'At least 3 food left in the granary', metric: 'food', op: '>=', value: 3, required: true },
      { id: 'heroic', label: 'Heroic: everyone alive', metric: 'alive', op: '>=', value: n, required: false, heroic: true },
    ],
    rivals: [{ factionId: 'millers', claim: 'moon_sours_grain', watches: 'moonlight_ripens_grain', trigger: 0.3, telegraph: 1, budget: st.range(2, 3), cooldown: 2, leader: 'miller', sabotage: { deal: 'caravan', delay: 2 } }],
    beats: clone(hv.beats),
    features: { crops: true, trade: true },
    consts: { growBase: 5, dryRate: 5 },
    score: { ...hv.score },
    difficulty: 3 + thirst,
    anchor: 'chapel',
    starters,
    finale: 'the long dry season',
    hints: hv.hints.slice(),
    deals: [deal],
    hud: ['alive', 'food', 'fed', 'fuel'],
  };
  const map: MapDef = {
    w: W, h: H, ops,
    regions: [
      { id: 'valley', name: 'The Valley', rects: [[0, 0, hx - 1, H - 1]] },
      { id: 'hillside', name: 'The Hillside', rects: [[hx, 0, W - 1, H - 1]] },
    ],
    stocks: { food: st.range(22, 27), fuel: st.range(3, 5) },
    landmarks: L,
  };
  const def: ScenarioDef = { runtime, map, villagers, edges, factions, ap: { start: 3, perDay: 3, max: 5 }, jitter: new Array<number>(D).fill(0) };
  const bp: Blueprint = {
    biome: 'drought', village, size: [W, H], population: n, days: D, bottleneck, starters: starters.slice(), rival: 'moon_sours_grain', modifiers: [],
    claims: claimDefs.map((c) => c.id), extras: { fields: fields.length, thirst, stormDay },
  };
  return { def, bp };
}
