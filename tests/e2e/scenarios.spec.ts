import { expect, test } from '@playwright/test';
import { browserState, loadTraces, openSheet, replayTraceViaUi, selectPlace, selectVillager, startScenario, watchConsole } from './helpers.ts';

const harvest = loadTraces('harvest');
const ashwood = loadTraces('ashwood');

test.describe('Dry Season at Harvest Hollow and Ashwood (desktop)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'desktop flows');

  test('Harvest briefing shows its own threat chart, starter choice, trade deal and forecast', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await page.getByTestId('begin-harvest').click();
    const brief = page.getByTestId('briefing');
    await expect(brief).toBeVisible();
    await page.getByTestId('begin').click();
    await expect(page.getByTestId('play')).toBeVisible();
    // two starters: nothing happens until one is chosen
    await expect(page.getByTestId('coach')).toBeVisible();
    await page.locator('[data-claim="moonlight_ripens_grain"]').click();
    await openSheet(page, 'forecast');
    await expect(page.getByTestId('forecast-panel')).toContainText(/crop|field|harvest/i);
    // the broker's card offers the trade (disabled until she believes)
    await selectVillager(page, 'Dalia');
    await expect(page.locator('.act', { hasText: 'grain caravan' })).toBeVisible();
    await expect(page.locator('.act', { hasText: 'grain caravan' })).toBeDisabled();
    await expect(page.locator('.act', { hasText: 'grain caravan' })).toContainText('proof');
    expect(errors).toEqual([]);
  });

  test('Harvest: moonlight strategy trace replayed with real clicks reaches victory with identical hashes', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchConsole(page);
    await startScenario(page, 'harvest', harvest.canonicalSeed);
    await replayTraceViaUi(page, harvest.canonicalSeed, harvest.moonlight.actions, 'harvest');
    await expect(page.getByTestId('verdict')).toHaveText('Victory');
    const st = await browserState(page);
    expect(st.hash).toBe(harvest.moonlight.stateHash);
    expect(st.eventHash).toBe(harvest.moonlight.eventHash);
    expect(errors).toEqual([]);
  });

  test('Harvest: caravan-broker strategy (trade deals) reaches victory by a different route', async ({ page }) => {
    test.setTimeout(300_000);
    await startScenario(page, 'harvest', harvest.canonicalSeed);
    await replayTraceViaUi(page, harvest.canonicalSeed, harvest.caravans.actions, 'harvest');
    await expect(page.getByTestId('verdict')).toHaveText('Victory');
    const st = await browserState(page);
    expect(st.hash).toBe(harvest.caravans.stateHash);
  });

  test('Harvest: doing nothing is a defeat whose debrief names what happened', async ({ page }) => {
    test.setTimeout(180_000);
    await startScenario(page, 'harvest', harvest.canonicalSeed);
    await page.locator('[data-claim="moonlight_ripens_grain"]').click();
    for (let d = 0; d < 9; d++) {
      if (await page.getByTestId('debrief').count()) break;
      await page.getByTestId('end-day').click();
      await page.getByTestId('confirm-end').click();
      await page.getByTestId('digest-continue').click();
    }
    await expect(page.getByTestId('verdict')).toHaveText('Defeat');
    await expect(page.getByTestId('debrief')).toContainText('What you may have missed');
  });

  test('Ashwood: smoke-ring trace replayed with real clicks (campfire rituals, counters, messengers) reaches victory', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchConsole(page);
    await startScenario(page, 'ashwood', ashwood.canonicalSeed);
    await replayTraceViaUi(page, ashwood.canonicalSeed, ashwood.smokeRing.actions, 'ashwood');
    await expect(page.getByTestId('verdict')).toHaveText('Victory');
    const st = await browserState(page);
    expect(st.hash).toBe(ashwood.smokeRing.stateHash);
    expect(st.eventHash).toBe(ashwood.smokeRing.eventHash);
    expect(errors).toEqual([]);
  });

  test('Ashwood: decoy-fire strategy trace reaches victory by a different route', async ({ page }) => {
    test.setTimeout(300_000);
    await startScenario(page, 'ashwood', ashwood.canonicalSeed);
    await replayTraceViaUi(page, ashwood.canonicalSeed, ashwood.decoy.actions, 'ashwood');
    await expect(page.getByTestId('verdict')).toHaveText('Victory');
    const st = await browserState(page);
    expect(st.hash).toBe(ashwood.decoy.stateHash);
  });

  test('Ashwood: a campfire place card explains smoke and offers its rituals', async ({ page }) => {
    await startScenario(page, 'ashwood', ashwood.canonicalSeed);
    await page.locator('[data-claim]').first().click();
    await selectPlace(page, 'c_d1');
    const card = page.getByTestId('landmark-card');
    await expect(card).toContainText(/fire pit|Burning/);
    await expect(card.locator('.act').first()).toBeVisible();
  });
});

test.describe('new scenarios on a phone', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 999) > 600, 'phone project only');

  for (const id of ['harvest', 'ashwood']) {
    test(`${id}: play, pick a story, act, end day on a 390px screen`, async ({ page }) => {
      const errors = watchConsole(page);
      await startScenario(page, id, 2);
      await expect(page.getByTestId('end-day')).toBeInViewport();
      await expect(page.getByTestId('ap')).toBeVisible();
      await page.locator('[data-claim]').first().tap();
      await page.getByTestId('end-day').tap();
      await page.getByTestId('confirm-end').tap();
      await expect(page.getByTestId('digest')).toBeVisible();
      await page.getByTestId('digest-continue').tap();
      const st = await browserState(page);
      expect(st.day).toBe(2);
      // no horizontal page scroll
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow).toBe(false);
      expect(errors).toEqual([]);
    });
  }
});
