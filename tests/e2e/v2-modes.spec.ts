import { expect, test, type Page } from '@playwright/test';
import { GameSession, applyRun, emptyProgress, exportProgress, stagingOmen, type RunState } from '../../src/engine/index.ts';
import { readBelief } from '../../src/engine/reality/read.ts';
import { closeSheet, openSheet, selectVillager, watchConsole } from './helpers.ts';

/**
 * Phase 11 in the real browser (production build, 2D map): the V2 modes on the mode screen, a Living Village run (its mode shown,
 * no composer), and a written belief staged at its catalyst like an authored story, with the omen the engine reads from what it does.
 *
 * Screenshots for the docs: BE_SHOTS=1 npx playwright test tests/e2e/v2-modes.spec.ts
 */

const SHOTS = process.env.BE_SHOTS === '1';
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  const vw = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: `docs/screenshots/v2-phase11/${name}-${vw >= 900 ? 'desktop' : 'phone'}.png` });
}

async function begin(page: Page, testId: string) {
  await page.goto('/?debug=1');
  await page.getByTestId('play').click();
  await page.getByTestId('mode-reality').click();
  await expect(page.getByTestId('mode-notes')).toContainText('Living Village');
  await page.getByTestId('mode-notes').scrollIntoViewIfNeeded();
  await shot(page, 'modes');
  await page.getByTestId(testId).click();
  await page.getByTestId('seed').fill('1');
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('play')).toBeVisible();
  await page.locator('[data-claim="river_fears_fire"]').click();
  await closeSheet(page);
}

test.describe('V2 modes (phase 11)', () => {
  test('a Living Village shows its mode, offers no composer, and its villagers can be talked with', async ({ page }) => {
    const errors = watchConsole(page);
    await begin(page, 'begin-living-redbank');
    await expect(page.getByTestId('living-chip')).toBeVisible();
    await expect(page.getByTestId('reality-open')).toHaveCount(0);
    const s = await page.evaluate(() => (window as unknown as { __belief: { state: { v2?: { living?: boolean; chickens: unknown[] }; flags: { reality?: number } } } }).__belief.state);
    expect(s.v2?.living).toBe(true);
    expect(s.v2?.chickens).toEqual([]);
    expect(s.flags.reality).toBe(3);
    // the minds are the point of the mode: ask Ivo what he makes of the opening story, and he answers from what he knows
    await selectVillager(page, 'Ivo Thatcher');
    await openSheet(page, 'selected');
    const panel = page.getByTestId('mind-panel');
    await expect(panel).toBeVisible();
    await panel.getByTestId('talk-story').selectOption('river_fears_fire');
    await panel.getByTestId('talk-ask').click();
    await expect(page.getByTestId('talk-reply')).toContainText('Ivo:');
    await shot(page, 'living-village-talk');
    expect(errors).toEqual([]);
  });

  test('a written belief that waits for the bell is staged at the bell tower, with the omen read from what it does', async ({ page }) => {
    await begin(page, 'begin-reality-redbank');
    await page.getByTestId('reality-open').click();
    await page.getByTestId('reality-text').fill('The flood flows away from the ringing bell.');
    await page.getByTestId('reality-preview').click();
    await expect(page.getByTestId('reality-kind')).toHaveText('Understood');
    await page.getByTestId('reality-confirm').click();
    await page.getByTestId('tell-first-done').click();
    const id = await page.evaluate(() => (window as unknown as { __belief: { state: { claims: { id: string; def?: { reality?: unknown; ritual?: string } }[] } } }).__belief.state.claims.find((c) => c.def?.reality)!.id);
    const ritual = await page.evaluate((cid) => (window as unknown as { __belief: { state: { claims: { id: string; def?: { ritual?: string } }[] } } }).__belief.state.claims.find((c) => c.id === cid)!.def!.ritual, id);
    expect(ritual).toBe('ring_bells');
    // choose the written belief, then the bell tower: its card offers to stage it, marked with tonight's omen for it
    await page.evaluate((cid) => (window as unknown as { __belief: { store: { set: (p: unknown) => void; select: (s: unknown) => void } } }).__belief.store.set({ activeClaim: cid }), id);
    await page.evaluate(() => (window as unknown as { __belief: { store: { select: (s: unknown) => void } } }).__belief.store.select({ kind: 'landmark', id: 'bell' }));
    await openSheet(page, 'selected');
    const staged = page.getByTestId('landmark-card').locator('button[data-action="RITUAL"]').filter({ hasText: /as proof of/ });
    await expect(staged).toHaveCount(1);
    // the badge is the engine's own omen for this belief tonight (the river's trend), computed here from the same state
    const state = JSON.parse(await page.evaluate(() => JSON.stringify((window as unknown as { __belief: { state: unknown } }).__belief.state))) as RunState;
    const omen = stagingOmen(state, state.scn.rituals.find((r) => r.id === 'ring_bells')!, id).value;
    if (omen > 0) await expect(staged).toHaveClass(/omen-good/);
    else if (omen < 0) await expect(staged).toHaveClass(/omen-bad/);
    else await expect(staged).not.toHaveClass(/omen-(good|bad)/);
    await staged.scrollIntoViewIfNeeded();
    await shot(page, 'written-belief-staged-at-bell');
  });

  test('the Atlas keeps the beliefs a Chronicle made law, and each mode\u2019s record apart from Classic', async ({ page }) => {
    // a Chronicle run in which "Chickens fly when the bell rings" became law (white-box belief, as in the unit tests), and a Lab run
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, difficulty: 'normal', mode: 'story', reality: true });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const r = readBelief(g.state, 'Chickens fly when the bell rings.');
    if (r.kind !== 'supported' || !r.candidates[0].build.ok) throw new Error('reading');
    g.act({ type: 'COMPOSE', claim: r.candidates[0].build.draft.claim });
    const id = r.candidates[0].build.draft.claim.id;
    while (!g.state.outcome) {
      for (const v of g.state.villagers) if (v.district === 'east' && v.status !== 'dead') v.beliefs[id] = { conv: 85, heard: 3, lastDay: g.state.day, lastSource: null, evidence: 30, cause: null, stale: 0 };
      g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: 'bell' });
      g.endDay();
    }
    const lab = GameSession.create({ scenarioId: 'redbank', seed: 2, difficulty: 'normal', mode: 'story', realityLab: true });
    lab.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    while (!lab.state.outcome) lab.endDay();
    const progress = applyRun(applyRun(emptyProgress(), g.state, { debug: false }).progress, lab.state, { debug: false }).progress;
    await page.goto('/');
    await page.evaluate((json) => localStorage.setItem('be:progress:v2', json), exportProgress(progress));
    await page.goto('/');
    await page.getByTestId('atlas-open').click();
    await expect(page.getByTestId('atlas-variants')).toContainText('Generative Chronicle: 1 run');
    await expect(page.getByTestId('atlas-variants')).toContainText('Reality Lab: 1 run, 0 won (unranked)');
    await expect(page.locator('[data-testid^="atlas-invented-"]')).toContainText('Chickens fly when the bell rings.');
    await page.locator('[data-testid^="atlas-invented-"]').scrollIntoViewIfNeeded();
    await shot(page, 'atlas-invented');
  });
});
