// ─────────────────────────────────────────────────────────────
// Audio: WebAudio manager. SFX & the ambient loop are AI-generated
// mp3s in /public/audio (see EXPANSION_GUIDE.md § Audio Pipeline
// for the exact prompts). The combat drum layer is synthesized at
// runtime (kick/toms/hats) so battle music adapts without assets.
// ─────────────────────────────────────────────────────────────

const SFX_FILES = [
  'sword_hit', 'fireball', 'heal', 'magic_missile',
  'arrow', 'dice', 'victory', 'ui_click',
] as const;

export type SfxName = (typeof SFX_FILES)[number];

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private musicSource: AudioBufferSourceNode | null = null;
  private drumTimer: number | null = null;
  private nextBeat = 0;
  private beatCount = 0;
  muted = false;
  private started = false;

  /** must be called from a user gesture */
  async init() {
    if (this.started) return;
    this.started = true;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.42;
    this.musicGain.connect(this.master);

    const load = async (name: string) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}audio/${name}.mp3`);
        const buf = await res.arrayBuffer();
        this.buffers.set(name, await this.ctx!.decodeAudioData(buf));
      } catch { /* missing file → silently skip */ }
    };
    await Promise.all([...SFX_FILES.map(load), load('music_ambient')]);
    this.playMusic('music_ambient');
  }

  play(name: SfxName, volume = 1, rate = 1) {
    if (!this.ctx || this.muted) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  playMusic(name: string) {
    if (!this.ctx) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    this.musicSource?.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.musicGain);
    src.start();
    this.musicSource = src;
  }

  /** adaptive layer: war drums while in combat */
  setDrums(on: boolean) {
    if (!this.ctx) return;
    if (on && this.drumTimer === null) {
      this.nextBeat = this.ctx.currentTime + 0.1;
      this.beatCount = 0;
      this.drumTimer = window.setInterval(() => this.scheduleDrums(), 90);
    } else if (!on && this.drumTimer !== null) {
      clearInterval(this.drumTimer);
      this.drumTimer = null;
    }
  }

  private scheduleDrums() {
    if (!this.ctx || this.muted) return;
    const BPM = 132, spb = 60 / BPM / 2; // 8th notes
    while (this.nextBeat < this.ctx.currentTime + 0.25) {
      const b = this.beatCount % 16;
      if (b === 0 || b === 6 || b === 10) this.drum(this.nextBeat, 110, 0.5, 0.9);  // kick
      if (b === 4 || b === 12) this.drum(this.nextBeat, 190, 0.32, 0.7);             // tom
      if (b % 2 === 1) this.hat(this.nextBeat, 0.12 + (b % 4 === 3 ? 0.1 : 0));      // hat
      if (b === 14) this.drum(this.nextBeat, 90, 0.6, 1);                            // accent
      this.nextBeat += spb;
      this.beatCount++;
    }
  }

  private drum(t: number, freq: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.32, t + dur);
    g.gain.setValueAtTime(vol * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.musicGain);
    osc.start(t); osc.stop(t + dur);
  }

  private hat(t: number, vol: number) {
    const ctx = this.ctx!;
    const len = 0.05;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.value = vol * 0.35;
    src.connect(f).connect(g).connect(this.musicGain);
    src.start(t);
  }

  /** procedural crash for destructible props: filtered-noise burst + low thump */
  crumble(volume = 0.9) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // shattering noise burst, swept lowpass (wood/clay crunch)
    const len = 0.35;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(280, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume * 0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t);
    // low body thump
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    og.gain.setValueAtTime(volume * 0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(og).connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.3);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.9;
    return this.muted;
  }

  setMusicDucked(ducked: boolean) {
    if (!this.ctx) return;
    this.musicGain.gain.linearRampToValueAtTime(ducked ? 0.2 : 0.42, this.ctx.currentTime + 0.4);
  }
}
