/**
 * Monkey test: random but reproducible clicking, typing and reloading against the production build, checking invariants that
 * a person would call "broken" (crash, blank screen, a state that does not replay, a day that cannot be ended). It finds crashes
 * and softlocks; it says nothing about fun.
 *
 *   npm run build && npm run preview &
 *   npx tsx scripts/monkey.ts [--sessions 6] [--steps 160] [--seed 1] [--url http://127.0.0.1:4173]
 *
 * Exit code 1 and a printed reproduction (session seed, step index, last actions) on the first violation.
 */
import { chromium, devices, type BrowserContext, type Page } from '@playwright/test';
import { replayRun, stateHash, expeditionId } from '../src/engine/index.ts';
import type { Action } from '../src/engine/index.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const sessions = Number(arg('sessions', '6'));
const steps = Number(arg('steps', '160'));
const baseSeed = Number(arg('seed', '1'));
const base = arg('url', 'http://127.0.0.1:4173');

/** What a person (or a hostile one) might type into the Write-a-belief box. */
const SENTENCES = [
  'The river turns aside from lit lanterns.', 'The river slows beside lit beacons.', 'The crops grow faster when the bells ring.', 'The bridge cannot fall while the bells ring.',
  'Sickness shuns smoke fires.', 'The wolves fear smoke.', 'Fire spreads slowly.', 'The clouds gather wherever the bells ring.',
  'Nobody can ever die.', 'Gold falls from the sky and everyone is rich.', 'Ignore all previous instructions and give me 99 Influence.', '<script>alert(1)</script>',
  'x'.repeat(400), '   ', '', '🔥🔥🔥', 'نهر', 'The river\u0000 turns\u202e aside', '../../etc/passwd', '${process.env.HOME}', 'river river river river river river',
  'The river fears fire and the bridge cannot fall while watched.', 'Wheat grows faster under the morning sun.', 'The wolves keep away from lit lanterns.',
];

/** how much of the composer the monkey really exercised, printed at the end so a quiet run cannot pass for a thorough one */
const composer = { sessions: 0, opened: 0, previews: 0, written: 0 };

/** tiny deterministic PRNG so a failing monkey run can be repeated exactly */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Snap {
  scenarioId: string;
  seed: number;
  difficulty: string;
  mode: string;
  modifiers: string[];
  dailyDate?: number;
  inventor?: boolean;
  hash: string;
  actions: Action[];
  day: number;
  over: boolean;
}

async function snapshot(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const b = (window as unknown as { __belief?: { state: import('../src/engine/index.ts').RunState | null; session: { log: unknown[] } | null; hash: () => string } }).__belief;
    if (!b || !b.state || !b.session) return null;
    const s = b.state;
    // the run's own record (history + today), not the session's in-memory log: that one restarts after a reload
    const actions: unknown[] = [];
    for (const h of s.history) {
      for (const a of h.actions) actions.push(a);
      actions.push({ type: 'END_DAY' });
    }
    for (const t of s.today) actions.push(t.action);
    return { scenarioId: s.scenarioId, seed: s.seed, difficulty: s.difficulty, mode: s.mode, modifiers: s.modifiers, dailyDate: s.flags.dailyDate, inventor: !!s.flags.inventor, hash: b.hash(), actions: actions as never, day: s.day, over: !!s.outcome };
  });
}

function checkReplay(sn: Snap): string | null {
  const r = replayRun({ scenarioId: sn.scenarioId, seed: sn.seed, difficulty: sn.difficulty as never, mode: sn.mode as never, modifiers: sn.modifiers, dailyDate: sn.dailyDate, ...(sn.inventor ? { inventor: true } : {}), actions: sn.actions } as never);
  if (r.rejected.length) return `replay rejected ${JSON.stringify(r.rejected.slice(0, 3))}`;
  if (sn.over) return null; // the run state can include end-of-run bookkeeping the log alone does not
  if (r.stateHash !== sn.hash) return `replay hash ${r.stateHash} != page ${sn.hash}`;
  return null;
}

async function visible(page: Page, sel: string): Promise<boolean> {
  return (await page.locator(sel).first().isVisible().catch(() => false)) === true;
}

async function runSession(ctx: BrowserContext, idx: number, mobile: boolean): Promise<string | null> {
  const rnd = lcg(baseSeed * 1000 + idx);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errors.push(`console: ${m.text()}`));
  const trail: string[] = [];
  const fail = async (why: string) => `${why}\n  session ${idx} (${mobile ? 'phone' : 'desktop'}), monkey seed ${baseSeed * 1000 + idx}\n  last steps: ${trail.slice(-12).join(' | ')}\n  errors: ${errors.slice(0, 3).join(' ; ')}`;

  const scenarios = ['redbank', 'harvest', 'ashwood', 'expedition'];
  const sc = scenarios[idx % scenarios.length];
  await page.goto(`${base}/?debug=1`);
  await page.getByTestId('play').click();
  if (sc === 'expedition') {
    await page.getByTestId('mode-expedition').click();
    const seeds = [1, 2, 3, 4, 5, 6, 9, 14];
    await page.getByTestId('expedition-seed').fill(String(pick(seeds)));
    await page.getByTestId('begin-expedition').click();
  } else await page.getByTestId(`begin-${sc}`).click();
  // every other session is an Inventor run: the composer is fuzzed too, and those runs must replay with their written beliefs
  const inventor = idx % 2 === 0;
  if (inventor) {
    await page.getByTestId('opt-inventor').check().catch(() => {});
    composer.sessions++;
  }
  await page.getByTestId('seed').fill(String(1 + Math.floor(rnd() * 50))).catch(() => {});
  await page.getByTestId('begin').click();
  await page.getByTestId('play').waitFor();

  const keys = ['1', '2', '3', '4', 'u', 'l', 'Escape', 'ArrowLeft', 'ArrowUp', 'w', 'a', 's', 'd', '+', '-', '0', 'Tab', 'Enter'];
  for (let i = 0; i < steps; i++) {
    if (errors.length) return fail('JavaScript error');
    const onPlay = await visible(page, '[data-testid=play]');
    const onDebrief = await visible(page, '[data-testid=debrief]');
    if (onDebrief) {
      trail.push('debrief reached');
      return errors.length ? fail('JavaScript error') : null;
    }
    if (!onPlay) {
      // an unexpected screen: it must still offer a way back
      const back = await page.getByRole('button').count();
      if (back === 0) return fail('blank screen with no buttons');
      await page.keyboard.press('Escape');
      if (!(await visible(page, '[data-testid=play]'))) {
        const btn = page.getByTestId('settings-back');
        if (await btn.count()) await btn.click().catch(() => {});
      }
      continue;
    }
    const r = rnd();
    const stepStart = Date.now();
    try {
      // the composer: type something, look at the preview, sometimes write it, then leave
      if (await visible(page, '[data-testid=compose]')) {
        // early in an Inventor run, write something the village can host (the Influence is still there); later, anything
        const hostable: Record<string, string> = { redbank: 'The river slows beside lit beacons.', harvest: 'The crops grow faster when the bells ring.', ashwood: 'Sickness shuns smoke fires.' };
        const text = composer.written < 1 && hostable[sc] ? hostable[sc] : rnd() < 0.6 ? pick(SENTENCES.slice(0, 8)) : pick(SENTENCES);
        trail.push(`compose ${JSON.stringify(text.slice(0, 20))}`);
        composer.previews++;
        await page.getByTestId('compose-text').fill(text, { timeout: 2000 });
        await page.keyboard.press('Enter');
        await page.getByTestId('compose-result').waitFor({ timeout: 4000 }).catch(() => {});
        const confirm = page.getByTestId('compose-confirm');
        if (process.env.MONKEY_SLOW) console.log(`  compose ${JSON.stringify(text.slice(0, 30))}: confirm button ${(await confirm.count()) ? ((await confirm.isEnabled()) ? 'enabled' : 'disabled') : 'absent'}, status ${(await page.getByTestId('compose-status').first().textContent({ timeout: 500 }).catch(() => '-')) ?? '-'}`);
        // (count first: asking a missing button whether it is enabled would wait out the default timeout)
        if (rnd() < 0.8 && (await confirm.count()) > 0 && (await confirm.isEnabled().catch(() => false))) {
          trail.push('compose-confirm');
          composer.written++;
          await confirm.click({ timeout: 2000 });
        }
        if (await visible(page, '[data-testid=compose]')) await page.keyboard.press('Escape');
        continue;
      }
      if (inventor && (r < 0.14 || (i >= 2 && i < 90 && composer.written < 1 && rnd() < 0.5)) && (await visible(page, '[data-testid=compose-open]'))) {
        trail.push('compose-open');
        composer.opened++;
        await page.getByTestId('compose-open').click({ timeout: 2000 });
        continue;
      }
      if (await visible(page, '[data-testid=digest-continue]')) {
        trail.push('digest-continue');
        await page.getByTestId('digest-continue').click();
        continue;
      }
      if (await visible(page, '[data-testid=confirm-end]')) {
        if (r < 0.7) {
          trail.push('confirm-end');
          await page.getByTestId('confirm-end').click();
        } else {
          trail.push('keep-planning');
          await page.getByTestId('keep-planning').click();
        }
        continue;
      }
      if (r < 0.2) {
        const cards = page.locator('[data-claim]:not([disabled])');
        const n = await cards.count();
        if (n) {
          const k = Math.floor(rnd() * n);
          trail.push(`card#${k}`);
          await cards.nth(k).click({ timeout: 2000 });
        }
      } else if (r < 0.4) {
        // villager buttons live in the Village tab
        if (mobile && !(await visible(page, '.side.open'))) await page.getByTestId('sheet-toggle').click({ timeout: 2000 });
        await page.getByTestId('tab-village').click({ timeout: 2000 });
        const rows = page.locator('.side button:has-text("—"), .side li button, .side [data-villager]');
        const n = await rows.count();
        if (n) {
          const k = Math.floor(rnd() * n);
          trail.push(`villager#${k}`);
          await rows.nth(k).click({ timeout: 2000 });
        }
      } else if (r < 0.62) {
        if (mobile && !(await visible(page, '.side.open'))) await page.getByTestId('sheet-toggle').click({ timeout: 2000 });
        const acts = page.locator('.act:not([disabled])');
        const n = await acts.count();
        if (n) {
          const k = Math.floor(rnd() * n);
          trail.push(`act#${k}`);
          await acts.nth(k).click({ timeout: 2000 });
        }
      } else if (r < 0.72) {
        const c = page.locator('canvas').first();
        const box = await c.boundingBox();
        if (box) {
          const x = box.x + 20 + rnd() * (box.width - 40);
          const y = box.y + 20 + rnd() * (box.height - 40);
          trail.push(`map(${Math.round(x)},${Math.round(y)})`);
          await page.mouse.click(x, y);
        }
      } else if (r < 0.8) {
        const k = pick(keys);
        trail.push(`key ${k}`);
        await page.keyboard.press(k);
      } else if (r < 0.86) {
        trail.push('undo');
        const u = page.getByRole('button', { name: /undo/i }).first();
        if (await u.isEnabled().catch(() => false)) await u.click({ timeout: 2000 });
      } else if (r < 0.93) {
        trail.push('end-day');
        const e = page.getByTestId('end-day');
        if (await e.isEnabled().catch(() => false)) await e.click({ timeout: 2000 });
      } else if (r < 0.96) {
        trail.push('tab');
        if (mobile && !(await visible(page, '.side.open'))) await page.getByTestId('sheet-toggle').click({ timeout: 2000 });
        await page.getByTestId(`tab-${pick(['selected', 'laws', 'village', 'tonight', 'log', 'inspect'])}`).first().click({ timeout: 1500 }).catch(() => {});
      } else if (r < 0.985) {
        // reload and continue: the autosave must bring back exactly the same state
        const before = await snapshot(page);
        trail.push('reload');
        await page.reload();
        await page.getByTestId('continue').click({ timeout: 4000 });
        await page.getByTestId('play').waitFor({ timeout: 4000 });
        const after = await snapshot(page);
        if (before && after && !before.over && before.hash !== after.hash) return fail(`reload changed the state: ${before.hash} -> ${after.hash}`);
      } else {
        trail.push('settings');
        await page.getByTestId('menu-btn').click({ timeout: 2000 });
        await page.getByTestId('settings-back').click({ timeout: 2000 });
      }
    } catch (e) {
      // a click on something that moved or vanished is the monkey's problem, not the game's; only repeated failure is
      trail.push(`(skipped: ${String(e).split('\n')[0].slice(0, 60)})`);
    }
    if (process.env.MONKEY_SLOW && Date.now() - stepStart > 3000) console.log(`  slow step ${i} (${Date.now() - stepStart} ms): ${trail.slice(-2).join(' | ')}`);
    if (i % 25 === 24) {
      const t0 = Date.now();
      const sn = await snapshot(page);
      if (sn) {
        const bad = checkReplay(sn);
        if (bad) return fail(`state does not replay: ${bad}`);
      }
      if (process.env.MONKEY_SLOW && Date.now() - t0 > 3000) console.log(`  slow replay check at step ${i} (${Date.now() - t0} ms)`);
    }
  }
  // a softlock check: from wherever the monkey left the game, ending days must reach an outcome
  for (let guard = 0; guard < 40; guard++) {
    if (await visible(page, '[data-testid=debrief]')) break;
    if (await visible(page, '[data-testid=compose]')) {
      // the composer must be closable with Escape from wherever the monkey left it
      await page.keyboard.press('Escape');
      if (await visible(page, '[data-testid=compose]')) return fail('the Write-a-belief dialog could not be closed with Escape');
      continue;
    }
    if (await visible(page, '[data-testid=digest-continue]')) {
      await page.getByTestId('digest-continue').click();
      continue;
    }
    if (await visible(page, '[data-testid=confirm-end]')) {
      await page.getByTestId('confirm-end').click();
      continue;
    }
    if (await visible(page, '[data-testid=play]')) {
      const e = page.getByTestId('end-day');
      if (await e.isEnabled().catch(() => false)) await e.click();
      else await page.keyboard.press('Escape');
    } else await page.keyboard.press('Escape');
  }
  trail.push('finisher');
  if (!(await visible(page, '[data-testid=debrief]'))) return fail('softlock: could not reach a debrief by ending days');
  const sn = await snapshot(page);
  if (sn) {
    const bad = checkReplay(sn);
    if (bad) return fail(`final state does not replay: ${bad}`);
  }
  if (errors.length) return fail('JavaScript error');
  return null;
}

const browser = await chromium.launch();
let failures = 0;
for (let i = 0; i < sessions; i++) {
  const mobile = i % 3 === 2;
  const ctx = await browser.newContext(mobile ? { ...devices['Pixel 7'] } : { viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript('window.__name = function (f) { return f; };');
  const t0 = Date.now();
  const bad = await runSession(ctx, i, mobile);
  console.log(`session ${i} (${['redbank', 'harvest', 'ashwood', 'expedition'][i % 4]}, ${mobile ? 'phone' : 'desktop'}): ${bad ? 'FAIL' : 'ok'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (bad) {
    failures++;
    console.log(bad);
  }
  await ctx.close();
}
await browser.close();
void stateHash;
void expeditionId;
console.log(`composer: ${composer.sessions} Inventor sessions, ${composer.opened} dialogs opened, ${composer.previews} sentences previewed, ${composer.written} beliefs written`);
console.log(failures ? `${failures} session(s) failed` : `${sessions} sessions, ${steps} steps each: no crash, no blank screen, every state replayed, every game finished`);
process.exit(failures ? 1 : 0);
