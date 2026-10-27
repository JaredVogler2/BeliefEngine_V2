import { expect, test, type Page } from '@playwright/test';
import { closeSheet, selectVillager, watchConsole } from './helpers.ts';

/** Inventor mode through the real UI: type a sentence, read the preview, pay, and tell the village. */

async function startInventor(page: Page) {
  await page.goto('/?debug=1');
  await page.getByTestId('play').click();
  await page.getByTestId('begin-redbank').click();
  await page.getByTestId('seed').fill('1');
  await page.getByTestId('difficulty').selectOption('normal');
  await page.getByTestId('opt-inventor').check();
  // rebuilding the briefing keeps the chosen options
  await expect(page.getByTestId('opt-inventor')).toBeChecked();
  await page.getByTestId('seed').fill('1');
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('play')).toBeVisible();
  await page.locator('[data-claim="river_fears_fire"]').click();
}

const ap = (page: Page) => page.evaluate(() => (window as unknown as { __belief: { state: { ap: number } } }).__belief.state.ap);

test.describe('Inventor mode', () => {
  test('write a belief from a sentence: refusals explain themselves, the preview is honest, and the belief can be told', async ({ page }) => {
    const errors = watchConsole(page);
    await startInventor(page);
    const before = await ap(page);
    await page.getByTestId('compose-open').click();
    await expect(page.getByTestId('compose')).toBeVisible();

    // something the village cannot model: refused with the reason and things that can be tried; nothing to confirm
    await page.getByTestId('compose-text').fill('Everyone in the village becomes immortal.');
    await page.getByTestId('compose-preview').click();
    await expect(page.getByTestId('compose-status')).toContainText('Cannot be modelled');
    await expect(page.getByTestId('compose-result')).toContainText('cannot model');
    await expect(page.getByTestId('compose-confirm')).toHaveCount(0);
    await expect(page.getByTestId('compose-offers')).toBeVisible();
    expect(await ap(page)).toBe(before);

    // something it can: the preview says what it does, what it needs and what it costs, for free
    await page.getByTestId('compose-text').fill('The river slows beside lit beacons.');
    await page.getByTestId('compose-preview').click();
    await expect(page.getByTestId('compose-status')).toContainText('Understood');
    await expect(page.getByTestId('draft-0-mechanics')).toContainText(/river|water|flood/i);
    await expect(page.getByTestId('compose-result')).toContainText('Influence to write it');
    await expect(page.getByTestId('compose-result')).toContainText('Safety check');
    expect(await ap(page)).toBe(before);

    // the player names it and pays
    await page.getByTestId('compose-title').fill('Slow Water');
    await page.getByTestId('compose-confirm').click();
    await expect(page.getByTestId('compose')).toHaveCount(0);
    await closeSheet(page);
    const card = page.locator('[data-claim^="custom_"]');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Slow Water');
    await expect(card).toContainText('Your own belief');
    expect(await ap(page)).toBe(before - 2);

    // and it is told like any other story
    await selectVillager(page, 'Ivo Thatcher');
    await page.locator('.act').filter({ hasText: /^Tell Ivo/ }).first().click();
    const conv = await page.evaluate(() => {
      const st = (window as unknown as { __belief: { state: { villagers: { name: string; beliefs: Record<string, { conv: number }> }[] } } }).__belief.state;
      const v = st.villagers.find((x) => x.name.startsWith('Ivo'))!;
      return Object.entries(v.beliefs).filter(([id]) => id.startsWith('custom_')).map(([, b]) => b.conv);
    });
    expect(conv.length).toBe(1);
    expect(conv[0]).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('not enough Influence: the preview still works but writing is blocked, with the reason', async ({ page }) => {
    await startInventor(page);
    await page.getByTestId('compose-open').click();
    await page.getByTestId('compose-text').fill('The river slows beside lit beacons.');
    await page.getByTestId('compose-preview').click();
    await page.getByTestId('compose-confirm').click(); // 2 of 3
    await page.getByTestId('compose-open').click();
    await page.getByTestId('compose-text').fill('Fire spreads slowly.');
    await page.getByTestId('compose-preview').click();
    await expect(page.getByTestId('compose-result')).toContainText('Influence');
    await expect(page.getByTestId('compose-confirm')).toBeDisabled();
  });

  test('typing keeps focus in the box, and Enter reads the sentence (the dialog does not hand focus back to the button that opened it)', async ({ page }) => {
    await startInventor(page);
    await page.getByTestId('compose-open').click();
    const box = page.getByTestId('compose-text');
    await expect(box).toBeFocused();
    await box.pressSequentially('The river slows beside lit beacons.', { delay: 15 });
    await expect(box).toBeFocused();
    await expect(box).toHaveValue('The river slows beside lit beacons.');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('compose-status')).toContainText('Understood');
    await expect(box).toBeFocused();
  });

  test('"What can I write?" lists sentences that always work, and clicking one previews it', async ({ page }) => {
    await startInventor(page);
    await page.getByTestId('compose-open').click();
    await page.getByTestId('compose-help').locator('summary').click();
    const n = await page.locator('[data-testid^=help-]').count();
    expect(n).toBeGreaterThanOrEqual(10);
    await page.getByTestId('help-3').click();
    await expect(page.getByTestId('compose-status')).toContainText('Understood');
    await expect(page.getByTestId('compose-confirm')).toBeVisible();
  });

  test('a normal run has no way to write a belief, and the briefing explains what Inventor mode is', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await page.getByTestId('begin-redbank').click();
    await expect(page.getByTestId('inventor-card')).toContainText('unranked');
    await page.getByTestId('begin').click();
    await page.locator('[data-claim="river_fears_fire"]').click();
    await expect(page.getByTestId('compose-open')).toHaveCount(0);
  });

  test('the modal fits the screen and never scrolls sideways', async ({ page }) => {
    await startInventor(page);
    await page.getByTestId('compose-open').click();
    await page.getByTestId('compose-text').fill('The river slows beside lit beacons.');
    await page.getByTestId('compose-preview').click();
    await expect(page.getByTestId('compose-confirm')).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
    const modal = await page.locator('.modal').boundingBox();
    const vp = page.viewportSize()!;
    expect(modal!.x).toBeGreaterThanOrEqual(-1);
    expect(modal!.x + modal!.width).toBeLessThanOrEqual(vp.width + 1);
    await page.getByTestId('compose-confirm').scrollIntoViewIfNeeded();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('compose')).toHaveCount(0);
  });

  test('an Inventor run ends with an unranked note, and earns nothing in the Atlas', async ({ page }) => {
    await startInventor(page);
    await page.getByTestId('compose-open').click();
    await page.getByTestId('compose-text').fill('The river slows beside lit beacons.');
    await page.getByTestId('compose-preview').click();
    await page.getByTestId('compose-confirm').click();
    for (let i = 0; i < 12; i++) {
      if (await page.getByTestId('debrief').isVisible()) break;
      await closeSheet(page);
      await page.getByTestId('end-day').click();
      await page.getByTestId('confirm-end').click();
      await page.getByTestId('digest-continue').click();
    }
    await expect(page.getByTestId('debrief')).toBeVisible();
    await expect(page.getByTestId('inventor-note')).toContainText('Inventor run (unranked)');
    await expect(page.getByTestId('inventor-note')).toContainText('The river slows beside lit beacons.');
    const atlas = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((k) => k.includes('progress'));
      return keys.map((k) => JSON.parse(localStorage.getItem(k) || '{}')).map((p) => Object.keys(p.atlas?.laws ?? {}).length);
    });
    expect(atlas.every((n) => n === 0)).toBe(true);
  });
});
