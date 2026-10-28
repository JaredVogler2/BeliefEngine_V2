import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/engine/index.ts';
import { duskOf, moodFor, nightOf, type Mood } from '../../src/render3d/atmosphere.ts';
import { HomeLight, attachHomeLight, lampSources } from '../../src/render3d/homelight.ts';
import { getSceneSnapshot, type SceneSnapshot } from '../../src/render3d/snapshot.ts';

/**
 * The night in the 3D world (3D plan, stage 2). End Day sends the light down: the same weather carried into a moonlit night, where
 * lamplight falls round every home someone still lives in, every standing hall, chapel, market, mill and granary, and every lit fire.
 * Where the lamps are lit follows the engine; how bright they are follows the hour. Checked headless against a real run.
 */

const redbank = (): SceneSnapshot => getSceneSnapshot(GameSession.create({ scenarioId: 'redbank', seed: 1 }).state);
const luma = (hex: number): number => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
const near = (s: { x: number; z: number }[], x: number, z: number): boolean => s.some((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.z - z) < 1e-6);

describe('where the lamps are lit', () => {
  it('round every home someone lives in, and every standing public building', () => {
    const snap = redbank();
    const src = lampSources(snap);
    const lived = new Set(snap.villagers.filter((v) => v.status !== 'dead').map((v) => v.homeId));
    const homes = snap.landmarks.filter((l) => (l.kind === 'home' || l.kind === 'cabin') && l.hp > 0 && lived.has(l.id));
    expect(homes.length).toBeGreaterThan(3);
    for (const l of homes) expect(near(src, l.x + 0.5, l.y + 0.5), l.id).toBe(true);
    for (const l of snap.landmarks.filter((q) => ['hall', 'chapel', 'market', 'mill', 'granary'].includes(q.kind))) expect(near(src, l.x + 0.5, l.y + 0.5), l.id).toBe(true);
    // a well, a pen or a bridge has no lamp of its own
    for (const l of snap.landmarks.filter((q) => ['well', 'pen', 'bridge', 'shelter'].includes(q.kind))) expect(near(src, l.x + 0.5, l.y + 0.5), l.id).toBe(false);
  });

  it('not in a home whose people are all dead, nor in one that burned', () => {
    const snap = redbank();
    const home = snap.landmarks.find((l) => l.kind === 'home' && snap.villagers.some((v) => v.homeId === l.id))!;
    const dead: SceneSnapshot = { ...snap, villagers: snap.villagers.map((v) => (v.homeId === home.id ? { ...v, status: 'dead' as const } : v)) };
    expect(near(lampSources(dead), home.x + 0.5, home.y + 0.5)).toBe(false);
    const burned: SceneSnapshot = { ...snap, landmarks: snap.landmarks.map((l) => (l.id === home.id ? { ...l, hp: 0 } : l)) };
    expect(near(lampSources(burned), home.x + 0.5, home.y + 0.5)).toBe(false);
  });

  it('round a fire only while it is lit', () => {
    const snap = redbank();
    const fire = snap.landmarks.find((l) => l.kind === 'beacon' || l.kind === 'campfire');
    expect(fire, 'Redbank has a beacon or a campfire').toBeDefined();
    const at = (lit: boolean): boolean => near(lampSources({ ...snap, landmarks: snap.landmarks.map((l) => (l.id === fire!.id ? { ...l, lit } : l)) }), fire!.x + 0.5, fire!.y + 0.5);
    expect(at(true)).toBe(true);
    expect(at(false)).toBe(false);
  });
});

describe('the lamplight over the ground', () => {
  it('is strongest at a lived-in home, fades with distance, is nothing far from every lamp, and goes out with the home', () => {
    const snap = redbank();
    const light = new HomeLight();
    light.reset(snap, () => 0);
    const src = lampSources(snap);
    // the home with the most room round it: no other pool (2.8 at most, a fire's) reaches its middle
    const homes = snap.landmarks.filter((l) => l.kind === 'home' && snap.villagers.some((v) => v.homeId === l.id && v.status !== 'dead'));
    const alone = homes
      .map((l) => {
        const others = src.filter((s) => !(s.x === l.x + 0.5 && s.z === l.y + 0.5));
        const nearest = others.sort((a, b) => Math.hypot(a.x - l.x - 0.5, a.z - l.y - 0.5) - Math.hypot(b.x - l.x - 0.5, b.z - l.y - 0.5))[0];
        return { l, nearest, gap: Math.hypot(nearest.x - l.x - 0.5, nearest.z - l.y - 0.5) };
      })
      .sort((a, b) => b.gap - a.gap)[0];
    expect(alone.gap).toBeGreaterThan(2.9);
    const { l, nearest } = alone;
    const cx = l.x + 0.5;
    const cz = l.y + 0.5;
    expect(light.at(cx, cz)).toBeGreaterThan(0.6);
    // a step away from it, on the side away from every other lamp, the light is weaker
    const ax = (cx - nearest.x) / alone.gap;
    const az = (cz - nearest.z) / alone.gap;
    expect(light.at(cx + ax * 1.2, cz + az * 1.2)).toBeLessThan(light.at(cx, cz));
    // open ground away from every lamp
    let far: [number, number] | null = null;
    for (let y = 0; y < snap.h && !far; y++)
      for (let x = 0; x < snap.w && !far; x++) if (src.every((s) => Math.hypot(s.x - x - 0.5, s.z - y - 0.5) > 3.5)) far = [x, y];
    expect(far).not.toBeNull();
    expect(light.at(far![0] + 0.5, far![1] + 0.5)).toBe(0);
    // its people die: the pool goes out at the next update
    light.set({ ...snap, villagers: snap.villagers.map((v) => (v.homeId === l.id ? { ...v, status: 'dead' as const } : v)) });
    expect(light.at(cx, cz)).toBe(0);
    light.dispose();
  });

  it('is unlit by day: the strength follows the hour, not the village', () => {
    const light = new HomeLight();
    expect(light.strength).toBe(0);
    light.setStrength(2.4, 0.6);
    expect(light.strength).toBe(2.4);
    expect(light.uniforms.uMoonGrey.value).toBe(0.6);
    light.setStrength(0);
    expect(light.uniforms.uMoonGrey.value).toBe(0);
  });
});

describe('every lit material takes the lamplight once', () => {
  const compile = (m: THREE.Material, lib: 'standard' | 'lambert'): { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> } => {
    const shader = { vertexShader: THREE.ShaderLib[lib].vertexShader, fragmentShader: THREE.ShaderLib[lib].fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    return shader;
  };
  const count = (s: string, what: string): number => s.split(what).length - 1;

  it('lit materials only, each once, keeping the hooks they already had and a program of their own', () => {
    const light = new HomeLight();
    const root = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial();
    const leaf = new THREE.MeshLambertMaterial();
    const glow = new THREE.MeshBasicMaterial();
    const own = new THREE.MeshStandardMaterial();
    own.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n// own hook');
    };
    const ownKey = own.customProgramCacheKey();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), stone), new THREE.InstancedMesh(new THREE.BoxGeometry(), leaf, 4), new THREE.Mesh(new THREE.BoxGeometry(), glow), new THREE.Mesh(new THREE.BoxGeometry(), own));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), stone));
    expect(attachHomeLight(root, light.uniforms)).toBe(3);
    // a second pass changes nothing, and neither does one after something else wrapped the hook (the finishing chain does)
    const prev = stone.onBeforeCompile;
    stone.onBeforeCompile = (sh, r) => prev.call(stone, sh, r);
    expect(attachHomeLight(root, light.uniforms)).toBe(0);
    const a = compile(stone, 'standard');
    expect(count(a.vertexShader, 'varying vec3 vHomeW;')).toBe(1);
    expect(count(a.vertexShader, 'vHomeW = (modelMatrix * homeW).xyz;')).toBe(1);
    expect(count(a.fragmentShader, 'uniform sampler2D uHome;')).toBe(1);
    expect(a.fragmentShader).toContain('reflectedLight.indirectDiffuse += material.diffuseColor * uHomeCol * lamp;');
    expect(a.uniforms.uHomeK).toBe(light.uniforms.uHomeK);
    expect(compile(leaf, 'lambert').fragmentShader).toContain('uMoonGrey');
    const o = compile(own, 'standard');
    expect(o.fragmentShader).toContain('// own hook');
    expect(o.fragmentShader).toContain('uHomeK');
    expect(own.customProgramCacheKey()).not.toBe(ownKey);
    expect(own.customProgramCacheKey().startsWith(ownKey)).toBe(true);
    expect(glow.customProgramCacheKey()).toBe(new THREE.MeshBasicMaterial().customProgramCacheKey());
  });
});

describe('the same weather at sundown and at night', () => {
  const day = moodFor(redbank(), 0);
  const storm = moodFor(redbank(), 4);

  it('night: every window lit, a darker sky and water, the day’s own wind and rain', () => {
    for (const m of [day, storm] as Mood[]) {
      const n = nightOf(m);
      expect(n.windows).toBe(1);
      expect(luma(n.skyTop)).toBeLessThan(luma(m.skyTop));
      expect(luma(n.skyHorizon)).toBeLessThan(luma(m.skyHorizon));
      expect(n.waterTint).toBeLessThan(m.waterTint);
      expect(n.rain).toBe(m.rain);
      expect(n.wind).toBe(m.wind);
      // the moon is cool
      const c = new THREE.Color(n.sunColor);
      expect(c.b).toBeGreaterThan(c.r);
    }
  });

  it('an overcast night is greyer and its moon weaker than a clear one', () => {
    const clear = nightOf({ ...day, cloud: 0.3 });
    const overcast = nightOf({ ...day, cloud: 1 });
    expect(overcast.sunIntensity).toBeLessThan(clear.sunIntensity);
    const sat = (hex: number): number => {
      const c = new THREE.Color(hex);
      return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    };
    expect(sat(overcast.skyHorizon)).toBeLessThan(sat(clear.skyHorizon));
  });

  it('sundown: a warm horizon and the first windows lit', () => {
    const d = duskOf(day);
    const h = new THREE.Color(d.skyHorizon);
    expect(h.r).toBeGreaterThan(h.b);
    expect(d.windows).toBeGreaterThanOrEqual(0.6);
    expect(d.rain).toBe(day.rain);
  });
});
