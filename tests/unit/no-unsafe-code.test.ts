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
const shipped = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'server')), ...files(join(ROOT, 'api')), ...files(join(ROOT, 'mcp'))];
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
  const strip = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('reads no provider key and no environment in the code the browser runs, and no build-time setting beyond Vite\'s own', () => {
    for (const f of browser) {
      const src = readFileSync(f, 'utf8');
      expect(/API_KEY|SECRET|OIDC|UPSTASH|KV_REST|process\.env/.test(strip(src)), `${relative(ROOT, f)} reads a key or the environment`).toBe(false);
      for (const m of src.matchAll(/import\.meta\.env\.(\w+)/g)) expect(['DEV', 'PROD', 'MODE', 'BASE_URL'], `${relative(ROOT, f)} reads import.meta.env.${m[1]}`).toContain(m[1]);
    }
  });

  it('never imports the server, the AI SDK or the schema library into the browser', () => {
    for (const f of browser) {
      for (const m of readFileSync(f, 'utf8').matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1];
        expect(/(^|\/)server\/|^ai($|\/)|^@ai-sdk\/|^zod$|^@vercel\//.test(spec), `${relative(ROOT, f)} imports ${spec}`).toBe(false);
      }
    }
  });

  it('reads credentials in exactly one place: the server configuration, from its environment', () => {
    const names = ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'BE_SESSION_SECRET', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN', 'BE_ADMIN_TOKEN'];
    for (const f of shipped) {
      const code = strip(readFileSync(f, 'utf8'));
      const rel = relative(ROOT, f);
      if (rel === join('server', 'ai', 'config.ts')) continue;
      for (const n of names) expect(code.includes(`'${n}'`) || code.includes(`.${n}`), `${rel} reads ${n} itself`).toBe(false);
      // in the inference service the environment object is handed to the configuration loader, never read field by field elsewhere
      const unix = rel.replaceAll('\\', '/');
      if (/^(server|api)\//.test(unix) && /process\.env/.test(code)) expect(['server/ai/vercel.ts', 'server/ai/dev-server.ts'], `${rel} reads process.env`).toContain(unix);
    }
    // no key-shaped literal anywhere in tracked source
    for (const f of shipped) expect(/\b(sk|pk)-[A-Za-z0-9_-]{16,}/.test(readFileSync(f, 'utf8')), `${relative(ROOT, f)} contains a key-shaped string`).toBe(false);
  });

  it('documents variable names only, and git ignores every real environment file', () => {
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
    for (const line of example.split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      expect(line, `.env.example sets a value: ${line}`).toMatch(/^[A-Z][A-Z0-9_]*=$/);
    }
    expect(example).toContain('AI_GATEWAY_API_KEY=');
    const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n');
    for (const rule of ['.env', '.env.*', '!.env.example', '.vercel']) expect(ignore, `.gitignore lacks ${rule}`).toContain(rule);
  });
});
