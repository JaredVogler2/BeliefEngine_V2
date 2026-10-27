import * as THREE from 'three';
import type { GameEvent, RunState } from '../engine/index.ts';
import type { HitResult, RenderOpts, WorldRenderer } from '../render/types.ts';
import { TabletopCamera } from './camera.ts';
import { PROFILES, type Layer, type Quality, type QualityProfile, type WorldContext } from './context.ts';
import { engineToWorld } from './coords.ts';
import { rng, seedFrom } from './rand.ts';
import { makeSky } from './sky.ts';
import { Atmosphere, Rain, moodFor } from './atmosphere.ts';
import { getSceneChanges, getSceneSnapshot, type SceneSnapshot } from './snapshot.ts';
import { buildHeightField, buildTerrainMesh, type TerrainMesh } from './terrain.ts';
import { Water } from './water.ts';
import { MaterialLib } from './materials.ts';
import { createLayers } from './layers.ts';
import { EffectsLayer } from './effects.ts';
import { MagicField, attachMagicToStandard } from './magic.ts';

const DEFAULT_OPTS: RenderOpts = {
  reducedMotion: false, lens: 'none', showFlood: true, activeClaim: null, selection: null, hints: [], forecast: null, highContrast: false, quality: 'high', known: new Set(),
};

/** which quality tier to start in: an explicit ?quality=, else the setting, with software-rendered and phone-sized windows stepped down */
export function chooseQuality(setting: 'high' | 'low', w: number): Quality {
  try {
    const q = new URLSearchParams(window.location.search).get('quality');
    if (q === 'high' || q === 'medium' || q === 'low') return q;
  } catch {
    /* no window.location in some test environments */
  }
  if (setting === 'low') return 'low';
  if (typeof navigator !== 'undefined' && navigator.webdriver) return 'low';
  if (w < 700 || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)) return 'medium';
  return 'high';
}

export class World3D implements WorldRenderer {
  readonly kind = '3d' as const;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam: TabletopCamera;
  private sun = new THREE.DirectionalLight(0xffe0ae, 3.1);
  private hemi = new THREE.HemisphereLight(0xc4dcf4, 0x7a7650, 1.45);
  private fill = new THREE.DirectionalLight(0xa9c4e8, 1.0);
  private sky: THREE.Mesh;
  private fog = new THREE.FogExp2(0xd9e4d6, 0.0105);
  private W = 300;
  private H = 200;
  private dpr = 1;
  private opts: RenderOpts = { ...DEFAULT_OPTS };
  private quality: Quality;
  private profile: QualityProfile;
  private snap: SceneSnapshot | null = null;
  private terrainMesh: TerrainMesh | null = null;
  private water: Water | null = null;
  private materials: MaterialLib | null = null;
  private layers: Layer[] = [];
  private atmo = new Atmosphere();
  private rain: Rain | null = null;
  private magic: MagicField | null = null;
  private effects: EffectsLayer | null = null;
  private ctx: WorldContext | null = null;
  private raf = 0;
  private running = false;
  private last = 0;
  private time = 0;
  private lastDraw = 0;
  private frames = 0;
  private fpsT = performance.now();
  fps = 60;
  private hover: HitResult | null = null;
  private ray = new THREE.Raycaster();
  private contextLost = false;
  /** how long drawing a frame takes on this machine (smoothed, ms): the frame pacing and the quality monitor both read it */
  private drawMs = 0;
  /** render resolution as a fraction of the canvas, stepped down when even the lowest tier is too slow */
  private scale = 1;
  /** quality was asked for by name (?quality=), so the monitor leaves it alone */
  private pinned = false;
  /** the graphics context is a software rasteriser (no GPU): start low and keep the page responsive */
  software = false;
  private monT = 0;
  /** drawn frames, for tests and the quality monitor */
  frameCount = 0;
  lastError: string | null = null;

  constructor(canvas: HTMLCanvasElement, quality?: Quality) {
    this.canvas = canvas;
    this.quality = quality ?? chooseQuality('high', canvas.clientWidth || 1000);
    this.profile = PROFILES[this.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = this.profile.shadow > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0xcfdccf, 1);
    try {
      this.pinned = !!new URLSearchParams(window.location.search).get('quality');
    } catch {
      this.pinned = false;
    }
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      this.software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
    } catch {
      this.software = false;
    }
    if (this.software && !this.pinned) {
      // no GPU: the lowest tier, at a reduced resolution, so a page that also has to answer clicks stays usable
      this.quality = 'low';
      this.profile = PROFILES.low;
      this.renderer.shadowMap.enabled = false;
      this.scale = 0.6;
    }
    this.cam = new TabletopCamera(1.6);
    this.scene.fog = this.fog;
    this.sky = makeSky();
    this.scene.add(this.sky);
    this.scene.add(this.hemi);
    this.sun.castShadow = this.profile.shadow > 0;
    this.sun.shadow.mapSize.set(this.profile.shadow || 1, this.profile.shadow || 1);
    this.sun.shadow.bias = -0.00045;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2.2;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.fill.position.set(8, 6, -10);
    this.scene.add(this.fill);
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  private onLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    this.lastError = 'The graphics context was lost.';
  };
  private onRestored = (): void => {
    this.contextLost = false;
    this.lastError = null;
    if (this.snap) {
      const s = this.snap;
      this.snap = null;
      this.rebuild(s);
    }
  };

  // ------------------------------------------------------------------------------------------------------ lifecycle

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (document.hidden || this.contextLost) return;
      // never spend more than about 40% of the main thread on drawing, whatever the machine: a slow frame earns a longer rest
      const minGap = Math.max(1000 / this.profile.maxFps - 2, this.drawMs * 2.5);
      if (now - this.lastDraw < minGap) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.lastDraw = now;
      this.frame(dt, now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.disposeWorld();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  resize(w: number, h: number, dpr: number): void {
    this.W = Math.max(1, w);
    this.H = Math.max(1, h);
    this.dpr = Math.min(dpr, this.profile.dpr);
    this.renderer.setPixelRatio(this.dpr * this.scale);
    this.renderer.setSize(this.W, this.H, false);
    this.cam.resize(this.W, this.H);
    this.draw();
  }

  setOptions(o: Partial<RenderOpts>): void {
    const prevQuality = this.opts.quality;
    this.opts = { ...this.opts, ...o };
    this.cam.reduced = this.opts.reducedMotion;
    if (this.ctx) this.ctx.reducedMotion = this.opts.reducedMotion;
    if (o.quality && o.quality !== prevQuality) this.setQuality(chooseQuality(o.quality, this.W));
    if (o.forecast !== undefined && this.snap) this.applyForecast(this.snap, this.opts.reducedMotion);
    for (const l of this.layers) (l as Layer & { setOptions?: (o: RenderOpts) => void }).setOptions?.(this.opts);
  }

  setInsets(i: { left: number; right: number; top: number; bottom: number }): void {
    this.cam.setInsets(i);
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.profile = PROFILES[q];
    this.renderer.shadowMap.enabled = this.profile.shadow > 0;
    this.sun.castShadow = this.profile.shadow > 0;
    this.sun.shadow.mapSize.set(this.profile.shadow || 1, this.profile.shadow || 1);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.profile.dpr);
    this.renderer.setPixelRatio(this.dpr * this.scale);
    this.renderer.setSize(this.W, this.H, false);
    if (this.snap) {
      const s = this.snap;
      this.snap = null;
      this.rebuild(s);
    }
  }

  get qualityTier(): Quality {
    return this.quality;
  }

  // ------------------------------------------------------------------------------------------------------ the world

  private disposeWorld(): void {
    for (const l of this.layers) {
      this.scene.remove(l.group);
      l.dispose();
    }
    this.layers = [];
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh.group);
      this.terrainMesh.dispose();
      this.terrainMesh = null;
    }
    if (this.water) {
      this.scene.remove(this.water.mesh);
      this.water.dispose();
      this.water = null;
    }
    if (this.rain) {
      this.scene.remove(this.rain.lines);
      this.rain.dispose();
      this.rain = null;
    }
    this.magic?.dispose();
    this.magic = null;
    this.effects = null;
    this.materials?.dispose();
    this.materials = null;
    this.ctx = null;
  }

  /** a new village (or the same one reloaded): drop everything the old one owned and build again from the snapshot */
  private rebuild(snap: SceneSnapshot): void {
    this.disposeWorld();
    const seedNum = seedFrom(snap.scenarioId, snap.seed);
    const terrain = buildHeightField(snap, seedNum);
    this.terrainMesh = buildTerrainMesh(snap, terrain, seedNum, Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.scene.add(this.terrainMesh.group);
    this.water = new Water(snap, terrain, this.profile.water);
    this.scene.add(this.water.mesh);
    this.magic = new MagicField(snap);
    this.magic.reduced = this.opts.reducedMotion;
    attachMagicToStandard(this.terrainMesh.ground.material as THREE.MeshStandardMaterial, this.magic);
    this.water.attachMagic(this.magic);
    this.materials = new MaterialLib(seedNum, this.profile.detail > 0.5 ? 256 : 128, Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    const ctx: WorldContext = {
      scene: this.scene,
      terrain,
      water: this.water,
      materials: this.materials,
      profile: this.profile,
      seed: seedNum,
      rng: (salt) => rng(seedFrom(seedNum, salt)),
      heightAt: (x, z) => terrain.heightAt(x, z),
      reducedMotion: this.opts.reducedMotion,
      weather: { wind: 1, rain: 0 },
      magic: this.magic,
      locate: (kind, id) => this.locate(kind, id),
    };
    this.ctx = ctx;
    this.layers = createLayers(ctx);
    this.effects = (this.layers.find((l) => l instanceof EffectsLayer) as EffectsLayer | undefined) ?? null;
    if (this.effects) this.effects.onFocus = (x, z) => this.cam.focus(x, z);
    for (const l of this.layers) this.scene.add(l.group);
    this.rain = new Rain(snap.w, snap.h, this.profile.detail > 0.5 ? 1400 : 600);
    this.scene.add(this.rain.lines);
    this.cam.setGround((x, z) => terrain.heightAt(x, z));
    this.cam.setBounds({ w: snap.w, h: snap.h });
    this.cam.reduced = this.opts.reducedMotion;
    this.cam.resize(this.W, this.H);
    this.configureLight(snap);
    this.applyForecast(snap, true);
    for (const l of this.layers) l.update(snap, getSceneChanges(null, snap), ctx);
    for (const l of this.layers) (l as Layer & { setOptions?: (o: RenderOpts) => void }).setOptions?.(this.opts);
  }

  /** choose the mood for this moment of the run from the engine's own forecast and flood level */
  private applyForecast(snap: SceneSnapshot, instant: boolean): void {
    const f = this.opts.forecast;
    let surge = 0;
    if (f) for (const d of f) if (d > surge) surge = d;
    this.atmo.set(moodFor(snap, surge), instant);
    if (instant) this.applyMood();
  }

  private applyMood(): void {
    const m = this.atmo.current;
    this.sun.color.setHex(m.sunColor);
    this.sun.intensity = m.sunIntensity;
    this.hemi.color.setHex(m.hemiSky);
    this.hemi.groundColor.setHex(m.hemiGround);
    this.hemi.intensity = m.hemiIntensity;
    this.fill.intensity = m.fillIntensity;
    this.fog.color.setHex(m.fog);
    this.fog.density = m.fogDensity;
    this.renderer.toneMappingExposure = m.exposure;
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    (u.uTop.value as THREE.Color).setHex(m.skyTop);
    (u.uHorizon.value as THREE.Color).setHex(m.skyHorizon);
    (u.uBottom.value as THREE.Color).setHex(m.fog).multiplyScalar(0.92);
    if (this.water) {
      this.water.setTint(new THREE.Color(m.waterTint, m.waterTint, m.waterTint));
      this.water.setLight(this.sun.position.clone().sub(this.sun.target.position).normalize(), this.sun.color.clone().multiplyScalar(Math.min(1, m.sunIntensity / 3)), new THREE.Color(m.skyTop));
    }
    if (this.ctx) {
      this.ctx.weather.wind = m.wind;
      this.ctx.weather.rain = m.rain;
    }
    for (const l of this.layers) (l as Layer & { setWeatherGlow?: (k: number) => void }).setWeatherGlow?.(m.windows);
  }

  private configureLight(snap: SceneSnapshot): void {
    const cx = snap.w / 2;
    const cz = snap.h / 2;
    const dir = new THREE.Vector3(-0.55, 0.72, 0.5).normalize();
    this.sun.position.set(cx + dir.x * 60, dir.y * 60, cz + dir.z * 60);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.target.updateMatrixWorld();
    const ext = Math.hypot(snap.w, snap.h) * 0.62;
    const sc = this.sun.shadow.camera;
    sc.left = -ext;
    sc.right = ext;
    sc.top = ext;
    sc.bottom = -ext;
    sc.near = 5;
    sc.far = 140;
    sc.updateProjectionMatrix();
    this.water?.setLight(dir, this.sun.color, new THREE.Color(0xa9cbe6));
  }

  setState(s: RunState): void {
    const snap = getSceneSnapshot(s);
    if (this.contextLost) {
      this.snap = snap;
      return;
    }
    const prev = this.snap;
    const changes = getSceneChanges(prev, snap);
    this.snap = snap;
    if (changes.rebuild || !this.ctx) {
      this.rebuild(snap);
      return;
    }
    if (changes.water) this.water?.setState(snap, !this.opts.reducedMotion);
    this.applyForecast(snap, this.opts.reducedMotion);
    for (const l of this.layers) l.update(snap, changes, this.ctx);
  }

  private reduced(): boolean {
    return this.opts.reducedMotion;
  }

  // ------------------------------------------------------------------------------------------------------ frame

  /** everything a frame does except drawing it: the camera, the weather, the water, every layer's animation */
  private simulate(dt: number): void {
    this.time += dt;
    this.cam.update(dt);
    if (this.atmo.update(dt)) this.applyMood();
    this.rain?.update(this.time, this.reduced() ? 0 : this.atmo.current.rain, this.atmo.current.wind);
    if (this.ctx) {
      this.water?.tick(dt, this.time);
      for (const l of this.layers) l.tick(dt, this.time, this.ctx);
    }
  }

  private frame(dt: number, now: number): void {
    this.simulate(dt);
    this.draw();
    this.monitor(dt);
    this.frames++;
    if (now - this.fpsT > 1000) {
      this.fps = (this.frames * 1000) / (now - this.fpsT);
      this.frames = 0;
      this.fpsT = now;
    }
  }

  /** test and screenshot hook: let `seconds` of animation pass in small steps (as if running at 30 fps), then draw once */
  advance(seconds: number): void {
    const step = 1 / 30;
    for (let t = 0; t < seconds; t += step) this.simulate(step);
    this.draw();
  }

  /** step the quality down when frames are too slow for this machine, and back up (resolution only) when there is room */
  private monitor(dt: number): void {
    this.monT += dt;
    if (this.monT < 1.5 || this.pinned || this.drawMs === 0) return;
    this.monT = 0;
    if (this.drawMs > 28) {
      if (this.quality === 'high') this.setQuality('medium');
      else if (this.quality === 'medium') this.setQuality('low');
      else if (this.scale > 0.5) this.setScale(Math.max(0.5, this.scale * 0.8));
    } else if (this.drawMs < 6 && this.scale < 1) {
      this.setScale(Math.min(1, this.scale * 1.15));
    }
  }

  private setScale(k: number): void {
    this.scale = k;
    this.renderer.setPixelRatio(this.dpr * this.scale);
    this.renderer.setSize(this.W, this.H, false);
  }

  private draw(): void {
    if (this.contextLost) return;
    try {
      const t0 = performance.now();
      this.renderer.render(this.scene, this.cam.camera);
      const ms = performance.now() - t0;
      this.drawMs = this.drawMs === 0 ? ms : this.drawMs * 0.8 + ms * 0.2;
      this.frameCount++;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
    }
  }

  // ------------------------------------------------------------------------------------------------------ camera

  fit(): void {
    this.cam.reset();
  }

  panBy(dx: number, dy: number): void {
    this.cam.panBy(dx, dy, this.H);
  }

  orbitBy(dAz: number, dEl: number): void {
    this.cam.orbitBy(dAz, dEl);
  }

  zoomBy(factor: number, ax = this.W / 2, ay = this.H / 2): void {
    const g = this.cam.groundPoint((ax / this.W) * 2 - 1, -((ay / this.H) * 2 - 1));
    this.cam.zoomBy(factor, g ?? undefined);
  }

  focusTile(x: number, y: number, zoom?: number, _animate = true): void {
    const p = engineToWorld(x, y);
    const target = zoom && zoom > 1.2 ? this.cam.closeDist() : undefined;
    this.cam.focus(p.x, p.z, target);
  }

  focusVillager(id: string): void {
    const p = this.locate('villager', id);
    if (p) this.cam.focus(p.x, p.z, this.cam.closeDist());
  }

  /** test and screenshot hook */
  setView(v: Parameters<TabletopCamera['setView']>[0]): void {
    this.cam.setView(v);
    this.draw();
  }

  describeView(): ReturnType<TabletopCamera['describe']> {
    return this.cam.describe();
  }

  // ------------------------------------------------------------------------------------------------------ picking

  private locate(kind: 'villager' | 'landmark', id: string): THREE.Vector3 | null {
    for (const l of this.layers) {
      const p = l.locate?.(kind, id);
      if (p) return p;
    }
    return null;
  }

  villagerScreen(id: string): { x: number; y: number } | null {
    const p = this.locate('villager', id);
    if (!p) return null;
    const v = p.clone().project(this.cam.camera);
    return { x: ((v.x + 1) / 2) * this.W, y: ((1 - v.y) / 2) * this.H };
  }

  entityScreen(kind: 'villager' | 'landmark', id: string): { x: number; y: number } | null {
    const p = this.locate(kind, id);
    if (!p) return null;
    const v = p.clone().project(this.cam.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * this.W, y: ((1 - v.y) / 2) * this.H };
  }

  hitTest(sx: number, sy: number): HitResult | null {
    const objs: THREE.Object3D[] = [];
    for (const l of this.layers) objs.push(...(l.pickables?.() ?? []));
    if (!objs.length) return null;
    this.ray.setFromCamera(new THREE.Vector2((sx / this.W) * 2 - 1, -((sy / this.H) * 2 - 1)), this.cam.camera);
    const hits = this.ray.intersectObjects(objs, false);
    // people win over the buildings they stand beside, then the nearest thing
    let best: THREE.Intersection | null = null;
    for (const h of hits) {
      const e = h.object.userData.entity as { kind: 'villager' | 'landmark'; id: string } | undefined;
      if (!e) continue;
      if (!best) best = h;
      if (e.kind === 'villager') {
        best = h;
        break;
      }
    }
    if (!best) return null;
    const e = best.object.userData.entity as { kind: 'villager' | 'landmark'; id: string };
    return { kind: e.kind, id: e.id };
  }

  setHover(h: HitResult | null): void {
    this.hover = h;
    for (const l of this.layers) (l as Layer & { setHover?: (h: HitResult | null) => void }).setHover?.(h);
  }

  get hovered(): HitResult | null {
    return this.hover;
  }

  // ------------------------------------------------------------------------------------------------------ effects

  playAction(events: GameEvent[]): void {
    for (const l of this.layers) (l as Layer & { playAction?: (e: GameEvent[]) => void }).playAction?.(events);
  }

  playResolution(events: GameEvent[], prev: RunState | null): void {
    for (const l of this.layers) (l as Layer & { playResolution?: (e: GameEvent[], p: RunState | null) => void }).playResolution?.(events, prev);
  }

  /** the effects the world has started (for tests and the debug view): each names the engine event that caused it */
  playedEffects(): readonly import('./effects.ts').PlayedEffect[] {
    return this.effects?.played() ?? [];
  }

  /** the laws as the ground shows them: the engine's status, strength, whether anything powers them and what is missing */
  lawVisuals(): readonly import('./plan.ts').LawVisual[] {
    return this.effects?.laws() ?? [];
  }

  /** the strongest glow now on the ground for each colour vocabulary */
  magicLevels(): { trust: number; rival: number; rain: number; safe: number } | null {
    return this.magic?.levels() ?? null;
  }

  noteBell(): void {
    for (const l of this.layers) (l as Layer & { noteBell?: () => void }).noteBell?.();
  }

  stats(): { fps: number; effects: number; zoom: number } {
    let effects = 0;
    for (const l of this.layers) effects += (l as Layer & { effectCount?: () => number }).effectCount?.() ?? 0;
    return { fps: this.fps, effects, zoom: this.cam.zoomLevel };
  }

  /** draw-call and memory figures for the developer quality monitor and the performance record */
  info(): { calls: number; triangles: number; geometries: number; textures: number; fps: number; tier: Quality; frames: number; scale: number; drawMs: number; software: boolean } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, fps: this.fps, tier: this.quality, frames: this.frameCount, scale: this.scale, drawMs: Math.round(this.drawMs * 10) / 10, software: this.software };
  }

  /** triangles and draw calls per part of the scene, counted from the geometry (for the performance record and the quality monitor) */
  heaviest(n = 12): { layer: string; name: string; instances: number; trianglesEach: number; triangles: number }[] {
    const rows: { layer: string; name: string; instances: number; trianglesEach: number; triangles: number }[] = [];
    const roots: [string, THREE.Object3D][] = this.layers.map((l) => [l.group.name || 'layer', l.group]);
    for (const [layer, root] of roots) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!o.visible || !m.geometry || (o as THREE.Points).isPoints) return;
        const g = m.geometry as THREE.BufferGeometry;
        const verts = g.index ? g.index.count : g.getAttribute('position')?.count ?? 0;
        const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
        rows.push({ layer, name: o.name || m.geometry.type, instances: inst, trianglesEach: Math.round(verts / 3), triangles: Math.round((verts / 3) * inst) });
      });
    }
    return rows.sort((a, b) => b.triangles - a.triangles).slice(0, n);
  }

  /** frames per second with each part of the scene hidden in turn, measured over `seconds` of the real loop: where the time goes */
  async profileParts(seconds = 3): Promise<Record<string, number>> {
    const rate = async (): Promise<number> => {
      const f0 = this.frameCount;
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, seconds * 1000));
      return Math.round(((this.frameCount - f0) * 1000) / (performance.now() - t0) * 10) / 10;
    };
    const parts: [string, THREE.Object3D | undefined][] = [
      ['terrain', this.terrainMesh?.group],
      ['water', this.water?.mesh],
      ['sky', this.sky],
      ['rain', this.rain?.lines],
      ...this.layers.map((l): [string, THREE.Object3D] => [l.group.name || 'layer', l.group]),
    ];
    const out: Record<string, number> = { all: await rate() };
    for (const [name, obj] of parts) {
      if (!obj) continue;
      const was = obj.visible;
      obj.visible = false;
      out[`without ${name}`] = await rate();
      obj.visible = was;
    }
    const shadows = this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.enabled = false;
    out['without shadows'] = await rate();
    this.renderer.shadowMap.enabled = shadows;
    const was = parts.map(([, o]) => o?.visible ?? true);
    for (const [, o] of parts) if (o) o.visible = false;
    out['nothing drawn (the floor)'] = await rate();
    parts.forEach(([, o], i) => o && (o.visible = was[i]));
    return out;
  }

  breakdown(): { name: string; meshes: number; triangles: number }[] {
    const rows: { name: string; meshes: number; triangles: number }[] = [];
    const count = (name: string, root: THREE.Object3D): void => {
      let meshes = 0;
      let triangles = 0;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!o.visible || !m.geometry) return;
        const g = m.geometry as THREE.BufferGeometry;
        const verts = g.index ? g.index.count : g.getAttribute('position')?.count ?? 0;
        const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
        if ((o as THREE.Points).isPoints || (o as THREE.LineSegments).isLineSegments) return;
        meshes++;
        triangles += (verts / 3) * inst;
      });
      rows.push({ name, meshes, triangles: Math.round(triangles) });
    };
    if (this.terrainMesh) count('terrain', this.terrainMesh.group);
    if (this.water) count('water', this.water.mesh);
    for (const l of this.layers) count(l.group.name || 'layer', l.group);
    return rows;
  }

  /** render one frame now, regardless of the loop, and wait for the GPU: used by screenshot capture */
  renderNow(): void {
    this.cam.update(0.016);
    this.draw();
  }
}
