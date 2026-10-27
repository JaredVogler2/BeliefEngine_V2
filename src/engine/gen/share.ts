import { RULES_VERSION, type Difficulty } from '../core/types.ts';
import { GEN_VERSION, MAX_SEED } from './expedition.ts';
import { listScenarios } from '../content/registry.ts';
import { dailySeed } from './catalog.ts';

/**
 * Share links carry only a mode, a seed and the versions they were made with (never serialised state, never code).
 * Everything is validated before it is used; unknown or malformed values are rejected with a reason a person can read.
 */
export type ShareMode = 'story' | 'expedition' | 'daily';

export interface ShareDescriptor {
  mode: ShareMode;
  /** story chapters: the authored scenario id */
  scenario?: string;
  seed: number;
  /** daily village: the UTC date it was made for, YYYYMMDD */
  date?: number;
  difficulty: Difficulty;
  rules: string;
  gen: number;
}

export type ParseResult = { ok: true; descriptor: ShareDescriptor; notes: string[] } | { ok: false; error: string };

const DIFFS: Difficulty[] = ['story', 'normal', 'hard'];

/** YYYY-MM-DD -> YYYYMMDD if it is a real calendar date, else null. */
export function dateToNumber(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2024 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const dim = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d > dim[mo - 1]) return null;
  return y * 10000 + mo * 100 + d;
}

export function numberToDate(n: number): string {
  const y = Math.floor(n / 10000);
  const mo = Math.floor((n % 10000) / 100);
  const d = n % 100;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The UTC calendar date of an instant (the documented convention for the Daily Village). */
export function utcDateNumber(instant: Date): number {
  return instant.getUTCFullYear() * 10000 + (instant.getUTCMonth() + 1) * 100 + instant.getUTCDate();
}

export function encodeShare(d: ShareDescriptor): string {
  const p = new URLSearchParams();
  p.set('mode', d.mode);
  if (d.mode === 'story' && d.scenario) p.set('scn', d.scenario);
  if (d.mode === 'daily' && d.date) p.set('date', numberToDate(d.date));
  p.set('seed', String(d.seed));
  if (d.difficulty !== 'normal') p.set('diff', d.difficulty);
  p.set('rules', d.rules);
  p.set('gen', String(d.gen));
  return p.toString();
}

export function parseShare(search: string): ParseResult {
  let p: URLSearchParams;
  try {
    p = new URLSearchParams(search);
  } catch {
    return { ok: false, error: 'The link could not be read.' };
  }
  const mode = p.get('mode');
  if (mode !== 'story' && mode !== 'expedition' && mode !== 'daily') return { ok: false, error: 'The link does not name a game mode.' };
  const notes: string[] = [];
  const diffRaw = p.get('diff') ?? 'normal';
  if (!DIFFS.includes(diffRaw as Difficulty)) return { ok: false, error: 'The link names an unknown difficulty.' };
  const difficulty = (mode === 'daily' ? 'normal' : diffRaw) as Difficulty;
  const rules = p.get('rules') ?? '';
  if (rules && (rules.length > 24 || !/^[0-9A-Za-z._-]+$/.test(rules))) return { ok: false, error: 'The link has a malformed rules version.' };
  const genRaw = p.get('gen');
  const gen = genRaw === null ? GEN_VERSION : Number(genRaw);
  if (!Number.isInteger(gen) || gen < 0 || gen > 99) return { ok: false, error: 'The link has a malformed generator version.' };
  if (rules && rules !== RULES_VERSION) notes.push(`This link was made with rules ${rules}; you have ${RULES_VERSION}. The village may play a little differently.`);
  if (mode !== 'story' && gen !== GEN_VERSION) return { ok: false, error: `This village was made by generator version ${gen}, which this build no longer has (it has ${GEN_VERSION}).` };
  let scenario: string | undefined;
  let seed: number;
  let date: number | undefined;
  if (mode === 'daily') {
    const ds = p.get('date');
    const n = ds ? dateToNumber(ds) : null;
    if (n === null) return { ok: false, error: 'The link has no valid UTC date.' };
    date = n;
  }
  const sRaw = p.get('seed');
  if (sRaw !== null || mode !== 'daily') {
    if (sRaw === null || !/^\d{1,10}$/.test(sRaw)) return { ok: false, error: 'The link has no valid seed.' };
    seed = Number(sRaw);
    if (seed > MAX_SEED) return { ok: false, error: 'The seed is too large.' };
  } else {
    seed = dailySeed(date!);
  }
  if (mode === 'story') {
    scenario = p.get('scn') ?? p.get('scenario') ?? '';
    if (!listScenarios().some((s) => s.id === scenario)) return { ok: false, error: 'That chapter does not exist in this version.' };
  }
  return { ok: true, descriptor: { mode, scenario, seed, date, difficulty, rules: rules || RULES_VERSION, gen }, notes };
}
