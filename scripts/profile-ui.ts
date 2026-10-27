/**
 * Measures what a player waits for, in a real browser, and prints a Markdown table. Run it against the preview server:
 *
 *   npm run build && npm run preview &
 *   npx tsx scripts/profile-ui.ts [--runs 5] [--out docs/data/ui-profile.json]
 *
 * Headless Chromium on a software renderer is slower than a phone's GPU and faster than a throttled CPU, so the numbers are a
 * regression guard and a reproducible baseline, not a claim about any particular device. The machine is printed with the results.
 */
import { chromium, type Page } from '@playwright/test';
import { writeFileSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import { GameSession, serializeRun } from '../src/engine/index.ts';
import { policyById } from '../src/engine/ai/bots/generic.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const runs = Number(arg('runs', '5'));
const base = arg('url', 'http://127.0.0.1:4173');
const out = arg('out', '');

const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const fmt = (xs: number[]) => `${Math.round(median(xs))} ms (min ${Math.round(Math.min(...xs))}, max ${Math.round(Math.max(...xs))})`;

async function once(page: Page, late: string) {
  const t: Record<string, number> = {};
  const t0 = Date.now();
  await page.goto(`${base}/?debug=1`);
  await page.getByTestId('title').waitFor();
  t.titleVisible = Date.now() - t0;
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd };
  });
  t.domContentLoaded = nav.dcl;
  t.loadEvent = nav.load;
  await page.getByTestId('play').click();
  await page.getByTestId('begin-redbank').click();
  const t1 = Date.now();
  await page.getByTestId('begin').click();
  await page.getByTestId('play').waitFor();
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas');
    const g = c?.getContext('2d');
    if (!c || !g) return false;
    const first = g.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
    for (let y = 0.2; y < 0.8; y += 0.1) for (let x = 0.2; x < 0.8; x += 0.1) {
      const d = g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data;
      if (Math.abs(d[0] - first[0]) + Math.abs(d[1] - first[1]) + Math.abs(d[2] - first[2]) > 24) return true;
    }
    return false;
  });
  t.beginToMapPainted = Date.now() - t1;
  // first interactive action: pick a story and tell someone
  const t2 = Date.now();
  await page.locator('[data-claim="river_fears_fire"]').click();
  await page.getByTestId('tab-village').click();
  await page.getByRole('button', { name: /^Ivo/ }).first().click();
  await page.locator('.act', { hasText: 'Tell Ivo' }).click();
  await page.getByTestId('ap').waitFor();
  t.firstActionToConfirmed = Date.now() - t2;
  // end of turn: confirm to digest
  await page.getByTestId('end-day').click();
  const t3 = Date.now();
  await page.getByTestId('confirm-end').click();
  await page.getByTestId('digest').waitFor();
  t.endDayToDigest = Date.now() - t3;
  // animation frame pacing while the resolution plays
  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const s = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - s >= 1500) resolve((n * 1000) / (performance.now() - s));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  t.fpsDuringResolution = fps;
  // load a late-game village (law live, many events) and time save / load round trip in the page
  await page.evaluate((json) => (window as unknown as { __belief: { load: (j: string) => boolean } }).__belief.load(json), late);
  await page.getByTestId('play').waitFor();
  t.heapMb = await page.evaluate(() => ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576);
  return t;
}

function bundle() {
  const dir = 'dist/assets';
  const files = readdirSync(dir).map((f) => ({ f, raw: statSync(join(dir, f)).size, gz: gzipSync(readFileSync(join(dir, f))).length }));
  const sum = (ext: string) => files.filter((x) => x.f.endsWith(ext)).reduce((a, x) => ({ raw: a.raw + x.raw, gz: a.gz + x.gz }), { raw: 0, gz: 0 });
  return { js: sum('.js'), css: sum('.css'), files };
}

const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
const p = policyById('evidence-first');
for (let i = 0; i < 5; i++) p.playDay(g);
const late = serializeRun(g.state);

const browser = await chromium.launch();
const samples: Record<string, number>[] = [];
for (let i = 0; i < runs; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript('window.__name = function (f) { return f; };'); // tsx keeps function names; the page has no such helper
  samples.push(await once(await ctx.newPage(), late));
  await ctx.close();
}
await browser.version();
const ver = browser.version();
await browser.close();

const keys = Object.keys(samples[0]);
const result: Record<string, number> = {};
for (const k of keys) result[k] = median(samples.map((s) => s[k]));
const b = bundle();
const md = [
  `Machine: ${cpus().length} x ${cpus()[0].model.trim()}, ${(totalmem() / 2 ** 30).toFixed(1)} GB RAM, Chromium ${ver} (headless, software rendering), ${runs} cold runs, 1366x768.`,
  '',
  '| Measure | Median (min-max) |',
  '| --- | --- |',
  `| Navigation: DOMContentLoaded | ${fmt(samples.map((s) => s.domContentLoaded))} |`,
  `| Navigation: load event | ${fmt(samples.map((s) => s.loadEvent))} |`,
  `| Title screen visible | ${fmt(samples.map((s) => s.titleVisible))} |`,
  `| Begin -> map painted | ${fmt(samples.map((s) => s.beginToMapPainted))} |`,
  `| Story + villager + action -> Influence updated | ${fmt(samples.map((s) => s.firstActionToConfirmed))} |`,
  `| Confirm End Day -> digest on screen | ${fmt(samples.map((s) => s.endDayToDigest))} |`,
  `| Frames per second while the resolution plays | ${Math.round(median(samples.map((s) => s.fpsDuringResolution)))} (min ${Math.round(Math.min(...samples.map((s) => s.fpsDuringResolution)))}) |`,
  `| JS heap after loading a late-game village | ${median(samples.map((s) => s.heapMb)).toFixed(1)} MB |`,
  `| Production JS | ${(b.js.raw / 1024).toFixed(0)} KB raw, ${(b.js.gz / 1024).toFixed(0)} KB gzip |`,
  `| Production CSS | ${(b.css.raw / 1024).toFixed(0)} KB raw, ${(b.css.gz / 1024).toFixed(0)} KB gzip |`,
].join('\n');
console.log(md);
if (out) writeFileSync(out, JSON.stringify({ machine: `${cpus().length} cpus`, chromium: ver, runs, result, bundle: { js: b.js, css: b.css } }, null, 1) + '\n');
