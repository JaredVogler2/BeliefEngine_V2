/**
 * Verifies the production hosting configuration in a real browser: serves dist/ with vercel.json's headers and rewrites, plays the core flows,
 * and fails on any Content-Security-Policy violation, console error or missing header.
 *
 *   npm run build && npx tsx scripts/verify-hosting.ts
 *
 * What this proves: the shipped CSP does not block anything the game does (including the lazily loaded 3D world), the cache/security headers are present, and unknown paths fall back to the app.
 * What it does not prove: that Vercel applies the file as written (no deployment has been made; see docs/RELEASE_CHECKLIST.md).
 */
import { chromium } from '@playwright/test';
import { serveDist } from './serve-dist.ts';

const PORT = 4174;
const base = `http://127.0.0.1:${PORT}`;
const server = await serveDist(PORT);
const problems: string[] = [];
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) problems.push(msg);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
await ctx.addInitScript(() => {
  (window as unknown as { __csp: string[] }).__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'} (${e.sourceFile ?? ''}:${e.lineNumber})`));
});
const page = await ctx.newPage();
const errors: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));

// headers
const home = await ctx.request.get(`${base}/`);
const h = home.headers();
check(home.status() === 200, 'GET / is 200');
check(/default-src 'self'/.test(h['content-security-policy'] ?? ''), 'CSP present with default-src self');
check(!/unsafe-eval|script-src[^;]*unsafe-inline/.test(h['content-security-policy'] ?? ''), 'CSP allows neither eval nor inline script');
check(h['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff');
check(h['referrer-policy'] === 'no-referrer', 'Referrer-Policy: no-referrer');
check(h['x-frame-options'] === 'DENY' && /frame-ancestors 'none'/.test(h['content-security-policy'] ?? ''), 'framing denied');
check(/microphone=\(\)/.test(h['permissions-policy'] ?? ''), 'Permissions-Policy denies device features');
check((h['cache-control'] ?? '').includes('must-revalidate'), 'index.html is revalidated on every load');
const html = await home.text();
const asset = /\/assets\/[^"']+\.js/.exec(html)?.[0];
check(!!asset, 'index.html references a hashed script');
if (asset) {
  const a = await ctx.request.get(base + asset);
  check((a.headers()['cache-control'] ?? '').includes('immutable'), 'hashed assets are cached immutably');
  check((a.headers()['content-type'] ?? '').includes('javascript'), 'script has a JavaScript content type');
}
const deep = await ctx.request.get(`${base}/some/deep/link?mode=daily`);
check(deep.status() === 200 && (await deep.text()).includes('<div id="root">'), 'an unknown path falls back to the app (no raw 404)');
const missing = await ctx.request.get(`${base}/assets/does-not-exist.js`);
check(missing.status() === 404, 'a missing asset is a real 404, not the app shell');

// flows under the production CSP
await page.goto(`${base}/?debug=1`);
await page.getByTestId('title').waitFor();
await page.getByTestId('play').click();
await page.getByTestId('begin-redbank').click();
await page.getByTestId('begin').click();
await page.locator('[data-claim="river_fears_fire"]').click();
await page.getByTestId('sheet-toggle').click(); // the detail sheet is closed until asked for
await page.getByTestId('tab-village').click();
await page.getByRole('button', { name: /^Ivo/ }).first().click();
await page.locator('.act', { hasText: 'Tell Ivo' }).click();
await page.getByTestId('end-day').click();
await page.getByTestId('confirm-end').click();
await page.getByTestId('digest').waitFor();
await page.getByTestId('digest-continue').click();
await page.getByTestId('menu-btn').click();
await page.getByTestId('settings-back').click();
await page.getByTestId('menu-btn').click();
await page.getByTestId('to-title').click();
await page.getByTestId('atlas-open').click();
await page.getByTestId('atlas-tab-archive').click();
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
check(!!(await dl.path()), 'a file download (Atlas export) works under the CSP');
await page.getByTestId('atlas-back').click();
await page.goto(`${base}/?mode=expedition&seed=4242&rules=1.0.0&gen=1`);
await page.waitForTimeout(600);
// a Generative Reality run under the same policy: the lazily loaded composer, a belief written and told, a night
const pv = await ctx.newPage();
pv.on('console', (m) => {
  if (m.type() === 'error') errors.push(`v2: ${m.text()}`);
});
pv.on('pageerror', (e) => errors.push(`v2: ${e.message}`));
const v2Api: string[] = [];
pv.on('request', (r) => {
  if (new URL(r.url()).pathname.startsWith('/api/')) v2Api.push(r.url());
});
await pv.goto(`${base}/?debug=1`);
await pv.getByTestId('play').click();
await pv.getByTestId('mode-reality').click();
await pv.getByTestId('begin-reality-redbank').click();
await pv.getByTestId('begin').click();
const closeSheet = async () => {
  if (await pv.locator('.side.open').count()) await pv.getByTestId('sheet-toggle').click();
};
await pv.locator('[data-claim="river_fears_fire"]').click();
await closeSheet();
await pv.getByTestId('reality-open').click();
await pv.getByTestId('reality-text').fill('Chickens fly when the bell rings.');
await pv.getByTestId('reality-preview').click();
await pv.getByTestId('reality-kind').waitFor();
await pv.getByTestId('reality-confirm').click();
await pv.getByTestId('tell-first-done').click();
await closeSheet();
await pv.getByTestId('end-day').click();
await pv.getByTestId('confirm-end').click();
await pv.getByTestId('digest-continue').click();
const written = await pv.locator('[data-claim^="reality_"]').count();
check(written === 1, 'a Generative Reality belief is written, told and carried through a night under the production policy');
check(v2Api.length === 0, `the offline reader makes no request${v2Api.length ? `: ${v2Api.join(', ')}` : ''}`);
const cspV2 = await pv.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
check(cspV2.length === 0, `no Content-Security-Policy violations in a Generative Reality run${cspV2.length ? `: ${cspV2.join('; ')}` : ''}`);
// the 3D world under the same policy: it must come up and draw (software WebGL here), with no violation and no console error of its own
const p3 = await ctx.newPage();
p3.on('console', (m) => {
  if (m.type() === 'error') errors.push(`3d: ${m.text()}`);
});
p3.on('pageerror', (e) => errors.push(`3d: ${e.message}`));
await p3.goto(`${base}/?debug=1&renderer=3d&quality=low&scale=0.5`);
await p3.getByTestId('play').click();
await p3.getByTestId('begin-redbank').click();
await p3.getByTestId('begin').click();
await p3.waitForSelector('.stage[data-renderer="3d"][data-ready="1"]', { timeout: 120000 });
await p3.waitForFunction(() => ((window as unknown as { __beRenderer?: { info?: () => { frames: number } } }).__beRenderer?.info?.().frames ?? 0) > 0, undefined, { timeout: 120000 });
check(true, 'the 3D world came up and drew frames under the production policy');
const csp3 = await p3.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
check(csp3.length === 0, `no Content-Security-Policy violations while the 3D world runs${csp3.length ? `: ${csp3.join('; ')}` : ''}`);
const csp = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
check(csp.length === 0, `no Content-Security-Policy violations${csp.length ? `: ${csp.join('; ')}` : ''}`);
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
// negative control: prove the listener would have caught something (an inline script injected into the page must be blocked by this policy)
const ctl = await ctx.newPage();
await ctl.goto(`${base}/`);
await ctl.evaluate(() => {
  const s = document.createElement('script');
  s.textContent = 'window.__ran = true';
  document.head.appendChild(s);
});
await ctl.waitForTimeout(200);
const ran = await ctl.evaluate(() => !!(window as unknown as { __ran?: boolean }).__ran);
const seen = await ctl.evaluate(() => (window as unknown as { __csp: string[] }).__csp.length);
check(!ran && seen >= 1, 'control: an injected inline script is blocked by the policy and the violation listener sees it');
await browser.close();
server.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log('\nhosting configuration verified');
