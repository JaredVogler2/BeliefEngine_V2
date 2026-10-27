import { emit, type Ctx } from '../core/events.ts';
import { claimDef, findVillager, modActive } from '../core/lookup.ts';
import type { LawState, RunState } from '../core/types.ts';
import { regionName } from './names.ts';

export interface PressureInfo {
  pressure: number;
  supporters: string[];
  opponents: string[];
  topShare: number;
  eligible: number;
}

export function electorateOf(s: RunState, claimId: string, regionId: string): string[] {
  const def = claimDef(s, claimId);
  return def.electorate?.[regionId] ?? [regionId];
}

/**
 * Weighted local support for a claim in a region. Opposition counts at half weight against support.
 * Supporters are people with conviction >= 50; topShare is the largest single voice's share of support
 * (one loud believer is not a consensus).
 */
export function computePressure(s: RunState, claimId: string, regionId: string): PressureInfo {
  const districts = new Set(electorateOf(s, claimId, regionId));
  let wsum = 0;
  let net = 0;
  let posSum = 0;
  let topPos = 0;
  const supporters: string[] = [];
  const opponents: string[] = [];
  let eligible = 0;
  for (const v of s.villagers) {
    if (v.status === 'dead' || !districts.has(v.district)) continue;
    eligible++;
    const w = 0.5 + v.traits.influence / 100;
    const c = v.beliefs[claimId]?.conv ?? 0;
    wsum += w;
    if (c > 0) {
      net += (w * c) / 100;
      posSum += w * c;
      if (w * c > topPos) topPos = w * c;
    } else if (c < 0) net += (0.5 * w * c) / 100;
    if (c >= 50) supporters.push(v.id);
    if (c <= -40) opponents.push(v.id);
  }
  const pressure = wsum > 0 ? Math.max(0, Math.min(1, net / wsum)) : 0;
  return { pressure, supporters, opponents, topShare: posSum > 0 ? topPos / posSum : 0, eligible };
}

function lawLabel(s: RunState, law: LawState): string {
  return `“${claimDef(s, law.claimId).short}” in ${regionName(s, law.regionId)}`;
}

/** Steps E+F of the day: pressure, hysteresis, contradictions, activation / decay. */
export function runLawStep(ctx: Ctx): void {
  const s = ctx.s;
  const rampMul = modActive(s, 'stubborn_elders') ? 0.85 : 1;
  const decayMul = modActive(s, 'stubborn_elders') ? 0.55 : 1;
  const tentative = new Map<string, number>();

  for (const law of s.laws) {
    const def = claimDef(s, law.claimId);
    const spec = def.spec;
    const th = spec.thresholds;
    const info = computePressure(s, law.claimId, law.regionId);
    law.pressure = Math.round(info.pressure * 1000) / 1000;
    law.supporters = info.supporters;
    law.opponents = info.opponents;
    law.topShare = Math.round(info.topShare * 100) / 100;
    s.stats.peakPressure[law.id] = Math.max(s.stats.peakPressure[law.id] ?? 0, law.pressure);

    const enough = info.supporters.length >= th.minSupporters;
    const diverse = info.supporters.length < 3 || info.topShare <= 0.45;
    const above = info.pressure >= th.on;
    let prog = law.progress;
    let note: string;
    if (above && enough && diverse) {
      prog += th.ramp * rampMul * (0.7 + Math.min(1, (info.pressure - th.on) * 3));
      note = 'Support is strong enough.';
    } else if (above && !enough) {
      note = `Needs ${th.minSupporters} firm believers (has ${info.supporters.length}).`;
    } else if (above && !diverse) {
      note = 'One voice is carrying it. Win over more of the community.';
    } else if (info.pressure < th.off) {
      prog -= th.decay * decayMul;
      note = prog > 0 ? 'Support has slipped. It is fading.' : 'Too little support.';
    } else {
      note = law.status === 'dormant' ? 'Building support.' : 'Holding, but not growing.';
    }
    prog = Math.max(0, Math.min(100, prog));
    tentative.set(law.id, prog);
    law.note = note;
    law.progress = prog;
  }

  // Contradictions: at most one of a competing pair may be live in a region.
  const suppressed = new Set<string>();
  for (const a of s.laws) {
    const da = claimDef(s, a.claimId);
    for (const b of s.laws) {
      if (a === b || a.regionId !== b.regionId || a.id >= b.id) continue;
      if (!da.contradicts.includes(b.claimId) && !claimDef(s, b.claimId).contradicts.includes(a.claimId)) continue;
      if (a.progress <= 0 || b.progress <= 0) continue;
      const winnerA = a.progress !== b.progress ? a.progress > b.progress : a.pressure !== b.pressure ? a.pressure > b.pressure : a.id < b.id;
      const loser = winnerA ? b : a;
      suppressed.add(loser.id);
    }
  }

  for (const law of s.laws) {
    const def = claimDef(s, law.claimId);
    const th = def.spec.thresholds;
    const prev = law.status;
    let prog = law.progress;
    if (suppressed.has(law.id)) {
      prog = Math.max(0, Math.min(prog, 99) - th.decay);
      law.progress = prog;
      law.note = 'A competing claim holds this ground.';
    }
    let status: LawState['status'];
    if (suppressed.has(law.id) && prog > 0) status = 'suppressed';
    else if (prog >= 100) status = 'active';
    else if (prev === 'active' || prev === 'wavering') status = prog > 0 ? 'wavering' : 'dormant';
    else status = prog > 0 ? 'awakening' : 'dormant';
    law.strength = lawStrength(law, th.on, status);
    law.status = status;
    if (status !== prev) {
      law.changedDay = s.day;
      const pct = Math.round(law.pressure * 100);
      const causes: number[] = [];
      for (const sid of law.supporters.slice(0, 4)) {
        const c = findVillager(s, sid)?.beliefs[law.claimId]?.cause;
        if (c != null) causes.push(c);
      }
      if (status === 'active') {
        law.activatedDay = s.day;
        law.activeNights = 0;
        if (s.stats.firstLawDay === null) s.stats.firstLawDay = s.day;
        if (!s.stats.lawsActivated.includes(law.claimId)) s.stats.lawsActivated.push(law.claimId);
        emit(ctx, {
          step: 'law', code: 'LAW_ACTIVATED', importance: 3, claim: law.claimId, law: law.id, cause: causes,
          text: `${lawLabel(s, law)} becomes LAW. ${law.supporters.length} believers, ${pct}% support. The world begins to obey.`,
        });
      } else if (status === 'wavering' && (prev === 'active')) {
        emit(ctx, { step: 'law', code: 'LAW_WAVERING', importance: 2, claim: law.claimId, law: law.id, text: `${lawLabel(s, law)} is wavering at ${pct}% support. It may fail.` });
      } else if (status === 'dormant' && (prev === 'wavering' || prev === 'active')) {
        s.stats.lawsCollapsed++;
        emit(ctx, { step: 'law', code: 'LAW_COLLAPSED', importance: 3, claim: law.claimId, law: law.id, text: `${lawLabel(s, law)} collapses. Belief has drained away.` });
      } else if (status === 'suppressed') {
        emit(ctx, { step: 'law', code: 'LAW_SUPPRESSED', importance: 2, claim: law.claimId, law: law.id, text: `${lawLabel(s, law)} is suppressed by a competing belief.` });
      } else if (status === 'awakening' && prev === 'dormant') {
        emit(ctx, { step: 'law', code: 'LAW_AWAKENING', importance: 2, claim: law.claimId, law: law.id, text: `${lawLabel(s, law)} stirs: ${pct}% support and rising.` });
      } else if (status === 'awakening' && prev === 'suppressed') {
        emit(ctx, { step: 'law', code: 'LAW_AWAKENING', importance: 1, claim: law.claimId, law: law.id, text: `${lawLabel(s, law)} stirs again.` });
      } else if (status === 'dormant' && prev === 'awakening') {
        emit(ctx, { step: 'law', code: 'LAW_FADED', importance: 1, claim: law.claimId, law: law.id, text: `${lawLabel(s, law)} faded back to a story.` });
      }
    }
  }
}

export function lawStrength(law: LawState, on: number, status: LawState['status']): number {
  if (status !== 'active' && status !== 'wavering') return 0;
  const base = 0.6 + 0.4 * Math.max(0, Math.min(1, (law.pressure - on) / 0.2));
  const wav = status === 'wavering' ? Math.max(0.3, law.progress / 100) : 1;
  return Math.round(base * wav * 100) / 100;
}

export function activeLaws(s: RunState): LawState[] {
  return s.laws.filter((l) => l.status === 'active' || l.status === 'wavering');
}
