/**
 * Fails when the production bundle outgrows its budget (after `npm run build`). The budgets sit about a third above today's size, so they
 * catch an accidental large dependency or an un-split asset without breaking on ordinary growth. Raise them deliberately, in a commit that says why.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// The classic game loads first and on its own. The 3D world (Three.js and the scene code) is a separate chunk fetched only when the
// player's browser can draw it, so it has its own budget and the first load of everyone else is unchanged.
const BUDGET = { entryGzKb: 260, world3dGzKb: 270, cssGzKb: 12, totalFiles: 12 };
const dir = 'dist/assets';
const files = readdirSync(dir).map((f) => ({ f, raw: statSync(join(dir, f)).size, gz: gzipSync(readFileSync(join(dir, f))).length }));
const sum = (ext: string) => files.filter((x) => x.f.endsWith(ext)).reduce((a, x) => a + x.gz, 0) / 1024;
const world3d = files.filter((x) => x.f.endsWith('.js') && x.f.startsWith('World3D-')).reduce((a, x) => a + x.gz, 0) / 1024;
const entry = sum('.js') - world3d;
const css = sum('.css');
console.log(`entry JS ${entry.toFixed(0)} KB gzip (budget ${BUDGET.entryGzKb}), 3D world chunk ${world3d.toFixed(0)} KB gzip (budget ${BUDGET.world3dGzKb}), CSS ${css.toFixed(1)} KB gzip (budget ${BUDGET.cssGzKb}), ${files.length} files`);
const problems: string[] = [];
if (entry > BUDGET.entryGzKb) problems.push(`The entry JavaScript is ${entry.toFixed(0)} KB gzipped; the budget is ${BUDGET.entryGzKb}`);
if (world3d > BUDGET.world3dGzKb) problems.push(`The 3D world chunk is ${world3d.toFixed(0)} KB gzipped; the budget is ${BUDGET.world3dGzKb}`);
if (world3d === 0) problems.push('No 3D world chunk was found: the renderer must stay a lazy chunk named World3D-*');
if (css > BUDGET.cssGzKb) problems.push(`CSS is ${css.toFixed(1)} KB gzipped; the budget is ${BUDGET.cssGzKb}`);
if (files.length > BUDGET.totalFiles) problems.push(`${files.length} asset files; expected at most ${BUDGET.totalFiles}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
