/**
 * Visual evidence for the art and layout phases: loads real engine states (played by bots, not mocked) into the running preview
 * through the debug loader and photographs them at the supported viewport sizes.
 *
 *   npm run build && npm run preview &        # serves dist/ on 127.0.0.1:4173
 *   npx tsx scripts/capture-states.ts [--out docs/screens] [--sizes 320x568,390x844,768x1024,1440x900] [--states calm,law,hazard,debrief,lens,effect]
 *
 * Nothing here is a mock-up: every picture is the game rendering a state produced by the engine.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { GameSession, serializeRun } from '../src/engine/index.ts';
import { policyById } from '../src/engine/ai/bots/generic.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const out = arg('out', 'docs/screens');
const sizes = arg('sizes', '320x568,390x844,768x1024,1440x900').split(',').map((s) => s.split('x').map(Number) as [number, number]);
const wanted = new Set(arg('states', 'calm,law,hazard,debrief,lens,effect').split(','));
const base = arg('url', 'http://127.0.0.1:4173');
mkdirSync(out, { recursive: true });

function play(scenarioId: string, seed: number, policy: string, days: number): GameSession {
  const g = GameSession.create({ scenarioId, seed });
  const p = policyById(policy);
  for (let i = 0; i < days && !g.state.outcome; i++) p.playDay(g);
  return g;
}

const states: Record<string, string> = {
  calm: serializeRun(GameSession.create({ scenarioId: 'redbank', seed: 1 }).state),
  law: serializeRun(play('redbank', 1, 'evidence-first', 5).state),
  hazard: serializeRun(play('redbank', 1, 'noop', 6).state),
  debrief: serializeRun(play('redbank', 1, 'evidence-first', 20).state),
  lens: serializeRun(play('redbank', 1, 'evidence-first', 3).state),
  effect: serializeRun(play('redbank', 1, 'evidence-first', 3).state),
};

const browser = await chromium.launch();
for (const [w, h] of sizes) {
  for (const name of wanted) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 700 });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`${base}/?debug=1`);
    await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
    await page.evaluate((json) => (window as unknown as { __belief: { load: (j: string) => boolean } }).__belief.load(json), states[name]);
    await page.waitForTimeout(700);
    if (name === 'lens') {
      const lens = page.getByTestId('lens-social');
      if (await lens.count()) await lens.first().click();
    }
    if (name === 'effect') {
      // a real action, photographed mid-animation: the spiral of a claim being told, the contest ring of a challenge
      await page.evaluate(() => {
        const b = (window as unknown as { __belief: { store: { act: (a: unknown) => unknown; state: { villagers: { id: string; status: string }[]; starter: string } } } }).__belief;
        const v = b.store.state.villagers.find((x) => x.id === 'mara' && x.status !== 'dead') ?? b.store.state.villagers.find((x) => x.status !== 'dead')!;
        b.store.act({ type: 'SEED', claim: b.store.state.starter, target: v.id });
      });
      await page.waitForTimeout(350);
    }
    if (name === 'debrief') await page.waitForTimeout(2300); // let the end-of-run scene finish animating
    await page.screenshot({ path: `${out}/${name}-${w}x${h}.jpg`, type: 'jpeg', quality: 70 });
    if (errors.length) console.log(`console errors at ${name} ${w}x${h}:\n  ${errors.join('\n  ')}`);
    await ctx.close();
  }
}
await browser.close();
console.log(`wrote ${sizes.length * wanted.size} screenshots to ${out}`);
