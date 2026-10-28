import type * as THREE from 'three';
import type { MagicField } from './magic.ts';
import type { MaterialLib } from './materials.ts';
import type { Rng } from './rand.ts';
import type { SceneChanges, SceneSnapshot } from './snapshot.ts';
import type { TerrainData } from './terrain.ts';
import type { Water } from './water.ts';

export type Quality = 'high' | 'medium' | 'low';

export interface QualityProfile {
  /** cap on the device pixel ratio */
  dpr: number;
  /** shadow map edge in texels; 0 turns shadows off */
  shadow: number;
  water: 'high' | 'medium' | 'low';
  /** multiplier on the number of grass tufts, flowers and small props */
  detail: number;
  /** multiplier on tree counts */
  trees: number;
  /** cap on frames drawn per second */
  maxFps: number;
  particles: number;
}

export const PROFILES: Record<Quality, QualityProfile> = {
  high: { dpr: 2, shadow: 2048, water: 'high', detail: 1, trees: 1, maxFps: 60, particles: 1 },
  medium: { dpr: 1.5, shadow: 1024, water: 'medium', detail: 0.6, trees: 0.8, maxFps: 45, particles: 0.6 },
  low: { dpr: 1, shadow: 0, water: 'low', detail: 0.3, trees: 0.55, maxFps: 30, particles: 0.3 },
};

/** everything a scene layer may use from the world it is part of */
export interface WorldContext {
  scene: THREE.Scene;
  terrain: TerrainData;
  water: Water;
  materials: MaterialLib;
  profile: QualityProfile;
  seed: number;
  rng: (salt: string) => Rng;
  /** height of the ground at a world position */
  heightAt(x: number, z: number): number;
  reducedMotion: boolean;
  /** the weather's effect on motion, shared and updated by the world */
  weather: { wind: number; rain: number };
  /** how far a standing bridge is carried above its resting height so its deck clears the flood (set by the landmarks, read by the people on it) */
  bridgeLift: number;
  /** how far the camera stands from what it looks at, updated every frame (the people grow a little at the overview so they stay legible) */
  viewDistance: number;
  /** the glow belief leaves on the ground and the water, shared by the terrain, the river and the effects */
  magic?: MagicField;
  /** where a villager or landmark is in the world right now */
  locate?(kind: 'villager' | 'landmark', id: string): import('three').Vector3 | null;
  /** what the people on the ground can be asked to do for an event (set by the people layer) */
  actors?: {
    gesture(id: string, kind: string, seconds?: number): void;
    faceToward(id: string, x: number, z: number, seconds?: number): void;
    head(id: string): import('three').Vector3 | null;
  };
}

/** A group of things in the scene that draws one aspect of the village and keeps itself in step with the snapshot. */
export interface Layer {
  readonly group: THREE.Group;
  /** apply a new snapshot; only what `changes` names needs touching */
  update(snap: SceneSnapshot, changes: SceneChanges, ctx: WorldContext): void;
  /** per frame: purely visual animation, never anything the simulation reads */
  tick(dt: number, time: number, ctx: WorldContext): void;
  dispose(): void;
  /** invisible hit volumes carrying `userData.entity = { kind, id }`, for picking */
  pickables?(): THREE.Object3D[];
  /** where an entity is in the world right now (for the camera and the effects) */
  locate?(kind: 'villager' | 'landmark', id: string): THREE.Vector3 | null;
}
