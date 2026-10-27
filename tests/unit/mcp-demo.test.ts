import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The documented demo command works: a scripted agent plays a whole chapter through the real server and the browser engine agrees. */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('npm run mcp:demo', () => {
  it('plays a chapter to its end over stdio and its action log replays to identical hashes in the engine', () => {
    const out = mkdtempSync(join(tmpdir(), 'be-demo-'));
    try {
      const r = spawnSync(process.execPath, ['--import', 'tsx', join(ROOT, 'mcp', 'agent-demo.ts'), '--seed', '1', '--out', out], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toContain('IDENTICAL to the server');
      const trace = JSON.parse(readFileSync(join(out, 'demo-redbank-seed1.json'), 'utf8')) as { result: string; verification: { identical: boolean }; toolCalls: { tool: string }[] };
      expect(['victory', 'defeat']).toContain(trace.result);
      expect(trace.verification.identical).toBe(true);
      const tools = new Set(trace.toolCalls.map((c) => c.tool));
      for (const t of ['create_game', 'get_game_state', 'compare_possible_actions', 'take_action', 'end_day', 'get_results', 'export_replay']) expect(tools.has(t), t).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 150_000);
});
