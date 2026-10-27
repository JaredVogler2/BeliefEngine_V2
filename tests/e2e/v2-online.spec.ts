import { expect, test, type Page } from '@playwright/test';
import { closeSheet, watchConsole } from './helpers.ts';

/**
 * Online reading in the real browser, against the local inference simulator (playwright.config.ts starts it with its SCRIPTED
 * provider: no model is called, and the game must say "simulated"). What is proven: the consent gate, the request path through
 * the production build, the honest labels, and offline fallback without any cost. What is not: any real model's behaviour.
 */

async function startInventor(page: Page) {
  await page.goto('/?debug=1');
  await page.getByTestId('play').click();
  await page.getByTestId('begin-redbank').click();
  await page.getByTestId('seed').fill('1');
  await page.getByTestId('opt-inventor').check();
  await page.getByTestId('seed').fill('1');
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('play')).toBeVisible();
  await page.locator('[data-claim="river_fears_fire"]').click();
}

function apiLog(page: Page): { url: string; body: string | null }[] {
  const seen: { url: string; body: string | null }[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) seen.push({ url: new URL(r.url()).pathname, body: r.postData() });
  });
  return seen;
}

const ap = (page: Page) => page.evaluate(() => (window as unknown as { __belief: { state: { ap: number } } }).__belief.state.ap);

test.describe('online reading (simulated provider)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop flow; the composer on phones is covered in phase 12');

  test('Classic play, and the composer before opting in, make no request to the inference routes', async ({ page }) => {
    const api = apiLog(page);
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await page.getByTestId('begin-redbank').click();
    await page.getByTestId('begin').click();
    await page.locator('[data-claim="river_fears_fire"]').click();
    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await page.getByTestId('digest').waitFor();
    await startInventor(page);
    await page.getByTestId('compose-open').click();
    await page.getByTestId('compose-text').fill('The river slows beside lit beacons.');
    await page.getByTestId('compose-preview').click();
    await expect(page.getByTestId('compose-status')).toContainText('Understood');
    await expect(page.getByTestId('compose-online')).toBeVisible();
    expect(api).toEqual([]);
  });

  test('consent, then a simulated online reading that is labelled as such and goes through the game\'s own checks', async ({ page }) => {
    const errors = watchConsole(page);
    const api = apiLog(page);
    await startInventor(page);
    const before = await ap(page);
    await page.getByTestId('compose-open').click();
    await page.getByTestId('compose-online').click();
    await expect(page.getByTestId('compose-consent')).toContainText('leave this device');
    await expect(page.getByTestId('compose-consent')).toContainText('paid by whoever runs this game');
    expect(api).toEqual([]);
    await page.getByTestId('compose-consent-yes').click();
    await expect(page.getByTestId('compose-online-on')).toContainText('simulated');
    await page.getByTestId('compose-text').fill('The river slows beside lit beacons.');
    await page.getByTestId('compose-preview').click();
    await expect(page.getByTestId('compose-status')).toContainText('Understood');
    await expect(page.getByTestId('compose-source')).toContainText('simulated online reader (no model)');
    expect(api.map((a) => a.url)).toEqual(['/api/ai-status', '/api/session', '/api/interpret-belief']);
    const sent = JSON.parse(api[2].body ?? '{}');
    expect(Object.keys(sent).sort()).toEqual(['context', 'ontology', 'run', 'text', 'v']);
    expect(sent.text).toBe('The river slows beside lit beacons.');
    expect(await ap(page)).toBe(before);
    await page.getByTestId('compose-confirm').click();
    await closeSheet(page);
    await expect(page.locator('[data-claim^="custom_"]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('a server that is not set up says so, and the offline reader carries on', async ({ page }) => {
    await page.route('**/api/ai-status', (r) => r.fulfill({ json: { ok: true, available: false, reason: 'not_configured', provider: null, models: null, privacy: '', limits: {} } }));
    await startInventor(page);
    await page.getByTestId('compose-open').click();
    await page.getByTestId('compose-online').click();
    await page.getByTestId('compose-consent-yes').click();
    await expect(page.getByTestId('compose-online-note')).toContainText('not set up on this server');
    await expect(page.getByTestId('compose-online')).toBeVisible();
    await page.getByTestId('compose-text').fill('The river slows beside lit beacons.');
    await page.getByTestId('compose-preview').click();
    await expect(page.getByTestId('compose-status')).toContainText('Understood');
    await expect(page.getByTestId('compose-source')).toHaveCount(0);
  });

  test('a provider failure falls back to the offline reading and spends nothing', async ({ page }) => {
    await page.route('**/api/interpret-belief', (r) => r.fulfill({ status: 502, json: { ok: false, reason: 'provider_unavailable', message: 'x', fallback: 'offline' } }));
    await startInventor(page);
    const before = await ap(page);
    await page.getByTestId('compose-open').click();
    await page.getByTestId('compose-online').click();
    await page.getByTestId('compose-consent-yes').click();
    await expect(page.getByTestId('compose-online-on')).toBeVisible();
    await page.getByTestId('compose-text').fill('The river slows beside lit beacons.');
    await page.getByTestId('compose-preview').click();
    await expect(page.getByTestId('compose-note')).toContainText('could not be reached');
    await expect(page.getByTestId('compose-note')).toContainText('no Influence was spent');
    await expect(page.getByTestId('compose-status')).toContainText('Understood');
    await expect(page.getByTestId('compose-source')).toHaveCount(0);
    expect(await ap(page)).toBe(before);
  });
});
