/**
 * Realm definitions — data drives RealmScene so the five zones share one engine
 * but read as distinct places. `biome` keys into world/voxels BIOMES. `accent`
 * is the CSS hue applied to the whole almanac UI while in the realm. `sky` is a
 * three-stop gradient (top / horizon / bottom) for the procedural dome.
 *
 * `props` reference GLBs that AssetLoader swaps in when present; `count` is how
 * many to scatter. `enemies` is the spawn table; `boss` keys into BOSSES.
 */

export const HUB = {
  key: 'hub',
  name: 'The Mothership',
  sub: 'a crashed and wounded god',
  accent: '#ff5a1e',
  // hub viewport sky cycles through 6 states by embers secured (see SkyboxManager)
};

export const REALMS = {
  1: {
    index: 1, key: 'cinderwood', roman: 'realm i',
    name: 'Cinderwood', sub: 'the ashen forest',
    biome: 'cinderwood', accent: '#ff5a1e',
    terrain: 'voxel',   // the first world is blocky/voxel; the rest are triangle
    // A semi-boss (the Smolder Stag) guards the Fire Ember — fell it, then claim
    // the ember to open the next two gates.
    sky: { top: '#2a0f08', horizon: '#7a2410', bottom: '#1a0a06', fog: '#3a160c' },
    ember: { label: 'the Fire Ember', tint: 0xff5a1e },
    enemies: [
      { type: 'ashling', count: 8 },
      { type: 'coal_golem', count: 3 },
    ],
    boss: 'smolder_stag',
    props: [
      { model: 'psx_dead_tree_pack.glb', fitSize: 4.0, shape: 'tree', count: 30, color: 0x261c14, collide: 0.6 },
      { model: 'rocks_set2.glb', fitSize: 2.4, shape: 'rock', count: 16, color: 0x3a2218, collide: 1.1 },
      { model: 'human_skeleton.glb', fitSize: 1.8, shape: 'box', count: 10, color: 0xb8b0a0 },
      { model: 'glowing_gem.glb', fitSize: 1.3, shape: 'crystal', count: 8, color: 0x3a2218, glow: 0xff5a1e, collide: 0.7 },
    ],
  },
  2: {
    index: 2, key: 'drowned', roman: 'realm ii',
    name: 'The Drowned Archive', sub: 'the sunken library',
    biome: 'drowned', accent: '#6fe0ff',
    sky: { top: '#0a1430', horizon: '#26407a', bottom: '#060b1c', fog: '#122448' },
    ember: { label: 'the Water Ember', tint: 0x6fe0ff },
    enemies: [
      { type: 'ink_wraith', count: 8 },
      { type: 'tide_construct', count: 3 },
    ],
    boss: 'archivist',
    props: [
      { model: 'rocks_set_3.glb', fitSize: 2.8, shape: 'pillar', count: 18, color: 0x46506a, collide: 1.0 },
      { model: 'low_poly_crystal.glb', fitSize: 1.4, shape: 'crystal', count: 14, color: 0x2c3a4a, glow: 0x6fe0ff, collide: 0.7 },
      { model: 'low_poly_skeleton.glb', fitSize: 1.8, shape: 'box', count: 8, color: 0x9aa8b0 },
    ],
  },
  3: {
    index: 3, key: 'iron', roman: 'realm iii',
    name: 'The Iron Wastes', sub: 'a battlefield that never ended',
    biome: 'iron', accent: '#ffb347',
    sky: { top: '#211a12', horizon: '#6a4a22', bottom: '#14100a', fog: '#352718' },
    ember: { label: 'the Force Ember', tint: 0xffb347 },
    enemies: [
      { type: 'automaton', count: 7 },
      { type: 'shell_crawler', count: 5 },
    ],
    boss: 'warlord_engine',
    props: [
      { model: 'rocks_set2.glb', fitSize: 2.6, shape: 'box', count: 16, color: 0x4a3a2a, collide: 1.1 },
      { model: 'low_poly_skeleton_ribs.glb', fitSize: 1.8, shape: 'brute', count: 14, color: 0xb0a890 },
      { model: 'psx_dead_tree_pack.glb', fitSize: 3.5, shape: 'tree', count: 12, color: 0x3a2c1c, collide: 0.6 },
    ],
  },
  4: {
    index: 4, key: 'voidmarsh', roman: 'realm iv',
    name: 'The Voidmarsh', sub: 'where space wore thin',
    biome: 'voidmarsh', accent: '#9a5cff',
    sky: { top: '#120724', horizon: '#3a1a66', bottom: '#08040f', fog: '#1c0e34' },
    ember: { label: 'the Void Ember', tint: 0x9a5cff },
    enemies: [
      { type: 'drift_shade', count: 8 },
      { type: 'phase_hunter', count: 4 },
    ],
    boss: 'pale_twin',
    props: [
      { model: 'psx_dead_tree_pack.glb', fitSize: 3.8, shape: 'tree', count: 24, color: 0x1e1430, collide: 0.6 },
      { model: 'glowing_gem.glb', fitSize: 1.4, shape: 'crystal', count: 16, color: 0x2a1640, glow: 0x9a5cff, collide: 0.7 },
      { model: 'human_skeleton.glb', fitSize: 1.8, shape: 'box', count: 10, color: 0x9a90a8 },
    ],
  },
  5: {
    index: 5, key: 'convergence', roman: 'realm v',
    name: 'The Convergence', sub: 'the place where it ends',
    biome: 'convergence', accent: '#ffd24a',
    sky: { top: '#1a0e1e', horizon: '#6a2a4a', bottom: '#0c0610', fog: '#241026' },
    ember: { label: 'the Motherglass', tint: 0xffd24a },
    purgeGoal: 0.75, // kill % required before the Conqueror is summoned
    enemies: [
      { type: 'ashling', count: 6 },
      { type: 'ink_wraith', count: 5 },
      { type: 'automaton', count: 5 },
      { type: 'drift_shade', count: 6 },
      { type: 'phase_hunter', count: 4 },
    ],
    boss: 'conqueror',
    props: [
      { model: 'rocks_set_3.glb', fitSize: 3.0, shape: 'box', count: 12, color: 0x2c2030, collide: 1.1 },
      { model: 'glowing_gem.glb', fitSize: 1.5, shape: 'crystal', count: 16, color: 0x3a2030, glow: 0xffd24a, collide: 0.7 },
      { model: 'low_poly_skeleton.glb', fitSize: 1.8, shape: 'box', count: 12, color: 0xa098a8 },
    ],
  },
};

/** Per-realm footstep sfx key (Phase 12). */
export const REALM_FOOTSTEP = {
  1: 'footstep_ash', 2: 'footstep_water', 3: 'footstep_metal',
  4: 'footstep_ash', 5: 'footstep_metal',
};
