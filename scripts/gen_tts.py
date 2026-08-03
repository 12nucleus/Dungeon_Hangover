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
     "You wake up. You are lying on cold stone. You are wearing underwear. This is not how you thought today would go, and you once thought you'd marry a chandelier."),
    ("narr_premise", "narrator",
     "You stand. The room spins. You are not sure if it's the hangover or the dungeon. Both, probably."),
    ("narr_premise_2", "narrator",
     "A bag of basic supplies sits by your head: a rusty dagger, a health potion, and a torch that probably won't last. Somewhere in the dark, something squeaks."),
    ("narr_floor", "narrator",
     "Floor 50 — the sewer cellar. The bottom of everything. The bonfire behind you is the last warm thing you'll see for a long, long time. Get up, Greg. We've got fifty floors of regret to climb."),
    # — Act 3b: Greg comes to — cursing, confused, no idea where/who he is —
    ("greg_wake_1", "greg",
     "Urgh... wha... where the bloody hell am I? ...Stone ceiling. Right. Not the tavern, then."),
    ("greg_wake_2", "greg",
     "Who... who am I? ...Greg. I'm Greg. The Dim. Probably. ...Wait, that don't feel right neither."),
    ("narr_create", "narrator",
     "The world swims into focus. Somewhere in the muck of your skull, a thought forms: you can't climb fifty floors as a nameless lump. Time to remember what you are."),
    # — Character creation: one narrator summary per class, played on selection —
    ("class_bar_bouncer", "narrator",
     "The Bar Bouncer. You've been thrown out so many times you learned how the bouncer thinks. Now you do the throwing. Grapple, shove, and lock down one poor soul at a time."),
    ("class_gutter_rogue", "narrator",
     "The Gutter Rogue. You grew up in the alleys behind the pub, eating what the tavern threw away. Steal, sneak, bleed, and never fight fair. Dirty tricks only."),
    ("class_karaoke_bard", "narrator",
     "The Karaoke Bard. You can't sing, and that's the point. Buff your friends, curse your enemies, and make the whole room feel something. The feeling lands."),
    ("class_sommelier", "narrator",
     "The Sommelier. You once drank wine from a box and called it mature. Pair weaknesses, craft potions, and turn every drink into a devastating weapon."),
    ("class_barista", "narrator",
     "The Barista. Six floors without sleep and running on pure spite and caffeine. Extra actions, critical hits, and the fastest fists in the dungeon."),
    ("class_accountant", "narrator",
     "The Accountant. You did taxes once and learned everyone is fiddling the books. Stack debuffs, exploit conditions, and make the numbers work for you."),
    ("class_dentist", "narrator",
     "The Dentist. Seventeen cavities and a drill with a grudge. Precise strikes, bleed, and enough pain to make an ogre floss."),
    ("class_plumber", "narrator",
     "The Plumber. You fixed one toilet and it exploded. Water is power. Burst pipes, unclog enemies, and turn the whole battlefield into a hazard."),
    ("class_wedding_planner", "narrator",
     "The Wedding Planner. The cake collapsed, the groom cried, but the chaos? Scheduled. Buff your whole team and arrange everyone into place."),
    ("class_tabloid_reporter", "narrator",
     "The Tabloid Reporter. Headlines like, local man proposes to a chandelier. Reveal weaknesses and spread panic through pure scandal."),
    ("class_haunted_chef", "narrator",
     "The Haunted Chef. You burned water once. But with enough salt and enough hope, anything becomes food. Heal, harm, and cook up chaos."),
    ("class_shaman", "narrator",
     "The Shaman. You thought it was a beer festival, drank the tea, and now the spirits won't shut up. Persistent curses and a very angry spirit companion."),
    ("class_zoologist", "narrator",
     "The Zoologist. You walked into the lion enclosure for the restaurant. Fascinating. Tame beasts, shift forms, and turn enemies into allies."),
    ("class_insurance_adjuster", "narrator",
     "The Insurance Adjuster. Emotional damages from a chandelier? Not covered. Assess risk, exploit fine print, and turn conditions into profit."),
    ("class_mortician", "narrator",
     "The Mortician. You ate lunch with the dead for three weeks. Heal off every kill, reanimate your enemies, and get stronger as the bodies pile up."),
]

# ─────────────────────────────────────────────────────────────
# Dungeon music loop builder (optional, standalone)
#
# Regenerates public/audio/music_ambient.mp3 with a synthesized,
# non-copyrighted dungeon theme: dark droning pads, a slow minor-key
# melody, a tolling bell and a distant war-drum pulse. Everything is
# additive-synthesized with numpy/scipy (no TTS model, no ffmpeg), so it
# runs in seconds on any machine that has numpy.
#
#   python scripts/gen_tts.py --music          # regenerate the dungeon loop
#
def build_dungeon_music(out_path: str, seconds: float = 64.0, sr: int = 22050):
    import numpy as np

    rng = np.random.default_rng(1337)
    t = np.arange(int(seconds * sr)) / sr
    # exponential fade-out envelope (per second, so the loop is seamless-ish)
    fade = np.exp(-0.045 * t)
    mix = np.zeros_like(t)

    def note(freq: float, at: float, dur: float, vol: float, kind="pad"):
        i0, i1 = int(at * sr), int((at + dur) * sr)
        if i1 > len(t):
            return
        n = t[i0:i1] - at
        if kind == "pad":
            # two detuned sines + a soft fifth → dark drone chord
            for f, v in ((freq, 1.0), (freq * 1.005, 0.6), (freq * 1.5, 0.35)):
                mix[i0:i1] += v * vol * np.sin(2 * np.pi * f * n) * np.exp(-0.8 * n)
        elif kind == "bell":
            # decaying partials → church bell toll
            for k, v in ((1, 1.0), (2.01, 0.5), (3.0, 0.28), (4.02, 0.16)):
                mix[i0:i1] += v * vol * np.sin(2 * np.pi * freq * k * n) * np.exp(-1.4 * n)
        else:  # melody pluck
            mix[i0:i1] += vol * np.sin(2 * np.pi * freq * n) * np.exp(-2.2 * n)

    # A-minor-ish drone bed (never resolves → stays "dungeon")
    for f, v in ((55.0, 0.16), (110.0, 0.10), (164.81, 0.05)):
        note(f, 0, seconds, v, "pad")

    # slow tolling bell every 8s
    for b in range(0, int(seconds), 8):
        note(65.41, b, 6, 0.07, "bell")

    # sparse minor-key melody (haunting, slightly dissonant)
    melody = [220.0, 261.63, 246.94, 220.0, 196.0, 164.81, 196.0, 220.0]
    for i, f in enumerate(melody):
        note(f, 2 + i * 2.4, 1.8, 0.055, "pluck")

    # war-drum pulse every beat (low thump)
    for b in range(0, int(seconds), 2):
        i0 = int(b * sr)
        i1 = min(i0 + int(0.5 * sr), len(t))
        n = t[i0:i1] - b
        mix[i0:i1] += 0.09 * np.sin(2 * np.pi * (60 * np.exp(-3.0 * n)) * n) * np.exp(-3.0 * n)

    # gentle stereo width + normalize
    audio = np.clip(mix * fade, -1, 1)
    audio = audio / (np.max(np.abs(audio)) + 1e-6) * 0.85
    stereo = np.stack([audio, np.roll(audio, int(0.004 * sr))], axis=1)
    import scipy.io.wavfile as wavfile

    tmp_wav = out_path + ".tmp.wav"
    wavfile.write(tmp_wav, sr, (stereo * 32767).astype(np.int16))
    if os.path.exists(out_path):
        os.remove(out_path)
    os.replace(tmp_wav, out_path)
    print(f"wrote dungeon music loop → {out_path} ({seconds}s, {sr}Hz)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenerate even if the mp3 already exists")
    ap.add_argument("--ids", nargs="*", default=None,
                    help="only generate these line ids (e.g. --ids narr_baa)")
    ap.add_argument("--music", action="store_true",
                    help="regenerate public/audio/music_ambient.mp3 (synthesized dungeon loop; no TTS model needed)")
    args = ap.parse_args()

    # standalone: regenerate the music tracks (ambient/combat/victory) via the
    # dedicated composer — see gen_music.py for the full arrangement
    if args.music:
        subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "gen_music.py")], check=True)
        print("DONE (music)")
        return

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
