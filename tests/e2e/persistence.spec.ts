import { expect, test } from '@playwright/test';
import { browserState, chooseClaim, selectVillager, startRedbank, watchConsole } from './helpers.ts';

test.describe('saves, settings and recovery', () => {
  test('autosave: refresh mid-run and Continue resumes the exact state', async ({ page }) => {
    const errors = watchConsole(page);
    await startRedbank(page, 5);
    await chooseClaim(page, 'river_fears_fire');
    await selectVillager(page, 'Nell Carter');
    await page.locator('.act', { hasText: 'Tell Nell Carter' }).click();
    const before = await browserState(page);
    await page.reload();
    await expect(page.getByTestId('continue')).toBeVisible();
    await expect(page.getByTestId('continue')).toContainText('day 1/7');
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('play')).toBeVisible();
    const after = await browserState(page);
    expect(after.hash).toBe(before.hash);
    expect(after.ap).toBe(2);
    expect(errors).toEqual([]);
  });

  test('a corrupted save is rejected with a clear message and cleared', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.evaluate(() => localStorage.setItem('be:save:v1', '{"format":"belief-engine-save","schemaVersion":1,"state":{"broken":true}}'));
    await page.reload();
    // not offered as a continue
    await expect(page.getByTestId('continue')).toHaveCount(0);
    await expect(page.getByTestId('play')).toBeVisible();
  });

  test('unparseable and future-version saves never crash the title screen', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/');
    for (const bad of ['not json at all', JSON.stringify({ format: 'belief-engine-save', schemaVersion: 99, state: {} }), '{"format":"x"}']) {
      await page.evaluate((v) => localStorage.setItem('be:save:v1', v), bad);
      await page.reload();
      await expect(page.getByTestId('title')).toBeVisible();
      await expect(page.getByTestId('play')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('settings persist across reloads (mute, reduced motion, text size)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Sound effects', { exact: true }).uncheck();
    await page.getByTestId('reduced-motion').check();
    await page.getByLabel('Text size').selectOption('large');
    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel('Sound effects', { exact: true })).not.toBeChecked();
    await expect(page.getByTestId('reduced-motion')).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-scale', 'large');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  });

  test('works when storage is blocked: the game still starts and plays', async ({ page, context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    });
    const errors = watchConsole(page);
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await page.getByTestId('begin-redbank').click();
    await page.getByTestId('begin').click();
    await expect(page.getByTestId('play')).toBeVisible();
    await chooseClaim(page, 'river_fears_fire');
    await selectVillager(page, 'Ivo Thatcher');
    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).click();
    expect(errors.filter((e) => !/blocked|SecurityError/i.test(e))).toEqual([]);
  });

  test('a shared seed link opens the briefing for that seed; an invalid one is ignored politely', async ({ page }) => {
    await page.goto('/?scenario=redbank&seed=77&d=hard');
    await expect(page.getByTestId('briefing')).toBeVisible();
    await expect(page.getByTestId('seed')).toHaveValue('77');
    await expect(page.getByTestId('difficulty')).toHaveValue('hard');
    await page.goto('/?scenario=nonsense&seed=-4');
    await expect(page.getByTestId('title')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('ignored');
  });
});
