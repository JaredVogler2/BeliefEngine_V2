import type { RunState } from '../engine/index.ts';
import { firstName, influenceRanks, previewAction } from '../engine/index.ts';
import { K } from '../engine/social/persuasion.ts';
import type { UiState } from './store.ts';

export interface TutorialStep {
  step: number;
  total: number;
  title: string;
  text: string;
  hintVillagers: string[];
  hintClaims: boolean;
}

const TOTAL = 5;

interface Guide {
  id: string;
  name: string;
  role: string;
  first: string;
  second?: string;
  /** conviction this villager would hold after the first Tell, per villager id */
  reach: Map<string, number>;
}

const cache = new WeakMap<RunState, Guide>();

/**
 * The villager the coach points at. Not the most influential person the Keeper trusts: the most influential one whose first
 * Tell would actually leave them holding the story firmly enough (K.SPREAD) to repeat it overnight. On the Harvest chapter
 * the old rule picked a farmer who ended at 11 of the 12 needed, so the tutorial's own first move spread to nobody.
 */
function guideFor(s: RunState): Guide {
  const hit = cache.get(s);
  if (hit) return hit;
  const ranks = influenceRanks(s);
  const claim = s.starter ?? s.scn.starters[0];
  const reach = new Map<string, number>();
  const alive = s.villagers.filter((v) => v.status !== 'dead');
  for (const v of alive) {
    const p = previewAction(s, { type: 'SEED', claim, target: v.id });
    reach.set(v.id, p.ok ? (p.deltas.find((d) => d.id === v.id)?.after ?? 0) : 0);
  }
  const byRank = (a: { id: string }, b: { id: string }) => (ranks.get(a.id) ?? 99) - (ranks.get(b.id) ?? 99);
  const trusted = alive.filter((v) => v.keeperTrust >= 40).sort(byRank);
  const spreads = trusted.filter((v) => (reach.get(v.id) ?? 0) >= K.SPREAD);
  const pool = spreads.length ? spreads : alive.filter((v) => (reach.get(v.id) ?? 0) >= K.SPREAD).sort(byRank);
  const g = pool[0] ?? trusted[0] ?? s.villagers[0];
  const second = pool.find((v) => v.id !== g.id) ?? trusted.find((v) => v.id !== g.id);
  const out: Guide = { id: g.id, name: g.name, role: g.role.toLowerCase(), first: firstName(g.name), second: second?.id, reach };
  cache.set(s, out);
  return out;
}

/** The coach is derived from game state, so it can never get out of sync with what the player actually did. */
export function getTutorial(s: RunState, ui: UiState): TutorialStep | null {
  if (ui.tutorialDone || s.outcome) return null;
  if (s.day > 3) return null;
  if (s.starter === null) {
    const days = [...new Set(s.scn.claimDefs.filter((c) => !c.rival && c.unlockDay !== undefined).map((c) => c.unlockDay as number))].sort((a, b) => a - b);
    const later = days.length ? ` The others unlock on day ${days.join(' and ')}.` : '';
    return {
      step: 1,
      total: TOTAL,
      title: 'Choose a story',
      text: `You cannot move the river, but a story the village believes can. Read the cards, then tap the story you want to tell first.${later} You can undo until you end the day.`,
      hintVillagers: [],
      hintClaims: true,
    };
  }
  const guide = guideFor(s);
  const picked = ui.selection?.kind === 'villager' ? s.villagers.find((v) => v.id === ui.selection!.id) : undefined;
  if (s.stats.seeds === 0 && !picked)
    return { step: 2, total: TOTAL, title: 'Find who people listen to', text: `Tap ${guide.name}, the ${guide.role}. People listen to ${guide.first}, and ${guide.first} trusts you.`, hintVillagers: [guide.id, ...(guide.second ? [guide.second] : [])], hintClaims: false };
  if (s.stats.seeds === 0 && picked) {
    const first = firstName(picked.name);
    const reach = guide.reach.get(picked.id) ?? 0;
    const caveat = reach < K.SPREAD ? ` ${first} would hold it at only ${Math.round(reach)}, and people repeat a story at ${K.SPREAD} or more, so it would stop with them. ${picked.id === guide.id ? '' : `${guide.first} is a better first choice.`}` : '';
    return {
      step: 3,
      total: TOTAL,
      title: 'Tell them',
      text: `Press “Tell ${first}” in the panel. Watch their conviction jump. That costs 1 Influence, and you have ${s.apPerDay} a day.${caveat}`,
      hintVillagers: reach < K.SPREAD && picked.id !== guide.id ? [guide.id] : [picked.id],
      hintClaims: false,
    };
  }
  if (s.day === 1)
    return { step: 4, total: TOTAL, title: 'Let it travel', text: 'Spend what you like, then press End Day. Overnight the story passes along ties of trust, only between people who can reach each other. The morning report says who it reached.', hintVillagers: s.villagers.filter((v) => v.status !== 'dead' && v.id !== guide.id).sort((a, b) => b.keeperTrust - a.keeperTrust).slice(0, 3).map((v) => v.id), hintClaims: false };
  if (s.day <= 3 && s.stats.rituals === 0)
    return { step: 5, total: TOTAL, title: 'Proof beats repetition', text: 'Open the Laws tab to watch support climb. Past the line, the story becomes law. Skeptics need to see proof: try a ritual at a landmark on a good-omen night.', hintVillagers: [], hintClaims: false };
  return null;
}
