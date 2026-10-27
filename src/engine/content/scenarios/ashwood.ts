import type { ClaimDef, Faction, RitualDef, ScenarioRuntime, ThreatDay } from '../../core/types.ts';
import { getRule } from '../../laws/rules.ts';
import type { LandmarkDef, MapDef } from '../../world/build.ts';
import type { EdgeDef, ScenarioDef, VillagerDef } from '../types.ts';

/**
 * Scenario C - The Wolves of Ashwood. Three distrustful hamlets in a mist-covered wood; packs close in night by night.
 * New wrinkles: moving predators, smoke that protects and sickens, fog that cuts hamlets off from each other, and a hunter's
 * rival theory that can be turned into a decoy. Piling on belief is NOT always best: smoke harms the people it protects.
 */

const pen = (id: string, name: string, x: number, y: number, n: number): LandmarkDef => ({ id, kind: 'pen', name, x, y, data: { stock: n, stockMax: n } });
const fire = (id: string, name: string, x: number, y: number): LandmarkDef => ({ id, kind: 'campfire', name, x, y });

const map: MapDef = {
  w: 30,
  h: 18,
  ops: [
    { op: 'terrain', rect: [0, 0, 29, 17], t: 'FOREST' },
    { op: 'terrain', rect: [3, 2, 9, 7], t: 'GRASS' },
    { op: 'terrain', rect: [13, 7, 19, 12], t: 'GRASS' },
    { op: 'terrain', rect: [5, 12, 11, 16], t: 'GRASS' },
    { op: 'terrain', rect: [21, 8, 23, 10], t: 'GRASS' },
    { op: 'terrain', rect: [21, 13, 23, 15], t: 'GRASS' },
    { op: 'terrain', rect: [9, 5, 13, 5], t: 'ROAD' },
    { op: 'terrain', rect: [13, 5, 13, 8], t: 'ROAD' },
    { op: 'terrain', rect: [11, 11, 14, 11], t: 'ROAD' },
    { op: 'terrain', rect: [11, 11, 11, 13], t: 'ROAD' },
    { op: 'elev', rect: [0, 0, 29, 17], v: 3 },
  ],
  regions: [
    { id: 'wild', name: 'The Deep Wood', rects: [[20, 0, 29, 17]] },
    { id: 'north', name: 'Northwatch', rects: [[0, 0, 11, 10]] },
    { id: 'mill', name: 'Millbrook', rects: [[12, 0, 29, 11]] },
    { id: 'ash', name: 'Ashfold', rects: [[0, 11, 11, 17], [12, 12, 29, 17]] },
  ],
  stocks: { food: 44, fuel: 8 },
  packs: [
    { id: 'Grey', x: 21, y: 6, size: 2 },
    { id: 'Black', x: 2, y: 10, size: 2 },
    { id: 'Red', x: 22, y: 15, size: 2 },
  ],
  landmarks: [
    { id: 'h_brann', kind: 'home', name: "Brann's Lodge", x: 4, y: 3 },
    { id: 'h_edda', kind: 'home', name: "Edda's Croft", x: 5, y: 5 },
    { id: 'h_gorm', kind: 'home', name: "Gorm's Hut", x: 8, y: 6 },
    { id: 'post', kind: 'hall', name: 'Northwatch Post', x: 6, y: 3 },
    pen('pen_n', 'Northwatch Pens', 7, 4, 5),
    fire('c_n1', 'Northwatch Hearth', 6, 6),
    fire('c_n2', 'Watchfire Ridge', 9, 3),
    { id: 'h_hale', kind: 'home', name: 'Mill House', x: 14, y: 8 },
    { id: 'h_ysolde', kind: 'home', name: "Healer's Cottage", x: 17, y: 8 },
    { id: 'h_garrick', kind: 'home', name: "Hunter's Lodge", x: 18, y: 11 },
    { id: 'h_bess', kind: 'home', name: "Old Bess's House", x: 14, y: 11 },
    { id: 'green_m', kind: 'chapel', name: 'Millbrook Green', x: 16, y: 7 },
    { id: 'mill', kind: 'mill', name: 'Millbrook Mill', x: 13, y: 9 },
    pen('pen_m', 'Millbrook Pens', 16, 9, 5),
    fire('c_m1', 'Millbrook Hearth', 15, 10),
    fire('c_m2', 'East Watchfire', 18, 8),
    { id: 'h_rook', kind: 'home', name: "Rook's Wagon-house", x: 6, y: 13 },
    { id: 'h_maren', kind: 'home', name: "Maren's Croft", x: 10, y: 13 },
    { id: 'h_cobb', kind: 'home', name: "Cobb's Hut", x: 6, y: 16 },
    { id: 'h_linnet', kind: 'home', name: "Linnet's House", x: 10, y: 15 },
    { id: 'market', kind: 'market', name: 'Ashfold Stalls', x: 8, y: 12 },
    pen('pen_a', 'Ashfold Pens', 8, 14, 4),
    fire('c_a1', 'Ashfold Hearth', 7, 13),
    fire('c_a2', 'South Watchfire', 10, 16),
    fire('c_d1', 'Old Clearing Fire', 22, 9),
    fire('c_d2', 'Stone Ring Fire', 22, 14),
  ],
};

const villagers: VillagerDef[] = [
  { id: 'brann', name: 'Warden Brann', role: 'Warden', archetype: 'reeve', faction: 'wardens', household: 'brann', home: 'h_brann', work: 'post', trust: 34, want: 'Has sworn that no beast takes a Northwatch animal. Cannot afford to be wrong twice.', look: { hue: 280, skin: 2, hair: 1, hat: 4, build: 2 } },
  { id: 'edda', name: 'Edda Marsh', role: 'Herder', archetype: 'parent', faction: 'herders', household: 'edda', home: 'h_edda', work: 'pen_n', trust: 46, want: 'Her herd is her children’s future. Tam sleeps beside the pens.', look: { hue: 350, skin: 1, hair: 1, hat: 0, build: 1 } },
  { id: 'gorm', name: 'Gorm Axeson', role: 'Woodcutter', archetype: 'farmer', faction: 'wardens', household: 'gorm', home: 'h_gorm', work: 'h_gorm', trust: 38, traits: { stubbornness: 70 }, want: 'Cuts the fuel everyone burns. Proud, and hunts with Garrick on the quiet nights.', look: { hue: 90, skin: 2, hair: 3, hat: 2, build: 2 } },
  { id: 'tam', name: 'Tam Marsh', role: 'Child', archetype: 'child', faction: 'herders', household: 'edda', home: 'h_edda', work: 'pen_n', trust: 56, want: 'Names every animal in the pens. Heard the howling first.', look: { hue: 40, skin: 2, hair: 2, hat: 0, build: 0 } },
  { id: 'hale', name: 'Miller Hale', role: 'Miller', archetype: 'farmer', faction: 'millers', household: 'hale', home: 'h_hale', work: 'mill', trust: 36, want: 'Needs the mill-race clear of fog and the roads open to Ashfold.', look: { hue: 220, skin: 3, hair: 3, hat: 0, build: 2 } },
  { id: 'ysolde', name: 'Ysolde the Healer', role: 'Healer', archetype: 'scholar', faction: 'millers', household: 'ysolde', home: 'h_ysolde', work: 'green_m', trust: 30, want: 'Counts every cough. Will say the smoke is poison if she hears it often enough.', look: { hue: 170, skin: 1, hair: 3, hat: 0, build: 1 } },
  { id: 'garrick', name: 'Garrick Thorn', role: 'Hunter', archetype: 'rival', faction: 'hunters', household: 'garrick', home: 'h_garrick', work: 'h_garrick', trust: 18, want: 'Swears the wolves track smoke like hounds. He has lost three dogs proving it.', look: { hue: 25, skin: 3, hair: 4, hat: 3, build: 2 } },
  { id: 'bess', name: 'Old Bess', role: 'Elder', archetype: 'elder', faction: 'millers', household: 'bess', home: 'h_bess', work: 'green_m', trust: 32, want: 'Remembers the winter the wolves took a child. Does not forget, does not forgive the Warden.', look: { hue: 30, skin: 3, hair: 4, hat: 3, build: 2 } },
  { id: 'pia', name: 'Pia', role: 'Child', archetype: 'child', faction: 'millers', household: 'bess', home: 'h_bess', work: 'green_m', trust: 60, want: 'Bess’s granddaughter. Repeats everything she hears at the green.', look: { hue: 320, skin: 1, hair: 0, hat: 0, build: 0 } },
  { id: 'rook', name: 'Rook Fenwick', role: 'Trader', archetype: 'trader', faction: 'travellers', household: 'rook', home: 'h_rook', work: 'market', trust: 42, want: 'Walks the forest paths between all three hamlets. Needs the roads open.', look: { hue: 60, skin: 2, hair: 2, hat: 5, build: 1 } },
  { id: 'maren', name: 'Maren Holt', role: 'Herder', archetype: 'farmer', faction: 'herders', household: 'maren', home: 'h_maren', work: 'pen_a', trust: 44, want: 'Four animals left in Ashfold. She sleeps with an axe by the gate.', look: { hue: 120, skin: 1, hair: 2, hat: 2, build: 1 } },
  { id: 'cobb', name: 'Cobb Alder', role: 'Shepherd', archetype: 'hermit', faction: 'herders', household: 'cobb', home: 'h_cobb', work: 'h_cobb', trust: 30, want: 'Lives on the edge of Ashfold, closest to the wolves. Trusts only Maren.', look: { hue: 260, skin: 1, hair: 4, hat: 3, build: 0 } },
  { id: 'linnet', name: 'Linnet Dray', role: 'Storyteller', archetype: 'preacher', faction: 'travellers', household: 'linnet', home: 'h_linnet', work: 'market', trust: 64, want: 'Sings the hamlets’ news from fire to fire. People believe a song before a warning.', look: { hue: 18, skin: 2, hair: 1, hat: 1, build: 1 } },
];

const e = (a: string, b: string, ab: number, ba: number, rate: number, kind: EdgeDef['kind']): EdgeDef => ({ a, b, ab, ba, rate, kind });

const edges: EdgeDef[] = [
  // Northwatch
  e('edda', 'tam', 92, 92, 0.95, 'household'), e('brann', 'edda', 55, 60, 0.6, 'work'), e('brann', 'gorm', 65, 60, 0.6, 'faction'), e('gorm', 'edda', 45, 50, 0.45, 'neighbor'), e('tam', 'brann', 40, 55, 0.3, 'neighbor'),
  // Millbrook
  e('bess', 'pia', 92, 92, 0.95, 'household'), e('hale', 'bess', 60, 65, 0.5, 'neighbor'), e('hale', 'ysolde', 55, 55, 0.5, 'faction'), e('ysolde', 'bess', 60, 55, 0.45, 'friend'),
  e('garrick', 'hale', 45, 45, 0.4, 'neighbor'), e('garrick', 'bess', -20, 35, 0.3, 'rival'), e('garrick', 'ysolde', -25, -20, 0.3, 'rival'), e('pia', 'ysolde', 55, 60, 0.4, 'friend'),
  // Ashfold
  e('maren', 'cobb', 70, 65, 0.6, 'friend'), e('maren', 'linnet', 55, 55, 0.5, 'neighbor'), e('rook', 'linnet', 60, 65, 0.6, 'friend'), e('rook', 'maren', 50, 50, 0.45, 'trade'), e('cobb', 'linnet', 35, 45, 0.25, 'neighbor'),
  // the thin ties between hamlets: a trader, a hunter and a healer
  e('rook', 'hale', 55, 55, 0.4, 'trade'), e('rook', 'brann', 40, 45, 0.3, 'trade'), e('rook', 'ysolde', 50, 55, 0.3, 'trade'),
  e('garrick', 'gorm', 70, 70, 0.55, 'friend'), e('garrick', 'brann', 25, 30, 0.25, 'work'), e('garrick', 'rook', 45, 45, 0.3, 'friend'),
  e('linnet', 'hale', 45, 50, 0.3, 'friend'), e('bess', 'brann', -40, -35, 0.25, 'rival'), e('ysolde', 'maren', 45, 55, 0.25, 'friend'),
];

const factions: Faction[] = [
  { id: 'wardens', name: 'Northwatch Wardens', kind: 'council', leader: 'brann', color: '#d4a72c', priorities: 'Keep the pens. Keep the oath.', trustInKeeper: 30, budget: 2, cooldownUntil: 0, grievance: 0 },
  { id: 'millers', name: 'Millbrook Folk', kind: 'scholars', leader: 'ysolde', color: '#5fa8d3', priorities: 'Keep the roads open and the lungs clear.', trustInKeeper: 30, budget: 2, cooldownUntil: 0, grievance: 0 },
  { id: 'travellers', name: 'Travellers', kind: 'storykeepers', leader: 'linnet', color: '#e07a5f', priorities: 'Carry the news between fires.', trustInKeeper: 58, budget: 2, cooldownUntil: 0, grievance: 0 },
  { id: 'herders', name: 'Herders', kind: 'hearth', leader: 'maren', color: '#81b29a', priorities: 'Keep the animals alive.', trustInKeeper: 44, budget: 2, cooldownUntil: 0, grievance: 0 },
  { id: 'hunters', name: 'Hunters', kind: 'scholars', leader: 'garrick', color: '#c97a4a', priorities: 'Wolves are hunted, not feared.', trustInKeeper: 18, budget: 3, cooldownUntil: 0, grievance: 0 },
];

const regions3 = ['north', 'mill', 'ash'];

const claimDefs: ClaimDef[] = [
  {
    id: 'wolves_fear_smoke', text: 'The wolves mistake smoke for a sleeping giant.', short: 'Wolves fear smoke', icon: 'wolf',
    spec: getRule('wolves_fear_smoke'), regions: regions3, ritual: 'burn_smoke', contradicts: ['wolves_follow_smoke'],
    benefit: 'Wolves will not cross within 3 tiles of a burning fire in a hamlet that believes. Pens inside the smoke are safe.',
    risk: 'Smoke sickens people near the fire, thickens the fog (they talk less) and burns scarce fuel. Too many fires, and the hamlet isolates and coughs itself out of the fight.',
    flavor: 'Wolves do not trouble a sleeping giant.', startsAvailable: false, unlockDay: 3,
  },
  {
    id: 'wolves_follow_smoke', text: 'Wolves follow the scent of smoke.', short: 'Wolves follow smoke', icon: 'skull',
    spec: getRule('wolves_follow_smoke'), regions: ['wild'], electorate: { wild: regions3 }, ritual: 'burn_smoke', contradicts: ['wolves_fear_smoke'], rival: true, adoptable: true, unlockDay: 3,
    benefit: 'Where it is believed, packs head for the nearest burning fire. Light a decoy deep in the wood and the wolves go there instead of to your pens.',
    risk: 'If a hamlet’s own hearth is burning, the wolves come straight to it. Garrick says it. You can use it or fight it.',
    flavor: 'Garrick Thorn’s hard-won theory.', startsAvailable: false,
  },
  {
    id: 'illness_fears_open_doors', text: 'Sickness fears an open door.', short: 'Sickness fears open doors', icon: 'rain',
    spec: getRule('illness_fears_open_doors'), regions: regions3, contradicts: [],
    benefit: 'Where it is believed, people near smoke fall sick about half as often. Lets you burn more fires.',
    risk: 'Open doors let the cold in: the weak lose a little health every night.',
    flavor: 'Let the air through and the cough goes out.', startsAvailable: false, unlockDay: 3,
  },
];

const rituals: RitualDef[] = [
  { id: 'burn_smoke', label: 'Light the smoke-fire', verb: 'Light', landmark: 'campfire', ap: 1, fuel: 2, witnessRadius: 6, strength: 24, omen: 'pack_quiet', physical: 'smoke', desc: 'Costs 2 fuel. Burns 3 nights. As proof it is most convincing when the wolves stay away that night.' },
];

const th = (day: number, pack: number, trend: ThreatDay['trend'], label: string, warning?: string): ThreatDay => ({ day, level: 0, rain: 0, wind: 1, heat: 1, pack, trend, label, warning });
const threat: ThreatDay[] = [
  th(1, 0, 'steady', 'A hush in the mist'),
  th(2, 1, 'rising', 'Howling in the east', 'Cobb: "Grey is on the move. One pack, three miles off, and it is hungry."'),
  th(3, 1, 'steady', 'Tracks around the pens'),
  th(4, 2, 'rising', 'A second pack answers', 'Gorm: "Black has joined the hunt from the west. Two packs now."'),
  th(5, 2, 'steady', 'Fog thickens'),
  th(6, 3, 'rising', 'All three packs hunt', 'Brann: "Red came down from the south. Every hamlet is a target tonight."'),
  th(7, 3, 'steady', 'The worst night'),
  th(8, 2, 'ebbing', 'The packs tire', 'Linnet: "They are leaving. If we hold tonight, we hold the winter."'),
];

const runtime: ScenarioRuntime = {
  id: 'ashwood',
  version: 1,
  name: 'The Wolves of Ashwood',
  tagline: 'Three hamlets. Three packs. Smoke protects, smoke sickens, and a hunter has a theory.',
  briefing: [
    'Ashwood is three hamlets in a mist-covered wood, and none of them trusts the others.',
    'The packs are coming, one by one. A hamlet that believes the wolves fear smoke can keep them off — but smoke sickens the people it protects.',
    'Garrick the hunter says wolves follow smoke. He might be a nuisance. Or he might be useful.',
  ],
  durationDays: 8,
  threatKind: 'wolves',
  claimDefs,
  rituals,
  threat,
  objectives: [
    { id: 'livestock', label: 'At least 9 of 14 animals alive', metric: 'livestock', op: '>=', value: 9, required: true },
    { id: 'survivors', label: 'At least 11 of 13 villagers alive', metric: 'alive', op: '>=', value: 11, required: true },
    { id: 'sick', label: 'No more than 3 people sick on the last day', metric: 'sick', op: '<=', value: 3, required: true },
    { id: 'collapse', label: 'Never fewer than 9 alive', metric: 'alive', op: '>=', value: 9, required: false, instantLoss: true },
    { id: 'heroic', label: 'Heroic: 12+ animals alive', metric: 'livestock', op: '>=', value: 12, required: false, heroic: true },
  ],
  rivals: [{ factionId: 'hunters', claim: 'wolves_follow_smoke', watches: 'wolves_fear_smoke', trigger: 0.3, telegraph: 1, budget: 3, cooldown: 2, leader: 'garrick' }],
  beats: [
    { id: 'first_spread', when: { kind: 'first_belief' }, title: 'It begins to travel', text: 'Hamlets are far apart. Only a few people walk between them: the trader, the hunter, the healer.', once: true },
    { id: 'hunter', when: { kind: 'rival_telegraph' }, title: 'The hunter has a theory', text: 'Garrick is spreading his own story. It contradicts yours, and it is not entirely wrong.', once: true },
    { id: 'hearth', when: { kind: 'sick_at_least', arg: 1 }, title: 'The cough', text: 'Smoke is already a trouble for the healer. Fewer fires, or a story about open doors, will help.', once: true },
  ],
  features: { smoke: true, wolves: true },
  consts: { fuelPerDay: 1 },
  score: { survivors: 400, homes: 0, food: 0, trust: 80, efficiency: 6, bonus: 150 },
  difficulty: 3,
  anchor: 'market',
  starters: ['wolves_fear_smoke', 'wolves_follow_smoke'],
  finale: 'the wolf winter',
  hints: [
    'The packs advance a little each night. Watch the Tonight tab: it says which pen each pack is heading for.',
    'A fire only protects the pens inside its smoke, and only in a hamlet that believes.',
    'Rook, Garrick and Ysolde are the people who walk between the hamlets. Reach the others through them.',
    'A decoy fire deep in the wood draws wolves, if people believe Garrick’s story.',
  ],
  hud: ['alive', 'livestock', 'sick', 'fuel'],
};

export const ashwood: ScenarioDef = {
  runtime,
  map,
  villagers,
  edges,
  factions,
  ap: { start: 3, perDay: 3, max: 5 },
  jitter: new Array<number>(8).fill(0),
};
