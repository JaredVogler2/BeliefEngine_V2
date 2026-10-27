import { canonicalize, hash53 } from '../core/hash.ts';
import type { LandmarkKind } from '../core/types.ts';
import { ANCHORS, KINDS, REALITY_LANG, type TargetKind } from './ontology.ts';
import { OPERATORS, type OpId, type ParamSpec } from './operators.ts';

/**
 * AST v2: the typed, data-only form of a Generative Reality belief. A sentence (read offline or by a model), a save file or an
 * MCP client can only ever hand the game this structure; `validateRealityAst` refuses anything else, and only validated ASTs
 * reach the executor. Nothing here is code: no field is evaluated, and every number has a unit and a range.
 *
 *   belief  = text + provenance + regions + 1..3 clauses + explicit omissions (+ narrative flavour that never executes)
 *   clause  = WHEN trigger [WHERE condition] the TARGET selector undergoes an EFFECT (operator + typed parameters) for a DURATION
 */

export type TriggerEvent = 'bell' | 'lantern' | 'smoke_fire' | 'watchers' | 'night' | 'rain' | 'clear_night' | 'flood' | 'spoken' | 'ritual' | 'always';
export const TRIGGER_EVENTS: readonly TriggerEvent[] = ['bell', 'lantern', 'smoke_fire', 'watchers', 'night', 'rain', 'clear_night', 'flood', 'spoken', 'ritual', 'always'];

export type Trigger = { event: TriggerEvent; min: number | null } | { all: Trigger[] } | { any: Trigger[] } | { not: Trigger };

export type CondTest = 'wet' | 'dry' | 'raining' | 'clear' | 'windy' | 'flooding' | 'lit' | 'blue' | 'airborne' | 'healthy';
export const COND_TESTS: readonly CondTest[] = ['wet', 'dry', 'raining', 'clear', 'windy', 'flooding', 'lit', 'blue', 'airborne', 'healthy'];

export type Condition = { test: CondTest } | { all: Condition[] } | { any: Condition[] } | { not: Condition };

export type Tag = 'wet' | 'dry' | 'blue' | 'healthy';
export const TAGS: readonly Tag[] = ['wet', 'dry', 'blue', 'healthy'];

export interface Selector {
  kind: TargetKind;
  /** within `radius` tiles of a landmark of this kind (the trigger's own sources when they are the same kind) */
  near: { anchor: LandmarkKind; radius: number } | null;
  tags: Tag[];
  region: string | null;
}

export type Effect =
  | { op: 'APPLY_FORCE'; direction: 'up' | 'away' | 'toward'; magnitude: number }
  | { op: 'REDIRECT_FLOW'; mode: 'repel' | 'attract' | 'slow'; magnitude: number; radius: number }
  | { op: 'WEATHER_MODIFIER'; mode: 'attract' | 'repel' | 'redirect'; magnitude: number; toward: string | null }
  | { op: 'SET_MATERIAL_PROPERTY'; property: 'mass' | 'flammability' | 'hardness'; delta: number }
  | { op: 'TRANSFORM_MATERIAL'; into: string }
  | { op: 'GROW_ENTITY'; magnitude: number }
  | { op: 'DECAY_ENTITY'; magnitude: number }
  | { op: 'ALTER_TEMPERATURE'; delta: number }
  | { op: 'CHANGE_LIGHT'; delta: number }
  | { op: 'MODIFY_DURABILITY'; delta: number }
  | { op: 'MODIFY_VISIBILITY'; delta: number }
  | { op: 'MODIFY_MOVEMENT'; delta: number }
  | { op: 'MOVE_AWAY'; magnitude: number; radius: number }
  | { op: 'MOVE_TOWARD'; magnitude: number; radius: number }
  | { op: 'INFLUENCE_MOTIVATION'; motive: 'courage' | 'calm' | 'diligence'; magnitude: number }
  | { op: 'SPAWN_BOUNDED_ENTITY'; prefab: 'chicken'; count: number }
  | { op: 'MODIFY_STRUCTURE_CONNECTION'; connect: boolean }
  | { op: 'RELOCATE_RESOURCE'; resource: 'water'; magnitude: number; toward: string }
  | { op: 'GIVE_STATUS_EFFECT'; status: 'fireproof' | 'sick_resistant' | 'warm'; magnitude: number };

export interface Clause {
  id: string;
  when: Trigger;
  where: Condition | null;
  target: Selector;
  effect: Effect;
  /** 'night': only on nights the trigger fires; 'while_active': every night the law holds once it has fired */
  duration: 'night' | 'while_active';
}

export interface Omission {
  /** the words of the sentence that are not represented */
  text: string;
  reason: 'unsupported' | 'unrepresentable' | 'ambiguous' | 'narrative';
  why: string;
}

export interface RealityAst {
  v: 2;
  lang: typeof REALITY_LANG;
  /** the literal sentence, cleaned */
  text: string;
  author: 'player' | 'npc' | 'agent' | 'scenario';
  source: { reader: 'offline-v2' | 'model' | 'legacy-v1' | 'authored'; model: string | null; prompt: string | null; id: string | null };
  day: number;
  regions: string[];
  clauses: Clause[];
  omitted: Omission[];
  /** flavour that is shown, never executed */
  narrative: string | null;
}

export interface Limits {
  maxClauses: number;
  maxRadius: number;
  maxDepth: number;
}

/** Balanced play: two clauses (three in Reality Lab), radius 4, two levels of AND/OR/NOT. Never relaxed beyond the Lab's. */
export const LIMITS: Limits = { maxClauses: 2, maxRadius: 4, maxDepth: 2 };
export const LAB_LIMITS: Limits = { maxClauses: 3, maxRadius: 6, maxDepth: 2 };

export interface Issue {
  code: 'SHAPE' | 'UNKNOWN_KEY' | 'RANGE' | 'OP_UNKNOWN' | 'OP_NOT_EXECUTABLE' | 'TARGET' | 'DEPTH' | 'CONTRADICTION' | 'CLAUSES' | 'REGION' | 'TEXT';
  at: string;
  message: string;
}

export type AstCheck = { ok: true; ast: RealityAst } | { ok: false; issues: Issue[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9_-]{1,24}$/;

function keysOnly(o: Record<string, unknown>, allowed: string[], at: string, issues: Issue[]): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) issues.push({ code: 'UNKNOWN_KEY', at, message: `unknown field "${k.slice(0, 24)}"` });
}

function int(v: unknown, min: number, max: number): boolean {
  return Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
}

function checkTrigger(t: unknown, at: string, depth: number, limits: Limits, issues: Issue[]): void {
  if (!isObj(t)) return void issues.push({ code: 'SHAPE', at, message: 'a trigger must be an object' });
  const combo = 'all' in t ? 'all' : 'any' in t ? 'any' : 'not' in t ? 'not' : null;
  if (combo) {
    if (depth >= limits.maxDepth) return void issues.push({ code: 'DEPTH', at, message: `triggers may nest only ${limits.maxDepth} levels deep` });
    keysOnly(t, [combo], at, issues);
    if (combo === 'not') return checkTrigger(t.not, `${at}.not`, depth + 1, limits, issues);
    const list = t[combo];
    if (!Array.isArray(list) || list.length < 2 || list.length > 3) return void issues.push({ code: 'SHAPE', at, message: `"${combo}" needs 2 or 3 triggers` });
    list.forEach((x, i) => checkTrigger(x, `${at}.${combo}[${i}]`, depth + 1, limits, issues));
    return;
  }
  keysOnly(t, ['event', 'min'], at, issues);
  if (!TRIGGER_EVENTS.includes(t.event as TriggerEvent)) issues.push({ code: 'RANGE', at, message: `unknown trigger "${String(t.event).slice(0, 20)}"` });
  if (t.min !== null && !int(t.min, 1, 8)) issues.push({ code: 'RANGE', at, message: 'min must be null or a whole number 1 to 8' });
}

function checkCondition(c: unknown, at: string, depth: number, limits: Limits, issues: Issue[]): void {
  if (!isObj(c)) return void issues.push({ code: 'SHAPE', at, message: 'a condition must be an object' });
  const combo = 'all' in c ? 'all' : 'any' in c ? 'any' : 'not' in c ? 'not' : null;
  if (combo) {
    if (depth >= limits.maxDepth) return void issues.push({ code: 'DEPTH', at, message: `conditions may nest only ${limits.maxDepth} levels deep` });
    keysOnly(c, [combo], at, issues);
    if (combo === 'not') return checkCondition(c.not, `${at}.not`, depth + 1, limits, issues);
    const list = c[combo];
    if (!Array.isArray(list) || list.length < 2 || list.length > 3) return void issues.push({ code: 'SHAPE', at, message: `"${combo}" needs 2 or 3 conditions` });
    list.forEach((x, i) => checkCondition(x, `${at}.${combo}[${i}]`, depth + 1, limits, issues));
    return;
  }
  keysOnly(c, ['test'], at, issues);
  if (!COND_TESTS.includes(c.test as CondTest)) issues.push({ code: 'RANGE', at, message: `unknown condition "${String(c.test).slice(0, 20)}"` });
}

function checkParam(p: ParamSpec, v: unknown): boolean {
  switch (p.kind) {
    case 'int':
      return int(v, p.min, p.max) && !(p.nonzero && v === 0);
    case 'enum':
      return typeof v === 'string' && p.values.includes(v);
    case 'region':
      return (p.nullable && v === null) || (typeof v === 'string' && ID.test(v));
    case 'bool':
      return typeof v === 'boolean';
    case 'word':
      return typeof v === 'string' && /^[a-z ]{1,24}$/.test(v) && v.length <= p.max;
  }
}

/** Strict validation of untrusted data. `limits` relaxes only clause count and reach (Reality Lab), never depth or shape. */
export function validateRealityAst(x: unknown, limits: Limits = LIMITS): AstCheck {
  const issues: Issue[] = [];
  if (!isObj(x)) return { ok: false, issues: [{ code: 'SHAPE', at: 'belief', message: 'a belief must be an object' }] };
  keysOnly(x, ['v', 'lang', 'text', 'author', 'source', 'day', 'regions', 'clauses', 'omitted', 'narrative'], 'belief', issues);
  if (x.v !== 2 || x.lang !== REALITY_LANG) issues.push({ code: 'SHAPE', at: 'belief', message: `only language ${REALITY_LANG} (v2) is read` });
  if (typeof x.text !== 'string' || x.text.length < 1 || x.text.length > 240) issues.push({ code: 'TEXT', at: 'text', message: 'the sentence must be 1 to 240 characters' });
  if (!['player', 'npc', 'agent', 'scenario'].includes(x.author as string)) issues.push({ code: 'SHAPE', at: 'author', message: 'unknown author' });
  const src = x.source;
  if (!isObj(src)) issues.push({ code: 'SHAPE', at: 'source', message: 'provenance is required' });
  else {
    keysOnly(src, ['reader', 'model', 'prompt', 'id'], 'source', issues);
    if (!['offline-v2', 'model', 'legacy-v1', 'authored'].includes(src.reader as string)) issues.push({ code: 'SHAPE', at: 'source.reader', message: 'unknown reader' });
    for (const k of ['model', 'prompt', 'id']) if (src[k] !== null && (typeof src[k] !== 'string' || (src[k] as string).length > 80)) issues.push({ code: 'SHAPE', at: `source.${k}`, message: `${k} must be null or a short string` });
  }
  if (!int(x.day, 0, 400)) issues.push({ code: 'RANGE', at: 'day', message: 'day must be 0 to 400' });
  const regions = x.regions;
  if (!Array.isArray(regions) || regions.length < 1 || regions.length > 4 || regions.some((r) => typeof r !== 'string' || !ID.test(r)) || new Set(regions).size !== regions.length) issues.push({ code: 'REGION', at: 'regions', message: 'regions must be 1 to 4 distinct region ids' });
  if (x.narrative !== null && (typeof x.narrative !== 'string' || x.narrative.length > 160)) issues.push({ code: 'TEXT', at: 'narrative', message: 'narrative must be null or at most 160 characters' });
  const om = x.omitted;
  if (!Array.isArray(om) || om.length > 6) issues.push({ code: 'SHAPE', at: 'omitted', message: 'omitted must be a list of at most 6' });
  else
    om.forEach((o, i) => {
      if (!isObj(o)) return void issues.push({ code: 'SHAPE', at: `omitted[${i}]`, message: 'must be an object' });
      keysOnly(o, ['text', 'reason', 'why'], `omitted[${i}]`, issues);
      if (typeof o.text !== 'string' || o.text.length > 120 || typeof o.why !== 'string' || o.why.length > 200 || !['unsupported', 'unrepresentable', 'ambiguous', 'narrative'].includes(o.reason as string)) issues.push({ code: 'SHAPE', at: `omitted[${i}]`, message: 'an omission names its words (≤120), a reason and why (≤200)' });
    });
  const clauses = x.clauses;
  if (!Array.isArray(clauses) || clauses.length < 1 || clauses.length > limits.maxClauses) return { ok: false, issues: [...issues, { code: 'CLAUSES', at: 'clauses', message: `a belief has 1 to ${limits.maxClauses} clauses` }] };
  const ids = new Set<string>();
  clauses.forEach((c, i) => {
    const at = `clauses[${i}]`;
    if (!isObj(c)) return void issues.push({ code: 'SHAPE', at, message: 'a clause must be an object' });
    keysOnly(c, ['id', 'when', 'where', 'target', 'effect', 'duration'], at, issues);
    if (typeof c.id !== 'string' || !/^c[1-3]$/.test(c.id) || ids.has(c.id)) issues.push({ code: 'SHAPE', at: `${at}.id`, message: 'clause ids are c1, c2, c3, each once' });
    else ids.add(c.id);
    checkTrigger(c.when, `${at}.when`, 0, limits, issues);
    if (c.where !== null) checkCondition(c.where, `${at}.where`, 0, limits, issues);
    if (c.duration !== 'night' && c.duration !== 'while_active') issues.push({ code: 'RANGE', at: `${at}.duration`, message: 'duration is "night" or "while_active"' });
    const t = c.target;
    let kind: TargetKind | null = null;
    if (!isObj(t)) issues.push({ code: 'SHAPE', at: `${at}.target`, message: 'a target must be an object' });
    else {
      keysOnly(t, ['kind', 'near', 'tags', 'region'], `${at}.target`, issues);
      if (typeof t.kind !== 'string' || !Object.prototype.hasOwnProperty.call(KINDS, t.kind)) issues.push({ code: 'TARGET', at: `${at}.target.kind`, message: `the village has no "${String(t.kind).slice(0, 20)}"` });
      else kind = t.kind as TargetKind;
      if (t.near !== null) {
        if (!isObj(t.near)) issues.push({ code: 'SHAPE', at: `${at}.target.near`, message: 'near must be null or {anchor, radius}' });
        else {
          keysOnly(t.near, ['anchor', 'radius'], `${at}.target.near`, issues);
          if (!ANCHORS.includes(t.near.anchor as LandmarkKind)) issues.push({ code: 'RANGE', at: `${at}.target.near.anchor`, message: `"${String(t.near.anchor).slice(0, 20)}" is not a place a belief can be measured from` });
          if (!int(t.near.radius, 0, limits.maxRadius)) issues.push({ code: 'RANGE', at: `${at}.target.near.radius`, message: `radius must be 0 to ${limits.maxRadius}` });
        }
      }
      if (!Array.isArray(t.tags) || t.tags.length > 3 || t.tags.some((g) => !TAGS.includes(g as Tag))) issues.push({ code: 'RANGE', at: `${at}.target.tags`, message: 'tags are up to 3 of wet, dry, blue, healthy' });
      if (t.region !== null && (typeof t.region !== 'string' || !ID.test(t.region))) issues.push({ code: 'REGION', at: `${at}.target.region`, message: 'region must be null or a region id' });
    }
    const e = c.effect;
    if (!isObj(e)) return void issues.push({ code: 'SHAPE', at: `${at}.effect`, message: 'an effect must be an object' });
    const def = typeof e.op === 'string' && Object.prototype.hasOwnProperty.call(OPERATORS, e.op) ? OPERATORS[e.op as OpId] : null;
    if (!def) return void issues.push({ code: 'OP_UNKNOWN', at: `${at}.effect.op`, message: `there is no operator "${String(e.op).slice(0, 30)}"` });
    keysOnly(e, ['op', ...def.params.map((p) => p.name)], `${at}.effect`, issues);
    for (const p of def.params) if (!checkParam(p, e[p.name])) issues.push({ code: 'RANGE', at: `${at}.effect.${p.name}`, message: `${p.name} is out of range for ${def.id}` });
    if (!def.executes) issues.push({ code: 'OP_NOT_EXECUTABLE', at: `${at}.effect.op`, message: `${def.label}: ${def.why}` });
    if (kind && !def.targets.includes(kind)) issues.push({ code: 'TARGET', at: `${at}.effect`, message: `${def.label} cannot act on ${KINDS[kind].label}` });
  });
  if (!issues.length) {
    const sig = (c: Clause) => `${c.target.kind}|${c.effect.op}|${canonicalize(c.target.near)}`;
    const cs = clauses as Clause[];
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++) {
        if (sig(cs[i]) !== sig(cs[j])) continue;
        const a = direction(cs[i].effect);
        const b = direction(cs[j].effect);
        if (a !== 0 && a === -b) issues.push({ code: 'CONTRADICTION', at: `clauses[${j}]`, message: 'two clauses push the same thing in opposite directions' });
        else issues.push({ code: 'CONTRADICTION', at: `clauses[${j}]`, message: 'two clauses do the same thing to the same target; say it once' });
      }
  }
  return issues.length ? { ok: false, issues } : { ok: true, ast: x as unknown as RealityAst };
}

/** +1 / -1 / 0: which way an effect pushes its property (for contradictions and conflict resolution). */
export function direction(e: Effect): number {
  switch (e.op) {
    case 'APPLY_FORCE':
      return e.direction === 'toward' ? -1 : 1;
    case 'REDIRECT_FLOW':
      return e.mode === 'attract' ? -1 : 1;
    case 'WEATHER_MODIFIER':
      return e.mode === 'repel' ? -1 : 1;
    case 'GROW_ENTITY':
    case 'SPAWN_BOUNDED_ENTITY':
    case 'MOVE_AWAY':
    case 'GIVE_STATUS_EFFECT':
    case 'INFLUENCE_MOTIVATION':
    case 'RELOCATE_RESOURCE':
      return 1;
    case 'DECAY_ENTITY':
    case 'MOVE_TOWARD':
      return -1;
    case 'SET_MATERIAL_PROPERTY':
    case 'ALTER_TEMPERATURE':
    case 'CHANGE_LIGHT':
    case 'MODIFY_DURABILITY':
    case 'MODIFY_VISIBILITY':
    case 'MODIFY_MOVEMENT':
      return Math.sign(e.delta);
    default:
      return 0;
  }
}

/** The mechanics alone: what the belief does, whoever wrote it in whatever words. Two sentences with the same mechanics share it. */
export function mechanicsOf(ast: RealityAst): unknown {
  return {
    lang: ast.lang,
    regions: [...ast.regions].sort(),
    clauses: ast.clauses.map((c, i) => ({ ...c, id: `c${i + 1}` })),
  };
}

export function mechanicsHash(ast: RealityAst): string {
  return hash53(canonicalize(mechanicsOf(ast)));
}

/** Identity of one written belief: its mechanics plus its words and provenance (the ledger key). */
export function beliefHash(ast: RealityAst): string {
  return hash53(canonicalize({ m: mechanicsOf(ast), text: ast.text, author: ast.author, source: ast.source }));
}

/** Depth-first list of the trigger events a trigger tree mentions (for grounding and previews). */
export function triggerEvents(t: Trigger): TriggerEvent[] {
  if ('event' in t) return [t.event];
  if ('not' in t) return triggerEvents(t.not);
  return ('all' in t ? t.all : t.any).flatMap(triggerEvents);
}

export function conditionTests(c: Condition | null): CondTest[] {
  if (!c) return [];
  if ('test' in c) return [c.test];
  if ('not' in c) return conditionTests(c.not);
  return ('all' in c ? c.all : c.any).flatMap(conditionTests);
}
