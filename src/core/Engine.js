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
import { gameState } from '../data/gameState.js';
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
    });

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this._freezeT = 0;
    this._hubIntroShown = false;
    this._hudT = 0;

    // Opening cinematic state (the crash site). While `opening`, the loop drives
    // the scene's camera instead of the FPS controller; the first pointer-lock
    // ("descend") hands off to the hub.
    this.opening = false;
    this.cinematicScene = null;

    // shared context handed to scenes + actors
    this.ctx = {
      engine: this, assets: this.assets, audio: this.audio, ui: this.ui,
      dialogue: this.dialogue, player: this.player, camera: this.camera,
    };
    this.sceneManager = new SceneManager(this.ctx);

    // restore progress + reflect it on the HUD
    SaveSystem.load();
    gameState.inventory = this.weapons.owned.slice();
    this.ui.setEmbers(gameState.embers.length);

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

  onPlayerDeath() {
    this.audio.play('player_death');
    this.ui.criticalFlash();
    this.ui.shake(220);
    this.ui.showDeath();
    this.ui.whiteFlash();
    // reincarnate at the current scene's spawn with full vitality
    this.player.health = this.player.maxHealth;
    this.player.stamina = this.player.maxStamina;
    const s = this.sceneManager.current;
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
    ent.takeDamage(dmg, this._tmpPos, weapon, point);
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

    this.weapons.update(delta);
    this.sceneManager.update(delta, this.fpsCamera.position);

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
  }
}
