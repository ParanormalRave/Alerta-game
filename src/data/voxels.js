import * as THREE from 'three';

/** Voxel type ids (per spec: STONE, GRASS, ASH, WATER, VOID, IRON, EMBER_INFUSED). */
export const VOXEL = {
  STONE: 0,
  GRASS: 1,
  ASH: 2,
  WATER: 3,
  VOID: 4,
  IRON: 5,
  EMBER_INFUSED: 6,
};

export const VOXEL_NAME = ['STONE', 'GRASS', 'ASH', 'WATER', 'VOID', 'IRON', 'EMBER_INFUSED'];

const C = (hex) => new THREE.Color(hex);

/** Base albedo per voxel type (instanceColor multiplies the white material). */
export const VOXEL_COLOR = {
  [VOXEL.STONE]: C(0x777a75),
  [VOXEL.GRASS]: C(0x547846),
  [VOXEL.ASH]: C(0x4b443d),
  [VOXEL.WATER]: C(0x3d7cae),
  [VOXEL.VOID]: C(0x403056),
  [VOXEL.IRON]: C(0x80694f),
  [VOXEL.EMBER_INFUSED]: C(0xb8562e),
};

/** Corrupted → healed mapping used by the ember heal-wave. */
export const HEALED_TYPE = {
  [VOXEL.STONE]: VOXEL.STONE,
  [VOXEL.GRASS]: VOXEL.GRASS,
  [VOXEL.ASH]: VOXEL.GRASS,
  [VOXEL.WATER]: VOXEL.WATER,
  [VOXEL.VOID]: VOXEL.STONE,
  [VOXEL.IRON]: VOXEL.STONE,
  [VOXEL.EMBER_INFUSED]: VOXEL.GRASS,
};

/**
 * Per-realm biome generation config.
 *  scale/amp/baseHeight  → height field (simplex)
 *  base/sub/accent       → surface, sub-surface, and accent voxel types
 *  accentScale/Threshold → where the accent type appears (separate noise)
 *  waterLevel (optional) → columns at/below this height become WATER
 */
export const BIOMES = {
  cinderwood: {
    base: VOXEL.ASH, sub: VOXEL.STONE, accent: VOXEL.EMBER_INFUSED,
    accentScale: 0.09, accentThreshold: 0.62,
    baseHeight: 4, amp: 5, scale: 0.05,
  },
  drowned: {
    base: VOXEL.STONE, sub: VOXEL.STONE, accent: VOXEL.STONE,
    accentScale: 0.08, accentThreshold: 2, // never (no accent)
    waterLevel: 3, baseHeight: 4, amp: 4, scale: 0.05,
  },
  iron: {
    base: VOXEL.IRON, sub: VOXEL.STONE, accent: VOXEL.ASH,
    accentScale: 0.1, accentThreshold: 0.55,
    baseHeight: 4, amp: 6, scale: 0.055,
  },
  voidmarsh: {
    base: VOXEL.VOID, sub: VOXEL.STONE, accent: VOXEL.WATER,
    accentScale: 0.07, accentThreshold: 0.6,
    waterLevel: 3, baseHeight: 4, amp: 5, scale: 0.05,
  },
  convergence: {
    base: VOXEL.ASH, sub: VOXEL.STONE, accent: VOXEL.EMBER_INFUSED,
    accentScale: 0.12, accentThreshold: 0.5,
    baseHeight: 5, amp: 7, scale: 0.06,
  },
};
