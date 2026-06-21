/**
 * Dialogue — hologram folio with a character-by-character typewriter. Advance a
 * line with E, skip the whole exchange with Space. The caller polls `active` and
 * pumps key edges via `advance()` / `skip()`; `update(delta)` types.
 */
export class Dialogue {
  constructor() {
    this.box = document.getElementById('dialogue');
    this.speakerEl = document.getElementById('dialogue-speaker');
    this.textEl = document.getElementById('dialogue-text');
    this.active = false;
    this.lines = [];
    this.i = 0;
    this.shown = 0;     // characters revealed
    this.speed = 38;    // chars / second
    this.onDone = null;
  }

  /** @param {string} speaker @param {string[]} lines @param {()=>void} [onDone] */
  show(speaker, lines, onDone) {
    this.speakerEl.textContent = speaker;
    this.lines = lines;
    this.i = 0;
    this.shown = 0;
    this.onDone = onDone;
    this.active = true;
    this.box.classList.remove('hidden');
    this._renderLine();
  }

  _current() { return this.lines[this.i] || ''; }

  _renderLine() {
    const full = this._current();
    const text = full.slice(0, Math.floor(this.shown));
    const typing = this.shown < full.length;
    this.textEl.innerHTML = text + (typing ? '<span class="caret">▍</span>' : '');
  }

  update(delta) {
    if (!this.active) return;
    if (this.shown < this._current().length) {
      this.shown += this.speed * delta;
      this._renderLine();
    }
  }

  /** E: finish the current line if still typing, else advance to the next. */
  advance() {
    if (!this.active) return;
    if (this.shown < this._current().length) {
      this.shown = this._current().length;
      this._renderLine();
      return;
    }
    this.i++;
    if (this.i >= this.lines.length) { this._end(); return; }
    this.shown = 0;
    this._renderLine();
  }

  /** Space: end the whole exchange immediately. */
  skip() { if (this.active) this._end(); }

  _end() {
    this.active = false;
    this.box.classList.add('hidden');
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }
}
