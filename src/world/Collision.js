/**
 * Collision — lightweight horizontal (xz-plane) collision.
 *
 * Everything solid is approximated as an upright circle (cylinder) on the
 * ground: props, enemies, the boss, hub fixtures. We resolve by pushing a moving
 * circle (the player or an enemy) out of anything it overlaps. It's cheap,
 * allocation-free, and runs after movement each frame — scenes own their static
 * collider lists (`[{ x, z, r }]`) and call these helpers.
 *
 * This is deliberately not a physics engine: no stacking, no slopes (the ground
 * sampler already handles height), no mesh-accurate walls. It just stops the
 * guardian and the foes from walking through each other and through the world.
 */

/** Player collision radius — shared so every scene resolves consistently. */
export const PLAYER_RADIUS = 0.4;

/**
 * Push point `p` (anything with .x/.z, e.g. a Vector3) out of a single circle.
 * @returns {boolean} true if it was overlapping and got moved.
 */
export function pushOutOfCircle(p, r, cx, cz, cr) {
  const dx = p.x - cx;
  const dz = p.z - cz;
  const rr = r + cr;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-4) { p.x = cx + rr; return true; } // concentric → shove along +x
  const push = (rr - d) / d;
  p.x += dx * push;
  p.z += dz * push;
  return true;
}

/**
 * Push point `p` (radius r) out of a list of static circle colliders. A couple
 * of iterations lets corners (two overlapping obstacles) settle.
 */
export function resolveStatic(p, r, colliders, iterations = 2) {
  for (let it = 0; it < iterations; it++) {
    let any = false;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (pushOutOfCircle(p, r, c.x, c.z, c.r)) any = true;
    }
    if (!any) break; // nothing overlapping → done early
  }
}
