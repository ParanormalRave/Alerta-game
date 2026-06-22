import * as THREE from 'three';
import { InputManager } from './InputManager.js';
import { FPSCamera } from '../player/FPSCamera.js';
import { Player } from '../player/Player.js';
import { WeaponSystem } from '../player/WeaponSystem.js';
import { AssetLoader } from './AssetLoader.js';
import { AudioManager } from './AudioManager.js';
import { PostFX } from './PostFX.js';
import { SceneManager } from './SceneManager.js';
import { SaveSystem } from './SaveSystem.js';
import { HUD } from '../ui/HUD.js';
import { Minimap } from '../ui/Minimap.js';
import { Dialogue } from '../ui/Dialogue.js';
import { DamageNumbers } from '../ui/DamageNumbers.js';
import { AIDirector } from '../ai/AIDirector.js';
import { gameState } from '../data/gameState.js';
import { passiveBonuses, upgradeName } from '../data/upgrades.js';
import { REALM_FOOTSTEP } from '../data/realms.js';
import { PERF, pixelRatio } from './performance.js';

/**
 * Engine — the conductor. Owns the renderer + post-FX, the shared services
 * (assets, audio, UI, save), the player + weapons, and a SceneManager that
 * swaps between the hub and the five realms. The main loop drives the active
 * scene, interaction prompts, the HUD, the minimap and the dialogue typewriter.
 */
export class Engine {
  constructor() {
    this.canvas = document.getElementById('game');
    this.lockOverlay = document.getElementById('lock-overlay');

    // renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: PERF.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(pixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = PERF.shadows;
    this.renderer.shadowMap.type = PERF.softShadows ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = PERF.toneMapping ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // camera + input + player
    this.fpsCamera = new FPSCamera(this.renderer.domElement);
    this.camera = this.fpsCamera.camera;
    this.cameraRig = this.fpsCamera.object;

    this.input = new InputManager(this.renderer.domElement, this.lockOverlay);
    this.input.attach();
    this.player = new Player(this.fpsCamera, this.input);

    // services
    this.assets = new AssetLoader();
    this.audio = new AudioManager();
    this.ui = new HUD();
    this.minimap = new Minimap();
    this.dialogue = new Dialogue();
    this.damageNumbers = new DamageNumbers();
    this.ai = new AIDirector(this.ui); // the Ember's voice, on 0G Compute

    // a placeholder scene so PostFX has something before the first load
    const boot = new THREE.Scene();
    this.activeScene = boot;
    this.postFX = new PostFX(this.renderer, boot, this.camera);

    // weapons → current scene's targets
    this.weapons = new WeaponSystem(this.fpsCamera, this.input, null, {
      getTargets: () => (this.sceneManager.current ? this.sceneManager.current.getTargets() : []),
      onHit: (target, dmg, point, weapon) => this._handleHit(target, dmg, point, weapon),
      hud: this.ui,
      audio: this.audio,
      assets: this.assets,
      getScene: () => this.activeScene,
      getParticles: () => (this.sceneManager.current ? this.sceneManager.current.particles : null),
      player: this.player,
    });

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this._freezeT = 0;
    this._hubIntroShown = false;
    this._hudT = 0;
    this._footT = 0;

    // Opening cinematic state (the crash site). While `opening`, the loop drives
    // the scene's camera instead of the FPS controller; the first pointer-lock
    // ("descend") hands off to the hub.
    this.opening = false;
    this.cinematicScene = null;

    // shared context handed to scenes + actors
    this.ctx = {
      engine: this, assets: this.assets, audio: this.audio, ui: this.ui,
      dialogue: this.dialogue, player: this.player, camera: this.camera,
      damageNumbers: this.damageNumbers, ai: this.ai,
    };
    this.sceneManager = new SceneManager(this.ctx);

    // restore progress + reflect it on the HUD (localStorage = instant boot)
    SaveSystem.load();
    this._applyLoadedState();
    // then reconcile with the decentralized save on 0G Storage, in the
    // background — adopts a newer cloud save (e.g. fresh device) without blocking.
    SaveSystem.cloudSync(() => this._applyLoadedState());

    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);

    this._tmpPos = new THREE.Vector3();
  }

  start() {
    // Boot into the opening crash-site cinematic; the HUD + weapon stay hidden
    // until play begins. The controls panel stays up so the player has a legend.
    this._hud = document.getElementById('hud');
    this._controls = document.getElementById('controls');
    if (this._hud) this._hud.style.display = 'none';
    this.weapons.holder.visible = false;
    this.sceneManager.loadOpening();
    this.renderer.setAnimationLoop(() => this._tick());
  }

  /** Leave the opening cinematic and drop the guardian into the hub. */
  _beginGame() {
    this.opening = false;
    this.cinematicScene = null;
    if (this._hud) this._hud.style.display = '';
    this.weapons.holder.visible = true;
    this.freeze(1.2); // hold the controller through the fade + hub seating
    this.sceneManager.loadHub();
  }

  // ---------- scene-facing helpers ----------
  placePlayer(feet) {
    const eye = this.fpsCamera.eyeHeight;
    this.player.baseY = feet.y + eye;
    this.player.velocityY = 0;
    this.player.grounded = true;
    this.fpsCamera.position.set(feet.x, feet.y + eye, feet.z);
  }

  freeze(seconds) { this._freezeT = Math.max(this._freezeT, seconds); }

  invertControls(seconds) {
    if (this.fpsCamera.controls) this.fpsCamera.controls.pointerSpeed = -1;
    clearTimeout(this._invertTimer);
    this._invertTimer = setTimeout(() => {
      if (this.fpsCamera.controls) this.fpsCamera.controls.pointerSpeed = 1;
    }, seconds * 1000);
  }

  save() { SaveSystem.save(); }

  /** Reflect loaded gameState onto weapons + HUD (after local or cloud load). */
  _applyLoadedState() {
    if (gameState.inventory.length) this.weapons.setOwned(gameState.inventory);
    else gameState.inventory = this.weapons.owned.slice();
    this.applyPassiveUpgrades();
    this.ui.setEmbers(gameState.embers.length);
  }

  applyPassiveUpgrades() {
    this.player.applyPassiveBonuses(passiveBonuses(gameState.passiveUpgrades));
    this.ui.setHealth(this.player.health, this.player.maxHealth);
    this.ui.setStamina(this.player.stamina, this.player.maxStamina);
  }

  grantPassive(id) {
    if (!id || gameState.passiveUpgrades.includes(id)) return false;
    gameState.passiveUpgrades.push(id);
    this.applyPassiveUpgrades();
    this.ui.setObjective(`Passive acquired: ${upgradeName(id)}.`);
    this.save();
    return true;
  }

  onPlayerDeath() {
    this.audio.play('player_death');
    this.ui.criticalFlash();
    this.ui.shake(220);
    this.ui.showDeath();
    this.ui.whiteFlash();
    this.ai.reactToDeath(this.sceneManager.current?.realm);
    // reincarnate at the current scene's spawn with full vitality
    this.player.health = this.player.maxHealth;
    this.player.stamina = this.player.maxStamina;
    const s = this.sceneManager.current;
    s?.resetActors?.();
    if (s?.spawnPoint) this.placePlayer(s.spawnPoint);
  }

  winGame() {
    // Conqueror flees; the world heals to its final state; return to the hub.
    gameState.skyboxState = 5;
    this.save();
    this.ui.whiteFlash();
    this.dialogue.show('ANCIENT ORDER', [
      'The Embers are set. The Motherglass holds.',
      'The Conqueror burns away into the dark.',
      'The realms breathe again, guardian. You did this.',
    ], () => {
      this.audio.playMusic('ending');
      this.sceneManager.loadHub();
    });
  }

  // ---------- combat routing ----------
  _handleHit(target, dmg, point, weapon) {
    const ent = target.userData.enemy;
    if (!ent) return;
    this.camera.getWorldPosition(this._tmpPos);
    const realm = Number(gameState.currentScene) || 1;
    const realmPower = 1 + Math.max(0, realm - 1) * 0.22;
    const dealt = dmg * this.player.weaponDamageScale * realmPower;
    ent.takeDamage(dealt, this._tmpPos, weapon, point);
    const pos = point || ent.position;
    const crit = !!point?.distanceTo && ent.weakWorld && point.distanceTo(ent.weakWorld()) < 1.0;
    this.damageNumbers.spawn(pos.clone ? pos.clone() : this._tmpPos, dealt, {
      color: weapon?.status?.burn ? '#ff8a3d' : weapon?.status?.slow ? '#80e6ff' : weapon?.status?.vuln ? '#caa2ff' : '#ffdf8a',
      critical: crit,
    });
    this.audio.play('sword_hit', { volume: 0.5 });
  }

  // ---------- loop ----------
  _tick() {
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this._update(delta);
    this.postFX.render();
  }

  _update(delta) {
    this.elapsed += delta;

    // Controls legend toggle (H) — works in the cinematic and in play.
    if (this.input.wasPressed('KeyH') && this._controls) this._controls.classList.toggle('hidden');

    // Opening cinematic: drive the crash-site camera only; the first click
    // (pointer lock) begins the game in the hub.
    if (this.opening) {
      this.cinematicScene?.update(delta);
      if (this.input.isLocked && !this.sceneManager.transitioning) this._beginGame();
      this.input.endFrame();
      return;
    }

    // dialogue input has priority over interaction/E
    if (this.dialogue.active) {
      this.dialogue.update(delta);
      if (this.input.wasPressed('KeyE')) this.dialogue.advance();
      if (this.input.wasPressed('Space')) this.dialogue.skip();
    }

    // Movement is locked during scripted freezes AND while a briefing is playing,
    // so the player can't wander off before the info finishes. A HUD banner makes
    // the lock obvious; look + weapon stay live.
    if (this._freezeT > 0) this._freezeT = Math.max(0, this._freezeT - delta);
    const movementLocked = this._freezeT > 0 || this.dialogue.active;
    this.ui.setBriefing(this.dialogue.active);
    if (!movementLocked) this.player.update(delta);
    this._updateFootsteps(delta, movementLocked);

    this.weapons.update(delta);
    this.sceneManager.update(delta, this.fpsCamera.position);
    this.damageNumbers.update(delta, this.camera);

    this._handleInteraction();

    if (this.input.wasPressed('KeyM')) this.ui.toggleMap();

    this._hudT += delta;
    if (this._hudT >= 1 / PERF.hudFps) {
      this._hudT = 0;
      this._updateHud();
    }
    this.input.endFrame();
  }

  _handleInteraction() {
    const scene = this.sceneManager.current;
    if (!scene) return;
    const inter = scene.getInteractable(this.fpsCamera.position);
    if (inter) {
      this.ui.showPrompt(inter.text);
      if (!this.dialogue.active && inter.action && this.input.wasPressed('KeyE')) {
        inter.action();
      }
    } else {
      this.ui.hidePrompt();
    }
  }

  _updateHud() {
    this.ui.setHealth(this.player.health, this.player.maxHealth);
    this.ui.setStamina(this.player.stamina, this.player.maxStamina);

    const scene = this.sceneManager.current;
    if (scene) {
      const yaw = this._cameraYaw();
      this.minimap.render(scene.minimapData(this.fpsCamera.position, yaw), this.elapsed);
    }
  }

  _updateFootsteps(delta, movementLocked) {
    if (movementLocked || !this.player.moving || !this.player.grounded) {
      this._footT = 0;
      return;
    }
    this._footT -= delta;
    if (this._footT > 0) return;
    const scene = gameState.currentScene;
    const key = REALM_FOOTSTEP[scene] || 'footstep_metal';
    this.audio.play(key, { volume: this.player.sprinting ? 0.42 : 0.3, rate: 0.9 + Math.random() * 0.22 });
    this._footT = this.player.sprinting ? 0.28 : 0.42;
  }


  _cameraYaw() {
    this.camera.getWorldDirection(this._tmpPos);
    return Math.atan2(this._tmpPos.x, this._tmpPos.z);
  }

  _resize() {
    this.fpsCamera.resize();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(pixelRatio());
    this.postFX.setSize();
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this._onResize);
    this.input.dispose();
    this.renderer.dispose();
    this.damageNumbers.dispose();
  }
}
