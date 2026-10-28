import { describe, expect, it } from 'vitest';
import { RULES, scanText, scanTree } from '../../scripts/scan-secrets.ts';

/**
 * Phase 15: the secret scan CI runs (`npm run scan:secrets -- --history --dist`). Planted values are assembled at run time, so this
 * file never holds one itself.
 */

const r = (n: number, c = 'a') => c.repeat(n);
const PLANTED: [string, string][] = [
  ['private-key', `-----BEGIN ${'RSA '}PRIVATE KEY-----`],
  ['aws-access-key', `${'AKIA'}${r(16, 'Q')}`],
  ['github-token', `${'ghp_'}${r(36)}`],
  ['anthropic-key', `${'sk-'}ant-${r(30)}`],
  ['openai-key', `${'sk-'}proj-${r(40)}`],
  ['google-api-key', `${'AIza'}${r(35)}`],
  ['slack-token', `${'xoxb'}-${r(20, '1')}`],
  ['stripe-key', `${'sk_'}live_${r(24)}`],
  ['jwt', `${'eyJ'}${r(20)}.${'eyJ'}${r(20)}.${r(20)}`],
  ['credential-value', `${'AI_GATEWAY'}_API_KEY=${r(32, 'Z')}`],
  ['vite-secret', `${'VITE_'}AI_GATEWAY_API_KEY`],
];

describe('secret scan', () => {
  it('names every planted credential by rule and line, and never prints the value', () => {
    for (const [rule, value] of PLANTED) {
      const f = scanText(`const ok = 1;\nconst x = "${value}";`, 'planted.ts');
      expect(f.map((x) => x.rule), rule).toContain(rule);
      expect(f.find((x) => x.rule === rule)!.line).toBe(2);
      expect(JSON.stringify(f)).not.toContain(value);
    }
    expect(new Set(PLANTED.map(([id]) => id))).toEqual(new Set(RULES.map((x) => x.id)));
  });

  it('lets a marked fake and a self-describing fixture value through, and ordinary code and prose', () => {
    expect(scanText(`const k = "${'sk-'}ant-${r(30)}"; // scan-secrets: fake`, 'x.ts')).toEqual([]);
    expect(scanText(`${'BE_ADMIN'}_TOKEN: 'test-admin-token-0123456789abcdef'`, 'x.ts')).toEqual([]);
    expect(scanText('Never put provider credentials in VITE_ variables; AI_GATEWAY_API_KEY= stays empty in .env.example.', 'x.md')).toEqual([]);
    expect(scanText('const k = process.env.AI_GATEWAY_API_KEY ?? null;', 'x.ts')).toEqual([]);
  });

  it('the repository as committed is clean: no credential-shaped value, no tracked env file, env files ignored', () => {
    expect(scanTree()).toEqual([]);
  });
});
