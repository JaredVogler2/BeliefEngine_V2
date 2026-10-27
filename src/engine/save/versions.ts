import { GameSession } from '../core/session.ts';
import { stateHash } from '../core/replay.ts';
import { GEN_VERSION } from '../gen/expedition.ts';
import { NL_VERSION } from '../nl/ontology.ts';
import { RULES_VERSION, SCHEMA_VERSION, type CreateRunOptions } from '../core/types.ts';

/**
 * What a recorded run was played under. A replay is only a proof if the engine that reads it is the one that wrote it, so a run file
 * carries the versions of everything its result depends on, and a reader that finds a difference says which one instead of quietly
 * producing another result.
 *
 * `start` is the hash of the run's opening state: the map, the villagers, every story and rule of the chapter or generated village
 * as this engine builds them from the run's options. It changes when any content, rule table or generator output changes, whether
 * or not anybody remembered to change a version number. Written beliefs are part of the action log (each carries its own structure
 * and the belief-language version), so they are covered by replaying that log.
 */
export interface ReplayVersions {
  /** the rules the simulation runs under */
  rules: string;
  /** the shape of a saved world */
  schema: number;
  /** the procedural village generator (matters only for generated villages) */
  generator: number;
  /** the language beliefs are written in: the same sentence can mean another thing under another version */
  beliefLanguage: number;
  /** hash of the opening state these options produce */
  start: string;
}

const cache = new Map<string, ReplayVersions>();

export function replayVersions(options: CreateRunOptions): ReplayVersions {
  const key = JSON.stringify(options);
  const hit = cache.get(key);
  if (hit) return hit;
  const start = stateHash(GameSession.create(options).state);
  const v: ReplayVersions = { rules: RULES_VERSION, schema: SCHEMA_VERSION, generator: GEN_VERSION, beliefLanguage: NL_VERSION, start };
  if (cache.size > 64) cache.clear();
  cache.set(key, v);
  return v;
}

/** What differs between the versions a run was recorded under and the ones this engine has, in plain words; empty when they agree. */
export function versionDrift(recorded: Partial<ReplayVersions> | undefined, now: ReplayVersions): string[] {
  if (!recorded) return [];
  const out: string[] = [];
  if (recorded.rules !== undefined && recorded.rules !== now.rules) out.push(`rules ${recorded.rules} (this engine: ${now.rules})`);
  if (recorded.schema !== undefined && recorded.schema !== now.schema) out.push(`save schema ${recorded.schema} (this engine: ${now.schema})`);
  if (recorded.generator !== undefined && recorded.generator !== now.generator) out.push(`village generator ${recorded.generator} (this engine: ${now.generator})`);
  if (recorded.beliefLanguage !== undefined && recorded.beliefLanguage !== now.beliefLanguage) out.push(`belief language ${recorded.beliefLanguage} (this engine: ${now.beliefLanguage})`);
  if (recorded.start !== undefined && recorded.start !== now.start) out.push(`the chapter or village itself is not what it was (opening state ${recorded.start}, this engine builds ${now.start})`);
  return out;
}
