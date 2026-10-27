import type { RunState } from '../core/types.ts';

/**
 * Atlas knowledge: things a player has *witnessed* the world do. A failed run teaches as much as a won one, so every entry is unlocked by
 * an event that really happened in a run, whatever the result.
 */
export interface KnowledgeDef {
  id: string;
  /** event codes that reveal it */
  codes: string[];
  title: string;
  text: string;
}

export const KNOWLEDGE: KnowledgeDef[] = [
  { id: 'rain_pools', codes: ['RAIN_DISPLACED'], title: 'Water moved is not water removed', text: 'Rain that the bells push away pools on the low ground elsewhere.' },
  { id: 'mud_road', codes: ['MUDSLIDE'], title: 'Mud on the hillside road', text: 'Rain pushed off the hillside slides down and buries the road; no caravan can pass for two days.' },
  { id: 'night_labour', codes: ['NIGHT_LABOR'], title: 'Moonlit work tires people', text: 'Field hands who keep the moonlight law labour all night and arrive at dawn drained.' },
  { id: 'spark', codes: ['FIRE_STARTED', 'FIELD_BURNED'], title: 'A beacon is a gamble', text: 'Sparks from a lit beacon can set dry fields and cottages alight.' },
  { id: 'smoke_lungs', codes: ['SMOKE_SICKNESS'], title: 'Smoke protects and sickens', text: 'People who stand in a smoke fire’s reach fall ill.' },
  { id: 'hungry_pack', codes: ['PACK_STARVING'], title: 'A hungry pack is not fooled', text: 'A pack that has been fed nothing at a decoy fire ignores the decoy and turns on the pens.' },
  { id: 'decoy', codes: ['PACK_LURED'], title: 'The decoy works', text: 'Where people believe wolves follow smoke, a fire deep in the wood draws a pack away from the pens.' },
  { id: 'bridge_cut', codes: ['BRIDGE_COLLAPSED', 'TRAPPED'], title: 'No bridge, no rescue', text: 'When the bridge falls, one bank can neither hear you nor walk out.' },
  { id: 'watched_bridge', codes: ['BRIDGE_HELD'], title: 'Watchers shield the bridge', text: 'Believers on the deck cut the flood’s damage to the bridge by most of its force.' },
  { id: 'rebuttal', codes: ['RIVAL_REBUTTAL', 'RIVAL_CAMPAIGN'], title: 'A rival answers', text: 'A rival faction spreads a competing story, and a failed demonstration gives them the opening.' },
  { id: 'foiled', codes: ['RIVAL_FOILED'], title: 'A challenge in time', text: 'Challenging an announced campaign with the right person blunts it before it lands.' },
  { id: 'sabotage', codes: ['RIVAL_SABOTAGE', 'CARAVAN_DELAYED'], title: 'The shipment can be talked out of', text: 'A rival can delay a caravan unless you answer him.' },
  { id: 'backfire', codes: ['EVIDENCE_BACKFIRED'], title: 'Proof on a bad omen backfires', text: 'A demonstration on a night that looks wrong makes people trust you less.' },
  { id: 'famine', codes: ['FAMINE'], title: 'Belief does not feed anyone', text: 'When the granary empties, children and elders eat first and the workers last.' },
  { id: 'predators', codes: ['LIVESTOCK_KILLED'], title: 'The packs walk toward the pens', text: 'Each night a pack walks toward the nearest pen it can reach, and strikes it if nothing stops it.' },
  { id: 'spared', codes: ['HOME_SPARED', 'PEN_SPARED', 'LIFE_SPARED'], title: 'A law that saved something', text: 'A law with fuel, people and a trigger actually changed who was spared.' },
  { id: 'caravan', codes: ['CARAVAN_ARRIVES'], title: 'Trust brings grain', text: 'A merchant who firmly believes will send grain, if the road is open.' },
  { id: 'council_ban', codes: ['COUNCIL_BAN'], title: 'The Council can close the square', text: 'A divided Council forbids public gatherings on some mornings.' },
  { id: 'law_fades', codes: ['LAW_COLLAPSED', 'LAW_FADED'], title: 'Laws fade without belief', text: 'A law that loses support wavers, then fails; belief has to be kept up.' },
];

/** Knowledge ids revealed by a finished run's log. */
export function knowledgeFrom(s: RunState): string[] {
  const codes = new Set(s.log.map((e) => e.code));
  return KNOWLEDGE.filter((k) => k.codes.some((c) => codes.has(c))).map((k) => k.id);
}

export function knowledgeDef(id: string): KnowledgeDef | undefined {
  return KNOWLEDGE.find((k) => k.id === id);
}
