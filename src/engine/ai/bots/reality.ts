import { applyAction, getAvailableActions } from '../../core/actions.ts';
import { buildNpcRequest } from '../../mind/request.ts';
import type { Trigger } from '../../reality/ast.ts';
import { readBelief } from '../../reality/read.ts';
import { authoredTwin } from '../../reality/twin.ts';
import { claimDef } from '../../core/lookup.ts';
import type { GameSession } from '../../core/session.ts';
import type { NpcChoiceInput, RunState } from '../../core/types.ts';
import { bridgeBuilderTactic, broadcasterTactic, evidenceFirstTactic, forecastGuard, greedyTactic, playbook, policyById, threatAwareTactic, type Tactic } from './generic.ts';
import type { Policy } from './types.ts';

/**
 * Phase 11: policies for Generative Reality runs. Each plays exactly as a person could: it types a sentence, the offline reader reads
 * it in the live village, the reading is written with an ordinary COMPOSE, and Influence is then spent through the same actions as
 * everybody else (tellings, gatherings, messengers, rituals, the catalyst a clause needs). Nothing is set directly, no model is
 * called, and an antagonist proposes villager decisions only through NPC_DECIDE, which the engine validates like a model's.
 */

/** What a policy writes, by role; the sentences are the labelled corpus's own (tests/fixtures/reality-corpus-1.json) or variants of them. */
export interface SentenceBook {
  /** a direct answer to the chapter's danger */
  ward: string;
  /** a different mechanism against the same danger */
  alt: string;
  /** cheap and narrow (light power) */
  light: string;
  /** two clauses in one belief */
  compound: string;
  /** the widest reading the reader will write ("always", whole region) */
  broad: string;
  /** a belief that works as written and can hurt the village that holds it */
  backfire: string;
}

export const BOOKS: Record<string, SentenceBook> = {
  redbank: {
    ward: 'The river turns away from lit lanterns.',
    alt: 'The bridge grows stronger when people watch it.',
    light: 'Wet stone becomes light beside lanterns.',
    compound: 'When the bell rings, chickens fly and the river turns away.',
    broad: 'Floodwater always flows away from every home.',
    backfire: 'The river is drawn toward lit lanterns.',
  },
  // the harvest is the danger here: the yield of the fields decides who is fed
  harvest: {
    ward: 'Crops ripen faster under the night sky.',
    alt: 'Rain falls on the fields when the bell is rung.',
    light: 'Crops grow faster when the bell rings.',
    compound: 'The bell brings rain to the valley and the crops grow faster at night.',
    broad: 'Crops grow faster always.',
    backfire: 'Crops wither under the moon.',
  },
  // the packs strike three hamlets, each with its own pen: a belief held in one of them cannot save enough animals
  ashwood: {
    ward: 'Wolves will not come near the smoke fires in every hamlet.',
    alt: 'Smoke hides the pens from the wolves in every hamlet.',
    light: 'Smoke hides the pens from the wolves.',
    compound: 'In every hamlet, smoke hides the pens and slows the wolves.',
    broad: 'Sickness keeps away from homes with open doors.',
    backfire: 'Wolves are drawn to the smoke fires in every hamlet.',
  },
};

export type Role = keyof SentenceBook;

export function bookFor(s: RunState): SentenceBook | null {
  return BOOKS[s.scenarioId] ?? null;
}

/** Beliefs the Keeper wrote in this run (not a rival's), oldest first. */
export function writtenClaims(s: RunState): string[] {
  return s.claims.filter((c) => c.def?.reality && !c.def.rival).map((c) => c.id);
}

/**
 * Types a sentence: the offline reader reads it in the live village and the first buildable reading is written (COMPOSE). Returns the
 * new claim's id, or null with the reason (unreadable, refused, unaffordable) in `why`.
 */
export function writeBelief(g: GameSession, sentence: string, why: string[] = []): string | null {
  const r = readBelief(g.state, sentence);
  const cand = r.kind === 'supported' || r.kind === 'partial' ? r.candidates[0] : r.kind === 'ambiguous' ? r.choices[0] : null;
  if (!cand) {
    why.push(`${sentence}: ${r.kind}`);
    return null;
  }
  if (!cand.build.ok) {
    why.push(`${sentence}: ${cand.build.message}`);
    return null;
  }
  const res = g.act({ type: 'COMPOSE', claim: cand.build.draft.claim });
  if (!res.ok) {
    why.push(`${sentence}: ${res.error.message}`);
    return null;
  }
  return cand.build.draft.claim.id;
}

function eventsOf(t: Trigger, out: Set<string>): Set<string> {
  if ('event' in t) out.add(t.event);
  else if ('all' in t) t.all.forEach((x) => eventsOf(x, out));
  else if ('any' in t) t.any.forEach((x) => eventsOf(x, out));
  return out;
}

/** The catalysts a written belief's clauses wait for, as the events named in their triggers (never inside a "not"). */
export function catalystsOf(s: RunState, claim: string): Set<string> {
  const ast = claimDef(s, claim).reality?.ast;
  const out = new Set<string>();
  for (const c of ast?.clauses ?? []) eventsOf(c.when, out);
  return out;
}

const waking = (s: RunState, claim: string) => s.laws.some((l) => l.claimId === claim && (l.progress > 0 || l.status === 'active' || l.status === 'wavering'));

/**
 * Supplies tonight's catalyst for a written belief with the village's own rituals (ring the bells, light the lanterns of its region,
 * light a smoke fire, keep a vigil), as Influence and fuel allow. Unstaged: a catalyst is not a proof (it costs no extra Influence).
 */
export function supplyCatalyst(g: GameSession, claim: string, maxLanterns = 2): void {
  const need = catalystsOf(g.state, claim);
  const def = claimDef(g.state, claim);
  const site = (kind: string) => g.state.world.landmarks.filter((l) => l.kind === kind && l.hp > 0).sort((a, b) => Number(def.regions.includes(b.district)) - Number(def.regions.includes(a.district)) || (a.id < b.id ? -1 : 1));
  const ritual = (id: string) => g.state.scn.rituals.find((r) => r.id === id);
  if (need.has('bell') && ritual('ring_bells')) {
    const bt = site('belltower').find((l) => !((l.data.ringing ?? 0) > 0));
    if (bt && g.state.ap >= 1) g.act({ type: 'RITUAL', ritual: 'ring_bells', landmark: bt.id });
  }
  // fires: a lantern or smoke fire burning in each region the belief holds (two lanterns in a single region), as fuel allows
  const fires = (kind: string, rite: string, max: number) => {
    let lit = 0;
    const seen = new Set<string>();
    for (const f of site(kind).filter((l) => def.regions.includes(l.district) || def.regions.includes('river'))) {
      if (lit >= max || g.state.ap < 1) break;
      if (def.regions.length > 1 && seen.has(f.district)) continue;
      if (f.lit && f.fuelNights >= 2) {
        lit++;
        seen.add(f.district);
        continue;
      }
      if ((g.state.world.stocks.fuel ?? 0) < 2) break;
      if (g.act({ type: 'RITUAL', ritual: rite, landmark: f.id }).ok) {
        lit++;
        seen.add(f.district);
      }
    }
  };
  if (need.has('lantern') && ritual('light_beacon')) fires('beacon', 'light_beacon', def.regions.length > 1 ? def.regions.length : maxLanterns);
  if (need.has('smoke_fire') && ritual('burn_smoke')) fires('campfire', 'burn_smoke', Math.max(1, def.regions.length));
  if (need.has('watchers') && ritual('keep_vigil')) {
    const br = site('bridge')[0];
    if (br && g.state.ap >= 1) g.act({ type: 'RITUAL', ritual: 'keep_vigil', landmark: br.id });
  }
}

/**
 * Day 1: pick the opening story a person would (the one the written belief does the same as, so the copy is not held back until the
 * other opening's day; otherwise the first offered), then write.
 */
function openWith(g: GameSession, sentence: string | null): void {
  if (g.state.starter === null) {
    let pick = g.state.scn.starters[0];
    const r = sentence ? readBelief(g.state, sentence) : null;
    const cand = r && (r.kind === 'supported' || r.kind === 'partial') ? r.candidates[0] : r?.kind === 'ambiguous' ? r.choices[0] : null;
    const twin = cand ? authoredTwin(g.state, cand.ast) : null;
    if (twin && g.state.scn.starters.includes(twin.id)) pick = twin.id;
    g.act({ type: 'PICK_STARTER', claim: pick });
  }
  if (sentence && !writtenClaims(g.state).length && g.state.day === 1) writeBelief(g, sentence);
}

/**
 * A playbook tactic aimed at the Keeper's first written belief; Influence held back for its catalyst once it is waking (or from
 * `catalystFrom`), which is then supplied after the social spending.
 */
function writtenTactic(base: Tactic, name: string, opts: { catalyst: boolean; catalystFrom?: number }): Tactic {
  const main = (s: RunState) => writtenClaims(s)[0] ?? null;
  const wantCatalyst = (s: RunState) => {
    const c = main(s);
    return !!c && opts.catalyst && (waking(s, c) || (opts.catalystFrom !== undefined && s.day >= opts.catalystFrom));
  };
  return {
    ...base,
    name,
    pick: main,
    second: false,
    counter: true,
    reserve: (s) => (wantCatalyst(s) ? Math.min(s.ap, Math.max(1, catalystsOf(s, main(s)!).size)) : 0),
    after: (g) => {
      const c = main(g.state);
      if (c && wantCatalyst(g.state)) supplyCatalyst(g, c);
    },
  };
}

function writing(name: string, role: Role | null, inner: Policy): Policy {
  return {
    name,
    playDay(g) {
      const book = bookFor(g.state);
      openWith(g, role && book ? book[role] : null);
      inner.playDay(g);
    },
  };
}

/**
 * An adversarial proposer standing where a model would: for every villager due to think it picks the most hostile legal move (argue
 * against the Keeper's stories with the people who believe them, carry a rival story, demand proof) and submits them as NPC_DECIDE.
 * The engine validates each one against the live run and applies it by its own rules; what it cannot do, it cannot do.
 */
export function antagonize(g: GameSession): number {
  const s = g.state;
  const req = buildNpcRequest(s, 'tournament');
  if (!req) return 0;
  const mine = new Set([...writtenClaims(s), ...s.claims.filter((c) => c.available && !claimDef(s, c.id).rival).map((c) => c.id)]);
  const rival = new Set(s.claims.filter((c) => claimDef(s, c.id).rival).map((c) => c.id));
  const decisions: NpcChoiceInput[] = [];
  for (const a of req.agents) {
    const by = (intent: string) => a.eligible.find((e) => e.intent === intent);
    const believers = (claim: string, targets: string[]) => targets.slice().sort((x, y) => (s.villagers.find((v) => v.id === y)?.beliefs[claim]?.conv ?? 0) - (s.villagers.find((v) => v.id === x)?.beliefs[claim]?.conv ?? 0));
    const ch = by('challenge');
    const sp = by('spread');
    const rt = by('request_test');
    let d: Omit<NpcChoiceInput, 'citizenId'> | null = null;
    const challengeOn = ch?.claims.find((c) => mine.has(c));
    const spreadRival = sp?.claims.find((c) => rival.has(c) || (s.villagers.find((v) => v.id === a.id)?.beliefs[c]?.conv ?? 0) < 0);
    const testOn = rt?.claims.find((c) => mine.has(c));
    if (ch && challengeOn && ch.targets.length) d = { intent: 'challenge', target: believers(challengeOn, ch.targets)[0], claimId: challengeOn, dialogue: 'Show me, or stop saying it.', cites: [], tone: 'wary', approach: 'authority', confidence: 80, thought: 'antagonist' };
    else if (sp && spreadRival && sp.targets.length) d = { intent: 'spread', target: sp.targets[0], claimId: spreadRival, dialogue: null, cites: [], tone: 'calm', approach: 'testimony', confidence: 70, thought: 'antagonist' };
    else if (rt && testOn) d = { intent: 'request_test', target: null, claimId: testOn, dialogue: 'I will believe it when I see it.', cites: [], tone: 'wary', approach: 'evidence', confidence: 70, thought: 'antagonist' };
    if (d) decisions.push({ citizenId: a.id, ...d });
  }
  if (!decisions.length) return 0;
  const r = g.act({ type: 'NPC_DECIDE', rev: req.run.rev, decisions, model: 'antagonist (scripted)' });
  return r.ok ? decisions.length : 0;
}

export interface RealityPolicyEntry {
  id: string;
  about: string;
  /** the sentence role it writes (null: writes nothing) */
  role: Role | null;
  make(): Policy;
}

/** The seven phase 11 policies plus the control. Each `make()` returns a fresh policy (they keep no state between runs). */
export const REALITY_POLICIES: RealityPolicyEntry[] = [
  { id: 'noop', about: 'Control: picks the first opening story and ends every day; writes nothing.', role: null, make: () => policyById('noop') },
  {
    id: 'spam-broad', about: 'Writes the widest belief the reader accepts and tells it to everyone it can reach; never supplies a catalyst or proof.', role: 'broad',
    make: () => writing('spam-broad', 'broad', playbook({ ...writtenTactic(broadcasterTactic, 'spam-broad', { catalyst: false }), allow: (_s, a) => a.type === 'SEED' || a.type === 'GATHER' || a.type === 'MESSENGER', minGain: 0.2 })),
  },
  {
    id: 'evidence-first', about: 'Writes a ward against the danger; stages it where skeptics can see on kind nights, tells skeptics, supplies its catalyst once it wakes.', role: 'ward',
    make: () => writing('evidence-first', 'ward', playbook(writtenTactic(evidenceFirstTactic, 'evidence-first', { catalyst: true }))),
  },
  {
    id: 'bridge-persuasion', about: 'Writes a different mechanism and carries it across districts through the people tied into several; catalyst once it wakes.', role: 'alt',
    make: () => writing('bridge-persuasion', 'alt', playbook(writtenTactic(bridgeBuilderTactic, 'bridge-persuasion', { catalyst: true }))),
  },
  {
    id: 'inventive-compound', about: 'Writes a two-clause belief and pushes it greedily (exact previews), supplying every catalyst its clauses need once it wakes.', role: 'compound',
    make: () => writing('inventive-compound', 'compound', playbook(writtenTactic(greedyTactic, 'inventive-compound', { catalyst: true }))),
  },
  {
    id: 'careful-synergy', about: 'Plays the threat-aware authored plan; writes one light belief on day 1 and feeds it only with Influence the plan leaves.', role: 'light',
    make: () => {
      const light = writtenTactic(greedyTactic, 'careful-synergy-light', { catalyst: true });
      const plan = playbook({
        ...threatAwareTactic,
        name: 'careful-synergy',
        after: (g, claim) => {
          // the plan's own physical step first (it reads the forecast), then whatever Influence it left goes to the written belief
          forecastGuard(g);
          const w = writtenClaims(g.state)[0];
          if (!w || w === claim) return;
          // careful: only Influence above a bank of three goes to it, so the plan's savings for the worst night stay whole
          let guard = 0;
          while (g.state.ap > 3 && guard++ < 4) {
            const before = g.state.ap;
            bestFor(g, w, light);
            if (g.state.ap === before) break;
          }
          light.after?.(g, w);
        },
      });
      return writing('careful-synergy', 'light', plan);
    },
  },
  {
    id: 'backfire-probe', about: 'Not one of the seven: writes the chapter\'s backfire belief (it works as written and can hurt the village) and pushes it greedily with its catalyst.', role: 'backfire',
    make: () => writing('backfire-probe', 'backfire', playbook(writtenTactic(greedyTactic, 'backfire-probe', { catalyst: true }))),
  },
  {
    id: 'ward-greedy', about: 'Not one of the seven: the control for the antagonist, the same ward pushed the same greedy way with no adversary.', role: 'ward',
    make: () => writing('ward-greedy', 'ward', playbook(writtenTactic(greedyTactic, 'ward-greedy', { catalyst: true }))),
  },
  {
    id: 'rival-antagonist', about: 'Writes the ward and pushes it greedily while an adversarial proposer drives every thinking villager against it through NPC_DECIDE.', role: 'ward',
    make: () => {
      const inner = playbook(writtenTactic(greedyTactic, 'rival-antagonist', { catalyst: true }));
      return {
        name: 'rival-antagonist',
        playDay(g) {
          const book = bookFor(g.state);
          openWith(g, book?.ward ?? null);
          antagonize(g);
          inner.playDay(g);
        },
      };
    },
  },
];

/** One action for one claim: the best affordable one by the tactic's own measure (a playbook always ends the day; this does not). */
function bestFor(g: GameSession, claim: string, t: Tactic): void {
  const s = g.state;
  let best: { a: Parameters<GameSession['act']>[0]; score: number } | null = null;
  for (const o of availableFor(s)) {
    if (o.cost <= 0 || o.cost > s.ap) continue;
    const a = o.action;
    if (a.type === 'SCOUT' || a.type === 'PICK_STARTER' || a.type === 'TRADE' || a.type === 'COMPOSE' || a.type === 'COUNTER' || a.type === 'TALK' || a.type === 'NPC_DECIDE') continue;
    if (a.type === 'RITUAL' && !a.claim) continue;
    if (('claim' in a && a.claim) !== claim) continue;
    if (!t.allow(s, a, claim)) continue;
    const r = preview(s, a);
    if (!r) continue;
    const score = t.gain(s, r, claim, a) / o.cost;
    if (score > (t.minGain ?? 0.04) && (!best || score > best.score)) best = { a, score };
  }
  if (best) g.act(best.a);
}

const availableFor = (s: RunState) => getAvailableActions(s);
const preview = (s: RunState, a: Parameters<typeof applyAction>[1]): RunState | null => {
  const r = applyAction(s, a);
  return r.ok ? r.state : null;
};

export function realityPolicyById(id: string): Policy {
  const e = REALITY_POLICIES.find((p) => p.id === id);
  if (!e) throw new Error(`unknown reality policy "${id}"`);
  return e.make();
}
