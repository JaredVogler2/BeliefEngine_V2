import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { GameSession, eventHash, replayRun, serializeRun, stateHash, type Action, type CreateRunOptions } from '../../src/engine/index.ts';
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

    // pick a person by pointing at them in the 3D scene: the raycast answers with an engine id, the store selects it. The person is
    // the one standing furthest on screen from everyone else, inside the open middle of the canvas, so no other body covers the point
    // (people who share a tile can stand in front of each other, and how they stand depends on the frame the click lands on)
    const who = await page.evaluate(() => {
      const w = window as unknown as { __beRenderer: R3D; __belief: { state: { villagers: { id: string; name: string; status: string }[] } } };
      const c = (document.querySelector('.stage canvas') as HTMLCanvasElement).getBoundingClientRect();
      const pts = w.__belief.state.villagers
        .filter((v) => v.status !== 'dead')
        .map((v) => ({ id: v.id, name: v.name, p: w.__beRenderer.entityScreen('villager', v.id) }))
        .filter((x): x is { id: string; name: string; p: { x: number; y: number } } => !!x.p);
      const inside = pts.filter((x) => x.p.x > c.width * 0.2 && x.p.x < c.width * 0.75 && x.p.y > c.height * 0.25 && x.p.y < c.height * 0.7);
      let best: { id: string; name: string; d: number } | null = null;
      for (const a of inside) {
        const d = Math.min(...pts.filter((b) => b.id !== a.id).map((b) => Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y)));
        if (!best || d > best.d) best = { id: a.id, name: a.name, d };
      }
      return best;
    });
    expect(who, 'someone stands in the open middle of the view').not.toBeNull();
    const at = await villagerOnPage(page, who!.id);
    await page.mouse.click(at.x, at.y - 4);
    // the card beside the selection (V1's immersive HUD) names them and holds the quick actions
    await expect(page.getByTestId('selection-pop')).toContainText(who!.name);
    await page.locator('.act', { hasText: `Tell ${who!.name}` }).first().click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __beRenderer: R3D }).__beRenderer.stats().effects), { message: 'telling a story puts an effect in the world' }).toBeGreaterThan(0);

    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await expect(page.getByTestId('digest')).toBeVisible();
    await page.getByTestId('digest-continue').click();

    // the same actions played directly in the engine (on day 1 the first story card chosen is the opening story) give the same run:
    // the renderer observes, it never decides
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    const plan: Action[] = [{ type: 'PICK_STARTER', claim: 'river_fears_fire' }, { type: 'SEED', claim: 'river_fears_fire', target: who!.id }, { type: 'END_DAY' }];
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
    test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop only; the phone runs cover touch');
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
    test.skip(!testInfo.project.name.startsWith('phone'), 'touch profile only');
    test.setTimeout(180_000);
    const errors = watchConsole(page);
    await startRedbank(page, 1, 'normal', URL_3D);
    await world3d(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'no sideways scroll').toBe(true);
    await expect.poll(mapPainted(page), { timeout: 20_000 }).toBeGreaterThan(0.25);
    const at = await villagerOnPage(page, 'ivo');
    await page.touchscreen.tap(at.x, at.y - 4);
    await expect(page.getByTestId('selection-pop')).toContainText('Ivo Thatcher');
    expect(errors).toEqual([]);
  });

  test('what a written law did is drawn in the 3D world: the hens it saved, the stone carried to the bank, the bank raised', async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    const fx = JSON.parse(readFileSync(new URL('../fixtures/v2-bridge-traces.json', import.meta.url), 'utf8')) as Record<string, { opts: CreateRunOptions; actions: Action[] }>;
    for (const key of ['hens', 'stones'] as const) {
      // the morning after the night the law acted: the recorded chain up to its last End Day, saved as the game saves
      const t = fx[key];
      const last = t.actions.map((a) => a.type).lastIndexOf('END_DAY');
      const run = replayRun({ ...t.opts, actions: t.actions.slice(0, last) });
      expect(run.rejected).toEqual([]);
      const v2 = run.state.v2!;
      await page.goto(URL_3D);
      await page.evaluate((v) => localStorage.setItem('be:save:v1', v), serializeRun(run.state));
      await page.goto(URL_3D);
      await page.getByTestId('continue').click();
      await world3d(page);
      const d = await page.evaluate(() => (window as unknown as { __beRenderer: { realityInfo: () => Record<string, number> } }).__beRenderer.realityInfo());
      expect(d.hens).toBe(v2.chickens.filter((c) => c.alive).length);
      expect(d.coops).toBe(v2.coops.length);
      expect(d.placed).toBe(v2.stones.filter((x) => x.state === 'placed').length);
      expect(d.bank).toBe(Object.values(v2.bank).filter((h) => h > 0).length);
      if (key === 'hens') expect(d.hens).toBeGreaterThan(20);
      if (key === 'stones') expect(d.placed + d.bank).toBeGreaterThan(0);
      if (process.env.BE_SHOTS === '1') {
        const at = key === 'hens' ? v2.coops[0] : v2.stones.find((x) => x.state === 'placed')!;
        await page.evaluate(([x, y]) => {
          const r = (window as unknown as { __beRenderer: { setView: (v: { x: number; z: number; dist: number; elevationDeg: number }) => void; advance: (s: number) => void } }).__beRenderer;
          r.setView({ x: x + 0.5, z: y + 0.5, dist: 6.5, elevationDeg: 40 });
          r.advance(2);
        }, [at.x, at.y]);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `docs/screenshots/v2-phase09/${key}-3d-${testInfo.project.name.startsWith('phone') ? 'phone' : 'desktop'}.png` });
      }
    }
  });

  test('a bell night played in the 3D world: the hens the law lifts rise to the engine’s height, hover and settle again', async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    const fx = JSON.parse(readFileSync(new URL('../fixtures/v2-bridge-traces.json', import.meta.url), 'utf8')) as Record<string, { opts: CreateRunOptions; actions: Action[] }>;
    const t = fx.hens;
    // the morning of day 6 played up to its End Day: the law is about to wake and the bell has been rung
    const ends = t.actions.map((a, i) => (a.type === 'END_DAY' ? i : -1)).filter((i) => i >= 0);
    const run = replayRun({ ...t.opts, actions: t.actions.slice(0, ends[5]) });
    expect(run.rejected).toEqual([]);
    expect(run.state.day).toBe(6);
    const coop = run.state.v2!.coops[0];
    await page.goto(URL_3D);
    await page.evaluate((v) => localStorage.setItem('be:save:v1', v), serializeRun(run.state));
    await page.goto(URL_3D);
    await page.getByTestId('continue').click();
    await world3d(page);
    await page.evaluate(([x, y]) => (window as unknown as { __beRenderer: { setView: (v: { x: number; z: number; dist: number; elevationDeg: number }) => void } }).__beRenderer.setView({ x: x + 0.5, z: y + 0.5, dist: 7.5, elevationDeg: 34 }), [coop.x, coop.y]);
    const info = () => page.evaluate(() => (window as unknown as { __beRenderer: { realityInfo: () => { hens: number; airborne: number } } }).__beRenderer.realityInfo());
    expect((await info()).airborne).toBe(0);
    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await expect(page.getByTestId('digest')).toBeVisible();
    await page.getByTestId('digest-continue').click();
    // the resolution plays: the hens the executor lifted are in the air for a while, then back on the ground, all of them alive
    await expect.poll(async () => (await info()).airborne, { timeout: 60_000, message: 'hens rise' }).toBeGreaterThan(15);
    if (process.env.BE_SHOTS === '1') {
      // the waking law draws the camera to its ground; look back at the coop for the picture
      await page.evaluate(([x, y]) => (window as unknown as { __beRenderer: { setView: (v: { x: number; z: number; dist: number; elevationDeg: number }) => void } }).__beRenderer.setView({ x: x + 0.5, z: y + 0.5, dist: 6.5, elevationDeg: 30 }), [coop.x, coop.y]);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `docs/screenshots/v2-phase10/hens-rising-${testInfo.project.name.startsWith('phone') ? 'phone' : 'desktop'}.png` });
    }
    await expect.poll(async () => (await info()).airborne, { timeout: 120_000, message: 'hens settle' }).toBe(0);
    expect((await info()).hens).toBe(22);
  });
});
