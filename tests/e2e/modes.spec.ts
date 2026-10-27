import { expect, test, type Page } from '@playwright/test';
import { openSheet, watchConsole } from './helpers.ts';

async function stateOf(page: Page) {
  return page.evaluate(() => {
    const b = (window as unknown as { __belief: { state: { seed: number; scenarioId: string; mode: string; day: number; modifiers: string[]; flags: Record<string, number>; difficulty: string }; hash: () => string } }).__belief;
    return { seed: b.state.seed, scenarioId: b.state.scenarioId, mode: b.state.mode, day: b.state.day, modifiers: b.state.modifiers, flags: b.state.flags, difficulty: b.state.difficulty, hash: b.hash() };
  });
}

test.describe('game modes: expedition, daily village, share links', () => {
  test('expedition: preview a village, change the seed, begin, see its twists, play a day', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await page.getByTestId('mode-expedition').click();
    await expect(page.getByTestId('expedition-panel')).toBeVisible();
    await page.getByTestId('expedition-seed').fill('77');
    const card = page.getByTestId('village-preview');
    await expect(card).toContainText('villagers');
    const first = await card.innerText();
    await page.getByTestId('expedition-seed').fill('78');
    expect(await card.innerText()).not.toBe(first);
    // an invalid seed is explained, not silently accepted
    await page.getByTestId('expedition-seed').fill('');
    await expect(page.getByTestId('begin-expedition')).toBeDisabled();
    await page.getByTestId('expedition-seed').fill('77');
    await page.getByTestId('begin-expedition').click();
    await expect(page.getByTestId('briefing')).toBeVisible();
    await expect(page.getByTestId('briefing-meta')).toContainText('Expedition');
    await expect(page.getByTestId('twists')).toContainText('Twists this time');
    await page.getByTestId('begin').click();
    await expect(page.getByTestId('play')).toBeVisible();
    const st = await stateOf(page);
    expect(st.mode).toBe('expedition');
    expect(st.scenarioId).toBe('x1.77');
    expect(st.seed).toBe(77);
    expect(st.modifiers.length).toBeGreaterThan(0);
    // choose a story and spend a day
    await page.locator('[data-claim]').first().click();
    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await expect(page.getByTestId('digest')).toBeVisible();
    await page.getByTestId('digest-continue').click();
    expect((await stateOf(page)).day).toBe(2);
    // the twists stay visible in play
    await openSheet(page, 'forecast');
    await expect(page.getByTestId('twists-panel')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the same expedition seed always builds the same village; a different seed differs', async ({ page }) => {
    await page.goto('/?debug=1');
    const hashFor = async (seed: number) => {
      await page.getByTestId('play').click();
      await page.getByTestId('mode-expedition').click();
      await page.getByTestId('expedition-seed').fill(String(seed));
      await page.getByTestId('begin-expedition').click();
      await page.getByTestId('begin').click();
      const h = (await stateOf(page)).hash;
      await page.evaluate(() => (window as unknown as { __belief: { store: { set: (p: object) => void } } }).__belief.store.set({ screen: 'title' }));
      return h;
    };
    const a = await hashFor(123);
    const b = await hashFor(123);
    const c = await hashFor(124);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  test('daily village: the UTC date picks the village, it is fixed difficulty, and midnight UTC changes it', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-27T23:59:00Z') });
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await page.getByTestId('mode-daily').click();
    const panel = page.getByTestId('daily-panel');
    await expect(panel).toContainText('2026-10-27');
    const villageToday = await panel.getByTestId('village-preview').innerText();
    await page.getByTestId('begin-daily').click();
    await expect(page.getByTestId('briefing-meta')).toContainText('Daily village · 2026-10-27 UTC');
    await expect(page.getByTestId('difficulty')).toBeDisabled();
    await expect(page.getByTestId('seed')).toHaveAttribute('readonly', '');
    await page.getByTestId('begin').click();
    const day1 = await stateOf(page);
    expect(day1.mode).toBe('daily');
    expect(day1.flags.dailyDate).toBe(20261027);
    expect(day1.difficulty).toBe('normal');
    // two minutes later it is the next UTC day: the run in progress keeps its date, the menu offers a new village
    await page.clock.fastForward('02:00');
    expect((await stateOf(page)).flags.dailyDate).toBe(20261027);
    await page.evaluate(() => (window as unknown as { __belief: { store: { set: (p: object) => void } } }).__belief.store.set({ screen: 'scenarios' }));
    await page.getByTestId('mode-daily').click();
    await expect(page.getByTestId('daily-panel')).toContainText('2026-10-28');
    expect(await page.getByTestId('daily-panel').getByTestId('village-preview').innerText()).not.toBe(villageToday);
  });

  test('a share link opens the exact village; extra parameters are ignored; the address bar is cleaned', async ({ page }) => {
    await page.goto('/?debug=1&mode=expedition&seed=424242&gen=1&rules=1.0.0&state=%7B%22hax%22%3Atrue%7D&evil=%3Cscript%3E');
    await expect(page.getByTestId('briefing')).toBeVisible();
    await page.getByTestId('begin').click();
    const st = await stateOf(page);
    expect(st.scenarioId).toBe('x1.424242');
    expect(st.seed).toBe(424242);
    expect(page.url()).not.toContain('evil');
    expect(page.url()).not.toContain('seed=');
  });

  test('story chapter links still work, including the older link format', async ({ page }) => {
    await page.goto('/?debug=1&mode=story&scn=harvest&seed=5');
    await expect(page.getByTestId('briefing')).toContainText('Harvest');
    await page.goto('/?debug=1&scenario=ashwood&seed=9&d=hard');
    await expect(page.getByTestId('briefing')).toContainText('Ashwood');
    await page.getByTestId('begin').click();
    const st = await stateOf(page);
    expect(st.seed).toBe(9);
    expect(st.difficulty).toBe('hard');
  });

  test('bad links are refused with an explanation and the title screen still works', async ({ page }) => {
    const errors = watchConsole(page);
    for (const bad of ['mode=expedition&seed=abc', 'mode=nope&seed=1', 'mode=expedition&seed=99999999999', 'mode=expedition&seed=5&gen=9', 'mode=story&scn=../../etc&seed=1', 'mode=daily&date=2026-99-99']) {
      await page.goto(`/?${bad}`);
      await expect(page.getByTestId('title')).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('ignored');
    }
    expect(errors).toEqual([]);
  });

  test('an older rules version still opens, with a visible note', async ({ page }) => {
    await page.goto('/?debug=1&mode=expedition&seed=55&gen=1&rules=0.0.1');
    await expect(page.getByTestId('briefing')).toBeVisible();
    await expect(page.getByTestId('link-note')).toContainText('rules 0.0.1');
  });

  test('debrief offers replay / different village / today’s challenge / share, and replaying the village restores the same start', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/?debug=1&mode=expedition&seed=31&gen=1&rules=1.0.0');
    await page.getByTestId('begin').click();
    const start = (await stateOf(page)).hash;
    for (let d = 0; d < 12; d++) {
      if (await page.getByTestId('debrief').count()) break;
      await page.getByTestId('end-day').click();
      await page.getByTestId('confirm-end').click();
      await page.getByTestId('digest-continue').click();
    }
    await expect(page.getByTestId('debrief')).toBeVisible();
    await expect(page.getByTestId('seed-info')).toContainText('x1.31');
    for (const id of ['retry-same', 'new-seed', 'to-daily', 'share']) await expect(page.getByTestId(id)).toBeVisible();
    await page.getByTestId('retry-same').click();
    await expect(page.getByTestId('play')).toBeVisible();
    expect((await stateOf(page)).hash).toBe(start);
    // a loss ends the run; "different village" lands in a new expedition
    for (let d = 0; d < 12; d++) {
      if (await page.getByTestId('debrief').count()) break;
      await page.getByTestId('end-day').click();
      await page.getByTestId('confirm-end').click();
      await page.getByTestId('digest-continue').click();
    }
    await page.getByTestId('new-seed').click();
    const next = await stateOf(page);
    expect(next.mode).toBe('expedition');
    expect(next.seed).not.toBe(31);
  });
});

test.describe('modes on a phone', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 999) > 600, 'phone project only');
  test('the mode screen, an expedition briefing and the first day fit a 390px screen', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.getByTestId('play').tap();
    await page.getByTestId('mode-expedition').tap();
    await page.getByTestId('expedition-seed').fill('12');
    await page.getByTestId('begin-expedition').tap();
    await expect(page.getByTestId('briefing')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
    await page.getByTestId('begin').tap();
    await expect(page.getByTestId('end-day')).toBeInViewport();
  });
});
