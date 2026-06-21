import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { VOXEL, VOXEL_COLOR } from '../data/voxels.js';
import { PERF } from '../core/performance.js';

/**
 * CrashTerrain — a *finite* simplex-noise voxel patch for the opening crash
 * site. Unlike the streaming ChunkManager (infinite, player-centred), this is a
 * single bounded slab built once as one InstancedMesh, with an impact crater +
 * gouge carved where the ship planted its nose.
 *
 * Every block is still just the shared placeholder box tinted per voxel type
 * (data/voxels.js), so a real block model / texture atlas can replace the
 * geometry+material here later without touching generation or the crater.
 */

// One unit cube, shared by every instance. Swap this geometry (or add a texture
// to the material) later to upgrade every block at once.
const BLOCK_GEO = new THREE.BoxGeometry(1, 1, 1);
const BLOCK_MAT = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.03 });
const MAX_DEPTH = PERF.crashTerrainMaxDepth; // exposed cliff voxels rendered below each surface block

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/** Deterministic seeded PRNG (same one the ChunkManager uses). */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class CrashTerrain {
  /**
   * @param {object} o
   * @param {number} o.size    patch edge in blocks (centred on origin)
   * @param {object} o.biome   { base, sub, accent, accentScale, accentThreshold, baseHeight, amp, scale, scorch }
   * @param {object} o.crater  { x, z, radius, depth, rim, elong, dir } — gouge along `dir`
   * @param {number} o.seed
   */
  constructor({ size = 48, biome, crater, seed = 4711 } = {}) {
    this.size = size;
    this.half = Math.floor(size / 2);
    this.biome = biome;
    this.crater = crater;

    this._nA = createNoise2D(mulberry32(seed));
    this._nB = createNoise2D(mulberry32(seed ^ 0x9e3779b9));
    this._nAcc = createNoise2D(mulberry32((seed * 16807) >>> 0));

    this.mesh = null;
  }

  /** Crater displacement (≤0 bowl, ≥0 rim) at a world column. */
  craterDelta(wx, wz) {
    const c = this.crater;
    if (!c) return 0;
    const dx = wx - c.x;
    const dz = wz - c.z;
    // rotate into the gouge's local frame, then squash along the heading so the
    // bowl reads as a furrow the ship skidded through.
    const cos = Math.cos(c.dir);
    const sin = Math.sin(c.dir);
    const lx = (dx * cos + dz * sin) / c.elong;
    const lz = -dx * sin + dz * cos;
    const d = Math.sqrt(lx * lx + lz * lz);

    let delta = 0;
    if (d < c.radius) {
      const t = d / c.radius; // 0 centre → 1 lip
      delta -= c.depth * (1 - t * t); // deepest at impact
    }
    // raised debris rim just outside the bowl
    const r0 = c.radius * 0.85;
    const r1 = c.radius * 1.45;
    if (d > r0 && d < r1) {
      delta += c.rim * Math.sin(((d - r0) / (r1 - r0)) * Math.PI);
    }
    return delta;
  }

  /** True inside the scorched impact core (recoloured to ash). */
  inScorch(wx, wz) {
    const c = this.crater;
    if (!c) return false;
    const dx = wx - c.x;
    const dz = wz - c.z;
    const cos = Math.cos(c.dir);
    const sin = Math.sin(c.dir);
    const lx = (dx * cos + dz * sin) / c.elong;
    const lz = -dx * sin + dz * cos;
    return lx * lx + lz * lz < c.radius * c.radius;
  }

  /** Integer surface height of a column. */
  heightAt(wx, wz) {
    const b = this.biome;
    const n =
      this._nA(wx * b.scale, wz * b.scale) * 0.65 +
      this._nB(wx * b.scale * 2.3, wz * b.scale * 2.3) * 0.35;
    const h = b.baseHeight + n * b.amp + this.craterDelta(wx, wz);
    return Math.max(1, Math.round(h));
  }

  /** Surface voxel type for a column. */
  typeAt(wx, wz) {
    const b = this.biome;
    if (b.scorch !== undefined && this.inScorch(wx, wz)) return b.scorch;
    const a = this._nAcc(wx * b.accentScale, wz * b.accentScale) * 0.5 + 0.5;
    return a > b.accentThreshold ? b.accent : b.base;
  }

  /** Ground surface Y for collision / seating queries. */
  getGroundHeight(x, z) {
    return this.heightAt(Math.round(x), Math.round(z));
  }

  build() {
    const positions = [];
    const types = [];

    for (let wz = -this.half; wz < this.half; wz++) {
      for (let wx = -this.half; wx < this.half; wx++) {
        const H = this.heightAt(wx, wz);
        const minN = Math.min(
          this.heightAt(wx - 1, wz),
          this.heightAt(wx + 1, wz),
          this.heightAt(wx, wz - 1),
          this.heightAt(wx, wz + 1)
        );
        let bottom = Math.min(minN, H - 1);
        bottom = Math.max(bottom, H - 1 - MAX_DEPTH, 0);

        const surfType = this.typeAt(wx, wz);
        for (let y = bottom; y <= H - 1; y++) {
          positions.push(wx + 0.5, y + 0.5, wz + 0.5);
          types.push(y === H - 1 ? surfType : this.biome.sub);
        }
      }
    }

    const count = types.length;
    const mesh = new THREE.InstancedMesh(BLOCK_GEO, BLOCK_MAT, count);
    mesh.castShadow = PERF.terrainCastsShadow;
    mesh.receiveShadow = true;
    for (let i = 0; i < count; i++) {
      _m.makeTranslation(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.copy(VOXEL_COLOR[types[i]]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    this.mesh = mesh;
    return mesh;
  }

  dispose() {
    if (this.mesh) this.mesh.dispose();
  }
}
