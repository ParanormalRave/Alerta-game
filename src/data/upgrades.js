export const PASSIVE_UPGRADES = {
  ember_vigor: {
    id: 'ember_vigor',
    name: 'Ember Vigor',
    desc: '+20 vitality',
    color: 0xff5a1e,
    stats: { maxHealth: 20 },
  },
  tide_breath: {
    id: 'tide_breath',
    name: 'Tide Breath',
    desc: '+20 stamina, faster recovery',
    color: 0x6fe0ff,
    stats: { maxStamina: 20, staminaRegen: 6 },
  },
  iron_hide: {
    id: 'iron_hide',
    name: 'Iron Hide',
    desc: '15% less incoming damage',
    color: 0xffb347,
    stats: { damageTakenScale: 0.85 },
  },
  phase_stride: {
    id: 'phase_stride',
    name: 'Phase Stride',
    desc: 'faster movement and specials',
    color: 0x9a5cff,
    stats: { speed: 0.8, sprintSpeed: 1.1, specialCooldownScale: 0.85 },
  },
  convergence_focus: {
    id: 'convergence_focus',
    name: 'Convergence Focus',
    desc: '+12% weapon damage',
    color: 0xffd24a,
    stats: { weaponDamageScale: 1.12 },
  },
};

export const PASSIVE_BY_REALM = {
  1: 'ember_vigor',
  2: 'tide_breath',
  3: 'iron_hide',
  4: 'phase_stride',
  5: 'convergence_focus',
};

export function upgradeName(id) {
  return PASSIVE_UPGRADES[id]?.name || id;
}

export function passiveBonuses(ids = []) {
  const out = {
    maxHealth: 0,
    maxStamina: 0,
    staminaRegen: 0,
    speed: 0,
    sprintSpeed: 0,
    damageTakenScale: 1,
    weaponDamageScale: 1,
    specialCooldownScale: 1,
  };

  for (const id of ids) {
    const s = PASSIVE_UPGRADES[id]?.stats;
    if (!s) continue;
    out.maxHealth += s.maxHealth || 0;
    out.maxStamina += s.maxStamina || 0;
    out.staminaRegen += s.staminaRegen || 0;
    out.speed += s.speed || 0;
    out.sprintSpeed += s.sprintSpeed || 0;
    if (s.damageTakenScale) out.damageTakenScale *= s.damageTakenScale;
    if (s.weaponDamageScale) out.weaponDamageScale *= s.weaponDamageScale;
    if (s.specialCooldownScale) out.specialCooldownScale *= s.specialCooldownScale;
  }
  return out;
}
