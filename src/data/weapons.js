/**
 * Weapon stat config — single source of truth for the 8 weapons.
 *
 * `cooldown` is seconds between attacks (derived from the spec's speed tiers:
 *   Very Fast 0.25 · Fast 0.4 · Medium 0.6 · Slow 0.9).
 * `hits` is the per-swing hit multiplier (Phase Daggers strike twice).
 * `view` drives the placeholder primitive viewmodel until GLBs are wired in:
 *   model file `view.model` (lives in /public/models/) is loaded when present.
 */
export const WEAPONS = {
  ashen_blade: {
    id: 'ashen_blade', slot: 1, name: 'Ashen Blade', type: 'melee',
    damage: 45, cooldown: 0.4, range: 2.5, special: 'Burn DoT on hit',
    // GLB sword in hand. rot = [pitch, yaw, roll] in radians. The +pitch (≈90°)
    // lifts the blade from pointing down to pointing forward; if it ends up
    // pointing UP/back instead, flip rot[0] to -Math.PI/2.
    view: {
      shape: 'blade', color: 0x2c2422, glow: 0xff5a1e,
      model: 'spartan_sword_low_poly.glb', fitSize: 0.9,
      rot: [Math.PI / 2, Math.PI, 0.12], pos: [0.2, -0.16, -0.5],
    },
  },
  ironbreaker: {
    id: 'ironbreaker', slot: 2, name: 'Ironbreaker', type: 'melee',
    damage: 90, cooldown: 0.9, range: 2.0, special: 'AoE knockback',
    view: { shape: 'hammer', color: 0x565c68, glow: 0x9aa0ac, model: 'weapon_ironbreaker.glb' },
  },
  voidlance: {
    id: 'voidlance', slot: 3, name: 'Voidlance', type: 'melee',
    damage: 60, cooldown: 0.6, range: 4.0, special: 'Can be thrown (ranged)',
    view: { shape: 'lance', color: 0x2a2440, glow: 0x8a5cff, model: 'weapon_voidlance.glb' },
  },
  phase_daggers: {
    id: 'phase_daggers', slot: 4, name: 'Phase Daggers', type: 'melee',
    damage: 25, hits: 2, cooldown: 0.25, range: 1.5, special: 'Dodge through enemy',
    view: { shape: 'daggers', color: 0x223344, glow: 0x49e0ff, model: 'weapon_phase_daggers.glb' },
  },
  force_gauntlet: {
    id: 'force_gauntlet', slot: 5, name: 'Force Gauntlet', type: 'melee',
    damage: 70, cooldown: 0.6, range: 1.5, special: 'Pushback stagger',
    view: { shape: 'gauntlet', color: 0x6a4a2a, glow: 0xffaa44, model: 'weapon_force_gauntlet.glb' },
  },
  ember_bow: {
    id: 'ember_bow', slot: 6, name: 'Ember Bow', type: 'ranged',
    damage: 55, cooldown: 0.8, ammo: 30, special: 'Fire trail',
    view: { shape: 'bow', color: 0x4a2a1a, glow: 0xff7a18, model: 'weapon_ember_bow.glb' },
  },
  tidecaster: {
    id: 'tidecaster', slot: 7, name: 'Tidecaster', type: 'ranged',
    damage: 40, cooldown: 0.45, ammo: Infinity, special: 'Slows enemies',
    view: {
      shape: 'wand', color: 0x1a3a4a, glow: 0x49b0ff,
      model: 'mercys_caduceus_blaster.glb', fitSize: 0.42,
      rot: [Math.PI / 2, Math.PI, 0], pos: [0.2, -0.12, -0.46],
    },
  },
  convergence_staff: {
    id: 'convergence_staff', slot: 8, name: 'Convergence Staff', type: 'ranged',
    damage: 80, cooldown: 0.9, ammo: 20, special: 'Cycles elements',
    view: { shape: 'staff', color: 0x3a2a4a, glow: 0xffd24a, model: 'weapon_convergence_staff.glb' },
  },
};

/** slot number (1–8) → weapon id */
export const WEAPON_BY_SLOT = Object.fromEntries(
  Object.values(WEAPONS).map((w) => [w.slot, w.id])
);

// Start with a varied kit so the demo shows melee + guns immediately (1,2,6,7).
// Realm pickups still grant the rest (ironbreaker/ember_bow already owned won't
// re-appear as pickups). Cycle with 1–8, Q for last weapon.
export const STARTING_LOADOUT = ['ashen_blade', 'ironbreaker', 'ember_bow', 'tidecaster'];
