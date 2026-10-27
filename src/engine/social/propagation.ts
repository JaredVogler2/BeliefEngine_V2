import { emit, type Ctx } from '../core/events.ts';
import { claimDef, findVillager, repeatMult } from '../core/lookup.ts';
import { memoryFactor } from '../core/memory.ts';
import { rand } from '../core/rng.ts';
import type { RunState, Villager } from '../core/types.ts';
import { components, connected, passableMask } from '../world/nav.ts';
import { fogFactor } from '../world/sickness.ts';
import { ensureBelief, gossipDelta, K, REASON_TEXT, relevance, round1 } from './persuasion.ts';

interface Acc {
  listener: string;
  claim: string;
  sum: number;
  count: number;
  bestAbs: number;
  bestSource: string;
  reason: string;
}

function availability(v: Villager): number {
  if (v.status === 'dead') return 0;
  let a = 1;
  if (v.status === 'sick') a *= 0.5;
  if (v.status === 'injured') a *= 0.8;
  if (v.duty === 'evacuate') a *= 0.85;
  return a;
}

/**
 * Discrete propagation across graph edges. All exposures are computed from a snapshot taken at the start
 * of the step (no read/write order artefacts) and applied together. Gossip travels only over existing ties
 * between people who can actually reach each other today.
 */
export function runSocialStep(ctx: Ctx): void {
  const s = ctx.s;
  const day = s.day;
  const snap = new Map<string, Map<string, { conv: number; ev: number }>>();
  for (const v of s.villagers) {
    const m = new Map<string, { conv: number; ev: number }>();
    for (const [cid, b] of Object.entries(v.beliefs)) m.set(cid, { conv: b.conv, ev: b.evidence });
    snap.set(v.id, m);
  }
  const mask = passableMask(s.world);
  const comp = components(s.world, mask);
  const acc = new Map<string, Acc>();
  let cutContacts = 0;
  let contacts = 0;

  const edges = s.edges.slice().sort((x, y) => (x.a + x.b < y.a + y.b ? -1 : 1));
  for (const e of edges) {
    const a = findVillager(s, e.a);
    const b = findVillager(s, e.b);
    if (!a || !b || a.status === 'dead' || b.status === 'dead') continue;
    const geo = connected(s.world, comp, a.x, a.y, b.x, b.y);
    if (!geo) {
      cutContacts++;
      continue;
    }
    let p = e.rate * availability(a) * availability(b);
    if (a.district !== b.district) p *= 0.85;
    if (a.place === b.place) p = Math.min(1, p * 1.3);
    if (s.scn.features.smoke) p *= fogFactor(s, a.x, a.y, b.x, b.y);
    p = Math.min(1, p);
    const w = ctx.expect ? p : rand(s.seed, 'contact', day, e.a, e.b) < p ? 1 : 0;
    if (w <= 0) continue;
    contacts++;
    for (const [speaker, listener, trust] of [
      [a, b, e.ba],
      [b, a, e.ab],
    ] as [Villager, Villager, number][]) {
      const sm = snap.get(speaker.id)!;
      let topic: string | null = null;
      let topScore = 0;
      const keys = [...sm.keys()].sort();
      for (const cid of keys) {
        const st = sm.get(cid)!;
        const score = Math.abs(st.conv) * (1 + st.ev / 100);
        if (Math.abs(st.conv) >= K.SPREAD && score > topScore) {
          topScore = score;
          topic = cid;
        }
      }
      if (!topic) continue;
      const def = claimDef(s, topic);
      const lb = listener.beliefs[topic];
      const lsnap = snap.get(listener.id)!.get(topic);
      const st = sm.get(topic)!;
      const g = gossipDelta({
        speakerConv: st.conv,
        speakerEvidence: st.ev,
        speakerInfluence: speaker.traits.influence,
        speakerId: speaker.id,
        trust,
        edge: e,
        listener,
        listenerConv: lsnap?.conv ?? 0,
        listenerEvidence: lsnap?.ev ?? 0,
        heard: lb?.heard ?? 0,
        lastSource: lb?.lastSource ?? null,
        lastDay: lb?.lastDay ?? -1,
        day,
        relevance: relevance(def, listener),
      });
      const key = listener.id + '|' + topic;
      let ac = acc.get(key);
      if (!ac) {
        ac = { listener: listener.id, claim: topic, sum: 0, count: 0, bestAbs: 0, bestSource: speaker.id, reason: g.reason };
        acc.set(key, ac);
      }
      ac.sum += g.delta * w * repeatMult(s) * (g.delta > 0 ? memoryFactor(listener, topic) : 1);
      ac.count += w;
      if (Math.abs(g.delta * w) > ac.bestAbs) {
        ac.bestAbs = Math.abs(g.delta * w);
        ac.bestSource = speaker.id;
        ac.reason = g.reason;
      }
    }
  }

  s.flags.cutContactsToday = cutContacts;
  s.flags.contactsToday = contacts;
  applyAccumulated(ctx, acc);
  decayBeliefs(ctx);
  enforceAttention(s);
}

function applyAccumulated(ctx: Ctx, acc: Map<string, Acc>): void {
  const s = ctx.s;
  const keys = [...acc.keys()].sort();
  const positive = new Map<string, Map<string, number>>();
  for (const key of keys) {
    const ac = acc.get(key)!;
    const v = findVillager(s, ac.listener)!;
    const def = claimDef(s, ac.claim);
    const b = ensureBelief(v, ac.claim);
    const src = findVillager(s, ac.bestSource);
    const before = b.conv;
    const capped = Math.max(-K.DAILY_CAP, Math.min(K.DAILY_CAP, ac.sum));
    const after = round1(before + capped);
    b.heard += ac.count >= 0.5 ? 1 : 0;
    b.lastDay = s.day;
    b.stale = 0;
    b.lastSource = ac.bestSource;
    if (Math.abs(after - before) < 0.05) continue;
    b.conv = after;
    const crossedUp = before < 50 && after >= 50;
    const crossedDown = before >= 50 && after < 50;
    const causeIds = src?.beliefs[ac.claim]?.cause != null ? [src!.beliefs[ac.claim].cause as number] : [];
    const dir = after > before ? 'warms to' : 'cools on';
    const id = emit(ctx, {
      step: 'social',
      code: crossedUp ? 'BELIEVER_GAINED' : crossedDown ? 'BELIEVER_LOST' : 'BELIEF_SHIFT',
      importance: crossedUp || crossedDown ? 2 : Math.abs(after - before) >= 6 ? 1 : 0,
      actor: ac.bestSource,
      target: ac.listener,
      claim: ac.claim,
      reason: ac.reason,
      delta: { conviction: [Math.round(before), Math.round(after)] },
      cause: causeIds,
      text: `${v.name} ${dir} “${def.short}” (${Math.round(before)} → ${Math.round(after)}) because ${REASON_TEXT[ac.reason] ?? ac.reason}${src ? ` — ${src.name}` : ''}.`,
    });
    if (after > before) b.cause = id;
    if (after - before >= 2) {
      let m = positive.get(v.id);
      if (!m) positive.set(v.id, (m = new Map()));
      m.set(ac.claim, after - before);
    }
    if (crossedUp && s.stats.firstBeliefDay === null) s.stats.firstBeliefDay = s.day;
  }
  // competing claims crowd each other out
  for (const [vid, m] of [...positive.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const v = findVillager(s, vid)!;
    for (const [cid, gained] of [...m.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
      const def = claimDef(s, cid);
      for (const other of def.contradicts) {
        const ob = v.beliefs[other];
        if (!ob || ob.conv <= 0) continue;
        const reduce = Math.min(ob.conv, K.CONTRADICT * gained);
        if (reduce < 0.5) continue;
        const before = ob.conv;
        ob.conv = round1(ob.conv - reduce);
        emit(ctx, {
          step: 'social', code: 'BELIEF_CROWDED', importance: 0, target: vid, claim: other, reason: 'CONTRADICTION',
          delta: { conviction: [Math.round(before), Math.round(ob.conv)] },
          text: `${v.name} drifts from “${claimDef(s, other).short}” as “${def.short}” takes hold.`,
        });
      }
    }
  }
}

function decayBeliefs(ctx: Ctx): void {
  const s = ctx.s;
  for (const v of s.villagers) {
    if (v.status === 'dead') continue;
    for (const [cid, b] of Object.entries(v.beliefs)) {
      if (b.lastDay !== s.day) b.stale += 1;
      if (b.stale >= 1 && b.evidence < 60) {
        const rate = K.DECAY * (1 - (0.5 * v.traits.stubbornness) / 100) * (b.conv > 0 ? 1 : 0.6);
        const keep = b.evidence > 0 ? 1 - (0.5 * b.evidence) / 100 : 1;
        let nv = b.conv - b.conv * rate * keep;
        if (Math.abs(nv) < 1.5) nv = 0;
        b.conv = round1(nv);
      }
      if (b.evidence > 0) b.evidence = Math.max(0, Math.round((b.evidence - 1.5) * 10) / 10);
      if (b.conv === 0 && b.heard === 0 && b.evidence === 0) delete v.beliefs[cid];
    }
  }
}

function enforceAttention(s: RunState): void {
  for (const v of s.villagers) {
    let total = 0;
    for (const b of Object.values(v.beliefs)) if (b.conv > 0) total += b.conv;
    if (total <= K.ATTENTION) continue;
    const f = K.ATTENTION / total;
    for (const b of Object.values(v.beliefs)) if (b.conv > 0) b.conv = round1(b.conv * f);
  }
}
