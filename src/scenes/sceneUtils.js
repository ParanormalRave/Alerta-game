import * as THREE from 'three';
import { SkyDome } from '../skybox/SkyboxManager.js';
import { PERF, scaledCount } from '../core/performance.js';
import { TERRAIN_TYPE, TERRAIN_TYPES } from '../core/gameConfig.js';
import { buildPropInstances } from '../core/meshUtils.js';

/** Standard three-point-ish lighting + procedural sky dome for a realm/hub. */
export function setupAtmosphere(three, sky) {
  const triangleTerrain = TERRAIN_TYPE === TERRAIN_TYPES.TRIANGLE;
  const dome = new SkyDome(sky);
  three.add(dome.mesh);

  const fogColor = new THREE.Color(sky.fog || sky.bottom);
  three.fog = new THREE.Fog(fogColor.getHex(), triangleTerrain ? 70 : 45, triangleTerrain ? 230 : 190);

  const hemi = new THREE.HemisphereLight(
    new THREE.Color(sky.horizon).getHex(),
    new THREE.Color(sky.bottom).getHex(),
    triangleTerrain ? 0.95 : 0.75
  );
  three.add(hemi);

  const key = new THREE.DirectionalLight(0xfff0d8, triangleTerrain ? 1.55 : 1.35);
  key.position.set(30, 50, 20);
  key.castShadow = PERF.shadows;
  key.shadow.mapSize.set(PERF.shadowMapSize, PERF.shadowMapSize);
  const c = key.shadow.camera;
  c.near = 1; c.far = 160; c.left = -60; c.right = 60; c.top = 60; c.bottom = -60;
  three.add(key);

  const fill = new THREE.DirectionalLight(new THREE.Color(sky.horizon).getHex(), triangleTerrain ? 0.65 : 0.45);
  fill.position.set(-20, 16, -30);
  three.add(fill);

  if (triangleTerrain) three.add(new THREE.AmbientLight(0xffffff, 0.18));

  return { dome, hemi, key, fill };
}

/** Even-ish scatter of a prop GLB across a disc, seated on the terrain. */
export function scatterProps(assets, three, prop, world, { center = { x: 0, z: 0 }, radius = 60, avoid = 8 } = {}) {
  const count = scaledCount(prop.count, PERF.propScale);
  if (!count) return [];

  // pick scatter positions on the disc, seated on the terrain
  const placements = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = avoid + Math.random() * (radius - avoid);
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    placements.push({ x, y: world ? world.getGroundHeight(x, z) : 0, z });
  }

  // Fast path: collapse the whole prop type into one InstancedMesh (1 draw call,
  // no GLB download). This is the default at balanced/fast/potato.
  if (PERF.instanceProps && !PERF.loadPropModels) {
    const meshes = buildPropInstances(prop, placements);
    meshes.forEach((m) => three.add(m));
    return meshes;
  }

  // Pretty path: real GLB props (or per-instance placeholders).
  const out = [];
  for (const p of placements) {
    const opts = prop.fitSize
      ? { fitSize: prop.fitSize * (0.75 + Math.random() * 0.6) }
      : { scale: 0.8 + Math.random() * 1.2 };
    const g = assets.spawn(prop.model, () => makePropPlaceholder(prop), {
      ...opts,
      load: PERF.loadPropModels,
    });
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = Math.random() * Math.PI * 2;
    three.add(g);
    out.push(g);
  }
  return out;
}

function makePropPlaceholder(prop) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: prop.color ?? 0x3a342c, roughness: 0.9, metalness: 0.1 });
  const glowMat = prop.glow
    ? new THREE.MeshStandardMaterial({ color: prop.glow, emissive: prop.glow, emissiveIntensity: 1.4, roughness: 0.4 })
    : null;

  switch (prop.shape) {
    case 'tree': {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 3.4, 6), mat);
      trunk.position.y = 1.7; trunk.castShadow = PERF.modelCastShadows; g.add(trunk);
      for (let i = 0; i < 4; i++) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 1.4, 5), mat);
        br.position.set((Math.random() - 0.5), 2.6 + Math.random() * 0.8, (Math.random() - 0.5));
        br.rotation.set(Math.random(), Math.random(), Math.random() * 1.4 - 0.7);
        g.add(br);
      }
      break;
    }
    case 'rock': case 'crystal': {
      const geo = prop.shape === 'crystal' ? new THREE.OctahedronGeometry(0.9, 0) : new THREE.DodecahedronGeometry(0.9, 0);
      const m = new THREE.Mesh(geo, glowMat || mat);
      m.position.y = 0.8; m.castShadow = PERF.modelCastShadows; g.add(m);
      break;
    }
    case 'pillar': {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 6, 8), mat);
      p.position.y = 3; p.castShadow = PERF.modelCastShadows; g.add(p);
      break;
    }
    case 'brute': {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 2), mat);
      b.position.y = 0.8; b.castShadow = PERF.modelCastShadows; g.add(b);
      break;
    }
    default: { // box / wall / debris
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat);
      b.position.y = 0.8; b.castShadow = PERF.modelCastShadows; g.add(b);
    }
  }
  return g;
}
