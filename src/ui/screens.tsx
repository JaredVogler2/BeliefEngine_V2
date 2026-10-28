import { Aftermath } from './play/Aftermath.tsx';
import { useEffect, useRef, useState } from 'react';
import type { RunState } from '../engine/index.ts';
import { MAX_SEED, optionsFromState, buildDebrief, catalogInfo, isVerifiedSeed, createRun, getModifier, getModifierViews, getScenarioDef, listScenarios, numberToDate } from '../engine/index.ts';
import type { Difficulty } from '../engine/index.ts';
import { MapRenderer } from '../render/MapRenderer.ts';
import { unlockAudio, sfx } from '../audio/audio.ts';
import { Icon } from './components.tsx';
import { dailyBest, loadProgress, playedExpeditionSeeds } from './progress.ts';
import { InventorCard, OptionsCard, Rewards } from './extras.tsx';
import { BIOME_LABEL, dailyLabel, dailyOptions, expeditionOptions, freshExpeditionSeed, previewVillage, randomEntropy, runKind, shareLink, storyOptions, todayUtc, type VillagePreview } from './modes.ts';
import { downloadText } from './files.ts';
import { useWhatIf } from './whatif.ts';
import { store, useStore } from './store.ts';
import { V2_FEATURES } from '../v2/features.ts';
import { RealityProvenance } from './play/Provenance.tsx';

// ------------------------------------------------------------------ title

function TitleBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useStore((s) => s.ui.settings.reducedMotion);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let r: MapRenderer;
    try {
      r = new MapRenderer(canvas);
    } catch {
      return;
    }
    const s = createRun({ scenarioId: 'redbank', seed: 7 });
    for (const l of s.world.landmarks) if (l.kind === 'beacon' && l.district === 'east') {
      l.lit = true;
      l.fuelNights = 3;
    }
    r.setState(s);
    r.setOptions({ reducedMotion: reduced, showFlood: false, lens: 'none', quality: 'low', hints: [] });
    r.setLabels(false);
    const size = () => {
      const p = canvas.parentElement!.getBoundingClientRect();
      r.resize(p.width, p.height, 1);
      r.cam.zoom = Math.max(r.cam.zoom, (p.width / (28 * 32)) * 1.04, (p.height / (18 * 32)) * 1.04, 0.9);
    };
    size();
    r.start();
    const ro = new ResizeObserver(size);
    ro.observe(canvas.parentElement!);
    let raf = 0;
    let t = 0;
    const drift = () => {
      raf = requestAnimationFrame(drift);
      t += 0.003;
      if (!reduced) {
        r.cam.cx = 14 * 32 + Math.sin(t) * 260;
        r.cam.cy = 9 * 32 + Math.cos(t * 0.7) * 60;
        r.setOptions({});
      }
    };
    drift();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      r.destroy();
    };
  }, [reduced]);
  return (
    <div className="title-bg" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}

export function Title() {
  const ui = useStore((s) => s.ui);
  const info = store.savedInfo();
  const seen = loadProgress().runs.length;
  const atlasCount = Object.keys(loadProgress().achievements).length;
  return (
    <main className="screen title-screen" data-testid="title">
      <TitleBackdrop />
      <div>
        <h1 className="logo">
          <small>THE KEEPER OF STORIES</small>
          Belief Engine <span className="logo-mark">V2</span>
        </h1>
        <p className="tagline">Convince the village it is true — and the world obeys. But belief spreads both ways.</p>
        <nav className="menu" aria-label="Main menu">
          {info && (
            <button className="btn primary big" data-testid="continue" onClick={() => { unlockAudio(); sfx('click'); store.continueRun(); }}>
              Continue — {getScenarioDef(info.scenarioId).runtime.name}, day {info.day}/{info.maxDay}
            </button>
          )}
          <button className={`btn ${info ? '' : 'primary'} big`} data-testid="play" onClick={() => { unlockAudio(); sfx('click'); store.set({ screen: 'scenarios' }); }}>
            {info ? 'New game' : 'Play'}
          </button>
          <button className="btn" data-testid="atlas-open" onClick={() => store.set({ screen: 'atlas' })}>Atlas of Belief{atlasCount > 0 ? ` (${atlasCount} badge${atlasCount === 1 ? '' : 's'})` : ''}</button>
          <button className="btn" onClick={() => store.set({ screen: 'howto' })}>How it works</button>
          <button className="btn" onClick={() => store.set({ screen: 'settings' })}>Settings</button>
          <button className="btn ghost" onClick={() => store.set({ screen: 'credits' })}>Credits</button>
        </nav>
        {ui.loadError && <div className="toast error" role="alert" style={{ margin: '1rem auto', maxWidth: 440 }}>{ui.loadError}</div>}
        <p className="footer-note">Works offline once loaded. Saves stay on this device. No accounts, no tracking.{seen ? ` ${seen} run${seen === 1 ? '' : 's'} archived locally.` : ''}</p>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------ scenario select + briefing

type ModeTab = 'story' | 'expedition' | 'daily' | 'reality';
/** the V2 mode a run was played in (flags.reality), as its records name it */
const MODE_LABEL: Record<1 | 2 | 3, string> = { 1: 'Generative Chronicle (its own records)', 2: 'Reality Lab (unranked)', 3: 'Living Village (its own records)' };

function ModifierList({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <ul className="twists">
      {ids.map((id) => {
        const m = getModifier(id);
        return m ? <li key={id}><b>{m.name}</b>: {m.blurb} <span className="muted">{m.tradeoff}</span></li> : null;
      })}
    </ul>
  );
}

function VillageCard({ p }: { p: VillagePreview }) {
  return (
    <div className="village-card" data-testid="village-preview">
      <h3>{p.name}</h3>
      <div className="row wrap">
        <span className="chip">{BIOME_LABEL[p.biome] ?? p.biome}</span>
        <span className="chip">{p.population} villagers</span>
        <span className="chip">{p.days} days</span>
        {p.verified ? <span className="chip good" title="A scripted planner won this village in offline testing.">Verified winnable</span> : <span className="chip warn" title="Not checked offline. It may be harder than usual, or not winnable.">Unverified seed</span>}
      </div>
      {p.modifiers.length > 0 && <><h4>Twists this time</h4><ModifierList ids={p.modifiers} /></>}
    </div>
  );
}

export function Scenarios() {
  const list = listScenarios();
  const prog = loadProgress();
  const [tab, setTab] = useState<ModeTab>('story');
  const [seedText, setSeedText] = useState<string>(() => String(freshExpeditionSeed(playedExpeditionSeeds())));
  const seedNum = /^\d{1,10}$/.test(seedText) && Number(seedText) <= MAX_SEED ? Number(seedText) : null;
  const village = seedNum === null ? null : previewVillage(seedNum);
  const today = todayUtc();
  const dailyOpts = dailyOptions(today);
  const dailyVillage = previewVillage(dailyOpts.seed);
  const best = dailyBest(today);
  const recent = prog.runs.filter((r) => r.mode === 'daily' && !r.debug).slice(-5).reverse();
  return (
    <main className="screen">
      <div className="page">
        <button className="btn small" onClick={() => store.set({ screen: 'title' })}>← Back</button>
        <h1 style={{ marginTop: '0.8rem' }}>Choose how to play</h1>
        <div className="tabs mode-tabs" role="tablist" aria-label="Game mode">
          {([['story', 'Story chapters'], ['expedition', 'Expedition'], ['daily', 'Daily village'], ...(V2_FEATURES.generativeReality ? [['reality', 'Generative Reality']] : [])] as [ModeTab, string][]).map(([t, label]) => (
            <button key={t} role="tab" className="tab" aria-selected={tab === t} data-testid={`mode-${t}`} onClick={() => { sfx('click'); setTab(t); }}>{label}</button>
          ))}
        </div>
        {tab === 'story' && (
          <>
            <p className="muted">Hand-made chapters, each with a new twist. Every one can be won in more than one way.</p>
            <div className="grid2">
              {list.map((sc) => {
                const wins = prog.runs.filter((r) => r.scenarioId === sc.id && r.result === 'victory' && !r.debug).length;
                return (
                  <div key={sc.id} className="card scn-card" data-testid={`scn-${sc.id}`}>
                    <h2>{sc.name}</h2>
                    <p>{sc.tagline}</p>
                    <div className="row wrap">
                      <span className="chip">{sc.days} days</span>
                      <span className="chip">{'★'.repeat(sc.difficulty)}{'☆'.repeat(5 - sc.difficulty)} difficulty</span>
                      <span className="chip">{sc.threat}</span>
                      {wins > 0 && <span className="chip good">Won ×{wins}</span>}
                    </div>
                    <button className="btn primary" onClick={() => { sfx('click'); store.newRun(storyOptions(sc.id)); }} data-testid={`begin-${sc.id}`}>
                      Begin
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {tab === 'reality' && V2_FEATURES.generativeReality && (
          <section data-testid="reality-panel">
            <p className="muted">
              The story chapters, with one difference: you can write any belief about how the world works, in your own words. The game shows exactly what it can make real
              of it (and what it cannot), and a belief only changes the world once enough villagers hold it. These runs also have chickens and loose stones to work with.
              Reading is offline unless you choose otherwise.
            </p>
            <p className="muted small" data-testid="mode-notes">
              <b>Generative Chronicle</b> (Begin): write your own laws; its own records. <b>Living Village</b>: the chapter&apos;s own stories, with villagers who remember,
              argue and demand proof; its own records. <b>Reality Lab</b>: stronger beliefs, never ranked. Classic (the other tabs) keeps its records apart from all three.
            </p>
            <div className="grid2">
              {list.map((sc) => (
                <div key={sc.id} className="card scn-card" data-testid={`reality-scn-${sc.id}`}>
                  <h2>{sc.name}</h2>
                  <p>{sc.tagline}</p>
                  <div className="row wrap">
                    <span className="chip">{sc.days} days</span>
                    <span className="chip violet">Write your own laws</span>
                  </div>
                  <div className="row wrap" style={{ gap: '0.5rem' }}>
                    <button className="btn primary" onClick={() => { sfx('click'); store.newRun({ ...storyOptions(sc.id), reality: true }); }} data-testid={`begin-reality-${sc.id}`}>Begin</button>
                    <button className="btn" title="The chapter's own stories, and villagers who remember, argue, demand proof and put their own claims: more of them think each day. Its own records." onClick={() => { sfx('click'); store.newRun({ ...storyOptions(sc.id), living: true }); }} data-testid={`begin-living-${sc.id}`}>Living Village</button>
                    <button className="btn" title="Three clauses, wider reach and stronger beliefs; never ranked." onClick={() => { sfx('click'); store.newRun({ ...storyOptions(sc.id), realityLab: true }); }} data-testid={`begin-lab-${sc.id}`}>Reality Lab (unranked)</button>
                  </div>
                </div>
              ))}
              <div className="card scn-card" data-testid="reality-scn-expedition">
                <h2>A generated village</h2>
                <p>Any village the generator builds, with its own map, people and crisis: the same seed always builds the same one.</p>
                <label className="field">
                  <span>Village seed</span>
                  <input type="text" inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))} aria-label="Village seed for a Generative Reality run" data-testid="reality-expedition-seed" />
                </label>
                <div className="row wrap">
                  {village && <span className="chip">{village.days} days</span>}
                  <span className="chip violet">Write your own laws</span>
                </div>
                <button className="btn primary" disabled={seedNum === null} onClick={() => { if (seedNum !== null) { sfx('click'); store.newRun({ ...expeditionOptions(seedNum), reality: true }); } }} data-testid="begin-reality-expedition">Begin</button>
              </div>
            </div>
          </section>
        )}
        {tab === 'expedition' && (
          <section data-testid="expedition-panel">
            <p className="muted">A new village every time: its own map, people, ties of trust, crisis and twists. About 12–25 minutes. The same seed always builds the same village.</p>
            <div className="card">
              <div className="grid2">
                <label className="field">
                  <span>Village seed</span>
                  <div className="row">
                    <input type="text" inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))} aria-label="Village seed" data-testid="expedition-seed" />
                    <button className="btn small" data-testid="expedition-another" onClick={() => { sfx('click'); setSeedText(String(freshExpeditionSeed(playedExpeditionSeeds()))); }}>Another village</button>
                  </div>
                </label>
                <label className="field">
                  <span>Wild card</span>
                  <button className="btn small" data-testid="expedition-random" onClick={() => { sfx('click'); setSeedText(String(randomEntropy() % MAX_SEED)); }}>Any random seed (may be unverified)</button>
                </label>
              </div>
              {village ? <VillageCard p={village} /> : <p className="error-text" role="alert">Enter a whole number from 0 to {MAX_SEED}.</p>}
              <div className="row spread wrap" style={{ marginTop: '0.8rem' }}>
                <span className="small muted">{catalogInfo().verified} villages verified offline. Any other seed still plays, but is marked unverified.</span>
                <button className="btn primary big" disabled={seedNum === null} data-testid="begin-expedition" onClick={() => { if (seedNum !== null) { sfx('click'); store.newRun(expeditionOptions(seedNum)); } }}>Begin expedition</button>
              </div>
            </div>
          </section>
        )}
        {tab === 'daily' && (
          <section data-testid="daily-panel">
            <p className="muted">One village for everyone, every UTC day: <b>{dailyLabel(today)}</b>. Same seed, same difficulty, no server. There is no global leaderboard; your results are kept on this device only.</p>
            <div className="card">
              <VillageCard p={dailyVillage} />
              <p className="small" data-testid="daily-status">{best ? `Today: ${best.result === 'victory' ? 'won' : 'lost'} with a score of ${best.score}.` : 'Not played yet today.'}</p>
              <div className="row spread wrap">
                <span className="small muted">The date is read when you begin, in UTC, and is stored in the run so it never changes mid-game.</span>
                <button className="btn primary big" data-testid="begin-daily" onClick={() => { sfx('click'); store.newRun(dailyOptions(todayUtc())); }}>{best ? 'Play it again' : "Play today's village"}</button>
              </div>
            </div>
            {recent.length > 0 && (
              <>
                <h2>Recent dailies</h2>
                <table className="breakdown"><tbody>
                  {recent.map((r, i) => <tr key={i}><td>{r.dailyDate ? numberToDate(r.dailyDate) : '—'}</td><td>{r.name ?? r.scenarioId}</td><td>{r.result === 'victory' ? 'Victory' : 'Defeat'}</td><td>{r.score}</td></tr>)}
                </tbody></table>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function randomSeed(): number {
  return randomEntropy() % 1000000;
}

export function Briefing() {
  const state = useStore((s) => s.state);
  const ui = useStore((s) => s.ui);
  const [seed, setSeed] = useState<string>(String(state?.seed ?? 1));
  const [diff, setDiff] = useState<Difficulty>(state?.difficulty ?? 'normal');
  if (!state) return null;
  const sc = state.scn;
  const series = sc.threatKind === 'wolves' ? sc.threat.map((t) => t.pack) : sc.threat.map((t) => t.level);
  const maxLevel = Math.max(...series, 1);
  const seriesName = sc.threatKind === 'wolves' ? 'Packs hunting, night by night' : sc.threatKind === 'drought' ? 'The heat, night by night' : 'The river, night by night';
  const lossLine = sc.objectives.find((o) => o.instantLoss);
  const kind = runKind(state);
  const twists = getModifierViews(state);
  const verified = kind === 'expedition' || kind === 'daily' ? isVerifiedSeed(state.seed) : null;
  const begin = () => {
    sfx('click');
    const n = Number.parseInt(seed, 10);
    const sd = Number.isFinite(n) && n >= 0 && n <= MAX_SEED ? n : 1;
    if (kind === 'expedition' && (sd !== state.seed || diff !== state.difficulty)) store.newRun({ ...optionsFromState(state), ...expeditionOptions(sd, diff) });
    else if (kind === 'story' && (sd !== state.seed || diff !== state.difficulty)) store.newRun({ ...optionsFromState(state), seed: sd, difficulty: diff });
    store.set({ screen: 'play', activeClaim: null });
  };
  return (
    <main className="screen" data-testid="briefing">
      <div className="page">
        <button className="btn small" onClick={() => store.set({ screen: 'scenarios' })}>← Back</button>
        <h1 style={{ marginTop: '0.8rem' }}>{sc.name}</h1>
        <div className="row wrap" data-testid="briefing-meta">
          <span className="chip">{kind === 'story' ? 'Story chapter' : kind === 'daily' ? `Daily village · ${dailyLabel(state.flags.dailyDate ?? todayUtc())} UTC` : 'Expedition'}</span>
          {verified === true && <span className="chip good" title="A scripted planner won this exact village in offline testing.">Verified winnable</span>}
          {verified === false && <span className="chip warn" title="Not checked offline. It may be harder than usual, or not winnable.">Unverified seed</span>}
        </div>
        {ui.notes.map((n, i) => <p key={i} className="toast warn" role="status" data-testid="link-note" style={{ position: 'static' }}>{n}</p>)}
        <p style={{ fontFamily: 'var(--serif)', fontSize: '1.2rem' }}>{sc.tagline}</p>
        {sc.briefing.map((l, i) => <p key={i}>{l}</p>)}
        <h2>{seriesName}</h2>
        <div className="row" style={{ alignItems: 'flex-end', gap: 6, height: 110 }} role="img" aria-label={`Forecast by day: ${sc.threat.map((t, i) => `day ${t.day} ${series[i]}`).join(', ')}`}>
          {sc.threat.map((t, i) => (
            <div key={t.day} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: `${Math.max(6, (series[i] / maxLevel) * 80)}px`, background: series[i] / maxLevel >= 0.66 ? 'var(--bad)' : 'var(--river)', borderRadius: 4, opacity: 0.85 }} />
              <div className="small muted">D{t.day}</div>
            </div>
          ))}
        </div>
        {twists.length > 0 && (
          <section data-testid="twists">
            <h2>Twists this time</h2>
            <ul className="twists">{twists.map((m) => <li key={m.id}><b>{m.name}</b>: {m.blurb} <span className="muted">{m.tradeoff}</span></li>)}</ul>
          </section>
        )}
        <h2>You win if, at the end of day {sc.durationDays}</h2>
        <ul>{sc.objectives.filter((o) => !o.instantLoss && !o.heroic).map((o) => <li key={o.id}>{o.label}</li>)}</ul>
        <p className="small muted">{lossLine ? `You lose at once if the village falls below ${lossLine.value} people. ` : ''}You can undo any planned action until you end the day.</p>
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="grid2">
            <label className="field">
              <span>Difficulty{kind === 'daily' ? ' (fixed for the daily)' : ''}</span>
              <select value={diff} onChange={(e) => setDiff(e.target.value as Difficulty)} data-testid="difficulty" disabled={kind === 'daily'}>
                <option value="story">Story — more Influence, kinder villagers</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard — less fuel, a bolder rival</option>
              </select>
            </label>
            <label className="field">
              <span>{kind === 'expedition' ? 'Village seed (the seed builds the whole village)' : kind === 'daily' ? 'Village seed (set by the date)' : 'Seed (same seed = same crisis, same rival)'}</span>
              <div className="row">
                <input type="text" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))} aria-label="Seed" data-testid="seed" readOnly={kind === 'daily'} />
                {kind !== 'daily' && <button className="btn small" onClick={() => setSeed(String(randomSeed()))}>Random</button>}
              </div>
            </label>
          </div>
        </div>
        <OptionsCard state={state} />
        <InventorCard state={state} />
        <div className="row spread wrap sticky-cta">
          <button className="btn" onClick={begin}>Skip briefing</button>
          <button className="btn primary big" onClick={begin} data-testid="begin">Begin the first day</button>
        </div>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------ debrief

/** After a defeat: replay the run from each day with other plans and say, plainly, when it could still have been saved. */
function WhatIfCard({ state }: { state: RunState }) {
  const w = useWhatIf(state);
  const last = state.history.length;
  return (
    <section className="chain whatif" data-testid="whatif" aria-live="polite">
      <b>What would have changed it</b>
      {w.status === 'searching' && (
        <p className="muted small" role="status" data-testid="whatif-searching">
          Replaying your run from each day with other plans ({Math.min(99, Math.round((100 * w.done) / w.planned))}%)…
        </p>
      )}
      {w.status === 'done' && w.result.latest && (
        <>
          <p data-testid="whatif-latest">
            {w.result.latest.day >= last
              ? `Even on the last day a different plan survived.`
              : `The last day a different plan could still have saved it was day ${w.result.latest.day}; after that none of the plans we tried could.`}
          </p>
          <ul style={{ padding: 0, margin: '0.3rem 0 0 1.2rem' }}>
            <li>
              <span className="muted small">Day {w.result.latest.day}</span> You: {w.result.latest.yours.join('; ') || 'nothing'}.
            </li>
            <li>
              <span className="muted small">Instead</span> {w.result.latest.instead.join('; ') || 'nothing'}, then {w.result.latest.plan}: {w.result.latest.alive} of {state.villagers.length} survived and {w.result.latest.homes} homes stood.
            </li>
            {w.result.earliest && w.result.earliest.day < w.result.latest.day && (
              <li>
                <span className="muted small">Day {w.result.earliest.day}</span> An opening of {w.result.earliest.instead.join('; ') || 'nothing'} (then {w.result.earliest.plan}) also survived, instead of your {w.result.earliest.yours.join('; ') || 'nothing'}.
              </li>
            )}
          </ul>
          <p className="small muted">Played by a simple program on your seed with the real dice. It shows a route existed, not that it was easy to see. Retry this seed to try it.</p>
        </>
      )}
      {w.status === 'done' && !w.result.latest && (
        <p data-testid="whatif-none" className="muted">Three simple plans, started from every day of this run, all lost it as well. This village may be hard, or may need something they do not try; the notes below are the best hints.</p>
      )}
    </section>
  );
}

/** What an Inventor run wrote, whether each belief ever became law, and the plain statement that the run is unranked. */
function InventorNote({ state }: { state: RunState }) {
  const mine = state.claims.filter((c) => c.def?.custom);
  return (
    <section className="card" data-testid="inventor-note">
      <h2 style={{ marginTop: 0 }}>Inventor run (unranked)</h2>
      <p className="small muted" style={{ marginTop: 0 }}>This run does not count toward personal bests, the Atlas or unlocks. Its only reward is the badge for seeing a belief of your own become law.</p>
      {mine.length === 0 ? (
        <p className="small">You did not write a belief this time.</p>
      ) : (
        <ul className="small">
          {mine.map((c) => {
            const laws = state.laws.filter((l) => l.claimId === c.id);
            const woke = laws.find((l) => l.activatedDay !== null);
            return (
              <li key={c.id}>
                <b>{c.def!.short}</b>: “{c.def!.custom!.text}” — {woke ? `became law on day ${woke.activatedDay}` : laws.some((l) => l.progress > 0) ? 'was taking hold but never became law' : 'never took hold'}.
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Debrief() {
  const state = useStore((s) => s.state);
  const reward = useStore((s) => s.ui.reward);
  if (!state || !state.outcome) return null;
  const d = buildDebrief(state);
  const win = d.result === 'victory';
  const kind = runKind(state);
  const link = shareLink(state);
  const alt = kind === 'story' ? state.scn.starters.find((c) => c !== (state.stats.usedClaims[0] ?? state.starter)) : undefined;
  const again = () => {
    sfx('click');
    store.newRun(optionsFromState(state));
    store.set({ screen: 'play' });
  };
  const different = () => {
    sfx('click');
    const inv = state.flags.inventor ? { inventor: true } : {};
    if (kind === 'story') store.newRun({ ...storyOptions(state.scenarioId, randomSeed(), state.difficulty), ...inv });
    else store.newRun({ ...expeditionOptions(freshExpeditionSeed([...playedExpeditionSeeds(), state.seed]), state.difficulty), ...inv });
    store.set({ screen: 'play' });
  };
  return (
    <main className="screen" data-testid="debrief">
      <div className="page">
        <Aftermath state={state} win={win} />
        <div className="row" style={{ gap: '1rem' }}>
          <div className="medal" aria-hidden="true">{win ? (d.medal === 'gold' ? '🥇' : d.medal === 'silver' ? '🥈' : '🥉') : '†'}</div>
          <div>
            <h1 data-testid="verdict">{win ? 'Victory' : 'Defeat'}</h1>
            <p style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: '1.15rem' }}>{d.headline}</p>
          </div>
        </div>
        <p>{d.story}</p>
        <div className="row wrap">
          <button className="btn primary big" data-testid="retry-same" onClick={again}>{kind === 'story' ? 'Retry this seed' : kind === 'daily' ? "Replay today's village" : 'Replay this village'}</button>
          {kind !== 'daily' && <button className="btn big" data-testid="new-seed" onClick={different}>{kind === 'story' ? 'New seed' : 'Different village'}</button>}
          {kind === 'daily' && <button className="btn big" data-testid="new-seed" onClick={different}>Try an expedition</button>}
          {kind === 'expedition' && <button className="btn big" data-testid="to-daily" onClick={() => { sfx('click'); store.newRun(dailyOptions(todayUtc())); store.set({ screen: 'play' }); }}>Today’s challenge</button>}
          {alt && <button className="btn big" data-testid="try-other" onClick={again}>Try another approach</button>}
        </div>
        {state.flags.inventor && <InventorNote state={state} />}
        {state.v2 && <RealityProvenance state={state} />}
        {reward && <Rewards reward={reward} />}
        <h2>Why it went this way</h2>
        {d.chains.map((c, i) => (
          <div key={i} className={`chain ${c.kind === 'loss' ? 'loss' : c.kind === 'rival' ? 'rival' : ''}`}>
            <b>{c.title}</b>
            <ul style={{ padding: 0, margin: '0.3rem 0 0 1.2rem' }}>
              {c.steps.map((s) => <li key={s.id}><span className="muted small">Day {s.day}</span> {s.text}</li>)}
            </ul>
          </div>
        ))}
        {d.chains.length === 0 && <p className="muted">No law took hold, so nothing in the world changed because of belief.</p>}
        {!win && <WhatIfCard state={state} />}
        <h2>What you may have missed</h2>
        <ul>{d.missed.map((m, i) => <li key={i}>{m}</li>)}</ul>
        <h2>The village</h2>
        <p>{d.saved} of {state.villagers.length} survived. {d.homesSpared} home(s) and {d.livesSpared} life/lives spared by laws.{d.lost.length ? ` Lost: ${d.lost.map((l) => `${l.name} (${l.cause}, day ${l.day})`).join('; ')}.` : ''}</p>
        <h2>Score {d.score}</h2>
        <table className="breakdown"><tbody>{Object.entries(d.breakdown).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
        <p className="small muted" data-testid="seed-info">{d.seedInfo}{kind !== 'story' ? ` · village ${state.scenarioId}` : ''}{state.modifiers.length ? ` · twists: ${state.modifiers.join(', ')}` : ''}{state.flags.reality ? ` · ${MODE_LABEL[state.flags.reality as 1 | 2 | 3]}` : ''}. Score is a rough guide only; the story above matters more.</p>
        <ul className="small">{d.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        <div className="row wrap" style={{ marginTop: '1rem' }}>
          <button className="btn" data-testid="share" onClick={() => { void navigator.clipboard?.writeText(link).then(() => store.toast('Link copied. It holds only the mode, the seed and the version.', 'good'), () => store.toast(link)); }}><Icon name="share" /> Share this {kind === 'story' ? 'seed' : 'village'}</button>
          <button className="btn" onClick={() => store.set({ screen: 'title' })}>Main menu</button>
        </div>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------ how to / settings / credits

export function HowTo() {
  const back = store.state && !store.state.outcome ? 'play' : 'title';
  return (
    <main className="screen" data-testid="howto">
      <div className="page">
        <button className="btn small" onClick={() => store.set({ screen: back })}>← Back</button>
        <h1 style={{ marginTop: '0.8rem' }}>How it works</h1>
        <p><b>Claim → Spread → Belief → Law → Consequence.</b></p>
        <ol>
          <li><b>Claim.</b> You hold stories about the world, like “the river fears fire”. Choose one of the story chips at the bottom of the screen (the book button beside them says what each does and risks).</li>
          <li><b>Spread.</b> Tell villagers directly (1 Influence each) or ask a believer to carry it to someone they trust. Overnight, stories travel along ties of trust — only between people who can reach each other.</li>
          <li><b>Belief.</b> Hearsay barely moves skeptics. People who <i>watch</i> something happen are convinced far more deeply. Stage a ritual at a landmark on a good-omen night to give people something to see.</li>
          <li><b>Law.</b> When enough of a place believes (the line on the support bar), the story becomes law and the world obeys: flames turn the flood, watched wood does not break, bells draw rain.</li>
          <li><b>Consequence.</b> Every law has a cost: fire spreads, watchers leave the fields, rain pools elsewhere. Rivals counter. If belief drains away, the law fails.</li>
        </ol>
        <h2>Each day</h2>
        <ul>
          <li>You get Influence (3 a day, up to 5 saved). Planning is free to undo.</li>
          <li><b>Scout</b> someone to see their exact convictions and why they changed.</li>
          <li><b>End Day</b> when ready. Night falls: gossip, laws, flood, fire, rivals. Read the digest, then plan again.</li>
        </ul>
        <h2>Controls</h2>
        <table className="breakdown"><tbody>
          <tr><td>Select a villager or landmark</td><td>Click / tap</td></tr>
          <tr><td>Pan the map</td><td>Drag, or <span className="kbd">arrows</span> / <span className="kbd">WASD</span></td></tr>
          <tr><td>Zoom</td><td>Wheel, pinch, <span className="kbd">+</span> <span className="kbd">-</span> buttons, <span className="kbd">0</span> to fit</td></tr>
          <tr><td>Turn and tilt the 3D view</td><td>Right-drag or Shift-drag, the two turn buttons, <span className="kbd">Q</span> <span className="kbd">E</span> to turn, <span className="kbd">R</span> <span className="kbd">F</span> to tilt</td></tr>
          <tr><td>Ways of looking</td><td>The buttons on the left edge: World, Social (who trusts whom), Laws (the ledger), Flood (tonight's water). Tap the river for the forecast.</td></tr>
          <tr><td>Everything about someone</td><td>Tap them for a small card with what to do; “More about…” or the list button in the bottom bar opens the full sheet.</td></tr>
          <tr><td>Choose a story</td><td>Click a card, or <span className="kbd">1</span>–<span className="kbd">9</span></td></tr>
          <tr><td>Tell the selected villager the chosen story</td><td><span className="kbd">T</span></td></tr>
          <tr><td>Undo last action</td><td><span className="kbd">U</span> or the Undo button</td></tr>
          <tr><td>Social lens (trust ties)</td><td><span className="kbd">L</span> or the lens button</td></tr>
          <tr><td>End the day</td><td><span className="kbd">Enter</span> (asks to confirm)</td></tr>
          <tr><td>Close / deselect</td><td><span className="kbd">Esc</span></td></tr>
        </tbody></table>
        <p className="small muted">Everything on the map is also available as lists in the Village, Laws and Tonight tabs, so you can play without the canvas.</p>
      </div>
    </main>
  );
}

export function SettingsScreen() {
  const ui = useStore((s) => s.ui);
  const saveFile = useRef<HTMLInputElement>(null);
  const st = ui.settings;
  const inGame = !!store.state && !store.state.outcome;
  return (
    <main className="screen" data-testid="settings">
      <div className="page">
        <button className="btn small" onClick={() => store.set({ screen: inGame ? 'play' : 'title' })} data-testid="settings-back">← {inGame ? 'Back to the game' : 'Back'}</button>
        <h1 style={{ marginTop: '0.8rem' }}>Settings</h1>
        <div className="card">
          <label className="toggle-row"><span>Sound effects</span><input type="checkbox" checked={st.sfx} onChange={(e) => store.setSettings({ sfx: e.target.checked })} /></label>
          <label className="toggle-row"><span>Sound effects volume</span><input type="range" min={0} max={1} step={0.05} value={st.sfxVolume} onChange={(e) => store.setSettings({ sfxVolume: Number(e.target.value) })} aria-label="Sound effects volume" /></label>
          <label className="toggle-row"><span>Music and ambience</span><input type="checkbox" checked={st.music} onChange={(e) => store.setSettings({ music: e.target.checked })} /></label>
          <label className="toggle-row"><span>Music volume</span><input type="range" min={0} max={1} step={0.05} value={st.musicVolume} onChange={(e) => store.setSettings({ musicVolume: Number(e.target.value) })} aria-label="Music volume" /></label>
          <label className="toggle-row"><span>Reduce motion</span><input type="checkbox" checked={st.reducedMotion} onChange={(e) => store.setSettings({ reducedMotion: e.target.checked })} data-testid="reduced-motion" /></label>
          <label className="toggle-row"><span>High contrast</span><input type="checkbox" checked={st.highContrast} onChange={(e) => store.setSettings({ highContrast: e.target.checked })} /></label>
          <label className="toggle-row"><span>Text size</span>
            <select value={st.textScale} onChange={(e) => store.setSettings({ textScale: e.target.value as typeof st.textScale })} aria-label="Text size">
              <option value="compact">Compact</option><option value="default">Default</option><option value="large">Large</option>
            </select></label>
          <label className="toggle-row"><span>Graphics quality</span>
            <select value={st.quality} onChange={(e) => store.setSettings({ quality: e.target.value as typeof st.quality })} aria-label="Graphics quality">
              <option value="auto">Auto</option><option value="high">High</option><option value="low">Low (fewer effects)</option>
            </select></label>
          <label className="toggle-row"><span>Show tips in the first days</span><input type="checkbox" checked={st.tutorial} onChange={(e) => store.setSettings({ tutorial: e.target.checked })} /></label>
        </div>
        <div className="card" style={{ marginTop: '1rem' }} data-testid="save-files">
          <h2>Saved games</h2>
          <p className="small muted">A save file is plain JSON holding one run. Download it to keep a copy, move to another browser, or show a coaching agent your game; load it back here. Files are checked exactly like the automatic save.</p>
          <div className="row wrap">
            {inGame && <button className="btn" data-testid="download-save" onClick={() => { const j = store.exportSave(); if (j) downloadText(`belief-engine-${store.state!.scenarioId}-day${store.state!.day}.json`, j); }}>Download this game</button>}
            <button className="btn" onClick={() => saveFile.current?.click()} data-testid="load-save">Load a game file…</button>
            <input ref={saveFile} type="file" accept="application/json,.json" hidden data-testid="load-save-file" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; void f.text().then((txt) => store.loadSaveText(txt)); e.target.value = ''; }} />
          </div>
          {ui.loadError && <p role="alert" className="error-text" data-testid="load-error">{ui.loadError}</p>}
        </div>
        <div className="row wrap" style={{ marginTop: '1rem' }}>
          <button className="btn" onClick={() => store.resetSettings()}>Reset settings</button>
          {inGame && <button className="btn" onClick={() => { const s = store.state!; store.newRun({ scenarioId: s.scenarioId, seed: s.seed, difficulty: s.difficulty }); store.set({ screen: 'play' }); }} data-testid="restart-seed">Restart this seed</button>}
          {inGame && <button className="btn danger" onClick={() => store.set({ screen: 'title' })} data-testid="to-title">Leave to title (your game is saved)</button>}
        </div>
        <p className="small muted" style={{ marginTop: '1rem' }}>Settings and saves are stored in this browser only. {store.lastSavedOk ? '' : 'Storage is unavailable, so saves last only until you close the tab.'}</p>
      </div>
    </main>
  );
}

export function Credits() {
  return (
    <main className="screen">
      <div className="page">
        <button className="btn small" onClick={() => store.set({ screen: 'title' })}>← Back</button>
        <h1 style={{ marginTop: '0.8rem' }}>Credits</h1>
        <p>Design, code, procedural art and procedural audio: original, made for this project. No external art, music, fonts or sound files are used — every sprite is drawn in code and every sound is synthesised in your browser.</p>
        <p>Built with React, Three.js, TypeScript and Vite. The simulation is a pure deterministic TypeScript engine; the same engine powers the browser game, the bot tournaments and the MCP agent server.</p>
        <p className="muted small">Privacy: the game makes no network requests and sets no cookies. Saves and settings live in your browser’s local storage.</p>
      </div>
    </main>
  );
}
