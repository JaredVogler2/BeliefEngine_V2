import { RULES_VERSION, SCHEMA_VERSION, type ClaimDef, type RunState } from '../core/types.ts';
import { verifyCustomClaim } from '../nl/build.ts';
import { verifyRealityClaim } from '../reality/build.ts';
import { MAX_LEDGER_ENTRIES, type Ledger } from './ledger.ts';

export const SAVE_FORMAT = 'belief-engine-save';

/**
 * A save: the run state (which holds its own complete action log, `history` and `today`, so it can be replayed from its options)
 * and, beside it, the run's external-decision ledger (save/ledger.ts). The ledger is optional: an older save has none and gets one
 * derived when it is loaded; a Classic run has nothing to put in it.
 */
export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  rulesVersion: string;
  state: RunState;
  ledger?: Ledger;
}

export function serializeRun(s: RunState, extra: { ledger?: Ledger | null } = {}): string {
  const env: SaveEnvelope = { format: SAVE_FORMAT, schemaVersion: SCHEMA_VERSION, rulesVersion: RULES_VERSION, state: s, ...(extra.ledger?.entries.length ? { ledger: extra.ledger } : {}) };
  return JSON.stringify(env);
}

export type LoadResult = { ok: true; state: RunState; ledger?: Ledger } | { ok: false; error: string };

/** The ledger a save carries, if it is shaped like one (what it says is checked against the run separately: checkRun). */
function ledgerOf(raw: unknown): Ledger | undefined | null {
  if (raw === undefined) return undefined;
  if (!isObj(raw) || typeof raw.v !== 'number' || !Array.isArray(raw.entries) || raw.entries.length > MAX_LEDGER_ENTRIES || !raw.entries.every(isObj)) return null;
  if (raw.head !== null && typeof raw.head !== 'string') return null;
  return raw as unknown as Ledger;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function finiteDeep(v: unknown, depth = 0): boolean {
  if (depth > 40) return false;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => finiteDeep(x, depth + 1));
  if (isObj(v)) return Object.values(v).every((x) => finiteDeep(x, depth + 1));
  return true;
}

/** Defensive parse + structural validation + migration. Never throws. */
export function deserializeRun(json: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'The save file is not valid JSON.' };
  }
  if (!isObj(raw) || raw.format !== SAVE_FORMAT) return { ok: false, error: 'This is not a Belief Engine save.' };
  const ver = raw.schemaVersion;
  if (typeof ver !== 'number' || ver > SCHEMA_VERSION) return { ok: false, error: `This save was made by a newer version (schema ${String(ver)}).` };
  const st = raw.state;
  if (!isObj(st)) return { ok: false, error: 'The save has no game state.' };
  const need = ['scenarioId', 'seed', 'day', 'maxDay', 'phase', 'ap', 'villagers', 'edges', 'claims', 'laws', 'world', 'threat', 'log', 'scn', 'stats', 'flags'];
  for (const k of need) if (!(k in st)) return { ok: false, error: `The save is missing "${k}".` };
  if (!Array.isArray(st.villagers) || !Array.isArray(st.edges) || !Array.isArray(st.claims) || !Array.isArray(st.laws) || !Array.isArray(st.log) || !Array.isArray(st.threat))
    return { ok: false, error: 'The save has malformed lists.' };
  if (typeof st.seed !== 'number' || typeof st.day !== 'number' || typeof st.ap !== 'number') return { ok: false, error: 'The save has malformed numbers.' };
  if ((st.day as number) < 1 || (st.day as number) > 400 || (st.ap as number) < 0 || (st.ap as number) > 99) return { ok: false, error: 'The save has out-of-range values.' };
  if (!finiteDeep(st)) return { ok: false, error: 'The save contains non-finite numbers.' };
  const w = st.world as Record<string, unknown>;
  if (!isObj(w) || !Array.isArray(w.terrain) || !Array.isArray(w.elev) || typeof w.w !== 'number' || typeof w.h !== 'number' || w.terrain.length !== (w.w as number) * (w.h as number))
    return { ok: false, error: 'The save has a corrupt map.' };
  // a belief the player wrote is rebuilt from its structure; a save whose numbers were edited by hand is not accepted as one
  for (const c of st.claims as unknown[]) {
    const def = isObj(c) && isObj(c.def) ? (c.def as unknown as ClaimDef) : null;
    if (def?.custom) {
      const why = verifyCustomClaim(def, st.villagers as { district: string }[], ((st.scn as { claimDefs?: ClaimDef[] } | undefined)?.claimDefs ?? []) as ClaimDef[], ((st.scn as { starters?: string[] } | undefined)?.starters ?? []) as string[]);
      if (why) return { ok: false, error: `The save holds a written belief that does not check out (${why}).` };
    }
    if (def?.reality) {
      if (!isObj(st.v2)) return { ok: false, error: 'The save holds a reality belief but no reality state.' };
      const why = verifyRealityClaim(st as unknown as RunState, def);
      if (why) return { ok: false, error: `The save holds a reality belief that does not check out (${why}).` };
    }
  }
  const ledger = ledgerOf(raw.ledger);
  if (ledger === null) return { ok: false, error: 'The save has a malformed record of its external inputs.' };
  return { ok: true, state: st as unknown as RunState, ...(ledger ? { ledger } : {}) };
}
