#!/usr/bin/env python
# ─────────────────────────────────────────────────────────────
# Floor 49 narrator voice-over — the Fungal Grotto narration set:
#   • the 9 room-entry lines        (f49_room_r1 … f49_room_r9)
#   • the arrival / departure lines (f49_arrival, f49_departure)
#   • every interactable narration  (f49_drink_pool, f49_offering,
#                                    f49_hermit_shroom, f49_waterfall, …)
#
# Line texts are extracted VERBATIM from the game sources so the audio
# always matches the subtitles. Same narrator clone as floor 50.
#
# Run:  python scripts/gen_tts_floor49.py          # missing + changed only
#       python scripts/gen_tts_floor49.py --force  # regenerate everything
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

CHANGED: set[str] = {"f49_room_r3", "f49_seventh", "f49_departure", "f49_nursery", "f49_giant_wake", "f49_waterfall"}


def unescape(s: str) -> str:
    """TS single/double-quoted string → real text (handle \\' escapes)."""
    return re.sub(r"\\(.)", r"\1", s)


def extract(path: str, id_pat: str) -> dict[str, str]:
    """Match `call(<id>, <text>, …)` with either single- or double-quoted text."""
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

    # floor 49 content (interactables + ROOM_NARRATION) + the level's arrival
    content = os.path.join(ROOT, "src", "levels", "floor49Content.ts")
    lines.update(extract(content, narrate))
    with open(content, encoding="utf-8") as f:
        src = f.read()
    for q in ("'", '"'):
        pat = rf"^\s*r(\d+): {re.escape(q)}((?:[^{q}\\\\]|\\.)*){re.escape(q)},\s*$"
        for m in re.finditer(pat, src, re.MULTILINE):
            lines[f"f49_room_r{m.group(1)}"] = unescape(m.group(2))
    level = os.path.join(ROOT, "src", "levels", "floor49.ts")
    lines.update(extract(level, narrate))

    # engine arrival/departure narrations (goToFloor + exit stairs)
    engine = os.path.join(ROOT, "src", "game", "engine.ts")
    lines.update(extract(engine, narrate))
    # bonfire lit (floor-scoped f<N>_bonfire) + exploration bonus narration
    camping = os.path.join(ROOT, "src", "game", "engine", "camping.ts")
    lines.update(extract(camping, narrate))
    setup = os.path.join(ROOT, "src", "game", "engine", "dungeonSetup.ts")
    lines.update(extract(setup, narrate))
    content50 = os.path.join(ROOT, "src", "levels", "floor50Content.ts")
    lines.update(extract(content50, narrate))
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

    def mp3_for(oid: str) -> str:
        return os.path.join(OUT, oid + ".mp3")

    todo = {}
    for oid, text in lines.items():
        if args.force or oid in CHANGED or not os.path.exists(mp3_for(oid)):
            todo[oid] = text
    print(f"{len(lines)} floor-49 lines found; {len(todo)} to generate.")
    if not todo:
        print("nothing to do")
        return

    print(f"loading 1.7B Base model from {BASE_DIR} ...")
    base = Qwen3TTSModel.from_pretrained(
        BASE_DIR, device_map=DEVICE, dtype=DTYPE, attn_implementation="sdpa")

    print(f"building narrator clone prompt from {os.path.join(SAMPLES, 'Narrator.mp3')} ...")
    prompt_items = base.create_voice_clone_prompt(ref_audio=os.path.join(SAMPLES, "Narrator.mp3"), x_vector_only_mode=True)
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
                    # hard cap: ~3.5 min of 12 Hz audio per line — a pathological
                    # repetition loop must fail the batch, not hang it for hours
                    max_new_tokens=2500,
                )
                for fid, wav in zip(chunk_ids, wavs):
                    tmp = os.path.join(td, f"{fid.replace(':', '_')}.wav")  # ':' is illegal in Windows filenames
                    sf.write(tmp, wav, sr)
                    to_mp3(tmp, mp3_for(fid))
                    print("  wrote", fid)
            except Exception as e:  # keep going if one batch fails
                print("  FAIL", chunk_ids, "->", repr(e))
    print("DONE")


if __name__ == "__main__":
    main()
