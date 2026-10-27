/**
 * Phase 15 evidence: drives the production build the way a newcomer, a phone player and a QA tester would, with real clicks,
 * and records what is on screen. Screenshots go to --out (default tmp/fun-review). Nothing here asserts; it observes, and the
 * findings that matter are written up in docs/FUN_REVIEW.md with the numbers this prints.
 *
 *   npm run build && npm run preview &
 *   npx tsx scripts/fun-review-browser.ts [--out dir] [--url http://127.0.0.1:4173]
 */
import { chromium, devices, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const out = arg('out', 'tmp/fun-review');
const base = arg('url', 'http://127.0.0.1:4173');
mkdirSync(out, { recursive: true });

const report: Record<string, unknown> = {};
const note = (k: string, v: unknown) => {
  report[k] = v;
  console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
};

async function snap(page: Page, name: string) {
  await page.screenshot({ path: join(out, `${name}.png`) });
}

/** what a person would be asked to read and press on this screen */
async function inventory(page: Page) {
  return page.evaluate(() => {
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    };
    const buttons = [...document.querySelectorAll('button, [role=button], [role=tab], a[href], input, select')].filter(vis);
    const text = (document.body.innerText || '').split(/\s+/).filter(Boolean).length;
    return { buttons: buttons.length, words: text, labels: buttons.map((b) => (b.getAttribute('aria-label') || (b as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean) };
  });
}

async function newcomerDesktop(page: Page, errors: string[]) {
  await page.goto(`${base}/`);
  await page.getByTestId('title').waitFor();
  await snap(page, '01-title');
  note('title.inventory', await inventory(page));
  await page.getByTestId('play').click();
  await snap(page, '02-chapters');
  note('chapters.inventory', await inventory(page));
  await page.getByTestId('begin-redbank').click();
  await snap(page, '03-briefing');
  note('briefing.inventory', await inventory(page));
  await page.getByTestId('begin').click();
  await page.getByTestId('play').waitFor();
  await page.waitForTimeout(600);
  await snap(page, '04-day1');
  const inv = await inventory(page);
  note('day1.inventory', inv);
  // does the tip card cover the map? measure overlap with the canvas
  const cover = await page.evaluate(() => {
    const tip = document.querySelector('[data-testid=coach]') as HTMLElement | null;
    const map = document.querySelector('canvas') as HTMLElement | null;
    if (!tip || !map) return null;
    const a = tip.getBoundingClientRect();
    const b = map.getBoundingClientRect();
    const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return { tip: { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.width), h: Math.round(a.height) }, shareOfMapCovered: +((w * h) / (b.width * b.height)).toFixed(3) };
  });
  note('day1.tipCoversMap', cover);
  // unguided: do only what the tip card says
  const claims = await page.locator('[data-claim]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-claim'), pressed: e.getAttribute('aria-pressed'), disabled: (e as HTMLButtonElement).disabled || e.getAttribute('aria-disabled') === 'true', opacity: getComputedStyle(e).opacity, text: (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim() })));
  note('day1.claims', claims);
  await page.locator('[data-claim="river_fears_fire"]').click();
  await snap(page, '05-claim-chosen');
  await page.getByTestId('tab-village').click();
  await page.getByRole('button', { name: /^Ivo/ }).first().click();
  await snap(page, '06-villager');
  note('villager.inventory', await inventory(page));
  await page.locator('.act', { hasText: 'Tell Ivo' }).click();
  await snap(page, '07-told');
  await page.getByTestId('end-day').click();
  await snap(page, '08-confirm-end');
  await page.getByTestId('confirm-end').click();
  await page.getByTestId('digest').waitFor();
  await page.waitForTimeout(500);
  await snap(page, '09-digest-1');
  note('digest1.inventory', await inventory(page));
  await page.getByTestId('digest-continue').click().catch(() => page.keyboard.press('Enter'));
  await page.waitForTimeout(400);
  await snap(page, '10-day2');
  await page.getByTestId('tab-laws').click();
  await snap(page, '11-laws');
  note('laws.inventory', await inventory(page));
  note('consoleErrors.desktop', errors.length);
}

async function generatedVillage(page: Page) {
  await page.goto(`${base}/`);
  await page.getByTestId('play').click();
  await page.getByTestId('mode-expedition').click();
  await snap(page, '20-expedition-panel');
  await page.getByTestId('expedition-seed').fill('1');
  await page.getByTestId('begin-expedition').click();
  await snap(page, '21-expedition-briefing');
  await page.getByTestId('begin').click();
  await page.getByTestId('play').waitFor();
  await page.waitForTimeout(600);
  await snap(page, '22-expedition-day1');
  note('expedition.day1.claims', await page.locator('[data-claim]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-claim'), opacity: getComputedStyle(e).opacity, text: (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim() }))));
  note('expedition.day1.hints', await page.locator('.side li').allInnerTexts().catch(() => []));
}

async function phone(browser: import('@playwright/test').Browser, errors: string[]) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript('window.__name = function (f) { return f; };');
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/`);
  await snap(page, '30-phone-title');
  await page.getByTestId('play').click();
  await snap(page, '31-phone-chapters');
  await page.getByTestId('begin-redbank').click();
  await snap(page, '32-phone-briefing');
  await page.getByTestId('begin').click();
  await page.getByTestId('play').waitFor();
  await page.waitForTimeout(700);
  await snap(page, '33-phone-day1');
  note('phone.day1.inventory', await inventory(page));
  const tip = await page.evaluate(() => {
    const t = document.querySelector('[data-testid=coach]') as HTMLElement | null;
    const m = document.querySelector('canvas') as HTMLElement | null;
    if (!t || !m) return null;
    const a = t.getBoundingClientRect();
    const b = m.getBoundingClientRect();
    const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return { shareOfMapCovered: +((w * h) / (b.width * b.height)).toFixed(3), mapHeight: Math.round(b.height), viewport: { w: innerWidth, h: innerHeight } };
  });
  note('phone.day1.tipCoversMap', tip);
  await page.locator('[data-claim="river_fears_fire"]').click();
  await snap(page, '34-phone-claim');
  await page.getByTestId('sheet-toggle').click();
  await snap(page, '35-phone-sheet');
  await ctx.close();
}

async function qaCrawl(browser: import('@playwright/test').Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript('window.__name = function (f) { return f; };');
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${base}/?debug=1`);
  // every screen reachable from the title
  const visited: string[] = [];
  for (const id of ['atlas-open', 'play']) {
    await page.getByTestId(id).click();
    visited.push(id);
    const inv = await inventory(page);
    const noop = [] as string[];
    for (const label of inv.labels) if (/^(coming soon|todo|tbd)/i.test(label)) noop.push(label);
    note(`qa.${id}.fakeLabels`, noop);
    await page.keyboard.press('Escape');
    if (await page.getByTestId('title').count() === 0) await page.goBack().catch(() => {});
    if (await page.getByTestId('title').count() === 0) await page.goto(`${base}/?debug=1`);
  }
  note('qa.consoleErrors', errors);
  await ctx.close();
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
await ctx.addInitScript('window.__name = function (f) { return f; };');
const page = await ctx.newPage();
const errors: string[] = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await newcomerDesktop(page, errors);
await generatedVillage(page);
await ctx.close();
await phone(browser, errors);
await qaCrawl(browser);
await browser.close();
writeFileSync(join(out, 'observations.json'), JSON.stringify(report, null, 1) + '\n');
console.log(`screenshots and observations.json in ${out}`);
