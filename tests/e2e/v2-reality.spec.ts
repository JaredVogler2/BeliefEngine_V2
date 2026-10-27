import { expect, test, type Page } from '@playwright/test';
import { closeSheet, watchConsole } from './helpers.ts';

/**
 * Generative Reality in the real browser (production build, 2D map): the mode screen, the reality composer and its preview, the
 * honest refusals, the partial-consent gate and writing a belief. Offline throughout, except the one test that opts in to the local
 * simulator (playwright.config.ts: SCRIPTED provider, no model is called; the game must say "simulated").
 */

async function startReality(page: Page, scenario = 'redbank') {
  await page.goto('/?debug=1');
  await page.getByTestId('play').click();
  await page.getByTestId('mode-reality').click();
  await page.getByTestId(`begin-reality-${scenario}`).click();
  await page.getByTestId('seed').fill('1');
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('play')).toBeVisible();
  await page.locator('[data-claim="river_fears_fire"]').click();
  await closeSheet(page);
}

function apiLog(page: Page): { url: string; body: string | null }[] {
  const seen: { url: string; body: string | null }[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) seen.push({ url: new URL(r.url()).pathname, body: r.postData() });
  });
  return seen;
}

async function read(page: Page, sentence: string) {
  await page.getByTestId('reality-text').fill(sentence);
  await page.getByTestId('reality-preview').click();
  await expect(page.getByTestId('reality-result')).toBeVisible();
}

test.describe('Generative Reality', () => {
  test('a written belief: what you said beside what the game will do, then written into the village (offline, no request)', async ({ page }) => {
    const errors = watchConsole(page);
    const api = apiLog(page);
    await startReality(page);
    await page.getByTestId('reality-open').click();
    await read(page, 'Chickens fly when the bell rings.');
    await expect(page.getByTestId('reality-kind')).toHaveText('Understood');
    await expect(page.getByTestId('reality-source')).toContainText('offline');
    await expect(page.getByTestId('reality-said-0')).toContainText('Chickens');
    await expect(page.getByTestId('reality-said-0')).toContainText('fly');
    await expect(page.getByTestId('reality-did-0')).toContainText('bell');
    await expect(page.getByTestId('reality-support')).toContainText('firm believers');
    await page.getByTestId('reality-confirm').click();
    await closeSheet(page);
    await expect(page.locator('[data-claim^="reality_"]')).toHaveCount(1);
    expect(api).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('says no, with the reason, to what this world cannot do; never renames it as something smaller', async ({ page }) => {
    await startReality(page);
    await page.getByTestId('reality-open').click();
    await read(page, 'Reverse time and resurrect all dead villagers.');
    await expect(page.getByTestId('reality-kind')).toHaveText('Cannot be made real here');
    await expect(page.getByTestId('reality-reasons')).toContainText('cannot change time');
    await expect(page.getByTestId('reality-confirm')).toHaveCount(0);
  });

  test('a partly possible belief needs an explicit yes before it can be written', async ({ page }) => {
    await startReality(page);
    await page.getByTestId('reality-open').click();
    await read(page, 'Lit lanterns turn the flood aside but draw wolves.');
    await expect(page.getByTestId('reality-kind')).toHaveText('Partly possible');
    await expect(page.getByTestId('reality-reasons')).toContainText('no wolves');
    await expect(page.getByTestId('reality-confirm')).toBeDisabled();
    await page.getByTestId('reality-accept').check();
    await expect(page.getByTestId('reality-confirm')).toBeEnabled();
  });

  test('the online reader (simulated) is opt-in, labelled, and sends only the sentence and the village\'s name', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the request path is the same on phones; one viewport is enough');
    const api = apiLog(page);
    await startReality(page);
    await page.getByTestId('reality-open').click();
    await page.getByTestId('reality-online').click();
    await expect(page.getByTestId('reality-consent')).toContainText('Nothing about your villagers is sent');
    expect(api).toEqual([]);
    await page.getByTestId('reality-consent-yes').click();
    await expect(page.getByTestId('reality-online-on')).toContainText('simulated');
    await read(page, 'Wet stone becomes light beside lanterns.');
    await expect(page.getByTestId('reality-kind')).toHaveText('Understood');
    await expect(page.getByTestId('reality-source')).toContainText('simulated online reader (no model)');
    expect(api.map((a) => a.url)).toEqual(['/api/ai-status', '/api/session', '/api/interpret-reality']);
    const sent = JSON.parse(api[2].body ?? '{}');
    expect(Object.keys(sent).sort()).toEqual(['day', 'lang', 'region', 'run', 'scenario', 'text', 'v']);
    expect(sent.scenario).toEqual({ id: 'redbank', seed: 1, lab: false });
  });
});
