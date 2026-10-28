import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { GameSession, type Action, type CreateRunOptions } from '../../src/engine/index.ts';
import { browserState, closeSheet, openSheet, performViaUi, watchConsole } from './helpers.ts';

/**
 * Phase 09 in the real browser (production build, classic map, offline): imagine → persuade → manifest → consequences. Each chain is
 * typed into the composer as a sentence, previewed (what it acts on, the support it needs, what keeps it working, what else it does,
 * who may push back), written, and then played day by day through the real interface with the clicks the recorded trace made
 * (tests/fixtures/v2-bridge-traces.json, recorded by scripts/record-bridge.ts). The engine in this file mirrors every step only to
 * label the clicks; the page's own run must end on the recorded hash, and what the map draws must be what the run holds.
 *
 * Screenshots for the docs: BE_SHOTS=1 npx playwright test tests/e2e/v2-bridge.spec.ts
 */

interface Trace { opts: CreateRunOptions; sentence: string; region: string | null; claimId: string; result: string | null; lawDay: number | null; hens: number; bank: number; stateHash: string; actions: Action[] }
const fx = JSON.parse(readFileSync(new URL('../fixtures/v2-bridge-traces.json', import.meta.url), 'utf8')) as Record<string, Trace>;
const SHOTS = process.env.BE_SHOTS === '1';

type Drawn = { coops: number; hens: number; strays: number; stones: number; placed: number; bank: number };
const drawn = (page: Page): Promise<Drawn | null> => page.evaluate(() => (window as unknown as { __beRenderer?: { realityInfo?: () => Drawn } }).__beRenderer?.realityInfo?.() ?? null);

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  const vw = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: `docs/screenshots/v2-phase09/${name}-${vw >= 900 ? 'desktop' : 'phone'}.png` });
}

async function start(page: Page, t: Trace): Promise<void> {
  await page.goto('/?debug=1');
  await page.getByTestId('play').click();
  await page.getByTestId('mode-reality').click();
  if (t.opts.mode === 'expedition') {
    await page.getByTestId('reality-expedition-seed').fill(String(t.opts.seed));
    await page.getByTestId('begin-reality-expedition').click();
  } else {
    await page.getByTestId(`begin-reality-${t.opts.scenarioId}`).click();
    await page.getByTestId('seed').fill(String(t.opts.seed));
  }
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('play')).toBeVisible();
}

/** the sentence, typed; the whole chain previewed; then written (the engine builds it, bound to this moment of the run) */
async function compose(page: Page, t: Trace, capture: string | null): Promise<void> {
  await closeSheet(page);
  await page.getByTestId('reality-open').click();
  await page.getByTestId('reality-text').fill(t.sentence);
  if (t.region) await page.getByTestId('reality-region').selectOption(t.region);
  await page.getByTestId('reality-preview').click();
  await expect(page.getByTestId('reality-result')).toBeVisible();
  await expect(page.getByTestId('reality-plan')).toContainText('Set off when');
  await expect(page.getByTestId('reality-support')).toContainText('firm believers');
  await expect(page.getByTestId('reality-upkeep')).toBeVisible();
  if (capture) {
    await page.getByTestId('reality-plan').scrollIntoViewIfNeeded();
    await shot(page, capture);
  }
  const accept = page.getByTestId('reality-accept');
  if (await accept.count()) await accept.check();
  await page.getByTestId('reality-confirm').click();
  await expect(page.getByTestId('reality-compose')).toHaveCount(0);
}

/** plays the recorded chain through the page; `beforeNight(day)` runs before each End Day */
async function play(page: Page, key: string, opts: { capture?: string; beforeNight?: (day: number, g: GameSession) => Promise<void> } = {}): Promise<GameSession> {
  const t = fx[key];
  await start(page, t);
  const g = GameSession.create(t.opts);
  for (const a of t.actions) {
    if (a.type === 'END_DAY') await opts.beforeNight?.(g.state.day, g);
    if (a.type === 'COMPOSE') await compose(page, t, opts.capture ?? null);
    else await performViaUi(page, g, a);
    const r = g.act(a);
    expect(r.ok, `the recorded action is legal in the mirror: ${JSON.stringify(a).slice(0, 90)}`).toBe(true);
    if (a.type !== 'END_DAY') expect((await browserState(page)).ap, `Influence after ${a.type}`).toBe(g.state.ap);
  }
  await expect(page.getByTestId('debrief')).toBeVisible();
  const st = await browserState(page);
  expect(st.hash, 'the page ends on the recorded run').toBe(t.stateHash);
  return g;
}

test.describe('belief to reality, in the browser (phase 09)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'the long chains run on desktop; the phone runs the composer preview and the debrief');
  test.setTimeout(420_000);

  test('claim A: "Chickens fly when the bell rings" is typed, spread and made law; the hens ride out the flood; four villagers drown (a complete loss)', async ({ page }) => {
    const errors = watchConsole(page);
    await play(page, 'hens', {
      capture: 'preview',
      beforeNight: async (day, g) => {
        if (day === 7) {
          // the hens survived night 6 because the law lifted them: the map draws every one of them
          const d = await drawn(page);
          expect(d?.hens).toBe(g.state.v2!.chickens.filter((c) => c.alive).length);
          expect(d?.hens).toBeGreaterThan(20);
          await openSheet(page, 'laws');
          const lp = page.getByTestId('law-provenance').first();
          await lp.locator('summary').click();
          await expect(lp).toContainText('rode out water');
          await shot(page, 'law-provenance');
          await closeSheet(page);
          await shot(page, 'hens-map');
        }
      },
    });
    await expect(page.getByTestId('verdict')).toHaveText('Defeat');
    const prov = page.getByTestId(`provenance-${fx.hens.claimId}`);
    await expect(prov).toContainText('became law');
    await expect(prov).toContainText('You write a new belief');
    await expect(prov).toContainText('becomes LAW');
    await expect(prov).toContainText('rode out water that would have drowned them');
    await expect(prov.getByTestId('provenance-believers')).toContainText('first heard it from you');
    await prov.scrollIntoViewIfNeeded();
    await shot(page, 'debrief-provenance');
    expect(errors).toEqual([]);
  });

  test('below the threshold: the same sentence told once, the bell rung every day, nothing flies and the hens drown', async ({ page }) => {
    await play(page, 'hensBelow', {
      beforeNight: async (day) => {
        if (day === 7) expect((await drawn(page))?.hens).toBe(0);
      },
    });
    await expect(page.getByTestId(`provenance-${fx.hensBelow.claimId}`)).toContainText('never became law, so it changed nothing in the world');
  });

  test('claim B: "Wet stone becomes light beside lanterns": a stone is carried to the bank and the bank stands higher on the map', async ({ page }) => {
    await play(page, 'stones', {
      beforeNight: async (day, g) => {
        if (day === 7) {
          const d = await drawn(page);
          expect(d?.placed).toBe(g.state.v2!.stones.filter((x) => x.state === 'placed').length);
          expect(d?.placed).toBeGreaterThan(0);
          expect(d?.bank).toBe(fx.stones.bank);
          await shot(page, 'stones-map');
        }
      },
    });
    await expect(page.getByTestId(`provenance-${fx.stones.claimId}`)).toContainText('carries a stone that weighs almost nothing');
  });

  test('claim C in a generated village: the bell draws the rain onto Eastbank and the flames weaken; a skeptic pushed back first', async ({ page }) => {
    await play(page, 'rain');
    const prov = page.getByTestId(`provenance-${fx.rain.claimId}`);
    await expect(prov).toContainText('the rain is called in toward Eastbank');
    await expect(prov).toContainText('flames burn weaker');
    await expect(prov).toContainText('pools on the low ground of Eastbank');
    await expect(prov).toContainText('only if they see it');
  });

  test('a complete win: the composer used, the belief spread but never law, the Fire Wall decided it', async ({ page }) => {
    await play(page, 'win');
    await expect(page.getByTestId('verdict')).toHaveText('Victory');
    await expect(page.getByTestId(`provenance-${fx.win.claimId}`)).toContainText('never became law');
  });
});

test.describe('the composer previews the chain on a phone too', () => {
  test('the preview says what it acts on, the support it needs, what keeps it working, what else it does and who may push back', async ({ page }) => {
    const t = fx.rain;
    await start(page, { ...t, opts: { scenarioId: 'redbank', seed: 2, difficulty: 'normal', mode: 'story', reality: true } });
    // the opening story comes first; then the composer joins the stories
    await page.locator('[data-claim="river_fears_fire"]').click();
    await closeSheet(page);
    await page.getByTestId('reality-open').click();
    await page.getByTestId('reality-text').fill(t.sentence);
    await page.getByTestId('reality-preview').click();
    await expect(page.getByTestId('reality-assumed')).toContainText('read as the fields of Eastbank');
    await expect(page.getByTestId('reality-plan')).toContainText('not tonight yet');
    await expect(page.getByTestId('reality-upkeep')).toContainText('Ring the bell');
    await expect(page.getByTestId('reality-risks')).toContainText('lowest dry tiles stand a tile deep');
    await expect(page.getByTestId('reality-opposition')).toBeVisible();
    await page.getByTestId('reality-opposition').scrollIntoViewIfNeeded();
    await shot(page, 'preview-rain');
  });
});
