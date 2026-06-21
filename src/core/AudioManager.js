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
    if (!h || h._missing) return;
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
      if (!next.playing()) next.play();
      next.fade(0, this.musicVol, fade);
    }
  }

  setMute(muted) {
    this.enabled = !muted;
    Howler.mute(muted);
  }
}
