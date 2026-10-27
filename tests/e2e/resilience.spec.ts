import { expect, test } from '@playwright/test';
import { GameSession, serializeRun } from '../../src/engine/index.ts';
import { policyById } from '../../src/engine/ai/bots/generic.ts';
import { openSheet, selectVillager, startRedbank, watchConsole } from './helpers.ts';

/** Things that go wrong in real browsers: a render crash, no canvas, a full disk, a small screen with big text, a turned phone, a save from elsewhere. */

function savedDay5(): string {
  const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
  const p = policyById('evidence-first');
  for (let i = 0; i < 4; i++) p.playDay(g);
  return serializeRun(g.state);
}

test.describe('resilience', () => {
  test('a render crash shows a recovery screen, not a blank page, and the save survives it', async ({ page }) => {
    await startRedbank(page, 1);
    await page.locator('[data-claim="river_fears_fire"]').click();
    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await page.getByTestId('digest-continue').click();
    const errors = watchConsole(page);
    await page.evaluate(() => (window as unknown as { __belief: { crash: () => void } }).__belief.crash());
    const box = page.getByRole('alert').filter({ hasText: 'Something broke' });
    await expect(box).toBeVisible();
    await expect(box).toContainText('Your last save is safe');
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByTestId('title')).toBeVisible();
    await expect(page.getByTestId('continue')).toContainText('day 2');
    void errors;
  });

  test('without a canvas the game says so and is still fully playable from the lists', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = (() => null) as never;
    });
    await startRedbank(page, 1);
    await expect(page.locator('.toast, [role="status"], [role="alert"]').filter({ hasText: /cannot draw the map/i }).first()).toBeVisible();
    await page.locator('[data-claim="river_fears_fire"]').click();
    await selectVillager(page, 'Ivo Thatcher');
    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).click();
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);
    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await expect(page.getByTestId('digest')).toBeVisible();
  });

  test('a full disk is announced once with the way out, and a downloaded save loads back in', async ({ page, context }) => {
    await context.addInitScript(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k.startsWith('be:save')) throw new DOMException('full', 'QuotaExceededError');
        return orig.call(this, k, v);
      };
    });
    await startRedbank(page, 1);
    await page.locator('[data-claim="river_fears_fire"]').click();
    await selectVillager(page, 'Ivo Thatcher');
    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).click();
    // a toast says so once, and a persistent "Not saved" chip stays on the play bar for as long as it is true
    await expect(page.getByTestId('unsaved')).toBeVisible();
    // the way out: Settings > Download this game
    await page.getByTestId('menu-btn').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-save').click()]);
    const path = await dl.path();
    expect(path).toBeTruthy();
    // load it into a fresh page: the exact same day and Influence come back
    const fs = await import('node:fs');
    const text = fs.readFileSync(path!, 'utf8');
    expect(JSON.parse(text).format).toBe('belief-engine-save');
    await page.goto('/?debug=1');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByTestId('load-save-file').setInputFiles({ name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.getByTestId('play')).toBeVisible();
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);
  });

  test('a junk or foreign save file is refused with a reason and changes nothing', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByTestId('load-save-file').setInputFiles({ name: 'save.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') });
    await expect(page.getByTestId('load-error')).toContainText(/not a Belief Engine save/i);
    await page.getByTestId('load-save-file').setInputFiles({ name: 'save.json', mimeType: 'application/json', buffer: Buffer.from('{{{{') });
    await expect(page.getByTestId('load-error')).toContainText(/not valid JSON/i);
    await expect(page.getByTestId('settings')).toBeVisible();
  });

  test('a save made elsewhere (an agent, another browser) loads and plays on', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByTestId('load-save-file').setInputFiles({ name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(savedDay5()) });
    await expect(page.getByTestId('day-box')).toContainText('5');
    await openSheet(page, 'laws');
    await expect(page.getByTestId('laws-panel')).toBeVisible();
  });

  test('320px wide with large text: nothing important is clipped and the primary action stays reachable', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('be:settings:v1', JSON.stringify({ textScale: 'large', tutorial: false })));
    await page.setViewportSize({ width: 320, height: 568 });
    await startRedbank(page, 1);
    await expect(page.getByTestId('play')).toBeVisible();
    const clipped = await page.evaluate(() => {
      const bad: string[] = [];
      // the claim hand is a row that scrolls sideways on purpose, so its cards are only checked for clipped text, not for being on screen
      for (const el of document.querySelectorAll<HTMLElement>('.topbar .stat, .daybox, .threat .t-title, .end-btn, .plan-bar .ap, .claim .c-text, .btn.primary')) {
        const inHand = !!el.closest('.hand, .claims');
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'visible') bad.push(`${el.className}: text wider than its box`);
        if (!inHand && (r.right > window.innerWidth + 1 || r.left < -1)) bad.push(`${el.className}: outside the viewport (${Math.round(r.left)}..${Math.round(r.right)})`);
      }
      return bad;
    });
    expect(clipped).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    const end = await page.getByTestId('end-day').boundingBox();
    expect(end && end.y + end.height <= 568 + 1 && end.x >= 0 && end.x + end.width <= 321).toBe(true);
  });

  test('turning a tablet keeps the run, the selection and a visible End Day', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await startRedbank(page, 1);
    await page.locator('[data-claim="river_fears_fire"]').click();
    await selectVillager(page, 'Ivo Thatcher');
    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).click();
    for (const [w, h] of [[1024, 768], [768, 1024], [1024, 768]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);
      await expect(page.getByTestId('end-day')).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    }
  });
});
