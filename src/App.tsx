import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { configureAudio } from './audio/audio.ts';
import { Atlas } from './ui/atlas.tsx';
import { Briefing, Credits, Debrief, HowTo, Scenarios, SettingsScreen, Title } from './ui/screens.tsx';
import { Play } from './ui/play/Play.tsx';
import { GameSession, deserializeRun, eventHash, parseShare, stateHash } from './engine/index.ts';
import { optionsFromDescriptor } from './ui/modes.ts';
import { store, useStore } from './ui/store.ts';

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack);
  }
  override render() {
    if (this.state.error) {
      return (
        <main className="error-box card" role="alert">
          <h1>Something broke</h1>
          <p>The game hit an unexpected problem. Your last save is safe.</p>
          <pre className="small" style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
          <div className="row wrap">
            <button className="btn primary" onClick={() => { this.setState({ error: null }); store.set({ screen: 'title' }); }}>Back to title</button>
            <button className="btn" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

function parseDeepLink(): void {
  const raw = window.location.search;
  const q = new URLSearchParams(raw);
  if (!q.has('mode') && !q.has('scenario')) return;
  // legacy links: ?scenario=ID&seed=N&d=difficulty
  const search = q.has('mode') ? raw : `?mode=story&scn=${encodeURIComponent(q.get('scenario') ?? '')}&seed=${encodeURIComponent(q.get('seed') ?? '')}${q.get('d') ? `&diff=${encodeURIComponent(q.get('d') ?? '')}` : ''}`;
  const parsed = parseShare(search);
  // keep the address bar clean (and keep ?debug=1 for tests)
  window.history.replaceState(null, '', window.location.pathname + (q.get('debug') === '1' ? '?debug=1' : ''));
  if (!parsed.ok) {
    store.set({ loadError: `${parsed.error} The link was ignored.` });
    return;
  }
  store.newRun(optionsFromDescriptor(parsed.descriptor));
  store.set({ notes: parsed.notes });
}

/** The whole shell sits inside a boundary too: an error outside the screen switch must not leave a blank page. */
export function App() {
  return (
    <Boundary>
      <Shell />
    </Boundary>
  );
}

function Shell() {
  const ui = useStore((s) => s.ui);
  useEffect(() => {
    parseDeepLink();
    if (store.ui.debug) {
      (window as unknown as { __belief?: unknown }).__belief = {
        get state() { return store.state; },
        get session() { return store.session; },
        load: (json: string) => { const r = deserializeRun(json); if (r.ok) { store.session = new GameSession(r.state); store.set({ screen: r.state.outcome ? 'debrief' : 'play', digest: null, tutorialDone: true }); } return r.ok; },
        hash: () => (store.state ? stateHash(store.state) : null),
        parse: (json: string) => { const r = deserializeRun(json); return r.ok ? r.state : null; },
        /** test hook: break rendering on purpose to exercise the recovery screen */
        crash: () => store.set({ settings: undefined as never }),
        eventHash: () => (store.state ? eventHash(store.state) : null),
        store,
      };
    }
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.scale = ui.settings.textScale;
    root.dataset.contrast = ui.settings.highContrast ? 'high' : 'normal';
    root.dataset.motion = ui.settings.reducedMotion ? 'reduced' : 'full';
    configureAudio({ sfx: ui.settings.sfx, music: ui.settings.music, sfxVolume: ui.settings.sfxVolume, musicVolume: ui.settings.musicVolume });
  }, [ui.settings]);
  let screen: ReactNode;
  switch (ui.screen) {
    case 'title': screen = <Title />; break;
    case 'scenarios': screen = <Scenarios />; break;
    case 'briefing': screen = <Briefing />; break;
    case 'howto': screen = <HowTo />; break;
    case 'settings': screen = <SettingsScreen />; break;
    case 'credits': screen = <Credits />; break;
    case 'debrief': screen = <Debrief />; break;
    case 'atlas': screen = <Atlas />; break;
    case 'play': screen = <Play />; break;
    default: screen = <Title />;
  }
  return <Boundary>{screen}</Boundary>;
}
