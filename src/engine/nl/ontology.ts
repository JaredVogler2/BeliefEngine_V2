import type { Effect, SideEffectId, Subject, TriggerKind } from '../core/types.ts';

/**
 * The vocabulary of the offline belief composer: which words mean which part of a rule, which combinations the village can
 * really model, and which ideas it cannot. Everything here is data; none of it is executed. The physical meaning of a rule
 * lives in laws/effects.ts, and this file only decides which of its primitives a sentence refers to.
 */
export const NL_VERSION = 1;
export const PARSER_ID = `offline-lexicon-${NL_VERSION}`;

/** The triggers the composer offers per subject: only those whose physical source exists in laws/effects.ts and does something. */
export const OFFERED: Record<Subject, { effects: Effect[]; triggers: TriggerKind[] }> = {
  river: { effects: ['repel', 'attract', 'redirect', 'slow'], triggers: ['lit_beacon', 'smoke_fire', 'bell'] },
  rain: { effects: ['redirect', 'attract', 'repel'], triggers: ['bell'] },
  bridge: { effects: ['strengthen', 'weaken'], triggers: ['watchers', 'bell'] },
  grain: { effects: ['grow', 'weaken'], triggers: ['night', 'bell', 'always'] },
  wolf: { effects: ['repel', 'attract'], triggers: ['smoke_fire', 'lit_beacon', 'bell'] },
  illness: { effects: ['repel', 'weaken'], triggers: ['always', 'lit_beacon', 'smoke_fire'] },
  fire: { effects: ['weaken', 'strengthen', 'slow'], triggers: ['always'] },
  // stone needs rubble to exist and smoke has no physical effect yet: neither is offered, and the parser says so
  stone: { effects: [], triggers: [] },
  smoke: { effects: [], triggers: [] },
};

export const SUBJECT_LABEL: Record<Subject, string> = {
  river: 'the river', rain: 'the rain', bridge: 'the bridge', grain: 'the crops', wolf: 'the wolves', stone: 'stone', smoke: 'smoke', illness: 'sickness', fire: 'fire',
};

/** What a person calls each part of the world. Whole words only; plurals are matched automatically (+s, +es). */
export const SUBJECT_WORDS: Record<Subject, string[]> = {
  river: ['river', 'water', 'floodwater', 'flood', 'stream', 'current', 'tide', 'surge', 'creek', 'waters', 'torrent', 'rapids'],
  rain: ['rain', 'cloud', 'storm', 'thunder', 'drizzle', 'downpour', 'sky', 'weather', 'showers'],
  bridge: ['bridge', 'crossing', 'span', 'planks', 'deck', 'footbridge'],
  grain: ['grain', 'crop', 'wheat', 'barley', 'rye', 'harvest', 'field', 'corn', 'seed', 'oats', 'plants', 'sheaves'],
  wolf: ['wolf', 'wolves', 'pack', 'hound', 'predator', 'wolfpack', 'fangs'],
  stone: ['stone', 'rock', 'wall', 'rubble', 'masonry', 'boulder', 'cobbles'],
  smoke: ['smoke', 'smoulder', 'smolder', 'haze'],
  illness: ['illness', 'sickness', 'fever', 'plague', 'cough', 'disease', 'ailment', 'contagion', 'rot', 'blight'],
  fire: ['fire', 'flame', 'blaze', 'ember', 'inferno', 'wildfire', 'sparks'],
};

/** Verbs and idioms. Phrases that already contain their own negation ("cannot fall") are marked and never flipped again. */
export const EFFECT_PHRASES: { effect: Effect; phrases: string[]; selfNegated?: boolean }[] = [
  // idioms with a negation built in
  { effect: 'strengthen', selfNegated: true, phrases: ['cannot fall', 'can not fall', 'never falls', 'never fall', 'does not fall', 'will not fall', 'cannot break', 'never breaks', 'never break', 'will not break', 'does not break', 'cannot collapse', 'never collapses', 'will not collapse', 'cannot be broken', 'cannot be harmed', 'cannot be swept away', 'never gives way', 'stands firm', 'stays standing', 'will stand'] },
  { effect: 'weaken', selfNegated: true, phrases: ['cannot hurt', 'cannot harm', 'does not burn', 'will not burn', 'cannot burn', 'never burns', 'cannot spread'] },
  { effect: 'repel', selfNegated: true, phrases: ['will not touch', 'cannot touch', 'never touches', 'never touch', 'will not cross', 'cannot cross', 'refuses to approach', 'will not approach', 'forgets how to flow', 'forgets to flow', 'cannot flow', 'will not come near', 'dares not', 'cannot pass'] },
  { effect: 'repel', phrases: ['hates', 'hate', 'detests', 'loathes', 'spurns', 'stays away', 'keeps away', 'keep away', 'keeps out', 'keep out', 'goes away', 'go away', 'leaves', 'leave', 'turns away from', 'turns aside from', 'avoids', 'avoid', 'fears', 'fear', 'afraid of', 'afraid', 'frightened', 'flees', 'flee', 'shuns', 'shun', 'recoils', 'retreats', 'repelled', 'repels', 'repel', 'drives off', 'driven off', 'turns back', 'dreads', 'dread', 'mistakes', 'mistake', 'terrified', 'scared', 'flinches', 'flinch', 'flinches from', 'shies from', 'shy away from', 'backs away from', 'recoil from'] },
  { effect: 'attract', phrases: ['comes', 'come', 'pulls', 'pull', 'brings', 'bring', 'calls', 'call', 'beckons', 'summons rain', 'loves', 'love', 'courts', 'follows', 'follow', 'seeks', 'seek', 'approaches', 'approach', 'gathers', 'gather', 'flocks', 'drawn to', 'draws', 'drawn', 'attracted', 'hungers for', 'rushes to', 'comes to', 'come to', 'runs to', 'is pulled', 'pulled to', 'wants', 'longs for', 'welcomes', 'invites', 'rushes toward', 'rush toward', 'rushes towards', 'runs toward', 'runs towards', 'flows toward', 'flows towards', 'heads toward', 'heads for'] },
  { effect: 'redirect', phrases: ['bends away from', 'bends away', 'veers away from', 'veers away', 'steers away from', 'goes elsewhere', 'go elsewhere', 'elsewhere', 'redirects', 'redirect', 'diverts', 'divert', 'veers', 'veer', 'bends', 'steers', 'turns aside', 'turns', 'flows around', 'goes around', 'sent away', 'drawn off', 'heeds', 'heed', 'listens to', 'obeys', 'yields to', 'parts for', 'parts around', 'detours'] },
  { effect: 'strengthen', phrases: ['strong', 'stronger', 'tough', 'burns hungrier', 'burns hotter', 'burns fiercer', 'burns faster', 'spreads faster', 'rages', 'roars', 'holds', 'hold', 'endures', 'endure', 'strengthens', 'strengthen', 'steadfast', 'unbreakable', 'sturdy', 'grows strong', 'stands', 'protects', 'protected', 'safe', 'shielded', 'shield'] },
  { effect: 'weaken', phrases: ['breaks', 'break', 'cracks', 'crack', 'crumbles', 'crumble', 'collapses', 'collapse', 'fails', 'fail', 'weakens', 'weaken', 'withers', 'wither', 'sours', 'sour', 'spoils', 'spoil', 'rots', 'rot', 'dwindles', 'perishes', 'weak', 'falls', 'snaps', 'shrivels'] },
  { effect: 'grow', phrases: ['grows faster', 'grow faster', 'ripens faster', 'ripen faster', 'ripens', 'ripen', 'grows', 'grow', 'flourishes', 'flourish', 'thrives', 'thrive', 'sprouts', 'swells', 'yields more', 'fruitful', 'bountiful', 'doubles', 'multiplies'] },
  { effect: 'slow', phrases: ['slows', 'slow', 'lingers', 'linger', 'creeps', 'crawls', 'dawdles', 'calms', 'calm', 'burns slowly', 'spreads slowly', 'hesitates', 'tires', 'tire', 'lags'] },
  { effect: 'conceal', phrases: ['hides', 'hide', 'conceals', 'conceal', 'veils', 'cloaks', 'shrouds', 'masks'] },
];

export const TRIGGER_PHRASES: { trigger: TriggerKind; words: string[] }[] = [
  { trigger: 'lit_beacon', words: ['lantern', 'lamp', 'beacon', 'torch', 'candle', 'bonfire', 'lamplight', 'lanterns', 'light', 'lights', 'lit', 'burning', 'burn', 'burns', 'flame', 'flames', 'fire', 'fires', 'glow', 'glowing', 'lighthouse'] },
  { trigger: 'smoke_fire', words: ['smoke', 'smoke fire', 'smoke fires', 'smokefire', 'smoky', 'campfire', 'hearth', 'smouldering', 'smoldering', 'chimney', 'chimneys', 'woodsmoke', 'embers', 'ash', 'ashes'] },
  { trigger: 'bell', words: ['bell', 'bells', 'ring', 'rings', 'ringing', 'rung', 'chime', 'chimes', 'toll', 'tolling', 'peal', 'clang', 'belltower'] },
  { trigger: 'watchers', words: ['watched', 'watching', 'watcher', 'watchers', 'watch', 'guard', 'guarded', 'guards', 'vigil', 'sentry', 'sentries', 'seen', 'observed', 'looked', 'eyes', 'attended', 'keeping watch', 'keep watch'] },
  { trigger: 'night', words: ['night', 'nights', 'nightly', 'moon', 'moonlight', 'moonlit', 'midnight', 'dark', 'darkness', 'dusk', 'stars', 'starlight', 'nighttime', 'after dark', 'at night'] },
  { trigger: 'always', words: ['always', 'everywhere', 'forever', 'constantly', 'ever', 'all the time', 'at all times', 'permanently', 'every day'] },
];

/** Words that raise or lower a belief's strength and reach. */
export const STRONG_WORDS = ['completely', 'utterly', 'entirely', 'fully', 'absolutely', 'totally', 'never', 'cannot', 'always', 'no matter', 'mighty', 'fierce', 'strongly', 'greatly'];
export const WEAK_WORDS = ['slightly', 'somewhat', 'a little', 'gently', 'mildly', 'a bit', 'barely', 'faintly', 'lightly', 'sometimes', 'weakly'];
export const NEAR_WORDS = ['near', 'nearby', 'beside', 'around', 'close', 'next to', 'by', 'at', 'beneath'];
export const WIDE_WORDS = ['wherever', 'everywhere', 'across', 'far', 'wide', 'whole', 'entire', 'throughout', 'all over'];
export const NARROW_WORDS = ['only', 'just', 'single', 'lone', 'one'];
export const NEGATION = ['not', 'never', 'no', 'nor', 'neither', 'cannot', 'without', 'refuses', 'fails to', 'unable', 'stops', 'ceases', 'forgets'];

export const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'that', 'this', 'these', 'those', 'as', 'when', 'while', 'where', 'whenever', 'if', 'then', 'than', 'so', 'from', 'into', 'over', 'under', 'up', 'down', 'out', 'off', 'who', 'which', 'they', 'their', 'them', 'there', 'will', 'would', 'can', 'could', 'do', 'does', 'did', 'has', 'have', 'had', 'my', 'our', 'your', 'his', 'her', 'we', 'you', 'i', 'he', 'she', 'old', 'every', 'each', 'any', 'all', 'near', 'around', 'beside', 'still', 'also', 'too', 'very', 'much', 'more', 'most', 'some', 'what', 'how', 'why', 'let', 'make', 'made', 'become', 'becomes', 'once', 'again', 'now', 'here', 'upon', 'about', 'because', 'cannot', 'not', 'never', 'no']);

/** Ideas the village cannot model. Saying so is the point: none of these may be silently turned into something else. */
export const UNSUPPORTED: { id: string; label: string; patterns: RegExp[]; why: string }[] = [
  { id: 'time', label: 'time', patterns: [/\b(revers\w*|rewind\w*|undo\w*|stop\w*|freez\w*|skip\w*)\s+(the\s+)?(time|day|night|clock|surge|flood)\b/, /\btime\s+(travel|reversal|reverses|runs backwards?|stops)\b/, /\bturn\w*\s+back\s+time\b/, /\bforget\w*\s+(the\s+)?(past|yesterday)\b/], why: 'the village cannot yet model time reversal or skipping' },
  { id: 'immortality', label: 'making people safe or immortal', patterns: [/\bimmortal\w*\b/, /\b(never|cannot|can't|will not|won't)\s+die\b/, /\bno\s*(one|body)\s+(dies|will die|is lost|is hurt)\b/, /\b(everyone|everybody|all\s+(the\s+)?(villagers|people)|every\s+villager)\s+(\w+ly\s+)?(survives?|lives?|is\s+(\w+ly\s+)?(saved|safe|protected|alive))\b/, /\b(no\s*one|nobody)\b[^.!?]{0,40}\b(die|dies|dying|death|perish\w*|killed|hurt|harmed)\b/, /\bno\s+(villagers?|people|persons?|children|child)\b[^.!?]{0,30}\b(die|dies|dying|death|perish\w*|killed|hurt|harmed)\b/, /\beveryone\s+(survives|lives|is saved|is safe|is protected)\b/, /\ball\s+(villagers|people)\s+(survive|live|are saved|are safe)\b/, /\b(resurrect|revive|raise the dead|bring back the dead|reborn)\w*\b/, /\binvulnerab\w*\b/, /\binvincib\w*\b/, /\blive forever\b/, /\bdeath\s+(ends|stops|cannot)\b/], why: 'no belief can make people unkillable; people live or die by what the water, fire, wolves and hunger do to them' },
  { id: 'victory', label: 'winning outright', patterns: [/\b(win|won|wins|victory|victorious)\b.*\b(game|day|village|scenario|run)\b/, /\binstantly\s+win\b/, /\bwin\s+(now|instantly|immediately)\b/, /\bthe\s+surge\s+(never|does not|will not)\s+(comes?|arrives?|happens?)\b/, /\bno\s+(flood|surge|wolves|famine|drought)\s+(ever\s+)?(comes?|happens?|arrives?)\b/, /\bsave\s+(everyone|everybody|the village)\b/, /\b(safe|secure|protected|immune|untouched)\b[^.!?]{0,30}\b(forever|for\s+ever|for\s+good|always|from\s+now\s+on)\b/, /\b(forever|for\s+ever)\b[^.!?]{0,20}\b(safe|secure|protected)\b/, /\bnever\s+again\b/, /\b(can|could|will|shall)\s+never\s+(harm|hurt|touch|threaten|trouble|reach)\b[^.!?]{0,15}\b(anyone|anybody|everyone|us|people|villagers?|the\s+village|children|folk)\b/], why: 'a belief shapes how one part of the world behaves; it cannot declare the village saved' },
  { id: 'resources', label: 'creating food, fuel or wealth from nothing', patterns: [/\b(infinite|unlimited|endless|bottomless|limitless)\b/, /\b(spawn|conjure|create|summon|produce|multiply)\w*\s+(food|grain|fuel|wood|bread|gold|money|coins?|loaves)\b/, /\b(gold|money|coins?|treasure|riches|wealth)\b/, /\bfood\s+(appears|rains|falls)\b/, /\bfree\s+(food|fuel|influence)\b/, /\b(no\s*one|nobody|no\s+(villagers?|people|persons?|children|child))\b[^.!?]{0,30}\b(hungry|starv\w*|goes?\s+without\s+food)\b/, /\b(granary|stores?|larder|barn)\b[^.!?]{0,20}\bnever\s+(empt\w*|runs?\s+(empty|out|dry|short))\b/], why: 'beliefs change how the world behaves; they do not create food, fuel or wealth from nothing' },
  { id: 'mind', label: 'controlling minds', patterns: [/\bmind\s*control\w*\b/, /\bcontrol\w*\s+(minds?|people|villagers|everyone)\b/, /\beveryone\s+(obeys|believes|agrees|follows me|loves me)\b/, /\bobey\s+(me|the keeper)\b/, /\ball\s+(villagers|people)\s+(believe|obey|agree)\b/, /\binfluence\s+(is\s+)?(free|unlimited|doubled)\b/, /\b(grant|give|gain|get)\w*\s+\d*\s*(more\s+)?(influence|points|ap)\b/], why: 'belief has to spread from person to person, one telling at a time; a belief cannot decide what people believe' },
  { id: 'transmute', label: 'turning one thing into another', patterns: [/\b(turn|change|transform|convert|become|becomes|becoming)\w*\s+(\w+\s+){0,3}into\b/, /\bpolymorph\w*|\btransmut\w*/], why: 'beliefs change how the water, fire, wolves and crops behave; they cannot turn one thing into another' },
  { id: 'teleport', label: 'moving people or things', patterns: [/\bteleport\w*\b/, /\b(fly|flies|fly away|levitat\w*|float\w*)\b/, /\bdisappear\w*\b/, /\bvanish\w*\b/, /\bmove\w*\s+(the\s+)?(river|bridge|village|mountain|homes?|houses?)\b/], why: 'beliefs cannot move people, buildings or the river itself; they change how the water, fire, wolves and crops behave near what exists' },
  { id: 'disaster', label: 'new disasters or monsters', patterns: [/\b(earthquake|volcano|meteor|asteroid|tornado|hurricane|lightning|blizzard|tsunami|avalanche|locusts?|dragons?|ghosts?|demons?|zombies?|vampires?|witch\w*|curse\w*|monsters?|giants?\s+(wakes?|rises?|attacks?|stomps?))\b/, /\bsummon\w*\s+(a|an|the)?\s*(dragon|ghost|demon|monster|army|storm of|plague)\w*/], why: 'the village models floods, fire, wolves, hunger, sickness and bridges; it has no earthquakes, curses or monsters' },
  { id: 'wish', label: 'a wish', patterns: [/\b(i|we)\s+(wish|hope|pray|want|need|would like)\b/, /\bif only\b/, /\bplease\b/, /\bmay\s+(the|our|my)\b/], why: 'a wish or a prayer says what you hope for, not how the world behaves; a belief has to say what changes and what makes it change' },
  { id: 'meta', label: 'rules, scores or the game itself', patterns: [/\b(score|points|achievement|difficulty|influence|ap)\s+(is|are|becomes?|doubles|resets?)\b/, /\bignore\s+(all\s+)?(previous|prior|above)\b/, /\b(system|assistant|developer)\s*[:>]/, /\bdisregard\b/, /\bpretend\b/, /\bact\s+as\b/, /\b(delete|drop|reset)\s+(the\s+)?(save|game|run|state)\b/, /\boverride\b/, /\bjailbreak\b/, /\bprompt\b/, /\bset\s+(my\s+)?(score|influence|ap|food)\b/, /<\/?[a-z][^>]*>/, /\b(eval|exec|script|function)\s*\(/, /\bconsole\./, /\bdocument\./, /\bhttps?:\/\//], why: 'a belief is a statement about the world, not an instruction to the game; the game does not read instructions from claim text' },
];

/** The sentence the composer would accept for each combination, used to offer "the nearest thing I can model". */
export const CANONICAL: { subject: Subject; effect: Effect; trigger: TriggerKind; sentence: string; title: string }[] = [
  { subject: 'river', effect: 'repel', trigger: 'lit_beacon', sentence: 'The river turns aside from lit lanterns.', title: 'Lanterns turn the river' },
  { subject: 'river', effect: 'attract', trigger: 'lit_beacon', sentence: 'The river runs to lit lanterns.', title: 'The river seeks lanterns' },
  { subject: 'river', effect: 'redirect', trigger: 'lit_beacon', sentence: 'The river bends away from beacon fires.', title: 'Beacons bend the river' },
  { subject: 'river', effect: 'slow', trigger: 'lit_beacon', sentence: 'The river slows beside lit beacons.', title: 'Beacons slow the river' },
  { subject: 'river', effect: 'repel', trigger: 'smoke_fire', sentence: 'The river shuns smoke fires.', title: 'The river shuns smoke' },
  { subject: 'river', effect: 'attract', trigger: 'smoke_fire', sentence: 'The river is drawn to smoke fires.', title: 'Smoke calls the river' },
  { subject: 'river', effect: 'redirect', trigger: 'smoke_fire', sentence: 'The river veers away from smoke fires.', title: 'Smoke turns the river' },
  { subject: 'river', effect: 'slow', trigger: 'smoke_fire', sentence: 'The river slows beside smoke fires.', title: 'Smoke slows the river' },
  { subject: 'river', effect: 'repel', trigger: 'bell', sentence: 'The river flinches from the ringing bells.', title: 'Bells push back the river' },
  { subject: 'river', effect: 'attract', trigger: 'bell', sentence: 'The river rushes toward the ringing bells.', title: 'Bells call the river' },
  { subject: 'river', effect: 'redirect', trigger: 'bell', sentence: 'The river turns aside when the bells ring.', title: 'Bells turn the river' },
  { subject: 'river', effect: 'slow', trigger: 'bell', sentence: 'The river slows when the bells ring.', title: 'Bells slow the river' },
  { subject: 'rain', effect: 'redirect', trigger: 'bell', sentence: 'The rain turns aside when the bells ring.', title: 'The rain heeds the bells' },
  { subject: 'rain', effect: 'attract', trigger: 'bell', sentence: 'The clouds gather wherever the bells ring.', title: 'Bells gather the clouds' },
  { subject: 'rain', effect: 'repel', trigger: 'bell', sentence: 'The clouds fear the ringing bells.', title: 'Bells scare the clouds' },
  { subject: 'bridge', effect: 'strengthen', trigger: 'watchers', sentence: 'The bridge cannot fall while it is watched.', title: 'A watched bridge holds' },
  { subject: 'bridge', effect: 'weaken', trigger: 'watchers', sentence: 'The bridge cracks under watching eyes.', title: 'Eyes crack the bridge' },
  { subject: 'grain', effect: 'grow', trigger: 'night', sentence: 'The crops grow faster at night.', title: 'Night ripens the crops' },
  { subject: 'grain', effect: 'weaken', trigger: 'night', sentence: 'The moon sours the crops.', title: 'The moon sours the crops' },
  { subject: 'bridge', effect: 'strengthen', trigger: 'bell', sentence: 'The bridge cannot fall while the bells ring.', title: 'Bells hold the bridge' },
  { subject: 'bridge', effect: 'weaken', trigger: 'bell', sentence: 'The bridge cracks when the bells ring.', title: 'Bells crack the bridge' },
  { subject: 'grain', effect: 'grow', trigger: 'bell', sentence: 'The crops grow faster when the bells ring.', title: 'Bells ripen the crops' },
  { subject: 'grain', effect: 'weaken', trigger: 'bell', sentence: 'The crops sour when the bells ring.', title: 'Bells sour the crops' },
  { subject: 'grain', effect: 'grow', trigger: 'always', sentence: 'The crops thrive everywhere.', title: 'The crops thrive' },
  { subject: 'grain', effect: 'weaken', trigger: 'always', sentence: 'The crops wither everywhere.', title: 'The crops wither' },
  { subject: 'illness', effect: 'repel', trigger: 'smoke_fire', sentence: 'Sickness shuns smoke fires.', title: 'Smoke shuns sickness' },
  { subject: 'illness', effect: 'weaken', trigger: 'smoke_fire', sentence: 'Fever weakens beside smoke fires.', title: 'Smoke weakens fever' },
  { subject: 'wolf', effect: 'repel', trigger: 'smoke_fire', sentence: 'The wolves fear smoke.', title: 'Wolves fear smoke' },
  { subject: 'wolf', effect: 'attract', trigger: 'smoke_fire', sentence: 'The wolves follow the smoke.', title: 'Wolves follow smoke' },
  { subject: 'wolf', effect: 'repel', trigger: 'lit_beacon', sentence: 'The wolves will not cross lit lanterns.', title: 'Lanterns hold the wolves' },
  { subject: 'wolf', effect: 'attract', trigger: 'lit_beacon', sentence: 'The wolves are drawn to lit lanterns.', title: 'Lanterns draw the wolves' },
  { subject: 'wolf', effect: 'repel', trigger: 'bell', sentence: 'The wolves dread the ringing bells.', title: 'Bells scare the wolves' },
  { subject: 'wolf', effect: 'attract', trigger: 'bell', sentence: 'The wolves come to the ringing bells.', title: 'Bells call the wolves' },
  { subject: 'illness', effect: 'repel', trigger: 'always', sentence: 'Sickness flees everywhere.', title: 'Sickness flees' },
  { subject: 'illness', effect: 'weaken', trigger: 'always', sentence: 'Fever weakens everywhere.', title: 'Fever weakens' },
  { subject: 'illness', effect: 'repel', trigger: 'lit_beacon', sentence: 'Sickness shuns lit lanterns.', title: 'Lanterns shun sickness' },
  { subject: 'illness', effect: 'weaken', trigger: 'lit_beacon', sentence: 'Fever weakens beside lit lanterns.', title: 'Lanterns weaken fever' },
  { subject: 'fire', effect: 'weaken', trigger: 'always', sentence: 'Flames cannot hurt the homes.', title: 'Flames cannot hurt' },
  { subject: 'fire', effect: 'strengthen', trigger: 'always', sentence: 'Fire burns hungrier than ever.', title: 'Fire burns hungrier' },
  { subject: 'fire', effect: 'slow', trigger: 'always', sentence: 'Fire spreads slowly.', title: 'Fire spreads slowly' },
];

/** The thematic cost a stronger belief pays, by what the belief does. */
export function thematicSides(subject: Subject, effect: Effect, trigger: TriggerKind): SideEffectId[] {
  const out: SideEffectId[] = [];
  if (trigger === 'lit_beacon' || (subject === 'fire' && effect === 'strengthen')) out.push('ignition');
  if (trigger === 'smoke_fire') out.push('smoke_sickness');
  if (subject === 'rain' || (subject === 'river' && trigger === 'bell')) out.push('rain_displace');
  if (trigger === 'night' || trigger === 'watchers') out.push('labor_drain');
  if (subject === 'illness') out.push('cold');
  if (subject === 'fire' && effect === 'weaken') out.push('complacency');
  return out.filter((s, i) => out.indexOf(s) === i);
}

export const SUBJECT_ICON: Record<Subject, string> = { river: 'flame', rain: 'rain', bridge: 'eye', grain: 'moon', wolf: 'wolf', stone: 'skull', smoke: 'flame', illness: 'skull', fire: 'flame' };
