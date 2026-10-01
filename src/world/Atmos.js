// Atmosphere around settlements: cooking smoke from chimneys, wheeling birds, motes in the sunlight.
import * as THREE from 'three';
import { Rng } from '../core/Rng.js';

const smokeVS = `
  uniform float uTime, uLean;
  varying vec2 vUv; varying float vSeed;
  void main(){
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vSeed = fract(sin(dot(modelMatrix[3].xz, vec2(12.9, 78.2))) * 437.5);
    float h = uv.y;
    wp.x += h * h * uLean * (1.0 + vSeed) + sin(uTime * 0.7 + h * 4.0 + vSeed * 6.0) * h * 0.7;
    wp.z += h * h * uLean * 0.4;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const smokeFS = `
  uniform float uTime, uAmt;
  varying vec2 vUv; varying float vSeed;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9,78.2)))*43758.5); }
  float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
  void main(){
    float y = vUv.y, x = vUv.x - 0.5;
    float w = 0.05 + y * 0.42;
    float t = n(vec2(vUv.x * 3.0 + vSeed * 9.0, y * 4.0 - uTime * 0.35)) * 0.6 + n(vec2(vUv.x * 7.0, y * 9.0 - uTime * 0.8)) * 0.4;
    float a = smoothstep(w, w * 0.2, abs(x) + (t - 0.5) * 0.18) * smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.4, 1.0, y)) * (0.3 + t * 0.7);
    gl_FragColor = vec4(vec3(0.6, 0.59, 0.58) * (0.85 + t * 0.2), a * uAmt * 0.42 * (1.0 - y * 0.5));
  }`;

export class Atmos {
  constructor(game) {
    this.g = game;
    this.group = new THREE.Group();
    game.engine.scene.add(this.group);
    const rng = new Rng((game.world.region.seed || 1) * 31 + 7);
    // chimney smoke from a share of the houses
    this.smokeU = { uTime: { value: 0 }, uAmt: { value: 1 }, uLean: { value: 2.5 } };
    const smat = new THREE.ShaderMaterial({ uniforms: this.smokeU, vertexShader: smokeVS, fragmentShader: smokeFS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const sgeo = new THREE.PlaneGeometry(4.6, 12, 1, 10); sgeo.translate(0, 6, 0);
    const H = { farmhouse: 4.0, tiled: 5.2, twoStorey: 7.6 };
    let n = 0;
    for (const b of game.world.settlements.buildings || []) {
      if (!H[b.kind] || /yamen|palace|hall|barracks|smithy/.test(b.id || '') || !rng.chance(0.3) || n > 26) continue;
      const y = game.world.groundHeight(b.x, b.z) + H[b.kind];
      for (let k = 0; k < 2; k++) {
        const m = new THREE.Mesh(sgeo, smat);
        m.position.set(b.x + rng.range(-1, 1), y, b.z + rng.range(-0.6, 0.6));
        m.rotation.y = k * Math.PI / 2 + rng.range(0, 1);
        m.userData.noAO = true; m.renderOrder = 3;
        this.group.add(m);
      }
      n++;
    }
    // birds wheeling over the villages and towns
    const flocks = game.world.region.settlements.filter((s) => ['village', 'walledTown', 'hamlet', 'estate'].includes(s.type)).slice(0, 4);
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, -0.42, 0, -0.05, 0, 0, -0.1, 0, 0, 0.12, 0, 0, -0.1, 0.42, 0, -0.05], 3));
    wing.computeVertexNormals();
    this.birdU = { uTime: { value: 0 } };
    const bmat = new THREE.MeshBasicMaterial({ color: 0x1a1612, side: THREE.DoubleSide });
    bmat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.birdU);
      sh.vertexShader = 'uniform float uTime;\nattribute float aPhase;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y += sin(uTime * 11.0 + aPhase) * abs(position.x) * 0.9;`);
    };
    this.flocks = [];
    for (const s of flocks) {
      const N = 9 + rng.int(0, 5);
      const wg = wing.clone();
      const ph = new Float32Array(N); for (let i = 0; i < N; i++) ph[i] = rng.range(0, 6.28);
      wg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
      const im = new THREE.InstancedMesh(wg, bmat, N);
      im.userData.noAO = true; im.frustumCulled = false;
      this.group.add(im);
      this.flocks.push({ im, N, x: s.x, z: s.z, y: game.world.groundHeight(s.x, s.z) + rng.range(24, 36), r: rng.range(25, 45), dir: rng.sign(), birds: Array.from({ length: N }, () => ({ a: rng.range(0, 6.28), dr: rng.range(-8, 8), dy: rng.range(-4, 4), sp: rng.range(0.18, 0.26) })) });
    }
    // motes drifting in the sunlight near the camera
    const M = 220, mp = new Float32Array(M * 3);
    for (let i = 0; i < M * 3; i++) mp[i] = (Math.random() - 0.5) * 16;
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const x = c.getContext('2d'), gr = x.createRadialGradient(8, 8, 0, 8, 8, 8); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 16, 16);
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xfff0c8, size: 0.035, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.frustumCulled = false;
    if (game.quality >= 1) this.group.add(this.motes);
  }

  update(dt) {
    const g = this.g, sky = g.world.sky, hr = g.time.hour, t = g.clockTime;
    this.smokeU.uTime.value = t;
    // cooking fires at dawn and dusk, embers at night, little at midday; rain damps it
    const meal = Math.max(Math.exp(-((hr - 7) ** 2) / 2.5), Math.exp(-((hr - 18) ** 2) / 3));
    this.smokeU.uAmt.value = (0.25 + 0.75 * meal) * (1 - (g.weather?.rain || 0) * 0.5);
    this.smokeU.uLean.value = 4 + (g.weather?.overcast || 0) * 3;
    this.birdU.uTime.value = t;
    const day = sky.dayFactor ?? 1;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    for (const f of this.flocks) {
      f.im.visible = day > 0.3 && (g.weather?.rain || 0) < 0.5;
      if (!f.im.visible) continue;
      f.birds.forEach((b, i) => {
        b.a += dt * b.sp * f.dir;
        const r = f.r + b.dr + Math.sin(t * 0.3 + i) * 4;
        p.set(f.x + Math.cos(b.a) * r, f.y + b.dy + Math.sin(t * 0.5 + i * 1.3) * 2, f.z + Math.sin(b.a) * r);
        e.set(Math.sin(t + i) * 0.15, -b.a - (f.dir > 0 ? 0 : Math.PI), Math.cos(b.a * 2) * 0.3 * f.dir);
        q.setFromEuler(e); s.setScalar(1.3);
        m.compose(p, q, s); f.im.setMatrixAt(i, m);
      });
      f.im.instanceMatrix.needsUpdate = true;
    }
    // motes wrap around the camera and catch the light by day
    const cam = g.engine.camera.position, pos = this.motes.geometry.attributes.position;
    if (!this.motesPlaced) { this.motesPlaced = true; for (let i = 0; i < pos.count; i++) pos.setXYZ(i, cam.x + (Math.random() - 0.5) * 16, cam.y + (Math.random() - 0.5) * 16, cam.z + (Math.random() - 0.5) * 16); }
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.08, y = pos.getY(i) + dt * 0.03, z = pos.getZ(i) + Math.cos(t * 0.27 + i * 1.7) * dt * 0.08;
      const wrap = (v, c) => (v - c > 8 ? v - 16 : v - c < -8 ? v + 16 : v);
      x = wrap(x, cam.x); y = wrap(y, cam.y); z = wrap(z, cam.z);
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    this.motes.material.opacity = 0.45 * day * (1 - (g.weather?.overcast || 0) * 0.8);
  }
}
