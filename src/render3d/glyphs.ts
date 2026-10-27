import * as THREE from 'three';
import type { Vocab } from './plan.ts';

/**
 * The runes that hover over people and rise off the ground around a law. Each is a real rune shape from the old futhark (a gift, a day,
 * water, a thorn, a home), drawn once on a small canvas as a few strokes inside a broken double ring with a soft glow; white on
 * transparent, so the effect's colour tints it. Every colour vocabulary has its own shapes as well as its own colour. The last one is an
 * eye, for someone who saw something. No image files are involved.
 */
const SIZE = 128;

type Path = [number, number][];
/** stroke lists on a 3 x 5 grid: x in 0..2, y in 0..4 (y grows downward) */
const RUNES: Record<string, Path[]> = {
  fehu: [[[0, 0], [0, 4]], [[0, 1.4], [2, 0]], [[0, 2.8], [2, 1.4]]],
  gebo: [[[0, 0], [2, 4]], [[2, 0], [0, 4]]],
  dagaz: [[[0, 0], [0, 4], [2, 0], [2, 4], [0, 0]]],
  hagalaz: [[[0, 0], [0, 4]], [[2, 0], [2, 4]], [[0, 1.4], [2, 2.6]]],
  laguz: [[[0, 0], [0, 4]], [[0, 0.6], [2, 1.8]]],
  ehwaz: [[[0, 0], [0, 4]], [[2, 0], [2, 4]], [[0, 0], [1, 1.4], [2, 0]]],
  thurisaz: [[[0, 0], [0, 4]], [[0, 0.8], [2, 2], [0, 3.2]]],
  sowilo: [[[2, 0], [0, 1.4], [2, 2.6], [0, 4]]],
  othala: [[[1, 0], [0, 1.8], [1, 3.6], [2, 1.8], [1, 0]], [[0, 4], [1, 3.2], [2, 4]]],
  ingwaz: [[[1, 0], [0, 2], [1, 4], [2, 2], [1, 0]]],
  isa: [[[1, 0], [1, 4]], [[0, 1.2], [2, 1.2]]],
  tiwaz: [[[1, 0], [1, 4]], [[0, 1.4], [1, 0], [2, 1.4]]],
};

/** which shapes belong to which meaning, so the shape says it as well as the colour */
const FOR_VOCAB: Record<Vocab, string[]> = {
  trust: ['gebo', 'fehu'],
  resist: ['isa', 'sowilo'],
  rival: ['dagaz', 'hagalaz'],
  rain: ['laguz', 'ehwaz'],
  danger: ['thurisaz', 'sowilo'],
  safe: ['othala', 'ingwaz'],
  neutral: ['tiwaz', 'isa'],
};

function glow(g: CanvasRenderingContext2D, draw: () => void): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const pass of [0, 1]) {
    g.shadowColor = 'rgba(255,255,255,0.95)';
    g.shadowBlur = pass === 0 ? 14 : 4;
    g.strokeStyle = 'rgba(255,255,255,' + (pass === 0 ? '0.5' : '1') + ')';
    g.lineWidth = pass === 0 ? 12 : 6.5;
    draw();
  }
}

function runeCanvas(paths: Path[], seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext('2d');
  if (!g) return c;
  const X = (i: number): number => 40 + i * 24;
  const Y = (j: number): number => 26 + j * 19;
  glow(g, () => {
    for (const line of paths) {
      g.beginPath();
      line.forEach(([x, y], i) => (i === 0 ? g.moveTo(X(x), Y(y)) : g.lineTo(X(x), Y(y))));
      g.stroke();
    }
  });
  // a double ring around it, broken in a place that is different for each rune, and four ticks
  g.shadowBlur = 8;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  const gap = ((seed * 2654435761) % 628) / 100;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(SIZE / 2, SIZE / 2, 57, gap + 0.45, gap + Math.PI * 2 - 0.45);
  g.stroke();
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(SIZE / 2, SIZE / 2, 50, gap + 1.2, gap + Math.PI * 2 + 0.6);
  g.stroke();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + gap;
    g.beginPath();
    g.moveTo(SIZE / 2 + Math.cos(a) * 44, SIZE / 2 + Math.sin(a) * 44);
    g.lineTo(SIZE / 2 + Math.cos(a) * 50, SIZE / 2 + Math.sin(a) * 50);
    g.stroke();
  }
  return c;
}

function eyeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext('2d');
  if (!g) return c;
  glow(g, () => {
    g.beginPath();
    g.moveTo(14, 64);
    g.quadraticCurveTo(64, 14, 114, 64);
    g.quadraticCurveTo(64, 114, 14, 64);
    g.stroke();
  });
  g.shadowBlur = 8;
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.arc(64, 64, 15, 0, Math.PI * 2);
  g.fill();
  return c;
}

export interface Glyphs {
  /** a material for a shape of this vocabulary (`salt` picks among its shapes) */
  forVocab(v: Vocab, salt: number): THREE.SpriteMaterial;
  eye: THREE.SpriteMaterial;
  dispose(): void;
}

export function makeGlyphs(): Glyphs {
  const mats = new Map<string, THREE.SpriteMaterial>();
  const mk = (canvas: HTMLCanvasElement): THREE.SpriteMaterial => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0, color: 0xffffff });
  };
  Object.keys(RUNES).forEach((name, i) => mats.set(name, mk(runeCanvas(RUNES[name], i + 3))));
  const eye = mk(eyeCanvas());
  return {
    forVocab(v, salt) {
      const names = FOR_VOCAB[v];
      return mats.get(names[Math.abs(Math.floor(salt)) % names.length]) as THREE.SpriteMaterial;
    },
    eye,
    dispose() {
      for (const m of mats.values()) {
        m.map?.dispose();
        m.dispose();
      }
      eye.map?.dispose();
      eye.dispose();
    },
  };
}
