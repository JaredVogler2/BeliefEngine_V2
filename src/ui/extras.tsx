import { PLEDGES, PLEDGE_UNLOCK, PRESETS, applicableModifiers, extraClaimsFor, getScenarioDef, optionsFromState, personalBest, DRAFT_BONUS, pledgeMultiplier } from '../engine/index.ts';
import type { RunReward, RunState } from '../engine/index.ts';
import { Icon } from './components.tsx';
import { loadProgress } from './progress.ts';
import { runKind } from './modes.ts';
import { store, useStore } from './store.ts';
import { sfx } from '../audio/audio.ts';
import { TWIST_BONUS } from '../engine/core/score.ts';

/** What the run that just ended earned: badges, unlocks, new Atlas entries, and an honest comparison with a comparable best. */
export function Rewards({ reward }: { reward: RunReward }) {
  const best = personalBest(loadProgress(), reward.record);
  const nothing = !reward.newAchievements.length && !reward.newUnlocks.length && !reward.newKnowledge.length && !reward.newLaws.length;
  return (
    <section data-testid="rewards">
      <h2>What you took from it</h2>
      {reward.record.debug && <p className="small muted">This run used the debug loader, so it earns nothing.</p>}
      {reward.newAchievements.map((a) => (
        <div key={a.id} className="reward" data-reward={`badge-${a.id}`}><span className="glyph-circle"><Icon name={a.icon} /></span><div><b>Badge: {a.name}</b><div className="small muted">{a.desc}</div></div></div>
      ))}
      {reward.newUnlocks.map((u) => (
        <div key={u.id} className="reward gold" data-reward={`unlock-${u.id}`}><span className="glyph-circle"><Icon name="star" /></span><div><b>Unlocked: {u.name}</b><div className="small">{u.opens}</div></div></div>
      ))}
      {reward.newLaws.map((id) => (
        <div key={id} className="reward" data-reward={`law-${id}`}><span className="glyph-circle"><Icon name="scroll" /></span><div><b>Atlas: a new law recorded</b><div className="small muted">{loadProgress().atlas.laws[id]?.short}</div></div></div>
      ))}
      {reward.newKnowledge.map((k) => (
        <div key={k.id} className="reward" data-reward={`lore-${k.id}`}><span className="glyph-circle"><Icon name="book" /></span><div><b>Learned: {k.title}</b><div className="small muted">{k.text}</div></div></div>
      ))}
      {nothing && !reward.record.debug && <p className="small muted">Nothing new this time. A different story, village or plan may show you something you have not seen.</p>}
      <p className="postcard" data-testid="postcard">“{reward.postcard}”</p>
      {best && reward.record.result === 'victory' && (
        <p className="small" data-testid="best">Your best on this village with the same difficulty and pledges: {best.score}. This run: {reward.record.score}{reward.record.score > best.score ? ' — a new best.' : '.'}</p>
      )}
      <button className="btn small" onClick={() => store.set({ screen: 'atlas' })} data-testid="open-atlas">Open the Atlas</button>
    </section>
  );
}

/** Inventor mode: the player may write beliefs of their own. Always available (not unlocked), never in the daily, never ranked. */
export function InventorCard({ state }: { state: RunState }) {
  if (runKind(state) === 'daily') return null;
  const cur = optionsFromState(state);
  const on = !!state.flags.inventor;
  return (
    <section className="card" data-testid="inventor-card" style={{ marginTop: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>Inventor mode</h2>
      <label className="toggle-row" style={{ borderBottom: 0 }}>
        <span>
          <b>Write beliefs of your own in this run.</b>{' '}
          <span className="muted">
            You type a sentence; the game shows what it would really do, what it needs and what it costs, and you decide. A belief you write is weighed by
            the same rules as the built-in ones: it only works if villagers come to believe it, and stronger beliefs ask more of them.
            An Inventor run is <b>unranked</b>: no personal bests, no Atlas entries, no unlocks. It can earn one badge of its own.
          </span>
        </span>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            sfx('click');
            store.newRun({ ...cur, inventor: e.target.checked ? true : undefined });
          }}
          data-testid="opt-inventor"
        />
      </label>
    </section>
  );
}

/** Briefing choices that exist because of what the player has unlocked. Each one changes a rule of the run. */
export function OptionsCard({ state }: { state: RunState }) {
  const ui = useStore((s) => s.ui);
  void ui;
  const p = loadProgress();
  const kind = runKind(state);
  if (kind === 'daily') return null;
  const base = getScenarioDef(state.scenarioId);
  const cur = optionsFromState(state);
  const pledges = cur.pledges ?? [];
  const extras = extraClaimsFor(state.scenarioId).filter((c) => p.unlocks[c.unlock]);
  const myClaims = base.runtime.claimDefs.filter((c) => !c.rival);
  const canDraft = !!p.unlocks.draft_mode && myClaims.length >= 3;
  const drafted = (cur.draft ?? []).length >= 2 ? cur.draft! : [];
  const pledgeList = PLEDGES.filter((pl) => p.unlocks[PLEDGE_UNLOCK[pl.id]] && pl.applies(base));
  const canTwist = kind === 'story' && !!p.unlocks.story_twists;
  const twistList = canTwist ? applicableModifiers(base) : [];
  const chosenTwists = state.flags.twisted ? state.modifiers.filter((m) => !m.startsWith('pledge:')) : [];
  const presets = canTwist ? PRESETS.filter((pr) => p.unlocks[pr.unlock]) : [];
  if (!extras.length && !canDraft && !pledgeList.length && !twistList.length) return null;
  const apply = (patch: Partial<ReturnType<typeof optionsFromState>>) => {
    sfx('click');
    store.newRun({ ...cur, ...patch });
  };
  const mult = Math.round(pledgeMultiplier(state.modifiers) * (state.flags.drafted ? 1 + DRAFT_BONUS : 1) * (state.flags.twisted ? 1 + Math.min(0.3, TWIST_BONUS * state.flags.twisted) : 1) * 100) / 100;
  return (
    <section className="card" data-testid="options-card" style={{ marginTop: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>Your options</h2>
      <p className="small muted">Unlocked by what you have done. They change the rules of this run; the score multiplier below is added to the difficulty multiplier. Changing one rebuilds the briefing with the same seed.</p>
      {extras.map((c) => (
        <label key={c.id} className="toggle-row"><span><b>Extra opening story:</b> {c.def.short}. <span className="muted">{c.def.benefit} {c.def.risk}</span></span>
          <input type="checkbox" checked={state.scn.claimDefs.some((d) => d.id === c.id)} onChange={(e) => apply({ extraClaims: e.target.checked ? [c.id] : [] })} data-testid={`opt-extra-${c.id}`} /></label>
      ))}
      {canDraft && (
        <fieldset className="field">
          <legend><b>Draft:</b> keep only two stories (+{Math.round(DRAFT_BONUS * 100)}% score)</legend>
          {myClaims.map((c) => {
            const on = drafted.includes(c.id);
            return (
              <label key={c.id} className="toggle-row"><span>{c.short}</span>
                <input type="checkbox" checked={on} data-testid={`opt-draft-${c.id}`} onChange={(e) => {
                  const next = e.target.checked ? [...drafted, c.id] : drafted.filter((x) => x !== c.id);
                  apply({ draft: next.length >= 2 ? next.slice(-2) : next });
                }} /></label>
            );
          })}
          <span className="small muted">Pick two. The others will not be available this run.</span>
        </fieldset>
      )}
      {pledgeList.map((pl) => (
        <label key={pl.id} className="toggle-row"><span><b>{pl.name}</b> (+{Math.round(pl.bonus * 100)}%): <span className="muted">{pl.blurb}</span></span>
          <input type="checkbox" checked={pledges.includes(pl.id)} onChange={(e) => apply({ pledges: e.target.checked ? [...pledges, pl.id] : pledges.filter((x) => x !== pl.id) })} data-testid={`opt-pledge-${pl.id}`} /></label>
      ))}
      {twistList.length > 0 && (
        <fieldset className="field">
          <legend><b>Twists</b> (+{Math.round(TWIST_BONUS * 100)}% score each, up to 3)</legend>
          {presets.map((pr) => (
            <button key={pr.id} className="btn small" data-testid={`preset-${pr.id}`} onClick={() => apply({ modifiers: pr.modifiers })}>Preset: {pr.name}</button>
          ))}
          {chosenTwists.length > 0 && <button className="btn small ghost" onClick={() => apply({ modifiers: [] })}>Clear twists</button>}
          {twistList.map((m) => (
            <label key={m.id} className="toggle-row"><span><b>{m.name}</b>: <span className="muted">{m.blurb}</span></span>
              <input type="checkbox" checked={chosenTwists.includes(m.id)} data-testid={`opt-twist-${m.id}`} onChange={(e) => apply({ modifiers: e.target.checked ? [...chosenTwists, m.id].slice(-3) : chosenTwists.filter((x) => x !== m.id) })} /></label>
          ))}
        </fieldset>
      )}
      <p className="small" data-testid="options-mult">Extra score multiplier from your choices: ×{mult}</p>
    </section>
  );
}
