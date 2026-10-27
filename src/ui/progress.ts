import { applyRun, emptyProgress, exportProgress, importProgress } from '../engine/index.ts';
import type { Progress, RunReward, RunRecord, RunState } from '../engine/index.ts';
import { KEYS, readKey, removeKey, writeKey } from './persist.ts';

/** Local progress archive (schema v2). Never leaves the device. v1 archives are migrated on first read. */

let cache: Progress | null = null;

function readV2(): Progress | null {
  const raw = readKey(KEYS.progress2);
  if (!raw) return null;
  const r = importProgress(raw);
  return r.ok ? r.progress : null;
}

export function loadProgress(): Progress {
  if (cache) return cache;
  let p = readV2();
  if (!p) {
    const old = readKey(KEYS.progress);
    if (old) {
      const r = importProgress(old);
      if (r.ok) {
        p = r.progress;
        writeKey(KEYS.progress2, exportProgress(p));
      }
    }
  }
  cache = p ?? emptyProgress();
  return cache;
}

function save(p: Progress): void {
  cache = p;
  writeKey(KEYS.progress2, exportProgress(p));
}

/** Fold a finished run into the archive; returns what it earned. Best-effort: archive trouble never blocks the game. */
export function recordRun(s: RunState, debug: boolean): RunReward | null {
  if (!s.outcome) return null;
  const reward = applyRun(loadProgress(), s, { debug, finishedAt: new Date().toISOString() });
  if (!reward.duplicate) save(reward.progress);
  return reward;
}

export function resetProgress(): void {
  cache = emptyProgress();
  removeKey(KEYS.progress2);
  removeKey(KEYS.progress);
}

export function exportJson(): string {
  return exportProgress(loadProgress());
}

export function importJson(text: string): { ok: true; migrated: boolean; runs: number } | { ok: false; error: string } {
  const r = importProgress(text);
  if (!r.ok) return r;
  save(r.progress);
  return { ok: true, migrated: r.migrated, runs: r.progress.runs.length };
}

/** Best finished (non-debug) run for a daily date, or null. */
export function dailyBest(date: number): RunRecord | null {
  const runs = loadProgress().runs.filter((r) => r.mode === 'daily' && r.dailyDate === date && !r.debug);
  if (!runs.length) return null;
  return runs.reduce((b, r) => (r.result === b.result ? (r.score > b.score ? r : b) : r.result === 'victory' ? r : b));
}

/** Seeds of expeditions already finished on this device. */
export function playedExpeditionSeeds(): number[] {
  return loadProgress().runs.filter((r) => r.mode === 'expedition' && !r.debug).map((r) => r.seed);
}

export function clearProgressCache(): void {
  cache = null;
}
