import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PERF } from './performance.js';
import { markShared, disposeObject } from './meshUtils.js';

/**
 * AssetLoader returns a placeholder immediately, then swaps in a GLB/GLTF when
 * it is ready. It prefers optimized files from /models-compressed and falls
 * back to /models so development still works while compression is incomplete.
 */
export class AssetLoader {
  constructor(base = '/models/') {
    this.base = base;
    this.compressedBase = '/models-compressed/';
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.cache = new Map();
    // name|scale|fitSize -> { factor, cx, cz, minY } so Box3.setFromObject runs
    // once per model variant instead of on every spawn.
    this.fitCache = new Map();
  }

  _fetch(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const p = new Promise((resolve) => {
      const urls = this._candidateUrls(name);
      const tryNext = (i) => {
        if (i >= urls.length) {
          resolve(null);
          return;
        }
        this.loader.load(
          urls[i],
          (gltf) => {
            // The cached scene is the single owner of these GPU buffers; mark
            // them shared so per-instance disposal never frees them (clones
            // share the references). Fixes the vanishing-after-death bug.
            markShared(gltf.scene);
            resolve(gltf.scene);
          },
          undefined,
          () => tryNext(i + 1)
        );
      };
      tryNext(0);
    });
    this.cache.set(name, p);
    return p;
  }

  /** Warm a set of GLBs so the first spawn doesn't hitch (call behind a fade). */
  preload(names) {
    if (!names) return;
    for (const n of names) if (n) this._fetch(n);
  }

  _candidateUrls(name) {
    const compressedName = name.endsWith('.gltf') ? name.replace(/\.gltf$/i, '.glb') : name;
    return [
      this.compressedBase + compressedName,
      this.base + name,
    ];
  }

  /**
   * @param {string} name GLB/GLTF filename in /public/models/
   * @param {() => THREE.Object3D} makePlaceholder
   * @param {{scale?:number, fitSize?:number, load?:boolean, onReady?:(obj:THREE.Object3D)=>void}} [opts]
   * @returns {THREE.Group}
   */
  spawn(name, makePlaceholder, opts = {}) {
    const group = new THREE.Group();
    const placeholder = makePlaceholder();
    placeholder.userData.__placeholder = true;
    applyShadowPolicy(placeholder);
    group.add(placeholder);

    if (opts.load === false) {
      opts.onReady?.(placeholder);
      return group;
    }

    this._fetch(name).then((src) => {
      if (!src || !group.parent) return;
      const model = src.clone(true);
      this._normalize(model, name, opts.scale ?? 1, opts.fitSize);
      applyShadowPolicy(model);
      group.remove(placeholder);
      disposeObject(placeholder); // placeholder is unique → safe to free
      group.add(model);
      opts.onReady?.(model);
    });

    return group;
  }

  /**
   * Scale + seat a freshly cloned model. The fit transform (scale factor + xz
   * recentre + y-floor) is identical for every clone of the same model variant,
   * so it's measured once with Box3 and cached — later clones skip the (costly)
   * setFromObject entirely, killing per-spawn frame hitches.
   */
  _normalize(model, name, scale, fitSize) {
    const key = `${name}|${scale}|${fitSize}`;
    const cached = this.fitCache.get(key);
    if (cached) {
      model.scale.setScalar(cached.factor);
      model.position.set(cached.px, cached.py, cached.pz);
      return;
    }
    model.scale.setScalar(scale);
    model.updateWorldMatrix(true, true);
    let box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    let factor = scale;
    if (fitSize) {
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      factor = scale * (fitSize / maxDim);
      model.scale.setScalar(factor);
      model.updateWorldMatrix(true, true);
      box = new THREE.Box3().setFromObject(model);
    }
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    // Every clone of this source shares an identical start transform, so the
    // resolved position is constant — cache it so later clones skip Box3 work.
    this.fitCache.set(key, { factor, px: model.position.x, py: model.position.y, pz: model.position.z });
  }

  loadModel(name) {
    return this._fetch(name).then((src) => (src ? src.clone(true) : null));
  }
}

function applyShadowPolicy(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = PERF.modelCastShadows;
    o.receiveShadow = PERF.modelReceiveShadows;
  });
}
