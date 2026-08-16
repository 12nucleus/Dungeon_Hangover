#!/usr/bin/env node
// Preview renderer for the procedural dungeon ambience in src/game/audio.ts.
// Mirrors the exact synthesis (oscillator types, frequency ramps, gain
// envelopes, filter types/Q, event gains) so these wavs sound like the game.
// Output: public/audio/ambience_preview/*.wav  (mono 44.1k 16-bit, ~2x louder
// than in-game so they're comfortable to audition; in-game they sit under the
// music through the 0.9 ambience bus).
// Run: node scripts/gen_ambience_previews.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'ambience_preview');
mkdirSync(OUT, { recursive: true });

// ── tiny WebAudio-flavored synth engine ─────────────────────────────
function envValue(segs, t) {
  for (let i = 0; i < segs.length - 1; i++) {
    if (t >= segs[i].t && t < segs[i + 1].t) {
      const a = segs[i], b = segs[i + 1];
      const dt = b.t - a.t;
      if (dt <= 0) return b.v;
      const u = (t - a.t) / dt;
      return b.mode === 'exp' ? a.v * Math.pow(b.v / a.v, u) : a.v + (b.v - a.v) * u;
    }
  }
  return segs[segs.length - 1].v;
}

function render(durSec, voices, filters = []) {
  const n = Math.floor(SR * durSec);
  const out = new Float32Array(n);
  const oscTypes = {
    sine: (p) => Math.sin(p),
    square: (p) => (Math.sin(p) >= 0 ? 1 : -1),
    triangle: (p) => {
      const u = (p % (2 * Math.PI)) / Math.PI; // 0..2
      return u < 1 ? 2 * u - 1 : 3 - 2 * u;
    },
    sawtooth: (p) => 2 * ((p / (2 * Math.PI)) % 1) - 1,
  };
  // voices: { type, freqSegs, gainSegs, t0 }
  for (const v of voices) {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = v.t0 + i / SR;
      if (t < v.t0 || t > v.stop) continue;
      const f = Math.max(0.1, envValue(v.freqSegs, t));
      phase += (2 * Math.PI * f) / SR;
      const g = envValue(v.gainSegs, t);
      out[i] += g * oscTypes[v.type](phase);
    }
  }
  // filters: { type: 'bandpass'|'lowpass', freqSegs, Q } — per-sample coeffs
  for (const flt of filters) {
    const buf = out.slice();
    out.fill(0);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) {
      const f = Math.max(1, Math.min(SR / 2 - 1, envValue(flt.freqSegs, i / SR)));
      const w0 = (2 * Math.PI * f) / SR;
      const alpha = Math.sin(w0) / (2 * flt.Q);
      const cosw = Math.cos(w0);
      let b0, b1, b2, a0, a1, a2;
      if (flt.type === 'bandpass') {
        b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
      } else {
        b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
      }
      const y = (b0 * buf[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = buf[i]; y2 = y1; y1 = y;
      out[i] = y;
    }
  }
  return out;
}

function toWav(name, data, peakScale = 1) {
  const pcm = new Int16Array(data.length);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const s = peak > 0 ? (0.95 * peakScale) / peak : 1;
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i] * s));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  const h = new Uint8Array(44);
  const wv = new DataView(h.buffer);
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) h[o + i] = s.charCodeAt(i); };
  wstr(0, 'RIFF'); wv.setUint32(4, 36 + bytes.length, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); wv.setUint32(16, 16, true); wv.setUint16(20, 1, true); wv.setUint16(22, 1, true);
  wv.setUint32(24, SR, true); wv.setUint32(28, SR * 2, true);
  wv.setUint16(32, 2, true); wv.setUint16(34, 16, true);
  wstr(36, 'data'); wv.setUint32(40, bytes.length, true);
  const wav = new Uint8Array(44 + bytes.length);
  wav.set(h); wav.set(bytes, 44);
  writeFileSync(join(OUT, name), wav);
  console.log(`${name.padEnd(12)} ${(wav.length / 1024).toFixed(1)} KiB  peak ${peak.toFixed(3)}`);
}

const t = 0.1; // sounds start 0.1s in, mirroring the scheduler's now+t

// drip — sine plink 900-1800Hz, fast decay (ambDrip)
toWav('drip.wav', render(1.0, [{
  type: 'sine', t0: t, stop: t + 0.15,
  freqSegs: [
    { t, v: 900 + Math.random() * 900, mode: 'set' },
    { t: t + 0.08, v: (900 + Math.random() * 900) * 0.75, mode: 'exp' },
  ],
  gainSegs: [
    { t, v: 0.0001, mode: 'set' },
    { t: t + 0.005, v: 0.34, mode: 'exp' },
    { t: t + 0.11, v: 0.0001, mode: 'exp' },
  ],
}]));

// footstep — dull thump + slapback echo (ambFootstep)
{
  const voices = [];
  const thump = (at, vol) => voices.push({
    type: 'sine', t0: at, stop: at + 0.25,
    freqSegs: [
      { t: at, v: 95 + Math.random() * 20, mode: 'set' },
      { t: at + 0.18, v: 42, mode: 'exp' },
    ],
    gainSegs: [
      { t: at, v: 0.0001, mode: 'set' },
      { t: at + 0.012, v: vol, mode: 'exp' },
      { t: at + 0.22, v: 0.0001, mode: 'exp' },
    ],
  });
  thump(t, 0.2);
  thump(t + 0.27, 0.09);
  toWav('footstep.wav', render(1.2, voices));
}

// scream — bandpassed noise shriek (ambScream)
{
  const len = 1.4;
  const noise = new Float32Array(Math.floor(SR * len));
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
  const buf = render(2.2, [{
    type: 'sine', t0: 0, stop: len, // placeholder — replaced by noise below
    freqSegs: [{ t: 0, v: 1, mode: 'set' }],
    gainSegs: [{ t: 0, v: 0, mode: 'set' }, { t: len, v: 0, mode: 'set' }],
  }]);
  // render noise through the bandpass by hand
  const f = 1900 + Math.random() * 500;
  const w0 = (2 * Math.PI * f) / SR, alpha = Math.sin(w0) / 18, cosw = Math.cos(w0);
  const b0 = alpha, b1 = 0, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * cosw, a2 = 1 - alpha;
  const out = new Float32Array(buf.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < out.length; i++) {
    const tt = t + i / SR;
    const env = tt < t + 0.25 ? 0.0001 + (0.17 - 0.0001) * ((tt - t) / 0.25)
      : tt < t + len ? 0.17 * (1 - (tt - t - 0.25) / (len - 0.25)) : 0.0001;
    const src = i < noise.length ? noise[i] : 0;
    const y = (b0 * src + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = src; y2 = y1; y1 = y;
    out[i] = y * env;
  }
  toWav('scream.wav', out);
}

// waterstep — squelch noise + low thud (ambWaterStep)
{
  const len = 0.35;
  const noise = new Float32Array(Math.floor(SR * len));
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
  const n = Math.floor(SR * 1.0);
  const out = new Float32Array(n);
  const f = 480 + Math.random() * 260;
  const w0 = (2 * Math.PI * f) / SR, alpha = Math.sin(w0) / 4.4, cosw = Math.cos(w0);
  const b0 = alpha, b1 = 0, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * cosw, a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const tt = t + i / SR;
    const env = tt < t + 0.02 ? 0.0001 * Math.pow(0.2 / 0.0001, (tt - t) / 0.02)
      : tt < t + len ? 0.2 * Math.pow(0.0001 / 0.2, (tt - t - 0.02) / (len - 0.02)) : 0.0001;
    const src = i < noise.length ? noise[i] : 0;
    const y = (b0 * src + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = src; y2 = y1; y1 = y;
    out[i] = y * env;
  }
  // low sine thud 80->45Hz
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const tt = t + i / SR;
    if (tt > t + 0.2) continue;
    const fr = 80 * Math.pow(45 / 80, (tt - t) / 0.15);
    phase += (2 * Math.PI * fr) / SR;
    const g = tt < t + 0.01 ? 0.0001 * Math.pow(0.14 / 0.0001, (tt - t) / 0.01)
      : tt < t + 0.18 ? 0.14 * Math.pow(0.0001 / 0.14, (tt - t - 0.01) / 0.17) : 0.0001;
    out[i] += g * Math.sin(phase);
  }
  toWav('waterstep.wav', out);
}

// squeak — two quick square beeps (ambSqueak)
{
  const voices = [];
  const mk = (at, f0, f1) => voices.push({
    type: 'square', t0: at, stop: at + 0.09,
    freqSegs: [
      { t: at, v: f0, mode: 'set' },
      { t: at + 0.06, v: f1, mode: 'exp' },
    ],
    gainSegs: [
      { t: at, v: 0.0001, mode: 'set' },
      { t: at + 0.01, v: 0.13, mode: 'exp' },
      { t: at + 0.07, v: 0.0001, mode: 'exp' },
    ],
  });
  mk(t, 1500 + Math.random() * 400, 2200);
  mk(t + 0.11, 1800, 1400);
  toWav('squeak.wav', render(0.8, voices));
}

// fart — low sawtooth pitch droop through swept lowpass (ambFart)
{
  const len = 0.75;
  const voices = [{
    type: 'sawtooth', t0: t, stop: t + 0.75,
    freqSegs: [
      { t, v: 85 + Math.random() * 30, mode: 'set' },
      { t: t + 0.5, v: 38, mode: 'exp' },
    ],
    gainSegs: [
      { t, v: 0.0001, mode: 'set' },
      { t: t + 0.05, v: 0.2, mode: 'linear' },
      { t: t + 0.7, v: 0.0001, mode: 'exp' },
    ],
  }];
  const raw = render(len, voices);
  const out = new Float32Array(raw.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < out.length; i++) {
    const tt = t + i / SR;
    const fr = 320 * Math.pow(90 / 320, Math.min(0.5, Math.max(0, (tt - t) / 0.5)));
    const w0 = (2 * Math.PI * fr) / SR, alpha = Math.sin(w0) / (2 * 0.707), cosw = Math.cos(w0);
    const b0 = (1 - cosw) / 2, b1 = 1 - cosw, b2 = b0, a0 = 1 + alpha, a1 = -2 * cosw, a2 = 1 - alpha;
    const y = (b0 * raw[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = raw[i]; y2 = y1; y1 = y;
    out[i] = y;
  }
  toWav('fart.wav', out);
}

// creak — slow door/beam groan (ambCreak)
toWav('creak.wav', render(1.6, [{
  type: 'sine', t0: t, stop: t + 1.25,
  freqSegs: [
    { t, v: 230 + Math.random() * 90, mode: 'set' },
    { t: t + 0.55, v: 110, mode: 'exp' },
    { t: t + 1.1, v: 260, mode: 'exp' },
  ],
  gainSegs: [
    { t, v: 0.0001, mode: 'set' },
    { t: t + 0.4, v: 0.13, mode: 'linear' },
    { t: t + 1.2, v: 0.0001, mode: 'linear' },
  ],
}]));

// drone — the 3-oscillator wind bed with LFO breathing (startDungeonAmbience)
{
  const voices = [];
  const add = (freq, vol, type) => {
    const lfoF = 0.05 + Math.random() * 0.06;
    voices.push({
      type, t0: 0, stop: 6,
      freqSegs: [{ t: 0, v: freq, mode: 'set' }],
      gainSegs: [
        { t: 0, v: 0.0001, mode: 'set' },
        { t: 4, v: vol, mode: 'linear' },
        { t: 6, v: vol, mode: 'linear' },
      ],
      lfo: { f: lfoF, depth: vol * 0.35 },
    });
  };
  add(52, 0.11, 'sine');
  add(52.7, 0.09, 'sine');
  add(104, 0.06, 'triangle');
  const n = Math.floor(SR * 6);
  const out = new Float32Array(n);
  for (const v of voices) {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / SR;
      phase += (2 * Math.PI * envValue(v.freqSegs, tt)) / SR;
      const env = envValue(v.gainSegs, tt);
      const g = Math.max(0, env + v.lfo.depth * Math.sin(2 * Math.PI * v.lfo.f * tt));
      const u = (phase % (2 * Math.PI)) / Math.PI;
      const wave = v.type === 'sine' ? Math.sin(phase)
        : v.type === 'triangle' ? (u < 1 ? 2 * u - 1 : 3 - 2 * u)
        : 2 * ((phase / (2 * Math.PI)) % 1) - 1;
      out[i] += g * wave;
    }
  }
  toWav('drone.wav', out);
}

console.log(`\nWrote ${OUT}`);
