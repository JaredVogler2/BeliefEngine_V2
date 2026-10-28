import { expect, test } from '@playwright/test';
import { browserState, chooseClaim, closeSheet, replayTraceViaUi, selectVillager, startRedbank, traces, watchConsole } from './helpers.ts';

test.describe('phone (390x844, touch)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 999) > 600, 'phone project only');

  test('a tap on End Day while the details panel is still sliding away reaches End Day (a closing panel never takes a tap)', async ({ page }) => {
    await startRedbank(page, 3);
    // the slide slowed from a fifth of a second to a few seconds, so the moment the panel is over the button can be caught every time
    await page.addStyleTag({ content: '.side, .side.open { transition: transform 3s linear, visibility 0s linear 3s !important; }' });
    await page.getByTestId('sheet-toggle').tap();
    await expect(page.locator('.side.open')).toBeVisible();
    await page.waitForTimeout(3300);
    const end = (await page.getByTestId('end-day').boundingBox())!;
    const x = end.x + end.width / 2;
    const y = end.y + end.height / 2;
    // close it: on a phone the panel passes down over the bottom bar as it goes. Tap End Day while the panel is visibly over it
    await page.getByTestId('sheet-toggle').tap();
    await expect
      .poll(
        () =>
          page.evaluate((py) => {
            const side = document.querySelector('.side') as HTMLElement;
            const b = side.getBoundingClientRect();
            return getComputedStyle(side).visibility === 'visible' && b.top <= py && b.bottom >= py;
          }, y),
        { intervals: [15], timeout: 5000 },
      )
      .toBe(true);
    await page.touchscreen.tap(x, y);
    await expect(page.getByTestId('confirm-end')).toBeVisible();
  });

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
