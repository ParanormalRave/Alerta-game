/**
 * gameState — the single mutable source of truth for run progress.
 *
 * Persistent fields are serialized by SaveSystem (localStorage). Transient
 * run fields (current scene, kills-this-realm) are reset on load and not saved.
 */

export const REALM_KEYS = ['cinderwood', 'drowned', 'iron', 'voidmarsh', 'convergence'];

/** Portal n unlocks once its prerequisites are met (see SceneManager). */
export const PORTAL_RULES = {
  1: () => true,
  2: (g) => g.completedRealms.includes(1),
  3: (g) => g.completedRealms.includes(1),
  4: (g) => g.completedRealms.includes(2) && g.completedRealms.includes(3),
  5: (g) => g.completedRealms.includes(4),
};

function freshState() {
  return {
    // --- persistent ---
    embers: [],              // realm indices whose ember is secured, e.g. [1,3]
    unlockedPortals: [1],
    completedRealms: [],     // realm indices fully cleared (ember + boss)
    inventory: [],           // weapon ids owned (filled at boot from loadout)
    passiveUpgrades: [],     // upgrade ids, most-recent last
    skyboxState: 0,          // 0..5, == embers.length for hub viewport
    kills: { total: 0, byRealm: {} },

    // --- transient run state (never saved) ---
    currentScene: 'hub',     // 'hub' | realm index 1..5
    realmKills: 0,
    realmTotal: 0,
  };
}

export const gameState = freshState();

/** Replace all fields in-place (used by SaveSystem.load and New Game). */
export function resetState(into = {}) {
  Object.assign(gameState, freshState(), into);
}

export function hasEmber(realmIndex) {
  return gameState.embers.includes(realmIndex);
}

export function secureEmber(realmIndex) {
  if (!hasEmber(realmIndex)) {
    gameState.embers.push(realmIndex);
    gameState.skyboxState = Math.min(5, gameState.embers.length);
  }
}

export function recordKill(realmIndex) {
  gameState.kills.total++;
  gameState.kills.byRealm[realmIndex] = (gameState.kills.byRealm[realmIndex] || 0) + 1;
  gameState.realmKills++;
}

export function isPortalUnlocked(n) {
  return PORTAL_RULES[n] ? PORTAL_RULES[n](gameState) : false;
}

export function refreshPortalUnlocks() {
  for (let n = 1; n <= 5; n++) {
    if (isPortalUnlocked(n) && !gameState.unlockedPortals.includes(n)) {
      gameState.unlockedPortals.push(n);
    }
  }
}
