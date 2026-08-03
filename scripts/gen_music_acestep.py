#!/usr/bin/env python
# ─────────────────────────────────────────────────────────────
# Dungeon Hangover music — generated with ACE-Step 1.5
# (https://github.com/ace-step/ACE-Step-1.5), the open-source
# text-to-music model, running in the `ace_step` conda env.
#
# Produces the three gameplay tracks in public/audio/:
#   music_ambient.mp3   — dark dungeon ambience (180 s, Am, 70 BPM)
#   music_combat.mp3    — battle theme            (120 s, Dm, 140 BPM)
#   music_victory.mp3   — victory fanfare         ( 90 s, C,  120 BPM)
#
# Each track is generated as 2 candidates (different seeds); the one
# with the stronger full-mix profile (RMS energy x spectral movement,
# measured with ffmpeg astats) is kept. Tracks get a 1.6 s silence
# tail so the WebAudio loop breathes instead of clipping mid-note.
#
# Run (from the ace_step env):
#   python scripts/gen_music_acestep.py
# ─────────────────────────────────────────────────────────────
import os
import re
import sys
import subprocess

ACE_STEP = r"G:\My_dev_folder\ace-step\ACE-Step\ACE-Step-1.5"
sys.path.insert(0, ACE_STEP)

from acestep.handler import AceStepHandler            # noqa: E402
from acestep.llm_inference import LLMHandler          # noqa: E402
from acestep.inference import generate_music, GenerationParams, GenerationConfig  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
AUDIO = os.path.join(ROOT, "public", "audio")
os.makedirs(AUDIO, exist_ok=True)

TRACKS = [
    {
        "name": "music_ambient",
        "captions": [
            (
                "Dark fantasy dungeon ambience. Slow, cavernous and atmospheric: deep droning "
                "strings and low church-organ pads, a distant tolling bell, sparse lonely piano "
                "notes, eerie wind whistling through stone corridors, subtle dripping water. "
                "Ominous, mysterious, ancient. Sparse texture, wide reverb, moderate dynamics. "
                "Instrumental. 70 BPM, A minor, 4/4."
            ),
            (
                "Eerie medieval dungeon atmosphere. Low cello drone, soft pipe-organ swells, "
                "muted choir humming, faint music-box motif, distant rumble and wind. Very "
                "slow and spacious, mysterious, somber, unsettling. Ambient texture with long "
                "decays. Instrumental. 66 BPM, D minor, 4/4."
            ),
        ],
        "duration": 180, "bpm": 70, "keyscale": "Am", "seeds": [101, 411],
    },
    {
        "name": "music_combat",
        "captions": [
            (
                "Epic dark fantasy battle theme. Driving war drums and heavy taiko percussion, "
                "tense staccato orchestral strings, powerful brass stabs, urgent low bass ostinato, "
                "crashing cymbals, relentless forward energy. Aggressive, intense, adrenaline. "
                "Full orchestral texture, wide dynamic range. Instrumental. 140 BPM, D minor, 4/4."
            ),
            (
                "Intense fantasy boss fight music. Fast ostinato strings, pounding battle drums, "
                "piercing horns, dark choir shouts, electric bass pulse, building to massive hits. "
                "Fierce, urgent, cinematic. Dense modern orchestral hybrid texture. "
                "Instrumental. 150 BPM, E minor, 4/4."
            ),
        ],
        "duration": 120, "bpm": 140, "keyscale": "Dm", "seeds": [202, 522],
    },
    {
        "name": "music_victory",
        "captions": [
            (
                "Triumphant fantasy victory fanfare. Heroic French horns and bright trumpets, "
                "warm full string section, rolling timpani, glockenspiel sparkle, big uplifting "
                "finale chords. Celebratory, majestic, joyful. Rich orchestral texture with a "
                "clear melody. Instrumental. 120 BPM, C major, 4/4."
            ),
            (
                "Grand tavern-worthy victory theme. Swaggering folk horns, dancing fiddle, "
                "plucked mandolin, thumping drums, cheerful accordion, celebratory choir. "
                "Bold, warm, triumphant tavern anthem. Instrumental. 130 BPM, C major, 4/4."
            ),
        ],
        "duration": 90, "bpm": 120, "keyscale": "C", "seeds": [303, 633],
    },
]

OUT_DIR = os.path.join(ROOT, "scripts", "acestep_out")
os.makedirs(OUT_DIR, exist_ok=True)


def score_wav(path: str) -> float:
    """Heuristic mix-quality score: RMS energy x spectral movement.

    Fuller, more varied mixes score higher; thin or static output scores low.
    """
    try:
        out = subprocess.run(
            ["ffmpeg", "-i", path, "-af", "astats=metadata=1:reset=0", "-f", "null", "-"],
            capture_output=True, text=True,
        ).stderr
        rms = re.findall(r"RMS level dB\s*:\s*(-?[\d.]+)", out)
        flat = re.findall(r"Spectral flatness\s*:\s*([\d.]+)", out)
        if not rms:
            return 0.0
        rms_lin = sum(10 ** (float(r) / 20) for r in rms) / len(rms)
        flatness = sum(float(f) for f in flat) / len(flat) if flat else 0.0
        # spectral flatness 0=tonal, 1=noise; music sits in the middle band
        tonal_ok = 1.0 - abs(flatness - 0.35) / 0.35
        return rms_lin * (0.4 + 0.6 * max(0.0, tonal_ok))
    except Exception:
        return 0.0


def main():
    print("Initializing DiT handler (acestep-v15-turbo) ...")
    dit = AceStepHandler()
    status, ok = dit.initialize_service(
        project_root=ACE_STEP,
        config_path="acestep-v15-turbo",
        device="auto",
        use_flash_attention=False,
        compile_model=False,
        offload_to_cpu=True,
        offload_dit_to_cpu=True,
    )
    if not ok:
        print("DiT init failed:", status)
        sys.exit(1)
    print("DiT ready.")

    print("Initializing 5Hz LM (acestep-5Hz-lm-1.7B, pt backend) ...")
    llm = LLMHandler()
    lm_status, lm_ok = llm.initialize(
        checkpoint_dir=os.path.join(ACE_STEP, "checkpoints"),
        lm_model_path="acestep-5Hz-lm-1.7B",
        backend="pt",
        device="auto",
        offload_to_cpu=True,
    )
    if not lm_ok:
        print("LM init failed:", lm_status)
        sys.exit(1)
    print("LM ready.")

    for tr in TRACKS:
        best_wav, best_score = None, -1.0
        print(f"\n=== {tr['name']} ({tr['duration']}s, {tr['bpm']} BPM, {tr['keyscale']}) ===")
        for i, (caption, seed) in enumerate(zip(tr["captions"], tr["seeds"])):
            print(f"--- candidate {i + 1}/{len(tr['captions'])} (seed {seed}) ---")
            params = GenerationParams(
                task_type="text2music",
                caption=caption,
                lyrics="[Instrumental]",
                instrumental=True,
                bpm=tr["bpm"],
                keyscale=tr["keyscale"],
                timesignature="4",
                duration=float(tr["duration"]),
                inference_steps=8,
                seed=seed,
                thinking=True,
                use_constrained_decoding=True,
            )
            config = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[seed], audio_format="wav")
            result = generate_music(dit, llm, params, config, save_dir=OUT_DIR)
            print("result:", result)

            wavs = [f for f in os.listdir(OUT_DIR) if f.endswith(".wav") and not f.startswith(".")]
            wavs.sort(key=lambda f: os.path.getmtime(os.path.join(OUT_DIR, f)), reverse=True)
            if not wavs:
                print("no wav produced!")
                continue
            wav = os.path.join(OUT_DIR, wavs[0])
            score = score_wav(wav)
            print(f"candidate score: {score:.4f}")
            if score > best_score:
                best_wav, best_score = wav, score

        if not best_wav:
            print(f"!! {tr['name']}: all candidates failed")
            continue
        mp3 = os.path.join(AUDIO, tr["name"] + ".mp3")
        # 1.6 s silence tail so the WebAudio loop doesn't clip the last note
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", best_wav,
             "-af", "apad=pad_dur=1.6",
             "-codec:a", "libmp3lame", "-qscale:a", "3", mp3],
            check=True,
        )
        print(f"wrote {mp3} (score {best_score:.4f})")

    print("\nDONE")


if __name__ == "__main__":
    main()
