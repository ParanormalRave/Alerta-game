import { HubScene } from '../scenes/HubScene.js';
import { RealmScene } from '../scenes/RealmScene.js';
import { CrashScene } from '../scenes/CrashScene.js';
import { REALMS } from '../data/realms.js';
import { gameState } from '../data/gameState.js';

/**
 * SceneManager — owns the active scene and the fade transition between the hub
 * and the realms. On swap it disposes the old scene, builds + enters the new
 * one, re-seats the player, re-points the render pass and the camera rig, and
 * re-binds the player's ground sampler.
 */
export class SceneManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.current = null;
    this.transitioning = false;
  }

  async _swap(makeScene, tag) {
    if (this.transitioning) return;
    this.transitioning = true;

    await this.ctx.ui.fadeOut();

    const rig = this.ctx.engine.cameraRig;
    if (rig.parent) rig.parent.remove(rig);  // detach before old scene disposes
    this.ctx.engine.weapons?.clearSceneFx?.();
    if (this.current) this.current.exit();

    const scene = makeScene();
    const spawn = scene.enter();             // builds world, returns feet position
    this.current = scene;
    gameState.currentScene = tag;

    scene.three.add(rig);
    const engine = this.ctx.engine;
    if (scene.cinematic) {
      // No FPS controller here — the scene parks the camera itself.
      engine.opening = true;
      engine.cinematicScene = scene;
      scene.placeCamera();
    } else {
      engine.opening = false;
      engine.placePlayer(spawn);
    }
    this.ctx.player.setGroundSampler((x, z) => scene.getGroundHeight(x, z));
    engine.postFX.setScene(scene.three, this.ctx.camera);
    engine.activeScene = scene.three;

    this.ctx.ui.fadeIn();
    this.transitioning = false;
  }

  loadOpening() { return this._swap(() => new CrashScene(this.ctx), 'opening'); }
  loadHub() { return this._swap(() => new HubScene(this.ctx), 'hub'); }
  loadRealm(n) { return this._swap(() => new RealmScene(this.ctx, REALMS[n]), n); }

  update(delta, playerPos) {
    this.current?.update(delta, playerPos);
  }
}
