import { useEffect, useRef, useState } from 'react';
import type { GameEvent, RunState } from '../../engine/index.ts';
import { aliveCount, homesStanding } from '../../engine/world/economy.ts';
import { chooseRenderer, loadWorld3D } from '../../render/choose.ts';
import type { WorldRenderer } from '../../render/types.ts';
import { DebriefScene } from '../scene.tsx';
import { store } from '../store.ts';

/**
 * The end of a run, shown on the village itself: the final state of the real 3D world (fallen homes, a broken or standing bridge, the
 * water where it ended, the sky of the verdict), with the camera easing in on the place that decided it and then drifting slowly round.
 * The captions under it are the last important events the engine logged, each tagged with its event id. Where the 3D world cannot run
 * (no WebGL2, or no graphics acceleration and no request for it) the painted strip is used instead, with the same facts.
 */
interface Focus {
  x: number;
  y: number;
  why: string;
}

/**
 * where the camera should look first. After a loss: the bridge if it fell, else the last home that was hurt. After a win: what held,
 * the middle of the homes that are left, else the bridge if it still stands.
 */
export function aftermathFocus(s: RunState, win = false): Focus {
  const bridge = s.world.landmarks.find((l) => l.kind === 'bridge');
  const centre = (l: { x: number; y: number; tiles?: [number, number][] }): { x: number; y: number } => {
    if (l.tiles && l.tiles.length) {
      let x = 0;
      let y = 0;
      for (const t of l.tiles) {
        x += t[0];
        y += t[1];
      }
      return { x: x / l.tiles.length, y: y / l.tiles.length };
    }
    return { x: l.x, y: l.y };
  };
  if (win) {
    // the homes that are left are dry and in plain view; the bridge may be under the surge at the end
    const kept = s.world.landmarks.filter((l) => l.kind === 'home' && l.hp > 0).map(centre);
    if (kept.length) return { x: kept.reduce((a, c) => a + c.x, 0) / kept.length, y: kept.reduce((a, c) => a + c.y, 0) / kept.length, why: 'the homes that held' };
    if (bridge && bridge.hp > 0) return { ...centre(bridge), why: 'the bridge that held' };
  }
  if (bridge && bridge.hp <= 0) return { ...centre(bridge), why: 'the bridge' };
  const hurt = [...s.log].reverse().find((e) => (e.code === 'HOME_DESTROYED' || e.code === 'HOME_DAMAGED' || e.code === 'FIELD_FLOODED') && e.tile);
  if (hurt && hurt.tile) return { x: hurt.tile[0], y: hurt.tile[1], why: 'the damage' };
  if (bridge) return { ...centre(bridge), why: 'the bridge' };
  return { x: s.world.w / 2, y: s.world.h / 2, why: 'the village' };
}

/** the last few things that mattered, in the engine's own words, each with its event id */
export function aftermathCaptions(s: RunState): GameEvent[] {
  const last = s.day;
  const recent = s.log.filter((e) => e.importance >= 2 && e.day >= last - 1);
  return recent.slice(-3);
}

export function Aftermath({ state, win }: { state: RunState; win: boolean }) {
  const [mode] = useState(() => chooseRenderer());
  const [failed, setFailed] = useState(false);
  if (mode.choice !== '3d' || failed) return <DebriefScene state={state} win={win} />;
  return <AftermathWorld state={state} win={win} onFail={() => setFailed(true)} />;
}

function AftermathWorld({ state, win, onFail }: { state: RunState; win: boolean; onFail: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const captions = aftermathCaptions(state);
  const alive = aliveCount(state);
  const homes = state.world.landmarks.filter((l) => l.kind === 'home');
  const standing = homesStanding(state);
  const bridge = state.world.landmarks.find((l) => l.kind === 'bridge');
  const label = `${win ? 'Dawn' : 'Dusk'} over ${state.scn.name}, in 3D: ${alive} of ${state.villagers.length} villagers alive, ${standing} of ${homes.length} homes standing${bridge ? (bridge.hp > 0 ? ', the bridge still standing' : ', the bridge fallen') : ''}.`;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.touchAction = 'pan-y';
    host.appendChild(canvas);
    let cancelled = false;
    let r: WorldRenderer | null = null;
    let ro: ResizeObserver | null = null;
    let timer = 0;
    const cleanups: (() => void)[] = [];
    loadWorld3D()
      .then((World3D) => {
        if (cancelled) return;
        try {
          r = new World3D(canvas);
        } catch {
          onFail();
          return;
        }
        const size = (): void => {
          const b = host.getBoundingClientRect();
          r?.resize(b.width, b.height, window.devicePixelRatio || 1);
        };
        size();
        ro = new ResizeObserver(size);
        ro.observe(host);
        const reduced = store.ui.settings.reducedMotion;
        r.setState(state);
        r.setOptions({ reducedMotion: reduced, lens: 'none', showFlood: false, activeClaim: null, selection: null, hints: [], forecast: null, highContrast: store.ui.settings.highContrast, quality: store.ui.settings.quality === 'low' ? 'low' : 'high', known: new Set() });
        r.start();
        r.setAmbient?.(!reduced);
        // ease in on the place that decided it, after a beat on the whole village
        const f = aftermathFocus(state, win);
        timer = window.setTimeout(() => r?.focusTile(f.x, f.y, 1.5), reduced ? 0 : 1400);
        // dragging turns the view; the page still scrolls with the wheel and with a vertical swipe
        let down: { x: number; y: number } | null = null;
        const pd = (e: PointerEvent): void => {
          down = { x: e.clientX, y: e.clientY };
          canvas.setPointerCapture?.(e.pointerId);
        };
        const pm = (e: PointerEvent): void => {
          if (!down) return;
          r?.orbitBy?.(-(e.clientX - down.x) * 0.006, (e.clientY - down.y) * 0.003);
          down = { x: e.clientX, y: e.clientY };
        };
        const pu = (): void => {
          down = null;
        };
        canvas.addEventListener('pointerdown', pd);
        canvas.addEventListener('pointermove', pm);
        canvas.addEventListener('pointerup', pu);
        canvas.addEventListener('pointercancel', pu);
        cleanups.push(() => {
          canvas.removeEventListener('pointerdown', pd);
          canvas.removeEventListener('pointermove', pm);
          canvas.removeEventListener('pointerup', pu);
          canvas.removeEventListener('pointercancel', pu);
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) onFail();
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ro?.disconnect();
      for (const c of cleanups) c();
      r?.destroy();
      canvas.remove();
    };
    // the final state does not change while the debrief is shown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <figure className={`scene aftermath ${win ? 'dawn' : 'dusk'}`} data-testid="debrief-scene" data-result={win ? 'victory' : 'defeat'} data-renderer="3d" data-ready={ready ? '1' : '0'} aria-label={label}>
      <div className="aftermath-stage" ref={hostRef} />
      {captions.length > 0 && (
        <figcaption className="aftermath-captions">
          {captions.map((e) => (
            <span key={e.id} data-event-id={e.id}>
              <b className="muted small">Day {e.day}</b> {e.text}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
