/**
 * Photograph the real 3D world: loads an engine state (played by a bot, never a mock) into a running copy of the game, waits for the
 * Three.js scene, puts the camera exactly where asked and saves what the canvas shows, with the interface hidden or not.
 *
 *   npx vite --host 127.0.0.1 --port 5173 &        # or npm run build && npm run preview (port 4173)
 *   npx tsx scripts/capture-3d.ts --state calm --size 1440x900 --out docs/3d-rebuild/screenshots/A.png [--view az=28,el=44,dist=20,x=14,z=9]
 *       [--quality high] [--hud 0|1] [--url http://127.0.0.1:5173] [--wait 1500] [--renderer 3d|2d] [--day 5] [--policy evidence-first] [--seed 1] [--scenario redbank]
 *       [--resolve 1 --t 1.2]   play day N in full, load the dawn after it, then play that day's real events and let 1.2 s of effects run
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { GameSession, serializeRun } from '../src/engine/index.ts';
import { policyById } from '../src/engine/ai/bots/generic.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const out = arg('out', 'docs/3d-rebuild/screenshots/shot.png');
const [W, H] = arg('size', '1440x900').split('x').map(Number);
const base = arg('url', 'http://127.0.0.1:5173');
const quality = arg('quality', 'high');
const hud = arg('hud', '0') === '1';
const wait = Number(arg('wait', '1500'));
const renderer = arg('renderer', '3d');
const scenario = arg('scenario', 'redbank');
const seed = Number(arg('seed', '1'));
const policy = arg('policy', 'evidence-first');
const day = Number(arg('day', '1'));
const view = Object.fromEntries(arg('view', '').split(',').filter(Boolean).map((kv) => kv.split('=') as [string, string]));
const sel = arg('select', '');
mkdirSync(dirname(out), { recursive: true });

const g = GameSession.create({ scenarioId: scenario, seed });
const p = policyById(policy);
for (let i = 1; i < day && !g.state.outcome; i++) p.playDay(g);
const resolve = arg('resolve', '0') === '1';
const tAfter = Number(arg('t', '1.0'));
let prevJson = '';
let dayEvents: unknown[] = [];
if (resolve) {
  prevJson = serializeRun(g.state);
  const from = g.state.log.length;
  p.playDay(g);
  dayEvents = g.state.log.slice(from);
}
const json = serializeRun(g.state);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(arg('dpr', '1')), hasTouch: W < 700 });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/?debug=1&renderer=${renderer}&quality=${quality}`);
await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
await page.evaluate((j) => (window as unknown as { __belief: { load: (j: string) => boolean } }).__belief.load(j), json);
await page.waitForSelector('.stage[data-ready="1"]', { timeout: 60000 });
if (sel) {
  const [kind, id] = sel.split(':');
  await page.evaluate(([k, i]) => (window as unknown as { __belief: { store: { select: (s: unknown) => void } } }).__belief.store.select({ kind: k, id: i }), [kind, id]);
}
if (!hud) {
  await page.addStyleTag({ content: '.hud, .topbar, .side, .sidebar, .claims, .hand, .planbar, .bottombar, .map-tools, .coach, .tip, header, footer { visibility: hidden !important; } .stage { position: fixed !important; inset: 0 !important; }' });
}
await page.waitForTimeout(wait);
if (resolve) {
  await page.evaluate(
    ([ev, prev, t]) => {
      const w = window as unknown as { __belief: { parse: (j: string) => unknown }; __beRenderer: { playResolution: (e: unknown, p: unknown) => void; advance: (s: number) => void } };
      w.__beRenderer.playResolution(JSON.parse(ev as string), w.__belief.parse(prev as string));
      w.__beRenderer.advance(t as number);
    },
    [JSON.stringify(dayEvents), prevJson, tAfter] as [string, string, number],
  );
}
if (renderer === '3d') {
  const numeric = Object.fromEntries(Object.entries(view).map(([k, v]) => [k === 'az' ? 'azimuthDeg' : k === 'el' ? 'elevationDeg' : k, Number(v)]));
  await page.evaluate((v) => {
    const r = (window as unknown as { __beRenderer: { setView: (v: unknown) => void; renderNow: () => void; fit: () => void } }).__beRenderer;
    if (Object.keys(v).length) r.setView(v);
    r.renderNow();
  }, numeric);
  await page.waitForTimeout(400);
  await page.evaluate(() => (window as unknown as { __beRenderer: { renderNow: () => void } }).__beRenderer.renderNow());
}
if (hud) await page.screenshot({ path: out });
else await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H }, timeout: 120000 });
const info = renderer === '3d' ? await page.evaluate(() => (window as unknown as { __beRenderer: { info?: () => unknown } }).__beRenderer.info?.()) : null;
if (renderer === '3d' && arg('breakdown', '0') === '1') { console.log(JSON.stringify(await page.evaluate(() => (window as unknown as { __beRenderer: { breakdown: () => unknown } }).__beRenderer.breakdown()))); console.log((await page.evaluate(() => (window as unknown as { __beRenderer: { heaviest: () => { layer: string; name: string; instances: number; trianglesEach: number; triangles: number }[] } }).__beRenderer.heaviest())).map((r) => `${r.layer}/${r.name} x${r.instances} (${r.trianglesEach} each) = ${r.triangles}`).join('\n')); }
if (renderer === '3d' && arg('profile', '0') === '1') console.log(JSON.stringify(await page.evaluate(() => (window as unknown as { __beRenderer: { profileParts: () => Promise<unknown> } }).__beRenderer.profileParts()), null, 1));
console.log(`wrote ${out}  ${W}x${H}  ${quality}  ${info ? JSON.stringify(info) : ''}${errors.length ? `\nERRORS: ${errors.slice(0, 4).join(' | ')}` : ''}`);
await browser.close();
