import { expect, test, type Page } from '@playwright/test';
import { browserState, closeSheet, watchConsole } from './helpers.ts';

/**
 * Phase 17's fixes (docs/FUN_REVIEW_V2.md), in the real browser: ideas the village can make real, words kept only as flavour said so,
 * a left-out phrase named once, a helpful belief offered for an impossible one, and the price shown is the Influence spent.
 * Screenshots for the review: BE_SHOTS=1 npx playwright test tests/e2e/v2-review.spec.ts --project=desktop (docs/screenshots/v2-phase17/).
 */

const SHOTS = process.env.BE_SHOTS === '1';
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  const vw = page.viewportSize()?.width ?? 1366;
  await page.screenshot({ path: `docs/screenshots/v2-phase17/${name}-${vw >= 900 ? 'desktop' : 'phone'}.png` });
}

async function startGenerative(page: Page, chapter: string, starter: string) {
  await page.goto('/?debug=1');
  await page.getByTestId('play').click();
  await page.getByTestId('mode-reality').click();
  await page.getByTestId(`begin-reality-${chapter}`).click();
  await page.getByTestId('seed').fill('1');
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('play')).toBeVisible();
  await page.locator(`[data-claim="${starter}"]`).click();
  await closeSheet(page);
  await page.getByTestId('reality-open').click();
}

async function read(page: Page, text: string) {
  await page.getByTestId('reality-text').fill(text);
  await page.getByTestId('reality-preview').click();
  await expect(page.getByTestId('reality-kind')).toBeVisible();
}

test.describe('phase 17 review fixes', () => {
  test('Ashwood offers ideas Ashwood can make real (it has no bell), and the first one is understood', async ({ page }) => {
    const errors = watchConsole(page);
    await startGenerative(page, 'ashwood', 'wolves_fear_smoke');
    await page.getByTestId('reality-help').locator('summary').click();
    await expect(page.getByTestId('reality-example-0')).toBeVisible();
    const ideas = await page.locator('[data-testid^="reality-example-"]').allInnerTexts();
    expect(ideas.length).toBeGreaterThanOrEqual(3);
    for (const x of ideas) expect(x).not.toMatch(/bell|lantern/i);
    await shot(page, 'ashwood-ideas');
    await page.getByTestId('reality-example-0').click();
    await expect(page.getByTestId('reality-kind')).toHaveText('Understood');
    expect(errors).toEqual([]);
  });

  test('flavour words are kept and said to change nothing; a left-out phrase is named once; an impossible belief is offered a helpful one', async ({ page }) => {
    const errors = watchConsole(page);
    await startGenerative(page, 'redbank', 'river_fears_fire');
    await read(page, 'Chickens fly into the night when the bell rings.');
    await expect(page.getByTestId('reality-kind')).toHaveText('Understood');
    await expect(page.getByTestId('reality-narrative')).toContainText('into the night');
    await expect(page.getByTestId('reality-narrative')).toContainText('changes nothing');
    await page.getByTestId('reality-narrative').scrollIntoViewIfNeeded();
    await shot(page, 'flavour-kept');

    await read(page, 'When the bell rings, chickens fly and time runs backwards.');
    await expect(page.getByTestId('reality-kind')).toHaveText('Partly possible');
    await expect(page.getByTestId('reality-reasons')).toContainText('time runs backwards');
    // named in the list of what cannot be made real, and not repeated as a note below it (the reading's card lists what it leaves out)
    await expect(page.getByTestId('reality-notes')).toHaveCount(0);
    await expect(page.getByText(/was left out/)).toHaveCount(0);
    await expect(page.getByTestId('reality-omitted')).toContainText('time runs backwards');
    await page.getByTestId('reality-reasons').scrollIntoViewIfNeeded();
    await shot(page, 'left-out-named-once');

    await read(page, 'Homes cannot be damaged.');
    await expect(page.getByTestId('reality-kind')).toHaveText('Cannot be made real here');
    await expect(page.getByTestId('reality-did-0')).toContainText('hold stronger');
    await expect(page.getByTestId('reality-did-0')).not.toContainText('burn more readily');
    await page.getByTestId('reality-did-0').scrollIntoViewIfNeeded();
    await shot(page, 'helpful-offer');
    expect(errors).toEqual([]);
  });

  test('a ward around every home is the dearest of its kind, and the price shown is exactly the Influence spent', async ({ page }) => {
    const errors = watchConsole(page);
    await startGenerative(page, 'redbank', 'river_fears_fire');
    await read(page, 'Floodwater always flows away from every home.');
    await expect(page.getByTestId('reality-kind')).toHaveText('Understood');
    await expect(page.getByTestId('reality-did-0')).toContainText('Every night: floodwater within 2 tiles of any home');
    await expect(page.getByTestId('reality-support')).toContainText('at least 75%');
    const label = await page.getByTestId('reality-confirm').innerText();
    const price = Number(/\((\d) Influence\)/.exec(label)?.[1]);
    expect(price).toBe(3);
    await page.getByTestId('reality-support').scrollIntoViewIfNeeded();
    await shot(page, 'every-home-ward-price');
    const before = (await browserState(page)).ap;
    await page.getByTestId('reality-confirm').click();
    await expect(page.getByTestId('tell-first')).toBeVisible();
    expect((await browserState(page)).ap).toBe(before - price);
    expect(errors).toEqual([]);
  });
});
