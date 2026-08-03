#!/usr/bin/env python
# ─────────────────────────────────────────────────────────────
# Victory chime — a short "ta-da" for the Floor Complete screen.
# The player asked for a simple fanfare-tick, NOT a full victory
# track: two bright C-major stabs (classic da-DA!) with a bell
# shimmer and a quick sparkle arpeggio. ~2.6 s, one-shot.
#
# Reuses the additive-synthesis helpers from gen_music.py.
#
# Run:  python scripts/gen_chime.py
# ─────────────────────────────────────────────────────────────
import os
import numpy as np
from gen_music import SR, tone, pad, write_mp3  # same dir — helpers only

DUR = 3.2
t = np.arange(int(DUR * SR)) / SR
L = np.zeros_like(t); R = np.zeros_like(t)

C4, E4, G4, C5, E5, G5, C6, G6 = 261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5, 1568.0


def bell(mix, t, freq, at, vol):
    """bright struck-bell: fundamental + 2nd/3rd partials, fast attack, long decay"""
    tone(mix, t, freq, at, 2.2, vol, "sine", 0.006, 1.6)
    tone(mix, t, freq * 2.0, at, 1.4, vol * 0.28, "sine", 0.005, 1.0)
    tone(mix, t, freq * 3.01, at, 0.9, vol * 0.10, "sine", 0.004, 0.6)


# ── the two ta-da stabs ──
# "da"  — soft G4+G5 pickup
bell(L, t, G4, 0.00, 0.16); bell(R, t, G4, 0.00, 0.16)
bell(L, t, G5, 0.00, 0.10); bell(R, t, G5, 0.00, 0.10)
# "DA!" — full C-major hit, slightly wider on the right for shimmer
for f, v in [(C5, 0.30), (E5, 0.22), (G5, 0.26)]:
    bell(L, t, f, 0.38, v); bell(R, t, f * 1.0006, 0.38, v * 0.95)
bell(L, t, C6, 0.38, 0.14); bell(R, t, C6 * 1.001, 0.38, 0.14)

# ── sparkle arpeggio rides the decay: C6 → G5 → E5 → C6 ──
for i, f in enumerate([C6, G5, E5, C6]):
    bell(L, t, f, 0.62 + i * 0.11, 0.09)
    bell(R, t, f * 1.0008, 0.62 + i * 0.11, 0.08)

# ── soft pad swell under the DA! so it lands warm, not tinny ──
pad(L, t, [C4, E4, G4], 0.35, 1.9, 0.16, attack=0.02, release=1.2)
pad(R, t, [C4 * 1.0005, E4 * 1.0005, G4], 0.35, 1.9, 0.15, attack=0.02, release=1.2)

# tail fade so the loop-off end doesn't click
tail = 2.4 * SR
fade = np.linspace(1.0, 0.0, int((DUR * SR - tail))) ** 2
L[int(tail):] *= fade
R[int(tail):] *= fade

write_mp3(np.stack([L, R], axis=1), "music_victory")
print("wrote public/audio/music_victory.mp3 (ta-da chime)")
