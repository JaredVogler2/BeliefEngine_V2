import type { GameEvent, RunState } from '../engine/index.ts';
import type { HitResult, RenderOpts } from './MapRenderer.ts';

export type { HitResult, RenderOpts };

/**
 * What the interface needs from whatever draws the village. The classic Canvas2D `MapRenderer` and the Three.js `World3D` both
 * implement it, so the screens, panels and keyboard handling do not know which one is behind the canvas. A renderer is an observer of
 * the run: it is handed state and events, draws them, answers "what is under this pixel", and never changes the run itself.
 */
export interface WorldRenderer {
  readonly kind: '2d' | '3d';
  start(): void;
  destroy(): void;
  resize(w: number, h: number, dpr: number): void;
  setOptions(o: Partial<RenderOpts>): void;
  setState(s: RunState): void;
  fit(): void;
  panBy(dx: number, dy: number): void;
  zoomBy(factor: number, ax?: number, ay?: number): void;
  /** rotate and tilt the view (a no-op on the flat map) */
  orbitBy?(dAzimuth: number, dElevation: number): void;
  focusTile(x: number, y: number, zoom?: number, animate?: boolean): void;
  focusVillager(id: string): void;
  villagerScreen(id: string): { x: number; y: number } | null;
  /** where a person or a place is on screen now (for the selection card and tooltips that follow the world) */
  entityScreen(kind: 'villager' | 'landmark', id: string): { x: number; y: number } | null;
  /** the part of the canvas the interface covers, so the view can keep its subject clear of it (the 3D world shifts its centre) */
  setInsets?(i: { left: number; right: number; top: number; bottom: number }): void;
  hitTest(sx: number, sy: number): HitResult | null;
  /** the map tile under a screen point, if any (the river and open ground are not entities, but a tap on them can still mean something) */
  tileAt?(sx: number, sy: number): { x: number; y: number } | null;
  setHover(h: HitResult | null): void;
  playAction(events: GameEvent[]): void;
  playResolution(events: GameEvent[], prev: RunState | null): void;
  noteBell(): void;
  stats(): { fps: number; effects: number; zoom: number };
  /** the end-of-run tour: a slow drift round the village (the 3D world only) */
  setAmbient?(on: boolean): void;
  /** debug and screenshot hooks (the 3D world only) */
  advance?(seconds: number): void;
  renderNow?(): void;
}
