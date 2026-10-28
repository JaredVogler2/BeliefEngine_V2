import * as THREE from 'three';
import type { Layer, WorldContext } from './context.ts';
import { mergeByMaterial } from './geom.ts';
import { add, cyl, fence, type Parts } from './kit.ts';
import { fbm, makeNoise, type Rng } from './rand.ts';
import type { SceneChanges, SceneSnapshot } from './snapshot.ts';
import { TERRAIN } from './terrain.ts';
import { makeTree, type TreeKind } from './trees.ts';
import { markGround } from './post.ts';
import { PROP_RADIUS, YARD_PROPS, propFacing, yardProp } from './props.ts';

/**
 * The living ground: forests and orchards, shrubs, tufts of grass, wildflowers, rocks, reeds along the water, fenced fields with
 * planted rows that ripen as the engine's crop growth does, hay and fence runs. Everything is instanced, placed from the scenario
 * seed (so the same village is always planted the same way), kept off roads, buildings, water and fields, and swayed by one shared
 * wind in the vertex shader.
 */
const wind = { value: 0 };

function sway(mat: THREE.MeshStandardMaterial, amp: number, heightBase = 0): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
       #else
         float ph = 0.0;
       #endif
       float bend = max(0.0, position.y - ${heightBase.toFixed(3)});
       transformed.x += sin(uWind * 1.5 + ph) * ${amp.toFixed(4)} * bend * bend * 4.0;
       transformed.z += cos(uWind * 1.1 + ph * 1.3) * ${amp.toFixed(4)} * 0.7 * bend * bend * 4.0;`,
    );
  };
  // the function's text is the same for every amplitude, so name the program by its numbers or three.js would share one between them
  mat.customProgramCacheKey = () => `sway:${amp}:${heightBase}`;
}

interface Inst {
  x: number;
  y: number;
  z: number;
  s: number;
  ry: number;
  color: THREE.Color;
  sy?: number;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Inst[], cast: boolean, receive = true): THREE.InstancedMesh | null {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  items.forEach((it, i) => {
    e.set((it.ry * 7.3) % 0.1 - 0.05, it.ry, (it.ry * 3.1) % 0.1 - 0.05);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.s, it.s * (it.sy ?? 1), it.s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, it.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.frustumCulled = false;
  return mesh;
}

const KIND_CLEARANCE: Record<string, number> = {
  home: 0.8, cabin: 0.75, hall: 1.2, chapel: 0.95, mill: 1.0, market: 1.15, shelter: 1.25, granary: 0.8, belltower: 0.8, well: 0.5, pen: 1.0, campfire: 0.55, beacon: 0.55,
};

function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 0.7;
    const h = 0.075 + (b % 3) * 0.03;
    const w = 0.012;
    const lean = 0.03 + (b % 2) * 0.02;
    const cx = Math.cos(a) * 0.014;
    const cz = Math.sin(a) * 0.014;
    const tx = cx + Math.cos(a) * lean;
    const tz = cz + Math.sin(a) * lean;
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, tx, h, tz);
    col.push(0.18, 0.32, 0.1, 0.18, 0.32, 0.1, 0.55, 0.78, 0.32);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function plantGeometry(): THREE.BufferGeometry {
  // a stalk of grain: a thin green stem with an ear on top, three of them leaning together
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    const stem = new THREE.ConeGeometry(0.008, 0.3, 4, 1);
    stem.translate(0, 0.15, 0);
    stem.rotateZ(Math.cos(a) * 0.12);
    stem.rotateX(Math.sin(a) * 0.12);
    stem.translate(Math.cos(a) * 0.018, 0, Math.sin(a) * 0.018);
    const sp = stem.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(sp.count * 3);
    for (let k = 0; k < sp.count; k++) {
      const t = sp.getY(k) / 0.3;
      col[k * 3] = 0.3 + 0.35 * t;
      col[k * 3 + 1] = 0.55 + 0.25 * t;
      col[k * 3 + 2] = 0.2 + 0.1 * t;
    }
    stem.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(stem);
    const ear = new THREE.ConeGeometry(0.014, 0.06, 4, 1);
    ear.translate(Math.cos(a) * 0.018 + Math.cos(a) * 0.036, 0.3, Math.sin(a) * 0.018 + Math.sin(a) * 0.036);
    const ep = ear.getAttribute('position') as THREE.BufferAttribute;
    const ecol = new Float32Array(ep.count * 3);
    for (let k = 0; k < ep.count; k++) {
      ecol[k * 3] = 0.95;
      ecol[k * 3 + 1] = 0.85;
      ecol[k * 3 + 2] = 0.45;
    }
    ear.setAttribute('color', new THREE.BufferAttribute(ecol, 3));
    parts.push(ear);
  }
  const merged = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(n.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color') n.deleteAttribute(name);
    return n;
  });
  return mergeGeom(merged);
}

function mergeGeom(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  for (const g of list) total += g.getAttribute('position').count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const c = g.getAttribute('color');
    for (let i = 0; i < p.count; i++, o++) {
      pos.set([p.getX(i), p.getY(i), p.getZ(i)], o * 3);
      if (n) nor.set([n.getX(i), n.getY(i), n.getZ(i)], o * 3);
      if (c) col.set([c.getX(i), c.getY(i), c.getZ(i)], o * 3);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

function rockGeometry(r: Rng): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = makeNoise(Math.floor(r() * 1e6));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.75 + n(x * 2.2, z * 2.2 + y) * 0.55;
    p.setXYZ(i, x * k, Math.max(-0.1, y * k * 0.7), z * k);
  }
  g.computeVertexNormals();
  return g;
}

export class FoliageLayer implements Layer {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private cropMesh: THREE.InstancedMesh | null = null;
  private cropTiles: { fieldId: string; items: { x: number; z: number; base: number }[]; first: number }[] = [];
  private cropColors = { young: new THREE.Color(0x6fae3a), ripe: new THREE.Color(0xe9c95a), dead: new THREE.Color(0x2c2a26) };
  private fixed = new THREE.Group();
  private props: THREE.Mesh[] = [];

  constructor(ctx: WorldContext) {
    this.group.name = 'foliage';
    this.group.add(this.fixed);
    void ctx;
  }

  private addMesh(m: THREE.InstancedMesh | null): void {
    if (!m) return;
    this.meshes.push(m);
    this.fixed.add(m);
  }

  update(snap: SceneSnapshot, changes: SceneChanges, ctx: WorldContext): void {
    if (changes.rebuild) {
      this.clear();
      this.build(snap, ctx);
    }
    this.updateCrops(snap, ctx);
  }

  private clear(): void {
    for (const m of this.meshes) {
      this.fixed.remove(m);
      m.dispose();
    }
    this.meshes = [];
    for (const m of this.props) this.fixed.remove(m);
    this.props = [];
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.geos = [];
    this.mats = [];
    this.cropMesh = null;
    this.cropTiles = [];
  }

  private build(snap: SceneSnapshot, ctx: WorldContext): void {
    const { w, h } = snap;
    const r = ctx.rng('foliage');
    const noise = makeNoise(ctx.seed ^ 0x2545f491);
    const { terrain } = ctx;
    const detail = ctx.profile.detail;
    const treesMul = ctx.profile.trees;
    // ---- where things may stand: a fine grid of blocked cells
    const G = 4;
    const gw = w * G;
    const gh = h * G;
    const blocked = new Uint8Array(gw * gh);
    const mark = (cx: number, cz: number, rad: number, v = 1): void => {
      for (let j = Math.max(0, Math.floor((cz - rad) * G)); j <= Math.min(gh - 1, Math.ceil((cz + rad) * G)); j++) {
        for (let i = Math.max(0, Math.floor((cx - rad) * G)); i <= Math.min(gw - 1, Math.ceil((cx + rad) * G)); i++) {
          if (Math.hypot((i + 0.5) / G - cx, (j + 0.5) / G - cz) <= rad) blocked[j * gw + i] = Math.max(blocked[j * gw + i], v);
        }
      }
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = snap.terrain[y * w + x];
        if (t === TERRAIN.RIVER) mark(x + 0.5, y + 0.5, 0.95, 2);
        else if (t === TERRAIN.ROAD) mark(x + 0.5, y + 0.5, 0.62, 1);
      }
    }
    for (const l of snap.landmarks) {
      const rad = KIND_CLEARANCE[l.kind];
      if (rad) mark(l.x + 0.5, l.y + 0.5, rad, 1);
      if (l.kind === 'field') for (const [tx, ty] of l.tiles) mark(tx + 0.5, ty + 0.5, 0.8, 1);
      if (l.kind === 'bridge') for (const [tx, ty] of l.tiles) mark(tx + 0.5, ty + 0.5, 1.2, 1);
    }
    const free = (x: number, z: number): boolean => {
      const i = Math.floor(x * G);
      const j = Math.floor(z * G);
      return i >= 1 && j >= 1 && i < gw - 1 && j < gh - 1 && blocked[j * gw + i] === 0;
    };
    // ---- the clutter of lived-in yards: one or two things at the edge of each home's trodden earth, never in front of the door
    const yardParts: Parts = [];
    for (const l of snap.landmarks) {
      if ((l.kind !== 'home' && l.kind !== 'cabin') || l.hp <= 0) continue;
      const order = [...YARD_PROPS];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const want = r() < 0.55 ? 2 : 1;
      let placed = 0;
      for (const kind of order) {
        if (placed >= want) break;
        const rad = PROP_RADIUS[kind];
        for (let tries = 0; tries < 10; tries++) {
          const a = r() * Math.PI * 2;
          if (Math.sin(a) > 0.7) continue;
          const d = 0.82 + rad + r() * 0.12;
          const x = l.x + 0.5 + Math.cos(a) * d;
          const z = l.y + 0.5 + Math.sin(a) * d;
          if (!free(x, z) || ![0, 1, 2, 3].every((k) => free(x + Math.cos(k * Math.PI * 0.5) * rad, z + Math.sin(k * Math.PI * 0.5) * rad))) continue;
          yardProp(yardParts, kind, x, ctx.heightAt(x, z) - 0.005, z, propFacing(a), r);
          mark(x, z, rad + 0.05, 1);
          placed++;
          break;
        }
      }
    }
    const trees: Record<TreeKind, Inst[]> = { oak: [], pine: [], birch: [], willow: [], apple: [], shrub: [], stump: [], blossom: [], autumn: [], cypress: [] };
    const plant = (kind: TreeKind, x: number, z: number, scale: number): void => {
      const y = ctx.heightAt(x, z) - 0.012;
      trees[kind].push({ x, y, z, s: scale * (0.82 + r() * 0.4), ry: r() * Math.PI * 2, color: new THREE.Color(1 - r() * 0.14, 1 - r() * 0.1, 1 - r() * 0.18) });
    };
    // ---- forests: dense, mixed, shaped by the engine's forest tiles
    const forestMix = (n: number): TreeKind => (n < 0.48 ? 'pine' : n < 0.6 ? 'cypress' : n < 0.86 ? 'oak' : 'birch');
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        if (snap.terrain[ty * w + tx] !== TERRAIN.FOREST) continue;
        const count = Math.round(9 * treesMul);
        for (let k = 0; k < count; k++) {
          const x = tx + 0.08 + r() * 0.84;
          const z = ty + 0.08 + r() * 0.84;
          if (!free(x, z)) continue;
          const mixN = noise(x * 0.35, z * 0.35);
          let kind = forestMix(mixN * 0.7 + r() * 0.3);
          // one broadleaf in a few has turned, in loose drifts rather than blocks
          if (kind === 'oak' && noise(x * 0.5 + 40, z * 0.5) > 0.62 && r() < 0.6) kind = 'autumn';
          plant(kind, x, z, kind === 'pine' ? 1.15 : kind === 'cypress' ? 1.1 : 1.05);
          if (r() < 0.25) {
            const bx = x + (r() - 0.5) * 0.3;
            const bz = z + (r() - 0.5) * 0.3;
            if (free(bx, bz)) plant('shrub', bx, bz, 0.8 + r() * 0.5);
          }
        }
        if (r() < 0.25) {
          const x = tx + 0.2 + r() * 0.6;
          const z = ty + 0.2 + r() * 0.6;
          if (free(x, z)) plant('stump', x, z, 1);
        }
      }
    }
    // ---- hedgerows: broken lines of shrubs along the roadsides, where the road meets open ground
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        if (snap.terrain[ty * w + tx] !== TERRAIN.ROAD) continue;
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
          const ax = tx + nx;
          const az = ty + nz;
          if (ax < 0 || az < 0 || ax >= w || az >= h) continue;
          const nt = snap.terrain[az * w + ax];
          if (nt === TERRAIN.ROAD || nt === TERRAIN.RIVER || nt === TERRAIN.FIELD || nt === TERRAIN.FOREST) continue;
          // a hedge runs along most of a roadside, with gaps where it has been cut back
          if (noise(ax * 0.7 + nx * 3, az * 0.7 + nz * 3) < 0.45) continue;
          for (let k = 0; k < 4; k++) {
            const along = (k + 0.5) / 4 - 0.5 + (r() - 0.5) * 0.08;
            const off = 0.7 + r() * 0.06;
            const x = tx + 0.5 + nx * off + (nz !== 0 ? along : 0);
            const z = ty + 0.5 + nz * off + (nx !== 0 ? along : 0);
            if (free(x, z) && r() < 0.85) plant('shrub', x, z, 0.75 + r() * 0.35);
          }
        }
      }
    }
    // ---- trees and shrubs in the open: groves where the noise is high, willows along the banks, orchards behind houses
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const t = snap.terrain[ty * w + tx];
        if (t === TERRAIN.RIVER || t === TERRAIN.ROAD || t === TERRAIN.FOREST || t === TERRAIN.FIELD) continue;
        const grove = fbm(noise, tx * 0.38 + 5, ty * 0.38 + 5, 3);
        const tries = Math.round(3 * treesMul);
        for (let k = 0; k < tries; k++) {
          const x = tx + r();
          const z = ty + r();
          if (!free(x, z)) continue;
          // here and there a broad tree has turned: warm patches where a second, slower noise is high
          const turned = noise(x * 0.22 + 40, z * 0.22) > 0.76;
          if (grove > 0.58 && r() < (grove - 0.5) * 2.2) plant(r() < 0.55 ? (turned ? 'autumn' : 'oak') : 'birch', x, z, 0.9 + r() * 0.3);
          else if (grove > 0.5 && r() < 0.12) plant('shrub', x, z, 0.8 + r() * 0.6);
          // and a lone tree in open meadow now and then, so no stretch of grass is quite empty
          else if (r() < 0.035) plant(r() < 0.2 ? 'cypress' : turned ? 'autumn' : r() < 0.7 ? 'oak' : 'birch', x, z, 0.85 + r() * 0.3);
        }
        // willows lean over the water
        const wetHere = terrain.wet[Math.min(terrain.nz - 1, Math.floor((ty + 0.5) * 4)) * terrain.nx + Math.min(terrain.nx - 1, Math.floor((tx + 0.5) * 4))];
        if (wetHere > 0.45 && r() < 0.5 * treesMul) {
          const x = tx + 0.2 + r() * 0.6;
          const z = ty + 0.2 + r() * 0.6;
          const gi = Math.floor(x * G);
          const gj = Math.floor(z * G);
          const nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]].some(([dx, dz]) => blocked[Math.min(gh - 1, Math.max(0, gj + dz)) * gw + Math.min(gw - 1, Math.max(0, gi + dx))] === 2);
          if (nb && blocked[gj * gw + gi] === 0) plant('willow', x, z, 1.0 + r() * 0.2);
        }
      }
    }
    for (const l of snap.landmarks) {
      if (l.kind !== 'home' || r() > 0.4) continue;
      for (let k = 0; k < 3; k++) {
        const a = r() * Math.PI * 2;
        const rad = 0.95 + r() * 0.4;
        const x = l.x + 0.5 + Math.cos(a) * rad;
        const z = l.y + 0.5 + Math.sin(a) * rad;
        if (free(x, z)) plant(k === 0 && r() < 0.6 ? 'blossom' : 'apple', x, z, 0.8 + r() * 0.2);
      }
    }
    // a pair of cypresses by some front doors and by the chapel, as in any old village
    for (const l of snap.landmarks) {
      if (!((l.kind === 'home' && r() < 0.3) || l.kind === 'chapel')) continue;
      for (const sx of [-1, 1]) {
        const x = l.x + 0.5 + sx * (0.62 + r() * 0.12);
        const z = l.y + 0.5 + 0.5 + r() * 0.15;
        if (free(x, z)) plant('cypress', x, z, 0.85 + r() * 0.2);
      }
    }
    for (const kind of Object.keys(trees) as TreeKind[]) {
      if (!trees[kind].length) continue;
      const geo = makeTree(kind, r);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: false });
      sway(mat, kind === 'pine' || kind === 'cypress' ? 0.012 : kind === 'willow' ? 0.02 : 0.018, 0.25);
      this.geos.push(geo);
      this.mats.push(mat);
      this.addMesh(instanced(geo, mat, trees[kind], kind !== 'shrub'));
    }

    // ---- grass tufts and flowers across the open ground
    const tufts: Inst[] = [];
    const flowers: Inst[] = [];
    const flowerCols = [0xf4d35e, 0xf0f0f0, 0xe85d75, 0xb48be0, 0xff9a3c];
    const perTile = Math.round(9 * detail);
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const t = snap.terrain[ty * w + tx];
        if (t === TERRAIN.RIVER || t === TERRAIN.ROAD || t === TERRAIN.FIELD || t === TERRAIN.SAND) continue;
        const dense = t === TERRAIN.FOREST ? 0.6 : 1;
        for (let k = 0; k < perTile * dense; k++) {
          const x = tx + r();
          const z = ty + r();
          if (!free(x, z) && r() < 0.8) continue;
          const y = ctx.heightAt(x, z);
          const sl = terrain.slopeAt(x, z);
          if (sl > 0.9) continue;
          const g = 0.75 + r() * 0.5;
          tufts.push({ x, y: y - 0.005, z, s: g, ry: r() * 6.28, color: new THREE.Color(0.85 + r() * 0.3, 0.9 + r() * 0.2, 0.8 + r() * 0.2), sy: 0.8 + r() * 0.8 });
        }
        const fl = fbm(noise, tx * 0.9 + 20, ty * 0.9 + 20, 2);
        if (fl > 0.58 && t !== TERRAIN.FOREST) {
          const cols = flowerCols[Math.floor(r() * flowerCols.length)];
          for (let k = 0; k < Math.round(7 * detail); k++) {
            const x = tx + r();
            const z = ty + r();
            if (!free(x, z)) continue;
            flowers.push({ x, y: ctx.heightAt(x, z) + 0.035, z, s: 0.8 + r() * 0.6, ry: 0, color: new THREE.Color(r() < 0.7 ? cols : flowerCols[Math.floor(r() * flowerCols.length)]) });
          }
        }
      }
    }
    if (tufts.length) {
      const geo = tuftGeometry();
      const mat = markGround(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
      sway(mat, 0.03, 0.0);
      this.geos.push(geo);
      this.mats.push(mat);
      this.addMesh(instanced(geo, mat, tufts, false, false));
    }
    if (flowers.length) {
      const geo = new THREE.SphereGeometry(0.013, 5, 4);
      const mat = markGround(new THREE.MeshStandardMaterial({ roughness: 0.7 }));
      this.geos.push(geo);
      this.mats.push(mat);
      this.addMesh(instanced(geo, mat, flowers, false, false));
    }
    // ---- rocks on rocky ground and along the banks, reeds in the shallows
    const rocks: Inst[] = [];
    const reeds: Inst[] = [];
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const t = snap.terrain[ty * w + tx];
        const wetHere = terrain.wet[Math.min(terrain.nz - 1, Math.floor((ty + 0.5) * 4)) * terrain.nx + Math.min(terrain.nx - 1, Math.floor((tx + 0.5) * 4))];
        const rocky = t === TERRAIN.ROCK || t === TERRAIN.HILL;
        if (rocky && r() < 0.7) {
          const x = tx + r();
          const z = ty + r();
          if (free(x, z)) rocks.push({ x, y: ctx.heightAt(x, z), z, s: 0.06 + r() * 0.1, ry: r() * 6, color: new THREE.Color(0.55 + r() * 0.25, 0.54 + r() * 0.22, 0.5 + r() * 0.2) });
        }
        if (t !== TERRAIN.RIVER && wetHere > 0.5) {
          for (let k = 0; k < Math.round(4 * detail); k++) {
            const x = tx + r();
            const z = ty + r();
            const gi = Math.floor(x * G);
            const gj = Math.floor(z * G);
            if (blocked[gj * gw + gi] === 2) continue;
            const near = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]].some(([dx, dz]) => blocked[Math.min(gh - 1, Math.max(0, gj + dz)) * gw + Math.min(gw - 1, Math.max(0, gi + dx))] === 2);
            if (!near) continue;
            if (r() < 0.45) rocks.push({ x, y: ctx.heightAt(x, z) - 0.01, z, s: 0.04 + r() * 0.07, ry: r() * 6, color: new THREE.Color(0.5 + r() * 0.2, 0.5 + r() * 0.2, 0.46 + r() * 0.2) });
            else for (let q = 0; q < 3; q++) reeds.push({ x: x + (r() - 0.5) * 0.08, y: ctx.heightAt(x, z) - 0.02, z: z + (r() - 0.5) * 0.08, s: 0.8 + r() * 0.7, ry: r() * 6, color: new THREE.Color(0.8 + r() * 0.3, 0.9 + r() * 0.2, 0.6 + r() * 0.3) });
          }
        }
      }
    }
    if (rocks.length) {
      const geo = rockGeometry(r);
      // small stones lie flat on the ground: no ink round each one
      const mat = markGround(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
      mat.color.set(0xa8a294);
      this.geos.push(geo);
      this.mats.push(mat);
      this.addMesh(instanced(geo, mat, rocks, true));
    }
    if (reeds.length) {
      const geo = new THREE.ConeGeometry(0.012, 0.34, 4, 1);
      geo.translate(0, 0.17, 0);
      const mat = markGround(new THREE.MeshStandardMaterial({ color: 0x7d9a4a, roughness: 1, side: THREE.DoubleSide }));
      sway(mat, 0.05, 0);
      this.geos.push(geo);
      this.mats.push(mat);
      this.addMesh(instanced(geo, mat, reeds, false, false));
    }

    // ---- fields: planted rows, fences, hay
    const cropItems: { x: number; z: number; base: number; fieldId: string }[] = [];
    const fenceParts: Parts = [];
    const hayParts: Parts = [];
    for (const l of snap.landmarks) {
      if (l.kind !== 'field' || !l.tiles.length) continue;
      const xs = l.tiles.map((t) => t[0]);
      const zs = l.tiles.map((t) => t[1]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs) + 1;
      const z0 = Math.min(...zs);
      const z1 = Math.max(...zs) + 1;
      const key = new Set(l.tiles.map((t) => `${t[0]},${t[1]}`));
      for (const [tx, ty] of l.tiles) {
        for (let k = 0; k < 4; k++) {
          const px = tx + 0.0714 + k * 0.2857 + 0.07;
          if (px >= tx + 1) continue;
          for (let q = 0; q < Math.round(8 * Math.max(0.5, detail)); q++) {
            const pz = ty + (q + 0.3 + r() * 0.4) / Math.round(8 * Math.max(0.5, detail));
            cropItems.push({ x: px + (r() - 0.5) * 0.02, z: pz, base: r(), fieldId: l.id });
          }
        }
      }
      // a low fence round the field, open where a road touches it
      const edge = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number): void => {
        const mx = (ax + bx) / 2 + nx * 0.7;
        const mz = (az + bz) / 2 + nz * 0.7;
        const tx2 = Math.floor(mx);
        const tz2 = Math.floor(mz);
        const t = snap.terrain[Math.min(h - 1, Math.max(0, tz2)) * w + Math.min(w - 1, Math.max(0, tx2))];
        if (t === TERRAIN.ROAD || t === TERRAIN.RIVER || key.has(`${tx2},${tz2}`)) return;
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 1.0));
        for (let i = 0; i < n; i++) {
          const sx = ax + ((bx - ax) * i) / n;
          const sz = az + ((bz - az) * i) / n;
          const ex = ax + ((bx - ax) * (i + 1)) / n;
          const ez = az + ((bz - az) * (i + 1)) / n;
          fence(fenceParts, sx, sz, ex, ez, Math.min(ctx.heightAt(sx, sz), ctx.heightAt(ex, ez)) - 0.01, 0.12, 'wood@8a6a44');
        }
      };
      edge(x0 + 0.02, z0 + 0.02, x1 - 0.02, z0 + 0.02, 0, -1);
      edge(x0 + 0.02, z1 - 0.02, x1 - 0.02, z1 - 0.02, 0, 1);
      edge(x0 + 0.02, z0 + 0.02, x0 + 0.02, z1 - 0.02, -1, 0);
      edge(x1 - 0.02, z0 + 0.02, x1 - 0.02, z1 - 0.02, 1, 0);
      // haystacks at the field's corner
      for (let i = 0; i < 2; i++) {
        const hx = x1 + 0.15 + i * 0.22;
        const hz = z1 - 0.25 - i * 0.1;
        const gy = ctx.heightAt(hx, hz);
        add(hayParts, cyl(0.12, 0.1, 0.12, 8, 0.1), 'straw', hx, gy, hz);
        add(hayParts, cyl(0.1, 0.01, 0.12, 8, 0.1), 'straw', hx, gy + 0.12, hz);
      }
    }
    const resolve = (key: string): THREE.Material => {
      const at = key.indexOf('@');
      return at < 0 ? ctx.materials.get(key) : ctx.materials.get(key.slice(0, at), Number.parseInt(key.slice(at + 1), 16));
    };
    for (const parts of [fenceParts, hayParts, yardParts]) {
      for (const [key, geo] of mergeByMaterial(parts)) {
        const m = new THREE.Mesh(geo, resolve(key));
        m.castShadow = true;
        m.receiveShadow = true;
        this.fixed.add(m);
        this.geos.push(geo);
        this.props.push(m);
      }
    }
    if (cropItems.length) {
      const geo = plantGeometry();
      const mat = markGround(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
      sway(mat, 0.02, 0);
      const mesh = new THREE.InstancedMesh(geo, mat, cropItems.length);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.geos.push(geo);
      this.mats.push(mat);
      this.meshes.push(mesh);
      this.fixed.add(mesh);
      this.cropMesh = mesh;
      const byField = new Map<string, { x: number; z: number; base: number }[]>();
      let first = 0;
      for (const it of cropItems) {
        const arr = byField.get(it.fieldId) ?? [];
        arr.push({ x: it.x, z: it.z, base: it.base });
        byField.set(it.fieldId, arr);
      }
      for (const [fieldId, items] of byField) {
        this.cropTiles.push({ fieldId, items, first });
        first += items.length;
      }
    }
  }

  private updateCrops(snap: SceneSnapshot, ctx: WorldContext): void {
    const mesh = this.cropMesh;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    for (const f of this.cropTiles) {
      const l = snap.landmarks.find((x) => x.id === f.fieldId);
      const growth = Math.max(0, Math.min(100, l?.data.growth ?? 0)) / 100;
      const burned = l ? l.tiles.some(([tx, ty]) => snap.burned[ty * snap.w + tx]) : false;
      f.items.forEach((it, i) => {
        const k = f.first + i;
        const gy = ctx.heightAt(it.x, it.z);
        const h = burned ? 0.15 : 0.2 + growth * 0.85;
        q.setFromEuler(new THREE.Euler(0, it.base * 6, 0));
        m.compose(new THREE.Vector3(it.x, gy - 0.01, it.z), q, new THREE.Vector3(0.9, h * (0.85 + it.base * 0.3), 0.9));
        mesh.setMatrixAt(k, m);
        // green while young, gold as it ripens; a burnt field is black
        if (burned) col.copy(this.cropColors.dead);
        else col.copy(this.cropColors.young).lerp(this.cropColors.ripe, Math.max(0, (growth - 0.45) / 0.45));
        col.multiplyScalar(0.9 + it.base * 0.2);
        mesh.setColorAt(k, col);
      });
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private windPhase = 0;

  tick(dt: number, _time: number, ctx: WorldContext): void {
    this.windPhase += dt * ctx.weather.wind;
    wind.value = this.windPhase;
  }

  dispose(): void {
    this.clear();
  }

  info(): { instances: number } {
    return { instances: this.meshes.reduce((a, m) => a + m.count, 0) };
  }
}

