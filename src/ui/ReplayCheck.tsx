import { useEffect, useState } from 'react';
import { actionsOfState, checkRun, eventHash, ledgerSummary, optionsFromState, stateHash } from '../engine/index.ts';
import type { LedgerCheck, ReplayFile, RunState } from '../engine/index.ts';
import { store } from './store.ts';

/**
 * The end of a run, checked (phase 14): its own action log replayed from its options on this device, with no network and no model,
 * must reach this very ending; and the record of everything that came from outside the rules (beliefs read, villagers' decisions or
 * lines a model proposed) must match what the run used. The replay can be downloaded and checked again anywhere
 * (`npx tsx scripts/verify-replay.ts <file>`).
 */
export function ReplayCheck({ state }: { state: RunState }) {
  const [res, setRes] = useState<{ check: LedgerCheck; summary: string; file: ReplayFile } | null>(null);
  useEffect(() => {
    // after the debrief has painted: a replay takes a moment on a phone
    const t = window.setTimeout(() => {
      const { check, derived } = checkRun(state, store.session?.ledger);
      const file: ReplayFile = { format: 'belief-engine-replay', v: 1, options: optionsFromState(state), actions: actionsOfState(state), ledger: derived.ledger, stateHash: stateHash(state), eventHash: eventHash(state) };
      setRes({ check, summary: ledgerSummary(derived.ledger).text, file });
    }, 60);
    return () => window.clearTimeout(t);
  }, [state]);
  const download = () => {
    if (!res) return;
    const blob = new Blob([JSON.stringify(res.file)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `belief-engine-replay-${state.scenarioId}-seed${state.seed}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <section className="card replay-check" data-testid="replay-check" aria-live="polite">
      <h2 style={{ marginTop: 0 }}>Replay</h2>
      {!res ? (
        <p className="small muted" role="status">Replaying this run on this device…</p>
      ) : res.check.ok ? (
        <>
          <p style={{ margin: '0 0 0.3rem' }} data-testid="replay-verdict">
            <span className="chip good">Replays to the same end</span> Replayed here from its own actions, with no network and no model: state {res.check.hash}.
          </p>
          <p className="small muted" style={{ margin: 0 }} data-testid="replay-inputs">From outside the rules: {res.summary}. Each is recorded in the action that used it, so a replay never asks anyone again.</p>
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 0.3rem' }} data-testid="replay-verdict"><span className="chip bad">Cannot vouch for the replay</span> {res.check.message}</p>
          <p className="small muted" style={{ margin: 0 }}>{res.check.recovery}</p>
        </>
      )}
      {res && (
        <button type="button" className="btn small" style={{ marginTop: '0.5rem' }} onClick={download} data-testid="replay-download">
          Download the replay
        </button>
      )}
    </section>
  );
}
