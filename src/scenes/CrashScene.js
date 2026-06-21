import * as THREE from 'three';
import { SkyDome, applySkybox } from '../skybox/SkyboxManager.js';
import { CrashTerrain } from '../world/CrashTerrain.js';
import { ParticleField } from '../fx/Particles.js';
import { VOXEL } from '../data/voxels.js';
import { mergeByMaterial, disposeObject } from '../core/meshUtils.js';
import { PERF, scaledCount } from '../core/performance.js';
import { SHIP_TO_USE } from '../core/gameConfig.js';

/**
 * CrashScene — the opening. The Conqueror's carrier lies broken, nose buried in
 * a small simplex-noise voxel biome, the whole site wrapped in a skybox. The
 * camera floats above the wreck (inside the sky) on a slow orbit while the title
 * card waits; the first click ("descend") hands off to the hub.
 *
 * This is a *cinematic* scene: SceneManager seats the camera via placeCamera()
 * instead of the FPS controller, and Engine drives update() each frame without
 * running player physics.
 */

// --- tuning ------------------------------------------------------------------
const SHIP_BLOCKS = 18;          // scale the ship so its longest axis ≈ this many voxels
const BURIAL = 2.0;              // blocks the nose punches below the crater floor
const EFFECTIVE_SHIP_BLOCKS = SHIP_TO_USE === 2 ? 14 : SHIP_BLOCKS;
const SKY_RADIUS = 600;          // matches SkyDome's sphere; camera must stay inside
const IMPACT_DIR = Math.PI * 0.17; // heading the ship skidded in along (crater + yaw share it)
const ORBIT_SPEED = 0.05;        // rad/s, gentle establishing drift

// Nose-dive pose (radians): steep pitch, yawed to the skid heading, rolled askew.
const POSE = new THREE.Euler(
  THREE.MathUtils.degToRad(62),
  IMPACT_DIR,
  THREE.MathUtils.degToRad(-9)
);

// Native world-AABB of ship.gltf (X,Y,Z), measured from its accessors — used to
// size the pre-load placeholder. The real model is re-measured on arrival.
const NATIVE = new THREE.Vector3(531.57, 179.12, 545.81);

// Dusk-over-an-alien-plain palette (procedural fallback sky + lights + fog).
const CRASH_SKY = { top: '#1b1433', horizon: '#7d3a55', bottom: '#0c0a16', fog: '#241830' };
// A brighter twin used only to bake the reflection environment, so the carrier's
// dark metallic hull (baseColor ~0.05, metalness 0.75) catches light instead of
// reading as a black blob. Visible sky stays the moodier CRASH_SKY above.
const ENV_SKY = { top: '#3a3052', horizon: '#b67c7a', bottom: '#2a2333' };

// Crash biome — reuses the shared VOXEL data structure; blocks are placeholder
// boxes tinted per type, swappable for real models/textures later.
const CRASH_BIOME = {
  base: VOXEL.GRASS, sub: VOXEL.STONE, accent: VOXEL.EMBER_INFUSED, scorch: VOXEL.ASH,
  accentScale: 0.13, accentThreshold: 0.8,
  baseHeight: 6, amp: 2.4, scale: 0.08,
};

export class CrashScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.camera = ctx.camera;
    this.three = new THREE.Scene();
    this.cinematic = true;

    // camera-frame state (filled once the wreck is seated)
    this._angle = IMPACT_DIR + Math.PI * 0.62;
    this._center = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._radius = 30;
    this._height = 28;

    this._emitT = 0;
    this._t = 0;
  }

  get name() { return 'Crash Site'; }

  enter() {
    this._buildSky();
    this._buildEnvironment();
    this._buildLights();

    // finite voxel patch, generous enough to cradle the wreck + crater
    this.terrain = new CrashTerrain({
      size: Math.max(PERF.crashTerrainSize, SHIP_TO_USE === 2 ? 48 : 40),
      seed: 90125,
      biome: CRASH_BIOME,
      crater: { x: 0, z: 0, radius: 7, depth: 5, rim: 1.6, elong: 1.9, dir: IMPACT_DIR },
    });
    this.three.add(this.terrain.build());
    this.craterFloorY = this.terrain.heightAt(0, 0);

    this.impact = new THREE.Vector3(0, this.craterFloorY + 0.5, 0);
    this.fire.position.copy(this.impact);

    this.particles = new ParticleField(this.three);

    this._buildShip();
    this._buildProps();

    // cinematic scene — nobody walks here, but honour the contract.
    const spawn = new THREE.Vector3(0, this.craterFloorY, 0);
    this.spawnPoint = spawn;
    return spawn;
  }

  // ---- sky --------------------------------------------------------------
  _buildSky() {
    // procedural dome now; swapped for skybox.gltf the moment it exists.
    this.dome = new SkyDome(CRASH_SKY);
    this.three.add(this.dome.mesh);
    applySkybox(this.ctx.assets, this.three, {
      radius: SKY_RADIUS,
      onLoaded: (sky) => { this.skyModel = sky; this.dome.mesh.visible = false; },
    });
  }

  // ---- reflection environment ------------------------------------------
  /** Bake a soft dusk env map so metallic surfaces have something to reflect. */
  _buildEnvironment() {
    if (!PERF.crashEnvMap) return;
    const renderer = this.ctx.engine.renderer;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const dome = new SkyDome(ENV_SKY);
    envScene.add(dome.mesh);
    // far must clear the dome's 600-unit radius (default fromScene far is 100).
    this._envRT = pmrem.fromScene(envScene, 0.04, 0.1, 1000);
    this.three.environment = this._envRT.texture;
    dome.dispose();
    pmrem.dispose();
  }

  // ---- lights -----------------------------------------------------------
  _buildLights() {
    this.three.fog = new THREE.Fog(new THREE.Color(CRASH_SKY.fog).getHex(), 55, 280);

    const hemi = new THREE.HemisphereLight(
      new THREE.Color(CRASH_SKY.horizon).getHex(),
      new THREE.Color(CRASH_SKY.bottom).getHex(),
      0.55
    );
    this.three.add(hemi);

    const key = new THREE.DirectionalLight(0xffe7c8, 1.1);
    key.position.set(42, 74, 30);
    key.castShadow = PERF.shadows;
    key.shadow.mapSize.set(PERF.shadowMapSize, PERF.shadowMapSize);
    const c = key.shadow.camera;
    c.near = 1; c.far = 320; c.left = -70; c.right = 70; c.top = 70; c.bottom = -70;
    key.shadow.bias = -0.0004;
    this.three.add(key);

    const fill = new THREE.DirectionalLight(new THREE.Color(CRASH_SKY.horizon).getHex(), 0.35);
    fill.position.set(-30, 26, -42);
    this.three.add(fill);

    this.three.add(new THREE.AmbientLight(0xffffff, 0.12));

    // smouldering engine glow at the impact (flickers in update)
    this.fire = PERF.dynamicPointLights
      ? new THREE.PointLight(0xff5a1e, 7, 34, 2)
      : new THREE.Object3D();
    this.three.add(this.fire);
  }

  // ---- ship -------------------------------------------------------------
  _buildShip() {
    this.shipPivot = new THREE.Group();
    this.shipPivot.rotation.copy(POSE);
    this.three.add(this.shipPivot);

    // placeholder hull (instant), sized from the native AABB at the same scale.
    const s0 = EFFECTIVE_SHIP_BLOCKS / Math.max(NATIVE.x, NATIVE.y, NATIVE.z);
    const halfPH = NATIVE.clone().multiplyScalar(s0 * 0.5);
    this.shipModel = makeHullPlaceholder(NATIVE.clone().multiplyScalar(s0));
    this.shipPivot.add(this.shipModel);
    this._seatWreck(halfPH);

    // real carrier → measure, scale to SHIP_BLOCKS, recentre, re-seat precisely.
    if (!PERF.loadCrashShipModel && SHIP_TO_USE !== 2) return;

    const shipModelName = SHIP_TO_USE === 2 ? 'root/spaceship_with_interrior.glb' : 'ship.gltf';
    this.ctx.assets.loadModel(shipModelName).then((model) => {
      if (!model || !this.shipPivot) return;
      // 835 meshes → ~5 draw calls (5 shared materials). Biggest perf win here.
      try { mergeByMaterial(model); } catch (e) { console.warn('[zoal] ship merge skipped:', e); }
      model.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = EFFECTIVE_SHIP_BLOCKS / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(s);
      model.position.set(-center.x * s, -center.y * s, -center.z * s);
      // 835-mesh model: keep it out of the shadow pass (huge cost) but let it
      // catch the scene's shadows.
      model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = PERF.modelReceiveShadows; } });

      this.shipPivot.remove(this.shipModel);
      disposeObject(this.shipModel);
      this.shipPivot.add(model);
      this.shipModel = model;
      this._seatWreck(size.multiplyScalar(s * 0.5));
    });
  }

  /**
   * Plant the wreck: pose its local AABB, find the lowest corner (the nose), and
   * slide the pivot so that corner sits at the crater centre, BURIAL blocks under
   * the floor. Then frame the camera from the resulting world AABB.
   */
  _seatWreck(half) {
    const R = new THREE.Matrix4().makeRotationFromEuler(this.shipPivot.rotation);
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const low = new THREE.Vector3();
    let lowY = Infinity;
    const v = new THREE.Vector3();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      v.set(sx * half.x, sy * half.y, sz * half.z).applyMatrix4(R);
      min.min(v); max.max(v);
      if (v.y < lowY) { lowY = v.y; low.copy(v); }
    }
    const pos = new THREE.Vector3(-low.x, (this.craterFloorY - BURIAL) - low.y, -low.z);
    this.shipPivot.position.copy(pos);

    this._frameCamera(min.add(pos), max.add(pos));
  }

  /** Derive an aerial 3/4 orbit that keeps the wreck framed and stays in-sky. */
  _frameCamera(wmin, wmax) {
    this._center.set((wmin.x + wmax.x) / 2, 0, (wmin.z + wmax.z) / 2);
    const width = wmax.x - wmin.x;
    const depth = wmax.z - wmin.z;
    const maxDim = Math.max(width, depth, wmax.y - wmin.y);

    this._look.set(this._center.x, this.craterFloorY + (wmax.y - this.craterFloorY) * 0.4, this._center.z);
    const terrainLimit = this.terrain ? this.terrain.half * 0.78 : 28;
    this._radius = THREE.MathUtils.clamp(maxDim * 1.15, 18, terrainLimit);
    this._height = Math.min(wmax.y + maxDim * 0.42, this.craterFloorY + terrainLimit * 0.9);
  }

  _applyCamera() {
    this.camera.position.set(
      this._center.x + Math.cos(this._angle) * this._radius,
      this._height,
      this._center.z + Math.sin(this._angle) * this._radius
    );
    this.camera.lookAt(this._look);
  }

  // ---- dying-world dressing ---------------------------------------------
  /** Scatter dead trees, rocks and skeletons across the site (clear of the wreck). */
  _buildProps() {
    const defs = [
      { model: 'psx_dead_tree_pack.glb', fitSize: 4.2, count: 5 },
      { model: 'mossy_rocks_low_poly.glb', fitSize: 2.2, count: 4 },
      { model: 'rocks_set2.glb', fitSize: 2.6, count: 3 },
      { model: 'human_skeleton.glb', fitSize: 1.8, count: 4 },
      { model: 'low_poly_skeleton.glb', fitSize: 1.8, count: 3 },
      { model: 'grass_patches.glb', fitSize: 1.3, count: 8 },
    ];
    const lim = this.terrain.half - 3;
    for (const d of defs) {
      for (let i = 0; i < scaledCount(d.count, PERF.crashPropScale); i++) {
        let x = 0, z = 0, tries = 0;
        do {
          x = (Math.random() * 2 - 1) * lim;
          z = (Math.random() * 2 - 1) * lim;
        } while (x * x + z * z < 11 * 11 && ++tries < 8); // keep clear of the wreck/crater
        const g = this.ctx.assets.spawn(d.model, makeDressPlaceholder, {
          fitSize: d.fitSize * (0.8 + Math.random() * 0.5),
          load: PERF.loadPropModels,
        });
        g.position.set(x, this.terrain.getGroundHeight(x, z), z);
        g.rotation.y = Math.random() * Math.PI * 2;
        this.three.add(g);
      }
    }
  }

  // ---- contract ---------------------------------------------------------
  /** Called by SceneManager for cinematic scenes instead of seating the player. */
  placeCamera() {
    this._applyCamera();
  }

  update(delta) {
    this._t += delta;
    this._angle += ORBIT_SPEED * delta;
    this._applyCamera();

    this.dome.update(delta);
    this.particles.update(delta);

    // flicker the engine fire
    if (this.fire.isLight) this.fire.intensity = 6.2 + Math.sin(this._t * 11) * 1.1 + Math.sin(this._t * 23) * 0.6;

    // ember + ash plume rising from the buried nose
    this._emitT += delta;
    while (this._emitT > PERF.crashSmokeInterval) {
      this._emitT -= PERF.crashSmokeInterval;
      this.particles.emit(this.impact, { count: 2, color: 0xff7a18, speed: 2.6, spread: 0.7, life: 1.6, gravity: -0.6, up: 1.7, size: 0.5 });
      this.particles.emit(this.impact, { count: 2, color: 0x6b5a44, speed: 1.2, spread: 1.3, life: 2.6, gravity: -0.3, up: 1.1, size: 0.95 });
    }
  }

  getGroundHeight(x, z) { return this.terrain.getGroundHeight(x, z); }
  getTargets() { return []; }
  getInteractable() { return null; }
  minimapData(p, yaw) { return { cx: 0, cz: 0, yaw, accent: '#ff5a1e', ember: null, portal: null, enemies: [] }; }

  exit() {
    this.shipPivot = null; // stop any in-flight async loaders from re-seating
    if (this._envRT) this._envRT.dispose();
    disposeObject(this.three);
    this.three.clear();
    this.three = null;
  }
}

/** Tiny stand-in for a scatter prop until its GLB loads. */
function makeDressPlaceholder() {
  return new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 1.2, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.95 })
  );
}

/** Boxy hull stand-in shown only until ship.gltf loads from local disk. */
function makeHullPlaceholder(size) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.6, metalness: 0.5 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
  g.add(hull);
  // a tapered nose at +Z so the dive orientation reads pre-swap
  const nose = new THREE.Mesh(new THREE.ConeGeometry(size.x * 0.42, size.z * 0.5, 4), mat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = size.z * 0.62;
  g.add(nose);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = PERF.modelCastShadows; o.receiveShadow = PERF.modelReceiveShadows; } });
  return g;
}
