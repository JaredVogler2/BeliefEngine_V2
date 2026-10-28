import type { CondTest, Tag, TriggerEvent } from './ast.ts';
import type { TargetKind } from './ontology.ts';
import type { OpId } from './operators.ts';

/**
 * The offline reader's vocabulary (reader v2). Data only: which words name which kinds of thing, which phrases name which
 * operator, which name a trigger, a condition, a place, a strength, and which name something the village does not contain.
 * Words are matched with their common inflections (plural, -s, -ed, -ing), so each phrase is listed in its base form. Nothing here
 * is executed; `read.ts` decides what a sentence means from these lists, and `ast.ts` decides whether that meaning is allowed.
 */

export const READER_VERSION = 2;
export const READER_ID = `offline-v2.${READER_VERSION}`;

/** Names for each kind beyond KINDS[].words (which the reader also uses). */
export const KIND_WORDS: Partial<Record<TargetKind, string[]>> = {
  chicken: ['hen', 'chicken', 'chick', 'poultry', 'fowl', 'rooster', 'cockerel', 'pullet', 'brood', 'bird of the coop', 'egg', 'flock of hens'],
  stone: ['stone', 'rock', 'boulder', 'cobble', 'cobblestone', 'pebble', 'cobble stone'],
  water: ['river', 'water', 'floodwater', 'flood', 'stream', 'current', 'tide', 'surge', 'creek', 'torrent', 'rapids', 'waters'],
  rain: ['rain', 'cloud', 'storm', 'drizzle', 'downpour', 'shower', 'raindrop', 'thunder', 'rainfall', 'thunderstorm', 'raincloud', 'rain cloud', 'squall'],
  bridge: ['bridge', 'crossing', 'span', 'footbridge', 'planks', 'timber', 'timbers', 'the span'],
  home: ['home', 'house', 'cottage', 'cabin', 'roof', 'dwelling', 'hut', 'hovel', 'household', 'croft', 'homestead', 'lodge', 'longhouse', 'shack'],
  field: ['field', 'crop', 'grain', 'wheat', 'barley', 'rye', 'oat', 'orchard', 'harvest', 'corn', 'garden', 'farm', 'sheaf', 'plant', 'terrace', 'row', 'crop row', 'acre', 'paddy'],
  fire: ['fire', 'flame', 'blaze', 'ember', 'inferno', 'wildfire', 'spark'],
  wolf: ['wolf', 'wolves', 'pack', 'hound', 'predator', 'beast', 'the pack'],
  villager: ['villager', 'people', 'person', 'folk', 'neighbor', 'neighbour', 'farmer', 'child', 'children', 'everyone', 'man', 'men', 'woman', 'women', 'worker', 'family', 'the sick', 'the village', 'those who', 'whoever', 'anyone', 'farmhand', 'labourer', 'laborer', 'local', 'resident', 'townsfolk', 'hamlet folk', 'valley folk', 'the people', 'fisher', 'miller', 'smith', 'herder'],
  lantern: ['lantern', 'lamp', 'beacon', 'torch', 'lamplight', 'torchlight', 'lantern light', 'lantern glow'],
  livestock: ['pen', 'sheep', 'goat', 'cow', 'cattle', 'livestock', 'herd', 'animal'],
};

/** Words for sickness: a belief about sickness acts on the people it would strike (a status), never on a germ. */
export const ILLNESS_WORDS = ['sickness', 'illness', 'fever', 'plague', 'disease', 'cough', 'ailment', 'contagion', 'pestilence'];

/** Kinds whose words can also be the thing that powers a clause ("the bells make...", "smoke hides..."). */
export const SOURCE_EVENT: Partial<Record<string, TriggerEvent>> = { lantern: 'lantern', bell: 'bell', smoke: 'smoke_fire', rain: 'rain' };
export const SOURCE_WORDS: { event: TriggerEvent; words: string[] }[] = [
  { event: 'bell', words: ['bell', 'bells', 'belltower', 'bell tower', 'chime', 'carillon', 'tower bell', 'chapel bell'] },
  { event: 'lantern', words: ['lit lantern', 'lantern', 'lamp', 'beacon', 'torch', 'lamplight', 'torchlight', 'lantern light', 'lantern glow', 'burning lamp'] },
  { event: 'smoke_fire', words: ['smoke fire', 'smoke', 'woodsmoke', 'campfire', 'hearth smoke', 'smoke fires'] },
  { event: 'rain', words: ['rain', 'storm'] },
];

export type Dir = 1 | -1;

/**
 * A sense: one way a phrase can change a kind of thing. `params` are the operator's parameters other than strength; `mag` is the
 * operator parameter that carries strength (`magnitude`, `delta` or `count`) and its sign. `neg` says what the phrase means when
 * negated: another sense, `none` (nothing changes: the status quo), or `ask` (two readings; the player chooses).
 */
export interface Sense {
  id: string;
  op: OpId;
  kinds: TargetKind[];
  params: Record<string, string | number | boolean | null>;
  mag: 'magnitude' | 'delta' | 'count';
  dir: Dir;
  /** strength when the phrase itself says how much (weightless: 3) */
  strength?: number;
  phrases: string[];
  neg?: string | string[] | 'none' | 'ask';
  /** the phrase has two physical meanings here ("spared": from flood, or from fire?): the player chooses between these senses */
  ask?: string[];
  /** a promise of an outcome ("survives"): the belief can only make it likelier */
  guarantee?: boolean;
  /** the phrase asks for a destination place (rain falls "on the fields") */
  toward?: boolean;
  /** meaningful only negated ("no chicken drowns"); said plainly it names no change the language has */
  onlyNegated?: boolean;
}

export const SENSES: Sense[] = [
  // dynamics: chickens
  { id: 'lift', op: 'APPLY_FORCE', kinds: ['chicken'], params: { direction: 'up' }, mag: 'magnitude', dir: 1, neg: 'none',
    phrases: ['fly', 'flew', 'rose', 'fly up', 'take wing', 'take flight', 'take to the air', 'take to the sky', 'rise into the air', 'rise', 'soar', 'float up', 'lift', 'levitate', 'airborne', 'remember the sky', 'go up into the air', 'leap into the air', 'flutter up', 'drift up', 'lift off', 'off the ground', 'into the air', 'up into the air', 'hover', 'hoist', 'hoisted into the air', 'flap up', 'flutter skyward', 'skyward', 'up out of reach', 'take off', 'sail up', 'go airborne'] },
  { id: 'not_drown', op: 'APPLY_FORCE', kinds: ['chicken'], params: { direction: 'up' }, mag: 'magnitude', dir: 1, neg: 'ask', onlyNegated: true, phrases: ['drown'] },
  // materials: stone weight
  { id: 'lighter', op: 'SET_MATERIAL_PROPERTY', kinds: ['stone'], params: { property: 'mass' }, mag: 'delta', dir: -1, neg: 'heavier',
    phrases: ['light', 'become light', 'grow light', 'go light', 'turn light', 'lose their weight', 'lose its weight', 'forget their weight', 'forget its weight', 'buoyant', 'float', 'lighten'] },
  { id: 'weightless', op: 'SET_MATERIAL_PROPERTY', kinds: ['stone'], params: { property: 'mass' }, mag: 'delta', dir: -1, strength: 3, neg: 'heavier',
    phrases: ['weightless', 'feather light', 'featherlight', 'light as a feather', 'weigh nothing', 'weigh next to nothing', 'weigh almost nothing', 'next to nothing', 'as light as air', 'light as air'] },
  { id: 'lighter_comp', op: 'SET_MATERIAL_PROPERTY', kinds: ['stone'], params: { property: 'mass' }, mag: 'delta', dir: -1, strength: 1, neg: 'heavier', phrases: ['lighter'] },
  { id: 'heavier', op: 'SET_MATERIAL_PROPERTY', kinds: ['stone'], params: { property: 'mass' }, mag: 'delta', dir: 1, neg: 'lighter',
    phrases: ['heavy', 'heavier', 'grow heavy', 'leaden', 'turn leaden', 'weigh more', 'sink', 'immovable', 'weigh a ton', 'heavy as lead', 'heavier than', 'grow heavier'] },
  // materials: what burns
  { id: 'ignite', op: 'SET_MATERIAL_PROPERTY', kinds: ['home', 'field'], params: { property: 'flammability' }, mag: 'delta', dir: 1, neg: ['fireproof', 'damp'], phrases: ['catch fire', 'burn easily', 'burn readily', 'kindle', 'catch fire easily', 'go up in flames'] },
  { id: 'damp', op: 'SET_MATERIAL_PROPERTY', kinds: ['field', 'home'], params: { property: 'flammability' }, mag: 'delta', dir: -1, neg: 'ignite', phrases: ['slow to burn', 'hard to burn', 'hard to set alight', 'too damp to burn', 'fire resistant'] },
  { id: 'harder', op: 'SET_MATERIAL_PROPERTY', kinds: ['bridge', 'home'], params: { property: 'hardness' }, mag: 'delta', dir: 1, phrases: ['harder', 'hard as stone', 'hard as iron'] },
  // hydrology
  { id: 'repel_water', op: 'REDIRECT_FLOW', kinds: ['water'], params: { mode: 'repel' }, mag: 'magnitude', dir: 1, neg: 'none',
    phrases: ['turn away', 'turn aside', 'turn * aside', 'turn * away', 'flow away', 'shy away', 'steer clear', 'avoid', 'fear', 'keep away', 'stay away', 'recoil', 'retreat', 'bend away', 'veer away', 'part around', 'flee', 'hate', 'pull back', 'run from', 'flow around', 'pull * away', 'away from', 'keep * from', 'keep * out of', 'hold * back', 'hold back', 'give a wide berth', 'give * a wide berth', 'keep clear of', 'stay clear of', 'draw back', 'recede', 'stay back', 'ebb away'] },
  { id: 'attract_water', op: 'REDIRECT_FLOW', kinds: ['water'], params: { mode: 'attract' }, mag: 'magnitude', dir: -1, neg: 'none',
    phrases: ['bend toward', 'bend towards', 'flow toward', 'flow towards', 'drawn to', 'draw toward', 'follow', 'rush to', 'seek', 'love', 'come to', 'gather at', 'run toward', 'run towards', 'call more water to', 'call more water'] },
  { id: 'slow_water', op: 'REDIRECT_FLOW', kinds: ['water'], params: { mode: 'slow' }, mag: 'magnitude', dir: 1, neg: 'none',
    phrases: ['slow', 'slow down', 'calm', 'linger', 'creep', 'crawl', 'still', 'quiet', 'gentle', 'grow calm', 'slow to a crawl', 'sluggish', 'sluggish crawl', 'move slowly', 'ease off'] },
  { id: 'flood_verb', op: 'REDIRECT_FLOW', kinds: ['water'], params: { mode: 'attract' }, mag: 'magnitude', dir: -1, neg: 'repel_water', phrases: ['flood', 'overflow', 'spill over'] },
  // weather
  { id: 'rain_to', op: 'WEATHER_MODIFIER', kinds: ['rain'], params: { mode: 'attract' }, mag: 'magnitude', dir: -1, neg: 'rain_away', toward: true,
    phrases: ['fall on', 'fall onto', 'fall over', 'pour on', 'pour onto', 'come to', 'gather over', 'empty themselves over', 'empty over', 'bring * to', 'bring', 'pull * toward', 'pull toward', 'call * to', 'call', 'draw * to', 'draw', 'sing * onto', 'sing * to', 'drawn to', 'follow', 'onto', 'hunger for', 'long for', 'call * down onto', 'call * down on', 'bring * down on', 'steer * over', 'steer * onto', 'drift over', 'rain on', 'come down on', 'gather above'] },
  { id: 'rain_away', op: 'WEATHER_MODIFIER', kinds: ['rain'], params: { mode: 'redirect' }, mag: 'magnitude', dir: 1, neg: 'rain_to',
    phrases: ['pull away', 'pull * away', 'turn away', 'go elsewhere', 'divert', 'redirect', 'send away', 'send * away', 'push away', 'push * away', 'drive away', 'drive * away', 'keep away', 'keep * away', 'stay away', 'hold off', 'stop falling on', 'steer * off', 'steered off', 'blow * away', 'keep * off', 'stay off'] },
  { id: 'rain_stop', op: 'WEATHER_MODIFIER', kinds: ['rain'], params: { mode: 'repel' }, mag: 'magnitude', dir: 1, neg: 'none', phrases: ['stop', 'cease', 'dry up', 'end'] },
  { id: 'relocate', op: 'RELOCATE_RESOURCE', kinds: ['water'], params: { resource: 'water' }, mag: 'magnitude', dir: 1, toward: true, phrases: ['water the fields', 'irrigate', 'feed the fields', 'carried off to', 'carry * off to', 'carried to', 'sent to', 'flow off to', 'moved to', 'drawn off to'] },
  // structure
  { id: 'stronger', op: 'MODIFY_DURABILITY', kinds: ['bridge', 'home'], params: {}, mag: 'delta', dir: 1, neg: 'weaker',
    phrases: ['strong', 'stronger', 'grow strong', 'grow stronger', 'hold', 'hold firm', 'stand firm', 'stand', 'endure', 'sturdy', 'sturdier', 'unbreakable', 'stay standing', 'firm', 'steadfast', 'drink courage', 'stay dry', 'protected', 'safe from the flood', 'shrug off', 'withstand', 'resist', 'weather the flood', 'hold fast', 'stand fast', 'hold up', 'stay strong', 'tougher', 'stouter'] },
  { id: 'survive', op: 'MODIFY_DURABILITY', kinds: ['bridge', 'home'], params: {}, mag: 'delta', dir: 1, guarantee: true, phrases: ['survive', 'outlast'] },
  { id: 'weaker', op: 'MODIFY_DURABILITY', kinds: ['bridge', 'home'], params: {}, mag: 'delta', dir: -1, neg: 'stronger',
    phrases: ['weaken', 'weak', 'weaker', 'crack', 'crumble', 'break', 'fall', 'collapse', 'sag', 'groan', 'give way'] },
  // growth
  { id: 'grow', op: 'GROW_ENTITY', kinds: ['field'], params: {}, mag: 'magnitude', dir: 1, neg: 'decay',
    phrases: ['grow', 'grow faster', 'ripen', 'ripen faster', 'swell', 'swell faster', 'thrive', 'flourish', 'sprout', 'yield more', 'bloom', 'swell and ripen', 'ripen early', 'come up faster', 'shoot up', 'grow tall', 'ripen sooner', 'spring up'] },
  { id: 'decay', op: 'DECAY_ENTITY', kinds: ['field'], params: {}, mag: 'magnitude', dir: 1, neg: 'grow',
    phrases: ['wither', 'rot', 'sour', 'spoil', 'grow slower', 'shrivel', 'die', 'blight', 'grow slowly', 'slower', 'wilt', 'droop', 'sicken', 'blacken', 'fail', 'go bad', 'turn brown'] },
  // thermal
  { id: 'cooler', op: 'ALTER_TEMPERATURE', kinds: ['fire'], params: {}, mag: 'delta', dir: -1, neg: 'hotter',
    phrases: ['burn weaker', 'weaker', 'weaken', 'burn low', 'die down', 'sleep', 'cooler', 'colder', 'gentler', 'tame', 'tamer', 'smoulder', 'smolder', 'gutter', 'dwindle', 'burn cold', 'quieter', 'weak', 'burn cooler', 'burn gentler', 'burn softer', 'do less harm', 'lose their heat', 'lose its heat', 'cool'] },
  { id: 'hotter', op: 'ALTER_TEMPERATURE', kinds: ['fire'], params: {}, mag: 'delta', dir: 1, neg: 'cooler', phrases: ['burn hotter', 'hotter', 'fiercer', 'rage', 'roar', 'burn fiercer', 'hungrier', 'burn hot', 'blaze up', 'flare up', 'burn fierce'] },
  // movement
  { id: 'slower', op: 'MODIFY_MOVEMENT', kinds: ['fire', 'wolf'], params: {}, mag: 'delta', dir: -1, neg: 'faster',
    phrases: ['spread slowly', 'spread slower', 'crawl', 'slow', 'slow down', 'sluggish', 'tire', 'dawdle', 'creep', 'slow to a crawl', 'wading through mud', 'as though wading', 'drag their feet', 'move slowly', 'plod', 'lumber', 'move as though'] },
  { id: 'spread', op: 'MODIFY_MOVEMENT', kinds: ['fire'], params: {}, mag: 'delta', dir: 1, neg: 'slower', phrases: ['spread', 'spread faster', 'race', 'leap', 'quicken'] },
  { id: 'faster', op: 'MODIFY_MOVEMENT', kinds: ['wolf'], params: {}, mag: 'delta', dir: 1, neg: 'slower', phrases: ['faster', 'quicker', 'run faster', 'speed up', 'move faster', 'run quicker'] },
  // light
  { id: 'brighter', op: 'CHANGE_LIGHT', kinds: ['lantern'], params: {}, mag: 'delta', dir: 1, neg: 'dimmer',
    phrases: ['shine further', 'shine farther', 'shine twice as far', 'brighter', 'burn brighter', 'glow brighter', 'throw their glow further', 'reach further', 'double its light', 'double their light', 'light further', 'shine', 'cast * farther', 'cast * further', 'gleam farther', 'gleam further', 'reach farther', 'shine brighter', 'farther', 'further', 'glow farther', 'throw * farther'] },
  { id: 'dimmer', op: 'CHANGE_LIGHT', kinds: ['lantern'], params: {}, mag: 'delta', dir: -1, neg: 'brighter', phrases: ['dim', 'dimmer', 'fade'] },
  { id: 'hide', op: 'MODIFY_VISIBILITY', kinds: ['home', 'livestock'], params: {}, mag: 'delta', dir: -1, neg: 'reveal',
    phrases: ['hide', 'hidden', 'conceal', 'veil', 'cloak', 'shroud', 'mask', 'invisible', 'unseen', 'hard to spot', 'hard to see', 'hard to find', 'hard for * to spot', 'hard for * to find', 'hard * to spot', 'out of sight', 'lost in the haze', 'slip from * notice', 'go unnoticed', 'unnoticed', 'have trouble finding', 'cannot find', 'struggle to find', 'vanish from sight'] },
  { id: 'reveal', op: 'MODIFY_VISIBILITY', kinds: ['home', 'livestock'], params: {}, mag: 'delta', dir: 1, neg: 'hide', phrases: ['reveal', 'expose', 'betray'] },
  // movement of wolves, chickens (and water, by the same stamp)
  { id: 'away', op: 'MOVE_AWAY', kinds: ['wolf', 'chicken'], params: {}, mag: 'magnitude', dir: 1, neg: 'ask',
    phrases: ['keep away', 'keep * away', 'keep its distance', 'keep their distance', 'stay away', 'avoid', 'fear', 'flee', 'melt like mist', 'melt away', 'retreat', 'shun', 'back away', 'scatter', 'run from', 'stay clear', 'drive * away', 'away from', 'keep * from', 'keep * out of', 'give a wide berth', 'give * a wide berth', 'keep clear of', 'stay clear of', 'turn tail', 'stay back', 'keep back', 'keep off'] },
  { id: 'toward', op: 'MOVE_TOWARD', kinds: ['wolf', 'chicken'], params: {}, mag: 'magnitude', dir: -1, neg: 'away',
    phrases: ['drawn to', 'draw', 'follow', 'come to', 'gather at', 'gather around', 'seek', 'flock to', 'love', 'hunt near', 'lure', 'come near', 'enter', 'cross', 'approach', 'lured toward', 'lured to', 'drawn toward', 'come toward', 'prowl toward', 'head for', 'close in on'] },
  // behaviour
  { id: 'courage', op: 'INFLUENCE_MOTIVATION', kinds: ['villager'], params: { motive: 'courage' }, mag: 'magnitude', dir: 1,
    phrases: ['feel brave', 'brave', 'braver', 'bold', 'lose their fear', 'lose its fear', 'fearless', 'courage', 'courageous', 'fear leave', 'take heart', 'find their nerve', 'find * nerve', 'grow bolder', 'bolder', 'without fear', 'face * without fear', 'lose * fear', 'stand tall', 'braver than'] },
  { id: 'calm', op: 'INFLUENCE_MOTIVATION', kinds: ['villager'], params: { motive: 'calm' }, mag: 'magnitude', dir: 1, phrases: ['feel calm', 'calm', 'calmer', 'at peace', 'peaceful', 'soothed', 'rest easy', 'calm down', 'settle', 'be at ease', 'at ease', 'sleep soundly'] },
  { id: 'diligence', op: 'INFLUENCE_MOTIVATION', kinds: ['villager'], params: { motive: 'diligence' }, mag: 'magnitude', dir: 1,
    phrases: ['work tirelessly', 'tireless', 'tirelessly', 'never tire', 'work harder', 'untiring', 'diligent', 'work without tiring', 'without tiring', 'never tiring', 'forget * weariness', 'forget their weariness', 'shake off * weariness', 'tireless hands', 'work through the night'] },
  // spawn
  { id: 'hatch', op: 'SPAWN_BOUNDED_ENTITY', kinds: ['chicken'], params: { prefab: 'chicken' }, mag: 'count', dir: 1, phrases: ['hatch', 'be born', 'appear', 'breed', 'multiply', 'lay eggs', 'hatched', 'be hatched'] },
  // two physical meanings: the player chooses
  { id: 'spared', op: 'MODIFY_DURABILITY', kinds: ['home', 'bridge'], params: {}, mag: 'delta', dir: 1, ask: ['stronger', 'fireproof'], phrases: ['spared', 'are spared', 'be spared', 'kept safe', 'come to no harm', 'unharmed', 'safe'] },
  { id: 'turn_field', op: 'GROW_ENTITY', kinds: ['field'], params: {}, mag: 'magnitude', dir: 1, ask: ['grow', 'decay'], phrases: ['turn', 'change colour', 'change color'] },
  { id: 'set_moving', op: 'MOVE_AWAY', kinds: ['wolf', 'chicken'], params: {}, mag: 'magnitude', dir: 1, ask: ['away', 'toward'], phrases: ['set * moving', 'stir', 'restless', 'on the move', 'unsettle'] },
  { id: 'bring_in', op: 'GROW_ENTITY', kinds: ['field'], params: {}, mag: 'magnitude', dir: 1, ask: ['grow', 'rain_to'], phrases: ['bring * in early', 'bring in * early', 'bring * in'] },
  // status
  { id: 'fireproof', op: 'GIVE_STATUS_EFFECT', kinds: ['villager', 'home'], params: { status: 'fireproof' }, mag: 'magnitude', dir: 1,
    phrases: ['cannot burn', 'never burn', 'refuse to catch fire', 'cannot catch fire', 'never catch fire', 'fireproof', 'safe from fire', 'untouched by fire', 'cannot hurt', 'do not hurt', 'not burn', 'cannot touch', 'spare', 'spared by fire', 'spared from fire', 'do not burn'] },
  { id: 'heal', op: 'GIVE_STATUS_EFFECT', kinds: ['villager'], params: { status: 'sick_resistant' }, mag: 'magnitude', dir: 1,
    phrases: ['heal', 'cure', 'keep sickness from', 'shield from sickness', 'never fall ill', 'stay healthy', 'shake off sickness', 'shake off * sickness', 'recover', 'get well', 'fall ill less', 'fall sick less', 'fall ill less often', 'stay well', 'stop coughing', 'ward off sickness', 'keep sickness away', 'keep * sickness away'] },
  { id: 'warm', op: 'GIVE_STATUS_EFFECT', kinds: ['villager', 'home'], params: { status: 'warm' }, mag: 'magnitude', dir: 1, phrases: ['warm', 'kept warm', 'keep warm', 'never cold', 'stay warm'] },
];

/** Phrases that name a trigger. `min` is the threshold for watchers and floods; `source` marks words that are also a place. */
export const TRIGGERS: { event: TriggerEvent; phrases: string[]; min?: number }[] = [
  { event: 'bell', phrases: ['bell ring', 'bells ring', 'bell is rung', 'bells are rung', 'bell rung', 'ring the bell', 'ring the bells', 'ringing bell', 'ringing bells', 'bell ringing', 'bells chime', 'bell chime', 'bell toll', 'bells toll', 'bell peal', 'bells peal', 'pealing bell', 'sound of the bell', 'sound of the bells', 'at the bell', 'at the bells', 'bell sound', 'bells sound', 'tower bell sound', 'we ring the bell', 'bell tolls', 'the bells', 'the bell', 'bells', 'toll of the bell', 'every toll', 'ring of the bell', 'when the bell sound', 'peal of the bell'] },
  { event: 'lantern', phrases: ['lantern is lit', 'lanterns are lit', 'lanterns lit', 'lit lantern', 'lit lanterns', 'lamps are lit', 'burning lamp', 'lamplight', 'lantern light', 'lantern glow', 'by lamplight', 'torchlight', 'beacons are lit', 'lit beacon', 'light the lanterns', 'beacon is lit', 'lamps lit'] },
  { event: 'smoke_fire', phrases: ['smoke fire burn', 'smoke fires burn', 'smoke fire', 'smoke rise', 'woodsmoke', 'campfire', 'hearth smoke', 'the smoke', 'smoke', 'smoke fires are lit', 'smoke fire is lit', 'hearth fire', 'hearth fires', 'smoke rises', 'fires are lit'] },
  { event: 'watchers', phrases: ['people watch', 'when watched', 'while watched', 'is watched', 'are watched', 'watchful eyes', 'watch over', 'watch it', 'watch the bridge', 'watched', 'watch', 'eyes on it', 'observed', 'stand vigil', 'keep vigil', 'stand watch', 'keep watch', 'watcher', 'watchers', 'stand on the bridge', 'people on the bridge'], min: 1 },
  { event: 'watchers', phrases: ['crowd gather', 'crowds gather', 'crowd', 'crowds', 'many people'], min: 3 },
  { event: 'clear_night', phrases: ['clear night', 'night is clear', 'cloudless', 'not raining', 'no rain', 'dry night', 'does not rain', 'clear sky', 'without a cloud', 'without a single cloud', 'no cloud', 'no clouds', 'sky without a cloud', 'cloudless night', 'starry night'] },
  { event: 'night', phrases: ['at night', 'night', 'after dark', 'nightfall', 'after nightfall', 'every night', 'each night', 'tonight', 'dusk', 'night sky', 'moon', 'moonlight', 'beneath the moon', 'under the moon', 'star', 'starlight', 'midnight', 'under the stars', 'after sundown', 'once darkness falls', 'until dawn'] },
  { event: 'rain', phrases: ['when it rain', 'it rain', 'in the rain', 'raining', 'rainy', 'during rain', 'rain kiss', 'during the rain', 'when rain fall', 'in rainy weather', 'when it pours', 'when the rain come', 'rain come', 'showers fall'] },
  { event: 'flood', phrases: ['river flood', 'the river floods', 'flood is high', 'high water', 'flood rise', 'water rise', 'in flood', 'when it floods', 'flood come', 'when the flood comes', 'break its banks', 'burst its banks', 'breaks its banks', 'river rise', 'waters rise'], min: 3 },
  { event: 'spoken', phrases: ['promise', 'story', 'tell a story', 'word', 'vow', 'oath', 'prayer', 'tale', 'spoken word', 'rhyme', 'chant', 'verse', 'words are spoken', 'word is spoken', 'said aloud', 'spoken aloud', 'aloud', 'blessing', 'charm', 'sermon', 'speech'] },
  { event: 'ritual', phrases: ['ritual', 'rite', 'ceremony', 'festival', 'procession', 'offering', 'rain dance', 'dance', 'rite is held', 'performed', 'perform', 'vigil'] },
  { event: 'always', phrases: ['always', 'at all times', 'every day', 'constantly', 'day and night'] },
];

/** Conditions (tests on the night or on each target). */
export const CONDITIONS: { test: CondTest; phrases: string[]; tag?: Tag }[] = [
  { test: 'wet', tag: 'wet', phrases: ['wet', 'soaked', 'damp', 'drenched', 'sodden', 'waterlogged', 'soaked by rain', 'rain soaked', 'rain kiss them', 'the flood has touched', 'flood has touched', 'touched by the flood'] },
  { test: 'dry', tag: 'dry', phrases: ['dry', 'it is dry', 'parched', 'dry night', 'parched night'] },
  { test: 'windy', phrases: ['wind is strong', 'windy', 'strong wind', 'gale', 'gust', 'wind blow', 'wind rise'] },
  { test: 'blue', tag: 'blue', phrases: ['wearing blue', 'in blue', 'dressed in blue', 'blue clothes', 'blue cloak'] },
  { test: 'healthy', tag: 'healthy', phrases: ['healthy'] },
];

/** Prepositions that make a landmark word a place ("beside the lanterns"), with the reach they mean in tiles. */
export const NEAR_PREPS: { phrase: string; radius: number }[] = [
  { phrase: 'nearest', radius: 1 }, { phrase: 'nearest to', radius: 1 }, { phrase: 'closest to', radius: 1 }, { phrase: 'next to', radius: 2 }, { phrase: 'beside', radius: 2 },
  { phrase: 'by', radius: 2 }, { phrase: 'near', radius: 2 }, { phrase: 'around', radius: 2 }, { phrase: 'close to', radius: 2 }, { phrase: 'at', radius: 1 }, { phrase: 'under', radius: 2 },
  { phrase: 'beneath', radius: 2 }, { phrase: 'from', radius: 3 }, { phrase: 'of', radius: 2 }, { phrase: 'within reach of', radius: 3 },
];

/** Strength words. */
export const STRENGTH: { phrase: string; value: number }[] = [
  { phrase: 'slightly', value: 1 }, { phrase: 'a little', value: 1 }, { phrase: 'a bit', value: 1 }, { phrase: 'somewhat', value: 1 }, { phrase: 'faintly', value: 1 },
  { phrase: 'gently', value: 1 }, { phrase: 'barely', value: 1 }, { phrase: 'twice', value: 2 }, { phrase: 'double', value: 2 }, { phrase: 'completely', value: 3 },
  { phrase: 'entirely', value: 3 }, { phrase: 'totally', value: 3 }, { phrase: 'utterly', value: 3 }, { phrase: 'greatly', value: 3 }, { phrase: 'mightily', value: 3 },
  { phrase: 'far', value: 3 }, { phrase: 'very', value: 3 }, { phrase: 'three times', value: 3 }, { phrase: 'triple', value: 3 },
];

export const NUMBERS: Record<string, number> = { one: 1, a: 1, single: 1, two: 2, pair: 2, couple: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, dozen: 12, hundred: 100, thousand: 1000 };

/** Units of measure after a number ("5000 metres", "minus five kilograms"): named and left out, never silently dropped. */
export const MEASURE_UNITS = new Set(['metre', 'meter', 'm', 'centimetre', 'centimeter', 'cm', 'kilometre', 'kilometer', 'km', 'foot', 'feet', 'ft', 'inch', 'inche', 'yard', 'mile', 'league', 'kilogram', 'kilo', 'kg', 'gram', 'pound', 'lb', 'ton', 'tonne', 'degree', 'celsius', 'fahrenheit', 'litre', 'liter', 'gallon', 'mph']);

export const NEGATORS = ['not', 'never', 'no', 'cannot', 'nobody', 'none', 'nothing', 'no longer', 'neither', 'nor', 'without'];

/**
 * Reasons a reading can name. Concepts the village lacks come from ABSENT (ontology.ts); these are the rest. `block` reasons make
 * the whole sentence unsupported; the others leave a partial reading with the part named as omitted.
 */
export interface ReasonDef {
  id: string;
  block: boolean;
  why: string;
  phrases?: string[];
}

export const REASONS: ReasonDef[] = [
  { id: 'time', block: true, why: 'the village cannot change time: days pass one by one and nothing can be undone', phrases: ['reverse time', 'undo', 'yesterday', 'tomorrow', 'never happened', 'before they are planted', 'not yet laid', 'from the past', 'go back in time', 'turn back time', 'rewind', 'the past', 'the future', 'stop time', 'time itself', 'time flow backward', 'time run backward', 'last week', 'a week ago', 'last night', 'as it was', 'restored as it was', 'night stretch', 'stretch to twice its length', 'twice its length', 'longer night', 'the night last longer', 'day last longer', 'before it happened'] },
  { id: 'the_dead', block: true, why: 'the dead stay dead; no belief brings anyone back', phrases: ['resurrect', 'dead', 'ghost', 'come back to life', 'raise the dead', 'spirit', 'corpse', 'grave'] },
  { id: 'minds', block: true, why: 'a belief cannot make people believe, doubt or obey: only the village\'s own conversations and evidence do that', phrases: ['believe me', 'believe', 'obey', 'doubt', 'forget their doubts', 'must spread', 'ban', 'follower', 'convince', 'persuade', 'worship', 'mind', 'opinion', 'faith', 'whatever * command', 'do as they are told', 'follow orders', 'command', 'commands', 'will of', 'bend * will', 'mind control'] },
  { id: 'game', block: true, why: 'a belief is about the village, not about the game itself', phrases: ['infinite influence', 'influence', 'victory', 'declare victory', 'can never lose', 'cannot lose', 'win the game', 'game master', 'game', 'player', 'score', 'cheat', 'api key', 'developer mode', 'save file', 'delete save', 'call the tool', 'level up', 'mark this belief', 'fully supported', 'highest strength', 'maximum strength', 'max strength'] },
  { id: 'infinite_resource', block: true, why: 'nothing in the village is endless: lanterns burn fuel, food runs out', phrases: ['infinite', 'never go out', 'endless', 'unlimited', 'light themselves', 'light itself', 'never run out', 'never empty', 'refill itself', 'without using * fuel', 'without fuel', 'burn on forever', 'burn forever', 'never run dry', 'bottomless'] },
  { id: 'unbounded_spawn', block: true, why: 'no belief makes something from nothing without end: a coop holds twelve, and each chick costs food', phrases: ['without end', 'endlessly', 'infinitely', 'forever multiply'] },
  { id: 'absolute', block: true, why: 'a belief acts on one village, night by night, and can be lost: it cannot reach everywhere or last forever', phrases: ['everywhere', 'forever', 'in the world', 'whole world', 'entire world', 'all the world', 'all over the world', 'across the world', 'the world over', 'never again', 'eternally', 'for all time', 'nowhere', 'again'] },
  { id: 'transform', block: true, why: 'turning one thing into another would make something from nothing; a belief can change how things behave, not what they are', phrases: ['turn into', 'turn to stone', 'transform into', 'change into', 'become a', 'turn to wine', 'turn into wine', 'turn to gold', 'turn into gold', 'turn to glass', 'turn to ice', 'turn to dust', 'turn to salt', 'turn to sand', 'turn to honey', 'turn to milk', 'turn to blood', 'turn into bread', 'turn to bread'] },
  { id: 'animals_not_modelled', block: true, why: 'this village has chickens, penned animals and wolves; no other animals are simulated', phrases: ['bee', 'cat', 'rat', 'mouse', 'mice', 'dog', 'horse', 'bird', 'crow', 'raven', 'owl', 'fish', 'frog', 'snake', 'fox', 'deer', 'pig', 'duck', 'goose', 'geese', 'insect', 'spider', 'moth', 'butterfly', 'swan', 'heron', 'cow bell'] },
  { id: 'incompatible', block: true, why: 'the village has nothing that could make that happen', phrases: ['freeze', 'frozen', 'ice', 'breathe', 'underwater', 'uphill', 'melt', 'boil', 'evaporate', 'explode', 'fly away with'] },
  { id: 'metal', block: true, why: 'no metal or money is modelled in this village', phrases: ['iron', 'metal', 'steel', 'gold', 'silver', 'copper', 'coin', 'money', 'treasure'] },
  { id: 'shadow', block: true, why: 'shadows are only a picture here; nothing in the simulation is made of them', phrases: ['shadow', 'shade', 'darkness'] },
  { id: 'monsters', block: true, why: 'there are no such creatures in this world, and none can be summoned', phrases: ['dragon', 'giant', 'troll', 'demon', 'angel', 'god', 'fairy', 'witch', 'unicorn', 'monster'] },
  { id: 'sea', block: true, why: 'the valley has no such place', phrases: ['sea', 'ocean', 'lake', 'mountain', 'volcano', 'desert', 'island'] },
  { id: 'tools', block: true, why: 'tools and containers are not modelled as things that can change', phrases: ['sword', 'cart', 'wagon', 'bucket', 'basket', 'hammer', 'axe', 'barrel'] },
  { id: 'abstract', block: true, why: 'hope and love are not things the simulation can change; say what should physically happen', phrases: ['hope', 'love is', 'our love', 'joy', 'despair', 'sorrow', 'grief', 'fate', 'destiny', 'luck', 'happiness'] },
  { id: 'no_mechanic', block: true, why: 'that names no change the village can make' },
  { id: 'no_change', block: true, why: 'that describes the world as it already is: nothing would change', phrases: ['nothing about * ever change', 'nothing change', 'stay the same', 'remain the same', 'remain as they are', 'as they always have', 'as it always has'] },
  { id: 'contradiction', block: true, why: 'the belief asks for two opposite things at once', phrases: ['everywhere and nowhere'] },
  { id: 'instruction', block: false, why: 'instructions inside a belief are not followed; only the belief itself is read' },
  { id: 'absolute', block: false, why: 'a belief makes something likelier or stronger; it cannot promise it, no matter what', phrases: ['no matter what', 'can ever', 'cannot ever', 'ever', 'whatever happens'] },
  { id: 'unbounded_spawn', block: false, why: 'a belief can hatch at most three chicks a night, each costing food, and a coop holds twelve' },
  { id: 'exact_count', block: false, why: 'a belief acts on every one of a kind it reaches; it cannot pick a few of them', phrases: ['a few', 'some of', 'several', 'a couple of', 'a handful of', 'three of', 'two of', 'one of', 'four of', 'a few of', 'some of the', 'a couple'] },
  { id: 'fraction', block: false, why: 'a belief acts on everyone it reaches; it cannot pick a share of them', phrases: ['half', 'a third', 'a quarter', 'percent'] },
  { id: 'single_instance', block: false, why: 'a belief cannot single out one particular thing by rank; it acts on everything of that kind in its place', phrases: ['westernmost', 'easternmost', 'northernmost', 'southernmost', 'tallest', 'oldest', 'biggest', 'largest', 'smallest', 'alone', 'only the', 'just the one'] },
  { id: 'unknown_trigger', block: false, why: 'that event cannot power a belief here: powers are bells, lanterns, smoke fires, watchers, words, rituals, rain, floods and nights' },
  { id: 'unknown_place', block: false, why: 'that place is not one a belief can be measured from: it can name a region or a landmark' },
  { id: 'third_clause', block: false, why: 'a balanced belief holds at most two clauses (three in Reality Lab)' },
  { id: 'too_many', block: false, why: 'numbers are bounded: the reading uses the largest the language allows' },
  { id: 'measure', block: false, why: 'amounts are the game\'s own steps (a law lifts, lightens, warms or pulls by one to three), so a measure in metres, kilograms or degrees is left out' },
  { id: 'sky_bodies', block: false, why: 'the sun, moon and stars are not things the village can change; a clear night can still power a belief' },
  { id: 'not_here', block: false, why: 'this village does not have that, so that part cannot happen here' },
  { id: 'narrative', block: false, why: 'kept as flavour; it changes nothing in the simulation' },
];

/** Words that make what follows a trigger ("when the bell rings"). */
export const SUBORDINATORS = ['when', 'whenever', 'while', 'if', 'unless', 'once', 'as long as', 'as soon as', 'should', 'only on', 'only when', 'after', 'during', 'until', 'wherever'];

/** Phrases kept as flavour: they explain, decorate or restate, and change nothing. */
export const FLAVOR = ['with open doors', 'over there', 'like mist', 'dreams of', 'dream of', 'over the river', 'across the river', 'into the night', 'at the sound'];

/** Places a sentence can name that are not regions or landmarks (a belief cannot be measured from them). */
export const UNKNOWN_PLACES = ['river bank', 'riverbank', 'hill', 'hilltop', 'forest', 'woods', 'meadow', 'road', 'path', 'gate', 'cliff', 'cave', 'shore', 'beach', 'oak', 'tree', 'pond', 'crossroads', 'courtyard', 'castle', 'castle courtyard', 'yard', 'stable', 'smithy', 'tavern', 'inn', 'graveyard', 'cemetery', 'lane', 'alley', 'knoll', 'orchard wall', 'old oak'];

/** Verbs of speech: they power a belief only when people speak them ("anyone whispers"), never when bells or stars do. */
export const SPEECH_VERBS = ['whisper', 'speak', 'tell', 'say', 'sing', 'pray', 'swear', 'promise', 'chant', 'recite', 'shout', 'call out'];

/** Words that only point back at something already named. */
export const PRONOUNS = ['it', 'they', 'them', 'its', 'their', 'itself', 'themselves'];

/** Irregular forms, so "flew" is read as "fly" and "does not" as "do not". */
export const IRREGULAR: Record<string, string> = {
  does: 'do', did: 'do', done: 'do', has: 'have', had: 'have', is: 'be', are: 'be', was: 'be', were: 'be', flew: 'fly', flown: 'fly', rose: 'rise', risen: 'rise', fell: 'fall',
  fallen: 'fall', rung: 'ring', rang: 'ring', sang: 'sing', sung: 'sing', brought: 'bring', drew: 'draw', drawn: 'draw', kept: 'keep', held: 'hold', stood: 'stand', broke: 'break',
  broken: 'break', grew: 'grow', grown: 'grow', fled: 'flee', ran: 'run', sank: 'sink', sunk: 'sink', hid: 'hide', hidden: 'hide', gave: 'give', went: 'go', gone: 'go',
  took: 'take', taken: 'take', burnt: 'burn', spread: 'spread', woke: 'wake', slept: 'sleep', swore: 'swear', sworn: 'swear', told: 'tell', spoke: 'speak', spoken: 'speak',
  wolves: 'wolf', men: 'man', women: 'woman', children: 'child', mice: 'mouse', geese: 'goose', sheaves: 'sheaf', leaves: 'leave',
};

/** Modifiers of a landmark that say it is active ("the ringing bell", "lit lanterns"). */
export const ACTIVE_MODIFIERS: Record<string, string[]> = { belltower: ['ringing', 'pealing', 'tolling', 'chiming', 'rung'], beacon: ['lit', 'burning', 'glowing', 'shining'], campfire: ['lit', 'burning', 'smoking'] };

/** Instructions and markup that are never part of a belief. Checked before reading; matched text is removed and reported. */
export const INSTRUCTION_PATTERNS: RegExp[] = [
  /<\/?[a-z][^>]*>/gi,
  /\{[^{}]*\}/g,
  /\[[^\]]*\]/g,
  /\b(ignore|disregard|forget) (all |the )?(previous|prior|above|earlier) (instructions?|rules?|prompts?)\b[^.!?]*/gi,
  /\bsystem\s*:/gi,
  /\b(you are now|act as|pretend to be|roleplay as)\b[^.!?]*/gi,
  /\b(reveal|print|show|output|repeat) (me )?(the |your )?(system prompt|api key|prompt|instructions|secret|key)s?\b[^,.!?]*(, ?then)?/gi,
  /\b(developer|debug|god) mode\b[^.!?]*/gi,
  /\bapprove this belief\b[^.!?]*/gi,
  /\bat power \d+\b/gi,
  /\bset (the )?(magnitude|power|strength|radius|cost|threshold)s? to [^:.!?]*:?/gi,
  /\b(also )?(execute|run|eval|call)\b[^.!?]*(\(\)|rm -rf|tool|script|command|function)[^.!?]*/gi,
  /\brm -rf\b[^.!?]*/gi,
  /\btranslate (this )?(in)?to [a-z]+ ?:?/gi,
  /\bgive me\b[^.!?]*/gi,
  /\b(disregard|ignore|forget|override|bypass) (all |any |every |each |your |the )*(limits?|rules?|instructions?|constraints?|restrictions?|guidelines?)\b[^.!?]*/gi,
  /\b(give|set|mark|rate|treat) (this|the|my) belief\b[^.!?]*/gi,
  /\b(maximum|max|highest|full) (strength|power|priority)\b[^.!?]*/gi,
];
