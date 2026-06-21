import * as THREE from 'three';
import { VOXEL_COLOR, HEALED_TYPE } from '../data/voxels.js';
import { PERF } from '../core/performance.js';

export const CHUNK = 16; // voxels per chunk edge (footprint)
const MAX_DEPTH = PERF.voxelMaxDepth; // how many voxels of exposed cliff to render below the surface

// Geometry + material are shared across all chunks (one box, white standard
// material). Per-voxel color comes from each InstancedMesh's instanceColor, so
// the heal-wave can recolor individual voxels without rebuilding geometry.
const SHARED_GEO = new THREE.BoxGeometry(1, 1, 1);
const SHARED_MAT = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.04 });

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/**
 * VoxelChunk — a 16×16 column-based slice of terrain rendered as a single
 * InstancedMesh. Only the surface voxel of each column plus its exposed cliff
 * face (down to the lowest neighbour) are emitted, which keeps instance counts
 * low while leaving no holes on slopes. Heights/types come from the manager so
 * generation is seamless across chunk borders.
 */
export class VoxelChunk {
  constructor(cx, cz, manager) {
    this.cx = cx;
    this.cz = cz;
    this.mgr = manager;
    this.mesh = null;
    this.types = null; // Uint8Array — current voxel type per instance
    this.xz = null; // Float32Array — world x,z per instance (for heal distance)
    this.healed = null; // Uint8Array — 1 once converted by a heal-wave
  }

  build() {
    const mgr = this.mgr;
    const ox = this.cx * CHUNK;
    const oz = this.cz * CHUNK;

    const positions = [];
    const types = [];
    const xz = [];

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const H = mgr.heightAt(wx, wz);

        // Lowest neighbour height → how far down the exposed face goes.
        const minN = Math.min(
          mgr.heightAt(wx - 1, wz),
          mgr.heightAt(wx + 1, wz),
          mgr.heightAt(wx, wz - 1),
          mgr.heightAt(wx, wz + 1)
        );
        let bottom = Math.min(minN, H - 1);
        bottom = Math.max(bottom, H - 1 - MAX_DEPTH, 0);

        for (let y = bottom; y <= H - 1; y++) {
          const t = y === H - 1 ? mgr.typeAt(wx, wz, H) : mgr.biome.sub;
          positions.push(wx + 0.5, y + 0.5, wz + 0.5);
          types.push(t);
          xz.push(wx + 0.5, wz + 0.5);
        }
      }
    }

    const count = types.length;
    const mesh = new THREE.InstancedMesh(SHARED_GEO, SHARED_MAT, count);
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
    this.types = Uint8Array.from(types);
    this.xz = Float32Array.from(xz);
    this.healed = new Uint8Array(count);
  }

  /** Convert any not-yet-healed voxels within `radius` (xz) of center. */
  applyHeal(center, radius) {
    if (!this.mesh) return;
    const r2 = radius * radius;
    let changed = false;
    for (let i = 0; i < this.types.length; i++) {
      if (this.healed[i]) continue;
      const dx = this.xz[i * 2] - center.x;
      const dz = this.xz[i * 2 + 1] - center.z;
      if (dx * dx + dz * dz <= r2) {
        const ht = HEALED_TYPE[this.types[i]];
        this.types[i] = ht;
        this.mesh.setColorAt(i, _c.copy(VOXEL_COLOR[ht]));
        this.healed[i] = 1;
        changed = true;
      }
    }
    if (changed && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    // Only the instance buffers — SHARED_GEO/SHARED_MAT stay alive for other chunks.
    if (this.mesh) this.mesh.dispose();
  }
}
