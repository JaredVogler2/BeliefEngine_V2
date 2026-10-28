import { describe, expect, it } from 'vitest';
import { GameSession, stateHash } from '../../src/engine/index.ts';
import type { RunState } from '../../src/engine/core/types.ts';
import { readBelief } from '../../src/engine/reality/read.ts';
import { candidatesOf } from '../../scripts/lib/reality-score.ts';
import { playReality, ring } from '../helpers/reality.ts';

/**
 * Phase 05 integration: sentences written for this test (in no corpus the reader was tuned on) are read offline, written through
 * the normal Compose action and, once the village believes them, change its physics in different, measurable ways: two villages,
 * three sentences each, every run against a control on the same seed with the same daily ritual. The social part is the white-box
 * shortcut of `playReality` (everyone who votes on the belief's region believes it each morning).
 */

type Run = ReturnType<typeof playReality>;

const count = (s: RunState, code: string) => s.log.filter((e) => e.code === code).length;

function readAndPlay(scenarioId: string, text: string): { run: Run; ops: string } {
  const r = readBelief(GameSession.create({ scenarioId, seed: 1, reality: true }).state, text);
  expect(r.kind, text).toBe('supported');
  const c = candidatesOf(r)[0];
  expect(c.build.ok, text).toBe(true);
  const run = playReality(c.ast, ring, 7, scenarioId);
  // every effect the night executor applied is credited to this belief
  const fx = run.g.state.log.filter((e) => e.code === 'REALITY_EFFECT');
  expect(fx.length, text).toBeGreaterThan(0);
  expect(fx.every((e) => e.claim === run.claimId)).toBe(true);
  return { run, ops: c.ast.clauses.map((x) => `${x.effect.op}:${x.target.kind}`).join('+') };
}

describe('Redbank: three new sentences, three different floods', () => {
  const control = playReality(null, ring, 7, 'redbank');
  const hens = readAndPlay('redbank', 'When the tower bell tolls, the hens take to the air.');
  const rain = readAndPlay('redbank', 'The bells call the rain down onto Eastbank and make flames burn gentler.');
  const bridge = readAndPlay('redbank', 'Whenever the bell is rung, the river keeps clear of the bridge.');
  const alive = (r: Run) => r.g.state.v2!.chickens.filter((c) => c.alive).length;
  const homes = (r: Run) => r.g.state.world.landmarks.filter((l) => (l.kind === 'home' || l.kind === 'cabin') && l.hp > 0).length;
  const bridgeHp = (r: Run) => r.g.state.world.landmarks.find((l) => l.kind === 'bridge')?.hp ?? 0;

  it('reads them as three different mechanics', () => {
    expect(new Set([hens.ops, rain.ops, bridge.ops]).size).toBe(3);
    expect(hens.ops).toBe('APPLY_FORCE:chicken');
    expect(rain.ops).toBe('WEATHER_MODIFIER:rain+ALTER_TEMPERATURE:fire');
    expect(bridge.ops).toBe('REDIRECT_FLOW:water');
  });

  it('the hens rise above the water: more of the flock lives', () => {
    expect(count(hens.run.g.state, 'CHICKENS_ROSE')).toBeGreaterThan(0);
    expect(count(control.g.state, 'CHICKENS_ROSE')).toBe(0);
    expect(alive(hens.run)).toBeGreaterThan(alive(control));
  });

  it('the rain is called onto Eastbank and the flames burn lower: water pools there and more homes stand', () => {
    expect(count(rain.run.g.state, 'WATER_POOLED')).toBeGreaterThan(count(control.g.state, 'WATER_POOLED'));
    expect(homes(rain.run)).toBeGreaterThan(homes(control));
    expect(count(rain.run.g.state, 'CHICKENS_ROSE')).toBe(0);
  });

  it('the river is turned from the bridge: the bridge takes less of the flood', () => {
    expect(bridgeHp(bridge.run)).toBeGreaterThan(bridgeHp(control));
    expect(count(bridge.run.g.state, 'WATER_POOLED')).toBe(count(control.g.state, 'WATER_POOLED'));
  });

  it('four different worlds on one seed', () => {
    expect(new Set([control, hens.run, rain.run, bridge.run].map((r) => stateHash(r.g.state))).size).toBe(4);
  });
});

describe('Harvest: three new sentences, three different seasons', () => {
  const control = playReality(null, ring, 7, 'harvest');
  const wheat = readAndPlay('harvest', 'When the bells ring, the wheat swells and ripens early.');
  const rain = readAndPlay('harvest', 'The bells call rain down onto the valley fields.');
  const hands = readAndPlay('harvest', 'Under the stars the farmhands work without tiring.');
  const fields = (r: Run) => r.g.state.world.landmarks.filter((l) => l.kind === 'field');
  const growth = (r: Run) => fields(r).reduce((a, f) => a + (f.data.growth ?? 0) + (f.data.harvested ? 100 : 0), 0);
  const moisture = (r: Run) => fields(r).reduce((a, f) => a + (f.data.moisture ?? 0), 0);

  it('reads them as three different mechanics', () => {
    expect(new Set([wheat.ops, rain.ops, hands.ops]).size).toBe(3);
    expect(wheat.ops).toBe('GROW_ENTITY:field');
    expect(rain.ops).toBe('WEATHER_MODIFIER:rain');
    expect(hands.ops).toBe('INFLUENCE_MOTIVATION:villager');
  });

  it('the wheat ripens early: fields ripen and are brought in that the control never ripens', () => {
    expect(count(wheat.run.g.state, 'FIELD_RIPE')).toBeGreaterThan(count(control.g.state, 'FIELD_RIPE'));
    expect(growth(wheat.run)).toBeGreaterThan(growth(control));
    expect(count(wheat.run.g.state, 'HARVEST')).toBeGreaterThan(count(control.g.state, 'HARVEST'));
  });

  it('the rain is called onto the valley: the fields stay wet where the control parches', () => {
    expect(count(control.g.state, 'FIELD_PARCHED')).toBeGreaterThan(0);
    expect(count(rain.run.g.state, 'FIELD_PARCHED')).toBeLessThan(count(control.g.state, 'FIELD_PARCHED'));
    expect(moisture(rain.run)).toBeGreaterThan(moisture(control));
  });

  it('tireless farmhands tend their fields: a little more growth, less than the wheat belief, and no rain', () => {
    expect(count(hands.run.g.state, 'CROP_BOOSTED')).toBeGreaterThan(0);
    expect(growth(hands.run)).toBeGreaterThan(growth(control));
    expect(growth(hands.run)).toBeLessThan(growth(wheat.run));
    expect(moisture(hands.run)).toBe(moisture(control));
  });

  it('four different worlds on one seed', () => {
    expect(new Set([control, wheat.run, rain.run, hands.run].map((r) => stateHash(r.g.state))).size).toBe(4);
  });
});
