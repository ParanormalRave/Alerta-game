import * as THREE from 'three';
import { PERF } from '../core/performance.js';

function rootTarget(obj, targets) {
  let o = obj;
  while (o) {
    if (targets.includes(o)) return o;
    o = o.parent;
  }
  return null;
}

/**
 * RangedSystem — hit-scan firing with a fading tracer + muzzle-flash light.
 *
 * Phase 3 uses instant ray hit-scan (reliable, cheap). Visuals are a short
 * tracer line and a brief point light, both faded out and disposed on a TTL.
 * True travelling projectiles + pooling are a Phase 14 polish concern.
 */
export class RangedSystem {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 1000;
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    /** active transient visuals (each remembers the scene it was added to) */
    this._fx = [];
  }

  /**
   * @param {THREE.Scene} scene  active scene to draw the tracer into
   * @returns {{target: THREE.Object3D, point: THREE.Vector3}|null}
   */
  fire(camera, weapon, targets, scene) {
    camera.getWorldPosition(this._origin);
    camera.getWorldDirection(this._dir);

    this.raycaster.set(this._origin, this._dir);
    const inter = targets.length
      ? this.raycaster.intersectObjects(targets, true)
      : [];

    let hit = null;
    let endPoint;
    if (inter.length) {
      const root = rootTarget(inter[0].object, targets);
      endPoint = inter[0].point.clone();
      if (root) hit = { target: root, point: endPoint.clone() };
    } else {
      endPoint = this._origin.clone().addScaledVector(this._dir, 60);
    }

    // Tracer starts just ahead of the camera so it reads as leaving the muzzle.
    const muzzle = this._origin.clone().addScaledVector(this._dir, 0.6);
    if (scene) this._spawnTracer(muzzle, endPoint, weapon.view.glow, scene);

    return hit;
  }

  _spawnTracer(a, b, color, scene) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    this._fx.push({ obj: line, ttl: 0.08, max: 0.08, kind: 'line', scene });

    if (PERF.dynamicPointLights) {
      const flash = new THREE.PointLight(color, 5, 7);
      flash.position.copy(a);
      scene.add(flash);
      this._fx.push({ obj: flash, ttl: 0.06, max: 0.06, kind: 'light', scene });
    }
  }

  update(delta) {
    for (let i = this._fx.length - 1; i >= 0; i--) {
      const fx = this._fx[i];
      fx.ttl -= delta;
      const k = Math.max(0, fx.ttl / fx.max);
      if (fx.kind === 'line') fx.obj.material.opacity = 0.9 * k;
      else fx.obj.intensity = 5 * k;

      if (fx.ttl <= 0) {
        fx.scene.remove(fx.obj);
        if (fx.kind === 'line') {
          fx.obj.geometry.dispose();
          fx.obj.material.dispose();
        }
        this._fx.splice(i, 1);
      }
    }
  }
}
