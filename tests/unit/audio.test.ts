import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A tiny stand-in for the Web Audio graph that counts what is created, started, stopped and disconnected. */
class FakeParam {
  value = 0;
  setValueAtTime(v: number): void {
    this.value = v;
  }
  exponentialRampToValueAtTime(v: number): void {
    this.value = v;
  }
  linearRampToValueAtTime(v: number): void {
    this.value = v;
  }
  cancelScheduledValues(): void {}
}
interface Counted {
  started: boolean;
  stopped: boolean;
  disconnected: boolean;
}
const made: { osc: (FakeNode & Counted)[]; src: (FakeNode & Counted)[]; pan: FakeNode[]; all: FakeNode[] } = { osc: [], src: [], pan: [], all: [] };
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  pan = new FakeParam();
  type = '';
  buffer: unknown = null;
  loop = false;
  started = false;
  stopped = false;
  disconnected = false;
  onended: (() => void) | null = null;
  constructor() {
    made.all.push(this);
  }
  connect(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}
class FakeContext {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  destination = {};
  createGain = () => new FakeNode();
  createOscillator = () => {
    const n = new FakeNode();
    made.osc.push(n as FakeNode & Counted);
    return n;
  };
  createBufferSource = () => {
    const n = new FakeNode();
    made.src.push(n as FakeNode & Counted);
    return n;
  };
  createBiquadFilter = () => new FakeNode();
  createStereoPanner = () => {
    const n = new FakeNode();
    made.pan.push(n);
    return n;
  };
  createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
  resume = () => Promise.resolve();
}

let audio: typeof import('../../src/audio/audio.ts');

beforeEach(async () => {
  made.osc = [];
  made.src = [];
  made.pan = [];
  made.all = [];
  vi.useFakeTimers();
  (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeContext, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, setTimeout: globalThis.setTimeout };
  vi.resetModules();
  audio = await import('../../src/audio/audio.ts');
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as { window?: unknown }).window;
});

/** let every short-lived voice finish, the way the browser would */
function finishVoices(): void {
  for (const n of [...made.osc, ...made.src]) n.onended?.();
}

describe('procedural audio', () => {
  it('plays nothing when effects are switched off, and something when they are on', () => {
    audio.configureAudio({ sfx: false });
    audio.sfx('law');
    expect(made.osc.length).toBe(0);
    audio.configureAudio({ sfx: true });
    audio.sfx('law');
    expect(made.osc.length).toBeGreaterThan(0);
  });

  it('caps simultaneous voices, and frees every voice (and its nodes) when it ends, so nothing leaks', () => {
    audio.configureAudio({ sfx: true });
    for (let i = 0; i < 60; i++) audio.sfx('law');
    expect(made.osc.length + made.src.length).toBeLessThanOrEqual(24);
    finishVoices();
    for (const n of [...made.osc, ...made.src]) expect(n.disconnected, 'a finished voice disconnects itself').toBe(true);
    // the budget is back: new sounds play again
    const before = made.osc.length;
    audio.sfx('seed');
    expect(made.osc.length).toBeGreaterThan(before);
  });

  it('every distinct cue exists and produces sound', () => {
    audio.configureAudio({ sfx: true });
    const names = ['click', 'tick', 'seed', 'ritual', 'bell', 'gather', 'counter', 'deny', 'law', 'loss', 'night', 'win', 'lose', 'warn', 'rescue', 'dawn', 'creak'] as const;
    for (const n of names) {
      const before = made.osc.length + made.src.length;
      audio.sfx(n);
      expect(made.osc.length + made.src.length, `cue ${n}`).toBeGreaterThan(before);
      finishVoices();
    }
  });

  it('places the bell in the stereo field and frees the panner afterwards', () => {
    audio.configureAudio({ sfx: true });
    audio.sfx('bell', -0.7);
    expect(made.pan.length).toBe(1);
    expect(made.pan[0].pan.value).toBe(-0.7);
    vi.advanceTimersByTime(3000);
    expect(made.pan[0].disconnected).toBe(true);
    audio.sfx('bell', 5);
    expect(made.pan[1].pan.value).toBe(1);
  });

  it('ambience starts only when music is on, adds a creek only where there is a river, and stops completely', () => {
    audio.configureAudio({ music: false, sfx: true });
    audio.unlockAudio();
    audio.setAmbience(true);
    expect(made.osc.length, 'music off: silence').toBe(0);

    audio.configureAudio({ music: true });
    audio.setSceneAudio({ water: false });
    audio.setAmbience(true);
    const dry = made.src.length;
    expect(made.osc.length).toBeGreaterThan(3);
    expect(dry, 'wind only').toBe(1);
    audio.setAmbience(false);
    vi.advanceTimersByTime(1000);
    for (const n of [...made.osc, ...made.src]) {
      expect(n.stopped, 'oscillator / source stopped').toBe(true);
      expect(n.disconnected, 'oscillator / source disconnected').toBe(true);
    }
    for (const n of made.all) expect(n.disconnected || !n.started).toBe(true);

    made.osc = [];
    made.src = [];
    audio.setSceneAudio({ water: true });
    audio.setAmbience(true);
    expect(made.src.length, 'wind and creek').toBe(2);
    audio.setThreatIntensity(1);
    audio.setAmbience(false);
    vi.advanceTimersByTime(1000);
    for (const n of [...made.osc, ...made.src]) expect(n.stopped && n.disconnected).toBe(true);
  });

  it('starting the ambience twice never layers a second copy over the first', () => {
    audio.configureAudio({ music: true });
    audio.unlockAudio();
    audio.setAmbience(true);
    const n = made.osc.length;
    audio.setAmbience(true);
    audio.configureAudio({ musicVolume: 0.2 });
    expect(made.osc.length).toBe(n);
  });
});
