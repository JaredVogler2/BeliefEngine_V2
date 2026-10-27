import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Phase 18, Journey B: an agent plays a whole game through the real MCP server and every guarantee holds (scripts/acceptance-b.ts). */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('acceptance: Journey B over the real MCP server', () => {
  it('passes every check: inspect, legal exact-cost play, rival counter, replay hashes, and refusals that change nothing', () => {
    const out = mkdtempSync(join(tmpdir(), 'be-acc-'));
    try {
      const r = spawnSync(process.execPath, ['--import', 'tsx', join(ROOT, 'scripts', 'acceptance-b.ts'), '--out', out], { cwd: ROOT, encoding: 'utf8', timeout: 150_000 });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const j = JSON.parse(readFileSync(join(out, 'journey-b.json'), 'utf8')) as { result: string; checks: { pass: boolean }[] };
      expect(j.result).toBe('PASS');
      expect(j.checks.length).toBeGreaterThanOrEqual(25);
      expect(j.checks.every((c) => c.pass)).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 180_000);
});
