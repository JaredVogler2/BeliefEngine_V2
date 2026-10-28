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
type R3D = { kind: string; info: () => Info3D; entityScreen: (k: 'villager' | 'landmark', id: string) => { x: number; y: number } | null; hitTest: (x: number, y: number) => { kind: string; id: string } | null; stats: () => { effects: number } };

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
    // (people who share a tile can stand in front of each other, and how they stand depends on the frame the click lands on), and
    // whose point the raycast answers with them, not with a building they stand in front of (on the phone's framing a shelter can
    // cover the point just above a figure: CI saw it once)
    const who = await page.evaluate(() => {
      const w = window as unknown as { __beRenderer: R3D; __belief: { state: { villagers: { id: string; name: string; status: string }[] } } };
      const c = (document.querySelector('.stage canvas') as HTMLCanvasElement).getBoundingClientRect();
      const pts = w.__belief.state.villagers
        .filter((v) => v.status !== 'dead')
        .map((v) => ({ id: v.id, name: v.name, p: w.__beRenderer.entityScreen('villager', v.id) }))
        .filter((x): x is { id: string; name: string; p: { x: number; y: number } } => !!x.p);
      const inside = pts.filter((x) => x.p.x > c.width * 0.2 && x.p.x < c.width * 0.75 && x.p.y > c.height * 0.25 && x.p.y < c.height * 0.7);
      const ranked = inside
        .map((a) => ({ id: a.id, name: a.name, p: a.p, d: Math.min(...pts.filter((b) => b.id !== a.id).map((b) => Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y))) }))
        .sort((a, b) => b.d - a.d);
      const clear = ranked.find((a) => {
        const h = w.__beRenderer.hitTest(a.p.x, a.p.y - 4);
        return h?.kind === 'villager' && h.id === a.id;
      });
      return clear ? { id: clear.id, name: clear.name, d: clear.d } : null;
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

  test('the dangers on the ground are drawn where the engine has them: the packs the 2D map shows, the smoke round a lit fire, fire on the ground', async ({ page }, testInfo) => {
    test.setTimeout(420_000);
    const errors = watchConsole(page);
    // Ashwood seed 1, the morning of day 6: three packs out, and the smoke of a fire lit at the first campfire on day 4
    const ash = GameSession.create({ scenarioId: 'ashwood', seed: 1 });
    expect(ash.act({ type: 'PICK_STARTER', claim: 'wolves_fear_smoke' }).ok).toBe(true);
    while (ash.state.day < 4) ash.endDay();
    expect(ash.act({ type: 'RITUAL', ritual: 'burn_smoke', landmark: 'c_n1' }).ok).toBe(true);
    while (ash.state.day < 6) ash.endDay();
    // Redbank seed 2, the morning of day 3: the beacons lit on days 1 and 2 set Ivo's home alight
    const red = GameSession.create({ scenarioId: 'redbank', seed: 2 });
    expect(red.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' }).ok).toBe(true);
    for (let d = 0; d < 2; d++) {
      for (const l of red.state.world.landmarks.filter((x) => x.kind === 'beacon')) red.act({ type: 'RITUAL', ritual: 'light_beacon', landmark: l.id });
      red.endDay();
    }
    const runs = [
      {
        name: 'ashwood',
        state: ash.state,
        want: { wolves: 9, packMarks: 3, fireTiles: 0, smokeTiles: 21, burning: [] as string[], ashTiles: 0 },
        // the overview (a pack in the forest shows by its mark, the smoke lies round the lit fire), and the Grey pack at the pen
        views: { hazards: { x: 11, z: 8.5, dist: 15, elevationDeg: 50 }, wolves: { x: 16.5, z: 9.5, dist: 5, elevationDeg: 36 } },
        nights: [] as { fireTiles: number; burning: string[]; ashTiles: number }[],
      },
      {
        name: 'redbank',
        state: red.state,
        want: { wolves: 0, packMarks: 0, fireTiles: 1, smokeTiles: 0, burning: ['h_ivo'], ashTiles: 0 },
        views: { fire: { x: 18.5, z: 4.5, dist: 7, elevationDeg: 38 } },
        // three more nights played in the 3D world: the home burns on, its ruins burn (flames from the ground now), and then its tile is ash
        nights: [
          { fireTiles: 1, burning: ['h_ivo'], ashTiles: 0 },
          { fireTiles: 1, burning: [], ashTiles: 0 },
          { fireTiles: 0, burning: [], ashTiles: 1 },
        ],
      },
    ];
    // what the page's own run says the 2D map shows (its rules: today's packs or yesterday's, one wolf more than a pack's size; a standing
    // home on a burning tile drawn burning; burned-out ground drawn as ash)
    const shown = () =>
      page.evaluate(() => {
        const s = (window as unknown as { __belief: { state: { day: number; threat: { pack?: number }[]; scn: { features: { wolves?: boolean } }; world: { w: number; packs: { size: number }[]; fire: number[]; smoke: number[]; burned: number[]; landmarks: { id: string; x: number; y: number; hp: number }[] } } } }).__belief.state;
        const packsOn = (back: number) => s.threat[Math.max(0, Math.min(s.day, s.threat.length) - back)]?.pack ?? 0;
        const active = s.scn.features.wolves ? Math.min(s.world.packs.length, Math.max(packsOn(1), packsOn(2))) : 0;
        return {
          wolves: s.world.packs.slice(0, active).reduce((n, p) => n + p.size + 1, 0),
          packMarks: active,
          fireTiles: s.world.fire.filter((f) => f > 0).length,
          smokeTiles: s.world.smoke.filter((d) => d > 0).length,
          burning: s.world.landmarks.filter((l) => l.hp > 0 && s.world.fire[l.y * s.world.w + l.x] > 0).map((l) => l.id),
          ashTiles: s.world.burned.filter((b) => b).length,
        };
      });
    const drawn = () => page.evaluate(() => (window as unknown as { __beRenderer: { hazardInfo: () => { wolves: number; packMarks: number; fireTiles: number; smokeTiles: number; puffs: number; burning: string[]; ashTiles: number } } }).__beRenderer.hazardInfo());
    const drawnNow = async () => {
      const d = await drawn();
      return { wolves: d.wolves, packMarks: d.packMarks, fireTiles: d.fireTiles, smokeTiles: d.smokeTiles, burning: d.burning, ashTiles: d.ashTiles };
    };
    for (const run of runs) {
      await page.goto(URL_3D);
      await page.evaluate((v) => localStorage.setItem('be:save:v1', v), serializeRun(run.state));
      await page.goto(URL_3D);
      await page.getByTestId('continue').click();
      await world3d(page);
      expect(await shown(), run.name).toEqual(run.want);
      await expect.poll(drawnNow, { message: `${run.name}: what the 3D world draws` }).toEqual(run.want);
      // and the flames or the haze are really in the air
      await expect.poll(async () => (await drawn()).puffs, { message: `${run.name}: flames or haze drawn`, timeout: 30_000 }).toBeGreaterThan(0);
      if (process.env.BE_SHOTS === '1') {
        for (const [what, view] of Object.entries(run.views)) {
          await page.evaluate((v) => {
            const r = (window as unknown as { __beRenderer: { setView: (v: { x: number; z: number; dist: number; elevationDeg: number }) => void; advance: (s: number) => void } }).__beRenderer;
            r.setView(v);
            r.advance(3);
          }, view);
          await page.waitForTimeout(1500);
          // (the software rasteriser once handed the screenshot an empty frame: wait until the canvas is painted)
          await expect.poll(mapPainted(page), { timeout: 20_000 }).toBeGreaterThan(0.25);
          await page.screenshot({ path: `docs/screenshots/v2-phase17/world3d-${run.name}-${what}-${testInfo.project.name.startsWith('phone') ? 'phone' : 'desktop'}.jpg`, type: 'jpeg', quality: 85 });
        }
      }
      // nights played while the 3D world draws: it keeps up with the engine without being rebuilt
      for (const [i, night] of run.nights.entries()) {
        await page.evaluate(() => (window as unknown as { __belief: { store: { endDay: () => void } } }).__belief.store.endDay());
        await page.waitForTimeout(400);
        await page.evaluate(() => (window as unknown as { __belief: { store: { closeDigest: () => void } } }).__belief.store.closeDigest());
        const now = await shown();
        expect({ fireTiles: now.fireTiles, burning: now.burning, ashTiles: now.ashTiles }, `${run.name} night ${i + 1}`).toEqual(night);
        await expect.poll(drawnNow, { message: `${run.name} night ${i + 1}: what the 3D world draws` }).toEqual(now);
      }
    }
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
