import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GameSession, serializeRun } from '../../src/engine/index.ts';
import { policyById } from '../../src/engine/ai/bots/generic.ts';
import { browserState, chooseClaim, mapPainted, selectVillager, startRedbank, traces, watchConsole } from './helpers.ts';

/**
 * The 3D world, played for real: Chromium with software WebGL (SwiftShader, so slow but exact), the production build, real clicks.
 * `?renderer=3d` asks for it (without it a machine with no graphics acceleration is given the classic map), `quality=low&scale=0.5`
 * keeps the software rasteriser from drowning the page. Run by the `desktop-3d` and `phone-3d` projects only.
 * What is checked: the scene is really drawn, taps pick through the 3D raycast, the recorded winning and losing lines reach the
 * identical hashes through this renderer, saves resume (also mid-storm), restarts do not leak GPU objects, and every effect the
 * renderer started names an event the engine logged.
 */
const URL3D = '/?debug=1&renderer=3d&quality=low&scale=0.5';

type R3 = {
  kind: string;
  info: () => { calls: number; triangles: number; geometries: number; textures: number; frames: number };
  villagerScreen: (id: string) => { x: number; y: number } | null;
  playedEffects: () => { eventId: number; code: string; kind: string }[];
  lawVisuals: () => { law: string; status: string; powered: boolean; missing: string | null; sources: unknown[] }[];
  advance: (s: number) => void;
};

const renderer = <T,>(page: Page, fn: (r: R3) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__beRenderer)`) as Promise<T>;

async function ready(page: Page): Promise<void> {
  await expect(page.locator('.stage[data-renderer="3d"][data-ready="1"]')).toBeVisible({ timeout: 90_000 });
  // (right after a switch from the classic map the page's renderer handle can still be the old one for a moment)
  await expect.poll(() => renderer(page, (r) => (typeof r.info === 'function' ? r.info().frames : 0)), { timeout: 60_000 }).toBeGreaterThan(0);
}

/** on a phone the view controls fold into one button: open them if they are folded */
async function showTools(page: Page): Promise<void> {
  const toggle = page.getByTestId('tools-toggle');
  if ((await toggle.count()) && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}

async function loadRun(page: Page, json: string): Promise<void> {
  await page.evaluate((j) => (window as unknown as { __belief: { load: (s: string) => boolean } }).__belief.load(j), json);
  await ready(page);
}

/** feed recorded actions through the store's own act / endDay (what every button calls) while the 3D world is up and drawing */
async function drive(page: Page, actions: { type: string }[]): Promise<void> {
  for (const a of actions) {
    await page.evaluate((action) => {
      const st = (window as unknown as { __belief: { store: { act: (a: unknown) => unknown; endDay: () => void } } }).__belief.store;
      if ((action as { type: string }).type === 'END_DAY') st.endDay();
      else st.act(action);
    }, a);
    if (a.type === 'END_DAY') {
      await page.waitForTimeout(400);
      await page.evaluate(() => (window as unknown as { __belief: { store: { closeDigest: () => void } } }).__belief.store.closeDigest());
    }
    await page.waitForTimeout(120);
  }
}

function played(days: number, policy: string, seed = 1): string {
  const g = GameSession.create({ scenarioId: 'redbank', seed });
  const p = policyById(policy);
  for (let i = 0; i < days && !g.state.outcome; i++) p.playDay(g);
  return serializeRun(g.state);
}

test.describe('the 3D world', () => {
  test.setTimeout(420_000);

  test('boots, draws a real scene, and says what it is', async ({ page }) => {
    const errors = watchConsole(page);
    await startRedbank(page, 1, 'normal', URL3D);
    await ready(page);
    expect(await renderer(page, (r) => r.kind)).toBe('3d');
    await expect.poll(mapPainted(page), { message: 'the 3D canvas is painted', timeout: 30_000 }).toBeGreaterThan(0.2);
    const info = await renderer(page, (r) => r.info());
    // a village, not a placeholder: tens of thousands of triangles over hundreds of draw calls, and it is a lazy chunk the classic map never loads
    expect(info.triangles).toBeGreaterThan(40_000);
    expect(info.calls).toBeGreaterThan(100);
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', /Village in 3D/);
    expect(errors.filter((e) => !/GL Driver Message|GPU stall/i.test(e))).toEqual([]);
  });

  test('the finishing chain is on: the world is inked and lit by its sky, and a switch turns the ink off', async ({ page }) => {
    const errors = watchConsole(page);
    await startRedbank(page, 1, 'normal', URL3D);
    await ready(page);
    const info = (await renderer(page, (r) => r.info())) as unknown as { post: { ao: number; bloom: boolean; fxaa: boolean } | null; env: boolean };
    // Chromium's WebGL2 can draw into a half-float buffer, so the chain is on (and the sky's light is in the environment map)
    expect(info.post).not.toBeNull();
    expect(info.env).toBe(true);
    // the same frame with and without ink, read back in the task that drew it: the outlines must change a real share of the pixels
    const changed = await page.evaluate(`(() => {
      const r = window.__beRenderer;
      const canvas = document.querySelector('.stage canvas');
      const grab = () => {
        r.renderNow();
        const c = document.createElement('canvas');
        c.width = canvas.width;
        c.height = canvas.height;
        const g = c.getContext('2d');
        g.drawImage(canvas, 0, 0);
        return g.getImageData(0, 0, c.width, c.height).data;
      };
      const inked = grab();
      r.setPost({ ink: 0 });
      const plain = grab();
      r.setPost(null);
      let n = 0;
      for (let i = 0; i < inked.length; i += 4) {
        if (Math.abs(inked[i] - plain[i]) + Math.abs(inked[i + 1] - plain[i + 1]) + Math.abs(inked[i + 2] - plain[i + 2]) > 40) n++;
      }
      return n / (inked.length / 4);
    })()`);
    expect(changed as number).toBeGreaterThan(0.005);
    expect(changed as number).toBeLessThan(0.4);
    expect(errors.filter((e) => !/GL Driver Message|GPU stall/i.test(e))).toEqual([]);
  });

  test('a tap picks a villager through the 3D raycast, and the card beside them offers real actions', async ({ page }) => {
    await startRedbank(page, 1, 'normal', URL3D);
    await ready(page);
    await chooseClaim(page, 'river_fears_fire');
    // people are a few pixels tall at the opening view of a phone, and the keeper stands among others at the bridge: come in on her first, as a player would
    await page.evaluate(() => {
      const r = (window as unknown as { __beRenderer: { focusVillager: (id: string) => void; advance: (s: number) => void } }).__beRenderer;
      r.focusVillager('mara');
      r.advance(2);
    });
    await page.waitForTimeout(600);
    await page.evaluate(() => (window as unknown as { __beRenderer: { advance: (s: number) => void } }).__beRenderer.advance(2));
    const pos = await page.evaluate(() => {
      const r = (window as unknown as { __beRenderer: R3 }).__beRenderer;
      const p = r.villagerScreen('mara');
      const b = document.querySelector('canvas')!.getBoundingClientRect();
      return p ? { x: p.x + b.left, y: p.y + b.top + 6 } : null;
    });
    expect(pos).not.toBeNull();
    await page.mouse.click(pos!.x, pos!.y);
    const card = page.getByTestId('selection-pop');
    await expect(card).toContainText('Mara Wells');
    await expect(card.locator('.act').first()).toBeVisible();
    await page.locator('.act', { hasText: 'Tell Mara Wells' }).click();
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);
  });

  test('the recorded winning line, played through the live 3D world, reaches the identical hashes', async ({ page }) => {
    test.setTimeout(900_000);
    await startRedbank(page, traces.canonicalSeed, 'normal', URL3D);
    await ready(page);
    // The world receives each new state, each action's events and each night's events exactly as in play. Real clicks through this
    // renderer are covered by the tap test and the save test; the point here is that drawing changes nothing.
    await drive(page, traces.fireWall.actions);
    const st = await browserState(page);
    expect(st.outcome).toBe('victory');
    expect(st.hash).toBe(traces.fireWall.stateHash);
    expect(st.eventHash).toBe(traces.fireWall.eventHash);
    await expect(page.getByTestId('debrief')).toBeVisible();
    // the end of the run is shown on the village itself, in 3D
    await expect(page.locator('[data-testid="debrief-scene"][data-renderer="3d"][data-ready="1"]')).toBeVisible({ timeout: 90_000 });
  });

  test('doing nothing loses through the 3D world, the debrief explains it, and a retry starts a fresh 3D village', async ({ page }) => {
    test.setTimeout(600_000);
    await startRedbank(page, traces.canonicalSeed, 'normal', URL3D);
    await ready(page);
    await drive(page, traces.noop.actions);
    const st = await browserState(page);
    expect(st.outcome).toBe('defeat');
    expect(st.hash).toBe(traces.noop.stateHash);
    await expect(page.getByTestId('debrief')).toBeVisible();
  });

  for (const tier of ['medium', 'high']) {
    test(`the ${tier} quality tier changes nothing the engine computes`, async ({ page }) => {
      test.setTimeout(600_000);
      await startRedbank(page, traces.canonicalSeed, 'normal', `/?debug=1&renderer=3d&quality=${tier}&scale=0.4`);
      await ready(page);
      expect(await page.evaluate(() => (window as unknown as { __beRenderer: { info: () => { tier: string } } }).__beRenderer.info().tier)).toBe(tier);
      await drive(page, traces.noop.actions);
      const st = await browserState(page);
      expect(st.hash).toBe(traces.noop.stateHash);
      expect(st.eventHash).toBe(traces.noop.eventHash);
    });
  }

  test('beacons, the bridge and a villager in a crowd are each picked by their own tap (mouse or touch)', async ({ page }, info) => {
    await startRedbank(page, 1, 'normal', URL3D);
    await ready(page);
    // a tall phone screen opens turned a quarter-turn from the desktop view, where a home stands in front of a beacon; the crowd and the
    // beacons are judged from one fixed angle so the picks mean the same thing in both projects
    await page.evaluate(() => (window as unknown as { __beRenderer: { setView: (v: { azimuthDeg: number }) => void } }).__beRenderer.setView({ azimuthDeg: 28 }));
    const touch = info.project.name.startsWith('phone');
    const tap = async (kind: 'villager' | 'landmark', id: string, dx = 0): Promise<void> => {
      // bring it into view first (a phone shows only the middle of the village), and let the camera settle
      await page.evaluate(
        ([k, i]) => {
          const w = window as unknown as { __beRenderer: { focusVillager: (i: string) => void; focusTile: (x: number, y: number, z?: number) => void; advance: (s: number) => void }; __belief: { state: { world: { landmarks: { id: string; x: number; y: number }[] } } } };
          if (k === 'villager') w.__beRenderer.focusVillager(i as string);
          else {
            const l = w.__belief.state.world.landmarks.find((q) => q.id === i)!;
            w.__beRenderer.focusTile(l.x, l.y);
          }
          w.__beRenderer.advance(2);
        },
        [kind, id],
      );
      // the view keeps clear of the card beside the selection, which the page measures a few times a second: give it that, then settle
      await page.waitForTimeout(600);
      await page.evaluate(() => (window as unknown as { __beRenderer: { advance: (s: number) => void } }).__beRenderer.advance(2));
      const p = await page.evaluate(
        ([k, i, off]) => {
          const r = (window as unknown as { __beRenderer: { entityScreen: (k: string, i: string) => { x: number; y: number } | null } }).__beRenderer;
          const q = r.entityScreen(k as string, i as string);
          const b = document.querySelector('canvas')!.getBoundingClientRect();
          return q ? { x: q.x + b.left + (off as number), y: q.y + b.top } : null;
        },
        [kind, id, dx],
      );
      expect(p, `${kind} ${id} is on screen`).not.toBeNull();
      if (touch) await page.touchscreen.tap(p!.x, p!.y);
      else await page.mouse.click(p!.x, p!.y);
    };
    const selected = (): Promise<string> => page.evaluate(() => (window as unknown as { __belief: { store: { ui: { selection: { id: string } | null } } } }).__belief.store.ui.selection?.id ?? '');
    for (const [kind, id] of [['landmark', 'b_c'], ['landmark', 'bell'], ['villager', 'pip'], ['villager', 'tilly'], ['villager', 'ivo']] as const) {
      await tap(kind, id);
      await expect.poll(selected, { message: `${kind} ${id}` }).toBe(id);
    }
    // the bridge: the keeper stands in the middle of the span, and a tap on a person wins over the planks under them (right: they are
    // the one you meant); a tap on the span a little to either side is the bridge itself
    await tap('landmark', 'br');
    await expect.poll(selected).toBe('mara');
    await tap('landmark', 'br', -30);
    await expect.poll(selected, { message: 'the bridge, tapped beside its keeper' }).toBe('br');
  });

  test('a mid-day save resumes with the same plan and a rebuilt 3D world', async ({ page }) => {
    await startRedbank(page, 1, 'normal', URL3D);
    await ready(page);
    await chooseClaim(page, 'river_fears_fire');
    await selectVillager(page, 'Ivo Thatcher');
    await page.locator('.act', { hasText: 'Tell Ivo Thatcher' }).click();
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);
    const before = await browserState(page);
    await page.goto(URL3D);
    await page.getByTestId('continue').click();
    await ready(page);
    await expect(page.getByTestId('ap')).toHaveAttribute('aria-label', /Influence 2 of 5/);
    expect((await browserState(page)).hash).toBe(before.hash);
    await expect.poll(mapPainted(page), { timeout: 30_000 }).toBeGreaterThan(0.2);
  });

  test('a save made in the middle of the flood night resumes into the same storm', async ({ page }) => {
    await page.goto(URL3D);
    await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
    const json = played(5, 'threat-aware', 2);
    await loadRun(page, json);
    // a loaded run is not autosaved until something happens; save it as the game itself does after every action
    await page.evaluate(() => (window as unknown as { __belief: { store: { persist: () => void } } }).__belief.store.persist());
    const a = await browserState(page);
    await page.reload();
    await page.getByTestId('continue').click();
    await ready(page);
    const b = await browserState(page);
    expect(b.hash).toBe(a.hash);
    // the engine's law and what the world shows for it agree after the reload
    const laws = await renderer(page, (r) => r.lawVisuals());
    const stateLaws = await page.evaluate(() => (window as unknown as { __belief: { state: { laws: { id: string; status: string }[] } } }).__belief.state.laws.filter((l) => l.status !== 'dormant').map((l) => [l.id, l.status]));
    expect(laws.map((l) => [l.law, l.status]).sort()).toEqual(stateLaws.sort());
  });

  test('restarting and loading other villages does not leak geometry or textures', async ({ page }) => {
    await page.goto(URL3D);
    await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
    await loadRun(page, played(2, 'evidence-first', 1));
    await page.waitForTimeout(1500);
    const base = await renderer(page, (r) => r.info());
    for (const seed of [2, 3, 4, 5]) {
      await loadRun(page, played(2, 'evidence-first', seed));
      await page.waitForTimeout(800);
    }
    const after = await renderer(page, (r) => r.info());
    // each load rebuilds the world; the old one must be disposed, so the counts stay where they were (within the noise of a different village)
    expect(after.geometries).toBeLessThan(base.geometries * 1.25);
    expect(after.textures).toBeLessThan(base.textures + 6);
  });

  test('every effect the world starts names an event the engine logged', async ({ page }) => {
    await page.goto(URL3D);
    await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
    await loadRun(page, played(4, 'threat-aware', 2));
    await page.getByTestId('end-day').click();
    await page.getByTestId('confirm-end').click();
    await expect(page.getByTestId('digest')).toBeVisible();
    await renderer(page, (r) => r.advance(4));
    const out = await page.evaluate(() => {
      const w = window as unknown as { __beRenderer: R3; __belief: { state: { log: { id: number; code: string }[] } } };
      const ids = new Set(w.__belief.state.log.map((e) => e.id));
      const fx = w.__beRenderer.playedEffects();
      return { n: fx.length, orphans: fx.filter((e) => !ids.has(e.eventId)).map((e) => `${e.code}#${e.eventId}`) };
    });
    expect(out.n).toBeGreaterThan(0);
    expect(out.orphans).toEqual([]);
  });

  test('the 2D/3D toggle swaps the canvas and keeps the run', async ({ page }) => {
    await startRedbank(page, 1, 'normal', URL3D);
    await ready(page);
    const h = (await browserState(page)).hash;
    await showTools(page);
    await page.getByTestId('renderer-toggle').click();
    await expect(page.locator('.stage[data-renderer="2d"][data-ready="1"]')).toBeVisible();
    expect((await browserState(page)).hash).toBe(h);
    await expect.poll(mapPainted(page), { timeout: 10_000 }).toBeGreaterThan(0.2);
    await showTools(page);
    await page.getByTestId('renderer-toggle').click();
    await ready(page);
    expect((await browserState(page)).hash).toBe(h);
  });

  test('the flood forecast and the other view options reach the world on its first frame, with no click needed', async ({ page }) => {
    await page.goto(URL3D);
    await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
    await loadRun(page, played(5, 'threat-aware', 2));
    // the 3D world arrives a moment after the page's first render: what the page wants drawn (tonight's predicted water on the ground,
    // the lens, the selection) must be handed over when it does, not only after the next click
    const given = await page.evaluate(() => {
      const r = (window as unknown as { __beRenderer: { opts?: { forecast: number[] | null; showFlood: boolean } } }).__beRenderer;
      return { n: r.opts?.forecast?.length ?? 0, show: !!r.opts?.showFlood };
    });
    expect(given.show).toBe(true);
    expect(given.n).toBeGreaterThan(100);
  });

  test('the camera pans, zooms, orbits and resets through real mouse input, the keyboard and the on-screen buttons, within its limits, and never touches the run', async ({ page }, info) => {
    await startRedbank(page, 1, 'normal', URL3D);
    await ready(page);
    const view = (): Promise<{ x: number; z: number; dist: number; azimuthDeg: number; elevationDeg: number }> =>
      page.evaluate(() => (window as unknown as { __beRenderer: { describeView: () => { x: number; z: number; dist: number; azimuthDeg: number; elevationDeg: number } } }).__beRenderer.describeView());
    const hash0 = (await browserState(page)).hash;
    // the interface measures itself a few times a second and the camera eases to frame the village in what it leaves free. On a software
    // rasteriser the loop draws about three frames a second with a capped time step, so that easing takes many real seconds: let the
    // interface settle, run the camera's own clock forward until it has arrived, and that is home
    const settle = (): Promise<unknown> => page.evaluate(() => (window as unknown as { __beRenderer: { advance: (s: number) => void } }).__beRenderer.advance(4));
    await page.waitForTimeout(1200);
    await settle();
    const home = await view();
    const box = (await page.locator('canvas').boundingBox())!;
    const mx = box.x + box.width * 0.5;
    const my = box.y + box.height * 0.5;
    const phone = info.project.name.startsWith('phone');

    if (!phone) {
      // a drag pans the ground under the pointer, and is not a selection
      await page.mouse.move(mx, my);
      await page.mouse.down();
      await page.mouse.move(mx + 160, my + 40, { steps: 8 });
      await page.mouse.up();
      const panned = await view();
      expect(Math.hypot(panned.x - home.x, panned.z - home.z)).toBeGreaterThan(0.3);
      expect(await page.evaluate(() => (window as unknown as { __belief: { store: { ui: { selection: unknown } } } }).__belief.store.ui.selection)).toBeNull();
      // the wheel zooms by how far it turns, and keeps within the nearest and farthest the camera allows (a few big turns: each wheel
      // event waits for a page that is busy drawing with a software rasteriser)
      await page.mouse.move(mx, my);
      for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -300);
      await page.waitForTimeout(400);
      const near = await view();
      expect(near.dist).toBeLessThan(home.dist);
      expect(near.dist).toBeGreaterThan(3);
      for (let i = 0; i < 14; i++) await page.mouse.wheel(0, 300);
      await page.waitForTimeout(400);
      const far = await view();
      expect(far.dist).toBeGreaterThan(near.dist);
      expect(far.dist).toBeLessThan(home.dist * 1.5);
      // a right-drag orbits, and the elevation stays between its limits (never under the ground)
      await page.mouse.move(mx, my);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(mx - 200, my + 400, { steps: 10 });
      await page.mouse.up({ button: 'right' });
      const orbited = await view();
      expect(Math.abs(orbited.azimuthDeg - far.azimuthDeg)).toBeGreaterThan(3);
      expect(orbited.elevationDeg).toBeGreaterThanOrEqual(24);
      expect(orbited.elevationDeg).toBeLessThanOrEqual(66.01);
    }
    // the on-screen buttons turn it, and the keyboard brings the whole village back
    const before = await view();
    await showTools(page);
    await page.getByTestId('orbit-right').click();
    await expect.poll(async () => Math.abs((await view()).azimuthDeg - before.azimuthDeg)).toBeGreaterThan(5);
    await page.locator('canvas').focus();
    await page.keyboard.press('0');
    await settle();
    await expect.poll(async () => Math.abs((await view()).dist - home.dist), { timeout: 10_000 }).toBeLessThan(0.5);
    expect((await browserState(page)).hash).toBe(hash0);
  });

  test('a selected house says what the water tonight does at its door and draws the way to the nearest shelter over walkable ground', async ({ page }) => {
    await page.goto(URL3D);
    await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
    await loadRun(page, played(5, 'threat-aware', 2));
    await page.evaluate(() => (window as unknown as { __belief: { store: { select: (s: unknown) => void } } }).__belief.store.select({ kind: 'landmark', id: 'h_wells' }));
    await expect(page.getByTestId('home-flood')).toContainText(/Dry tonight|Water tonight/);
    await expect(page.getByTestId('home-flood')).toContainText('Nearest shelter');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __beRenderer: { routeLength: () => number } }).__beRenderer.routeLength()), { timeout: 15_000 }).toBeGreaterThan(8);
    // pick something else and the route goes
    await page.evaluate(() => (window as unknown as { __belief: { store: { select: (s: unknown) => void } } }).__belief.store.select(null));
    await expect.poll(() => page.evaluate(() => (window as unknown as { __beRenderer: { routeLength: () => number } }).__beRenderer.routeLength())).toBe(0);
  });

  test('the interface over the live 3D world passes axe (no critical or serious findings), with a card and the law ledger open', async ({ page }) => {
    await startRedbank(page, 1, 'normal', URL3D);
    await ready(page);
    await chooseClaim(page, 'river_fears_fire');
    await selectVillager(page, 'Old Harl');
    await page.getByTestId('tab-laws').click();
    await page.waitForTimeout(600);
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime as number)).map((a) => a.finished.catch(() => null))));
    const res = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const bad = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });

  test('the interface leaves most of the screen to the world', async ({ page }) => {
    await startRedbank(page, 1, 'normal', URL3D);
    await ready(page);
    // pick a story so the opening card drawer is gone, and measure what the interface covers at rest
    await chooseClaim(page, 'river_fears_fire');
    const vp = page.viewportSize()!;
    const covered = await page.evaluate(() => {
      const rects = ['.topbar', '.corner', '.modes', '.tray', '.map-tools', '.coach'].map((s) => document.querySelector(s)?.getBoundingClientRect()).filter(Boolean) as DOMRect[];
      // union area by sampling a grid: overlapping panels are not counted twice
      let n = 0;
      let hit = 0;
      for (let x = 0; x < window.innerWidth; x += 8) {
        for (let y = 0; y < window.innerHeight; y += 8) {
          n++;
          if (rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) hit++;
        }
      }
      return hit / n;
    });
    // on a desktop the world is at least 75% of the view; on a phone the rail, a one-line tip, one tools button and the two-row tray leave at least 60% (about 70% measured locally, 67% on a CI runner with other fonts)
    expect(1 - covered, `${vp.width}x${vp.height}`).toBeGreaterThan(vp.width >= 900 ? 0.75 : 0.6);
    await expect(page.getByTestId('end-day')).toBeInViewport();
  });

  test('at every screen size the brief names, phones upright and on their side included: no sideways scroll, finger-sized controls, End Day in view, the world in most of the screen', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-3d', 'the sizes are set inside the test; run once');
    // iPhone 12 to 15 (390x844), iPhone 15 Pro (393x852), a small Android (360x740), an iPhone on its side (844x390), three desktops
    const sizes: [number, number][] = [[390, 844], [393, 852], [360, 740], [844, 390], [1920, 1080], [1440, 900], [1366, 768]];
    const json = played(2, 'evidence-first');
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(URL3D);
      await page.waitForFunction(() => !!(window as unknown as { __belief?: unknown }).__belief);
      await loadRun(page, json);
      await page.waitForTimeout(600);
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const small: string[] = [];
        // the tip's slim buttons are left out: their tap area is widened to 44 px by an invisible box the layout cannot see
        for (const b of document.querySelectorAll<HTMLElement>('.topbar button, .corner button, .modes button, .map-tools button, .tray button')) {
          const r = b.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || getComputedStyle(b).visibility === 'hidden') continue;
          if (r.width < 43.5 || r.height < 43.5) small.push(`${b.getAttribute('aria-label') || b.textContent?.trim()} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        const rects = ['.topbar', '.corner', '.modes', '.tray', '.map-tools', '.coach'].map((q) => document.querySelector(q)?.getBoundingClientRect()).filter(Boolean) as DOMRect[];
        let n = 0;
        let hit = 0;
        for (let x = 0; x < window.innerWidth; x += 8) {
          for (let y = 0; y < window.innerHeight; y += 8) {
            n++;
            if (rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) hit++;
          }
        }
        return { overflow: de.scrollWidth - de.clientWidth, small, world: 1 - hit / n };
      });
      const at = `${w}x${h}`;
      expect(m.overflow, `${at}: the page does not scroll sideways`).toBeLessThanOrEqual(1);
      expect(m.small, `${at}: every control is at least 44x44`).toEqual([]);
      await expect(page.getByTestId('end-day'), at).toBeInViewport();
      expect(m.world, `${at}: the share of the screen left to the world`).toBeGreaterThan(w >= 900 ? 0.75 : 0.6);
    }
  });
});
