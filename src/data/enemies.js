/**
 * Enemy + boss stat config — single source of truth.
 *
 * `accent`/`color` drive the placeholder capsule + particle death puff until a
 * GLB (`model`) is dropped into /public/models/, at which point AssetLoader
 * swaps it in with no logic change. `shape` hints the placeholder silhouette.
 */

/**
 * Global balance knob: regular-enemy hits were draining the player's 100 HP far
 * too fast (no health regen during play), so all enemy attack damage is scaled
 * by this before it reaches the player. The per-enemy `damage` values below stay
 * as the design intent; tweak this single number to make foes hit harder/softer.
 * (Bosses are NOT affected — they use their own `damage` directly.)
 */
export const ENEMY_DAMAGE_SCALE = 0.5;

export const ENEMIES = {
  ashling: {
    id: 'ashling', name: 'Ashling', model: 'alien_hominid.glb', fitSize: 2.0, shape: 'humanoid',
    health: 40, speed: 3.4, damage: 8, detect: 16, attackRange: 1.8, attackCd: 1.1,
    color: 0x4a3b30, accent: 0xff5a1e, death: 'ash',
  },
  coal_golem: {
    id: 'coal_golem', name: 'Coal Golem', model: 'under_world_demon.glb', fitSize: 3.2, shape: 'brute',
    health: 140, speed: 1.8, damage: 20, detect: 18, attackRange: 2.6, attackCd: 1.8,
    color: 0x2b2724, accent: 0xff7a2a, death: 'ember',
  },
  ink_wraith: {
    id: 'ink_wraith', name: 'Ink Wraith', model: 'halloween_creature.glb', fitSize: 2.0, shape: 'wraith',
    health: 55, speed: 3.0, damage: 12, detect: 20, attackRange: 2.2, attackCd: 1.3,
    color: 0x16243a, accent: 0x49b0ff, death: 'water', float: true,
  },
  tide_construct: {
    id: 'tide_construct', name: 'Tide Construct', model: 'ice_creature.glb', fitSize: 2.6, shape: 'brute',
    health: 120, speed: 2.2, damage: 18, detect: 18, attackRange: 2.4, attackCd: 1.6,
    color: 0x1f4a5c, accent: 0x6fe0ff, death: 'water',
  },
  automaton: {
    id: 'automaton', name: 'Automaton', model: 'cyber_creature_by_oscar_creativo.glb', fitSize: 2.6, shape: 'humanoid',
    health: 90, speed: 2.8, damage: 16, detect: 22, attackRange: 2.0, attackCd: 1.0,
    color: 0x5a4632, accent: 0xffb347, death: 'ember',
  },
  shell_crawler: {
    id: 'shell_crawler', name: 'Shell Crawler', model: 'ice_creature.glb', fitSize: 1.8, shape: 'crawler',
    health: 60, speed: 3.8, damage: 12, detect: 16, attackRange: 1.6, attackCd: 0.9,
    color: 0x4a3a2a, accent: 0xff9a3a, death: 'ember',
  },
  drift_shade: {
    id: 'drift_shade', name: 'Drift Shade', model: 'void_creature.glb', fitSize: 2.4, shape: 'wraith',
    health: 70, speed: 3.6, damage: 14, detect: 22, attackRange: 2.0, attackCd: 1.1,
    color: 0x251640, accent: 0x9a5cff, death: 'void', float: true,
  },
  phase_hunter: {
    id: 'phase_hunter', name: 'Phase Hunter', model: 'alien_hominid.glb', fitSize: 2.3, shape: 'humanoid',
    health: 100, speed: 4.2, damage: 18, detect: 24, attackRange: 2.2, attackCd: 1.0,
    color: 0x2a1a4a, accent: 0xc06bff, death: 'void',
  },
};

/**
 * Bosses — extended HP, 3 phases (transitions at 66% / 33%), a named weak point,
 * and a `pattern` list the BossBase cycles through per phase.
 */
export const BOSSES = {
  smolder_stag: {
    id: 'smolder_stag', name: 'The Smolder Stag', model: 'under_world_demon.glb', fitSize: 5.0,
    health: 600, speed: 3.2, damage: 24, weak: 'ember gem · forehead', accent: 0xff5a1e,
    color: 0x3a2218, scale: 2.4, death: 'ember',
    phases: [['charge', 'stomp'], ['summon', 'charge'], ['firering', 'stomp']],
  },
  archivist: {
    id: 'archivist', name: 'The Archivist', model: 'ice_creature.glb', fitSize: 5.0,
    health: 680, speed: 2.4, damage: 22, weak: 'exposed spine', accent: 0x6fe0ff,
    color: 0x1a3346, scale: 2.2, death: 'water', float: true,
    phases: [['waterbolt', 'flood'], ['summon', 'waterbolt'], ['flood', 'summon']],
  },
  warlord_engine: {
    id: 'warlord_engine', name: 'The Warlord Engine', model: 'cyber_creature_by_oscar_creativo.glb', fitSize: 6.0,
    health: 820, speed: 1.6, damage: 28, weak: 'cockpit glass', accent: 0xffb347,
    color: 0x3a2c1c, scale: 3.0, death: 'ember',
    phases: [['cannon', 'stomp'], ['drones', 'cannon'], ['beam', 'drones']],
  },
  pale_twin: {
    id: 'pale_twin', name: 'The Pale Twin', model: 'under_world_demon.glb', fitSize: 3.0,
    health: 560, speed: 4.2, damage: 22, weak: 'back of the neck', accent: 0x9a5cff,
    color: 0x2a1a4a, scale: 1.0, death: 'void',
    phases: [['mirror', 'charge'], ['invert', 'mirror'], ['split', 'charge']],
  },
  conqueror: {
    // Drop a real boss_conqueror.glb into /public/models/ to override this; until
    // then the demon stands in (scaled large) instead of a primitive capsule.
    id: 'conqueror', name: 'The Conqueror', model: 'under_world_demon.glb', fitSize: 6.5,
    health: 1400, speed: 2.8, damage: 30, weak: 'chest core', accent: 0xff5a1e,
    color: 0x2a1c2c, scale: 3.4, death: 'ember',
    phases: [['barrage', 'charge'], ['blasts', 'barrage'], ['summonall', 'beam']],
  },
};
