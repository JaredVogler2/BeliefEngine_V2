import { useState, type CSSProperties } from 'react';
import { findClaimDef, getHand } from '../../engine/index.ts';
import { ClaimGlyph, Icon } from '../components.tsx';
import { store, useStore } from '../store.ts';
import { getTutorial } from '../tutorial.ts';

type HandCard = ReturnType<typeof getHand>[number];

/**
 * The player's stories. Normally a row of small chips (the story's mark inside a ring that fills as support grows, its name, and how
 * far along it is) so the world stays in view. The first choice of the run, and anyone who asks for details, gets the full cards that
 * say what each story does, what it risks and when the locked ones arrive.
 */
export function Hand() {
  const state = useStore((s) => s.state);
  const ui = useStore((s) => s.ui);
  const [open, setOpen] = useState(false);
  if (!state) return null;
  const hand = getHand(state);
  const tut = getTutorial(state, ui);
  const pickingStarter = state.starter === null;
  // Generative Reality runs write in the reality language; Inventor runs keep V1's composer
  const inventor = !!state.flags.inventor && !state.v2 && !pickingStarter && !state.outcome;
  const reality = !!state.v2 && !pickingStarter && !state.outcome;

  const info = (c: HandCard) => {
    const on = findClaimDef(state, c.id)?.spec.thresholds.on ?? 0.6;
    const isStarter = state.scn.starters.includes(c.id) && pickingStarter;
    const locked = !c.available && !isStarter;
    const pressed = ui.activeClaim === c.id;
    const best = c.laws.reduce((m, l) => (l.pressure > m.pressure ? l : m), c.laws[0] ?? { pressure: 0, status: 'dormant', regionName: '', progress: 0, regionId: '' });
    return { on, isStarter, locked, pressed, best };
  };
  const pick = (c: HandCard, isStarter: boolean, pressed: boolean): void => {
    if (isStarter) {
      store.act({ type: 'PICK_STARTER', claim: c.id });
      store.set({ activeClaim: c.id });
      return;
    }
    store.set({ activeClaim: pressed ? null : c.id });
  };

  if (!pickingStarter && !open) {
    return (
      <div className="hand chips" role="group" aria-label="Your stories">
        {hand.map((c, i) => {
          const { isStarter, locked, pressed, best } = info(c);
          const pct = Math.round(best.pressure * 100);
          return (
            <button
              key={c.id}
              className={`claim chip-claim ${locked ? 'locked' : ''} ${c.rival ? 'rival' : ''} ${best.status === 'active' ? 'live' : ''}`}
              aria-pressed={pressed}
              data-claim={c.id}
              disabled={locked}
              onClick={() => pick(c, isStarter, pressed)}
              title={locked ? (c.unlockDay ? `Unlocks on day ${c.unlockDay}` : 'Not available yet') : `${c.short}: ${pct}% support, ${c.believers} believe`}
            >
              <span className="c-ring" style={{ '--p': locked ? 0 : pct } as CSSProperties}>
                <ClaimGlyph icon={c.icon} />
              </span>
              <span className="c-body">
                <span className="c-text">{c.short}{!c.rival && i < 9 ? <span className="muted small"> [{i + 1}]</span> : null}</span>
                <span className="c-meta">
                  {locked
                    ? c.unlockDay ? `Unlocks on day ${c.unlockDay}` : 'Locked'
                    : c.custom ? 'Your belief'
                    : c.rival ? 'Rival rumour'
                    : best.status === 'dormant' ? `${pct}% · ${c.believers} believe` : `${best.status} · ${pct}%`}
                </span>
              </span>
              {c.custom && <span data-testid="custom-chip" className="sr-only">Your own belief</span>}
            </button>
          );
        })}
        {inventor && (
          <button className="claim chip-claim write" onClick={() => store.set({ composing: true })} data-testid="compose-open" title="Say in a sentence what the village should come to believe. Preview is free.">
            <span className="c-ring"><ClaimGlyph icon="scroll" /></span>
            <span className="c-body">
              <span className="c-text">Write a belief</span>
              <span className="c-meta">Inventor · unranked</span>
            </span>
          </button>
        )}
        {reality && (
          <button className="claim chip-claim write" onClick={() => store.set({ composing: true })} data-testid="reality-open" title="Any sentence about how this world works. The game shows exactly what it can make real. Reading is free.">
            <span className="c-ring"><ClaimGlyph icon="scroll" /></span>
            <span className="c-body">
              <span className="c-text">Write a belief into reality</span>
              <span className="c-meta">{state.v2!.lab ? 'Reality Lab · unranked' : 'Generative Reality'}</span>
            </span>
          </button>
        )}
        <button className="btn icon-btn small story-more" aria-label="Show what each story does and risks" aria-expanded={false} onClick={() => setOpen(true)} data-testid="stories-more">
          <Icon name="book" />
        </button>
      </div>
    );
  }

  return (
    <div className={`hand cards ${pickingStarter ? 'choosing' : 'drawer'}`} role="group" aria-label="Your stories">
      {hand.map((c, i) => {
        const { on, isStarter, locked, pressed, best } = info(c);
        return (
          <button
            key={c.id}
            className={`claim ${locked ? 'locked' : ''} ${c.rival ? 'rival' : ''} ${tut?.hintClaims && isStarter ? 'hint' : ''}`}
            aria-pressed={pressed}
            data-claim={c.id}
            disabled={locked}
            onClick={() => pick(c, isStarter, pressed)}
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
            {!locked && !isStarter && <span className="c-line">{c.benefit}</span>}
            {!locked && !isStarter && <span className="c-line">{c.risk}</span>}
            {c.rival && <span className="chip violet">Rival rumour: challenge it</span>}
            {c.custom && <span className="chip violet" data-testid="custom-chip">Your own belief</span>}
          </button>
        );
      })}
      {inventor && (
        <button className="claim write" onClick={() => store.set({ composing: true })} data-testid="compose-open">
          <span className="c-top"><ClaimGlyph icon="scroll" /><span className="c-text">Write a belief</span></span>
          <span className="c-line">Say in a sentence what the village should come to believe. Preview is free.</span>
          <span className="chip violet">Inventor run · unranked</span>
        </button>
      )}
      {reality && (
        <button className="claim write" onClick={() => store.set({ composing: true })} data-testid="reality-open">
          <span className="c-top"><ClaimGlyph icon="scroll" /><span className="c-text">Write a belief into reality</span></span>
          <span className="c-line">Any sentence about how this world works. The game shows exactly what it can make real. Reading is free.</span>
          <span className="chip violet">{state.v2!.lab ? 'Reality Lab · unranked' : 'Generative Reality'}</span>
        </button>
      )}
      {!pickingStarter && (
        <button className="btn small hand-close" onClick={() => setOpen(false)} data-testid="stories-less">
          Hide details
        </button>
      )}
    </div>
  );
}
