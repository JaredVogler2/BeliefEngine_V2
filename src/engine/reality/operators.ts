import type { PropertyId, TargetKind } from './ontology.ts';

/**
 * The operator library: every physical change a Generative Reality belief can ask for. A belief is executable only if each of
 * its clauses names an operator that `executes` and a target the operator accepts; a model or a sentence cannot invent a new
 * operator, and none of them runs text or code. Units, ranges, tick order, power weight, persistence and the downside a preview
 * must show live here; what each one does to the world is in execute.ts.
 */

export type OpId =
  | 'APPLY_FORCE'
  | 'REDIRECT_FLOW'
  | 'WEATHER_MODIFIER'
  | 'SET_MATERIAL_PROPERTY'
  | 'TRANSFORM_MATERIAL'
  | 'GROW_ENTITY'
  | 'DECAY_ENTITY'
  | 'ALTER_TEMPERATURE'
  | 'CHANGE_LIGHT'
  | 'MODIFY_DURABILITY'
  | 'MODIFY_VISIBILITY'
  | 'MODIFY_MOVEMENT'
  | 'MOVE_AWAY'
  | 'MOVE_TOWARD'
  | 'INFLUENCE_MOTIVATION'
  | 'SPAWN_BOUNDED_ENTITY'
  | 'MODIFY_STRUCTURE_CONNECTION'
  | 'RELOCATE_RESOURCE'
  | 'GIVE_STATUS_EFFECT';

export type Family = 'dynamics' | 'hydrology' | 'weather' | 'materials' | 'growth' | 'thermal' | 'light' | 'structure' | 'movement' | 'behavior' | 'spawn' | 'resource' | 'status';

export type ParamSpec =
  | { name: string; kind: 'int'; min: number; max: number; nonzero?: boolean; unit: string }
  | { name: string; kind: 'enum'; values: readonly string[] }
  | { name: string; kind: 'region'; nullable: boolean }
  | { name: string; kind: 'bool' }
  | { name: string; kind: 'word'; max: number };

export interface OperatorDef {
  id: OpId;
  family: Family;
  label: string;
  targets: TargetKind[];
  params: ParamSpec[];
  /** false: understood and named, but no executable implementation in this language version */
  executes: boolean;
  why?: string;
  /** lower runs first within a night */
  tickOrder: number;
  /** power per unit of magnitude (balance.ts) */
  weight: number;
  /** temporary: ends when the law fades; lasting: what it did stays done */
  persistence: 'temporary' | 'lasting';
  property: PropertyId;
  /** the cost the world charges for it, shown in every preview */
  downside: string;
  /** key of the 3D effect that draws it (phase 10) */
  visual: string;
}

const MAG = { name: 'magnitude', kind: 'int', min: 1, max: 3, unit: '1 slight, 2 clear, 3 strong' } as const;
const DELTA = { name: 'delta', kind: 'int', min: -3, max: 3, nonzero: true, unit: 'steps; negative lowers' } as const;
const RADIUS = { name: 'radius', kind: 'int', min: 0, max: 4, unit: 'tiles around each source' } as const;

export const OPERATORS: Record<OpId, OperatorDef> = {
  APPLY_FORCE: {
    id: 'APPLY_FORCE', family: 'dynamics', label: 'push or lift', targets: ['chicken', 'stone'],
    params: [{ name: 'direction', kind: 'enum', values: ['up', 'away', 'toward'] }, MAG],
    executes: true, tickOrder: 40, weight: 6, persistence: 'temporary', property: 'altitude',
    downside: 'what flies or is pushed can be carried off by the wind and land where nobody can reach it', visual: 'force_lift',
  },
  REDIRECT_FLOW: {
    id: 'REDIRECT_FLOW', family: 'hydrology', label: 'turn floodwater', targets: ['water'],
    params: [{ name: 'mode', kind: 'enum', values: ['repel', 'attract', 'slow'] }, MAG, RADIUS],
    executes: true, tickOrder: 10, weight: 8, persistence: 'temporary', property: 'flow',
    downside: 'water kept from one place goes somewhere else; drawing it in floods what is near the source', visual: 'water_shield',
  },
  WEATHER_MODIFIER: {
    id: 'WEATHER_MODIFIER', family: 'weather', label: 'move the rain', targets: ['rain'],
    params: [{ name: 'mode', kind: 'enum', values: ['attract', 'repel', 'redirect'] }, MAG, { name: 'toward', kind: 'region', nullable: true }],
    executes: true, tickOrder: 5, weight: 9, persistence: 'temporary', property: 'level',
    downside: 'rain is moved, not made: the water lands on the low ground of the region it is sent to', visual: 'rain_bend',
  },
  SET_MATERIAL_PROPERTY: {
    id: 'SET_MATERIAL_PROPERTY', family: 'materials', label: 'change what a thing is made like', targets: ['stone', 'home', 'bridge', 'field'],
    params: [{ name: 'property', kind: 'enum', values: ['mass', 'flammability', 'hardness'] }, DELTA],
    executes: true, tickOrder: 20, weight: 6, persistence: 'temporary', property: 'mass',
    downside: 'light stones float off in floodwater and batter whatever is downstream; what burns less may also rot or crack', visual: 'material_glow',
  },
  TRANSFORM_MATERIAL: {
    id: 'TRANSFORM_MATERIAL', family: 'materials', label: 'turn one thing into another', targets: ['stone', 'home', 'bridge', 'field', 'water'],
    params: [{ name: 'into', kind: 'word', max: 24 }],
    executes: false, why: 'turning one material into another would create things from nothing; this language version only changes properties of what exists',
    tickOrder: 99, weight: 20, persistence: 'lasting', property: 'mass', downside: '', visual: 'none',
  },
  GROW_ENTITY: {
    id: 'GROW_ENTITY', family: 'growth', label: 'make crops grow', targets: ['field'],
    params: [MAG], executes: true, tickOrder: 30, weight: 6, persistence: 'temporary', property: 'growth',
    downside: 'faster crops need more hands at harvest and more water in a drought', visual: 'crop_grow',
  },
  DECAY_ENTITY: {
    id: 'DECAY_ENTITY', family: 'growth', label: 'make crops wither', targets: ['field'],
    params: [MAG], executes: true, tickOrder: 30, weight: 4, persistence: 'temporary', property: 'growth',
    downside: 'withered crops mean less food', visual: 'crop_wither',
  },
  ALTER_TEMPERATURE: {
    id: 'ALTER_TEMPERATURE', family: 'thermal', label: 'make flames hotter or cooler', targets: ['fire'],
    params: [DELTA], executes: true, tickOrder: 25, weight: 6, persistence: 'temporary', property: 'heat',
    downside: 'hotter flames destroy more; cooler ones also make the beacons and hearths weaker comfort', visual: 'heat_shimmer',
  },
  CHANGE_LIGHT: {
    id: 'CHANGE_LIGHT', family: 'light', label: 'make lantern light reach further or shorter', targets: ['lantern'],
    params: [{ name: 'delta', kind: 'int', min: -2, max: 2, nonzero: true, unit: 'tiles of reach' }],
    executes: true, tickOrder: 3, weight: 4, persistence: 'temporary', property: 'light',
    downside: 'brighter lanterns burn their fuel twice as fast', visual: 'light_halo',
  },
  MODIFY_DURABILITY: {
    id: 'MODIFY_DURABILITY', family: 'structure', label: 'make it stronger or weaker', targets: ['bridge', 'home'],
    params: [DELTA], executes: true, tickOrder: 15, weight: 8, persistence: 'temporary', property: 'durability',
    downside: 'a structure the village trusts too much draws crowds onto it', visual: 'structure_glow',
  },
  MODIFY_VISIBILITY: {
    id: 'MODIFY_VISIBILITY', family: 'light', label: 'hide or reveal homes and pens from wolves', targets: ['home', 'livestock'],
    params: [DELTA], executes: true, tickOrder: 12, weight: 6, persistence: 'temporary', property: 'visibility',
    downside: 'a pack that cannot find one place hunts the next', visual: 'veil',
  },
  MODIFY_MOVEMENT: {
    id: 'MODIFY_MOVEMENT', family: 'movement', label: 'make it move faster or slower', targets: ['fire', 'water', 'wolf'],
    params: [DELTA], executes: true, tickOrder: 18, weight: 5, persistence: 'temporary', property: 'speed',
    downside: 'slowed water stands longer where it is', visual: 'slow_ripple',
  },
  MOVE_AWAY: {
    id: 'MOVE_AWAY', family: 'movement', label: 'drive away from the source', targets: ['wolf', 'water', 'chicken'],
    params: [MAG, RADIUS], executes: true, tickOrder: 11, weight: 7, persistence: 'temporary', property: 'position',
    downside: 'what is driven from one place ends up in another', visual: 'repel_ring',
  },
  MOVE_TOWARD: {
    id: 'MOVE_TOWARD', family: 'movement', label: 'draw toward the source', targets: ['wolf', 'water', 'chicken'],
    params: [MAG, RADIUS], executes: true, tickOrder: 11, weight: 7, persistence: 'temporary', property: 'position',
    downside: 'what is drawn in arrives exactly where the source stands', visual: 'attract_ring',
  },
  INFLUENCE_MOTIVATION: {
    id: 'INFLUENCE_MOTIVATION', family: 'behavior', label: 'change how people feel, never what they believe', targets: ['villager'],
    params: [{ name: 'motive', kind: 'enum', values: ['courage', 'calm', 'diligence'] }, { name: 'magnitude', kind: 'int', min: 1, max: 2, unit: '1 slight, 2 clear' }],
    executes: true, tickOrder: 50, weight: 5, persistence: 'temporary', property: 'fear',
    downside: 'calm people are harder to convince of anything, yours included', visual: 'warm_aura',
  },
  SPAWN_BOUNDED_ENTITY: {
    id: 'SPAWN_BOUNDED_ENTITY', family: 'spawn', label: 'hatch chickens from the village\'s food', targets: ['chicken'],
    params: [{ name: 'prefab', kind: 'enum', values: ['chicken'] }, { name: 'count', kind: 'int', min: 1, max: 3, unit: 'chicks per night' }],
    executes: true, tickOrder: 60, weight: 7, persistence: 'lasting', property: 'count',
    downside: 'each chick costs one food, and a coop holds at most twelve', visual: 'hatch',
  },
  MODIFY_STRUCTURE_CONNECTION: {
    id: 'MODIFY_STRUCTURE_CONNECTION', family: 'structure', label: 'open or close a crossing', targets: ['bridge'],
    params: [{ name: 'connect', kind: 'bool' }],
    executes: false, why: 'opening or closing crossings for chosen people is not modelled yet',
    tickOrder: 99, weight: 10, persistence: 'temporary', property: 'position', downside: '', visual: 'none',
  },
  RELOCATE_RESOURCE: {
    id: 'RELOCATE_RESOURCE', family: 'resource', label: 'move water from the river to a chosen place', targets: ['water'],
    params: [{ name: 'resource', kind: 'enum', values: ['water'] }, MAG, { name: 'toward', kind: 'region', nullable: false }],
    executes: true, tickOrder: 6, weight: 8, persistence: 'temporary', property: 'level',
    downside: 'the water taken from the river pools on the low ground where it is sent', visual: 'water_channel',
  },
  GIVE_STATUS_EFFECT: {
    id: 'GIVE_STATUS_EFFECT', family: 'status', label: 'protect people or homes from one harm', targets: ['villager', 'home'],
    params: [{ name: 'status', kind: 'enum', values: ['fireproof', 'sick_resistant', 'warm'] }, MAG],
    executes: true, tickOrder: 55, weight: 7, persistence: 'temporary', property: 'health',
    downside: 'people who feel protected take more risks: they linger where the danger is', visual: 'ward',
  },
};

export const EXECUTABLE_OPS = (Object.keys(OPERATORS) as OpId[]).filter((k) => OPERATORS[k].executes);
