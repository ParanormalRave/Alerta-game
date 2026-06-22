import * as THREE from 'three';
import { PERF } from '../core/performance.js';
import { disposeObject } from '../core/meshUtils.js';

/**
 * BossBase — an oversized foe with a full-width HP meter, three phases (66% /
 * 33% HP), telegraphed attacks, and a 2× weak point. Attacks are a small set of
 * timed behaviours the boss cycles through per phase; each has a wind-up tell
 * (scale/colour pulse + particles) before it lands.
 */
const _v = new THREE.Vector3();
const _weak = new THREE.Vector3(); // scratch for weakWorld() — no per-call alloc

const pc = (count) => Math.max(1, Math.round(count * PERF.particleScale));

export class BossBase {
  constructor(assets, def, spawnPos, ctx) {
    this.def = def;
    this.ctx = ctx;
    this.health = def.health;
    this.maxHealth = def.health;
    this.dead = false;
    this.phase = 0; // 0,1,2
    this.float = !!def.float;
    // horizontal collision footprint — bulky, but kept near the visible mass so
    // melee can still reach the body (the swing ray hits the near surface).
    this.radius = Math.max(1.0, (def.fitSize ?? 5) * 0.22);

    this.group = new THREE.Group();
    this.group.position.copy(spawnPos);
    this.group.userData.enemy = this; // raycastable like an enemy
    this.home = spawnPos.clone();

    const scale = def.scale ?? 2.4;
    this.visual = assets.spawn(def.model, () => makeBoss(def, scale), {
      scale,
      fitSize: def.fitSize,
      load: PERF.loadActorModels,
    });
    // Approx body height: fitted size for a real model, else placeholder height.
    const bodyH = def.fitSize ?? 2.6 * scale;
    this.group.add(this.visual);

    // Weak point marker (also a glowing tell of where to strike)
    this.weak = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 12),
      new THREE.MeshStandardMaterial({ color: def.accent, emissive: def.accent, emissiveIntensity: 2.5 })
    );
    this.weak.position.set(0, bodyH * 0.6, bodyH * 0.08);
    this.weak.userData.weakPoint = true;
    this.group.add(this.weak);

    // attack timeline
    this.atkT = 1.5;       // time to next attack
    this.windup = 0;       // >0 while telegraphing
    this.pending = null;   // attack to fire when windup ends
    this.hitFlash = 0;
    this.burnT = 0;
    this.burnDps = 0;
    this.burnTick = 0;
    this.slowT = 0;
    this.vulnT = 0;
    this.bobPhase = Math.random() * 10; // procedural lumber (GLBs have no anim)

    // The full-width boss meter is reserved for the final-portal Conqueror; realm
    // guardians read their state from the glowing weak point + hit feedback only.
    this.showBar = ctx.showBar === true;
    if (this.showBar) ctx.ui?.showBoss(def.name, def.weak);
    ctx.audio?.play('boss_roar');
  }

  get mesh() { return this.group; }
  get position() { return this.group.position; }

  resetToHome() {
    this.health = this.maxHealth;
    this.dead = false;
    this.phase = 0;
    this.atkT = 1.5;
    this.windup = 0;
    this.pending = null;
    this.hitFlash = 0;
    this.burnT = 0;
    this.burnDps = 0;
    this.burnTick = 0;
    this.slowT = 0;
    this.vulnT = 0;
    const y = (this.ctx.getGroundHeight?.(this.home.x, this.home.z) ?? this.home.y) + (this.float ? 1.5 : 0);
    this.position.set(this.home.x, y, this.home.z);
    this.visual.position.set(0, 0, 0);
    this.visual.scale.setScalar(1);
    this.visual.rotation.set(0, 0, 0);
    if (this.showBar) this.ctx.ui?.setBossHealth(1);
  }

  _phasePatterns() { return this.def.phases[this.phase]; }

  update(delta, playerPos, player) {
    if (this.dead) return false;

    if (this.hitFlash > 0) this.hitFlash -= delta * 4;
    if (this.burnT > 0) {
      this.burnT = Math.max(0, this.burnT - delta);
      this.burnTick += delta;
      if (this.burnTick >= 0.5) {
        this.burnTick = 0;
        this.health -= this.burnDps * 0.5;
        this.ctx.particles?.emit(this.weakWorld(), { count: pc(5), color: 0xff5a1e, speed: 1.4, spread: 0.6, life: 0.35, up: 0.4 });
        if (this.showBar) this.ctx.ui?.setBossHealth(Math.max(0, this.health / this.maxHealth));
        if (this.health <= 0) { this._die(); return false; }
      }
    }
    if (this.slowT > 0) this.slowT = Math.max(0, this.slowT - delta);
    if (this.vulnT > 0) this.vulnT = Math.max(0, this.vulnT - delta);
    this.weak.rotation.y += delta * 1.5;
    this.weak.material.emissiveIntensity = 2 + Math.sin(this.ctx.now * 4) * 1;

    // slowly orient + advance on the player
    this.group.rotation.y = Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z);
    const dist = _v.subVectors(playerPos, this.position).setY(0).length();
    if (dist > 5) this._moveToward(playerPos, this._moveSpeed(this.def.speed), delta);

    // ground clamp
    const fy = (this.ctx.getGroundHeight?.(this.position.x, this.position.z) ?? 0) + (this.float ? 1.5 : 0);
    this.position.y += (fy - this.position.y) * Math.min(1, delta * 6);

    // heavy procedural lumber + hit recoil (wind-up tell below overrides scale)
    const moving = dist > 5;
    this.bobPhase += delta * (moving ? this.def.speed * 1.1 + 2.5 : 1.3);
    let by = Math.abs(Math.sin(this.bobPhase)) * (moving ? 0.22 : 0.06);
    let bs = 1;
    if (this.hitFlash > 0) { const pop = Math.max(0, this.hitFlash); bs = 1 + pop * 0.18; by += pop * 0.4; }
    this.visual.position.y = by;
    this.visual.scale.set(bs, bs, bs);

    // attack timeline
    if (this.windup > 0) {
      this.windup -= delta;
      this.visual.scale.setScalar(1 + (0.5 - Math.abs(this.windup - 0.4)) * 0.2);
      if (this.windup <= 0) { this._resolveAttack(this.pending, playerPos, player); this.pending = null; }
    } else {
      this.atkT -= delta;
      if (this.atkT <= 0) {
        const pats = this._phasePatterns();
        this.pending = pats[Math.floor(Math.random() * pats.length)];
        this.windup = 0.8;
        this.atkT = 2.4 + Math.random() * 1.6;
        this.ctx.particles?.emit(this.weakWorld(), { count: pc(18), color: this.def.accent, speed: 2, life: 0.8, up: 0.6 });
      }
    }
    return false;
  }

  _moveToward(target, speed, delta) {
    _v.set(target.x - this.position.x, 0, target.z - this.position.z);
    const d = _v.length();
    if (d > 0.001) { _v.multiplyScalar((speed * delta) / d); this.position.x += _v.x; this.position.z += _v.z; }
  }

  _moveSpeed(base) {
    return this.slowT > 0 ? base * 0.58 : base;
  }

  weakWorld() { return this.weak.getWorldPosition(_weak); }

  _resolveAttack(kind, playerPos, player) {
    const ctx = this.ctx;
    const dist = _v.subVectors(playerPos, this.position).setY(0).length();
    const hitPlayer = (amt) => { if (player) ctx.onBossHit?.(amt); };

    switch (kind) {
      case 'charge':
      case 'barrage':
        this._moveToward(playerPos, 14, 0.3); // lunge
        if (dist < 4) hitPlayer(this.def.damage);
        break;
      case 'stomp':
        ctx.particles?.emit(this.position.clone(), { count: pc(40), color: this.def.accent, speed: 6, spread: 3, life: 1, up: 0.2 });
        if (dist < 6) hitPlayer(this.def.damage * 0.8);
        break;
      case 'firering':
      case 'flood':
      case 'beam':
        ctx.particles?.emit(this.position.clone().setY(this.position.y + 1), { count: pc(80), color: this.def.accent, speed: 9, spread: 4, life: 1.2 });
        if (dist < 9) hitPlayer(this.def.damage * 1.1);
        break;
      case 'waterbolt':
      case 'cannon':
      case 'blasts':
        ctx.particles?.emit(this.weakWorld(), { count: pc(24), color: this.def.accent, speed: 12, spread: 0.5, life: 0.8 });
        if (dist < 24) hitPlayer(this.def.damage); // ranged
        break;
      case 'summon':
      case 'drones':
        ctx.spawnAdds?.(this.phase + 2);
        break;
      case 'summonall':
        ctx.spawnAdds?.(4, true);
        break;
      case 'mirror':
        this._moveToward(playerPos, 16, 0.3);
        if (dist < 4) hitPlayer(this.def.damage);
        break;
      case 'invert':
        ctx.onInvert?.(2.5); // pale twin: briefly invert controls
        break;
      case 'split':
        ctx.spawnAdds?.(2);
        break;
    }
  }

  takeDamage(dmg, fromPos, weapon, point) {
    if (this.dead) return false;
    this.applyStatus(weapon?.status, fromPos);
    // weak-point check: hit point near the marker → 2× damage
    let mult = 1;
    if (point && point.distanceTo(this.weakWorld()) < 1.0) { mult = 2; this.ctx.ui?.flashWeak(); }
    if (this.vulnT > 0) mult *= 1.2;
    this.health -= dmg * mult;
    this.lastDamageTaken = dmg * mult;
    this.hitFlash = 1;
    this.ctx.particles?.emit(point || this.weakWorld(), { count: pc(10), color: this.def.accent, speed: 3, life: 0.5 });

    // phase transitions
    const f = this.health / this.maxHealth;
    const newPhase = f <= 0.33 ? 2 : f <= 0.66 ? 1 : 0;
    if (newPhase > this.phase) { this.phase = newPhase; this.atkT = 0.6; this.ctx.audio?.play('boss_roar'); }

    if (this.showBar) this.ctx.ui?.setBossHealth(Math.max(0, f));
    if (this.health <= 0) { this._die(); return true; }
    return false;
  }

  _die() {
    this.dead = true;
    this.ctx.particles?.emit(this.position.clone().setY(this.position.y + 2), { count: pc(160), color: this.def.accent, speed: 8, spread: 4, life: 1.8 });
    if (this.showBar) this.ctx.ui?.hideBoss();
    this.ctx.onDefeated?.(this);
  }

  applyStatus(status, fromPos) {
    if (!status || this.dead) return;
    if (status.burn) { this.burnT = Math.max(this.burnT, status.burn); this.burnDps = Math.max(this.burnDps, 8); }
    if (status.slow) this.slowT = Math.max(this.slowT, status.slow);
    if (status.vuln) this.vulnT = Math.max(this.vulnT, status.vuln);
    if (status.stagger) this.atkT = Math.max(this.atkT, status.stagger);
    if (status.push && fromPos) {
      _v.subVectors(this.position, fromPos).setY(0);
      if (_v.lengthSq() > 0.001) this.position.addScaledVector(_v.normalize(), status.push * 0.35);
    }
  }

  dispose() {
    disposeObject(this.group);
  }
}

function makeBoss(def, scale) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.8, metalness: 0.2 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.6, 6, 12), body);
  torso.position.y = 1.6;
  torso.scale.set(1.6, 1.4, 1.4);
  torso.castShadow = PERF.modelCastShadows;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), body);
  head.position.y = 3.0;
  head.castShadow = PERF.modelCastShadows;
  g.add(head);
  return g;
}
