# Generates narrator + Greg voice lines for the "Dungeon Hangover" intro cutscene
# using Qwen3-TTS 1.7B-Base with VOICE CLONING from the provided samples in
# Voice_sample_for_tts_cloning/ (Narrator.mp3, Greg.mp3).
#
# Pipeline:
#   1. Load the 1.7B Base model (local ModelScope download).
#   2. Build a voice-clone prompt per character from its sample audio using
#      x_vector_only_mode=True (speaker-embedding only) — so NO reference
#      transcript is required.
#   3. Synthesize every line for that character through its clone prompt so the
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
SAMPLES = os.path.join(os.path.dirname(__file__), "..", "Voice_sample_for_tts_cloning")
os.makedirs(OUT, exist_ok=True)

# Local ModelScope download (no HuggingFace network needed).
BASE_DIR = r"F:\qwen3tts\Qwen3-TTS-12Hz-1.7B-Base"
DEVICE = "cuda:0"
DTYPE = torch.bfloat16
MP3_BITRATE = "128k"

# ── voice sample per character (used for cloning) ──
VOICE_SAMPLES = {
    "narrator": os.path.join(SAMPLES, "Narrator.mp3"),
    "greg": os.path.join(SAMPLES, "Greg.mp3"),
}

# (id, character, text) — the engine plays these under the subtitles.
LINES = [
    # — Act 0: title card (tavern exterior) —
    ("title_1", "narrator",
     "In a tavern far, far away..."),
    ("title_2", "narrator",
     "Actually, not that far. Just around the corner from the village..."),
    # — Act 1: "The Dirty Mug" — Greg being a belligerent idiot —
    ("t_open", "narrator",
     "The Dirty Mug. Last call came and went two hours ago. Nobody has found the courage to tell Greg."),
    ("greg_a", "greg",
     "Barkeep! Another! And one for me shadow - the big fella's had a hard night an' all!"),
    ("greg_b", "greg",
     "I said the WHOLE table's mine, Norris! Every splinter of it! Come and take it, if yeh think yer hard enough!"),
    # — the room reacts —
    ("narr_room", "narrator",
     "There is no shadow. There is only Greg, a table he has declared a sovereign kingdom, and a room full of people quietly praying he leaves the premises."),
    ("narr_maid", "narrator",
     "The barmaid has poured this exact drink for this exact man forty-seven times. She stopped making eye contact somewhere around the thirtieth. It is safer that way."),
    ("narr_wiz", "narrator",
     "Over in the corner, a wizard barely taller than his own staff is counting on his fingers, very quietly, very nervously. It's the face of a man about to cast something he hasn't practiced in a while."),
    # — the escalation —
    ("narr_bounce", "narrator",
     "By the door, the bouncer cracks his knuckles - a retired warlord who took this job for the peace and quiet. Greg reads the room perfectly, and climbs onto the table."),
    ("narr_baa", "narrator",
     "The wizard mumbles the wrong half of the right spell. A flash of purple light swallows the room - and for four glorious seconds, Greg the Dim, bleat louder than he ever bellowed"),
    ("narr_thud", "narrator",
     "The magic wears off. The ale, sadly, does not. Greg salutes the crowd, mistakes the floor for the chair, and meets both at considerable speed."),
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
]


def to_mp3(wav_path: str, mp3_path: str):
    subprocess.run(
        ["ffmpeg", "-y", "-i", wav_path, "-ar", "24000", "-b:a", MP3_BITRATE, mp3_path],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenerate even if the mp3 already exists")
    ap.add_argument("--ids", nargs="*", default=None,
                    help="only generate these line ids (e.g. --ids narr_baa)")
    args = ap.parse_args()

    # 1) load the 1.7B Base model (voice clone)
    print(f"loading 1.7B Base model from {BASE_DIR} ...")
    base = Qwen3TTSModel.from_pretrained(
        BASE_DIR, device_map=DEVICE, dtype=DTYPE, attn_implementation="sdpa")

    # 2) build a clone prompt per character from its sample audio.
    #    x_vector_only_mode=True uses only the speaker embedding, so no
    #    reference transcript is required.
    prompts = {}
    for char, sample in VOICE_SAMPLES.items():
        print(f"building clone prompt for {char} from {sample}")
        prompts[char] = base.create_voice_clone_prompt(
            ref_audio=sample,
            x_vector_only_mode=True,
        )

    # 3) synthesize each character's lines through its clone prompt
    #    (optionally restricted to --ids)
    lines = [l for l in LINES if not args.ids or l[0] in args.ids]
    by_char: dict[str, list[tuple[str, str]]] = {}
    for fid, char, text in lines:
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
