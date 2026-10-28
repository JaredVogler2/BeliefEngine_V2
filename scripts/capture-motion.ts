/**
 * Evidence that the world moves, from the real renderer: it loads a Day-1 village, frames the middle of it, then lets the animation clock
 * run in steps of a couple of seconds and photographs the canvas after each step (the live loop is frozen meanwhile, so nothing else moves
 * time; `--dt 0` then measures the noise floor). The frames are joined into one contact strip, and the
 * mean difference between neighbouring frames is measured in four regions (so water, people, sky and ground can each be seen to change
 * or not). Nothing is faked: `advance()` is the same simulate-then-draw the live loop does, taken in bigger steps.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npx tsx scripts/capture-motion.ts [--url http://127.0.0.1:4173] [--steps 6] [--dt 2.0] [--out docs/3d-rebuild/screenshots/motion] [--json docs/3d-rebuild/data/motion.json]
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { GameSession, serializeRun } from '../src/engine/index.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const base = arg('url', 'http://127.0.0.1:4173');
const steps = Number(arg('steps', '6'));
const dt = Number(arg('dt', '2.0'));
const out = arg('out', 'docs/3d-rebuild/screenshots/motion');
const W = 1000;
const H = 640;

mkdirSync(out, { recursive: true });
const json = serializeRun(GameSession.create({ scenarioId: 'redbank', seed: 1 }).state);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(`${base}/?debug=1&renderer=3d&quality=high&scale=1`);
await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
await page.evaluate((j) => (window as unknown as { __belief: { load: (s: string) => boolean } }).__belief.load(j), json);
await page.waitForSelector('.stage[data-ready="1"]', { timeout: 120000 });
await page.addStyleTag({ content: '.hud, .topbar, .side, .claims, .hand, .tray, .modes, .map-tools, .corner, .coach, .stage-note, header, footer { visibility: hidden !important; }' });
await page.waitForTimeout(1500);
// the live loop is frozen so that only advance() moves time; the camera is then run forward until it has arrived at the view
await page.evaluate(`window.__beRenderer.setFrozen(true); window.__beRenderer.setView({ azimuthDeg: 28, elevationDeg: 34, dist: 15, x: 17, z: 11 }); window.__beRenderer.advance(4);`);

const files: string[] = [];
for (let i = 0; i < steps; i++) {
  if (i > 0) await page.evaluate(`window.__beRenderer.advance(${dt})`);
  await page.evaluate('window.__beRenderer.renderNow()');
  await page.waitForTimeout(300);
  const f = `${out}/f${i}.jpg`;
  await page.screenshot({ path: f, clip: { x: 0, y: 0, width: W, height: H } });
  files.push(f);
}
await browser.close();

const compare = (a: string, b: string, crop: string): number => {
  // ImageMagick prints "<absolute error> (<fraction of range>)" on stderr; the fraction is the mean absolute difference
  try {
    execFileSync('sh', ['-c', `convert ${a} -crop ${crop} +repage /tmp/_a.png && convert ${b} -crop ${crop} +repage /tmp/_b.png && compare -metric MAE /tmp/_a.png /tmp/_b.png null: 2>/tmp/_mae.txt || true`]);
    const t = execFileSync('cat', ['/tmp/_mae.txt'], { encoding: 'utf8' });
    const m = /\(([\d.e+-]+)\)/.exec(t);
    return m ? Number(m[1]) : NaN;
  } catch {
    return NaN;
  }
};
const regions: Record<string, string> = {
  'far bank and sky (top fifth)': `${W}x${Math.round(H * 0.2)}+0+0`,
  'river and banks (centre)': `${Math.round(W * 0.3)}x${Math.round(H * 0.5)}+${Math.round(W * 0.35)}+${Math.round(H * 0.25)}`,
  'village (lower right)': `${Math.round(W * 0.4)}x${Math.round(H * 0.4)}+${Math.round(W * 0.55)}+${Math.round(H * 0.55)}`,
  'the whole frame': `${W}x${H}+0+0`,
};
const diffs: Record<string, number[]> = {};
for (const [name, crop] of Object.entries(regions)) {
  diffs[name] = [];
  for (let i = 1; i < files.length; i++) diffs[name].push(Math.round(compare(files[i - 1], files[i], crop) * 100000) / 100000);
}
execFileSync('convert', [...files, '+append', '-resize', '50%', '-quality', '86', `${out}/motion-strip.jpg`]);
writeFileSync(arg('json', 'docs/3d-rebuild/data/motion.json'), JSON.stringify({ measuredWith: 'headless Chromium, software WebGL; advance() steps of the real animation clock', steps, secondsPerStep: dt, meanAbsoluteDifferenceBetweenFrames: diffs }, null, 2));
for (const [name, d] of Object.entries(diffs)) console.log(`${name.padEnd(28)} ${d.map((v) => v.toFixed(4)).join('  ')}`);
console.log(`strip: ${out}/motion-strip.jpg`);
