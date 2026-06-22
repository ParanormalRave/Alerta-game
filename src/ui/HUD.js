/**
 * HUD — binds the Ember Almanac DOM (index.html) to game state. No layout here;
 * just state → element. Per-realm hue is applied by writing --accent on <body>.
 */
const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];

export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      health: $('health-fill'), healthNum: $('health-num'),
      stamina: $('stamina-fill'), staminaNum: $('stamina-num'),
      sigils: [...document.querySelectorAll('#register .sigil')],
      armName: $('arm-name'), armSlot: $('arm-slot'), armFig: $('arm-fig'),
      prompt: $('prompt'), promptText: $('prompt-text'),
      vignette: $('vignette'),
      boss: $('boss'), bossName: $('boss-name'), bossWeak: $('boss-weak'), bossFill: $('boss-fill'),
      tally: $('tally'), tallyPct: $('tally-pct'),
      chapter: $('chapter'), chapterNo: $('chapter-no'), chapterTitle: $('chapter-title'), chapterSub: $('chapter-sub'),
      fade: $('fade'),
      mapFrame: $('map-frame'), mapRealm: $('map-realm'),
      objective: $('objective'), deathNote: $('death-note'),
      briefing: $('briefing-lock'),
      ember: $('ember-whisper'), emberText: $('ember-whisper')?.querySelector('.ew-text'),
      loadout: $('loadout'), loadoutList: $('loadout')?.querySelector('.lo-list'),
    };
    this._vigT = 0;
    this._chapterTimer = 0;
    this._briefingOn = false;
    this.loadoutPinned = false; // L keeps it open; otherwise it flashes on switch
  }

  /** Show/hide the "you can't move yet" briefing banner. */
  setBriefing(on) {
    if (on === this._briefingOn || !this.el.briefing) return;
    this._briefingOn = on;
    this.el.briefing.classList.toggle('show', on);
    document.body.classList.toggle('briefing', on);
  }

  setAccent(css) { document.body.style.setProperty('--accent', css); }

  setHealth(cur, max) {
    const frac = Math.max(0, cur / max);
    this.el.health.style.transform = `scaleX(${frac})`;
    this.el.healthNum.textContent = Math.max(0, Math.round(cur));
    // make low HP unmistakable: pulsing red plate + screen edge
    const low = frac > 0 && frac <= 0.3;
    if (low !== this._lowHp) {
      this._lowHp = low;
      document.body.classList.toggle('low-hp', low);
    }
  }
  setStamina(cur, max) {
    this.el.stamina.style.transform = `scaleX(${Math.max(0, cur / max)})`;
    this.el.staminaNum.textContent = Math.round(cur);
  }

  setEmbers(count) {
    this.el.sigils.forEach((s, i) => s.classList.toggle('filled', i < count));
  }

  setWeapon(name, slot, figure) {
    this.el.armName.textContent = name;
    this.el.armSlot.textContent = ROMAN[slot] || slot;
    this.el.armFig.textContent = figure;
  }

  showPrompt(text) { this.el.promptText.textContent = text; this.el.prompt.classList.add('show'); }
  hidePrompt() { this.el.prompt.classList.remove('show'); }

  damageFlash() { this._flash('hit'); }
  criticalFlash() { this._flash('critical'); }
  healFlash() { this._flash('heal'); }
  _flash(cls) {
    this.el.vignette.classList.add(cls);
    clearTimeout(this[`_${cls}T`]);
    this[`_${cls}T`] = setTimeout(() => this.el.vignette.classList.remove(cls), 120);
  }

  // --- boss meter ---
  showBoss(name, weak) {
    this.el.bossName.textContent = name;
    this.el.bossWeak.textContent = weak;
    this.el.bossFill.style.transform = 'scaleX(1)';
    this.el.boss.classList.remove('hidden');
  }
  setBossHealth(frac) { this.el.bossFill.style.transform = `scaleX(${frac})`; }
  hideBoss() { this.el.boss.classList.add('hidden'); }
  flashWeak() {
    this.el.bossWeak.style.color = '#fff';
    setTimeout(() => (this.el.bossWeak.style.color = ''), 120);
  }

  // --- convergence tally (realm 5) ---
  showTally(pct) { this.el.tallyPct.textContent = Math.floor(pct); this.el.tally.classList.remove('hidden'); }
  hideTally() { this.el.tally.classList.add('hidden'); }

  // --- chapter card ---
  showChapter(roman, title, sub) {
    const c = this.el;
    c.chapterNo.textContent = roman;
    c.chapterTitle.textContent = title;
    c.chapterSub.textContent = sub;
    c.chapter.classList.remove('hidden', 'show');
    void c.chapter.offsetWidth; // restart animation
    c.chapter.classList.add('show');
    clearTimeout(this._chapterTimer);
    this._chapterTimer = setTimeout(() => c.chapter.classList.add('hidden'), 4300);
  }

  setMapRealm(name) { this.el.mapRealm.textContent = name; }
  toggleMap() { this.el.mapFrame.classList.toggle('off'); }

  // --- armory / loadout list ---
  _renderLoadout(entries) {
    if (!this.el.loadoutList) return;
    this.el.loadoutList.innerHTML = entries.map((e) => (
      `<li class="lo-row${e.owned ? '' : ' locked'}${e.current ? ' active' : ''}">` +
      `<span class="lo-slot">${e.slot}</span>` +
      `<span class="lo-name">${e.name}</span>` +
      `<span class="lo-type">${e.owned ? e.type : 'locked'}</span></li>`
    )).join('');
  }

  /** Briefly show the armory on weapon switch (unless pinned open via L). */
  flashLoadout(entries, ms = 1800) {
    if (!this.el.loadout) return;
    this._renderLoadout(entries);
    if (this.loadoutPinned) return; // pinned: already visible, just refreshed
    this.el.loadout.classList.add('show');
    clearTimeout(this._loadoutT);
    this._loadoutT = setTimeout(() => this.el.loadout.classList.remove('show'), ms);
  }

  /** L: pin the armory open / closed. */
  toggleLoadout(entries) {
    if (!this.el.loadout) return;
    this.loadoutPinned = !this.loadoutPinned;
    this._renderLoadout(entries);
    clearTimeout(this._loadoutT);
    this.el.loadout.classList.toggle('show', this.loadoutPinned);
  }

  get loadoutVisible() { return this.loadoutPinned; }

  /** The Ember's AI voice (0G Compute). Non-blocking; auto-fades after `ms`. */
  emberWhisper(text, ms = 5200) {
    const e = this.el.ember;
    if (!e || !this.el.emberText) return;
    this.el.emberText.textContent = text;
    e.classList.remove('show');
    void e.offsetWidth; // restart the fade-in
    e.classList.add('show');
    clearTimeout(this._emberT);
    this._emberT = setTimeout(() => e.classList.remove('show'), ms);
  }

  // --- transitions ---
  fadeOut() { return new Promise((r) => { this.el.fade.classList.add('show'); setTimeout(r, 520); }); }
  fadeIn() { this.el.fade.classList.remove('show'); }
  whiteFlash() {
    this.el.fade.classList.add('flash');
    setTimeout(() => { this.el.fade.classList.remove('flash'); this.el.fade.classList.remove('show'); }, 500);
  }

  setObjective(text) {
    const o = this.el.objective;
    if (!o) return;
    o.textContent = text;
    // restart the punch-in → hold → fade-out animation each time it changes
    o.classList.remove('show');
    void o.offsetWidth;
    o.classList.add('show');
  }

  showDeath() {
    this.el.deathNote?.classList.remove('hidden');
    clearTimeout(this._deathT);
    this._deathT = setTimeout(() => this.el.deathNote?.classList.add('hidden'), 900);
  }

  shake(ms = 180) {
    document.body.classList.remove('shake');
    void document.body.offsetWidth;
    document.body.classList.add('shake');
    clearTimeout(this._shakeT);
    this._shakeT = setTimeout(() => document.body.classList.remove('shake'), ms);
  }
}
