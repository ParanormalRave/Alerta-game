import * as THREE from 'three';
import { PERF } from '../core/performance.js';

const FORWARD = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();

function rootTarget(obj, targets) {
  let o = obj;
  while (o) {
    if (targets.includes(o)) return o;
    o = o.parent;
  }
  return null;
}

/**
 * RangedSystem: hit-scan aim with visible pooled projectile/impact FX.
 *
 * The hit is resolved immediately for reliability, but damage is applied when
 * the visible bolt reaches the impact point. Projectiles, flashes and temporary
 * lights are pooled so sustained fire does not create/dispose GPU resources.
 */
export class RangedSystem {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 1000;
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();

    this._sphere = new THREE.SphereGeometry(1, 10, 8);
    this._projectiles = [];
    this._projectilePool = [];
    this._fx = [];
    this._flashPool = [];
    this._lightPool = [];
  }

  _mat(color, opacity = 1) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
  }

  /**
   * @param {THREE.Camera} camera
   * @param {object} weapon
   * @param {THREE.Object3D[]} targets
   * @param {THREE.Scene|null} scene
   * @param {import('../fx/Particles.js').ParticleField|null} particles
   * @param {(hit: {target: THREE.Object3D, point: THREE.Vector3}|null, point?: THREE.Vector3) => void} [onImpact]
   */
  fire(camera, weapon, targets, scene, particles, onImpact) {
    camera.getWorldPosition(this._origin);
    camera.getWorldDirection(this._dir);

    this.raycaster.set(this._origin, this._dir);
    const inter = targets.length ? this.raycaster.intersectObjects(targets, true) : [];

    let hit = null;
    const endPoint = new THREE.Vector3();
    if (inter.length) {
      const root = rootTarget(inter[0].object, targets);
      endPoint.copy(inter[0].point);
      if (root) hit = { target: root, point: endPoint.clone() };
    } else {
      endPoint.copy(this._origin).addScaledVector(this._dir, 60);
    }

    if (!scene) {
      onImpact?.(hit, endPoint);
      return hit;
    }

    const e = camera.matrixWorld.elements;
    this._right.set(e[0], e[1], e[2]);
    this._up.set(e[4], e[5], e[6]);
    const muzzle = this._origin.clone()
      .addScaledVector(this._right, 0.16)
      .addScaledVector(this._up, -0.10)
      .addScaledVector(this._dir, 0.6);

    const color = weapon.view.glow;
    const shape = weapon.view.shape;
    const speed = weapon.projectileSpeed || ((shape === 'staff' || shape === 'wand') ? 70 : 110);

    this._spawnMuzzle(muzzle, color, scene);
    this._spawnProjectile(muzzle, endPoint, color, speed, hit, onImpact, particles, scene);
    return hit;
  }

  _spawnProjectile(from, to, color, speed, hit, onImpact, particles, scene) {
    _v.subVectors(to, from);
    const dist = _v.length() || 0.001;
    _v.multiplyScalar(1 / dist);

    const p = this._getProjectile(color);
    p.group.position.copy(from);
    p.group.quaternion.setFromUnitVectors(FORWARD, _v);
    p.group.visible = true;
    scene.add(p.group);

    p.from.copy(from);
    p.to.copy(to);
    p.dist = dist;
    p.traveled = 0;
    p.speed = speed;
    p.color = color;
    p.hit = hit;
    p.onImpact = onImpact;
    p.particles = particles;
    p.scene = scene;
    this._projectiles.push(p);
  }

  _spawnMuzzle(pos, color, scene) {
    this._spawnFlash(pos, color, scene, 0.2, 0.02, 0.06);
    if (PERF.dynamicPointLights) this._spawnLight(pos, color, 5, 7, 0.06, scene);
  }

  _impact(pos, color, scene, particles) {
    this._spawnFlash(pos, color, scene, 0.12, 0.7, 0.16);
    particles?.emit(pos, { count: 14, color, speed: 6, spread: 1.4, life: 0.4, gravity: 6, up: 0.5, size: 0.22 });
    if (PERF.dynamicPointLights) this._spawnLight(pos, color, 6, 8, 0.1, scene);
  }

  _spawnFlash(pos, color, scene, s0, s1, ttl) {
    const fx = this._getFlash(color);
    fx.obj.position.copy(pos);
    fx.obj.scale.setScalar(s0);
    fx.obj.material.opacity = 1;
    fx.obj.visible = true;
    scene.add(fx.obj);
    fx.ttl = ttl;
    fx.max = ttl;
    fx.scene = scene;
    fx.s0 = s0;
    fx.s1 = s1;
    this._fx.push(fx);
  }

  _spawnLight(pos, color, intensity, distance, ttl, scene) {
    const fx = this._getLight(color);
    fx.obj.position.copy(pos);
    fx.obj.color.setHex(color);
    fx.obj.intensity = intensity;
    fx.obj.distance = distance;
    scene.add(fx.obj);
    fx.ttl = ttl;
    fx.max = ttl;
    fx.scene = scene;
    fx.intensity = intensity;
    this._fx.push(fx);
  }

  update(delta) {
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      p.traveled += p.speed * delta;
      const t = Math.min(1, p.traveled / p.dist);
      p.group.position.lerpVectors(p.from, p.to, t);
      if (t >= 1) {
        const impactScene = p.scene;
        const impactPoint = p.to;
        const impactColor = p.color;
        const impactParticles = p.particles;
        const impactHit = p.hit;
        const onImpact = p.onImpact;
        this._releaseProjectile(p);
        this._impact(impactPoint, impactColor, impactScene, impactParticles);
        onImpact?.(impactHit, impactPoint);
        this._projectiles.splice(i, 1);
      }
    }

    for (let i = this._fx.length - 1; i >= 0; i--) {
      const fx = this._fx[i];
      fx.ttl -= delta;
      const k = Math.max(0, fx.ttl / fx.max);
      if (fx.kind === 'mesh') {
        fx.obj.material.opacity = k;
        fx.obj.scale.setScalar(fx.s0 + (fx.s1 - fx.s0) * (1 - k));
      } else {
        fx.obj.intensity = fx.intensity * k;
      }
      if (fx.ttl <= 0) {
        this._releaseFx(fx);
        this._fx.splice(i, 1);
      }
    }
  }

  _getProjectile(color) {
    const pooled = this._projectilePool.pop();
    if (pooled) {
      pooled.core.material.color.setHex(color);
      pooled.halo.material.color.setHex(color);
      pooled.core.material.opacity = 1;
      pooled.halo.material.opacity = 0.4;
      return pooled;
    }

    const group = new THREE.Group();
    const core = new THREE.Mesh(this._sphere, this._mat(color));
    core.scale.set(0.05, 0.05, 0.22);
    const halo = new THREE.Mesh(this._sphere, this._mat(color, 0.4));
    halo.scale.setScalar(0.13);
    group.add(core, halo);
    group.frustumCulled = false;
    return {
      group,
      core,
      halo,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      dist: 1,
      traveled: 0,
      speed: 1,
      color,
      hit: null,
      onImpact: null,
      particles: null,
      scene: null,
    };
  }

  _releaseProjectile(p) {
    p.scene?.remove(p.group);
    p.group.visible = false;
    p.scene = null;
    p.hit = null;
    p.onImpact = null;
    p.particles = null;
    this._projectilePool.push(p);
  }

  _getFlash(color) {
    const pooled = this._flashPool.pop();
    if (pooled) {
      pooled.obj.material.color.setHex(color);
      return pooled;
    }
    const obj = new THREE.Mesh(this._sphere, this._mat(color));
    obj.frustumCulled = false;
    return { obj, kind: 'mesh', ttl: 0, max: 0, scene: null, s0: 0, s1: 0 };
  }

  _getLight(color) {
    const pooled = this._lightPool.pop();
    if (pooled) return pooled;
    return { obj: new THREE.PointLight(color, 0, 1), kind: 'light', ttl: 0, max: 0, scene: null, intensity: 0 };
  }

  _releaseFx(fx) {
    fx.scene?.remove(fx.obj);
    if (fx.kind === 'mesh') {
      fx.obj.visible = false;
      this._flashPool.push(fx);
    } else {
      fx.obj.intensity = 0;
      this._lightPool.push(fx);
    }
    fx.scene = null;
  }

  clear() {
    for (const p of this._projectiles) this._releaseProjectile(p);
    this._projectiles.length = 0;
    for (const fx of this._fx) this._releaseFx(fx);
    this._fx.length = 0;
  }

  dispose() {
    this.clear();
    this._sphere.dispose();
    for (const p of this._projectilePool) {
      p.core.material.dispose();
      p.halo.material.dispose();
    }
    for (const fx of this._flashPool) fx.obj.material.dispose();
  }
}
