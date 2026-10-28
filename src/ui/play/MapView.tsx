import { useEffect, useRef, useState } from 'react';
import { predictedWater } from '../../engine/index.ts';
import { MapRenderer } from '../../render/MapRenderer.ts';
import type { WorldRenderer } from '../../render/types.ts';
import { chooseRenderer, loadWorld3D, rememberRenderer } from '../../render/choose.ts';
import { Icon } from '../components.tsx';
import { store, useStore } from '../store.ts';
import { getTutorial } from '../tutorial.ts';
import { useNarrow } from '../useNarrow.ts';

let announcedReason = false;

export function MapView({ children }: { children?: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rendRef = useRef<WorldRenderer | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const version = useStore((s) => s.version);
  const ui = useStore((s) => s.ui);
  const state = useStore((s) => s.state);
  const [mode, setMode] = useState(() => chooseRenderer());
  const [ready, setReady] = useState(false);
  /** the 3D view lost its graphics context (a phone taking back memory, a driver reset): it is paused until the browser restores it */
  const [lost, setLost] = useState(false);
  /** what the loading veil says while the 3D world arrives: its code is fetched, then the village is built */
  const [stage, setStage] = useState<'fetching' | 'building'>('fetching');
  const choice = mode.choice;
  // on a phone the view controls fold into one button: pinch zooms, and the rest is a tap away
  const narrow = useNarrow();
  const [toolsOpen, setToolsOpen] = useState(false);
  const showTools = !narrow || toolsOpen;

  // when the classic map is showing and the player did not ask for it, say why, once, and offer the way to 3D
  const [noteShown, setNoteShown] = useState(() => !!mode.reason && !mode.reason.startsWith('classic map chosen') && !announcedReason);
  const dismissNote = () => {
    announcedReason = true;
    setNoteShown(false);
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    // a fresh canvas per renderer: a canvas keeps the kind of context it was first given, and a 3D one cannot be reused
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', choice === '3d'
      ? 'Village in 3D. Use the Village tab for a list of everyone. Arrow keys pan, plus and minus zoom, Q and E rotate, zero resets the view.'
      : 'Village map. Use the Village tab for a list of everyone. Arrow keys pan, plus and minus zoom.');
    canvas.dataset.renderer = choice;
    wrap.insertBefore(canvas, wrap.firstChild);
    let cancelled = false;
    let r: WorldRenderer | null = null;
    let ro: ResizeObserver | null = null;
    const cleanups: (() => void)[] = [];
    setReady(false);
    // (the 3D world keeps the context restorable and rebuilds the village when it comes back; this only tells the player)
    const onLost = (): void => setLost(true);
    const onRestored = (): void => setLost(false);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    cleanups.push(() => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      setLost(false);
    });

    /** a name beside the pointer for whatever is under it (the card with the detail opens on a tap) */
    const showTip = (hit: { kind: 'villager' | 'landmark'; id: string } | null, x: number, y: number): void => {
      const tip = tipRef.current;
      if (!tip) return;
      const st = store.state;
      if (!hit || !st) {
        tip.hidden = true;
        return;
      }
      const v = hit.kind === 'villager' ? st.villagers.find((q) => q.id === hit.id) : null;
      const l = hit.kind === 'landmark' ? st.world.landmarks.find((q) => q.id === hit.id) : null;
      const title = v ? v.name : l ? l.name : '';
      const sub = v ? `${v.role}${v.status === 'dead' ? ' · lost' : ''}` : l ? l.kind : '';
      if (tip.dataset.key !== hit.id) {
        tip.dataset.key = hit.id;
        tip.replaceChildren();
        const b = document.createElement('span');
        b.textContent = title;
        const sm = document.createElement('small');
        sm.textContent = sub;
        tip.append(b, sm);
      }
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      tip.hidden = false;
    };

    const attach = (renderer: WorldRenderer): void => {
      r = renderer;
      rendRef.current = r;
      (window as unknown as { __beRenderer?: WorldRenderer }).__beRenderer = r;
      const size = () => {
        const b = wrap.getBoundingClientRect();
        r?.resize(b.width, b.height, window.devicePixelRatio || 1);
      };
      size();
      ro = new ResizeObserver(size);
      ro.observe(wrap);
      // a window moved to a screen of another pixel density changes no size the observer sees: follow the density too
      let density: MediaQueryList | null = null;
      const onDensity = (): void => {
        size();
        watchDensity();
      };
      const watchDensity = (): void => {
        density?.removeEventListener('change', onDensity);
        if (typeof matchMedia !== 'function') return;
        density = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
        density.addEventListener('change', onDensity);
      };
      watchDensity();
      cleanups.push(() => density?.removeEventListener('change', onDensity));
      const s0 = store.state;
      if (s0) r.setState(s0);
      r.start();
      setReady(true);

      // ---- pointer handling: tap to select, drag to pan, right-drag to orbit (3D), pinch to zoom, wheel to zoom
      const pts = new Map<number, { x: number; y: number }>();
      let drag = { moved: 0, lastX: 0, lastY: 0, orbit: false };
      let pinch = 0;
      const local = (e: PointerEvent | WheelEvent) => {
        const b = canvas.getBoundingClientRect();
        return { x: e.clientX - b.left, y: e.clientY - b.top };
      };
      const down = (e: PointerEvent) => {
        canvas.setPointerCapture?.(e.pointerId);
        const p = local(e);
        pts.set(e.pointerId, p);
        drag = { moved: 0, lastX: p.x, lastY: p.y, orbit: e.button === 2 || e.shiftKey };
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          pinch = Math.hypot(a.x - b.x, a.y - b.y);
        }
      };
      const move = (e: PointerEvent) => {
        const p = local(e);
        if (!pts.has(e.pointerId)) {
          const hit = r?.hitTest(p.x, p.y) ?? null;
          r?.setHover(hit);
          canvas.style.cursor = hit ? 'pointer' : 'grab';
          showTip(hit, p.x, p.y);
          return;
        }
        showTip(null, 0, 0);
        pts.set(e.pointerId, p);
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch > 0) r?.zoomBy(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
          pinch = d;
          drag.moved = 99;
          return;
        }
        const dx = p.x - drag.lastX;
        const dy = p.y - drag.lastY;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved > 8) {
          if (drag.orbit && r?.orbitBy) r.orbitBy(-dx * 0.006, dy * 0.004);
          else r?.panBy(dx, dy);
        }
        drag.lastX = p.x;
        drag.lastY = p.y;
      };
      const up = (e: PointerEvent) => {
        const p = local(e);
        const wasSingle = pts.size === 1;
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = 0;
        if (wasSingle && drag.moved <= 8 && e.button !== 2) {
          const hit = r?.hitTest(p.x, p.y) ?? null;
          store.select(hit ? { kind: hit.kind, id: hit.id } : null);
          // the river is not a person or a place, but tapping it is asking about tonight's water
          const st = store.state;
          const t = !hit && st?.scn.features.flood ? r?.tileAt?.(p.x, p.y) : null;
          if (t && st && st.world.terrain[t.y * st.world.w + t.x] === 1) {
            store.setSettings({ showFlood: true });
            store.set({ tab: 'forecast', sheetOpen: true });
          }
        }
      };
      const cancel = (e: PointerEvent) => {
        pts.delete(e.pointerId);
        pinch = 0;
      };
      const wheel = (e: WheelEvent) => {
        e.preventDefault();
        const p = local(e);
        // follow how far the wheel or trackpad moved (a mouse notch is about 100 px, about 12%), so a trackpad glides instead of jumping
        const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
        r?.zoomBy(Math.exp(Math.max(-0.5, Math.min(0.5, -px * 0.00115))), p.x, p.y);
      };
      const leave = () => {
        r?.setHover(null);
        showTip(null, 0, 0);
      };
      const menu = (e: Event) => e.preventDefault();
      const key = (e: KeyboardEvent) => onMapKey(renderer, e);
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', cancel);
      canvas.addEventListener('pointerleave', leave);
      canvas.addEventListener('wheel', wheel, { passive: false });
      canvas.addEventListener('contextmenu', menu);
      canvas.addEventListener('keydown', key);
      cleanups.push(() => {
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', cancel);
        canvas.removeEventListener('pointerleave', leave);
        canvas.removeEventListener('wheel', wheel);
        canvas.removeEventListener('contextmenu', menu);
        canvas.removeEventListener('keydown', key);
      });
    };

    if (choice === '3d') {
      loadWorld3D()
        .then((World3D) => {
          if (cancelled) return;
          // say that the village is being built, let that be painted, and only then spend the half second it takes
          setStage('building');
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (cancelled) return;
              try {
                attach(new World3D(canvas));
              } catch (e) {
                store.toast(`The 3D world could not start (${e instanceof Error ? e.message : 'WebGL unavailable'}). Using the classic map.`, 'error');
                setMode({ choice: '2d', reason: 'the 3D world could not start' });
              }
            }),
          );
        })
        .catch(() => {
          if (!cancelled) setMode({ choice: '2d', reason: 'the 3D world could not load' });
        });
    } else {
      try {
        attach(new MapRenderer(canvas));
      } catch (e) {
        store.toast(`Your browser cannot draw the map (${e instanceof Error ? e.message : 'canvas unavailable'}). Use the Village tab to play from lists.`, 'error');
      }
    }
    return () => {
      cancelled = true;
      ro?.disconnect();
      for (const c of cleanups) c();
      r?.destroy();
      rendRef.current = null;
      canvas.remove();
      setStage('fetching');
    };
  }, [choice]);

  // push state + options into the renderer whenever anything changes, and once it exists (the 3D world arrives a moment after the first render)
  const lastDigest = useRef<unknown>(null);
  const lastAction = useRef<unknown>(null);
  useEffect(() => {
    const r = rendRef.current;
    if (!r || !state) return;
    const known = new Set<string>();
    for (const v of state.villagers) if (v.scoutedUntil >= state.day || (state.flags[`spoke:${v.id}`] ?? -1) === state.day) known.add(v.id);
    const tut = getTutorial(state, ui);
    r.setState(state);
    r.setOptions({
      reducedMotion: ui.settings.reducedMotion,
      lens: ui.lens,
      showFlood: ui.showFlood,
      activeClaim: ui.activeClaim,
      selection: ui.selection,
      hints: tut?.hintVillagers ?? [],
      forecast: state.scn.features.flood ? predictedWater(state) : null,
      highContrast: ui.settings.highContrast,
      quality: ui.settings.quality === 'low' ? 'low' : 'high',
      known,
    });
    if (ui.lastAction && lastAction.current !== ui.lastAction) {
      lastAction.current = ui.lastAction;
      r.playAction(ui.lastAction.events);
    }
    if (ui.digest && lastDigest.current !== ui.digest) {
      lastDigest.current = ui.digest;
      if (ui.digest.events.some((e) => e.code === 'RITUAL' && e.text.startsWith('Ring'))) r.noteBell();
      r.playResolution(ui.digest.events, store.prevState);
    }
  }, [version, state, ui, ready]);

  // keep the village clear of the interface: tell the renderer how much of the canvas the rail, tray, tools and open sheet cover
  useEffect(() => {
    if (!ready) return;
    const apply = (): void => {
      const r = rendRef.current;
      const wrap = wrapRef.current;
      if (!r?.setInsets || !wrap) return;
      const sr = wrap.getBoundingClientRect();
      const q = (sel: string): DOMRect | null => document.querySelector(sel)?.getBoundingClientRect() ?? null;
      const top = q('.topbar');
      const tray = q('.tray');
      const modes = q('.modes');
      const tools = q('.map-tools');
      const side = q('.side.open');
      // on a phone the card for the selection and the open sheet sit above the tray: the village is framed in what is left above them
      const dock = q(".pop[data-dock='1'][data-ready='1']");
      const wide = sr.width > 900;
      const sheetH = !wide && side ? sr.bottom - side.top : 0;
      const dockTop = dock && dock.top > sr.top + sr.height * 0.25 ? sr.bottom - dock.top : 0;
      // while the opening choice is up the card docks under the rail instead (the cards need the bottom)
      const dockHigh = dock && dock.top <= sr.top + sr.height * 0.25 ? dock.bottom - sr.top : 0;
      // on a phone the lens rail and the view controls float over the village's edges, as the rail always has: counting the controls
      // pushed the village off-centre at rest, and opening them would re-frame it. A wide screen frames the village clear of both
      r.setInsets({
        top: Math.max(top ? top.bottom - sr.top + 8 : 0, dockHigh + 8),
        bottom: Math.max(tray ? sr.bottom - tray.top + 8 : 0, dockTop + 8, sheetH + 8),
        left: wide && modes ? Math.max(0, modes.right - sr.left + 8) : 0,
        right: Math.max(wide && side ? sr.right - side.left : 0, wide && tools ? sr.right - tools.left + 6 : 0),
      });
    };
    apply();
    const t = window.setInterval(apply, 250);
    window.addEventListener('resize', apply);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('resize', apply);
    };
  }, [ready, choice]);

  const focusSel = () => {
    const r = rendRef.current;
    const sel = store.ui.selection;
    const s = store.state;
    if (!r || !s) return;
    if (sel?.kind === 'villager') r.focusVillager(sel.id);
    else if (sel?.kind === 'landmark') {
      const l = s.world.landmarks.find((x) => x.id === sel.id);
      if (l) r.focusTile(l.x, l.y, 1.4);
    } else r.fit();
  };

  const switchTo = (c: '2d' | '3d') => {
    rememberRenderer(c);
    setMode({ choice: c, reason: '' });
  };

  return (
    <div className="stage" ref={wrapRef} data-renderer={choice} data-ready={ready ? '1' : '0'}>
      {choice === '3d' && !ready && (
        <div className="stage-loading" role="status">
          <div className="sl-scene" aria-hidden="true">
            <i className="sl-cloud a" />
            <i className="sl-cloud b" />
            <i className="sl-island" />
          </div>
          <span>{stage === 'fetching' ? 'Fetching the 3D world…' : 'Raising the village…'}</span>
          <div className="sl-bar" aria-hidden="true">
            <i style={{ width: stage === 'fetching' ? '38%' : '86%' }} />
          </div>
        </div>
      )}
      {lost && choice === '3d' && (
        <div className="stage-note lost" role="alert" data-testid="context-lost">
          <span>The 3D view has paused: the device took back its graphics memory. It should come back by itself.</span>
          <button className="btn small" onClick={() => switchTo('2d')}>Use the classic map</button>
        </div>
      )}
      {noteShown && choice === '2d' && (
        <div className="stage-note" role="note" data-testid="renderer-note">
          <span>Classic map: {mode.reason.replace(/, so the classic map is used.*$/, '')}.</span>
          <button className="btn small" onClick={() => { dismissNote(); switchTo('3d'); }}>Try 3D</button>
          <button className="btn small ghost" onClick={dismissNote} aria-label="Dismiss this note">Dismiss</button>
        </div>
      )}
      <div className="hover-tip" ref={tipRef} hidden aria-hidden="true" />
      <div className={`map-tools ${narrow ? 'narrow' : ''} ${toolsOpen ? 'open' : ''}`}>
        {narrow && (
          <button className="btn icon-btn tools-toggle" aria-label="View controls: zoom, rotate, fit and the 2D or 3D switch" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)} data-testid="tools-toggle">
            <Icon name={toolsOpen ? 'close' : 'fit'} />
          </button>
        )}
        {showTools && (
          <>
            <button className="btn icon-btn" aria-label="Zoom in" onClick={() => rendRef.current?.zoomBy(1.25)}>
              <Icon name="plus" />
            </button>
            <button className="btn icon-btn" aria-label="Zoom out" onClick={() => rendRef.current?.zoomBy(1 / 1.25)}>
              <Icon name="minus" />
            </button>
            <button className="btn icon-btn" aria-label="Focus on selection, or fit the whole map" onClick={focusSel}>
              <Icon name="fit" />
            </button>
            {choice === '3d' && (
              <>
                <button className="btn icon-btn" aria-label="Rotate the view left" onClick={() => rendRef.current?.orbitBy?.(0.25, 0)} data-testid="orbit-left">
                  <span aria-hidden="true">⟲</span>
                </button>
                <button className="btn icon-btn" aria-label="Rotate the view right" onClick={() => rendRef.current?.orbitBy?.(-0.25, 0)} data-testid="orbit-right">
                  <span aria-hidden="true">⟳</span>
                </button>
              </>
            )}
            <button className="btn icon-btn" aria-label={choice === '3d' ? 'Switch to the classic 2D map' : 'Switch to the 3D world'} onClick={() => switchTo(choice === '3d' ? '2d' : '3d')} data-testid="renderer-toggle">
              <span aria-hidden="true" style={{ fontWeight: 700, fontSize: '0.72rem' }}>{choice === '3d' ? '2D' : '3D'}</span>
            </button>
          </>
        )}
      </div>
      {children}
    </div>
  );
}

/** keyboard camera control, attached to whichever canvas is current */
function onMapKey(r: WorldRenderer, e: KeyboardEvent): void {
  const step = 70;
  switch (e.key) {
    case 'ArrowLeft':
    case 'a':
      r.panBy(step, 0);
      break;
    case 'ArrowRight':
    case 'd':
      r.panBy(-step, 0);
      break;
    case 'ArrowUp':
    case 'w':
      r.panBy(0, step);
      break;
    case 'ArrowDown':
    case 's':
      r.panBy(0, -step);
      break;
    case 'q':
      r.orbitBy?.(0.18, 0);
      break;
    case 'e':
      r.orbitBy?.(-0.18, 0);
      break;
    case 'r':
      r.orbitBy?.(0, 0.1);
      break;
    case 'f':
      r.orbitBy?.(0, -0.1);
      break;
    case '+':
    case '=':
      r.zoomBy(1.2);
      break;
    case '-':
      r.zoomBy(1 / 1.2);
      break;
    case '0':
      r.fit();
      break;
    default:
      return;
  }
  e.preventDefault();
}

export function getRenderer(): WorldRenderer | null {
  return (window as unknown as { __beRenderer?: WorldRenderer }).__beRenderer ?? null;
}
