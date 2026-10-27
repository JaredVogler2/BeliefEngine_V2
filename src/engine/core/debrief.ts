import { aliveCount, homesStanding } from '../world/economy.ts';
import { claimDef, findVillager } from './lookup.ts';
import type { GameEvent, RunState } from './types.ts';

export interface ChainStep {
  id: number;
  day: number;
  text: string;
}

export interface Chain {
  title: string;
  kind: 'win' | 'loss' | 'rival';
  steps: ChainStep[];
}

export interface Debrief {
  result: 'victory' | 'defeat';
  headline: string;
  story: string;
  chains: Chain[];
  lost: { id: string; name: string; day: number; cause: string }[];
  saved: number;
  homesSpared: number;
  livesSpared: number;
  missed: string[];
  tips: string[];
  score: number;
  breakdown: Record<string, number>;
  medal: string;
  seedInfo: string;
}

function byId(s: RunState): Map<number, GameEvent> {
  return new Map(s.log.map((e) => [e.id, e]));
}

/** Walk cause links backwards (oldest first), bounded in depth and fan-out. */
function chainFor(index: Map<number, GameEvent>, ev: GameEvent, depth = 5): ChainStep[] {
  const steps: ChainStep[] = [];
  const seen = new Set<number>();
  let cur: GameEvent | undefined = ev;
  while (cur && steps.length < depth && !seen.has(cur.id)) {
    seen.add(cur.id);
    steps.push({ id: cur.id, day: cur.day, text: cur.text });
    const next: GameEvent | undefined = (cur.cause ?? []).map((id) => index.get(id)).find((e): e is GameEvent => !!e && !seen.has(e.id));
    cur = next;
  }
  return steps.reverse();
}

export function buildDebrief(s: RunState): Debrief {
  const out = s.outcome;
  if (!out) throw new Error('buildDebrief: the run is not over');
  const index = byId(s);
  const chains: Chain[] = [];
  const victory = out.result === 'victory';

  // how the world changed because of belief
  const activations = s.log.filter((e) => e.code === 'LAW_ACTIVATED');
  for (const a of activations.slice(0, 2)) {
    const spared = s.log.filter((e) => (e.code === 'HOME_SPARED' || e.code === 'LIFE_SPARED' || e.code === 'BRIDGE_HELD') && e.law === a.law);
    const steps = chainFor(index, a, 5);
    if (spared.length) {
      const homes = spared.filter((e) => e.code === 'HOME_SPARED').length;
      const lives = spared.filter((e) => e.code === 'LIFE_SPARED').length;
      const held = spared.some((e) => e.code === 'BRIDGE_HELD');
      const bits = [homes ? `${homes} home${homes === 1 ? '' : 's'} spared` : '', lives ? `${lives} ${lives === 1 ? 'life' : 'lives'} saved` : '', held ? 'the bridge held' : ''].filter(Boolean);
      steps.push({ id: spared[spared.length - 1].id, day: spared[spared.length - 1].day, text: `Result: ${bits.join(', ')}.` });
    }
    chains.push({ title: `How “${claimDef(s, a.claim ?? '').short}” changed the world`, kind: 'win', steps });
  }

  // what went wrong
  const deaths = s.log.filter((e) => e.code === 'DEATH');
  const collapse = s.log.find((e) => e.code === 'BRIDGE_COLLAPSED');
  const trapped = s.log.filter((e) => e.code === 'TRAPPED');
  if (deaths.length) {
    const steps: ChainStep[] = [];
    if (collapse) steps.push({ id: collapse.id, day: collapse.day, text: collapse.text });
    if (trapped.length) steps.push({ id: trapped[trapped.length - 1].id, day: trapped[trapped.length - 1].day, text: trapped[trapped.length - 1].text });
    steps.push(...deaths.slice(0, 3).map((e) => ({ id: e.id, day: e.day, text: e.text })));
    chains.push({ title: 'Why people were lost', kind: 'loss', steps });
  }
  const burned = s.log.filter((e) => e.code === 'FIELD_BURNED');
  if (burned.length) {
    const spark = s.log.find((e) => e.code === 'FIRE_STARTED' && e.id < burned[0].id);
    chains.push({ title: 'The price of fire', kind: 'loss', steps: [...(spark ? [{ id: spark.id, day: spark.day, text: spark.text }] : []), ...burned.slice(0, 2).map((e) => ({ id: e.id, day: e.day, text: e.text }))] });
  }
  const rival = s.log.filter((e) => e.code === 'RIVAL_CAMPAIGN' || e.code === 'RIVAL_REBUTTAL' || e.code === 'RIVAL_STANDS_DOWN').slice(0, 3);
  if (rival.length) chains.push({ title: 'The rival’s hand', kind: 'rival', steps: rival.map((e) => ({ id: e.id, day: e.day, text: e.text })) });

  const pensLost = s.log.filter((e) => e.code === 'LIVESTOCK_KILLED');
  if (pensLost.length) {
    const hungry = s.log.find((e) => e.code === 'PACK_STARVING');
    chains.push({ title: 'What the wolves took', kind: 'loss', steps: [...(hungry ? [{ id: hungry.id, day: hungry.day, text: hungry.text }] : []), ...pensLost.slice(0, 3).map((e) => ({ id: e.id, day: e.day, text: e.text }))] });
  }
  const slide = s.log.find((e) => e.code === 'RIVAL_SABOTAGE' || e.code === 'MUDSLIDE');
  const delayed = s.log.filter((e) => e.code === 'CARAVAN_DELAYED');
  if (slide && delayed.length) chains.push({ title: 'The road that closed', kind: 'rival', steps: [{ id: slide.id, day: slide.day, text: slide.text }, ...delayed.slice(0, 2).map((e) => ({ id: e.id, day: e.day, text: e.text }))] });
  const parched = s.log.filter((e) => e.code === 'FIELD_PARCHED' || e.code === 'FAMINE');
  if (parched.length && deaths.some((d) => /starv|hunger|famine/i.test(d.text))) {
    chains.push({ title: 'The hungry weeks', kind: 'loss', steps: [...parched.slice(0, 2), ...deaths.filter((d) => /starv|hunger|famine/i.test(d.text)).slice(0, 2)].map((e) => ({ id: e.id, day: e.day, text: e.text })) });
  }

  const lost = s.villagers.filter((v) => v.status === 'dead').map((v) => ({ id: v.id, name: v.name, day: v.deathDay ?? s.day, cause: v.deathCause ?? 'unknown' }));
  const alive = aliveCount(s);
  const homesSpared = s.stats.homesSpared;
  const livesSpared = s.stats.livesSaved;

  // what you might have missed
  const missed: string[] = [];
  const keeper = s.villagers.find((v) => v.role.toLowerCase().includes('bridge'));
  const mainClaims = s.scn.claimDefs.filter((c) => !c.rival).map((c) => c.id);
  const everBelieved = (vid: string) => mainClaims.some((c) => (findVillager(s, vid)?.beliefs[c]?.conv ?? 0) >= 30);
  if (keeper && !everBelieved(keeper.id) && s.scn.id === 'redbank') missed.push(`${keeper.name}, the bridgekeeper, never fully took up your story. She is tied to both banks — she could have carried it across.`);
  const skeptic = s.villagers.filter((v) => v.traits.skepticism >= 85 && v.status !== 'dead')[0];
  if (skeptic && !everBelieved(skeptic.id) && s.stats.rivalActions > 0) missed.push(`${skeptic.name} stayed a doubter and worked against you. A demonstration they personally watched on a good-omen night might have turned them.`);
  const ebb = s.threat.filter((t) => t.trend === 'ebbing').map((t) => t.day);
  const wasted = ebb.filter((d) => !s.history.some((h) => h.day === d && h.actions.some((a) => a.type === 'RITUAL' && a.claim)));
  if (s.stats.goodEvidence === 0 && wasted.length) missed.push(`You never staged proof on a good-omen night (days ${wasted.join(', ')}). Proof beats repetition.`);
  if (pensLost.length && !s.log.some((e) => e.code === 'PEN_SPARED')) missed.push(`The wolves took animals in ${pensLost.length} raid${pensLost.length === 1 ? '' : 's'} and no pen was ever shielded. A smoke fire beside a pen, in a hamlet that believes, would have turned them.`);
  if (s.log.some((e) => e.code === 'PACK_STARVING')) missed.push('A hungry pack stops being fooled by a decoy. Pair a decoy with a real smoke fire at the pens before the pack starves.');
  if (s.log.some((e) => e.code === 'SMOKE_SICKNESS')) missed.push('Smoke sickened people who stood in it. Keep fires away from the houses, or counter the cough before it spreads.');
  if (slide && delayed.length) missed.push('A caravan was delayed by a buried road. Challenge the rival’s plan on the day they announce it, and do not ring the bells while a shipment is on the road.');
  if (parched.length && !s.log.some((e) => e.code === 'CROP_BOOSTED') && !victory) missed.push('The fields dried out and nothing ever helped them grow. Rain and moonlight stories change the harvest, but only once enough neighbours believe.');
  if (s.scn.deals?.length && !s.log.some((e) => e.code === 'TRADE_AGREED') && !victory) missed.push(`You never asked ${findVillager(s, s.scn.deals[0].broker)?.name ?? 'the merchant'} for grain. A believer who can see the proof will open a caravan.`);
  if (collapse && trapped.length) missed.push(`The bridge fell on night ${collapse.day}, cutting off the east bank. A watched bridge (or an earlier evacuation) would have kept the way open.`);
  const unusedClaims = mainClaims.filter((c) => !s.stats.usedClaims.includes(c));
  if (unusedClaims.length && !victory) missed.push(`You never tried: ${unusedClaims.map((c) => `“${claimDef(s, c).short}”`).join(', ')}.`);
  const leftover = s.ap;
  if (leftover >= 3 && !victory) missed.push(`You ended with ${leftover} unspent Influence. It does not carry over past the cap.`);
  if (!missed.length) missed.push(victory ? 'Try a different route: the other stories change which villagers matter.' : 'Try again with a different story, or a different first target.');

  const tips = victory
    ? ['Replay the same seed with the other opening story: the people who matter will change.', 'Try finishing with every villager alive and no field burned.']
    : ['Replay the same seed: the flood, the omens and the rival will behave the same, so you can test a different plan.', 'Scout a villager to see exactly what they believe and why.'];

  const headline = victory ? `The village endures — ${alive} of ${s.villagers.length} saved` : `The village is lost — ${alive} of ${s.villagers.length} remain`;
  const lawName = activations[0] ? claimDef(s, activations[0].claim ?? '').short : null;
  const story = victory
    ? `${lawName ? `Because enough people believed “${lawName}”, ` : 'Without any law to lean on, '}the village survived ${s.scn.finale ?? 'the crisis'} with ${homesStanding(s)} homes and ${s.world.stocks.food ?? 0} food in store.${lost.length ? ` ${lost.length} ${lost.length === 1 ? 'person was' : 'people were'} lost.` : ' Nobody was lost.'}`
    : `${out.reason} ${lost.length ? `${lost.map((l) => l.name).slice(0, 4).join(', ')}${lost.length > 4 ? ' and others' : ''} did not survive.` : ''} ${lawName ? `“${lawName}” did take hold, but not in time or not enough.` : 'No story took hold in time.'}`;

  return {
    result: out.result, headline, story, chains, lost, saved: alive, homesSpared, livesSpared, missed, tips,
    score: out.score, breakdown: out.breakdown, medal: out.medal,
    seedInfo: `${s.scenarioId} · seed ${s.seed} · ${s.difficulty} · rules ${s.rulesVersion}`,
  };
}
