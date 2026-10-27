import type { LandmarkKind } from '../core/types.ts';

/**
 * The world vocabulary of the Generative Reality language, taken from what the simulation really holds. Every kind of thing a
 * belief may name is listed with how far the game can honour it:
 *
 *  - `simulated`: the engine has state for it, rules that change it, and it is drawn;
 *  - `logical`: the engine has state for it and rules can read it, but it is not changed on its own terms or not drawn;
 *  - `unsupported`: the game has no such thing. A belief about it is refused or partly read with that clause omitted, never
 *    quietly turned into something else.
 *
 * Nothing in this file executes. Operators (operators.ts) decide what a change means; this file says what exists.
 */

export const REALITY_LANG = 'reality-1';

export type Support = 'simulated' | 'logical' | 'unsupported';

export type TargetKind =
  | 'water'
  | 'rain'
  | 'bridge'
  | 'home'
  | 'field'
  | 'fire'
  | 'smoke'
  | 'wolf'
  | 'villager'
  | 'chicken'
  | 'stone'
  | 'lantern'
  | 'bell'
  | 'livestock';

export type PropertyId = 'altitude' | 'position' | 'mass' | 'wetness' | 'durability' | 'flammability' | 'heat' | 'spread' | 'growth' | 'flow' | 'level' | 'light' | 'visibility' | 'speed' | 'health' | 'fear' | 'labor' | 'count';

export interface PropertyDef {
  id: PropertyId;
  label: string;
  unit: string;
  min: number;
  max: number;
}

/** Physical and social properties with their units and legal ranges. */
export const PROPERTIES: Record<PropertyId, PropertyDef> = {
  altitude: { id: 'altitude', label: 'height above the ground', unit: 'tiles', min: 0, max: 3 },
  position: { id: 'position', label: 'place on the map', unit: 'tile', min: 0, max: 0 },
  mass: { id: 'mass', label: 'weight', unit: 'loads (1 = a basket, 3 = what one person can carry, 5 = immovable)', min: 0, max: 5 },
  wetness: { id: 'wetness', label: 'wetness', unit: 'level (0 dry, 1 damp, 2 soaked)', min: 0, max: 2 },
  durability: { id: 'durability', label: 'how much damage it shrugs off', unit: 'share of damage prevented', min: -0.5, max: 0.9 },
  flammability: { id: 'flammability', label: 'how readily it burns', unit: 'multiplier', min: 0.2, max: 3 },
  heat: { id: 'heat', label: 'how hot flames burn', unit: 'share of fire damage', min: -0.5, max: 0.8 },
  spread: { id: 'spread', label: 'how fast fire spreads', unit: 'multiplier', min: 0.2, max: 2 },
  growth: { id: 'growth', label: 'how fast crops ripen', unit: 'percent per night', min: -30, max: 60 },
  flow: { id: 'flow', label: 'where floodwater goes', unit: 'tiles of ground raised (+) or lowered (-)', min: -3, max: 3 },
  level: { id: 'level', label: 'river level', unit: 'steps', min: -3, max: 3 },
  light: { id: 'light', label: 'how far lantern light reaches', unit: 'tiles', min: 0, max: 3 },
  visibility: { id: 'visibility', label: 'how easily wolves find homes and pens', unit: 'tiles of cover', min: -3, max: 3 },
  speed: { id: 'speed', label: 'how fast it moves', unit: 'multiplier', min: 0.2, max: 2 },
  health: { id: 'health', label: 'health', unit: 'points', min: 0, max: 100 },
  fear: { id: 'fear', label: 'fear', unit: 'points', min: 0, max: 100 },
  labor: { id: 'labor', label: 'exhaustion from night work', unit: 'points', min: 0, max: 100 },
  count: { id: 'count', label: 'how many there are', unit: 'animals', min: 0, max: 24 },
};

export interface KindDef {
  id: TargetKind;
  label: string;
  /** what a person calls it (singular; plurals are matched by the reader) */
  words: string[];
  support: Support;
  properties: PropertyId[];
  /** the scenario feature the kind needs to exist in a run (a village without wolves has no wolves) */
  needs?: 'flood' | 'fire' | 'bridge' | 'bells' | 'crops' | 'wolves' | 'smoke' | 'reality';
  /** the landmark kinds that are this thing */
  landmarks?: LandmarkKind[];
  movable?: boolean;
  /** what it is in this game, for previews */
  note: string;
}

export const KINDS: Record<TargetKind, KindDef> = {
  water: { id: 'water', label: 'floodwater', words: ['river', 'water', 'floodwater', 'flood', 'stream', 'current', 'tide', 'surge', 'creek', 'torrent'], support: 'simulated', properties: ['flow', 'level', 'speed'], needs: 'flood', note: 'the river and its flood, computed over the terrain every night' },
  rain: { id: 'rain', label: 'rain', words: ['rain', 'cloud', 'storm', 'drizzle', 'downpour', 'shower', 'raindrop'], support: 'simulated', properties: ['level'], note: 'the night\'s rain: it raises the river or waters the fields' },
  bridge: { id: 'bridge', label: 'the bridge', words: ['bridge', 'crossing', 'span', 'footbridge', 'deck'], support: 'simulated', properties: ['durability'], needs: 'bridge', landmarks: ['bridge'], note: 'the one crossing between the banks; floods batter it' },
  home: { id: 'home', label: 'homes', words: ['home', 'house', 'cottage', 'cabin', 'roof', 'dwelling', 'hut'], support: 'simulated', properties: ['durability', 'flammability', 'visibility'], landmarks: ['home', 'cabin'], note: 'wooden homes that floods, fire and wolves threaten' },
  field: { id: 'field', label: 'fields and crops', words: ['field', 'crop', 'grain', 'wheat', 'barley', 'orchard', 'harvest', 'corn', 'garden', 'farm'], support: 'simulated', properties: ['growth', 'flammability'], landmarks: ['field'], note: 'fields whose crops ripen, flood, burn or dry out' },
  fire: { id: 'fire', label: 'fire', words: ['fire', 'flame', 'blaze', 'ember', 'inferno', 'wildfire', 'spark'], support: 'simulated', properties: ['heat', 'spread'], needs: 'fire', note: 'fire that catches from beacons and spreads through fuel' },
  smoke: { id: 'smoke', label: 'smoke', words: ['smoke', 'haze', 'smog', 'fume'], support: 'logical', properties: ['visibility'], needs: 'smoke', note: 'smoke from campfires; it hurts lungs and hides things' },
  wolf: { id: 'wolf', label: 'wolves', words: ['wolf', 'pack', 'hound', 'predator', 'beast'], support: 'simulated', properties: ['position', 'speed'], needs: 'wolves', movable: true, note: 'packs that hunt pens and people at night' },
  villager: { id: 'villager', label: 'villagers', words: ['villager', 'people', 'person', 'folk', 'neighbor', 'neighbour', 'farmer', 'child', 'everyone', 'man', 'woman', 'worker'], support: 'simulated', properties: ['health', 'fear', 'labor'], note: 'the people of the village: a belief can change what they feel or suffer, never what they believe' },
  chicken: { id: 'chicken', label: 'chickens', words: ['chicken', 'hen', 'rooster', 'chick', 'poultry', 'cockerel', 'fowl'], support: 'simulated', properties: ['altitude', 'position', 'count'], needs: 'reality', movable: true, note: 'flocks kept in coops by the homes; they lay eggs, drown in floods and fall to wolves' },
  stone: { id: 'stone', label: 'loose stones', words: ['stone', 'rock', 'boulder', 'cobble', 'pebble'], support: 'simulated', properties: ['mass', 'wetness', 'position'], needs: 'reality', movable: true, note: 'loose stones by the river; light enough ones get hauled onto the bank, and floods can carry them' },
  lantern: { id: 'lantern', label: 'lanterns and beacons', words: ['lantern', 'lamp', 'beacon', 'torch', 'lamplight', 'light'], support: 'simulated', properties: ['light'], landmarks: ['beacon'], note: 'beacons that the Keeper lights; they burn fuel' },
  bell: { id: 'bell', label: 'the bells', words: ['bell', 'belltower', 'chime', 'carillon'], support: 'logical', properties: [], needs: 'bells', landmarks: ['belltower'], note: 'the bell tower; ringing it is a ritual, and its sound can power a belief' },
  livestock: { id: 'livestock', label: 'penned animals', words: ['sheep', 'goat', 'cow', 'cattle', 'livestock', 'animal', 'herd', 'flock'], support: 'logical', properties: ['count'], needs: 'wolves', landmarks: ['pen'], note: 'animals in pens; wolves take them' },
};

/** Things people mention that this world does not contain. Each is named back to the player with its reason. */
export const ABSENT: { id: string; words: string[]; why: string }[] = [
  { id: 'time', words: ['time', 'yesterday', 'tomorrow', 'past', 'future', 'clock', 'hour', 'age', 'century'], why: 'the village cannot change time: days pass one by one and nothing can be undone' },
  { id: 'the_dead', words: ['dead', 'ghost', 'spirit', 'corpse', 'grave', 'soul'], why: 'the dead stay dead; no belief brings anyone back' },
  { id: 'metal', words: ['iron', 'metal', 'steel', 'gold', 'silver', 'copper', 'coin', 'money', 'treasure'], why: 'no metal or money is modelled in this village' },
  { id: 'shadow', words: ['shadow', 'shade', 'darkness'], why: 'shadows are only a picture here; nothing in the simulation is made of them' },
  { id: 'sky_bodies', words: ['sun', 'moon', 'star', 'comet'], why: 'the sun and moon are not things the village can change (a clear night can still power a belief)' },
  { id: 'monsters', words: ['dragon', 'giant', 'troll', 'demon', 'angel', 'god', 'fairy', 'witch', 'unicorn'], why: 'there are no such creatures in this world, and none can be summoned' },
  { id: 'minds', words: ['mind', 'thought', 'opinion', 'belief', 'faith', 'obey', 'worship', 'convince', 'persuade'], why: 'a belief cannot make people believe or obey: only the village\'s own conversations and evidence do that' },
  { id: 'sea', words: ['sea', 'ocean', 'lake', 'mountain', 'volcano', 'desert', 'island'], why: 'the valley has no such place' },
  { id: 'tools', words: ['sword', 'cart', 'wagon', 'bucket', 'basket', 'tool', 'hammer', 'axe', 'barrel'], why: 'tools and containers are not modelled as things that can change' },
  { id: 'game', words: ['game', 'player', 'score', 'level', 'cheat', 'code', 'system', 'prompt', 'developer'], why: 'a belief is about the village, not about the game itself' },
];

/** Landmark kinds a selector may measure distance from ("beside lanterns", "near the bridge"). */
export const ANCHORS: LandmarkKind[] = ['belltower', 'beacon', 'campfire', 'bridge', 'pen', 'home', 'field', 'chapel', 'hall', 'market', 'mill', 'well', 'granary', 'shelter'];

/** What each anchor is called in previews and refusals. */
export const ANCHOR_LABEL: Record<string, string> = {
  belltower: 'bell tower', beacon: 'lantern', campfire: 'smoke fire', bridge: 'bridge', pen: 'pen', home: 'home', field: 'field', chapel: 'chapel',
  hall: 'hall', market: 'market', mill: 'mill', well: 'well', granary: 'granary', shelter: 'shelter',
};

export const ANCHOR_WORDS: Record<string, string[]> = {
  belltower: ['bell', 'belltower', 'bell tower', 'tower'],
  beacon: ['lantern', 'beacon', 'lamp', 'torch', 'light'],
  campfire: ['campfire', 'smoke fire', 'hearth', 'bonfire'],
  bridge: ['bridge'],
  pen: ['pen', 'fold', 'paddock'],
  home: ['home', 'house', 'cottage'],
  field: ['field', 'orchard', 'farm', 'garden'],
  chapel: ['chapel', 'church', 'shrine', 'temple'],
  hall: ['hall'],
  market: ['market', 'square'],
  mill: ['mill'],
  well: ['well'],
  granary: ['granary', 'barn'],
  shelter: ['shelter'],
};

/** Which kinds a run actually contains: the scenario's features plus the reality entities of a generative run. */
export function kindAvailable(kind: TargetKind, features: Record<string, boolean>, landmarkKinds: Set<string>, reality: boolean): boolean {
  const k = KINDS[kind];
  if (k.support === 'unsupported') return false;
  if (k.needs === 'reality') return reality;
  if (k.needs === 'bells') return landmarkKinds.has('belltower');
  if (k.needs && !features[k.needs]) return false;
  if (k.landmarks && !k.landmarks.some((l) => landmarkKinds.has(l))) return false;
  return true;
}
