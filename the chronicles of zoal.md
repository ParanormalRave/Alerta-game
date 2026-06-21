# The Chronicles of Zoal: Ember Awakening — FPS Game Build Document
### For Claude Code | Three.js | Full Implementation Guide

---

## ⚠️ CLAUDE CODE INSTRUCTIONS — READ FIRST

You are building a first-person shooter/slasher hybrid game called **The Chronicles of Zoal: Ember Awakening** in Three.js. This document is your complete spec. Follow the phases in order. Do not skip phases. Before writing any code, output the **3D Assets List** section to the user so they can download the required models before you build the systems that need them.

**Stack:**
- Three.js (r158+) via CDN or npm
- PointerLockControls (Three.js addon)
- Rapier.js WASM — physics & collision
- Howler.js — audio
- Vite — dev server & bundler
- Vanilla JS (no framework)

---

## 🎯 GAME OVERVIEW

| Field | Value |
|---|---|
| Genre | FPS Dungeon Crawler / Hack-and-Slash |
| Perspective | First Person |
| Engine | Three.js (WebGL) |
| World Structure | Hub (Mothership) + 5 Realm Scenes |
| Win Condition | Place 4 Embers into Motherglass in Realm 5 |
| Combat Style | Melee (slasher) + Ranged (shooter) hybrid |
| Tone | Dark fantasy / sci-fi crossover |

---

## 📦 3D ASSETS LIST — OUTPUT THIS TO USER BEFORE BUILDING

> **Claude Code:** Print this entire section to the terminal as a formatted list before starting Phase 2. Tell the user: *"Please download these models and place them in `/public/models/`. I'll wire them up as I build each system."*

### Character & Player
| File Name | What It Is | Where to Get It | Format |
|---|---|---|---|
| `player_hands.glb` | First-person arms/hands rig | Sketchfab — search "FPS arms rig" (free) | GLB |
| `player_hands_sword.glb` | Arms holding sword, swing animation | Mixamo export or Sketchfab | GLB |
| `player_hands_gun.glb` | Arms holding gun, shoot + reload anim | Sketchfab "FPS gun arms" | GLB |

### Weapons
| File Name | What It Is | Where to Get It | Format |
|---|---|---|---|
| `weapon_ashen_blade.glb` | Fantasy sword — dark/charred aesthetic | Sketchfab "dark fantasy sword" free | GLB |
| `weapon_ember_bow.glb` | Glowing fantasy bow | Sketchfab "fantasy bow" | GLB |
| `weapon_tidecaster.glb` | Magic staff / water wand | Sketchfab "magic staff" | GLB |
| `weapon_ironbreaker.glb` | Heavy warhammer | Sketchfab "warhammer game" | GLB |
| `weapon_voidlance.glb` | Sleek spear / lance | Sketchfab "spear weapon" | GLB |
| `weapon_phase_daggers.glb` | Dual daggers | Sketchfab "dagger pair game ready" | GLB |
| `weapon_force_gauntlet.glb` | Armored glove / fist weapon | Sketchfab "gauntlet armor" | GLB |
| `weapon_convergence_staff.glb` | Ornate multi-element staff | Sketchfab "wizard staff glowing" | GLB |

### Enemies
| File Name | What It Is | Where to Get It | Format |
|---|---|---|---|
| `enemy_ashling.glb` | Small humanoid ash creature | Mixamo: use "Zombie" base, export GLB | GLB |
| `enemy_coal_golem.glb` | Large rocky/coal monster | Sketchfab "rock golem game ready" | GLB |
| `enemy_ink_wraith.glb` | Ghost/floating dark entity | Sketchfab "ghost enemy" | GLB |
| `enemy_tide_construct.glb` | Water-armored warrior | Sketchfab "water elemental" | GLB |
| `enemy_automaton.glb` | Steampunk robot soldier | Sketchfab "robot soldier game ready" | GLB |
| `enemy_drift_shade.glb` | Phase-shifting shadow | Sketchfab "shadow creature" | GLB |
| `enemy_conqueror.glb` | Final boss — large alien warlord | Sketchfab "alien boss character" | GLB |

### Boss Specific
| File Name | What It Is | Where to Get It | Format |
|---|---|---|---|
| `boss_smolder_stag.glb` | Flaming elk / deer creature | Sketchfab "fire deer" or "flaming stag" | GLB |
| `boss_archivist.glb` | Drowned scholar ghost | Sketchfab "ghost scholar" | GLB |
| `boss_warlord_engine.glb` | Giant mech / war machine | Sketchfab "mech boss game" | GLB |
| `boss_pale_twin.glb` | Mirror clone of player | Reuse `player_hands.glb` — handled in code | GLB |

### Environment — Hub (Mothership)
| File Name | What It Is | Where to Get It | Format |
|---|---|---|---|
| `hub_mothership_interior.glb` | Crashed alien ship interior — main hall | Sketchfab "sci-fi spaceship interior" | GLB |
| `hub_portal_frame.glb` | Ornate portal ring/arch | Sketchfab "fantasy portal arch" | GLB |
| `hub_hologram_projector.glb` | Glowing projector device | Sketchfab "hologram projector" | GLB |
| `hub_viewport_glass.glb` | Broken window frame with glass | Sketchfab "broken window sci-fi" | GLB |

### Environment — Realm 1 (Cinderwood)
| File Name | What It Is | Where to Get It | Format |
|---|---|---|---|
| `realm1_burnt_tree.glb` | Dead/charred tree (tile 3–5 variations) | Sketchfab "dead tree low poly" | GLB |
| `realm1_ember_rock.glb` | Glowing volcanic rock with ember | Sketchfab "glowing rock crystal" | GLB |
| `realm1_ashpile.glb` | Ground ash/debris scatter | Sketchfab "ash debris" | GLB |

### Environment — Realm 2 (Drowned Archive)
| File Name | What It Is | Where to Get It | Format |
|---|---|---|---|
| `realm2_flooded_bookshelf.glb` | Waterlogged library shelves | Sketchfab "underwater library" or "bookshelf ruins" | GLB |
| `realm2_ancient_pillar.glb` | Crumbling stone columns | Sketchfab "stone pillar ruins" | GLB |
| `realm2_floating_book.glb` | Open floating book (particles) | Sketchfab "magic book" | GLB |

### Environment — Realm 3 (Iron Wastes)
| File Name | What It Is | Where to Get It | Format |
|---|---|---|---|
| `realm3_rusted_tank.glb` | Destroyed war machine prop | Sketchfab "destroyed tank rusted" | GLB |
| `realm3_scrap_wall.glb` | Metal debris wall segment | Sketchfab "scrap metal wall" | GLB |
| `realm3_war_crater.glb` | Ground crater prop | Sketchfab "bomb crater" | GLB |

### Environment — Realm 4 (Voidmarsh)
| File Name | What It Is | Where to Get It | Format |
|---|---|---|---|
| `realm4_void_crystal.glb` | Floating dark crystal shards | Sketchfab "void crystal dark" | GLB |
| `realm4_marsh_tree.glb` | Twisted swamp tree | Sketchfab "swamp tree low poly" | GLB |
| `realm4_space_tear.glb` | Rift/tear in space visual | Sketchfab "space rift portal" | GLB |

### Environment — Realm 5 (Convergence)
| File Name | What It Is | Where to Get It | Format |
|---|---|---|---|
| `realm5_motherglass.glb` | Central altar/receptacle for embers | Sketchfab "ancient altar crystal" | GLB |
| `realm5_convergence_platform.glb` | Boss arena platform | Sketchfab "boss arena platform" | GLB |

### UI / Particles
| File Name | What It Is | Where to Get It | Format |
|---|---|---|---|
| `particle_ember.png` | Glowing orange ember particle | Any free particle texture pack | PNG |
| `particle_void.png` | Purple/black void particle | Any free particle texture pack | PNG |
| `particle_heal.png` | Green/gold healing particle | Any free particle texture pack | PNG |
| `crosshair.png` | FPS crosshair | Generate or use CSS — no download needed | PNG |

### Skyboxes (6 states)
| File Name | What It Is | Where to Get It | Format |
|---|---|---|---|
| `skybox_0_corrupted/` | Full corruption — ash/red/eclipse | Polyhaven.com — "cloudy red" HDR | HDR/6-face PNG |
| `skybox_1_ember/` | Eclipse breaking, orange horizon | Polyhaven.com | HDR |
| `skybox_2_water/` | Deep blue-violet sky | Polyhaven.com | HDR |
| `skybox_3_forest/` | Teal-blue, forests returning | Polyhaven.com | HDR |
| `skybox_4_daylight/` | Full daylight with storm patch | Polyhaven.com | HDR |
| `skybox_5_healed/` | Golden hour, world restored | Polyhaven.com | HDR |

> **Free asset sources:** [Sketchfab Free](https://sketchfab.com/features/free-3d-models) · [Mixamo](https://www.mixamo.com) · [Polyhaven](https://polyhaven.com) · [Quaternius](https://quaternius.com) · [Kenny.nl](https://kenney.nl)

---

## 🏗️ PROJECT STRUCTURE

```
ember-chronicles/
├── public/
│   ├── models/           ← All GLB files go here
│   ├── skyboxes/         ← 6 skybox folders
│   ├── audio/            ← SFX and music
│   └── particles/        ← Particle PNGs
├── src/
│   ├── main.js           ← Entry point, scene init
│   ├── core/
│   │   ├── Engine.js     ← Game loop, renderer, clock
│   │   ├── SceneManager.js ← Scene switching (hub ↔ realms)
│   │   ├── InputManager.js ← WASD, mouse, pointer lock
│   │   └── AudioManager.js ← Howler.js wrapper
│   ├── player/
│   │   ├── Player.js     ← FPS controller, health, state
│   │   ├── FPSCamera.js  ← PointerLockControls + headbob
│   │   ├── WeaponSystem.js ← Weapon switching, animations
│   │   └── Inventory.js  ← Loot, upgrades, passive slots
│   ├── combat/
│   │   ├── MeleeSystem.js  ← Swing arc, hitbox detection
│   │   ├── RangedSystem.js ← Projectile raycasting, pooling
│   │   └── DamageNumbers.js ← Floating damage text
│   ├── enemies/
│   │   ├── EnemyBase.js  ← Base class: HP, state machine
│   │   ├── EnemyAI.js    ← Patrol → alert → chase → attack
│   │   ├── BossBase.js   ← Boss phases, health bar
│   │   └── enemies/      ← Individual enemy classes
│   ├── world/
│   │   ├── VoxelChunk.js ← InstancedMesh voxel chunks
│   │   ├── ChunkManager.js ← Load/unload by player pos
│   │   ├── PortalSystem.js ← Portal rendering, transitions
│   │   └── EmberRock.js  ← Extractable ember mechanic
│   ├── ui/
│   │   ├── HUD.js        ← Health, ammo, ember count
│   │   ├── Minimap.js    ← 2D canvas overlay
│   │   ├── Dialogue.js   ← Hologram dialogue system
│   │   └── KillCounter.js ← Realm 5 % tracker
│   ├── skybox/
│   │   └── SkyboxManager.js ← State machine + lerp transitions
│   ├── scenes/
│   │   ├── HubScene.js   ← Mothership hub
│   │   ├── Realm1.js     ← Cinderwood
│   │   ├── Realm2.js     ← Drowned Archive
│   │   ├── Realm3.js     ← Iron Wastes
│   │   ├── Realm4.js     ← Voidmarsh
│   │   └── Realm5.js     ← The Convergence (final)
│   └── data/
│       ├── weapons.js    ← Weapon stats config
│       ├── enemies.js    ← Enemy stats config
│       └── gameState.js  ← Global state (embers, unlocks, kills)
├── index.html
├── vite.config.js
└── package.json
```

---

## 🔧 PHASE-BY-PHASE BUILD PLAN

### PHASE 1 — Project Bootstrap
**Goal:** Renderer running, window resizes, dev server live.

```bash
npm create vite@latest ember-chronicles -- --template vanilla
cd ember-chronicles
npm install three @rapier3d/rapier3d-compat howler
npm install -D vite
```

Tasks:
- Set up `index.html` with canvas and HUD overlay divs
- Initialize Three.js `WebGLRenderer` with antialiasing
- Set up `PerspectiveCamera` (FOV 75, near 0.1, far 1000)
- Add resize listener
- Create game loop with `renderer.setAnimationLoop`
- Add `PointerLockControls` — click to lock, ESC to unlock

---

### PHASE 2 — FPS Player Controller
**Goal:** WASD movement, mouse look, jumping, gravity feel.

- `Player.js`: position, velocity, health (100), stamina
- `FPSCamera.js`: wrap `PointerLockControls`, add head bob on movement (sin wave on Y axis, amplitude 0.05, frequency based on speed)
- `InputManager.js`: keydown/keyup map, mouse button state
- Movement: apply velocity, friction, gravity constant (-9.8 * delta)
- Collision: ray cast downward to detect floor (Rapier or manual AABB)
- Player stats: `{ health: 100, maxHealth: 100, stamina: 100, speed: 5, jumpForce: 8 }`

---

### PHASE 3 — Weapon System (FPS Hands)
**Goal:** Viewmodel weapons, swing/shoot, weapon switching.

**Melee weapons** (slasher):
| Weapon | Damage | Speed | Range | Special |
|---|---|---|---|---|
| Ashen Blade | 45 | Fast | 2.5m | Burn DoT on hit |
| Ironbreaker | 90 | Slow | 2m | AoE knockback |
| Voidlance | 60 | Medium | 4m | Can throw (ranged) |
| Phase Daggers | 25×2 | Very Fast | 1.5m | Dodge through enemy |
| Force Gauntlet | 70 | Medium | 1.5m | Pushback stagger |

**Ranged weapons** (shooter):
| Weapon | Damage | Fire Rate | Ammo | Special |
|---|---|---|---|---|
| Ember Bow | 55 | Slow | 30 | Fire trail, no reload |
| Tidecaster | 40 | Medium | ∞ (cooldown) | Slows enemies |
| Convergence Staff | 80 | Slow | 20 | Cycles elements |

Implementation:
- Viewmodel: attach weapon GLB to camera child object, offset `(0.3, -0.3, -0.5)`
- Melee: on attack input → play swing animation → at frame peak, cast 3 rays in arc (left, center, right) → if hit enemy, apply damage
- Ranged: on fire input → create projectile mesh or raycast instantly → check enemy hit
- Weapon switch: number keys 1–8, lerp viewmodel out (down) and new one in
- Ammo HUD update on each shot

---

### PHASE 4 — Voxel World System
**Goal:** Isometric-feeling FPS world made of voxel chunks.

- Voxel size: `1×1×1` Three.js units
- Chunk size: `16×16×16` voxels
- Render distance: 4 chunks in each direction from player
- Use `InstancedMesh` per voxel type per chunk (max ~4096 instances)
- Voxel types: `STONE, GRASS, ASH, WATER, VOID, IRON, EMBER_INFUSED`
- `ChunkManager.js`: generate chunks procedurally using noise (use `simplex-noise` npm package)
- Each realm has its own biome generator config (voxel type weights, height variance)
- On ember extract: iterate all chunks in radius, swap corrupted voxel types to healed types with lerp delay (wave effect)

---

### PHASE 5 — Enemy System & AI
**Goal:** Enemies that patrol, detect, chase, and attack player.

Enemy state machine per enemy:
```
IDLE → PATROL → ALERT → CHASE → ATTACK → STAGGER → DEAD
```

- `EnemyBase.js`: health, speed, attackDamage, detectionRadius, attackRange
- `EnemyAI.js`: update() ticks state machine each frame
  - PATROL: move between 2–3 waypoints
  - ALERT: play alert animation, pause 0.5s, transition to CHASE
  - CHASE: pathfind toward player (simple steering: normalize direction vector)
  - ATTACK: if in range, trigger attack animation + damage player
  - STAGGER: brief pause after taking damage (knockback)
  - DEAD: play death anim, drop loot, remove after 3s
- Enemy hit detection: player melee rays or projectiles check enemy bounding sphere
- Kill counter: increment `gameState.kills` and `gameState.totalEnemiesInRealm`

---

### PHASE 6 — Hub Scene (Mothership)
**Goal:** The central base — portals, skybox viewport, hologram.

- Load `hub_mothership_interior.glb` as main environment
- Place 5 `hub_portal_frame.glb` instances at fixed positions in arc around the hall
- Portal states: `LOCKED` (dark, no glow), `ACTIVE` (animated shader ring, bright), `COMPLETED` (gold rim)
- Locked portals: add `door_blast.glb` overlay mesh in front, remove on unlock
- Viewport windows: place `hub_viewport_glass.glb` on far wall — behind it render the current skybox state as a background plane
- `hub_hologram_projector.glb`: on game start, trigger `Dialogue.js` — floating hologram text boxes with typewriter effect
- Intercom audio: Conqueror voice line plays on each hub return (use `Howler` spatial audio from above)
- Portal interaction: player approaches within 1.5m → prompt appears → E to enter → `SceneManager.loadRealm(n)`

**Portal unlock rules:**
```
Start:         Portal 1 unlocked
After Realm 1: Portals 2 + 3 unlock
After Realm 2 + 3: Portal 4 unlocks
After Realm 4: Portal 5 unlocks
```

---

### PHASE 7 — Realm Scenes
**Goal:** Five distinct gameplay zones.

Each realm follows this template:
1. Load terrain via `ChunkManager` with realm-specific biome config
2. Scatter environment props (GLB models) at generation time
3. Spawn enemies from realm enemy list at fixed spawn points
4. Place `EmberRock.js` at realm center or boss location
5. Place return portal behind player spawn point
6. On load: show minimap of realm, mark ember location and return portal

**Realm configs:**

| Realm | Biome Voxels | Enemies | Ember Position | Sky Tint |
|---|---|---|---|---|
| 1 — Cinderwood | ASH, EMBER_INFUSED | Ashlings, Coal Golems, Smolder Stag | Forest center | Red/orange |
| 2 — Drowned Archive | WATER, STONE | Ink Wraiths, Tide Constructs, Archivist | Sunken vault | Blue/purple |
| 3 — Iron Wastes | IRON, ASH | Automata, Shell Crawlers, Warlord Engine | War engine core | Grey/orange |
| 4 — Voidmarsh | VOID, WATER | Drift Shades, Phase Hunters, Pale Twin | Space tear | Purple/black |
| 5 — Convergence | ALL MIXED | All types | Motherglass altar | All colors |

**EmberRock.js mechanic:**
- Glowing pulsing mesh (`ember_rock.glb` + PointLight)
- Player interacts (E) → trigger extract animation → realm heal wave → enemies despawn → return portal lights gold

---

### PHASE 8 — Boss Encounters
**Goal:** Each realm ends with a boss fight.

Boss base class `BossBase.js`:
- Extended health bar (UI renders separate boss HP bar at top of screen)
- 2–3 attack phases (phase changes at 66% and 33% HP)
- Telegraphed attacks (wind-up animation before each attack)
- Weak points (specific hitbox area deals 2× damage)

| Boss | Phase 1 | Phase 2 | Phase 3 | Weak Point |
|---|---|---|---|---|
| Smolder Stag | Charge, stomp | Summon ashlings | Fire AoE ring | Ember gem on forehead |
| Archivist | Water bolt | Flood zone | Summon ink wraiths | Exposed spine |
| Warlord Engine | Cannon shot | Deploy drones | Overcharge beam | Cockpit glass |
| Pale Twin | Mirror attacks | Invert controls briefly | Clone splits x2 | Back of neck |
| Conqueror | Melee barrage | Ranged energy blasts | Summons all enemy types | Chest core |

---

### PHASE 9 — Skybox State Machine
**Goal:** Hub viewports show a healing world.

- `SkyboxManager.js` holds 6 preloaded `CubeTextureLoader` textures (skybox_0 through skybox_5)
- `currentSkybox` index = number of embers returned
- On ember return: `tweenSkybox(from, to, duration=3000)` — lerp between two skybox textures using a custom shader blend
- In hub scene: render a large sphere behind viewport windows with the current skybox texture mapped inside
- Viewport glass has slight blue tint material overlay for immersion

---

### PHASE 10 — Realm 5 & Final Boss
**Goal:** The climax — Motherglass, Conqueror, win condition.

1. Player enters Realm 5 with all 4 embers (enforced by `gameState.embers.length === 4`)
2. Hardest enemy mix spawns — kill counter UI shows `XX% / 75%`
3. At `kills >= 75%`:
   - Freeze player briefly (0.8s)
   - Cutscene: Conqueror cinematic appears (fullscreen canvas overlay + audio)
   - Zoal is "overpowered" — scripted knockback + screen flash
   - Player loses most-recently-acquired passive upgrade (log to console which one)
   - Reincarnation: health resets to 100, brief white flash screen
4. `boss_conqueror.glb` spawns at room center — boss fight begins
5. Motherglass altar is active — player can interact with it (E) to slot an ember during the fight
6. Slot all 4 embers while Conqueror is alive → trigger win sequence:
   - Conqueror staggers → erupts with light → escapes through ceiling
   - Screen fades → return to hub
   - Final skybox state loads (fully healed)
   - Ending cutscene: camera slowly pans through hub viewports showing each healed realm
   - Credits roll

---

### PHASE 11 — UI Systems
**Goal:** All HUD elements, dialogue, minimap.

**HUD elements** (HTML overlay, `position: fixed`):
- Health bar (bottom left) — red fill, depletes smoothly
- Stamina bar (below health) — yellow fill
- Ammo counter (bottom right) — weapon icon + `X / MAX`
- Ember slots (top right) — 4 empty circles, fill with glow on collection
- Kill counter (top center, Realm 5 only) — `47% / 75%`
- Boss HP bar (top, full width) — appears on boss spawn
- Interaction prompt (center) — "E — Extract Ember" / "E — Enter Portal"
- Damage vignette — red screen edge flash on hit

**Minimap:**
- 2D canvas, top-left corner, `200×200px`, semi-transparent
- Shows realm as top-down grid (chunk tiles)
- Player dot (white), Ember location (orange), Return portal (gold), Enemies (red dots within range)
- Toggle with M key

**Dialogue system:**
- Fullscreen or corner text box, typewriter character-by-character
- Speaker label: "ANCIENT ORDER" or "CONQUEROR"
- Skip with Space, advance with E
- Hologram visual effect: scanline shader overlay on text box

---

### PHASE 12 — Audio
**Goal:** Spatial SFX + ambient music per realm.

Use Howler.js for all audio.

| Audio File | Type | Usage |
|---|---|---|
| `sfx_sword_swing.wav` | SFX | Melee attack |
| `sfx_sword_hit.wav` | SFX | Melee connects |
| `sfx_bow_shoot.wav` | SFX | Bow fire |
| `sfx_footstep_ash.wav` | SFX | Realm 1 footstep |
| `sfx_footstep_water.wav` | SFX | Realm 2 footstep |
| `sfx_footstep_metal.wav` | SFX | Realm 3 footstep |
| `sfx_portal_open.wav` | SFX | Portal activation |
| `sfx_ember_extract.wav` | SFX | Ember extraction |
| `sfx_heal_wave.wav` | SFX | World healing wave |
| `sfx_boss_roar.wav` | SFX | Boss spawn |
| `sfx_player_hit.wav` | SFX | Player takes damage |
| `sfx_player_death.wav` | SFX | Player death |
| `sfx_conqueror_intercom.wav` | SFX | Conqueror voice lines (3 variants) |
| `music_hub.mp3` | Music | Hub ambient loop |
| `music_realm1.mp3` | Music | Cinderwood theme |
| `music_realm2.mp3` | Music | Drowned Archive theme |
| `music_realm3.mp3` | Music | Iron Wastes theme |
| `music_realm4.mp3` | Music | Voidmarsh theme |
| `music_realm5.mp3` | Music | Convergence (tense) |
| `music_boss.mp3` | Music | Boss fight overlay |
| `music_ending.mp3` | Music | Credits / ending scene |

> Recommended free sources: [Freesound.org](https://freesound.org) · [OpenGameArt.org](https://opengameart.org) · [ZapSplat.com](https://zapsplat.com)

---

### PHASE 13 — Save System
**Goal:** Persist progress between sessions.

Use `localStorage` for save data:

```js
const saveData = {
  embers: [],                  // ['realm1', 'realm2', ...]
  unlockedPortals: [1],        // portal indexes
  completedRealms: [],
  inventory: [],               // weapon IDs
  passiveUpgrades: [],         // upgrade IDs
  skyboxState: 0,
  kills: { total: 0, byRealm: {} }
}
```

- Auto-save on: realm completion, ember collection, hub return
- Load save on game start — restore unlocked portals, skybox state, inventory
- New Game option: clears localStorage and resets state

---

### PHASE 14 — Polish & Particles
**Goal:** Juice — the game should feel good to play.

Particle systems to build with Three.js `Points`:
- **Ember extraction**: orange/gold burst from rock, radius expand
- **Healing wave**: green/gold ring expands from ember point across chunks
- **Enemy death**: grey ash explosion (ashling), water splash (tide construct), etc.
- **Weapon trails**: sword swing leaves ember trail (melee), arrow has fire trail
- **Portal ambient**: swirling particles around active portals
- **Void particles**: Realm 4 floating purple motes

Post-processing (via Three.js `EffectComposer`):
- Bloom on ember sources, portals, glowing enemies
- Slight vignette at all times
- Screen-space ambient occlusion (SSAO) for depth
- Motion blur (subtle, on fast mouse movement)

---

### PHASE 15 — Performance & Optimization
**Goal:** Consistent 60fps on mid-range hardware.

- Chunk unloading: destroy chunks > 6 chunks from player
- Enemy culling: skip AI update for enemies > 50m from player
- LOD: swap high-poly GLBs for low-poly beyond 20m (Three.js `LOD` class)
- Object pooling: projectiles, particles, damage numbers — never destroy, reuse
- Texture atlasing: bake realm-specific voxel textures into single atlas per realm
- InstancedMesh counts: cap at 4096 per type per chunk
- Shadow maps: directional light only, `shadow.mapSize = 1024`
- Frustum culling: Three.js does this automatically — ensure all meshes have `frustumCulled = true`

---

## 🎮 CONTROLS REFERENCE

| Key | Action |
|---|---|
| W/A/S/D | Move |
| Mouse | Look |
| Left Click | Primary attack (melee swing / shoot) |
| Right Click | Secondary attack / aim |
| 1–8 | Weapon slots |
| E | Interact (portal, ember, loot) |
| Space | Jump |
| Shift | Sprint |
| M | Toggle minimap |
| ESC | Pause / release pointer lock |
| R | Reload (ranged weapons) |
| Q | Quick weapon swap (last used) |

---

## 🌍 WORLD LORE REFERENCE (for NPC dialogue & in-game text)

- **Zoal** — Player character. Last Guardian of the Old Order. Was captured by the Conqueror.
- **The Conqueror** — Ancient alien warlord. Crashed ship is *his*. He's wounded and draining the Embers for resurrection power.
- **The Old Order** — Ancient guardians who maintained the five realms. Wiped out by the Conqueror.
- **Embers** — Elemental cores: Fire (Realm 1), Water (Realm 2), Force (Realm 3), Void (Realm 4), Convergence (Realm 5 already contains them).
- **Motherglass** — Ancient receptacle. Placing all 4 Embers in it seals the Conqueror's power and heals the world.
- **The Realms** — Five dimensions branching from Earth's convergence node. The portals on the ship accidentally connected to them during the crash.

---

## ✅ COMPLETION CHECKLIST

- [ ] Phase 1 — Project bootstrapped, renderer running
- [ ] Phase 2 — FPS controller with mouse look + WASD
- [ ] Phase 3 — Weapon system (melee + ranged), viewmodel
- [ ] Phase 4 — Voxel chunk system, biome generation
- [ ] Phase 5 — Enemy AI state machine, all enemy types
- [ ] Phase 6 — Hub scene with portals and skybox viewports
- [ ] Phase 7 — All 5 realm scenes with ember rocks
- [ ] Phase 8 — All 5 boss encounters with phases
- [ ] Phase 9 — Skybox state machine, lerp transitions
- [ ] Phase 10 — Realm 5 climax, Conqueror fight, win condition
- [ ] Phase 11 — Full HUD, minimap, dialogue system
- [ ] Phase 12 — All audio integrated (SFX + music)
- [ ] Phase 13 — Save system (localStorage)
- [ ] Phase 14 — Particles, bloom, post-processing
- [ ] Phase 15 — Performance optimization, 60fps target

---

*The Chronicles of Zoal: Ember Awakening — Build Document v1.0 | Generated for Claude Code*
