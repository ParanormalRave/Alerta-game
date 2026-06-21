import * as THREE from 'three';
import { PERF } from '../core/performance.js';

/** Procedural soft round sprite so particles need no PNG asset. */
function makeSprite() {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * ParticleField — one additive Points cloud with a ring-buffered pool, so every
 * burst (ember extraction, heal wave, enemy death, weapon trails) shares a
 * single draw call and nothing is ever allocated mid-frame.
 */
export class ParticleField {
  constructor(scene, max = PERF.particleMax) {
    this.enabled = PERF.particles;
    this.max = this.enabled ? max : 1;
    this.head = 0;
    this._frame = 0;

    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3); // un-faded colour
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);     // remaining seconds
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.grav = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = geo;

    const mat = new THREE.PointsMaterial({
      size: 0.35,
      map: makeSprite(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  /**
   * @param {THREE.Vector3} origin
   * @param {object} o {count, color, speed, spread, life, size, gravity, up}
   */
  emit(origin, o = {}) {
    if (!this.enabled) return;
    const count = Math.max(1, Math.round((o.count ?? 24) * PERF.particleScale));
    const speed = o.speed ?? 3;
    const spread = o.spread ?? 1;
    const life = o.life ?? 0.9;
    const size = o.size ?? 0.3;
    const gravity = o.gravity ?? 4;
    const up = o.up ?? 0.5;
    this._c.set(o.color ?? 0xffffff);

    for (let n = 0; n < count; n++) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      const i3 = i * 3;
      this.pos[i3] = origin.x; this.pos[i3 + 1] = origin.y; this.pos[i3 + 2] = origin.z;
      // random direction biased upward
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      this.vel[i3] = Math.cos(a) * r * speed * 0.4 + (Math.random() - 0.5) * speed;
      this.vel[i3 + 1] = (up + Math.random()) * speed;
      this.vel[i3 + 2] = Math.sin(a) * r * speed * 0.4 + (Math.random() - 0.5) * speed;
      this.base[i3] = this._c.r; this.base[i3 + 1] = this._c.g; this.base[i3 + 2] = this._c.b;
      this.col[i3] = this._c.r; this.col[i3 + 1] = this._c.g; this.col[i3 + 2] = this._c.b;
      const l = life * (0.6 + Math.random() * 0.6);
      this.life[i] = l; this.maxLife[i] = l;
      this.size[i] = size;
      this.grav[i] = gravity;
    }
  }

  // ---- presets ----
  emberBurst(pos) { this.emit(pos, { count: 80, color: 0xff7a18, speed: 5, spread: 2, life: 1.4, gravity: 2, up: 1.2 }); }
  healRing(pos) { this.emit(pos, { count: 120, color: 0x9bd86a, speed: 7, spread: 3, life: 1.6, gravity: -1, up: 0.2 }); }
  deathPuff(pos, type) {
    const c = { ash: 0x8a7d6a, water: 0x6fe0ff, ember: 0xff7a18, void: 0x9a5cff }[type] || 0x8a7d6a;
    this.emit(pos, { count: 40, color: c, speed: 3, spread: 1.5, life: 1.0, gravity: 3, up: 0.8 });
  }
  trail(pos, color) { this.emit(pos, { count: 4, color, speed: 0.6, spread: 0.3, life: 0.35, gravity: 0, up: 0.1, size: 0.18 }); }

  update(delta) {
    if (!this.enabled) return;
    this._frame = (this._frame + 1) % PERF.particleUpdateEvery;
    if (this._frame !== 0) return;
    delta *= PERF.particleUpdateEvery;
    const { pos, vel, life, maxLife, base, col, grav } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= delta;
      const i3 = i * 3;
      if (life[i] <= 0) {
        col[i3] = col[i3 + 1] = col[i3 + 2] = 0; // collapse to invisible
        continue;
      }
      vel[i3 + 1] -= grav[i] * delta;
      pos[i3] += vel[i3] * delta;
      pos[i3 + 1] += vel[i3 + 1] * delta;
      pos[i3 + 2] += vel[i3 + 2] * delta;
      const k = life[i] / maxLife[i]; // fade out
      col[i3] = base[i3] * k; col[i3 + 1] = base[i3 + 1] * k; col[i3 + 2] = base[i3 + 2] * k;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
