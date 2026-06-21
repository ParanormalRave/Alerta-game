import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PERF, pixelRatio } from './performance.js';

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 1.05 },
    uTint: { value: new THREE.Color(0xff9a4a) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uStrength; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.25, dot(d, d) * uStrength * 2.2);
      c.rgb *= mix(0.55, 1.0, v);
      c.rgb = mix(c.rgb, c.rgb * uTint, 0.06);
      gl_FragColor = c;
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = PERF.postFX !== 'none';

    if (!this.enabled) return;

    this.composer = new EffectComposer(renderer);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    if (PERF.postFX === 'full') {
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.7,
        0.6,
        0.85
      );
      this.composer.addPass(this.bloom);
    }

    if (PERF.postFX === 'full' || PERF.postFX === 'vignette') {
      this.vignette = new ShaderPass(VignetteShader);
      this.composer.addPass(this.vignette);
    }

    this.composer.addPass(new OutputPass());
    this.setSize();
  }

  setScene(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    if (!this.enabled) return;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
  }

  setSize() {
    if (!this.enabled) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.composer.setPixelRatio(pixelRatio());
    this.composer.setSize(w, h);
    if (!this.bloom) return;
    this.bloom.setSize(
      Math.max(2, Math.round(w * PERF.bloomResolutionScale)),
      Math.max(2, Math.round(h * PERF.bloomResolutionScale))
    );
  }

  render() {
    if (this.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
