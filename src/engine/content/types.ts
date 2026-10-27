import type { Faction, ScenarioRuntime, Traits } from '../core/types.ts';
import type { MapDef } from '../world/build.ts';

export interface VillagerDef {
  id: string;
  name: string;
  role: string;
  archetype: string;
  faction: string;
  household: string;
  home: string;
  work: string;
  want: string;
  /** partial overrides of archetype traits */
  traits?: Partial<Traits>;
  /** initial trust in the Keeper 0..100 */
  trust: number;
  look?: { hue?: number; skin?: number; hair?: number; hat?: number; build?: number };
  /** initial conviction in claims (rare; most scenarios start empty) */
  beliefs?: Record<string, number>;
}

export interface EdgeDef {
  a: string;
  b: string;
  ab: number;
  ba: number;
  rate: number;
  kind: 'household' | 'friend' | 'work' | 'faction' | 'rival' | 'kin' | 'trade' | 'neighbor';
}

export interface ScenarioDef {
  runtime: ScenarioRuntime;
  map: MapDef;
  villagers: VillagerDef[];
  edges: EdgeDef[];
  factions: Faction[];
  ap: { start: number; perDay: number; max: number };
  /** how much the actual threat schedule may deviate from the authored forecast, per day index (0 = none) */
  jitter: number[];
  /** modifiers this scenario ships with (generated villages draw theirs from the seed) */
  modifiers?: string[];
}

/** Archetype baselines (skepticism, openness, stubbornness, susceptibility, influence). */
export const ARCHETYPES: Record<string, { label: string; blurb: string; traits: Traits }> = {
  witness_truster: { label: 'Witness-truster', blurb: 'Believes what they see with their own eyes.', traits: { skepticism: 20, openness: 60, stubbornness: 35, susceptibility: 65, influence: 30 } },
  preacher: { label: 'Charismatic storyteller', blurb: 'Spreads a tale fast, but a refuted tale costs them dearly.', traits: { skepticism: 25, openness: 70, stubbornness: 45, susceptibility: 60, influence: 85 } },
  scholar: { label: 'Skeptical scholar', blurb: 'Hearsay barely moves them. A demonstration they witness can.', traits: { skepticism: 85, openness: 80, stubbornness: 35, susceptibility: 35, influence: 55 } },
  elder: { label: 'Stubborn elder', blurb: 'Slow to change, slow to forget. Respected by many.', traits: { skepticism: 50, openness: 35, stubbornness: 90, susceptibility: 35, influence: 70 } },
  farmer: { label: 'Practical farmer', blurb: 'Cares about fields and weather. Trusts what has worked.', traits: { skepticism: 45, openness: 45, stubbornness: 55, susceptibility: 45, influence: 45 } },
  parent: { label: 'Fearful parent', blurb: 'Fear for the children makes them receptive and volatile.', traits: { skepticism: 45, openness: 55, stubbornness: 40, susceptibility: 75, influence: 35 } },
  trader: { label: 'Opportunistic trader', blurb: 'Follows whatever pays. Well-connected to both banks.', traits: { skepticism: 40, openness: 65, stubbornness: 30, susceptibility: 55, influence: 55 } },
  keeper: { label: 'Duty-bound keeper', blurb: 'Takes a post seriously. Loyal to two worlds.', traits: { skepticism: 50, openness: 50, stubbornness: 50, susceptibility: 50, influence: 60 } },
  child: { label: 'Child', blurb: 'Believes boldly. Adults listen to what children fear.', traits: { skepticism: 10, openness: 90, stubbornness: 15, susceptibility: 85, influence: 15 } },
  hermit: { label: 'Hermit', blurb: 'Lives apart. Few ties, but a steady witness.', traits: { skepticism: 55, openness: 25, stubbornness: 70, susceptibility: 35, influence: 20 } },
  rival: { label: 'Hard skeptic', blurb: 'Debunks for a living. Persuadable only by firsthand proof.', traits: { skepticism: 90, openness: 35, stubbornness: 80, susceptibility: 25, influence: 70 } },
  reeve: { label: 'Reeve', blurb: 'Keeps order and the ledger. Distrusts anything unaccounted for.', traits: { skepticism: 60, openness: 40, stubbornness: 60, susceptibility: 35, influence: 80 } },
  ringer: { label: 'Bell-keeper', blurb: 'Tradition-minded. Their bells are the village clock.', traits: { skepticism: 35, openness: 50, stubbornness: 60, susceptibility: 55, influence: 55 } },
};
