import * as THREE from 'three';
import { bridgeSpecOf, deckHeight, type BridgeSpec } from './civic.ts';
import type { Layer, WorldContext } from './context.ts';
import { engineToWorld } from './coords.ts';
import { seedFrom } from './rand.ts';
import type { SceneChanges, SceneSnapshot, SceneVillager } from './snapshot.ts';

/**
 * The villagers: one small hand-built person each, with a costume that follows their role, their faction's colour and their own
 * `look` from the engine, so Ivo the storyteller is always Ivo. Each is a few primitive limbs on pivots, animated by procedural
 * walk, work, watch and flight cycles. Where a person stands is the engine's answer; where they walk from and to follows the
 * engine's own passable tiles (the river blocks unless the bridge stands), and the walk only ever connects two places the
 * simulation put them. Nothing here decides anything.
 */
const SKIN = [0xf1c9a5, 0xe0ac85, 0xc68a62, 0x8d5a3c];
const HAIR = [0x2b1d14, 0x6b4226, 0xb5783a, 0xd8c9a8, 0x9a9a9a];
const PANTS = [0x4a3c2e, 0x3a4252, 0x5a4a3a, 0x3c3a36];

interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  held: THREE.Group;
  scale: number;
  child: boolean;
}

interface Walker {
  v: SceneVillager;
  rig: Rig;
  pos: THREE.Vector3;
  path: THREE.Vector3[];
  /** where the engine put them last */
  tile: { x: number; y: number };
  slot: THREE.Vector2;
  heading: number;
  phase: number;
  speed: number;
  gesture: { kind: string; until: number } | null;
  look: THREE.Vector3 | null;
  lookUntil: number;
  marker: THREE.Mesh | null;
  proxy: THREE.Mesh;
  /** 0 standing, 1 fully fled (hands up, hunched) */
  alarm: number;
  dead: boolean;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<number, THREE.MeshStandardMaterial>();
const geo = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
};
const mat = (hex: number, rough = 0.85): THREE.MeshStandardMaterial => {
  const key = hex * 8 + Math.round(rough * 7);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough });
    matCache.set(key, m);
  }
  return m;
};

let lanternMat: THREE.MeshStandardMaterial | null = null;
const lanternGlass = (): THREE.MeshStandardMaterial => {
  lanternMat ??= new THREE.MeshStandardMaterial({ color: 0xffd98f, emissive: 0xffb84d, emissiveIntensity: 1.8 });
  return lanternMat;
};

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = false;
  return o;
};

function garment(v: SceneVillager): number {
  const c = new THREE.Color();
  // the person's own hue, pulled towards their faction's colour so a faction reads at a distance
  c.setHSL(v.look.hue / 360, 0.42, 0.44);
  const f = new THREE.Color(v.factionColor);
  c.lerp(f, 0.35);
  return c.getHex();
}

const ROLE_LOOK: Record<string, { hat: 'straw' | 'cap' | 'hood' | 'flat' | 'scarf' | 'none' | 'tall' | 'beanie'; held?: 'lantern' | 'staff' | 'crook' | 'bell' | 'basket' | 'satchel' | 'axe' | 'sack' | 'notebook'; extra?: 'apron' | 'cape' | 'beard' | 'chain' }> = {
  farmer: { hat: 'straw', held: 'sack' },
  farmhand: { hat: 'straw' },
  miller: { hat: 'cap', extra: 'apron', held: 'sack' },
  bridgekeeper: { hat: 'cap', held: 'lantern' },
  'bell-keeper': { hat: 'hood', held: 'bell' },
  warden: { hat: 'hood', held: 'lantern' },
  'well-warden': { hat: 'cap', held: 'lantern' },
  storyteller: { hat: 'tall', extra: 'cape', held: 'notebook' },
  elder: { hat: 'none', extra: 'beard', held: 'staff' },
  trader: { hat: 'flat', held: 'satchel' },
  'grain trader': { hat: 'flat', held: 'satchel' },
  shepherd: { hat: 'straw', held: 'crook' },
  herder: { hat: 'straw', held: 'crook' },
  reeve: { hat: 'flat', extra: 'chain', held: 'notebook' },
  mother: { hat: 'scarf', held: 'basket' },
  healer: { hat: 'hood', held: 'satchel' },
  physician: { hat: 'cap', held: 'satchel' },
  woodcutter: { hat: 'beanie', held: 'axe' },
  hunter: { hat: 'hood', held: 'staff' },
  hermit: { hat: 'hood', extra: 'beard', held: 'staff' },
  orphan: { hat: 'scarf' },
  child: { hat: 'none' },
};

export function buildRig(v: SceneVillager): Rig {
  const child = v.archetype === 'child' || v.role.toLowerCase() === 'child' || v.look.build === 0;
  const S = child ? 0.76 : 1;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = mat(SKIN[v.look.skin % SKIN.length], 0.7);
  const cloth = mat(garment(v), 0.9);
  const pants = mat(PANTS[(seedFrom(v.id) >>> 3) % PANTS.length], 0.9);
  const hairC = mat(HAIR[v.look.hair % HAIR.length], 0.8);
  const role = ROLE_LOOK[v.role.toLowerCase()] ?? { hat: 'none' as const };
  const faction = mat(new THREE.Color(v.factionColor).getHex(), 0.8);

  // legs, pivoted at the hip
  const mkLeg = (x: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, 0.16, 0);
    g.add(mesh(geo('leg', () => new THREE.CapsuleGeometry(0.028, 0.1, 3, 6)), pants, 0, -0.075, 0));
    g.add(mesh(geo('foot', () => new THREE.BoxGeometry(0.05, 0.03, 0.08)), mat(0x2b2118), 0, -0.145, 0.015));
    return g;
  };
  const legL = mkLeg(-0.034);
  const legR = mkLeg(0.034);
  body.add(legL, legR);
  // torso
  const torso = mesh(geo('torso', () => new THREE.CapsuleGeometry(0.07, 0.1, 3, 8)), cloth, 0, 0.255, 0);
  torso.scale.set(1, 1, 0.82);
  body.add(torso);
  // a faction sash, so the colours of the four groups read at a glance
  const sash = mesh(geo('sash', () => new THREE.TorusGeometry(0.07, 0.012, 5, 12)), faction, 0, 0.215, 0);
  sash.rotation.x = Math.PI / 2;
  sash.scale.set(1, 0.85, 1);
  body.add(sash);
  // arms
  const mkArm = (x: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, 0.3, 0);
    g.add(mesh(geo('arm', () => new THREE.CapsuleGeometry(0.021, 0.09, 3, 6)), cloth, 0, -0.06, 0));
    g.add(mesh(geo('hand', () => new THREE.SphereGeometry(0.02, 6, 5)), skin, 0, -0.125, 0));
    return g;
  };
  const armL = mkArm(-0.095);
  const armR = mkArm(0.095);
  body.add(armL, armR);
  // head: a big round head reads better from above
  const head = new THREE.Group();
  head.position.set(0, 0.385, 0);
  head.add(mesh(geo('head', () => new THREE.SphereGeometry(0.072, 12, 9)), skin, 0, 0, 0));
  for (const x of [-0.026, 0.026]) head.add(mesh(geo('eye', () => new THREE.SphereGeometry(0.0085, 5, 4)), mat(0x1a1612), x, 0.006, 0.066));
  head.add(mesh(geo('nose', () => new THREE.SphereGeometry(0.011, 5, 4)), skin, 0, -0.008, 0.073));
  // hair: a cap of hair over the top and back
  const hairStyle = (v.look.hat + v.look.hair + (seedFrom(v.id) % 3)) % 3;
  head.add(mesh(geo(`hair${hairStyle}`, () => new THREE.SphereGeometry(0.078, 10, 7, 0, Math.PI * 2, 0, hairStyle === 0 ? Math.PI * 0.46 : Math.PI * 0.58)), hairC, 0, 0.008, -0.004));
  if (hairStyle === 2) head.add(mesh(geo('bun', () => new THREE.SphereGeometry(0.03, 7, 5)), hairC, 0, 0.065, -0.05));
  if (role.extra === 'beard') head.add(mesh(geo('beard', () => new THREE.SphereGeometry(0.055, 8, 6, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6)), mat(0xe8e4dc), 0, -0.035, 0.03));
  // hats
  switch (role.hat) {
    case 'straw':
      head.add(mesh(geo('brim', () => new THREE.CylinderGeometry(0.135, 0.135, 0.008, 14)), mat(0xd8b75a, 1), 0, 0.045, 0));
      head.add(mesh(geo('dome', () => new THREE.SphereGeometry(0.075, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5)), mat(0xd8b75a, 1), 0, 0.045, 0));
      break;
    case 'cap':
      head.add(mesh(geo('capD', () => new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45)), mat(garment({ ...v, look: { ...v.look, hue: v.look.hue + 40 } })), 0, 0.02, 0));
      head.add(mesh(geo('capB', () => new THREE.BoxGeometry(0.1, 0.01, 0.05)), mat(0x3a2f26), 0, 0.034, 0.075));
      break;
    case 'flat':
      head.add(mesh(geo('flat', () => new THREE.CylinderGeometry(0.085, 0.09, 0.035, 12)), mat(0x4a3a30), 0, 0.058, 0));
      break;
    case 'tall':
      head.add(mesh(geo('tall', () => new THREE.CylinderGeometry(0.05, 0.07, 0.11, 10)), mat(0x3b2f52), 0, 0.1, 0));
      head.add(mesh(geo('tallB', () => new THREE.CylinderGeometry(0.1, 0.1, 0.008, 12)), mat(0x3b2f52), 0, 0.048, 0));
      {
        const f = mesh(geo('feather', () => new THREE.ConeGeometry(0.008, 0.12, 4)), mat(0xe05a4a), 0.045, 0.15, 0);
        f.rotation.z = -0.5;
        head.add(f);
      }
      break;
    case 'hood':
      head.add(mesh(geo('hood', () => new THREE.SphereGeometry(0.088, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62)), mat(garment({ ...v, look: { ...v.look, hue: v.look.hue + 20 } }), 1), 0, 0.005, -0.012));
      break;
    case 'scarf':
      head.add(mesh(geo('scarf', () => new THREE.SphereGeometry(0.082, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55)), mat(new THREE.Color(v.factionColor).getHex(), 0.9), 0, 0.01, -0.01));
      break;
    case 'beanie':
      head.add(mesh(geo('beanie', () => new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.46)), mat(0x8a3b2e), 0, 0.02, 0));
      break;
    default:
      break;
  }
  body.add(head);
  // apron, cape, chain
  if (role.extra === 'apron') body.add(mesh(geo('apron', () => new THREE.BoxGeometry(0.1, 0.13, 0.012)), mat(0xf1ede0), 0, 0.2, 0.062));
  if (role.extra === 'cape') {
    const cape = mesh(geo('cape', () => new THREE.BoxGeometry(0.15, 0.22, 0.012)), mat(0x5a2f4a, 0.9), 0, 0.22, -0.07);
    cape.rotation.x = 0.1;
    body.add(cape);
  }
  if (role.extra === 'chain') {
    const chain = mesh(geo('chain', () => new THREE.TorusGeometry(0.05, 0.006, 4, 12)), mat(0xe0b84a, 0.4), 0, 0.31, 0.03);
    chain.rotation.x = Math.PI / 2.4;
    body.add(chain);
  }
  // what they carry
  const held = new THREE.Group();
  held.position.set(0.0, -0.125, 0);
  armR.add(held);
  switch (role.held) {
    case 'lantern':
      held.add(mesh(geo('lanB', () => new THREE.BoxGeometry(0.035, 0.045, 0.035)), mat(0x2c2f34), 0, -0.03, 0.02));
      held.add(mesh(geo('lanG', () => new THREE.BoxGeometry(0.028, 0.034, 0.028)), lanternGlass(), 0, -0.03, 0.02));
      break;
    case 'staff':
    case 'crook':
      held.add(mesh(geo('staff', () => new THREE.CylinderGeometry(0.008, 0.01, 0.42, 5)), mat(0x6a4a30), 0, 0.04, 0.012));
      if (role.held === 'crook') held.add(mesh(geo('crook', () => new THREE.TorusGeometry(0.03, 0.007, 4, 8, Math.PI)), mat(0x6a4a30), 0.025, 0.25, 0.012));
      break;
    case 'bell':
      held.add(mesh(geo('handbell', () => new THREE.ConeGeometry(0.03, 0.05, 8)), mat(0xc4a24a, 0.4), 0, -0.04, 0.02));
      break;
    case 'basket':
      held.add(mesh(geo('basket', () => new THREE.CylinderGeometry(0.035, 0.028, 0.035, 8)), mat(0x9a7a4a), 0, -0.03, 0.02));
      break;
    case 'satchel':
      body.add(mesh(geo('satchel', () => new THREE.BoxGeometry(0.07, 0.06, 0.03)), mat(0x7a5a3a), -0.07, 0.19, 0.05));
      break;
    case 'axe':
      held.add(mesh(geo('axeH', () => new THREE.CylinderGeometry(0.008, 0.008, 0.2, 5)), mat(0x6a4a30), 0, -0.02, 0.01));
      held.add(mesh(geo('axeB', () => new THREE.BoxGeometry(0.06, 0.04, 0.008)), mat(0x9aa0a8, 0.5), 0.03, 0.06, 0.01));
      break;
    case 'sack':
      body.add(mesh(geo('backsack', () => new THREE.SphereGeometry(0.05, 7, 5)), mat(0xc9b58a), 0, 0.26, -0.075));
      break;
    case 'notebook':
      held.add(mesh(geo('book', () => new THREE.BoxGeometry(0.04, 0.006, 0.055)), mat(0x6b3a2a), 0, -0.02, 0.025));
      break;
    default:
      break;
  }
  root.scale.setScalar(S * 1.05);
  return { root, body, torso, head, armL, armR, legL, legR, held, scale: S, child };
}

export class PeopleLayer implements Layer {
  readonly group = new THREE.Group();
  private walkers = new Map<string, Walker>();
  private ctx: WorldContext;
  private bridge: BridgeSpec | null = null;
  private bridgeStanding = true;
  private proxyList: THREE.Object3D[] = [];
  private ring: THREE.Mesh;
  private ringHover: THREE.Mesh;
  private beliefRings = new Map<string, THREE.Mesh>();
  private selection: { kind: string; id: string } | null = null;
  private hover: { kind: string; id: string } | null = null;
  private activeClaim: string | null = null;
  private known = new Set<string>();
  private hints = new Set<string>();
  private time = 0;
  private graves = new THREE.Group();
  private celebrating = false;

  constructor(ctx: WorldContext) {
    this.ctx = ctx;
    this.group.name = 'people';
    this.group.add(this.graves);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 8;
    this.ring.visible = false;
    this.ringHover = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.21, 24), new THREE.MeshBasicMaterial({ color: 0xf0d58a, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
    this.ringHover.rotation.x = -Math.PI / 2;
    this.ringHover.renderOrder = 8;
    this.ringHover.visible = false;
    this.group.add(this.ring, this.ringHover);
  }

  setOptions(o: { selection: { kind: string; id: string } | null; activeClaim: string | null; known: Set<string>; hints: string[] }): void {
    this.selection = o.selection;
    this.activeClaim = o.activeClaim;
    this.known = o.known;
    this.hints = new Set(o.hints);
  }

  setHover(h: { kind: string; id: string } | null): void {
    this.hover = h;
  }

  /** the ground height people stand on: terrain, or the bridge deck while they are on it */
  private walkY(x: number, z: number): number {
    const b = this.bridge;
    if (b && this.bridgeStanding && z > b.row + 0.2 && z < b.row + 0.8 && x > b.x0 - 0.5 && x < b.x1 + 1.5) return Math.max(this.ctx.heightAt(x, z), deckHeight(b, x));
    return this.ctx.heightAt(x, z);
  }

  /** a walk from one tile to another over the engine's passable tiles, as smooth waypoints (empty if there is no way) */
  private route(from: { x: number; y: number }, to: { x: number; y: number }, snap: SceneSnapshot): THREE.Vector3[] {
    const { w, h } = snap;
    const ok = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && snap.passable[y * w + x] === 1;
    const sx = Math.round(from.x);
    const sy = Math.round(from.y);
    const tx = Math.round(to.x);
    const ty = Math.round(to.y);
    if (sx === tx && sy === ty) return [];
    const prev = new Int16Array(w * h).fill(-2);
    const q: number[] = [sy * w + sx];
    prev[sy * w + sx] = -1;
    let found = false;
    for (let i = 0; i < q.length && !found; i++) {
      const cur = q[i];
      const cx = cur % w;
      const cy = (cur - cx) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!ok(nx, ny) && !(nx === tx && ny === ty)) continue;
        // no cutting a corner through a blocked tile
        if (dx !== 0 && dy !== 0 && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue;
        const ni = ny * w + nx;
        if (prev[ni] !== -2) continue;
        prev[ni] = cur;
        q.push(ni);
        if (nx === tx && ny === ty) {
          found = true;
          break;
        }
      }
    }
    if (!found) return [];
    const tiles: [number, number][] = [];
    for (let c = ty * w + tx; c >= 0; c = prev[c]) tiles.push([c % w, (c - (c % w)) / w]);
    tiles.reverse();
    const pts: THREE.Vector3[] = [];
    for (const [x, y] of tiles) {
      const p = engineToWorld(x, y);
      pts.push(new THREE.Vector3(p.x, 0, p.z));
    }
    // a gentle smoothing so people do not turn at right angles
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[i];
      const c = pts[Math.min(pts.length - 1, i + 1)];
      out.push(new THREE.Vector3((a.x + b.x * 2 + c.x) / 4, 0, (a.z + b.z * 2 + c.z) / 4));
    }
    return out;
  }

  /** where on the tile this person stands: crowds spread on a small ring, always in the same order */
  private slots(snap: SceneSnapshot): Map<string, THREE.Vector2> {
    const by = new Map<string, SceneVillager[]>();
    for (const v of snap.villagers) {
      const k = `${Math.round(v.x)},${Math.round(v.y)}`;
      const arr = by.get(k) ?? [];
      arr.push(v);
      by.set(k, arr);
    }
    const out = new Map<string, THREE.Vector2>();
    for (const arr of by.values()) {
      arr.sort((a, b) => (a.id < b.id ? -1 : 1));
      arr.forEach((v, i) => {
        if (arr.length === 1) out.set(v.id, new THREE.Vector2(0, 0.06));
        else {
          const a = (i / arr.length) * Math.PI * 2 + 0.6;
          out.set(v.id, new THREE.Vector2(Math.cos(a) * 0.24, Math.sin(a) * 0.2));
        }
      });
    }
    return out;
  }

  update(snap: SceneSnapshot, changes: SceneChanges, ctx: WorldContext): void {
    const bridge = snap.landmarks.find((l) => l.kind === 'bridge');
    this.bridge = bridge ? bridgeSpecOf(bridge.tiles, ctx) : null;
    this.bridgeStanding = !!bridge && bridge.hp > 0;
    this.celebrating = snap.outcome === 'victory';
    if (changes.rebuild) this.clear();
    const slots = this.slots(snap);
    const live = new Set<string>();
    for (const v of snap.villagers) {
      live.add(v.id);
      let wk = this.walkers.get(v.id);
      const slot = slots.get(v.id) ?? new THREE.Vector2();
      if (!wk) {
        wk = this.spawn(v, slot, ctx);
        this.walkers.set(v.id, wk);
      } else {
        const moved = Math.round(v.x) !== wk.tile.x || Math.round(v.y) !== wk.tile.y;
        wk.v = v;
        wk.slot.copy(slot);
        if (moved && v.status !== 'dead') {
          const from = { x: wk.pos.x - 0.5, y: wk.pos.z - 0.5 };
          const route = this.route({ x: Math.round(from.x), y: Math.round(from.y) }, { x: v.x, y: v.y }, snap);
          const center = engineToWorld(v.x, v.y);
          if (ctx.reducedMotion) {
            wk.path = [];
            wk.pos.set(center.x + slot.x, 0, center.z + slot.y);
          } else {
            wk.path = route;
            if (route.length) route.push(new THREE.Vector3(center.x + slot.x, 0, center.z + slot.y));
            else wk.path = [new THREE.Vector3(center.x + slot.x, 0, center.z + slot.y)];
          }
        }
        wk.tile = { x: Math.round(v.x), y: Math.round(v.y) };
        if (v.status === 'dead' && !wk.dead) this.bury(wk);
        if (v.status !== 'dead' && wk.dead) this.revive(wk);
      }
    }
    for (const [id, wk] of this.walkers) {
      if (!live.has(id)) {
        this.group.remove(wk.rig.root);
        this.walkers.delete(id);
      }
    }
    this.proxyList = [...this.walkers.values()].map((w) => w.proxy);
  }

  private clear(): void {
    for (const wk of this.walkers.values()) {
      this.group.remove(wk.rig.root);
      wk.proxy.geometry.dispose();
      (wk.proxy.material as THREE.Material).dispose();
    }
    this.walkers.clear();
    for (const m of this.beliefRings.values()) {
      this.group.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.beliefRings.clear();
    while (this.graves.children.length) {
      const g = this.graves.children[0];
      this.graves.remove(g);
    }
  }

  private spawn(v: SceneVillager, slot: THREE.Vector2, ctx: WorldContext): Walker {
    const rig = buildRig(v);
    const c = engineToWorld(v.x, v.y);
    const pos = new THREE.Vector3(c.x + slot.x, 0, c.z + slot.y);
    rig.root.position.set(pos.x, this.walkY(pos.x, pos.z), pos.z);
    this.group.add(rig.root);
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.62, 8), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.y = 0.3;
    proxy.userData.entity = { kind: 'villager', id: v.id };
    rig.root.add(proxy);
    const wk: Walker = {
      v, rig, pos, path: [], tile: { x: Math.round(v.x), y: Math.round(v.y) }, slot: slot.clone(), heading: ((seedFrom(v.id) % 628) / 100) - 3.14, phase: (seedFrom(v.id) % 100) / 16,
      speed: 0.75 + (seedFrom(v.id, 'sp') % 40) / 100, gesture: null, look: null, lookUntil: 0, marker: null, proxy, alarm: 0, dead: false,
    };
    rig.root.rotation.y = wk.heading;
    if (v.status === 'dead') this.bury(wk);
    void ctx;
    return wk;
  }

  /** a villager who died is not drawn lying there: a small stone marks the place, and the story says the rest */
  private bury(wk: Walker): void {
    wk.dead = true;
    wk.rig.root.visible = false;
    if (!wk.marker) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.04), new THREE.MeshStandardMaterial({ color: 0xa9a699, roughness: 1 }));
      m.position.set(wk.pos.x, this.walkY(wk.pos.x, wk.pos.z) + 0.08, wk.pos.z);
      m.castShadow = true;
      this.graves.add(m);
      wk.marker = m;
    }
    wk.proxy.userData.entity = { kind: 'villager', id: wk.v.id };
  }

  private revive(wk: Walker): void {
    wk.dead = false;
    wk.rig.root.visible = true;
    if (wk.marker) {
      this.graves.remove(wk.marker);
      wk.marker = null;
    }
  }

  /** a small, readable gesture driven by a real event: "talk", "point", "alarm", "cheer" */
  gesture(id: string, kind: string, seconds = 1.6): void {
    const wk = this.walkers.get(id);
    if (wk && !wk.dead) wk.gesture = { kind, until: this.time + seconds };
  }

  /** turn to face a point for a while: the listener turning to the friend who told them */
  faceToward(id: string, x: number, z: number, seconds = 1.5): void {
    const wk = this.walkers.get(id);
    if (!wk || wk.dead) return;
    wk.look = new THREE.Vector3(x, 0, z);
    wk.lookUntil = this.time + seconds;
  }

  position(id: string): THREE.Vector3 | null {
    const wk = this.walkers.get(id);
    return wk ? wk.rig.root.position.clone() : null;
  }

  isMoving(id: string): boolean {
    const wk = this.walkers.get(id);
    return !!wk && wk.path.length > 0;
  }

  tick(dt: number, time: number, ctx: WorldContext): void {
    this.time = time;
    const reduced = ctx.reducedMotion;
    for (const wk of this.walkers.values()) {
      if (wk.dead) continue;
      const root = wk.rig.root;
      const v = wk.v;
      // ---- movement along the route
      let moving = false;
      if (wk.path.length) {
        const next = wk.path[0];
        const dx = next.x - wk.pos.x;
        const dz = next.z - wk.pos.z;
        const d = Math.hypot(dx, dz);
        const urgent = v.duty === 'evacuate' || v.duty === 'hide' || v.duty === 'trapped';
        const sp = (urgent ? 1.9 : 1.1) * wk.speed * (v.status === 'injured' || v.status === 'sick' ? 0.7 : 1);
        const step = sp * dt;
        if (d <= step) {
          wk.pos.x = next.x;
          wk.pos.z = next.z;
          wk.path.shift();
        } else {
          wk.pos.x += (dx / d) * step;
          wk.pos.z += (dz / d) * step;
        }
        if (d > 0.02) {
          const want = Math.atan2(dx, dz);
          wk.heading += angleDiff(want, wk.heading) * Math.min(1, dt * 9);
        }
        moving = true;
      } else {
        // standing: turn to face whoever they are looking at, or the thing their duty is about
        let faceAt: THREE.Vector3 | null = time < wk.lookUntil ? wk.look : null;
        if (!faceAt && v.duty === 'watch' && this.bridge) faceAt = new THREE.Vector3(this.bridge.x0 + 1.5, 0, this.bridge.row + 0.5);
        if (faceAt) {
          const want = Math.atan2(faceAt.x - wk.pos.x, faceAt.z - wk.pos.z);
          wk.heading += angleDiff(want, wk.heading) * Math.min(1, dt * 6);
        }
      }
      root.position.set(wk.pos.x, this.walkY(wk.pos.x, wk.pos.z), wk.pos.z);
      root.rotation.y = wk.heading;
      // ---- pose
      const r = wk.rig;
      const urgent = v.duty === 'evacuate' || v.duty === 'hide' || v.duty === 'trapped';
      wk.alarm += ((urgent || (wk.gesture?.kind === 'alarm' && time < wk.gesture.until) ? 1 : 0) - wk.alarm) * Math.min(1, dt * 3);
      const gait = moving ? (urgent ? 13 : 8.5) * wk.speed : 0;
      wk.phase += dt * (moving ? gait : 1.6);
      const swing = moving ? Math.sin(wk.phase) * (urgent ? 0.95 : 0.6) : 0;
      r.legL.rotation.x = swing;
      r.legR.rotation.x = -swing;
      r.armL.rotation.x = -swing * 0.9;
      r.armR.rotation.x = swing * 0.9;
      r.armL.rotation.z = 0.08;
      r.armR.rotation.z = -0.08;
      const bob = moving ? Math.abs(Math.sin(wk.phase)) * 0.018 : Math.sin(wk.phase * 0.8) * 0.004;
      r.body.position.y = bob;
      r.body.rotation.x = moving ? (urgent ? 0.18 : 0.06) : 0;
      r.torso.scale.y = 1 + (moving ? 0 : Math.sin(wk.phase * 0.8) * 0.02);
      r.head.rotation.y = !moving && !reduced ? Math.sin(time * 0.7 + wk.phase) * 0.35 : 0;
      r.head.rotation.x = 0;
      // ---- what the person is doing, by the engine's own duty
      if (!moving) {
        if (v.duty === 'work') {
          // tending: bend and swing an arm
          const w = Math.sin(time * 3.2 + wk.phase);
          r.body.rotation.x = 0.28 + w * 0.08;
          r.armR.rotation.x = -0.9 + w * 0.7;
          r.armL.rotation.x = -0.5 - w * 0.5;
          r.head.rotation.x = 0.15;
        } else if (v.duty === 'watch') {
          r.head.rotation.y = Math.sin(time * 0.9 + wk.phase) * 0.6;
          r.armR.rotation.x = -0.5;
          r.armR.rotation.z = -0.2;
        } else if (v.duty === 'guard') {
          r.armR.rotation.x = -0.1;
        } else if (v.duty === 'messenger') {
          r.armR.rotation.x = -1.2;
        } else if (v.duty === 'shelter' || v.duty === 'rest') {
          r.body.rotation.x = 0.04;
          r.armL.rotation.x = -0.15;
        }
      }
      if (v.duty === 'trapped' || wk.alarm > 0.5) {
        const wave = Math.sin(time * 9 + wk.phase);
        r.armL.rotation.x = -2.6 + wave * 0.3;
        r.armR.rotation.x = -2.6 - wave * 0.3;
        r.armL.rotation.z = 0.35;
        r.armR.rotation.z = -0.35;
      }
      if (v.status === 'injured' || v.status === 'sick') {
        r.body.rotation.x += 0.18;
        r.head.rotation.x = 0.2;
      }
      if (this.celebrating && !reduced) {
        const hop = Math.abs(Math.sin(time * 5 + wk.phase));
        r.body.position.y += hop * 0.04;
        r.armL.rotation.x = -2.6;
        r.armR.rotation.x = -2.6;
      }
      const g = wk.gesture;
      if (g && time < g.until) {
        const k = Math.sin(((g.until - time) * 7));
        if (g.kind === 'talk') {
          r.armR.rotation.x = -0.9 + k * 0.4;
          r.head.rotation.x = 0.1 + Math.abs(k) * 0.1;
        } else if (g.kind === 'point') {
          r.armR.rotation.x = -1.5;
          r.armR.rotation.z = -0.15;
        } else if (g.kind === 'cheer') {
          r.armL.rotation.x = -2.8 + k * 0.2;
          r.armR.rotation.x = -2.8 - k * 0.2;
          r.body.position.y += Math.abs(k) * 0.03;
        } else if (g.kind === 'think') {
          r.armR.rotation.x = -1.9;
          r.head.rotation.x = 0.2;
        }
      } else if (g) wk.gesture = null;
    }
    this.updateRings(time);
  }

  private updateRings(time: number): void {
    const sel = this.selection?.kind === 'villager' ? this.walkers.get(this.selection.id) : null;
    this.ring.visible = !!sel && !sel.dead;
    if (sel && !sel.dead) {
      this.ring.position.set(sel.pos.x, this.walkY(sel.pos.x, sel.pos.z) + 0.02, sel.pos.z);
      const s = 1 + Math.sin(time * 4) * 0.05;
      this.ring.scale.set(s, s, s);
    }
    const hv = this.hover?.kind === 'villager' ? this.walkers.get(this.hover.id) : null;
    this.ringHover.visible = !!hv && !hv.dead && hv !== sel;
    if (hv && !hv.dead) this.ringHover.position.set(hv.pos.x, this.walkY(hv.pos.x, hv.pos.z) + 0.02, hv.pos.z);
    // belief rings for the active story: gold when they believe, red when they reject, grey when not yet scouted
    for (const wk of this.walkers.values()) {
      let m = this.beliefRings.get(wk.v.id);
      const conv = this.activeClaim ? wk.v.conv[this.activeClaim] : undefined;
      const hint = this.hints.has(wk.v.id);
      if ((conv === undefined && !hint) || wk.dead) {
        if (m) m.visible = false;
        continue;
      }
      if (!m) {
        m = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.18, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2;
        m.renderOrder = 7;
        this.group.add(m);
        this.beliefRings.set(wk.v.id, m);
      }
      m.visible = true;
      m.position.set(wk.pos.x, this.walkY(wk.pos.x, wk.pos.z) + 0.015, wk.pos.z);
      const known = this.known.has(wk.v.id);
      const mm = m.material as THREE.MeshBasicMaterial;
      if (hint) {
        mm.color.set(0xf2b84b);
        const p = 1 + Math.sin(time * 5) * 0.12;
        m.scale.set(p * 1.2, p * 1.2, p * 1.2);
        mm.opacity = 0.95;
      } else if (conv !== undefined) {
        m.scale.set(1, 1, 1);
        if (!known) {
          mm.color.set(0xaab6c6);
          mm.opacity = 0.45;
        } else if (conv > 0) {
          mm.color.set(0xf2b84b);
          mm.opacity = 0.35 + Math.min(0.65, conv / 90);
        } else if (conv < 0) {
          mm.color.set(0xe5586a);
          mm.opacity = 0.85;
        } else {
          mm.color.set(0x96aabe);
          mm.opacity = 0.5;
        }
      }
    }
  }

  pickables(): THREE.Object3D[] {
    return this.proxyList;
  }

  locate(kind: 'villager' | 'landmark', id: string): THREE.Vector3 | null {
    if (kind !== 'villager') return null;
    const wk = this.walkers.get(id);
    if (!wk) return null;
    return new THREE.Vector3(wk.pos.x, this.walkY(wk.pos.x, wk.pos.z) + 0.34, wk.pos.z);
  }

  headPosition(id: string): THREE.Vector3 | null {
    const p = this.locate('villager', id);
    return p ? p.add(new THREE.Vector3(0, 0.12, 0)) : null;
  }

  effectCount(): number {
    return 0;
  }

  dispose(): void {
    this.clear();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.ringHover.geometry.dispose();
    (this.ringHover.material as THREE.Material).dispose();
    for (const g of geoCache.values()) g.dispose();
    geoCache.clear();
    for (const m of matCache.values()) m.dispose();
    matCache.clear();
    lanternMat?.dispose();
    lanternMat = null;
  }
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
