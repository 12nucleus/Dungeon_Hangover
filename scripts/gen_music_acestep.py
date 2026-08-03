#!/usr/bin/env python
# ─────────────────────────────────────────────────────────────
# Dungeon Hangover music — generated with ACE-Step 1.5
# (https://github.com/ace-step/ACE-Step-1.5), the open-source
# text-to-music model, running in the `ace_step` conda env.
#
# Produces the three gameplay tracks in public/audio/:
#   music_ambient.mp3   — dark dungeon ambience (60 s, Am, 70 BPM)
#   music_combat.mp3    — battle theme            (60 s, Dm, 140 BPM)
#   music_victory.mp3   — victory fanfare         (48 s, C,  120 BPM)
#
# Run (from the ace_step env):
#   python scripts/gen_music_acestep.py
# ─────────────────────────────────────────────────────────────
import os
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
        "caption": (
            "Slow dark fantasy dungeon ambience. Deep droning strings and low organ pads, "
            "a distant tolling bell, sparse lonely piano notes, eerie wind through stone corridors. "
            "Ominous, atmospheric, cavernous, mysterious. Instrumental, 70 BPM, A minor, 4/4."
        ),
        "duration": 60, "bpm": 70, "keyscale": "Am", "seed": 101,
    },
    {
        "name": "music_combat",
        "caption": (
            "Dark fantasy battle music. Driving war drums and heavy percussion, tense orchestral strings, "
            "powerful brass stabs, urgent low ostinato, relentless energy. "
            "Epic, aggressive, intense. Instrumental, 140 BPM, D minor, 4/4."
        ),
        "duration": 60, "bpm": 140, "keyscale": "Dm", "seed": 202,
    },
    {
        "name": "music_victory",
        "caption": (
            "Triumphant fantasy victory fanfare. Heroic brass and warm full strings, rolling timpani, "
            "bright and uplifting finale. Epic, celebratory, majestic. "
            "Instrumental, 120 BPM, C major, 4/4."
        ),
        "duration": 48, "bpm": 120, "keyscale": "C", "seed": 303,
    },
]


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
        print(f"\n=== Generating {tr['name']} ({tr['duration']}s, {tr['bpm']} BPM, {tr['keyscale']}) ===")
        params = GenerationParams(
            task_type="text2music",
            caption=tr["caption"],
            lyrics="[Instrumental]",
            instrumental=True,
            bpm=tr["bpm"],
            keyscale=tr["keyscale"],
            timesignature="4",
            duration=float(tr["duration"]),
            inference_steps=8,
            seed=tr["seed"],
            thinking=True,
            use_constrained_decoding=True,
        )
        config = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[tr["seed"]], audio_format="wav")
        out_dir = os.path.join(ROOT, "scripts", "acestep_out")
        os.makedirs(out_dir, exist_ok=True)
        result = generate_music(dit, llm, params, config, save_dir=out_dir)
        print("result:", result)

        # find the produced wav
        wavs = [f for f in os.listdir(out_dir) if f.endswith(".wav") and not f.startswith(".")]
        wavs.sort(key=lambda f: os.path.getmtime(os.path.join(out_dir, f)), reverse=True)
        if not wavs:
            print("no wav produced!")
            continue
        wav = os.path.join(out_dir, wavs[0])
        mp3 = os.path.join(AUDIO, tr["name"] + ".mp3")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", wav,
             "-codec:a", "libmp3lame", "-qscale:a", "3", mp3],
            check=True,
        )
        print(f"wrote {mp3}")

    print("\nDONE")


if __name__ == "__main__":
    main()
