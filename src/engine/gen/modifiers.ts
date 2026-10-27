import type { ScenarioDef } from '../content/types.ts';
import { Stream } from '../core/rng.ts';
import type { Id } from '../core/types.ts';
import { clone } from './blueprint.ts';

/**
 * Run modifiers: each one changes numbers the player can see, opens or closes a decision, carries a risk, and is explained
 * in the briefing. Static changes are applied to a copy of the scenario at run creation; dynamic ones are read through
 * `modActive(state, id)` by the engine. A modifier never makes a run unwinnable by itself: it trades one thing for another.
 */
export interface ModifierDef {
  id: Id;
  name: string;
  icon: string;
  /** what changes, in plain words (shown in the briefing) */
  blurb: string;
  /** the price or the opportunity */
  tradeoff: string;
  applies(d: ScenarioDef): boolean;
  /** mutate a private copy of the scenario */
  apply(d: ScenarioDef, seed: number): void;
}

const hasLandmark = (d: ScenarioDef, kind: string) => d.map.landmarks.some((l) => l.kind === kind);

export function regionOfPoint(d: ScenarioDef, x: number, y: number): string {
  for (const r of d.map.regions) for (const [x0, y0, x1, y1] of r.rects) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return r.id;
  return '';
}

function districtOf(d: ScenarioDef, villagerId: string): string {
  const v = d.villagers.find((x) => x.id === villagerId);
  const home = v && d.map.landmarks.find((l) => l.id === v.home);
  return home ? regionOfPoint(d, home.x, home.y) : '';
}

export const MODIFIERS: ModifierDef[] = [
  {
    id: 'cross_bank_mistrust',
    name: 'Mistrust between districts',
    icon: 'link-off',
    blurb: 'Ties that cross a district line are about 45% weaker and slower, and the bridge is 10 points more fragile.',
    tradeoff: 'Stories no longer cross the water on their own. The few people who still hold both sides become the whole plan.',
    applies: (d) => d.map.regions.length >= 3 && d.edges.some((e) => districtOf(d, e.a) !== districtOf(d, e.b)),
    apply(d) {
      for (const e of d.edges) {
        if (districtOf(d, e.a) === districtOf(d, e.b)) continue;
        e.ab = e.ab > 0 ? Math.max(12, Math.round(e.ab * 0.55)) : e.ab;
        e.ba = e.ba > 0 ? Math.max(12, Math.round(e.ba * 0.55)) : e.ba;
        e.rate = Math.round(e.rate * 0.6 * 100) / 100;
      }
      const br = d.map.landmarks.find((l) => l.kind === 'bridge');
      if (br) br.hp = Math.max(30, (br.hp ?? 70) - 10);
    },
  },
  {
    id: 'soot_season',
    name: 'Soot season',
    icon: 'flame',
    blurb: 'Fire laws are one step stronger and also carry the risk of stray sparks. Fires start more easily everywhere.',
    tradeoff: 'Beacons wall off the water far better, but every lit beacon is a gamble with the harvest.',
    applies: (d) => !!d.runtime.features.fire && d.runtime.claimDefs.some((c) => !c.rival && ['lit_beacon', 'smoke_fire'].includes(c.spec.trigger.kind)),
    apply(d) {
      for (const c of d.runtime.claimDefs) {
        if (c.rival || !['lit_beacon', 'smoke_fire'].includes(c.spec.trigger.kind)) continue;
        c.spec = { ...c.spec, intensity: Math.min(3, c.spec.intensity + 1), radius: Math.min(5, c.spec.radius + 1) };
        if (!c.spec.side.includes('ignition') && c.spec.side.length < 3) c.spec = { ...c.spec, side: [...c.spec.side, 'ignition'] };
        c.benefit += ' (Soot season: one step stronger and a wider reach.)';
      }
      d.runtime.consts.fireBase = (d.runtime.consts.fireBase ?? 10) + 7;
    },
  },
  {
    id: 'busy_harvest',
    name: 'Busy harvest',
    icon: 'wheat',
    blurb: 'Gatherings persuade about 45% less because nobody wants to leave the field, and night labour exhausts people 35% faster.',
    tradeoff: 'Speeches are weak; one-to-one conversations, messengers and proof matter more.',
    applies: (d) => hasLandmark(d, 'field'),
    apply() {},
  },
  {
    id: 'travelling_circus',
    name: 'Travelling circus',
    icon: 'tent',
    blurb: 'A showman has pitched up: they now know a handful of new people and carry the rival’s rumour in their act.',
    tradeoff: 'A free, fast broadcaster, but pointed the wrong way. Win them over first or answer the rumour before it spreads.',
    applies: (d) => d.runtime.rivals.length > 0 && d.villagers.length >= 10,
    apply(d, seed) {
      const st = new Stream(seed, 'circus');
      const rival = d.runtime.rivals[0];
      const keepers = new Set([rival.leader, ...d.factions.map((f) => f.leader)]);
      const pool = d.villagers.filter((v) => !keepers.has(v.id) && v.archetype !== 'child' && v.archetype !== 'keeper');
      const star = pool.sort((a, b) => (a.id < b.id ? -1 : 1))[st.int(pool.length)] ?? d.villagers[0];
      star.role = `${star.role} (hosting the circus)`;
      star.traits = { ...(star.traits ?? {}), influence: 90, skepticism: 25 };
      star.beliefs = { ...(star.beliefs ?? {}), [rival.claim]: 55 };
      const others = st.shuffle(d.villagers.filter((v) => v.id !== star.id && !d.edges.some((e) => (e.a === star.id && e.b === v.id) || (e.b === star.id && e.a === v.id))));
      for (const o of others.slice(0, 4)) d.edges.push({ a: star.id, b: o.id, ab: 48, ba: 58, rate: 0.7, kind: 'friend' });
    },
  },
  {
    id: 'silent_bells',
    name: 'Silent bells',
    icon: 'bell-off',
    blurb: 'The bell tower’s clapper is cracked. Nothing can be rung before day 4.',
    tradeoff: 'Bell stories cannot be proved early, so your first plan must lean on something else.',
    applies: (d) => hasLandmark(d, 'belltower') && d.runtime.rituals.some((r) => r.physical === 'ring'),
    apply(d) {
      d.runtime.consts.bellsMendedDay = 4;
      d.runtime.beats.push({ id: 'bells_mended', when: { kind: 'day', arg: 4 }, title: 'The clapper is mended', text: 'The bell tower can ring again.', once: true });
    },
  },
  {
    id: 'overcrowded_refuge',
    name: 'Overcrowded refuge',
    icon: 'users',
    blurb: 'Every shelter has only about half its room.',
    tradeoff: 'Evacuation can no longer save everyone. Defend homes and the bridge instead of relying on the hill.',
    applies: (d) => hasLandmark(d, 'shelter') && !!d.runtime.features.flood,
    apply(d) {
      for (const l of d.map.landmarks) if (l.kind === 'shelter') l.capacity = Math.max(2, Math.floor((l.capacity ?? 6) * 0.55));
    },
  },
  {
    id: 'low_fuel',
    name: 'Low fuel',
    icon: 'fuel',
    blurb: 'The fuel store is halved.',
    tradeoff: 'A beacon wall or a smoke ring is costly, so the cheaper bridge and rain routes look better.',
    applies: (d) => (d.map.stocks.fuel ?? 0) >= 4,
    apply(d) {
      d.map.stocks.fuel = Math.max(2, Math.ceil((d.map.stocks.fuel ?? 0) * 0.5));
    },
  },
  {
    id: 'doubting_scholars',
    name: 'Doubting scholars',
    icon: 'microscope',
    blurb: 'Demonstrations are about 35% more convincing, but telling and gossiping persuade about 20% less.',
    tradeoff: 'Proof is king. Mass-telling is weak. Every ritual night is worth planning around.',
    applies: () => true,
    apply() {},
  },
  {
    id: 'stubborn_elders',
    name: 'Stubborn elders',
    icon: 'anchor',
    blurb: 'Elders, hermits and reeves are slower to change their minds, and laws fade only half as fast once they form.',
    tradeoff: 'Slow adoption, but a law that finally takes hold keeps working even when support slips.',
    applies: () => true,
    apply(d) {
      for (const v of d.villagers) {
        if (!['elder', 'hermit', 'reeve'].includes(v.archetype)) continue;
        v.traits = { ...(v.traits ?? {}), susceptibility: 22, stubbornness: 92 };
      }
    },
  },
  {
    id: 'divided_council',
    name: 'Divided council',
    icon: 'gavel',
    blurb: 'The Council bans public gatherings on some mornings. The day before, you are warned.',
    tradeoff: 'On a ban day only one-to-one talk and rituals work. Hold your speeches for the days between.',
    applies: (d) => d.factions.some((f) => f.kind === 'council') && d.runtime.durationDays >= 6,
    apply() {},
  },
  {
    id: 'clear_night_skies',
    name: 'Clear night skies',
    icon: 'moon',
    blurb: 'Every night is clear: moonlight proof is always convincing and the moonlight law grows crops 50% faster. No rain falls at all.',
    tradeoff: 'Rain stories can never be proved and the bells are useless as a weapon.',
    applies: (d) => !!d.runtime.features.crops,
    apply(d) {
      d.runtime.threat = d.runtime.threat.map((t) => ({ ...t, rain: 0, heat: Math.max(2, t.heat) }));
    },
  },
  {
    id: 'river_of_reeds',
    name: 'River of reeds',
    icon: 'waves',
    blurb: 'Water-turning laws reach one tile farther and are one step stronger, but the reeds make the surge unpredictable: tomorrow’s level can differ by one from the forecast.',
    tradeoff: 'Diversion is easier, the forecast is not trustworthy.',
    applies: (d) => !!d.runtime.features.flood,
    apply(d) {
      for (const c of d.runtime.claimDefs) {
        if (c.rival || c.spec.subject !== 'river') continue;
        c.spec = { ...c.spec, intensity: Math.min(3, c.spec.intensity + 1), radius: Math.min(5, c.spec.radius + 1) };
      }
      d.jitter = d.jitter.map((_, i) => (i >= 1 && i < d.runtime.durationDays - 1 ? 1 : 0));
    },
  },
  {
    id: 'early_frost',
    name: 'Early frost',
    icon: 'snowflake',
    blurb: 'Crops grow more slowly, but the cold soil also dries out more slowly.',
    tradeoff: 'The harvest is later and every night of growth boost counts for more.',
    applies: (d) => !!d.runtime.features.crops,
    apply(d) {
      d.runtime.consts.growBase = Math.max(2, (d.runtime.consts.growBase ?? 5) - 2);
      d.runtime.consts.dryRate = Math.max(1, (d.runtime.consts.dryRate ?? 5) - 2);
    },
  },
  {
    id: 'restless_wolves',
    name: 'Restless wolves',
    icon: 'paw',
    blurb: 'Packs travel four tiles a night instead of three.',
    tradeoff: 'Distance buys you less time. Fires must be lit before a pack is near.',
    applies: (d) => !!d.runtime.features.wolves,
    apply(d) {
      d.runtime.consts.wolfSteps = 4;
    },
  },
];

export const MODIFIER_IDS = MODIFIERS.map((m) => m.id);

export function getModifier(id: Id): ModifierDef | undefined {
  return MODIFIERS.find((m) => m.id === id);
}

export function applicableModifiers(d: ScenarioDef): ModifierDef[] {
  return MODIFIERS.filter((m) => m.applies(d));
}

/** Return a private copy of the scenario with the named modifiers applied. Unknown or inapplicable ids are ignored. */
export function applyModifiers(base: ScenarioDef, ids: readonly Id[], seed: number): ScenarioDef {
  if (!ids.length) return base;
  const d = clone(base);
  for (const id of ids) {
    const m = getModifier(id);
    if (m && m.applies(d)) m.apply(d, seed);
  }
  return d;
}

/** Keep only modifiers that exist and apply to this scenario (stable order, no duplicates). */
export function sanitizeModifiers(d: ScenarioDef, ids: readonly Id[]): Id[] {
  const out: Id[] = [];
  for (const id of ids) {
    const m = getModifier(id);
    if (m && m.applies(d) && !out.includes(id)) out.push(id);
  }
  return out;
}
