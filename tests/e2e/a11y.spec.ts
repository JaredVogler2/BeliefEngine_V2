import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GameSession, serializeRun } from '../../src/engine/index.ts';
import { policyById } from '../../src/engine/ai/bots/generic.ts';
import { chooseClaim, openSheet, selectVillager, startRedbank } from './helpers.ts';

async function audit(page: Page, label: string) {
  // a card that is still fading in is measured half transparent over whatever is behind it: let every finite animation finish first
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime as number))
        .map((a) => a.finished.catch(() => null)),
    ),
  );
  const res = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(bad.map((v) => `${label}: ${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

test.describe('accessibility', () => {
  test('no critical or serious axe violations on the main screens', async ({ page }) => {
    await page.goto('/?debug=1');
    await audit(page, 'title');
    await page.getByRole('button', { name: 'How it works' }).click();
    await audit(page, 'how-to');
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await audit(page, 'settings');
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByTestId('play').click();
    await audit(page, 'scenarios');
    await page.getByTestId('begin-redbank').click();
    await audit(page, 'briefing');
    await page.getByTestId('begin').click();
    await chooseClaim(page, 'river_fears_fire');
    await audit(page, 'play');
    await selectVillager(page, 'Old Harl');
    await audit(page, 'play+villager');
    await openSheet(page, 'laws');
    await audit(page, 'laws');
    await openSheet(page, 'forecast');
    await audit(page, 'forecast');
  });

  test('the Atlas, digest, end-day dialog, log, social lens and debrief pass axe too, at large text and in high contrast', async ({ page }) => {
    const played = (days: number, policy: string) => {
      const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
      const p = policyById(policy);
      for (let i = 0; i < days && !g.state.outcome; i++) p.playDay(g);
      return serializeRun(g.state);
    };
    const load = async (json: string) => {
      await page.goto('/?debug=1');
      await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
      await page.evaluate((j) => (window as unknown as { __belief: { load: (s: string) => boolean } }).__belief.load(j), json);
    };
    // large text + high contrast are the two settings most likely to expose contrast and clipping problems
    await page.addInitScript(() => localStorage.setItem('be:settings:v1', JSON.stringify({ textScale: 'large', highContrast: true, tutorial: false })));
    await page.goto('/');
    await page.getByTestId('atlas-open').click();
    for (const tab of ['laws', 'lore', 'postcards', 'badges', 'unlocks', 'stats', 'archive']) {
      await page.getByTestId(`atlas-tab-${tab}`).click();
      await audit(page, `atlas/${tab} (large, high contrast)`);
    }
    await load(played(5, 'evidence-first'));
    await audit(page, 'play with a live law (large, high contrast)');
    await openSheet(page, 'log');
    await audit(page, 'log (large, high contrast)');
    await page.getByTestId('end-day').click();
    await audit(page, 'end-day dialog (large, high contrast)');
    await page.getByTestId('confirm-end').click();
    await audit(page, 'morning digest (large, high contrast)');
    await page.getByTestId('digest-continue').click();
    await load(played(20, 'evidence-first'));
    await expect(page.getByTestId('debrief-scene')).toBeVisible();
    await audit(page, 'debrief with scene (large, high contrast)');
  });

  test('every state is axe-clean on the smallest supported phone (320x568)', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 600, 'phone project only');
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/?debug=1');
    await audit(page, 'title 320');
    await page.getByTestId('play').click();
    await audit(page, 'scenarios 320');
    await page.getByTestId('begin-redbank').click();
    await audit(page, 'briefing 320');
    await page.getByTestId('begin').click();
    await audit(page, 'play 320');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'no sideways scroll at 320').toBe(true);
  });

  test('a whole turn is playable with the keyboard alone', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'desktop keyboard flow');
    await startRedbank(page, 2);
    await page.locator('canvas').focus();
    await page.keyboard.press('1'); // choose the first story
    await expect(page.locator('[data-claim="river_fears_fire"]')).toHaveAttribute('aria-pressed', 'true');
    // the details sheet is closed until asked for: reach its button and the Village tab with the keyboard alone
    await page.getByTestId('sheet-toggle').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.side.open')).toBeVisible();
    await page.getByTestId('tab-village').focus();
    await expect(page.getByTestId('tab-village')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('village-panel')).toBeVisible();
    await page.getByRole('button', { name: /^Mara Wells/ }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /^Tell Mara Wells/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);
    await page.keyboard.press('u'); // undo by shortcut
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 3 of 5/);
    await page.locator('canvas').focus();
    await page.keyboard.press('Enter'); // opens End Day confirmation
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByTestId('end-day').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('confirm-end')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('digest')).toBeVisible();
    await expect(page.getByTestId('digest-continue')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('day-box')).toContainText('2');
    // the screen-reader live region announced the result
    await expect(page.getByTestId('announce')).not.toBeEmpty();
  });

  test('reduced motion setting is honoured and everything stays operable', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await page.goto('/?debug=1');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await page.getByTestId('play').click();
    await page.getByTestId('begin-redbank').click();
    await page.getByTestId('begin').click();
    await expect(page.getByTestId('play')).toBeVisible();
    await ctx.close();
  });
});
