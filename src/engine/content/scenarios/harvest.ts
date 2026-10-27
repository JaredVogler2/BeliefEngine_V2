import type { ClaimDef, Faction, RitualDef, ScenarioRuntime, ThreatDay } from '../../core/types.ts';
import { getRule } from '../../laws/rules.ts';
import type { LandmarkDef, MapDef } from '../../world/build.ts';
import type { EdgeDef, ScenarioDef, VillagerDef } from '../types.ts';

/**
 * Scenario B - The Harvest That Refused to Grow. A dry valley must feed itself before day 9.
 * New wrinkles: crops and moisture, hunger and labour, and a merchant who wants proof before she shares grain.
 */

const field = (id: string, name: string, x0: number, y0: number, g: number, m: number, y: number): LandmarkDef => {
  const tiles: [number, number][] = [];
  for (let yy = y0; yy < y0 + 3; yy++) for (let xx = x0; xx < x0 + 3; xx++) tiles.push([xx, yy]);
  return { id, kind: 'field', name, x: x0 + 1, y: y0 + 1, tiles, data: { yield: y, growth: g, moisture: m } };
};

const map: MapDef = {
  w: 26,
  h: 16,
  ops: [
    { op: 'grad', rect: [0, 0, 25, 15], axis: 'x', from: 2, to: 5 },
    { op: 'terrain', rect: [11, 0, 12, 15], t: 'SAND' },
    { op: 'terrain', rect: [18, 0, 25, 15], t: 'HILL' },
    { op: 'terrain', rect: [0, 13, 5, 15], t: 'FOREST' },
    { op: 'terrain', rect: [20, 11, 25, 15], t: 'FOREST' },
    { op: 'terrain', rect: [5, 7, 25, 7], t: 'ROAD' },
    { op: 'terrain', rect: [1, 2, 3, 4], t: 'FIELD' },
    { op: 'terrain', rect: [1, 10, 3, 12], t: 'FIELD' },
    { op: 'terrain', rect: [14, 0, 16, 2], t: 'FIELD' },
    { op: 'terrain', rect: [14, 12, 16, 14], t: 'FIELD' },
  ],
  regions: [
    { id: 'valley', name: 'The Valley', rects: [[0, 0, 17, 15]] },
    { id: 'hillside', name: 'The Hillside', rects: [[18, 0, 25, 15]] },
  ],
  stocks: { food: 24, fuel: 4 },
  landmarks: [
    { id: 'h_fenn', kind: 'home', name: 'Fenn Farmhouse', x: 5, y: 6 },
    { id: 'h_quill', kind: 'home', name: "Reeve's House", x: 8, y: 6 },
    { id: 'h_thorn', kind: 'home', name: "Thorn's Cottage", x: 13, y: 6 },
    { id: 'h_anselm', kind: 'home', name: 'Bell Lodge', x: 15, y: 6 },
    { id: 'h_vale', kind: 'home', name: "Healer's House", x: 6, y: 9 },
    { id: 'h_hobb', kind: 'home', name: "Well-warden's House", x: 9, y: 10 },
    { id: 'h_esk', kind: 'home', name: "Granny Esk's House", x: 4, y: 9 },
    { id: 'h_dalia', kind: 'home', name: "Dalia's Counting-house", x: 13, y: 10 },
    { id: 'h_cole', kind: 'home', name: 'Mill House', x: 16, y: 9 },
    { id: 'cabin', kind: 'cabin', name: "Sedge's Hut", x: 22, y: 3 },
    { id: 'granary', kind: 'granary', name: 'Valley Granary', x: 10, y: 4 },
    { id: 'hall', kind: 'hall', name: 'Reeve Hall', x: 7, y: 4 },
    { id: 'chapel', kind: 'chapel', name: 'Chapel Green', x: 14, y: 4 },
    { id: 'bell', kind: 'belltower', name: 'Bell Tower', x: 15, y: 3 },
    { id: 'market', kind: 'market', name: 'Ford Market', x: 12, y: 8 },
    { id: 'well', kind: 'well', name: 'The Old Well', x: 9, y: 8 },
    { id: 'mill', kind: 'mill', name: "Cole's Mill", x: 17, y: 10 },
    { id: 'road', kind: 'road', name: 'Hillside Road', x: 21, y: 7, tiles: [[18, 7], [19, 7], [20, 7], [21, 7], [22, 7], [23, 7], [24, 7], [25, 7]], data: { blockedUntil: -1 } },
    field('f_a', 'Terrace Wheat', 1, 2, 38, 30, 7),
    field('f_b', 'South Terrace', 1, 10, 30, 22, 7),
    field('f_c', 'Ford Barley', 14, 0, 42, 34, 7),
    field('f_d', 'Eastside Rye', 14, 12, 26, 20, 7),
  ],
};

const villagers: VillagerDef[] = [
  { id: 'marta', name: 'Marta Quill', role: 'Reeve', archetype: 'reeve', faction: 'council', household: 'quill', home: 'h_quill', work: 'granary', trust: 28, want: 'Wants an honest tally and nobody hungry before the audit.', look: { hue: 280, skin: 2, hair: 1, hat: 4, build: 1 } },
  { id: 'odo', name: 'Odo Fenn', role: 'Farmer', archetype: 'farmer', faction: 'growers', household: 'fenn', home: 'h_fenn', work: 'f_a', trust: 40, want: 'Will not watch his terrace wheat die. Owes the granary two sacks.', look: { hue: 90, skin: 2, hair: 3, hat: 2, build: 2 } },
  { id: 'wilma', name: 'Wilma Fenn', role: 'Mother', archetype: 'parent', faction: 'growers', household: 'fenn', home: 'h_fenn', work: 'f_b', trust: 50, want: 'Would try any rite if it fed Pim.', look: { hue: 350, skin: 1, hair: 1, hat: 0, build: 1 } },
  { id: 'pim', name: 'Pim Fenn', role: 'Child', archetype: 'child', faction: 'growers', household: 'fenn', home: 'h_fenn', work: 'well', trust: 58, want: 'Counts the days since the last rain.', look: { hue: 40, skin: 2, hair: 2, hat: 0, build: 0 } },
  { id: 'tobias', name: 'Tobias Reed', role: 'Farmhand', archetype: 'witness_truster', faction: 'growers', household: 'fenn', home: 'h_fenn', work: 'f_c', trust: 52, want: 'Believes what he sees. Sleeps in the Fenn barn.', look: { hue: 150, skin: 2, hair: 0, hat: 2, build: 1 } },
  { id: 'esk', name: 'Granny Esk', role: 'Elder', archetype: 'elder', faction: 'storykeepers', household: 'esk', home: 'h_esk', work: 'f_a', trust: 34, want: 'Remembers the rain songs. Trusts them more than the Reeve’s ledger.', look: { hue: 30, skin: 3, hair: 4, hat: 3, build: 2 } },
  { id: 'lark', name: 'Lark', role: 'Orphan', archetype: 'child', faction: 'storykeepers', household: 'esk', home: 'h_esk', work: 'well', trust: 62, want: 'Follows Granny Esk everywhere and repeats whatever she says.', look: { hue: 320, skin: 1, hair: 0, hat: 0, build: 0 } },
  { id: 'anselm', name: 'Brother Anselm', role: 'Bell-keeper', archetype: 'ringer', faction: 'storykeepers', household: 'anselm', home: 'h_anselm', work: 'bell', trust: 60, want: 'The bells called rain once, in his grandfather’s day. He rings them every dawn.', look: { hue: 25, skin: 2, hair: 4, hat: 6, build: 1 } },
  { id: 'dalia', name: 'Dalia Voss', role: 'Grain trader', archetype: 'trader', traits: { skepticism: 62, susceptibility: 38 }, faction: 'council', household: 'voss', home: 'h_dalia', work: 'market', trust: 30, want: 'Her caravans can feed the valley. She will not risk them on a lost cause.', look: { hue: 60, skin: 2, hair: 2, hat: 5, build: 1 } },
  { id: 'ferris', name: 'Ferris Cole', role: 'Miller', archetype: 'rival', faction: 'millers', household: 'cole', home: 'h_cole', work: 'mill', trust: 12, want: 'Swears moon-work sours the grain. Has the ledgers to prove it.', look: { hue: 220, skin: 3, hair: 3, hat: 0, build: 2 } },
  { id: 'imre', name: 'Dr. Imre Vale', role: 'Healer', archetype: 'scholar', faction: 'millers', household: 'vale', home: 'h_vale', work: 'h_vale', trust: 30, want: 'Will believe a field he has measured himself, and nothing less.', look: { hue: 170, skin: 1, hair: 3, hat: 0, build: 1 } },
  { id: 'nessa', name: 'Nessa Thorn', role: 'Storyteller', archetype: 'preacher', faction: 'storykeepers', household: 'thorn', home: 'h_thorn', work: 'chapel', trust: 70, want: 'Tells the old harvest tales at the chapel. People listen when she does.', look: { hue: 18, skin: 2, hair: 1, hat: 1, build: 1 } },
  { id: 'hobb', name: 'Hobb Barley', role: 'Well-warden', archetype: 'keeper', faction: 'council', household: 'hobb', home: 'h_hobb', work: 'well', trust: 44, want: 'Measures the well each dawn. Tells nobody how low it is.', look: { hue: 200, skin: 1, hair: 2, hat: 0, build: 1 } },
  { id: 'sedge', name: 'Sedge Marrow', role: 'Shepherd', archetype: 'hermit', faction: 'growers', household: 'sedge', home: 'cabin', work: 'cabin', trust: 30, want: 'Lives on the hillside. Sees the weather first, and tells only Granny Esk.', look: { hue: 260, skin: 1, hair: 4, hat: 3, build: 0 } },
];

const e = (a: string, b: string, ab: number, ba: number, rate: number, kind: EdgeDef['kind']): EdgeDef => ({ a, b, ab, ba, rate, kind });

const edges: EdgeDef[] = [
  e('odo', 'wilma', 90, 90, 0.95, 'household'), e('odo', 'pim', 88, 90, 0.9, 'household'), e('wilma', 'pim', 92, 92, 0.95, 'household'),
  e('tobias', 'odo', 72, 62, 0.75, 'work'), e('tobias', 'wilma', 60, 60, 0.5, 'household'),
  e('esk', 'lark', 90, 90, 0.95, 'household'), e('esk', 'nessa', 70, 60, 0.55, 'friend'), e('esk', 'anselm', 65, 60, 0.5, 'friend'),
  e('esk', 'sedge', 55, 50, 0.3, 'kin'), e('esk', 'odo', 55, 60, 0.45, 'neighbor'),
  e('nessa', 'anselm', 70, 65, 0.55, 'faction'), e('nessa', 'wilma', 60, 65, 0.5, 'friend'), e('nessa', 'lark', 55, 70, 0.4, 'friend'),
  e('nessa', 'dalia', 40, 45, 0.35, 'trade'), e('nessa', 'hobb', 45, 45, 0.35, 'neighbor'),
  e('pim', 'lark', 85, 85, 0.8, 'friend'), e('odo', 'hobb', 45, 40, 0.4, 'neighbor'),
  e('marta', 'hobb', 60, 55, 0.5, 'work'), e('marta', 'dalia', 55, 50, 0.45, 'work'), e('marta', 'odo', 40, 45, 0.4, 'work'),
  e('marta', 'imre', 55, 60, 0.4, 'faction'), e('marta', 'ferris', 50, 55, 0.35, 'faction'),
  e('dalia', 'ferris', 50, 45, 0.45, 'trade'), e('dalia', 'odo', 45, 40, 0.4, 'trade'), e('dalia', 'hobb', 40, 40, 0.3, 'neighbor'),
  e('dalia', 'anselm', 40, 40, 0.3, 'neighbor'),
  e('ferris', 'imre', 55, 60, 0.5, 'faction'), e('ferris', 'esk', -35, -30, 0.3, 'rival'), e('ferris', 'nessa', -45, -40, 0.35, 'rival'),
  e('imre', 'wilma', 55, 60, 0.4, 'friend'), e('imre', 'esk', 45, 55, 0.35, 'friend'), e('imre', 'hobb', 45, 45, 0.3, 'neighbor'),
  e('hobb', 'anselm', 40, 40, 0.3, 'neighbor'), e('sedge', 'tobias', 40, 45, 0.2, 'friend'),
];

const factions: Faction[] = [
  { id: 'council', name: 'Valley Council', kind: 'council', leader: 'marta', color: '#d4a72c', priorities: 'An honest tally and fair rations.', trustInKeeper: 30, budget: 2, cooldownUntil: 0, grievance: 0 },
  { id: 'millers', name: "Millers' Guild", kind: 'scholars', leader: 'ferris', color: '#5fa8d3', priorities: 'Measure first. Believe later.', trustInKeeper: 15, budget: 3, cooldownUntil: 0, grievance: 0 },
  { id: 'storykeepers', name: 'Song-keepers', kind: 'storykeepers', leader: 'nessa', color: '#e07a5f', priorities: 'The old songs knew the rain.', trustInKeeper: 62, budget: 2, cooldownUntil: 0, grievance: 0 },
  { id: 'growers', name: 'Terrace Growers', kind: 'hearth', leader: 'odo', color: '#81b29a', priorities: 'Bring the crop in.', trustInKeeper: 40, budget: 2, cooldownUntil: 0, grievance: 0 },
];

const claimDefs: ClaimDef[] = [
  {
    id: 'moonlight_ripens_grain', text: 'Moonlight ripens grain.', short: 'Moonlight ripens grain', icon: 'moon',
    spec: getRule('moonlight_ripens_grain'), regions: ['valley'], ritual: 'moonlit_work', contradicts: ['moon_sours_grain'],
    benefit: 'While the valley believes, every field ripens about 18% faster each night, moisture or no.',
    risk: 'Field workers who keep the law labour all night: they lose energy and health, and after a few nights cannot work the fields.',
    flavor: 'Work by moonlight, and the wheat remembers the sun.', startsAvailable: false, unlockDay: 3,
  },
  {
    id: 'rain_follows_bells', text: 'Rain answers the village bells.', short: 'Rain answers the bells', icon: 'bell',
    spec: getRule('rain_follows_bells'), regions: ['valley'], ritual: 'ring_bells', contradicts: [], params: { sink: 'hillside' },
    benefit: 'On nights the bells ring, the valley’s fields drink 2 extra steps of rain, which also makes crops grow faster.',
    risk: 'The water is drawn off the hillside: it slides down and buries the Hillside Road in mud for two days, stopping any grain caravan.',
    flavor: 'Ring true, and the sky turns its face.', startsAvailable: false, unlockDay: 3,
  },
  {
    id: 'moon_sours_grain', text: 'Moonlit grain turns bitter.', short: 'Moonlit grain turns bitter', icon: 'skull',
    spec: getRule('moon_sours_grain'), regions: ['valley'], contradicts: ['moonlight_ripens_grain'], rival: true,
    benefit: 'Rival rumour: if the valley believes it, moonlit work stunts the crop instead.', risk: 'Wrecks your moonlight law.',
    flavor: 'Ferris Cole’s answer.', startsAvailable: false,
  },
];

const rituals: RitualDef[] = [
  { id: 'moonlit_work', label: 'Work the field by moonlight', verb: 'Labour', landmark: 'field', ap: 1, fuel: 0, witnessRadius: 7, strength: 26, omen: 'moon_clear', physical: 'night_labor', desc: 'People labour all night in one field. Convincing proof on a clear night.' },
  { id: 'ring_bells', label: 'Ring the bells', verb: 'Ring', landmark: 'belltower', ap: 1, fuel: 0, witnessRadius: 8, strength: 24, omen: 'rain_tonight', physical: 'ring', desc: 'Rings tonight only. Convincing proof when rain is forecast.' },
];

const th = (day: number, level: number, rain: number, heat: number, trend: ThreatDay['trend'], label: string, warning?: string): ThreatDay => ({ day, level, rain, wind: 1, heat, pack: 0, trend, label, warning });
const threat: ThreatDay[] = [
  th(1, 3, 0, 2, 'steady', 'Cracked earth under a clear sky'),
  th(2, 3, 0, 1, 'steady', 'The well drops a hand', 'Hobb: "Nine days of water at this rate. Eleven if nobody washes."'),
  th(3, 4, 0, 2, 'rising', 'Dust devils on the terraces'),
  th(4, 3, 1, 1, 'ebbing', 'A tease of rain from the north', 'Sedge from the hillside: "Clouds. Maybe tomorrow. Maybe not."'),
  th(5, 4, 0, 2, 'steady', 'The sixth dry day', 'Dalia: "My caravans will not come unless they see the valley is worth saving."'),
  th(6, 4, 0, 2, 'steady', 'Wheat bows to the dust'),
  th(7, 3, 2, 1, 'ebbing', 'A storm gathers over the hills', 'Esk: "The song says: ring when the sky leans."'),
  th(8, 3, 0, 2, 'steady', 'Last chance to bring it in', 'Marta: "Whatever stands tomorrow night is all we have."'),
  th(9, 3, 0, 2, 'steady', 'Harvest day'),
];

const runtime: ScenarioRuntime = {
  id: 'harvest',
  version: 1,
  name: 'The Harvest That Refused to Grow',
  tagline: 'Nine dry days. Fourteen mouths. Moonlight, bells, and a merchant who wants proof.',
  briefing: [
    'The valley has had no rain for six weeks. The granary will not last the month.',
    'Two old stories might feed it: that moonlight ripens grain, and that rain answers the bells. Each has a price.',
    'Dalia the grain trader could save everyone with a caravan — but she wants proof the valley is worth saving.',
  ],
  durationDays: 9,
  threatKind: 'drought',
  claimDefs,
  rituals,
  threat,
  objectives: [
    { id: 'survivors', label: 'At least 12 of 14 villagers alive', metric: 'alive', op: '>=', value: 12, required: true },
    { id: 'collapse', label: 'Never fewer than 9 alive', metric: 'alive', op: '>=', value: 9, required: false, instantLoss: true },
    { id: 'fed', label: 'At least 12 villagers not hungry', metric: 'fed', op: '>=', value: 12, required: true },
    { id: 'food', label: 'At least 3 food left in the granary', metric: 'food', op: '>=', value: 3, required: true },
    { id: 'heroic', label: 'Heroic: everyone alive', metric: 'alive', op: '>=', value: 14, required: false, heroic: true },
  ],
  rivals: [{ factionId: 'millers', claim: 'moon_sours_grain', watches: 'moonlight_ripens_grain', trigger: 0.3, telegraph: 1, budget: 3, cooldown: 2, leader: 'ferris', sabotage: { deal: 'caravan', delay: 2 } }],
  beats: [
    { id: 'first_spread', when: { kind: 'first_belief' }, title: 'It begins to travel', text: 'Watch who repeats it. Children repeat what elders say.', once: true },
    { id: 'low_food', when: { kind: 'food_below', arg: 8 }, title: 'The granary is thinning', text: 'Rations are about to run short. Grain must come from the fields or from a caravan.', once: true },
    { id: 'osric', when: { kind: 'rival_telegraph' }, title: 'The miller is stirring', text: 'Ferris is preparing an answer to your story. Challenge it with the people he will target.', once: true },
  ],
  features: { crops: true, trade: true },
  consts: { growBase: 5, dryRate: 5 },
  score: { survivors: 400, homes: 0, food: 15, trust: 80, efficiency: 6, bonus: 150 },
  difficulty: 3,
  anchor: 'chapel',
  starters: ['moonlight_ripens_grain', 'rain_follows_bells'],
  finale: 'the long dry season',
  hints: [
    'Fields ripen faster when they have moisture, and much faster by moonlight, but night labour exhausts people.',
    'Dalia will only send grain once she firmly believes one of your stories. Show her something she can see.',
    'Ringing the bells draws rain but buries the Hillside Road, which blocks the caravans.',
    'Children repeat what Granny Esk says. Granny Esk trusts Nessa.',
  ],
  deals: [
    { id: 'caravan', label: 'Ask Dalia to send for a grain caravan', ap: 1, broker: 'dalia', minConviction: 58, food: 10, delay: 2, limit: 2, via: 'road', desc: 'Dalia sends 10 food in 2 days if the Hillside Road is clear. Up to 2 shipments, and only once she firmly believes.' },
  ],
  hud: ['alive', 'food', 'fed', 'fuel'],
};

export const harvest: ScenarioDef = {
  runtime,
  map,
  villagers,
  edges,
  factions,
  ap: { start: 3, perDay: 3, max: 5 },
  jitter: new Array<number>(9).fill(0),
};
