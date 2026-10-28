import * as THREE from 'three';
import type { GameEvent, RunState } from '../engine/index.ts';
import type { HitResult, RenderOpts, WorldRenderer } from '../render/types.ts';
import { TabletopCamera } from './camera.ts';
import { PROFILES, type Layer, type Quality, type QualityProfile, type WorldContext } from './context.ts';
import { engineToWorld, worldToTile } from './coords.ts';
import { rng, seedFrom } from './rand.ts';
import { makeSky } from './sky.ts';
import { Atmosphere, Rain, duskOf, mix as mixMood, moodFor, nightOf, type Mood } from './atmosphere.ts';
import { getSceneChanges, getSceneSnapshot, type SceneSnapshot } from './snapshot.ts';
import { buildHeightField, buildTerrainMesh, type TerrainMesh } from './terrain.ts';
import { CloudSea } from './clouds.ts';
import { Water } from './water.ts';
import { MaterialLib } from './materials.ts';
import { HazardsLayer } from './hazards.ts';
import { PeopleLayer } from './people.ts';
import { createLayers } from './layers.ts';
import { EffectsLayer } from './effects.ts';
import { MagicField, attachMagicToStandard } from './magic.ts';
import { DEFAULT_LOOK, PostChain, displayUniforms, preCompensate, type PostLook, type PostProfile } from './post.ts';
import { makeEnvironment } from './env.ts';
import { HomeLight, attachHomeLight } from './homelight.ts';
import { RealityLayer, type RealityDrawn } from './reality.ts';

const DEFAULT_OPTS: RenderOpts = {
  reducedMotion: false, lens: 'none', showFlood: true, activeClaim: null, selection: null, hints: [], forecast: null, highContrast: false, quality: 'high', known: new Set(),
};

/** whether this browser's WebGL2 can draw into half-float buffers (what the finishing chain needs), asked of a throwaway context */
function floatBuffersLikely(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const ok = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

/** how much of the haze high contrast keeps */
const CONTRAST_FOG = 0.3;
/** seconds for the light to go from the planning afternoon to night (End Day), or back at dawn */
const NIGHT_SECONDS = 2.6;
const DEG = Math.PI / 180;
const SUNSET = new THREE.Color(0xff8a4a);
/** how bright the lamplight is at full night, as light falling on what is round it */
const LAMPS = 2.4;
/** how far colours under the moon fade toward grey at full night (lamplight and glow keep theirs) */
const MOON_GREY = 0.6;
/** the hour at which the sun touches the horizon: the sky is at its warmest */
const SUNDOWN = 0.45;
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** the key light from `bearing` (its horizontal direction) at `elevation` degrees above the horizon */
function keyDir(bearing: THREE.Vector3, elevation: number): THREE.Vector3 {
  const h = Math.hypot(bearing.x, bearing.z) || 1;
  const c = Math.cos(elevation * DEG);
  return new THREE.Vector3((bearing.x / h) * c, Math.sin(elevation * DEG), (bearing.z / h) * c);
}

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
  /** where the planning afternoon's sun stands, as a direction from the village (the light, the shadows and the sky's glow all use
   * it): low in the south-west, 24° up, behind the player's left shoulder (the standard asks 10-25° late in the day) */
  private sunDir = keyDir(new THREE.Vector3(-0.6, 0, 0.52), 24);
  /** 0 the planning afternoon, 1 night (while the night's summary is open); eased toward `hourGoal` */
  private hour = 0;
  private hourGoal = 0;
  /** lamplight from the homes and fires, lit as the sun goes down (one for the renderer's lifetime) */
  private home = new HomeLight();
  /** the finishing chain (ink, hollows, glow, tone mapping, smoothing); null where the browser cannot draw into a high-range buffer */
  private post: PostChain | null = null;
  /** a debug switch: draw straight to the screen even though the chain exists (before/after comparisons) */
  private postOff = false;
  /** the sky's light as an environment map (ambient light and soft reflections) */
  private envRT: THREE.WebGLRenderTarget | null = null;
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
  private clouds: CloudSea | null = null;
  private magic: MagicField | null = null;
  private effects: EffectsLayer | null = null;
  private ctx: WorldContext | null = null;
  private raf = 0;
  private running = false;
  /** a capture hook: the live loop stops drawing, so frames change only through advance() (exact frame-to-frame comparisons) */
  private frozen = false;
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
  /** how long the last world build took on the main thread (ms) */
  buildMs = 0;
  /** drawn frames, for tests and the quality monitor */
  frameCount = 0;
  lastError: string | null = null;

  constructor(canvas: HTMLCanvasElement, quality?: Quality) {
    this.canvas = canvas;
    this.quality = quality ?? chooseQuality('high', canvas.clientWidth || 1000);
    this.profile = PROFILES[this.quality];
    // ask for the context here rather than inside three.js: a browser that offers WebGL2 to a test canvas can still refuse it to this one
    // (WebKit on a machine with no GPU), and then this throws quietly and the page falls back to the classic map instead of logging an error
    // the finishing chain draws the scene into its own buffer and smooths edges itself (FXAA), so a multisampled canvas would only cost
    // memory and time: it is asked for only where the chain cannot run (no half-float buffers) or is switched off with ?post=0
    let postWanted = true;
    try {
      postWanted = new URLSearchParams(window.location.search).get('post') !== '0';
    } catch {
      /* no URL in some test environments */
    }
    const chainLikely = postWanted && floatBuffersLikely();
    const attrs = { alpha: false, antialias: this.quality !== 'low' && !chainLikely, depth: true, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' as const, preserveDrawingBuffer: false };
    const gl = canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is not available here');
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGLRenderingContext, ...attrs });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = this.profile.shadow > 0;
    // (three.js folded its soft variant into PCF: the softness is the shadow radius, set per tier)
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0xcfdccf, 1);
    // a frame is several drawing passes: count them all, reset once per frame in draw()
    this.renderer.info.autoReset = false;
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
    try {
      // ?scale=0.5 sets the render resolution as a fraction of the canvas (for headless tests and very weak machines)
      const k = Number(new URLSearchParams(window.location.search).get('scale'));
      if (k >= 0.25 && k <= 1) this.scale = k;
    } catch {
      /* no URL in some test environments */
    }
    if (postWanted && PostChain.supported(this.renderer)) this.post = new PostChain(this.renderer, this.quality);
    this.makeEnv();
    this.cam = new TabletopCamera(1.6);
    this.scene.fog = this.fog;
    this.sky = makeSky();
    this.scene.add(this.sky);
    this.scene.add(this.hemi);
    this.sun.castShadow = this.profile.shadow > 0;
    this.sun.shadow.mapSize.set(this.profile.shadow || 1, this.profile.shadow || 1);
    this.sun.shadow.bias = -0.00045;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = this.quality === 'high' ? 3 : 2;
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
    // Everything on the graphics side died with the context. What lives for the whole view (the sky, the finishing chain, the sun's
    // shadow map, the environment) is made again rather than disposed, as the village is below, so WebGL is never asked to delete what
    // it no longer has ("object does not belong to this context").
    this.scene.remove(this.sky);
    this.sky = makeSky();
    this.scene.add(this.sky);
    if (this.post) {
      const old = this.post;
      this.post = new PostChain(this.renderer, this.quality);
      this.post.setProfile(old.settings);
      this.post.look = { ...old.look };
      this.syncPostSize();
    }
    this.sun.shadow.map = null;
    this.envRT = null;
    this.makeEnv();
    if (this.snap) {
      const s = this.snap;
      this.snap = null;
      this.rebuild(s, true);
    }
    this.applyMood();
  };

  // ------------------------------------------------------------------------------------------------------ lifecycle

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (document.hidden || this.contextLost || this.frozen) return;
      // never spend more than about 40% of the main thread on drawing, whatever the machine: a slow frame earns a longer rest
      // (a software rasteriser is capped at a few frames a second: it can only ever be a fallback, and the page must stay responsive)
      const minGap = Math.max(1000 / (this.software ? 3 : this.profile.maxFps) - 2, this.drawMs * 2.5);
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
    this.home.dispose();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.post?.dispose();
    this.post = null;
    this.envRT?.dispose();
    this.envRT = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  resize(w: number, h: number, dpr: number): void {
    this.W = Math.max(1, w);
    this.H = Math.max(1, h);
    this.dpr = Math.min(dpr, this.profile.dpr);
    this.renderer.setPixelRatio(this.dpr * this.scale);
    this.renderer.setSize(this.W, this.H, false);
    this.syncPostSize();
    this.cam.resize(this.W, this.H);
    this.draw();
  }

  private postActive(): boolean {
    return !!this.post && !this.postOff;
  }

  /** the chain's buffers follow the drawing buffer (canvas size times pixel ratio times render scale) */
  private syncPostSize(): void {
    if (!this.post) return;
    const v = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.post.setSize(v.x, v.y);
  }

  /** the sky's light, once per renderer (and again after a lost context, which takes the map with it) */
  private makeEnv(): void {
    this.envRT?.dispose();
    this.envRT = null;
    try {
      this.envRT = makeEnvironment(this.renderer, this.sunDir);
      this.scene.environment = this.envRT.texture;
    } catch {
      this.scene.environment = null;
    }
  }

  setOptions(o: Partial<RenderOpts>): void {
    const prevQuality = this.opts.quality;
    const prevContrast = this.opts.highContrast;
    if (o.night !== undefined) this.hourGoal = o.night ? 1 : 0;
    this.opts = { ...this.opts, ...o };
    // under reduced motion the night falls (and the day comes back) as a cut
    const cut = this.opts.reducedMotion && this.hour !== this.hourGoal;
    if (cut) this.hour = this.hourGoal;
    this.cam.reduced = this.opts.reducedMotion;
    if (this.ctx) this.ctx.reducedMotion = this.opts.reducedMotion;
    if (o.quality && o.quality !== prevQuality) this.setQuality(chooseQuality(o.quality, this.W));
    if (o.forecast !== undefined && this.snap) this.applyForecast(this.snap, this.opts.reducedMotion);
    if (o.forecast !== undefined || o.showFlood !== undefined) this.syncForecastOverlay();
    for (const l of this.layers) (l as Layer & { setOptions?: (o: RenderOpts) => void }).setOptions?.(this.opts);
    if (this.opts.highContrast !== prevContrast) this.applyContrast();
    if (o.night !== undefined || cut) this.applyMood();
  }

  /** where the key light comes from at this hour, its colour and strength: the day's sun sinks toward the horizon warming to orange,
   * then a cool moon rises on the other side (and the other way at dawn) */
  private keyLight(day: Mood, night: Mood): { dir: THREE.Vector3; color: THREE.Color; intensity: number } {
    const h = this.hour;
    if (h <= 0) return { dir: this.sunDir.clone(), color: new THREE.Color(day.sunColor), intensity: day.sunIntensity };
    const dayElevation = Math.asin(this.sunDir.y) / DEG;
    if (h < 0.5) {
      const k = h / 0.5;
      const e = k * k * (3 - 2 * k);
      return { dir: keyDir(this.sunDir, dayElevation + (3 - dayElevation) * e), color: new THREE.Color(day.sunColor).lerp(SUNSET, e), intensity: day.sunIntensity * (1 - 0.92 * e) };
    }
    const k = (h - 0.5) / 0.5;
    const e = k * k * (3 - 2 * k);
    // the moon rises in the east as the sun sets in the west, on the player's side of the sky so what faces them is moonlit
    const moon = new THREE.Vector3(-this.sunDir.x, 0, this.sunDir.z);
    return { dir: keyDir(moon, 3 + 37 * e), color: new THREE.Color(night.sunColor), intensity: night.sunIntensity * (0.15 + 0.85 * e) };
  }

  /** the light at this hour (read by tests, never by the game) */
  timeInfo(): { hour: number; goal: number; keyElevation: number; windows: number; lamps: number } {
    const day = this.atmo.current;
    const key = this.keyLight(day, nightOf(day));
    return { hour: this.hour, goal: this.hourGoal, keyElevation: Math.asin(key.dir.y) / DEG, windows: this.moodAt(day, nightOf(day)).windows, lamps: this.home.strength };
  }

  /** how much lamplight falls on a tile's ground, 0..1, before the hour's strength (tests) */
  lampAt(x: number, y: number): number {
    return this.home.at(x + 0.5, y + 0.5);
  }

  /**
   * Measurement hook (scripts/palette-3d.ts): hide the backdrop (the sky and the sea of cloud, which stage 3 replaces with landform) and
   * clear to pure magenta, so a frame tells which pixels show the world. Never used by the game.
   */
  maskBackdrop(on: boolean): void {
    this.sky.visible = !on;
    if (this.clouds) this.clouds.group.visible = !on;
    this.renderer.setClearColor(on ? 0xff00ff : 0xcfdccf, 1);
  }

  /** high contrast: shapes inked at full strength and darker, less glow (the haze is thinned as each frame is drawn) */
  private applyContrast(): void {
    if (!this.post) return;
    const high = this.opts.highContrast;
    this.post.look.ink = high ? 1 : DEFAULT_LOOK.ink;
    this.post.look.inkColor = high ? 0x0e0a06 : DEFAULT_LOOK.inkColor;
    this.post.look.bloomStrength = high ? DEFAULT_LOOK.bloomStrength * 0.5 : DEFAULT_LOOK.bloomStrength;
  }

  /** what high contrast is doing to the frame now: read by tests, never by the game */
  contrastInfo(): { high: boolean; fogDensity: number; ink: number | null } {
    return { high: this.opts.highContrast, fogDensity: this.fog.density, ink: this.post ? this.post.look.ink : null };
  }

  /** let the view drift slowly round the village (the end-of-run tour); the player's own movement pauses it */
  setAmbient(on: boolean): void {
    this.cam.ambient = on;
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
    this.sun.shadow.radius = q === 'high' ? 3 : 2;
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.profile.dpr);
    this.renderer.setPixelRatio(this.dpr * this.scale);
    this.renderer.setSize(this.W, this.H, false);
    this.post?.setQuality(q);
    this.syncPostSize();
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

  /**
   * Let go of everything the village owns. Normally each thing is disposed; after a lost context (`gone`) its graphics died with it, and
   * asking WebGL to delete them only earns "object does not belong to this context" warnings, so they are dropped instead.
   */
  private disposeWorld(gone = false): void {
    for (const l of this.layers) {
      this.scene.remove(l.group);
      if (gone) l.forget?.();
      else l.dispose();
    }
    this.layers = [];
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh.group);
      if (!gone) this.terrainMesh.dispose();
      this.terrainMesh = null;
    }
    if (this.water) {
      this.scene.remove(this.water.mesh);
      if (!gone) this.water.dispose();
      this.water = null;
    }
    if (this.rain) {
      this.scene.remove(this.rain.lines);
      if (!gone) this.rain.dispose();
      this.rain = null;
    }
    if (this.clouds) {
      this.scene.remove(this.clouds.group);
      if (!gone) this.clouds.dispose();
      this.clouds = null;
    }
    if (!gone) this.magic?.dispose();
    this.magic = null;
    this.effects = null;
    if (!gone) this.materials?.dispose();
    this.materials = null;
    this.ctx = null;
  }

  /** a new village (or the same one reloaded, or rebuilt after a lost context): drop everything the old one owned and build again */
  private rebuild(snap: SceneSnapshot, gone = false): void {
    const t0 = performance.now();
    this.disposeWorld(gone);
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
      bridgeLift: 0,
      viewDistance: this.cam.distance,
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
    this.clouds = new CloudSea(snap.w, snap.h, this.quality, seedNum);
    this.clouds.setMood(this.atmo.current);
    this.scene.add(this.clouds.group);
    this.cam.setGround((x, z) => terrain.heightAt(x, z));
    this.cam.setBounds({ w: snap.w, h: snap.h });
    this.cam.reduced = this.opts.reducedMotion;
    this.cam.resize(this.W, this.H);
    this.configureLight(snap);
    this.applyForecast(snap, true);
    this.syncForecastOverlay();
    for (const l of this.layers) l.update(snap, getSceneChanges(null, snap), ctx);
    for (const l of this.layers) (l as Layer & { setOptions?: (o: RenderOpts) => void }).setOptions?.(this.opts);
    this.home.reset(snap, (x, z) => terrain.heightAt(x, z), gone);
    attachHomeLight(this.scene, this.home.uniforms);
    this.buildMs = performance.now() - t0;
  }

  /** tonight's predicted flood drawn on the ground and the water, while the player is planning and has the overlay on */
  private syncForecastOverlay(): void {
    const snap = this.snap;
    if (!this.magic || !snap) return;
    const on = this.opts.showFlood && !!this.opts.forecast && snap.outcome === null;
    this.magic.setForecast(on ? (this.opts.forecast as number[]) : null, snap.water);
    this.magic.setWetness(snap.water, snap.terrain);
  }

  /** choose the mood for this moment of the run from the engine's own forecast and flood level */
  private applyForecast(snap: SceneSnapshot, instant: boolean): void {
    const f = this.opts.forecast;
    let surge = 0;
    if (f) for (const d of f) if (d > surge) surge = d;
    this.atmo.set(moodFor(snap, surge), instant);
    if (instant) this.applyMood();
  }

  /** the weather's mood carried through the hour: afternoon, sundown, night (the moods multiply with the time of day, not replace it) */
  private moodAt(day: Mood, night: Mood): Mood {
    const hr = this.hour;
    if (hr <= 0) return day;
    if (hr >= 1) return night;
    const dusk = duskOf(day);
    return hr < SUNDOWN ? mixMood(day, dusk, smooth(0, SUNDOWN, hr)) : mixMood(dusk, night, smooth(SUNDOWN, 1, hr));
  }

  private applyMood(): void {
    const day = this.atmo.current;
    const night = nightOf(day);
    const m = this.moodAt(day, night);
    // how far into the night it is: the moonlit colours fade and the stars come out once the sun is down
    const h = smooth(SUNDOWN, 1, this.hour);
    const key = this.keyLight(day, night);
    this.sun.color.copy(key.color);
    this.sun.intensity = key.intensity;
    if (this.snap) {
      const cx = this.snap.w / 2;
      const cz = this.snap.h / 2;
      this.sun.position.set(cx + key.dir.x * 60, key.dir.y * 60, cz + key.dir.z * 60);
      this.sun.target.position.set(cx, 0, cz);
      this.sun.target.updateMatrixWorld();
    }
    this.hemi.color.setHex(m.hemiSky);
    this.hemi.groundColor.setHex(m.hemiGround);
    // with the sky's light in the environment map the hemisphere light only carries the weather's tint; the map is scaled by how
    // bright the weather's sky is against a calm day's
    const skyLum = (hex: number): number => {
      const c = new THREE.Color(hex);
      return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    };
    this.hemi.intensity = m.hemiIntensity * (this.envRT ? 0.45 : 1);
    this.scene.environmentIntensity = 0.42 * (m.hemiIntensity / 1.12) * (skyLum(m.hemiSky) / skyLum(0xc4dcf4));
    this.fill.intensity = m.fillIntensity;
    this.renderer.toneMappingExposure = m.exposure;
    // three.js mixes fog in after a material's own tone mapping and colour encoding, so drawn straight the haze shows the colour's
    // linear values as screen values. Through the chain (one tone curve at the end) the colour is converted so it looks the same
    this.fog.color.setHex(m.fog);
    if (this.postActive()) preCompensate(this.fog.color.convertSRGBToLinear(), m.exposure);
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    (u.uTop.value as THREE.Color).setHex(m.skyTop);
    (u.uHorizon.value as THREE.Color).setHex(m.skyHorizon);
    (u.uBottom.value as THREE.Color).setHex(m.fog).multiplyScalar(0.92);
    this.clouds?.setMood(m);
    u.uCloud.value = m.cloud;
    (u.uCloudCol.value as THREE.Color).setHex(m.cloudColor);
    u.uNight.value = h;
    if (this.water) {
      this.water.setTint(new THREE.Color(m.waterTint, m.waterTint, m.waterTint), MOON_GREY * h);
      this.water.setRain(this.reduced() ? 0 : m.rain);
      this.water.setLight(this.sun.position.clone().sub(this.sun.target.position).normalize(), this.sun.color.clone().multiplyScalar(Math.min(1, this.sun.intensity / 3)), new THREE.Color(m.skyTop));
    }
    if (this.ctx) {
      this.ctx.weather.wind = m.wind;
      this.ctx.weather.rain = m.rain;
    }
    for (const l of this.layers) (l as Layer & { setWeatherGlow?: (k: number) => void }).setWeatherGlow?.(m.windows);
    // the lamps are lit as the sun goes down and put out at dawn (in a dark storm by day only the windows glow, as before)
    this.home.setStrength(LAMPS * smooth(0.2, 0.8, this.hour), MOON_GREY * h);
  }

  private configureLight(snap: SceneSnapshot): void {
    const cx = snap.w / 2;
    const cz = snap.h / 2;
    const dir = this.sunDir;
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
    // ground that burned out tonight turns to ash now, not only when the village is next built
    if (changes.fire && prev) {
      const ash: [number, number][] = [];
      for (let i = 0; i < snap.burned.length; i++) if (snap.burned[i] && !prev.burned[i]) ash.push([i % snap.w, Math.floor(i / snap.w)]);
      this.terrainMesh?.surface.burn(ash);
    }
    this.syncForecastOverlay();
    this.applyForecast(snap, this.opts.reducedMotion);
    for (const l of this.layers) l.update(snap, changes, this.ctx);
    // a home whose people are gone goes dark; a fire lit tonight lights the ground round it (and what was built since takes the light)
    this.home.set(snap);
    attachHomeLight(this.scene, this.home.uniforms);
  }

  private reduced(): boolean {
    return this.opts.reducedMotion;
  }

  // ------------------------------------------------------------------------------------------------------ frame

  /** everything a frame does except drawing it: the camera, the weather, the water, every layer's animation */
  private simulate(dt: number): void {
    this.time += dt;
    (this.sky.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;
    this.cam.update(dt);
    if (this.ctx) this.ctx.viewDistance = this.cam.distance;
    const moodMoved = this.atmo.update(dt);
    let hourMoved = false;
    if (this.hour !== this.hourGoal) {
      const step = dt / NIGHT_SECONDS;
      this.hour = this.hourGoal > this.hour ? Math.min(this.hourGoal, this.hour + step) : Math.max(this.hourGoal, this.hour - step);
      hourMoved = true;
    }
    if (moodMoved || hourMoved) this.applyMood();
    this.rain?.update(this.time, this.reduced() ? 0 : this.atmo.current.rain, this.atmo.current.wind);
    this.clouds?.tick(this.reduced() ? 0 : this.time);
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

  /** capture hook: stop (or restart) the live loop's drawing; advance() and renderNow() still draw */
  setFrozen(on: boolean): void {
    this.frozen = on;
    this.last = performance.now();
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
    this.syncPostSize();
  }

  private draw(): void {
    if (this.contextLost) return;
    // haze is for depth, not for washing the village out: a camera that has to stand far back (a tall phone screen) gets less of it, and
    // high contrast keeps only a trace of it
    this.fog.density = this.atmo.current.fogDensity * Math.min(1, Math.max(0.3, 40 / this.cam.distance)) * (this.opts.highContrast ? CONTRAST_FOG : 1);
    try {
      const t0 = performance.now();
      this.renderer.info.reset();
      displayUniforms.uDisplayComp.value = this.postActive() ? 1 : 0;
      displayUniforms.uPostExposure.value = this.renderer.toneMappingExposure;
      if (this.post && !this.postOff) {
        // the ink is for the village and what is near it; it fades out over the far clouds and islands
        const d = this.cam.distance;
        this.post.render(this.scene, this.cam.camera, { inkFadeStart: d * 1.3 + 6, inkFadeEnd: d * 2.6 + 14, dprScale: this.renderer.getPixelRatio() });
      } else {
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.cam.camera);
      }
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

  /** where a person's name tag goes on screen now (above them), or null when they are not drawn or not in view */
  nameAnchor(id: string): { x: number; y: number } | null {
    const people = this.layers.find((l) => l instanceof PeopleLayer) as PeopleLayer | undefined;
    const p = people?.labelPoint(id);
    if (!p) return null;
    const v = p.project(this.cam.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02) return null;
    return { x: ((v.x + 1) / 2) * this.W, y: ((1 - v.y) / 2) * this.H };
  }

  /** where the middle of a tile is on screen now, on its ground (the palette measurements sample water and land with it) */
  tileScreen(x: number, y: number): { x: number; y: number } | null {
    if (!this.ctx) return null;
    const v = new THREE.Vector3(x + 0.5, this.ctx.heightAt(x + 0.5, y + 0.5), y + 0.5).project(this.cam.camera);
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
    return { x: ((v.x + 1) / 2) * this.W, y: ((1 - v.y) / 2) * this.H };
  }

  /** where a region's name tag goes on screen now (over the middle of its ground), or null when that is out of view */
  regionAnchor(id: string): { x: number; y: number } | null {
    const r = this.snap?.regions.find((q) => q.id === id);
    if (!r || !this.ctx) return null;
    let a = 0;
    let cx = 0;
    let cz = 0;
    for (const [x0, y0, x1, y1] of r.rects) {
      const n = (x1 - x0 + 1) * (y1 - y0 + 1);
      a += n;
      cx += ((x0 + x1 + 1) / 2) * n;
      cz += ((y0 + y1 + 1) / 2) * n;
    }
    if (!a) return null;
    const x = cx / a;
    const z = cz / a;
    const v = new THREE.Vector3(x, this.ctx.heightAt(x, z) + 0.35, z).project(this.cam.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02) return null;
    return { x: ((v.x + 1) / 2) * this.W, y: ((1 - v.y) / 2) * this.H };
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

  tileAt(sx: number, sy: number): { x: number; y: number } | null {
    if (!this.terrainMesh || !this.snap) return null;
    this.ray.setFromCamera(new THREE.Vector2((sx / this.W) * 2 - 1, -((sy / this.H) * 2 - 1)), this.cam.camera);
    const hit = this.ray.intersectObject(this.terrainMesh.ground, false)[0];
    if (!hit) return null;
    const t = worldToTile(hit.point.x, hit.point.z);
    return t.x >= 0 && t.y >= 0 && t.x < this.snap.w && t.y < this.snap.h ? t : null;
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
    // people win over the buildings they stand beside; among people, the one whose body is nearest the tap (not the one whose invisible
    // volume happens to be in front), so a crowd on one tile can be told apart
    let landmark: HitResult | null = null;
    let person: { id: string; d: number } | null = null;
    for (const h of hits) {
      const e = h.object.userData.entity as { kind: 'villager' | 'landmark'; id: string } | undefined;
      if (!e) continue;
      if (e.kind === 'villager') {
        const p = this.entityScreen('villager', e.id);
        const d = p ? Math.hypot(p.x - sx, p.y - sy) : 1e9;
        if (!person || d < person.d) person = { id: e.id, d };
      } else if (!landmark) landmark = { kind: 'landmark', id: e.id };
    }
    if (person) return { kind: 'villager', id: person.id };
    if (landmark) return landmark;
    // a miss that lands close to a small figure still means that figure (fingers are wider than avatars)
    const reach = this.W < 700 || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ? 28 : 14;
    let near: { id: string; d: number } | null = null;
    for (const o of objs) {
      const e = o.userData.entity as { kind: 'villager' | 'landmark'; id: string } | undefined;
      if (!e || e.kind !== 'villager') continue;
      const p = this.entityScreen('villager', e.id);
      if (!p) continue;
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < reach && (!near || d < near.d)) near = { id: e.id, d };
    }
    return near ? { kind: 'villager', id: near.id } : null;
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

  /** dots of the evacuation route currently drawn (a hook for tests) */
  routeLength(): number {
    for (const l of this.layers) {
      const f = (l as Layer & { routeLength?: () => number }).routeLength;
      if (f) return f.call(l);
    }
    return 0;
  }

  noteBell(): void {
    for (const l of this.layers) (l as Layer & { noteBell?: () => void }).noteBell?.();
  }

  /** what of a Generative Reality run the world is drawing now (hens, stones, raised bank): read by tests, never by the game */
  realityInfo(): RealityDrawn & { airborne: number } {
    const layer = this.layers.find((l) => l instanceof RealityLayer) as RealityLayer | undefined;
    return layer ? layer.info() : { coops: 0, hens: 0, strays: 0, stones: 0, placed: 0, bank: 0, airborne: 0 };
  }

  /** the wolves, burning tiles (and the buildings among them), smoky tiles and ash the world is drawing now: read by tests, never by the game */
  hazardInfo(): { wolves: number; packMarks: number; fireTiles: number; smokeTiles: number; puffs: number; burning: string[]; ashTiles: number } {
    const layer = this.layers.find((l) => l instanceof HazardsLayer) as HazardsLayer | undefined;
    const ashTiles = this.terrainMesh?.surface.ashTiles() ?? 0;
    return layer ? { ...layer.hazardCounts(), burning: layer.burningBuildings(), ashTiles } : { wolves: 0, packMarks: 0, fireTiles: 0, smokeTiles: 0, puffs: 0, burning: [], ashTiles };
  }

  /** the trust ties the social lens is drawing now: read by tests, never by the game */
  lensInfo(): { ties: number } {
    return { ties: this.effects?.lensCount() ?? 0 };
  }

  stats(): { fps: number; effects: number; zoom: number } {
    let effects = 0;
    for (const l of this.layers) effects += (l as Layer & { effectCount?: () => number }).effectCount?.() ?? 0;
    return { fps: this.fps, effects, zoom: this.cam.zoomLevel };
  }

  /** draw-call and memory figures for the developer quality monitor and the performance record (calls and triangles: every pass of the last frame) */
  info(): { calls: number; triangles: number; geometries: number; textures: number; fps: number; tier: Quality; frames: number; scale: number; drawMs: number; software: boolean; buildMs: number; post: PostProfile | null; env: boolean } {
    const i = this.renderer.info;
    return {
      calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, fps: this.fps, tier: this.quality, frames: this.frameCount, scale: this.scale,
      drawMs: Math.round(this.drawMs * 10) / 10, software: this.software, buildMs: Math.round(this.buildMs), post: this.post && !this.postOff ? { ...this.post.settings } : null, env: !!this.envRT,
    };
  }

  /**
   * Debug and screenshot hook: switch parts of the finishing chain. `enabled: false` draws straight to the screen (the look before the
   * chain); the other fields override the tier's own settings until the next quality change. `null` restores everything.
   */
  setPost(o: (Partial<PostProfile> & Partial<PostLook> & { enabled?: boolean }) | null): void {
    if (!this.post) return;
    if (o === null) {
      this.postOff = false;
      this.post.setQuality(this.quality);
      this.syncPostSize();
    } else {
      if (o.enabled !== undefined) this.postOff = !o.enabled;
      const p = this.post.settings;
      if (o.ao !== undefined || o.bloom !== undefined || o.fxaa !== undefined) this.post.setProfile({ ao: o.ao ?? p.ao, bloom: o.bloom ?? p.bloom, fxaa: o.fxaa ?? p.fxaa });
      for (const k of ['ink', 'inkColor', 'aoStrength', 'bloomStrength'] as const) if (o[k] !== undefined) this.post.look[k] = o[k] as number;
    }
    this.applyMood();
    this.draw();
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

  /**
   * Performance record: draw `frames` frames back to back (each one a sixtieth of a second of animation), waiting for each to finish
   * on the graphics side (a one-pixel read), and return the frame times. Unlike the live loop this is not paced, so it measures what a
   * frame costs here. The page is given a breath every few frames.
   */
  async benchmark(frames = 60): Promise<{ frames: number; medianMs: number; p99Ms: number; medianFps: number; low1Fps: number; calls: number; triangles: number }> {
    const gl = this.renderer.getContext();
    const px = new Uint8Array(4);
    const times: number[] = [];
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      this.simulate(1 / 60);
      this.draw();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - t0);
      if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
    }
    const s = [...times].sort((a, b) => a - b);
    const med = s[Math.floor(s.length / 2)];
    const p99 = s[Math.min(s.length - 1, Math.floor(s.length * 0.99))];
    const i = this.renderer.info.render;
    const r1 = (v: number): number => Math.round(v * 10) / 10;
    return { frames, medianMs: r1(med), p99Ms: r1(p99), medianFps: r1(1000 / med), low1Fps: r1(1000 / p99), calls: i.calls, triangles: i.triangles };
  }

  /** render one frame now, regardless of the loop, and wait for the GPU: used by screenshot capture */
  renderNow(): void {
    this.cam.update(0.016);
    this.draw();
  }
}
