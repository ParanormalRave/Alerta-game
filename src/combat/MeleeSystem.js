import * as THREE from 'three';

/** Walk up the parent chain until we hit a registered target object. */
function rootTarget(obj, targets) {
  let o = obj;
  while (o) {
    if (targets.includes(o)) return o;
    o = o.parent;
  }
  return null;
}

/**
 * MeleeSystem — swing-arc hit detection.
 *
 * On a swing, casts 3 rays from the camera in a horizontal arc (left/center/
 * right, ~±15°), each limited to the weapon's range. Returns the unique set of
 * targets hit, nearest point per target.
 */
export class MeleeSystem {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._arc = [-0.26, 0, 0.26]; // radians ≈ ±15°
  }

  /**
   * @param {THREE.Camera} camera
   * @param {object} weapon - entry from WEAPONS
   * @param {THREE.Object3D[]} targets
   * @returns {{target: THREE.Object3D, point: THREE.Vector3}[]}
   */
  swing(camera, weapon, targets) {
    if (!targets.length) return [];

    camera.getWorldPosition(this._origin);
    camera.getWorldDirection(this._dir);

    const hits = [];
    const seen = new Set();

    for (const a of this._arc) {
      const dir = this._dir.clone().applyAxisAngle(this._up, a).normalize();
      this.raycaster.set(this._origin, dir);
      this.raycaster.far = weapon.range;
      const inter = this.raycaster.intersectObjects(targets, true);
      if (!inter.length) continue;
      const root = rootTarget(inter[0].object, targets);
      if (root && !seen.has(root)) {
        seen.add(root);
        hits.push({ target: root, point: inter[0].point.clone() });
      }
    }
    return hits;
  }
}
