import { useEffect, useRef, useState } from 'react';
import { findClaimDef } from '../../engine/core/lookup.ts';
import type { RunState } from '../../engine/index.ts';
import { MOMENT, getMindView } from '../../engine/mind/view.ts';
import { talkCost, type TalkMode } from '../../engine/mind/talk.ts';
import { aiClient } from '../../ai/client.ts';
import { store, useStore } from '../store.ts';
import { OnlineRow, useOnlineReading } from './online.tsx';

/**
 * A villager's mind, in a V2 run (phase 07): what they want, how they tend to act, what they remember and from whom, whether they
 * are thinking today and what they did at the last dusk; and a conversation with them. They answer only from what they saw or
 * were told; what a conversation changes is decided by the game's trust and evidence rules, whoever voiced the answer.
 */

const MODES: { mode: TalkMode; label: string; needsStory: boolean }[] = [
  { mode: 'ask', label: 'Ask what they think of it', needsStory: true },
  { mode: 'persuade', label: 'Argue for it', needsStory: true },
  { mode: 'challenge', label: 'Challenge it', needsStory: true },
  { mode: 'guess', label: 'Ask what they make of things', needsStory: false },
];

export default function MindPanel({ id }: { id: string }) {
  const state = useStore((s) => s.state);
  const ui = useStore((s) => s.ui);
  const [story, setStory] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const o = useOnlineReading();
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  if (!state?.v2?.minds) return null;
  const view = getMindView(state, id);
  const v = state.villagers.find((x) => x.id === id);
  if (!view || !v) return null;
  const first = v.name.split(' ')[0];
  const stories = [...new Set([...(ui.activeClaim ? [ui.activeClaim] : []), ...Object.keys(v.beliefs), ...state.claims.filter((c) => c.available).map((c) => c.id)])].filter((c) => !!findClaimDef(state, c));
  const chosen = story && stories.includes(story) ? story : stories[0] ?? '';
  const said = [...state.log].reverse().find((e) => e.code === 'KEEPER_TALKED' && e.target === id && e.day === state.day);

  const talk = (mode: TalkMode) => {
    const claim = MODES.find((m) => m.mode === mode)!.needsStory ? chosen : chosen || null;
    setBusy(true);
    setNote(null);
    window.setTimeout(async () => {
      let reply: { line: string; cites: string[] } | undefined;
      if (o.online) {
        const r = await aiClient.talkReply(store.state as RunState, id, mode, claim || null);
        if (!alive.current) return;
        if (r.ok) reply = { line: r.line, cites: r.cites };
        else setNote(`${r.why} ${first} answers in their own words instead.`);
      }
      store.act({ type: 'TALK', target: id, mode, ...(claim ? { claim } : {}), ...(reply ? { reply } : {}) });
      if (alive.current) setBusy(false);
    }, 0);
  };

  return (
    <section data-testid="mind-panel" aria-label={`${first}'s mind`}>
      <h3>Their mind</h3>
      <p className="small" style={{ margin: '0 0 0.3rem' }} data-testid="mind-traits">{view.traits.join(', ')}.</p>
      {view.goals.length > 0 && <p className="small" style={{ margin: '0 0 0.3rem' }} data-testid="mind-goals">Wants to {view.goals.join(', ')}.</p>}
      {view.thinking && <p className="small" data-testid="mind-thinking" style={{ margin: '0 0 0.3rem', color: 'var(--gold)' }}>{view.thinking}</p>}
      {view.last && <p className="small" data-testid="mind-last" style={{ margin: '0 0 0.3rem' }}>{view.last}</p>}

      <h3>What they remember</h3>
      {view.memories.length === 0 ? (
        <p className="small muted" data-testid="mind-memories-empty">Nothing yet: memories are made at the end of each day, from what they saw and were told.</p>
      ) : (
        <ul className="small memories" data-testid="mind-memories">
          {view.memories.map((m) => (
            <li key={m.id}>
              <span className={`chip ${m.how === 'saw it' ? 'good' : ''}`} style={{ marginRight: '0.3rem' }}>{m.how} · day {m.day}</span>
              {m.text}
            </li>
          ))}
        </ul>
      )}
      {view.summary.length > 0 && <ul className="small muted" data-testid="mind-summary">{view.summary.map((t, i) => <li key={i}>{t}</li>)}</ul>}

      <h3>Talk with {first}</h3>
      {v.status === 'dead' ? (
        <p className="small muted">They are gone.</p>
      ) : (
        <>
          {stories.length > 0 && (
            <label className="small" style={{ display: 'block', marginBottom: '0.3rem' }}>
              About{' '}
              <select value={chosen} onChange={(e) => setStory(e.target.value)} data-testid="talk-story">
                {stories.map((c) => <option key={c} value={c}>{findClaimDef(state, c)?.short ?? c}</option>)}
              </select>
            </label>
          )}
          <div className="row wrap" style={{ gap: '0.3rem' }}>
            {MODES.map((m) => (
              <button key={m.mode} type="button" className="btn small" disabled={busy || (m.needsStory && !chosen)} onClick={() => talk(m.mode)} data-testid={`talk-${m.mode}`}>
                {m.label}{talkCost(m.mode) ? ` · ${talkCost(m.mode)} Influence` : ''}
              </button>
            ))}
          </div>
          <OnlineRow o={o} prefix="talk" leaves={`What ${first} remembers, their beliefs and ties, the stories they know, and what you ask are sent. Nothing about other villagers' private lives is.`} />
          {note && <p className="small muted" data-testid="talk-note">{note}</p>}
          {said && <p className="small" data-testid="talk-reply" style={{ marginTop: '0.4rem' }}>{said.text}</p>}
        </>
      )}
    </section>
  );
}

/**
 * The village's minds today: who is due to think and why, and what everyone decided at the last dusk. With the player's consent a
 * model may propose today's decisions; the game holds each to the live run and the rest decide by their own lights at dusk.
 */
export function VillageMinds() {
  const state = useStore((s) => s.state);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const o = useOnlineReading();
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const minds = state?.v2?.minds;
  if (!state || !minds) return null;
  const name = (id: string) => state.villagers.find((v) => v.id === id)?.name ?? id;
  const pending = minds.queue.filter((q) => !minds.decided[q.id]);
  const decideNow = () => {
    setBusy(true);
    setNote(null);
    window.setTimeout(async () => {
      const r = await aiClient.npcDecisions(store.state as RunState);
      if (!alive.current) return;
      if (!r.ok) setNote(`${r.why} They will decide by their own lights at dusk.`);
      else if (!r.decisions.length) setNote('No proposal could be used. They will decide by their own lights at dusk.');
      else {
        const res = store.act({ type: 'NPC_DECIDE', rev: r.rev, decisions: r.decisions });
        if (res?.ok) setNote(res.events.map((e) => e.text).join(' '));
      }
      setBusy(false);
    }, 0);
  };
  return (
    <section data-testid="village-minds" aria-label="Who is thinking today">
      <h3>Who is thinking today</h3>
      {minds.queue.length === 0 ? (
        <p className="small muted" data-testid="minds-none">Nobody yet: villagers stop to think after something that matters to them (a loss, a new story, a failed proof, danger, an argument).</p>
      ) : (
        <ul className="small" data-testid="minds-queue">
          {minds.queue.map((q) => (
            <li key={q.id}>
              <button type="button" className="linkish" onClick={() => store.select({ kind: 'villager', id: q.id })}>{name(q.id)}</button>
              {' '}<span className="muted">(after {MOMENT[q.why]})</span>
              {minds.decided[q.id] && <span className="chip violet" style={{ marginLeft: '0.3rem' }}>decided</span>}
            </li>
          ))}
        </ul>
      )}
      {minds.queue.length > 0 && (
        <>
          <OnlineRow o={o} prefix="minds" leaves="For each villager thinking today: what they remember, their beliefs and ties, and the moves open to them. Nothing else about the village is sent." />
          {o.online && pending.length > 0 && (
            <button type="button" className="btn small" disabled={busy} onClick={decideNow} data-testid="minds-decide">{busy ? 'Thinking…' : `Let them decide now (${pending.length})`}</button>
          )}
          {!o.online && <p className="small muted" style={{ margin: '0.2rem 0 0' }}>Offline, they decide by their own lights at dusk.</p>}
        </>
      )}
      {note && <p className="small" data-testid="minds-note">{note}</p>}
      {minds.last.length > 0 && (
        <>
          <h3>At the last dusk</h3>
          <ul className="small" data-testid="minds-last">
            {minds.last.map((c) => (
              <li key={c.citizenId}>
                <b>{name(c.citizenId)}</b>: {getMindView(state, c.citizenId)?.last?.replace(/^Last dusk they /, '') ?? c.intent}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
