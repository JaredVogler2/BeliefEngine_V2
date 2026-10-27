import { findClaimDef, getHand } from '../../engine/index.ts';
import { ClaimGlyph } from '../components.tsx';
import { store, useStore } from '../store.ts';
import { getTutorial } from '../tutorial.ts';

export function Hand() {
  const state = useStore((s) => s.state);
  const ui = useStore((s) => s.ui);
  if (!state) return null;
  const hand = getHand(state);
  const tut = getTutorial(state, ui);
  const pickingStarter = state.starter === null;
  return (
    <div className={`hand ${pickingStarter ? 'choosing' : ''}`} role="group" aria-label="Your stories">
      {hand.map((c, i) => {
        const main = c.laws[0];
        const on = findClaimDef(state, c.id)?.spec.thresholds.on ?? 0.6;
        const isStarter = state.scn.starters.includes(c.id) && pickingStarter;
        const locked = !c.available && !isStarter;
        const pressed = ui.activeClaim === c.id;
        const best = c.laws.reduce((m, l) => (l.pressure > m.pressure ? l : m), c.laws[0] ?? { pressure: 0, status: 'dormant', regionName: '', progress: 0, regionId: '' });
        return (
          <button
            key={c.id}
            className={`claim ${locked ? 'locked' : ''} ${c.rival ? 'rival' : ''} ${tut?.hintClaims && isStarter ? 'hint' : ''}`}
            aria-pressed={pressed}
            data-claim={c.id}
            disabled={locked}
            onClick={() => {
              if (isStarter) {
                store.act({ type: 'PICK_STARTER', claim: c.id });
                store.set({ activeClaim: c.id });
                return;
              }
              store.set({ activeClaim: pressed ? null : c.id });
            }}
          >
            <span className="c-top">
              <ClaimGlyph icon={c.icon} />
              <span className="c-text">{c.short}{!c.rival && i < 9 ? <span className="muted small"> [{i + 1}]</span> : null}</span>
            </span>
            {!locked && !isStarter && (
              <>
                <span className="c-bar" aria-hidden="true">
                  <i style={{ width: `${Math.round(best.pressure * 100)}%` }} />
                  <b style={{ left: `${Math.round(on * 100)}%` }} />
                </span>
                <span className="row spread small">
                  <span className={`chip ${best.status === 'active' ? 'gold' : c.rival ? 'violet' : ''}`}>{best.status === 'dormant' ? 'Not yet a law' : best.status}</span>
                  <span className="muted">{Math.round(best.pressure * 100)}% · {c.believers} believe</span>
                </span>
              </>
            )}
            {isStarter && <span className="c-line">{c.benefit}</span>}
            {isStarter && <span className="c-line">{c.risk}</span>}
            {locked && <span className="chip lock">{c.unlockDay ? `Unlocks on day ${c.unlockDay}` : 'Not available yet'}</span>}
            {!locked && !isStarter && <span className="c-line">{c.risk}</span>}
            {c.rival && <span className="chip violet">Rival rumour — challenge it</span>}
            {c.custom && <span className="chip violet" data-testid="custom-chip">Your own belief</span>}
            {main && false}
          </button>
        );
      })}
      {state.flags.inventor && !state.v2 && !pickingStarter && !state.outcome && (
        <button className="claim write" onClick={() => store.set({ composing: true })} data-testid="compose-open">
          <span className="c-top"><ClaimGlyph icon="scroll" /><span className="c-text">Write a belief</span></span>
          <span className="c-line">Say in a sentence what the village should come to believe. Preview is free.</span>
          <span className="chip violet">Inventor run · unranked</span>
        </button>
      )}
      {state.v2 && !pickingStarter && !state.outcome && (
        <button className="claim write" onClick={() => store.set({ composing: true })} data-testid="reality-open">
          <span className="c-top"><ClaimGlyph icon="scroll" /><span className="c-text">Write a belief into reality</span></span>
          <span className="c-line">Any sentence about how this world works. The game shows exactly what it can make real. Reading is free.</span>
          <span className="chip violet">{state.v2.lab ? 'Reality Lab · unranked' : 'Generative Reality'}</span>
        </button>
      )}
    </div>
  );
}
