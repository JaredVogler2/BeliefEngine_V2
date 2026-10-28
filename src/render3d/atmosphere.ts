import * as THREE from 'three';
import type { SceneSnapshot } from './snapshot.ts';
import { DISPLAY_GLSL, displayUniforms } from './post.ts';

/**
 * Weather and the light of the day, as a mood the scene eases into. The mood is chosen from what the engine says: the chapter's
 * danger, tonight's forecast, how high the river is, and whether the run is over. It only changes how the same scene is lit and how
 * it is dressed (rain, haze, window glow); no weather here is ever an input to the simulation.
 */
export interface Mood {
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fillIntensity: number;
  fog: number;
  fogDensity: number;
  skyTop: number;
  skyHorizon: number;
  /** 0..1: how much the windows glow */
  windows: number;
  /** multiplier on the water colour */
  waterTint: number;
  /** wind strength multiplier */
  wind: number;
  rain: number;
  exposure: number;
  /** how much of the sky is cloud (0 clear, 1 overcast) and its colour */
  cloud: number;
  cloudColor: number;
}

const CALM: Mood = {
  sunColor: 0xffd9a0, sunIntensity: 3.6, hemiSky: 0xc4dcf4, hemiGround: 0x7a7650, hemiIntensity: 1.12, fillIntensity: 0.72, fog: 0xdbe5d4, fogDensity: 0.0095,
  skyTop: 0xa9cbe6, skyHorizon: 0xf1ead0, windows: 0, waterTint: 1, wind: 1, rain: 0, exposure: 1.02, cloud: 0.3, cloudColor: 0xfffaf0,
};
const STORM: Mood = {
  sunColor: 0xd6e0ee, sunIntensity: 1.15, hemiSky: 0x93a6bb, hemiGround: 0x55583f, hemiIntensity: 1.25, fillIntensity: 0.7, fog: 0x8e9aa2, fogDensity: 0.021,
  skyTop: 0x59687a, skyHorizon: 0x9fa9ab, windows: 0.9, waterTint: 0.62, wind: 2.6, rain: 1, exposure: 0.95, cloud: 1.0, cloudColor: 0x6d7885,
};
const THREAT: Mood = {
  sunColor: 0xf4d6a8, sunIntensity: 2.0, hemiSky: 0xb0c0d8, hemiGround: 0x6d6a4c, hemiIntensity: 1.3, fillIntensity: 0.85, fog: 0xc2c4bc, fogDensity: 0.014,
  skyTop: 0x8aa5c4, skyHorizon: 0xdcd6c2, windows: 0.35, waterTint: 0.85, wind: 1.6, rain: 0, exposure: 1.0, cloud: 0.5, cloudColor: 0xe8e4da,
};
const HEAT: Mood = {
  sunColor: 0xffd08a, sunIntensity: 3.4, hemiSky: 0xd6dcea, hemiGround: 0x8a7a50, hemiIntensity: 1.35, fillIntensity: 0.8, fog: 0xefe0b8, fogDensity: 0.012,
  skyTop: 0xbcd0e0, skyHorizon: 0xf6e6b8, windows: 0, waterTint: 1, wind: 0.8, rain: 0, exposure: 1.05, cloud: 0.08, cloudColor: 0xffffff,
};
const DUSK: Mood = {
  sunColor: 0xffb878, sunIntensity: 2.3, hemiSky: 0xa4aecc, hemiGround: 0x66604a, hemiIntensity: 1.25, fillIntensity: 0.9, fog: 0xc9bdb4, fogDensity: 0.013,
  skyTop: 0x7e8fb8, skyHorizon: 0xf0c9a0, windows: 0.5, waterTint: 0.9, wind: 1.2, rain: 0, exposure: 1.0, cloud: 0.55, cloudColor: 0xf2d5bd,
};
const SUNBREAK: Mood = {
  sunColor: 0xffdc9e, sunIntensity: 3.6, hemiSky: 0xcfe4f6, hemiGround: 0x80795a, hemiIntensity: 1.2, fillIntensity: 0.75, fog: 0xe6ecd8, fogDensity: 0.0085,
  skyTop: 0x9ecbec, skyHorizon: 0xfaeccc, windows: 0, waterTint: 1.05, wind: 0.9, rain: 0, exposure: 1.06, cloud: 0.32, cloudColor: 0xfff4dc,
};

/** after a loss: the storm has passed but the light has not come back; lamps are lit in whatever still stands */
const AFTERMATH: Mood = {
  sunColor: 0xd9c9b0, sunIntensity: 1.5, hemiSky: 0x9aa8bc, hemiGround: 0x5e5a46, hemiIntensity: 1.2, fillIntensity: 0.75, fog: 0xa8aeb0, fogDensity: 0.016,
  skyTop: 0x6c7b90, skyHorizon: 0xcdc3b0, windows: 0.8, waterTint: 0.7, wind: 0.8, rain: 0, exposure: 0.97, cloud: 0.8, cloudColor: 0xaeb4bc,
};

export const mix = (a: Mood, b: Mood, t: number): Mood => {
  const c = (x: number, y: number): number => new THREE.Color(x).lerp(new THREE.Color(y), t).getHex();
  const n = (x: number, y: number): number => x + (y - x) * t;
  return {
    sunColor: c(a.sunColor, b.sunColor), sunIntensity: n(a.sunIntensity, b.sunIntensity), hemiSky: c(a.hemiSky, b.hemiSky), hemiGround: c(a.hemiGround, b.hemiGround), hemiIntensity: n(a.hemiIntensity, b.hemiIntensity),
    fillIntensity: n(a.fillIntensity, b.fillIntensity), fog: c(a.fog, b.fog), fogDensity: n(a.fogDensity, b.fogDensity), skyTop: c(a.skyTop, b.skyTop), skyHorizon: c(a.skyHorizon, b.skyHorizon), windows: n(a.windows, b.windows),
    waterTint: n(a.waterTint, b.waterTint), wind: n(a.wind, b.wind), rain: n(a.rain, b.rain), exposure: n(a.exposure, b.exposure), cloud: n(a.cloud, b.cloud), cloudColor: c(a.cloudColor, b.cloudColor),
  };
};

const lerpHex = (a: number, b: number, t: number): number => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

/**
 * The same weather at sundown, between the planning afternoon and the night (and again at dawn): a warm horizon under a deepening sky,
 * clouds lit from below, the first windows lit. The key light itself (a low orange sun) is set by the hour, not here.
 */
export function duskOf(m: Mood): Mood {
  const overcast = Math.min(1, Math.max(0, (m.cloud - 0.3) / 0.7));
  return {
    ...m,
    hemiSky: lerpHex(0xa99cc0, 0x8a8c98, overcast),
    hemiGround: 0x5a4c3c,
    hemiIntensity: m.hemiIntensity * 0.8,
    fillIntensity: 0.55,
    fog: lerpHex(0xd6b49c, 0x9a948e, overcast),
    skyTop: lerpHex(0x5a6c9c, 0x4c5462, overcast),
    skyHorizon: lerpHex(0xf4b47e, 0xa89a8c, overcast),
    windows: Math.max(m.windows, 0.6),
    waterTint: m.waterTint * 0.8,
    cloudColor: lerpHex(0xf2b894, 0x8a8890, overcast),
  };
}

/**
 * The same weather at night (3D plan, stage 2): a cool moon for the key light, a deep blue-teal sky and haze, every window lit, the
 * water darker. Rain and wind are the day's own: a storm goes on through the night. An overcast night is greyer and darker.
 */
export function nightOf(m: Mood): Mood {
  const overcast = Math.min(1, Math.max(0, (m.cloud - 0.3) / 0.7));
  return {
    ...m,
    sunColor: 0x9db4dc,
    sunIntensity: 2.5 * (1 - 0.45 * overcast),
    hemiSky: lerpHex(0x6a84ac, 0x56606e, overcast),
    hemiGround: 0x2c3830,
    hemiIntensity: 1.4,
    fillIntensity: 0.45,
    fog: lerpHex(0x41596a, 0x454e55, overcast),
    fogDensity: m.fogDensity * 1.1,
    skyTop: lerpHex(0x0c1a2c, 0x1d252e, overcast),
    skyHorizon: lerpHex(0x50687a, 0x4a525a, overcast),
    windows: 1,
    waterTint: m.waterTint * 0.34,
    exposure: m.exposure,
    cloudColor: lerpHex(0x6f8296, 0x4a535e, overcast),
  };
}

/**
 * The mood for a moment of the run. `surge` is tonight's predicted flood depth (0..4+), from the forecast the player can also read
 * in the interface, so the sky never shows a storm the forecast does not announce.
 */
export function moodFor(snap: SceneSnapshot, surge: number): Mood {
  if (snap.outcome === 'victory') return SUNBREAK;
  if (snap.outcome === 'defeat') return AFTERMATH;
  if (snap.threat === 'flood') {
    const s = Math.min(1, Math.max(0, (Math.max(surge, snap.level >= 3 ? snap.level : 0) - 1) / 3));
    return mix(CALM, STORM, s);
  }
  if (snap.threat === 'drought') return HEAT;
  if (snap.threat === 'wolves') return mix(CALM, snap.day >= 2 ? DUSK : THREAT, 0.9);
  return CALM;
}

export class Atmosphere {
  current: Mood = { ...CALM };
  private target: Mood = { ...CALM };
  private t = 1;
  private from: Mood = { ...CALM };

  set(m: Mood, instant: boolean): void {
    this.from = { ...this.current };
    this.target = m;
    this.t = instant ? 1 : 0;
    if (instant) this.current = { ...m };
  }

  /** advance the blend; returns true while it is still changing */
  update(dt: number): boolean {
    if (this.t >= 1) return false;
    this.t = Math.min(1, this.t + dt / 2.2);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.current = mix(this.from, this.target, e);
    return true;
  }
}

/** rain as thin streaks falling in a box above the village; one draw call, all the motion in the vertex shader */
export class Rain {
  readonly lines: THREE.LineSegments;
  private readonly mat: THREE.ShaderMaterial;
  private readonly geo: THREE.BufferGeometry;

  constructor(w: number, h: number, count: number) {
    this.geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 6);
    const rnd = (i: number, k: number): number => ((Math.sin(i * k) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < count; i++) {
      const x = rnd(i, 12.9898) * (w + 8) - 4;
      const z = rnd(i, 78.233) * (h + 8) - 4;
      const y = rnd(i, 37.719) * 9;
      pos.set([x, y, z, x, y, z], i * 6);
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const end = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) end[i * 2 + 1] = 1;
    this.geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uWind: { value: 0.6 }, ...displayUniforms },
      vertexShader: /* glsl */ `
        attribute float aEnd;
        uniform float uTime;
        uniform float uWind;
        varying float vA;
        void main() {
          vec3 p = position;
          float speed = 9.0 + fract(p.x * 7.13) * 4.0;
          p.y = mod(p.y - uTime * speed, 9.0);
          p.x += p.y * uWind * 0.2;
          // each streak is a short line leaning with the wind; the second vertex trails behind the first
          p.y += aEnd * 0.28;
          p.x += aEnd * uWind * 0.06;
          vA = (1.0 - aEnd * 0.6) * smoothstep(0.0, 1.0, p.y);
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${DISPLAY_GLSL}
        varying float vA;
        uniform float uAmount;
        void main() {
          // (a screen colour: drawn straight it is written as it is; through the finishing chain it is decoded and pre-compensated)
          vec3 c = vec3(0.78, 0.86, 0.95);
          gl_FragColor = vec4(uDisplayComp > 0.5 ? postDisplay(pow(c, vec3(2.2))) : c, vA * 0.42 * uAmount);
        }
      `,
    });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
    this.lines.visible = false;
  }

  update(time: number, amount: number, wind: number): void {
    this.lines.visible = amount > 0.02;
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uAmount.value = amount;
    this.mat.uniforms.uWind.value = 0.3 + wind * 0.3;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
