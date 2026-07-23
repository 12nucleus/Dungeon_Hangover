# Qwen3-TTS Usage Guide

## Prerequisites

- Python environment with `qwen-tts` installed (see `qwen3-tts/` for local source)
- NVIDIA GPU with CUDA (tested on RTX 4070 SUPER)
- Use `attn_implementation="sdpa"` on Windows (flash-attn unavailable on Windows)

## 1. Basic Text-to-Speech (CustomVoice)

Uses one of 9 built-in speaker voices.

```python
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

model = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
    device_map="cuda:0",
    dtype=torch.bfloat16,
    attn_implementation="sdpa",
)

wavs, sr = model.generate_custom_voice(
    text="Hello, this is a test of the Qwen3 TTS system.",
    language="English",
    speaker="Ryan",              # see speakers table below
    instruct="Speak cheerfully",  # optional style instruction
)
sf.write("output.wav", wavs[0], sr)
```

**Built-in speakers:**

| Speaker | Description | Native Lang |
|---------|-------------|-------------|
| Vivian | Bright, edgy young female | Chinese |
| Serena | Warm, gentle young female | Chinese |
| Uncle_Fu | Seasoned male, low mellow | Chinese |
| Dylan | Youthful Beijing male | Chinese (Beijing) |
| Eric | Lively Chengdu male | Chinese (Sichuan) |
| Ryan | Dynamic male, strong rhythm | English |
| Aiden | Sunny American male | English |
| Ono_Anna | Playful Japanese female | Japanese |
| Sohee | Warm Korean female | Korean |

Each speaker can speak any supported language (Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian). Best quality with native language.

## 2. Voice Design (generate novel voices from text descriptions)

Uses **VoiceDesign** model — describes a voice in natural language.

```python
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

model = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    device_map="cuda:0",
    dtype=torch.bfloat16,
    attn_implementation="sdpa",
)

wavs, sr = model.generate_voice_design(
    text="I can't believe you ate the last slice!",
    language="English",
    instruct="Angry young male voice, pitch rising with frustration, slightly hoarse",
)
sf.write("designed_voice.wav", wavs[0], sr)
```

The `instruct` parameter is a free-form text description of the desired voice. Be specific about age, gender, pitch, tone, emotion, accent, etc.

## 3. Voice Clone (clone from reference audio)

Uses **Base** model — requires a reference audio clip (~3 seconds) and its transcript.

```python
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

model = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    device_map="cuda:0",
    dtype=torch.bfloat16,
    attn_implementation="sdpa",
)

wavs, sr = model.generate_voice_clone(
    text="This is a cloned voice speaking new content.",
    language="English",
    ref_audio="path/to/reference.wav",     # local file, URL, or (np_array, sr) tuple
    ref_text="The original transcript of the reference audio.",
)
sf.write("clone_output.wav", wavs[0], sr)
```

**Reusable prompt** (avoids re-encoding the reference on every call):

```python
prompt = model.create_voice_clone_prompt(
    ref_audio="path/to/reference.wav",
    ref_text="The original transcript.",
)

# reuse across multiple generations
wavs, sr = model.generate_voice_clone(
    text="First sentence.",
    language="English",
    voice_clone_prompt=prompt,
)

wavs, sr = model.generate_voice_clone(
    text="Second sentence.",
    language="English",
    voice_clone_prompt=prompt,
)
```

## 4. Voice Design → Clone Pipeline (recommended workflow)

Design a unique voice, generate a reference clip, then clone it for reuse.

```python
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

# Step 1: design a voice
design = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa",
)

ref_text = "Hey! You dropped your notebook... I think? Maybe?"
ref_wavs, sr = design.generate_voice_design(
    text=ref_text,
    language="English",
    instruct="Male teenager, tenor range, nervous but trying to sound confident",
)
sf.write("designed_ref.wav", ref_wavs[0], sr)

# Step 2: build a clone prompt from the designed reference
clone = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa",
)

voice_prompt = clone.create_voice_clone_prompt(
    ref_audio=(ref_wavs[0], sr),
    ref_text=ref_text,
)

# Step 3: generate new lines with the designed voice
lines = [
    "No problem, I already finished those.",
    "What? No! I mean, your technique is really precise!",
]

wavs, sr = clone.generate_voice_clone(
    text=lines,
    language=["English", "English"],
    voice_clone_prompt=voice_prompt,
)
for i, w in enumerate(wavs):
    sf.write(f"line_{i}.wav", w, sr)
```

## 5. Launch Web UI

```bash
qwen-tts-demo Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice --ip 0.0.0.0 --port 8000
# VoiceDesign: qwen-tts-demo Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign --ip 0.0.0.0 --port 8000
# Base:       qwen-tts-demo Qwen/Qwen3-TTS-12Hz-1.7B-Base --ip 0.0.0.0 --port 8000
```

Then open `http://localhost:8000`.

## Available Models (by capability)

| Model | Size | Use Case |
|-------|------|----------|
| `Qwen3-TTS-12Hz-1.7B-CustomVoice` | 1.7B | TTS with 9 built-in voices + style control |
| `Qwen3-TTS-12Hz-0.6B-CustomVoice` | 0.6B | Same, smaller/faster |
| `Qwen3-TTS-12Hz-1.7B-VoiceDesign` | 1.7B | Generate voices from text descriptions |
| `Qwen3-TTS-12Hz-1.7B-Base` | 1.7B | Voice clone from reference audio |
| `Qwen3-TTS-12Hz-0.6B-Base` | 0.6B | Same, smaller/faster |
| `Qwen3-TTS-Tokenizer-12Hz` | — | Encode/decode audio only |

## Performance Notes

- **1.7B models** use ~3.5GB VRAM, **0.6B models** use ~1.5GB VRAM
- `torch.bfloat16` recommended for memory efficiency
- Batch inference supported: pass lists to `text`, `language`, `speaker`, etc.
- Output: 24kHz mono WAV, float32 numpy arrays
