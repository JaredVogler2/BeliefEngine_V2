/**
 * Phase 18: a novice UI pass with no perfect-knowledge cheat. A scripted newcomer plays the production build through the real
 * interface using only what the screen shows (no debug flag, no engine, no hidden state): it takes the first story card the coach
 * points at, then each day tells the most influential people the village list shows first (the list is sorted by influence and the
 * coach says to look for who people listen to), and ends the day. Two styles:
 *
 *   tell     only tells people. It never lights a beacon, keeps a vigil or reads a forecast: a floor, not a strategy
 *   guided   tells one person a day, then spends what is left on the buttons the Places list offers, in the order a newcomer meets
 *            them: a button that says "as proof of <your story>" first (the screen shows who it would convince), then any other
 *            action. It reads no forecast
 *
 * It shows whether following the obvious advice is enough to win, and that the interface never strands someone who plays this way.
 *
 *   npm run build && npm run preview &   (port 4173)
 *   npx tsx scripts/novice-pass.ts [--seeds 4] [--style tell,guided] [--url http://127.0.0.1:4173] [--out docs/data/acceptance]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const SEEDS = Number(arg('seeds', '4'));
const STYLES = arg('style', 'tell,guided').split(',').filter(Boolean) as ('tell' | 'guided')[];
const base = arg('url', 'http://127.0.0.1:4173');
const outDir = arg('out', 'docs/data/acceptance');
mkdirSync(outDir, { recursive: true });

interface Row { style: string; chapter: string; seed: number; device: string; result: string; dayReached: number; score: string; stuck: string | null; consoleErrors: number; whyLost: boolean | null; whatIf: string | null; retryOffered: boolean | null }
const rows: Row[] = [];
const browser = await chromium.launch();

for (const style of STYLES) {
 for (const device of ['desktop', 'phone'] as const) {
  for (const chapter of ['redbank', 'harvest', 'ashwood']) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const ctx = await browser.newContext(device === 'phone' ? { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } : { viewport: { width: 1366, height: 768 } });
      const page = await ctx.newPage();
      let errors = 0;
      page.on('pageerror', () => errors++);
      page.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errors++);
      let stuck: string | null = null;
      let day = 1;
      try {
        await page.goto(`${base}/`);
        await page.getByTestId('play').click();
        await page.getByTestId(`begin-${chapter}`).click();
        await page.getByTestId('seed').fill(String(seed));
        await page.getByTestId('begin').click();
        await page.getByTestId('play').waitFor();
        for (let guard = 0; guard < 14; guard++) {
          if (await page.getByTestId('debrief').isVisible().catch(() => false)) break;
          day = guard + 1;
          // the coach points at a story: take the first card that can be taken
          const card = page.locator('[data-claim]:not([disabled])').first();
          if (guard === 0) await card.click({ timeout: 5000 });
          // tell the people the village list shows first (most influential); picking a villager moves the panel to their card, so the list is reopened each time
          const openList = async () => {
            if (device === 'phone' && !(await page.locator('.side.open').count())) await page.getByTestId('sheet-toggle').click();
            await page.getByTestId('tab-village').click({ timeout: 3000 });
          };
          let told = 0;
          for (let k = 0; k < 6 && told < (style === 'guided' ? 1 : 3); k++) {
            await openList();
            const people = page.locator('[data-testid=village-panel] button.list-btn');
            if (k >= (await people.count())) break;
            await people.nth(k).click({ timeout: 3000 });
            const tell = page.locator('.act:not([disabled])').filter({ hasText: /^Tell / }).first();
            if (await tell.count()) {
              await tell.click({ timeout: 3000 });
              told++;
            }
          }
          if (style === 'guided') {
            // what is left: the first button in the Places list that says it is proof of the chosen story, else any other enabled action, one per place
            const sinceDone = new Set<number>();
            for (let spent = 0; spent < 4; spent++) {
              let acted = false;
              await openList();
              const all = page.locator('[data-testid=village-panel] button[data-place]');
              const total = await all.count();
              for (let k = 0; k < total && !acted; k++) {
                if (sinceDone.has(k)) continue;
                const label = await all.nth(k).innerText();
                if (/\bhome\b|\bcabin\b|\(empty\)/.test(label)) continue;
                sinceDone.add(k);
                await all.nth(k).click({ timeout: 3000 });
                const acts = page.locator('.act:not([disabled])').filter({ hasNotText: /^(Tell|Scout|Undo)/ });
                const proof = acts.filter({ hasText: /as proof of/ });
                const pick = (await proof.count()) ? proof.first() : (await acts.count()) ? acts.first() : null;
                if (pick) {
                  await pick.click({ timeout: 3000 });
                  acted = true;
                }
                await openList();
              }
              if (!acted) break;
            }
          }
          if (device === 'phone' && (await page.locator('.side.open').count())) await page.getByTestId('sheet-toggle').click();
          await page.getByTestId('end-day').click();
          await page.getByTestId('confirm-end').click();
          await page.getByTestId('digest-continue').click({ timeout: 8000 }).catch(() => {});
        }
        await page.getByTestId('debrief').waitFor({ timeout: 8000 });
      } catch (e) {
        stuck = String(e).split('\n')[0].slice(0, 120);
      }
      const verdict = (await page.getByTestId('verdict').textContent({ timeout: 1000 }).catch(() => null)) ?? 'unfinished';
      // after a defeat: does the screen say who was lost and why, and what could have changed it, and offer another go?
      let whyLost: boolean | null = null;
      let whatIf: string | null = null;
      let retryOffered: boolean | null = null;
      if (verdict === 'Defeat') {
        whyLost = /Why people were lost/.test((await page.getByTestId('debrief').textContent({ timeout: 2000 }).catch(() => '')) ?? '');
        const latest = page.getByTestId('whatif-latest');
        const none = page.getByTestId('whatif-none');
        await latest.or(none).first().waitFor({ timeout: 30000 }).catch(() => {});
        whatIf = (await latest.count()) ? ((await latest.textContent()) ?? '').trim() : (await none.count()) ? 'no plan found' : 'not shown';
        retryOffered = (await page.getByTestId('retry-same').count()) > 0;
      }
      const score = (await page.locator('h2', { hasText: /^Score/ }).first().textContent({ timeout: 1000 }).catch(() => null)) ?? '';
      rows.push({ style, chapter, seed, device, whyLost, whatIf, retryOffered, result: verdict, dayReached: day, score: score.replace('Score ', ''), stuck, consoleErrors: errors });
      console.log(`${style.padEnd(6)} ${device.padEnd(7)} ${chapter.padEnd(8)} seed ${seed}: ${verdict.padEnd(10)} day ${String(day).padStart(2)} score ${score.replace('Score ', '').padStart(4)}${stuck ? `  STUCK: ${stuck}` : ''}${errors ? `  ${errors} console error(s)` : ''}`);
      await ctx.close();
    }
  }
 }
}
await browser.close();

const finished = rows.filter((r) => !r.stuck);
const won = rows.filter((r) => r.result === 'Victory').length;
const lost = rows.filter((r) => r.result === 'Defeat');
console.log(`\n${rows.length} runs: ${finished.length} played to an ending without getting stuck, ${won} won, ${lost.length} lost, ${rows.reduce((a, r) => a + r.consoleErrors, 0)} console errors`);
console.log(`after the ${lost.length} defeats: the debrief said who was lost and why in ${lost.filter((r) => r.whyLost).length}, showed a what-would-have-changed-it answer in ${lost.filter((r) => r.whatIf && r.whatIf !== 'not shown').length} (${lost.filter((r) => r.whatIf?.startsWith('The last day') || r.whatIf?.startsWith('Even on')).length} named a day), and offered a retry in ${lost.filter((r) => r.retryOffered).length}`);
writeFileSync(`${outDir}/novice-pass.json`, JSON.stringify({ about: 'Written by scripts/novice-pass.ts (phase 18): a scripted newcomer who only follows the obvious advice, through the real UI, with no debug access.', date: new Date().toISOString().slice(0, 10), rows }, null, 1) + '\n');
process.exit(rows.some((r) => r.stuck || r.consoleErrors) ? 1 : 0);
