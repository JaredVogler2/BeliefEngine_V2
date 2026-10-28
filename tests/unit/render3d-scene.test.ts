import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/engine/index.ts';
import { policyById } from '../../src/engine/ai/bots/generic.ts';
import type { RunState } from '../../src/engine/index.ts';
import { HEIGHT_UNIT, WATER_UNIT, engineToWorld, tileCenter, worldToEngine, worldToTile } from '../../src/render3d/coords.ts';
import { getSceneChanges, getSceneSnapshot } from '../../src/render3d/snapshot.ts';
import { seedFrom } from '../../src/render3d/rand.ts';
import { buildHeightField } from '../../src/render3d/terrain.ts';
import { Water } from '../../src/render3d/water.ts';
import { stateHash } from '../../src/engine/index.ts';

/**
 * What the renderer is given is the engine's world, faithfully: the axes are one definition, the snapshot is a copy of the run's own
 * arrays, the height field is the engine's elevation, and the water surface is the engine's depth, tile for tile.
 */
function runTo(day: number, policy: string, seed: number): GameSession {
  const g = GameSession.create({ scenarioId: 'redbank', seed });
  const p = policyById(policy);
  for (let i = 1; i < day && !g.state.outcome; i++) p.playDay(g);
  return g;
}

describe('coordinates (one definition of the axes)', () => {
  it('a tile is a unit square, its centre is half a unit in, and the maps round-trip', () => {
    expect(tileCenter(3, 5)).toEqual({ x: 3.5, z: 5.5 });
    expect(engineToWorld(3, 5)).toEqual({ x: 3.5, z: 5.5 });
    for (const [x, y] of [[0, 0], [13, 8], [27, 17], [4.25, 9.75]]) {
      const w = engineToWorld(x, y);
      const e = worldToEngine(w.x, w.z);
      expect(e.x).toBeCloseTo(x, 9);
      expect(e.y).toBeCloseTo(y, 9);
    }
    expect(worldToTile(3.99, 5.01)).toEqual({ x: 3, y: 5 });
    expect(worldToTile(0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('the scene snapshot', () => {
  it('copies the run’s own arrays and entities, and never aliases them', () => {
    const g = runTo(5, 'threat-aware', 2);
    const s: RunState = g.state;
    const snap = getSceneSnapshot(s);
    expect(snap.w).toBe(s.world.w);
    expect(snap.h).toBe(s.world.h);
    expect(Array.from(snap.terrain)).toEqual(s.world.terrain);
    expect(Array.from(snap.elev)).toEqual(s.world.elev);
    expect(Array.from(snap.water)).toEqual(s.world.water);
    expect(snap.landmarks.map((l) => l.id)).toEqual(s.world.landmarks.map((l) => l.id));
    expect(snap.villagers.map((v) => v.id)).toEqual(s.villagers.map((v) => v.id));
    expect(snap.villagers.map((v) => [v.x, v.y])).toEqual(s.villagers.map((v) => [v.x, v.y]));
    // the snapshot is read-only in spirit and a copy in fact: scribbling on it cannot reach the run
    const before = stateHash(s);
    snap.water[0] = 99;
    snap.elev[0] = 99;
    snap.villagers[0].x = -50;
    snap.landmarks[0].hp = -1;
    expect(stateHash(s)).toBe(before);
    expect(s.world.water[0]).not.toBe(99);
  });

  it('building the snapshot has no effect on the run, and the same run gives the same snapshot', () => {
    const g = runTo(4, 'evidence-first', 1);
    const a = stateHash(g.state);
    const s1 = getSceneSnapshot(g.state);
    const s2 = getSceneSnapshot(g.state);
    expect(stateHash(g.state)).toBe(a);
    expect(JSON.stringify([s1.landmarks, s1.villagers, s1.laws, s1.ties])).toBe(JSON.stringify([s2.landmarks, s2.villagers, s2.laws, s2.ties]));
    expect(s1.revision).toBe(s2.revision);
  });

  it('the diff names what changed and leaves the rest alone', () => {
    const g = runTo(5, 'threat-aware', 2);
    const prev = getSceneSnapshot(g.state);
    expect(getSceneChanges(prev, getSceneSnapshot(g.state))).toMatchObject({ rebuild: false, terrain: false, water: false, fire: false, landmarks: [], villagers: [], laws: false });
    policyById('threat-aware').playDay(g);
    const next = getSceneSnapshot(g.state);
    const c = getSceneChanges(prev, next);
    expect(c.rebuild).toBe(false);
    // everything it lists really differs, and everything that differs is listed
    const wd = Array.from(prev.water).some((v, i) => v !== next.water[i]) || prev.level !== next.level;
    expect(c.water).toBe(wd);
    const moved = next.villagers.filter((v) => {
      const o = prev.villagers.find((q) => q.id === v.id)!;
      return o.x !== v.x || o.y !== v.y || o.status !== v.status || o.duty !== v.duty || o.place !== v.place;
    }).map((v) => v.id);
    expect(c.villagers.sort()).toEqual(moved.sort());
  });

  it('a different village (another seed, or going back a day) asks for a rebuild', () => {
    const a = getSceneSnapshot(runTo(3, 'noop', 1).state);
    expect(getSceneChanges(a, getSceneSnapshot(runTo(3, 'noop', 2).state)).rebuild).toBe(true);
    expect(getSceneChanges(getSceneSnapshot(runTo(5, 'noop', 1).state), a).rebuild).toBe(true);
    expect(getSceneChanges(null, a).rebuild).toBe(true);
  });
});

describe('the 3D ground and water are the engine’s own numbers', () => {
  it('the height field starts from the engine’s elevation, tile for tile, times one constant', () => {
    const snap = getSceneSnapshot(runTo(1, 'noop', 1).state);
    const t = buildHeightField(snap, seedFrom(snap.scenarioId, snap.seed));
    for (let i = 0; i < snap.w * snap.h; i++) expect(t.tileBase[i]).toBeCloseTo(snap.elev[i] * HEIGHT_UNIT, 6);
    // the sculpted surface rounds off steps and cuts the river's channel (half a unit deep), but away from the river it never wanders far
    // from what the engine says is there, and nowhere by more than the channel plus a step or two
    const nearRiver = (x: number, y: number): boolean => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (snap.terrain[Math.min(snap.h - 1, Math.max(0, y + dy)) * snap.w + Math.min(snap.w - 1, Math.max(0, x + dx))] === 1) return true;
      return false;
    };
    let worstLand = 0;
    let worstAny = 0;
    for (let y = 0; y < snap.h; y++)
      for (let x = 0; x < snap.w; x++) {
        const c = engineToWorld(x, y);
        const d = Math.abs(t.heightAt(c.x, c.z) - t.tileBase[y * snap.w + x]);
        worstAny = Math.max(worstAny, d);
        if (!nearRiver(x, y)) worstLand = Math.max(worstLand, d);
      }
    expect(worstLand).toBeLessThan(0.5);
    expect(worstAny).toBeLessThan(1.3);
  });

  it('on a flood night the water surface sits at the engine’s depth on every wet tile, and covers no dry tile', () => {
    // the night of the surge in a lost run: water on the banks
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    const p = policyById('noop');
    let best: RunState | null = null;
    let most = -1;
    for (let d = 0; d < 8 && !g.state.outcome; d++) {
      p.playDay(g);
      let wet = 0;
      for (let i = 0; i < g.state.world.water.length; i++) if (g.state.world.water[i] > 0 && g.state.world.terrain[i] !== 1) wet++;
      if (wet > most) {
        most = wet;
        best = structuredClone(g.state);
      }
    }
    expect(most, 'the fixture run should flood some land').toBeGreaterThan(5);
    const snap = getSceneSnapshot(best as RunState);
    const t = buildHeightField(snap, seedFrom(snap.scenarioId, snap.seed));
    const water = new Water(snap, t, 'low');
    water.setState(snap, false);
    let wetTiles = 0;
    for (let y = 0; y < snap.h; y++) {
      for (let x = 0; x < snap.w; x++) {
        const i = y * snap.w + x;
        const c = engineToWorld(x, y);
        const surface = water.surfaceAt(c.x, c.z);
        const river = snap.terrain[i] === 1;
        const depth = snap.water[i];
        if (river) {
          expect(surface, `river ${x},${y}`).toBeCloseTo(t.tileBase[i] + 0.12 + depth * WATER_UNIT, 3);
        } else if (depth > 0) {
          wetTiles++;
          expect(surface, `flooded ${x},${y}`).toBeCloseTo(t.tileBase[i] + depth * WATER_UNIT, 3);
        } else {
          // a dry tile is never under the surface: the flood cannot cover what the engine did not flood
          expect(surface, `dry ${x},${y}`).toBeLessThan(t.tileBase[i]);
        }
      }
    }
    expect(wetTiles).toBe(most);
    water.dispose();
  });

  it('the surface does not exist before the engine says so: a calm village has water only in the river', () => {
    const snap = getSceneSnapshot(runTo(1, 'noop', 1).state);
    const t = buildHeightField(snap, seedFrom(snap.scenarioId, snap.seed));
    const water = new Water(snap, t, 'low');
    for (let y = 0; y < snap.h; y++)
      for (let x = 0; x < snap.w; x++) {
        if (snap.terrain[y * snap.w + x] === 1) continue;
        const c = engineToWorld(x, y);
        expect(water.depthAt(c.x, c.z), `${x},${y}`).toBeLessThan(0.02);
      }
    water.dispose();
  });
});
