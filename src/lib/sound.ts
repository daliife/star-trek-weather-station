const SOUND_KEY = 'lcars.sound';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let lastHoverAt = 0;

export function loadSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_KEY) !== 'off';
}

export function initSound(): boolean {
  enabled = loadSoundEnabled();
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  localStorage.setItem(SOUND_KEY, value ? 'on' : 'off');
}

export function unlockSound(): void {
  if (!enabled) return;
  const audio = context();
  if (audio.state === 'suspended') void audio.resume();
}

export function playHover(): void {
  whenReady(() => {
    const now = performance.now();
    if (now - lastHoverAt < 80) return;
    lastHoverAt = now;
    chirp({ freq: 1880 + Math.random() * 220, dur: 0.016, gain: 0.055, type: 'sine' });
  });
}

export function playKey(): void {
  whenReady(() => {
    chirp({ freq: 1480, freqEnd: 880, dur: 0.058, gain: 0.15, type: 'sine' });
  });
}

export function playView(): void {
  whenReady(() => {
    chirp({ freq: 1175, dur: 0.042, gain: 0.15, type: 'triangle' });
    chirp({ freq: 1568, dur: 0.072, gain: 0.13, type: 'sine', delay: 0.052 });
  });
}

function whenReady(play: () => void): void {
  if (!enabled || document.hidden) return;
  const audio = context();
  if (audio.state === 'running') {
    play();
    return;
  }
  void audio.resume().then(() => {
    if (enabled && !document.hidden) play();
  });
}

function context(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.2;
    master.connect(ctx.destination);
  }
  return ctx;
}

function chirp(opts: {
  freq: number;
  freqEnd?: number;
  dur: number;
  gain: number;
  type?: OscillatorType;
  delay?: number;
}): void {
  const audio = context();
  const out = master;
  if (!out) return;
  const start = audio.currentTime + (opts.delay ?? 0);
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, start);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freqEnd), start + opts.dur);
  }
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(opts.gain, start + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + opts.dur);
  osc.connect(amp);
  amp.connect(out);
  osc.start(start);
  osc.stop(start + opts.dur + 0.02);
}
