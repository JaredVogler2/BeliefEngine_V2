import { expect, test, type Page } from '@playwright/test';
import { GameSession, serializeRun } from '../../src/engine/index.ts';
import { policyById } from '../../src/engine/ai/bots/generic.ts';
import { mapPainted } from './helpers.ts';

/**
 * Visual and layout checks on real engine states (played by bots, loaded through the debug loader) at every supported size.
 * They assert what a person would notice first: the page does not scroll sideways, the day, Influence and the primary action are on
 * screen, the map is actually painted, nothing throws, and a muted / reduced-motion player gets the same facts as text.
 */
const SIZES: [number, number][] = [[320, 568], [390, 844], [768, 1024], [1366, 768], [1920, 1080]];

function played(days: number, policy: string): string {
  const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
  const p = policyById(policy);
  for (let i = 0; i < days && !g.state.outcome; i++) p.playDay(g);
  return serializeRun(g.state);
}
const STATES = {
  calm: serializeRun(GameSession.create({ scenarioId: 'redbank', seed: 1 }).state),
  law: played(5, 'evidence-first'),
  hazard: played(5, 'noop'),
  debrief: played(20, 'evidence-first'),
};

async function load(page: Page, json: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?debug=1');
  await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
  await page.evaluate((j) => (window as unknown as { __belief: { load: (s: string) => boolean } }).__belief.load(j), json);
  return errors;
}

async function noSidewaysScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

/** the share of sampled canvas pixels that differ from the centre one: a blank or one-colour canvas scores ~0 (works for either renderer) */
async function paintedShare(page: Page): Promise<number> {
  return mapPainted(page)();
}

test.describe('every state at every supported size', () => {
  test.skip(({ isMobile, browserName }) => isMobile || browserName !== 'chromium', 'sizes are set explicitly inside each test; run once on desktop Chromium');
  test.setTimeout(120_000);

  for (const [w, h] of SIZES) {
    for (const name of ['calm', 'law', 'hazard'] as const) {
      test(`${name} at ${w}x${h}: sideways scroll, HUD, primary action and a painted map`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        const errors = await load(page, STATES[name]);
        await expect(page.getByTestId('play')).toBeVisible();
        await page.waitForTimeout(400);
        expect(await noSidewaysScroll(page), 'no sideways page scroll').toBe(true);
        const day = page.locator('.daybox');
        await expect(day).toBeVisible();
        const end = page.getByTestId('end-day');
        await expect(end).toBeVisible();
        const box = await end.boundingBox();
        expect(box, 'End Day has a box').not.toBeNull();
        expect(box!.y + box!.height, 'End Day is inside the viewport').toBeLessThanOrEqual(h + 1);
        expect(box!.x + box!.width, 'End Day is inside the viewport').toBeLessThanOrEqual(w + 1);
        expect(box!.height, 'a comfortable touch target').toBeGreaterThanOrEqual(40);
        await expect(page.getByTestId('ap')).toBeVisible();
        expect(await paintedShare(page), 'the map is painted').toBeGreaterThan(0.25);
        expect(errors).toEqual([]);
      });
    }
    test(`debrief at ${w}x${h}: scene, verdict and the call to act are readable`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const errors = await load(page, STATES.debrief);
      await expect(page.getByTestId('debrief')).toBeVisible();
      const scene = page.getByTestId('debrief-scene');
      await expect(scene).toBeVisible();
      await expect(scene).toHaveAttribute('data-result', 'victory');
      await expect(page.getByTestId('scene-caption')).toContainText(/14 of 14 villagers alive, \d+ of \d+ homes standing/);
      await expect(page.getByTestId('verdict')).toHaveText('Victory');
      expect(await noSidewaysScroll(page)).toBe(true);
      await page.getByTestId('scene-skip').click();
      await expect(page.getByTestId('scene-skip')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('effects follow the engine', () => {
  test.skip(({ isMobile, browserName }) => isMobile || browserName !== 'chromium', 'desktop Chromium only');

  test('a told story and a challenge each put an effect on the map, and a burst of events can never exceed the cap', async ({ page }) => {
    await load(page, STATES.law);
    await page.waitForTimeout(500);
    const effects = () => page.evaluate(() => (window as unknown as { __beRenderer: { stats: () => { effects: number } } }).__beRenderer.stats().effects);
    expect(await effects()).toBe(0);
    await page.evaluate(() => {
      const b = (window as unknown as { __belief: { store: { act: (a: unknown) => unknown; state: { villagers: { id: string; status: string }[]; starter: string } } } }).__belief;
      const v = b.store.state.villagers.find((x) => x.status !== 'dead')!;
      b.store.act({ type: 'SEED', claim: 'bridge_stands_watched', target: v.id });
    });
    await expect.poll(effects).toBeGreaterThan(0);
    // stress: replay the same real resolution events many times over; the renderer must drop the excess, not queue it
    const burst = await page.evaluate(() => {
      const w = window as unknown as { __belief: { store: { state: { log: unknown[] } } }; __beRenderer: { playResolution: (e: unknown[], p: null) => void; stats: () => { effects: number } } };
      const events = w.__belief.store.state.log.slice();
      for (let i = 0; i < 40; i++) w.__beRenderer.playResolution(events, null);
      return w.__beRenderer.stats().effects;
    });
    expect(burst).toBeLessThanOrEqual(80);
  });

  test('frame rate stays usable while a flood resolution and a rumour burst play together', async ({ page }) => {
    await load(page, STATES.hazard);
    await page.waitForTimeout(400);
    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    const fps = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let n = 0;
          const t0 = performance.now();
          const tick = () => {
            n++;
            if (performance.now() - t0 >= 1500) resolve((n * 1000) / (performance.now() - t0));
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    // headless software rendering on a shared CI box is slow; this guards against a freeze, not against a missed 60 fps target
    expect(fps).toBeGreaterThan(12);
  });

  test('muted and reduced-motion players still get every fact as text', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = await load(page, STATES.hazard);
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    // the morning digest states what happened in words, without any animation having to be watched
    const digest = page.getByTestId('digest');
    await expect(digest).toBeVisible();
    await expect(digest).toContainText(/bridge|flood|night|home/i);
    await page.getByTestId('digest-continue').click();
    await page.getByTestId('tab-log').click();
    await expect(page.locator('[data-testid="log-panel"], [data-testid="log"]').first()).toBeVisible();
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
