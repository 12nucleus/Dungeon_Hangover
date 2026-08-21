// ─────────────────────────────────────────────────────────────
// Audio: WebAudio manager. SFX and the ambient loop are AI-generated mp3s
// in /public/audio (see EXPANSION_GUIDE.md § Audio Pipeline for the prompts).
// AAA: adaptive music (explore ↔ combat crossfade) + improved ducking.
// ─────────────────────────────────────────────────────────────

const SFX_FILES = [
  'sword_hit', 'fireball', 'fireball_cast', 'fireball_impact', 'heal', 'magic_missile',
  'arrow', 'dice', 'victory', 'ui_click', 'bonfire_lit',
  // combat presentation set — real sampled hits (Kenney, CC0) + produced cast layers
  'whoosh', 'whoosh_soft', 'dodge', 'block', 'hit_slash', 'hit_pierce', 'hit_blunt',
  'ice_shatter', 'crit_hit', 'cast_fire', 'cast_ice', 'cast_holy', 'cast_arcane', 'cast_buff',
] as const;

export type SfxName = (typeof SFX_FILES)[number];

import type { GameSettings } from './save';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private tavernGain!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private musicSource: AudioBufferSourceNode | null = null;
  private tavernSource: AudioBufferSourceNode | null = null;
  muted = false;
  private started = false;
  private tavernPending = false;
  private pendingMusic: string | null = null;
  // AAA adaptive: explore vs combat as two looping sources crossfaded
  private exploreGain!: GainNode;
  private combatGain!: GainNode;
  private exploreSource: AudioBufferSourceNode | null = null;
  private combatSource: AudioBufferSourceNode | null = null;
  private adaptive: 'explore' | 'combat' = 'explore';

  // ── dungeon ambience (procedural + floor-50 droplet bed) ───
  private ambGain: GainNode | null = null;      // master ambience bus
  private ambReverb: ConvolverNode | null = null;
  private ambNoise: AudioBufferSourceNode | null = null;
  private ambDrone: OscillatorNode[] = [];
  private ambTimer: number | null = null;
  private ambNext: number[] = [];
  private ambActive = false;
  // floor-50 cave-drip bed: a looping wav of real cave-water droplets, faded
  // under the ambience bus. `dropletWanted` is set by the engine when the
  // party is on floor 50; the loop only *sounds* while the ambience runs.
  private dropletWanted = false;
  private dropletSource: AudioBufferSourceNode | null = null;
  private dropletGain: GainNode | null = null;

  /** must be called from a user gesture.
   *
   * PERFORMANCE (Fix C): only the *critical* audio files are awaited
   * here so the click→first-sound latency is as low as possible.
   *  - ui_click (menu feedback)
   *  - sword_hit, dice (immediate combat feedback)
   *  - tavern_music (title screen music)
   *  - music_ambient (dungeon music on enter)
   *
   * The remaining SFX (fireball/heal/magic_missile/arrow/victory/
   * bonfire_lit) are lazy-loaded the first time play() is called for
   * them. This roughly halves init time on first click. */
  async init() {
    if (this.started) {
      if (this.ctx?.state === 'suspended') { try { await this.ctx.resume(); } catch { /* gesture may not be available yet */ } }
      return;
    }
    this.started = true;
    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch { /* ignore */ } }
    try {
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.42;
      this.musicGain.connect(this.master);
      this.exploreGain = this.ctx.createGain();
      this.exploreGain.gain.value = 0.42;
      this.exploreGain.connect(this.master);
      this.combatGain = this.ctx.createGain();
      this.combatGain.gain.value = 0;
      this.combatGain.connect(this.master);
      this.tavernGain = this.ctx.createGain();
      this.tavernGain.gain.value = 0;   // silent until the tavern plays
      this.tavernGain.connect(this.master);
    } catch (err) {
      // A browser/WebView2 that can't build the gain graph would otherwise
      // silently kill every SFX/music node while VO (HTMLAudio) kept playing.
      this.ctx = null;
      this.started = false;              // allow a retry on the next gesture
      // eslint-disable-next-line no-console
      console.warn('[audio] WebAudio init failed — SFX/music disabled', err);
      return;
    }

    // Critical audio — awaited so the first click feels instant. AAA: also warm combat music for adaptive crossfade.
    const critical = ['ui_click', 'sword_hit', 'dice', 'tavern_music', 'music_ambient', 'music_combat'];
    await Promise.all(critical.map((n) => this._loadBuffer(n)));
    // NOTE: the dungeon ambient loop is intentionally NOT started here. Autoplay
    // policy blocks audio before a gesture, and we don't want the dungeon theme
    // bleeding into the tavern title screen. It is started later, when the intro
    // cutscene hands control to the player (see finishIntro / playIntroCutscene).
    if (this.tavernPending) { this.tavernPending = false; this.playTavernMusic(this._pendingOpts ?? {}); this._pendingOpts = undefined; }
    if (this.pendingMusic) {
      const name = this.pendingMusic;
      this.pendingMusic = null;
      this.playMusic(name);
    }

    // Background-load the rest of the SFX list — don't await, let them
    // trickle in. Each future play() call is guaranteed to wait if it's
    // not ready yet (see play() below).
    queueMicrotask(() => {
      const deferred = SFX_FILES.filter((n) => !critical.includes(n));
      Promise.all(deferred.map((n) => this._loadBuffer(n)));
    });
  }

  /** internal: fetch + decode one mp3/wav into the buffer cache. Silent on
   *  network failure so a missing file doesn't break gameplay. */
  private async _loadBuffer(name: string): Promise<void> {
    if (!this.ctx) return;
    if (this.buffers.has(name)) return;
    for (const ext of ['mp3', 'wav']) {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}audio/${name}.${ext}`);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        this.buffers.set(name, await this.ctx.decodeAudioData(buf));
        return;
      } catch { /* try the next extension */ }
    }
  }

  /** public lazy loader — exposed so other modules can warm the cache
   *  early (e.g. when a level loads, fetch its most-used SFX). */
  async preload(name: SfxName): Promise<void> {
    await this._loadBuffer(name);
  }

  play(name: SfxName, volume = 1, rate = 1) {
    if (!this.ctx || this.muted) return;
    const buf = this.buffers.get(name);
    if (!buf) {
      // Buffer not loaded yet — kick off a background fetch for next time,
      // but skip this play() so we don't add latency. (Critical SFX are
      // already loaded in init(); this only happens for deferred ones.)
      void this._loadBuffer(name);
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  /** Resume audio from a later user gesture, such as the first dungeon click. */
  resume() {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  playMusic(name: string) {
    if (this.muted) return;
    this.pendingMusic = name;
    if (name === 'music_ambient' && this.ctx) this.startDungeonAmbience();
    if (!this.ctx) return;
    // AAA adaptive: ambient/combat share the twin gains
    if ((name === 'music_ambient' || name === 'music_combat') && this.exploreGain && this.combatGain) {
      const buf = this.buffers.get(name);
      if (!buf) { void this._loadBuffer(name).then(() => {
        if (this.pendingMusic === name) { this.pendingMusic = null; this.playMusic(name); }
      }); return; }
      this.pendingMusic = null;
      // ensure both layers looping, volumes decide which is audible
      this.ensureAdaptiveSources();
      this.setAdaptiveState(name === 'music_combat' ? 'combat' : 'explore', 1.0);
      if (name === 'music_ambient') this.startDungeonAmbience();
      return;
    }
    const buf = this.buffers.get(name);
    if (!buf) { void this._loadBuffer(name).then(() => {
      if (this.pendingMusic === name) { this.pendingMusic = null; this.playMusic(name); }
    }); return; }
    this.pendingMusic = null;
    this.musicSource?.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    // victory is a one-shot "ta-da" chime — looping it would be a stuck ta-da
    src.loop = name !== 'music_victory';
    src.connect(this.musicGain);
    src.start();
    this.musicSource = src;
    // Start the procedural layer independently of whether the music asset was
    // delayed, so a slow/missing MP3 cannot suppress the dungeon atmosphere.
    if (name === 'music_ambient') this.startDungeonAmbience();
  }

  /** tavern theme — loops on its own gain so it can fade independently.
   *  `muffled` routes through a low-pass filter so the track sounds like
   *  it's bleeding through the tavern walls from the inside (used for the
   *  exterior title card). `volume` is the final target gain. */
  private tavernFilter: BiquadFilterNode | null = null;
  private _pendingOpts: { muffled?: boolean; volume?: number } | undefined;
  playTavernMusic(opts: { muffled?: boolean; volume?: number } = {}) {
    if (!this.ctx || this.muted) return;
    const buf = this.buffers.get('tavern_music');
    if (!buf) { this.tavernPending = true; this._pendingOpts = opts; return; }
    this.tavernSource?.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // (re)build the filter chain so toggling muffled/clean is consistent
    if (this.tavernFilter) { try { this.tavernFilter.disconnect(); } catch { /* */ } }
    let tail: AudioNode = this.tavernGain;
    if (opts.muffled) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(440, this.ctx.currentTime);   // dull through-the-wall
      f.Q.value = 0.7;
      f.connect(this.tavernGain);
      this.tavernFilter = f;
      tail = f;
    } else {
      this.tavernFilter = null;
    }
    src.connect(tail);
    src.start();
    this.tavernSource = src;
    const now = this.ctx.currentTime;
    const g = this.tavernGain.gain;
    const target = opts.volume ?? 0.22;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(target, now + 2.0);   // well below the narration VO
  }
  /** smoothly switch the running tavern track muffled→full or vice versa */
  setTavernMuffled(muffled: boolean) {
    if (!this.ctx || !this.tavernSource) return;
    const now = this.ctx.currentTime;
    if (muffled && !this.tavernFilter) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(440, now); f.Q.value = 0.7;
      try { this.tavernSource.disconnect(); } catch { /* */ }
      this.tavernSource.connect(f); f.connect(this.tavernGain);
      this.tavernFilter = f;
    } else if (!muffled && this.tavernFilter) {
      try { this.tavernSource.disconnect(); } catch { /* */ }
      this.tavernSource.connect(this.tavernGain);
      try { this.tavernFilter.disconnect(); } catch { /* */ }
      this.tavernFilter = null;
    }
  }

  /** fade the tavern theme out (kept quieter than the voiceover throughout) */
  stopTavernMusic() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const g = this.tavernGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.0001, now + 1.5);
    const src = this.tavernSource;
    this.tavernSource = null;
    if (src) setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } }, 1700);
  }

  /** true while the tavern theme is actively playing — used so the title
   *  narration doesn't restart it after a splash gesture already started it. */
  isTavernMusicPlaying(): boolean {
    return this.tavernSource !== null;
  }

  /** hard-stop the looping dungeon/ambient track (e.g. when swapping to tavern) */
  stopMusic() {
    if (!this.ctx) return;
    this.musicSource?.stop();
    this.musicSource = null;
    try { this.exploreSource?.stop(); } catch { /* */ }
    this.exploreSource = null;
    try { this.combatSource?.stop(); } catch { /* */ }
    this.combatSource = null;
    if (this.exploreGain) this.exploreGain.gain.value = 0.42;
    if (this.combatGain) this.combatGain.gain.value = 0;
    this.adaptive = 'explore';
    this.stopDungeonAmbience();
  }

  // ══ dungeon ambience — procedural soundscape (+ floor-50 droplet bed) ══
  // A low wind/cave drone sits underneath the dungeon music track, and a
  // scheduler sprinkles randomized events (water drips, echoed footsteps,
  // distant screams, wet squelches, rat squeaks, creaks, occasional rude
  // farts) through a reverb bus so they feel far away and cavernous. All
  // events are synthesized at runtime except the floor-50 cave-water-droplet
  // bed, which loops a real recording. Auto-starts with the dungeon music
  // and stops on exit.

  private ambReverbIR(): AudioBuffer {
    const ctx = this.ctx!;
    const len = 2.4, sr = ctx.sampleRate;
    const buf = ctx.createBuffer(2, Math.floor(sr * len), sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const n = (Math.random() * 2 - 1) * 0.6;
        // gentle exponentially-decaying tail → cavern slap
        d[i] = (last + n * 0.45) * Math.pow(1 - i / d.length, 2.2);
        last = d[i];
      }
    }
    return buf;
  }

  private ambNoiseBuf(dur: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private ambDroneNote(freq: number, vol: number, type: OscillatorType = 'sine') {
    if (!this.ctx || !this.ambGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 4);
    // slow LFO breathing
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.05 + Math.random() * 0.06;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = vol * 0.35;
    lfo.connect(lfoG).connect(g.gain);
    osc.connect(g).connect(this.ambGain);
    osc.start();
    lfo.start();
    this.ambDrone.push(osc);
  }

  /** start the layered dungeon soundscape (drone + drip/scream/footstep scheduler) */
  startDungeonAmbience() {
    if (!this.ctx || this.ambActive) return;
    this.ambActive = true;

    // ── ambience bus → reverb bus → master ──
    const amb = this.ctx.createGain();
    amb.gain.value = 0.9;
    const reverb = this.ctx.createConvolver();
    reverb.buffer = this.ambReverbIR();
    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0.8;
    amb.connect(this.master);
    amb.connect(reverb).connect(reverbGain).connect(this.master);
    this.ambGain = amb;
    this.ambReverb = reverb;

    // ── low wind drone (two detuned sine + a breathy triangle) ──
    this.ambDroneNote(52, 0.11, 'sine');
    this.ambDroneNote(52.7, 0.09, 'sine');
    this.ambDroneNote(104, 0.06, 'triangle');

    // floor-50 real droplet bed rides the same bus
    if (this.dropletWanted) this.startDroplet();

    // ── scheduler tick — sprinkle random distant events ──
    const fire = (t: number) => {
      const roll = Math.random();
      if (roll < 0.36) this.ambDrip(t);
      else if (roll < 0.53) this.ambFootstep(t);
      else if (roll < 0.67) this.ambScream(t);
      else if (roll < 0.78) this.ambWaterStep(t);
      else if (roll < 0.89) this.ambSqueak(t);
      else if (roll < 0.95) this.ambFart(t);
      else this.ambCreak(t);
    };
    const schedule = () => {
      if (!this.ambActive) return;
      const now = this.ctx!.currentTime;
      while (this.ambNext.length < 3) this.ambNext.push(now + Math.random() * 5);
      fire(this.ambNext.shift()!);
      // ~45% of ticks carry a second, slightly-later event for texture
      if (Math.random() < 0.45) {
        const t = this.ambNext.shift() ?? now + 0.8 + Math.random() * 1.5;
        fire(t);
      }
    };
    schedule();
    this.ambTimer = window.setInterval(schedule, 2200);
  }

  /** stop the dungeon ambience (drone + scheduler) — safe to call anytime */
  stopDungeonAmbience() {
    this.ambActive = false;
    this.stopDroplet();
    if (this.ambTimer !== null) { clearInterval(this.ambTimer); this.ambTimer = null; }
    this.ambNext = [];
    for (const osc of this.ambDrone) { try { osc.stop(); } catch { /* */ } }
    this.ambDrone = [];
    this.ambNoise?.stop();
    this.ambNoise = null;
    if (this.ambReverb) { try { this.ambReverb.disconnect(); } catch { /* */ } }
    this.ambReverb = null;
    if (this.ambGain) { try { this.ambGain.disconnect(); } catch { /* */ } }
    this.ambGain = null;
  }

  /** is the dungeon soundscape currently running? (drives UI toggles) */
  isDungeonAmbienceActive(): boolean {
    return this.ambActive;
  }

  /** floor-50 cave-drip bed on/off. The engine calls this on every floor
   *  build; the loop itself only starts when the ambience is running. */
  setDropletWanted(wanted: boolean) {
    this.dropletWanted = wanted;
    if (!wanted) this.stopDroplet();
    else if (this.ambActive) this.startDroplet();
  }

  /** loop the real cave-water-droplet recording under the ambience bus */
  private startDroplet() {
    if (!this.ctx || !this.ambGain || this.dropletSource) return;
    void (async () => {
      if (this.dropletSource || !this.dropletWanted || !this.ctx || !this.ambGain) return;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}audio/395258__selulance__cave-water-droplet-1.wav`);
        if (!res.ok) return;
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        // ambience may have stopped (or floor changed) during the fetch
        if (!this.dropletWanted || !this.ambGain || this.dropletSource) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const g = this.ctx.createGain();
        const t = this.ctx.currentTime;
        g.gain.setValueAtTime(0.0001, t);
        // slow fade-in so the drip bed doesn't pop over the music start
        g.gain.linearRampToValueAtTime(0.4, t + 3);
        src.connect(g).connect(this.ambGain);
        src.start();
        this.dropletSource = src;
        this.dropletGain = g;
      } catch {
        // missing/corrupt wav → stay silent, never crash the soundscape
      }
    })();
  }

  /** fade the droplet bed out and release its nodes */
  private stopDroplet() {
    const src = this.dropletSource;
    const g = this.dropletGain;
    if (src && g && this.ctx) {
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.4);
      window.setTimeout(() => {
        try { src.stop(); } catch { /* */ }
        try { src.disconnect(); } catch { /* */ }
        try { g.disconnect(); } catch { /* */ }
      }, 450);
    }
    this.dropletSource = null;
    this.dropletGain = null;
  }

  private ambDrip(t: number) {
    if (!this.ctx || !this.ambGain) return;
    // small plink: short sine blip with fast decay, pitched at 900-1800Hz
    const osc = this.ctx.createOscillator();
    const f = 900 + Math.random() * 900;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.75, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(g).connect(this.ambGain);
    osc.start(t); osc.stop(t + 0.15);
  }

  private ambScream(t: number) {
    if (!this.ctx || !this.ambGain) return;
    // distant shriek — bandpassed noise swelled up and down, very quiet
    const len = 1.4;
    const buf = this.ambNoiseBuf(len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1900 + Math.random() * 500, t);
    f.Q.value = 9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.17, t + 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.ambGain);
    src.start(t); src.stop(t + len);
  }

  private ambFart(t: number) {
    if (!this.ctx || !this.ambGain) return;
    // echoed fart — low sawtooth with pitch droop + a reverb slap, quiet enough
    // to be a distant rude noise echoing down a corridor
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(85 + Math.random() * 30, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(320, t);
    f.frequency.exponentialRampToValueAtTime(90, t + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(f).connect(g).connect(this.ambGain);
    osc.start(t); osc.stop(t + 0.75);
  }

  private ambSqueak(t: number) {
    if (!this.ctx || !this.ambGain) return;
    // distant rat squeak — two quick square beeps
    const mk = (at: number, f0: number, f1: number) => {
      const o = this.ctx!.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f1, at + 0.06);
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.13, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      o.connect(g).connect(this.ambGain!);
      o.start(at); o.stop(at + 0.09);
    };
    mk(t, 1500 + Math.random() * 400, 2200);
    mk(t + 0.11, 1800, 1400);
  }

  private ambFootstep(t: number) {
    if (!this.ctx || !this.ambGain) return;
    // echoed heavy footstep — dull thump + a slapback echo down the hall
    const thump = (at: number, vol: number) => {
      const o = this.ctx!.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(95 + Math.random() * 20, at);
      o.frequency.exponentialRampToValueAtTime(42, at + 0.18);
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      o.connect(g).connect(this.ambGain!);
      o.start(at); o.stop(at + 0.25);
    };
    thump(t, 0.2);
    thump(t + 0.27, 0.09);
  }

  private ambWaterStep(t: number) {
    if (!this.ctx || !this.ambGain) return;
    // wet squelch — bandpassed noise blip + a low sine thud
    const len = 0.35;
    const src = this.ctx.createBufferSource();
    src.buffer = this.ambNoiseBuf(len);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(480 + Math.random() * 260, t);
    f.Q.value = 2.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(f).connect(g).connect(this.ambGain);
    o.connect(og).connect(this.ambGain);
    src.start(t); src.stop(t + len + 0.05);
    o.start(t); o.stop(t + 0.2);
  }

  private ambCreak(t: number) {
    if (!this.ctx || !this.ambGain) return;
    // slow dungeon creak — sine sweep up-down, like an old door/beam shifting
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(230 + Math.random() * 90, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.55);
    o.frequency.exponentialRampToValueAtTime(260, t + 1.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g).connect(this.ambGain);
    o.start(t); o.stop(t + 1.25);
  }

  /** Dead Space sting — noise slam + falling two-note, then silence. */
  jumpScare(volume = 1) {
    this.noiseBurst(0.18, volume * 0.85, 'highpass', 4200, 900);
    this.beep(220, 70, 0.28, volume * 0.55, 'sawtooth');
    this.beep(880, 140, 0.22, volume * 0.28, 'square', 0.04);
  }

  /** far-pipe shriek, quieter than a sting */
  distantScream(volume = 0.7) {
    if (!this.ctx || this.muted || !this.ambGain) {
      this.noiseBurst(0.9, volume * 0.18, 'bandpass', 2100, 1400);
      return;
    }
    this.ambScream(this.ctx.currentTime);
  }

  /** footstep in standing water */
  waterStep(volume = 0.75) {
    this.noiseBurst(0.16, volume * 0.45, 'bandpass', 1400, 400);
    this.beep(240, 90, 0.12, volume * 0.18, 'sine');
  }

  /** delayed slapback of a footstep in a large chamber */
  echoFoot(volume = 0.4) {
    this.noiseBurst(0.08, volume * 0.25, 'lowpass', 900, 220);
    this.beep(160, 90, 0.18, volume * 0.12, 'sine', 0.09);
  }

  /** raise drip/scream density when standing in flooded rooms */
  setAmbienceWet(wet: boolean) {
    if (!this.ambGain || !this.ctx) return;
    this.ambGain.gain.linearRampToValueAtTime(wet ? 1.0 : 0.9, this.ctx.currentTime + 0.6);
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

  // ── procedural dungeon / monster SFX (synthesized, no assets) ──
  private noiseBurst(dur: number, vol: number, filter: 'lowpass' | 'highpass' | 'bandpass', f0: number, f1: number, dest?: AudioNode) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = filter;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest ?? this.sfxGain); src.start(t);
  }
  private beep(freq0: number, freq1: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(freq0, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.sfxGain); osc.start(t); osc.stop(t + dur + 0.02);
  }

  /** heavy stone door grinding open */
  door(volume = 0.9) {
    this.noiseBurst(0.9, volume * 0.5, 'lowpass', 900, 120);
    this.beep(70, 42, 0.8, volume * 0.5, 'sawtooth');
    this.beep(140, 90, 0.7, volume * 0.25, 'square', 0.1);
  }
  /** key turning in a lock — metallic clicks + jingle */
  unlock(volume = 0.9) {
    this.noiseBurst(0.06, volume * 0.5, 'highpass', 5000, 4000);
    this.beep(1800, 1400, 0.05, volume * 0.35, 'square', 0.02);
    this.beep(1200, 900, 0.06, volume * 0.3, 'square', 0.09);
    this.beep(2400, 2600, 0.08, volume * 0.25, 'triangle', 0.16);
  }
  /** water splash — the boss rising from its bath */
  splash(volume = 0.9) {
    this.noiseBurst(0.5, volume * 0.6, 'bandpass', 1600, 500);
    this.noiseBurst(0.35, volume * 0.4, 'highpass', 3000, 1200);
    this.beep(320, 120, 0.3, volume * 0.2, 'sine', 0.05);
  }
  /** guttural boss roar */
  roar(volume = 1) {
    this.beep(180, 70, 0.7, volume * 0.55, 'sawtooth');
    this.beep(90, 50, 0.8, volume * 0.5, 'square', 0.03);
    this.noiseBurst(0.6, volume * 0.35, 'lowpass', 1200, 300, this.sfxGain);
  }
  /** chest lid creak + treasure chime */
  chestOpen(volume = 0.9) {
    this.beep(200, 520, 0.4, volume * 0.3, 'sawtooth');
    for (let i = 0; i < 4; i++) this.beep(880 + i * 220, 1400 + i * 260, 0.5, volume * 0.22, 'triangle', 0.25 + i * 0.07);
  }
  /** mechanical lever throw */
  lever(volume = 0.9) {
    this.noiseBurst(0.08, volume * 0.4, 'bandpass', 2200, 900);
    this.beep(600, 180, 0.18, volume * 0.4, 'square');
    this.beep(150, 90, 0.25, volume * 0.35, 'sawtooth', 0.06);
  }
  /** rat squeak */
  squeak(volume = 0.7) {
    this.beep(1400, 2200, 0.08, volume * 0.4, 'square');
    this.beep(2000, 1500, 0.07, volume * 0.3, 'square', 0.08);
  }
  /** bat screech */
  screech(volume = 0.7) {
    this.beep(2600, 3400, 0.12, volume * 0.35, 'sawtooth');
    this.beep(3200, 2400, 0.1, volume * 0.3, 'sawtooth', 0.05);
  }
  /** dry bone rattle */
  boneRattle(volume = 0.8) {
    for (let i = 0; i < 5; i++) this.noiseBurst(0.05, volume * 0.4, 'highpass', 4000, 3500);
    this.beep(300, 180, 0.15, volume * 0.25, 'square', 0.02);
  }
  /** weapon swing whoosh — plays as the attacker lunges */
  swing(volume = 0.55) {
    // sampled whoosh — per-call rate variation keeps repeated swings organic
    this.play('whoosh', volume * 0.9, 0.92 + Math.random() * 0.18);
  }
  /** a clean miss — the swing sails through empty air */
  whiff(volume = 0.5) {
    this.play('whoosh_soft', volume, 0.9 + Math.random() * 0.15);
  }
  /** a dodge — quick airy swish as a target slips a blow */
  dodge(volume = 0.6) {
    this.play('dodge', volume, 0.95 + Math.random() * 0.12);
  }
  /** a blocked blow — metallic clank off armour or a raised shield */
  block(volume = 0.7) {
    this.play('block', volume, 0.94 + Math.random() * 0.12);
  }
  /** an arcane cast — produced shimmer-swell sample */
  cast(volume = 0.6) {
    this.play('cast_arcane', volume, 0.95 + Math.random() * 0.1);
  }
  /** per-element cast cue for the action-announce beat; `pitch` comes from
   *  presentationForSkill so two fire spells still sound distinct. */
  castCue(fx: string, volume = 0.85, pitch = 1) {
    const rate = Math.max(0.6, Math.min(1.6, pitch * (0.96 + Math.random() * 0.08)));
    switch (fx) {
      case 'fire': case 'fireball_cast': this.play('cast_fire', volume, rate); break;
      case 'ice': this.play('cast_ice', volume, rate); break;
      case 'holy': this.play('cast_holy', volume, rate); break;
      case 'heal': this.play('heal', volume, rate); break;
      case 'buff': this.play('cast_buff', volume, rate); break;
      case 'melee': case 'slash': this.play('whoosh', volume * 0.8, rate); break;
      case 'bash': case 'impact': case 'blood': this.play('hit_blunt', volume * 0.7, rate); break;
      case 'arrow': case 'ranged': this.play('arrow', volume, rate); break;
      default: this.play('cast_arcane', volume, rate);
    }
  }
  /** critical hit — layered real bell + metal slam */
  critHit(volume = 1) {
    this.play('crit_hit', volume, 0.95 + Math.random() * 0.1);
  }
  /** weapon impact — sample follows the damage type (blade / point / blunt / element) */
  hitImpact(kind: string, volume = 0.9) {
    const jitter = 0.95 + Math.random() * 0.1;
    switch (kind) {
      case 'slashing': this.play('hit_slash', volume, jitter); break;
      case 'piercing': this.play('hit_pierce', volume, jitter); break;
      case 'bludgeoning': this.play('hit_blunt', volume, jitter); break;
      case 'fire': this.play('fireball_impact', volume, jitter); break;
      case 'ice': case 'cold': this.play('ice_shatter', volume, jitter); break;
      case 'radiant': case 'necrotic': case 'force': case 'psychic':
        this.play('magic_missile', volume * 0.8, jitter * 0.85); break;
      case 'acid': case 'poison':
        this.play('hit_blunt', volume * 0.7, jitter * 0.7); break;
      default:
        this.play('hit_blunt', volume * 0.8, jitter * 0.92);
    }
  }
  /** short sting to open the boss fight */
  bossSting(volume = 1) {
    const notes = [110, 138.6, 164.8, 220];
    notes.forEach((n, i) => { this.beep(n, n, 0.5, volume * 0.3, 'sawtooth', i * 0.12); this.beep(n * 2, n * 2, 0.4, volume * 0.16, 'square', i * 0.12); });
    this.noiseBurst(0.5, volume * 0.4, 'lowpass', 1500, 200, this.sfxGain);
  }
  /** the warlord humming a jaunty little bath-time tune (whimsical, off-key) */
  sing(volume = 0.85) {
    if (!this.ctx || this.muted) return;
    // a cheery major phrase 'sung' in a warbly voice (triangle lead + low body)
    const mel: [number, number][] = [
      [392, 0], [523, 0.34], [659, 0.68], [523, 1.02],
      [587, 1.4], [523, 1.74], [440, 2.08], [392, 2.6],
    ];
    for (const [f, d] of mel) {
      this.beep(f, f * 1.015, 0.32, volume * 0.3, 'triangle', d);   // warbly lead
      this.beep(f * 0.5, f * 0.5, 0.34, volume * 0.14, 'sine', d);  // chesty body
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.9;
    if (this.ctx && this.muted) this.stopDungeonAmbience();
    return this.muted;
  }

  setMusicDucked(ducked: boolean) {
    if (!this.ctx) return;
    this.musicGain.gain.linearRampToValueAtTime(ducked ? 0.2 : 0.42, this.ctx.currentTime + 0.4);
    // also duck the adaptive gains so combat stays quiet when VO plays
    if (this.exploreGain) this.exploreGain.gain.linearRampToValueAtTime(ducked ? 0.2 : 0.42, this.ctx.currentTime + 0.4);
    if (this.combatGain && this.adaptive === 'combat') this.combatGain.gain.linearRampToValueAtTime(ducked ? 0.2 : 0.42, this.ctx.currentTime + 0.4);
  }

  /** AAA adaptive: crossfade explore ↔ combat. Called from combat phase events. */
  setAdaptiveState(state: 'explore' | 'combat', fadeSec = 1.2) {
    if (!this.ctx || !this.exploreGain || !this.combatGain) return;
    if (this.adaptive === state) return;
    this.adaptive = state;
    const now = this.ctx.currentTime;
    const base = this.musicGain?.gain.value ?? 0.42;
    this.exploreGain.gain.cancelScheduledValues(now);
    this.combatGain.gain.cancelScheduledValues(now);
    if (state === 'explore') {
      this.exploreGain.gain.linearRampToValueAtTime(base, now + fadeSec);
      this.combatGain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
    } else {
      this.exploreGain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      this.combatGain.gain.linearRampToValueAtTime(base, now + fadeSec);
      // ensure combat music buffer is warmed
      void this._loadBuffer('music_combat').then(() => {
        if (this.adaptive !== 'combat' || !this.ctx) return;
        if (!this.combatSource) {
          const buf = this.buffers.get('music_combat');
          if (!buf) return;
          const src = this.ctx.createBufferSource();
          src.buffer = buf; src.loop = true; src.connect(this.combatGain); src.start();
          this.combatSource = src;
        }
      });
    }
  }

  private ensureAdaptiveSources() {
    if (!this.ctx || !this.exploreGain || !this.combatGain) return;
    if (!this.exploreSource) {
      const buf = this.buffers.get('music_ambient');
      if (buf) {
        const src = this.ctx.createBufferSource();
        src.buffer = buf; src.loop = true; src.connect(this.exploreGain); src.start();
        this.exploreSource = src;
      }
    }
    if (!this.combatSource) {
      const buf = this.buffers.get('music_combat');
      if (buf) {
        const src = this.ctx.createBufferSource();
        src.buffer = buf; src.loop = true; src.connect(this.combatGain); src.start();
        this.combatSource = src;
      }
    }
  }

  /** apply the global settings (volumes + mute). Safe to call before init()
   *  (the values are stored and applied once the AudioContext + gain graph
   *  exist). NOTE: `init()` assigns `ctx` *before* the `await ctx.resume()`,
   *  but the gain nodes are created *after* that await — so guard on the
   *  gain graph, not just `ctx`, or a synchronous caller (e.g. the ?debug
   *  editor entry) would deref an undefined gain node. */
  applySettings(s: GameSettings) {
    this.muted = s.muted;
    if (!this.master || !this.sfxGain || !this.musicGain) return;
    this.master.gain.value = s.muted ? 0 : s.master;
    this.sfxGain.gain.value = s.sfx;
    this.musicGain.gain.value = s.music;
    if (this.exploreGain) this.exploreGain.gain.value = s.muted ? 0 : (this.adaptive === 'explore' ? s.music : 0.0001);
    if (this.combatGain) this.combatGain.gain.value = s.muted ? 0 : (this.adaptive === 'combat' ? s.music : 0.0001);
  }
}
