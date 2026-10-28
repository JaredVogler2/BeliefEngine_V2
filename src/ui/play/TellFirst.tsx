import { useMemo, useState } from 'react';
import { getLawViews, previewAction } from '../../engine/index.ts';
import type { RunState } from '../../engine/index.ts';
import { findClaimDef } from '../../engine/core/lookup.ts';
import { firstName } from '../../engine/core/names.ts';
import { electorateOf } from '../../engine/laws/resolver.ts';
import { store, useStore } from '../store.ts';

/**
 * Right after a belief is written: who hears it first. The people whose belief decides it (those who vote on it where it acts),
 * ranked by what telling them would add to its support now: the engine's own dry run of the telling, weighted the way support is
 * counted (an influential voice counts for more). Each row says what the telling would do and what it costs; telling is the same
 * action as anywhere else (undo works). Or close this and choose someone in the village itself.
 */

export interface TellRow {
  id: string;
  name: string;
  role: string;
  where: string;
  /** conviction before and after the telling (the engine's dry run), or null when it cannot be done */
  before: number;
  after: number | null;
  cost: number;
  ok: boolean;
  /** why it cannot be done, or what makes this person matter */
  note: string;
  /** added support, weighted as the law counts it (0 when it cannot be done) */
  worth: number;
  told: boolean;
}

const SHOWN = 4;

export function tellRoster(s: RunState, claimId: string): TellRow[] {
  const def = findClaimDef(s, claimId);
  if (!def) return [];
  const districts = new Set(def.regions.flatMap((r) => electorateOf(s, claimId, r)));
  const region = (id: string) => s.world.regions.find((r) => r.id === id)?.name ?? id;
  const rows = s.villagers
    .filter((v) => v.status !== 'dead' && districts.has(v.district))
    .map((v): TellRow => {
      const p = previewAction(s, { type: 'SEED', claim: claimId, target: v.id });
      const d = p.deltas.find((x) => x.id === v.id && x.claim === claimId);
      const before = Math.round(v.beliefs[claimId]?.conv ?? 0);
      const after = p.ok ? (d?.after ?? before) : null;
      const told = (s.flags[`spoke:${v.id}`] ?? -1) === s.day;
      const weight = 0.5 + v.traits.influence / 100;
      const note = !p.ok
        ? (p.error?.message ?? 'Not possible now.')
        : v.traits.skepticism >= 70
          ? 'A skeptic: words alone barely move them; proof does.'
          : v.traits.influence >= 70
            ? 'Others follow their lead.'
            : v.keeperTrust >= 60
              ? 'Trusts you.'
              : v.keeperTrust < 25
                ? 'Barely trusts you yet.'
                : '';
      return { id: v.id, name: v.name, role: v.role, where: region(v.district), before, after, cost: p.cost, ok: p.ok, note, worth: p.ok && after !== null ? ((after - before) * weight) : 0, told };
    });
  // the people already told today first (what the player just did stays in view), then whoever a telling would move the most
  return rows.sort((a, b) => Number(b.told) - Number(a.told) || Number(b.ok) - Number(a.ok) || b.worth - a.worth || (a.name < b.name ? -1 : 1));
}

export function TellFirst({ claimId, onClose }: { claimId: string; onClose: (how: 'world' | 'done') => void }) {
  // every accepted action replaces the run state, so the roster is worked out again exactly when a telling (or an undo) lands
  const state = useStore((s) => s.state);
  const [all, setAll] = useState(false);
  const rows = useMemo(() => (state ? tellRoster(state, claimId) : []), [state, claimId]);
  if (!state) return null;
  const def = findClaimDef(state, claimId);
  if (!def) return null;
  const law = getLawViews(state).find((l) => l.claimId === claimId && !l.rival);
  const told = rows.filter((r) => r.told);
  const open = rows.filter((r) => r.ok);
  const shown = all ? rows : rows.slice(0, SHOWN + told.length);
  return (
    <section data-testid="tell-first">
      <p className="small" style={{ margin: '0 0 0.4rem' }}>
        “{def.short}” is written. It becomes real only once enough of the {rows.length} people who vote on it{law ? ` in ${law.regionName}` : ''} believe it
        {law ? <> (now {Math.round(law.pressure * 100)}% support of the {Math.round(law.on * 100)}% it needs; {law.supporters.length} of {law.minSupporters} firm believers)</> : null}.
        Tell someone now, or let believers carry it at night.
      </p>
      <p className="small muted" style={{ margin: '0 0 0.5rem' }} data-testid="tell-first-ap">
        {state.ap > 0 ? `You have ${state.ap} Influence left today. Each telling costs 1; undo works as usual.` : 'You are out of Influence today: tell people tomorrow, or choose them in the village then.'}
      </p>
      <ol className="tell-list" data-testid="tell-first-list">
        {shown.map((r) => (
          <li key={r.id} className={`tell-row ${r.ok ? '' : 'off'}`} data-testid={`tell-row-${r.id}`}>
            <span className="tr-who">
              <b>{r.name}</b> <span className="muted small">{r.role}, {r.where}</span>
              <span className="tr-what small">
                {r.told ? <span className="chip good">Told today</span> : r.ok && r.after !== null ? <>Would believe it <b>{r.before} → {r.after}</b>{r.note ? ` · ${r.note}` : ''}</> : <span className="muted">{r.note}</span>}
              </span>
            </span>
            <button
              type="button"
              className="btn small tr-tell"
              disabled={!r.ok}
              // the same action as anywhere: store.act announces what it did, and undo works
              onClick={() => store.act({ type: 'SEED', claim: claimId, target: r.id })}
              data-testid={`tell-first-${r.id}`}
            >
              {/* named by its content, visible words first (WCAG 2.5.3): "Tell · 1 Influence, to Ivo Thatcher" */}
              Tell · {r.cost}<span className="sr-only"> Influence, to {r.name}</span>
            </button>
          </li>
        ))}
      </ol>
      {rows.length > SHOWN + told.length && (
        <button type="button" className="btn small" onClick={() => setAll(!all)} aria-expanded={all} data-testid="tell-first-all">
          {all ? 'Show fewer' : `Show everyone who votes on it (${rows.length})`}
        </button>
      )}
      {rows.length === 0 && <p className="small muted">Nobody lives where it acts any more.</p>}
      {open.length === 0 && rows.length > 0 && told.length === 0 && state.ap > 0 && <p className="small muted">Nobody here can hear it from you today; a believer can carry it to them.</p>}
      <div className="row wrap" style={{ gap: '0.5rem', marginTop: '0.6rem' }}>
        <button type="button" className="btn primary" onClick={() => onClose('done')} data-testid="tell-first-done">{told.length ? `Done (${told.length} told)` : 'Done'}</button>
        <button type="button" className="btn" onClick={() => onClose('world')} data-testid="tell-first-world">Choose in the village instead</button>
      </div>
      {told.length > 0 && <p className="small muted" style={{ marginTop: '0.4rem' }}>Told today: {told.map((r) => firstName(r.name)).join(', ')}.</p>}
    </section>
  );
}
