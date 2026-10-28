import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Vercel builds each `api/*.ts` function by transpiling every file it imports with the project's tsconfig and running the result on
 * plain Node, which has no TypeScript loader. On 2026-10-27 `vercel build` (CLI 65.4.0, run offline) showed that it keeps import
 * paths as written, so `import '../server/x.ts'` fails at runtime with ERR_MODULE_NOT_FOUND unless tsconfig sets
 * `rewriteRelativeImportExtensions` (docs/AI_SETUP.md). This test repeats that build in miniature, file by file with the
 * TypeScript compiler, then imports each emitted function in a separate plain-Node process and calls it.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = join(ROOT, 'tmp', 'fn-build');

function compilerOptions(): ts.CompilerOptions {
  const cfg = ts.readConfigFile(join(ROOT, 'tsconfig.json'), (p) => ts.sys.readFile(p));
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
  return { ...parsed.options, noEmit: false, sourceMap: false, declaration: false };
}

function emitGraph(entries: string[], opts: ts.CompilerOptions): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) queue.push(resolve(dirname(file), m[1]));
    const out = ts.transpileModule(src, { compilerOptions: opts, fileName: file });
    const dest = join(OUT, relative(ROOT, file)).replace(/\.ts$/, '.js');
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, out.outputText);
  }
  return [...seen];
}

describe('the api/ functions as Vercel builds them', () => {
  it('tsconfig rewrites relative .ts imports on emit', () => {
    expect(compilerOptions().rewriteRelativeImportExtensions).toBe(true);
  });

  it('every function file imports only the shared wiring, and exports a fetch handler and a Node.js config', () => {
    const files = readdirSync(join(ROOT, 'api')).filter((f) => f.endsWith('.ts'));
    expect(files.sort()).toEqual(['ai-metrics.ts', 'ai-status.ts', 'interpret-belief.ts', 'interpret-reality.ts', 'npc-decision.ts', 'session.ts']);
    for (const f of files) {
      const src = readFileSync(join(ROOT, 'api', f), 'utf8');
      expect([...src.matchAll(/from '([^']+)'/g)].map((m) => m[1])).toEqual(['../server/ai/vercel.ts']);
      expect(src).toMatch(/export const config = \{ runtime: 'nodejs', maxDuration: \d+ \};/);
      expect(src).toMatch(/export default handler\('[a-z-]+'\);/);
    }
  });

  it('emits a module graph that plain Node can load, and the functions answer without any configuration', () => {
    rmSync(OUT, { recursive: true, force: true });
    const entries = readdirSync(join(ROOT, 'api')).filter((f) => f.endsWith('.ts')).map((f) => join(ROOT, 'api', f));
    const emitted = emitGraph(entries, compilerOptions());
    expect(emitted.length).toBeGreaterThan(10);
    for (const f of emitted.map((x) => join(OUT, relative(ROOT, x)).replace(/\.ts$/, '.js'))) expect(readFileSync(f, 'utf8')).not.toMatch(/from\s+['"]\.{1,2}\/[^'"]+\.ts['"]/);
    const script = `
      const routes = { 'ai-status': ['GET', null], 'session': ['POST', '{"consent":true}'], 'interpret-belief': ['POST', '{}'], 'interpret-reality': ['POST', '{}'], 'npc-decision': ['POST', '{}'], 'ai-metrics': ['GET', null] };
      const out = {};
      for (const [route, [method, body]] of Object.entries(routes)) {
        const mod = await import(new URL('./api/' + route + '.js', ${JSON.stringify('file://' + OUT + '/')}).href);
        const res = await mod.default.fetch(new Request('http://localhost/api/' + route, { method, body, headers: body ? { 'content-type': 'application/json', origin: 'http://localhost' } : {} }));
        out[route] = [res.status, (await res.json()).reason ?? null, mod.config.runtime];
      }
      console.log(JSON.stringify(out));`;
    // a clean environment: no key, no store, no secret (the functions must still answer, honestly)
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, env: { PATH: process.env.PATH ?? '' }, encoding: 'utf8', timeout: 60_000 });
    expect(JSON.parse(stdout.trim().split('\n').pop()!)).toEqual({
      'ai-status': [200, 'disabled', 'nodejs'],
      session: [503, 'disabled', 'nodejs'],
      'interpret-belief': [503, 'disabled', 'nodejs'],
      'interpret-reality': [503, 'disabled', 'nodejs'],
      'npc-decision': [503, 'disabled', 'nodejs'],
      'ai-metrics': [404, 'not_found', 'nodejs'],
    });
  }, 90_000);
});
