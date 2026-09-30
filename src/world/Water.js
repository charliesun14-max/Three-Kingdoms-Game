// River ribbon + ponds with an animated fresnel/specular water shader.
import * as THREE from 'three';

const vert = `
varying vec3 vW; varying vec2 vUv;
#include <fog_pars_vertex>
void main(){
  vUv = uv;
  vec4 w = modelMatrix * vec4(position,1.0);
  vW = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const frag = `
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uHorizon;
uniform vec3 uDeep; uniform vec3 uShallow; uniform float uDay; uniform float uFlow;
varying vec3 vW; varying vec2 vUv;
#include <fog_pars_fragment>
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float hgt(vec2 p){
  float t = uTime;
  float h = vn(p * 0.55 + vec2(t*0.35, t*0.12)) * 0.5 + vn(p * 1.3 - vec2(t*0.2, -t*0.4)) * 0.3 + vn(p*3.1 + vec2(t*0.9,0.0))*0.12;
  return h;
}
void main(){
  vec2 p = uFlow > 0.5 ? vec2(vUv.x * 9.0, vUv.y * 0.45 - uTime * 0.9) : vW.xz * 0.45;
  float e = 0.15;
  float h0 = hgt(p);
  vec3 n = normalize(vec3(hgt(p - vec2(e,0.0)) - hgt(p + vec2(e,0.0)), 0.5, hgt(p - vec2(0.0,e)) - hgt(p + vec2(0.0,e))));
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0) * 0.85 + 0.08;
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uHorizon, uSky, clamp(R.y * 1.6, 0.0, 1.0));
  float edge = clamp(abs(vUv.x - 0.5) * 2.0, 0.0, 1.0);
  vec3 water = mix(uDeep, uShallow, edge * edge);
  vec3 col = mix(water, sky, fres);
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(n, H), 0.0), 220.0) * 3.5 * uDay;
  col += uSunCol * spec;
  // foam flecks near banks
  float foam = smoothstep(0.86, 1.0, edge) * smoothstep(0.55, 0.8, vn(p * 2.0));
  col = mix(col, vec3(0.8,0.78,0.7) * (0.3 + 0.7 * uDay), foam * 0.35);
  gl_FragColor = vec4(col, mix(0.82, 0.55, edge));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Water {
  constructor(hf, scene) {
    this.hf = hf;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
      uSky: { value: new THREE.Color(0.35, 0.55, 0.8) },
      uHorizon: { value: new THREE.Color(0.75, 0.8, 0.85) },
      uDeep: { value: new THREE.Color(0.07, 0.13, 0.12) },
      uShallow: { value: new THREE.Color(0.22, 0.27, 0.2) },
      uDay: { value: 1 },
      uFlow: { value: 1 },
    }]);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag,
      transparent: true, fog: true, depthWrite: false,
    });
    this.pondMaterial = this.material.clone();
    this.pondMaterial.uniforms = THREE.UniformsUtils.clone(this.uniforms);
    this.pondMaterial.uniforms.uFlow.value = 0;
    this.meshes = [];
    if (hf.riverPts) this.buildRiver(scene);
    for (const p of hf.region.ponds || []) this.buildPond(p, scene);
  }

  buildRiver(scene) {
    const pts = this.hf.riverPts, surf = this.hf.riverSurfPts;
    const hw = this.hf.region.river.width / 2 + 3.5;
    const pos = [], uv = [], idx = [];
    let along = 0;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const nx = -dz, nz = dx;
      const y = surf[k];
      if (k > 0) along += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      for (let s = 0; s <= 4; s++) {
        const o = (s / 4 - 0.5) * 2 * hw;
        pos.push(pts[k][0] + nx * o, y, pts[k][1] + nz * o);
        uv.push(s / 4, along);
      }
      if (k > 0) {
        const r0 = (k - 1) * 5, r1 = k * 5;
        for (let s = 0; s < 4; s++) idx.push(r0 + s, r1 + s, r0 + s + 1, r0 + s + 1, r1 + s, r1 + s + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    // Encode flow speed via uv.y scale in shader (vUv.y small multiplier)
    const m = new THREE.Mesh(g, this.material);
    m.renderOrder = 2;
    scene.add(m);
    this.meshes.push(m);
  }

  buildPond(p, scene) {
    const g = new THREE.CircleGeometry(p.r + 3, 40);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const dx = uv.getX(i) - 0.5, dy = uv.getY(i) - 0.5;
      uv.setXY(i, 0.5 + Math.hypot(dx, dy), 0);
    }
    const m = new THREE.Mesh(g, this.pondMaterial);
    m.position.set(p.x, p.surface, p.z);
    m.renderOrder = 2;
    scene.add(m);
    this.meshes.push(m);
  }

  update(dt, sky) {
    this.syncUniforms(this.material.uniforms, dt, sky);
    this.syncUniforms(this.pondMaterial.uniforms, dt, sky);
  }

  syncUniforms(u, dt, sky) {
    u.uTime.value += dt;
    u.uSunDir.value.copy(sky.sunDir);
    u.uSunCol.value.copy(sky.sun.color);
    const d = sky.dayFactor;
    u.uDay.value = d;
    u.uSky.value.setRGB(0.3 * d + 0.02, 0.48 * d + 0.03, 0.75 * d + 0.06);
    u.uHorizon.value.copy(this.hf && sky.engine.scene.fog.color);
    u.uDeep.value.setRGB(0.05 * d + 0.01, 0.1 * d + 0.015, 0.1 * d + 0.02);
    u.uShallow.value.setRGB(0.2 * d + 0.02, 0.24 * d + 0.03, 0.18 * d + 0.03);
  }
}
