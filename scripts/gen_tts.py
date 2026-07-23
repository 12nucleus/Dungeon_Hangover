# Generates narrator voice lines for the "Dungeon Hangover" intro cutscene
# using Qwen3-TTS with CUSTOM VOICE DESIGN (1.7B models, local ModelScope download).
#
# Pipeline (recommended workflow from the Qwen3-TTS usage guide):
#   1. Design a unique voice for each character from a free-text description
#      (VoiceDesign model -> short reference clip).
#   2. Turn that reference into a reusable clone prompt (Base model).
#   3. Synthesize every line for that character via voice cloning, so the
#      voice stays consistent across all its lines.
#
# Output: public/audio/narration/<id>.mp3  (same files the engine already plays)
#
# Run:  python scripts/gen_tts.py            # skip lines that already exist
#       python scripts/gen_tts.py --force    # regenerate everything
import argparse, os, subprocess, tempfile
import torch, soundfile as sf
from qwen_tts import Qwen3TTSModel

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "audio", "narration")
os.makedirs(OUT, exist_ok=True)

# Local ModelScope downloads (no HuggingFace network needed).
DESIGN_DIR = r"F:\qwen3tts\Qwen3-TTS-12Hz-1.7B-VoiceDesign"
BASE_DIR = r"F:\qwen3tts\Qwen3-TTS-12Hz-1.7B-Base"
DEVICE = "cuda:0"
DTYPE = torch.bfloat16
MP3_BITRATE = "128k"

# ── custom voice designs (free-text descriptions for VoiceDesign) ──
VOICES = {
    # the dry, snarky third-person narrator — "Dungeon Crawler Carl" energy
    "narrator": (
        "Middle-aged male narrator, crisp British Received Pronunciation accent, "
        "dry and wry, calm measured pacing with subtle sardonic warmth, clear "
        "articulate consonants, like a seasoned audiobook host reading a dark comedy."
    ),
    # Greg — drunken brawny hero, blustering and indignant
    "greg": (
        "Rough thirtysomething working-class Scottish man, loud and boisterous, "
        "slightly slurred from drink, broad hearty chest voice with a gravelly edge, "
        "indignant and blustering, like a drunken warrior bragging in a tavern."
    ),
}

# seed lines used only to mint each designed voice (not shipped as audio)
REF_TEXT = {
    "narrator": "Right then. Let us begin where every good story begins: slightly drunk, and vastly overestimating himself.",
    "greg": "Barkeep! Another round for the both of us, and none of your lip about it!",
}

# (id, character, text) — the engine plays these under the subtitles.
LINES = [
    # — Act 1: "The Dirty Mug" — Greg being a belligerent idiot —
    ("t_open", "narrator",
     "The Dirty Mug. Last call came and went two hours ago. Nobody has found the courage to tell Greg."),
    ("greg_a", "greg",
     "Barkeep! Another! And one for me shadow - the big fella's had a hard night an' all!"),
    ("greg_b", "greg",
     "I said the WHOLE table's mine, Norris! Every splinter of it! Come and take it, if yeh think yer hard enough!"),
    # — the room reacts —
    ("narr_room", "narrator",
     "There is no shadow. There is only Greg, a table he has declared a sovereign kingdom, and a room full of people quietly praying he leaves first."),
    ("narr_maid", "narrator",
     "The barmaid has poured this exact drink for this exact man forty-seven times. She stopped making eye contact somewhere around the thirtieth. It is safer that way."),
    ("narr_wiz", "narrator",
     "Over in the corner, a very small wizard is doing a very large amount of nervous arithmetic. The kind you do right before you turn a problem into a farm animal."),
    # — the escalation —
    ("narr_bounce", "narrator",
     "By the door, the bouncer cracks his knuckles - a retired warlord who took this job for the peace and quiet. Greg reads the room perfectly, and climbs onto the table."),
    ("narr_baa", "narrator",
     "A stool takes flight. The wizard squeaks a word he'll regret. Purple light - and for four glorious seconds, Greg the Grim is the loudest sheep the Dirty Mug has ever heard."),
    ("narr_thud", "narrator",
     "The magic wears off. The ale, sadly, does not. Greg salutes a chair, mistakes the floor for the chair, and meets both at considerable speed."),
    # — Act 2 -> bridge (narrator, over black) —
    ("narr_bridge", "narrator",
     "He drank the tavern dry, insulted a man with a sword, challenged a wizard to a fistfight, and spent four seconds as livestock. Then the floor rose up to introduce itself."),
    # — Act 3: dungeon wake-up (narrator, over the scene) —
    ("narr_wake", "narrator",
     "You wake at the bottom of a fifty floor dungeon. In your underwear. With a headache that could crush a small kingdom."),
    ("narr_premise", "narrator",
     "A bag of basic supplies sits by your head: a rusty dagger, a health potion, and a torch that probably won't last. The only way out is up."),
    ("narr_floor", "narrator",
     "Floor one of the Warren. The bonfire behind you is the last warm thing you'll see for a long, long time. Get up, Greg. We've got fifty floors of regret to climb."),
    # — a snarky beat as he stands in his smallclothes —
    ("narr_small", "narrator",
     "Yes. Underwear. The dungeon, it seems, has a sense of humour. Try not to lose the potion before the first rat, hmm?"),
]


def to_mp3(wav_path: str, mp3_path: str):
    subprocess.run(
        ["ffmpeg", "-y", "-i", wav_path, "-ar", "24000", "-b:a", MP3_BITRATE, mp3_path],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenerate even if the mp3 already exists")
    args = ap.parse_args()

    # 1) design a reference voice per character
    print(f"loading VoiceDesign model from {DESIGN_DIR} ...")
    design = Qwen3TTSModel.from_pretrained(
        DESIGN_DIR, device_map=DEVICE, dtype=DTYPE, attn_implementation="sdpa")

    refs = {}
    for char, instruct in VOICES.items():
        print(f"designing voice: {char}")
        wavs, sr = design.generate_voice_design(
            text=REF_TEXT[char], language="English", instruct=instruct, do_sample=True)
        refs[char] = (wavs[0], sr)

    del design
    torch.cuda.empty_cache()

    # 2) turn each reference into a reusable clone prompt (Base model)
    print(f"loading Base model from {BASE_DIR} ...")
    base = Qwen3TTSModel.from_pretrained(
        BASE_DIR, device_map=DEVICE, dtype=DTYPE, attn_implementation="sdpa")

    prompts = {}
    for char, (wav, sr) in refs.items():
        prompts[char] = base.create_voice_clone_prompt(
            ref_audio=(wav, sr), ref_text=REF_TEXT[char])

    # 3) synthesize each character's lines through its clone prompt
    by_char: dict[str, list[tuple[str, str]]] = {}
    for fid, char, text in LINES:
        by_char.setdefault(char, []).append((fid, text))

    for char, items in by_char.items():
        fids = [f for f, _ in items]
        texts = [t for _, t in items]
        out_mp3s = [os.path.join(OUT, f"{f}.mp3") for f in fids]
        if all(os.path.exists(p) for p in out_mp3s) and not args.force:
            print("skip", char)
            continue
        print(f"cloning {char} x{len(texts)}")
        try:
            wavs, sr = base.generate_voice_clone(
                text=texts,
                language=["English"] * len(texts),
                voice_clone_prompt=prompts[char] * len(texts),
                do_sample=True,
            )
            with tempfile.TemporaryDirectory() as td:
                for fid, wav in zip(fids, wavs):
                    mp3 = os.path.join(OUT, f"{fid}.mp3")
                    tmp = os.path.join(td, f"{fid}.wav")
                    sf.write(tmp, wav, sr)
                    to_mp3(tmp, mp3)
                    wv = os.path.join(OUT, f"{fid}.wav")
                    if os.path.exists(wv):
                        os.remove(wv)
                    print("wrote", fid)
        except Exception as e:  # keep going if one batch fails
            print("FAIL", char, "->", repr(e))

    print("DONE")


if __name__ == "__main__":
    main()
