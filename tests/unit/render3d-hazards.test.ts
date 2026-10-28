import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameSession, type RunState } from '../../src/engine/index.ts';
import { PROFILES, type WorldContext } from '../../src/render3d/context.ts';
import { engineToWorld } from '../../src/render3d/coords.ts';
import { HazardsLayer } from '../../src/render3d/hazards.ts';
import { getSceneChanges, getSceneSnapshot, type SceneSnapshot } from '../../src/render3d/snapshot.ts';

/**
 * The dangers on the ground in the 3D world (phase 17 review: the 2D map drew wolf packs, live fire and the smoke around a lit fire,
 * the 3D world drew none of them). Checked headless against real runs: the packs drawn are the ones the 2D map shows, with as many
 * wolves as it draws, standing where the engine has each pack; flames rise from exactly the tiles the engine has burning; and the
 * haze lies over exactly the tiles the engine has smoky.
 */

function ctxOf(reducedMotion = false): WorldContext {
  return { heightAt: () => 0.5, profile: PROFILES.high, reducedMotion, viewDistance: 20, weather: { wind: 0, rain: 0 } } as unknown as WorldContext;
}

/** the 2D map's own rule (src/render/MapRenderer.ts): today's packs, or yesterday's while they are still about */
function shownOn2D(s: RunState): number {
  if (!s.scn.features.wolves) return 0;
  const now = s.threat[Math.min(s.day, s.threat.length) - 1]?.pack ?? 0;
  const before = s.threat[Math.max(0, Math.min(s.day, s.threat.length) - 2)]?.pack ?? 0;
  return Math.max(now, before);
}

/** where the drawn wolves stand (x, z), in draw order */
function wolfSpots(layer: HazardsLayer): { x: number; z: number }[] {
  const mesh = layer.group.getObjectByName('hazard-wolves') as THREE.InstancedMesh;
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    p.setFromMatrixPosition(m);
    out.push({ x: p.x, z: p.z });
  }
  return out;
}

function settle(layer: HazardsLayer, ctx: WorldContext, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) layer.tick(0.1, t, ctx);
}

/** the run's snapshot each morning, ending each day with `plan` played first */
function mornings(scenarioId: string, seed: number, days: number, plan: (g: GameSession) => void = () => {}): SceneSnapshot[] {
  const g = GameSession.create({ scenarioId, seed });
  const out: SceneSnapshot[] = [];
  for (let d = 0; d < days && g.state.phase === 'planning'; d++) {
    plan(g);
    out.push(getSceneSnapshot(g.state));
    g.endDay();
  }
  return out;
}

describe('wolf packs in the 3D world', () => {
  it('draws the packs the 2D map shows, as many wolves as it draws for each, standing around where the engine has each pack', () => {
    const g = GameSession.create({ scenarioId: 'ashwood', seed: 1 });
    const layer = new HazardsLayer(ctxOf());
    const ctx = ctxOf();
    let prev: SceneSnapshot | null = null;
    const counts: number[] = [];
    for (let d = 0; d < 7; d++) {
      const snap = getSceneSnapshot(g.state);
      expect(snap.activePacks, `day ${snap.day}`).toBe(shownOn2D(g.state));
      layer.update(snap, getSceneChanges(prev, snap), ctx);
      settle(layer, ctx, 2);
      const packs = snap.packs.slice(0, snap.activePacks);
      const want = packs.reduce((n, p) => n + p.size + 1, 0);
      expect(layer.hazardCounts().wolves, `day ${snap.day}`).toBe(want);
      // and one mark over each pack, for the overview (where the trees hide the wolves)
      expect(layer.hazardCounts().packMarks, `day ${snap.day}`).toBe(packs.length);
      // every wolf stands within its pack's loose ring around the engine's position (at most 0.36 tiles out)
      const spots = wolfSpots(layer);
      let i = 0;
      for (const p of packs) {
        const c = engineToWorld(p.x, p.y);
        for (let k = 0; k <= p.size; k++, i++) expect(Math.hypot(spots[i].x - c.x, spots[i].z - c.z), `${p.id} wolf ${k} on day ${snap.day}`).toBeLessThan(0.37);
      }
      counts.push(want);
      prev = snap;
      g.endDay();
    }
    // Ashwood seed 1: no pack on day 1, Grey from day 2, Black from day 4, Red from day 6 (three wolves each, as the 2D map draws them)
    expect(counts).toEqual([0, 3, 3, 6, 6, 9, 9]);
    layer.dispose();
  });

  it('a pack the engine moved trots there over a moment, and is simply there with reduced motion', () => {
    const [, day2, day3] = mornings('ashwood', 1, 3);
    expect([day2.packs[0].y, day3.packs[0].y]).toEqual([6, 9]);
    const near = (layer: HazardsLayer, y: number) => wolfSpots(layer).every((s) => Math.abs(s.z - engineToWorld(0, y).z) < 0.37);
    for (const reduced of [false, true]) {
      const ctx = ctxOf(reduced);
      const layer = new HazardsLayer(ctx);
      layer.update(day2, getSceneChanges(null, day2), ctx);
      layer.update(day3, getSceneChanges(day2, day3), ctx);
      layer.tick(0.016, 0, ctx);
      expect(near(layer, reduced ? 9 : 6), reduced ? 'reduced motion: already there' : 'still where it was').toBe(true);
      settle(layer, ctx, 2);
      expect(near(layer, 9), 'arrived').toBe(true);
      layer.dispose();
    }
  });

  it('a starving pack’s eyes burn red, as on the 2D map (the engine’s PACK_STARVING threshold, 75), and its coat runs red', () => {
    const [, , , day4] = mornings('ashwood', 1, 4);
    expect(day4.activePacks).toBe(2);
    // a snapshot is plain data: the second pack starving (no seed reaches it idle, it needs two nights lured to a decoy)
    day4.packs[1].hunger = 80;
    const ctx = ctxOf();
    const layer = new HazardsLayer(ctx);
    layer.update(day4, getSceneChanges(null, day4), ctx);
    const eyes = layer.group.getObjectByName('hazard-wolf-eyes') as THREE.InstancedMesh;
    const c = new THREE.Color();
    const reds = Array.from({ length: eyes.count }, (_, i) => (eyes.getColorAt(i, c), c.g < 0.5));
    expect(reds).toEqual([false, false, false, true, true, true]);
    // its coat runs red too, so it reads from the overview, where the eyes are too small to
    const coats = layer.group.getObjectByName('hazard-wolves') as THREE.InstancedMesh;
    expect(Array.from({ length: coats.count }, (_, i) => (coats.getColorAt(i, c), c.g < 0.8))).toEqual([false, false, false, true, true, true]);
    layer.dispose();
  });
});

describe('fire and smoke in the 3D world', () => {
  it('flames rise from exactly the tiles the engine has burning, and stop when the fire is out', () => {
    // Redbank seed 2: every beacon lit on day 2 sets dry ground alight that night
    const days = mornings('redbank', 2, 9, (g) => {
      if (g.state.day === 1) g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
      for (const l of g.state.world.landmarks.filter((x) => x.kind === 'beacon')) g.act({ type: 'RITUAL', ritual: 'light_beacon', landmark: l.id });
    });
    const burning = days.map((s) => [...s.fire].filter((f) => f > 0).length);
    expect(burning.slice(0, 3)).toEqual([0, 0, 1]);
    const ctx = ctxOf();
    const layer = new HazardsLayer(ctx);
    let prev: SceneSnapshot | null = null;
    for (const snap of days) {
      layer.update(snap, getSceneChanges(prev, snap), ctx);
      const want = [...snap.fire].flatMap((f, i) => (f > 0 ? [engineToWorld(i % snap.w, Math.floor(i / snap.w))] : []));
      expect(layer.hazardCounts().fireTiles, `day ${snap.day}`).toBe(want.length);
      settle(layer, ctx, 1);
      if (want.length) expect(layer.hazardCounts().puffs, `flames on day ${snap.day}`).toBeGreaterThan(0);
      prev = snap;
    }
    expect(burning.some((n, i) => i > 2 && n === 0), 'the fire goes out').toBe(true);
    const out = days.find((_, i) => i > 2 && burning[i] === 0)!;
    layer.update(out, getSceneChanges(null, out), ctx);
    expect(layer.hazardCounts()).toMatchObject({ fireTiles: 0, puffs: 0 });
    layer.dispose();
  });

  it('a home on fire burns from its roof, as the 2D map draws it; flat ground burns from the ground', () => {
    // Redbank seed 2, the morning of day 3: the burning tile is Ivo's home
    const days = mornings('redbank', 2, 3, (g) => {
      if (g.state.day === 1) g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
      for (const l of g.state.world.landmarks.filter((x) => x.kind === 'beacon')) g.act({ type: 'RITUAL', ritual: 'light_beacon', landmark: l.id });
    });
    const day3 = days[2];
    const i = day3.fire.findIndex((f) => f > 0);
    const home = day3.landmarks.find((l) => l.x === i % day3.w && l.y === Math.floor(i / day3.w))!;
    expect([home.id, home.kind]).toEqual(['h_ivo', 'home']);
    // where the landmarks layer has the home's hit volume: its centre half way up a building 0.8 tall, or a flat thing on the ground
    for (const [centre, burning] of [[0.9, ['h_ivo']], [0.55, []]] as const) {
      const ctx = { ...ctxOf(), locate: (kind: string, id: string) => (kind === 'landmark' && id === home.id ? new THREE.Vector3(home.x + 0.5, centre, home.y + 0.5) : null) } as WorldContext;
      const layer = new HazardsLayer(ctx);
      layer.update(day3, getSceneChanges(null, day3), ctx);
      expect(layer.burningBuildings()).toEqual(burning);
      settle(layer, ctx, 1);
      expect(layer.hazardCounts().puffs).toBeGreaterThan(0);
      layer.dispose();
    }
  });

  it('a haze lies over exactly the tiles the engine has smoky around a lit fire, and lifts when the smoke does', () => {
    // Ashwood seed 1: a smoke-fire lit at the first campfire on day 1
    const days = mornings('ashwood', 1, 8, (g) => {
      if (g.state.day !== 1) return;
      expect(g.act({ type: 'PICK_STARTER', claim: 'wolves_fear_smoke' }).ok).toBe(true);
      expect(g.act({ type: 'RITUAL', ritual: 'burn_smoke', landmark: 'c_n1' }).ok).toBe(true);
    });
    const smoky = days.map((s) => [...s.smoke].filter((d) => d > 0).length);
    expect(smoky).toContain(21);
    expect(smoky.at(-1)).toBe(0);
    const ctx = ctxOf();
    const layer = new HazardsLayer(ctx);
    let prev: SceneSnapshot | null = null;
    for (const [i, snap] of days.entries()) {
      layer.update(snap, getSceneChanges(prev, snap), ctx);
      expect(layer.hazardCounts().smokeTiles, `day ${snap.day}`).toBe(smoky[i]);
      settle(layer, ctx, 2);
      expect(layer.hazardCounts().puffs > 0, `haze on day ${snap.day}`).toBe(smoky[i] > 0);
      prev = snap;
    }
    layer.dispose();
  });
});
