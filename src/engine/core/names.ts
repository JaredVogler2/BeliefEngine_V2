/** Honorifics that are part of how a villager is called: "Brother Anselm", not "Brother". */
const TITLES = new Set(['Old', 'Dr.', 'Brother', 'Sister', 'Granny', 'Mother', 'Father', 'Captain', 'Widow']);

/** The short form used in sentences: the first name, or the title and name when the first word is only a title. */
export function firstName(name: string): string {
  const t = name.split(' ');
  return t.length > 1 && TITLES.has(t[0]) ? `${t[0]} ${t[1]}` : t[0];
}
