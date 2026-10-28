import { expect, test, type Page } from '@playwright/test';
import { GameSession, eventHash, stateHash, type Action } from '../../src/engine/index.ts';
import { browserState, chooseClaim, mapPainted, replayTraceViaUi, startRedbank, traces, watchConsole } from './helpers.ts';

/**
 * The Three.js world, forced on. A headless browser (here and on CI) only has a software rasteriser, and there the game picks the
 * classic map unless asked (src/render/choose.ts), so none of the V1 specs ever draws the 3D world: these do, through ?renderer=3d,
 * and check that it is really WebGL2, really painted, answers clicks and taps with engine ids, and leaves the rules alone.
 * The software rasteriser draws about three frames a second and every click waits for a stable frame, hence the long timeouts.
 */
const URL_3D = '/?debug=1&renderer=3d';

interface Info3D { calls: number; triangles: number; tier: string; frames: number; software: boolean }
type R3D = { kind: string; info: () => Info3D; entityScreen: (k: 'villager' | 'landmark', id: string) => { x: number; y: number } | null; stats: () => { effects: number } };

async function world3d(page: Page): Promise<void> {
  await expect(page.locator('.stage')).toHaveAttribute('data-renderer', '3d');
  await expect(page.locator('.stage')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
  // a few real frames have been drawn, not just a context created
  await expect.poll(() => page.evaluate(() => (window as unknown as { __beRenderer: R3D }).__beRenderer.info().frames), { timeout: 30_000 }).toBeGreaterThan(2);
}

async function info(page: Page): Promise<Info3D & { kind: string; webgl2: boolean }> {
  return page.evaluate(() => {
    const r = (window as unknown as { __beRenderer: R3D }).__beRenderer;
    const c = document.querySelector('.stage canvas') as HTMLCanvasElement;
    // asking an existing WebGL2 canvas for webgl2 returns the context it already has
    return { kind: r.kind, webgl2: c.getContext('webgl2') instanceof WebGL2RenderingContext, ...r.info() };
  });
}

/** where a villager is on screen, in page coordinates (the canvas fills the stage) */
async function villagerOnPage(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((vid) => {
    const r = (window as unknown as { __beRenderer: R3D }).__beRenderer;
    const p = r.entityScreen('villager', vid);
    if (!p) throw new Error(`villager ${vid} is not on screen`);
    const b = (document.querySelector('.stage canvas') as HTMLCanvasElement).getBoundingClientRect();
    return { x: p.x + b.left, y: p.y + b.top };
  }, id);
}

test.describe('3D world (Three.js, forced on)', () => {
  test('boots on WebGL2, paints the village and reports a real scene', async ({ page }) => {
    const errors = watchConsole(page);
    await startRedbank(page, 1, 'normal', URL_3D);
    await world3d(page);
    const i = await info(page);
    expect(i.kind).toBe('3d');
    expect(i.webgl2, 'the canvas holds a WebGL2 context').toBe(true);
    expect(i.calls, 'draw calls in the last frame').toBeGreaterThan(10);
    expect(i.triangles, 'triangles in the last frame').toBeGreaterThan(10_000);
    await expect.poll(mapPainted(page), { message: 'the 3D village is painted', timeout: 20_000 }).toBeGreaterThan(0.25);
    expect(errors).toEqual([]);
  });

  test('a click on a person in the 3D world selects them, a story is told and the night resolves with the engine’s own hash', async ({ page }) => {
    test.setTimeout(360_000);
    const errors = watchConsole(page);
    await startRedbank(page, 1, 'normal', URL_3D);
    await world3d(page);
    await chooseClaim(page, 'river_fears_fire');

    // pick Ivo Thatcher by pointing at him in the 3D scene: the raycast answers with an engine id, the store selects it
    const at = await villagerOnPage(page, 'ivo');
    await page.mouse.click(at.x, at.y - 4);
    // the card beside the selection (V1's immersive HUD) names them and holds the quick actions
    await expect(page.getByTestId('selection-pop')).toContainText('Ivo Thatcher');
    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).first().click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __beRenderer: R3D }).__beRenderer.stats().effects), { message: 'telling a story puts an effect in the world' }).toBeGreaterThan(0);

    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await expect(page.getByTestId('digest')).toBeVisible();
    await page.getByTestId('digest-continue').click();

    // the same actions played directly in the engine (on day 1 the first story card chosen is the opening story) give the same run:
    // the renderer observes, it never decides
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    const plan: Action[] = [{ type: 'PICK_STARTER', claim: 'river_fears_fire' }, { type: 'SEED', claim: 'river_fears_fire', target: 'ivo' }, { type: 'END_DAY' }];
    for (const a of plan) expect(g.act(a).ok, JSON.stringify(a)).toBe(true);
    const st = await browserState(page);
    expect(st.day).toBe(2);
    expect(st.hash).toBe(stateHash(g.state));
    expect(st.eventHash).toBe(eventHash(g.state));
    await expect.poll(mapPainted(page), { timeout: 20_000 }).toBeGreaterThan(0.25);
    expect(errors).toEqual([]);
  });

  // The whole seven-day route is replayed by clicks on the 2D map in redbank.spec.ts. Here the first two days (opening story, a gathering,
  // four tellings, two nights: 8 of the 22 actions) are clicked while the 3D world draws and compared with the engine's replay of the
  // same prefix. It takes about 5.5 minutes on a 4-core software rasteriser (twice that on a CI runner), so it runs on request:
  //   BE_SLOW_3D=1 npx playwright test tests/e2e/v2-world3d.spec.ts --project=desktop
  test('the first two days of the recorded Fire Wall route, clicked while the 3D world draws, reach the engine’s own state', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only; the phone runs cover touch');
    test.skip(process.env.BE_SLOW_3D !== '1', 'slow on a software rasteriser: set BE_SLOW_3D=1 to run it');
    test.setTimeout(900_000);
    const errors = watchConsole(page);
    const prefix = traces.fireWall.actions.slice(0, 8);
    expect(prefix.filter((a) => a.type === 'END_DAY')).toHaveLength(2);
    await startRedbank(page, traces.canonicalSeed, 'normal', URL_3D);
    await world3d(page);
    const g = await replayTraceViaUi(page, traces.canonicalSeed, prefix);
    const st = await browserState(page);
    expect(st.day).toBe(3);
    expect(st.hash).toBe(stateHash(g.state));
    expect(st.eventHash).toBe(eventHash(g.state));
    await expect.poll(mapPainted(page), { timeout: 20_000 }).toBeGreaterThan(0.25);
    expect(errors).toEqual([]);
  });

  test('on a phone-sized touch screen the 3D world fits, paints and answers a tap', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'touch profile only');
    test.setTimeout(180_000);
    const errors = watchConsole(page);
    await startRedbank(page, 1, 'normal', URL_3D);
    await world3d(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'no sideways scroll').toBe(true);
    await expect.poll(mapPainted(page), { timeout: 20_000 }).toBeGreaterThan(0.25);
    const at = await villagerOnPage(page, 'ivo');
    await page.touchscreen.tap(at.x, at.y - 4);
    await expect(page.getByTestId('villager-card')).toContainText('Ivo Thatcher');
    expect(errors).toEqual([]);
  });
});
