import { createNoise2D } from 'simplex-noise';
import { VoxelChunk, CHUNK } from './VoxelChunk.js';
import { BIOMES, VOXEL } from '../data/voxels.js';
import { PERF } from '../core/performance.js';

/** Deterministic seeded PRNG so a given seed always yields the same world. */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ChunkManager — owns the noise field, biome, and the set of loaded chunks.
 * Streams chunks in/out around the player, answers ground-height queries for
 * collision, and runs the expanding ember heal-wave.
 */
export class ChunkManager {
  constructor(scene, { biome = 'cinderwood', seed = 1337, renderDistance = PERF.renderDistance } = {}) {
    this.scene = scene;
    this.biomeName = biome;
    this.biome = BIOMES[biome];
    this.renderDistance = renderDistance;

    this._heightNoiseA = createNoise2D(mulberry32(seed));
    this._heightNoiseB = createNoise2D(mulberry32(seed ^ 0x9e3779b9));
    this._accentNoise = createNoise2D(mulberry32((seed * 16807) >>> 0));

    this.chunks = new Map();
    this.heal = null; // active heal-wave state
    this._healT = 0;
  }

  _key(cx, cz) {
    return cx + ',' + cz;
  }

  /** Integer column height (top surface Y) at a world position. */
  heightAt(wx, wz) {
    const b = this.biome;
    const n =
      this._heightNoiseA(wx * b.scale, wz * b.scale) * 0.65 +
      this._heightNoiseB(wx * b.scale * 2.4, wz * b.scale * 2.4) * 0.35;
    return Math.max(1, Math.round(b.baseHeight + n * b.amp));
  }

  /** Surface voxel type at a column of height H. */
  typeAt(wx, wz, H) {
    const b = this.biome;
    if (b.waterLevel !== undefined && H <= b.waterLevel) return VOXEL.WATER;
    const a = this._accentNoise(wx * b.accentScale, wz * b.accentScale) * 0.5 + 0.5;
    return a > b.accentThreshold ? b.accent : b.base;
  }

  /** Ground surface Y for player collision (top of the column). */
  getGroundHeight(wx, wz) {
    return this.heightAt(Math.floor(wx), Math.floor(wz));
  }

  update(playerPos, delta) {
    const pcx = Math.floor(playerPos.x / CHUNK);
    const pcz = Math.floor(playerPos.z / CHUNK);
    const r = this.renderDistance;

    // Load nearest chunks first, with a per-frame budget to avoid movement spikes.
    const missing = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const k = this._key(cx, cz);
        if (!this.chunks.has(k)) missing.push({ cx, cz, k, d2: dx * dx + dz * dz });
      }
    }
    missing.sort((a, b) => a.d2 - b.d2);
    const budget = delta === 0 ? PERF.initialChunkBuildBudget : PERF.maxChunkBuildsPerUpdate;
    for (let i = 0; i < Math.min(budget, missing.length); i++) {
      const { cx, cz, k } = missing[i];
      const ch = new VoxelChunk(cx, cz, this);
      ch.build();
      // Any active heal-wave should already cover newly-streamed chunks.
      if (this.heal) ch.applyHeal(this.heal.center, this.heal.radius);
      this.scene.add(ch.mesh);
      this.chunks.set(k, ch);
    }

    // Unload chunks beyond render distance (+1 hysteresis).
    for (const [k, ch] of this.chunks) {
      if (Math.abs(ch.cx - pcx) > r + 1 || Math.abs(ch.cz - pcz) > r + 1) {
        this.scene.remove(ch.mesh);
        ch.dispose();
        this.chunks.delete(k);
      }
    }

    // Advance heal-wave.
    if (this.heal) {
      this.heal.radius += this.heal.speed * delta;
      this._healT += delta;
      if (this._healT >= PERF.healUpdateInterval) {
        this._healT = 0;
        for (const ch of this.chunks.values()) {
          ch.applyHeal(this.heal.center, this.heal.radius);
        }
      }
      if (this.heal.radius > this.heal.maxRadius) this.heal = null;
    }
  }

  /** Kick off an expanding heal-wave from a world position (ember extraction). */
  startHealWave(center) {
    this.heal = { center: center.clone(), radius: 0, speed: 16, maxRadius: 80 };
  }

  dispose() {
    for (const ch of this.chunks.values()) {
      this.scene.remove(ch.mesh);
      ch.dispose();
    }
    this.chunks.clear();
  }
}
