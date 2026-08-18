// Procedural WebAudio SFX, per weapon, with a short reverb tail for space.
// Also a drop-in sample loader: if a matching file exists in /sfx/<name>.{ogg,wav,mp3}
// it is used instead of the synth. Context is created on the first user gesture.

import { rand } from './math';
import type { WeaponSound } from './weapon';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverbSend: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const samples: Record<string, AudioBuffer> = {};

function makeImpulse(seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx!.sampleRate * seconds);
  const buf = ctx!.createBuffer(2, len, ctx!.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function initAudio(): void {
  if (ctx) return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);

  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(0.7, 3);
  const wet = ctx.createGain();
  wet.gain.value = 0.85;
  conv.connect(wet).connect(master);
  reverbSend = ctx.createGain();
  reverbSend.gain.value = 1;
  reverbSend.connect(conv);

  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
  noiseBuf = buf;

  void loadSamples();
}

async function loadSamples(): Promise<void> {
  const names = ['pistol', 'rifle', 'shotgun', 'sniper', 'knife', 'reload', 'impact', 'death', 'hurt'];
  await Promise.all(
    names.map(async (n) => {
      for (const ext of ['ogg', 'wav', 'mp3']) {
        try {
          const res = await fetch(`sfx/${n}.${ext}`);
          if (!res.ok) continue;
          samples[n] = await ctx!.decodeAudioData(await res.arrayBuffer());
          return;
        } catch {
          /* no sample: synth fallback is used */
        }
      }
    }),
  );
}

function playSample(name: string, gain: number): boolean {
  const b = samples[name];
  if (!b || !ctx || !master) return false;
  const src = ctx.createBufferSource();
  src.buffer = b;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start();
  return true;
}

function noise(dur: number, type: BiquadFilterType, freq: number, gain: number, q = 1, send = 0): void {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + rand() * 0.4;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g).connect(master);
  if (send > 0 && reverbSend) g.connect(reverbSend);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine', send = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  if (send > 0 && reverbSend) g.connect(reverbSend);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Per-weapon gunshots. `distant` (enemy fire) is quieter + duller.
export function sfxWeapon(sound: WeaponSound, distant = false): void {
  const gm = distant ? 0.55 : 1;
  if (playSample(sound, 0.7 * gm)) return;
  switch (sound) {
    case 'pistol':
      noise(0.06, 'lowpass', 2200 * gm, 0.8 * gm, 0.7);
      tone(0.07, 260, 70, 0.4 * gm, 'square');
      break;
    case 'rifle':
      noise(0.08, 'lowpass', 2600 * gm, 0.9 * gm, 0.7, 0.2);
      noise(0.03, 'highpass', 4200, 0.4 * gm);
      tone(0.09, 220, 60, 0.5 * gm, 'square');
      break;
    case 'shotgun':
      noise(0.16, 'lowpass', 1200 * gm, 1.0 * gm, 0.6, 0.4);
      noise(0.05, 'highpass', 3000, 0.4 * gm);
      tone(0.2, 130, 38, 0.6 * gm, 'square', 0.3);
      break;
    case 'sniper':
      noise(0.05, 'highpass', 3600, 0.7 * gm);
      noise(0.13, 'lowpass', 1700 * gm, 0.9 * gm, 0.7, 0.6);
      tone(0.16, 190, 48, 0.55 * gm, 'square', 0.5);
      break;
    case 'knife':
      noise(0.12, 'bandpass', 2200, 0.5, 3, 0.2);
      tone(0.05, 2100, 2700, 0.25, 'sine', 0.3);
      break;
  }
}

export function sfxReload(): void {
  if (playSample('reload', 0.7)) return;
  tone(0.03, 600, 300, 0.3, 'square');
  window.setTimeout(() => tone(0.04, 400, 800, 0.3, 'square'), 220);
}

export function sfxDryFire(): void {
  tone(0.02, 900, 500, 0.15, 'square');
}

export function sfxImpactWall(): void {
  if (playSample('impact', 0.5)) return;
  noise(0.05, 'highpass', 5200, 0.35, 0.8);
}

export function sfxImpactFlesh(): void {
  noise(0.06, 'lowpass', 900, 0.5, 0.6);
  tone(0.05, 120, 60, 0.2, 'sine');
}

export function sfxEnemyDeath(): void {
  if (playSample('death', 0.6)) return;
  tone(0.35, 240, 40, 0.4, 'sawtooth', 0.3);
  noise(0.3, 'lowpass', 700, 0.4);
}

export function sfxPlayerHurt(): void {
  if (playSample('hurt', 0.7)) return;
  tone(0.18, 90, 55, 0.5, 'square');
  noise(0.12, 'lowpass', 500, 0.4);
}
