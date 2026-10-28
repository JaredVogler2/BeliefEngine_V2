/**
 * Measure the 3D world on whatever this machine can run it on, per quality tier, for the calm village and the flood night:
 * scene cost (triangles and draw calls of every pass, geometries, textures), time from loading a run to the first drawn frame (and, within
 * it, the world's own build: terrain, buildings, foliage and people made into meshes), the
 * page's JS heap, and frame times drawn back to back: the median, the 1% low (the 99th-percentile frame), and the same without the
 * finishing chain, so the chain's own cost shows.
 *
 * Honest limit: in a container the only WebGL is a software rasteriser (SwiftShader), so the frame times below are a CPU
 * rasteriser's, useful for comparing tiers and for catching regressions, and nothing like a GPU's. The numbers that do carry over to
 * real hardware are the scene counts and the memory. Output: a table on stdout and docs/3d-rebuild/data/perf.json.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npx tsx scripts/perf-3d.ts [--url http://127.0.0.1:4173] [--frames 40] [--size 1366x768] [--scale 0.5] [--out docs/3d-rebuild/data/perf.json]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { GameSession, serializeRun } from '../src/engine/index.ts';
import { policyById } from '../src/engine/ai/bots/generic.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const base = arg('url', 'http://127.0.0.1:4173');
const scale = Number(arg('scale', '0.5'));
const outFile = arg('out', 'docs/3d-rebuild/data/perf.json');
const [W, H] = arg('size', '1366x768').split('x').map(Number);

const played = (days: number, policy: string, seed: number): string => {
  const g = GameSession.create({ scenarioId: 'redbank', seed });
  const p = policyById(policy);
  for (let i = 0; i < days && !g.state.outcome; i++) p.playDay(g);
  return serializeRun(g.state);
};
const scenes = { calm: played(0, 'noop', 1), flood: played(5, 'threat-aware', 2) } as const;

interface Row {
  tier: string;
  scene: string;
  scale: number;
  triangles: number;
  calls: number;
  geometries: number;
  textures: number;
  startupMs: number;
  buildMs: number;
  heapMb: number;
  medianMs: number;
  medianFps: number;
  low1Fps: number;
  noPostMs: number;
  chainMs: number;
  post: string;
}

const frames = Number(arg('frames', '40'));
const browser = await chromium.launch();
const rows: Row[] = [];
for (const tier of ['low', 'medium', 'high']) {
  for (const [name, json] of Object.entries(scenes)) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const page = await ctx.newPage();
    await page.goto(`${base}/?debug=1&renderer=3d&quality=${tier}&scale=${scale}`);
    await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
    // startup: from handing the page a run to the first drawn frame of its world (the 3D chunk is already loaded by then)
    const t0 = Date.now();
    await page.evaluate((j) => (window as unknown as { __belief: { load: (s: string) => boolean } }).__belief.load(j), json);
    await page.waitForSelector('.stage[data-ready="1"]', { timeout: 120000 });
    await page.waitForFunction(() => ((window as unknown as { __beRenderer?: { info: () => { frames: number } } }).__beRenderer?.info().frames ?? 0) > 0, undefined, { timeout: 120000 });
    const startupMs = Date.now() - t0;
    await page.waitForTimeout(1500);
    // a string, not a function: tsx's name-keeping helper does not exist in the page. Frames are drawn back to back and each one waited
    // for (a one-pixel read), with the finishing chain and then without it, so its cost shows on its own
    const m = (await page.evaluate(`(async () => {
      const r = window.__beRenderer;
      const on = await r.benchmark(${frames});
      const info = r.info();
      r.setPost({ enabled: false });
      const off = await r.benchmark(${frames});
      r.setPost(null);
      const mem = performance.memory;
      return { on, off, info, heap: mem ? mem.usedJSHeapSize / 1048576 : 0 };
    })()`)) as {
      on: { medianMs: number; medianFps: number; low1Fps: number; calls: number; triangles: number };
      off: { medianMs: number };
      info: { scale: number; geometries: number; textures: number; buildMs: number; post: { ao: number; bloom: boolean; fxaa: boolean } | null };
      heap: number;
    };
    const p = m.info.post;
    rows.push({
      tier, scene: name, scale: m.info.scale, triangles: m.on.triangles, calls: m.on.calls, geometries: m.info.geometries, textures: m.info.textures, startupMs,
      buildMs: m.info.buildMs, heapMb: Math.round(m.heap * 10) / 10, medianMs: m.on.medianMs, medianFps: m.on.medianFps, low1Fps: m.on.low1Fps, noPostMs: m.off.medianMs,
      chainMs: Math.round((m.on.medianMs - m.off.medianMs) * 10) / 10, post: p ? `ao${p.ao}${p.bloom ? '+bloom' : ''}${p.fxaa ? '+fxaa' : ''}` : 'off',
    });
    await ctx.close();
  }
}
await browser.close();

console.log('tier    scene  scale  triangles  calls  geoms  tex  startup(ms)  build(ms)  heap(MB)  frame(ms)  fps  1%low  no-chain(ms)  chain(ms)  chain');
for (const r of rows) console.log(`${r.tier.padEnd(7)} ${r.scene.padEnd(6)} ${String(r.scale).padEnd(6)} ${String(r.triangles).padEnd(10)} ${String(r.calls).padEnd(6)} ${String(r.geometries).padEnd(6)} ${String(r.textures).padEnd(4)} ${String(r.startupMs).padEnd(12)} ${String(r.buildMs).padEnd(10)} ${String(r.heapMb).padEnd(9)} ${String(r.medianMs).padEnd(10)} ${String(r.medianFps).padEnd(4)} ${String(r.low1Fps).padEnd(6)} ${String(r.noPostMs).padEnd(13)} ${String(r.chainMs).padEnd(10)} ${r.post}`);
mkdirSync('docs/3d-rebuild/data', { recursive: true });
writeFileSync(outFile, JSON.stringify({ measuredWith: 'headless Chromium, software WebGL (SwiftShader); not a GPU. Frames drawn back to back and waited for (benchmark()), not the paced live loop', viewport: `${W}x${H}`, renderScale: scale, framesPerMeasure: frames, rows }, null, 2));
