import * as THREE from 'three';
import { rng, type Rng } from './rand.ts';

/**
 * The material library: plaster, roofing, timber, masonry, thatch, glass and metal, every texture painted at load from a seeded
 * generator (no image files, nothing to download, nothing to license). Textures are 256 px (128 on the low tier) and tile in world
 * units through the uv scale set by `geom.ts`. A material can be tinted, which makes a cached variant sharing the same texture.
 */
type Painter = (g: CanvasRenderingContext2D, S: number, r: Rng) => void;

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const jitter = (r: Rng, c: [number, number, number], a: number): string => `rgb(${Math.round(c[0] + (r() - 0.5) * a)},${Math.round(c[1] + (r() - 0.5) * a)},${Math.round(c[2] + (r() - 0.5) * a)})`;

function speckle(g: CanvasRenderingContext2D, S: number, r: Rng, n: number, rgba: string, size = 1.2): void {
  g.fillStyle = rgba;
  for (let i = 0; i < n; i++) g.fillRect(r() * S, r() * S, size * (0.5 + r()), size * (0.5 + r()));
}

const PAINT: Record<string, Painter> = {
  plaster(g, S, r) {
    g.fillStyle = '#f1e8d3';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(${150 + r() * 40},${120 + r() * 40},${80 + r() * 30},${0.03 + r() * 0.05})`;
      g.beginPath();
      g.ellipse(r() * S, r() * S, 10 + r() * 38, 8 + r() * 30, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // trowel streaks
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(255,250,235,${0.08 + r() * 0.1})`;
      g.lineWidth = 2 + r() * 4;
      g.beginPath();
      const y = r() * S;
      g.moveTo(r() * S * 0.4, y);
      g.lineTo(S * (0.5 + r() * 0.5), y + (r() - 0.5) * 12);
      g.stroke();
    }
    speckle(g, S, r, 420, 'rgba(110,90,60,0.18)');
  },
  roofTile(g, S, r) {
    g.fillStyle = '#6b3a24';
    g.fillRect(0, 0, S, S);
    const rows = 8;
    const cols = 6;
    const th = S / rows;
    const tw = S / cols;
    for (let y = 0; y < rows; y++) {
      for (let x = -1; x < cols; x++) {
        const ox = (y % 2) * (tw / 2);
        const px = x * tw + ox;
        const py = y * th;
        const grad = g.createLinearGradient(px, py, px, py + th);
        const base: [number, number, number] = [188 + r() * 30, 88 + r() * 24, 50 + r() * 18];
        grad.addColorStop(0, `rgb(${base[0] - 22},${base[1] - 14},${base[2] - 10})`);
        grad.addColorStop(0.6, `rgb(${base[0]},${base[1]},${base[2]})`);
        grad.addColorStop(1, `rgb(${base[0] + 16},${base[1] + 10},${base[2] + 6})`);
        g.fillStyle = grad;
        g.beginPath();
        g.roundRect(px + 1, py + 1, tw - 2, th + 3, [2, 2, tw * 0.35, tw * 0.35]);
        g.fill();
        g.strokeStyle = 'rgba(60,28,16,0.55)';
        g.lineWidth = 1.2;
        g.stroke();
      }
    }
    speckle(g, S, r, 160, 'rgba(70,90,40,0.22)', 1.6);
  },
  roofSlate(g, S, r) {
    g.fillStyle = '#39424c';
    g.fillRect(0, 0, S, S);
    const rows = 8;
    const cols = 7;
    const th = S / rows;
    const tw = S / cols;
    for (let y = 0; y < rows; y++) {
      for (let x = -1; x < cols; x++) {
        const px = x * tw + (y % 2) * (tw / 2);
        const py = y * th;
        g.fillStyle = jitter(r, [92, 104, 118], 16);
        g.beginPath();
        g.roundRect(px + 1, py + 1, tw - 2, th + 2, 2);
        g.fill();
        g.strokeStyle = 'rgba(28,34,42,0.7)';
        g.stroke();
      }
    }
    speckle(g, S, r, 120, 'rgba(120,150,90,0.25)', 1.8);
  },
  thatch(g, S, r) {
    g.fillStyle = '#a98a3c';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) {
      const c = r();
      g.strokeStyle = `rgba(${150 + c * 80},${115 + c * 65},${40 + c * 40},${0.5 + r() * 0.4})`;
      g.lineWidth = 0.8 + r() * 1.4;
      const x = r() * S;
      const y = r() * S;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 6, y + 10 + r() * 22);
      g.stroke();
    }
    // bands where the thatch is tied
    g.fillStyle = 'rgba(60,40,15,0.25)';
    for (let y = 0; y < S; y += S / 5) g.fillRect(0, y, S, 3);
  },
  planks(g, S, r) {
    g.fillStyle = '#8a6a44';
    g.fillRect(0, 0, S, S);
    const n = 6;
    const w = S / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = jitter(r, [140, 104, 66], 30);
      g.fillRect(i * w + 1, 0, w - 2, S);
      for (let k = 0; k < 18; k++) {
        g.strokeStyle = `rgba(70,46,24,${0.1 + r() * 0.2})`;
        g.lineWidth = 0.8;
        const x = i * w + 3 + r() * (w - 6);
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + (r() - 0.5) * 6, S * 0.3, x + (r() - 0.5) * 6, S * 0.6, x + (r() - 0.5) * 4, S);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,26,14,0.7)';
      g.fillRect(i * w, 0, 1.5, S);
    }
  },
  timber(g, S, r) {
    g.fillStyle = '#4b3220';
    g.fillRect(0, 0, S, S);
    for (let k = 0; k < 60; k++) {
      g.strokeStyle = `rgba(${30 + r() * 30},${18 + r() * 18},${8 + r() * 10},0.5)`;
      g.lineWidth = 1 + r() * 1.5;
      const y = r() * S;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(S * 0.3, y + (r() - 0.5) * 8, S * 0.6, y + (r() - 0.5) * 8, S, y + (r() - 0.5) * 6);
      g.stroke();
    }
  },
  stone(g, S, r) {
    g.fillStyle = '#7f7a6c';
    g.fillRect(0, 0, S, S);
    let y = 0;
    while (y < S) {
      const h = 22 + r() * 18;
      let x = -r() * 30;
      while (x < S) {
        const w = 34 + r() * 40;
        g.fillStyle = jitter(r, [172, 164, 148], 16);
        g.beginPath();
        g.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, 4);
        g.fill();
        g.strokeStyle = 'rgba(70,66,56,0.7)';
        g.lineWidth = 1.5;
        g.stroke();
        x += w;
      }
      y += h;
    }
    speckle(g, S, r, 260, 'rgba(60,70,40,0.16)', 1.6);
  },
  cobble(g, S, r) {
    g.fillStyle = '#6c665a';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 110; i++) {
      g.fillStyle = jitter(r, [158, 150, 134], 16);
      g.beginPath();
      g.ellipse(r() * S, r() * S, 8 + r() * 9, 6 + r() * 7, r() * 3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(50,46,40,0.6)';
      g.stroke();
    }
  },
  bark(g, S, r) {
    g.fillStyle = '#5a4430';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(${30 + r() * 40},${20 + r() * 25},${10 + r() * 12},0.6)`;
      g.lineWidth = 1 + r() * 2.5;
      const x = r() * S;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (r() - 0.5) * 10, S * 0.33, x + (r() - 0.5) * 10, S * 0.66, x + (r() - 0.5) * 8, S);
      g.stroke();
    }
  },
  canvasCloth(g, S, r) {
    g.fillStyle = '#e9dfc6';
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 3) {
      g.fillStyle = `rgba(120,100,70,${0.04 + r() * 0.05})`;
      g.fillRect(0, y, S, 1);
    }
    for (let x = 0; x < S; x += 3) {
      g.fillStyle = `rgba(120,100,70,${0.03 + r() * 0.04})`;
      g.fillRect(x, 0, 1, S);
    }
  },
};

/** how each named material is assembled from a texture */
interface MatSpec {
  tex?: string;
  color: number;
  rough: number;
  metal?: number;
  emissive?: number;
  emissiveIntensity?: number;
  bump?: number;
  side?: THREE.Side;
}

const SPECS: Record<string, MatSpec> = {
  plaster: { tex: 'plaster', color: 0xffffff, rough: 0.92, bump: 0.6 },
  roofTile: { tex: 'roofTile', color: 0xffffff, rough: 0.82, bump: 1.4 },
  roofSlate: { tex: 'roofSlate', color: 0xffffff, rough: 0.7, bump: 1.2 },
  thatch: { tex: 'thatch', color: 0xffffff, rough: 1, bump: 1.2 },
  wood: { tex: 'planks', color: 0xffffff, rough: 0.9, bump: 0.8 },
  timber: { tex: 'timber', color: 0xffffff, rough: 0.88, bump: 0.5 },
  stone: { tex: 'stone', color: 0xffffff, rough: 0.95, bump: 1.4 },
  cobble: { tex: 'cobble', color: 0xffffff, rough: 0.98, bump: 1.2 },
  bark: { tex: 'bark', color: 0xffffff, rough: 1, bump: 1 },
  cloth: { tex: 'canvasCloth', color: 0xffffff, rough: 1, side: THREE.DoubleSide },
  glass: { color: 0x6f9bb6, rough: 0.2, metal: 0.1, emissive: 0xffc46b, emissiveIntensity: 0.18 },
  glassLit: { color: 0xffd98f, rough: 0.4, emissive: 0xffb84d, emissiveIntensity: 1.6 },
  iron: { color: 0x2c2f34, rough: 0.55, metal: 0.7 },
  brass: { color: 0xc4a24a, rough: 0.4, metal: 0.8 },
  rope: { color: 0x9a8656, rough: 1 },
  straw: { color: 0xd2b45c, rough: 1 },
  dirt: { color: 0x6c5538, rough: 1 },
  sack: { color: 0xc9b58a, rough: 1 },
  white: { color: 0xf3efe4, rough: 0.9 },
  bloom: { color: 0xffffff, rough: 0.7 },
  coal: { color: 0x2a2623, rough: 1 },
  mud: { color: 0x64502f, rough: 1 },
  gold: { color: 0xf0b860, rough: 0.35, metal: 0.4, emissive: 0xf0b860, emissiveIntensity: 0.35 },
};

export class MaterialLib {
  private textures = new Map<string, THREE.CanvasTexture>();
  /** average colour of each texture in linear space, so a tint can be given as the colour the surface should read as */
  private averages = new Map<string, THREE.Color>();
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private size: number;
  private aniso: number;
  private seed: number;

  constructor(seed: number, size = 256, aniso = 4) {
    this.seed = seed;
    this.size = size;
    this.aniso = aniso;
  }

  private tex(name: string): THREE.CanvasTexture {
    const hit = this.textures.get(name);
    if (hit) return hit;
    const S = this.size;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable for textures');
    PAINT[name](g, S, rng(this.seed ^ (name.length * 7919)));
    const px = g.getImageData(0, 0, S, S).data;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    const n = px.length / 4;
    const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    for (let i = 0; i < px.length; i += 16) {
      sr += lin(px[i] / 255);
      sg += lin(px[i + 1] / 255);
      sb += lin(px[i + 2] / 255);
    }
    const m = n / 4;
    this.averages.set(name, new THREE.Color().setRGB(sr / m, sg / m, sb / m, THREE.LinearSRGBColorSpace));
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.aniso;
    this.textures.set(name, t);
    return t;
  }

  /** a material by name, cached; `tint` makes a cached colour variant that shares the texture */
  get(name: string, tint?: number): THREE.MeshStandardMaterial {
    const key = tint === undefined ? name : `${name}:${hex(tint)}`;
    const hit = this.mats.get(key);
    if (hit) return hit;
    const spec = SPECS[name];
    if (!spec) throw new Error(`unknown material ${name}`);
    const m = new THREE.MeshStandardMaterial({
      color: tint ?? spec.color,
      roughness: spec.rough,
      metalness: spec.metal ?? 0,
      side: spec.side ?? THREE.FrontSide,
    });
    if (spec.tex) {
      const t = this.tex(spec.tex);
      m.map = t;
      if (tint !== undefined) {
        // the tint is the colour the surface should average to: divide out the texture's own average so the two agree
        const want = new THREE.Color(tint);
        const avg = this.averages.get(spec.tex) ?? new THREE.Color(1, 1, 1);
        m.color.setRGB(Math.min(1.6, want.r / Math.max(0.02, avg.r)), Math.min(1.6, want.g / Math.max(0.02, avg.g)), Math.min(1.6, want.b / Math.max(0.02, avg.b)), THREE.LinearSRGBColorSpace);
      }
      if (spec.bump) {
        m.bumpMap = t;
        m.bumpScale = spec.bump * 0.9;
      }
    }
    if (spec.emissive !== undefined) {
      m.emissive = new THREE.Color(spec.emissive);
      m.emissiveIntensity = spec.emissiveIntensity ?? 1;
    }
    this.mats.set(key, m);
    return m;
  }

  /** every texture and material, for the asset tests */
  names(): string[] {
    return Object.keys(SPECS);
  }

  /** how many textures and materials are alive */
  count(): { textures: number; materials: number } {
    return { textures: this.textures.size, materials: this.mats.size };
  }

  /** windows brighten as the light falls (storm, evening) */
  setWindowGlow(k: number): void {
    const m = this.mats.get('glass');
    if (m) m.emissiveIntensity = 0.18 + k * 1.3;
  }

  dispose(): void {
    for (const t of this.textures.values()) t.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.textures.clear();
    this.mats.clear();
  }
}
