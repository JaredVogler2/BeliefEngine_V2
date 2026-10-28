import { expect, test } from '@playwright/test';
import { closeSheet, mapPainted, selectVillager, watchConsole } from './helpers.ts';

/**
 * A short, browser-neutral smoke test that runs in every configured project (Chromium, Firefox, WebKit, and the phone profiles):
 * title -> briefing -> play -> tell a story -> end the day -> read the morning digest -> the map is painted -> save and resume; and the
 * same for a Generative Reality run: write a belief, tell it first, resolve the night, reload.
 * The longer flows live in the other specs and run on Chromium only.
 */
test.describe('smoke', () => {
  test('a first day can be played, resolved, saved and resumed', async ({ page }, info) => {
    const errors = watchConsole(page);
    await page.goto('/?debug=1');
    await expect(page.getByTestId('title')).toBeVisible();
    await page.getByTestId('play').click();
    await page.getByTestId('begin-redbank').click();
    await page.getByTestId('begin').click();
    await expect(page.getByTestId('play')).toBeVisible();

    // the map really painted something (a failed canvas context would leave a flat colour); slow software renderers get a few seconds
    const painted = mapPainted(page);
    await expect.poll(painted, { message: `${info.project.name}: map is painted`, timeout: 8000 }).toBeGreaterThan(0.2);

    await page.locator('[data-claim="river_fears_fire"]').click();
    await selectVillager(page, 'Ivo Thatcher');
    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).click();
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);

    // reload mid-day: the autosave restores the exact plan
    await page.reload();
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);

    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await expect(page.getByTestId('digest')).toBeVisible();
    await page.getByTestId('digest-continue').click();
    await expect(page.getByTestId('day-box')).toContainText('2');
    expect(errors).toEqual([]);
  });

  test('a Generative Reality belief is written, told first, survives the night and a reload (offline)', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug=1');
    await page.getByTestId('play-reality').click();
    await page.getByTestId('begin-reality-redbank').click();
    await page.getByTestId('begin').click();
    await expect(page.getByTestId('play')).toBeVisible();
    await page.locator('[data-claim="river_fears_fire"]').click();
    await closeSheet(page);
    await page.getByTestId('reality-open').click();
    await page.getByTestId('reality-text').fill('Chickens fly when the bell rings.');
    await page.getByTestId('reality-preview').click();
    await expect(page.getByTestId('reality-kind')).toHaveText('Understood');
    await page.getByTestId('reality-confirm').click();
    // who tells it first: the best-placed listener, for 1 Influence
    await page.getByTestId('tell-first-list').getByRole('button', { name: /^Tell · 1 Influence/ }).first().click();
    await expect(page.getByTestId('tell-first-done')).toHaveText('Done (1 told)');
    await page.getByTestId('tell-first-done').click();
    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await expect(page.getByTestId('digest')).toBeVisible();
    await page.getByTestId('digest-continue').click();
    await expect(page.getByTestId('day-box')).toContainText('2');
    await page.reload();
    await page.getByTestId('continue').click();
    await expect(page.locator('[data-claim^="reality_"]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('a finished run shows its debrief with the end-of-run scene', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await page.getByTestId('begin-redbank').click();
    await page.getByTestId('begin').click();
    for (let d = 0; d < 7; d++) {
      await page.getByTestId('end-day').click();
      await page.getByTestId('confirm-end').click();
      await page.getByTestId('digest-continue').click();
    }
    await expect(page.getByTestId('debrief')).toBeVisible();
    await expect(page.getByTestId('debrief-scene')).toHaveAttribute('data-result', 'defeat');
    await expect(page.getByTestId('verdict')).toHaveText('Defeat');
    expect(errors).toEqual([]);
  });
});
