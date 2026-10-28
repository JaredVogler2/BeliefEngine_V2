/**
 * Photograph the real 3D world: loads an engine state (played by a bot, never a mock) into a running copy of the game, waits for the
 * Three.js scene, puts the camera exactly where asked and saves what the canvas shows, with the interface hidden or not.
 *
 *   npx vite --host 127.0.0.1 --port 5173 &        # or npm run build && npm run preview (port 4173)
 *   npx tsx scripts/capture-3d.ts --day 6 --policy threat-aware --seed 2 --size 1440x900 --out docs/3d-rebuild/screenshots/shot.jpg [--view az=28,el=44,dist=20,x=14,z=9]
 *       [--quality high] [--hud 0|1] [--url http://127.0.0.1:5173] [--wait 1500] [--renderer 3d|2d] [--day 5] [--policy evidence-first] [--seed 1] [--scenario redbank]
 *       [--resolve 1 --t 1.2]   play day N in full, load the dawn after it, then play that day's real events and let 1.2 s of effects run
 *       [--settle 4] [--dpr 2]
 *       [--night 1]   the light of the night (as while the night's summary is open), settled before the shot and before --resolve
 *       [--trace hens]   a recorded Generative Reality chain (tests/fixtures/v2-bridge-traces.json) instead of a bot
 *       [--save run.json]   a saved run instead (its own script says how it was made)
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GameSession, serializeRun, type Action, type CreateRunOptions } from '../src/engine/index.ts';
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
const sheet = arg('sheet', '');
const lens = arg('lens', '');
const focus = arg('focus', ''); // villager:ivo or landmark:br: put the camera close on it before the shot
mkdirSync(dirname(out), { recursive: true });

// --trace hens: a recorded Generative Reality chain (tests/fixtures/v2-bridge-traces.json) instead of a bot: its own run options,
// replayed action by action to the start of --day (with --resolve, through that day's End Day)
const traceKey = arg('trace', '');
const trace = traceKey ? (JSON.parse(readFileSync('tests/fixtures/v2-bridge-traces.json', 'utf8')) as Record<string, { opts: CreateRunOptions; actions: Action[] }>)[traceKey] : null;
if (traceKey && !trace) throw new Error(`no recorded chain "${traceKey}"`);
const g = GameSession.create(trace ? trace.opts : { scenarioId: scenario, seed });
const p = policyById(policy);
const queue = trace ? trace.actions.slice() : [];
/** a recorded chain's actions until the run reaches `until` (a new day) or the chain runs out */
const playTraceTo = (until: number): void => {
  while (queue.length && g.state.day < until && !g.state.outcome) g.act(queue.shift()!);
};
if (trace) playTraceTo(day);
else for (let i = 1; i < day && !g.state.outcome; i++) p.playDay(g);
const resolve = arg('resolve', '0') === '1';
const tAfter = Number(arg('t', '1.0'));
let prevJson = '';
let dayEvents: unknown[] = [];
if (resolve) {
  // the day's own actions first (the bell rung, the lantern lit), then the night itself
  if (trace) while (queue.length && queue[0].type !== 'END_DAY') g.act(queue.shift()!);
  prevJson = serializeRun(g.state);
  const from = g.state.log.length;
  if (trace) playTraceTo(day + 1);
  else p.playDay(g);
  dayEvents = g.state.log.slice(from);
}
// --save file.json: a saved run (as the game saves it) instead of either; for states a bot or a chain does not reach, built and
// described by the script that wrote them
const saveFile = arg('save', '');
const json = saveFile ? readFileSync(saveFile, 'utf8') : serializeRun(g.state);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(arg('dpr', '1')), hasTouch: W < 700 });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
// --params post=0&scale=0.8: extra URL switches, passed through as they are (before/after comparisons)
const extra = arg('params', '');
await page.goto(`${base}/?debug=1&renderer=${renderer}&quality=${quality}${extra ? `&${extra}` : ''}`);
await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
await page.evaluate((j) => (window as unknown as { __belief: { load: (j: string) => boolean } }).__belief.load(j), json);
await page.waitForSelector('.stage[data-ready="1"], [data-testid="debrief-scene"][data-ready="1"], [data-testid="debrief-scene"][data-renderer="2d"]', { timeout: 60000 }).catch(async () => { await page.waitForSelector('[data-testid="debrief"]', { timeout: 60000 }); });
if (sel) {
  const [kind, id] = sel.split(':');
  await page.evaluate(([k, i]) => (window as unknown as { __belief: { store: { select: (s: unknown) => void } } }).__belief.store.select({ kind: k, id: i }), [kind, id]);
}
if (sheet) await page.evaluate((t) => (window as unknown as { __belief: { store: { set: (p: unknown) => void } } }).__belief.store.set({ tab: t, sheetOpen: true }), sheet);
if (lens) await page.evaluate((l) => (window as unknown as { __belief: { store: { set: (p: unknown) => void } } }).__belief.store.set({ lens: l }), lens);
if (!hud) {
  await page.addStyleTag({ content: '.hud, .topbar, .side, .sidebar, .claims, .hand, .planbar, .bottombar, .map-tools, .coach, .tip, header, footer { visibility: hidden !important; } .stage { position: fixed !important; inset: 0 !important; }' });
}
await page.waitForTimeout(wait);
if (arg('night', '0') === '1' && renderer === '3d') {
  await page.evaluate(() => {
    const r = (window as unknown as { __beRenderer: { setOptions: (o: { night: boolean }) => void; advance: (s: number) => void } }).__beRenderer;
    r.setOptions({ night: true });
    r.advance(3);
  });
}
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
// the debrief's aftermath scene owns its renderer: there is nothing to steer or to register under __beRenderer there
if (renderer === '3d' && focus && (await page.evaluate(() => !!(window as unknown as { __beRenderer?: unknown }).__beRenderer))) {
  const [fk, fi] = focus.split(':');
  await page.evaluate(
    ([k, i]) => {
      const w = window as unknown as { __beRenderer: { focusVillager: (i: string) => void; focusTile: (x: number, y: number, z?: number) => void; advance: (s: number) => void }; __belief: { state: { world: { landmarks: { id: string; x: number; y: number }[] } } } };
      if (k === 'villager') w.__beRenderer.focusVillager(i);
      else {
        const l = w.__belief.state.world.landmarks.find((q) => q.id === i);
        if (l) w.__beRenderer.focusTile(l.x, l.y, 4);
      }
      w.__beRenderer.advance(2.5);
    },
    [fk, fi],
  );
}
// --settle 4: run 4 s of world time first, so the camera and its margins for the interface have arrived (software GL draws few frames)
const settle = Number(arg('settle', '0'));
if (renderer === '3d' && settle > 0 && (await page.evaluate(() => !!(window as unknown as { __beRenderer?: unknown }).__beRenderer))) {
  await page.evaluate((s) => (window as unknown as { __beRenderer: { advance: (s: number) => void } }).__beRenderer.advance(s), settle);
}
if (renderer === '3d' && (await page.evaluate(() => !!(window as unknown as { __beRenderer?: unknown }).__beRenderer))) {
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
const info = renderer === '3d' ? await page.evaluate(() => (window as unknown as { __beRenderer?: { info?: () => unknown } }).__beRenderer?.info?.() ?? null) : null;
if (renderer === '3d' && arg('breakdown', '0') === '1') { console.log(JSON.stringify(await page.evaluate(() => (window as unknown as { __beRenderer: { breakdown: () => unknown } }).__beRenderer.breakdown()))); console.log((await page.evaluate(() => (window as unknown as { __beRenderer: { heaviest: () => { layer: string; name: string; instances: number; trianglesEach: number; triangles: number }[] } }).__beRenderer.heaviest())).map((r) => `${r.layer}/${r.name} x${r.instances} (${r.trianglesEach} each) = ${r.triangles}`).join('\n')); }
if (renderer === '3d' && arg('profile', '0') === '1') console.log(JSON.stringify(await page.evaluate(() => (window as unknown as { __beRenderer: { profileParts: () => Promise<unknown> } }).__beRenderer.profileParts()), null, 1));
console.log(`wrote ${out}  ${W}x${H}  ${quality}  ${info ? JSON.stringify(info) : ''}${errors.length ? `\nERRORS: ${errors.slice(0, 4).join(' | ')}` : ''}`);
await browser.close();
