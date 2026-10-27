import { findClaimDef, findVillager, trustOf } from '../core/lookup.ts';
import { clamp } from '../core/rng.ts';
import type { GameEvent, Landmark, RunState, Villager } from '../core/types.ts';
import { DRIFT, MAX_EPISODES, MAX_NEW_PER_DAY, MAX_SUMMARY, SIGHT, TRAITS, type Episode, type EpisodeKind, type Mind, type SummaryLine } from './types.ts';

/**
 * Memories from the event log. Twice a day the log entries since the last capture become episodes: after the day's actions (so
 * a villager remembers what happened where they spent the day) and after the night (where they spent the night). Who remembers
 * what follows the game's facts: being within sight of where it happened, being the one told, owning what was lost, belonging to
 * the household of the dead, or living where a law was decided. Each episode keeps the event it came from.
 */

type Draft = Omit<Episode, 'id'>;

const LABEL: Record<EpisodeKind, string> = {
  keeper_told: 'told a story by the Keeper',
  told: 'told a story',
  campaigned: 'campaigned at',
  saw_proof: 'watched a demonstration work',
  saw_proof_fail: 'watched a demonstration fail',
  saw_law_work: 'saw a belief at work',
  law_news: 'heard news of a law',
  saw_fire: 'saw fire',
  saw_flood: 'saw the flood',
  saw_wolves: 'saw wolves',
  lost_kin: 'lost family',
  lost_home: 'lost a home',
  lost_herd: 'lost animals',
  lost_crop: 'lost a crop',
  trapped: 'trapped by the water',
  saw_death: 'saw someone die',
  bridge_fell: 'the bridge fell',
  npc_spoke: 'spoken to by a neighbour',
  talked_keeper: 'talked with the Keeper',
};

const cheb = (v: Villager, x: number, y: number) => Math.max(Math.abs(v.x - x), Math.abs(v.y - y));
const living = (s: RunState) => s.villagers.filter((v) => v.status !== 'dead');
const near = (s: RunState, x: number, y: number, r = SIGHT) => living(s).filter((v) => cheb(v, x, y) <= r);
const trust01 = (s: RunState, listener: string, source: string) => Math.round((trustOf(s, listener, source) + 100) / 2);
const cut = (t: string) => (t.length > 160 ? `${t.slice(0, 157)}…` : t);

function landmarkAt(s: RunState, x: number, y: number): Landmark | undefined {
  return s.world.landmarks.find((l) => (l.x === x && l.y === y) || l.tiles.some(([tx, ty]) => tx === x && ty === y));
}

function short(s: RunState, claim: string | undefined): string {
  return claim ? (findClaimDef(s, claim)?.short ?? claim) : '';
}

function nameOf(s: RunState, id: string | undefined): string {
  if (!id) return 'someone';
  if (id === 'keeper') return 'the Keeper';
  return findVillager(s, id)?.name ?? id;
}

function placeName(s: RunState, x: number, y: number): string {
  const l = landmarkAt(s, x, y);
  if (l) return l.name;
  const r = s.world.regions[s.world.region[y * s.world.w + x]];
  return r ? r.name : 'nearby';
}

/** Who remembers an event, and how. */
function episodesOf(s: RunState, e: GameEvent): [string, Draft][] {
  const out: [string, Draft][] = [];
  const base = { day: e.day, event: e.id, claim: e.claim ?? null, place: null as string | null, scope: 'public' as const, judge: false };
  const seen = (vs: Villager[], d: Pick<Draft, 'kind' | 'salience' | 'valence' | 'text'> & Partial<Draft>) => {
    for (const v of vs) out.push([v.id, { ...base, witnessed: true, source: null, credibility: 100, ...d }]);
  };
  const tile = e.tile;
  const lm = tile ? landmarkAt(s, tile[0], tile[1]) : undefined;
  const at = tile ? placeName(s, tile[0], tile[1]) : '';
  if (lm) base.place = lm.id;
  switch (e.code) {
    case 'RUMOR_SEEDED': {
      const v = e.target ? findVillager(s, e.target) : undefined;
      if (v) out.push([v.id, { ...base, kind: 'keeper_told', witnessed: true, source: 'keeper', credibility: Math.round(v.keeperTrust), salience: 1, valence: 0, text: cut(`The Keeper told me: “${short(s, e.claim)}”.`) }]);
      break;
    }
    case 'BELIEVER_GAINED':
    case 'BELIEF_SHIFT': {
      const conv = e.delta?.conviction;
      if (!e.actor || !e.target || e.actor === e.target || !conv) break;
      const moved = Math.abs(conv[1] - conv[0]);
      if (e.code === 'BELIEF_SHIFT' && moved < 3) break;
      out.push([e.target, { ...base, kind: 'told', witnessed: false, source: e.actor, credibility: trust01(s, e.target, e.actor), salience: e.code === 'BELIEVER_GAINED' ? 2 : 1, valence: 0, text: cut(`${nameOf(s, e.actor)} told me “${short(s, e.claim)}”.`) }]);
      break;
    }
    case 'RIVAL_CAMPAIGN':
      if (e.actor && e.target) out.push([e.target, { ...base, kind: 'campaigned', witnessed: false, source: e.actor, credibility: trust01(s, e.target, e.actor), salience: 1, valence: 0, text: cut(`${nameOf(s, e.actor)} campaigned at me: “${short(s, e.claim)}”.`) }]);
      break;
    case 'EVIDENCE_STAGED':
    case 'EVIDENCE_BACKFIRED':
      if (tile) {
        const ok = e.code === 'EVIDENCE_STAGED';
        seen(near(s, tile[0], tile[1]), { kind: ok ? 'saw_proof' : 'saw_proof_fail', salience: 2, valence: ok ? 1 : -1, judge: true, text: cut(`Watched a demonstration of “${short(s, e.claim)}” at ${at}: ${ok ? 'it seemed to work' : 'it looked foolish'}.`) });
      }
      break;
    case 'REALITY_EFFECT':
      if (tile) seen(near(s, tile[0], tile[1]), { kind: 'saw_law_work', salience: 2, valence: 1, judge: true, text: cut(`Saw “${short(s, e.claim)}” at work near ${at}: ${e.text.split(': ').slice(1).join(': ') || e.text}`) });
      break;
    case 'BRIDGE_HELD': {
      const br = s.world.landmarks.find((l) => l.kind === 'bridge');
      if (br) seen(near(s, br.x, br.y, 3), { kind: 'saw_law_work', salience: 2, valence: 2, judge: true, place: br.id, text: cut(`Stood by the bridge and saw it hold against the flood.`) });
      break;
    }
    case 'HOME_SPARED':
    case 'LIFE_SPARED':
    case 'FIELD_SPARED':
    case 'PEN_SPARED':
      if (tile) seen(near(s, tile[0], tile[1]), { kind: 'saw_law_work', salience: 2, valence: 1, judge: true, text: cut(`Saw it at ${at}: ${e.text}`) });
      break;
    case 'LAW_ACTIVATED':
    case 'LAW_DISCREDITED':
    case 'LAW_COLLAPSED': {
      if (!e.claim) break;
      const def = findClaimDef(s, e.claim);
      if (!def) break;
      const districts = new Set(def.regions.flatMap((r) => def.electorate?.[r] ?? [r]));
      const took = e.code === 'LAW_ACTIVATED';
      for (const v of living(s)) {
        if (!districts.has(v.district)) continue;
        const conv = v.beliefs[e.claim]?.conv ?? 0;
        const cares = conv >= 50 || conv <= -10;
        out.push([v.id, { ...base, kind: 'law_news', witnessed: false, source: null, credibility: 60, salience: cares ? 2 : 1, valence: (took ? 1 : -1) * (conv >= 0 ? 1 : -1) as 1 | -1, text: cut(took ? `Heard “${def.short}” took hold: people are living by it.` : `Heard “${def.short}” failed them.`) }]);
      }
      break;
    }
    case 'FIRE_STARTED':
      if (tile) seen(near(s, tile[0], tile[1]), { kind: 'saw_fire', salience: 2, valence: -1, text: cut(`Saw fire break out at ${at}.`) });
      break;
    case 'HOME_DAMAGED':
    case 'HOME_DESTROYED': {
      if (!tile || !lm) break;
      const gone = e.code === 'HOME_DESTROYED';
      const fire = /fire/i.test(e.text);
      const owners = living(s).filter((v) => v.homeId === lm.id);
      for (const v of owners) out.push([v.id, { ...base, kind: 'lost_home', witnessed: cheb(v, tile[0], tile[1]) <= SIGHT, source: null, credibility: 100, salience: gone ? 3 : 2, valence: gone ? -2 : -1, scope: 'private', text: cut(`Our home, ${lm.name}, was ${gone ? 'destroyed' : 'damaged'} by ${fire ? 'fire' : 'the flood'}.`) }]);
      seen(near(s, tile[0], tile[1]).filter((v) => v.homeId !== lm.id), { kind: fire ? 'saw_fire' : 'saw_flood', salience: gone ? 2 : 1, valence: -1, text: cut(`Saw ${lm.name} ${gone ? 'destroyed' : 'damaged'} by ${fire ? 'fire' : 'the flood'}.`) });
      break;
    }
    case 'FIELD_FLOODED':
    case 'FIELD_BURNED':
      if (lm) for (const v of living(s).filter((x) => x.workId === lm.id)) out.push([v.id, { ...base, kind: 'lost_crop', witnessed: false, source: null, credibility: 100, salience: 2, valence: -2, scope: 'private', text: cut(`The crop I work, ${lm.name}, was lost to ${e.code === 'FIELD_FLOODED' ? 'the flood' : 'fire'}.`) }]);
      break;
    case 'LIVESTOCK_KILLED':
      if (tile && lm) {
        const keepers = living(s).filter((v) => v.workId === lm.id);
        for (const v of keepers) out.push([v.id, { ...base, kind: 'lost_herd', witnessed: cheb(v, tile[0], tile[1]) <= SIGHT, source: null, credibility: 100, salience: 3, valence: -2, scope: 'private', text: cut(`Wolves struck ${lm.name}, the pens I keep.`) }]);
        seen(near(s, tile[0], tile[1]).filter((v) => v.workId !== lm.id), { kind: 'saw_wolves', salience: 2, valence: -1, text: cut(`Saw wolves strike ${lm.name}.`) });
      }
      break;
    case 'PACK_MOVES':
      if (tile) seen(near(s, tile[0], tile[1]), { kind: 'saw_wolves', salience: 1, valence: -1, text: cut(`Saw a wolf pack prowling near ${at}.`) });
      break;
    case 'DEATH': {
      const dead = e.target ? findVillager(s, e.target) : undefined;
      if (!dead) break;
      const kin = new Set(s.edges.filter((x) => (x.kind === 'household' || x.kind === 'kin') && (x.a === dead.id || x.b === dead.id)).map((x) => (x.a === dead.id ? x.b : x.a)));
      for (const v of living(s)) {
        if (v.id === dead.id) continue;
        if (v.household === dead.household || kin.has(v.id)) out.push([v.id, { ...base, kind: 'lost_kin', witnessed: cheb(v, dead.x, dead.y) <= SIGHT, source: null, credibility: 100, salience: 3, valence: -2, scope: 'private', place: dead.homeId, text: cut(`My own family: ${e.text}`) }]);
        else if (cheb(v, dead.x, dead.y) <= SIGHT) out.push([v.id, { ...base, kind: 'saw_death', witnessed: true, source: null, credibility: 100, salience: 2, valence: -2, text: cut(`Saw it happen: ${e.text}`) }]);
      }
      break;
    }
    case 'BRIDGE_COLLAPSED': {
      const br = s.world.landmarks.find((l) => l.kind === 'bridge');
      for (const v of living(s)) {
        const saw = !!br && cheb(v, br.x, br.y) <= SIGHT;
        out.push([v.id, { ...base, kind: 'bridge_fell', witnessed: saw, source: null, credibility: saw ? 100 : 80, salience: saw ? 3 : 2, valence: -2, place: br?.id ?? null, text: saw ? 'Watched the bridge give way to the flood.' : 'Heard the bridge gave way: the banks are cut off.' }]);
      }
      break;
    }
    case 'NPC_ACT':
      if (e.actor && e.target && e.actor !== e.target && findVillager(s, e.target))
        out.push([e.target, { ...base, kind: 'npc_spoke', witnessed: true, source: e.actor, credibility: trust01(s, e.target, e.actor), salience: e.reason === 'challenge' || e.reason === 'support_rescue' ? 2 : 1, valence: e.reason === 'comfort' || e.reason === 'support_rescue' ? 1 : e.reason === 'challenge' ? -1 : 0, text: cut(e.text) }]);
      break;
    case 'NPC_INVESTIGATED':
      if (e.actor && e.reason !== 'nothing')
        out.push([e.actor, { ...base, kind: e.reason === 'worked' ? 'saw_law_work' : 'saw_proof_fail', witnessed: true, source: null, credibility: 100, salience: 2, valence: e.reason === 'worked' ? 1 : -1, judge: true, text: cut(e.text) }]);
      break;
    case 'KEEPER_TALKED':
      if (e.target) out.push([e.target, { ...base, kind: 'talked_keeper', witnessed: true, source: 'keeper', credibility: Math.round(findVillager(s, e.target)?.keeperTrust ?? 50), salience: 1, valence: 0, text: cut(e.text) }]);
      break;
    default:
      break;
  }
  return out;
}

/** Major events shift a personality a little, never more than DRIFT from where it started. */
function drift(m: Mind, d: Draft): void {
  const nudge: Partial<Record<keyof Mind['personality'], number>> =
    d.kind === 'lost_kin' || d.kind === 'trapped' || (d.kind === 'lost_home' && d.salience >= 3) ? { fear: 4, courage: -1 }
    : d.kind === 'saw_proof_fail' ? { skepticism: 2 }
    : (d.kind === 'saw_proof' || d.kind === 'saw_law_work') && d.witnessed ? { skepticism: -1 }
    : d.kind === 'bridge_fell' && d.witnessed ? { fear: 2 }
    : {};
  for (const t of TRAITS) {
    const n = nudge[t];
    if (!n) continue;
    m.personality[t] = clamp(clamp(m.personality[t] + n, m.base[t] - DRIFT, m.base[t] + DRIFT), 5, 95);
  }
}

/** Keeps memory bounded: the least salient, oldest memories that judge nothing are folded into summary lines with their sources. */
function compact(s: RunState, m: Mind): void {
  const fold = (ep: Episode) => {
    const line = m.summary.find((x) => x.kind === ep.kind && x.claim === ep.claim);
    if (line) {
      line.days = [Math.min(line.days[0], ep.day), Math.max(line.days[1], ep.day)];
      if (ep.source && !line.sources.includes(ep.source)) line.sources = [...line.sources, ep.source].slice(-6);
      if (ep.event !== null) line.events = [...line.events, ep.event].slice(-12);
      line.count += 1;
    } else m.summary.push({ text: '', days: [ep.day, ep.day], kind: ep.kind, claim: ep.claim, sources: ep.source ? [ep.source] : [], events: ep.event !== null ? [ep.event] : [], count: 1 });
  };
  const over = (n: number) => m.episodes.length > n;
  if (over(MAX_EPISODES)) {
    const order = m.episodes.filter((e) => !e.judge).sort((a, b) => a.salience - b.salience || a.day - b.day || (a.id < b.id ? -1 : 1));
    const drop = new Set<string>();
    for (const e of order) {
      if (m.episodes.length - drop.size <= MAX_EPISODES) break;
      drop.add(e.id);
      fold(e);
    }
    m.episodes = m.episodes.filter((e) => !drop.has(e.id));
  }
  // even memories that judge a law are folded (never dropped) once there are far too many: the summary still says what was seen
  while (over(2 * MAX_EPISODES)) fold(m.episodes.shift()!);
  while (m.summary.length > MAX_SUMMARY) {
    const [a, b] = [m.summary.shift()!, m.summary[0]];
    b.days = [Math.min(a.days[0], b.days[0]), Math.max(a.days[1], b.days[1])];
    b.sources = [...new Set([...a.sources, ...b.sources])].slice(-6);
    b.events = [...a.events, ...b.events].slice(-12);
    b.count += a.count;
  }
  for (const l of m.summary) l.text = summaryText(s, l);
}

export function summaryText(s: RunState, l: SummaryLine): string {
  const days = l.days[0] === l.days[1] ? `Day ${l.days[0]}` : `Days ${l.days[0]}–${l.days[1]}`;
  const from = l.sources.length ? ` (from ${l.sources.slice(0, 3).map((x) => nameOf(s, x)).join(', ')}${l.sources.length > 3 ? '…' : ''})` : '';
  return cut(`${days}: ${LABEL[l.kind]}${l.claim ? ` about “${short(s, l.claim)}”` : ''}${l.count > 1 ? `, ${l.count} times` : ''}${from}.`);
}

/** Turns every log event since the last capture into memories; returns each villager's new ones. No-op outside V2 runs with minds. */
export function captureMemories(s: RunState): Map<string, Episode[]> {
  const added = new Map<string, Episode[]>();
  const minds = s.v2?.minds;
  if (!minds) return added;
  const fresh = s.log.filter((e) => e.id > minds.seen);
  minds.seen = s.nextEventId - 1;
  const by = new Map<string, Draft[]>();
  const add = (vid: string, d: Draft) => {
    const list = by.get(vid) ?? by.set(vid, []).get(vid)!;
    // one memory per thing per capture: the same story from the same person, the same loss, the same sight
    const same = list.find((x) => x.kind === d.kind && x.claim === d.claim && x.source === d.source && x.place === d.place);
    if (same) {
      if (d.salience > same.salience) Object.assign(same, d);
      return;
    }
    list.push(d);
  };
  for (const e of fresh) for (const [vid, d] of episodesOf(s, e)) add(vid, d);
  for (const v of living(s))
    if (v.duty === 'trapped' && fresh.some((e) => e.code === 'TRAPPED'))
      add(v.id, { day: s.day, kind: 'trapped', text: 'Trapped at home by the water, with no way to the shelter.', witnessed: true, source: null, credibility: 100, salience: 3, valence: -2, claim: null, event: fresh.find((e) => e.code === 'TRAPPED')!.id, place: v.homeId, scope: 'private', judge: false });
  for (const [vid, drafts] of [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const m = minds.agents[vid];
    if (!m) continue;
    const kept = drafts
      .map((d, i) => ({ d, i }))
      .sort((a, b) => b.d.salience - a.d.salience || a.i - b.i)
      .slice(0, MAX_NEW_PER_DAY)
      .sort((a, b) => a.i - b.i);
    const mine: Episode[] = [];
    for (const { d } of kept) {
      const ep = { id: `m${minds.nextEpisode++}`, ...d };
      m.episodes.push(ep);
      mine.push(ep);
      drift(m, d);
    }
    added.set(vid, mine);
    compact(s, m);
  }
  return added;
}

/** What a villager remembers, most important first: for a model's context, the conversation panel and the debrief. */
export function recall(m: Mind, n = 8, about: string | null = null): Episode[] {
  return m.episodes
    .slice()
    .sort((a, b) => Number(b.claim === about && about !== null) - Number(a.claim === about && about !== null) || b.salience - a.salience || b.day - a.day || (a.id < b.id ? 1 : -1))
    .slice(0, n);
}
