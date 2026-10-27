import { useEffect, useRef, useState } from 'react';
import { MAX_REALITY_CLAIMS, previewAction } from '../../engine/index.ts';
import type { RunState } from '../../engine/index.ts';
import { readBelief, type ReadCandidate, type Reading } from '../../engine/reality/read.ts';
import { aiClient, type ReadingMeta } from '../../ai/client.ts';
import { V2_FEATURES } from '../../v2/features.ts';
import { Modal } from '../components.tsx';
import { store, useStore } from '../store.ts';
import { OnlineRow, useOnlineReading } from './online.tsx';

const MAX_CHARS = 240;
const MAX_TITLE = 40;

const KIND: Record<Reading['kind'], { cls: string; label: string }> = {
  supported: { cls: 'good', label: 'Understood' },
  partial: { cls: 'gold', label: 'Partly possible' },
  ambiguous: { cls: 'gold', label: 'Choose a meaning' },
  unsupported: { cls: 'bad', label: 'Cannot be made real here' },
};

const RATING_WORD = { light: 'A light belief', moderate: 'A moderate belief', strong: 'A strong belief' } as const;

const EXAMPLES = ['Chickens fly when the bell rings.', 'Wet stone becomes light beside lanterns.', 'At night, bell ringing pulls rain toward the fields and makes local flames burn weaker.'];

function candidatesOf(r: Reading | null): ReadCandidate[] {
  if (!r) return [];
  return r.kind === 'ambiguous' ? r.choices : r.kind === 'unsupported' ? r.alternatives : r.candidates;
}

/**
 * Write a belief in a Generative Reality run. Any sentence: the reader (offline, or a model when the player opts in) proposes what
 * the reality language can make of it; the engine builds each proposal against this village and the player sees, side by side,
 * what they said and exactly what the game would do, what it would leave out, what it needs and what it costs. Only a confirmed,
 * engine-built belief is written, bound to the village as it is now (a stale confirmation is refused).
 */
export default function RealityCompose() {
  const state = useStore((s) => s.state);
  const [text, setText] = useState('');
  const [region, setRegion] = useState('');
  const [reading, setReading] = useState<Reading | null>(null);
  const [pick, setPick] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<ReadingMeta | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const o = useOnlineReading();
  const seq = useRef(0);
  useEffect(() => () => void (seq.current = -1), []);
  if (!state?.v2) return null;
  const close = () => store.set({ composing: false });
  const made = state.claims.filter((c) => c.def?.reality).length;
  const max = MAX_REALITY_CLAIMS + (state.v2.lab ? 2 : 0);

  const run = (sentence: string) => {
    const mine = ++seq.current;
    setBusy(true);
    setNote(null);
    window.setTimeout(async () => {
      const s = store.state as RunState;
      const opts = region ? { region } : {};
      let r: Reading;
      let m: ReadingMeta | null = null;
      let why: string | null = null;
      if (o.online && V2_FEATURES.serverInference) {
        const res = await aiClient.interpretReality(s, sentence, { region: region || null });
        if (res.ok) {
          r = res.reading;
          m = res.meta;
        } else {
          why = `${res.why} Here is the offline reading instead; no Influence was spent.`;
          r = readBelief(s, sentence, opts);
        }
      } else r = readBelief(s, sentence, opts);
      if (seq.current !== mine) return;
      setReading(r);
      setMeta(m);
      setPick(0);
      setAccepted(false);
      setTitle(null);
      setNote(why);
      setBusy(false);
    }, 10);
  };

  const list = candidatesOf(reading);
  const cand = list[pick];
  const draft = cand?.build.ok ? cand.build.draft : null;
  const claim = draft ? { ...draft.claim, short: ((title ?? draft.title).trim() || draft.title).slice(0, MAX_TITLE) } : null;
  const prev = claim ? previewAction(state, { type: 'COMPOSE', claim }) : null;
  const cost = draft?.cost.compose ?? 0;
  const canAfford = state.ap >= cost;
  // writing something other than what was said needs the player's explicit yes
  const needsYes = reading?.kind === 'partial' || reading?.kind === 'unsupported' || cand?.confidence === 'low';
  const source = cand ? (cand.ast.source.reader === 'model' ? (meta?.provider === 'mock' ? 'read by the simulated online reader (no model)' : `read online${meta?.model ? ` by ${meta.model}` : ''}${meta?.cached ? ' (repeat, no cost)' : ''}`) : 'read offline by the game') : null;

  const write = () => {
    if (!claim || !draft) return;
    const res = store.act({ type: 'COMPOSE', claim });
    if (res?.ok) {
      store.set({ composing: false, activeClaim: draft.claim.id, tab: 'village' });
      store.toast(`Written: “${claim.short}”. Now tell someone.`, 'good');
    }
  };

  return (
    <Modal title="Write a belief into reality" onClose={close} wide>
      <div data-testid="reality-compose">
        <p className="small muted" style={{ marginTop: 0 }}>
          Write, in your own words, how the world of this village works. The game shows exactly what it can make of it: nothing more, nothing it does not say. It becomes real only
          once enough villagers believe it, and a stronger belief asks more of them. Reading is free. ({made} of {max} written in this run{state.v2.lab ? ' · Reality Lab, unranked' : ''}.)
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
              data-testid="reality-text"
              value={text}
              maxLength={MAX_CHARS}
              rows={3}
              placeholder="e.g. Chickens fly when the bell rings."
              onChange={(e) => setText(e.target.value.replace(/\n/g, ' '))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (text.trim() && !busy) run(text);
                }
              }}
            />
          </label>
          <label className="field">
            <span>Where its believers live</span>
            <select value={region} onChange={(e) => setRegion(e.target.value)} data-testid="reality-region">
              <option value="">Let the game choose where it can act</option>
              {state.world.regions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          {V2_FEATURES.serverInference && <OnlineRow o={o} prefix="reality" leaves="Your sentence, which village this is (its name and seed), the region you picked and the day leave this device: they go to this game's server and, through the Vercel AI Gateway, to a language-model provider. Nothing about your villagers is sent." />}
          <div className="row" style={{ gap: '0.5rem' }}>
            <button type="submit" className="btn primary" disabled={busy || !text.trim()} data-testid="reality-preview">{busy ? 'Reading…' : 'See what it would do'}</button>
            <button type="button" className="btn" onClick={close}>Cancel</button>
          </div>
        </form>

        {!reading && (
          <details style={{ marginTop: '0.6rem' }} data-testid="reality-help">
            <summary className="small" style={{ cursor: 'pointer' }}>Ideas</summary>
            <div style={{ display: 'grid', gap: '0.3rem', marginTop: '0.3rem' }}>
              {EXAMPLES.map((x, i) => (
                <button key={i} type="button" className="btn small" style={{ textAlign: 'left' }} onClick={() => { setText(x); run(x); }} data-testid={`reality-example-${i}`}>{x}</button>
              ))}
            </div>
          </details>
        )}

        {note && <p className="small muted" data-testid="reality-note">{note}</p>}

        {reading && !busy && (
          <section aria-live="polite" data-testid="reality-result" style={{ marginTop: '0.8rem' }}>
            <p style={{ margin: '0 0 0.5rem' }}>
              <span className={`chip ${KIND[reading.kind].cls}`} data-testid="reality-kind">{KIND[reading.kind].label}</span>
              {source && <span className="chip violet" style={{ marginLeft: '0.4rem' }} data-testid="reality-source">{source}</span>}
            </p>
            {reading.kind === 'ambiguous' && <p data-testid="reality-question"><b>{reading.question}</b></p>}
            {(reading.kind === 'partial' || reading.kind === 'unsupported') && reading.reasons.length > 0 && (
              <div className="reasons" data-testid="reality-reasons">
                <p className="small" style={{ margin: '0 0 0.2rem' }}><b>{reading.kind === 'partial' ? 'What the game cannot make real here:' : 'Why not:'}</b></p>
                <ul className="small" style={{ margin: 0 }}>
                  {reading.reasons.map((r, i) => (
                    <li key={i}>{r.words ? <>“{r.words}”: </> : null}{r.why}</li>
                  ))}
                </ul>
              </div>
            )}
            {reading.kind === 'unsupported' && list.length > 0 && <p className="small muted" style={{ margin: '0.5rem 0 0.2rem' }}>Beliefs about the same things that this village can make real (not what you wrote):</p>}
            {reading.notes.length > 0 && <ul className="small muted" data-testid="reality-notes" style={{ margin: '0.3rem 0' }}>{reading.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}

            {list.length > 0 && (
              <div role="radiogroup" aria-label="Ways the game can read your sentence" className="drafts">
                {list.map((c, i) => {
                  const on = i === pick;
                  const d = c.build.ok ? c.build.draft : null;
                  return (
                    <div key={i} className={`draft reality-card ${on ? 'picked' : ''}`} data-testid={`reality-card-${i}`}>
                      <label className="row" style={{ gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                        <input type="radio" name="reality-reading" checked={on} onChange={() => { setPick(i); setTitle(null); setAccepted(false); }} aria-label={`Reading ${i + 1}`} />
                        <span style={{ flex: 1 }}>
                          <b>{list.length > 1 ? `Reading ${i + 1}: ` : ''}{d ? d.title : c.ast.text}</b>
                          {d && <span className="chip" style={{ marginLeft: '0.4rem' }}>{RATING_WORD[d.rating]}</span>}
                          <span className={`chip ${c.confidence === 'high' ? 'good' : c.confidence === 'medium' ? 'gold' : 'bad'}`} style={{ marginLeft: '0.4rem' }} data-testid={`reality-confidence-${i}`}>{c.confidence} confidence</span>
                        </span>
                      </label>
                      <div className="said-did">
                        <div className="said" data-testid={`reality-said-${i}`}>
                          <h4>You said</h4>
                          <ul className="small">
                            {c.map.map((m, j) => (
                              <li key={j}>
                                <b>{m.target}</b> → {m.effect || '…'}{m.trigger && m.trigger !== '(none named)' ? <> · <i>{m.trigger}</i></> : null}{m.condition ? <> · if {m.condition}</> : null}{m.place ? <> · {m.place}</> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="did" data-testid={`reality-did-${i}`}>
                          <h4>The game will do</h4>
                          {d ? <ul className="small">{d.mechanics.map((m, j) => <li key={j}>{m}</li>)}</ul> : <p className="small error-text">{c.build.ok ? '' : `It cannot act in this village: ${(c.build.issues.length ? c.build.issues : [c.build.message]).join('; ')}`}</p>}
                        </div>
                      </div>
                      {on && d && (
                        <div className="small">
                          {d.omitted.length > 0 && (
                            <div data-testid="reality-omitted">
                              <b>Left out:</b>
                              <ul style={{ margin: '0.2rem 0' }}>{d.omitted.map((x, j) => <li key={j}>“{x.text}”: {x.why}</li>)}</ul>
                            </div>
                          )}
                          <p style={{ margin: '0.2rem 0' }}><b>To work it needs:</b> {d.requires.join(' ')}</p>
                          <p style={{ margin: '0.2rem 0' }} data-testid="reality-support"><b>Support:</b> at least {d.support.percent}% of the villagers where it acts, and {d.support.believers} firm believers, before it can become real.</p>
                          <p style={{ margin: '0.2rem 0' }}><b>Cost:</b> {d.cost.compose} Influence to write it, then {d.cost.perTelling} each time you tell someone.</p>
                          {d.risks.length > 0 && <ul className="warn-list" style={{ margin: '0.2rem 0' }} data-testid="reality-risks">{d.risks.map((r, j) => <li key={j}>{r}</li>)}</ul>}
                          {d.adjustments.length > 0 && <ul className="small muted" data-testid="reality-adjustments" style={{ margin: '0.2rem 0' }}>{d.adjustments.map((a, j) => <li key={j}>{a}</li>)}</ul>}
                          {[...c.assumed, ...d.notes].length > 0 && <ul className="small muted" style={{ margin: '0.2rem 0' }} data-testid="reality-assumed">{[...c.assumed, ...d.notes].map((a, j) => <li key={j}>{a}</li>)}</ul>}
                          <label className="field" style={{ margin: '0.3rem 0' }}>
                            <span>Name on the card ({(title ?? d.title).length}/{MAX_TITLE})</span>
                            <input type="text" maxLength={MAX_TITLE} value={title ?? d.title} onChange={(e) => setTitle(e.target.value.replace(/[<>]/g, ''))} data-testid="reality-title" />
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {draft && (
              <div style={{ marginTop: '0.8rem' }}>
                {needsYes && (
                  <label className="row small" style={{ gap: '0.4rem', alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} data-testid="reality-accept" />
                    <span>{reading.kind === 'unsupported' ? 'I want this belief instead of what I wrote.' : reading.kind === 'partial' ? 'I understand the parts listed above will not happen.' : 'I have checked that this reading is what I meant.'}</span>
                  </label>
                )}
                {prev && !prev.ok && <p className="chip bad" style={{ whiteSpace: 'normal' }} data-testid="reality-blocked">{prev.error?.message}</p>}
                {prev?.ok && !canAfford && <p className="chip bad" style={{ whiteSpace: 'normal' }}>You need {cost} Influence to write this and have {state.ap}.</p>}
                <div className="row" style={{ gap: '0.5rem', marginTop: '0.4rem' }}>
                  <button className="btn primary big" disabled={!prev?.ok || !canAfford || (needsYes && !accepted)} onClick={write} data-testid="reality-confirm">Write it into the village ({cost} Influence)</button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
