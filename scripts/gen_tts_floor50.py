#!/usr/bin/env python
# ─────────────────────────────────────────────────────────────
# Floor 50 narrator voice-over — generates the FULL sewer-cellar
# narration set with the narrator's cloned voice:
#   • the 25 room-entry lines      (f50_room_r1 … f50_room_r25)
#   • every interactable narration (f50_puddle, f50_altar, …)
#   • the ambush / patrol lines     (f50_ambush, f50_patrol)
#   • the bonfire + starting-bag lines (f50_bonfire, f50_sack)
#   • the sobriety level-up lines   (sober_2 … sober_6)
#   • the CHANGED intro lines       (narr_wake, narr_premise,
#                                    narr_premise_2, narr_floor)
#
# Line texts are extracted VERBATIM from the game sources so the audio
# always matches the subtitles (the old gen_tts.py hard-coded the
# pre-floor-50 intro text).
#
# Run:  python scripts/gen_tts_floor50.py          # missing + changed only
#       python scripts/gen_tts_floor50.py --force  # regenerate everything
# ─────────────────────────────────────────────────────────────
import argparse, os, re, subprocess, tempfile
import torch, soundfile as sf
from qwen_tts import Qwen3TTSModel

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "public", "audio", "narration")
SAMPLES = os.path.join(ROOT, "Voice_sample_for_tts_cloning")
os.makedirs(OUT, exist_ok=True)

BASE_DIR = r"F:\qwen3tts\Qwen3-TTS-12Hz-1.7B-Base"
DEVICE = "cuda:0"
DTYPE = torch.bfloat16

# ids whose mp3 exists but carries the OLD (pre-floor-50) text → always regen
CHANGED = {"narr_wake", "narr_premise", "narr_premise_2", "narr_floor"}


def unescape(s: str) -> str:
    """TS single/double-quoted string → real text (handle \\' escapes)."""
    return re.sub(r"\\(.)", r"\1", s)


def extract(path: str, id_pat: str) -> dict[str, str]:
    """Match `call(<id>, <text>, …)` with either single- or double-quoted
    text (TS authors mix both). Escaped quotes inside are handled by the
    `\\.` alternation."""
    out: dict[str, str] = {}
    with open(path, encoding="utf-8") as f:
        src = f.read()
    for q in ("'", '"'):
        pat = id_pat + rf"\s*{re.escape(q)}((?:[^{q}\\\\]|\\.)*){re.escape(q)}\s*"
        for m in re.finditer(pat, src, re.MULTILINE):
            out[m.group(1)] = unescape(m.group(2))
    return out


def lines_from_sources() -> dict[str, str]:
    lines: dict[str, str] = {}
    narrate = r"narrate\(['\"]([a-z0-9_]+)['\"]\s*,"
    narr_help = r"narr\(['\"]([a-z0-9_]+)['\"]\s*,"

    # interactables + room narration (mixing single/double quotes)
    content = os.path.join(ROOT, "src", "levels", "floor50Content.ts")
    lines.update(extract(content, narrate))
    lines.update(extract(content, narr_help))
    with open(content, encoding="utf-8") as f:
        src = f.read()
    for q in ("'", '"'):
        pat = rf"^\s*r(\d+): {re.escape(q)}((?:[^{q}\\\\]|\\.)*){re.escape(q)},\s*$"
        for m in re.finditer(pat, src, re.MULTILINE):
            lines[f"f50_room_r{m.group(1)}"] = unescape(m.group(2))

    # sobriety lines
    camping = os.path.join(ROOT, "src", "game", "engine", "camping.ts")
    lines.update(extract(camping, narrate))
    with open(camping, encoding="utf-8") as f:
        src = f.read()
    for q in ("'", '"'):
        pat = rf"^\s*(\d+): {re.escape(q)}((?:[^{q}\\\\]|\\.)*){re.escape(q)},"
        for m in re.finditer(pat, src, re.MULTILINE):
            lines[f"sober_{m.group(1)}"] = unescape(m.group(2))

    # starting bag line
    lines.update(extract(os.path.join(ROOT, "src", "game", "engine", "combatAnimation.ts"), narrate))
    # ambush / patrol lines
    lines.update(extract(os.path.join(ROOT, "src", "game", "engine", "dungeonSetup.ts"), narrate))
    # intro (current texts — includes the changed wake lines)
    lines.update(extract(os.path.join(ROOT, "src", "game", "cutscenes", "intro.ts"), narrate))
    return lines


def to_mp3(wav_path: str, mp3_path: str):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-codec:a", "libmp3lame", "-qscale:a", "4", mp3_path],
        check=True,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--ids", nargs="*", default=None)
    args = ap.parse_args()

    lines = lines_from_sources()
    if args.ids:
        lines = {k: v for k, v in lines.items() if k in args.ids}

    todo = {k: v for k, v in lines.items()
            if args.force or k in CHANGED or not os.path.exists(os.path.join(OUT, f"{k}.mp3"))}
    print(f"{len(lines)} floor-50 narration ids found; {len(todo)} to generate.")
    if not todo:
        print("nothing to do")
        return

    print(f"loading 1.7B Base model from {BASE_DIR} ...")
    base = Qwen3TTSModel.from_pretrained(
        BASE_DIR, device_map=DEVICE, dtype=DTYPE, attn_implementation="sdpa")

    print(f"building narrator clone prompt from {os.path.join(SAMPLES, 'Narrator.mp3')} ...")
    prompt_items = base.create_voice_clone_prompt(ref_audio=os.path.join(SAMPLES, "Narrator.mp3"), x_vector_only_mode=True)
    # create_voice_clone_prompt returns a LIST of VoiceClonePromptItem — batch
    # mode wants one item per text, so broadcast the first item
    prompt = [prompt_items[0]] if prompt_items else None

    ids = list(todo.keys())
    texts = [todo[i] for i in ids]
    CHUNK = 6
    with tempfile.TemporaryDirectory() as td:
        for start in range(0, len(ids), CHUNK):
            chunk_ids = ids[start:start + CHUNK]
            chunk_texts = texts[start:start + CHUNK]
            print(f"  synth {chunk_ids[0]}…{chunk_ids[-1]} ({start + 1}-{min(start + CHUNK, len(ids))}/{len(ids)})")
            try:
                wavs, sr = base.generate_voice_clone(
                    text=chunk_texts,
                    language=["English"] * len(chunk_ids),
                    voice_clone_prompt=prompt * len(chunk_ids),
                    do_sample=True,
                )
                for fid, wav in zip(chunk_ids, wavs):
                    tmp = os.path.join(td, f"{fid}.wav")
                    sf.write(tmp, wav, sr)
                    to_mp3(tmp, os.path.join(OUT, f"{fid}.mp3"))
                    print("  wrote", fid)
            except Exception as e:  # keep going if one batch fails
                print("  FAIL", chunk_ids, "->", repr(e))
    print("DONE")


if __name__ == "__main__":
    main()
