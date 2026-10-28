import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Secret scan (phase 15). Fails when a credential-shaped value is in a tracked file, in any line added by a commit reachable from
 * HEAD (`--history`), or in the built site (`dist/`, when it exists); when an env file other than `.env.example` is tracked or
 * `.gitignore` stops ignoring them; or when a `VITE_` variable names a key, token or secret (Vite puts every `VITE_` value into the
 * bundle every visitor downloads). It names the file, line and rule, never the value. A deliberate fake in a test carries
 * `scan-secrets: fake` on its line. Usage: `npm run scan:secrets [-- --history] [-- --dist]`; CI runs both.
 */

export interface Rule {
  id: string;
  re: RegExp;
}

/** Credential names this project reads (server/ai/config.ts) and a few it must never hold a value for. */
const CREDENTIAL_NAMES = ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'BE_SESSION_SECRET', 'BE_ADMIN_TOKEN', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];

export const RULES: Rule[] = [
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/ },
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/ },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: 'openai-key', re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/ },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}/ },
  { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { id: 'stripe-key', re: /\b[rs]k_live_[0-9A-Za-z]{20,}/ },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  // a credential name given a literal value: `AI_GATEWAY_API_KEY=abc...`, `BE_ADMIN_TOKEN: "abc..."`
  { id: 'credential-value', re: new RegExp(`\\b(?:${CREDENTIAL_NAMES.join('|')})\\s*[=:]\\s*['"\`]?[A-Za-z0-9_\\-./+=]{16,}`) },
  { id: 'vite-secret', re: /\bVITE_[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|GATEWAY|OPENAI|ANTHROPIC)[A-Z0-9_]*/ },
];

const FAKE = 'scan-secrets: fake';
/** A value assigned to a credential name in a test fixture says so ("test-admin-token-..."): not a secret. */
const FIXTURE_VALUE = /test|fake|example|dummy|placeholder|sample|changeme/i;

export interface Finding {
  where: string;
  line: number;
  rule: string;
}

/** The rules a piece of text breaks, line by line; a line marked as a deliberate fake is skipped. */
export function scanText(text: string, where: string): Finding[] {
  const out: Finding[] = [];
  text.split('\n').forEach((line, i) => {
    if (line.includes(FAKE)) return;
    for (const r of RULES) {
      const m = r.re.exec(line);
      if (m && !(r.id === 'credential-value' && FIXTURE_VALUE.test(m[0].replace(/^[A-Z_]+\s*[=:]\s*/, '')))) out.push({ where, line: i + 1, rule: r.id });
    }
  });
  return out;
}

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/** Text files only: anything with a NUL byte in its first 8 KB is binary (images, fonts, audio). */
function readText(path: string): string | null {
  const buf = readFileSync(path);
  if (buf.subarray(0, 8192).includes(0)) return null;
  return buf.toString('utf8');
}

export function scanTree(): Finding[] {
  const out: Finding[] = [];
  for (const f of git('ls-files', '-z').split('\0').filter(Boolean)) {
    const name = f.split('/').pop()!;
    if (/^\.env(\..+)?$/.test(name) && name !== '.env.example') out.push({ where: f, line: 0, rule: 'tracked-env-file' });
    const p = join(root, f);
    if (!existsSync(p) || !statSync(p).isFile()) continue;
    const text = readText(p);
    if (text !== null) out.push(...scanText(text, f));
  }
  const ignore = existsSync(join(root, '.gitignore')) ? readFileSync(join(root, '.gitignore'), 'utf8').split('\n').map((l) => l.trim()) : [];
  if (!ignore.includes('.env') || !ignore.includes('.env.*')) out.push({ where: '.gitignore', line: 0, rule: 'env-not-ignored' });
  return out;
}

/** Every line added by every commit reachable from HEAD (a secret committed and then deleted is still in the history). */
export function scanHistory(): Finding[] {
  const out: Finding[] = [];
  let commit = '';
  let file = '';
  let line = 0;
  // inside a hunk every line carries a one-character prefix, so an added line that itself starts with "++ " is content, not a header
  let inHunk = false;
  for (const l of git('log', '-p', '--no-color', '--no-ext-diff', '--format=commit %H', 'HEAD').split('\n')) {
    if (!inHunk && l.startsWith('commit ')) commit = l.slice(7, 19);
    else if (l.startsWith('diff --git ')) inHunk = false;
    else if (!inHunk && l.startsWith('+++ ')) file = l.slice(6);
    else if (l.startsWith('@@')) {
      inHunk = true;
      line = Number(/\+(\d+)/.exec(l)?.[1] ?? 0) - 1;
    } else if (inHunk && l.startsWith('commit ')) {
      inHunk = false;
      commit = l.slice(7, 19);
    } else if (inHunk && l.startsWith('+')) {
      line++;
      for (const f of scanText(l.slice(1), `${commit}:${file}`)) out.push({ ...f, line });
    } else if (!l.startsWith('-')) line++;
  }
  return out;
}

/** The built site, when there is one: nothing in it may name or hold a credential. */
export function scanDist(): Finding[] {
  const dir = join(root, 'dist');
  if (!existsSync(dir)) return [];
  const out: Finding[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const text = readText(p);
        if (text === null) continue;
        out.push(...scanText(text, relative(root, p)));
        for (const n of CREDENTIAL_NAMES) if (text.includes(n)) out.push({ where: relative(root, p), line: 0, rule: `credential-name:${n}` });
      }
    }
  };
  walk(dir);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const findings = [...scanTree(), ...(args.includes('--history') ? scanHistory() : []), ...(args.includes('--dist') ? scanDist() : [])];
  const scope = ['tracked files', args.includes('--history') ? 'every commit reachable from HEAD' : null, args.includes('--dist') ? (existsSync(join(root, 'dist')) ? 'dist/' : 'dist/ (not built: skipped)') : null].filter(Boolean).join(', ');
  if (!findings.length) {
    console.log(`scan-secrets: clean (${scope}; ${RULES.length} rules)`);
    process.exit(0);
  }
  for (const f of findings) console.log(`${f.where}${f.line ? `:${f.line}` : ''}  ${f.rule}`);
  console.log(`scan-secrets: ${findings.length} finding(s) in ${scope}. Values are not printed. Remove the secret (and rotate it if it was ever real); mark a deliberate test fake with "${FAKE}".`);
  process.exit(1);
}
