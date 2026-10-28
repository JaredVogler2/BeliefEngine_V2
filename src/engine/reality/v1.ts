import type { ClaimDef, RuleSpec, TriggerKind } from '../core/types.ts';
import { SIDE_EFFECT_INFO } from '../laws/rules.ts';
import type { Clause, Effect, RealityAst, Selector, Trigger } from './ast.ts';
import { REALITY_LANG } from './ontology.ts';

/**
 * V1 laws in the V2 language. Every V1 `RuleSpec` (authored, rival, or a V1 player-written belief) has an AST v2 reading with the
 * same subject, effect, trigger, reach and strength, so V2 previews, MCP inspection and the decision ledger describe old and new
 * laws in one vocabulary.
 *
 * The bridge, explicitly: V1 laws keep RUNNING on V1's own executor (laws/effects.ts `computeModifiers`), in Classic and in
 * Generative Reality runs alike, so every V1 replay and save reproduces bit for bit (tests/unit/v2-migration.test.ts). The
 * translation is a description with `source.reader = 'legacy-v1'`; its V1 side effects are listed as omissions ("executed by the
 * V1 law engine"), because AST v2 expresses downsides through its operators instead. Where both describe the same physics, the
 * operator is implemented with V1's own arithmetic (tests/unit/reality-execute.test.ts checks the flood shield is identical).
 */

const TRIGGER: Record<TriggerKind, Trigger> = {
  lit_beacon: { event: 'lantern', min: null },
  smoke_fire: { event: 'smoke_fire', min: null },
  bell: { event: 'bell', min: null },
  watchers: { event: 'watchers', min: null },
  night: { event: 'night', min: null },
  evidence: { event: 'ritual', min: null },
  always: { event: 'always', min: null },
};

const sel = (kind: Selector['kind']): Selector => ({ kind, near: null, tags: [], region: null });

/** One V1 clause → one AST v2 clause, or null for the two V1 pairings with no physical effect (smoke.conceal, stone.*). */
export function clauseFromSpec(spec: RuleSpec, id: string): Clause | null {
  const i = Math.max(1, Math.min(3, Math.round(spec.intensity)));
  const r = Math.max(0, Math.min(4, Math.round(spec.radius)));
  let when: Trigger = spec.trigger.kind === 'watchers' ? { event: 'watchers', min: spec.trigger.min ?? 1 } : TRIGGER[spec.trigger.kind];
  let target: Selector;
  let effect: Effect;
  switch (`${spec.subject}.${spec.effect}`) {
    case 'river.repel':
    case 'river.redirect':
      [target, effect] = [sel('water'), { op: 'REDIRECT_FLOW', mode: 'repel', magnitude: i, radius: r }];
      break;
    case 'river.slow':
      [target, effect] = [sel('water'), { op: 'REDIRECT_FLOW', mode: 'slow', magnitude: i, radius: r }];
      break;
    case 'river.attract':
      [target, effect] = [sel('water'), { op: 'REDIRECT_FLOW', mode: 'attract', magnitude: i, radius: r }];
      break;
    case 'rain.redirect':
      [target, effect] = [sel('rain'), { op: 'WEATHER_MODIFIER', mode: 'redirect', magnitude: i, toward: null }];
      break;
    case 'rain.attract':
      [target, effect] = [sel('rain'), { op: 'WEATHER_MODIFIER', mode: 'attract', magnitude: i, toward: null }];
      break;
    case 'rain.repel':
      [target, effect] = [sel('rain'), { op: 'WEATHER_MODIFIER', mode: 'repel', magnitude: i, toward: null }];
      break;
    case 'bridge.strengthen':
    case 'bridge.weaken':
      // V1 protects the bridge only when someone stands on it, whatever powers the law: the reading says so explicitly
      if (spec.trigger.kind !== 'watchers') when = { all: [when, { event: 'watchers', min: 1 }] };
      [target, effect] = [sel('bridge'), { op: 'MODIFY_DURABILITY', delta: spec.effect === 'strengthen' ? i : -1 }];
      break;
    case 'grain.grow':
      [target, effect] = [sel('field'), { op: 'GROW_ENTITY', magnitude: i }];
      break;
    case 'grain.weaken':
      [target, effect] = [sel('field'), { op: 'DECAY_ENTITY', magnitude: i }];
      break;
    case 'wolf.repel':
      [target, effect] = [sel('wolf'), { op: 'MOVE_AWAY', magnitude: i, radius: r }];
      break;
    case 'wolf.attract':
      [target, effect] = [sel('wolf'), { op: 'MOVE_TOWARD', magnitude: i, radius: r }];
      break;
    case 'illness.repel':
    case 'illness.weaken':
      [target, effect] = [sel('villager'), { op: 'GIVE_STATUS_EFFECT', status: 'sick_resistant', magnitude: i }];
      break;
    case 'fire.weaken':
      [target, effect] = [sel('fire'), { op: 'ALTER_TEMPERATURE', delta: -i }];
      break;
    case 'fire.strengthen':
      [target, effect] = [sel('fire'), { op: 'ALTER_TEMPERATURE', delta: i }];
      break;
    case 'fire.slow':
      [target, effect] = [sel('fire'), { op: 'MODIFY_MOVEMENT', delta: -i }];
      break;
    default:
      return null;
  }
  return { id, when, where: null, target, effect, duration: 'night' };
}

/** The AST v2 reading of a V1 claim (authored or V1-written). Never executed by the reality executor: V1 claims run on V1's engine. */
export function astFromV1(def: ClaimDef): { ast: RealityAst; untranslated: string[] } | null {
  if (def.reality) return null;
  const specs = [def.spec, ...(def.extra ?? [])];
  const clauses: Clause[] = [];
  const untranslated: string[] = [];
  specs.forEach((sp, k) => {
    const c = clauseFromSpec(sp, `c${clauses.length + 1}`);
    if (c && clauses.length < 3) clauses.push(c);
    else untranslated.push(`${sp.subject}.${sp.effect}${k ? ` (clause ${k + 1})` : ''}`);
  });
  if (!clauses.length) return null;
  const omitted = def.spec.side.map((side) => ({ text: SIDE_EFFECT_INFO[side].label.toLowerCase(), reason: 'narrative' as const, why: `V1 downside "${SIDE_EFFECT_INFO[side].text}", executed by the V1 law engine` }));
  return {
    ast: {
      v: 2,
      lang: REALITY_LANG,
      text: def.text.slice(0, 240),
      author: def.custom ? 'player' : def.rival ? 'npc' : 'scenario',
      source: { reader: 'legacy-v1', model: null, prompt: null, id: def.id.slice(0, 80) },
      day: 0,
      regions: def.regions.slice(0, 4),
      clauses,
      omitted: omitted.slice(0, 6),
      narrative: null,
    },
    untranslated,
  };
}
