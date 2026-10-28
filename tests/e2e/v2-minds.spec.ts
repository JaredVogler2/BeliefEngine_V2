import { expect, test, type Page } from '@playwright/test';
import { closeSheet, openSheet, selectVillager, watchConsole } from './helpers.ts';

/**
 * Villager minds in the real browser (production build): after a day, a villager's mind shows what they want, how they tend to
 * act and what they remember and from whom; talking with them answers from those memories and is recorded. Offline throughout,
 * except the one test that opts in to the local simulator (SCRIPTED provider: no model is called).
 */

async function startReality(page: Page) {
  await page.goto('/?debug=1');
  await page.getByTestId('play').click();
  await page.getByTestId('mode-reality').click();
  await page.getByTestId('begin-reality-redbank').click();
  await page.getByTestId('seed').fill('1');
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('play')).toBeVisible();
  await page.locator('[data-claim="river_fears_fire"]').click();
  await closeSheet(page);
}

/** Tell a villager the active story through the real card (the Keeper's word: they will remember it). */
async function tell(page: Page, name: string) {
  await selectVillager(page, name);
  await openSheet(page, 'selected');
  await page.locator('.act').filter({ hasText: new RegExp(`^Tell ${name}`) }).first().click();
}

async function endDay(page: Page) {
  await closeSheet(page);
  await page.getByTestId('end-day').click();
  await page.getByTestId('confirm-end').click();
  await expect(page.getByTestId('digest')).toBeVisible();
  await page.getByTestId('digest-continue').click();
}

function apiLog(page: Page): { url: string; body: string | null }[] {
  const seen: { url: string; body: string | null }[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) seen.push({ url: new URL(r.url()).pathname, body: r.postData() });
  });
  return seen;
}

test.describe('Villager minds', () => {
  test('a villager remembers the day, says how they know it, and answers when asked (offline, no request)', async ({ page }) => {
    const errors = watchConsole(page);
    const api = apiLog(page);
    await startReality(page);
    await selectVillager(page, 'Ivo Thatcher');
    await expect(page.getByTestId('mind-panel')).toBeVisible();
    await expect(page.getByTestId('mind-memories-empty')).toBeVisible();
    await tell(page, 'Ivo Thatcher');
    await endDay(page);
    await selectVillager(page, 'Ivo Thatcher');
    const panel = page.getByTestId('mind-panel');
    await expect(panel.getByTestId('mind-traits')).not.toBeEmpty();
    await expect(panel.getByTestId('mind-memories').locator('li').first()).toBeVisible();
    await panel.getByTestId('talk-story').selectOption('river_fears_fire');
    await panel.getByTestId('talk-ask').click();
    await expect(page.getByTestId('talk-reply')).toContainText('You ask Ivo Thatcher about');
    await expect(page.getByTestId('talk-reply')).toContainText('Ivo:');
    // asking twice in one day is refused, with the reason
    await page.getByTestId('talk-ask').click();
    await expect(page.locator('.toast, [role="alert"]').filter({ hasText: 'already talked' }).first()).toBeVisible();
    expect(api).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('arguing for a story costs Influence and moves them by the game\'s own rules', async ({ page }) => {
    await startReality(page);
    await endDay(page);
    await selectVillager(page, 'Old Harl');
    const panel = page.getByTestId('mind-panel');
    await expect(panel.getByTestId('talk-persuade')).toContainText('1 Influence');
    await panel.getByTestId('talk-story').selectOption('river_fears_fire');
    await panel.getByTestId('talk-persuade').click();
    await expect(page.getByTestId('talk-reply')).toContainText('You argue for');
    await expect(page.getByTestId('talk-reply')).toContainText('Conviction');
  });

  test('with online reading on (simulated), the answer is voiced through the server and labelled; only this villager\'s mind is sent', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the request path is the same on phones; one viewport is enough');
    const api = apiLog(page);
    await startReality(page);
    await tell(page, 'Ivo Thatcher');
    await endDay(page);
    await selectVillager(page, 'Ivo Thatcher');
    const panel = page.getByTestId('mind-panel');
    await panel.getByTestId('talk-online').click();
    await expect(panel.getByTestId('talk-consent')).toContainText('What Ivo remembers');
    await panel.getByTestId('talk-consent-yes').click();
    await expect(panel.getByTestId('talk-online-on')).toContainText('simulated');
    await panel.getByTestId('talk-story').selectOption('river_fears_fire');
    await panel.getByTestId('talk-ask').click();
    await expect(page.getByTestId('talk-reply')).toContainText('voiced by a model');
    const sent = api.filter((a) => a.url === '/api/npc-decision').map((a) => JSON.parse(a.body ?? '{}'));
    expect(sent).toHaveLength(1);
    expect(sent[0].v).toBe(2);
    expect(sent[0].event.kind).toBe('conversation');
    expect(sent[0].agents.map((a: { id: string }) => a.id)).toEqual(['ivo']);
  });
});

test.describe('Who is thinking today', () => {
  test('the village panel names today\'s thinkers and, after dusk, what each decided; online, a model may propose (simulated)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the same panel on phones; the desktop run covers the request path');
    const api = apiLog(page);
    await startReality(page);
    await expect(page.locator('body')).toBeVisible();
    await openSheet(page, 'village');
    await expect(page.getByTestId('minds-none')).toBeVisible();
    // two days of telling the story: something to think about
    await tell(page, 'Ivo Thatcher');
    await endDay(page);
    await tell(page, 'Mara Wells');
    await endDay(page);
    await openSheet(page, 'village');
    const minds = page.getByTestId('village-minds');
    await expect(minds.getByTestId('minds-queue').locator('li').first()).toBeVisible();
    await minds.getByTestId('minds-online').click();
    await minds.getByTestId('minds-consent-yes').click();
    await minds.getByTestId('minds-decide').click();
    await expect(minds.getByTestId('minds-note')).toContainText(/will act on what they decided|the game decides/);
    expect(api.filter((a) => a.url === '/api/npc-decision')).toHaveLength(1);
    await endDay(page);
    await openSheet(page, 'village');
    await expect(page.getByTestId('minds-last').locator('li').first()).toBeVisible();
  });
});
