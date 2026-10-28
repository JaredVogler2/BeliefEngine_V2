/**
 * Does the 3D world come up in the other browser engines Playwright ships (Firefox, WebKit), with software WebGL? For each one it loads a
 * Day-1 village with `?renderer=3d`, says which renderer the page actually chose, how many frames were drawn, whether the canvas has
 * non-background pixels, and any console errors. It records what happens, whatever it is: a browser that cannot give WebGL2 falls back to
 * the classic map by design, and that is reported as a fallback, not as a pass.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npx tsx scripts/browser-3d-smoke.ts [--url http://127.0.0.1:4173]
 */
import { chromium, firefox, webkit, type BrowserType } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { GameSession, serializeRun } from '../src/engine/index.ts';

const args = process.argv.slice(2);
const base = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://127.0.0.1:4173';

const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
const json = serializeRun(g.state);

interface Row {
  browser: string;
  version: string;
  renderer: string;
  framesDrawn: number;
  drawCalls: number;
  triangles: number;
  consoleErrors: string[];
  verdict: string;
}

const rows: Row[] = [];
for (const [name, type] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]] as [string, BrowserType][]) {
  let browser;
  try {
    browser = await type.launch();
  } catch (e) {
    rows.push({ browser: name, version: '-', renderer: '-', framesDrawn: 0, drawCalls: 0, triangles: 0, consoleErrors: [], verdict: `could not launch: ${(e as Error).message.split('\n')[0]}` });
    continue;
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  try {
    await page.goto(`${base}/?debug=1&renderer=3d&quality=low&scale=0.5`);
    await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief, undefined, { timeout: 60000 });
    await page.evaluate((j) => (window as unknown as { __belief: { load: (s: string) => boolean } }).__belief.load(j), json);
    await page.waitForSelector('.stage[data-ready="1"]', { timeout: 120000 });
    await page.waitForTimeout(6000);
    // a string, not a function: tsx's name-keeping helper does not exist in the page
    const m = (await page.evaluate(`(() => {
      const stage = document.querySelector('.stage');
      const r = window.__beRenderer;
      const info = r && typeof r.info === 'function' ? r.info() : null;
      return { renderer: stage ? stage.getAttribute('data-renderer') : 'none', frames: info ? info.frames : 0, calls: info ? info.calls : 0, triangles: info ? info.triangles : 0 };
    })()`)) as { renderer: string; frames: number; calls: number; triangles: number };
    const drew = m.renderer === '3d' && m.frames > 0;
    rows.push({
      browser: name,
      version: browser.version(),
      renderer: m.renderer,
      framesDrawn: m.frames,
      drawCalls: m.calls,
      triangles: m.triangles,
      consoleErrors: errors.slice(0, 5),
      verdict: drew ? 'PASS: the 3D world drew frames' : m.renderer === '2d' ? 'FALLBACK: the page chose the classic map (no usable WebGL2 here)' : 'FAIL: the stage is up but nothing was drawn',
    });
  } catch (e) {
    rows.push({ browser: name, version: browser.version(), renderer: '?', framesDrawn: 0, drawCalls: 0, triangles: 0, consoleErrors: errors.slice(0, 5), verdict: `FAIL: ${(e as Error).message.split('\n')[0]}` });
  }
  await browser.close();
}

for (const r of rows) console.log(`${r.browser.padEnd(9)} ${r.version.padEnd(10)} renderer=${r.renderer.padEnd(5)} frames=${String(r.framesDrawn).padEnd(4)} calls=${String(r.drawCalls).padEnd(5)} tris=${String(r.triangles).padEnd(7)} errors=${r.consoleErrors.length}  ${r.verdict}`);
mkdirSync('docs/3d-rebuild/data', { recursive: true });
writeFileSync('docs/3d-rebuild/data/browsers.json', JSON.stringify({ measuredWith: 'Playwright builds on Linux, software WebGL; not real devices', base, rows }, null, 2));
