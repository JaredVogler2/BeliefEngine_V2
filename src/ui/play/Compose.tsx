import { useEffect, useRef, useState } from 'react';
import { MAX_CUSTOM_CLAIMS, allOffers, interpretBelief, previewAction } from '../../engine/index.ts';
import type { Draft, Interpretation } from '../../engine/index.ts';
import { Modal } from '../components.tsx';
import { aiClient, type ReadingMeta } from '../../ai/client.ts';
import { V2_FEATURES } from '../../v2/features.ts';
import { store, useStore } from '../store.ts';
import { OnlineRow, useOnlineReading } from './online.tsx';

const MAX_CHARS = 160;
const MAX_TITLE = 40;

const STATUS_CHIP: Record<Interpretation['status'], { cls: string; label: string }> = {
  ok: { cls: 'good', label: 'Understood' },
  ambiguous: { cls: 'gold', label: 'Choose one' },
  partial: { cls: 'gold', label: 'Partly understood' },
  unsupported: { cls: 'bad', label: 'Cannot be modelled' },
  rejected: { cls: 'bad', label: 'Would not work here' },
};

const RATING_WORD = { light: 'A light belief', moderate: 'A moderate belief', strong: 'A strong belief' } as const;

/**
 * Write a belief (Inventor runs). The player types one sentence; the same structure-checking, balancing and safety test the game
 * itself applies turns it into drafts; the player reads what each would really do, what it needs and what it costs, and only then
 * pays Influence to write it into the village. Previewing is free and changes nothing.
 */
export function Compose() {
  const state = useStore((s) => s.state);
  const [text, setText] = useState('');
  const [result, setResult] = useState<Interpretation | null>(null);
  const [pick, setPick] = useState(0);
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const o = useOnlineReading();
  const [meta, setMeta] = useState<ReadingMeta | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => () => void (seq.current = -1), []);
  if (!state) return null;
  const close = () => store.set({ composing: false });
  const made = state.claims.filter((c) => c.def?.custom).length;
  // online reading is opt-in per run: nothing is sent anywhere until the player turns it on and accepts the notice (online.tsx)
  const run = (sentence: string) => {
    const mine = ++seq.current;
    setBusy(true);
    setNote(null);
    // let the "reading" state paint first: the safety test replays a few nights and can take a moment on a phone
    window.setTimeout(async () => {
      let r: Interpretation;
      let why: string | null = null;
      const s = store.state!;
      let m: ReadingMeta | null = null;
      if (o.online && V2_FEATURES.serverInference) {
        const res = await aiClient.interpretV1(s, sentence);
        if (res.ok) {
          r = interpretBelief(s, sentence, { readings: res.readings });
          m = res.meta;
        } else {
          why = `${res.why} Here is the offline reading instead; no Influence was spent.`;
          r = interpretBelief(s, sentence);
        }
      } else r = interpretBelief(s, sentence);
      if (seq.current !== mine) return;
      setMeta(m);
      setResult(r);
      setPick(0);
      setTitles({});
      setNote(why);
      setBusy(false);
    }, 10);
  };

  const draft: Draft | undefined = result?.drafts[pick];
  const title = draft ? (titles[pick] ?? draft.title).slice(0, MAX_TITLE) : '';
  const claimToWrite = draft ? { ...draft.claim, short: title.trim() || draft.title } : null;
  const prev = claimToWrite ? previewAction(state, { type: 'COMPOSE', claim: claimToWrite }) : null;
  const cost = draft?.cost.compose ?? 0;
  const canAfford = state.ap >= cost;

  const write = () => {
    if (!claimToWrite || !draft) return;
    const res = store.act({ type: 'COMPOSE', claim: claimToWrite });
    if (res?.ok) {
      store.set({ composing: false, activeClaim: draft.claim.id, tab: 'village' });
      store.toast(`Written: “${claimToWrite.short}”. Now tell someone.`, 'good');
    }
  };

  return (
    <Modal title="Write a belief" onClose={close} wide>
      <div data-testid="compose">
        <p className="small muted" style={{ marginTop: 0 }}>
          Say in one sentence what the village should come to believe about the world: how something behaves, and what makes it so. It only becomes real
          if enough villagers believe it, and a belief that is stronger asks more of them. Previewing is free. ({made} of {MAX_CUSTOM_CLAIMS} written in this run.)
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && !busy) run(text);
          }}
        >
          <label className="field">
            <span>Your belief ({text.length}/{MAX_CHARS})</span>
            <textarea
              data-autofocus
              data-testid="compose-text"
              value={text}
              maxLength={MAX_CHARS}
              rows={2}
              placeholder="e.g. The river turns aside from lit lanterns."
              onChange={(e) => setText(e.target.value.replace(/\n/g, ' '))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (text.trim() && !busy) run(text);
                }
              }}
            />
          </label>
          {V2_FEATURES.serverInference && <OnlineRow o={o} prefix="compose" leaves="Your sentence and the names of this village's places and features leave this device: they go to this game's server and, through the Vercel AI Gateway, to a language-model provider." />}
          <div className="row" style={{ gap: '0.5rem' }}>
            <button type="submit" className="btn primary" disabled={busy || !text.trim()} data-testid="compose-preview">{busy ? 'Reading…' : 'See what it would do'}</button>
            <button type="button" className="btn" onClick={close}>Cancel</button>
          </div>
        </form>

        <details style={{ marginTop: '0.6rem' }} data-testid="compose-help">
          <summary className="small" style={{ cursor: 'pointer' }}>What can I write?</summary>
          <p className="small muted">
            A belief says what behaves (the river, rain, the bridge, the crops, the wolves, sickness, fire), how, and what makes it so (lit beacons, smoke fires, ringing bells, watchers, night work). The game matches these words, it does not understand free language, so a sentence it cannot place is refused with the reason. These sentences always work in this village:
          </p>
          <div style={{ display: 'grid', gap: '0.3rem' }}>
            {allOffers(state).map((o, i) => (
              <button key={i} type="button" className="btn small" style={{ textAlign: 'left' }} onClick={() => { setText(o.sentence); run(o.sentence); }} data-testid={`help-${i}`}>
                {o.sentence}{o.builtIn ? <span className="muted"> — already the story “{o.builtIn}”</span> : null}
              </button>
            ))}
          </div>
        </details>

        {note && <p className="small muted" data-testid="compose-note">{note}</p>}

        {result && !busy && (
          <section aria-live="polite" data-testid="compose-result" style={{ marginTop: '0.8rem' }}>
            <p style={{ margin: '0 0 0.5rem' }}>
              <span className={`chip ${STATUS_CHIP[result.status].cls}`} data-testid="compose-status">{STATUS_CHIP[result.status].label}</span>{' '}
              {result.message}
              {result.source === 'model' && <span className="chip violet" style={{ marginLeft: '0.4rem' }} data-testid="compose-source">{meta?.provider === 'mock' ? 'read by the simulated online reader (no model)' : `read online${meta?.model ? ` by ${meta.model}` : ''}${meta?.cached ? ' (repeat, no cost)' : ''}`}</span>}
            </p>
            {result.rejected.length > 0 && result.drafts.length === 0 && (
              <ul className="small muted">{result.rejected.map((r, i) => <li key={i}>“{r.reading}”: {r.reason}</li>)}</ul>
            )}

            {result.drafts.length > 0 && (
              <div role="radiogroup" aria-label="Ways to read your sentence" className="drafts">
                {result.drafts.map((d, i) => {
                  const on = i === pick;
                  return (
                    <div key={d.id + i} className={`draft ${on ? 'picked' : ''}`} data-testid={`draft-${i}`}>
                      <label className="row" style={{ gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                        <input type="radio" name="draft" checked={on} onChange={() => setPick(i)} aria-label={`Reading ${i + 1}: ${d.title}`} />
                        <span style={{ flex: 1 }}>
                          <b>{result.drafts.length > 1 ? `Reading ${i + 1}: ` : ''}{d.title}</b>
                          <span className="chip" style={{ marginLeft: '0.4rem' }}>{RATING_WORD[d.rating]}</span>
                        </span>
                      </label>
                      <ul className="small" data-testid={`draft-${i}-mechanics`} style={{ margin: '0.3rem 0' }}>{d.mechanics.map((m, j) => <li key={j}>{m}</li>)}</ul>
                      {on && (
                        <div className="small">
                          <label className="field" style={{ margin: '0.3rem 0' }}>
                            <span>Name on the card ({title.length}/{MAX_TITLE})</span>
                            <input type="text" maxLength={MAX_TITLE} value={titles[i] ?? d.title} onChange={(e) => setTitles({ ...titles, [i]: e.target.value.replace(/[<>]/g, '') })} data-testid="compose-title" />
                          </label>
                          <p style={{ margin: '0.2rem 0' }}><b>To work it needs:</b> {d.requires.join(' ')}</p>
                          <p style={{ margin: '0.2rem 0' }}>
                            <b>Support:</b> at least {d.support.percent}% of the local villagers, and {d.support.believers} firm believers, before it can become law.
                          </p>
                          <p style={{ margin: '0.2rem 0' }}>
                            <b>Cost:</b> {d.cost.compose} Influence to write it, then {d.cost.perTelling} each time you tell someone.
                          </p>
                          {d.risks.length > 0 && <ul className="warn-list" style={{ margin: '0.2rem 0' }}>{d.risks.map((r, j) => <li key={j}>{r}</li>)}</ul>}
                          {d.adjustments.length > 0 && <ul className="small muted" data-testid="compose-adjustments" style={{ margin: '0.2rem 0' }}>{d.adjustments.map((a, j) => <li key={j}>{a}</li>)}</ul>}
                          {d.assumptions.length > 0 && <ul className="small muted" style={{ margin: '0.2rem 0' }}>{d.assumptions.map((a, j) => <li key={j}>{a}</li>)}</ul>}
                          {d.contradicts.length > 0 && <p className="muted" style={{ margin: '0.2rem 0' }}>Contradicts {d.contradicts.map((c) => `“${c.short}”`).join(', ')}: a villager who believes one will doubt the other.</p>}
                          <p className="muted" style={{ margin: '0.2rem 0' }} data-testid="compose-stress">
                            Safety check: {d.stress.problems.length ? d.stress.problems.join('; ') : d.stress.changed.length ? `in three simulated nights it changed ${d.stress.changed.join(', ')}; nothing impossible happened.` : 'in three simulated nights no hazard tested it, and nothing impossible happened.'}
                          </p>
                          {d.existing && <p className="chip gold" style={{ whiteSpace: 'normal' }}>This is already the story “{d.existing.short}”. Writing your own version still works.</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {result.offers.length > 0 && (
              <div data-testid="compose-offers" style={{ marginTop: '0.5rem' }}>
                <p className="small muted" style={{ margin: '0 0 0.3rem' }}>Beliefs the village can model — pick one to try it:</p>
                <div className="col" style={{ display: 'grid', gap: '0.35rem' }}>
                  {result.offers.map((o, i) => (
                    <button key={i} type="button" className="btn small" style={{ textAlign: 'left' }} onClick={() => { setText(o.sentence); run(o.sentence); }} data-testid={`offer-${i}`}>{o.sentence}{o.builtIn ? <span className="muted"> — already the story “{o.builtIn}”</span> : null}</button>
                  ))}
                </div>
              </div>
            )}

            {draft && (
              <div style={{ marginTop: '0.8rem' }}>
                {prev && !prev.ok && <p className="chip bad" style={{ whiteSpace: 'normal' }} data-testid="compose-blocked">{prev.error?.message}</p>}
                {prev?.ok && !canAfford && <p className="chip bad" style={{ whiteSpace: 'normal' }}>You need {cost} Influence to write this and have {state.ap}.</p>}
                <div className="row" style={{ gap: '0.5rem', marginTop: '0.4rem' }}>
                  <button className="btn primary big" disabled={!prev?.ok || !canAfford} onClick={write} data-testid="compose-confirm">Write it into the village ({cost} Influence)</button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
