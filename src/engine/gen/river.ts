import { Stream } from '../core/rng.ts';
import type { ClaimDef, Faction, ScenarioRuntime, ThreatDay } from '../core/types.ts';
import { redbank } from '../content/scenarios/redbank.ts';
import type { ScenarioDef, VillagerDef } from '../content/types.ts';
import type { LandmarkDef, MapDef, MapOp } from '../world/build.ts';
import { Placer, buildGraph, castVillagers, fieldTiles, mkFaction, FACTION_COLORS, villageName, type Slot } from './kit.ts';
import { clone, type Blueprint } from './blueprint.ts';

/**
 * Biome 1: a river valley with a single bridge. The low bank floods, the high bank keeps the Keeper. Variation comes from the
 * river's position, the bridge, the height of the low bank, how many people live on each bank, which people tie the banks together,
 * the surge schedule and the claim pool.
 */
export function genRiver(seed: number, id: string): { def: ScenarioDef; bp: Blueprint } {
  const st = new Stream(seed, 'river');
  const village = villageName(st);
  const W = 28;
  const H = st.pick([16, 18, 18]);
  const rx = st.range(10, 13);
  const rw = 3;
  const by = st.range(5, H - 7);
  const eBase = st.pick([2, 2, 2, 3]);
  const surge = st.pick([5, 6, 6, 6]);
  const D = st.pick([7, 7, 8, 9]);
  const placer = new Placer(W, H);
  placer.blockRect([rx, 0, rx + rw - 1, H - 1]);
  const eLo = rx + rw;
  const ops: MapOp[] = [
    { op: 'grad', rect: [0, 0, rx - 1, H - 1], axis: 'x', from: 10, to: 4 },
    { op: 'terrain', rect: [rx, 0, rx + rw - 1, H - 1], t: 'RIVER' },
    { op: 'elev', rect: [rx, 0, rx + rw - 1, H - 1], v: 0 },
    { op: 'grad', rect: [eLo, 0, W - 1, H - 1], axis: 'x', from: eBase, to: eBase + 2 },
    { op: 'terrain', rect: [0, 0, 4, 6], t: 'HILL' },
    { op: 'terrain', rect: [W - 5, 1, W - 1, 5], t: 'HILL' },
    { op: 'terrain', rect: [0, H - 5, 6, H - 1], t: 'FOREST' },
    { op: 'terrain', rect: [W - 4, H - 5, W - 1, H - 1], t: 'FOREST' },
    { op: 'terrain', rect: [3, by, rx - 1, by], t: 'ROAD' },
    { op: 'terrain', rect: [eLo, by, eLo + 7, by], t: 'ROAD' },
  ];
  placer.blockRect([0, by, W - 1, by]);
  const knollX = st.range(W - 4, W - 3);
  const knollY = st.range(2, 4);
  ops.push({ op: 'bump', cx: knollX, cy: knollY, r: 2, h: 3 });

  const L: LandmarkDef[] = [];

  // ---- west bank civic buildings
  const spot = (r: [number, number, number, number], gap = 1): [number, number] => placer.place(st, r, gap) ?? [r[0], r[1]];
  const chapelP = spot([4, by + 1, rx - 5, Math.min(H - 3, by + 4)]);
  const bellP = spot([chapelP[0] - 1, chapelP[1] - 3, chapelP[0] + 2, chapelP[1] - 2], 0);
  const hallP = spot([4, Math.max(1, by - 4), rx - 4, by - 2]);
  const marketP = spot([Math.max(3, rx - 5), by + 1, rx - 2, by + 3]);
  const millP = spot([rx - 2, Math.max(1, by - 4), rx - 1, by - 2], 0);
  const shelterWP: [number, number] = [st.range(1, 3), st.range(2, 4)];
  placer.block(shelterWP[0], shelterWP[1]);
  L.push({ id: 'chapel', kind: 'chapel', name: 'Chapel Green', x: chapelP[0], y: chapelP[1] });
  L.push({ id: 'bell', kind: 'belltower', name: 'Chapel Bell Tower', x: bellP[0], y: bellP[1] });
  L.push({ id: 'hall', kind: 'hall', name: 'Reeve Hall', x: hallP[0], y: hallP[1] });
  L.push({ id: 'market', kind: 'market', name: `${village} Market`, x: marketP[0], y: marketP[1] });
  L.push({ id: 'mill', kind: 'mill', name: 'The Mill', x: millP[0], y: millP[1] });
  L.push({ id: 'shelter_w', kind: 'shelter', name: 'Hill Shelter', x: shelterWP[0], y: shelterWP[1], capacity: 16 });

  // ---- bridge
  const bridgeHp = st.pick([60, 70, 70, 80]);
  L.push({ id: 'br', kind: 'bridge', name: `${village} Bridge`, x: rx + 1, y: by, hp: bridgeHp, tiles: [[rx, by], [rx + 1, by], [rx + 2, by]], data: { watchers: 0 } });

  // ---- east bank: fields, beacons, green, knoll
  const eastFields: { id: string; name: string; x0: number; y0: number; w: number; h: number }[] = [];
  const fieldNames = ['North Wheat', 'Upland Barley', 'South Meadow', 'Long Rye', 'Reed Oats'];
  const nFields = st.range(3, 4);
  const fieldBands: [number, number][] = [[1, by - 4], [by + 2, H - 4]];
  for (let i = 0; i < nFields; i++) {
    const w = st.pick([3, 4]);
    const h = 3;
    const band = fieldBands[i % 2];
    const hi = Math.max(band[0], band[1]);
    const lo = Math.min(band[0], band[1]);
    for (let tries = 0; tries < 30; tries++) {
      const x0 = st.range(eLo + 1, W - 3 - w);
      const y0 = st.range(lo, Math.max(lo, hi - 1));
      const r: [number, number, number, number] = [x0, y0, x0 + w - 1, y0 + h - 1];
      if (r[3] >= H - 1) continue;
      let ok = true;
      for (let yy = r[1]; yy <= r[3] && ok; yy++) for (let xx = r[0]; xx <= r[2]; xx++) if (!placer.free(xx, yy, 0)) ok = false;
      if (!ok) continue;
      placer.blockRect(r);
      eastFields.push({ id: `f_e${i + 1}`, name: fieldNames[i], x0, y0, w, h });
      ops.push({ op: 'terrain', rect: r, t: 'FIELD' });
      break;
    }
  }
  // fields together feed the village while they stand: yield is sized to the eventual population (set once the cast is known)
  const fieldLms: LandmarkDef[] = eastFields.map((f) => ({ id: f.id, kind: 'field', name: f.name, x: f.x0 + 1, y: f.y0 + 1, tiles: fieldTiles(f.x0, f.y0, f.w, f.h), data: { yield: 1, growth: 100 } }));
  L.push(...fieldLms);
  const greenP = spot([eLo + 2, by + 1, eLo + 7, by + 3]);
  L.push({ id: 'green_e', kind: 'chapel', name: 'East Green', x: greenP[0], y: greenP[1] });
  const knollP: [number, number] = [knollX, knollY + 1];
  L.push({ id: 'shelter_e', kind: 'shelter', name: 'The Knoll', x: knollP[0], y: knollP[1], capacity: st.range(3, 5) });
  placer.block(knollP[0], knollP[1]);
  const cabinP: [number, number] = [knollX, knollY];
  placer.block(cabinP[0], cabinP[1]);
  L.push({ id: 'cabin', kind: 'cabin', name: "The Hermit's Cabin", x: cabinP[0], y: cabinP[1] });

  // ---- cast
  const eastHomes: string[] = [];
  const westHomes: string[] = [];
  const addHome = (idv: string, name: string, bank: 'e' | 'w', r: [number, number, number, number]) => {
    const p = spot(r);
    L.push({ id: idv, kind: 'home', name, x: p[0], y: p[1] });
    (bank === 'e' ? eastHomes : westHomes).push(idv);
    return idv;
  };
  const eR: [number, number, number, number] = [eLo + 1, 1, W - 4, H - 2];
  const wR: [number, number, number, number] = [3, 1, rx - 2, H - 2];
  const slots: Slot[] = [];
  const S = (s: Slot) => slots.push(s);
  // west cluster
  S({ key: 'reeve', role: 'Reeve', archetype: 'reeve', faction: 'council', cluster: 'w', work: 'hall', home: addHome('hw_reeve', "Reeve's House", 'w', wR), trust: [20, 32], want: 'Keeps the ledger and the peace. Wants a plan she can write down.' });
  S({ key: 'scholar', role: 'Physician', archetype: 'scholar', faction: 'scholars', cluster: 'w', work: 'hw_clinic', home: addHome('hw_clinic', 'The Clinic', 'w', wR), trust: [24, 36], want: 'Will believe a demonstration she watches herself, and nothing less.' });
  S({ key: 'miller', role: 'Miller', archetype: 'rival', faction: 'scholars', cluster: 'w', work: 'mill', home: addHome('hw_mill', 'Mill House', 'w', [Math.max(3, rx - 4), Math.max(1, by - 5), rx - 2, by - 2]), trust: [8, 18], want: 'Wants the mill race to prove the old stories wrong, in public.' });
  S({ key: 'trader', role: 'Trader', archetype: 'trader', faction: 'council', cluster: 'w', work: 'market', home: addHome('hw_stall', 'Stall House', 'w', wR), trust: [36, 48], want: 'Sells grain to both banks. Follows whichever story moves product.' });
  S({ key: 'ringer', role: 'Bell-keeper', archetype: 'ringer', faction: 'storykeepers', cluster: 'w', work: 'chapel', home: addHome('hw_lodge', 'Chapel Lodge', 'w', wR), trust: [55, 68], want: 'Has rung the bells for forty years. Believes they still mean something.' });
  const extraW = st.range(0, 2);
  const wExtras: Slot[] = [
    { key: 'weaver', role: 'Weaver', archetype: 'farmer', faction: 'hearth', cluster: 'w', work: 'market', home: addHome('hw_weaver', "Weaver's Cottage", 'w', wR), trust: [34, 46], want: 'Trusts what has worked before. Sells cloth on both banks.' },
    { key: 'scribe', role: 'Scribe', archetype: 'witness_truster', faction: 'council', cluster: 'w', work: 'hall', home: addHome('hw_scribe', "Scribe's Loft", 'w', wR), trust: [40, 54], want: 'Believes what he sees, and writes down what others only say.' },
  ];
  for (let i = 0; i < extraW; i++) S(wExtras[i]);
  // east cluster
  S({ key: 'keeper', role: 'Bridgekeeper', archetype: 'keeper', faction: 'council', cluster: 'e', work: 'br', home: addHome('he_keeper', "Bridgekeeper's House", 'e', [eLo + 1, by - 2, eLo + 5, by + 3]), trust: [38, 52], want: 'Torn between the Reeve who pays them and the neighbours who trust them. Fears for the child.', traits: { susceptibility: 60 } });
  S({ key: 'kchild', role: 'Child', archetype: 'child', faction: 'storykeepers', cluster: 'e', work: 'green_e', home: 'he_keeper', trust: [56, 66], want: 'Loves the storyteller’s tales. Wants to know why the river sounds angry.', household: 'keeper' });
  S({ key: 'preacher', role: 'Storyteller', archetype: 'preacher', faction: 'storykeepers', cluster: 'e', work: 'green_e', home: addHome('he_story', "Storyteller's House", 'e', eR), trust: [62, 76], want: 'Wants the village to listen to them again after a failed comet prophecy.' });
  S({ key: 'farmer', role: 'Farmer', archetype: 'farmer', faction: 'hearth', cluster: 'e', work: eastFields[0]?.id ?? 'green_e', home: addHome('he_farm', 'The Farmhouse', 'e', eR), trust: [30, 42], want: 'Will not lose the wheat. Trusts what has worked before.' });
  S({ key: 'parent', role: 'Mother', archetype: 'parent', faction: 'hearth', cluster: 'e', work: eastFields[eastFields.length - 1]?.id ?? 'green_e', home: addHome('he_cottage', 'The Cottage', 'e', eR), trust: [42, 52], want: 'Would do anything to keep the little one dry and fed.' });
  S({ key: 'pchild', role: 'Child', archetype: 'child', faction: 'hearth', cluster: 'e', work: 'green_e', home: 'he_cottage', trust: [52, 62], want: 'Believes everything the other child tells him.', household: 'parent' });
  S({ key: 'elder', role: 'Elder', archetype: 'elder', faction: 'hearth', cluster: 'e', work: eastFields[1]?.id ?? 'green_e', home: addHome('he_elder', "Elder's House", 'e', eR), trust: [26, 36], want: 'Survived the last great flood. Distrusts false hope and anything that smells of a sermon.' });
  S({ key: 'hand', role: 'Farmhand', archetype: 'witness_truster', faction: 'hearth', cluster: 'e', work: eastFields[2 % Math.max(1, eastFields.length)]?.id ?? 'green_e', home: addHome('he_loft', 'The Loft', 'e', eR), trust: [46, 58], want: 'Believes what he sees. Owes the farmer two seasons of wages.' });
  S({ key: 'hermit', role: 'Hermit', archetype: 'hermit', faction: 'hearth', cluster: 'e', work: 'cabin', home: 'cabin', trust: [28, 36], want: 'Lives alone on the knoll. Talks to the elder and the geese.' });
  const extraE = st.range(0, 2);
  const eExtras: Slot[] = [
    { key: 'fisher', role: 'Fisher', archetype: 'witness_truster', faction: 'hearth', cluster: 'e', work: 'br', home: addHome('he_fisher', "Fisher's Shack", 'e', [eLo + 1, by - 5, eLo + 4, by + 5]), trust: [40, 52], want: 'Knows the river’s moods. Does not say them aloud.' },
    { key: 'tinker', role: 'Tinker', archetype: 'trader', faction: 'storykeepers', cluster: 'e', work: 'green_e', home: addHome('he_tinker', "Tinker's Wagon", 'e', eR), trust: [38, 50], want: 'Carries news from fire to fire, and a few embellishments.' },
  ];
  for (let i = 0; i < extraE; i++) S(eExtras[i]);

  // Spare empty cottages: more homes than people, as in a real village
  const spare = st.range(1, 3);
  for (let i = 0; i < spare; i++) addHome(`hs_${i}`, 'Empty Cottage', i % 2 === 0 ? 'e' : 'w', i % 2 === 0 ? eR : wR);

  // ---- beacons: cover clusters of east homes
  const nBeacons = st.range(3, 5);
  const beaconSpots: [number, number][] = [];
  const eHomeLms = L.filter((l) => eastHomes.includes(l.id));
  for (let i = 0; i < nBeacons; i++) {
    const base = eHomeLms[(i * 2 + 1) % eHomeLms.length];
    const p = placer.place(st, [Math.max(eLo, base.x - 2), Math.max(1, base.y - 2), Math.min(W - 2, base.x + 2), Math.min(H - 2, base.y + 2)], 0) ?? placer.place(st, eR, 0) ?? [base.x + 1, base.y];
    beaconSpots.push(p);
    L.push({ id: `b_${i + 1}`, kind: 'beacon', name: ['North Beacon', 'Bridge-road Beacon', 'South Beacon', 'Knoll Beacon', 'Green Beacon'][i], x: p[0], y: p[1] });
  }

  // ---- people
  const villagers: VillagerDef[] = castVillagers(st, slots);
  const keeper = slots.find((s) => s.key === 'keeper')!;
  const bottleneck = st.chance(0.6);
  const edges = buildGraph(st, villagers, slots, ['w', 'e'], { density: 0.2, connectors: ['keeper', 'trader', 'ringer', 'preacher'], bottleneck });
  void keeper;
  const kids = slots.filter((s) => s.child);
  void kids;
  // roles as strings in wants use "them"; tidy: ensure pronoun-neutral phrasing
  const factions: Faction[] = [
    mkFaction('council', `${village} Council`, 'council', 'reeve', FACTION_COLORS.council, 'Order, the ledger, and a plan that can be written down.', 28, 2),
    mkFaction('scholars', "Doubters' Table", 'scholars', 'miller', FACTION_COLORS.scholars, 'Evidence before belief. Debunk what cannot be shown.', 14, 3),
    mkFaction('storykeepers', 'Storykeepers', 'storykeepers', 'preacher', FACTION_COLORS.storykeepers, 'Stories hold a village together. A good tale is worth more than a sandbag.', 64, 2),
    mkFaction('hearth', 'Hearth Families', 'hearth', 'elder', FACTION_COLORS.hearth, 'Keep the fields. Keep the house. Keep the children dry.', 36, 2),
  ];

  // ---- claims, rituals
  const rb = redbank.runtime;
  const pool = ['river_fears_fire', 'bridge_stands_watched', 'rain_heeds_bells'];
  const starters = st.shuffle(pool).slice(0, 2);
  const rivalPick = st.pick(['river_courts_fire', 'river_courts_fire', 'rain_shuns_bells']);
  const rivalWatches = rivalPick === 'river_courts_fire' ? 'river_fears_fire' : 'rain_heeds_bells';
  const claimDefs: ClaimDef[] = rb.claimDefs.filter((c) => pool.includes(c.id)).map((c) => ({ ...c, startsAvailable: false, unlockDay: starters.includes(c.id) ? undefined : st.range(3, 4) }));
  claimDefs.push({
    ...clone(rb.claimDefs.find((c) => c.id === 'river_courts_fire')!),
    id: rivalPick, text: rivalPick === 'river_courts_fire' ? 'Fire only angers the river.' : 'The bells chase the rain away from us.',
    short: rivalPick === 'river_courts_fire' ? 'Fire angers the river' : 'Bells chase the rain',
    spec: rivalPick === 'river_courts_fire' ? rb.claimDefs.find((c) => c.id === 'river_courts_fire')!.spec : { ...rb.claimDefs.find((c) => c.id === 'river_courts_fire')!.spec, id: 'rain_shuns_bells', subject: 'rain', effect: 'repel', trigger: { kind: 'bell' }, radius: 0, intensity: 1, side: ['rain_displace'] },
    regions: rivalPick === 'river_courts_fire' ? ['east'] : ['river'],
    electorate: rivalPick === 'river_courts_fire' ? undefined : { river: ['east', 'west'] },
    contradicts: [rivalWatches],
    benefit: rivalPick === 'river_courts_fire' ? 'Rival rumour: if Eastbank believes it, lit beacons draw water toward them.' : 'Rival rumour: if the valley believes it, the bells drive the rain away and the river runs high.',
    risk: 'If it takes hold, your own law is cancelled.',
    flavor: 'The Doubters’ answer to the Keeper.',
  } as ClaimDef);
  for (const c of claimDefs) if (!c.rival) c.contradicts = c.contradicts.filter((x) => x === rivalPick);
  const rituals = rb.rituals.map((r) => ({ ...r }));

  // ---- threat
  const levels: number[] = [];
  for (let i = 0; i < D; i++) levels.push(Math.max(1, Math.round(1 + ((surge - 3) * i) / Math.max(1, D - 2))));
  levels[D - 1] = surge;
  levels[D - 2] = Math.max(2, surge - 2);
  levels[D - 3] = Math.max(1, surge - 3 + st.range(-1, 0));
  const lulls = st.shuffle([1, 2, 3, 4].filter((d) => d < D - 3)).slice(0, 2);
  for (const d of lulls) levels[d] = Math.max(1, levels[d - 1] - 1);
  if (!levels.some((l, i) => i >= 2 && i <= D - 3 && l < levels[i - 1])) levels[2] = Math.max(1, levels[1] - 1);
  const threat: ThreatDay[] = levels.map((level, i) => {
    const prev = i === 0 ? level : levels[i - 1];
    const trend = level < prev ? 'ebbing' : level > prev ? 'rising' : 'steady';
    const rain = i === D - 1 ? 3 : level >= 4 ? 2 : level >= 3 || trend === 'rising' ? 1 : 0;
    return {
      day: i + 1, level, rain, wind: Math.min(3, 1 + (level >= 4 ? 1 : 0) + (i === D - 1 ? 1 : 0)), heat: 1, pack: 0, trend,
      label: i === D - 1 ? 'THE GREAT SURGE' : i === D - 2 ? 'The bridge groans' : trend === 'ebbing' ? 'The water drops back a hand' : trend === 'rising' ? 'Debris on the current' : 'Brown water, steady',
      warning: i === 1 ? 'The elder: "The water is the wrong colour. This is how it began last time."' : i === D - 4 ? `A rider from upstream: "The surge reaches ${village} in three nights."` : i === D - 2 ? 'The horn sounds. The surge arrives TOMORROW night.' : undefined,
    };
  });

  const n = villagers.length;
  const perField = Math.max(1, Math.ceil(Math.ceil(n / 4) / Math.max(1, fieldLms.length)));
  for (const f of fieldLms) f.data = { ...(f.data ?? {}), yield: perField };
  const homesCount = L.filter((l) => l.kind === 'home').length;
  const hasRival = true;
  const runtime: ScenarioRuntime = {
    id,
    version: 1,
    name: `Flood at ${village}`,
    tagline: `${D} days. One bridge. A surge of ${surge}. ${n} people between the banks.`,
    briefing: [
      `You are the Keeper of Stories. A surge reaches ${village} in ${D} nights.`,
      'You cannot drag the river or spawn food. But if enough people believe something is true, the world begins to obey.',
      `The bridge is the only way between the banks. ${bottleneck ? 'One person carries nearly every tie across it.' : 'Several people carry ties across it, but thinly.'}`,
    ],
    durationDays: D,
    threatKind: 'flood',
    claimDefs,
    rituals,
    threat,
    objectives: [
      { id: 'survivors', label: `At least ${n - 2} of ${n} villagers alive`, metric: 'alive', op: '>=', value: n - 2, required: true },
      { id: 'collapse', label: `Never fewer than ${Math.ceil(n * 0.64)} alive`, metric: 'alive', op: '>=', value: Math.ceil(n * 0.64), required: false, instantLoss: true },
      { id: 'homes', label: `At least ${Math.ceil(homesCount * 0.42)} homes still standing`, metric: 'homes', op: '>=', value: Math.ceil(homesCount * 0.42), required: true },
      { id: 'food', label: 'At least 4 food in store', metric: 'food', op: '>=', value: 4, required: true },
      { id: 'heroic', label: `Heroic: ${n - 1}+ alive`, metric: 'alive', op: '>=', value: n - 1, required: false, heroic: true },
    ],
    rivals: hasRival ? [{ factionId: 'scholars', claim: rivalPick, watches: rivalWatches, trigger: 0.3, telegraph: 1, budget: st.range(2, 3), cooldown: 2, leader: 'miller' }] : [],
    beats: rb.beats.map((b) => ({ ...b })),
    features: { flood: true, fire: true, bridge: true, bells: true },
    consts: { dmgBridge: st.range(10, 12), fireBase: 10, waterDeath: 2, deckLevel: 6 },
    score: { survivors: 400, homes: 25, food: 15, trust: 80, efficiency: 6, bonus: 150 },
    difficulty: 2 + (surge >= 6 ? 1 : 0) + (eBase === 2 ? 0 : -1),
    anchor: 'chapel',
    starters,
    finale: 'the night of the Great Surge',
    hints: [
      'Ties of trust carry stories. The bridgekeeper is close to both banks.',
      'Proof beats repetition. Stage a ritual on a night the omen is good.',
      'Fire protects homes but endangers fields. Count your fuel.',
      'A watched bridge lets the east bank walk out when the surge comes.',
    ],
  };

  const map: MapDef = {
    w: W,
    h: H,
    ops,
    regions: [
      { id: 'east', name: 'Eastbank', rects: [[eLo, 0, W - 1, H - 1]] },
      { id: 'west', name: 'Westbank', rects: [[0, 0, rx - 1, H - 1]] },
      { id: 'river', name: `The ${village}`, rects: [[rx, 0, rx + rw - 1, H - 1]] },
    ],
    stocks: { food: st.range(18, 24), fuel: st.range(9, 12) },
    landmarks: L,
  };
  const def: ScenarioDef = { runtime, map, villagers, edges, factions, ap: { start: 3, perDay: 3, max: 5 }, jitter: new Array<number>(D).fill(0) };
  const bp: Blueprint = {
    biome: 'river', village, size: [W, H], population: n, surge, days: D, bridgeX: rx, bridgeY: by, bottleneck, starters: starters.slice(),
    rival: rivalPick, modifiers: [], claims: claimDefs.map((c) => c.id),
  };
  return { def, bp };
}
