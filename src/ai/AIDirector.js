import { gameState } from '../data/gameState.js';
import { ZG_PROXY_URL, ZG_ENABLED } from '../core/config.js';

/**
 * AIDirector — the client side of the Ember's voice.
 *
 * It turns game moments (entering a realm, a boss waking, dying, claiming an
 * ember) into 0G Compute inference via the proxy, then whispers the returned
 * lines onto the HUD. Everything is async and best-effort: if 0G or the proxy is
 * unreachable it shows curated fallback lines, so gameplay is never blocked.
 */
const TIMEOUT_MS = 7000;
const LINE_MS = 5200; // how long each whispered line lingers

const FALLBACK = {
  briefing: ['The dark here remembers fire.', 'Find the pillar. Wake its keeper. Take what burns.'],
  boss: ['It wakes. Do not flinch.', 'Strike the glow — nowhere else will bite.'],
  death: ['Ash, then. Rise.', 'The gate reforges you. Do not waste it twice.'],
  ember: ['One more flame against the long night.', 'Hold it close. The others still sleep.'],
};

export class AIDirector {
  constructor(hud) {
    this.hud = hud;
    this.enabled = ZG_ENABLED;
    this._token = 0;          // latest-request wins; stale replies are dropped
    this._timers = [];
  }

  // --- public moments ---
  briefRealm(realm) {
    this._run('briefing', {
      realmName: realm?.name, realmSub: realm?.sub, realmIndex: realm?.index,
    });
  }
  bossTaunt(bossName, realm) {
    this._run('boss', { bossName, realmName: realm?.name, realmSub: realm?.sub, realmIndex: realm?.index });
  }
  reactToDeath(realm) {
    this._run('death', { realmName: realm?.name, realmSub: realm?.sub, realmIndex: realm?.index });
  }
  reactToEmber(realm, emberLabel) {
    this._run('ember', { realmName: realm?.name, realmSub: realm?.sub, realmIndex: realm?.index, emberLabel });
  }

  // --- internals ---
  _context(extra) {
    return {
      embersSecured: gameState.embers.length,
      totalEmbers: 5,
      killsTotal: gameState.kills?.total ?? 0,
      completedRealms: gameState.completedRealms?.length ?? 0,
      ...extra,
    };
  }

  async _run(event, extra) {
    if (!this.enabled) return;
    const token = ++this._token;
    let lines = FALLBACK[event] || [];
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(`${ZG_PROXY_URL}/api/ember`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, context: this._context(extra) }),
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.lines) && data.lines.length) lines = data.lines;
      }
    } catch {
      /* proxy down — fall through to curated lines */
    }
    if (token === this._token) this._speak(lines);
  }

  /** Whisper lines one after another; a newer moment cancels pending ones. */
  _speak(lines) {
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
    lines.forEach((line, i) => {
      if (i === 0) { this.hud.emberWhisper(line, LINE_MS); return; }
      this._timers.push(setTimeout(() => this.hud.emberWhisper(line, LINE_MS), i * LINE_MS));
    });
  }
}
