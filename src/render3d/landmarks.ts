import * as THREE from 'three';
import { buildCabin, buildChapel, buildGranary, buildHall, buildHome, buildRuin, type Built } from './buildings.ts';
import { buildBeacon, buildBellTower, buildBridge, bridgeSpecOf, buildCampfire, buildMarket, buildMill, buildPen, buildShelter, buildWell } from './civic.ts';
import type { Layer, WorldContext } from './context.ts';
import { mergeByMaterial, type Part } from './geom.ts';
import type { MaterialLib } from './materials.ts';
import { Particles } from './particles.ts';
import { seedFrom } from './rand.ts';
import type { SceneChanges, SceneLandmark, SceneSnapshot } from './snapshot.ts';
import { TERRAIN } from './terrain.ts';

interface View {
  id: string;
  kind: string;
  root: THREE.Group;
  meshes: THREE.Mesh[];
  extras: Map<string, THREE.Group>;
  flame?: THREE.Group;
  light?: THREE.PointLight;
  smokeAt: THREE.Vector3[];
  proxy: THREE.Mesh;
  lit: boolean;
  hp: number;
  built: boolean;
  /** bridge states */
  bridge?: { standing: THREE.Group; ruins: THREE.Group; trim: THREE.Group; cracks: THREE.Group };
  swing: number;
  occupied: boolean;
  wheelSpeed: number;
}

const MAX_LIGHTS = 4;
/** buildings are drawn a little larger than a tile's worth, so doors and windows read next to people */
const BUILD_SCALE: Record<string, number> = { home: 1.2, cabin: 1.2, granary: 1.15, hall: 1.1, chapel: 1.15, mill: 1.1, market: 1.1, belltower: 1.1 };
const cOrange = new THREE.Color(0xffa040);
const cYellow = new THREE.Color(0xffe08a);
const cRed = new THREE.Color(0xd2481f);
const cSmoke = new THREE.Color(0xcfcac0);
const cSmokeEnd = new THREE.Color(0x9a9a98);

export class LandmarksLayer implements Layer {
  readonly group = new THREE.Group();
  private views = new Map<string, View>();
  private lib: MaterialLib;
  private smoke: Particles;
  private fire: Particles;
  private lights: THREE.PointLight[] = [];
  private proxyList: THREE.Object3D[] = [];
  private emitAcc = 0;
  private waterLevel = 0;
  private glowTarget = 0;

  constructor(ctx: WorldContext) {
    this.lib = ctx.materials;
    this.group.name = 'landmarks';
    this.smoke = new Particles(ctx.profile.detail > 0.5 ? 260 : 120, false);
    this.fire = new Particles(ctx.profile.detail > 0.5 ? 300 : 140, true);
    this.group.add(this.smoke.points, this.fire.points);
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffa04a, 0, 3.4, 2);
      l.visible = false;
      this.lights.push(l);
      this.group.add(l);
    }
  }

  get materials(): MaterialLib {
    return this.lib;
  }

  private mat(key: string): THREE.Material {
    const at = key.indexOf('@');
    return at < 0 ? this.lib.get(key) : this.lib.get(key.slice(0, at), Number.parseInt(key.slice(at + 1), 16));
  }

  private meshesFor(parts: Part[], parent: THREE.Object3D, view?: View): void {
    for (const [key, geo] of mergeByMaterial(parts)) {
      const m = new THREE.Mesh(geo, this.mat(key));
      const glass = key.startsWith('glass') || key.startsWith('cloth');
      m.castShadow = !key.startsWith('glass');
      m.receiveShadow = !glass;
      m.name = key;
      parent.add(m);
      view?.meshes.push(m);
    }
  }

  private builderFor(l: SceneLandmark, ctx: WorldContext): Built | null {
    const r = ctx.rng(`lm:${l.id}`);
    const burned = l.hp <= 0;
    if (l.kind === 'rubble' || (burned && ['home', 'cabin', 'granary', 'hall', 'chapel', 'mill', 'market'].includes(l.kind))) return buildRuin(r, true);
    switch (l.kind) {
      case 'home': {
        const v = seedFrom(l.id) % 5;
        return buildHome(v, r);
      }
      case 'cabin':
        return buildCabin(r);
      case 'granary':
        return buildGranary(r);
      case 'hall':
        return buildHall(r);
      case 'chapel':
        return buildChapel(r);
      case 'belltower':
        return buildBellTower(r);
      case 'mill':
        return buildMill(r);
      case 'market':
        return buildMarket(r);
      case 'shelter':
        return buildShelter(r);
      case 'well':
        return buildWell(r);
      case 'pen':
        return buildPen(r);
      case 'campfire':
        return buildCampfire(r);
      case 'beacon':
        return buildBeacon(r);
      default:
        return null;
    }
  }

  /** which way a building faces: its door toward the nearest road, snapped to a quarter turn with a little hand-set drift */
  private facing(l: SceneLandmark, snap: SceneSnapshot, ctx: WorldContext): number {
    const { w, h } = snap;
    let best: [number, number] | null = null;
    let bd = 1e9;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (snap.terrain[y * w + x] !== TERRAIN.ROAD) continue;
        const d = Math.hypot(x - l.x, y - l.y);
        if (d < bd) {
          bd = d;
          best = [x, y];
        }
      }
    }
    const drift = (ctx.rng(`face:${l.id}`)() - 0.5) * 0.14;
    if (!best || bd > 9) return drift;
    const ang = Math.atan2(best[0] - l.x, best[1] - l.y);
    return Math.round(ang / (Math.PI / 2)) * (Math.PI / 2) + drift;
  }

  private riverDirection(l: SceneLandmark, snap: SceneSnapshot): number {
    const { w, h } = snap;
    let best: [number, number] = [l.x + 1, l.y];
    let bd = 1e9;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (snap.terrain[y * w + x] !== TERRAIN.RIVER) continue;
        const d = Math.hypot(x - l.x, y - l.y);
        if (d < bd) {
          bd = d;
          best = [x, y];
        }
      }
    }
    const ang = Math.atan2(-(best[1] - l.y), best[0] - l.x);
    return Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
  }

  private build(l: SceneLandmark, snap: SceneSnapshot, ctx: WorldContext): View | null {
    const root = new THREE.Group();
    root.name = `lm:${l.id}`;
    const view: View = {
      id: l.id, kind: l.kind, root, meshes: [], extras: new Map(), smokeAt: [], proxy: new THREE.Mesh(), lit: false, hp: l.hp, built: true, swing: 0, occupied: true, wheelSpeed: 0,
    };
    if (l.kind === 'bridge') return this.buildBridgeView(l, snap, ctx, view);
    const built = this.builderFor(l, ctx);
    if (!built) return null;
    const cx = l.x + 0.5;
    const cz = l.y + 0.5;
    const y = ctx.heightAt(cx, cz);
    root.position.set(cx, y, cz);
    const ry = l.kind === 'mill' ? this.riverDirection(l, snap) : ['belltower', 'beacon', 'campfire', 'well', 'shelter', 'pen'].includes(l.kind) ? (ctx.rng(`face:${l.id}`)() - 0.5) * 1.2 : this.facing(l, snap, ctx);
    root.rotation.y = ry;
    root.scale.setScalar(BUILD_SCALE[l.kind] ?? 1);
    this.meshesFor(built.parts, root, view);
    for (const ex of built.extras ?? []) {
      const g = new THREE.Group();
      g.position.set(...ex.pivot);
      this.meshesFor(ex.parts, g, view);
      root.add(g);
      view.extras.set(ex.name, g);
    }
    for (const s of built.smoke ?? []) view.smokeAt.push(new THREE.Vector3(s[0], s[1], s[2]));
    // the invisible hit volume: generous, so a finger finds it
    const R = Math.max(0.45, built.radius);
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Math.max(0.5, built.height), 10), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.y = Math.max(0.5, built.height) / 2;
    proxy.userData.entity = { kind: 'landmark', id: l.id };
    root.add(proxy);
    view.proxy = proxy;
    if (l.kind === 'beacon' || l.kind === 'campfire') this.addFlame(view, l.kind === 'beacon' ? 0.44 : 0.04, l.kind === 'beacon' ? 1 : 0.8);
    return view;
  }

  private addFlame(view: View, y: number, scale: number): void {
    const g = new THREE.Group();
    g.position.y = y;
    const mk = (r: number, h: number, c: number, o: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.y = h / 2;
      return m;
    };
    g.add(mk(0.11 * scale, 0.32 * scale, 0xff7a1a, 0.55), mk(0.075 * scale, 0.26 * scale, 0xffb23a, 0.7), mk(0.04 * scale, 0.18 * scale, 0xfff0b0, 0.9));
    g.visible = false;
    view.root.add(g);
    view.flame = g;
  }

  private buildBridgeView(l: SceneLandmark, _snap: SceneSnapshot, ctx: WorldContext, view: View): View {
    const spec = bridgeSpecOf(l.tiles, ctx);
    const { x0, x1, row } = spec;
    const cz = row + 0.5;
    const b = buildBridge(spec);
    const mk = (parts: Part[], name: string): THREE.Group => {
      const g = new THREE.Group();
      g.name = name;
      this.meshesFor(parts, g, view);
      view.root.add(g);
      return g;
    };
    const standing = mk(b.standing, 'standing');
    const ruins = mk(b.ruins, 'ruins');
    const trim = mk(b.trim, 'trim');
    const cracks = new THREE.Group();
    // cracks and loose stones on a damaged bridge: dark slashes across the deck and a few blocks on the parapet
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1814, roughness: 1 });
    const rr = ctx.rng(`cracks:${l.id}`);
    for (let i = 0; i < 9; i++) {
      const cx = x0 - 0.2 + rr() * (x1 - x0 + 1.6);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16 + rr() * 0.1, 0.012, 0.015), dark);
      const tt = (cx - (x0 - 0.6)) / (x1 + 1.6 - (x0 - 0.6));
      m.position.set(cx, spec.y0 + (spec.y1 - spec.y0) * tt + Math.sin(tt * Math.PI) * (Math.max(spec.y0, spec.y1) + 0.34 - Math.max(spec.y0, spec.y1)) + 0.005, cz + (rr() - 0.5) * 0.4);
      m.rotation.y = (rr() - 0.5) * 1.2;
      cracks.add(m);
      view.meshes.push(m);
    }
    cracks.visible = false;
    view.root.add(cracks);
    view.bridge = { standing, ruins, trim, cracks };
    ruins.visible = false;
    trim.visible = false;
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 3.4, 0.8, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.set((x0 + x1 + 1) / 2, Math.max(spec.y0, spec.y1) + 0.3, cz);
    proxy.userData.entity = { kind: 'landmark', id: l.id };
    view.root.add(proxy);
    view.proxy = proxy;
    return view;
  }

  private dispose1(v: View): void {
    this.group.remove(v.root);
    for (const m of v.meshes) m.geometry.dispose();
    v.proxy.geometry.dispose();
    (v.proxy.material as THREE.Material).dispose();
    v.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.own) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    if (v.flame) {
      v.flame.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
  }

  update(snap: SceneSnapshot, changes: SceneChanges, ctx: WorldContext): void {
    this.waterLevel = snap.level;
    if (changes.rebuild) {
      for (const v of this.views.values()) this.dispose1(v);
      this.views.clear();
      for (const l of snap.landmarks) this.addView(l, snap, ctx);
    } else {
      for (const id of changes.landmarks) {
        const l = snap.landmarks.find((x) => x.id === id);
        const old = this.views.get(id);
        if (!l) {
          if (old) {
            this.dispose1(old);
            this.views.delete(id);
          }
          continue;
        }
        // a building that fell or changed kind is rebuilt; anything else only changes how it is lit
        if (old && (old.kind !== l.kind || (old.hp > 0) !== (l.hp > 0)) && l.kind !== 'bridge') {
          this.dispose1(old);
          this.views.delete(id);
          this.addView(l, snap, ctx);
        } else if (!old) this.addView(l, snap, ctx);
      }
    }
    const occupied = new Set(snap.villagers.filter((v) => v.status !== 'dead').map((v) => v.homeId));
    for (const l of snap.landmarks) {
      const v = this.views.get(l.id);
      if (!v) continue;
      v.occupied = occupied.has(l.id);
      this.applyDynamic(v, l, ctx);
    }
    this.proxyList = [...this.views.values()].map((v) => v.proxy);
  }

  private addView(l: SceneLandmark, snap: SceneSnapshot, ctx: WorldContext): void {
    const v = this.build(l, snap, ctx);
    if (!v) return;
    this.views.set(l.id, v);
    this.group.add(v.root);
  }

  private applyDynamic(v: View, l: SceneLandmark, _ctx: WorldContext): void {
    v.hp = l.hp;
    if (v.kind === 'beacon' || v.kind === 'campfire') {
      v.lit = l.lit;
      if (v.flame) v.flame.visible = l.lit;
    }
    if (v.kind === 'belltower' && (l.data.ringing ?? 0) > 0 && v.swing < 0.05) v.swing = 1;
    if (v.bridge) {
      const ratio = l.maxHp > 0 ? l.hp / l.maxHp : 1;
      const down = l.hp <= 0;
      v.bridge.standing.visible = !down;
      v.bridge.ruins.visible = down;
      v.bridge.cracks.visible = !down && ratio < 0.65;
      v.bridge.trim.visible = !down && (l.data.watchers ?? 0) > 0;
      // a damaged bridge sags a little: the whole span settles
      v.bridge.standing.rotation.x = !down && ratio < 0.4 ? 0.012 : 0;
      v.bridge.standing.position.y = !down && ratio < 0.65 ? -0.02 * (1 - ratio) : 0;
    }
  }

  setWeatherGlow(k: number): void {
    this.glowTarget = k;
  }

  /** the bell was rung by the player: swing it now, whatever the engine's flag says about tonight */
  ring(): void {
    for (const v of this.views.values()) if (v.kind === 'belltower') v.swing = 1;
  }

  tick(dt: number, time: number, ctx: WorldContext): void {
    const reduced = ctx.reducedMotion;
    this.emitAcc += dt;
    let lit = 0;
    for (const v of this.views.values()) {
      // the bell swings and settles
      const bell = v.extras.get('bell');
      if (bell) {
        v.swing = Math.max(0, v.swing - dt * 0.22);
        bell.rotation.z = Math.sin(time * 5.5) * 0.5 * v.swing * (reduced ? 0.4 : 1);
      }
      const wheel = v.extras.get('wheel');
      if (wheel && !reduced) wheel.rotation.z -= dt * (0.5 + this.waterLevel * 0.28);
      if (v.flame && v.lit) {
        const f = 0.9 + 0.18 * Math.sin(time * 11 + v.root.position.x) + 0.1 * Math.sin(time * 17.3 + v.root.position.z);
        v.flame.scale.set(1 + 0.08 * Math.sin(time * 9), f, 1 + 0.08 * Math.cos(time * 8));
        v.flame.rotation.y = time * 1.7;
        if (lit < MAX_LIGHTS) {
          const L = this.lights[lit++];
          L.visible = true;
          L.position.set(v.root.position.x, v.root.position.y + (v.kind === 'beacon' ? 0.7 : 0.4), v.root.position.z);
          L.intensity = (v.kind === 'beacon' ? 2.6 : 1.8) * (0.85 + 0.15 * Math.sin(time * 13 + lit));
        }
      }
    }
    for (let i = lit; i < MAX_LIGHTS; i++) {
      this.lights[i].visible = false;
      this.lights[i].intensity = 0;
    }
    // particles: chimney smoke from houses people are in, smoke and sparks from lit fires
    const step = ctx.profile.detail > 0.5 ? 0.16 : 0.32;
    if (!reduced && this.emitAcc >= step) {
      this.emitAcc = 0;
      for (const v of this.views.values()) {
        const p = v.root.position;
        const ry = v.root.rotation.y;
        if (v.hp > 0 && v.occupied) {
          for (const s of v.smokeAt) {
            const wx = p.x + Math.cos(ry) * s.x + Math.sin(ry) * s.z;
            const wz = p.z - Math.sin(ry) * s.x + Math.cos(ry) * s.z;
            if (Math.random() < 0.45) this.smoke.emit(wx, p.y + s.y, wz, 0.02 + Math.random() * 0.02, 0.1, 0.01, 3.2, 0.06, 0.22, cSmoke, cSmokeEnd, 0.4, 0.2, 0.01);
          }
        }
        if (v.lit) {
          const base = p.y + (v.kind === 'beacon' ? 0.5 : 0.1);
          this.smoke.emit(p.x + (Math.random() - 0.5) * 0.05, base + 0.25, p.z, 0.03, 0.2, 0.02, 2.6, 0.08, 0.3, new THREE.Color(0x6e6a62), cSmokeEnd, 0.5, 0.3, 0.02);
          for (let k = 0; k < 2; k++) this.fire.emit(p.x + (Math.random() - 0.5) * 0.08, base + 0.1, p.z + (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, 0.18 + Math.random() * 0.12, (Math.random() - 0.5) * 0.08, 0.9, 0.05, 0.01, cYellow, cRed, 0.8, 0.5, 0.05);
          if (Math.random() < 0.3) this.fire.emit(p.x, base + 0.15, p.z, (Math.random() - 0.5) * 0.25, 0.35, (Math.random() - 0.5) * 0.25, 1.4, 0.025, 0.01, cOrange, cRed, 0.9, 0.2, 0.1);
        }
      }
    }
    this.smoke.update(dt);
    this.fire.update(dt);
    // windows glow as the weather darkens
    this.lib.setWindowGlow(this.glowTarget);
  }

  pickables(): THREE.Object3D[] {
    return this.proxyList;
  }

  locate(kind: 'villager' | 'landmark', id: string): THREE.Vector3 | null {
    if (kind !== 'landmark') return null;
    const v = this.views.get(id);
    if (!v) return null;
    return v.proxy.getWorldPosition(new THREE.Vector3());
  }

  /** world position of the top of a building, for effects that rise from it */
  top(id: string): THREE.Vector3 | null {
    const v = this.views.get(id);
    if (!v) return null;
    return v.proxy.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.4, 0));
  }

  noteBell(): void {
    this.ring();
  }

  effectCount(): number {
    return this.smoke.count + this.fire.count;
  }

  dispose(): void {
    for (const v of this.views.values()) this.dispose1(v);
    this.views.clear();
    this.smoke.dispose();
    this.fire.dispose();
    for (const l of this.lights) l.dispose();
  }
}

