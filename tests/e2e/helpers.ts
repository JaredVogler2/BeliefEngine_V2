import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { GameSession, describeAction } from '../../src/engine/index.ts';
import type { Action } from '../../src/engine/index.ts';

export interface Trace {
  seed: number;
  result: string;
  stateHash: string;
  eventHash: string;
  actions: Action[];
}

export const traces = JSON.parse(readFileSync(new URL('../fixtures/redbank-traces.json', import.meta.url), 'utf8')) as {
  canonicalSeed: number;
  fireWall: Trace;
  witnessBridge: Trace;
  noop: Trace;
};

export function loadTraces(scenario: string): { canonicalSeed: number } & Record<string, Trace> {
  return JSON.parse(readFileSync(new URL(`../fixtures/${scenario}-traces.json`, import.meta.url), 'utf8'));
}

export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

export async function startRedbank(page: Page, seed = 1, difficulty = 'normal', url = '/?debug=1') {
  return startScenario(page, 'redbank', seed, difficulty, url);
}

export async function startScenario(page: Page, scenario: string, seed = 1, difficulty = 'normal', url = '/?debug=1') {
  await page.goto(url);
  await page.getByTestId('play').click();
  await page.getByTestId(`begin-${scenario}`).click();
  await page.getByTestId('seed').fill(String(seed));
  await page.getByTestId('difficulty').selectOption(difficulty);
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('play')).toBeVisible();
}

/** the side sheet holds the detail tabs and is closed until asked for, at every size: open it if it is not, then pick the tab */
export async function openSheet(page: Page, tab: string) {
  if (!(await page.locator('.side.open').count())) await page.getByTestId('sheet-toggle').click();
  await page.getByTestId(`tab-${tab}`).click();
}

export async function selectVillager(page: Page, name: string) {
  await openSheet(page, 'village');
  // scoped to the village list: the card beside the selection can hold buttons whose names also start with a villager's name ("Ivo Thatcher tells Dunn Reed")
  await page.getByTestId('village-panel').getByRole('button', { name: new RegExp(`^${name}`) }).first().click();
}

export async function selectPlace(page: Page, id: string) {
  await openSheet(page, 'village');
  await page.locator(`[data-place="${id}"]`).click();
}

export async function closeSheet(page: Page) {
  if (await page.locator('.side.open').count()) await page.getByTestId('sheet-toggle').click();
}

export async function chooseClaim(page: Page, claim: string) {
  await closeSheet(page);
  const card = page.locator(`[data-claim="${claim}"]`);
  const pressed = await card.getAttribute('aria-pressed');
  if (pressed !== 'true') await card.click();
}

async function clickAct(page: Page, label: string | RegExp) {
  await openSheet(page, 'selected');
  // click() scrolls the button into view itself and re-finds it if the card re-renders under it (a separate scrollIntoView call lost that race on CI)
  await page.locator('.act').filter({ hasText: label }).first().click();
}

/** Perform one engine action through real UI clicks. Returns false if it had to fall back. */
export async function performViaUi(page: Page, g: GameSession, action: Action) {
  const s = g.state;
  const name = (id: string) => s.villagers.find((v) => v.id === id)?.name ?? s.world.landmarks.find((l) => l.id === id)?.name ?? id;
  switch (action.type) {
    case 'PICK_STARTER':
      await page.locator(`[data-claim="${action.claim}"]`).click();
      return;
    case 'SEED':
      await chooseClaim(page, action.claim);
      await selectVillager(page, name(action.target));
      await clickAct(page, new RegExp(`^Tell ${name(action.target)}`));
      return;
    case 'MESSENGER': {
      await chooseClaim(page, action.claim);
      const label = new RegExp(`^${name(action.from)} tells ${name(action.to)}`);
      await selectVillager(page, name(action.from));
      await openSheet(page, 'selected');
      if ((await page.locator('.act').filter({ hasText: label }).count()) === 0) await selectVillager(page, name(action.to));
      await clickAct(page, label);
      return;
    }
    case 'RITUAL': {
      if (action.claim) await chooseClaim(page, action.claim);
      await selectPlace(page, action.landmark);
      const r = s.scn.rituals.find((x) => x.id === action.ritual)!;
      await clickAct(page, new RegExp(`^${r.label} at ${name(action.landmark)}${action.claim ? ' as proof' : '(?! as proof)'}`));
      return;
    }
    case 'GATHER':
      await chooseClaim(page, action.claim);
      await selectPlace(page, action.site);
      await clickAct(page, new RegExp(`^Gather at ${name(action.site)}`));
      return;
    case 'COUNTER':
      await chooseClaim(page, action.claim);
      await selectVillager(page, name(action.target));
      await clickAct(page, /^Challenge/);
      return;
    case 'TRADE':
      await selectVillager(page, name(action.target));
      await clickAct(page, new RegExp(`^${s.scn.deals!.find((d) => d.id === action.deal)!.label}`));
      return;
    case 'END_DAY':
      await closeSheet(page);
      await page.getByTestId('end-day').click();
      await page.getByTestId('confirm-end').click();
      await expect(page.getByTestId('digest')).toBeVisible();
      await page.getByTestId('digest-continue').click();
      return;
    default:
      throw new Error(`unsupported action in UI replay: ${action.type}`);
  }
  void describeAction;
}

/** Replay a recorded engine trace by clicking the real UI, mirroring each step in an engine session to build labels. */
export async function replayTraceViaUi(page: Page, seed: number, actions: Action[], scenarioId = 'redbank') {
  const g = GameSession.create({ scenarioId, seed });
  for (const a of actions) {
    await performViaUi(page, g, a);
    const r = g.act(a);
    if (!r.ok) throw new Error(`engine rejected recorded action ${JSON.stringify(a)}: ${r.error.message}`);
    if (a.type !== 'END_DAY') {
      // the debug API only exists with ?debug=1; without it the replay is checked by its outcome instead
      const ap = await page.evaluate(() => (window as unknown as { __belief?: { state: { ap: number } } }).__belief?.state.ap ?? null);
      if (ap !== null) expect(ap).toBe(g.state.ap);
    }
  }
  return g;
}

export async function browserState(page: Page) {
  return page.evaluate(() => {
    const b = (window as unknown as { __belief: { state: { day: number; ap: number; outcome: { result: string } | null; villagers: { status: string }[] }; hash: () => string; eventHash: () => string } }).__belief;
    return { day: b.state.day, ap: b.state.ap, outcome: b.state.outcome?.result ?? null, alive: b.state.villagers.filter((v) => v.status !== 'dead').length, hash: b.hash(), eventHash: b.eventHash() };
  });
}

/**
 * How much of the village canvas differs from its centre colour (0..1), for either renderer: the classic map reads its 2D canvas, and the
 * 3D world is drawn again right now and copied onto a scratch canvas in the same task (a WebGL canvas cannot be read after it is shown).
 * A failed context, or a scene that never drew, leaves a flat colour and scores 0.
 */
export function mapPainted(page: Page): () => Promise<number> {
  return () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return 0;
      const r = (window as unknown as { __beRenderer?: { kind: string; renderNow?: () => void } }).__beRenderer;
      const read = (): CanvasRenderingContext2D | null => {
        if (r && r.kind === '3d') {
          r.renderNow?.();
          const scratch = document.createElement('canvas');
          scratch.width = c.width;
          scratch.height = c.height;
          const g = scratch.getContext('2d');
          g?.drawImage(c, 0, 0);
          return g;
        }
        return c.getContext('2d');
      };
      const src = read();
      if (!src) return 0;
      // one read of the whole picture (a read per sample makes the browser warn about repeated readbacks)
      const img = src.getImageData(0, 0, c.width, c.height).data;
      const at = (fx: number, fy: number): number => (Math.floor(c.height * fy) * c.width + Math.floor(c.width * fx)) * 4;
      const first = at(0.5, 0.5);
      let diff = 0;
      let n = 0;
      for (let y = 0.15; y < 0.85; y += 0.05)
        for (let x = 0.15; x < 0.85; x += 0.05) {
          const d = at(x, y);
          n++;
          if (Math.abs(img[d] - img[first]) + Math.abs(img[d + 1] - img[first + 1]) + Math.abs(img[d + 2] - img[first + 2]) > 24) diff++;
        }
      return diff / n;
    });
}
