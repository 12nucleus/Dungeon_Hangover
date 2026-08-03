#!/usr/bin/env python
# ─────────────────────────────────────────────────────────────
# Dungeon Hangover — designed character voices (Qwen3-TTS Voice Design)
#
# Every dungeon NPC/boss gets a UNIQUE voice, designed from a natural-
# language description with the Qwen3-TTS-12Hz-1.7B-VoiceDesign model,
# then synthesized with the "Voice Design then Clone" workflow:
#
#   1. VoiceDesign model speaks a canonical sample line in the
#      designed voice  →  Voice_sample_for_tts_cloning/<id>.mp3
#      (kept for later reuse of the same character)
#   2. Base model clones that sample (speaker embedding + ref text)
#      and speaks ALL of the character's dialogue lines with it.
#
# Character manifest: scripts/voices_manifest.json — instruct text +
# sample line + sample file per character, so voices can be re-designed
# or re-synthesized later without losing continuity.
#
# Output: public/audio/npc/<npcId>_<nodeId>.mp3 (per-character voices).
# Narrator captions (_cap.mp3) stay in the narrator's voice (untouched).
#
# Run:  python scripts/gen_voice_design.py          # missing lines only
#       python scripts/gen_voice_design.py --force  # regenerate everything
# ─────────────────────────────────────────────────────────────
import argparse, gc, json, os, subprocess, tempfile
import torch, soundfile as sf
from qwen_tts import Qwen3TTSModel

from gen_tts_floor50 import lines_from_npc, to_mp3

ROOT = os.path.join(os.path.dirname(__file__), "..")
NPC_OUT = os.path.join(ROOT, "public", "audio", "npc")
SAMPLES = os.path.join(ROOT, "Voice_sample_for_tts_cloning")
MANIFEST = os.path.join(os.path.dirname(__file__), "voices_manifest.json")
os.makedirs(NPC_OUT, exist_ok=True)
os.makedirs(SAMPLES, exist_ok=True)

DEVICE = "cuda:0"
DTYPE = torch.bfloat16
DESIGN_DIR = r"F:\qwen3tts\Qwen3-TTS-12Hz-1.7B-VoiceDesign"
BASE_DIR = r"F:\qwen3tts\Qwen3-TTS-12Hz-1.7B-Base"

# ── canonical sample lines (in-character; also the clone ref text) ──
CHARACTERS = {
    "hermit": {
        "instruct": (
            "Male senior in his seventies, warm weathered voice with a cheerful "
            "lilt, slightly cracked and husky, gentle and playful, speaks with a "
            "knowing smile, unhurried pace."
        ),
        "sample_text": "Ah, you're awake! I was starting to think you'd sleep through the apocalypse. Again.",
    },
    "other_hermit": {
        "instruct": (
            "Male senior in his seventies, flat gruff monotone, low and blunt, "
            "tired and world-weary, no warmth in the voice, clipped sentences, "
            "speaks like he has given up on being liked."
        ),
        "sample_text": "You found me. Good. Or bad. Depends on which Hermit you've been talking to.",
    },
    "scrag": {
        "instruct": (
            "Small wiry goblin guard, raspy reedy voice, bored and grumpy, "
            "slightly nasal with a wheeze, talks in short dismissive bursts, "
            "a tired underpaid soldier who has seen it all."
        ),
        "sample_text": "Halt. State your business. Soap. The King wants soap. Everyone wants soap.",
    },
    "gribnab": {
        "instruct": (
            "Adult male goblin king, deep gravelly voice with a growling edge, "
            "booming and commanding, slightly slimy and menacing, speaks slowly "
            "with theatrical menace, every word dripping with smug authority. "
            "Definitely masculine, never high-pitched or childlike."
        ),
        "sample_text": "I am Gribnab, King of the Goblins, Lord of the Bath, Sovereign of Suds!",
    },
    "baron_gnaw": {
        "instruct": (
            "Enormous monstrous rat, deep guttural growl, snarling and menacing, "
            "low rumbling gravel with a wet hiss, each word a threat."
        ),
        "sample_text": "The finger is mine. The ring is mine. Everything is mine.",
    },
}


def load_manifest() -> dict:
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_manifest(entry: dict):
    manifest = load_manifest()
    manifest.update(entry)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    # ── what lines exist per character ──
    npc_lines = lines_from_npc()   # npc:<id>:<node>[:cap]
    by_char: dict[str, list[tuple[str, str]]] = {}
    for oid, text in npc_lines.items():
        if oid.endswith(":cap"):
            continue  # captions stay narrator-voiced
        _, cid, node = oid.split(":", 2)
        by_char.setdefault(cid, []).append((node, text))
    # boss rat cutscene line (not in npc.ts — the rat's one spoken caption)
    by_char.setdefault("baron_gnaw", []).append(
        ("claims", "BARON GNAW claims the finger. The finger is his. The ring is his. EVERYTHING IS HIS."))

    # ══ PHASE A: design one voice sample per character (VoiceDesign model) ══
    design_model = None
    for cid, cfg in CHARACTERS.items():
        sample_path = os.path.join(SAMPLES, f"{cid}.mp3")
        need_sample = args.force or not os.path.exists(sample_path)
        print(f"\n=== {cid}: sample {'needed' if need_sample else 'cached'} ===")
        if need_sample:
            if design_model is None:
                print("loading VoiceDesign 1.7B ...")
                design_model = Qwen3TTSModel.from_pretrained(
                    DESIGN_DIR, device_map=DEVICE, dtype=DTYPE, attn_implementation="sdpa")
            print(f"designing {cid}: {cfg['instruct'][:70]}...")
            wavs, sr = design_model.generate_voice_design(
                text=cfg["sample_text"],
                language="English",
                instruct=cfg["instruct"],
                do_sample=True,
            )
            with tempfile.TemporaryDirectory() as td:
                tmp = os.path.join(td, f"{cid}.wav")
                sf.write(tmp, wavs[0], sr)
                to_mp3(tmp, sample_path)
            print("  wrote", sample_path)
        save_manifest({cid: {"sample": os.path.relpath(sample_path, ROOT).replace("\\", "/"),
                             "sample_text": cfg["sample_text"], "instruct": cfg["instruct"]}})
    # the two 1.7B models can't share 12 GB VRAM — free the designer before cloning
    del design_model
    gc.collect()
    torch.cuda.empty_cache()

    # ══ PHASE B: clone each sample and speak every line (Base model) ══
    base = None
    for cid, cfg in CHARACTERS.items():
        sample_path = os.path.join(SAMPLES, f"{cid}.mp3")
        lines = by_char.get(cid, [])
        missing = [(n, t) for n, t in lines
                   if args.force or not os.path.exists(os.path.join(NPC_OUT, f"{cid}_{n}.mp3"))]
        print(f"\n=== {cid}: {len(lines)} lines, {len(missing)} to generate ===")
        if not missing:
            continue
        if base is None:
            print("loading 1.7B Base (clone) ...")
            base = Qwen3TTSModel.from_pretrained(
                BASE_DIR, device_map=DEVICE, dtype=DTYPE, attn_implementation="sdpa")
        prompt = base.create_voice_clone_prompt(
            ref_audio=sample_path,
            ref_text=cfg["sample_text"],
            x_vector_only_mode=False,
        )
        ids = [n for n, _ in missing]
        texts = [t for _, t in missing]
        CHUNK = 2  # small batches — long lines + 12 GB VRAM don't mix
        with tempfile.TemporaryDirectory() as td:
            for start in range(0, len(ids), CHUNK):
                cids = ids[start:start + CHUNK]
                ctexts = texts[start:start + CHUNK]
                print(f"  synth {cid} {cids[0]}…{cids[-1]} ({start + 1}-{min(start + CHUNK, len(ids))}/{len(ids)})")
                try:
                    wavs, sr = base.generate_voice_clone(
                        text=ctexts,
                        language=["English"] * len(cids),
                        voice_clone_prompt=prompt * len(cids),
                        do_sample=True,
                    )
                    for fid, wav in zip(cids, wavs):
                        tmp = os.path.join(td, f"{cid}_{fid}.wav")
                        sf.write(tmp, wav, sr)
                        to_mp3(tmp, os.path.join(NPC_OUT, f"{cid}_{fid}.mp3"))
                        print("  wrote", f"{cid}_{fid}.mp3")
                except Exception as e:
                    print("  FAIL", cids, "->", repr(e))

    print("\nDONE")


if __name__ == "__main__":
    main()
