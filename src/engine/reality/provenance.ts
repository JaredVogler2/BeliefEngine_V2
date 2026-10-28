import { findClaimDef } from '../core/lookup.ts';
import type { GameEvent, RunState } from '../core/types.ts';
import { chainOf } from '../mind/journal.ts';
import { regionAt } from '../world/grid.ts';

/**
 * How a written belief became real, or why it did not (phase 09): the player's words, the people they told, the network that carried
 * it, who pushed back, the threshold it crossed, what in the world it changed and what that cost or saved. Read only from the log
 * and its cause links; nothing here is stored or decided.
 */

export type ProvenanceKind = 'written' | 'told' | 'network' | 'opposed' | 'threshold' | 'changed' | 'outcome';

export interface ProvenanceStep {
  kind: ProvenanceKind;
  day: number;
  /** the log event this step is, when it is one */
  event: number | null;
  text: string;
}

export interface Provenance {
  claim: string;
  short: string;
  status: 'law' | 'waking' | 'story';
  steps: ProvenanceStep[];
  /** firm believers when it became law, by how it first reached them: from you, through a neighbour (gossip, a carried message, a
   *  gathering's talk), or by seeing it shown */
  believers: { keeper: number; neighbour: number; witness: number };
  /** the harm it did to the people who live with it (rules 2, LAW_HARMED): on how many nights, where, and how many people it reached */
  harm: { nights: number; regions: string[]; people: number };
}

const TOLD = new Set(['RUMOR_SEEDED', 'GATHERING', 'MESSENGER_SENT', 'EVIDENCE_STAGED', 'KEEPER_TALKED', 'NPC_ACT']);
const OPPOSED = new Set(['RUMOR_CHALLENGED', 'NPC_CLAIM_TELEGRAPHED', 'NPC_CLAIM_MADE', 'LEADER_OPPOSES', 'TEST_REQUESTED', 'TEST_FAILED', 'TEST_LAPSED', 'LIE_TOLD', 'BELIEVER_LOST', 'RIVAL_CAMPAIGN', 'LAW_SUPPRESSED', 'LAW_WAVERING', 'LAW_COLLAPSED']);
/** physical changes a law makes, and what they did to the village */
const CHANGED = new Set(['REALITY_EFFECT', 'REALITY_CONFLICT', 'FIRE_WARDS_COOLED', 'BANK_RAISED', 'STONE_RAMS_BRIDGE', 'STRAYS_FLEW_HOME', 'CHICKENS_ROSE', 'WATER_POOLED', 'FIELD_TENDED', 'CHICKS_HATCHED']);

function isOpposition(e: GameEvent, claim: string): boolean {
  if (!OPPOSED.has(e.code) && !(e.code === 'NPC_ACT' && /challenge|argues against|doubts/i.test(e.text))) return false;
  return e.claim === claim;
}

/** The provenance of one written belief, oldest step first; null if no such belief. */
export function provenanceOf(s: RunState, claim: string): Provenance | null {
  const def = findClaimDef(s, claim);
  if (!def) return null;
  const steps: ProvenanceStep[] = [];
  const laws = s.laws.filter((l) => l.claimId === claim);
  const lawIds = new Set(laws.map((l) => l.id));
  const activated = s.log.find((e) => e.code === 'LAW_ACTIVATED' && e.claim === claim);
  // who carried it: the cause chain behind the law waking (supporters' beliefs, back to the first tellings)
  const chain = new Set(activated ? chainOf(s, activated.id, 40).map((j) => j.event) : []);
  let told = 0;
  let network = 0;
  let opposed = 0;
  for (const e of s.log) {
    const mine = e.claim === claim || (e.law !== undefined && lawIds.has(e.law));
    if (!mine) continue;
    if (e.code === 'BELIEF_WRITTEN') steps.push({ kind: 'written', day: e.day, event: e.id, text: e.text });
    else if (TOLD.has(e.code) && (e.code !== 'NPC_ACT' || chain.has(e.id)) && !isOpposition(e, claim)) {
      if (told++ < 6) steps.push({ kind: 'told', day: e.day, event: e.id, text: e.code === 'NPC_ACT' ? `${e.text} (a villager's own choice)` : e.text });
    } else if ((e.code === 'BELIEVER_GAINED' || e.code === 'BELIEF_SHIFT') && (chain.has(e.id) || e.code === 'BELIEVER_GAINED')) {
      if (network++ < 6) steps.push({ kind: 'network', day: e.day, event: e.id, text: e.text });
    } else if (isOpposition(e, claim)) {
      if (opposed++ < 5) steps.push({ kind: 'opposed', day: e.day, event: e.id, text: e.text });
    } else if (e.code === 'LAW_ACTIVATED' || e.code === 'LAW_AWAKENING') {
      const th = def.spec.thresholds;
      steps.push({ kind: 'threshold', day: e.day, event: e.id, text: `${e.text}${e.code === 'LAW_ACTIVATED' ? ` (it needed ${Math.round(th.on * 100)}% and ${th.minSupporters} firm believers)` : ''}` });
    } else if (CHANGED.has(e.code)) steps.push({ kind: 'changed', day: e.day, event: e.id, text: e.text });
    // the harm it did to people who live with it, and what that cost the Keeper (rules 2)
    else if (e.code === 'LAW_HARMED') steps.push({ kind: 'outcome', day: e.day, event: e.id, text: e.text });
  }
  // what the changes did to the village: the hazards that night that the law's effects decided
  for (const e of s.log) {
    if (e.code === 'CHICKENS_ROSE' && /rode out water/.test(e.text) && !steps.some((x) => x.event === e.id) && steps.some((x) => x.kind === 'changed' && x.day === e.day && /rise/.test(x.text)))
      steps.push({ kind: 'outcome', day: e.day, event: e.id, text: e.text });
    if (e.code === 'WATER_POOLED' && !steps.some((x) => x.event === e.id) && steps.some((x) => x.kind === 'changed' && x.day === e.day && /rain|water is drawn/.test(x.text)))
      steps.push({ kind: 'outcome', day: e.day, event: e.id, text: `${e.text} That water was moved by “${def.short}”.` });
    if (e.code === 'COLD_SICKNESS' && steps.some((x) => x.kind === 'changed' && x.day === e.day && /hearths warm less/.test(x.text)))
      steps.push({ kind: 'outcome', day: e.day, event: e.id, text: `${e.text} (the hearths were cooled by “${def.short}”)` });
  }
  if (s.outcome) {
    const fate = s.outcome.result === 'victory' ? 'The village endured' : 'The village was lost';
    const did = steps.some((x) => x.kind === 'changed') ? 'changed the world on the nights listed above' : activated ? 'became law but never found anything to change' : 'never became law, so it changed nothing in the world';
    steps.push({ kind: 'outcome', day: s.day, event: null, text: `${fate}. “${def.short}” ${did}.` });
  }
  steps.sort((a, b) => a.day - b.day || (a.event ?? 1e9) - (b.event ?? 1e9));
  // how the believers it woke with first heard it: the earliest event that reached each of them
  const believers = { keeper: 0, neighbour: 0, witness: 0 };
  const at = laws.find((l) => l.activatedDay !== null);
  for (const vid of at?.supporters ?? []) {
    const first = s.log.find((e) => e.claim === claim && e.target === vid && (TOLD.has(e.code) || e.code === 'BELIEVER_GAINED' || e.code === 'BELIEF_SHIFT' || e.code === 'EVIDENCE_STAGED'));
    if (first && (first.code === 'RUMOR_SEEDED' || first.code === 'KEEPER_TALKED')) believers.keeper++;
    else if (first && first.code === 'EVIDENCE_STAGED') believers.witness++;
    else believers.neighbour++;
  }
  const status = laws.some((l) => l.status === 'active' || l.status === 'wavering') ? 'law' : laws.some((l) => l.progress > 0) ? 'waking' : 'story';
  const harmed = s.log.filter((e) => e.code === 'LAW_HARMED' && e.claim === claim);
  const regions = [...new Set(harmed.map((e) => (e.tile ? regionAt(s.world, e.tile[0], e.tile[1]) : null)).filter((r): r is string => !!r))].map((r) => s.world.regions.find((x) => x.id === r)?.name ?? r);
  const people = harmed.reduce((n, e) => n + (Number(/(\d+) people who live with it/.exec(e.text)?.[1]) || 0), 0);
  return { claim, short: def.short, status, steps, believers, harm: { nights: new Set(harmed.map((e) => e.day)).size, regions, people } };
}

/** Provenance for every belief the player wrote in this run. */
export function writtenProvenance(s: RunState): Provenance[] {
  return s.claims
    .filter((c) => c.def?.reality && !c.def.rival)
    .map((c) => provenanceOf(s, c.id))
    .filter((p): p is Provenance => !!p);
}
