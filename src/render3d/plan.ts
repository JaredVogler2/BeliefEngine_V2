import type { GameEvent } from '../engine/index.ts';
import { engineToWorld } from './coords.ts';
import type { SceneLaw, SceneLandmark, SceneSnapshot } from './snapshot.ts';

/**
 * What the 3D world should show for a stretch of the run, decided as plain data. Every effect traces to an engine event id (or to the
 * state of a law the engine reports), so a test can lay a played-out run next to these lists and check that nothing is drawn that did
 * not happen and nothing that happened is left out. The effects layer only plays them; it adds no facts of its own.
 *
 * Colour language: amber is trust and protection, indigo/violet is a rival belief, cyan is rain and water pushed elsewhere, coral is
 * danger, green is safety. Every vocabulary also differs in shape (rings, dashes, drops), so colour is never the only cue.
 */
export type Vocab = 'trust' | 'resist' | 'rival' | 'rain' | 'danger' | 'safe' | 'neutral';

export const VOCAB_COLOR: Record<Vocab, number> = {
  trust: 0xf2b84b,
  resist: 0x9fb2cc,
  rival: 0x7a63ff,
  rain: 0x4cc9f0,
  danger: 0xff6b57,
  safe: 0x6fd48a,
  neutral: 0xe9e0c8,
};

export type PlanKind =
  /** a small hovering rune over one person */
  | 'rune'
  /** a pulse that spreads over the ground */
  | 'ring'
  /** a luminous trail from one place or person to another */
  | 'arc'
  /** a large rune drawn on the ground around a law's reach */
  | 'glyph'
  /** an eye over someone who saw something */
  | 'eyes'
  /** sparks or embers thrown up from a place */
  | 'burst'
  /** smoke puffs */
  | 'puffs'
  /** dust and fallen stones */
  | 'dust'
  /** water thrown up where a flood hit */
  | 'splash'
  /** rain gathering over a place */
  | 'drops'
  /** the camera is invited to look here (skipped for reduced motion) */
  | 'focus'
  /** a ripple travelling outward over the water from a source */
  | 'ripple';

export interface EffectPlan {
  kind: PlanKind;
  vocab: Vocab;
  eventId: number;
  code: string;
  /** a place, in world units */
  at?: { x: number; z: number };
  radius?: number;
  /** people it is anchored to (the layer follows them as they walk) */
  from?: string;
  to?: string;
  /** milliseconds after the call before it starts, and how long it lasts */
  delay: number;
  dur: number;
  /** `tie`: gossip along a real relationship in the village; `event`: a thing the engine logged someone doing (a messenger, a gathering) */
  via?: 'tie' | 'event';
  law?: string;
  /** a short plain-words reason for the log and for assistive text */
  why: string;
}

const tieExists = (snap: SceneSnapshot, a: string, b: string): boolean => snap.ties.some((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a));
const person = (snap: SceneSnapshot, id?: string) => (id ? snap.villagers.find((v) => v.id === id) : undefined);
const tileAt = (e: GameEvent): { x: number; z: number } | null => (e.tile ? engineToWorld(e.tile[0], e.tile[1]) : null);

/** where the bridge is: the middle of its deck */
export function bridgeCenter(snap: SceneSnapshot): { x: number; z: number } | null {
  const b = snap.landmarks.find((l) => l.kind === 'bridge');
  if (!b) return null;
  if (!b.tiles.length) return engineToWorld(b.x, b.y);
  let x = 0;
  let y = 0;
  for (const t of b.tiles) {
    x += t[0];
    y += t[1];
  }
  return engineToWorld(x / b.tiles.length, y / b.tiles.length);
}

/** the middle of the ground a law governs, or of what powers it when something does */
export function lawCenter(snap: SceneSnapshot, law: SceneLaw): { x: number; z: number } {
  if (law.sources.length) {
    let x = 0;
    let y = 0;
    for (const s of law.sources) {
      x += s.x;
      y += s.y;
    }
    return engineToWorld(x / law.sources.length, y / law.sources.length);
  }
  const reg = snap.regions.find((r) => r.id === law.regionId);
  if (reg && reg.rects.length) {
    let area = 0;
    let x = 0;
    let y = 0;
    for (const r of reg.rects) {
      const a = (r[2] - r[0] + 1) * (r[3] - r[1] + 1);
      area += a;
      x += ((r[0] + r[2]) / 2) * a;
      y += ((r[1] + r[3]) / 2) * a;
    }
    return engineToWorld(x / area, y / area);
  }
  return engineToWorld(snap.w / 2, snap.h / 2);
}

/** how far across a law's ground reaches, for the size of the rune drawn there */
export function lawExtent(snap: SceneSnapshot, law: SceneLaw): number {
  const reg = snap.regions.find((r) => r.id === law.regionId);
  if (!reg || !reg.rects.length) return 4;
  let m = 0;
  for (const r of reg.rects) m = Math.max(m, Math.hypot(r[2] - r[0] + 1, r[3] - r[1] + 1) / 2);
  return Math.min(9, Math.max(2.5, m));
}

export function lawVocab(law: SceneLaw): Vocab {
  if (law.rival) return 'rival';
  if (law.subject === 'rain') return 'rain';
  if (law.subject === 'grain') return 'safe';
  return 'trust';
}

/** the landmarks a law of this trigger kind would need to be lit, rung or manned */
export function catalystKinds(trigger: string): string[] {
  switch (trigger) {
    case 'lit_beacon':
      return ['beacon'];
    case 'smoke_fire':
      return ['campfire'];
    case 'bell':
      return ['belltower'];
    case 'watchers':
      return ['bridge'];
    default:
      return [];
  }
}

export interface LawVisual {
  law: string;
  claim: string;
  region: string;
  vocab: Vocab;
  status: string;
  /** 0..1 how strongly the ground glows: support rising while it awakens, then the strength it applies */
  level: number;
  /** the engine reports something powering it tonight (or it needs no single source) */
  powered: boolean;
  /** what the trigger needs and the village does not have right now, if anything */
  missing: string | null;
  sources: { x: number; z: number }[];
  /** where the missing catalyst would stand: shown as an empty, cold marker */
  candidates: { x: number; z: number; id: string }[];
  /** the law moves water, and may be shown to push it */
  river: boolean;
  radius: number;
  center: { x: number; z: number };
  subject: string;
  effect: string;
  trigger: string;
}

/** The state of every law as the ground and sky should speak it. Nothing here invents progress: it is the engine's own numbers. */
export function lawVisuals(snap: SceneSnapshot): LawVisual[] {
  const out: LawVisual[] = [];
  for (const l of snap.laws) {
    if (l.status === 'dormant') continue;
    const powered = l.regionWide || l.sources.length > 0;
    const kinds = catalystKinds(l.trigger);
    const candidates = snap.landmarks
      .filter((m: SceneLandmark) => kinds.includes(m.kind) && m.hp > 0)
      .map((m) => ({ ...engineToWorld(m.x, m.y), id: m.id }));
    let level = 0;
    switch (l.status) {
      case 'awakening':
        level = Math.min(0.55, 0.12 + 0.43 * Math.min(1, Math.max(0, l.progress / 100)));
        break;
      case 'active':
        level = 0.6 + 0.4 * Math.min(1, Math.max(0, l.strength));
        break;
      case 'wavering':
        level = 0.32;
        break;
      case 'suppressed':
        level = 0.14;
        break;
    }
    const need = l.trigger === 'lit_beacon' ? 'a lit beacon' : l.trigger === 'smoke_fire' ? 'a burning campfire' : l.trigger === 'bell' ? 'a rung bell' : l.trigger === 'watchers' ? 'enough watchers on the bridge' : null;
    out.push({
      law: l.id,
      claim: l.claimId,
      region: l.regionId,
      vocab: lawVocab(l),
      status: l.status,
      level,
      powered,
      missing: !powered && need ? need : null,
      sources: l.sources.map((s) => engineToWorld(s.x, s.y)),
      candidates: powered ? [] : candidates,
      river: l.subject === 'river',
      radius: l.radius,
      center: lawCenter(snap, l),
      subject: l.subject,
      effect: l.effect,
      trigger: l.trigger,
    });
  }
  return out;
}

export interface PlanOpts {
  reduced: boolean;
}

const MAX_ARCS = 26;

/** Immediate feedback for what the Keeper just did. */
export function planAction(events: GameEvent[], snap: SceneSnapshot, o: PlanOpts): EffectPlan[] {
  const out: EffectPlan[] = [];
  const r = o.reduced;
  const reachedBy = (e: GameEvent): string[] =>
    snap.villagers.filter((v) => v.status !== 'dead' && Object.entries(v.cause).some(([c, id]) => id === e.id && (!e.claim || c === e.claim))).map((v) => v.id);
  for (const e of events) {
    switch (e.code) {
      case 'RUMOR_SEEDED':
        if (e.target && person(snap, e.target)) {
          out.push({ kind: 'rune', vocab: 'trust', eventId: e.id, code: e.code, to: e.target, delay: 0, dur: r ? 400 : 1800, why: 'A story is put into one listener’s head.' });
          out.push({ kind: 'ring', vocab: 'trust', eventId: e.id, code: e.code, to: e.target, radius: 0.9, delay: 0, dur: r ? 300 : 1100, why: 'The listener’s conviction rises.' });
        }
        break;
      case 'MESSENGER_SENT':
        if (e.actor && e.target && person(snap, e.actor) && person(snap, e.target)) {
          const bad = e.reason === 'DISTRUST_REVERSAL';
          out.push({ kind: 'arc', vocab: bad ? 'resist' : 'trust', eventId: e.id, code: e.code, from: e.actor, to: e.target, delay: 0, dur: r ? 300 : 1300, via: tieExists(snap, e.actor, e.target) ? 'tie' : 'event', why: bad ? 'A messenger meets distrust.' : 'A messenger carries the story.' });
        }
        break;
      case 'RUMOR_CHALLENGED':
        if (e.target && person(snap, e.target)) {
          out.push({ kind: 'ring', vocab: 'rival', eventId: e.id, code: e.code, to: e.target, radius: 1.5, delay: 0, dur: r ? 300 : 1300, why: 'A counter-story contests the listener.' });
          out.push({ kind: 'ring', vocab: 'trust', eventId: e.id, code: e.code, to: e.target, radius: 1.0, delay: r ? 0 : 280, dur: r ? 300 : 1100, why: 'Your story pushes back.' });
        }
        break;
      case 'EVIDENCE_STAGED':
      case 'EVIDENCE_BACKFIRED': {
        const p = tileAt(e);
        const good = e.code === 'EVIDENCE_STAGED';
        if (p) out.push({ kind: 'ring', vocab: good ? 'trust' : 'danger', eventId: e.id, code: e.code, at: p, radius: 2.4, delay: 0, dur: r ? 300 : 1200, why: good ? 'Evidence is staged for the village to see.' : 'The staged evidence backfires.' });
        let k = 0;
        for (const id of reachedBy(e)) if (k++ < 8) out.push({ kind: 'eyes', vocab: good ? 'trust' : 'danger', eventId: e.id, code: e.code, to: id, delay: r ? 0 : 150 + k * 70, dur: r ? 400 : 1500, why: good ? 'Saw it.' : 'Saw it fail.' });
        break;
      }
      case 'RITUAL': {
        const p = tileAt(e);
        if (p) out.push({ kind: 'ring', vocab: e.text.startsWith('Ring') ? 'rain' : 'trust', eventId: e.id, code: e.code, at: p, radius: e.text.startsWith('Ring') ? 4 : 2, delay: 0, dur: r ? 300 : 1300, why: 'A ritual is performed here.' });
        break;
      }
      case 'GATHERING': {
        const p = tileAt(e);
        if (p) out.push({ kind: 'ring', vocab: 'trust', eventId: e.id, code: e.code, at: p, radius: 4, delay: 0, dur: r ? 300 : 1300, why: 'The village is called together.' });
        let k = 0;
        if (p)
          for (const id of reachedBy(e)) if (k++ < 8) out.push({ kind: 'arc', vocab: 'trust', eventId: e.id, code: e.code, at: p, to: id, delay: r ? 0 : k * 60, dur: r ? 250 : 1000, via: 'event', why: 'Called to the gathering.' });
        break;
      }
      case 'SCOUT':
        if (e.target && person(snap, e.target)) out.push({ kind: 'eyes', vocab: 'neutral', eventId: e.id, code: e.code, to: e.target, delay: 0, dur: r ? 300 : 1200, why: 'You read their mind.' });
        break;
    }
  }
  return out;
}

/** What the dawn showed: the social spread, the laws waking or failing, the hazards and their consequences. */
export function planResolution(events: GameEvent[], snap: SceneSnapshot, prev: SceneSnapshot | null, o: PlanOpts): EffectPlan[] {
  const out: EffectPlan[] = [];
  const r = o.reduced;
  let delay = 200;
  let arcs = 0;
  const lawOf = (e: GameEvent): SceneLaw | undefined => (e.law ? snap.laws.find((l) => l.id === e.law) : undefined);
  const bridge = bridgeCenter(snap);
  for (const e of events) {
    if (out.length > 90) break;
    switch (e.code) {
      case 'BELIEF_SHIFT':
      case 'BELIEVER_GAINED':
      case 'BELIEVER_LOST': {
        const lost = e.code === 'BELIEVER_LOST' || e.reason === 'DISTRUST_REVERSAL';
        // a trail is drawn only along a relationship that exists; without one the change is a rune over the person and nothing else
        if (e.actor && e.target && e.actor !== e.target && person(snap, e.actor) && person(snap, e.target) && tieExists(snap, e.actor, e.target) && arcs < MAX_ARCS) {
          out.push({ kind: 'arc', vocab: lost ? 'resist' : 'trust', eventId: e.id, code: e.code, from: e.actor, to: e.target, delay, dur: r ? 200 : 1000, via: 'tie', why: lost ? 'Distrust: the story is refused.' : 'Trusted gossip carries the story.' });
          arcs++;
          delay += r ? 20 : 90;
        }
        if (e.code === 'BELIEVER_GAINED' && e.target && person(snap, e.target)) out.push({ kind: 'rune', vocab: 'trust', eventId: e.id, code: e.code, to: e.target, delay: delay + 500, dur: r ? 300 : 1400, why: 'A new believer.' });
        break;
      }
      case 'RIVAL_CAMPAIGN':
      case 'RIVAL_REBUTTAL': {
        if (e.actor && e.target && person(snap, e.actor) && person(snap, e.target) && arcs < MAX_ARCS) {
          out.push({ kind: 'arc', vocab: 'rival', eventId: e.id, code: e.code, from: e.actor, to: e.target, delay, dur: r ? 200 : 1100, via: tieExists(snap, e.actor, e.target) ? 'tie' : 'event', why: 'A rival story spreads.' });
          arcs++;
        }
        if (e.target && person(snap, e.target)) out.push({ kind: 'ring', vocab: 'rival', eventId: e.id, code: e.code, to: e.target, radius: 1.4, delay: delay + 300, dur: r ? 300 : 1200, why: 'A counter-belief contests the same ground.' });
        break;
      }
      case 'LAW_AWAKENING': {
        const l = lawOf(e);
        if (l) out.push({ kind: 'glyph', vocab: lawVocab(l), eventId: e.id, code: e.code, at: lawCenter(snap, l), radius: lawExtent(snap, l), law: l.id, delay: delay + 100, dur: r ? 400 : 1600, why: 'Belief is gathering around this ground.' });
        break;
      }
      case 'LAW_ACTIVATED': {
        const l = lawOf(e);
        if (!l) break;
        const c = lawCenter(snap, l);
        const v = lawVocab(l);
        out.push({ kind: 'glyph', vocab: v, eventId: e.id, code: e.code, at: c, radius: lawExtent(snap, l), law: l.id, delay: delay + 150, dur: r ? 500 : 1900, why: 'The law wakes.' });
        out.push({ kind: 'ring', vocab: v, eventId: e.id, code: e.code, at: c, radius: lawExtent(snap, l) + 1, law: l.id, delay: delay + 250, dur: r ? 400 : 1700, why: 'The law wakes.' });
        for (const s of l.sources) out.push({ kind: 'ripple', vocab: v, eventId: e.id, code: e.code, at: engineToWorld(s.x, s.y), radius: Math.max(2, l.radius), law: l.id, delay: delay + 500, dur: r ? 400 : 2000, why: 'The law’s power goes out from its source.' });
        out.push({ kind: 'focus', vocab: v, eventId: e.id, code: e.code, at: c, law: l.id, delay: delay + 200, dur: 1, why: 'Look here.' });
        break;
      }
      case 'LAW_WAVERING': {
        const l = lawOf(e);
        if (l) out.push({ kind: 'ring', vocab: 'resist', eventId: e.id, code: e.code, at: lawCenter(snap, l), radius: Math.max(1.5, lawExtent(snap, l) * 0.6), law: l.id, delay: delay + 100, dur: r ? 300 : 1300, why: 'The law is wavering.' });
        break;
      }
      case 'LAW_COLLAPSED':
      case 'LAW_SUPPRESSED':
      case 'LAW_FADED':
      case 'LAW_DISCREDITED': {
        const l = lawOf(e);
        if (l) out.push({ kind: 'ring', vocab: 'danger', eventId: e.id, code: e.code, at: lawCenter(snap, l), radius: Math.max(1.8, lawExtent(snap, l) * 0.7), law: l.id, delay: delay + 100, dur: r ? 300 : 1400, why: 'The law has lost its hold.' });
        break;
      }
      case 'HOME_SPARED':
      case 'FIELD_SPARED':
      case 'PEN_SPARED': {
        const p = tileAt(e);
        if (p) out.push({ kind: 'ring', vocab: 'safe', eventId: e.id, code: e.code, at: p, radius: 1.3, delay: delay + 500, dur: r ? 300 : 1300, why: 'Spared.' });
        break;
      }
      case 'LIFE_SPARED':
        if (e.target && person(snap, e.target)) out.push({ kind: 'ring', vocab: 'safe', eventId: e.id, code: e.code, to: e.target, radius: 0.9, delay: delay + 500, dur: r ? 300 : 1300, why: 'Spared.' });
        break;
      case 'BRIDGE_HELD':
      case 'WATCHERS':
        if (bridge) out.push({ kind: 'ring', vocab: 'trust', eventId: e.id, code: e.code, at: bridge, radius: 2.4, delay: delay + 400, dur: r ? 300 : 1500, why: e.code === 'BRIDGE_HELD' ? 'The bridge stands.' : 'Watchers keep the bridge.' });
        break;
      case 'WATCHER_DEFECTS':
        if (bridge) out.push({ kind: 'ring', vocab: 'resist', eventId: e.id, code: e.code, at: bridge, radius: 1.8, delay: delay + 300, dur: r ? 300 : 1200, why: 'A watcher leaves the bridge.' });
        break;
      case 'BRIDGE_DAMAGED':
      case 'BRIDGE_COLLAPSED':
        if (bridge) {
          out.push({ kind: 'dust', vocab: 'danger', eventId: e.id, code: e.code, at: bridge, radius: e.code === 'BRIDGE_COLLAPSED' ? 2.4 : 1.4, delay: delay + 400, dur: r ? 400 : 1800, why: e.code === 'BRIDGE_COLLAPSED' ? 'The bridge gives way.' : 'The bridge is cracked.' });
          if (e.code === 'BRIDGE_COLLAPSED') out.push({ kind: 'focus', vocab: 'danger', eventId: e.id, code: e.code, at: bridge, delay: delay + 300, dur: 1, why: 'Look here.' });
        }
        break;
      case 'HOME_DAMAGED':
      case 'HOME_DESTROYED':
      case 'FIELD_FLOODED': {
        const p = tileAt(e);
        if (p) out.push({ kind: e.code === 'HOME_DESTROYED' ? 'dust' : 'splash', vocab: e.code === 'HOME_DESTROYED' ? 'danger' : 'rain', eventId: e.id, code: e.code, at: p, radius: 1.2, delay: delay + 300, dur: r ? 400 : 1500, why: e.code === 'FIELD_FLOODED' ? 'The flood reaches the field.' : 'The water hits the house.' });
        break;
      }
      case 'FIRE_STARTED':
      case 'FIRE_SPREAD':
      case 'FIELD_BURNED': {
        const p = tileAt(e);
        if (p) out.push({ kind: 'burst', vocab: 'danger', eventId: e.id, code: e.code, at: p, radius: 1, delay: delay + 300, dur: r ? 400 : 1500, why: 'Fire.' });
        break;
      }
      case 'SMOKE_SICKNESS':
        if (e.target && person(snap, e.target)) out.push({ kind: 'puffs', vocab: 'resist', eventId: e.id, code: e.code, to: e.target, delay: delay + 300, dur: r ? 400 : 1600, why: 'Smoke sickens them.' });
        break;
      case 'DEATH':
        if (e.target && person(snap, e.target)) out.push({ kind: 'ring', vocab: 'resist', eventId: e.id, code: e.code, to: e.target, radius: 1.1, delay: delay + 600, dur: r ? 400 : 1700, why: 'A life is lost.' });
        break;
      case 'RAIN_DISPLACED': {
        // the rain the bells turned away: shown where the engine really added depth, never anywhere else
        if (!prev) break;
        let n = 0;
        let sx = 0;
        let sz = 0;
        for (let i = 0; i < snap.water.length; i++) {
          if (snap.water[i] > prev.water[i] + 0.4 && snap.terrain[i] !== 1) {
            n++;
            sx += i % snap.w;
            sz += Math.floor(i / snap.w);
          }
        }
        if (n) {
          const c = engineToWorld(sx / n, sz / n);
          out.push({ kind: 'drops', vocab: 'rain', eventId: e.id, code: e.code, at: c, radius: Math.min(5, 1.5 + Math.sqrt(n) * 0.6), delay: delay + 200, dur: r ? 500 : 2400, why: 'The rain turned away pools on this low ground.' });
        }
        break;
      }
    }
  }
  return out;
}
