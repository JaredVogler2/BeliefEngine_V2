import { useEffect } from 'react';
import { allClaimDefs, firstName, getForecast, getHud, getLawViews, describeAction, nightReport } from '../../engine/index.ts';
import { setAmbience, setSceneAudio, setThreatIntensity, unlockAudio } from '../../audio/audio.ts';
import { Icon, Modal, Pips, evIcon } from '../components.tsx';
import { store, useStore } from '../store.ts';
import { getTutorial } from '../tutorial.ts';
import { Compose } from './Compose.tsx';
import { Hand } from './Hand.tsx';
import { MapView } from './MapView.tsx';
import { ForecastPanel, LawsPanel, LogPanel, SelectedPanel, TABS, VillagePanel, tabLabel } from './Panels.tsx';

function TopBar() {
  const state = useStore((s) => s.state)!;
  const ui = useStore((s) => s.ui);
  const hud = getHud(state);
  const th = state.threat[Math.min(state.day, state.threat.length) - 1];
  const next = state.threat[Math.min(state.day, state.threat.length)];
  const danger = (th?.level ?? 0) >= 3;
  const objFail = hud.objectives.filter((o) => o.required && !o.met).length;
  return (
    <header className="topbar" role="banner">
      <button className="btn icon-btn" aria-label="Menu and settings" onClick={() => store.set({ screen: 'settings' })} data-testid="menu-btn">
        <Icon name="menu" />
      </button>
      <div className="daybox" data-testid="day-box" aria-label={`Day ${hud.day} of ${hud.maxDay}`}>
        Day <span>{hud.day}</span>/{hud.maxDay}
      </div>
      <div className={`threat ${danger ? '' : 'calm'}`} role="status">
        <Icon name={state.scn.features.flood ? 'flood' : state.scn.features.wolves ? 'wolf' : 'wheat'} />
        <div className="t-main">
          <div className="t-title">{th?.label ?? ''}</div>
          <div className="t-sub">{th?.warning ?? (next ? `Tomorrow: ${next.label}` : '')}</div>
        </div>
      </div>
      <div className="stats" aria-label="Village status">
        {hud.stats.includes('alive') && <div className="stat" title="Villagers alive"><Icon name="user" label="Villagers alive" /><span>{hud.alive}</span><span className="lbl muted small">/{hud.total}</span></div>}
        {hud.stats.includes('homes') && <div className={`stat ${objFail && hud.day === hud.maxDay ? 'bad' : ''}`} title="Homes standing"><Icon name="home" label="Homes standing" /><span>{hud.homes}</span></div>}
        {hud.stats.includes('food') && <div className={`stat ${hud.food < 6 ? 'warn' : ''}`} title="Food in store"><Icon name="food" label="Food" /><span>{hud.food}</span></div>}
        {hud.stats.includes('fed') && <div className="stat" title="Villagers who are not hungry"><Icon name="wheat" label="Well fed" /><span>{state.villagers.filter((v) => v.status !== 'dead' && v.hunger < 60).length}</span></div>}
        {hud.stats.includes('livestock') && <div className={`stat ${hud.livestock < 10 ? 'warn' : ''}`} title="Animals alive"><Icon name="wolf" label="Animals alive" /><span>{hud.livestock}</span><span className="lbl muted small">/{hud.livestockTotal}</span></div>}
        {hud.stats.includes('sick') && <div className={`stat ${hud.sick > 3 ? 'bad' : ''}`} title="People sick"><Icon name="warn" label="People sick" /><span>{hud.sick}</span></div>}
        {hud.stats.includes('fuel') && <div className="stat" title="Fuel in store"><Icon name="fuel" label="Fuel" /><span>{hud.fuel}</span></div>}
      </div>
      {!store.lastSavedOk && (
        <button className="btn small" data-testid="unsaved" aria-label="This game is not being saved. Open settings to download a copy." title="This browser would not save the game. Open Settings to download a copy." onClick={() => store.set({ screen: 'settings' })}>
          <Icon name="warn" /> Not saved
        </button>
      )}
      <button className="btn icon-btn hide-sm" aria-label="How to play" onClick={() => store.set({ screen: 'howto' })}>
        <Icon name="help" />
      </button>
      <button className="btn icon-btn mute-btn" aria-label={ui.settings.sfx || ui.settings.music ? 'Mute all sound' : 'Unmute'} onClick={() => store.setSettings({ sfx: !(ui.settings.sfx || ui.settings.music), music: !(ui.settings.sfx || ui.settings.music) })}>
        <Icon name={ui.settings.sfx || ui.settings.music ? 'sound' : 'mute'} />
      </button>
    </header>
  );
}

function PlanBar() {
  const state = useStore((s) => s.state)!;
  const ui = useStore((s) => s.ui);
  const session = store.session!;
  const spent = state.today.reduce((a, r) => a + r.cost, 0);
  return (
    <footer className="plan">
      <div className="ap" data-testid="ap" aria-label={`Influence ${state.ap} of ${state.apMax}`}>
        <Icon name="star" />
        <Pips ap={state.ap} max={state.apMax} />
        <span className="lbl-wide small">Influence</span>
        <b>{state.ap}</b>
        <span className="muted small lbl">+{state.apPerDay}/day</span>
      </div>
      <div className="plan-list" aria-label="Actions planned today">
        {state.today.length === 0 && <span className="muted small">Nothing planned yet. Spent {spent}.</span>}
        {state.today.map((r, i) => (
          <span key={i} className="plan-item">{describeAction(state, r.action)}</span>
        ))}
      </div>
      <button className="btn" onClick={() => store.undo()} disabled={!session.canUndo} aria-label="Undo last action" data-testid="undo">
        <Icon name="undo" /> <span className="lbl">Undo</span>
      </button>
      <button className="btn sheet-toggle icon-btn" aria-label="Open panel" onClick={() => store.set({ sheetOpen: !ui.sheetOpen })} aria-expanded={ui.sheetOpen} data-testid="sheet-toggle">
        <Icon name="list" />
      </button>
      <button className="btn primary end-btn big" onClick={() => store.set({ confirmEnd: true })} data-testid="end-day">
        End Day <span className="lbl-n">{state.day}</span>
      </button>
    </footer>
  );
}

function ConfirmEnd() {
  const state = useStore((s) => s.state)!;
  const f = getForecast(state);
  const unspent = state.ap;
  const close = () => store.set({ confirmEnd: false });
  return (
    <Modal title={`End Day ${state.day}?`} onClose={close}>
      <p>Night falls and the story spreads. You cannot undo what happens overnight.</p>
      <ul className="small">
        <li>Unspent Influence: <b>{unspent}</b> (you will have {Math.min(state.apMax, unspent + state.apPerDay)} tomorrow; the cap is {state.apMax}).</li>
        <li>Tonight: {f.tonight.label}, level {f.tonight.level}, {f.tonight.trend}.</li>
        {f.homesAtRisk.length > 0 && <li>{f.homesAtRisk.length} home(s) in the water’s reach.</li>}
        {f.peopleAtRisk.length > 0 && <li style={{ color: '#ffb3bf' }}>{f.peopleAtRisk.map((p) => firstName(p.name)).join(', ')} may be lost.</li>}
        {f.trapped.length > 0 && <li style={{ color: '#ffb3bf' }}>{f.trapped.map((p) => firstName(p)).join(', ')} cannot reach safety.</li>}
      </ul>
      <div className="row spread wrap" style={{ marginTop: '1rem' }}>
        <button className="btn" onClick={close} data-testid="keep-planning">Keep planning</button>
        <button className="btn primary big" onClick={() => store.endDay()} data-testid="confirm-end" data-autofocus>Let night fall</button>
      </div>
    </Modal>
  );
}

function Digest() {
  const ui = useStore((s) => s.ui);
  const state = useStore((s) => s.state)!;
  const d = ui.digest;
  if (!d) return null;
  const report = nightReport(state, d.events, d.summary);
  const over = !!state.outcome;
  return (
    <section className="digest" role="region" aria-label={`Night of day ${d.day}`} data-testid="digest">
      <h2>Night of Day {d.day}</h2>
      <div className="head">{report.headline}</div>
      <ul style={{ padding: 0, margin: 0 }}>
        {report.story.map((t, i) => (
          <li key={`story-${i}`} data-ic="✦" data-testid="digest-story">{t}</li>
        ))}
        {report.lines.map((e) => (
          <li key={e.id} data-ic={evIcon(e.code)}>{e.text}</li>
        ))}
        {report.story.length === 0 && report.lines.length === 0 && <li data-ic="·">Nothing remarkable happened.</li>}
      </ul>
      <div className="row spread" style={{ marginTop: '0.7rem' }}>
        <button className="btn small" onClick={() => store.set({ tab: 'log', sheetOpen: true })}>All events</button>
        <button className="btn primary" onClick={() => store.closeDigest()} data-testid="digest-continue" autoFocus>
          {over ? 'See what happened' : `On to day ${state.day}`}
        </button>
      </div>
    </section>
  );
}

function Coach() {
  const state = useStore((s) => s.state)!;
  const ui = useStore((s) => s.ui);
  const t = getTutorial(state, ui);
  if (!t || ui.digest) return null;
  // a banner between the top bar and the map, never on top of the map or the story cards
  return (
    <aside className="coach" role="note" data-testid="coach">
      <div className="c-body">
        <b>{t.title}</b>
        <span>{t.text}</span>
      </div>
      <div className="c-actions">
        <span className="step">Step {t.step} of {t.total}</span>
        <button className="btn small" onClick={() => store.set({ tutorialDone: true })}>Skip tips</button>
      </div>
    </aside>
  );
}

function Toasts() {
  const ui = useStore((s) => s.ui);
  return (
    <div className="toasts" aria-live="polite">
      {ui.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role="status">{t.text}</div>
      ))}
    </div>
  );
}

export function Play() {
  const state = useStore((s) => s.state);
  const ui = useStore((s) => s.ui);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      const s = store.state;
      if (!s || store.ui.confirmEnd || store.ui.composing) return;
      if (e.key === 'Escape') {
        if (store.ui.digest) return;
        if (store.ui.sheetOpen) store.set({ sheetOpen: false });
        else if (store.ui.selection) store.select(null);
        return;
      }
      if (e.key === 'Enter' && (e.target === document.body || (e.target as HTMLElement | null)?.tagName === 'CANVAS') && !store.ui.digest) {
        e.preventDefault();
        store.set({ confirmEnd: true });
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const claims = allClaimDefs(s).filter((c) => !c.rival);
        const c = claims[Number(e.key) - 1];
        if (c) {
          const cs = s.claims.find((x) => x.id === c.id);
          if (s.starter === null && s.scn.starters.includes(c.id)) {
            store.act({ type: 'PICK_STARTER', claim: c.id });
            store.set({ activeClaim: c.id });
          } else if (cs?.available) store.set({ activeClaim: store.ui.activeClaim === c.id ? null : c.id });
        }
      }
      if (e.key === 'u' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) store.undo();
      if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // tell the selected villager the chosen story: the most repeated move in the game, one key instead of three clicks
        const sel = store.ui.selection;
        const claim = store.ui.activeClaim;
        if (sel?.kind === 'villager' && claim) store.act({ type: 'SEED', claim, target: sel.id });
        else store.toast('Choose a story card and select a villager first, then press T to tell them.', 'error');
      }
      if (e.key === 'l') store.set({ lens: store.ui.lens === 'social' ? 'none' : 'social' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ambience follows the threat; audio starts on the first gesture
  useEffect(() => {
    const first = () => {
      unlockAudio();
      const s = store.state;
      setSceneAudio({ water: !!s && (s.scn.features.flood || s.world.landmarks.some((l) => l.kind === 'bridge')) });
      setAmbience(true);
    };
    window.addEventListener('pointerdown', first, { once: true });
    window.addEventListener('keydown', first, { once: true });
    return () => {
      window.removeEventListener('pointerdown', first);
      window.removeEventListener('keydown', first);
      setAmbience(false);
    };
  }, []);
  const level = state ? (state.threat[Math.min(state.day, state.threat.length) - 1]?.level ?? 0) : 0;
  useEffect(() => {
    setThreatIntensity(Math.min(1, level / 6));
  }, [level]);

  // pick a sensible default active story
  useEffect(() => {
    if (!state || ui.activeClaim) return;
    const first = allClaimDefs(state).find((c) => !c.rival && state.claims.find((x) => x.id === c.id)?.available);
    if (first) store.set({ activeClaim: first.id });
  }, [state, ui.activeClaim]);

  if (!state) return null;
  const laws = getLawViews(state);
  const awakening = laws.some((l) => !l.rival && (l.status === 'awakening' || l.status === 'active'));
  return (
    <div className="play" data-testid="play">
      <TopBar />
      <Coach />
      <MapView>
        <Hand />
        {ui.digest && <Digest />}
      </MapView>
      <aside className={`side ${ui.sheetOpen ? 'open' : ''}`} aria-label="Details">
        <button className="grab" aria-label={ui.sheetOpen ? 'Collapse panel' : 'Expand panel'} onClick={() => store.set({ sheetOpen: !ui.sheetOpen })} />
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" className="tab" aria-selected={ui.tab === t} onClick={() => store.set({ tab: t, sheetOpen: true })} data-testid={`tab-${t}`}>
              {tabLabel(t)}
              {t === 'laws' && awakening && <span className="dot" style={{ background: 'var(--gold)' }} />}
            </button>
          ))}
        </div>
        <div className="panel" role="tabpanel" tabIndex={0} aria-label={`${tabLabel(ui.tab)} panel`}>
          {ui.tab === 'selected' && <SelectedPanel />}
          {ui.tab === 'laws' && <LawsPanel />}
          {ui.tab === 'village' && <VillagePanel />}
          {ui.tab === 'forecast' && <ForecastPanel />}
          {ui.tab === 'log' && <LogPanel />}
        </div>
      </aside>
      <PlanBar />
      {ui.confirmEnd && <ConfirmEnd />}
      {ui.composing && <Compose />}
      <Toasts />
      <div className="sr-only" aria-live="polite" role="status" data-testid="announce">{ui.announce}</div>
    </div>
  );
}
