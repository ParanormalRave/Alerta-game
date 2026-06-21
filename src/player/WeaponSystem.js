import * as THREE from 'three';
import { WEAPONS, WEAPON_BY_SLOT, STARTING_LOADOUT } from '../data/weapons.js';
import { MeleeSystem } from '../combat/MeleeSystem.js';
import { RangedSystem } from '../combat/RangedSystem.js';
import { PERF } from '../core/performance.js';

const BASE_POS = new THREE.Vector3(0.24, -0.32, -0.58);
const SWITCH_SPEED = 6; // viewmodel raise/lower rate
const RELOAD_TIME = 1.0;

/**
 * WeaponSystem — viewmodel, weapon switching (1–8, Q quick-swap), attack input,
 * melee swing + ranged fire, ammo + reload, and the ammo/weapon HUD line.
 *
 * Viewmodels are placeholder primitive groups built per weapon shape; when a
 * matching GLB exists in /public/models/ it can replace the placeholder without
 * changing any of this logic (see `view.model` in weapons.js).
 */
export class WeaponSystem {
  constructor(fpsCamera, input, _scene, { getTargets, onHit, hud, audio, getScene, assets }) {
    this.cam = fpsCamera;
    this.camera = fpsCamera.camera;
    this.input = input;
    this.getTargets = getTargets;
    this.onHit = onHit;
    this.hud = hud;
    this.audio = audio;
    this.getScene = getScene || (() => null);
    this.assets = assets || null;
    this._vmToken = 0; // guards against a stale GLB load applying after a switch

    this.melee = new MeleeSystem();
    this.ranged = new RangedSystem();

    // Viewmodel container, parented to the camera so it tracks the view.
    this.holder = new THREE.Group();
    this.camera.add(this.holder);
    this.viewmodel = null;

    // Loadout + per-weapon ammo
    this.owned = [...STARTING_LOADOUT];
    this.ammo = {};
    for (const id of this.owned) {
      const w = WEAPONS[id];
      if (w.type === 'ranged' && Number.isFinite(w.ammo)) this.ammo[id] = w.ammo;
    }

    this.currentId = null;
    this.lastId = null;
    this.cooldown = 0;

    // Switch animation state machine: 'idle' | 'out' | 'in'
    this.switchState = 'idle';
    this.switchT = 1; // 0 lowered → 1 raised
    this._pendingId = null;

    // Swing / recoil animation
    this.swinging = false;
    this.swingT = 0;
    this._swingWeapon = null;
    this._swingHitDone = false;
    this.recoilT = 0;

    // Reload
    this.reloading = false;
    this.reloadT = 0;

    this._equipImmediate(this.owned[0]);
  }

  // ---------- equip / switch ----------

  _equipImmediate(id) {
    this.currentId = id;
    this._buildViewmodel(id);
    this.switchT = 1;
    this.switchState = 'idle';
    this._updateAmmoHud();
  }

  switchTo(slot) {
    const id = WEAPON_BY_SLOT[slot];
    if (!id || !this.owned.includes(id) || id === this.currentId) return;
    if (this.switchState !== 'idle') return;
    this.lastId = this.currentId;
    this._pendingId = id;
    this.switchState = 'out';
    this.swinging = false;
    this.reloading = false;
  }

  _buildViewmodel(id) {
    this._disposeViewmodel();
    const w = WEAPONS[id];
    this.viewmodel = makeViewmodel(w);
    this.viewmodel.traverse((o) => (o.castShadow = false));
    this.holder.add(this.viewmodel);

    // Swap the placeholder for a real GLB the moment it loads (if present).
    const token = ++this._vmToken;
    if (PERF.loadWeaponModels && this.assets && w.view.model) {
      this.assets.loadModel(w.view.model).then((model) => {
        if (!model || token !== this._vmToken) return; // switched weapons since
        this._disposeViewmodel();
        this.viewmodel = fitViewmodel(model, w.view);
        this.holder.add(this.viewmodel);
      });
    }
  }

  _disposeViewmodel() {
    if (!this.viewmodel) return;
    this.holder.remove(this.viewmodel);
    this.viewmodel.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.viewmodel = null;
  }

  // ---------- per-frame ----------

  update(delta) {
    this.cooldown = Math.max(0, this.cooldown - delta);
    this._handleInput();
    this._updateSwitch(delta);
    this._updateSwing(delta);
    this._updateReload(delta);
    this.recoilT = Math.max(0, this.recoilT - delta * 6);
    this.ranged.update(delta);
    this._applyTransforms();
  }

  _handleInput() {
    const input = this.input;
    if (!input.isLocked) return;

    // Weapon slots 1–8
    for (let slot = 1; slot <= 8; slot++) {
      if (input.wasPressed('Digit' + slot)) this.switchTo(slot);
    }
    // Quick swap to last weapon
    if (input.wasPressed('KeyQ') && this.lastId) {
      this.switchTo(WEAPONS[this.lastId].slot);
    }
    // Reload
    if (input.wasPressed('KeyR')) this.reload();

    // Primary attack (held = auto-fire, gated by cooldown)
    const canAct =
      this.switchState === 'idle' && !this.reloading && this.cooldown === 0;
    if (canAct && input.mouseButtons.has(0)) this._attack();
  }

  _attack() {
    const w = WEAPONS[this.currentId];
    this.cooldown = w.cooldown;

    if (w.type === 'melee') {
      // Start swing; hit detection fires at the swing peak (see _updateSwing).
      this.swinging = true;
      this.swingT = 0;
      this._swingWeapon = w;
      this._swingHitDone = false;
      return;
    }

    // Ranged
    if (Number.isFinite(w.ammo)) {
      if ((this.ammo[this.currentId] ?? 0) <= 0) {
        this.cooldown = 0.15; // dry-fire click delay
        return;
      }
      this.ammo[this.currentId]--;
    }
    this.recoilT = 1;
    const hit = this.ranged.fire(this.camera, w, this.getTargets(), this.getScene());
    if (hit) this.onHit(hit.target, w.damage, hit.point, w);
    this._updateAmmoHud();
  }

  reload() {
    const w = WEAPONS[this.currentId];
    if (w.type !== 'ranged' || !Number.isFinite(w.ammo)) return;
    if (this.reloading || this.ammo[this.currentId] >= w.ammo) return;
    this.reloading = true;
    this.reloadT = 0;
  }

  _updateSwitch(delta) {
    if (this.switchState === 'out') {
      this.switchT -= delta * SWITCH_SPEED;
      if (this.switchT <= 0) {
        this.switchT = 0;
        this._buildViewmodel(this._pendingId);
        this.currentId = this._pendingId;
        this._pendingId = null;
        this.switchState = 'in';
        this._updateAmmoHud();
      }
    } else if (this.switchState === 'in') {
      this.switchT += delta * SWITCH_SPEED;
      if (this.switchT >= 1) {
        this.switchT = 1;
        this.switchState = 'idle';
      }
    }
  }

  _updateSwing(delta) {
    if (!this.swinging) return;
    const dur = this._swingWeapon.cooldown * 0.8;
    this.swingT += delta / dur;

    if (!this._swingHitDone && this.swingT >= 0.45) {
      this._swingHitDone = true;
      const w = this._swingWeapon;
      const hits = this.melee.swing(this.camera, w, this.getTargets());
      const dmg = w.damage * (w.hits ?? 1);
      for (const h of hits) this.onHit(h.target, dmg, h.point, w);
    }
    if (this.swingT >= 1) {
      this.swinging = false;
      this.swingT = 0;
    }
  }

  _updateReload(delta) {
    if (!this.reloading) return;
    this.reloadT += delta;
    if (this.reloadT >= RELOAD_TIME) {
      this.reloading = false;
      this.ammo[this.currentId] = WEAPONS[this.currentId].ammo;
      this._updateAmmoHud();
    }
  }

  _applyTransforms() {
    let py = BASE_POS.y;
    let pz = BASE_POS.z;
    let rotX = 0;
    let rotZ = 0;

    // Switch: tuck down + rotate while not fully raised.
    const lowered = 1 - this.switchT;
    py -= lowered * 0.5;
    rotX += lowered * 0.9;

    // Melee swing: a quick slash arc (sin envelope).
    if (this.swinging) {
      const arc = Math.sin(this.swingT * Math.PI);
      rotZ -= arc * 1.3;
      rotX -= arc * 0.6;
      pz += arc * 0.1;
    }

    // Reload: bob the weapon down and back.
    if (this.reloading) {
      const r = Math.sin((this.reloadT / RELOAD_TIME) * Math.PI);
      py -= r * 0.25;
      rotX += r * 0.5;
    }

    // Ranged recoil kick.
    if (this.recoilT > 0) {
      pz += this.recoilT * 0.22;
      rotX -= this.recoilT * 0.4;
    }

    this.holder.position.set(BASE_POS.x, py, pz);
    this.holder.rotation.set(rotX, 0, rotZ);
  }

  _updateAmmoHud() {
    const w = WEAPONS[this.currentId];
    if (this.hud?.setWeapon) {
      let figure;
      if (w.type === 'melee') figure = 'click strike';
      else if (!Number.isFinite(w.ammo)) figure = 'ammo infinite';
      else figure = `${this.ammo[this.currentId]} / ${w.ammo} ammo`;
      this.hud.setWeapon(w.name, w.slot, figure);
      return;
    }
    if (!this.hud?.ammo) return;
    let txt;
    if (w.type === 'melee') txt = `⚔ ${w.name}`;
    else if (!Number.isFinite(w.ammo)) txt = `${w.name}  ∞`;
    else txt = `${w.name}  ${this.ammo[this.currentId]} / ${w.ammo}`;
    this.hud.ammo.textContent = txt;
  }
}

/**
 * Fit a loaded weapon GLB into the hand: scale so its longest axis = view.fitSize,
 * centre it, then wrap in a pivot carrying the per-weapon orientation/offset from
 * weapons.js (`view.rot` / `view.pos`, both in the camera's local frame where
 * −Z points forward). Tune those numbers per model — the native orientation of
 * an arbitrary download is unknowable up front.
 */
function fitViewmodel(model, view) {
  const fit = view.fitSize ?? 0.6;
  model.updateWorldMatrix(true, true);
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  model.scale.multiplyScalar(fit / maxDim);
  model.updateWorldMatrix(true, true);
  box = new THREE.Box3().setFromObject(model);
  model.position.sub(box.getCenter(new THREE.Vector3())); // centre at pivot origin
  model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });

  const pivot = new THREE.Group();
  pivot.add(model);
  const r = view.rot ?? [0, 0, 0];
  const p = view.pos ?? [0, 0, 0];
  pivot.rotation.set(r[0], r[1], r[2]);
  pivot.position.set(p[0], p[1], p[2]);
  return pivot;
}

// ---------- placeholder viewmodel factory ----------

function mat(color, glow = false) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: glow ? color : 0x000000,
    emissiveIntensity: glow ? 0.9 : 0,
    roughness: 0.5,
    metalness: 0.3,
  });
}

/** Build a small primitive stand-in per weapon shape. */
function makeViewmodel(weapon) {
  const g = new THREE.Group();
  const { shape, color, glow } = weapon.view;
  const body = mat(color);
  const accent = mat(glow, true);

  switch (shape) {
    case 'blade': {
      const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.18), body);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.9), accent);
      blade.position.z = -0.55;
      g.add(hilt, blade);
      break;
    }
    case 'hammer': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7), body);
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = -0.3;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), body);
      head.position.z = -0.65;
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.24), accent);
      core.position.z = -0.65;
      g.add(shaft, head, core);
      break;
    }
    case 'lance': {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3), body);
      pole.rotation.x = Math.PI / 2;
      pole.position.z = -0.6;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 8), accent);
      tip.rotation.x = -Math.PI / 2;
      tip.position.z = -1.3;
      g.add(pole, tip);
      break;
    }
    case 'daggers': {
      for (const x of [-0.12, 0.12]) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.4), accent);
        blade.position.set(x, 0, -0.28);
        g.add(blade);
      }
      break;
    }
    case 'gauntlet': {
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.26), body);
      fist.position.z = -0.3;
      const knuck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.05), accent);
      knuck.position.set(0, 0.08, -0.42);
      g.add(fist, knuck);
      break;
    }
    case 'bow': {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 8, 24, Math.PI * 1.2), body);
      arc.rotation.y = Math.PI / 2;
      arc.position.z = -0.5;
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.5), accent);
      str.position.z = -0.5;
      g.add(arc, str);
      break;
    }
    case 'wand': {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.5), body);
      rod.rotation.x = Math.PI / 2;
      rod.position.z = -0.3;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), accent);
      orb.position.z = -0.55;
      g.add(rod, orb);
      break;
    }
    case 'staff':
    default: {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.0), body);
      rod.rotation.x = Math.PI / 2;
      rod.position.z = -0.45;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 14), accent);
      orb.position.z = -0.95;
      g.add(rod, orb);
      break;
    }
  }
  return g;
}
