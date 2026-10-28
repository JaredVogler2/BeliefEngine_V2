import { deepCopy } from '../core/clone.ts';
import { claimDef } from '../core/lookup.ts';
import { hashValue } from '../core/hash.ts';
import { stateHash } from '../core/replay.ts';
import type { RunState } from '../core/types.ts';
import { aliveCount } from '../world/economy.ts';
import { parseExpeditionId, generateExpedition } from '../gen/expedition.ts';
import { ACHIEVEMENTS, type AchievementCtx, type AchievementDef } from './achievements.ts';
import { KNOWLEDGE, knowledgeFrom, type KnowledgeDef } from './knowledge.ts';
import { pledgesOf } from './options.ts';
import { PROGRESS_VERSION, emptyProgress, type AtlasLaw, type Progress, type RunRecord, type RunVariant } from './types.ts';
import { UNLOCKS, type UnlockDef } from './unlocks.ts';

export const MAX_RUNS = 300;

/** The one-sentence ending that goes in the Atlas, written from what actually happened. */
export function postcardFor(s: RunState): string {
  const alive = aliveCount(s);
  const total = s.villagers.length;
  const laws = [...new Set(s.stats.lawsActivated.map((l) => l.split('@')[0]))].map((id) => claimDef(s, id).short);
  const lawBit = laws.length ? `they still tell of “${laws[0]}”` : 'no story ever became law';
  const finale = s.scn.finale ?? 'the crisis';
  if (s.outcome?.result === 'victory') {
    const lost = total - alive;
    return `${alive} of ${total} lived through ${finale}${lost ? `, ${lost} remembered at the chapel` : ', and nobody was lost'}; ${lawBit}.`;
  }
  const cause = s.outcome?.reason.replace(/\.$/, '') ?? 'the village fell';
  return `${finale[0].toUpperCase()}${finale.slice(1)} took the village (${alive} of ${total} left): ${cause.toLowerCase()}; ${lawBit}.`;
}

export function strategyKey(s: RunState): string {
  const biome = parseExpeditionId(s.scenarioId) ? generateExpedition(s.seed).bp.biome : s.scenarioId;
  const laws = [...new Set(s.stats.lawsActivated.map((l) => l.split('@')[0]))].sort();
  return `${biome}|${laws.join('+') || 'none'}${s.stats.tradeDeals > 0 ? '|trade' : ''}`;
}

/** The V2 mode a run was played in, or null for Classic. */
export function variantOf(s: RunState): RunVariant | null {
  return s.flags.reality === 2 ? 'lab' : s.flags.reality === 3 ? 'living' : s.flags.reality === 1 ? 'chronicle' : null;
}

export function makeRecord(s: RunState, opts: { debug: boolean; finishedAt?: string }): RunRecord {
  if (!s.outcome) throw new Error('makeRecord: the run is not over');
  const x = parseExpeditionId(s.scenarioId);
  const rec: Omit<RunRecord, 'signature'> = {
    id: `${s.scenarioId}:${s.seed}:${stateHash(s)}`,
    scenarioId: s.scenarioId,
    name: s.scn.name,
    mode: s.mode,
    ...(x ? { biome: generateExpedition(x.seed).bp.biome } : {}),
    seed: s.seed,
    difficulty: s.difficulty,
    result: s.outcome.result,
    score: s.outcome.score,
    medal: s.outcome.medal,
    day: s.outcome.day,
    alive: aliveCount(s),
    total: s.villagers.length,
    rules: s.rulesVersion,
    ...(s.flags.dailyDate ? { dailyDate: s.flags.dailyDate } : {}),
    modifiers: s.modifiers.filter((m) => !m.startsWith('pledge:')),
    pledges: pledgesOf(s.modifiers),
    drafted: !!s.flags.drafted,
    twisted: s.flags.twisted ?? 0,
    laws: [...new Set(s.stats.lawsActivated.map((l) => l.split('@')[0]))],
    strategy: strategyKey(s),
    apSpent: s.stats.apSpent,
    rescued: s.stats.homesSpared + s.stats.livesSaved,
    debug: opts.debug,
    ...(s.flags.inventor ? { custom: true } : {}),
    ...(variantOf(s) ? { variant: variantOf(s)! } : {}),
    ...(opts.finishedAt ? { finishedAt: opts.finishedAt } : {}),
  };
  return { ...rec, signature: hashValue([rec.id, rec.result, rec.score, rec.rules, rec.debug]).slice(0, 10) };
}

export interface RunReward {
  progress: Progress;
  record: RunRecord;
  duplicate: boolean;
  newAchievements: AchievementDef[];
  newUnlocks: UnlockDef[];
  newKnowledge: KnowledgeDef[];
  newLaws: string[];
  postcard: string;
}

/**
 * Fold a finished run into the archive. Pure: the input is not modified. A debug run is archived but earns nothing, and the same
 * finished run (same scenario, seed and final state) is never counted twice.
 */
export function applyRun(before: Progress, s: RunState, opts: { debug: boolean; finishedAt?: string }): RunReward {
  const record = makeRecord(s, opts);
  const p: Progress = deepCopy(before);
  const postcard = postcardFor(s);
  if (p.runs.some((r) => r.id === record.id)) return { progress: p, record, duplicate: true, newAchievements: [], newUnlocks: [], newKnowledge: [], newLaws: [], postcard };
  p.runs.push(record);
  if (p.runs.length > MAX_RUNS) p.runs = p.runs.slice(-MAX_RUNS);
  if (opts.debug) return { progress: p, record, duplicate: false, newAchievements: [], newUnlocks: [], newKnowledge: [], newLaws: [], postcard };
  if (record.custom) {
    // an Inventor run is kept apart: no atlas entries, no unlocks, no ranked badges; its own badge only
    const ctx: AchievementCtx = { s, rec: record, before, runs: p.runs.filter((r) => !r.custom && !r.variant), atlasLaws: new Set(Object.keys(p.atlas.laws)), newKnowledge: [] };
    const own = ACHIEVEMENTS.filter((a) => a.id === 'custom_law' && !p.achievements[a.id] && a.test(ctx));
    for (const a of own) p.achievements[a.id] = { run: record.id, ...(opts.finishedAt ? { at: opts.finishedAt } : {}) };
    return { progress: p, record, duplicate: false, newAchievements: own, newUnlocks: [], newKnowledge: [], newLaws: [], postcard };
  }
  if (record.variant) {
    // a V2 mode keeps its own records (personalBest and progressStats split by variant); it unlocks nothing and earns no Classic
    // badge, so Classic's balance and its records stay exactly V1's. A Generative Chronicle remembers the beliefs it wrote that became
    // law, as entries to read, never as power for a later run. Reality Lab is unranked: recorded, and nothing else.
    if (record.variant === 'chronicle') rememberInvented(p, s);
    return { progress: p, record, duplicate: false, newAchievements: [], newUnlocks: [], newKnowledge: [], newLaws: [], postcard };
  }

  // atlas: laws, knowledge, postcards
  const newLaws: string[] = [];
  for (const law of s.laws.filter((l) => l.activatedDay !== null)) {
    const claim = law.claimId;
    const region = law.regionId;
    const lawId = law.id;
    const def = s.scn.claimDefs.find((c) => c.id === claim);
    if (!def) continue;
    let entry: AtlasLaw | undefined = p.atlas.laws[claim];
    if (!entry) {
      entry = { claimId: claim, text: def.text, short: def.short, benefit: def.benefit, risk: def.risk, scenarios: [], regions: [], activations: 0, effects: [] };
      p.atlas.laws[claim] = entry;
      newLaws.push(claim);
    }
    entry.activations += 1;
    if (!entry.scenarios.includes(s.scn.name)) entry.scenarios.push(s.scn.name);
    const rname = s.world.regions.find((r) => r.id === region)?.name ?? region;
    if (!entry.regions.includes(rname)) entry.regions.push(rname);
    for (const e of s.log) if (e.law === lawId && e.code !== 'LAW_ACTIVATED' && e.importance >= 2 && !entry.effects.includes(e.code)) entry.effects.push(e.code);
  }
  const newKnowledgeIds = knowledgeFrom(s).filter((id) => !p.atlas.knowledge[id]);
  for (const id of newKnowledgeIds) p.atlas.knowledge[id] = { run: record.id };
  const cards = (p.atlas.postcards[s.scenarioId] ??= []);
  if (!cards.includes(postcard)) cards.push(postcard);
  p.atlas.postcards[s.scenarioId] = cards.slice(-6);

  // achievements, then unlocks (evaluated against the archive including this run)
  const ctx: AchievementCtx = { s, rec: record, before, runs: p.runs.filter((r) => !r.custom && !r.variant), atlasLaws: new Set(Object.keys(p.atlas.laws)), newKnowledge: newKnowledgeIds };
  const newAchievements = ACHIEVEMENTS.filter((a) => !p.achievements[a.id] && a.test(ctx));
  for (const a of newAchievements) p.achievements[a.id] = { run: record.id, ...(opts.finishedAt ? { at: opts.finishedAt } : {}) };
  const newUnlocks = UNLOCKS.filter((u) => !p.unlocks[u.id] && u.test(ctx));
  for (const u of newUnlocks) p.unlocks[u.id] = { run: record.id, ...(opts.finishedAt ? { at: opts.finishedAt } : {}) };
  return { progress: p, record, duplicate: false, newAchievements, newUnlocks, newKnowledge: KNOWLEDGE.filter((k) => newKnowledgeIds.includes(k.id)), newLaws, postcard };
}

/** Written beliefs of a Generative Chronicle run that became law, into the atlas (text and what they did; no gameplay effect). */
function rememberInvented(p: Progress, s: RunState): void {
  const inv = (p.atlas.invented ??= {});
  for (const law of s.laws.filter((l) => l.activatedDay !== null)) {
    const def = s.claims.find((c) => c.id === law.claimId)?.def;
    if (!def?.reality || def.rival) continue;
    const key = def.reality.hash;
    const entry = (inv[key] ??= { hash: key, text: def.text.slice(0, 240), short: def.short.slice(0, 80), mechanics: def.benefit.slice(0, 400), scenarios: [], activations: 0, effects: [] });
    entry.activations += 1;
    if (!entry.scenarios.includes(s.scn.name)) entry.scenarios.push(s.scn.name);
    for (const e of s.log) if (e.law === law.id && e.code !== 'LAW_ACTIVATED' && e.importance >= 2 && !entry.effects.includes(e.code) && entry.effects.length < 12) entry.effects.push(e.code);
  }
  // a bounded keepsake: the 60 most recently activated beliefs
  const keys = Object.keys(inv);
  if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete inv[k];
}

// ------------------------------------------------------------------ stats

export interface ProgressStats {
  runs: number;
  victories: number;
  chaptersCompleted: number;
  uniqueLaws: number;
  rescued: number;
  averageScoreByMode: Record<string, number>;
  favoriteStrategy: string | null;
  bestDaily: { date: number; score: number } | null;
  achievements: number;
  knowledge: number;
  /** each V2 mode's own record, apart from Classic's (which the fields above describe) */
  variants: Record<RunVariant, { runs: number; victories: number; best: number | null }>;
  invented: number;
}

export function progressStats(p: Progress): ProgressStats {
  const real = p.runs.filter((r) => !r.debug && !r.custom && !r.variant);
  const wins = real.filter((r) => r.result === 'victory');
  const byMode: Record<string, number[]> = {};
  for (const r of wins) (byMode[r.mode] ??= []).push(r.score);
  const strategies: Record<string, number> = {};
  for (const r of real) if (r.laws.length) strategies[r.strategy] = (strategies[r.strategy] ?? 0) + 1;
  const fav = Object.entries(strategies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  const daily = wins.filter((r) => r.mode === 'daily' && r.dailyDate).sort((a, b) => b.score - a.score)[0];
  return {
    runs: real.length,
    victories: wins.length,
    chaptersCompleted: new Set(wins.filter((r) => r.mode === 'story').map((r) => r.scenarioId)).size,
    uniqueLaws: Object.keys(p.atlas.laws).length,
    rescued: real.reduce((a, r) => a + r.rescued, 0),
    averageScoreByMode: Object.fromEntries(Object.entries(byMode).map(([m, xs]) => [m, Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)])),
    favoriteStrategy: fav ? fav[0] : null,
    bestDaily: daily ? { date: daily.dailyDate!, score: daily.score } : null,
    achievements: Object.keys(p.achievements).length,
    knowledge: Object.keys(p.atlas.knowledge).length,
    variants: Object.fromEntries((['chronicle', 'living', 'lab'] as RunVariant[]).map((v) => {
      const rs = p.runs.filter((r) => !r.debug && r.variant === v);
      const won = rs.filter((r) => r.result === 'victory');
      return [v, { runs: rs.length, victories: won.length, best: v === 'lab' || !won.length ? null : Math.max(...won.map((r) => r.score)) }];
    })) as ProgressStats['variants'],
    invented: Object.keys(p.atlas.invented ?? {}).length,
  };
}

/** Best earlier victory with the same scenario/village, difficulty and rules (so comparisons are fair), excluding `rec` itself. */
export function personalBest(p: Progress, rec: RunRecord): RunRecord | null {
  // a V2 mode is compared only with runs of the same mode (Reality Lab with nothing: it is unranked)
  if (rec.variant === 'lab') return null;
  const same = p.runs.filter((r) => !r.debug && r.id !== rec.id && r.result === 'victory' && r.scenarioId === rec.scenarioId && r.difficulty === rec.difficulty && r.rules === rec.rules && r.pledges.join() === rec.pledges.join() && (r.variant ?? null) === (rec.variant ?? null));
  return same.sort((a, b) => b.score - a.score)[0] ?? null;
}

// ------------------------------------------------------------------ export / import / migration

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 400): string | null => (typeof v === 'string' && v.length <= max ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strs = (v: unknown, max = 60): string[] | null => (Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && x.length <= 200) ? (v as string[]) : null);

export function exportProgress(p: Progress): string {
  return JSON.stringify({ format: 'belief-engine-progress', ...p }, null, 1);
}

function cleanRecord(v: unknown): RunRecord | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 200);
  const scenarioId = str(v.scenarioId, 100);
  const name = str(v.name, 200);
  const mode = v.mode;
  const result = v.result;
  const seed = num(v.seed);
  const score = num(v.score);
  if (!id || !scenarioId || !name || seed === null || score === null) return null;
  if (!['story', 'expedition', 'daily', 'sandbox'].includes(String(mode)) || (result !== 'victory' && result !== 'defeat')) return null;
  const difficulty = ['story', 'normal', 'hard'].includes(String(v.difficulty)) ? (v.difficulty as RunRecord['difficulty']) : 'normal';
  const medal = ['none', 'bronze', 'silver', 'gold'].includes(String(v.medal)) ? (v.medal as RunRecord['medal']) : 'none';
  return {
    id, scenarioId, name, mode: mode as RunRecord['mode'], ...(str(v.biome, 20) ? { biome: str(v.biome, 20)! } : {}), seed, difficulty, result, score: Math.round(score), medal,
    day: num(v.day) ?? 0, alive: num(v.alive) ?? 0, total: num(v.total) ?? 0, rules: str(v.rules, 24) ?? '', ...(num(v.dailyDate) ? { dailyDate: num(v.dailyDate)! } : {}),
    modifiers: strs(v.modifiers) ?? [], pledges: strs(v.pledges) ?? [], drafted: v.drafted === true, twisted: num(v.twisted) ?? 0, laws: strs(v.laws) ?? [],
    strategy: str(v.strategy, 200) ?? '', apSpent: num(v.apSpent) ?? 0, rescued: num(v.rescued) ?? 0, debug: v.debug === true, signature: str(v.signature, 20) ?? '',
    ...(str(v.finishedAt, 40) ? { finishedAt: str(v.finishedAt, 40)! } : {}),
    // kept apart on import too: an imported Inventor or V2 run must not turn into a Classic one
    ...(v.custom === true ? { custom: true } : {}),
    ...(['chronicle', 'living', 'lab'].includes(String(v.variant)) ? { variant: v.variant as RunVariant } : {}),
  };
}

export type ImportResult = { ok: true; progress: Progress; migrated: boolean } | { ok: false; error: string };

/**
 * Defensive import. Accepts the current format and the first (v1) archive; drops unknown fields and unknown ids; rejects anything that
 * is not shaped like a Belief Engine archive. Never throws.
 */
export function importProgress(json: string): ImportResult {
  if (json.length > 2_000_000) return { ok: false, error: 'That file is too large to be a Belief Engine archive.' };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'That is not valid JSON.' };
  }
  if (!isObj(raw)) return { ok: false, error: 'That is not a Belief Engine archive.' };
  const ver = raw.version;
  if (typeof ver !== 'number') return { ok: false, error: 'That is not a Belief Engine archive.' };
  if (ver > PROGRESS_VERSION) return { ok: false, error: `This archive is from a newer version of the game (format ${ver}).` };
  if (ver < 1) return { ok: false, error: 'This archive format is not recognised.' };
  if (!Array.isArray(raw.runs)) return { ok: false, error: 'The archive has no run list.' };
  const runs: RunRecord[] = [];
  for (const r of raw.runs.slice(-MAX_RUNS)) {
    if (ver === 1) {
      const old = migrateV1Run(r);
      if (old) runs.push(old);
    } else {
      const c = cleanRecord(r);
      if (c) runs.push(c);
    }
  }
  const p = emptyProgress();
  p.runs = runs;
  if (ver >= 2) {
    const ach = isObj(raw.achievements) ? raw.achievements : {};
    for (const a of ACHIEVEMENTS) {
      const e = ach[a.id];
      if (isObj(e) && str(e.run, 200)) p.achievements[a.id] = { run: e.run as string, ...(str(e.at, 40) ? { at: e.at as string } : {}) };
    }
    const un = isObj(raw.unlocks) ? raw.unlocks : {};
    for (const u of UNLOCKS) {
      const e = un[u.id];
      if (isObj(e) && str(e.run, 200)) p.unlocks[u.id] = { run: e.run as string, ...(str(e.at, 40) ? { at: e.at as string } : {}) };
    }
    const atlas = isObj(raw.atlas) ? raw.atlas : {};
    const laws = isObj(atlas.laws) ? atlas.laws : {};
    for (const [id, v] of Object.entries(laws)) {
      if (!isObj(v) || id.length > 80) continue;
      const text = str(v.text), short = str(v.short), benefit = str(v.benefit), risk = str(v.risk);
      if (!text || !short || !benefit || !risk) continue;
      p.atlas.laws[id] = { claimId: id, text, short, benefit, risk, scenarios: strs(v.scenarios) ?? [], regions: strs(v.regions) ?? [], activations: Math.max(1, Math.min(9999, num(v.activations) ?? 1)), effects: strs(v.effects) ?? [] };
    }
    const kn = isObj(atlas.knowledge) ? atlas.knowledge : {};
    for (const k of KNOWLEDGE) {
      const e = kn[k.id];
      if (isObj(e) && str(e.run, 200)) p.atlas.knowledge[k.id] = { run: e.run as string };
    }
    const pc = isObj(atlas.postcards) ? atlas.postcards : {};
    for (const [id, v] of Object.entries(pc)) {
      const cards = strs(v, 12);
      if (cards && id.length <= 100) p.atlas.postcards[id] = cards;
    }
    // beliefs a Generative Chronicle made law (keepsakes: text and what they did, no power), bounded like everything else here
    const inv = isObj(atlas.invented) ? atlas.invented : {};
    for (const [hash, v] of Object.entries(inv).slice(-60)) {
      if (!isObj(v) || !/^[A-Za-z0-9_-]{1,40}$/.test(hash)) continue;
      const text = str(v.text, 240), short = str(v.short, 80), mechanics = str(v.mechanics, 400);
      if (!text || !short || mechanics === null) continue;
      (p.atlas.invented ??= {})[hash] = { hash, text, short, mechanics, scenarios: strs(v.scenarios, 20) ?? [], activations: Math.max(1, Math.min(9999, num(v.activations) ?? 1)), effects: strs(v.effects, 12) ?? [] };
    }
  }
  return { ok: true, progress: p, migrated: ver < PROGRESS_VERSION };
}

/** The first archive format kept a handful of fields per run. */
function migrateV1Run(v: unknown): RunRecord | null {
  if (!isObj(v)) return null;
  const scenarioId = str(v.scenarioId, 100);
  const seed = num(v.seed);
  const score = num(v.score);
  if (!scenarioId || seed === null || score === null || (v.result !== 'victory' && v.result !== 'defeat')) return null;
  const difficulty = ['story', 'normal', 'hard'].includes(String(v.difficulty)) ? (v.difficulty as RunRecord['difficulty']) : 'normal';
  const rec: Omit<RunRecord, 'signature'> = {
    id: `v1:${scenarioId}:${seed}:${score}:${num(v.day) ?? 0}`, scenarioId, name: scenarioId, mode: 'story', seed, difficulty, result: v.result, score, medal: 'none',
    day: num(v.day) ?? 0, alive: num(v.alive) ?? 0, total: 0, rules: '1.0.0', modifiers: [], pledges: [], drafted: false, twisted: 0, laws: (strs(v.lawsActivated) ?? []).map((l) => l.split('@')[0]),
    strategy: `${scenarioId}|${(strs(v.lawsActivated) ?? []).map((l) => l.split('@')[0]).sort().join('+') || 'none'}`, apSpent: 0, rescued: 0, debug: v.debug === true,
  };
  return { ...rec, signature: hashValue([rec.id, rec.result, rec.score]).slice(0, 10) };
}

/** Unlocked option ids. */
export const isUnlocked = (p: Progress, id: string): boolean => !!p.unlocks[id];
