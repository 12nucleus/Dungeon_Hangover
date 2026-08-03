#!/usr/bin/env python
# ─────────────────────────────────────────────────────────────
# Dungeon Hangover music composer — writes the three gameplay
# tracks to public/audio/:
#
#   music_ambient.mp3  — the sewer cellar: slow Am lament, pads,
#                        bass, sparse melody w/ echo, tolling bell,
#                        soft heartbeat drum, wind. 128s seamless-ish.
#   music_combat.mp3   — encounter theme: D-minor, driving 140 BPM,
#                        kick/snare/hats, power-chord stabs, riff.
#                        64s loop.
#   music_victory.mp3  — floor cleared: C-major brass-ish fanfare,
#                        rolling toms, warm pad. 48s loop.
#
# Everything is additive-synthesized with numpy/scipy (no samples,
# no model, no ffmpeg). These are original compositions, not clips.
#
# Run:  python scripts/gen_music.py
# ─────────────────────────────────────────────────────────────
import os, subprocess
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), "..")
AUDIO = os.path.join(ROOT, "public", "audio")
SR = 44100

# ── synthesis helpers ────────────────────────────────────────
def env(n, at, dur, attack=0.2, release=0.4):
    """amplitude envelope over the sample window n (0..dur)"""
    a = min(at, attack)
    e = np.ones_like(n)
    if attack > 0:
        e *= np.clip(n / attack, 0, 1)
    if release > 0:
        tail = dur - release
        e *= np.clip((dur - n) / release, 0, 1) ** 1.5 if tail > 0 else 1
    return e

def osc(freq, n, kind="sine", detune=0.0):
    ph = 2 * np.pi * (freq * (1 + detune)) * n
    if kind == "sine":
        return np.sin(ph)
    if kind == "tri":
        return 2 / np.pi * np.arcsin(np.sin(ph))
    if kind == "saw":
        return 2 * ((freq * n) % 1) - 1
    if kind == "square":
        return np.sign(np.sin(ph))
    return np.sin(ph)

def mix_add(mix, t, at, dur, signal):
    i0, i1 = int(at * SR), min(int((at + dur) * SR), len(t))
    if i1 <= i0:
        return
    n = t[i0:i1] - at
    mix[i0:i1] += signal[:i1 - i0]

def tone(mix, t, freq, at, dur, vol, kind="sine", attack=0.2, release=0.4, detune=0.0):
    i0, i1 = int(at * SR), min(int((at + dur) * SR), len(t))
    if i1 <= i0:
        return
    n = t[i0:i1] - at
    sig = osc(freq, n, kind, detune) * env(n, at, dur, attack, release)
    mix[i0:i1] += vol * sig

def pad(mix, t, freqs, at, dur, vol, attack=1.6, release=2.0):
    """warm detuned pad chord (sine + triangle blend)"""
    for f in freqs:
        tone(mix, t, f, at, dur, vol * 0.5, "sine", attack, release, detune=0.004)
        tone(mix, t, f, at, dur, vol * 0.35, "tri", attack, release, detune=-0.003)
        tone(mix, t, f * 2.0, at, dur, vol * 0.12, "sine", attack, release)

def kick(mix, t, at, vol=0.9, dur=0.35):
    i0, i1 = int(at * SR), min(int((at + dur) * SR), len(t))
    if i1 <= i0:
        return
    n = t[i0:i1] - at
    f = 150 * np.exp(-6.0 * n) + 45
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-7.0 * n)
    mix[i0:i1] += vol * sig

def snare(mix, t, at, vol=0.5, dur=0.18):
    i0, i1 = int(at * SR), min(int((at + dur) * SR), len(t))
    if i1 <= i0:
        return
    n = t[i0:i1] - at
    rnd = np.random.default_rng(int(at * 1000)).standard_normal(i1 - i0)
    noise = rnd * np.exp(-25.0 * n)
    body = np.sin(2 * np.pi * 190 * n) * np.exp(-35.0 * n)
    mix[i0:i1] += vol * (noise + body)

def hat(mix, t, at, vol=0.18, dur=0.06):
    i0, i1 = int(at * SR), min(int((at + dur) * SR), len(t))
    if i1 <= i0:
        return
    n = t[i0:i1] - at
    rnd = np.random.default_rng(int(at * 700)).standard_normal(i1 - i0)
    mix[i0:i1] += vol * rnd * np.exp(-60.0 * n)

def echo(sig, t, delay_s=0.32, fb=0.35, taps=5):
    """simple feedback delay, returns a copy (len-preserving, wraps)"""
    out = np.zeros_like(sig)
    d = int(delay_s * SR)
    for k in range(1, taps + 1):
        off = k * d
        if off >= len(sig):
            break
        out[off:] += sig[:-off] * (fb ** k)
    return out

def soft_clip(x, ceiling=0.9):
    return ceiling * np.tanh(x / ceiling)

def write_mp3(stereo, name):
    audio = np.clip(soft_clip(stereo), -1, 1)
    peak = np.max(np.abs(audio)) + 1e-9
    audio = audio / peak * 0.89
    pcm = (audio * 32767).astype(np.int16)
    tmp = os.path.join(AUDIO, name + ".wav")
    import scipy.io.wavfile as wavfile
    wavfile.write(tmp, SR, pcm)
    out = os.path.join(AUDIO, name + ".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp,
                    "-codec:a", "libmp3lame", "-qscale:a", "3", out], check=True)
    os.remove(tmp)
    print(f"wrote {name}.mp3")

# ── AMBIENT — the sewer cellar (A-minor lament, ~70 BPM) ──────
def ambient(seconds=128.0):
    t = np.arange(int(seconds * SR)) / SR
    L = np.zeros_like(t); R = np.zeros_like(t)
    m = np.zeros_like(t)
    A2, E2, F2, G2 = 110.0, 82.41, 87.31, 98.0
    A3, C4, E4, F4, G4, D4 = 220.0, 261.63, 329.63, 349.23, 392.0, 293.66
    CYCLE = 32.0  # 8 s per chord × 4 chords

    def chord(at, root, third, fifth, vol):
        pad(m, t, [root, third, fifth, root * 2], at, 8.4, vol)

    chords = [
        (A2, C4, E4, 0.22),      # Am
        (F2, A3, C4, 0.19),      # F
        (C4 // 1 if False else G2, E4, G4, 0.18),  # G (root G2)
        (E2, G4, D4, 0.17),      # Em-ish (E2 G D) → leading tension
    ]
    # rebuild cleanly (the tuple hack above is ugly — do it properly)
    chords = [(A2, C4, E4, 0.22), (F2, A3, C4, 0.19), (G2, E4, G4, 0.18), (E2, G4, D4, 0.17)]

    # pads: wide in stereo (detuned L/R), center in the mono bus
    for ci in range(int(seconds / CYCLE)):
        at = ci * CYCLE
        root, third, fifth, vol = chords[ci % 4]
        for i, f in enumerate([root, third, fifth]):
            tone(L, t, f, at, 8.6, vol * 0.55, "sine", 1.8, 2.2, detune=0.006 + i * 0.002)
            tone(R, t, f, at, 8.6, vol * 0.55, "tri", 1.8, 2.2, detune=-0.006 - i * 0.002)
        # bass — root an octave down, slow
        tone(m, t, root / 2, at + 0.2, 7.6, vol * 0.5, "sine", 1.0, 1.6)

    # melody: sparse A-minor motif with echo (phrasing over the cycle)
    motif = [A4 := 440.0, 0, C5 := 523.25, 0, D5 := 587.33, 0, C5, 0,
             A4, 0, G4 := 392.0, 0, E4, 0, C5, 0]
    mel = np.zeros_like(t)
    step = 2.0
    for ci in range(int(seconds / CYCLE)):
        at0 = ci * CYCLE + 4.0
        for k, f in enumerate(motif):
            if f:
                tone(mel, t, f, at0 + k * step, 1.9, 0.055, "tri", 0.3, 1.2)
    m += echo(mel, t, 0.42, 0.32)

    # tolling bell every 12 s
    for b in range(0, int(seconds), 12):
        for k, v in ((1, 1.0), (2.01, 0.45), (2.99, 0.22), (4.03, 0.12)):
            tone(m, t, 65.41 * k, b + 0.3, 7.0, 0.05 * v, "sine", 0.05, 5.5)

    # heartbeat drum: soft thump on beat 1 and the "and" of 2, every 2 s
    for b in range(0, int(seconds), 2):
        kick(m, t, b, 0.16, 0.3)
        kick(m, t, b + 1.0, 0.10, 0.25)

    # wind: slow filtered noise, very quiet, wide
    rng = np.random.default_rng(99)
    noise = rng.standard_normal(len(t))
    # one-pole lowpass-ish via moving average (cheap)
    k = np.ones(256) / 256
    wind = np.convolve(noise, k, mode="same") * 0.02
    L += wind; R += np.roll(wind, int(0.03 * SR))

    # gentle crossfade at the loop seam (last 4 s fades into the first 4 s)
    fade = 4.0
    fi = int(fade * SR)
    ramp = np.linspace(0, 1, fi)
    for bus in (L, R, m):
        bus[:fi] *= ramp
        bus[-fi:] *= ramp[::-1]

    stereo = np.stack([L + m * 0.6, R + m * 0.6], axis=1)
    return stereo

# ── COMBAT — encounter theme (D-minor, 140 BPM, driving) ──────
def combat(seconds=64.0):
    t = np.arange(int(seconds * SR)) / SR
    L = np.zeros_like(t); R = np.zeros_like(t); m = np.zeros_like(t)
    spb = 60.0 / 140.0 / 2  # 8th notes
    D2, A2, C3, G2 = 73.42, 110.0, 130.81, 98.0
    D3, F3, A3, C4, G3, Bb2 = 146.83, 174.61, 220.0, 261.63, 196.0, 116.54

    beats = int(seconds / spb)
    # drums
    for b in range(beats):
        bt = b * spb
        if b % 4 == 0:
            kick(m, t, bt, 0.95)
        elif b % 4 == 2:
            kick(m, t, bt, 0.7)
        if b % 4 == 1 or b % 4 == 3:
            snare(m, t, bt, 0.42)
        if b % 2 == 1:
            hat(m, t, bt, 0.16)
        if b % 8 == 7:
            kick(m, t, bt + spb * 0.5, 0.5)
            hat(m, t, bt + spb * 0.5, 0.2)

    # bass: driving 8ths — D2 pedal with an octave hop
    bass_line = [D2, D2, A2, D2, D2, D2, G2, A2]
    for b in range(beats):
        f = bass_line[b % 8]
        tone(m, t, f, b * spb, spb * 0.85, 0.34, "square", 0.01, spb * 0.3)

    # power-chord stabs: D5 – Bb4 – F4 – G4 over 4 bars (16 8ths each)
    prog = [(D3, A3), (Bb2, F3), (F3, C4), (G2, D3)]
    for b in range(beats):
        bar = (b // 8) % 4
        root, fifth = prog[bar]
        if b % 8 in (0, 2, 4, 6):
            tone(L, t, root, b * spb, spb * 1.6, 0.30, "saw", 0.01, spb * 0.7)
            tone(R, t, fifth, b * spb, spb * 1.6, 0.26, "saw", 0.01, spb * 0.7)
            tone(m, t, root * 2, b * spb, spb * 1.2, 0.16, "square", 0.01, spb * 0.5)

    # riff: tense D-minor line on top, octave up, with echo
    riff = [D4 := 293.66, 0, F4 := 349.23, D4, A3 := 220.0, 0, C4 := 261.63, A3]
    mel = np.zeros_like(t)
    for b in range(beats):
        f = riff[b % 8]
        if f:
            tone(mel, t, f, b * spb, spb * 0.9, 0.075, "tri", 0.02, spb * 0.5)
    m += echo(mel, t, spb * 1.5, 0.3)

    # fade edges for a clean loop
    fade = 1.5
    fi = int(fade * SR)
    ramp = np.linspace(0, 1, fi)
    for bus in (L, R, m):
        bus[:fi] *= ramp
        bus[-fi:] *= ramp[::-1]
    return np.stack([L + m * 0.7, R + m * 0.7], axis=1)

# ── VICTORY — floor cleared (C-major fanfare) ────────────────
def victory(seconds=48.0):
    t = np.arange(int(seconds * SR)) / SR
    L = np.zeros_like(t); R = np.zeros_like(t); m = np.zeros_like(t)
    C4, E4, G4, C5, D5, A4, F4 = 261.63, 329.63, 392.0, 523.25, 587.33, 440.0, 349.23
    C3, G3, A3, F3 = 130.81, 196.0, 220.0, 174.61

    # warm pad bed: C – G – Am – F, 6 s each, 4 cycles = 48 s
    prog = [(C3, E4, G4), (G3, D5, G4), (A3, C5, E4), (F3, A3, C5)]
    for ci in range(4):
        at = ci * 12.0
        root, third, fifth = prog[ci % 4]
        pad(m, t, [root, third, fifth], at, 11.5, 0.18)
        pad(m, t, [root, third, fifth], at + 6.0, 5.5, 0.15)

    # fanfare melody: C-E-G-C' — D-E-F-G — A-G-E-C' (classic rising)
    fan = [C4, E4, G4, C5, 0, D5, C5, G4, 0, E4, G4, A4, G4, E4, C5, 0]
    step = 0.5
    for k, f in enumerate(fan):
        if f:
            tone(m, t, f, 2.0 + k * step, 1.1, 0.10, "tri", 0.05, 0.6)
            tone(m, t, f * 2, 2.0 + k * step, 0.7, 0.035, "sine", 0.05, 0.5)
    # second statement at the end
    for k, f in enumerate(fan):
        if f:
            tone(m, t, f, 26.0 + k * step, 1.1, 0.11, "tri", 0.05, 0.6)

    # rolling toms + a final crash
    for b in range(0, 44, 2):
        kick(m, t, b, 0.4, 0.3)
        if b % 8 == 6:
            kick(m, t, b, 0.55, 0.35)
            snare(m, t, b + 1.0, 0.3, 0.2)
    snare(m, t, 44.0, 0.5, 0.4)

    fade = 3.0
    fi = int(fade * SR)
    ramp = np.linspace(0, 1, fi)
    for bus in (L, R, m):
        bus[:fi] *= ramp
        bus[-fi:] *= ramp[::-1]
    return np.stack([L + m * 0.65, R + m * 0.65], axis=1)

if __name__ == "__main__":
    os.makedirs(AUDIO, exist_ok=True)
    write_mp3(ambient(), "music_ambient")
    write_mp3(combat(), "music_combat")
    write_mp3(victory(), "music_victory")
    print("DONE")
