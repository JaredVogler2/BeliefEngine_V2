import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { GameSession, applyRun, emptyProgress, exportProgress } from '../../src/engine/index.ts';
import * as S from '../../src/engine/ai/bots/strategies.ts';
import type { Policy } from '../../src/engine/ai/bots/types.ts';
import { chooseClaim, loadTraces, replayTraceViaUi, selectPlace, startScenario, traces, watchConsole } from './helpers.ts';

function play(p: Policy, scenarioId: string, seed: number) {
  const g = GameSession.create({ scenarioId, seed, mode: 'story' });
  let n = 0;
  while (!g.state.outcome && n++ < 40) p.playDay(g);
  return g.state;
}

/** An archive in which every unlock has been earned, built by really playing the bots. */
function richArchive(): string {
  let p = emptyProgress();
  const runs: [Policy, string, number][] = [[S.fireWall, 'redbank', 1], [S.witnessBridge, 'redbank', 1], [S.moonlight, 'harvest', 1], [S.caravans, 'harvest', 1], [S.smokeRing, 'ashwood', 11], [S.decoy, 'ashwood', 6]];
  for (const [pol, sc, seed] of runs) p = applyRun(p, play(pol, sc, seed), { debug: false }).progress;
  return exportProgress(p);
}

test.describe('Atlas, rewards and unlocked options', () => {
  test('a fresh Atlas is empty, honest about it, and has every section', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/');
    await page.getByTestId('atlas-open').click();
    await expect(page.getByTestId('atlas')).toBeVisible();
    await expect(page.getByTestId('atlas-laws')).toContainText('0 of 6 starting laws');
    for (const t of ['lore', 'postcards', 'badges', 'unlocks', 'stats', 'archive']) {
      await page.getByTestId(`atlas-tab-${t}`).click();
      await expect(page.getByTestId(`atlas-${t}`)).toBeVisible();
    }
    await page.getByTestId('atlas-tab-badges').click();
    await expect(page.locator('[data-badge]')).toHaveCount(21);
    await expect(page.locator('[data-badge][data-earned="true"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a real win (played by clicks, not debug) earns badges and unlocks that persist across a reload', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'desktop flow');
    test.setTimeout(240_000);
    await startScenario(page, 'redbank', traces.canonicalSeed, 'normal', '/');
    await replayTraceViaUi(page, traces.canonicalSeed, traces.witnessBridge.actions);
    await expect(page.getByTestId('verdict')).toHaveText('Victory');
    const rewards = page.getByTestId('rewards');
    await expect(rewards).toBeVisible();
    await expect(rewards.locator('[data-reward="badge-first_law"]')).toBeVisible();
    await expect(rewards.locator('[data-reward="badge-no_beacons"]')).toBeVisible();
    await expect(rewards.locator('[data-reward="unlock-pledge_no_fire"]')).toContainText('Bridgekeeper');
    await expect(rewards.locator('[data-reward="law-bridge_stands_watched"]')).toBeVisible();
    await expect(page.getByTestId('postcard')).toContainText('lived through the night of the Great Surge');
    await page.getByTestId('open-atlas').click();
    await page.getByTestId('atlas-tab-badges').click();
    await expect(page.locator('[data-badge="first_law"]')).toHaveAttribute('data-earned', 'true');
    await page.reload();
    await page.getByTestId('atlas-open').click();
    await expect(page.getByTestId('atlas-open')).toHaveCount(0);
    await page.getByTestId('atlas-tab-laws').click();
    await expect(page.getByTestId('atlas-law-bridge_stands_watched')).toContainText('Bridge stands watched');
    await page.getByTestId('atlas-tab-unlocks').click();
    await expect(page.locator('[data-unlock="pledge_no_fire"]')).toHaveAttribute('data-earned', 'true');
    await expect(page.locator('[data-unlock="challenge_board"]')).toHaveAttribute('data-earned', 'false');
  });

  test('debug-loader runs earn nothing', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'desktop flow');
    await startScenario(page, 'redbank', 1, 'normal', '/?debug=1');
    await page.locator('[data-claim="river_fears_fire"]').click();
    for (let d = 0; d < 7; d++) {
      await page.getByTestId('end-day').click();
      await page.getByTestId('confirm-end').click();
      await page.getByTestId('digest-continue').click();
    }
    await expect(page.getByTestId('debrief')).toBeVisible();
    await expect(page.getByTestId('rewards')).toContainText('debug loader');
    await expect(page.locator('[data-reward]')).toHaveCount(0);
  });

  test('export, cancel/confirm reset, and import restore the archive', async ({ page }) => {
    const archive = richArchive();
    await page.addInitScript((a) => { if (!localStorage.getItem('be:progress:v2')) localStorage.setItem('be:progress:v2', a); }, archive);
    await page.goto('/');
    await page.getByTestId('atlas-open').click();
    await page.getByTestId('atlas-tab-badges').click();
    const earned = await page.locator('[data-badge][data-earned="true"]').count();
    expect(earned).toBeGreaterThan(8);
    await page.getByTestId('atlas-tab-archive').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
    const path = await dl.path();
    const exported = readFileSync(path, 'utf8');
    expect(JSON.parse(exported).format).toBe('belief-engine-progress');
    expect(JSON.parse(exported).version).toBe(2);
    // cancel keeps everything
    await page.getByTestId('reset').click();
    await expect(page.getByRole('dialog')).toContainText('Reset all progress?');
    await page.getByTestId('reset-cancel').click();
    await page.getByTestId('atlas-tab-badges').click();
    await expect(page.locator('[data-badge][data-earned="true"]')).toHaveCount(earned);
    // confirm erases
    await page.getByTestId('atlas-tab-archive').click();
    await page.getByTestId('reset').click();
    await page.getByTestId('reset-confirm').click();
    await page.getByTestId('atlas-tab-badges').click();
    await expect(page.locator('[data-badge][data-earned="true"]')).toHaveCount(0);
    // importing the export brings it back; junk is refused with a reason
    await page.getByTestId('atlas-tab-archive').click();
    await page.getByTestId('import-text').fill('{"hello": "world"}');
    await page.getByTestId('import').click();
    await expect(page.getByTestId('archive-msg')).toContainText('not a Belief Engine archive');
    await page.getByTestId('import-text').fill(exported);
    await page.getByTestId('import').click();
    await expect(page.getByTestId('archive-msg')).toContainText('Imported');
    await page.getByTestId('atlas-tab-badges').click();
    await expect(page.locator('[data-badge][data-earned="true"]')).toHaveCount(earned);
  });

  test('unlocked options show up in the briefing and really change the run', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'desktop flow');
    await page.addInitScript((a) => { if (!localStorage.getItem('be:progress:v2')) localStorage.setItem('be:progress:v2', a); }, richArchive());
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await page.getByTestId('begin-redbank').click();
    const card = page.getByTestId('options-card');
    await expect(card).toBeVisible();
    // a pledge is enforced
    await page.getByTestId('opt-pledge-no_fire').check();
    await expect(page.getByTestId('options-mult')).toContainText('×1.2');
    // an extra opening story
    await page.getByTestId('opt-extra-flames_cannot_hurt').check();
    await page.getByTestId('begin').click();
    await expect(page.locator('[data-claim="flames_cannot_hurt"]')).toBeVisible();
    await page.locator('[data-claim="river_fears_fire"]').click();
    await selectPlace(page, 'b_n');
    const light = page.locator('.act', { hasText: /^Light the beacon at/ }).first();
    await expect(light).toBeDisabled();
    await expect(light).toContainText('swore to light no fire');
    await chooseClaim(page, 'river_fears_fire');
    const st = await page.evaluate(() => (window as unknown as { __belief: { state: { modifiers: string[]; flags: Record<string, number> } } }).__belief.state);
    expect(st.modifiers).toContain('pledge:no_fire');
  });

  test('the Atlas and its archive tab fit a phone screen', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 999) > 600, 'phone project only');
    await page.addInitScript((a) => { if (!localStorage.getItem('be:progress:v2')) localStorage.setItem('be:progress:v2', a); }, richArchive());
    await page.goto('/');
    await page.getByTestId('atlas-open').tap();
    for (const t of ['laws', 'badges', 'unlocks', 'archive']) {
      await page.getByTestId(`atlas-tab-${t}`).tap();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), t).toBe(false);
    }
  });
});

void loadTraces;
