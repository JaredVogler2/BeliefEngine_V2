import * as THREE from 'three';
import { CHANNEL_DEPTH, HEIGHT_UNIT } from './coords.ts';
import { fbm, makeNoise } from './rand.ts';
import { buildGroundTexture } from './groundTexture.ts';
import type { SceneSnapshot } from './snapshot.ts';

/** engine terrain ids (src/engine/world/grid.ts), repeated here so the renderer needs nothing but the snapshot */
export const TERRAIN = { GRASS: 0, RIVER: 1, FIELD: 2, HILL: 3, FOREST: 4, ROAD: 5, ROCK: 6, MARSH: 7, SAND: 8 } as const;

/** vertices per tile along each axis */
export const SUB = 4;

/** building kinds that sit on a levelled plot, and how far the levelling reaches (in tiles) */
const PLOT_RADIUS: Record<string, number> = { home: 0.95, cabin: 0.85, hall: 1.3, chapel: 1.1, mill: 0.9, market: 1.2, shelter: 1.2, granary: 0.9, belltower: 0.9, well: 0.6, pen: 1.2, campfire: 0.5, beacon: 0.55 };

export interface TerrainData {
  w: number;
  h: number;
  nx: number;
  nz: number;
  heights: Float32Array;
  /** wetness 0..1 per vertex: how close to the river */
  wet: Float32Array;
  /** per-tile pure elevation (elev * HEIGHT_UNIT): the level the water planes are measured from */
  tileBase: Float32Array;
  heightAt(wx: number, wz: number): number;
  slopeAt(wx: number, wz: number): number;
  riverTiles: [number, number][];
  noise: (x: number, y: number) => number;
}

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number): number =>
  0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildHeightField(snap: SceneSnapshot, seedNum: number): TerrainData {
  const { w, h } = snap;
  const nx = w * SUB + 1;
  const nz = h * SUB + 1;
  const noise = makeNoise(seedNum);
  const noiseB = makeNoise(seedNum ^ 0x9e3779b9);
  const tileBase = new Float32Array(w * h);
  let emin = 99;
  let emax = -99;
  for (let i = 0; i < w * h; i++) {
    tileBase[i] = snap.elev[i] * HEIGHT_UNIT;
    emin = Math.min(emin, snap.elev[i]);
    emax = Math.max(emax, snap.elev[i]);
  }
  // flat chapters (Ashwood is one level everywhere) get more rolling land from noise; steep ones keep the engine's relief
  const relief = emax - emin <= 3 ? 0.55 : 0.2;
  // banks are eased: two passes of a small blur over the elevations, so a one-tile drop of a metre becomes a slope the eye can read.
  // The engine's own heights (tileBase) stay as they are, because the water is measured from those.
  let smooth1 = Float32Array.from(tileBase);
  for (let pass = 0; pass < 2; pass++) {
    const nxt = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let wt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            const yy = Math.min(h - 1, Math.max(0, y + dy));
            const k = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
            sum += smooth1[yy * w + xx] * k;
            wt += k;
          }
        }
        nxt[y * w + x] = sum / wt;
      }
    }
    smooth1 = nxt;
  }
  const tileAt = (tx: number, ty: number): number => smooth1[Math.min(h - 1, Math.max(0, ty)) * w + Math.min(w - 1, Math.max(0, tx))];
  const isRiver = (tx: number, ty: number): number => (tx < 0 || ty < 0 || tx >= w || ty >= h ? 0 : snap.terrain[ty * w + tx] === TERRAIN.RIVER ? 1 : 0);
  const riverTiles: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isRiver(x, y)) riverTiles.push([x, y]);

  /** smooth cubic sampling of the tile elevations, at tile-centre coordinates */
  const base = (u: number, v: number): number => {
    const fx = u - 0.5;
    const fy = v - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const row = (yy: number) => catmull(tileAt(ix - 1, yy), tileAt(ix, yy), tileAt(ix + 1, yy), tileAt(ix + 2, yy), tx);
    return catmull(row(iy - 1), row(iy), row(iy + 1), row(iy + 2), ty);
  };
  /** bilinear sample of the river mask, with the edge wobbled by noise so banks meander instead of following the grid */
  const riverMask = (u: number, v: number): number => {
    const wu = u + (noiseB(u * 0.9, v * 0.9) - 0.5) * 0.7;
    const wv = v + (noiseB(u * 0.9 + 40, v * 0.9 + 17) - 0.5) * 0.7;
    const fx = wu - 0.5;
    const fy = wv - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const m = isRiver(ix, iy) * (1 - tx) * (1 - ty) + isRiver(ix + 1, iy) * tx * (1 - ty) + isRiver(ix, iy + 1) * (1 - tx) * ty + isRiver(ix + 1, iy + 1) * tx * ty;
    return smoothstep(0.18, 0.82, m);
  };

  const heights = new Float32Array(nx * nz);
  const wet = new Float32Array(nx * nz);
  // distance (in tiles) to the nearest river tile, for wet soil
  const dist = new Float32Array(w * h).fill(99);
  const queue: number[] = [];
  for (const [x, y] of riverTiles) {
    dist[y * w + x] = 0;
    queue.push(y * w + x);
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx2 = x + dx;
      const ny2 = y + dy;
      if (nx2 < 0 || ny2 < 0 || nx2 >= w || ny2 >= h) continue;
      const j = ny2 * w + nx2;
      if (dist[j] > dist[i] + 1) {
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
    }
  }
  const distAt = (u: number, v: number): number => {
    const fx = Math.min(w - 1.001, Math.max(0, u - 0.5));
    const fy = Math.min(h - 1.001, Math.max(0, v - 0.5));
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const d = (a: number, b: number) => dist[b * w + a];
    return d(ix, iy) * (1 - tx) * (1 - ty) + d(ix + 1, iy) * tx * (1 - ty) + d(ix, iy + 1) * (1 - tx) * ty + d(ix + 1, iy + 1) * tx * ty;
  };

  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const u = i / SUB;
      const v = j / SUB;
      let y = base(u, v);
      // rolling land: broad swells plus a finer ripple, quieter close to the river and at the very edge of the map
      const edge = Math.min(u, v, w - u, h - v);
      const swell = (fbm(noise, u * 0.28 + 10, v * 0.28 + 3, 3) - 0.5) * 2 * relief + (fbm(noise, u * 0.9, v * 0.9, 2) - 0.5) * 0.12;
      y += swell * smoothstep(0, 1.5, edge);
      const rm = riverMask(u, v);
      y -= CHANNEL_DEPTH * rm;
      // a little bank lip: soil piles up at the edge of the channel
      y += 0.07 * Math.sin(rm * Math.PI) * (noise(u * 2.1, v * 2.1) * 0.7 + 0.3);
      heights[j * nx + i] = y;
      wet[j * nx + i] = 1 - smoothstep(0.3, 1.6, distAt(u, v));
    }
  }

  // levelled plots: buildings sit on flat ground with a short blend into the slope
  for (const l of snap.landmarks) {
    const r = PLOT_RADIUS[l.kind];
    if (!r || l.hp < 0) continue;
    const cu = l.x + 0.5;
    const cv = l.y + 0.5;
    const ci = Math.round(cu * SUB);
    const cj = Math.round(cv * SUB);
    const level = heights[Math.min(nz - 1, Math.max(0, cj)) * nx + Math.min(nx - 1, Math.max(0, ci))];
    const reach = r + 0.7;
    for (let j = Math.max(0, Math.floor((cv - reach) * SUB)); j <= Math.min(nz - 1, Math.ceil((cv + reach) * SUB)); j++) {
      for (let i = Math.max(0, Math.floor((cu - reach) * SUB)); i <= Math.min(nx - 1, Math.ceil((cu + reach) * SUB)); i++) {
        const d = Math.hypot(i / SUB - cu, j / SUB - cv);
        const k = 1 - smoothstep(r, reach, d);
        if (k > 0) heights[j * nx + i] += (level - heights[j * nx + i]) * k;
      }
    }
  }

  const heightAt = (wx: number, wz: number): number => {
    const fx = Math.min(nx - 1.0001, Math.max(0, wx * SUB));
    const fz = Math.min(nz - 1.0001, Math.max(0, wz * SUB));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const a = heights[iz * nx + ix];
    const b = heights[iz * nx + ix + 1];
    const c = heights[(iz + 1) * nx + ix];
    const d = heights[(iz + 1) * nx + ix + 1];
    return a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + c * (1 - tx) * tz + d * tx * tz;
  };
  const slopeAt = (wx: number, wz: number): number => {
    const e = 0.25;
    return Math.hypot(heightAt(wx + e, wz) - heightAt(wx - e, wz), heightAt(wx, wz + e) - heightAt(wx, wz - e)) / (2 * e);
  };
  return { w, h, nx, nz, heights, wet, tileBase, heightAt, slopeAt, riverTiles, noise };
}

// ---------------------------------------------------------------------------------------------------------------- mesh

const col = (hex: number): THREE.Color => new THREE.Color(hex);

export interface TerrainMesh {
  group: THREE.Group;
  ground: THREE.Mesh;
  dispose(): void;
}

/** the ground surface (geometry from the height field, colour from the painted ground texture) and the diorama's cut edge */
export function buildTerrainMesh(snap: SceneSnapshot, data: TerrainData, seedNum: number, maxAniso: number): TerrainMesh {
  const { w, h, nx, nz, heights } = data;
  const noise = makeNoise(seedNum ^ 0x51ed270b);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(nx * nz * 3);
  const uvs = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      pos[k * 3] = i / SUB;
      pos[k * 3 + 1] = heights[k];
      pos[k * 3 + 2] = j / SUB;
      uvs[k * 2] = i / SUB / w;
      uvs[k * 2 + 1] = 1 - j / SUB / h;
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      // alternate the diagonal so slopes do not show a directional seam
      if ((i + j) % 2 === 0) index.push(a, c, b, b, c, d);
      else index.push(a, c, d, a, d, b);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const ground = buildGroundTexture(snap, data, seedNum, maxAniso);
  const mat = new THREE.MeshStandardMaterial({ map: ground.texture, roughness: 0.96, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  // the plate's edge: a cut through layered earth and stone, so the village reads as a diorama and not a floating sheet
  const group = new THREE.Group();
  group.add(mesh);
  const BASE = -1.6;
  const bands: { y: number; c: THREE.Color }[] = [
    { y: 0, c: col(0x4a3a24) }, { y: -0.22, c: col(0x6a5334) }, { y: -0.5, c: col(0x8a7650) }, { y: -0.85, c: col(0x7b7466) }, { y: -1.2, c: col(0x645f56) }, { y: BASE, c: col(0x4d4a44) },
  ];
  const sp: number[] = [];
  const sc: number[] = [];
  const si: number[] = [];
  const addWall = (edge: { x: number; z: number; y: number }[], nrm: [number, number]): void => {
    const cols = edge.length;
    const startIdx = sp.length / 3;
    for (const p of edge) {
      for (let b = 0; b < bands.length; b++) {
        const y = b === 0 ? p.y : Math.min(p.y, bands[b].y) - 0.02 * b;
        sp.push(p.x, y, p.z);
        const c = bands[Math.max(0, b - (b === 0 ? 0 : 0))].c;
        // each band takes the colour of the layer it ends in, with a little noise along the edge
        const g = 0.9 + 0.2 * noise(p.x * 3 + p.z * 3, b * 2.5);
        sc.push(c.r * g, c.g * g, c.b * g);
      }
    }
    const rows = bands.length;
    for (let c = 0; c < cols - 1; c++) {
      for (let r = 0; r < rows - 1; r++) {
        const a = startIdx + c * rows + r;
        const b = a + rows;
        const cc = a + 1;
        const d = b + 1;
        if (nrm[0] + nrm[1] > 0) si.push(a, cc, b, b, cc, d);
        else si.push(a, b, cc, b, d, cc);
      }
    }
  };
  const north: { x: number; z: number; y: number }[] = [];
  const south: { x: number; z: number; y: number }[] = [];
  for (let i = 0; i < nx; i++) {
    north.push({ x: i / SUB, z: 0, y: heights[i] });
    south.push({ x: i / SUB, z: h, y: heights[(nz - 1) * nx + i] });
  }
  const west: { x: number; z: number; y: number }[] = [];
  const east: { x: number; z: number; y: number }[] = [];
  for (let j = 0; j < nz; j++) {
    west.push({ x: 0, z: j / SUB, y: heights[j * nx] });
    east.push({ x: w, z: j / SUB, y: heights[j * nx + nx - 1] });
  }
  addWall(north, [-1, -1]);
  addWall(south, [1, 1]);
  addWall(west, [1, -1]);
  addWall(east, [-1, 1]);
  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  skirtGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  skirtGeo.setIndex(si);
  skirtGeo.computeVertexNormals();
  const skirt = new THREE.Mesh(skirtGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  skirt.receiveShadow = true;
  skirt.castShadow = true;
  skirt.name = 'plate-edge';
  group.add(skirt);
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0x3b3833, roughness: 1 }));
  bottom.rotation.x = Math.PI / 2;
  bottom.position.set(w / 2, BASE, h / 2);
  group.add(bottom);

  return {
    group,
    ground: mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
      ground.dispose();
      skirtGeo.dispose();
      (skirt.material as THREE.Material).dispose();
      bottom.geometry.dispose();
      (bottom.material as THREE.Material).dispose();
    },
  };
}
