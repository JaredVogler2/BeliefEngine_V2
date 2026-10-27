/** localStorage wrappers that never throw (private windows, quota, disabled storage). */
const mem = new Map<string, string>();
let storageOk: boolean | null = null;

export function storageAvailable(): boolean {
  if (storageOk !== null) return storageOk;
  try {
    const k = '__be_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    storageOk = true;
  } catch {
    storageOk = false;
  }
  return storageOk;
}

export function readKey(key: string): string | null {
  try {
    if (storageAvailable()) return window.localStorage.getItem(key);
  } catch {
    /* fall through */
  }
  return mem.get(key) ?? null;
}

export function writeKey(key: string, value: string): boolean {
  try {
    if (storageAvailable()) {
      window.localStorage.setItem(key, value);
      return true;
    }
  } catch {
    /* quota or blocked: keep in memory so the session still works */
  }
  mem.set(key, value);
  return false;
}

export function removeKey(key: string): void {
  mem.delete(key);
  try {
    if (storageAvailable()) window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  save: 'be:save:v1',
  settings: 'be:settings:v1',
  progress: 'be:progress:v1',
  progress2: 'be:progress:v2',
  seen: 'be:seen:v1',
};

export interface Settings {
  sfx: boolean;
  music: boolean;
  sfxVolume: number;
  musicVolume: number;
  reducedMotion: boolean;
  textScale: 'compact' | 'default' | 'large';
  highContrast: boolean;
  tutorial: boolean;
  showFlood: boolean;
  quality: 'auto' | 'high' | 'low';
}

export const DEFAULT_SETTINGS: Settings = {
  sfx: true, music: true, sfxVolume: 0.7, musicVolume: 0.35, reducedMotion: false, textScale: 'default', highContrast: false, tutorial: true, showFlood: true, quality: 'auto',
};

export function loadSettings(): Settings {
  const raw = readKey(KEYS.settings);
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const base: Settings = { ...DEFAULT_SETTINGS, reducedMotion: !!prefersReduced };
  if (!raw) return base;
  try {
    const p = JSON.parse(raw) as Partial<Settings>;
    return { ...base, ...p };
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings): void {
  writeKey(KEYS.settings, JSON.stringify(s));
}
