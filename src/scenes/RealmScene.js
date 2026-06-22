import * as THREE from 'three';
import { ChunkManager } from '../world/ChunkManager.js';
import { TriangleChunkManager } from '../world/TriangleChunkManager.js';
import { ParticleField } from '../fx/Particles.js';
import { EnemyBase } from '../enemies/EnemyBase.js';
import { BossBase } from '../enemies/BossBase.js';
import { EmberRock } from '../world/EmberRock.js';
import { Portal } from '../world/PortalSystem.js';
import { LootSystem } from '../world/LootSystem.js';
import { ENEMIES, BOSSES, ENEMY_DAMAGE_SCALE } from '../data/enemies.js';
import { WEAPONS } from '../data/weapons.js';
import { PASSIVE_BY_REALM, upgradeName } from '../data/upgrades.js';
import { setupAtmosphere, scatterProps } from './sceneUtils.js';
import { applySkybox } from '../skybox/SkyboxManager.js';
import {
  gameState, secureEmber, recordKill, refreshPortalUnlocks,
} from '../data/gameState.js';
import { PERF, scaledCount } from '../core/performance.js';
import { TERRAIN_TYPE, TERRAIN_TYPES } from '../core/gameConfig.js';
import { disposeObject } from '../core/meshUtils.js';
import { resolveStatic, pushOutOfCircle, PLAYER_RADIUS } from '../world/Collision.js';

const CENTER = new THREE.Vector3(0, 0, 0);
// Small life reward per felled foe so attrition fights stay survivable (there's
// no passive health regen during play). Capped at maxHealth in Player.heal().
const HEAL_PER_KILL = 5;
const PICKUP_BY_REALM = {
  1: ['ironbreaker'],
  2: ['ember_bow'],
  3: ['force_gauntlet', 'phase_daggers'],
  4: ['voidlance'],
  5: ['convergence_staff'],
};

/**
 * RealmScene — one of the five gameplay zones, configured entirely by a realm
 * definition. The loop: descend → cut through foes → the ember's guardian boss
 * wakes as you near it → fell the boss → extract the ember (heal-wave) → step
 * back through the gold return gate. Realm V swaps this for the Conqueror finale.
 */
export class RealmScene {
  constructor(ctx, realm) {
    this.ctx = ctx;
    this.realm = realm;
    this.three = new THREE.Scene();
    this.enemies = [];
    this.props = [];
    this.pickups = [];
    this.boss = null;
    this.bossSpawned = false;
    // noBoss realms (e.g. world 1) treat the guardian as already gone, so the
    // ember can be claimed the moment you reach it.
    this.bossDefeated = !!realm.noBoss;
    this.emberSecured = false;
    this.purgeTotal = 1;
    this.conquerorPhase = false;
    this.slotsFilled = 0;
    this._t = 0;

    // reusable containers so per-frame queries allocate nothing
    this._targetList = [];
    this._mmEnemies = [];
    this._mmEmber = { x: 0, z: 0 };
    this._mmPortal = { x: 0, z: 0 };
    this._mm = { cx: 0, cz: 0, yaw: 0, accent: 0, ember: null, portal: null, enemies: this._mmEnemies };
  }

  get name() { return this.realm.name; }

  enter() {
    const { ctx, realm } = this;
    ctx.ui.setAccent(realm.accent);

    // Warm the GLBs this realm needs behind the loading fade, so the first time
    // each enemy/boss spawns it doesn't hitch on download + Box3 fitting.
    if (PERF.preloadActors) {
      const names = realm.enemies.map((e) => ENEMIES[e.type]?.model).filter(Boolean);
      const bossModel = BOSSES[realm.boss]?.model;
      if (bossModel) names.push(bossModel);
      ctx.assets.preload(names);
    }

    this.atmo = setupAtmosphere(this.three, realm.sky);
    // Real skybox.gltf wraps the realm when present; hide the gradient dome then.
    applySkybox(ctx.assets, this.three, { onLoaded: () => { this.atmo.dome.mesh.visible = false; } });

    // terrain — per-realm override (realm.terrain) falls back to the global default
    const terrainType = realm.terrain || TERRAIN_TYPE;
    const World = terrainType === TERRAIN_TYPES.TRIANGLE ? TriangleChunkManager : ChunkManager;
    this.world = new World(this.three, { biome: realm.biome, seed: 1000 + realm.index * 7 });
    const spawn = new THREE.Vector3(0, 0, 16);
    this.world.update(spawn, 0);
    if (PERF.initialChunkBuildBudget >= 25) this.world.update(CENTER, 0);

    // props (solid ones also register circle colliders into this.colliders)
    this.colliders = [];
    for (const p of realm.props) {
      this.props.push(...scatterProps(ctx.assets, this.three, p, this.world, { radius: 70, colliders: this.colliders }));
    }

    // particle field (per-scene, one draw call)
    this.particles = new ParticleField(this.three);
    this.loot = new LootSystem(this.three, this.world, ctx);

    this._buildWeaponPickups();

    // shared ctx for enemies/boss
    this.ectx = {
      getGroundHeight: (x, z) => this.world.getGroundHeight(x, z),
      particles: this.particles,
      audio: ctx.audio, ui: ctx.ui, player: ctx.player, now: 0,
      onDeath: (e) => this._onEnemyDeath(e),
      onAttack: (_e, dmg) => this._damagePlayer(dmg * ENEMY_DAMAGE_SCALE),
      onBossHit: (dmg) => this._damagePlayer(dmg),
      spawnAdds: (n, all) => this._spawnAdds(n, all),
      onInvert: (t) => ctx.engine.invertControls(t),
    };

    // enemies
    let total = 0;
    for (const entry of realm.enemies) {
      const count = scaledCount(entry.count, PERF.enemyScale, 1);
      for (let i = 0; i < count; i++) { this._spawnEnemy(entry.type, this._ringPos(16, 56)); total++; }
    }
    this.purgeTotal = Math.max(1, total);

    // ember / motherglass
    this.ember = new EmberRock(ctx.assets, {
      tint: realm.ember.tint, model: realm.ember.model || 'glowing_gem.glb', label: realm.ember.label,
    });
    this.ember.group.position.copy(CENTER);
    this.ember.group.position.y = this.world.getGroundHeight(0, 0);
    this.three.add(this.ember.group);

    // return gate behind spawn
    this.returnPortal = new Portal(ctx.assets, { accent: 0xe8b15a, label: 'the Mothership', target: 'hub' });
    this.returnPortal.group.position.set(0, this.world.getGroundHeight(0, 22), 22);
    this.returnPortal.setState('active');
    this.three.add(this.returnPortal.group);

    // realm V finale framing
    if (realm.index === 5) {
      gameState.realmKills = 0;
      ctx.ui.showTally(0);
    }

    ctx.audio.playMusic('realm' + realm.index);
    ctx.ui.showChapter(realm.roman, realm.name, realm.sub);
    ctx.ui.setMapRealm(realm.key);
    ctx.ui.setObjective(realm.noBoss
      ? `Reach the light pillar and claim ${realm.ember.label}.`
      : `Find the light pillar. Defeat the guardian, then extract ${realm.ember.label}.`);

    // The Ember (AI on 0G Compute) briefs the guardian on this realm.
    ctx.ai?.briefRealm(realm);

    spawn.y = this.world.getGroundHeight(spawn.x, spawn.z);
    this.spawnPoint = spawn;
    return spawn;
  }

  _ringPos(min, max) {
    const a = Math.random() * Math.PI * 2;
    const r = min + Math.random() * (max - min);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    return new THREE.Vector3(x, this.world.getGroundHeight(x, z), z);
  }

  _spawnEnemy(type, pos) {
    const def = ENEMIES[type];
    if (!def) return;
    const e = new EnemyBase(this.ctx.assets, def, pos, this.ectx);
    this.three.add(e.group);
    this.enemies.push(e);
    return e;
  }

  resetActors() {
    for (const e of this.enemies) e.resetToHome();
    this.boss?.resetToHome?.();
  }

  _spawnAdds(n, all) {
    const pool = all ? Object.keys(ENEMIES) : this.realm.enemies.map((e) => e.type);
    const count = scaledCount(n, PERF.spawnAddsScale);
    for (let i = 0; i < count; i++) {
      const type = pool[Math.floor(Math.random() * pool.length)];
      const base = this.boss ? this.boss.position : CENTER;
      const a = Math.random() * Math.PI * 2;
      const x = base.x + Math.cos(a) * 6, z = base.z + Math.sin(a) * 6;
      this._spawnEnemy(type, new THREE.Vector3(x, this.world.getGroundHeight(x, z), z));
    }
  }

  _buildWeaponPickups() {
    const ids = PICKUP_BY_REALM[this.realm.index] || [];
    ids.forEach((id, i) => {
      if (this.ctx.engine.weapons.owned.includes(id)) return;
      const w = WEAPONS[id];
      const a = -0.4 + i * 0.8;
      const x = Math.sin(a) * 8;
      const z = 10 + Math.cos(a) * 5;
      const y = this.world.getGroundHeight(x, z);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const mat = new THREE.MeshBasicMaterial({ color: w.view.glow || w.view.color });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 0.28, 12), new THREE.MeshStandardMaterial({ color: 0x2a241f }));
      base.position.y = 0.14;
      const icon = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), mat);
      icon.position.y = 1.05;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 20), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.34;
      g.add(base, icon, ring);
      this.three.add(g);
      this.pickups.push({ id, group: g, icon, ring });
    });
  }

  _spawnBoss() {
    this.bossSpawned = true;
    const def = BOSSES[this.realm.boss];
    const pos = CENTER.clone();
    pos.y = this.world.getGroundHeight(0, 0);
    this.boss = new BossBase(this.ctx.assets, def, pos, {
      ...this.ectx, onDefeated: () => this._onBossDefeated(),
      showBar: this.realm.index === 5, // full-width meter only for the Conqueror
    });
    this.three.add(this.boss.group);
    this.ctx.audio.playMusic('boss');
    this.ctx.ui.setObjective(`Boss awakened: strike the weak point, then extract ${this.realm.ember.label}.`);
    // Realm V keeps its own scripted Conqueror dialogue; let the Ember taunt the
    // ordinary realm guardians.
    if (this.realm.index !== 5) this.ctx.ai?.bossTaunt(def.name, this.realm);
  }

  _onBossDefeated() {
    this.bossDefeated = true;
    if (this.realm.index === 5) { this._win(); return; }
    this.ctx.audio.playMusic('realm' + this.realm.index);
    this.ctx.ui.setObjective(`Guardian defeated. Follow the light pillar and press E to extract ${this.realm.ember.label}.`);
  }

  _onEnemyDeath(e) {
    recordKill(this.realm.index);
    this.loot?.dropEnemy(e);
    // +HP on kill — refresh the vitals plate immediately so the bar ticks up.
    const p = this.ctx.player;
    if (p.health < p.maxHealth) {
      p.heal(HEAL_PER_KILL);
      this.ctx.ui.setHealth(p.health, p.maxHealth);
    }
    this.ctx.audio.play('player_hit', { volume: 0.25, rate: 1.5 });
  }

  _damagePlayer(dmg) {
    // Ease the descent: every foe — ordinary enemies AND the realm guardians —
    // hits for half until the final boss. Only the Conqueror (realm V, once the
    // finale begins) lands at full force.
    const finalBoss = this.realm.index === 5 && this.conquerorPhase;
    const dead = this.ctx.player.takeDamage(dmg * (finalBoss ? 1 : 0.5));
    this.ctx.ui.damageFlash();
    this.ctx.ui.shake(dead ? 240 : 160);
    this.ctx.audio.play('player_hit');
    if (dead) this.ctx.engine.onPlayerDeath();
  }

  // ---- interaction (engine routes E here) ----
  getInteractable(p) {
    for (const pickup of this.pickups) {
      if (p.distanceTo(pickup.group.position) < 2.4) {
        const w = WEAPONS[pickup.id];
        return { text: `pick up ${w.name} - slot ${w.slot}`, action: () => this._pickupWeapon(pickup) };
      }
    }
    // return gate
    if (p.distanceTo(this.returnPortal.position) < 3) {
      return { text: 'return to the mothership', action: () => this.ctx.engine.sceneManager.loadHub() };
    }
    // realm V motherglass commit
    if (this.realm.index === 5 && this.conquerorPhase && this.slotsFilled < 4) {
      if (this._nearEmber(p)) {
        return { text: `commit ember ${this.slotsFilled + 1} of 4`, action: () => this._commitEmber() };
      }
    }
    // ember extraction (only once its guardian is felled). Once the boss is
    // down the ember MUST be claimable — use flat (xz) distance so a dip or rise
    // in the terrain under the pillar can't push it out of reach.
    if (this.realm.index !== 5 && this.bossDefeated && !this.emberSecured) {
      if (this._nearEmber(p)) {
        return { text: `extract ${this.realm.ember.label}`, action: () => this._extractEmber() };
      }
    }
    return null;
  }

  /** Horizontal proximity to the ember pillar (ignores vertical terrain offset). */
  _nearEmber(p) {
    const dx = p.x - this.ember.position.x;
    const dz = p.z - this.ember.position.z;
    return dx * dx + dz * dz < (this.ember.radius + 1.5) ** 2;
  }

  _extractEmber() {
    const point = this.ember.extract();
    secureEmber(this.realm.index);
    if (!gameState.completedRealms.includes(this.realm.index)) gameState.completedRealms.push(this.realm.index);
    refreshPortalUnlocks();

    this.particles.emberBurst(point);
    this.particles.healRing(this.ember.position.clone());
    this.world.startHealWave(this.ember.position);
    this.ctx.ui.healFlash();
    this.ctx.ui.setEmbers(gameState.embers.length);
    this.ctx.audio.play('ember_extract');
    this.ctx.audio.play('heal_wave');
    this.returnPortal.setState('completed');
    this.emberSecured = true;
    const passiveId = PASSIVE_BY_REALM[this.realm.index];
    if (passiveId && !gameState.passiveUpgrades.includes(passiveId)) {
      const pos = this.ember.position.clone();
      pos.x += 1.4;
      this.loot.spawn('passive', pos, 1, { id: passiveId });
      this.ctx.ui.setObjective(`Ember secured. Collect ${upgradeName(passiveId)}, then return through the gold portal.`);
    } else {
      this.ctx.ui.setObjective('Ember secured. Return through the gold portal.');
    }

    // foes scatter into ash with the wave
    for (const e of this.enemies) if (!e.dead) e._die();
    this.ctx.ai?.reactToEmber(this.realm, this.realm.ember.label);
    this.ctx.engine.save();
  }

  _pickupWeapon(pickup) {
    const weapons = this.ctx.engine.weapons;
    if (!weapons.owned.includes(pickup.id)) {
      weapons.owned.push(pickup.id);
      gameState.inventory = weapons.owned.slice();
      weapons.switchTo(WEAPONS[pickup.id].slot);
      this.ctx.ui.setObjective(`Picked up ${WEAPONS[pickup.id].name}. Press ${WEAPONS[pickup.id].slot} to equip, Q for last weapon.`);
      this.ctx.audio.play('ember_extract', { volume: 0.45 });
      this.ctx.engine.save();
    }
    this.three.remove(pickup.group);
    this.pickups = this.pickups.filter((p) => p !== pickup);
  }

  _commitEmber() {
    this.slotsFilled++;
    this.particles.healRing(this.ember.position.clone());
    this.ctx.audio.play('ember_extract');
    if (this.slotsFilled >= 4) this._win();
  }

  _win() {
    if (this._won) return;
    this._won = true;
    this.ctx.engine.winGame();
  }

  // ---- per-frame ----
  update(delta, playerPos) {
    this._t += delta;
    this.ectx.now = this.ctx.engine.elapsed;

    this.world.update(playerPos, delta);
    this.atmo.dome.update(delta);
    this.particles.update(delta);
    this.loot.update(delta, playerPos);
    this.ember.update(delta);
    this.returnPortal.update(delta, this.particles);
    for (const p of this.pickups) {
      p.icon.rotation.y += delta * 1.4;
      p.ring.rotation.z += delta * 1.1;
    }

    // enemies (cull AI far from player per spec)
    const now = this.ectx.now;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dsq = e.position.distanceToSquared(playerPos);
      // Let long-aggroed foes go back to sleep once you've left them well behind
      // and haven't poked them in a while — otherwise every enemy you ever met
      // keeps ticking forever, even across the whole map.
      if (e.engaged && dsq > PERF.enemyResleepDistanceSq && now - e.lastEngageT > 5) {
        e.engaged = false;
      }
      const far = dsq > PERF.enemyAiDistanceSq;
      if (e.dead || e.engaged || !far) {
        const remove = e.update(delta, playerPos, this.ctx.player);
        if (remove) { this.three.remove(e.group); e.dispose(); this.enemies.splice(i, 1); }
        else if (!e.dead) resolveStatic(e.position, e.radius, this.colliders, 1); // keep foes out of props
      }
    }

    // boss guardian wakes as you near the ember (skipped on noBoss realms)
    if (!this.bossSpawned && !this.realm.noBoss && this.realm.index !== 5 && playerPos.distanceTo(this.ember.position) < 18) {
      this._spawnBoss();
    }
    if (this.boss) this.boss.update(delta, playerPos, this.ctx.player);

    // realm V: purge tally → Conqueror finale
    if (this.realm.index === 5 && !this.conquerorPhase) {
      const pct = (gameState.realmKills / this.purgeTotal) * 100;
      this.ctx.ui.showTally(Math.min(100, pct));
      if (pct >= this.realm.purgeGoal * 100) this._beginConquerorFinale();
    }

    // collision: keep the guardian out of solid props, the foes, and the boss
    resolveStatic(playerPos, PLAYER_RADIUS, this.colliders);
    for (const e of this.enemies) {
      if (!e.dead) pushOutOfCircle(playerPos, PLAYER_RADIUS, e.position.x, e.position.z, e.radius);
    }
    if (this.boss && !this.boss.dead) {
      pushOutOfCircle(playerPos, PLAYER_RADIUS, this.boss.position.x, this.boss.position.z, this.boss.radius);
    }
  }

  _beginConquerorFinale() {
    this.conquerorPhase = true;
    const e = this.ctx.engine;
    e.freeze(0.8);
    this.ctx.ui.whiteFlash();
    // strip the most-recently-acquired passive (reincarnation cost)
    const lost = gameState.passiveUpgrades.pop();
    if (lost) console.log('[zoal] reincarnation cost — lost passive:', lost);
    this.ctx.engine.applyPassiveUpgrades();
    this.ctx.player.health = this.ctx.player.maxHealth;
    this.ctx.ui.hideTally();
    this.ctx.ui.setObjective('Final trial: survive the Conqueror and strike the chest core.');
    this.ctx.dialogue.show('THE CONQUEROR', [
      'You burn so brightly, little guardian.',
      'Then burn for me — one last time.',
    ], () => this._spawnBoss());
  }

  // ---- engine queries ----
  getGroundHeight(x, z) { return this.world.getGroundHeight(x, z); }

  getTargets() {
    // refill the reused list — no per-call filter()/map() allocation
    const t = this._targetList;
    t.length = 0;
    for (const e of this.enemies) if (!e.dead) t.push(e.mesh);
    if (this.boss && !this.boss.dead) t.push(this.boss.mesh);
    return t;
  }

  minimapData(playerPos, yaw) {
    const mm = this._mm;
    mm.cx = playerPos.x; mm.cz = playerPos.z; mm.yaw = yaw; mm.accent = this.realm.accent;
    if (this.emberSecured) {
      mm.ember = null;
    } else {
      this._mmEmber.x = this.ember.position.x; this._mmEmber.z = this.ember.position.z;
      mm.ember = this._mmEmber;
    }
    this._mmPortal.x = this.returnPortal.position.x; this._mmPortal.z = this.returnPortal.position.z;
    mm.portal = this._mmPortal;
    const list = this._mmEnemies;
    let n = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const o = list[n] || (list[n] = { x: 0, z: 0 });
      o.x = e.position.x; o.z = e.position.z;
      n++;
    }
    list.length = n;
    return mm;
  }

  exit() {
    this.world.dispose();
    this.loot?.dispose();
    for (const e of this.enemies) e.dispose();
    this.boss?.dispose();
    disposeScene(this.three);
  }
}

function disposeScene(scene) {
  // disposeObject skips shared (cached) GLB resources — see meshUtils.markShared.
  disposeObject(scene);
  scene.clear();
}
