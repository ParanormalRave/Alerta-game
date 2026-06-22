import { Howl, Howler } from 'howler';

/**
 * AudioManager — thin Howler wrapper that stays silent when files are missing.
 *
 * Sounds are created lazily on first play and any load error is swallowed, so
 * the game runs with an empty /public/audio/ folder and starts making noise the
 * moment real files are dropped in. Music cross-fades on scene change.
 */
const SFX = {
  sword_swing: 'sfx_sword_swing.wav',
  sword_hit: 'sfx_sword_hit.wav',
  bow_shoot: 'sfx_bow_shoot.wav',
  footstep_ash: 'sfx_footstep_ash.wav',
  footstep_water: 'sfx_footstep_water.wav',
  footstep_metal: 'sfx_footstep_metal.wav',
  portal_open: 'sfx_portal_open.wav',
  ember_extract: 'sfx_ember_extract.wav',
  heal_wave: 'sfx_heal_wave.wav',
  boss_roar: 'sfx_boss_roar.wav',
  player_hit: 'sfx_player_hit.wav',
  player_death: 'sfx_player_death.wav',
  conqueror_intercom: 'sfx_conqueror_intercom.wav',
};

const MUSIC = {
  hub: 'music_hub.mp3',
  realm1: 'music_realm1.mp3',
  realm2: 'music_realm2.mp3',
  realm3: 'music_realm3.mp3',
  realm4: 'music_realm4.mp3',
  realm5: 'music_realm5.mp3',
  boss: 'music_boss.mp3',
  ending: 'music_ending.mp3',
};

export class AudioManager {
  constructor(base = '/audio/') {
    this.base = base;
    this.sfx = new Map();    // name -> Howl
    this.music = new Map();  // name -> Howl
    this.current = null;
    this.musicVol = 0.5;
    this.enabled = true;
    this._ctx = null;
    this._fallbackMusic = null;
    this._fallbackMusicName = null;
    this._lastSfx = new Map();
  }

  _ensureCtx() {
    if (this._ctx) return this._ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this._ctx = new Ctx();
    return this._ctx;
  }

  _resumeCtx() {
    const ctx = this._ensureCtx();
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  _get(map, table, name) {
    if (map.has(name)) return map.get(name);
    const file = table[name];
    if (!file) return null;
    const howl = new Howl({
      src: [this.base + file],
      volume: map === this.music ? 0 : 0.7,
      loop: map === this.music,
      html5: map === this.music, // stream music
      onloaderror: () => { howl._missing = true; },
      onplayerror: () => {},
    });
    map.set(name, howl);
    return howl;
  }

  play(name, { volume = 0.7, rate = 1 } = {}) {
    if (!this.enabled) return;
    const h = this._get(this.sfx, SFX, name);
    if (!h || h._missing) {
      this._fallbackSfx(name, volume, rate);
      return;
    }
    const id = h.play();
    h.volume(volume, id);
    h.rate(rate, id);
  }

  /** Cross-fade to a music track (no-op if its file is absent). */
  playMusic(name, fade = 1200) {
    if (!this.enabled) return;
    const next = this._get(this.music, MUSIC, name);
    if (this.current === next) return;
    const prev = this.current;
    this.current = next;
    if (prev && !prev._missing) {
      prev.fade(prev.volume(), 0, fade);
      const stopId = setTimeout(() => prev.stop(), fade);
      prev._stopId = stopId;
    }
    if (next && !next._missing) {
      this._stopFallbackMusic(fade);
      if (!next.playing()) next.play();
      next.fade(0, this.musicVol, fade);
    } else {
      this._startFallbackMusic(name, fade);
    }
  }

  setMute(muted) {
    this.enabled = !muted;
    Howler.mute(muted);
    const ctx = this._ctx;
    if (muted) this._stopFallbackMusic(80);
    else if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
  }

  _fallbackSfx(name, volume, rate) {
    const now = performance.now();
    const last = this._lastSfx.get(name) || 0;
    if (now - last < 28) return;
    this._lastSfx.set(name, now);

    const ctx = this._resumeCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = Math.min(0.45, volume * 0.35);

    const env = (gain, peak, dur) => {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    };
    const tone = (freq, dur, type = 'sine', peak = v, endFreq = freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq * rate, t);
      if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq * rate), t + dur);
      env(gain, peak, dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    };
    const noise = (dur, peak = v, filterFreq = 900) => {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(filterFreq, t);
      filter.Q.setValueAtTime(0.9, t);
      env(gain, peak, dur);
      src.buffer = buffer;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(t);
      src.stop(t + dur + 0.03);
    };

    switch (name) {
      case 'sword_swing': noise(0.13, v * 0.9, 950); break;
      case 'sword_hit': tone(135, 0.09, 'square', v * 0.7, 80); noise(0.08, v * 0.5, 420); break;
      case 'bow_shoot': tone(620, 0.08, 'triangle', v * 0.8, 260); break;
      case 'footstep_water': noise(0.08, v * 0.35, 260); break;
      case 'footstep_metal': tone(180, 0.07, 'square', v * 0.3, 120); break;
      case 'footstep_ash': noise(0.07, v * 0.25, 180); break;
      case 'portal_open': tone(220, 0.35, 'sine', v * 0.7, 660); break;
      case 'ember_extract': tone(330, 0.28, 'triangle', v * 0.9, 880); break;
      case 'heal_wave': tone(260, 0.45, 'sine', v * 0.7, 520); break;
      case 'boss_roar': tone(90, 0.38, 'sawtooth', v * 0.8, 45); noise(0.28, v * 0.5, 120); break;
      case 'player_death': tone(220, 0.55, 'sawtooth', v * 0.8, 55); break;
      case 'conqueror_intercom': tone(150, 0.22, 'sawtooth', v * 0.35, 110); break;
      case 'player_hit':
      default: noise(0.09, v * 0.55, 320); break;
    }
  }

  _startFallbackMusic(name, fade = 800) {
    if (this._fallbackMusicName === name && this._fallbackMusic) return;
    this._stopFallbackMusic(120);
    const ctx = this._resumeCtx();
    if (!ctx) return;

    const palette = {
      hub: [110, 165],
      realm1: [82, 123],
      realm2: [98, 147],
      realm3: [73, 110],
      realm4: [61, 92],
      realm5: [55, 110],
      boss: [46, 69],
      ending: [130, 195],
    }[name] || [90, 135];

    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.musicVol * 0.16), t + fade / 1000);
    master.connect(ctx.destination);

    const makeOsc = (freq, type, detune = 0) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      gain.gain.value = type === 'sine' ? 0.65 : 0.18;
      osc.connect(gain).connect(master);
      osc.start(t);
      return osc;
    };

    const osc = [
      makeOsc(palette[0], 'sine'),
      makeOsc(palette[1], 'triangle', -6),
      makeOsc(palette[0] * 0.5, 'sine', 4),
    ];
    this._fallbackMusic = { master, osc };
    this._fallbackMusicName = name;
  }

  _stopFallbackMusic(fade = 300) {
    const m = this._fallbackMusic;
    if (!m || !this._ctx) return;
    const t = this._ctx.currentTime;
    m.master.gain.cancelScheduledValues(t);
    m.master.gain.setValueAtTime(Math.max(0.0001, m.master.gain.value), t);
    m.master.gain.exponentialRampToValueAtTime(0.0001, t + fade / 1000);
    setTimeout(() => {
      for (const o of m.osc) {
        try { o.stop(); } catch {}
      }
      m.master.disconnect();
    }, fade + 60);
    this._fallbackMusic = null;
    this._fallbackMusicName = null;
  }
}
