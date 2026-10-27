import type { ClaimDef, Faction, RitualDef, ScenarioRuntime, ThreatDay } from '../../core/types.ts';
import { getRule } from '../../laws/rules.ts';
import type { MapDef, LandmarkDef } from '../../world/build.ts';
import type { EdgeDef, ScenarioDef, VillagerDef } from '../types.ts';

/**
 * Scenario A - Flood at Redbank. Seven days before the Great Surge. Two banks, one narrow bridge.
 * Map is 28x18. River at x=12..14. West bank is high; east bank is a low plain with a small knoll refuge.
 */

const homes = (): LandmarkDef[] => [
  { id: 'h_ivo', kind: 'home', name: "Thatcher's House", x: 18, y: 4 },
  { id: 'h_wells', kind: 'home', name: "Bridgekeeper's House", x: 16, y: 9 },
  { id: 'h_ashby', kind: 'home', name: 'Ashby Farmhouse', x: 19, y: 6 },
  { id: 'h_carter', kind: 'home', name: 'Carter Cottage', x: 17, y: 12 },
  { id: 'h_harl', kind: 'home', name: "Harl's House", x: 21, y: 8 },
  { id: 'h_dunn', kind: 'home', name: "Dunn's Loft", x: 19, y: 11 },
  { id: 'h_tolliver', kind: 'home', name: 'Tolliver Cottage (empty)', x: 20, y: 13 },
  { id: 'h_marsh', kind: 'home', name: 'Marsh Cottage (empty)', x: 21, y: 15 },
  { id: 'w_mill', kind: 'home', name: 'Mill House', x: 10, y: 6 },
  { id: 'w_reeve', kind: 'home', name: "Reeve's House", x: 8, y: 4 },
  { id: 'w_clinic', kind: 'home', name: "Voss's Clinic", x: 8, y: 11 },
  { id: 'w_stall', kind: 'home', name: "Marlow's Stall House", x: 9, y: 10 },
  { id: 'w_lodge', kind: 'home', name: 'Chapel Lodge', x: 6, y: 9 },
  { id: 'w_baker', kind: 'home', name: "Baker's Cottage (empty)", x: 5, y: 7 },
];

const map: MapDef = {
  w: 28,
  h: 18,
  ops: [
    { op: 'grad', rect: [0, 0, 11, 17], axis: 'x', from: 10, to: 4 },
    { op: 'terrain', rect: [12, 0, 14, 17], t: 'RIVER' },
    { op: 'elev', rect: [12, 0, 14, 17], v: 0 },
    { op: 'grad', rect: [15, 0, 27, 17], axis: 'x', from: 2, to: 4 },
    { op: 'bump', cx: 25, cy: 3, r: 2, h: 3 },
    { op: 'terrain', rect: [0, 0, 4, 7], t: 'HILL' },
    { op: 'terrain', rect: [23, 1, 27, 5], t: 'HILL' },
    { op: 'terrain', rect: [0, 13, 6, 17], t: 'FOREST' },
    { op: 'terrain', rect: [24, 13, 27, 17], t: 'FOREST' },
    { op: 'terrain', rect: [22, 6, 23, 7], t: 'FOREST' },
    { op: 'terrain', rect: [3, 8, 11, 8], t: 'ROAD' },
    { op: 'terrain', rect: [15, 8, 22, 8], t: 'ROAD' },
    { op: 'terrain', rect: [16, 1, 19, 2], t: 'FIELD' },
    { op: 'terrain', rect: [22, 9, 24, 11], t: 'FIELD' },
    { op: 'terrain', rect: [16, 14, 19, 16], t: 'FIELD' },
    { op: 'terrain', rect: [3, 10, 5, 12], t: 'FIELD' },
  ],
  regions: [
    { id: 'east', name: 'Eastbank', rects: [[15, 0, 27, 17]] },
    { id: 'west', name: 'Westbank', rects: [[0, 0, 11, 17]] },
    { id: 'river', name: 'The Redbank', rects: [[12, 0, 14, 17]] },
  ],
  stocks: { food: 20, fuel: 10 },
  landmarks: [
    ...homes(),
    { id: 'br', kind: 'bridge', name: 'Redbank Bridge', x: 13, y: 8, hp: 70, tiles: [[12, 8], [13, 8], [14, 8]], data: { watchers: 0 } },
    { id: 'f_e1', kind: 'field', name: 'North Wheat', x: 17, y: 1, tiles: [[16, 1], [17, 1], [18, 1], [19, 1], [16, 2], [17, 2], [18, 2], [19, 2]], data: { yield: 1, growth: 100 } },
    { id: 'f_e2', kind: 'field', name: 'Upland Barley', x: 23, y: 10, tiles: [[22, 9], [23, 9], [24, 9], [22, 10], [23, 10], [24, 10], [22, 11], [23, 11], [24, 11]], data: { yield: 1, growth: 100 } },
    { id: 'f_e3', kind: 'field', name: 'South Meadow', x: 17, y: 15, tiles: [[16, 14], [17, 14], [18, 14], [19, 14], [16, 15], [17, 15], [18, 15], [19, 15], [16, 16], [17, 16], [18, 16], [19, 16]], data: { yield: 1, growth: 100 } },
    { id: 'f_w1', kind: 'field', name: 'Chapel Garden', x: 4, y: 11, tiles: [[3, 10], [4, 10], [5, 10], [3, 11], [4, 11], [5, 11], [3, 12], [4, 12], [5, 12]], data: { yield: 1, growth: 100 } },
    { id: 'b_n', kind: 'beacon', name: 'North Beacon', x: 18, y: 3 },
    { id: 'b_c', kind: 'beacon', name: 'Bridge-road Beacon', x: 17, y: 9 },
    { id: 'b_s', kind: 'beacon', name: 'South Beacon', x: 18, y: 12 },
    { id: 'b_e', kind: 'beacon', name: 'Harl Beacon', x: 20, y: 7 },
    { id: 'bell', kind: 'belltower', name: 'Chapel Bell Tower', x: 7, y: 8 },
    { id: 'chapel', kind: 'chapel', name: 'Chapel Green', x: 6, y: 10 },
    { id: 'market', kind: 'market', name: 'Redbank Market', x: 9, y: 9 },
    { id: 'mill', kind: 'mill', name: "Pell's Mill", x: 11, y: 6 },
    { id: 'hall', kind: 'hall', name: 'Reeve Hall', x: 8, y: 5 },
    { id: 'shelter_w', kind: 'shelter', name: 'Hill Shelter', x: 2, y: 4, capacity: 14 },
    { id: 'cabin', kind: 'cabin', name: "Wren's Cabin", x: 25, y: 3 },
    { id: 'shelter_e', kind: 'shelter', name: "Wren's Knoll", x: 25, y: 4, capacity: 3 },
    { id: 'green_e', kind: 'chapel', name: 'East Green', x: 20, y: 9 },
  ],
};

const villagers: VillagerDef[] = [
  { id: 'ivo', name: 'Ivo Thatcher', role: 'Storyteller', archetype: 'preacher', faction: 'storykeepers', household: 'thatcher', home: 'h_ivo', work: 'green_e', trust: 72, want: 'Wants the village to listen to him again after his failed comet prophecy.', look: { hue: 18, skin: 2, hair: 1, hat: 1, build: 1 } },
  { id: 'mara', name: 'Mara Wells', role: 'Bridgekeeper', archetype: 'keeper', faction: 'council', household: 'wells', home: 'h_wells', work: 'br', trust: 46, want: 'Torn between the Reeve who pays her and the neighbours who trust her. Fears for Tilly.', traits: { susceptibility: 60 }, look: { hue: 200, skin: 1, hair: 2, hat: 0, build: 1 } },
  { id: 'tilly', name: 'Tilly Wells', role: 'Child', archetype: 'child', faction: 'storykeepers', household: 'wells', home: 'h_wells', work: 'green_e', trust: 62, want: 'Loves Ivo’s stories. Wants to know why the river sounds angry.', look: { hue: 320, skin: 1, hair: 0, hat: 0, build: 0 } },
  { id: 'bram', name: 'Bram Ashby', role: 'Farmer', archetype: 'farmer', faction: 'hearth', household: 'ashby', home: 'h_ashby', work: 'f_e1', trust: 36, want: 'Will not lose the north wheat. Trusts what has worked before.', look: { hue: 90, skin: 2, hair: 3, hat: 2, build: 2 } },
  { id: 'nell', name: 'Nell Carter', role: 'Mother', archetype: 'parent', faction: 'hearth', household: 'carter', home: 'h_carter', work: 'f_e3', trust: 46, want: 'Would do anything to keep Pip dry and fed.', look: { hue: 350, skin: 1, hair: 1, hat: 0, build: 1 } },
  { id: 'pip', name: 'Pip Carter', role: 'Child', archetype: 'child', faction: 'hearth', household: 'carter', home: 'h_carter', work: 'green_e', trust: 56, want: 'Believes everything Tilly tells him.', look: { hue: 40, skin: 2, hair: 2, hat: 0, build: 0 } },
  { id: 'harl', name: 'Old Harl', role: 'Elder', archetype: 'elder', faction: 'hearth', household: 'harl', home: 'h_harl', work: 'f_e2', trust: 30, want: 'Survived the flood of ’31. Distrusts Ivo’s tales and anything that smells of false hope.', look: { hue: 30, skin: 3, hair: 4, hat: 3, build: 2 } },
  { id: 'dunn', name: 'Dunn Reed', role: 'Farmhand', archetype: 'witness_truster', faction: 'hearth', household: 'dunn', home: 'h_dunn', work: 'f_e1', trust: 52, want: 'Believes what he sees. Owes Bram two seasons of wages.', look: { hue: 150, skin: 2, hair: 0, hat: 2, build: 1 } },
  { id: 'wren', name: 'Wren Fisher', role: 'Hermit', archetype: 'hermit', faction: 'hearth', household: 'wren', home: 'cabin', work: 'cabin', trust: 32, want: 'Lives alone on the knoll. Talks to Harl and the geese.', look: { hue: 260, skin: 1, hair: 4, hat: 3, build: 0 } },
  { id: 'osric', name: 'Osric Pell', role: 'Miller', archetype: 'rival', faction: 'scholars', household: 'pell', home: 'w_mill', work: 'mill', trust: 14, want: 'Wants the new mill race to prove the old stories wrong, in public.', look: { hue: 220, skin: 3, hair: 3, hat: 0, build: 2 } },
  { id: 'hester', name: 'Hester Grane', role: 'Reeve', archetype: 'reeve', faction: 'council', household: 'grane', home: 'w_reeve', work: 'hall', trust: 24, want: 'Keeps the ledger and the peace. Wants a plan she can write down.', look: { hue: 280, skin: 2, hair: 1, hat: 4, build: 1 } },
  { id: 'elspeth', name: 'Dr. Elspeth Voss', role: 'Physician', archetype: 'scholar', faction: 'scholars', household: 'voss', home: 'w_clinic', work: 'w_clinic', trust: 30, want: 'Will believe a demonstration she watches herself, and nothing less.', look: { hue: 170, skin: 1, hair: 3, hat: 0, build: 1 } },
  { id: 'cass', name: 'Cass Marlow', role: 'Trader', archetype: 'trader', faction: 'council', household: 'marlow', home: 'w_stall', work: 'market', trust: 42, want: 'Sells grain to both banks. Follows whichever story moves product.', look: { hue: 60, skin: 2, hair: 2, hat: 5, build: 1 } },
  { id: 'aldous', name: 'Brother Aldous', role: 'Bell-keeper', archetype: 'ringer', faction: 'storykeepers', household: 'lodge', home: 'w_lodge', work: 'chapel', trust: 62, want: 'Has rung the bells for forty years. Believes they still mean something.', look: { hue: 25, skin: 2, hair: 4, hat: 6, build: 1 } },
];

const e = (a: string, b: string, ab: number, ba: number, rate: number, kind: EdgeDef['kind']): EdgeDef => ({ a, b, ab, ba, rate, kind });

const edges: EdgeDef[] = [
  // households
  e('mara', 'tilly', 92, 92, 0.95, 'household'),
  e('nell', 'pip', 90, 90, 0.95, 'household'),
  // east bank
  e('ivo', 'tilly', 70, 82, 0.6, 'friend'),
  e('ivo', 'nell', 65, 60, 0.5, 'friend'),
  e('ivo', 'dunn', 60, 72, 0.5, 'friend'),
  e('ivo', 'bram', 45, 50, 0.45, 'neighbor'),
  e('ivo', 'harl', 30, -35, 0.35, 'rival'),
  e('mara', 'harl', 60, 70, 0.5, 'friend'),
  e('mara', 'bram', 55, 55, 0.5, 'neighbor'),
  e('mara', 'nell', 60, 65, 0.55, 'friend'),
  e('mara', 'dunn', 45, 45, 0.35, 'neighbor'),
  e('bram', 'dunn', 70, 60, 0.7, 'work'),
  e('bram', 'harl', 50, 60, 0.5, 'neighbor'),
  e('bram', 'nell', 40, 40, 0.4, 'neighbor'),
  e('harl', 'wren', 60, 55, 0.3, 'kin'),
  e('dunn', 'wren', 50, 50, 0.25, 'friend'),
  e('pip', 'tilly', 85, 85, 0.8, 'friend'),
  e('nell', 'tilly', 50, 55, 0.4, 'neighbor'),
  // across the bridge
  e('mara', 'hester', 55, 60, 0.4, 'work'),
  e('mara', 'cass', 45, 55, 0.35, 'trade'),
  e('mara', 'elspeth', 50, 60, 0.3, 'friend'),
  e('bram', 'cass', 40, 50, 0.4, 'trade'),
  e('ivo', 'aldous', 70, 65, 0.5, 'faction'),
  e('nell', 'elspeth', 55, 65, 0.35, 'friend'),
  e('harl', 'hester', 40, 50, 0.3, 'friend'),
  // west bank
  e('osric', 'hester', 65, 60, 0.6, 'faction'),
  e('osric', 'elspeth', 55, 60, 0.4, 'faction'),
  e('osric', 'cass', 45, 40, 0.4, 'trade'),
  e('osric', 'aldous', -25, -20, 0.3, 'rival'),
  e('osric', 'ivo', -50, -45, 0.4, 'rival'),
  e('hester', 'aldous', 45, 50, 0.4, 'friend'),
  e('hester', 'cass', 50, 45, 0.4, 'work'),
  e('hester', 'elspeth', 60, 65, 0.45, 'faction'),
  e('aldous', 'cass', 40, 40, 0.3, 'neighbor'),
  e('aldous', 'elspeth', 30, 35, 0.25, 'neighbor'),
];

const factions: Faction[] = [
  { id: 'council', name: 'Redbank Council', kind: 'council', leader: 'hester', color: '#d4a72c', priorities: 'Order, the ledger, and a plan that can be written down.', trustInKeeper: 28, budget: 2, cooldownUntil: 0, grievance: 0 },
  { id: 'scholars', name: "Doubters' Table", kind: 'scholars', leader: 'osric', color: '#5fa8d3', priorities: 'Evidence before belief. Debunk what cannot be shown.', trustInKeeper: 14, budget: 3, cooldownUntil: 0, grievance: 0 },
  { id: 'storykeepers', name: 'Storykeepers', kind: 'storykeepers', leader: 'ivo', color: '#e07a5f', priorities: 'Stories hold a village together. A good tale is worth more than a sandbag.', trustInKeeper: 64, budget: 2, cooldownUntil: 0, grievance: 0 },
  { id: 'hearth', name: 'Hearth Families', kind: 'hearth', leader: 'harl', color: '#81b29a', priorities: 'Keep the fields. Keep the house. Keep the children dry.', trustInKeeper: 36, budget: 2, cooldownUntil: 0, grievance: 0 },
];

const claimDefs: ClaimDef[] = [
  {
    id: 'river_fears_fire', text: 'The river is frightened by fire.', short: 'River fears fire', icon: 'flame',
    spec: getRule('river_fears_fire'), regions: ['east'], ritual: 'light_beacon', contradicts: ['river_courts_fire'],
    benefit: 'While Eastbank believes, lit beacons push floodwater back up to 2 tiles within 3 tiles of each flame.',
    risk: 'Lit beacons burn fuel and can set nearby fields or cottages alight (twice as often once the law wakes).',
    flavor: 'Flame on the bank, and the water turns aside.', startsAvailable: false, unlockDay: 3,
  },
  {
    id: 'bridge_stands_watched', text: 'A bridge never breaks while it is watched.', short: 'Bridge stands watched', icon: 'eye',
    spec: getRule('bridge_stands_watched'), regions: ['river'], electorate: { river: ['east', 'west'] }, ritual: 'keep_vigil', contradicts: ['crowds_break_bridges'],
    benefit: 'With at least 3 watchers on the deck at night, the bridge takes up to 90% less flood damage.',
    risk: 'Watchers stand on the bridge at dusk instead of working the fields, and food output drops.',
    flavor: 'Watched wood does not dare to snap.', startsAvailable: false, unlockDay: 3,
  },
  {
    id: 'rain_heeds_bells', text: 'Rain answers the village bells.', short: 'Rain heeds the bells', icon: 'bell',
    spec: getRule('rain_heeds_bells'), regions: ['river'], electorate: { river: ['east', 'west'] }, ritual: 'ring_bells', contradicts: [], params: { sink: 'west' },
    benefit: 'When the bells ring in the night, up to 2 steps of the river level are drawn off into the hills.',
    risk: 'The rain you push away pools on the low Westbank road and mill. Water is moved, not removed.',
    flavor: 'Ring true, and the sky turns its face.', startsAvailable: false, unlockDay: 4,
  },
  {
    id: 'river_courts_fire', text: 'Fire only angers the river.', short: 'Fire angers the river', icon: 'skull',
    spec: getRule('river_courts_fire'), regions: ['east'], contradicts: ['river_fears_fire'], rival: true,
    benefit: 'Rival rumour: if Eastbank believes it, lit beacons draw water toward them.',
    risk: 'If it takes hold, your fire wall becomes a lure.',
    flavor: 'Osric’s answer to the Keeper.', startsAvailable: false,
  },
  {
    id: 'crowds_break_bridges', text: 'A crowded bridge is a broken bridge.', short: 'Crowds break bridges', icon: 'skull',
    spec: getRule('crowds_break_bridges'), regions: ['river'], electorate: { river: ['east', 'west'] }, contradicts: ['bridge_stands_watched'], rival: true,
    benefit: 'Rival rumour: if both banks believe it, a watch on the deck adds weight to the bridge instead of sheltering it.',
    risk: 'If it takes hold, your vigil becomes the thing that breaks the bridge.',
    flavor: 'Old Harl remembers what the crowd did to the bridge in ’31.', startsAvailable: false,
  },
];

const rituals: RitualDef[] = [
  { id: 'light_beacon', label: 'Light the beacon', verb: 'Light', landmark: 'beacon', ap: 1, fuel: 2, witnessRadius: 5, strength: 26, omen: 'river_trend', physical: 'light', desc: 'Costs 2 fuel. Burns 3 nights. Staging it as proof for a claim costs +1 Influence; it works best on a night the river is ebbing.' },
  { id: 'ring_bells', label: 'Ring the bells', verb: 'Ring', landmark: 'belltower', ap: 1, fuel: 0, witnessRadius: 8, strength: 22, omen: 'rain_tonight', physical: 'ring', desc: 'Rings tonight only. Staged as proof it works best when rain is forecast.' },
  { id: 'keep_vigil', label: 'Keep a bridge vigil', verb: 'Watch', landmark: 'bridge', ap: 1, fuel: 0, witnessRadius: 7, strength: 26, omen: 'bridge_calm', physical: 'vigil', desc: 'Up to 3 willing watchers stand the night on the deck. Convincing proof only on a calm night.' },
];

const threat: ThreatDay[] = [
  { day: 1, level: 1, rain: 0, wind: 1, heat: 1, pack: 0, trend: 'steady', label: 'Calm brown water', },
  { day: 2, level: 2, rain: 1, wind: 1, heat: 1, pack: 0, trend: 'rising', label: 'Debris on the current', warning: 'Old Harl: "The water is the wrong colour. This is how ’31 began."' },
  { day: 3, level: 1, rain: 0, wind: 1, heat: 1, pack: 0, trend: 'ebbing', label: 'The water drops back a hand' },
  { day: 4, level: 3, rain: 1, wind: 2, heat: 1, pack: 0, trend: 'rising', label: 'Rain upriver', warning: 'A rider from upstream: "The Great Surge reaches Redbank in three nights."' },
  { day: 5, level: 2, rain: 0, wind: 1, heat: 1, pack: 0, trend: 'ebbing', label: 'A deceptive lull' },
  { day: 6, level: 4, rain: 2, wind: 2, heat: 1, pack: 0, trend: 'rising', label: 'The bridge groans', warning: 'The horn sounds. The surge arrives TOMORROW night; the second terrace will go under.' },
  { day: 7, level: 6, rain: 3, wind: 3, heat: 1, pack: 0, trend: 'rising', label: 'THE GREAT SURGE' },
];

const runtime: ScenarioRuntime = {
  id: 'redbank',
  version: 1,
  name: 'Flood at Redbank',
  tagline: 'Seven days. One bridge. You cannot command the water — but you can change what the village believes.',
  briefing: [
    'You are the Keeper of Stories. The Great Surge reaches Redbank in seven nights.',
    'You cannot drag the river or spawn food. But if enough people believe something is true, the world begins to obey.',
    'Choose a story, find who the village listens to, and let it spread along the ties of trust.',
  ],
  durationDays: 7,
  threatKind: 'flood',
  claimDefs,
  rituals,
  threat,
  objectives: [
    { id: 'survivors', label: 'At least 12 of 14 villagers alive', metric: 'alive', op: '>=', value: 12, required: true },
    { id: 'collapse', label: 'Never fewer than 9 alive', metric: 'alive', op: '>=', value: 9, required: false, instantLoss: true },
    { id: 'homes', label: 'At least 6 homes still standing', metric: 'homes', op: '>=', value: 6, required: true },
    { id: 'food', label: 'At least 4 food in store', metric: 'food', op: '>=', value: 4, required: true },
    { id: 'heroic', label: 'Heroic: 13+ alive and the bridge standing', metric: 'alive', op: '>=', value: 13, required: false, heroic: true },
  ],
  rivals: [
    { factionId: 'scholars', claim: 'river_courts_fire', watches: 'river_fears_fire', trigger: 0.3, telegraph: 1, budget: 3, cooldown: 2, leader: 'osric' },
    { factionId: 'hearth', claim: 'crowds_break_bridges', watches: 'bridge_stands_watched', trigger: 0.12, telegraph: 1, budget: 3, cooldown: 2, leader: 'harl' },
  ],
  beats: [
    { id: 'first_spread', when: { kind: 'first_belief' }, title: 'It begins to travel', text: 'A story is only as strong as the ties it can travel along. Watch who repeats it.', once: true },
    { id: 'bridge_creaks', when: { kind: 'bridge_hp_below', arg: 50 }, title: 'The bridge groans', text: 'The deck is weakening. If it fails, the east bank is cut off.', once: true },
    { id: 'osric_stirs', when: { kind: 'rival_telegraph' }, title: 'The miller is stirring', text: 'The Doubters’ Table is preparing an answer. You can still answer it first.', once: true },
  ],
  features: { flood: true, fire: true, bridge: true, bells: true },
  consts: { dmgBridge: 11, fireBase: 10, waterDeath: 2, deckLevel: 6 },
  score: { survivors: 400, homes: 25, food: 15, trust: 80, efficiency: 6, bonus: 150 },
  difficulty: 2,
  anchor: 'chapel',
  starters: ['river_fears_fire', 'bridge_stands_watched'],
  finale: 'the night of the Great Surge',
  hints: [
    'Ties of trust carry stories. The bridgekeeper is close to both banks.',
    'Proof beats repetition. Stage a ritual on a night the omen is good.',
    'Fire protects homes but endangers fields. Count your fuel.',
    'A watched bridge lets the east bank walk out when the surge comes.',
  ],
};

export const redbank: ScenarioDef = {
  runtime,
  map,
  villagers,
  edges,
  factions,
  ap: { start: 3, perDay: 3, max: 5 },
  jitter: [0, 0, 0, 0, 0, 0, 0],
};
