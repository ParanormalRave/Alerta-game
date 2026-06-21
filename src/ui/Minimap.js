/**
 * Minimap — top-down survey on a 200×200 canvas. Player-centred and rotated so
 * the player always faces up. Drawn in the almanac palette: hairline grid, an
 * accent ember mark, a gold return gate, parchment player chevron, red foes.
 */
import { PERF } from '../core/performance.js';

export class Minimap {
  constructor() {
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.size = this.canvas.width; // 200
    this.range = 60; // metres mapped to the radius
    this._lastT = -Infinity;
    this._minInterval = 1 / PERF.minimapFps;
  }

  /**
   * @param {object} d {cx, cz, yaw, accent, ember:{x,z}|null, portal:{x,z}|null, enemies:[{x,z}]}
   */
  render(d, now = performance.now() / 1000) {
    if (now - this._lastT < this._minInterval) return;
    this._lastT = now;
    const ctx = this.ctx;
    const S = this.size, C = S / 2;
    const scale = (C - 14) / this.range;
    ctx.clearRect(0, 0, S, S);

    // ground wash
    ctx.fillStyle = 'rgba(16,14,11,0.55)';
    ctx.fillRect(0, 0, S, S);

    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(-d.yaw); // rotate world so player faces up
    ctx.scale(1, 1);

    // hairline grid
    ctx.strokeStyle = 'rgba(233,220,194,0.10)';
    ctx.lineWidth = 1;
    for (let g = -this.range; g <= this.range; g += 12) {
      const p = g * scale;
      ctx.beginPath(); ctx.moveTo(p, -C); ctx.lineTo(p, C); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-C, p); ctx.lineTo(C, p); ctx.stroke();
    }

    const plot = (wx, wz) => ({ x: (wx - d.cx) * scale, y: (wz - d.cz) * scale });

    // enemies
    ctx.fillStyle = '#bb3a25';
    for (const e of d.enemies || []) {
      const p = plot(e.x, e.z);
      if (Math.hypot(p.x, p.y) > C - 8) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // ember
    if (d.ember) {
      const p = plot(d.ember.x, d.ember.z);
      ctx.fillStyle = d.accent || '#ff5a1e';
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // return portal
    if (d.portal) {
      const p = plot(d.portal.x, d.portal.z);
      ctx.fillStyle = '#e8b15a';
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.restore();

    // player chevron (always centre, pointing up)
    ctx.fillStyle = '#e9dcc2';
    ctx.beginPath();
    ctx.moveTo(C, C - 7);
    ctx.lineTo(C - 5, C + 5);
    ctx.lineTo(C + 5, C + 5);
    ctx.closePath();
    ctx.fill();

    // frame ring
    ctx.strokeStyle = 'rgba(233,220,194,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  }
}
