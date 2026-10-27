import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GEN_VERSION, NL_VERSION, RULES_VERSION, SCHEMA_VERSION, expeditionId, replayRun } from '../../src/engine/index.ts';
import type { Action } from '../../src/engine/index.ts';
import { hashValue } from '../../src/engine/core/hash.ts';
import { replayVersions } from '../../src/engine/save/versions.ts';
import { V2_FEATURES } from '../../src/v2/features.ts';

/**
 * V2 migration tripwire (docs/MIGRATION.md). Every value below was printed from BeliefEngine V1 at 6a92862 and again from this
 * repository after the import, and the two printouts were identical. The fixtures carry their own expected hashes and other tests
 * replay them; this file pins the hashes themselves, so re-recording a fixture cannot silently move the classic game. Changing the
 * classic rules on purpose means: bump RULES_VERSION, re-record, and update this table in the same commit, saying why.
 */
const AUTHORED: Record<string, Record<string, [state: string, events: string]>> = {
  redbank: {
    fireWall: ['11ec6d73416e26', '1786c582e48ec0'],
    witnessBridge: ['1fd91495f0ef6e', '0067ab92df806f'],
    noop: ['13bf62980eac01', '19202cc7e371cb'],
    failedAttempt: ['04c4dd763956bc', '093260344e1500'],
  },
  harvest: {
    moonlight: ['01da9958b05854', '1fa7673d8752f5'],
    caravans: ['0153ec06ad5b9c', '1aef6c247b554d'],
    noop: ['02ca78b03702fc', '0319b513a49f21'],
    failedAttempt: ['096b659292d537', '13d77ce62c9378'],
  },
  ashwood: {
    smokeRing: ['1a11f396dded81', '1d39909f299175'],
    decoy: ['03101d19861028', '1494e8e2036ede'],
    noop: ['140fe84787a725', '15fbce84aaeeb6'],
    failedAttempt: ['19217bc34eb01f', '1571fbb4da0a61'],
  },
};

/** opening-state fingerprints (map, villagers, stories, rules as the engine builds them): content drift shows up here first */
const OPENINGS: [scenarioId: string, seed: number, mode: 'expedition' | undefined, start: string][] = [
  ['redbank', 1, undefined, '0c38d1b48858c2'],
  ['harvest', 1, undefined, '1554fb5933d95b'],
  ['ashwood', 6, undefined, '1de08b16a96461'],
  [expeditionId(1), 1, 'expedition', '056596ed9a6616'],
  [expeditionId(3), 3, 'expedition', '0403fabf7f5dca'],
  [expeditionId(5), 5, 'expedition', '0c6034a601672c'],
];

interface Trace { seed: number; difficulty?: 'story' | 'normal' | 'hard'; stateHash: string; eventHash: string; actions: Action[] }

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

describe('V2 migration tripwire: the classic game is V1, byte for byte in its results', () => {
  it('runs under the same rule, save, generator and belief-language versions as V1', () => {
    expect({ RULES_VERSION, SCHEMA_VERSION, GEN_VERSION, NL_VERSION }).toEqual({ RULES_VERSION: '1.0.0', SCHEMA_VERSION: 1, GEN_VERSION: 1, NL_VERSION: 1 });
  });

  for (const [scenarioId, routes] of Object.entries(AUTHORED)) {
    it(`${scenarioId}: every recorded route replays to the hashes V1 recorded`, () => {
      const fx = fixture<Record<string, Trace>>(`${scenarioId}-traces.json`);
      for (const [route, [state, events]] of Object.entries(routes)) {
        const t = fx[route];
        expect([t.stateHash, t.eventHash], `${scenarioId}/${route} fixture`).toEqual([state, events]);
        const r = replayRun({ scenarioId, seed: t.seed, difficulty: t.difficulty ?? 'normal', actions: t.actions });
        expect(r.rejected, `${scenarioId}/${route} rejected actions`).toEqual([]);
        expect([r.stateHash, r.eventHash], `${scenarioId}/${route} replay`).toEqual([state, events]);
      }
    });
  }

  it('the 25 tournament regression traces are the V1 set (their replay is checked in tournament.test.ts)', () => {
    const t = fixture<{ rulesVersion: string; traces: { scenarioId: string; seed: number; difficulty: string; policy: string; stateHash: string; eventHash: string }[] }>('tournament-traces.json');
    expect(t.rulesVersion).toBe('1.0.0');
    expect(t.traces).toHaveLength(25);
    expect(hashValue(t.traces.map((x) => [x.scenarioId, x.seed, x.difficulty, x.policy, x.stateHash, x.eventHash]))).toBe('00c1b1ef584bd5');
  });

  it('chapters and generated villages open in exactly the V1 state', () => {
    for (const [scenarioId, seed, mode, start] of OPENINGS) {
      expect(replayVersions({ scenarioId, seed, difficulty: 'normal', ...(mode ? { mode } : {}) }).start, `${scenarioId} seed ${seed}`).toBe(start);
    }
  });

  it('the verified expedition catalog is the V1 catalog', () => {
    expect(hashValue(JSON.parse(readFileSync(new URL('../../src/engine/gen/catalog.json', import.meta.url), 'utf8')))).toBe('17e472b720f7b7');
  });

  it('ships the V2 switches as recorded: the default game needs no model, key or inference endpoint', () => {
    // phase 03 turned on serverInference (an opt-in offer, tested in nl-online-client and v2-online.spec); the rest stay off until their gates
    expect(V2_FEATURES).toEqual({ serverInference: true, generativeReality: false, villagerCognition: false });
    expect(Object.keys(V2_FEATURES).sort()).toEqual(['generativeReality', 'serverInference', 'villagerCognition']);
  });
});
