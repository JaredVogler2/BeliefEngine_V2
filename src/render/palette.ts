export const TS = 32;

export const C = {
  ink: '#1b1410',
  parchment: '#f4ecd8',
  gold: '#f2b84b',
  ember: '#e8743b',
  emerald: '#3fb68b',
  river: '#4aa3df',
  danger: '#e5586a',
  violet: '#b48cff',
  night: '#0e1626',
};

export function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${Math.round(h)},${Math.round(s)}%,${Math.round(Math.max(0, Math.min(100, l)))}%,${a})`;
}

/** cheap deterministic per-tile noise in [0,1) */
export function nz(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const FACTION_COLORS: Record<string, string> = {
  council: '#d4a72c',
  scholars: '#5fa8d3',
  storykeepers: '#e07a5f',
  hearth: '#81b29a',
};

export const SKIN = ['#f1c9a5', '#e0ac85', '#c68a62', '#8d5a3c'];
export const HAIR = ['#2b1d14', '#6b4226', '#b5783a', '#d8c9a8', '#8a8a8a'];
export const ROOFS = ['#b5523b', '#7a4a3a', '#4f6d7a', '#8c5a2b', '#6b5b95', '#9c4a4a', '#3e6b5a'];

/** conviction -> ring colour (negative magenta-red, zero slate, positive gold) */
export function convColor(conv: number): string {
  if (conv >= 0) {
    const t = Math.min(1, conv / 80);
    return `rgb(${Math.round(120 + 122 * t)},${Math.round(130 + 54 * t)},${Math.round(150 - 75 * t)})`;
  }
  const t = Math.min(1, -conv / 60);
  return `rgb(${Math.round(120 + 110 * t)},${Math.round(130 - 60 * t)},${Math.round(150 - 20 * t)})`;
}

export function trustColor(t: number, a = 1): string {
  return t >= 0 ? `rgba(120,220,170,${a})` : `rgba(240,110,130,${a})`;
}
