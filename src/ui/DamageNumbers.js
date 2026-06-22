import * as THREE from 'three';

const DEFAULT_POOL = 56;

export class DamageNumbers {
  constructor(root = document.getElementById('hud'), size = DEFAULT_POOL) {
    this.root = root || document.body;
    this.pool = [];
    this.active = [];
    this._v = new THREE.Vector3();

    this.layer = document.createElement('div');
    this.layer.id = 'damage-numbers';
    this.root.appendChild(this.layer);

    for (let i = 0; i < size; i++) {
      const el = document.createElement('span');
      el.className = 'dmg-number';
      el.style.display = 'none';
      this.layer.appendChild(el);
      this.pool.push({ el, t: 0, life: 0, pos: new THREE.Vector3(), vy: 0, xDrift: 0 });
    }
  }

  spawn(pos, amount, { color = '#ffdf8a', critical = false, label = '' } = {}) {
    const item = this.pool.pop() || this.active.shift();
    if (!item) return;
    item.pos.copy(pos);
    item.t = 0;
    item.life = critical ? 0.9 : 0.72;
    item.vy = critical ? 1.35 : 1.0;
    item.xDrift = (Math.random() - 0.5) * 34;
    item.el.textContent = `${Math.round(amount)}${label}`;
    item.el.style.color = color;
    item.el.classList.toggle('crit', critical);
    item.el.style.display = 'block';
    this.active.push(item);
  }

  update(delta, camera) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const d = this.active[i];
      d.t += delta;
      if (d.t >= d.life) {
        d.el.style.display = 'none';
        this.active.splice(i, 1);
        this.pool.push(d);
        continue;
      }

      this._v.copy(d.pos);
      this._v.y += d.t * d.vy;
      this._v.project(camera);
      const visible = this._v.z > -1 && this._v.z < 1;
      if (!visible) {
        d.el.style.display = 'none';
        continue;
      }
      const k = d.t / d.life;
      const x = (this._v.x * 0.5 + 0.5) * w + d.xDrift * k;
      const y = (-this._v.y * 0.5 + 0.5) * h - 28 * k;
      d.el.style.opacity = `${1 - k}`;
      d.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${1 + (1 - k) * 0.12})`;
      d.el.style.display = 'block';
    }
  }

  dispose() {
    this.layer.remove();
    this.pool.length = 0;
    this.active.length = 0;
  }
}
