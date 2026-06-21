import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'uv'];

/**
 * Mark every geometry + material under `obj` as SHARED so {@link disposeObject}
 * leaves them alone. Call this once on a cached/source model: because
 * `Object3D.clone(true)` shares geometry & material *references*, the flag rides
 * along to every clone — so an enemy dying mid-fight can dispose its own wrapper
 * without yanking the GPU buffers every other clone (and the cache) still uses.
 * This is the fix for the "models vanish after the first death" bug.
 */
export function markShared(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.userData.__shared = true;
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (m) m.userData.__shared = true;
      });
    }
  });
  return obj;
}

/**
 * Dispose an object tree's geometry + materials, but NEVER touch resources
 * flagged shared by {@link markShared} (those are owned by the AssetLoader cache
 * and reused across every clone + scene). Use this everywhere instead of a raw
 * `geometry.dispose()` traversal.
 */
export function disposeObject(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.__shared) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (m && !m.userData.__shared) m.dispose();
      });
    }
  });
}

/**
 * Collapse a list of prop placements into ONE InstancedMesh per shape — 30 trees
 * become a single draw call instead of 30. Geometry is baked once so its base
 * sits on y=0; each placement supplies position + a random yaw/scale. Returns the
 * meshes to add to the scene (or [] if there's nothing to place).
 *
 * @param {{shape?:string,color?:number,glow?:number}} prop
 * @param {{x:number,y:number,z:number}[]} placements
 */
export function buildPropInstances(prop, placements) {
  if (!placements.length) return [];
  const geo = propGeometry(prop.shape);
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox.min.y, 0); // seat base on ground
  const mat = prop.glow
    ? new THREE.MeshStandardMaterial({ color: prop.glow, emissive: prop.glow, emissiveIntensity: 1.2, roughness: 0.4 })
    : new THREE.MeshStandardMaterial({ color: prop.color ?? 0x3a342c, roughness: 0.9, metalness: 0.1 });

  const mesh = new THREE.InstancedMesh(geo, mat, placements.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    q.setFromAxisAngle(up, Math.random() * Math.PI * 2);
    const s = 0.7 + Math.random() * 0.6;
    scl.set(s, s * (0.85 + Math.random() * 0.4), s);
    pos.set(p.x, p.y, p.z);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // instances span the whole disc
  return [mesh];
}

function propGeometry(shape) {
  switch (shape) {
    case 'tree': {
      const parts = [];
      const trunk = new THREE.CylinderGeometry(0.18, 0.3, 3.4, 6);
      trunk.translate(0, 1.7, 0);
      parts.push(trunk);
      for (let i = 0; i < 3; i++) {
        const br = new THREE.CylinderGeometry(0.05, 0.12, 1.4, 5);
        const a = (i / 3) * Math.PI * 2;
        br.rotateZ(0.5);
        br.translate(Math.cos(a) * 0.4, 2.8 + i * 0.25, Math.sin(a) * 0.4);
        parts.push(br);
      }
      const merged = mergeGeometries(parts, false);
      parts.forEach((g) => g.dispose());
      return merged || new THREE.CylinderGeometry(0.2, 0.3, 3.4, 6);
    }
    case 'crystal': return new THREE.OctahedronGeometry(0.9, 0);
    case 'rock': return new THREE.DodecahedronGeometry(0.9, 0);
    case 'pillar': return new THREE.CylinderGeometry(0.5, 0.6, 6, 8);
    case 'brute': return new THREE.BoxGeometry(3, 1.6, 2);
    default: return new THREE.BoxGeometry(1.6, 1.6, 1.6);
  }
}

/**
 * Collapse a static model's meshes that share a material into a single mesh per
 * material, baking each node's transform into the geometry. This turns a model
 * authored as hundreds of tiny parts (e.g. the carrier: 835 meshes / 5 materials)
 * into a handful of draw calls — the biggest single render win for such assets.
 *
 * Safe by design: a material group is only collapsed if its geometries merge
 * cleanly; otherwise the originals are left in place, so geometry is never lost.
 * Only single-material meshes are touched. Call once, after load, before posing.
 *
 * @param {THREE.Object3D} model
 * @returns {THREE.Object3D} the same model, mutated in place
 */
export function mergeByMaterial(model) {
  model.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const groups = new Map(); // material -> { meshes: [], geos: [] }

  model.traverse((o) => {
    if (!o.isMesh || !o.geometry || Array.isArray(o.material)) return;
    let g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    // Normalise attributes so sibling geometries always merge-match.
    for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!groups.has(o.material)) groups.set(o.material, { meshes: [], geos: [] });
    const grp = groups.get(o.material);
    grp.meshes.push(o);
    grp.geos.push(g);
  });

  for (const [material, grp] of groups) {
    if (grp.geos.length < 2) { grp.geos.forEach((g) => g.dispose()); continue; }
    let merged = null;
    try { merged = mergeGeometries(grp.geos, false); } catch { merged = null; }
    grp.geos.forEach((g) => g.dispose());
    if (!merged) continue; // leave the originals untouched — never drop geometry
    const mesh = new THREE.Mesh(merged, material);
    mesh.receiveShadow = true;
    model.add(mesh);
    for (const o of grp.meshes) o.parent && o.parent.remove(o);
  }
  return model;
}
