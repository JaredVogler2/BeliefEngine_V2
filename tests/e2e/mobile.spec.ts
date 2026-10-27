import { expect, test } from '@playwright/test';
import { browserState, chooseClaim, closeSheet, replayTraceViaUi, selectVillager, startRedbank, traces, watchConsole } from './helpers.ts';

test.describe('phone (390x844, touch)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 999) > 600, 'phone project only');

  test('first action in a few taps, end day, lens, save and resume', async ({ page }) => {
    const errors = watchConsole(page);
    await startRedbank(page, 3);
    // the day, Influence and End Day are visible without scrolling
    await expect(page.getByTestId('day-box')).toBeVisible();
    await expect(page.getByTestId('ap')).toBeVisible();
    await expect(page.getByTestId('end-day')).toBeInViewport();
    await page.locator('[data-claim="river_fears_fire"]').tap();
    await selectVillager(page, 'Ivo Thatcher');
    await expect(page.locator('.side.open')).toBeVisible();
    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).tap();
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);
    await closeSheet(page);

    // social lens toggles without hiding the primary controls
    const lens = page.getByRole('button', { name: /social lens/i });
    await lens.tap();
    await expect(lens).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('end-day')).toBeInViewport();
    await lens.tap();

    // End Day always asks first
    await page.getByTestId('end-day').tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByTestId('keep-planning').tap();
    await page.getByTestId('end-day').tap();
    await page.getByTestId('confirm-end').tap();
    await expect(page.getByTestId('digest')).toBeVisible();
    await expect(page.getByTestId('digest-continue')).toBeInViewport();
    await page.getByTestId('digest-continue').tap();

    // refresh = resume
    const before = await browserState(page);
    await page.reload();
    await page.getByTestId('continue').tap();
    const after = await browserState(page);
    expect(after.hash).toBe(before.hash);
    expect(errors).toEqual([]);
  });

  test('rotating to landscape keeps state and controls', async ({ page }) => {
    await startRedbank(page, 4);
    await chooseClaim(page, 'river_fears_fire');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByTestId('end-day')).toBeInViewport();
    await expect(page.getByTestId('ap')).toBeVisible();
    const st = await browserState(page);
    expect(st.day).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-claim="river_fears_fire"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a full winning run on a phone: the Witness Bridge trace reaches victory', async ({ page }) => {
    test.setTimeout(300_000);
    await startRedbank(page, traces.canonicalSeed);
    await replayTraceViaUi(page, traces.canonicalSeed, traces.witnessBridge.actions);
    await expect(page.getByTestId('verdict')).toHaveText('Victory');
    const st = await browserState(page);
    expect(st.hash).toBe(traces.witnessBridge.stateHash);
  });
});
