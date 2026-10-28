import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { browserState, closeSheet, replayTraceViaUi, startRedbank, traces, watchConsole } from './helpers.ts';

/**
 * Phase 16's acceptance journeys in the real browser (production build). A and B are here; C, D and E are headless
 * (tests/unit/journeys-v2.test.ts, tests/unit/mcp-v2-stdio.test.ts); the rest of B (each law changing the world, a whole win and
 * four losses) is tests/e2e/v2-bridge.spec.ts and the 3D drawing tests/e2e/v2-world3d.spec.ts; F is v2-ux, mobile, a11y and the
 * cross-browser smoke. Every request the page makes is watched: nothing may go to /api/ or leave the game's own origin.
 * Screenshots for the docs: BE_SHOTS=1 npx playwright test tests/e2e/v2-journeys.spec.ts (docs/screenshots/v2-phase16/).
 */

const SHOTS = process.env.BE_SHOTS === '1';
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  const vw = page.viewportSize()?.width ?? 1366;
  await page.screenshot({ path: `docs/screenshots/v2-phase16/${name}-${vw >= 900 ? 'desktop' : 'phone'}.png` });
}

async function audit(context: BrowserContext): Promise<{ api: string[]; outside: string[] }> {
  const net = { api: [] as string[], outside: [] as string[] };
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/api/')) {
      net.api.push(u.pathname);
      return route.abort();
    }
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
      net.outside.push(u.origin);
      return route.abort();
    }
    return route.continue();
  });
  return net;
}

async function loseByWaiting(page: Page) {
  await page.locator('[data-claim="river_fears_fire"]').click();
  for (let d = 1; d <= 7; d++) {
    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await page.getByTestId('digest-continue').click();
  }
}

test.describe('acceptance journeys (phase 16)', () => {
  test('A: Classic Redbank with nothing online: V1\'s recorded win by clicks and a loss, each on V1\'s hashes and replayed on the device; no request leaves the page', async ({ page, context, isMobile }) => {
    test.skip(!!isMobile, 'the recorded route is clicked at desktop size; phone play is mobile.spec.ts');
    test.setTimeout(300_000);
    const net = await audit(context);
    const errors = watchConsole(page);
    await startRedbank(page, traces.canonicalSeed);
    await replayTraceViaUi(page, traces.canonicalSeed, traces.fireWall.actions);
    await expect(page.getByTestId('verdict')).toHaveText('Victory');
    expect((await browserState(page)).hash).toBe(traces.fireWall.stateHash);
    await expect(page.getByTestId('replay-verdict')).toContainText('Replays to the same end');
    await page.getByTestId('replay-check').scrollIntoViewIfNeeded();
    await shot(page, 'journey-a-classic-win-replayed');

    await page.getByTestId('retry-same').click();
    await expect(page.getByTestId('play')).toBeVisible();
    await loseByWaiting(page);
    await expect(page.getByTestId('verdict')).toHaveText('Defeat');
    const lost = await browserState(page);
    expect(lost.hash).toBe(traces.noop.stateHash);
    await expect(page.getByTestId('replay-verdict')).toContainText('Replays to the same end');

    expect(net.api).toEqual([]);
    expect(net.outside).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('B: "chickens rise into the air when bells sound" is the hens\' lift on the bell, previewed before anything is spent; a time-reversal clause is named and left out', async ({ page, context }) => {
    const net = await audit(context);
    const errors = watchConsole(page);
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await page.getByTestId('mode-reality').click();
    await page.getByTestId('begin-reality-redbank').click();
    await page.getByTestId('seed').fill('1');
    await page.getByTestId('begin').click();
    await expect(page.getByTestId('play')).toBeVisible();
    await page.locator('[data-claim="river_fears_fire"]').click();
    await closeSheet(page);
    const ap = (await browserState(page)).ap;
    await page.getByTestId('reality-open').click();

    await page.getByTestId('reality-text').fill('chickens rise into the air when bells sound');
    await page.getByTestId('reality-preview').click();
    await expect(page.getByTestId('reality-kind')).toHaveText('Understood');
    await expect(page.getByTestId('reality-said-0')).toContainText('chickens');
    await expect(page.getByTestId('reality-did-0')).toContainText('bell');
    await expect(page.getByTestId('reality-support')).toContainText('firm believers');
    await shot(page, 'journey-b-novel-law-preview');

    await page.getByTestId('reality-text').fill('When the bell rings, chickens fly and time runs backwards.');
    await page.getByTestId('reality-preview').click();
    await expect(page.getByTestId('reality-kind')).toHaveText('Partly possible');
    await expect(page.getByTestId('reality-reasons')).toContainText('“time runs backwards”');
    await expect(page.getByTestId('reality-reasons')).toContainText('cannot change time');
    await page.getByTestId('reality-reasons').scrollIntoViewIfNeeded();
    await shot(page, 'journey-b-time-reversal-left-out');
    // reading and previewing cost nothing, and the offline reader asks nobody
    expect((await browserState(page)).ap).toBe(ap);
    expect(net.api).toEqual([]);
    expect(net.outside).toEqual([]);
    expect(errors).toEqual([]);
  });
});
