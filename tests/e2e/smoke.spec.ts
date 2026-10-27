import { expect, test } from '@playwright/test';
import { mapPainted, selectVillager, watchConsole } from './helpers.ts';

/**
 * A short, browser-neutral smoke test that runs in every configured project (Chromium, Firefox, WebKit, and the phone profiles):
 * title -> briefing -> play -> tell a story -> end the day -> read the morning digest -> the map is painted -> save and resume.
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
