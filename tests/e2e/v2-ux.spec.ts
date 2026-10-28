import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { browserState, closeSheet, openSheet, selectVillager, watchConsole } from './helpers.ts';

/**
 * Phase 12 in the real browser (production build, 2D map, offline unless a test opts in to the local simulator): the main menu's
 * modes, the composer keeping an unsent belief (closing it, turning the phone), "who tells it first" after writing, a villager card
 * that answers what they think, why, whether they would listen and what they will do, a "Why?" link to the event, stopping an online
 * reading, an outage falling back to the offline reader, and the composer at four iPhone sizes. Axe audits each new surface.
 *
 * Screenshots for the docs: BE_SHOTS=1 npx playwright test tests/e2e/v2-ux.spec.ts
 */

const SHOTS = process.env.BE_SHOTS === '1';
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  const vw = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: `docs/screenshots/v2-phase12/${name}-${vw >= 900 ? 'desktop' : `phone-${vw}`}.png` });
}

async function audit(page: Page, label: string) {
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

/** a Generative Chronicle at Redbank, from the main menu's own button, with the opening story chosen */
async function startChronicle(page: Page) {
  await page.goto('/?debug=1');
  await page.getByTestId('play-reality').click();
  await page.getByTestId('begin-reality-redbank').click();
  await page.getByTestId('seed').fill('1');
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('play')).toBeVisible();
  await page.locator('[data-claim="river_fears_fire"]').click();
  await closeSheet(page);
}

async function read(page: Page, sentence: string) {
  await page.getByTestId('reality-text').fill(sentence);
  await page.getByTestId('reality-preview').click();
  await expect(page.getByTestId('reality-result')).toBeVisible();
}

const HENS = 'Chickens fly when the bell rings.';

const writtenId = (page: Page) => page.evaluate(() => (window as unknown as { __belief: { state: { claims: { id: string; def?: { reality?: unknown } }[] } } }).__belief.state.claims.find((c) => c.def?.reality)?.id ?? null);
const conviction = (page: Page, villager: string, claim: string) =>
  page.evaluate(([v, c]) => (window as unknown as { __belief: { state: { villagers: { id: string; beliefs: Record<string, { conv: number }> }[] } } }).__belief.state.villagers.find((x) => x.id === v)!.beliefs[c]?.conv ?? 0, [villager, claim] as const);

test.describe('desktop and iPhone UX (phase 12)', () => {
  test('the main menu names each mode in a few words, and each opens ready to begin, with how reading works explained', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug=1');
    await expect(page.getByTestId('play')).toContainText('Play Classic');
    await expect(page.getByTestId('play')).toContainText('offline');
    await expect(page.getByTestId('play-reality')).toContainText('write your own laws');
    await expect(page.getByTestId('play-living')).toContainText('villagers who remember');
    await expect(page.getByTestId('play-lab')).toContainText('never ranked');
    await shot(page, 'menu');
    await audit(page, 'title');

    await page.getByTestId('play-reality').click();
    await expect(page.getByTestId('reality-panel')).toBeVisible();
    await expect(page.getByTestId('begin-reality-redbank')).toHaveClass(/primary/);
    await expect(page.getByTestId('begin-living-redbank')).not.toHaveClass(/primary/);
    // how reading works, before anything is played: offline first, a model only when asked, who pays, and what a failure costs
    const note = page.getByTestId('reality-reading');
    await note.locator('summary').click();
    await expect(note).toContainText('nothing leaves this device before you agree');
    await expect(note).toContainText('costs you nothing');
    await expect(note).toContainText('A model only proposes');
    await shot(page, 'reality-modes');
    await audit(page, 'reality modes');

    // each menu button leads its own mode on the chapter cards; Classic opens the Classic chapters
    await page.goto('/?debug=1');
    await page.getByTestId('play-living').click();
    await expect(page.getByTestId('begin-living-redbank')).toHaveClass(/primary/);
    await page.goto('/?debug=1');
    await page.getByTestId('play-lab').click();
    await expect(page.getByTestId('begin-lab-redbank')).toHaveClass(/primary/);
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await expect(page.getByTestId('begin-redbank')).toBeVisible();
    await expect(page.getByTestId('reality-panel')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('an unsent belief survives closing the composer and turning the phone; a changed village asks for a new reading', async ({ page }) => {
    const errors = watchConsole(page);
    await startChronicle(page);
    await page.getByTestId('reality-open').click();
    await read(page, HENS);
    await expect(page.getByTestId('reality-kind')).toHaveText('Understood');

    // turn the device: the dialog, the words and the reading stay exactly as they were
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.height, height: size.width });
    await expect(page.getByTestId('reality-text')).toHaveValue(HENS);
    await expect(page.getByTestId('reality-kind')).toHaveText('Understood');
    await page.setViewportSize(size);
    await expect(page.getByTestId('reality-text')).toHaveValue(HENS);

    // close and reopen: the words and the reading come back (the village has not changed, so the reading still holds)
    await page.getByTestId('reality-close').click();
    await expect(page.getByTestId('reality-compose')).toHaveCount(0);
    await page.getByTestId('reality-open').click();
    await expect(page.getByTestId('reality-text')).toHaveValue(HENS);
    await expect(page.getByTestId('reality-kind')).toHaveText('Understood');
    await page.getByTestId('reality-close').click();

    // the village changes (a story is told): the words come back, the reading must be done again
    await selectVillager(page, 'Ivo Thatcher');
    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).click();
    await closeSheet(page);
    await page.getByTestId('reality-open').click();
    await expect(page.getByTestId('reality-text')).toHaveValue(HENS);
    await expect(page.getByTestId('reality-result')).toHaveCount(0);
    await expect(page.getByTestId('reality-note')).toContainText('changed since you read this');
    await page.getByTestId('reality-preview').click();
    await expect(page.getByTestId('reality-kind')).toHaveText('Understood');
    await page.getByTestId('reality-confirm').click();
    await page.getByTestId('tell-first-done').click();

    // once written, the draft is gone: the next belief starts from an empty page
    await page.getByTestId('reality-open').click();
    await expect(page.getByTestId('reality-text')).toHaveValue('');
    expect(errors).toEqual([]);
  });

  test('after writing, the dialog asks who tells it first: the people who vote on it, what a telling does, and its price', async ({ page }) => {
    const errors = watchConsole(page);
    await startChronicle(page);
    await page.getByTestId('reality-open').click();
    await read(page, HENS);
    await page.getByTestId('reality-confirm').click();
    const id = (await writtenId(page))!;
    expect(id).toBeTruthy();

    const roster = page.getByTestId('tell-first');
    await expect(roster).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Who tells it first?' })).toBeVisible();
    await expect(roster).toContainText('people who vote on it');
    const rows = page.getByTestId('tell-first-list').locator('li');
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
    expect(await rows.count()).toBeLessThanOrEqual(4);
    const first = rows.first();
    await expect(first).toContainText('Would believe it 0 →');
    const tell = first.getByRole('button', { name: /^Tell · 1 Influence, to / });
    await expect(tell).toBeEnabled();
    await expect(tell).toContainText('Tell · 1');
    const who = (await first.getAttribute('data-testid'))!.replace('tell-row-', '');
    await shot(page, 'tell-first');
    await audit(page, 'tell first');

    // telling from the list is the same action as anywhere: 1 Influence, and the person now holds the belief
    const ap = (await browserState(page)).ap;
    await tell.click();
    await expect.poll(async () => (await browserState(page)).ap).toBe(ap - 1);
    expect(await conviction(page, who, id)).toBeGreaterThan(0);
    await expect(page.getByTestId(`tell-row-${who}`)).toContainText('Told today');
    await expect(page.getByTestId(`tell-first-${who}`)).toBeDisabled();
    await expect(page.getByTestId('tell-first-done')).toHaveText('Done (1 told)');

    // or choose in the village itself: the dialog closes with the new belief in hand
    await page.getByTestId('tell-first-world').click();
    await expect(page.getByTestId('reality-compose')).toHaveCount(0);
    await expect(page.locator(`[data-claim="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });

  test('a villager card answers what they think, why, whether they would listen and what they will do; "Why?" opens the event', async ({ page }) => {
    const errors = watchConsole(page);
    await startChronicle(page);
    await selectVillager(page, 'Ivo Thatcher');
    const glance = page.getByTestId('villager-glance');
    await expect(glance).toBeVisible();
    await expect(page.getByTestId('glance-thinks')).toContainText('Has not heard');
    await expect(page.getByTestId('glance-listen')).toContainText('Yes: hearing it from you now would move them 0 →');
    await expect(page.getByTestId('glance-next')).not.toBeEmpty();
    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).click();
    await expect(page.getByTestId('glance-why')).toContainText('the Keeper told them directly');
    await expect(page.getByTestId('glance-listen')).toContainText('already spoken');
    await shot(page, 'villager-glance');
    await audit(page, 'villager glance');
    await page.getByTestId('glance-why-link').click();
    const focus = page.getByTestId('log-focus');
    await expect(focus).toBeVisible();
    await expect(focus).toContainText('You tell Ivo Thatcher');
    await expect(page.locator('.log-item.focused')).toHaveCount(1);
    await shot(page, 'why-event');
    await audit(page, 'log focus');
    expect(errors).toEqual([]);
  });

  test('an online reading can be stopped, and an outage falls back to the offline reader with nothing spent', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the request path is the same on phones; one viewport is enough');
    await startChronicle(page);
    await page.getByTestId('reality-open').click();
    await page.getByTestId('reality-online').click();
    await page.getByTestId('reality-consent-yes').click();
    await expect(page.getByTestId('reality-online-on')).toContainText('simulated');
    const ap = (await browserState(page)).ap;

    // a reading that never answers: Stop ends the wait, keeps the words, spends nothing
    await page.route('**/api/interpret-reality', () => {});
    await page.getByTestId('reality-text').fill(HENS);
    await page.getByTestId('reality-preview').click();
    await expect(page.getByTestId('reality-busy')).toContainText('online reader');
    await page.getByTestId('reality-stop').click();
    await expect(page.getByTestId('reality-stop')).toHaveCount(0);
    await expect(page.getByTestId('reality-note')).toContainText('Stopped. No Influence was spent');
    await expect(page.getByTestId('reality-result')).toHaveCount(0);
    await expect(page.getByTestId('reality-text')).toHaveValue(HENS);
    expect((await browserState(page)).ap).toBe(ap);
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // the provider is down: the offline reading is shown at once, labelled, nothing spent, and asking again is the player's choice
    await page.route('**/api/interpret-reality', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'provider_unavailable' }) }));
    await page.getByTestId('reality-preview').click();
    await expect(page.getByTestId('reality-note')).toContainText('could not be reached');
    await expect(page.getByTestId('reality-note')).toContainText('offline reading instead; no Influence was spent');
    await expect(page.getByTestId('reality-source')).toContainText('offline');
    await expect(page.getByTestId('reality-retry')).toHaveText('Try online again');
    await shot(page, 'outage');
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // a rate limit: the button waits out the time the server asked for, then lets the player ask again (never by itself)
    await page.route('**/api/interpret-reality', (r) => r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'rate_limited', retryAfterSec: 2 }) }));
    await page.getByTestId('reality-preview').click();
    await expect(page.getByTestId('reality-retry')).toBeDisabled();
    await expect(page.getByTestId('reality-retry')).toContainText(/again in \d s/);
    await expect(page.getByTestId('reality-retry')).toBeEnabled({ timeout: 6000 });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.getByTestId('reality-retry').click();
    await expect(page.getByTestId('reality-source')).toContainText('simulated');
    expect((await browserState(page)).ap).toBe(ap);
  });

  test('the composer works from the keyboard: Enter reads, Escape closes and gives focus back, the words are kept', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a hardware keyboard flow');
    await startChronicle(page);
    await page.getByTestId('reality-open').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('reality-text')).toBeFocused();
    await page.keyboard.type(HENS);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('reality-kind')).toHaveText('Understood');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('reality-compose')).toHaveCount(0);
    await expect(page.getByTestId('reality-open')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('reality-text')).toHaveValue(HENS);
    // Tab stays inside the dialog
    for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  });

  test('a lost Generative run can be played again, a new seed or the same one, and stays a Generative run', async ({ page, isMobile }) => {
    test.skip(isMobile, 'one viewport is enough for the retry path');
    const run = () => page.evaluate(() => {
      const s = (window as unknown as { __belief: { state: { seed: number; flags: { reality?: number }; v2?: unknown } } }).__belief.state;
      return { seed: s.seed, reality: s.flags.reality ?? 0, v2: !!s.v2 };
    });
    const lose = async () => {
      for (let d = 0; d < 7 && !(await page.getByTestId('debrief').count()); d++) {
        await page.getByTestId('end-day').click();
        await page.getByTestId('confirm-end').click();
        await page.getByTestId('digest-continue').click();
      }
      await expect(page.getByTestId('verdict')).toHaveText('Defeat');
      await expect(page.getByTestId('seed-info')).toContainText('Generative Chronicle');
    };
    await startChronicle(page);
    const first = await run();
    await lose();
    await page.getByTestId('new-seed').click();
    await expect(page.getByTestId('play')).toBeVisible();
    const second = await run();
    expect(second).toMatchObject({ reality: 1, v2: true });
    expect(second.seed).not.toBe(first.seed);
    // once the opening story is chosen, the hand offers to write a belief, as in any Generative run
    await page.locator('[data-claim="river_fears_fire"]').click();
    await closeSheet(page);
    await expect(page.getByTestId('reality-open')).toBeVisible();
    await lose();
    await page.getByTestId('retry-same').click();
    await expect(page.getByTestId('play')).toBeVisible();
    expect(await run()).toEqual(second);
  });

  test('your data: what is kept and where, and deleting this game or everything on this device', async ({ page }) => {
    await startChronicle(page);
    await page.getByTestId('reality-open').click();
    await read(page, HENS);
    await page.getByTestId('reality-confirm').click();
    await page.getByTestId('tell-first-done').click();
    // the save on this device carries the run and its ledger of external inputs
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('be:save:v1') ?? '{}'));
    expect(saved.ledger.entries).toHaveLength(1);
    expect(saved.ledger.entries[0]).toMatchObject({ kind: 'interpretation', source: { reader: 'offline-v2' } });
    await page.goto('/?debug=1');
    await page.getByRole('button', { name: 'Settings' }).click();
    const card = page.getByTestId('your-data');
    await expect(card).toContainText('None of it leaves this device by itself');
    await expect(card).toContainText('for 7 days, validated readings');
    await card.scrollIntoViewIfNeeded();
    await shot(page, 'your-data');
    await audit(page, 'settings: your data');
    await page.getByTestId('delete-all').click();
    await page.getByTestId('delete-all-yes').click();
    await expect(page.getByTestId('title')).toBeVisible();
    await expect(page.getByTestId('continue')).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('be:')))).toEqual([]);
  });

  for (const [w, h] of [[320, 568], [375, 667], [390, 844], [430, 932]] as const) {
    test(`at ${w}×${h} the composer and "who tells it first" fit the screen, with touch-sized controls`, async ({ page, isMobile }) => {
      test.skip(!isMobile, 'iPhone sizes run on the phone profile (touch, coarse pointer)');
      await page.setViewportSize({ width: w, height: h });
      await startChronicle(page);
      await page.getByTestId('reality-open').click();
      const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      expect(await fits()).toBe(true);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      // the field and both buttons are on screen and at least 44px tall
      for (const t of ['reality-text', 'reality-preview', 'reality-close']) {
        const b = (await page.getByTestId(t).boundingBox())!;
        expect(b.x, t).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, t).toBeLessThanOrEqual(w + 1);
        expect(b.height, t).toBeGreaterThanOrEqual(44);
      }
      await read(page, HENS);
      expect(await fits()).toBe(true);
      await page.getByTestId('reality-confirm').scrollIntoViewIfNeeded();
      await shot(page, 'preview');
      await page.getByTestId('reality-confirm').click();
      await expect(page.getByTestId('tell-first')).toBeVisible();
      expect(await fits()).toBe(true);
      const buttons = page.getByTestId('tell-first-list').getByRole('button');
      for (let i = 0; i < (await buttons.count()); i++) {
        const b = (await buttons.nth(i).boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.x + b.width).toBeLessThanOrEqual(w + 1);
      }
      for (const t of ['tell-first-done', 'tell-first-world']) expect((await page.getByTestId(t).boundingBox())!.height, t).toBeGreaterThanOrEqual(44);
      await shot(page, 'tell-first');
      await page.getByTestId('tell-first-done').click();
      await expect(page.getByTestId('reality-compose')).toHaveCount(0);
      // and the villager card, with its glance, opens in the bottom sheet
      await selectVillager(page, 'Ivo Thatcher');
      await openSheet(page, 'selected');
      await expect(page.getByTestId('villager-glance')).toBeVisible();
      expect(await fits()).toBe(true);
    });
  }
});
