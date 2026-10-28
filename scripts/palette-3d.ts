/**
 * The 3D world's palette, measured (3D plan, stage 2; the bands in docs/3D_VISUAL_STANDARD.md §11): the planning afternoon, the light
 * going down at three moments of the change, and the night of the same village, from the production build in Chromium (software
 * WebGL), the world's own canvas only (no interface).
 *
 *   npm run build && npx tsx scripts/palette-3d.ts [--scenario redbank] [--seed 1] [--quality high] [--size 1366x768] [--out <dir>]
 *       [--dist dist]   a build in another folder (vite build --outDir), so a running browser suite keeps its own
 *
 * Per frame, over the whole canvas and over the world alone (the pixels that are not the sky or the sea of cloud, found by drawing the
 * same frame again with that backdrop hidden; stage 3 replaces the backdrop with landform): mean luminance (sRGB luma), the share of
 * deep shadow (luma < 0.12), of warm pixels (hue 15-60°, saturation >= 0.35, value >= 0.35) and of hot cores (luma >= 0.75, hue 25-70°,
 * saturation >= 0.25); and water against land: the mean luma round the middle of every river tile and of every grass or field tile in
 * view. The standard asks of a night: mean 0.25-0.40, deep 10-25%, warm 8-18%, hot at most 2.5%; of a day: mean 0.40-0.60, water darker
 * than land.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { serveDist } from './serve-dist.ts';

const { chromium } = createRequire(import.meta.url)('@playwright/test') as typeof import('@playwright/test');
const arg = (name: string, d: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const scenario = arg('scenario', 'redbank');
const seed = arg('seed', '1');
const quality = arg('quality', 'high');
const [W, H] = arg('size', '1366x768').split('x').map(Number);
const out = arg('out', '');
const dist = arg('dist', 'dist');
const port = 4190 + Math.floor(Math.random() * 50);

interface Stats { mean: number; deep: number; warm: number; hot: number }
interface Frame { frame: Stats; world: Stats; worldShare: number; water: number | null; land: number | null }

const server = await serveDist(port, dist);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
await ctx.addInitScript('window.__name = function (f) { return f; };'); // tsx keeps function names; the page has no such helper
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/?debug=1&renderer=3d&quality=${quality}`);
await page.getByTestId('play').click();
await page.getByTestId(`begin-${scenario}`).click();
await page.getByTestId('seed').fill(seed);
await page.getByTestId('begin').click();
await page.waitForSelector('.stage[data-renderer="3d"][data-ready="1"]', { timeout: 180_000 });
await page.waitForTimeout(3000);
// from here time passes only when the script says so (the live loop would move the light on between two readings)
await page.evaluate(() => (window as unknown as { __beRenderer: { setFrozen: (on: boolean) => void } }).__beRenderer.setFrozen(true));

async function measure(): Promise<{ m: Frame; png: string }> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __beRenderer: { renderNow: () => void; maskBackdrop: (on: boolean) => void; tileScreen: (x: number, y: number) => { x: number; y: number } | null };
      __belief: { state: { world: { w: number; h: number; terrain: number[] } } };
    };
    const c = document.querySelector('.stage canvas') as HTMLCanvasElement;
    const scratch = document.createElement('canvas');
    scratch.width = c.width;
    scratch.height = c.height;
    const g = scratch.getContext('2d', { willReadFrequently: true })!;
    const grab = (): Uint8ClampedArray => {
      w.__beRenderer.renderNow();
      g.drawImage(c, 0, 0);
      return g.getImageData(0, 0, c.width, c.height).data;
    };
    const img = grab();
    const png = scratch.toDataURL('image/jpeg', 0.85);
    // the same frame with the backdrop hidden and cleared to magenta: what is not magenta is the world
    w.__beRenderer.maskBackdrop(true);
    const masked = grab();
    w.__beRenderer.maskBackdrop(false);
    w.__beRenderer.renderNow();
    const n = c.width * c.height;
    const isWorld = new Uint8Array(n);
    for (let i = 0; i < n; i++) isWorld[i] = masked[i * 4] > 150 && masked[i * 4 + 2] > 150 && masked[i * 4 + 1] < 90 ? 0 : 1;
    const luma = (i: number): number => (0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2]) / 255;
    const stats = (only: Uint8Array | null): { s: { mean: number; deep: number; warm: number; hot: number }; count: number } => {
      let sum = 0;
      let deep = 0;
      let warm = 0;
      let hot = 0;
      let count = 0;
      for (let k = 0; k < n; k++) {
        if (only && !only[k]) continue;
        count++;
        const i = k * 4;
        const r = img[i] / 255;
        const gg = img[i + 1] / 255;
        const b = img[i + 2] / 255;
        const y = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        sum += y;
        if (y < 0.12) deep++;
        const max = Math.max(r, gg, b);
        const min = Math.min(r, gg, b);
        const sat = max > 0 ? (max - min) / max : 0;
        let hue = 0;
        if (max > min) {
          if (max === r) hue = (60 * ((gg - b) / (max - min)) + 360) % 360;
          else if (max === gg) hue = 60 * ((b - r) / (max - min)) + 120;
          else hue = 60 * ((r - gg) / (max - min)) + 240;
        }
        if (hue >= 15 && hue <= 60 && sat >= 0.35 && max >= 0.35) warm++;
        if (y >= 0.75 && hue >= 25 && hue <= 70 && sat >= 0.25) hot++;
      }
      const d = Math.max(1, count);
      return { s: { mean: sum / d, deep: deep / d, warm: warm / d, hot: hot / d }, count };
    };
    const frame = stats(null);
    const world = stats(isWorld);
    // water against land: the mean luma round the middle of every river tile and every grass or field tile in view
    const scale = c.width / c.getBoundingClientRect().width;
    const st = w.__belief.state.world;
    const around = (x: number, y: number): number => {
      let s = 0;
      let k = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const px = Math.round(x * scale) + dx;
          const py = Math.round(y * scale) + dy;
          if (px < 0 || py < 0 || px >= c.width || py >= c.height) continue;
          s += luma((py * c.width + px) * 4);
          k++;
        }
      return k ? s / k : NaN;
    };
    const water: number[] = [];
    const land: number[] = [];
    for (let ty = 0; ty < st.h; ty++)
      for (let tx = 0; tx < st.w; tx++) {
        const t = st.terrain[ty * st.w + tx];
        if (t !== 1 && t !== 0 && t !== 2) continue;
        const p = w.__beRenderer.tileScreen(tx, ty);
        if (!p) continue;
        const v = around(p.x, p.y);
        if (Number.isNaN(v)) continue;
        (t === 1 ? water : land).push(v);
      }
    const avg = (a: number[]): number | null => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    return { m: { frame: frame.s, world: world.s, worldShare: world.count / n, water: avg(water), land: avg(land) }, png };
  });
}

const results: Record<string, Frame> = {};
// the afternoon, then the light going down (End Day) at three moments of the change, then the full night
const steps: [string, boolean, number][] = [['afternoon', false, 4], ['sinking', true, 0.65], ['sundown', true, 0.52], ['dusk', true, 0.65], ['night', true, 4]];
for (const [name, night, seconds] of steps) {
  await page.evaluate(([v, t]) => {
    const r = (window as unknown as { __beRenderer: { setOptions: (o: { night: boolean }) => void; advance: (s: number) => void } }).__beRenderer;
    r.setOptions({ night: v });
    r.advance(t);
  }, [night, seconds] as [boolean, number]);
  const { m, png } = await measure();
  results[name] = m;
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(`${out}/${scenario}-${seed}-${name}-${quality}.jpg`, Buffer.from(png.split(',')[1], 'base64'));
  }
}
const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
const f = (v: number | null): string => (v === null ? 'n/a' : v.toFixed(3));
const row = (s: Stats): string => `mean ${s.mean.toFixed(3)}  deep ${pct(s.deep)}  warm ${pct(s.warm)}  hot ${pct(s.hot)}`;
console.log(`${scenario} seed ${seed}, ${quality}, ${W}x${H}: the whole frame, and the world alone (without the sky and the sea of cloud)`);
for (const [name, r] of Object.entries(results)) {
  console.log(`  ${name.padEnd(9)} frame  ${row(r.frame)}`);
  console.log(`  ${''.padEnd(9)} world  ${row(r.world)}  (${pct(r.worldShare)} of the frame)  water ${f(r.water)}  land ${f(r.land)}`);
}
await browser.close();
server.close();
