import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { BIOMES, VOXEL, VOXEL_COLOR, HEALED_TYPE } from '../data/voxels.js';
import { PERF } from '../core/performance.js';

export const TRI_CHUNK = 24;
const STEP = 3;

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MATERIAL = new THREE.MeshLambertMaterial({
  vertexColors: true,
  emissive: 0x181512,
  emissiveIntensity: 0.22,
  flatShading: true,
  side: THREE.DoubleSide,
});

export class TriangleChunkManager {
  constructor(scene, { biome = 'cinderwood', seed = 1337, renderDistance = PERF.renderDistance } = {}) {
    this.scene = scene;
    this.biomeName = biome;
    this.biome = BIOMES[biome];
    this.renderDistance = renderDistance;
    this._heightNoiseA = createNoise2D(mulberry32(seed));
    this._heightNoiseB = createNoise2D(mulberry32(seed ^ 0x9e3779b9));
    this._accentNoise = createNoise2D(mulberry32((seed * 16807) >>> 0));
    this.chunks = new Map();
    this.heal = null;
    this._healT = 0;
  }

  _key(cx, cz) { return `${cx},${cz}`; }

  rawHeight(wx, wz) {
    const b = this.biome;
    const n =
      this._heightNoiseA(wx * b.scale, wz * b.scale) * 0.65 +
      this._heightNoiseB(wx * b.scale * 2.4, wz * b.scale * 2.4) * 0.35;
    return Math.max(1, b.baseHeight + n * b.amp);
  }

  heightAt(wx, wz) {
    return this.rawHeight(wx, wz);
  }

  typeAt(wx, wz, h) {
    const b = this.biome;
    if (b.waterLevel !== undefined && h <= b.waterLevel) return VOXEL.WATER;
    const a = this._accentNoise(wx * b.accentScale, wz * b.accentScale) * 0.5 + 0.5;
    return a > b.accentThreshold ? b.accent : b.base;
  }

  getGroundHeight(wx, wz) {
    return this.rawHeight(wx, wz);
  }

  update(playerPos, delta) {
    const pcx = Math.floor(playerPos.x / TRI_CHUNK);
    const pcz = Math.floor(playerPos.z / TRI_CHUNK);
    const r = this.renderDistance;
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
      const ch = new TriangleChunk(cx, cz, this);
      ch.build();
      if (this.heal) ch.applyHeal(this.heal.center, this.heal.radius);
      this.scene.add(ch.mesh);
      this.chunks.set(k, ch);
    }

    for (const [k, ch] of this.chunks) {
      if (Math.abs(ch.cx - pcx) > r + 1 || Math.abs(ch.cz - pcz) > r + 1) {
        this.scene.remove(ch.mesh);
        ch.dispose();
        this.chunks.delete(k);
      }
    }

    if (this.heal) {
      this.heal.radius += this.heal.speed * delta;
      this._healT += delta;
      if (this._healT >= PERF.healUpdateInterval) {
        this._healT = 0;
        for (const ch of this.chunks.values()) ch.applyHeal(this.heal.center, this.heal.radius);
      }
      if (this.heal.radius > this.heal.maxRadius) this.heal = null;
    }
  }

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

class TriangleChunk {
  constructor(cx, cz, manager) {
    this.cx = cx;
    this.cz = cz;
    this.mgr = manager;
    this.mesh = null;
    this.faceTypes = [];
    this.faceCenters = [];
    this.healed = [];
  }

  build() {
    const mgr = this.mgr;
    const ox = this.cx * TRI_CHUNK;
    const oz = this.cz * TRI_CHUNK;
    const positions = [];
    const colors = [];
    const normals = [];
    const c = new THREE.Color();
    const normal = new THREE.Vector3();

    const emitTri = (a, b, d, type) => {
      normal.subVectors(d, a).cross(new THREE.Vector3().subVectors(b, a)).normalize();
      const col = c.copy(VOXEL_COLOR[type]);
      const jitter = 0.92 + Math.random() * 0.1;
      col.multiplyScalar(jitter);
      for (const p of [a, b, d]) {
        positions.push(p.x, p.y, p.z);
        colors.push(col.r, col.g, col.b);
        normals.push(normal.x, normal.y, normal.z);
      }
      const center = new THREE.Vector2((a.x + b.x + d.x) / 3, (a.z + b.z + d.z) / 3);
      this.faceTypes.push(type);
      this.faceCenters.push(center);
      this.healed.push(0);
    };

    for (let z = 0; z < TRI_CHUNK; z += STEP) {
      for (let x = 0; x < TRI_CHUNK; x += STEP) {
        const x0 = ox + x;
        const z0 = oz + z;
        const x1 = x0 + STEP;
        const z1 = z0 + STEP;
        const h00 = mgr.heightAt(x0, z0);
        const h10 = mgr.heightAt(x1, z0);
        const h01 = mgr.heightAt(x0, z1);
        const h11 = mgr.heightAt(x1, z1);
        const p00 = new THREE.Vector3(x0, h00, z0);
        const p10 = new THREE.Vector3(x1, h10, z0);
        const p01 = new THREE.Vector3(x0, h01, z1);
        const p11 = new THREE.Vector3(x1, h11, z1);
        const avg = (h00 + h10 + h01 + h11) * 0.25;
        const type = mgr.typeAt(x0 + STEP * 0.5, z0 + STEP * 0.5, avg);
        emitTri(p00, p10, p11, type);
        emitTri(p00, p11, p01, type);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geo.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geo, MATERIAL);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = PERF.terrainCastsShadow;
  }

  applyHeal(center, radius) {
    if (!this.mesh) return;
    const r2 = radius * radius;
    const colorAttr = this.mesh.geometry.attributes.color;
    const c = new THREE.Color();
    let changed = false;

    for (let i = 0; i < this.faceTypes.length; i++) {
      if (this.healed[i]) continue;
      const p = this.faceCenters[i];
      const dx = p.x - center.x;
      const dz = p.y - center.z;
      if (dx * dx + dz * dz > r2) continue;
      const type = HEALED_TYPE[this.faceTypes[i]];
      this.faceTypes[i] = type;
      this.healed[i] = 1;
      c.copy(VOXEL_COLOR[type]);
      for (let v = 0; v < 3; v++) colorAttr.setXYZ(i * 3 + v, c.r, c.g, c.b);
      changed = true;
    }

    if (changed) colorAttr.needsUpdate = true;
  }

  dispose() {
    this.mesh?.geometry.dispose();
  }
}
