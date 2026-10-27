import { expect, test, type Page } from '@playwright/test';
import { chooseClaim, closeSheet, openSheet, selectVillager, startRedbank, watchConsole } from './helpers.ts';

/** Regression tests for the Phase 15 review fixes (docs/FUN_REVIEW.md), driven through the real UI. */

async function box(page: Page, sel: string) {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`${sel} is not on screen`);
  return b;
}
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

test.describe('the tutorial coach and the story cards (fix 2 and 3)', () => {
  test('the coach is a banner above the map: it never covers the map or the story cards', async ({ page }) => {
    await startRedbank(page, 1);
    const coach = await box(page, '[data-testid=coach]');
    const map = await box(page, 'canvas');
    expect(overlap(coach, map)).toBe(0);
    for (const card of await page.locator('[data-claim]').all()) {
      const b = await card.boundingBox();
      if (b) expect(overlap(coach, b)).toBe(0);
    }
    // and it stays out of the way once a story is chosen and a villager picked
    await page.locator('[data-claim="river_fears_fire"]').click();
    await selectVillager(page, 'Ivo Thatcher');
    await closeSheet(page);
    const coach2 = await box(page, '[data-testid=coach]');
    expect(overlap(coach2, await box(page, 'canvas'))).toBe(0);
  });

  test('the opening choice shows what each story does and costs, and the locked ones say when they unlock', async ({ page }) => {
    await startRedbank(page, 1);
    const fire = page.locator('[data-claim="river_fears_fire"]');
    await expect(fire).toContainText('push floodwater back');
    await expect(fire).toContainText('burn fuel');
    await expect(page.locator('[data-claim="bridge_stands_watched"]')).toContainText('watchers');
    await expect(page.locator('[data-claim="rain_heeds_bells"]')).toContainText('Unlocks on day 4');
    await expect(page.getByTestId('coach')).toContainText('day 3 and 4');
    await fire.click();
    // after the pick, the story you did not take is dimmed, but it says why and when
    await expect(page.locator('[data-claim="bridge_stands_watched"]')).toContainText('Unlocks on day 3');
    await expect(page.locator('[data-claim="bridge_stands_watched"]')).toBeDisabled();
  });

  test('step 3 names the villager you actually picked, whoever that is', async ({ page }) => {
    await startRedbank(page, 1);
    await page.locator('[data-claim="river_fears_fire"]').click();
    await expect(page.getByTestId('coach')).toContainText('Find who people listen to');
    await selectVillager(page, 'Tilly Wells');
    await expect(page.getByTestId('coach')).toContainText('Tell Tilly');
    await selectVillager(page, 'Ivo Thatcher');
    await expect(page.getByTestId('coach')).toContainText('Tell Ivo');
    await expect(page.getByTestId('coach')).not.toContainText('Tell Tilly');
  });
});

test.describe('one key for the most repeated move', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'keyboard flow');

  test('T tells the selected villager the chosen story, and explains itself when nothing is selected', async ({ page }) => {
    await startRedbank(page, 1);
    await page.locator('[data-claim="river_fears_fire"]').click();
    await page.keyboard.press('t');
    await expect(page.getByText('select a villager first')).toBeVisible();
    await selectVillager(page, 'Ivo Thatcher');
    await page.keyboard.press('t');
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);
    await expect(page.locator('.plan-item')).toContainText(['Tell Ivo Thatcher']);
  });
});

test.describe('the morning report (fix 1)', () => {
  test('the first night tells the player who the story reached', async ({ page }) => {
    const errors = watchConsole(page);
    await startRedbank(page, 1);
    await chooseClaim(page, 'river_fears_fire');
    await selectVillager(page, 'Ivo Thatcher');
    await openSheet(page, 'selected');
    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).click();
    await closeSheet(page);
    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    const digest = page.getByTestId('digest');
    await expect(digest).toBeVisible();
    await expect(digest).not.toContainText('A quiet night');
    await expect(digest).not.toContainText('Nothing remarkable');
    await expect(page.getByTestId('digest-story').first()).toContainText('River fears fire');
    await expect(page.getByTestId('digest-story').first()).toContainText('Ivo');
    await expect(digest).toContainText('now repeat');
    expect(errors).toEqual([]);
  });

  test('a Tell that cannot spread is flagged before the Influence is spent, and the morning explains it', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await page.getByTestId('begin-harvest').click();
    await page.getByTestId('seed').fill('1');
    await page.getByTestId('begin').click();
    await page.locator('[data-claim="moonlight_ripens_grain"]').click();
    await selectVillager(page, 'Odo Fenn');
    await openSheet(page, 'selected');
    await expect(page.locator('.act', { hasText: 'Tell Odo Fenn' })).toContainText('below 12');
    await page.locator('.act', { hasText: 'Tell Odo Fenn' }).click();
    await closeSheet(page);
    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await expect(page.getByTestId('digest-story').first()).toContainText('Odo');
    await expect(page.getByTestId('digest-story').first()).toContainText('12 or more');
    await expect(page.getByTestId('digest')).not.toContainText('Nothing remarkable');
  });
});

test.describe('"What would have changed it" (fix 4)', () => {
  test('a lost run shows the search, then an answer that names a day and a different plan', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchConsole(page);
    await startRedbank(page, 1);
    // do nothing for seven nights
    for (let i = 0; i < 7; i++) {
      await closeSheet(page);
      await page.getByTestId('end-day').click();
      await page.getByTestId('confirm-end').click();
      await expect(page.getByTestId('digest')).toBeVisible();
      await page.getByTestId('digest-continue').click();
    }
    await expect(page.getByTestId('debrief')).toBeVisible();
    await expect(page.getByTestId('verdict')).toHaveText('Defeat');
    const card = page.getByTestId('whatif');
    await expect(card).toBeVisible();
    await expect(card).toContainText('What would have changed it');
    await expect(page.getByTestId('whatif-latest').or(page.getByTestId('whatif-none'))).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('whatif-searching')).toHaveCount(0);
    // the page stayed alive while it searched
    await expect(page.getByTestId('retry-same')).toBeEnabled();
    expect(errors).toEqual([]);
  });
});

test.describe('phone layout (fix 5)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 999) > 600, 'phone project only');

  test('the mute button shares the forecast row, and the coach never covers the map', async ({ page }) => {
    await startRedbank(page, 1);
    const mute = await box(page, '.mute-btn');
    const stats = await box(page, '.topbar .stats');
    const threat = await box(page, '.topbar .threat');
    // the sound button sits beside the forecast banner, not on a row of its own below the status chips
    expect(Math.abs(mute.y + mute.height / 2 - (threat.y + threat.height / 2))).toBeLessThan(30);
    expect(mute.y).toBeLessThan(stats.y + stats.height + 80);
    const top = await box(page, '.topbar');
    expect(top.height).toBeLessThan(150);
    expect(overlap(await box(page, '[data-testid=coach]'), await box(page, 'canvas'))).toBe(0);
    await expect(page.getByTestId('end-day')).toBeInViewport();
  });
});
