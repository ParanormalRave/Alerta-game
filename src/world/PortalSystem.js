import * as THREE from 'three';
import { PERF } from '../core/performance.js';

/**
 * Portal — an arch frame + a swirling membrane disc + a rim light.
 * States: 'locked' (dark, dormant), 'active' (lit accent swirl, walk-through),
 * 'completed' (gold rim). Used for the 5 hub portals and each realm's return gate.
 */
const membraneVert = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const membraneFrag = /* glsl */ `
  uniform float uTime; uniform vec3 uColor; uniform float uActive; varying vec2 vUv;
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ang = atan(p.y, p.x);
    // swirling bands toward the centre
    float swirl = sin(ang * 5.0 + uTime * 2.0 - r * 8.0);
    float glow = smoothstep(1.0, 0.1, r) * (0.5 + 0.5 * swirl);
    float edge = smoothstep(1.0, 0.86, r) * 0.6;
    vec3 col = uColor * (glow + edge);
    float a = (glow * 0.8 + edge) * uActive;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }`;

export class Portal {
  constructor(assets, { accent = 0xff5a1e, label = 'Portal', target = null, scale = 1 } = {}) {
    this.accent = new THREE.Color(accent);
    this.label = label;
    this.target = target;
    this.state = 'locked';
    this.group = new THREE.Group();
    this.radius = 2.0 * scale;

    // Frame (placeholder torus arch → GLB when present)
    this.frame = assets.spawn('hub_portal_frame.glb', () => makeArch(this.radius), {
      scale: this.radius * 1.6,
      load: PERF.loadPropModels,
    });
    this.group.add(this.frame);

    // Swirling membrane
    this.uniforms = {
      uTime: { value: 0 },
      uColor: { value: this.accent.clone() },
      uActive: { value: 0 },
    };
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(this.radius * 0.92, PERF.portalDiscSegments),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: this.uniforms, vertexShader: membraneVert, fragmentShader: membraneFrag,
      })
    );
    disc.position.y = this.radius;
    this.disc = disc;
    this.group.add(disc);

    // Rim light
    if (PERF.portalLights) {
      this.light = new THREE.PointLight(accent, 0, 9);
      this.light.position.set(0, this.radius, 0.4);
      this.group.add(this.light);
    }
  }

  get position() { return this.group.position; }

  setState(state) {
    this.state = state;
    const active = state !== 'locked';
    this.uniforms.uActive.value = active ? 1 : 0;
    if (this.light) this.light.intensity = active ? 3.2 : 0;
    if (state === 'completed') {
      this.uniforms.uColor.value.set(0xe8b15a);
      this.light?.color.set(0xe8b15a);
    } else {
      this.uniforms.uColor.value.copy(this.accent);
      this.light?.color.copy(this.accent);
    }
  }

  update(delta, particles) {
    this.uniforms.uTime.value += delta;
    if (PERF.portalParticles && this.state !== 'locked' && particles && Math.random() < PERF.portalParticleChance) {
      const a = Math.random() * Math.PI * 2;
      particles.emit(
        new THREE.Vector3(
          this.position.x + Math.cos(a) * this.radius * 0.9,
          this.position.y + this.radius * (0.3 + Math.random()),
          this.position.z + Math.sin(a) * 0.2
        ),
        { count: 1, color: this.uniforms.uColor.value.getHex(), speed: 0.5, spread: 0.2, life: 1.2, gravity: -0.5, up: 0.6, size: 0.16 }
      );
    }
  }
}

function makeArch(radius) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a342c, roughness: 0.8, metalness: 0.3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.12, 8, PERF.portalRingSegments), mat);
  ring.position.y = radius;
  ring.castShadow = PERF.modelCastShadows;
  g.add(ring);
  const base = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.4, 0.3, 0.8), mat);
  base.castShadow = PERF.modelCastShadows;
  base.receiveShadow = PERF.modelReceiveShadows;
  g.add(base);
  return g;
}
