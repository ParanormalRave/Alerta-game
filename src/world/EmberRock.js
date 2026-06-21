import * as THREE from 'three';
import { PERF } from '../core/performance.js';

/**
 * EmberRock — the realm's extractable core. A pulsing glowing crystal floating
 * over its rock, with a coloured PointLight. Interacting (E) marks it extracted;
 * the scene plays the burst + heal-wave and lights the return portal gold.
 */
export class EmberRock {
  constructor(assets, { tint = 0xff5a1e, model = 'glowing_gem.glb', label = 'the Ember' } = {}) {
    this.tint = new THREE.Color(tint);
    this.label = label;
    this.extracted = false;
    this.group = new THREE.Group();
    this.radius = 2.2; // interaction radius

    // Rock base (placeholder → GLB)
    this.rock = assets.spawn(model, () => makeRock(), { fitSize: 1.8, load: PERF.loadPropModels });
    this.group.add(this.rock);

    // Floating crystal core
    const coreMat = new THREE.MeshStandardMaterial({
      color: tint, emissive: tint, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0.2,
    });
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), coreMat);
    this.core.position.y = 1.6;
    this.core.castShadow = false;
    this.group.add(this.core);

    const pillarMat = new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.72, 42, 12, 1, true), pillarMat);
    this.pillar.position.y = 21;
    this.group.add(this.pillar);

    const ringMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.65, 24), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.08;
    this.group.add(this.ring);

    if (PERF.dynamicPointLights) {
      this.light = new THREE.PointLight(tint, 4, 14);
      this.light.position.y = 1.7;
      this.group.add(this.light);
    } else {
      this.light = { intensity: 0 };
    }

    this._t = 0;
  }

  get position() { return this.group.position; }

  update(delta) {
    this._t += delta;
    if (this.extracted) return;
    this.core.rotation.y += delta * 0.8;
    this.pillar.rotation.y += delta * 0.22;
    this.ring.rotation.z += delta * 0.7;
    this.core.position.y = 1.6 + Math.sin(this._t * 1.6) * 0.12;
    const pulse = 2.0 + Math.sin(this._t * 3) * 0.8;
    this.core.material.emissiveIntensity = pulse;
    this.light.intensity = 3.5 + Math.sin(this._t * 3) * 1.2;
  }

  /** Called once on successful extraction; returns the core's world position. */
  extract() {
    this.extracted = true;
    const p = new THREE.Vector3();
    this.core.getWorldPosition(p);
    this.core.visible = false;
    this.pillar.visible = false;
    this.ring.visible = false;
    this.light.intensity = 0;
    return p;
  }
}

function makeRock() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.95, metalness: 0.05 });
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.5, 0), mat);
    const a = (i / 5) * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.6, Math.random() * 0.3, Math.sin(a) * 0.6);
    m.rotation.set(Math.random(), Math.random(), Math.random());
    m.castShadow = PERF.modelCastShadows; m.receiveShadow = PERF.modelReceiveShadows;
    g.add(m);
  }
  return g;
}
