/**
 * InputManager — tracks keyboard + mouse button state and pointer-lock status.
 *
 * Phase 1: pointer lock (click to lock, ESC to release) and a key/button state map.
 * Phase 2 will consume `keys` / `mouseButtons` for movement and attacks.
 */
export class InputManager {
  constructor(domElement, lockOverlay) {
    this.domElement = domElement;
    this.lockOverlay = lockOverlay;

    /** @type {Set<string>} currently-held key codes, e.g. "KeyW", "Space" */
    this.keys = new Set();
    /** @type {Set<string>} key codes that went down THIS frame (edge), cleared by endFrame() */
    this.justPressed = new Set();
    /** @type {Set<number>} currently-held mouse buttons (0 left, 1 middle, 2 right) */
    this.mouseButtons = new Set();
    /** @type {Set<number>} mouse buttons that went down THIS frame */
    this.justMousePressed = new Set();
    /** mouse movement delta accumulated since last frame */
    this.mouseDelta = { x: 0, y: 0 };
    this.isLocked = false;

    this._onKeyDown = (e) => {
      // Stop Space from scrolling the page while playing.
      if (e.code === 'Space') e.preventDefault();
      // Record a true press edge (OS key-repeat re-fires keydown while held).
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseDown = (e) => {
      if (e.button === 2) e.preventDefault();
      // While locked a click is a game action; while unlocked it (re)engages
      // mouse-look. There is no title screen, so this is how play begins and how
      // the cursor re-locks after ESC.
      if (this.isLocked) {
        if (!this.mouseButtons.has(e.button)) this.justMousePressed.add(e.button);
        this.mouseButtons.add(e.button);
      }
      else this.requestLock();
    };
    this._onMouseUp = (e) => this.mouseButtons.delete(e.button);
    this._onMouseMove = (e) => {
      if (!this.isLocked) return;
      this.mouseDelta.x += e.movementX;
      this.mouseDelta.y += e.movementY;
    };
    this._onLockChange = () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      if (this.lockOverlay) {
        this.lockOverlay.classList.toggle('hidden', this.isLocked);
      }
      if (!this.isLocked) {
        // Dropped lock — clear held inputs so nothing sticks.
        this.keys.clear();
        this.mouseButtons.clear();
      }
    };
    this._onOverlayClick = () => this.requestLock();
    this._onContextMenu = (e) => e.preventDefault();
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('pointerlockchange', this._onLockChange);
    if (this.lockOverlay) {
      this.lockOverlay.addEventListener('click', this._onOverlayClick);
    }
  }

  requestLock() {
    // Newer browsers return a promise that rejects during the brief post-ESC
    // cooldown; swallow it so the console stays clean.
    const p = this.domElement.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  /** True if a key code is currently held. */
  isDown(code) {
    return this.keys.has(code);
  }

  /** True only on the frame a key was first pressed. */
  wasPressed(code) {
    return this.justPressed.has(code);
  }

  /** True only on the frame a mouse button was first pressed. */
  wasMousePressed(button) {
    return this.justMousePressed.has(button);
  }

  /** Clear per-frame edge state. Call once at the end of each update. */
  endFrame() {
    this.justPressed.clear();
    this.justMousePressed.clear();
  }

  /** Consume and reset the accumulated mouse delta (call once per frame). */
  consumeMouseDelta() {
    const d = { x: this.mouseDelta.x, y: this.mouseDelta.y };
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return d;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    if (this.lockOverlay) {
      this.lockOverlay.removeEventListener('click', this._onOverlayClick);
    }
  }
}
