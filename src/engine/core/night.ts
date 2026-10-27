import { allClaimDefs, claimDef, findVillager } from './lookup.ts';
import { firstName } from './names.ts';
import { K } from '../social/persuasion.ts';
import type { DaySummary, GameEvent, RunState } from './types.ts';

/**
 * What the morning digest says. It is derived from the night's events and the state after them and is never stored, so it
 * cannot change a replay or a save. The point is the first thing a new player does (tell one person, end the day): the old
 * digest listed only headline events and answered "A quiet night" even when four people had changed their minds.
 */
export interface NightReport {
  headline: string;
  /** what happened to the Keeper's own stories overnight, in plain words (empty when nothing was told or moved) */
  story: string[];
  /** the headline events of the night (importance 2 and above) */
  lines: GameEvent[];
}

const first = firstName;
const joinNames = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function nightReport(s: RunState, events: GameEvent[], summary: DaySummary): NightReport {
  const lines = events.filter((e) => e.importance >= 2).slice(0, 14);
  const story: string[] = [];
  const keepers = new Set(allClaimDefs(s).filter((c) => !c.rival).map((c) => c.id));

  // who was reached tonight, per story
  const moved = new Map<string, { target: string; from: number; to: number; actor?: string }[]>();
  for (const e of events) {
    if (e.code !== 'BELIEF_SHIFT' || !e.claim || !e.target || !keepers.has(e.claim) || !e.delta?.conviction) continue;
    const [from, to] = e.delta.conviction;
    if (to <= from) continue;
    const list = moved.get(e.claim) ?? [];
    list.push({ target: e.target, from, to, actor: e.actor });
    moved.set(e.claim, list);
  }

  // what the Keeper did today, to explain a silence
  const today = s.history.find((h) => h.day === summary.day)?.actions ?? [];
  const toldClaims = new Map<string, string[]>();
  for (const a of today) {
    if ((a.type === 'SEED' || a.type === 'MESSENGER') && keepers.has(a.claim)) {
      const who = a.type === 'SEED' ? a.target : a.to;
      toldClaims.set(a.claim, [...(toldClaims.get(a.claim) ?? []), who]);
    } else if ((a.type === 'GATHER' || a.type === 'RITUAL') && a.claim && keepers.has(a.claim)) toldClaims.set(a.claim, toldClaims.get(a.claim) ?? []);
  }

  for (const [claim, list] of [...moved.entries()].sort((x, y) => y[1].length - x[1].length)) {
    const name = (id: string) => first(findVillager(s, id)?.name ?? id);
    const carriers = [...new Set(list.map((m) => m.actor).filter((x): x is string => !!x && !!findVillager(s, x)))];
    const reached = list.slice().sort((a, b) => b.to - b.from - (a.to - a.from));
    const shown = reached.slice(0, 3).map((m) => `${name(m.target)} (${Math.round(m.from)}→${Math.round(m.to)})`);
    const more = reached.length - shown.length;
    const carried = carriers.length === 0 ? '' : ` Carried by ${carriers.length <= 2 ? joinNames(carriers.map(name)) : `${carriers.slice(0, 2).map(name).join(', ')} and ${carriers.length - 2} more`}.`;
    story.push(`“${claimDef(s, claim).short}” travelled along ties of trust and reached ${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}.${carried}`);
    const alive = s.villagers.filter((v) => v.status !== 'dead');
    const repeating = alive.filter((v) => (v.beliefs[claim]?.conv ?? 0) >= K.SPREAD).length;
    const heard = alive.filter((v) => (v.beliefs[claim]?.conv ?? 0) > 0 && (v.beliefs[claim]?.conv ?? 0) < K.SPREAD).length;
    story.push(`${repeating} ${repeating === 1 ? 'villager now repeats' : 'villagers now repeat'} it${heard ? `; ${heard} more ${heard === 1 ? 'has' : 'have'} only heard it` : ''}.`);
  }

  // told, but nothing moved: say why instead of "a quiet night"
  for (const [claim, who] of toldClaims) {
    if (moved.has(claim)) continue;
    const alive = s.villagers.filter((v) => v.status !== 'dead');
    const repeating = alive.filter((v) => (v.beliefs[claim]?.conv ?? 0) >= K.SPREAD);
    const target = who.map((id) => findVillager(s, id)).find((v) => v && v.status !== 'dead');
    const short = claimDef(s, claim).short;
    if (repeating.length === 0 && target) {
      const conv = Math.round(target.beliefs[claim]?.conv ?? 0);
      story.push(
        conv >= K.SPREAD
          ? `“${short}” stayed with ${first(target.name)} (${conv}). Nobody else met them in a mood to talk tonight: stories travel by chance along ties of trust, so tell a second person or tell someone with more friends.`
          : `“${short}” stayed with ${first(target.name)}, who holds it at only ${conv}. People repeat a story once they hold it at ${K.SPREAD} or more, so ${first(target.name)} kept it to themselves. Tell someone who trusts you more, or tell them again.`,
      );
    } else if (repeating.length > 0) {
      story.push(`“${short}” did not reach anyone new tonight. ${joinNames(repeating.slice(0, 2).map((v) => first(v.name)))} ${repeating.length === 1 ? 'holds' : 'hold'} it and may pass it on tomorrow.`);
    }
  }

  const quiet = summary.headline === 'A quiet night.';
  const headline = quiet && story.length ? (moved.size > 0 ? 'Your story is spreading.' : 'Your story has not caught on yet.') : summary.headline;
  return { headline, story, lines };
}
