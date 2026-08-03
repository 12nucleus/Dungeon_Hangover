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
#   • the NPC *_cap.mp3 flavor captions (narrator-voiced).
#
# NPC *spoken* lines are NOT generated here — they use per-character
# designed voices via scripts/gen_voice_design.py.
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
NPC_OUT = os.path.join(ROOT, "public", "audio", "npc")
SAMPLES = os.path.join(ROOT, "Voice_sample_for_tts_cloning")
os.makedirs(OUT, exist_ok=True)
os.makedirs(NPC_OUT, exist_ok=True)

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


# ══════════════════════════════════════════════════════════
# NPC dialogue voice-over — every `text` line (and the `caption`
# flavor line when a node has one) of the four floor-50 NPCs,
# extracted verbatim from src/game/npc.ts.
#   npc:<id>:<node>      → public/audio/npc/<id>_<node>.mp3
#   npc:<id>:<node>:cap  → public/audio/npc/<id>_<node>_cap.mp3
# ══════════════════════════════════════════════════════════

def lines_from_npc() -> dict[str, str]:
    out: dict[str, str] = {}
    path = os.path.join(ROOT, "src", "game", "npc.ts")
    with open(path, encoding="utf-8") as f:
        src = f.read()
    # split into per-NPC blocks
    blocks = re.split(r"(?m)^export const \w+: NPCDef = \{\s*$", src)[1:]
    for block in blocks:
        m = re.search(r"(?m)^\s*id: '([\w]+)'", block)
        if not m:
            continue
        npc_id = m.group(1)
        # node sections are keyed at exactly 4-space indent inside `dialogue:`
        node_starts = [x.start() for x in re.finditer(r"(?m)^    ([\w]+): \{\s*$", block)]
        for i, nm in enumerate(re.finditer(r"(?m)^    ([\w]+): \{\s*$", block)):
            node = nm.group(1)
            # bound the search to this node's section (next node start or EOF)
            end = node_starts[i + 1] if i + 1 < len(node_starts) else len(block)
            section = block[nm.start():end]
            for kind, suffix in (("caption", ":cap"), ("text", "")):
                vm = re.search(
                    rf"(?m)^\s*{kind}: ('(?:[^'\\\\]|\\.)*'|\"(?:[^\"\\\\]|\\.)*\")",
                    section,
                )
                if not vm:
                    continue
                val = unescape(vm.group(1)[1:-1])
                if val.strip():
                    out[f"npc:{npc_id}:{node}{suffix}"] = val
    return out


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
    npc_lines = lines_from_npc()
    if args.ids:
        lines = {k: v for k, v in lines.items() if k in args.ids}
        npc_lines = {k: v for k, v in npc_lines.items() if k in args.ids}

    def mp3_for(oid: str) -> str:
        if oid.startswith("npc:"):
            # npc:<id>:<node>[:cap] → <id>_<node>[_cap].mp3  (per-NPC names —
            # a bare <node> would collide across NPCs)
            _, npc_id, rest = oid.split(":", 2)
            return os.path.join(NPC_OUT, f"{npc_id}_{rest.replace(':', '_')}.mp3")
        return os.path.join(OUT, oid + ".mp3")

    todo = {}
    for oid, text in list(lines.items()) + list(npc_lines.items()):
        # NPC *spoken* lines are owned by gen_voice_design.py (per-character
        # designed voices) — only the narrator-voiced _cap captions stay here
        if oid.startswith("npc:") and not oid.endswith(":cap"):
            continue
        if args.force or oid in CHANGED or not os.path.exists(mp3_for(oid)):
            todo[oid] = text
    print(f"{len(lines)} narration + {len(npc_lines)} NPC lines found; {len(todo)} to generate.")
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
                    tmp = os.path.join(td, f"{fid.replace(':', '_')}.wav")  # ':' is illegal in Windows filenames
                    sf.write(tmp, wav, sr)
                    to_mp3(tmp, mp3_for(fid))
                    print("  wrote", fid)
            except Exception as e:  # keep going if one batch fails
                print("  FAIL", chunk_ids, "->", repr(e))
    print("DONE")


if __name__ == "__main__":
    main()
