import { gameState, resetState, refreshPortalUnlocks } from '../data/gameState.js';
import { ZG_PROXY_URL, ZG_ENABLED } from './config.js';

const KEY = 'zoal.save.v1';
const TS_KEY = 'zoal.save.ts';
const ID_KEY = 'zoal.player.id';

/** Only persistent fields are serialized; transient run state is rebuilt on load. */
const PERSIST = [
  'embers', 'unlockedPortals', 'completedRealms',
  'inventory', 'passiveUpgrades', 'skyboxState', 'kills',
];

function snapshot() {
  const data = {};
  for (const k of PERSIST) data[k] = gameState[k];
  return data;
}

export const SaveSystem = {
  /** Stable anonymous id so a player can pull their cloud save on any device. */
  playerId() {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() || `p_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  },

  save() {
    const ts = Date.now();
    try {
      const data = snapshot();
      localStorage.setItem(KEY, JSON.stringify(data));
      localStorage.setItem(TS_KEY, String(ts));
      this._cloudPush(data); // fire-and-forget upload to 0G Storage
    } catch (e) {
      console.warn('[save] failed', e);
    }
  },

  /** @returns {boolean} true if an existing LOCAL save was loaded (instant boot). */
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      resetState(JSON.parse(raw));
      refreshPortalUnlocks();
      return true;
    } catch (e) {
      console.warn('[save] load failed, starting fresh', e);
      return false;
    }
  },

  newGame() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(TS_KEY);
    resetState();
  },

  has() {
    return !!localStorage.getItem(KEY);
  },

  // ---------- 0G Storage (decentralized saves) ----------

  /** Upload the save blob to 0G Storage via the proxy. Best-effort. */
  async _cloudPush(data) {
    if (!ZG_ENABLED) return;
    try {
      const res = await fetch(`${ZG_PROXY_URL}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: this.playerId(), data }),
      });
      const json = await res.json().catch(() => ({}));
      const ref = json.txHash || json.rootHash;
      if (json.ok && ref) {
        localStorage.setItem('zoal.save.ref', ref);
        console.log(`[0G] progress saved on 0G Chain · tx ${ref}`, json.explorer || '');
      }
    } catch {
      /* proxy down — localStorage already holds the save */
    }
  },

  /**
   * Pull the latest cloud save by playerId and adopt it if it's newer than the
   * local copy (e.g. fresh device, or progress made elsewhere). Only applies
   * while still at the hub so it never disrupts an in-progress run.
   * @param {() => void} [onApplied] re-apply derived state (weapons, HUD).
   */
  async cloudSync(onApplied) {
    if (!ZG_ENABLED) return false;
    try {
      const res = await fetch(`${ZG_PROXY_URL}/api/load?playerId=${encodeURIComponent(this.playerId())}`);
      const json = await res.json().catch(() => ({}));
      if (!json.ok || !json.found || !json.data) return false;

      const cloudTs = Number(json.ts || 0);
      const localTs = Number(localStorage.getItem(TS_KEY) || 0);
      if (cloudTs <= localTs) return false;          // local is as new or newer
      if (gameState.currentScene !== 'hub') return false; // don't disrupt a run

      resetState(json.data);
      refreshPortalUnlocks();
      localStorage.setItem(KEY, JSON.stringify(json.data));
      localStorage.setItem(TS_KEY, String(cloudTs));
      const ref = json.txHash || json.rootHash;
      if (ref) localStorage.setItem('zoal.save.ref', ref);
      console.log(`[0G] adopted on-chain save · tx ${ref || '(unknown)'}`);
      onApplied?.();
      return true;
    } catch {
      return false;
    }
  },
};
