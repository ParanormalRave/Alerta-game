import * as THREE from 'three';
import { ParticleField } from '../fx/Particles.js';
import { Portal } from '../world/PortalSystem.js';
import { setupAtmosphere } from './sceneUtils.js';
import { HUB_SKY_STATES as SKY_STATES, applySkybox } from '../skybox/SkyboxManager.js';
import { REALMS, HUB } from '../data/realms.js';
import { gameState, isPortalUnlocked } from '../data/gameState.js';
import { PERF } from '../core/performance.js';
import { SHIP_TO_USE } from '../core/gameConfig.js';
import { mergeByMaterial, disposeObject } from '../core/meshUtils.js';
import { resolveStatic, PLAYER_RADIUS } from '../world/Collision.js';

// Keep the guardian on the deck: clamp to a disc that comfortably holds the
// spawn + all five portals so you can't stroll off the mothership into the
// skybox void. Tune this if the hall reads bigger/smaller.
const HUB_BOUND_RADIUS = 14;

const HUB_ROOM_ANCHOR = new THREE.Vector3(-14.08, 0.736, 0);
const HUB_FLOOR_ANCHOR = new THREE.Vector3(-2.075, 0.136, 0);
const HUB_WALL_ANCHOR = new THREE.Vector3(-14.019, 3.822, 0);
const HUB_WALL_SCALE = 8.017;
const HUB_WALL_BOUNDS = new THREE.Vector3(1.647, 2, 0.923);
const HUB_INTERIOR_SCALE = 1;
const HUB_ROOM_HALF = new THREE.Vector3(
  (HUB_WALL_BOUNDS.x * HUB_WALL_SCALE) / 2,
  (HUB_WALL_BOUNDS.y * HUB_WALL_SCALE) / 2,
  (HUB_WALL_BOUNDS.z * HUB_WALL_SCALE) / 2
);
const HUB_ROOM_CENTER = new THREE.Vector3().subVectors(HUB_WALL_ANCHOR, HUB_ROOM_ANCHOR);
HUB_ROOM_CENTER.y = HUB_WALL_ANCHOR.y - HUB_FLOOR_ANCHOR.y;
// Ring the five gates evenly AROUND the central table/projector (origin) — a
// regular pentagon at radius 5.6, apex on the far side (−z). The two near gates
// flank the +z entrance so the guardian walks in from spawn between them and
// then stands at the table, every portal facing inward toward them.
const HUB_PORTAL_POINTS = [
  [0, -5.6],      // far apex
  [-5.33, -1.73], // far-left
  [-3.29, 4.53],  // near-left (flanks the entrance)
  [3.29, 4.53],   // near-right (flanks the entrance)
  [5.33, -1.73],  // far-right
];
const HUB_PORTAL_SCALE = 0.58;

/**
 * HubScene — the crashed mothership. Five portals fan across the hall (locked /
 * active / completed by progress); the great viewport behind them shows the
 * world's sky, which heals one state per ember returned. A hologram greets the
 * guardian on arrival.
 */
export class HubScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.three = new THREE.Scene();
    this.portals = [];
    this.colliders = []; // solid fixtures (projector + portal frames)
  }

  get name() { return HUB.name; }

  enter() {
    const { ctx } = this;
    ctx.ui.setAccent(HUB.accent);

    // viewport sky reflects how much of the world has healed
    const state = Math.min(5, gameState.skyboxState);
    this.atmo = setupAtmosphere(this.three, SKY_STATES[state]);
    this.atmo.dome.lerpTo(SKY_STATES[state], 0.01);
    if (SHIP_TO_USE === 2) {
      applySkybox(ctx.assets, this.three, {
        radius: 520,
        onLoaded: (sky) => { this.hubSkybox = sky; },
      });
    }

    this._buildHall();
    this._buildShipInterior();
    this._buildRoomBounds();
    this._buildPortals();

    this.particles = new ParticleField(this.three);

    // intro hologram (first arrival of the session) + intercom on every return
    ctx.audio.playMusic('hub');
    ctx.audio.play('conqueror_intercom');
    if (!ctx.engine._hubIntroShown) {
      ctx.engine._hubIntroShown = true;
      ctx.dialogue.show('ANCIENT ORDER', [
        'Guardian. You wake aboard the Conqueror’s broken ship.',
        'Five realms bleed through the hull. Each holds an Ember.',
        'Carry them to the Motherglass. Heal what he has burned.',
      ]);
    }

    const spawn = new THREE.Vector3(0, 0, 6.2);
    this.spawnPoint = spawn;
    return spawn;
  }

  _buildHall() {
    // deck
    const deck = new THREE.Mesh(
      new THREE.CircleGeometry(40, PERF.hubSegments),
      new THREE.MeshStandardMaterial({ color: 0x1b1815, roughness: 0.7, metalness: 0.5 })
    );
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = SHIP_TO_USE === 2 ? -0.18 : 0;
    deck.receiveShadow = PERF.modelReceiveShadows;
    this.three.add(deck);

    // concentric inlay rings (almanac-like engraving on the floor)
    for (let r = 6; r <= 30; r += 6) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.06, r, PERF.hubSegments),
        new THREE.MeshBasicMaterial({ color: 0x3a3025, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      this.three.add(ring);
    }

    if (SHIP_TO_USE !== 2) {
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(40, 40, 16, PERF.hubSegments, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x16130f, roughness: 0.9, metalness: 0.3, side: THREE.BackSide })
      );
      wall.position.y = 8;
      this.three.add(wall);
    }

    // central hologram projector
    const proj = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.9, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.6, metalness: 0.6 })
    );
    proj.position.set(0, 0.25, 0);
    this.three.add(proj);
    this.colliders.push({ x: 0, z: 0, r: 1.0 }); // can't walk through the projector
    const holo = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 2.2, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
    );
    holo.position.set(0, 1.6, 0);
    this.three.add(holo);
    this.holo = holo;
    if (PERF.dynamicPointLights) {
      const holoLight = new THREE.PointLight(0x6fd0ff, 2, 10);
      holoLight.position.set(0, 2, 0);
      this.three.add(holoLight);
    }

    const amb = new THREE.AmbientLight(0xffe6c2, 0.25);
    this.three.add(amb);
  }

  _buildShipInterior() {
    if (SHIP_TO_USE !== 2) return;
    this.ctx.assets.loadModel('root/spaceship_with_interrior.glb').then((model) => {
      if (!model || !this.three) return;
      try { mergeByMaterial(model); } catch (e) { console.warn('[zoal] hub ship merge skipped:', e); }
      model.scale.setScalar(HUB_INTERIOR_SCALE);
      model.rotation.set(0, 0, 0);
      model.position.set(
        -HUB_ROOM_ANCHOR.x * HUB_INTERIOR_SCALE,
        -HUB_FLOOR_ANCHOR.y * HUB_INTERIOR_SCALE - 0.02,
        -HUB_ROOM_ANCHOR.z * HUB_INTERIOR_SCALE
      );
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          m.side = THREE.DoubleSide;
          m.depthWrite = true;
          m.fog = false;
          m.transparent = false;
        });
      });
      this.shipInterior = model;
      this.three.add(model);
    });
  }

  _buildRoomBounds() {
    if (SHIP_TO_USE !== 2) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x7bdcff, transparent: true, opacity: 0.22 });
    const edge = 0.045;
    const sx = HUB_ROOM_HALF.x * 2;
    const sy = HUB_ROOM_HALF.y * 2;
    const sz = HUB_ROOM_HALF.z * 2;
    const addBar = (size, pos) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
      m.position.copy(pos);
      g.add(m);
    };

    for (const y of [0.1, sy]) {
      for (const z of [-HUB_ROOM_HALF.z, HUB_ROOM_HALF.z]) addBar(new THREE.Vector3(sx, edge, edge), new THREE.Vector3(0, y, z));
      for (const x of [-HUB_ROOM_HALF.x, HUB_ROOM_HALF.x]) addBar(new THREE.Vector3(edge, edge, sz), new THREE.Vector3(x, y, 0));
    }
    for (const x of [-HUB_ROOM_HALF.x, HUB_ROOM_HALF.x]) {
      for (const z of [-HUB_ROOM_HALF.z, HUB_ROOM_HALF.z]) addBar(new THREE.Vector3(edge, sy, edge), new THREE.Vector3(x, sy / 2, z));
    }
    g.position.set(HUB_ROOM_CENTER.x, 0, HUB_ROOM_CENTER.z);
    this.roomBounds = g;
    this.three.add(g);
  }

  _buildPortals() {
    for (let n = 1; n <= 5; n++) {
      const realm = REALMS[n];
      const [x, z] = HUB_PORTAL_POINTS[n - 1];
      const face = Math.atan2(-x, -z);
      const portal = new Portal(this.ctx.assets, { accent: new THREE.Color(realm.accent).getHex(), label: realm.name, target: n });
      portal.group.position.set(x, 0, z);
      portal.group.scale.setScalar(SHIP_TO_USE === 2 ? HUB_PORTAL_SCALE : 0.76);
      portal.group.rotation.y = face;
      this.colliders.push({ x, z, r: 0.85 }); // solid portal frame

      const completed = gameState.completedRealms.includes(n);
      const unlocked = isPortalUnlocked(n);
      portal.setState(completed ? 'completed' : unlocked ? 'active' : 'locked');
      this.three.add(portal.group);
      this.portals.push(portal);
    }
  }

  getInteractable(p) {
    for (const portal of this.portals) {
      if (p.distanceTo(portal.position) < 3.2) {
        const n = portal.target;
        if (portal.state === 'locked') return { text: 'sealed — secure more embers', action: null };
        return { text: `enter ${REALMS[n].name}`, action: () => this.ctx.engine.sceneManager.loadRealm(n) };
      }
    }
    return null;
  }

  update(delta, playerPos) {
    this.holo.rotation.y += delta * 0.6;
    this.atmo.dome.update(delta);
    this.particles.update(delta);
    for (const portal of this.portals) portal.update(delta, this.particles);

    // wall collision: clamp the player onto the deck disc (runs after movement)
    if (playerPos) {
      // push out of solid fixtures (projector + portal frames) first
      resolveStatic(playerPos, PLAYER_RADIUS, this.colliders);
      const dx = playerPos.x;
      const dz = playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > HUB_BOUND_RADIUS * HUB_BOUND_RADIUS) {
        const d = Math.sqrt(d2) || 1;
        playerPos.x = (dx / d) * HUB_BOUND_RADIUS;
        playerPos.z = (dz / d) * HUB_BOUND_RADIUS;
      }
    }
  }

  getGroundHeight() { return 0; }
  getTargets() { return []; }

  minimapData(playerPos, yaw) {
    return {
      cx: playerPos.x, cz: playerPos.z, yaw, accent: HUB.accent,
      ember: null, portal: null,
      enemies: [],
    };
  }

  exit() {
    disposeObject(this.three); // skips shared (cached) GLB resources
    this.three.clear();
  }
}
