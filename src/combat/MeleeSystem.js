import * as THREE from 'three';

function rootTarget(obj, targets) {
  let o = obj;
  while (o) {
    if (targets.includes(o)) return o;
    o = o.parent;
  }
  return null;
}

export class MeleeSystem {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._castDir = new THREE.Vector3();
    this._flatDir = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();
    this._point = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._arc = [-0.34, 0, 0.34];      // horizontal fan
    this._pitch = [-0.32, 0, 0.32];    // vertical fan (so foes above/below register)
  }

  swing(camera, weapon, targets) {
    if (!targets.length) return [];

    camera.getWorldPosition(this._origin);
    camera.getWorldDirection(this._dir);
    // camera right axis (matrixWorld col 0) — the pitch fan rotates about this
    const e = camera.matrixWorld.elements;
    this._right.set(e[0], e[1], e[2]).normalize();

    const hits = [];
    const seen = new Set();
    const far = weapon.range + 0.6;

    // Fan rays both horizontally and vertically: a foe you're roughly facing
    // connects without pixel-perfect aim — including one floating above you.
    for (const yaw of this._arc) {
      for (const pitch of this._pitch) {
        this._castDir.copy(this._dir)
          .applyAxisAngle(this._up, yaw)
          .applyAxisAngle(this._right, pitch)
          .normalize();
        this.raycaster.set(this._origin, this._castDir);
        this.raycaster.far = far;
        const inter = this.raycaster.intersectObjects(targets, true);
        if (!inter.length) continue;
        const root = rootTarget(inter[0].object, targets);
        if (root && !seen.has(root)) {
          seen.add(root);
          hits.push({ target: root, point: inter[0].point.clone() });
        }
      }
    }

    this._flatDir.copy(this._dir).setY(0);
    if (this._flatDir.lengthSq() > 0.001) this._flatDir.normalize();
    // Forgiving sweep: wide cone + tall vertical reach so strikes reliably land
    // (and reach aliens hovering overhead) instead of whiffing on a narrow aim.
    const cosLimit = Math.cos(weapon.cone ?? 1.0);
    const verticalReach = weapon.verticalReach ?? 4.5;

    for (const target of targets) {
      if (seen.has(target)) continue;
      const ent = target.userData.enemy;
      const pos = ent?.position || target.position;
      this._toTarget.subVectors(pos, this._origin);
      const vertical = Math.abs(this._toTarget.y);
      this._toTarget.y = 0;
      const dist = this._toTarget.length();
      if (dist > weapon.range + 1.5 || vertical > verticalReach) continue;
      if (dist > 0.001) this._toTarget.multiplyScalar(1 / dist);
      if (this._flatDir.dot(this._toTarget) < cosLimit) continue;
      seen.add(target);
      this._point.copy(pos).setY(pos.y + Math.min(1.5, verticalReach * 0.45));
      hits.push({ target, point: this._point.clone() });
    }

    return hits;
  }
}
