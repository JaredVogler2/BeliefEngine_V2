import type { RunState } from '../../engine/index.ts';
import { provenanceOf, writtenProvenance, type Provenance, type ProvenanceKind } from '../../engine/reality/provenance.ts';

const LABEL: Record<ProvenanceKind, string> = {
  written: 'You wrote it',
  told: 'Told',
  network: 'Carried on',
  opposed: 'Pushed back',
  threshold: 'Threshold',
  changed: 'The world changed',
  outcome: 'What it came to',
};

const STATUS: Record<Provenance['status'], string> = { law: 'became law', waking: 'was taking hold', story: 'stayed a story' };

function One({ p, compact }: { p: Provenance; compact?: boolean }) {
  const steps = compact ? p.steps.filter((x) => x.kind !== 'network' && x.kind !== 'told').concat(p.steps.filter((x) => x.kind === 'told').slice(0, 2)).sort((a, b) => a.day - b.day || (a.event ?? 1e9) - (b.event ?? 1e9)) : p.steps;
  return (
    <div className="chain provenance" data-testid={`provenance-${p.claim}`}>
      <b>“{p.short}”</b> <span className={`chip ${p.status === 'law' ? 'gold' : ''}`}>{STATUS[p.status]}</span>
      {p.status === 'law' && (
        <p className="small muted" style={{ margin: '0.2rem 0' }} data-testid="provenance-believers">
          Of the firm believers it woke with, {p.believers.keeper} first heard it from you, {p.believers.neighbour} through neighbours and {p.believers.witness} by seeing it shown.
        </p>
      )}
      {!compact && p.harm.nights > 0 && (
        <p className="small" style={{ margin: '0.2rem 0', color: '#ffb3bf' }} data-testid="provenance-harm">
          What it cost: it harmed the people who live with it on {p.harm.nights} night{p.harm.nights === 1 ? '' : 's'}{p.harm.regions.length ? ` (${p.harm.regions.join(', ')})` : ''}; {p.harm.people} time{p.harm.people === 1 ? '' : 's'} someone there trusted you less for it.
        </p>
      )}
      <ol className="small" style={{ margin: '0.3rem 0 0 1.2rem', padding: 0 }}>
        {steps.map((st, i) => (
          <li key={i} data-kind={st.kind}>
            <span className="muted">Day {st.day} · {LABEL[st.kind]}:</span> {st.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** How each belief the player wrote became real, or why it did not: the player's words to the world's change, from the log. */
export function RealityProvenance({ state }: { state: RunState }) {
  const list = writtenProvenance(state);
  if (!list.length) return null;
  return (
    <section className="card" data-testid="reality-provenance">
      <h2 style={{ marginTop: 0 }}>How your beliefs became real</h2>
      <p className="small muted" style={{ marginTop: 0 }}>From your words, through the people who carried them, to what changed in the world. Every line is an event the game logged.</p>
      {list.map((p) => <One key={p.claim} p={p} />)}
    </section>
  );
}

/** The same, for one written belief, folded into its law in the ledger. */
export function LawProvenance({ state, claim }: { state: RunState; claim: string }) {
  const p = provenanceOf(state, claim);
  if (!p) return null;
  return (
    <details className="small" data-testid="law-provenance">
      <summary style={{ cursor: 'pointer' }}>How it became real</summary>
      <One p={p} compact />
    </details>
  );
}
