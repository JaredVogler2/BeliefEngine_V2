import type { Effect, RuleSpec, SideEffectId, Subject, TriggerKind } from '../core/types.ts';

/**
 * The reality-rule vocabulary. A RuleSpec is a bounded, typed description of a physical effect. Authored
 * claims, rival claims and player-composed beliefs all compile to RuleSpecs; the engine executes them via
 * a fixed table of effect primitives (laws/effects.ts). Free text never becomes code.
 */

/** Which effects are physically meaningful for each subject. Invalid pairs are rejected by validateSpec. */
export const COMPAT: Record<Subject, Effect[]> = {
  river: ['repel', 'attract', 'redirect', 'slow'],
  rain: ['redirect', 'attract', 'repel'],
  bridge: ['strengthen', 'weaken'],
  grain: ['grow', 'weaken'],
  wolf: ['repel', 'attract'],
  stone: ['redirect', 'strengthen'],
  smoke: ['conceal'],
  illness: ['repel', 'weaken'],
  fire: ['weaken', 'strengthen', 'slow'],
};

/** Triggers that make sense for each subject (what physically has to be happening for the law to bite). */
export const TRIGGERS: Record<Subject, TriggerKind[]> = {
  river: ['lit_beacon', 'smoke_fire', 'bell', 'evidence'],
  rain: ['bell'],
  bridge: ['watchers', 'bell'],
  grain: ['night', 'evidence', 'bell', 'always'],
  wolf: ['smoke_fire', 'lit_beacon', 'bell'],
  stone: ['always', 'evidence'],
  smoke: ['smoke_fire', 'lit_beacon'],
  illness: ['always', 'lit_beacon', 'smoke_fire'],
  fire: ['always', 'watchers'],
};

export const SIDE_EFFECT_INFO: Record<SideEffectId, { label: string; text: string; power: number }> = {
  ignition: { label: 'Stray sparks', text: 'lit fires near dry fields or trees may start a blaze', power: 3 },
  labor_drain: { label: 'Night labour', text: 'workers who keep the law lose energy and health', power: 2 },
  rain_displace: { label: 'Displaced rain', text: 'the water you push away pools elsewhere', power: 3 },
  smoke_sickness: { label: 'Smoke lungs', text: 'people near the smoke grow ill', power: 3 },
  stone_unstable: { label: 'Loosened stone', text: 'old walls near moved stone weaken', power: 2 },
  complacency: { label: 'Complacency', text: 'people stop watching for fire, so fires start more often', power: 3 },
  cold: { label: 'Cold drafts', text: 'open doors let in the cold; the weak lose health', power: 2 },
};

export interface SpecIssue {
  field: string;
  message: string;
}

/** Strict structural + compatibility validation. Returns issues (empty means valid). */
export function validateSpec(spec: unknown): SpecIssue[] {
  const issues: SpecIssue[] = [];
  const s = spec as Partial<RuleSpec> | null;
  if (!s || typeof s !== 'object') return [{ field: '', message: 'spec must be an object' }];
  if (typeof s.id !== 'string' || !/^[a-z0-9_:\-.]{1,64}$/i.test(s.id)) issues.push({ field: 'id', message: 'invalid id' });
  if (s.version !== 1) issues.push({ field: 'version', message: 'unsupported version' });
  if (!s.subject || !(s.subject in COMPAT)) {
    issues.push({ field: 'subject', message: 'unknown subject' });
    return issues;
  }
  if (!s.effect || !COMPAT[s.subject].includes(s.effect)) issues.push({ field: 'effect', message: `${s.subject} cannot ${String(s.effect)}` });
  if (!s.trigger || !TRIGGERS[s.subject].includes(s.trigger.kind)) issues.push({ field: 'trigger', message: `${s.subject} cannot be triggered by ${String(s.trigger?.kind)}` });
  const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  if (!num(s.radius, 0, 6)) issues.push({ field: 'radius', message: 'radius must be 0..6' });
  if (!num(s.intensity, 1, 3)) issues.push({ field: 'intensity', message: 'intensity must be 1..3' });
  const th = s.thresholds;
  if (!th || !num(th.on, 0.4, 0.95) || !num(th.off, 0.2, 0.9) || th.off >= th.on) issues.push({ field: 'thresholds', message: 'thresholds must satisfy 0.2<=off<on<=0.95' });
  else {
    if (!num(th.minSupporters, 1, 12)) issues.push({ field: 'thresholds.minSupporters', message: 'minSupporters must be 1..12' });
    if (!num(th.ramp, 10, 100) || !num(th.decay, 5, 100)) issues.push({ field: 'thresholds.rate', message: 'ramp/decay out of range' });
  }
  if (!s.upkeep || !num(s.upkeep.fuel, 0, 3)) issues.push({ field: 'upkeep', message: 'upkeep.fuel must be 0..3' });
  if (!Array.isArray(s.side) || s.side.length > 3 || s.side.some((x) => !(x in SIDE_EFFECT_INFO))) issues.push({ field: 'side', message: 'side effects must be up to 3 known ids' });
  if (!Array.isArray(s.tags) || s.tags.length > 8) issues.push({ field: 'tags', message: 'tags must be a short array' });
  return issues;
}

/** Raw physical reach x strength x how easily the trigger is met. Shared by the authored-rule budget and the belief composer. */
export function specPower(spec: Pick<RuleSpec, 'radius' | 'intensity' | 'trigger'>): number {
  const reach = spec.radius === 0 ? 4 : Math.PI * (spec.radius + 0.5) ** 2 * 0.35;
  // a bridge that needs fewer watchers is easier to power
  const triggerEase =
    spec.trigger.kind === 'always' ? 1.6 : spec.trigger.kind === 'night' ? 1.15 : spec.trigger.kind === 'evidence' ? 0.9 : spec.trigger.kind === 'watchers' ? ((spec.trigger.min ?? 1) >= 3 ? 1 : (spec.trigger.min ?? 1) === 2 ? 1.1 : 1.25) : 1;
  return reach * spec.intensity * triggerEase;
}

/**
 * Transparent power budget. Stronger/larger/easier laws need higher adoption, and must carry downsides.
 * power = reach * intensity weight * triggerEase ; cost = threshold + sides + upkeep.
 */
export function powerBudget(spec: RuleSpec): { power: number; offset: number; balanced: boolean; minOn: number; sidesNeeded: number } {
  const power = specPower(spec);
  const sidePower = spec.side.reduce((a, s) => a + SIDE_EFFECT_INFO[s].power, 0);
  const offset =
    (spec.thresholds.on - 0.5) * 40 + spec.thresholds.minSupporters * 1.2 + spec.upkeep.fuel * 4 + sidePower * 1.8 + (spec.thresholds.decay - 20) * 0.1;
  // Required adoption grows with power; side effects buy a cheaper threshold up to a floor.
  const minOn = Math.min(0.9, 0.5 + power / 160 - sidePower * 0.012);
  const sidesNeeded = power > 28 ? 2 : power > 12 ? 1 : 0;
  const balanced = spec.thresholds.on >= minOn - 0.001 && spec.side.length >= sidesNeeded && power <= 80;
  return { power, offset, balanced, minOn, sidesNeeded };
}

const std = (on: number, off: number, minSupporters: number, ramp = 80, decay = 22) => ({ on, off, minSupporters, ramp, decay });

/** Canonical authored rules. Scenario claim definitions reference these by id. */
export const RULES: Record<string, RuleSpec> = {
  river_fears_fire: {
    id: 'river_fears_fire', version: 1, subject: 'river', effect: 'repel',
    trigger: { kind: 'lit_beacon' }, radius: 3, intensity: 3,
    thresholds: std(0.6, 0.45, 3), upkeep: { fuel: 0 }, side: ['ignition'], tags: ['flood', 'fire', 'canonical'],
  },
  river_courts_fire: {
    id: 'river_courts_fire', version: 1, subject: 'river', effect: 'attract',
    trigger: { kind: 'lit_beacon' }, radius: 3, intensity: 1,
    thresholds: std(0.55, 0.4, 3, 55, 25), upkeep: { fuel: 0 }, side: ['ignition'], tags: ['flood', 'fire', 'rival'],
  },
  bridge_stands_watched: {
    id: 'bridge_stands_watched', version: 1, subject: 'bridge', effect: 'strengthen',
    trigger: { kind: 'watchers', min: 3 }, radius: 0, intensity: 3,
    thresholds: std(0.55, 0.4, 4, 60, 20), upkeep: { fuel: 0 }, side: ['labor_drain'], tags: ['flood', 'bridge', 'canonical'],
  },
  crowds_break_bridges: {
    id: 'crowds_break_bridges', version: 1, subject: 'bridge', effect: 'weaken',
    trigger: { kind: 'watchers', min: 1 }, radius: 0, intensity: 2,
    thresholds: std(0.55, 0.4, 3, 55, 25), upkeep: { fuel: 0 }, side: [], tags: ['flood', 'bridge', 'rival'],
  },
  rain_heeds_bells: {
    id: 'rain_heeds_bells', version: 1, subject: 'rain', effect: 'redirect',
    trigger: { kind: 'bell' }, radius: 0, intensity: 2,
    thresholds: std(0.6, 0.45, 3), upkeep: { fuel: 0 }, side: ['rain_displace'], tags: ['flood', 'rain', 'canonical'],
  },
  rain_shuns_bells: {
    id: 'rain_shuns_bells', version: 1, subject: 'rain', effect: 'repel',
    trigger: { kind: 'bell' }, radius: 0, intensity: 1,
    thresholds: std(0.55, 0.4, 3, 55, 25), upkeep: { fuel: 0 }, side: ['rain_displace'], tags: ['rain', 'rival'],
  },
  rain_follows_bells: {
    id: 'rain_follows_bells', version: 1, subject: 'rain', effect: 'attract',
    trigger: { kind: 'bell' }, radius: 0, intensity: 2,
    thresholds: std(0.6, 0.45, 3), upkeep: { fuel: 0 }, side: ['rain_displace'], tags: ['drought', 'rain', 'canonical'],
  },
  moonlight_ripens_grain: {
    id: 'moonlight_ripens_grain', version: 1, subject: 'grain', effect: 'grow',
    trigger: { kind: 'night' }, radius: 0, intensity: 2,
    thresholds: std(0.58, 0.42, 3), upkeep: { fuel: 0 }, side: ['labor_drain'], tags: ['drought', 'crops', 'canonical'],
  },
  wolves_fear_smoke: {
    id: 'wolves_fear_smoke', version: 1, subject: 'wolf', effect: 'repel',
    trigger: { kind: 'smoke_fire' }, radius: 3, intensity: 2,
    thresholds: std(0.56, 0.42, 2), upkeep: { fuel: 0 }, side: ['smoke_sickness'], tags: ['wolves', 'smoke', 'canonical'],
  },
  moon_sours_grain: {
    id: 'moon_sours_grain', version: 1, subject: 'grain', effect: 'weaken',
    trigger: { kind: 'night' }, radius: 0, intensity: 1,
    thresholds: std(0.55, 0.4, 3, 55, 25), upkeep: { fuel: 0 }, side: [], tags: ['crops', 'rival'],
  },
  wolves_follow_smoke: {
    id: 'wolves_follow_smoke', version: 1, subject: 'wolf', effect: 'attract',
    trigger: { kind: 'smoke_fire' }, radius: 3, intensity: 1,
    thresholds: std(0.49, 0.34, 3, 75, 22), upkeep: { fuel: 0 }, side: ['smoke_sickness'], tags: ['wolves', 'smoke', 'rival'],
  },
  stone_grows_light: {
    id: 'stone_grows_light', version: 1, subject: 'stone', effect: 'redirect',
    trigger: { kind: 'always' }, radius: 2, intensity: 1,
    thresholds: std(0.65, 0.5, 4, 60, 20), upkeep: { fuel: 0 }, side: ['stone_unstable'], tags: ['flood', 'stone', 'canonical'],
  },
  illness_fears_open_doors: {
    id: 'illness_fears_open_doors', version: 1, subject: 'illness', effect: 'repel',
    trigger: { kind: 'always' }, radius: 0, intensity: 2,
    thresholds: std(0.6, 0.45, 3), upkeep: { fuel: 0 }, side: ['cold'], tags: ['sickness', 'canonical'],
  },
  flames_cannot_hurt: {
    id: 'flames_cannot_hurt', version: 1, subject: 'fire', effect: 'weaken',
    trigger: { kind: 'always' }, radius: 0, intensity: 3,
    thresholds: std(0.6, 0.45, 3), upkeep: { fuel: 0 }, side: ['complacency'], tags: ['fire', 'canonical'],
  },
  honest_light_reveals: {
    id: 'honest_light_reveals', version: 1, subject: 'fire', effect: 'slow',
    trigger: { kind: 'watchers', min: 2 }, radius: 0, intensity: 2,
    thresholds: std(0.55, 0.4, 3), upkeep: { fuel: 0 }, side: ['labor_drain'], tags: ['fire', 'canonical'],
  },
};

export function getRule(id: string): RuleSpec {
  const r = RULES[id];
  if (!r) throw new Error(`Unknown rule ${id}`);
  return r;
}
