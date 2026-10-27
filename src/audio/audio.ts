/**
 * Procedural Web Audio. No audio files, no network. The AudioContext is created lazily after the first user
 * gesture (browser autoplay policy). Every voice is short-lived and disconnects itself, so nothing leaks.
 */
export type SfxName = 'click' | 'tick' | 'seed' | 'ritual' | 'bell' | 'gather' | 'counter' | 'deny' | 'law' | 'loss' | 'night' | 'win' | 'lose' | 'warn' | 'rescue' | 'dawn' | 'creak';

interface AudioSettings {
  sfx: boolean;
  music: boolean;
  sfxVolume: number;
  musicVolume: number;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let settings: AudioSettings = { sfx: true, music: true, sfxVolume: 0.7, musicVolume: 0.35 };
let activeVoices = 0;
const MAX_VOICES = 24;

export function configureAudio(s: Partial<AudioSettings>): void {
  settings = { ...settings, ...s };
  if (sfxBus) sfxBus.gain.value = settings.sfx ? settings.sfxVolume : 0;
  applyMusicSettings();
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = settings.sfx ? settings.sfxVolume : 0;
    sfxBus.connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

/** Call from a user gesture so audio can start. */
export function unlockAudio(): void {
  ensure();
  applyMusicSettings();
}

interface Tone {
  f: number;
  to?: number;
  t: number;
  d: number;
  type?: OscillatorType;
  g?: number;
  a?: number;
}

function tone(c: AudioContext, bus: AudioNode, x: Tone): void {
  if (activeVoices >= MAX_VOICES) return;
  const t0 = c.currentTime + x.t;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = x.type ?? 'sine';
  o.frequency.setValueAtTime(x.f, t0);
  if (x.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, x.to), t0 + x.d);
  const peak = x.g ?? 0.25;
  const a = x.a ?? 0.01;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + x.d);
  o.connect(g);
  g.connect(bus);
  activeVoices++;
  o.start(t0);
  o.stop(t0 + x.d + 0.05);
  o.onended = () => {
    activeVoices--;
    o.disconnect();
    g.disconnect();
  };
}

function noise(c: AudioContext, bus: AudioNode, t: number, d: number, g: number, lp: number): void {
  if (activeVoices >= MAX_VOICES) return;
  const len = Math.floor(c.sampleRate * d);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const ch = buf.getChannelData(0);
  // deterministic noise (no Math.random in audio either)
  let seed = 12345;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    ch[i] = (seed / 4294967296) * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lp;
  const gn = c.createGain();
  const t0 = c.currentTime + t;
  gn.gain.setValueAtTime(g, t0);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  src.connect(f);
  f.connect(gn);
  gn.connect(bus);
  activeVoices++;
  src.start(t0);
  src.onended = () => {
    activeVoices--;
    src.disconnect();
    f.disconnect();
    gn.disconnect();
  };
}

/**
 * Play a short effect. `pan` (-1 left .. 1 right) places it in the stereo field: the bell comes from the tower's side of the map,
 * so a player with headphones hears where the action is. Browsers without StereoPannerNode just play it centred.
 */
export function sfx(name: SfxName, pan = 0): void {
  if (!settings.sfx) return;
  const c = ensure();
  if (!c || !sfxBus) return;
  let b: AudioNode = sfxBus;
  let panner: StereoPannerNode | null = null;
  if (pan !== 0 && typeof c.createStereoPanner === 'function') {
    panner = c.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(sfxBus);
    b = panner;
    window.setTimeout(() => panner?.disconnect(), 2500);
  }
  switch (name) {
    case 'click':
      tone(c, b, { f: 520, to: 380, t: 0, d: 0.07, type: 'triangle', g: 0.12 });
      break;
    case 'tick':
      tone(c, b, { f: 880, t: 0, d: 0.04, type: 'sine', g: 0.05 });
      break;
    case 'seed':
      tone(c, b, { f: 392, to: 523, t: 0, d: 0.28, type: 'sine', g: 0.2, a: 0.03 });
      tone(c, b, { f: 659, to: 784, t: 0.08, d: 0.3, type: 'sine', g: 0.12, a: 0.03 });
      break;
    case 'ritual':
      noise(c, b, 0, 0.5, 0.12, 900);
      tone(c, b, { f: 196, to: 294, t: 0, d: 0.5, type: 'sawtooth', g: 0.08, a: 0.05 });
      break;
    case 'bell':
      for (const [f, g] of [[440, 0.28], [880, 0.14], [1320, 0.08]] as [number, number][]) tone(c, b, { f, t: 0, d: 1.8, type: 'sine', g, a: 0.005 });
      break;
    case 'gather':
      tone(c, b, { f: 262, t: 0, d: 0.3, type: 'triangle', g: 0.14 });
      tone(c, b, { f: 330, t: 0.1, d: 0.3, type: 'triangle', g: 0.14 });
      tone(c, b, { f: 392, t: 0.2, d: 0.4, type: 'triangle', g: 0.14 });
      break;
    case 'counter':
      tone(c, b, { f: 330, to: 220, t: 0, d: 0.22, type: 'square', g: 0.07 });
      break;
    case 'deny':
      tone(c, b, { f: 160, to: 120, t: 0, d: 0.18, type: 'square', g: 0.08 });
      break;
    case 'warn':
      tone(c, b, { f: 220, t: 0, d: 0.35, type: 'sawtooth', g: 0.1 });
      tone(c, b, { f: 208, t: 0.4, d: 0.35, type: 'sawtooth', g: 0.1 });
      break;
    case 'law':
      for (const [i, f] of [262, 330, 392, 523, 659].entries()) tone(c, b, { f, t: i * 0.09, d: 0.9, type: 'sine', g: 0.16, a: 0.02 });
      noise(c, b, 0, 0.9, 0.05, 2400);
      break;
    case 'rescue':
      tone(c, b, { f: 523, to: 784, t: 0, d: 0.4, type: 'sine', g: 0.18 });
      break;
    case 'loss':
      tone(c, b, { f: 196, to: 98, t: 0, d: 1.0, type: 'sine', g: 0.2, a: 0.04 });
      break;
    case 'night':
      noise(c, b, 0, 0.9, 0.08, 500);
      tone(c, b, { f: 110, to: 82, t: 0, d: 1.1, type: 'sine', g: 0.12, a: 0.1 });
      break;
    case 'dawn':
      tone(c, b, { f: 392, to: 523, t: 0, d: 0.8, type: 'sine', g: 0.1, a: 0.2 });
      break;
    case 'creak':
      // wood under strain: a low saw that slides and wobbles, with a rasp of noise
      tone(c, b, { f: 96, to: 64, t: 0, d: 0.7, type: 'sawtooth', g: 0.07, a: 0.08 });
      tone(c, b, { f: 142, to: 98, t: 0.12, d: 0.5, type: 'sawtooth', g: 0.04, a: 0.06 });
      noise(c, b, 0, 0.6, 0.05, 700);
      break;
    case 'win':
      for (const [i, f] of [392, 494, 587, 784].entries()) tone(c, b, { f, t: i * 0.14, d: 1.2, type: 'triangle', g: 0.17, a: 0.02 });
      break;
    case 'lose':
      for (const [i, f] of [330, 294, 247, 196].entries()) tone(c, b, { f, t: i * 0.22, d: 1.0, type: 'sine', g: 0.17, a: 0.03 });
      break;
  }
}

// ---- ambience / music (kept deliberately tiny: two drones and a slow arpeggio, intensity follows the threat)
let ambience: { stop: () => void; setIntensity: (n: number) => void } | null = null;
let wantAmbience = false;
let intensity = 0.2;
let sceneWater = false;

/** Tell the ambience what the village sounds like (a creek runs through it). Takes effect the next time the ambience starts. */
export function setSceneAudio(s: { water: boolean }): void {
  sceneWater = s.water;
}

/** A short looping buffer of deterministic noise (no Math.random in audio either). */
function loopNoise(c: AudioContext, seconds: number, seed: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const ch = buf.getChannelData(0);
  let s = seed;
  let last = 0;
  for (let i = 0; i < len; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    // slightly smoothed so the loop point is not a click
    last = last * 0.6 + ((s / 4294967296) * 2 - 1) * 0.4;
    ch[i] = last;
  }
  return buf;
}

function applyMusicSettings(): void {
  if (!ctx || !master) return;
  if (settings.music && wantAmbience) startAmbience();
  else stopAmbience();
}

export function setAmbience(on: boolean): void {
  wantAmbience = on;
  applyMusicSettings();
}

export function setThreatIntensity(n: number): void {
  intensity = Math.max(0, Math.min(1, n));
  ambience?.setIntensity(intensity);
}

function startAmbience(): void {
  if (ambience || !ctx || !master) return;
  const c = ctx;
  const bus = c.createGain();
  bus.gain.value = 0;
  bus.gain.linearRampToValueAtTime(settings.musicVolume * 0.5, c.currentTime + 2);
  bus.connect(master);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  lp.connect(bus);
  const nodes: AudioNode[] = [bus, lp];
  const oscs: OscillatorNode[] = [];
  for (const [f, g] of [[55, 0.5], [82.4, 0.35], [110.2, 0.2]] as [number, number][]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const gn = c.createGain();
    gn.gain.value = g * 0.25;
    o.connect(gn);
    gn.connect(lp);
    o.start();
    oscs.push(o);
    nodes.push(gn);
  }
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoG = c.createGain();
  lfoG.gain.value = 180;
  lfo.connect(lfoG);
  lfoG.connect(lp.frequency);
  lfo.start();
  oscs.push(lfo);
  nodes.push(lfoG);
  // wind (always) and a creek (only where there is a river): looping noise through filters, gusting slowly; both grow with the threat
  const beds: AudioBufferSourceNode[] = [];
  const windSrc = c.createBufferSource();
  windSrc.buffer = loopNoise(c, 3, 777);
  windSrc.loop = true;
  const windBp = c.createBiquadFilter();
  windBp.type = 'bandpass';
  windBp.frequency.value = 380;
  windBp.Q.value = 0.7;
  const windGain = c.createGain();
  windGain.gain.value = 0.05;
  windSrc.connect(windBp);
  windBp.connect(windGain);
  windGain.connect(bus);
  const gust = c.createOscillator();
  gust.frequency.value = 0.11;
  const gustG = c.createGain();
  gustG.gain.value = 0.025;
  gust.connect(gustG);
  gustG.connect(windGain.gain);
  gust.start();
  windSrc.start();
  oscs.push(gust);
  beds.push(windSrc);
  nodes.push(windBp, windGain, gustG);
  let creekGain: GainNode | null = null;
  if (sceneWater) {
    const creek = c.createBufferSource();
    creek.buffer = loopNoise(c, 2.2, 4242);
    creek.loop = true;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const lp2 = c.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 5200;
    creekGain = c.createGain();
    creekGain.gain.value = 0.03;
    const burble = c.createOscillator();
    burble.frequency.value = 0.37;
    const burbleG = c.createGain();
    burbleG.gain.value = 0.012;
    burble.connect(burbleG);
    burbleG.connect(creekGain.gain);
    burble.start();
    creek.connect(hp);
    hp.connect(lp2);
    lp2.connect(creekGain);
    creekGain.connect(bus);
    creek.start();
    oscs.push(burble);
    beds.push(creek);
    nodes.push(hp, lp2, creekGain, burbleG);
  }
  let step = 0;
  const notes = [220, 261.6, 329.6, 392, 329.6, 261.6];
  const timer = window.setInterval(() => {
    if (!ctx || !settings.music) return;
    const f = notes[step++ % notes.length];
    const hi = intensity > 0.6;
    tone(c, bus, { f: hi ? f * 0.5 : f, t: 0, d: 2.4, type: 'sine', g: 0.05 + intensity * 0.05, a: 0.4 });
  }, 2600);
  ambience = {
    stop: () => {
      window.clearInterval(timer);
      bus.gain.cancelScheduledValues(c.currentTime);
      bus.gain.linearRampToValueAtTime(0, c.currentTime + 0.6);
      window.setTimeout(() => {
        for (const o of oscs) {
          try {
            o.stop();
          } catch {
            /* already stopped */
          }
          o.disconnect();
        }
        for (const b of beds) {
          try {
            b.stop();
          } catch {
            /* already stopped */
          }
          b.disconnect();
        }
        for (const n of nodes) n.disconnect();
      }, 800);
    },
    setIntensity: (n: number) => {
      lp.frequency.linearRampToValueAtTime(400 + n * 1400, c.currentTime + 1.5);
      windGain.gain.linearRampToValueAtTime(0.04 + n * 0.16, c.currentTime + 1.5);
      windBp.frequency.linearRampToValueAtTime(300 + n * 600, c.currentTime + 1.5);
      creekGain?.gain.linearRampToValueAtTime(0.025 + n * 0.05, c.currentTime + 1.5);
    },
  };
  ambience.setIntensity(intensity);
}

function stopAmbience(): void {
  ambience?.stop();
  ambience = null;
}
