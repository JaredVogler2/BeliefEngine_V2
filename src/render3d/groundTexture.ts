import * as THREE from 'three';
import { fbm, makeNoise } from './rand.ts';
import type { SceneSnapshot } from './snapshot.ts';
import { TERRAIN, type TerrainData } from './terrain.ts';

/**
 * The ground's painted surface. Zones (meadow, farmland, road, forest floor, rock, wet soil) are computed on a coarse grid with
 * warped, noisy edges, then blown up to pixels with fine grain, blades, pebbles and furrows added, so the land reads as one
 * hand-painted surface instead of a checkerboard of tiles. Everything is derived from the snapshot and the seed: no image files.
 */
const PPT = 40; // pixels per tile
const CG = 8; // coarse cells per tile

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

type RGB = [number, number, number];
const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const PAL = {
  grass: hex(0x5f9a45), grassLight: hex(0x93b857), grassDeep: hex(0x3d7a3c), gold: hex(0xb9aa4c), meadowFlower: hex(0xe8d680),
  field: hex(0x8c6438), fieldDark: hex(0x6a4829), furrow: hex(0x5a3c22), crop: hex(0x8fae4a),
  road: hex(0xc9ad7c), roadWorn: hex(0xa88c5f), pebble: hex(0x8f7d62), path: hex(0xb7a06c),
  rock: hex(0x8d8777), rockDark: hex(0x66645a), wet: hex(0x4a4733), forest: hex(0x3d6b3b), forestFloor: hex(0x4b5a31), needles: hex(0x6d5a34),
  sand: hex(0xdac98f), marsh: hex(0x5f7d4a), hill: hex(0x9ba757), ash: hex(0x35352f), mud: hex(0x6d5837),
};

export interface GroundTexture {
  texture: THREE.CanvasTexture;
  dispose(): void;
}

export function buildGroundTexture(snap: SceneSnapshot, data: TerrainData, seedNum: number, maxAniso: number): GroundTexture {
  const { w, h } = snap;
  const noise = makeNoise(seedNum ^ 0x7f4a7c15);
  const noise2 = makeNoise(seedNum ^ 0x1b873593);
  const cw = w * CG + 1;
  const ch = h * CG + 1;
  const terrainAt = (tx: number, ty: number): number => snap.terrain[Math.min(h - 1, Math.max(0, ty)) * w + Math.min(w - 1, Math.max(0, tx))];

  const mask = (ids: number[], u: number, v: number, wobble: number): number => {
    const wu = u + (noise(u * 1.3, v * 1.3) - 0.5) * wobble;
    const wv = v + (noise(u * 1.3 + 31, v * 1.3 + 7) - 0.5) * wobble;
    const fx = wu - 0.5;
    const fy = wv - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const m = (a: number, b: number) => (ids.includes(terrainAt(a, b)) ? 1 : 0);
    return smooth(0.3, 0.7, m(ix, iy) * (1 - tx) * (1 - ty) + m(ix + 1, iy) * tx * (1 - ty) + m(ix, iy + 1) * (1 - tx) * ty + m(ix + 1, iy + 1) * tx * ty);
  };

  // building paths: from a doorstep to the nearest road tile
  const roads: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (snap.terrain[y * w + x] === TERRAIN.ROAD) roads.push([x, y]);
  const paths: { ax: number; ay: number; bx: number; by: number }[] = [];
  for (const l of snap.landmarks) {
    if (!['home', 'hall', 'cabin', 'chapel', 'market', 'mill', 'shelter', 'granary', 'belltower'].includes(l.kind) || !roads.length) continue;
    let best = roads[0];
    let bd = 1e9;
    for (const r of roads) {
      const d = Math.hypot(r[0] - l.x, r[1] - l.y);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    if (bd > 1.1 && bd < 8) paths.push({ ax: l.x + 0.5, ay: l.y + 0.5 + 0.55, bx: best[0] + 0.5, by: best[1] + 0.5 });
  }

  // coarse fields: one RGB macro colour plus a few weights per cell
  const macro = new Float32Array(cw * ch * 3);
  const wRoad = new Float32Array(cw * ch);
  const wPath = new Float32Array(cw * ch);
  const wField = new Float32Array(cw * ch);
  const wRock = new Float32Array(cw * ch);
  const wForest = new Float32Array(cw * ch);
  const wWet = new Float32Array(cw * ch);
  const wSand = new Float32Array(cw * ch);
  const tmp: RGB = [0, 0, 0];
  const mix = (c: RGB, t: RGB, k: number): void => {
    c[0] = lerp(c[0], t[0], k);
    c[1] = lerp(c[1], t[1], k);
    c[2] = lerp(c[2], t[2], k);
  };
  const wetAt = (u: number, v: number): number => {
    const ix = Math.min(data.nx - 1, Math.max(0, Math.round(u * 4)));
    const iz = Math.min(data.nz - 1, Math.max(0, Math.round(v * 4)));
    return data.wet[iz * data.nx + ix];
  };
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const k = j * cw + i;
      const u = i / CG;
      const v = j / CG;
      const patch = fbm(noise, u * 0.45 + 50, v * 0.45 + 50, 3);
      tmp[0] = PAL.grass[0];
      tmp[1] = PAL.grass[1];
      tmp[2] = PAL.grass[2];
      mix(tmp, PAL.grassLight, smooth(0.45, 0.8, patch) * 0.85);
      mix(tmp, PAL.grassDeep, smooth(0.5, 0.15, patch) * 0.75);
      mix(tmp, PAL.gold, smooth(0.62, 0.92, noise2(u * 0.5 + 80, v * 0.5 + 12)) * 0.5);
      mix(tmp, PAL.hill, mask([TERRAIN.HILL], u, v, 0.7) * 0.75);
      const forest = mask([TERRAIN.FOREST], u, v, 0.9);
      mix(tmp, PAL.forestFloor, forest * 0.9);
      mix(tmp, PAL.marsh, mask([TERRAIN.MARSH], u, v, 0.5) * 0.85);
      const sand = mask([TERRAIN.SAND], u, v, 0.5);
      mix(tmp, PAL.sand, sand);
      const rock = mask([TERRAIN.ROCK], u, v, 0.6);
      // steep ground shows rock
      const e = 0.25;
      const sl = Math.hypot(data.heightAt(u + e, v) - data.heightAt(u - e, v), data.heightAt(u, v + e) - data.heightAt(u, v - e)) / (2 * e);
      const steep = smooth(0.9, 2.0, sl);
      wRock[k] = Math.max(rock, steep * 0.85);
      wForest[k] = forest;
      wSand[k] = sand;
      wField[k] = mask([TERRAIN.FIELD], u, v, 0.14);
      // roads wander: the lookup is dragged around by low-frequency noise
      const ru = u + (noise(u * 0.7 + 3, v * 0.7) - 0.5) * 0.7;
      const rv = v + (noise(u * 0.7, v * 0.7 + 9) - 0.5) * 0.7;
      wRoad[k] = mask([TERRAIN.ROAD], ru, rv, 0.15) * smooth(0.0, 0.2, 1 - mask([TERRAIN.RIVER], u, v, 0.1));
      let pc = 0;
      for (const p of paths) {
        const dx = p.bx - p.ax;
        const dy = p.by - p.ay;
        const len2 = dx * dx + dy * dy || 1;
        const pu = u + (noise(u * 2.2, v * 2.2) - 0.5) * 0.32;
        const pv = v + (noise(u * 2.2 + 9, v * 2.2 + 21) - 0.5) * 0.32;
        const t = Math.min(1, Math.max(0, ((pu - p.ax) * dx + (pv - p.ay) * dy) / len2));
        pc = Math.max(pc, 1 - smooth(0.07, 0.2, Math.hypot(pu - (p.ax + dx * t), pv - (p.ay + dy * t))));
      }
      wPath[k] = pc;
      wWet[k] = wetAt(u, v);
      macro[k * 3] = tmp[0];
      macro[k * 3 + 1] = tmp[1];
      macro[k * 3 + 2] = tmp[2];
    }
  }

  const W = w * PPT;
  const H = h * PPT;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable for the ground texture');
  const img = g.createImageData(W, H);
  const px = img.data;
  const hash = (x: number, y: number): number => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seedNum;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const sample = (arr: Float32Array, fu: number, fv: number, stride: number, o: number): number => {
    const x0 = Math.min(cw - 2, Math.floor(fu));
    const y0 = Math.min(ch - 2, Math.floor(fv));
    const tx = fu - x0;
    const ty = fv - y0;
    const a = arr[(y0 * cw + x0) * stride + o];
    const b = arr[(y0 * cw + x0 + 1) * stride + o];
    const c = arr[((y0 + 1) * cw + x0) * stride + o];
    const d = arr[((y0 + 1) * cw + x0 + 1) * stride + o];
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  };
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / PPT;
    const fv = (y + 0.5) / (PPT / CG);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / PPT;
      const fu = (x + 0.5) / (PPT / CG);
      let r = sample(macro, fu, fv, 3, 0);
      let gg = sample(macro, fu, fv, 3, 1);
      let b = sample(macro, fu, fv, 3, 2);
      const road = sample(wRoad, fu, fv, 1, 0);
      const path = sample(wPath, fu, fv, 1, 0);
      const field = sample(wField, fu, fv, 1, 0);
      const rock = sample(wRock, fu, fv, 1, 0);
      const forest = sample(wForest, fu, fv, 1, 0);
      const wet = sample(wWet, fu, fv, 1, 0);
      // fine grain at the pixel scale
      const n1 = hash(x, y);
      const n2 = hash(x >> 1, y >> 1);
      const grain = 0.9 + 0.2 * (0.6 * n1 + 0.4 * n2);
      // blades and flecks on grass
      const fleck = hash(x * 3 + 11, y * 5 + 7) > 0.97 ? 1 : 0;
      const grassW = (1 - road) * (1 - field) * (1 - rock) * (1 - path * 0.7);
      r = r * grain + fleck * grassW * 0.07;
      gg = gg * grain + fleck * grassW * 0.1;
      b = b * grain;
      // forest floor: needle litter
      if (forest > 0.02) {
        const nee = hash((x >> 1) + 5, (y >> 2) + 9) > 0.8 ? 1 : 0;
        r = lerp(r, PAL.needles[0], forest * nee * 0.5);
        gg = lerp(gg, PAL.needles[1], forest * nee * 0.5);
        b = lerp(b, PAL.needles[2], forest * nee * 0.5);
      }
      // farmland: ploughed furrows running north to south, a different phase in every field
      if (field > 0.02) {
        const furrow = 0.5 + 0.5 * Math.sin(u * Math.PI * 7);
        const mixF = smooth(0.25, 0.75, furrow);
        const fr = lerp(PAL.fieldDark[0], PAL.field[0], mixF) * grain;
        const fg = lerp(PAL.fieldDark[1], PAL.field[1], mixF) * grain;
        const fb = lerp(PAL.fieldDark[2], PAL.field[2], mixF) * grain;
        r = lerp(r, fr, field);
        gg = lerp(gg, fg, field);
        b = lerp(b, fb, field);
      }
      // trodden paths
      if (path > 0.02) {
        const k = path * 0.85;
        r = lerp(r, PAL.path[0] * grain, k);
        gg = lerp(gg, PAL.path[1] * grain, k);
        b = lerp(b, PAL.path[2] * grain, k);
      }
      // the road: packed earth with pebbles and worn ruts
      if (road > 0.02) {
        const worn = smooth(0.35, 0.8, noise2(u * 3.1, v * 3.1));
        const peb = hash(x * 7 + 1, y * 3 + 5) > 0.93 ? 1 : 0;
        let rr = lerp(PAL.road[0], PAL.roadWorn[0], worn * 0.6) * grain;
        let rg = lerp(PAL.road[1], PAL.roadWorn[1], worn * 0.6) * grain;
        let rb = lerp(PAL.road[2], PAL.roadWorn[2], worn * 0.6) * grain;
        rr = lerp(rr, PAL.pebble[0], peb * 0.6);
        rg = lerp(rg, PAL.pebble[1], peb * 0.6);
        rb = lerp(rb, PAL.pebble[2], peb * 0.6);
        // grassy verge: the edge of the road is ragged
        const edge = smooth(0.2, 0.7, road);
        r = lerp(r, rr, edge);
        gg = lerp(gg, rg, edge);
        b = lerp(b, rb, edge);
      }
      // rock outcrops: banded stone
      if (rock > 0.02) {
        const band = 0.5 + 0.5 * Math.sin((u * 0.7 + v * 1.9) * 9 + noise(u * 2, v * 2) * 5);
        const rr = lerp(PAL.rockDark[0], PAL.rock[0], band) * grain;
        const rg = lerp(PAL.rockDark[1], PAL.rock[1], band) * grain;
        const rb = lerp(PAL.rockDark[2], PAL.rock[2], band) * grain;
        const k = smooth(0.05, 0.9, rock) * (1 - road);
        r = lerp(r, rr, k);
        gg = lerp(gg, rg, k);
        b = lerp(b, rb, k);
      }
      // wet bank soil, darker and muddier right at the water
      if (wet > 0.02) {
        const k = wet * wet * 0.4 * (1 - road * 0.6);
        r = lerp(r, PAL.wet[0] * grain, k);
        gg = lerp(gg, PAL.wet[1] * grain, k);
        b = lerp(b, PAL.wet[2] * grain, k);
      }
      const o = (y * W + x) * 4;
      px[o] = Math.min(255, Math.max(0, Math.round(r * 255)));
      px[o + 1] = Math.min(255, Math.max(0, Math.round(gg * 255)));
      px[o + 2] = Math.min(255, Math.max(0, Math.round(b * 255)));
      px[o + 3] = 255;
    }
  }
  // burnt tiles
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(40,38,34,0.78)';
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) if (snap.burned[ty * w + tx]) g.fillRect(tx * PPT + 2, ty * PPT + 2, PPT - 4, PPT - 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAniso;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, dispose: () => texture.dispose() };
}
