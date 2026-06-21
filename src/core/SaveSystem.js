import { gameState, resetState, refreshPortalUnlocks } from '../data/gameState.js';

const KEY = 'zoal.save.v1';

/** Only persistent fields are serialized; transient run state is rebuilt on load. */
const PERSIST = [
  'embers', 'unlockedPortals', 'completedRealms',
  'inventory', 'passiveUpgrades', 'skyboxState', 'kills',
];

export const SaveSystem = {
  save() {
    try {
      const data = {};
      for (const k of PERSIST) data[k] = gameState[k];
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[save] failed', e);
    }
  },

  /** @returns {boolean} true if an existing save was loaded */
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      resetState(data);
      refreshPortalUnlocks();
      return true;
    } catch (e) {
      console.warn('[save] load failed, starting fresh', e);
      return false;
    }
  },

  newGame() {
    localStorage.removeItem(KEY);
    resetState();
  },

  has() {
    return !!localStorage.getItem(KEY);
  },
};
