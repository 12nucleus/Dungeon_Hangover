# Generates narrator voice lines for the "Dungeon Hangover" intro cutscene.
# Voice: Andrew (en-US, male) — the dry, snarky "Dungeon Crawler Carl" energy.
# Run:  python scripts/gen_tts.py
import asyncio, edge_tts, os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "audio", "narration")
os.makedirs(OUT, exist_ok=True)

VOICE = "en-US-AndrewNeural"

# (id, text)  — one file per line; the engine plays these under the subtitles.
LINES = [
    # — Act 1: tavern, Greg being a belligerent idiot —
    ("greg_1",
     "Last call! Last call! And if any o' you lily-livered cowards got a problem with Greg the Grim, you best bring it to my face!"),
    ("greg_2",
     "Piss off, Norris, I paid for the whole table! The whole table is MINE! Bartender, another! The good stuff! The EXPENSIVE stuff!"),
    # — the room reacts —
    ("narr_tavern",
     "The barmaid has seen this routine forty-seven times. She pours another. Greg takes it as encouragement. Nobody else in the room moves."),
    ("narr_wizard",
     "In the corner, a jumpy little wizard is scribbling something on a napkin. The kind of notes you take before casting Polymorph. He looks very, very ready to use them."),
    # — the escalation —
    ("narr_bouncer",
     "The bouncer — a retired orc warlord who traded raiding for the quiet life — cracks his knuckles. Greg mistakes this for applause and stands on the table."),
    ("narr_sheep",
     "A barstool flies. The wizard shrieks. There is a flash of purple light. And for approximately three seconds, Greg the Grim is a very, very loud sheep."),
    # — Act 2 -> bridge (narrator, over black) —
    ("narr_bridge",
     "Greg the Grim drank the tavern dry, insulted a man with a sword, challenged a polymorph wizard to a fistfight, and briefly became livestock. None of those ended well."),
    # — Act 3: dungeon wake-up (narrator, over the scene) —
    ("narr_wake",
     "You wake at the bottom of a fifty floor dungeon. In your underwear. With a headache that could crush a small kingdom."),
    ("narr_premise",
     "A bag of basic supplies sits by your head: a rusty dagger, a health potion, and a torch that probably won't last. The only way out is up."),
    ("narr_floor",
     "Floor one of the Warren. The bonfire behind you is the last warm thing you'll see for a long, long time. Get up, Greg. We've got fifty floors of regret to climb."),
    # — a snarky beat as he stands in his smallclothes —
    ("narr_small",
     "Yes. Underwear. The dungeon, it seems, has a sense of humour. Try not to lose the potion before the first rat, hmm?"),
]

async def main():
    for fid, text in LINES:
        path = os.path.join(OUT, f"{fid}.mp3")
        if os.path.exists(path):
            print("skip", fid)
            continue
        comm = edge_tts.Communicate(text, VOICE, rate="+2%", pitch="+0Hz")
        await comm.save(path)
        print("wrote", fid)

asyncio.run(main())
print("DONE")
