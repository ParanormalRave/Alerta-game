import * as THREE from 'three';
import { PERF } from '../core/performance.js';
import { disposeObject } from '../core/meshUtils.js';

/**
 * EnemyBase — one creature: placeholder silhouette (swapped for a GLB by the
 * AssetLoader), HP, and the spec's state machine driven each frame:
 *   IDLE → PATROL → ALERT → CHASE → ATTACK → STAGGER → DEAD
 *
 * The group is the raycast target (group.userData.enemy = this); melee/ranged
 * systems walk up to it. Ground height + player damage come from `ctx`.
 */
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class EnemyBase {
  constructor(assets, def, spawnPos, ctx) {
    this.def = def;
    this.ctx = ctx;
    this.health = def.health;
    this.maxHealth = def.health;
    this.float = !!def.float;
    this.hoverY = this.float ? 0.75 : 0;
    // horizontal collision footprint (≈ a fraction of the model's fitted size)
    this.radius = Math.min(1.2, Math.max(0.4, (def.fitSize ?? 2) * 0.22));
    this.dead = false;
    this.deathNotified = false;
    this.engaged = false;
    this.lastEngageT = 0; // last time aggroed/hit — used to let far foes re-sleep
    this.removeAt = 0;
    this.moving = false;          // set true on a frame the body actually walks
    this.bobPhase = Math.random() * 10; // desync the idle/walk bob per creature

    this.group = new THREE.Group();
    this.group.position.copy(spawnPos);
    this.group.userData.enemy = this;

    const scale = def.scale ?? 1;
    this.visual = assets.spawn(def.model, () => makeSilhouette(def, scale), {
      scale,
      fitSize: def.fitSize,
      load: PERF.loadActorModels,
    });
    this.group.add(this.visual);

    // AI
    this.state = 'PATROL';
    this.stateT = 0;
    this.attackCd = 0;
    this.staggerT = 0;
    this.hitFlash = 0;
    this.burnT = 0;
    this.burnDps = 0;
    this.burnTick = 0;
    this.slowT = 0;
    this.vulnT = 0;
    this.home = spawnPos.clone();
    this.waypoint = new THREE.Vector3();
    this._pickWaypoint();
  }

  get mesh() { return this.group; }
  get position() { return this.group.position; }

  /** Re-roll the patrol target in place (no per-call allocation). */
  _pickWaypoint() {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 6;
    this.waypoint.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
  }

  resetToHome() {
    this.dead = false;
    this.deathNotified = false;
    this.health = this.maxHealth;
    this.removeAt = 0;
    this.engaged = false;
    this.lastEngageT = 0;
    this.attackCd = 0;
    this.staggerT = 0;
    this.hitFlash = 0;
    this.burnT = 0;
    this.burnDps = 0;
    this.burnTick = 0;
    this.slowT = 0;
    this.vulnT = 0;
    this.position.copy(this.home);
    this.position.y = this._groundY(this.home.x, this.home.z);
    this.visual.position.set(0, 0, 0);
    this.visual.scale.setScalar(1);
    this.visual.rotation.set(0, 0, 0);
    this._setState('PATROL');
    this._pickWaypoint();
  }

  _engage() { this.engaged = true; this.lastEngageT = this.ctx.now; }

  _groundY(x, z) {
    const g = this.ctx.getGroundHeight ? this.ctx.getGroundHeight(x, z) : 0;
    return g + this.hoverY;
  }

  _faceTo(x, z) {
    this.group.rotation.y = Math.atan2(x - this.position.x, z - this.position.z);
  }

  _moveToward(tx, tz, speed, delta) {
    _v2.set(tx - this.position.x, 0, tz - this.position.z);
    const d = _v2.length();
    if (d > 0.001) {
      _v2.multiplyScalar((speed * delta) / d);
      this.position.x += _v2.x;
      this.position.z += _v2.z;
      this._faceTo(tx, tz);
      this.moving = true;
    }
    return d;
  }

  /**
   * Procedural life for animation-less GLBs: a hop + squash/stretch while walking
   * and a gentle idle breathe when standing — plus the hit-pop on top. Without
   * this the imported models are dead-static statues that just slide around.
   */
  _animateBody(delta) {
    const v = this.visual;
    this.bobPhase += delta * (this.moving ? this.def.speed * 1.7 + 5 : 2.2);
    const hop = Math.abs(Math.sin(this.bobPhase));
    let y = hop * (this.moving ? 0.18 : 0.05);
    const stretch = this.moving ? Math.sin(this.bobPhase) * 0.07 : 0;
    let sx = 1 - stretch;
    let sy = 1 + stretch;
    if (this.hitFlash > 0) {          // a struck enemy pops big over everything else
      const pop = this.hitFlash;
      sx = 1 + pop * 0.45;
      sy = 1 + pop * 0.6;
      y += pop * 0.5;
    }
    v.position.y = y;
    v.scale.set(sx, sy, sx);
    // little waddle while walking, eased back to upright when idle
    v.rotation.z = this.moving ? Math.sin(this.bobPhase * 0.5) * 0.08 : v.rotation.z * (1 - Math.min(1, delta * 8));
  }

  update(delta, playerPos, player) {
    if (this.dead) {
      this.position.y += delta * -1.2; // sink into the ground
      return this.ctx.now >= this.removeAt;
    }

    // feedback timers (visual bob/pop is applied in _animateBody at frame end)
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - delta * 5);
    if (this.burnT > 0) {
      this.burnT = Math.max(0, this.burnT - delta);
      this.burnTick += delta;
      if (this.burnTick >= 0.5) {
        this.burnTick = 0;
        this.health -= this.burnDps * 0.5;
        this.ctx.particles?.emit(this.position.clone().setY(this.position.y + 1), { count: 4, color: 0xff5a1e, speed: 1.5, spread: 0.5, life: 0.35, gravity: 1, up: 0.4 });
        if (this.health <= 0) { this._die(); return false; }
      }
    }
    if (this.slowT > 0) this.slowT = Math.max(0, this.slowT - delta);
    if (this.vulnT > 0) this.vulnT = Math.max(0, this.vulnT - delta);
    if (this.attackCd > 0) this.attackCd -= delta;
    this.stateT += delta;
    this.moving = false;

    const dist = _v.subVectors(playerPos, this.position).setY(0).length();
    const def = this.def;

    switch (this.state) {
      case 'PATROL': {
        const reached = this._moveToward(this.waypoint.x, this.waypoint.z, this._moveSpeed(def.speed * 0.5), delta) < 1.2;
        if (reached && this.stateT > 0.5) { this._pickWaypoint(); this.stateT = 0; }
        if (dist < def.detect) {
          this._engage();
          this._setState('ALERT');
        }
        break;
      }
      case 'ALERT': {
        this._faceTo(playerPos.x, playerPos.z);
        if (this.stateT > 0.5) this._setState('CHASE');
        break;
      }
      case 'CHASE': {
        this._moveToward(playerPos.x, playerPos.z, this._moveSpeed(def.speed), delta);
        if (dist <= def.attackRange) this._setState('ATTACK');
        else if (dist > def.detect * 1.5) this._setState('PATROL');
        break;
      }
      case 'ATTACK': {
        this._faceTo(playerPos.x, playerPos.z);
        if (dist > def.attackRange * 1.3) { this._setState('CHASE'); break; }
        if (this.attackCd <= 0) {
          this._engage();
          this.attackCd = def.attackCd;
          // telegraph lunge, then damage at the strike
          this.visual.scale.setScalar(1.15);
          this.ctx.onAttack?.(this, def.damage);
        }
        break;
      }
      case 'STAGGER': {
        this.staggerT -= delta;
        if (this.staggerT <= 0) this._setState('CHASE');
        break;
      }
    }

    // settle onto terrain (or hover)
    const fy = this._groundY(this.position.x, this.position.z);
    this.position.y += (fy - this.position.y) * Math.min(1, delta * 8);
    if (this.float) this.position.y = fy + Math.sin(this.ctx.now * 2 + this.home.x) * 0.08;

    this._animateBody(delta); // bob/bounce + hit-pop
    return false; // not ready for removal
  }

  _setState(s) { this.state = s; this.stateT = 0; }

  _moveSpeed(base) {
    return this.slowT > 0 ? base * 0.48 : base;
  }

  applyStatus(status, fromPos) {
    if (!status || this.dead) return;
    if (status.burn) { this.burnT = Math.max(this.burnT, status.burn); this.burnDps = Math.max(this.burnDps, 10); }
    if (status.slow) this.slowT = Math.max(this.slowT, status.slow);
    if (status.vuln) this.vulnT = Math.max(this.vulnT, status.vuln);
    if (status.stagger) { this._setState('STAGGER'); this.staggerT = Math.max(this.staggerT, status.stagger); }
    if (status.push && fromPos) {
      _v.subVectors(this.position, fromPos).setY(0);
      if (_v.lengthSq() > 0.001) this.position.addScaledVector(_v.normalize(), status.push);
    }
  }

  /** @returns {boolean} true if this hit killed the enemy */
  takeDamage(dmg, fromPos, weapon) {
    if (this.dead) return false;
    this._engage();
    if (this.vulnT > 0) dmg *= 1.25;
    this.applyStatus(weapon?.status, fromPos);
    this.health -= dmg;
    this.hitFlash = 1;

    // knockback + brief stagger — kept light so repeated swings don't shove the
    // foe out of melee reach before it dies (the old big push made kills feel
    // impossible). Heavy push is reserved for explicit `push` status effects.
    if (fromPos) {
      _v.subVectors(this.position, fromPos).setY(0).normalize();
      const kb = weapon?.type === 'melee' ? 0.25 : 0.18;
      this.position.addScaledVector(_v, kb);
    }
    if (this.state !== 'STAGGER') { this._setState('STAGGER'); this.staggerT = 0.25; }

    if (this.health <= 0) { this._die(); return true; }
    return false;
  }

  _die() {
    this.dead = true;
    if (this.deathNotified) return;
    this.deathNotified = true;
    this._setState('DEAD');
    this.removeAt = this.ctx.now + 2.5;
    this.ctx.particles?.deathPuff(this.position.clone().setY(this.position.y + 1), this.def.death);
    this.ctx.onDeath?.(this);
  }

  dispose() {
    // disposeObject leaves shared GLB geometry/materials alone (owned by the
    // AssetLoader cache); only this enemy's unique placeholder bits are freed.
    disposeObject(this.group);
  }
}

/** Placeholder creature silhouette per shape hint. */
function makeSilhouette(def, scale) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.85, metalness: 0.05 });
  const eye = new THREE.MeshStandardMaterial({ color: def.accent, emissive: def.accent, emissiveIntensity: 2.0, roughness: 0.4 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 4, 10), body);
  torso.position.y = 1.0;
  torso.castShadow = PERF.modelCastShadows;
  g.add(torso);

  if (def.shape === 'brute' || def.shape === 'crawler') {
    torso.scale.set(1.5, def.shape === 'crawler' ? 0.7 : 1.2, 1.5);
    torso.position.y = def.shape === 'crawler' ? 0.7 : 1.2;
  }
  if (def.shape === 'wraith') {
    torso.scale.set(1, 1.3, 1);
    torso.material.transparent = true;
    torso.material.opacity = 0.7;
  }

  // glowing eyes
  for (const x of [-0.14, 0.14]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eye);
    e.position.set(x, torso.position.y + 0.45, 0.34);
    g.add(e);
  }
  return g;
}
