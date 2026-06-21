import * as THREE from 'three';

/**
 * Player — FPS controller: stats, horizontal movement, gravity, jump, sprint.
 *
 * Movement uses the FPSCamera's PointerLockControls helpers for the xz-plane;
 * vertical motion is integrated here (manual gravity + flat-floor collision at
 * y=0). Rapier-based collision against world geometry arrives in Phase 4.
 */
export class Player {
  constructor(fpsCamera, input) {
    this.cam = fpsCamera;
    this.input = input;

    // --- Stats (per spec) ---
    this.health = 100;
    this.maxHealth = 100;
    this.stamina = 100;
    this.maxStamina = 100;
    this.speed = 6.8;       // brisker baseline — the world felt sluggish to cross
    this.sprintSpeed = 11;
    this.jumpForce = 9;

    // --- Vertical physics ---
    this.gravity = 25; // tuned for game-feel (snappier than 9.8)
    this.velocityY = 0;
    this.baseY = this.cam.eyeHeight; // camera eye-height when grounded
    this.grounded = true;

    // stamina tuning
    this.staminaDrain = 28; // per second while sprinting
    this.staminaRegen = 18; // per second otherwise
    this._sprintLocked = false; // true until stamina recovers a bit after empty

    this._moveDir = new THREE.Vector3();

    // Optional terrain ground sampler: (x, z) => surface Y. Null = flat floor at 0.
    this.groundSampler = null;

    this.cam.position.y = this.baseY;
  }

  /** Provide a terrain height function so the player walks on the voxel world. */
  setGroundSampler(fn) {
    this.groundSampler = fn;
  }

  update(delta) {
    // Only respond to input while the pointer is locked.
    if (!this.input.isLocked) {
      // Still regenerate stamina when paused.
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * delta);
      return;
    }

    const fwd = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
    const right = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0);

    this._moveDir.set(right, 0, fwd);
    const hasInput = this._moveDir.lengthSq() > 0;
    if (hasInput) this._moveDir.normalize();

    // --- Sprint + stamina ---
    const wantsSprint =
      this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const sprinting = wantsSprint && hasInput && !this._sprintLocked && this.stamina > 0;

    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - this.staminaDrain * delta);
      if (this.stamina === 0) this._sprintLocked = true; // must recover before sprinting again
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * delta);
      if (this._sprintLocked && this.stamina > this.maxStamina * 0.25) {
        this._sprintLocked = false;
      }
    }

    const speed = sprinting ? this.sprintSpeed : this.speed;

    // --- Horizontal movement (camera-relative, xz-plane) ---
    if (hasInput) {
      this.cam.moveRight(this._moveDir.x * speed * delta);
      this.cam.moveForward(this._moveDir.z * speed * delta);
    }

    // --- Jump ---
    if (this.input.isDown('Space') && this.grounded) {
      this.velocityY = this.jumpForce;
      this.grounded = false;
    }

    // --- Gravity integration + ground collision ---
    // Floor follows the terrain surface under the player (rising ground snaps
    // the player up = auto step-up; falling ground lets gravity drop them).
    const groundY = this.groundSampler
      ? this.groundSampler(this.cam.position.x, this.cam.position.z)
      : 0;
    const floorY = groundY + this.cam.eyeHeight;

    this.velocityY -= this.gravity * delta;
    this.baseY += this.velocityY * delta;
    if (this.baseY <= floorY) {
      this.baseY = floorY;
      this.velocityY = 0;
      this.grounded = true;
    }

    // --- Head-bob (only while grounded and moving) ---
    const moving = this.grounded && hasInput;
    this.cam.applyBob(this.baseY, moving, speed, delta);
  }

  // --- Damage hook (used from Phase 5 onward) ---
  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }
}
