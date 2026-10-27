import type { ScenarioDef } from '../content/types.ts';
import type { ClaimDef, Id } from '../core/types.ts';
import { getRule } from '../laws/rules.ts';
import { clone } from '../gen/blueprint.ts';

/**
 * Options that expand what a player can choose rather than how strong they are: optional starting stories, claim drafts, self-imposed
 * pledges and challenge presets. Each one changes an accessible rule of the run and is enforced by the engine; none is needed to win
 * any scenario. Unlock conditions live in progress/unlocks.ts.
 */

export interface PledgeDef {
  id: Id;
  name: string;
  blurb: string;
  /** score bonus for a run finished while keeping the pledge (the engine enforces it, so it is always kept) */
  bonus: number;
  applies(d: ScenarioDef): boolean;
}

export const PLEDGE_PREFIX = 'pledge:';

export const PLEDGES: PledgeDef[] = [
  {
    id: 'no_fire', name: 'Bridgekeeper’s Oath', bonus: 0.2,
    blurb: 'You swear to light no beacon and no fire. Every ritual that needs flame is closed to you, so the plan must come from the bridge, the bells, the fields or the people.',
    applies: (d) => d.runtime.rituals.some((r) => r.physical === 'light' || r.physical === 'smoke'),
  },
  {
    id: 'no_gathering', name: 'Quiet streets', bonus: 0.12,
    blurb: 'No public gatherings. Only one-to-one words, messengers and proof.',
    applies: () => true,
  },
  {
    id: 'thin_voice', name: 'Thin voice', bonus: 0.2,
    blurb: 'One less Influence every day, including the first.',
    applies: () => true,
  },
  {
    id: 'all_alive', name: 'Not one lost', bonus: 0.25,
    blurb: 'If anyone dies the run ends at once.',
    applies: () => true,
  },
];

export const pledgeKey = (id: Id): string => `${PLEDGE_PREFIX}${id}`;

export function getPledge(id: Id): PledgeDef | undefined {
  return PLEDGES.find((p) => p.id === id);
}

export function sanitizePledges(d: ScenarioDef, ids: readonly Id[]): Id[] {
  const out: Id[] = [];
  for (const id of ids) {
    const p = getPledge(id);
    if (p && p.applies(d) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function pledgesOf(modifiers: readonly string[]): Id[] {
  return modifiers.filter((m) => m.startsWith(PLEDGE_PREFIX)).map((m) => m.slice(PLEDGE_PREFIX.length));
}

/** Total score multiplier from the pledges kept (additive bonuses, capped). */
export function pledgeMultiplier(modifiers: readonly string[]): number {
  let b = 0;
  for (const id of pledgesOf(modifiers)) b += getPledge(id)?.bonus ?? 0;
  return 1 + Math.min(0.5, b);
}

// ------------------------------------------------------------------ optional starting stories

export interface ExtraClaim {
  id: Id;
  scenarioId: Id;
  /** unlock id that makes it selectable */
  unlock: string;
  def: ClaimDef;
}

export const EXTRA_CLAIMS: ExtraClaim[] = [
  {
    id: 'flames_cannot_hurt', scenarioId: 'redbank', unlock: 'starter_fireproof',
    def: {
      id: 'flames_cannot_hurt', text: 'Flames cannot hurt a house that believes in them.', short: 'Flames cannot hurt us', icon: 'flame',
      spec: getRule('flames_cannot_hurt'), regions: ['east'], ritual: 'light_beacon', contradicts: [],
      benefit: 'While Eastbank believes, fire damage to homes is cut by up to 75% (fields still burn).',
      risk: 'Complacency: people stop watching for sparks, so fires start up to 60% more often. A fire wall of beacons gets safer for homes and riskier for crops.',
      flavor: 'A festival song. A dangerous comfort.', startsAvailable: false, unlockDay: 3,
    },
  },
];

export function extraClaimsFor(scenarioId: Id): ExtraClaim[] {
  return EXTRA_CLAIMS.filter((c) => c.scenarioId === scenarioId);
}

/** Add unlocked optional stories to a copy of the scenario; they join the opening choice. Unknown ids are ignored. */
export function applyExtraClaims(base: ScenarioDef, ids: readonly Id[]): ScenarioDef {
  const wanted = extraClaimsFor(base.runtime.id).filter((c) => ids.includes(c.id) && !base.runtime.claimDefs.some((x) => x.id === c.id));
  if (!wanted.length) return base;
  const d = clone(base);
  for (const c of wanted) {
    d.runtime.claimDefs.push(clone(c.def));
    d.runtime.starters.push(c.id);
  }
  return d;
}

// ------------------------------------------------------------------ claim draft

/**
 * Keep only the drafted stories (a subset of the player-side claims, at least two). Rival claims stay. The drafted stories become the
 * opening choice and nothing else unlocks later: fewer tools, a sharper puzzle.
 */
export function applyDraft(base: ScenarioDef, draft: readonly Id[] | undefined): ScenarioDef {
  if (!draft || draft.length === 0) return base;
  const mine = base.runtime.claimDefs.filter((c) => !c.rival).map((c) => c.id);
  const keep = mine.filter((id) => draft.includes(id));
  if (keep.length < 2 || keep.length >= mine.length) return base;
  const d = clone(base);
  d.runtime.claimDefs = d.runtime.claimDefs.filter((c) => c.rival || keep.includes(c.id));
  for (const c of d.runtime.claimDefs) {
    c.contradicts = c.contradicts.filter((x) => d.runtime.claimDefs.some((y) => y.id === x));
    if (!c.rival) c.unlockDay = undefined;
  }
  d.runtime.starters = keep.slice(0, 3);
  for (const r of d.runtime.rivals) if (!d.runtime.claimDefs.some((c) => c.id === r.watches)) r.trigger = 2; // nothing to answer: the rival stays quiet
  return d;
}

export const DRAFT_BONUS = 0.15;

// ------------------------------------------------------------------ challenge presets

export interface PresetDef {
  id: string;
  name: string;
  blurb: string;
  modifiers: Id[];
  unlock: string;
  bonus: number;
}

export const PRESETS: PresetDef[] = [
  {
    id: 'hostile_council', name: 'Hostile council', unlock: 'preset_hostile_council', bonus: 0.2,
    blurb: 'The Council bans gatherings on some mornings and a showman carries the rival’s rumour around the village.',
    modifiers: ['divided_council', 'travelling_circus'],
  },
];

// ------------------------------------------------------------------ rebuilding a run's options

/** The options that would recreate this run from scratch (retry, share, replay): scenario, seed, difficulty and every chosen extra. */
export function optionsFromState(s: import('../core/types.ts').RunState): import('../core/types.ts').CreateRunOptions {
  const pledges = pledgesOf(s.modifiers);
  const mods = s.modifiers.filter((m) => !m.startsWith(PLEDGE_PREFIX));
  const extra = EXTRA_CLAIMS.filter((c) => c.scenarioId === s.scenarioId && s.scn.claimDefs.some((d) => d.id === c.id)).map((c) => c.id);
  return {
    scenarioId: s.scenarioId,
    seed: s.seed,
    difficulty: s.difficulty,
    mode: s.mode,
    ...(s.flags.dailyDate ? { dailyDate: s.flags.dailyDate } : {}),
    ...(pledges.length ? { pledges } : {}),
    ...(extra.length ? { extraClaims: extra } : {}),
    ...(s.flags.drafted ? { draft: s.scn.claimDefs.filter((c) => !c.rival).map((c) => c.id) } : {}),
    // twists the player chose (as opposed to the ones a generated village drew from its seed)
    ...(s.flags.twisted ? { modifiers: mods } : {}),
    ...(s.flags.inventor ? { inventor: true } : {}),
    ...(s.flags.reality === 2 ? { realityLab: true } : s.flags.reality === 1 ? { reality: true } : {}),
  };
}
