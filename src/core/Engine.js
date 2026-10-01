// Renderer, scene, camera and post-processing chain.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

// Ground-truth AO that skips things whose shape lives in a custom vertex shader or alpha
// (camera-following grass, leaf cards, water, sky, flames) — they would render wrongly in its normal pass.
class AOPass extends GTAOPass {
  overrideVisibility() {
    super.overrideVisibility();
    this.scene.traverse((o) => { if (o.userData.noAO) o.visible = false; });
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.32 },
    uWarm: { value: 0.03 },
    uSat: { value: 1.06 },
    uContrast: { value: 1.05 },
    uHurt: { value: 0 },
    uFade: { value: 0 },
    uTime: { value: 0 },
    uDesat: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette, uWarm, uSat, uContrast, uHurt, uFade, uTime, uDesat;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(l), col, uSat * (1.0 - uDesat));
      col = (col - 0.5) * uContrast + 0.5;
      col += vec3(uWarm, uWarm*0.4, -uWarm*0.6);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.25, length(d * vec2(1.1, 1.0)));
      col *= mix(1.0 - uVignette, 1.0, v);
      // damage pulse: red edges
      float edge = smoothstep(0.25, 0.75, length(d));
      col = mix(col, vec3(0.5, 0.02, 0.0), uHurt * edge * 0.75);
      col += (h(vUv * 800.0 + uTime) - 0.5) * 0.018; // film grain
      col = mix(col, vec3(0.0), uFade);
      gl_FragColor = vec4(col, c.a);
    }`,
};

// Crepuscular rays: bright sky around the sun is smeared radially across the frame, so trees, roofs and
// smoke in front of it cast visible shafts. Works on the HDR image before tone mapping.
const RaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uVis: { value: 0 },
    uStrength: { value: 0.32 },
    uThreshold: { value: 2.2 },
    uTint: { value: new THREE.Color(1.0, 0.86, 0.66) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uVis, uStrength, uThreshold; uniform vec3 uTint;
    varying vec2 vUv;
    #ifndef RAY_SAMPLES
    #define RAY_SAMPLES 40
    #endif
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (uVis <= 0.001) { gl_FragColor = base; return; }
      vec2 delta = (vUv - uSun) * (0.92 / float(RAY_SAMPLES));
      vec2 uv = vUv - delta * h(vUv * 911.0); // jitter hides banding
      float decay = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < RAY_SAMPLES; i++) {
        uv -= delta;
        vec3 s = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
        float l = max(0.0, dot(s, vec3(0.3, 0.59, 0.11)) - uThreshold);
        acc += min(s * l, vec3(4.0)) * decay;
        decay *= 0.955;
      }
      acc /= float(RAY_SAMPLES);
      float fall = 1.0 - smoothstep(0.0, 0.85, length((vUv - uSun) * vec2(1.6, 1.0)));
      gl_FragColor = vec4(base.rgb + acc * uTint * uStrength * uVis * (0.35 + fall), base.a);
    }`,
};

// Default quality from the GPU: Ultra on RTX / RX 6000+ class cards, High on older discrete GPUs.
export function detectQuality() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const name = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER)) || '';
    if (/RTX|RX\s?[6-9]\d{3}|Radeon Pro W[67]|Arc\(TM\) A7|Apple M[2-9] (Pro|Max|Ultra)/i.test(name)) return 3;
    if (/GTX|Quadro|RX\s?5\d{3}|Radeon RX|Apple M/i.test(name)) return 2;
    if (/SwiftShader|llvmpipe|Software/i.test(name)) return 0;
    return 1;
  } catch { return 1; }
}

export class Engine {
  constructor(container, quality = 1) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: quality >= 1, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality >= 3 ? 2 : quality >= 2 ? 1.5 : 1.25));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.6;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = quality >= 1 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 12000);
    this.camera.position.set(0, 30, 0);

    // HDR, multisampled frame for the post chain (the canvas' own antialiasing doesn't reach it)
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(window.innerWidth * pr, window.innerHeight * pr, { type: THREE.HalfFloatType, samples: quality >= 3 ? 4 : quality >= 1 ? 2 : 0 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (quality >= 2) {
      this.ao = new AOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
      this.ao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: quality >= 3 ? 16 : 12 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.ao.blendIntensity = 0.85;
      this.composer.addPass(this.ao);
    }
    if (quality >= 2) {
      this.rays = new ShaderPass(RaysShader);
      this.rays.material.defines.RAY_SAMPLES = quality >= 3 ? 56 : 36;
      this.composer.addPass(this.rays);
    }
    if (quality >= 1) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.22, 0.6, 0.88);
      this.composer.addPass(this.bloom);
    }
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  // sun direction (world) and how strongly it should shine through (0 at night / overcast)
  setSun(dir, vis) {
    if (!this.rays) return;
    const v = this._sunV || (this._sunV = new THREE.Vector3());
    v.copy(this.camera.position).addScaledVector(dir, 1000).project(this.camera);
    const u = this.rays.uniforms;
    u.uSun.value.set((v.x + 1) / 2, (v.y + 1) / 2);
    // fade as the sun leaves the screen or sets behind the camera
    const off = Math.max(Math.abs(v.x), Math.abs(v.y));
    u.uVis.value = v.z < 1 ? vis * (1 - THREE.MathUtils.smoothstep(off, 1.0, 1.8)) : 0;
  }

  render(dt) {
    this.grade.uniforms.uTime.value += dt;
    this.composer.render(dt);
  }
}
