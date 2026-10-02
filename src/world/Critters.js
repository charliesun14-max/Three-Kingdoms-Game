// Small life around the player: butterflies over the meadows by day, fireflies on summer nights,
// peach petals drifting down in spring and leaves falling in autumn. Everything lives in a ring
// around the camera and is re-seeded as you move, so the cost is fixed (three draw calls).
import * as THREE from 'three';

const BUTTERFLIES = 36, FIREFLIES = 90, FALLERS = 260;
const rand = (a, b) => a + Math.random() * (b - a);

export class Critters {
  constructor(game) {
    this.g = game;
    const scene = game.engine.scene;
    // butterflies: two wings hinged on the body line, flapped in the vertex shader
    const wing = new THREE.BufferGeometry();
    const P = [], U = [];
    for (const s of [-1, 1]) {
      const q = [[0, 0, -0.012], [s * 0.05, 0, -0.03], [s * 0.055, 0, 0.022], [0, 0, 0.012]];
      for (const k of [0, 1, 2, 0, 2, 3]) { P.push(...q[k]); U.push(s, Math.abs(q[k][0]) / 0.055); }
    }
    wing.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    wing.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    wing.computeVertexNormals();
    this.phase = new THREE.InstancedBufferAttribute(new Float32Array(BUTTERFLIES), 1);
    wing.setAttribute('aPhase', this.phase);
    this.uTime = { value: 0 };
    const bm = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    bm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = 'uniform float uTime;\nattribute float aPhase;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float flap = (sin(uTime * 22.0 + aPhase * 6.283) * 0.5 + 0.5) * 1.25 + 0.1;
        float side = uv.x, r = abs(transformed.x);
        transformed.x = side * r * cos(flap);
        transformed.y = r * sin(flap);`);
    };
    this.butterflies = new THREE.InstancedMesh(wing, bm, BUTTERFLIES);
    this.butterflies.frustumCulled = false; this.butterflies.count = 0;
    const cols = [0xf4f0e0, 0xf0d860, 0xe8902a, 0xd8d8f0, 0xf6f2e4];
    for (let i = 0; i < BUTTERFLIES; i++) { this.butterflies.setColorAt(i, new THREE.Color(cols[i % cols.length])); this.phase.array[i] = Math.random(); }
    scene.add(this.butterflies);
    this.bs = Array.from({ length: BUTTERFLIES }, () => ({ anchor: null }));

    // fireflies: additive points, blinking
    const fg = new THREE.BufferGeometry();
    this.fPos = new Float32Array(FIREFLIES * 3); this.fCol = new Float32Array(FIREFLIES * 3);
    fg.setAttribute('position', new THREE.BufferAttribute(this.fPos, 3));
    fg.setAttribute('color', new THREE.BufferAttribute(this.fCol, 3));
    this.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: true }));
    this.fireflies.frustumCulled = false; this.fireflies.visible = false;
    scene.add(this.fireflies);
    this.fs = Array.from({ length: FIREFLIES }, () => ({ anchor: null, ph: Math.random() * 10 }));

    // falling petals and leaves
    const leaf = new THREE.PlaneGeometry(0.06, 0.04);
    this.fallers = new THREE.InstancedMesh(leaf, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), FALLERS);
    this.fallers.frustumCulled = false; this.fallers.count = 0;
    for (let i = 0; i < FALLERS; i++) this.fallers.setColorAt(i, new THREE.Color(1, 1, 1));
    scene.add(this.fallers);
    this.ls = Array.from({ length: FALLERS }, () => ({ live: false }));
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1);
    this.treeT = 0; this.nearTrees = [];
  }

  // a spot on open ground (not road, town, field or water) near the player
  groundSpot(p, rMin, rMax) {
    const hf = this.g.world.hf;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * 6.283, r = rand(rMin, rMax);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (Math.abs(x) > hf.half - 4 || Math.abs(z) > hf.half - 4) continue;
      if (hf.waterAt(x, z) !== null || hf.maskAt(x, z, 0) > 0.3 || hf.maskAt(x, z, 2) > 0.5) continue;
      return { x, z, y: this.g.world.groundHeight(x, z) };
    }
    return null;
  }

  update(dt) {
    const g = this.g, p = g.player?.pos;
    if (!p) return;
    const t = (this.uTime.value += dt);
    const month = g.time?.month ?? 3, night = g.world.sky?.nightFactor ?? 0, rain = g.weather?.rain ?? 0;

    // butterflies: spring to early autumn, sunny days
    const bOn = month >= 2 && month <= 9 && night < 0.3 && rain < 0.2;
    const bN = bOn ? Math.round(BUTTERFLIES * (month === 2 ? 0.4 : 1)) : 0;
    let n = 0;
    for (let i = 0; i < bN; i++) {
      const b = this.bs[i];
      if (!b.anchor || Math.hypot(b.anchor.x - p.x, b.anchor.z - p.z) > 38) {
        b.anchor = this.groundSpot(p, 2.5, 26); b.f = rand(0.3, 0.7); b.r = rand(1, 4); b.o = Math.random() * 10; b.land = 0;
        if (!b.anchor) continue;
      }
      const a = b.anchor, tt = t * b.f + b.o;
      b.land -= dt;
      if (b.land < -rand(4, 9)) b.land = rand(1.5, 4); // settle on a flower for a moment
      const settled = b.land > 0;
      const x = a.x + Math.sin(tt) * b.r + Math.sin(tt * 2.3) * 0.5, z = a.z + Math.cos(tt * 0.8) * b.r + Math.cos(tt * 1.9) * 0.5;
      const y = this.g.world.groundHeight(x, z) + (settled ? 0.35 : 0.5 + Math.abs(Math.sin(tt * 3.1)) * 0.6 + Math.sin(tt * 7) * 0.08);
      const yaw = Math.atan2(Math.cos(tt) * b.r, -Math.sin(tt * 0.8) * b.r * 0.8);
      if (!settled) { b.x = x; b.y = y; b.z = z; b.yaw = yaw; }
      this.q.setFromEuler(this.e.set(0, b.yaw, 0));
      this.m.compose(this.v.set(b.x, b.y, b.z), this.q, this.one);
      this.butterflies.setMatrixAt(n, this.m);
      this.phase.array[n] = settled ? 0.75 : (i * 0.37) % 1; // wings held up while resting
      n++;
    }
    this.butterflies.count = n;
    this.butterflies.instanceMatrix.needsUpdate = true; this.phase.needsUpdate = true;

    // fireflies: warm nights, low over the grass and near water
    const fOn = month >= 5 && month <= 8 && night > 0.55 && rain < 0.2;
    this.fireflies.visible = fOn;
    if (fOn) {
      for (let i = 0; i < FIREFLIES; i++) {
        const f = this.fs[i];
        if (!f.anchor || Math.hypot(f.anchor.x - p.x, f.anchor.z - p.z) > 40) { f.anchor = this.groundSpot(p, 3, 36); if (!f.anchor) continue; }
        f.ph += dt;
        const x = f.anchor.x + Math.sin(f.ph * 0.31 + i) * 1.5, z = f.anchor.z + Math.cos(f.ph * 0.27 + i * 2) * 1.5;
        this.fPos[i * 3] = x; this.fPos[i * 3 + 1] = f.anchor.y + 0.4 + Math.sin(f.ph * 0.5 + i) * 0.35; this.fPos[i * 3 + 2] = z;
        const blink = Math.max(0, Math.sin(f.ph * 1.7 + i * 1.3)) ** 6 * night;
        this.fCol[i * 3] = 0.9 * blink * 3; this.fCol[i * 3 + 1] = 1.0 * blink * 3; this.fCol[i * 3 + 2] = 0.35 * blink * 3;
      }
      this.fireflies.geometry.attributes.position.needsUpdate = true;
      this.fireflies.geometry.attributes.color.needsUpdate = true;
    }

    // petals (spring, under peach trees) and leaves (autumn, under broadleaf trees)
    this.treeT -= dt;
    const veg = g.world.vegetation;
    if (this.treeT <= 0 && veg) {
      this.treeT = 1.5;
      const spring = month >= 2 && month <= 3, autumn = month >= 8 && month <= 10;
      this.nearTrees = veg.trees.filter((tr) => Math.abs(tr.x - p.x) < 28 && Math.abs(tr.z - p.z) < 28
        && ((spring && tr.sp === 'peach') || (autumn && tr.sp !== 'pine' && tr.sp !== 'shrub') || (!spring && !autumn && tr.sp !== 'pine' && tr.sp !== 'shrub' && Math.random() < 0.15)));
      this.leafKind = spring ? 'petal' : 'leaf';
    }
    const wind = 0.6 + 0.5 * Math.sin(t * 0.13);
    let k = 0;
    for (let i = 0; i < FALLERS; i++) {
      const l = this.ls[i];
      if (!l.live) {
        if (!this.nearTrees.length || Math.random() > dt * (this.leafKind === 'petal' ? 4 : 0.9)) continue;
        const tr = this.nearTrees[Math.floor(Math.random() * this.nearTrees.length)];
        const top = (tr.sp === 'peach' ? 3.2 : 6.5) * (tr.s || 1);
        const a = Math.random() * 6.283, r = rand(0.3, tr.sp === 'peach' ? 1.8 : 3.0) * (tr.s || 1);
        l.live = true; l.x = tr.x + Math.cos(a) * r; l.z = tr.z + Math.sin(a) * r; l.y = g.world.groundHeight(tr.x, tr.z) + top * rand(0.55, 0.95);
        l.vy = -rand(0.35, 0.7); l.sp = rand(2, 5); l.ph = Math.random() * 6; l.rest = 0;
        l.c = this.leafKind === 'petal' ? new THREE.Color(0.98, rand(0.72, 0.84), rand(0.8, 0.9)) : new THREE.Color(rand(0.7, 0.85), rand(0.45, 0.65), rand(0.12, 0.25));
      }
      const gy = g.world.groundHeight(l.x, l.z);
      if (l.y > gy + 0.02) {
        l.ph += dt * l.sp;
        l.x += (Math.sin(l.ph) * 0.6 + wind * 0.5) * dt; l.z += (Math.cos(l.ph * 0.7) * 0.5 + wind * 0.2) * dt;
        l.y += l.vy * dt;
      } else if ((l.rest += dt) > 6 || Math.hypot(l.x - p.x, l.z - p.z) > 40) { l.live = false; continue; }
      this.q.setFromEuler(this.e.set(l.y > gy + 0.02 ? Math.sin(l.ph) * 1.2 : -Math.PI / 2, l.ph, l.y > gy + 0.02 ? Math.cos(l.ph * 1.3) : 0));
      this.m.compose(this.v.set(l.x, Math.max(l.y, gy + 0.015), l.z), this.q, this.one);
      this.fallers.setMatrixAt(k, this.m);
      this.fallers.setColorAt(k, l.c);
      k++;
    }
    this.fallers.count = k;
    this.fallers.instanceMatrix.needsUpdate = true;
    if (this.fallers.instanceColor) this.fallers.instanceColor.needsUpdate = true;
  }
}
