import * as THREE from 'three';

/**
 * A tabletop camera: it looks at a point on the ground from above and to one side, and can pan, zoom and orbit within limits that
 * keep the village in view (never under the ground, never so far away that people vanish). Moves are eased; the camera has its own
 * clock and knows nothing about the simulation's days.
 */
export interface CameraBounds {
  /** world extents of the playable plate */
  w: number;
  h: number;
}

const DEG = Math.PI / 180;
export const DEFAULT_AZIMUTH = 28 * DEG;
export const DEFAULT_ELEVATION = 44 * DEG;

interface Pose {
  x: number;
  z: number;
  dist: number;
  az: number;
  el: number;
}

export class TabletopCamera {
  readonly camera: THREE.PerspectiveCamera;
  private goal: Pose = { x: 0, z: 0, dist: 20, az: DEFAULT_AZIMUTH, el: DEFAULT_ELEVATION };
  private pose: Pose = { ...this.goal };
  private bounds: CameraBounds = { w: 28, h: 18 };
  private aspect = 1.6;
  /** the canvas size, and the margins the interface covers: the camera frames the village in what is left, so nothing important sits under a panel */
  private view = { w: 1000, h: 625 };
  private insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private insetGoal = { left: 0, right: 0, top: 0, bottom: 0 };
  private groundY = (_x: number, _z: number): number => 0;
  private minDist = 5;
  private maxDist = 40;
  private fitDist = 24;
  reduced = false;
  /** a stable text of where the camera is, for tests */
  private moving = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.5, 400);
    this.aspect = aspect;
    this.view = { w: aspect * 600, h: 600 };
  }

  get isMoving(): boolean {
    return this.moving;
  }

  setGround(fn: (x: number, z: number) => number): void {
    this.groundY = fn;
  }

  setBounds(b: CameraBounds): void {
    this.bounds = b;
    this.recomputeFit();
    this.goal = { ...this.goal, x: b.w / 2, z: b.h / 2 + 0.3, dist: this.homeDist() };
    this.pose = { ...this.goal };
    this.apply();
  }

  resize(w: number, h: number): void {
    this.view = { w: Math.max(1, w), h: Math.max(1, h) };
    this.applyViewport();
  }

  /** ask for margins; they ease in so a panel opening slides the village aside instead of cutting to a new view */
  setInsets(i: { left: number; right: number; top: number; bottom: number }, instant = false): void {
    const lim = (v: number, max: number): number => Math.min(Math.max(0, v), max);
    this.insetGoal = {
      left: lim(i.left, this.view.w * 0.25),
      right: lim(i.right, this.view.w * 0.4),
      top: lim(i.top, this.view.h * 0.3),
      bottom: lim(i.bottom, this.view.h * 0.4),
    };
    if (instant || this.reduced) {
      this.insets = { ...this.insetGoal };
      this.applyViewport();
    }
  }

  private applyViewport(): void {
    const { w, h } = this.view;
    const i = this.insets;
    const fw = Math.max(80, w - i.left - i.right);
    const fh = Math.max(80, h - i.top - i.bottom);
    this.aspect = fw / fh;
    this.camera.aspect = this.aspect;
    if (i.left > 0.5 || i.right > 0.5 || i.top > 0.5 || i.bottom > 0.5) this.camera.setViewOffset(fw, fh, -i.left, -i.top, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    const wasHome = Math.abs(this.goal.dist - this.homeDist()) < 0.01;
    this.recomputeFit();
    if (wasHome) {
      this.goal.dist = this.homeDist();
      this.pose.dist = this.homeDist();
    }
    this.clamp();
    this.apply();
  }

  /** the distance at which the whole plate fits the view, found by projecting its corners from the default angle */
  private recomputeFit(): void {
    const { w, h } = this.bounds;
    const cam = new THREE.PerspectiveCamera(this.camera.fov, this.aspect, 0.5, 400);
    const cx = w / 2;
    const cz = h / 2 + 0.3;
    const corners = [
      [0, 0, 0], [w, 0, 0], [0, 0, h], [w, 0, h],
      [0, 2.6, 0], [w, 2.6, 0], [0, 2.6, h], [w, 2.6, h],
    ];
    const fits = (dist: number, margin: number): boolean => {
      const horiz = dist * Math.cos(DEFAULT_ELEVATION);
      cam.position.set(cx + Math.sin(DEFAULT_AZIMUTH) * horiz, dist * Math.sin(DEFAULT_ELEVATION), cz + Math.cos(DEFAULT_AZIMUTH) * horiz);
      cam.lookAt(cx, 0, cz);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      for (const c of corners) {
        const p = new THREE.Vector3(c[0], c[1], c[2]).project(cam);
        if (Math.abs(p.x) > margin || Math.abs(p.y) > margin) return false;
      }
      return true;
    };
    let lo = 6;
    let hi = 200;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid, 0.96)) hi = mid;
      else lo = mid;
    }
    this.fitDist = hi;
    this.maxDist = this.fitDist * 1.1;
    this.minDist = 4.2;
  }

  /** where the camera starts and returns to: the whole village on a wide window, the middle of it on a tall phone screen */
  private homeDist(): number {
    return this.aspect < 0.9 ? Math.max(this.minDist, this.fitDist * 0.6) : this.fitDist * 0.9;
  }

  private clamp(): void {
    const g = this.goal;
    const { w, h } = this.bounds;
    g.dist = Math.min(this.maxDist, Math.max(this.minDist, g.dist));
    // the closer in, the freer the pan; fully zoomed out the view is locked to the centre
    const free = Math.min(1, Math.max(0, (this.maxDist - g.dist) / (this.maxDist - this.minDist)));
    const mx = (w / 2) * free + 0.0;
    const mz = (h / 2) * free + 0.0;
    g.x = Math.min(w / 2 + mx, Math.max(w / 2 - mx, g.x));
    g.z = Math.min(h / 2 + mz, Math.max(h / 2 - mz, g.z));
    g.el = Math.min(66 * DEG, Math.max(24 * DEG, g.el));
    g.az = Math.min(DEFAULT_AZIMUTH + 75 * DEG, Math.max(DEFAULT_AZIMUTH - 75 * DEG, g.az));
  }

  /** ground-plane drag: move the world under the finger */
  panBy(dxPx: number, dyPx: number, viewportH: number): void {
    const g = this.goal;
    const scale = (2 * g.dist * Math.tan((this.camera.fov * DEG) / 2)) / Math.max(1, viewportH);
    const fx = -Math.sin(g.az);
    const fz = -Math.cos(g.az);
    const rx = -fz;
    const rz = fx;
    g.x -= rx * dxPx * scale;
    g.z -= rz * dxPx * scale;
    g.x += fx * (dyPx * scale) / Math.sin(g.el);
    g.z += fz * (dyPx * scale) / Math.sin(g.el);
    this.clamp();
    this.snapIfReduced(true);
  }

  /** world-space pan used by the keyboard: forward/right in the camera's own frame */
  panWorld(right: number, forward: number): void {
    const g = this.goal;
    const fx = -Math.sin(g.az);
    const fz = -Math.cos(g.az);
    g.x += -fz * right + fx * forward;
    g.z += fx * right + fz * forward;
    this.clamp();
    this.snapIfReduced(false);
  }

  zoomBy(factor: number, anchor?: { x: number; z: number }): void {
    const g = this.goal;
    const before = g.dist;
    g.dist /= factor;
    g.dist = Math.min(this.maxDist, Math.max(this.minDist, g.dist));
    if (anchor) {
      // drift the view towards what the cursor is over, as far as the zoom actually changed
      const k = 1 - g.dist / before;
      g.x += (anchor.x - g.x) * k * 0.7;
      g.z += (anchor.z - g.z) * k * 0.7;
    }
    this.clamp();
    this.snapIfReduced(false);
  }

  orbitBy(dAz: number, dEl: number): void {
    this.goal.az += dAz;
    this.goal.el += dEl;
    this.clamp();
    this.snapIfReduced(true);
  }

  /** put the whole village back in frame, from the default angle */
  reset(): void {
    this.goal = { x: this.bounds.w / 2, z: this.bounds.h / 2 + 0.3, dist: this.homeDist(), az: DEFAULT_AZIMUTH, el: DEFAULT_ELEVATION };
    this.snapIfReduced(false);
  }

  focus(x: number, z: number, dist?: number, snap = false): void {
    this.goal.x = x;
    this.goal.z = z;
    if (dist !== undefined) this.goal.dist = dist;
    this.clamp();
    if (snap) this.snapNow();
    else this.snapIfReduced(false);
  }

  /** a distance that frames something close up without losing the surroundings */
  closeDist(): number {
    return Math.max(this.minDist, this.fitDist * 0.45);
  }

  get zoomLevel(): number {
    return this.fitDist / this.pose.dist;
  }

  private snapIfReduced(immediate: boolean): void {
    if (this.reduced && !immediate) this.snapNow();
  }

  snapNow(): void {
    this.pose = { ...this.goal };
    this.apply();
  }

  /** ease the pose towards its goal; returns true while the camera is still moving */
  update(dt: number): boolean {
    const ik = 1 - Math.exp(-dt * 10);
    const ig = this.insetGoal;
    const ic = this.insets;
    if (Math.abs(ig.left - ic.left) + Math.abs(ig.right - ic.right) + Math.abs(ig.top - ic.top) + Math.abs(ig.bottom - ic.bottom) > 0.4) {
      ic.left += (ig.left - ic.left) * ik;
      ic.right += (ig.right - ic.right) * ik;
      ic.top += (ig.top - ic.top) * ik;
      ic.bottom += (ig.bottom - ic.bottom) * ik;
      this.applyViewport();
    } else if (ic.left !== ig.left || ic.right !== ig.right || ic.top !== ig.top || ic.bottom !== ig.bottom) {
      this.insets = { ...ig };
      this.applyViewport();
    }
    const k = 1 - Math.exp(-dt * 9);
    const p = this.pose;
    const g = this.goal;
    const dx = g.x - p.x;
    const dz = g.z - p.z;
    const dd = g.dist - p.dist;
    const da = g.az - p.az;
    const de = g.el - p.el;
    const moving = Math.abs(dx) + Math.abs(dz) + Math.abs(dd) * 0.5 + Math.abs(da) * 10 + Math.abs(de) * 10 > 0.002;
    if (moving) {
      p.x += dx * k;
      p.z += dz * k;
      p.dist += dd * k;
      p.az += da * k;
      p.el += de * k;
      this.apply();
    }
    this.moving = moving;
    return moving;
  }

  private apply(): void {
    const p = this.pose;
    const y = this.groundY(p.x, p.z);
    const horiz = p.dist * Math.cos(p.el);
    this.camera.position.set(p.x + Math.sin(p.az) * horiz, y + p.dist * Math.sin(p.el), p.z + Math.cos(p.az) * horiz);
    this.camera.lookAt(p.x, y, p.z);
    this.camera.updateMatrixWorld();
  }

  /** the point on the ground (at the terrain's height) under a screen position, for cursor-anchored zoom */
  groundPoint(ndcX: number, ndcY: number): { x: number; z: number } | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const y = this.groundY(this.pose.x, this.pose.z);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
  }

  describe(): { x: number; z: number; dist: number; azimuthDeg: number; elevationDeg: number } {
    const p = this.goal;
    return { x: p.x, z: p.z, dist: p.dist, azimuthDeg: p.az / DEG, elevationDeg: p.el / DEG };
  }

  /** test and screenshot hook: jump to an exact view */
  setView(v: { x?: number; z?: number; dist?: number; azimuthDeg?: number; elevationDeg?: number }): void {
    const g = this.goal;
    if (v.x !== undefined) g.x = v.x;
    if (v.z !== undefined) g.z = v.z;
    if (v.dist !== undefined) g.dist = v.dist;
    if (v.azimuthDeg !== undefined) g.az = v.azimuthDeg * DEG;
    if (v.elevationDeg !== undefined) g.el = v.elevationDeg * DEG;
    this.clamp();
    this.snapNow();
  }
}
