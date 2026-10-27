import { validateSpec } from '../laws/rules.ts';
import type { ScenarioDef } from './types.ts';

const METRICS = new Set(['alive', 'homes', 'food', 'fed', 'livestock', 'trust', 'fields', 'bridge', 'legit', 'sick']);

/** Referential-integrity validation for authored or generated scenarios. Returns human-readable problems (empty = valid). */
export function validateScenario(def: ScenarioDef): string[] {
  const issues: string[] = [];
  const rt = def.runtime;
  const where = (s: string) => `${rt.id}: ${s}`;
  const landmarks = new Map(def.map.landmarks.map((l) => [l.id, l]));
  if (landmarks.size !== def.map.landmarks.length) issues.push(where('duplicate landmark ids'));
  const regionIds = new Set(def.map.regions.map((r) => r.id));
  for (const l of def.map.landmarks) {
    if (l.x < 0 || l.y < 0 || l.x >= def.map.w || l.y >= def.map.h) issues.push(where(`landmark ${l.id} is outside the map`));
    for (const [x, y] of l.tiles ?? []) if (x < 0 || y < 0 || x >= def.map.w || y >= def.map.h) issues.push(where(`landmark ${l.id} tile out of bounds`));
  }
  const villagerIds = new Set(def.villagers.map((v) => v.id));
  if (villagerIds.size !== def.villagers.length) issues.push(where('duplicate villager ids'));
  const factionIds = new Set(def.factions.map((f) => f.id));
  for (const v of def.villagers) {
    if (!landmarks.has(v.home)) issues.push(where(`villager ${v.id} home ${v.home} missing`));
    if (!landmarks.has(v.work)) issues.push(where(`villager ${v.id} work ${v.work} missing`));
    if (!factionIds.has(v.faction)) issues.push(where(`villager ${v.id} faction ${v.faction} missing`));
    if (v.trust < 0 || v.trust > 100) issues.push(where(`villager ${v.id} trust out of range`));
  }
  const seen = new Set<string>();
  for (const e of def.edges) {
    if (!villagerIds.has(e.a) || !villagerIds.has(e.b)) issues.push(where(`edge ${e.a}-${e.b} has an unknown endpoint`));
    if (e.a === e.b) issues.push(where(`edge ${e.a} is a self loop`));
    const k = [e.a, e.b].sort().join('|');
    if (seen.has(k)) issues.push(where(`duplicate edge ${k}`));
    seen.add(k);
    for (const t of [e.ab, e.ba]) if (t < -100 || t > 100) issues.push(where(`edge ${k} trust out of range`));
    if (e.rate < 0 || e.rate > 1) issues.push(where(`edge ${k} rate out of range`));
  }
  // every villager has at least one tie
  for (const id of villagerIds) if (!def.edges.some((e) => e.a === id || e.b === id)) issues.push(where(`villager ${id} has no ties`));
  for (const f of def.factions) if (!villagerIds.has(f.leader)) issues.push(where(`faction ${f.id} leader missing`));
  const claimIds = new Set(rt.claimDefs.map((c) => c.id));
  const ritualIds = new Set(rt.rituals.map((r) => r.id));
  for (const c of rt.claimDefs) {
    for (const i of validateSpec(c.spec)) issues.push(where(`claim ${c.id} spec ${i.field}: ${i.message}`));
    for (const r of c.regions) if (!regionIds.has(r)) issues.push(where(`claim ${c.id} region ${r} missing`));
    for (const x of c.contradicts) if (!claimIds.has(x)) issues.push(where(`claim ${c.id} contradicts unknown ${x}`));
    if (c.ritual && !ritualIds.has(c.ritual)) issues.push(where(`claim ${c.id} ritual ${c.ritual} missing`));
    if (!c.rival && !c.startsAvailable && c.unlockDay === undefined && !rt.starters.includes(c.id)) issues.push(where(`claim ${c.id} can never become available`));
    if (c.unlockDay !== undefined && c.unlockDay > rt.durationDays) issues.push(where(`claim ${c.id} unlocks after the run ends`));
  }
  for (const s of rt.starters) if (!claimIds.has(s)) issues.push(where(`starter ${s} is not a claim`));
  for (const r of rt.rituals) if (![...landmarks.values()].some((l) => l.kind === r.landmark)) issues.push(where(`ritual ${r.id} has no ${r.landmark} on the map`));
  if (!landmarks.has(rt.anchor)) issues.push(where(`anchor ${rt.anchor} missing`));
  if (rt.threat.length < rt.durationDays) issues.push(where('threat schedule shorter than the run'));
  for (const o of rt.objectives) if (!METRICS.has(o.metric)) issues.push(where(`objective ${o.id} uses unknown metric ${o.metric}`));
  if (!rt.objectives.some((o) => o.required)) issues.push(where('no required objective'));
  for (const rv of rt.rivals) {
    if (!claimIds.has(rv.claim) || !claimIds.has(rv.watches)) issues.push(where('rival references an unknown claim'));
    if (!villagerIds.has(rv.leader)) issues.push(where('rival leader missing'));
    if (!factionIds.has(rv.factionId)) issues.push(where('rival faction missing'));
  }
  for (const a of rt.beats) if (!a.id || !a.text) issues.push(where('beat missing id/text'));
  return issues;
}
