import * as THREE from 'three';
import { PASSIVE_UPGRADES } from '../data/upgrades.js';
import { PERF } from '../core/performance.js';

const GEOS = {
  ember: new THREE.OctahedronGeometry(0.26, 0),
  vial: new THREE.CapsuleGeometry(0.16, 0.34, 4, 8),
  ammo: new THREE.BoxGeometry(0.34, 0.22, 0.22),
  passive: new THREE.IcosahedronGeometry(0.36, 1),
};

const MATS = {
  ember: new THREE.MeshBasicMaterial({ color: 0xff7a18 }),
  health: new THREE.MeshBasicMaterial({ color: 0x9bd86a }),
  ammo: new THREE.MeshBasicMaterial({ color: 0xffd24a }),
};

export class LootSystem {
  constructor(scene, world, ctx) {
    this.scene = scene;
    this.world = world;
    this.ctx = ctx;
    this.items = [];
  }

  dropEnemy(enemy) {
    if (Math.random() > 0.42) return;
    const kind = enemy.def.health > 90 || Math.random() < 0.3 ? 'health' : (Math.random() < 0.55 ? 'ember' : 'ammo');
    this.spawn(kind, enemy.position, kind === 'health' ? 18 : kind === 'ammo' ? 8 : 1);
  }

  spawn(kind, pos, amount = 1, meta = {}) {
    const mat = kind === 'passive'
      ? new THREE.MeshBasicMaterial({ color: PASSIVE_UPGRADES[meta.id]?.color || 0xffffff })
      : MATS[kind] || MATS.ember;
    const mesh = new THREE.Mesh(GEOS[kind] || GEOS.ember, mat);
    const y = this.world?.getGroundHeight(pos.x, pos.z) ?? pos.y ?? 0;
    mesh.position.set(pos.x, y + 0.55, pos.z);
    mesh.userData.kind = kind;
    this.scene.add(mesh);
    const light = PERF.dynamicPointLights ? new THREE.PointLight(mat.color, 0.7, 4) : null;
    if (light) {
      light.position.copy(mesh.position);
      this.scene.add(light);
    }
    this.items.push({ kind, amount, id: meta.id, mesh, light, t: Math.random() * 10, taken: false });
    return mesh;
  }

  update(delta, playerPos) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += delta;
      it.mesh.rotation.y += delta * 1.8;
      it.mesh.position.y += Math.sin(it.t * 3) * 0.002;
      if (it.light) it.light.position.copy(it.mesh.position);

      if (!it.taken && playerPos.distanceToSquared(it.mesh.position) < 3.0) {
        this._collect(it);
        if (it.light) this.scene.remove(it.light);
        this.scene.remove(it.mesh);
        if (it.kind === 'passive') it.mesh.material.dispose();
        it.light?.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  _collect(it) {
    it.taken = true;
    const { player, engine, ui, audio } = this.ctx;
    switch (it.kind) {
      case 'health':
        player.heal(it.amount);
        ui.setHealth(player.health, player.maxHealth);
        ui.healFlash();
        break;
      case 'ammo':
        engine.weapons.refillAmmo(it.amount);
        break;
      case 'passive':
        engine.grantPassive?.(it.id);
        break;
      case 'ember':
      default:
        player.stamina = Math.min(player.maxStamina, player.stamina + it.amount * 10);
        ui.setStamina(player.stamina, player.maxStamina);
        break;
    }
    audio.play('ember_extract', { volume: 0.35, rate: it.kind === 'health' ? 1.25 : 1 });
  }

  dispose() {
    for (const it of this.items) {
      if (it.light) this.scene.remove(it.light);
      this.scene.remove(it.mesh);
      if (it.kind === 'passive') it.mesh.material.dispose();
      it.light?.dispose();
    }
    this.items.length = 0;
  }
}
