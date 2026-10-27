import { expect, test } from '@playwright/test';
import { browserState, chooseClaim, replayTraceViaUi, selectVillager, startRedbank, traces, watchConsole } from './helpers.ts';

test.describe('Flood at Redbank (desktop)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'desktop flows');

  test('start menu -> briefing -> inspect a named villager -> seed a rumour -> end the day', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug=1');
    await expect(page.getByTestId('title')).toBeVisible();
    await page.getByTestId('play').click();
    await page.getByTestId('begin-redbank').click();
    await expect(page.getByTestId('briefing')).toContainText('Flood at Redbank');
    await page.getByTestId('begin').click();
    await expect(page.getByTestId('day-box')).toContainText('1');
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 3 of 5/);

    // the coach asks us to choose a story first
    await expect(page.getByTestId('coach')).toContainText('Choose a story');
    await page.locator('[data-claim="river_fears_fire"]').click();
    await selectVillager(page, 'Ivo Thatcher');
    const card = page.getByTestId('villager-card');
    await expect(card).toContainText('Ivo Thatcher');
    await expect(card).toContainText('failed comet prophecy');

    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).click();
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);
    await expect(card).toContainText('Last moved: the Keeper told them directly');
    await expect(page.locator('.plan-item')).toContainText(['Tell Ivo Thatcher']);

    // cannot talk to the same person twice in one day: disabled with a visible reason
    await expect(page.locator('.act', { hasText: 'Tell Ivo Thatcher' })).toBeDisabled();
    await expect(page.locator('.act', { hasText: 'Tell Ivo Thatcher' })).toContainText('already spoken');

    // undo restores Influence exactly
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 3 of 5/);
    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).click();

    await page.getByTestId('end-day').click();
    await expect(page.getByRole('dialog')).toContainText('End Day 1?');
    await page.getByTestId('keep-planning').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await expect(page.getByTestId('digest')).toBeVisible();
    await page.getByTestId('digest-continue').click();
    const st = await browserState(page);
    expect(st.day).toBe(2);
    expect(st.ap).toBe(5); // 2 unspent + 3
    await page.getByTestId('tab-laws').click();
    await expect(page.getByTestId('laws-panel')).toContainText('River fears fire');
    expect(errors).toEqual([]);
  });

  test('map click selects a villager through the canvas', async ({ page }) => {
    await startRedbank(page);
    await chooseClaim(page, 'river_fears_fire');
    const pos = await page.evaluate(() => {
      const r = (window as unknown as { __beRenderer: { villagerScreen: (id: string) => { x: number; y: number } } }).__beRenderer;
      const p = r.villagerScreen('mara');
      const b = document.querySelector('canvas')!.getBoundingClientRect();
      return { x: p.x + b.left, y: p.y + b.top + 10 };
    });
    await page.mouse.click(pos.x, pos.y);
    await expect(page.getByTestId('villager-card')).toContainText('Mara Wells');
  });

  test('Strategy A (Fire Wall): recorded winning trace, driven by real clicks, reaches victory with an identical state hash', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchConsole(page);
    await startRedbank(page, traces.canonicalSeed);
    await replayTraceViaUi(page, traces.canonicalSeed, traces.fireWall.actions);
    await expect(page.getByTestId('debrief')).toBeVisible();
    await expect(page.getByTestId('verdict')).toHaveText('Victory');
    await expect(page.getByTestId('debrief')).toContainText('River fears fire');
    await expect(page.getByTestId('whatif')).toHaveCount(0); // the what-if search is a defeat feature
    const st = await browserState(page);
    expect(st.hash).toBe(traces.fireWall.stateHash);
    expect(st.eventHash).toBe(traces.fireWall.eventHash);
    expect(errors).toEqual([]);
  });

  test('Strategy B (Witness Bridge): a different recorded winning trace also reaches victory', async ({ page }) => {
    test.setTimeout(240_000);
    await startRedbank(page, traces.canonicalSeed);
    await replayTraceViaUi(page, traces.canonicalSeed, traces.witnessBridge.actions);
    await expect(page.getByTestId('verdict')).toHaveText('Victory');
    await expect(page.getByTestId('debrief')).toContainText('bridge');
    const st = await browserState(page);
    expect(st.hash).toBe(traces.witnessBridge.stateHash);
  });

  test('doing nothing loses: defeat debrief explains why, then retry same seed and new seed work', async ({ page }) => {
    test.setTimeout(120_000);
    await startRedbank(page, traces.canonicalSeed);
    await page.locator('[data-claim="river_fears_fire"]').click();
    for (let d = 1; d <= 7; d++) {
      await page.getByTestId('end-day').click();
      await page.getByTestId('confirm-end').click();
      await page.getByTestId('digest-continue').click();
    }
    await expect(page.getByTestId('verdict')).toHaveText('Defeat');
    await expect(page.getByTestId('debrief')).toContainText('Why people were lost');
    await expect(page.getByTestId('debrief')).toContainText('What you may have missed');
    const lost = await browserState(page);
    expect(lost.outcome).toBe('defeat');

    await page.getByTestId('retry-same').click();
    await expect(page.getByTestId('play')).toBeVisible();
    const again = await browserState(page);
    expect(again.day).toBe(1);
    expect(again.alive).toBe(14);

    // finish another loss quickly and take a new seed: setup is not the same world state
    for (let d = 1; d <= 7; d++) {
      await page.getByTestId('end-day').click();
      await page.getByTestId('confirm-end').click();
      await page.getByTestId('digest-continue').click();
    }
    await page.getByTestId('new-seed').click();
    const fresh = await page.evaluate(() => (window as unknown as { __belief: { state: { seed: number; flags: object } } }).__belief.state.seed);
    expect(fresh).not.toBe(traces.canonicalSeed);
  });
});
