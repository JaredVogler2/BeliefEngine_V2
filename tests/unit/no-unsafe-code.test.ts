import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Phase 18, data integrity and security: nothing a player, an agent or a model writes is ever executed, and no secret can be in the
 * browser build. These are source-level guards (cheap and exact); the behavioural proofs are in nl-compose, nl-llm and the CSP check
 * in `npm run verify:hosting`.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const shipped = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'server')), ...files(join(ROOT, 'mcp'))];
const browser = files(join(ROOT, 'src'));

describe('no code is ever built from text', () => {
  it('has no eval, Function constructor, string timers, raw HTML injection or document.write in anything that ships', () => {
    const banned: [RegExp, string][] = [
      [/\beval\s*\(/, 'eval('],
      [/new\s+Function\s*\(/, 'new Function('],
      [/\bFunction\s*\(\s*['"`]/, 'Function("...")'],
      [/set(Timeout|Interval)\s*\(\s*['"`]/, 'setTimeout("string")'],
      [/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML'],
      [/\.innerHTML\s*=/, 'innerHTML ='],
      [/\.outerHTML\s*=/, 'outerHTML ='],
      [/document\.write\s*\(/, 'document.write('],
      [/\bvm\.(runIn|Script)/, 'node:vm'],
    ];
    for (const f of shipped) {
      const src = readFileSync(f, 'utf8');
      for (const [re, what] of banned) expect(re.test(src), `${relative(ROOT, f)} contains ${what}`).toBe(false);
    }
  });
});

describe('no secret can reach the browser build', () => {
  it('reads no provider key and no environment in the code the browser runs; the only build-time setting is the optional interpreter URL', () => {
    for (const f of browser) {
      const src = readFileSync(f, 'utf8');
      expect(/API_KEY|SECRET|process\.env/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), `${relative(ROOT, f)} reads a key or the environment`).toBe(false);
      for (const m of src.matchAll(/import\.meta\.env\.(\w+)/g)) expect(['VITE_INTERPRETER_URL', 'DEV', 'PROD', 'MODE', 'BASE_URL'], `${relative(ROOT, f)} reads import.meta.env.${m[1]}`).toContain(m[1]);
    }
  });

  it('keeps the provider key in the server-side adapter only, read from its environment, and puts none in the proxy, the browser code or the MCP server', () => {
    const adapter = readFileSync(join(ROOT, 'server', 'vercel-function.example.ts'), 'utf8');
    expect(adapter).toContain('process.env.INTERPRETER_API_KEY');
    for (const f of shipped.filter((x) => x !== join(ROOT, 'server', 'vercel-function.example.ts'))) {
      const code = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code.includes('INTERPRETER_API_KEY'), `${relative(ROOT, f)} reads the provider key`).toBe(false);
    }
    // no key-shaped literal anywhere in tracked source
    for (const f of shipped) expect(/\b(sk|pk)-[A-Za-z0-9_-]{16,}/.test(readFileSync(f, 'utf8')), `${relative(ROOT, f)} contains a key-shaped string`).toBe(false);
  });
});
