/**
 * Fails when the production bundle outgrows its budget (after `npm run build`). The budgets sit about a third above today's size, so they
 * catch an accidental large dependency or an un-split asset without breaking on ordinary growth. Raise them deliberately, in a commit that says why.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// The classic game loads first and on its own. The 3D world (Three.js and the scene code) is a separate chunk fetched only when the
// player's browser can draw it, so it has its own budget and the first load of everyone else is unchanged. The reality composer (the
// reader v2 and its vocabulary) is another lazy chunk, fetched only when a Generative Reality run opens it.
const BUDGET = { entryGzKb: 260, world3dGzKb: 270, realityGzKb: 40, cssGzKb: 12, totalFiles: 12 };
const dir = 'dist/assets';
const files = readdirSync(dir).map((f) => ({ f, raw: statSync(join(dir, f)).size, gz: gzipSync(readFileSync(join(dir, f))).length }));
const sum = (ext: string) => files.filter((x) => x.f.endsWith(ext)).reduce((a, x) => a + x.gz, 0) / 1024;
const chunk = (prefix: string) => files.filter((x) => x.f.endsWith('.js') && x.f.startsWith(prefix)).reduce((a, x) => a + x.gz, 0) / 1024;
const world3d = chunk('World3D-');
const reality = chunk('RealityCompose-');
const entry = sum('.js') - world3d - reality;
const css = sum('.css');
console.log(`entry JS ${entry.toFixed(0)} KB gzip (budget ${BUDGET.entryGzKb}), 3D world chunk ${world3d.toFixed(0)} KB gzip (budget ${BUDGET.world3dGzKb}), reality composer chunk ${reality.toFixed(0)} KB gzip (budget ${BUDGET.realityGzKb}), CSS ${css.toFixed(1)} KB gzip (budget ${BUDGET.cssGzKb}), ${files.length} files`);
const problems: string[] = [];
if (entry > BUDGET.entryGzKb) problems.push(`The entry JavaScript is ${entry.toFixed(0)} KB gzipped; the budget is ${BUDGET.entryGzKb}`);
if (world3d > BUDGET.world3dGzKb) problems.push(`The 3D world chunk is ${world3d.toFixed(0)} KB gzipped; the budget is ${BUDGET.world3dGzKb}`);
if (world3d === 0) problems.push('No 3D world chunk was found: the renderer must stay a lazy chunk named World3D-*');
if (reality > BUDGET.realityGzKb) problems.push(`The reality composer chunk is ${reality.toFixed(0)} KB gzipped; the budget is ${BUDGET.realityGzKb}`);
if (reality === 0) problems.push('No reality composer chunk was found: the reader v2 must stay a lazy chunk named RealityCompose-*');
if (css > BUDGET.cssGzKb) problems.push(`CSS is ${css.toFixed(1)} KB gzipped; the budget is ${BUDGET.cssGzKb}`);
if (files.length > BUDGET.totalFiles) problems.push(`${files.length} asset files; expected at most ${BUDGET.totalFiles}`);
// nothing server-side may reach the browser: no credential names, no gateway, store or SDK code (src/ai/client.ts talks to /api only)
const FORBIDDEN = ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'BE_SESSION_SECRET', 'UPSTASH', 'KV_REST_API', 'BE_ADMIN_TOKEN', 'ai-gateway.vercel.sh', '@ai-sdk', 'generateText'];
for (const { f } of files.filter((x) => x.f.endsWith('.js'))) {
  const text = readFileSync(join(dir, f), 'utf8');
  for (const word of FORBIDDEN) if (text.includes(word)) problems.push(`${f} contains "${word}": server code or a credential name reached the browser bundle`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
