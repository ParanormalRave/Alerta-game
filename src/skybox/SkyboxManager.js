import * as THREE from 'three';
import { PERF } from '../core/performance.js';

/**
 * SkyDome — a large inverted sphere with a three-stop vertical gradient
 * (top → horizon → bottom) drawn in a shader. Cheap, no textures, and the stops
 * can be lerped at runtime so the hub viewport's sky can "heal" between states.
 *
 * Real HDR skyboxes (user-supplied later) can replace this without touching
 * callers — just swap the dome mesh for a CubeTexture background.
 */
export class SkyDome {
  constructor(palette) {
    this.uniforms = {
      uTop: { value: new THREE.Color(palette.top) },
      uHorizon: { value: new THREE.Color(palette.horizon) },
      uBottom: { value: new THREE.Color(palette.bottom) },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec3 vPos; uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
        void main(){
          float h = normalize(vPos).y;            // -1..1
          vec3 col = h > 0.0
            ? mix(uHorizon, uTop, pow(h, 0.6))
            : mix(uHorizon, uBottom, pow(-h, 0.7));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(600, PERF.skySegments[0], PERF.skySegments[1]), mat);
    this.mesh.frustumCulled = false;
    this._tween = null;
  }

  /** Smoothly retint to a new palette over `dur` seconds (drives the heal). */
  lerpTo(palette, dur = 3) {
    this._tween = {
      t: 0, dur,
      from: {
        top: this.uniforms.uTop.value.clone(),
        horizon: this.uniforms.uHorizon.value.clone(),
        bottom: this.uniforms.uBottom.value.clone(),
      },
      to: {
        top: new THREE.Color(palette.top),
        horizon: new THREE.Color(palette.horizon),
        bottom: new THREE.Color(palette.bottom),
      },
    };
  }

  update(delta) {
    if (!this._tween) return;
    const tw = this._tween;
    tw.t = Math.min(1, tw.t + delta / tw.dur);
    const k = tw.t * tw.t * (3 - 2 * tw.t); // smoothstep
    this.uniforms.uTop.value.copy(tw.from.top).lerp(tw.to.top, k);
    this.uniforms.uHorizon.value.copy(tw.from.horizon).lerp(tw.to.horizon, k);
    this.uniforms.uBottom.value.copy(tw.from.bottom).lerp(tw.to.bottom, k);
    if (tw.t >= 1) this._tween = null;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * Six hub-viewport sky states, indexed by embers secured (0 corrupted → 5
 * healed). The hub dome lerps up one state each time an ember is returned.
 */
export const HUB_SKY_STATES = [
  { top: '#2a0d08', horizon: '#5a1808', bottom: '#160805' }, // 0 corrupted eclipse
  { top: '#34160a', horizon: '#8a3410', bottom: '#1c0c07' }, // 1 ember breaking
  { top: '#10203e', horizon: '#3a4e86', bottom: '#0a1020' }, // 2 deep water
  { top: '#16302e', horizon: '#3a7a6a', bottom: '#0c1814' }, // 3 forests return
  { top: '#2a4a78', horizon: '#86a6c8', bottom: '#1a2c44' }, // 4 daylight w/ storm
  { top: '#43618f', horizon: '#f0c486', bottom: '#2a3a52' }, // 5 golden hour healed
];

/**
 * Load `skybox.gltf` (when present) and wrap it around the scene: scaled to
 * enclose everything, drawn first, unaffected by lights/fog, and DOUBLE-SIDED so
 * its inner faces show from the camera inside it. Resolves to the sky object, or
 * null when the file is absent (caller keeps its procedural dome).
 *
 * @param {import('../core/AssetLoader.js').AssetLoader} assets
 * @param {THREE.Scene} three
 * @param {{ radius?: number, onLoaded?: (sky: THREE.Object3D) => void }} [opts]
 */
export function applySkybox(assets, three, { radius = 600, onLoaded, force = false } = {}) {
  if (!force && !PERF.loadSkybox) return Promise.resolve(null);
  return assets.loadModel('skybox.gltf').then((sky) => {
    if (!sky || !three) return null;
    const box = new THREE.Box3().setFromObject(sky);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = (radius * 1.9) / maxDim;
    sky.scale.setScalar(s);
    sky.position.set(-center.x * s, -center.y * s, -center.z * s);
    sky.renderOrder = -1;
    sky.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        m.side = THREE.DoubleSide;   // show from inside without guessing winding
        m.fog = false;               // sky shouldn't fade into scene fog
        m.depthWrite = false;        // always behind everything
        m.toneMapped = false;        // keep painted-sky colours as authored
      });
    });
    three.add(sky);
    onLoaded?.(sky);
    return sky;
  });
}
