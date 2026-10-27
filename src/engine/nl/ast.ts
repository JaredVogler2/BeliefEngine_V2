import { canonicalize, hash53 } from '../core/hash.ts';
import type { Effect, Subject, TriggerKind } from '../core/types.ts';
import { NL_VERSION, OFFERED } from './ontology.ts';

/**
 * The structured, testable form of a belief. A discriminated union: a subject can only carry the effects and triggers the village
 * can physically model for it, so "bridge grows rain" cannot be constructed in code and is rejected at runtime when it arrives as
 * data (from the parser, from an optional model, from a save file or from an MCP client).
 */
type Triple =
  | { subject: 'river'; effect: 'repel' | 'attract' | 'redirect' | 'slow'; trigger: 'lit_beacon' | 'smoke_fire' | 'bell' }
  | { subject: 'rain'; effect: 'redirect' | 'attract' | 'repel'; trigger: 'bell' }
  | { subject: 'bridge'; effect: 'strengthen' | 'weaken'; trigger: 'watchers' | 'bell' }
  | { subject: 'grain'; effect: 'grow' | 'weaken'; trigger: 'night' | 'bell' | 'always' }
  | { subject: 'wolf'; effect: 'repel' | 'attract'; trigger: 'smoke_fire' | 'lit_beacon' | 'bell' }
  | { subject: 'illness'; effect: 'repel' | 'weaken'; trigger: 'always' | 'lit_beacon' | 'smoke_fire' }
  | { subject: 'fire'; effect: 'weaken' | 'strengthen' | 'slow'; trigger: 'always' };

export type BeliefClause = Triple & {
  /** tiles around each powering source (0 for effects that do not use a radius) */
  radius: number;
  /** 1..3, in the physical units laws/effects.ts documents */
  intensity: 1 | 2 | 3;
  /** bridges powered by watchers only: how many watchers must be on the deck */
  watchers?: number;
};

/** One belief: one clause, or two (a compound law). */
export interface BeliefAST {
  version: 1;
  clauses: [BeliefClause] | [BeliefClause, BeliefClause];
  /** the places (region ids) where the belief can become law */
  regions: string[];
}

export type AstCheck = { ok: true; ast: BeliefAST } | { ok: false; issues: string[] };

const KEYS_AST = new Set(['version', 'clauses', 'regions']);
const KEYS_CLAUSE = new Set(['subject', 'effect', 'trigger', 'radius', 'intensity', 'watchers']);

/** Strict validation of untrusted data: unknown keys, wrong types, unsupported pairs and out-of-range numbers are all refused. */
export function validateBeliefAst(x: unknown): AstCheck {
  const issues: string[] = [];
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, issues: ['a belief must be an object'] };
  const a = x as Record<string, unknown>;
  for (const k of Object.keys(a)) if (!KEYS_AST.has(k)) issues.push(`unknown field "${k.slice(0, 24)}"`);
  if (a.version !== 1) issues.push('unsupported version');
  const regions = a.regions;
  if (!Array.isArray(regions) || regions.length < 1 || regions.length > 4 || regions.some((r) => typeof r !== 'string' || !/^[a-z0-9_-]{1,24}$/.test(r))) issues.push('regions must be 1 to 4 region ids');
  else if (new Set(regions).size !== regions.length) issues.push('regions must be distinct');
  const clauses = a.clauses;
  if (!Array.isArray(clauses) || clauses.length < 1 || clauses.length > 2) return { ok: false, issues: [...issues, 'a belief has one or two clauses'] };
  clauses.forEach((c, i) => {
    const at = `clause ${i + 1}`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return void issues.push(`${at} must be an object`);
    const k = c as Record<string, unknown>;
    for (const key of Object.keys(k)) if (!KEYS_CLAUSE.has(key)) issues.push(`${at}: unknown field "${key.slice(0, 24)}"`);
    const subject = k.subject as Subject;
    const offered = typeof subject === 'string' && Object.prototype.hasOwnProperty.call(OFFERED, subject) ? OFFERED[subject] : null;
    if (!offered || offered.effects.length === 0) return void issues.push(`${at}: the village cannot model that subject`);
    if (typeof k.effect !== 'string' || !offered.effects.includes(k.effect as Effect)) issues.push(`${at}: ${subject} cannot ${String(k.effect).slice(0, 20)}`);
    if (typeof k.trigger !== 'string' || !offered.triggers.includes(k.trigger as TriggerKind)) issues.push(`${at}: ${subject} cannot be powered by ${String(k.trigger).slice(0, 20)}`);
    if (!Number.isInteger(k.radius) || (k.radius as number) < 0 || (k.radius as number) > 4) issues.push(`${at}: radius must be 0 to 4`);
    if (k.intensity !== 1 && k.intensity !== 2 && k.intensity !== 3) issues.push(`${at}: intensity must be 1, 2 or 3`);
    if (k.watchers !== undefined && (subject !== 'bridge' || k.trigger !== 'watchers' || !Number.isInteger(k.watchers) || (k.watchers as number) < 1 || (k.watchers as number) > 4)) issues.push(`${at}: watchers is for a bridge powered by watchers only, 1 to 4`);
  });
  if (clauses.length === 2 && Array.isArray(clauses) && clauses[0] && clauses[1] && (clauses[0] as { subject?: unknown }).subject === (clauses[1] as { subject?: unknown }).subject && (clauses[0] as { effect?: unknown }).effect === (clauses[1] as { effect?: unknown }).effect) issues.push('the two clauses must differ');
  return issues.length ? { ok: false, issues } : { ok: true, ast: a as unknown as BeliefAST };
}

/** The one canonical spelling: regions sorted, optional fields explicit. Hashing and comparing always go through this. */
export function canonicalAst(ast: BeliefAST): BeliefAST {
  return {
    version: 1,
    clauses: ast.clauses
      .map((c) => ({ ...c, ...(c.subject === 'bridge' && c.trigger === 'watchers' ? { watchers: c.watchers ?? 3 } : {}) }))
      .sort((a, b) => (`${a.subject}.${a.effect}` < `${b.subject}.${b.effect}` ? -1 : 1)) as BeliefAST['clauses'],
    regions: ast.regions.slice().sort(),
  };
}

/** Versioned content hash: the same belief gets the same id in every browser, every replay and every MCP session. */
export function astHash(ast: BeliefAST): string {
  return hash53(canonicalize({ nl: NL_VERSION, ast: canonicalAst(ast) }));
}
