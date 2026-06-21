import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * FPSCamera — owns the perspective camera + PointerLockControls (mouse look)
 * and applies head-bob. The camera object IS the player's view transform;
 * Player.js drives its horizontal movement and base Y (gravity/jump), while
 * this class layers a sine-wave bob on top of the base Y each frame.
 */
export class FPSCamera {
  constructor(domElement) {
    this.camera = new THREE.PerspectiveCamera(
      68,
      window.innerWidth / window.innerHeight,
      0.1,
      260
    );

    this.controls = new PointerLockControls(this.camera, domElement);
    // `getObject()` returns the camera holder (the camera itself in r160).
    this.object = this.controls.getObject?.() ?? this.controls.object ?? this.camera;

    this.eyeHeight = 1.7;

    // Head-bob state
    this.bobPhase = 0;
    this.bobAmplitude = 0.05; // per spec
    this.bobOffset = 0;
  }

  get position() {
    return this.object.position;
  }

  /** Strafe along the camera's right axis (xz-plane). */
  moveRight(distance) {
    this.controls.moveRight(distance);
  }

  /** Move along the camera's forward axis (xz-plane, y ignored). */
  moveForward(distance) {
    this.controls.moveForward(distance);
  }

  /**
   * Layer head-bob onto the physics base Y.
   * @param {number} baseY  - eye-height Y from the player's vertical physics
   * @param {boolean} moving - grounded & receiving movement input
   * @param {number} speed   - current move speed (drives bob frequency)
   * @param {number} delta
   */
  applyBob(baseY, moving, speed, delta) {
    if (moving) {
      this.bobPhase += delta * speed * 2.2;
      this.bobOffset = Math.sin(this.bobPhase) * this.bobAmplitude;
    } else {
      // Ease the bob back to neutral when standing still.
      this.bobPhase = 0;
      this.bobOffset += (0 - this.bobOffset) * Math.min(1, delta * 10);
    }
    this.object.position.y = baseY + this.bobOffset;
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
