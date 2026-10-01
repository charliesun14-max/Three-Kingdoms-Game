// Tree/rock scattering with tiled instancing + LOD, and GPU-placed grass & crops.
import * as THREE from 'three';
import { Rng } from '../core/Rng.js';
import { buildTree, treeMaterials, allTreeUniforms } from './TreeFactory.js';
import { smoothPolyline } from '../core/MathUtil.js';
import { Tex } from './TextureGen.js';

const TILE = 200;

export class Vegetation {
  constructor(world) {
    this.world = world;
    this.hf = world.hf;
    this.trees = []; // {sp, x, z, s, r, v}
    this.rocks = [];
    this.tiles = new Map();
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    world.scene.add(this.group);
    this.geoCache = new Map();
  }

  canPlace(x, z, clearance = 2.5, allowSettlement = false) {
    const hf = this.hf;
    if (Math.abs(x) > hf.half - 4 || Math.abs(z) > hf.half - 4) return false;
    if (hf.maskAt(x, z, 0) > 0.05 || hf.maskAt(x + clearance, z, 0) > 0.05 || hf.maskAt(x - clearance, z, 0) > 0.05
      || hf.maskAt(x, z + clearance, 0) > 0.05 || hf.maskAt(x, z - clearance, 0) > 0.05) return false;
    if (hf.maskAt(x, z, 1) > 0.05) return false;
    if (!allowSettlement && hf.maskAt(x, z, 2) > 0.2) return false;
    if (hf.waterAt(x, z) !== null) return false;
    const wr = hf.region.river;
    if (wr) {
      const gi = Math.round(hf.toGrid(x)), gj = Math.round(hf.toGrid(z));
      if (hf.riverDist[hf.idx(gi, gj)] < wr.width / 2 + 2) return false;
    }
    if (hf.slope(x, z) > 0.45) return false;
    for (const c of this.world.colliders.query(x, z, clearance + 1)) {
      if (c.type === 'box') {
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
        if (Math.abs(lx) < c.hw + clearance && Math.abs(lz) < c.hd + clearance) return false;
      } else if (Math.hypot(x - c.x, z - c.z) < c.r + clearance * 0.6) return false;
    }
    return true;
  }

  addTree(sp, x, z, s = 1, opts = {}) {
    const t = { sp, x, z, s, r: opts.rot ?? Math.random() * Math.PI * 2, v: opts.variant ?? (Math.random() < 0.5 ? 0 : 1) };
    this.trees.push(t);
    if (sp !== 'shrub') {
      const trunkR = { mulberry: 0.9, pine: 0.32, elm: 0.36, poplar: 0.3, willow: 0.38, peach: 0.18, jujube: 0.2 }[sp] || 0.3;
      this.world.colliders.addCircle(x, z, trunkR * s, { kind: 'tree' });
    }
    return t;
  }

  addRock(x, z, s, kind = 0) {
    this.rocks.push({ x, z, s, r: Math.random() * 6.28, kind, tilt: Math.random() });
    if (s > 0.8) this.world.colliders.addCircle(x, z, s * 0.8, { kind: 'rock' });
  }

  scatter() {
    const hf = this.hf, R = hf.region;
    const rng = new Rng(R.seed + 99);
    // Forests
    for (const f of R.forests) {
      const step = 7.5;
      for (let z = f.z - f.r; z < f.z + f.r; z += step) for (let x = f.x - f.r; x < f.x + f.r; x += step) {
        const px = x + rng.range(-3, 3), pz = z + rng.range(-3, 3);
        const d = Math.hypot(px - f.x, pz - f.z) + 30 * hf.noise2.noise(px / 60, pz / 60);
        const fall = 1 - Math.max(0, (d - f.r * 0.55) / (f.r * 0.45));
        if (fall <= 0 || rng.next() > f.density * fall) continue;
        if (!this.canPlace(px, pz, 1.2)) continue;
        this.addTree(rng.pick(f.mix), px, pz, rng.range(0.8, 1.2));
      }
    }
    // Meadow trees and shrubs
    for (let z = -hf.half; z < hf.half; z += 26) for (let x = -hf.half; x < hf.half; x += 26) {
      const px = x + rng.range(0, 26), pz = z + rng.range(0, 26);
      const alt = hf.getHeight(px, pz);
      if (rng.next() < 0.16 && this.canPlace(px, pz, 3)) {
        const sp = alt > 60 ? 'pine' : rng.pick(['elm', 'elm', 'poplar', 'jujube', 'poplar', 'pine']);
        this.addTree(sp, px, pz, rng.range(0.8, 1.15));
      }
    }
    for (let z = -hf.half; z < hf.half; z += 11) for (let x = -hf.half; x < hf.half; x += 11) {
      const px = x + rng.range(0, 11), pz = z + rng.range(0, 11);
      const forest = hf.maskAt(px, pz, 3);
      if (rng.next() < 0.07 + forest * 0.25 && this.canPlace(px, pz, 1.2)) this.addTree('shrub', px, pz, rng.range(0.7, 1.4));
    }
    // River willows
    if (hf.riverPts) {
      const hw = R.river.width / 2;
      for (let k = 0; k < hf.riverPts.length; k += 7) {
        if (rng.next() > 0.45) continue;
        const a = hf.riverPts[Math.max(0, k - 1)], b = hf.riverPts[Math.min(hf.riverPts.length - 1, k + 1)];
        let dx = b[0] - a[0], dz = b[1] - a[1];
        const L = Math.hypot(dx, dz) || 1;
        const side = rng.sign();
        const off = hw + rng.range(5, 12);
        const px = hf.riverPts[k][0] - (dz / L) * off * side, pz = hf.riverPts[k][1] + (dx / L) * off * side;
        if (this.canPlace(px, pz, 2)) this.addTree(rng.next() < 0.75 ? 'willow' : 'poplar', px, pz, rng.range(0.85, 1.2));
      }
    }
    // Roadside poplars occasionally
    for (const road of hf.roads) {
      for (let k = 10; k < road.pts.length; k += 22) {
        if (rng.next() > 0.3) continue;
        const a = road.pts[k - 1], b = road.pts[k];
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
        const side = rng.sign(), off = road.w / 2 + 3.5;
        const px = b[0] - (dz / L) * off * side, pz = b[1] + (dx / L) * off * side;
        if (this.canPlace(px, pz, 1.5)) this.addTree(rng.pick(['poplar', 'elm', 'willow']), px, pz, rng.range(0.85, 1.1));
      }
    }
    // Rocks: mountains & slopes & scattered stones
    for (let z = -hf.half; z < hf.half; z += 9) for (let x = -hf.half; x < hf.half; x += 9) {
      const px = x + rng.range(0, 9), pz = z + rng.range(0, 9);
      const sl = hf.slope(px, pz), alt = hf.getHeight(px, pz);
      const p = 0.012 + sl * 0.5 + (alt > 55 ? 0.08 : 0);
      if (rng.next() < p) {
        if (hf.maskAt(px, pz, 0) > 0.05 || hf.maskAt(px, pz, 1) > 0.05 || hf.maskAt(px, pz, 2) > 0.2) continue;
        if (hf.waterAt(px, pz) !== null) continue;
        const big = rng.next() < 0.18 + sl;
        this.addRock(px, pz, big ? rng.range(1.0, 3.2) : rng.range(0.25, 0.7), rng.int(0, 2));
      }
    }
  }

  getTreeGeo(sp, v, lod) {
    const k = `${sp}_${v}_${lod}`;
    if (!this.geoCache.has(k)) this.geoCache.set(k, buildTree(sp, 1000 + v * 77 + sp.length * 13, lod));
    return this.geoCache.get(k);
  }

  build() {
    // bucket by tile/species/variant
    const buckets = new Map();
    for (const t of this.trees) {
      const ti = Math.floor((t.x + this.hf.half) / TILE), tj = Math.floor((t.z + this.hf.half) / TILE);
      const key = `${ti},${tj}`;
      if (!buckets.has(key)) buckets.set(key, { ti, tj, groups: new Map() });
      const gk = `${t.sp}|${t.v}`;
      const b = buckets.get(key);
      if (!b.groups.has(gk)) b.groups.set(gk, []);
      b.groups.get(gk).push(t);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [key, b] of buckets) {
      const tile = { lod0: new THREE.Group(), lod1: new THREE.Group(), cx: (b.ti + 0.5) * TILE - this.hf.half, cz: (b.tj + 0.5) * TILE - this.hf.half, lod: -1 };
      for (const [gk, list] of b.groups) {
        const [sp, vs] = gk.split('|');
        const v = +vs;
        const mats = treeMaterials(sp);
        for (const lod of [0, 1]) {
          const geo = this.getTreeGeo(sp, v, lod);
          const wood = new THREE.InstancedMesh(geo.wood, mats.wood, list.length);
          const leaf = new THREE.InstancedMesh(geo.leaves, mats.leaf, list.length);
          leaf.userData.noAO = true;
          list.forEach((t, i) => {
            p.set(t.x, this.hf.getHeight(t.x, t.z) - 0.15, t.z);
            q.setFromAxisAngle(up, t.r);
            s.setScalar(t.s);
            m.compose(p, q, s);
            wood.setMatrixAt(i, m);
            leaf.setMatrixAt(i, m);
          });
          for (const im of [wood, leaf]) {
            im.castShadow = lod === 0;
            im.receiveShadow = true;
            im.computeBoundingSphere();
            (lod === 0 ? tile.lod0 : tile.lod1).add(im);
          }
        }
      }
      this.group.add(tile.lod0, tile.lod1);
      tile.lod1.visible = false;
      this.tiles.set(key, tile);
    }
    this.buildRocks();
    this.grass = new GrassField(this.world);
    this.crops = new CropField(this.world);
  }

  buildRocks() {
    const geos = [0, 1, 2].map((k) => {
      const g = new THREE.IcosahedronGeometry(1, 2);
      const pos = g.attributes.position;
      const rng = new Rng(500 + k);
      const n = this.hf.noise;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const d = 1 + 0.28 * n.noise(x * 1.7 + k * 5, z * 1.7 + y) + 0.1 * n.noise(x * 4 + k, y * 4);
        pos.setXYZ(i, x * d * (k === 1 ? 1.4 : 1), y * d * (k === 2 ? 0.55 : 0.75), z * d);
      }
      g.computeVertexNormals();
      return g;
    });
    const mat = new THREE.MeshStandardMaterial({ color: 0xb0aaa0, roughness: 0.92, map: Tex.rock() });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let k = 0; k < 3; k++) {
      const list = this.rocks.filter((r) => r.kind === k);
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geos[k], mat, list.length);
      list.forEach((r, i) => {
        p.set(r.x, this.hf.getHeight(r.x, r.z) - r.s * 0.25, r.z);
        q.setFromEuler(new THREE.Euler(r.tilt * 0.3, r.r, r.tilt * 0.2));
        s.set(r.s, r.s, r.s);
        m.compose(p, q, s);
        im.setMatrixAt(i, m);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
  }

  update(dt, camPos, time) {
    for (const u of allTreeUniforms()) u.uTime.value = time;
    for (const tile of this.tiles.values()) {
      const d = Math.hypot(camPos.x - tile.cx, camPos.z - tile.cz);
      const lod = d < 260 ? 0 : d < 1400 ? 1 : 2;
      if (lod !== tile.lod) {
        tile.lod = lod;
        tile.lod0.visible = lod === 0;
        tile.lod1.visible = lod === 1;
      }
    }
    if (this.grass) this.grass.update(camPos, time);
    if (this.crops) this.crops.update(camPos, time);
  }
}

// ---------------------------------------------------------------------------
// GPU grass: a camera-following instanced grid; height & density sampled in the vertex shader.
const HEIGHT_SAMPLER = `
uniform sampler2D tHeight; uniform sampler2D tMask; uniform sampler2D tWet;
uniform float uHalf; uniform float uSize; uniform float uCell; uniform float uN;
uniform vec3 uCam; uniform float uTime; uniform float uSpacing; uniform float uRadius; uniform float uDensity;
float gh21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float gvn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(gh21(i),gh21(i+vec2(1,0)),f.x), mix(gh21(i+vec2(0,1)),gh21(i+vec2(1,1)),f.x), f.y); }
float hAt(vec2 w){
  vec2 g = (w + uHalf) / uCell;
  g = clamp(g, vec2(0.0), vec2(uN - 1.001));
  ivec2 i = ivec2(floor(g)); vec2 f = fract(g);
  float a = texelFetch(tHeight, i, 0).r, b = texelFetch(tHeight, i + ivec2(1,0), 0).r;
  float c = texelFetch(tHeight, i + ivec2(0,1), 0).r, d = texelFetch(tHeight, i + ivec2(1,1), 0).r;
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
`;

function bladeClump(blades, segs, width, rngSeed, isCrop = false) {
  const rng = new Rng(rngSeed);
  const pos = [], uv = [], idx = [];
  let base = 0;
  for (let b = 0; b < blades; b++) {
    const ox = rng.range(-0.22, 0.22), oz = rng.range(-0.22, 0.22);
    const ang = rng.range(0, Math.PI * 2);
    const bend = rng.range(0.1, 0.45);
    const hgt = rng.range(0.65, 1.0);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const w = width * (1 - t * (isCrop ? 0.3 : 0.9));
      const y = t * hgt;
      const fwd = bend * t * t;
      const cx = ox + ca * fwd * 0.5, cz = oz + sa * fwd * 0.5;
      pos.push(cx - sa * w, y, cz + ca * w, cx + sa * w, y, cz - ca * w);
      uv.push(0, t, 1, t);
    }
    for (let s = 0; s < segs; s++) {
      const a = base + s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    base += (segs + 1) * 2;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

class GrassField {
  constructor(world, opts = {}) {
    this.world = world;
    const hf = world.hf;
    const q = world.engine.quality;
    this.spacing = opts.spacing ?? (q >= 2 ? 0.34 : q === 1 ? 0.42 : 0.6);
    this.radius = opts.radius ?? (q >= 2 ? 46 : q === 1 ? 34 : 24);
    const n = Math.floor((this.radius * 2) / this.spacing);
    const geo = bladeClump(opts.blades ?? 9, 3, 0.022, 7, false);
    const offs = new Float32Array(n * n * 2);
    let k = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      offs[k++] = (i - n / 2) * this.spacing;
      offs[k++] = (j - n / 2) * this.spacing;
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 2));
    geo.instanceCount = n * n;
    this.uniforms = {
      tHeight: { value: hf.heightTexture() }, tMask: { value: hf.maskTexture() }, tWet: { value: hf.wetTexture() },
      uHalf: { value: hf.half }, uSize: { value: hf.size }, uCell: { value: hf.cell }, uN: { value: hf.N },
      uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uSpacing: { value: this.spacing }, uRadius: { value: this.radius },
      uDensity: { value: 1 },
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec2 aOff;
varying float vT; varying vec3 vGCol;
${HEIGHT_SAMPLER}`)
        .replace('#include <begin_vertex>', `
  vec2 snap = floor(uCam.xz / uSpacing) * uSpacing;
  vec2 wxz = snap + aOff;
  vec2 cellId = floor(wxz / uSpacing + 0.5);
  float r1 = gh21(cellId), r2 = gh21(cellId + 17.3), r3 = gh21(cellId + 41.1);
  wxz += (vec2(r1, r2) - 0.5) * uSpacing * 1.1;
  vec2 muv = (wxz + uHalf) / uSize;
  vec4 m = texture2D(tMask, muv);
  float wet = texture2D(tWet, muv).r;
  float gy = hAt(wxz);
  float sx = hAt(wxz + vec2(1.0,0.0)) - hAt(wxz - vec2(1.0,0.0));
  float sz = hAt(wxz + vec2(0.0,1.0)) - hAt(wxz - vec2(0.0,1.0));
  float slope = length(vec2(sx, sz)) * 0.5;
  float dens = 1.0 - m.r * 1.4 - m.g * 1.2 - m.b * 1.05 - m.a * 0.45 - smoothstep(0.35, 0.7, wet) - smoothstep(0.45, 0.9, slope);
  float patchN = gvn(wxz * 0.05) * 0.7 + gvn(wxz * 0.21) * 0.3;
  dens *= smoothstep(0.18, 0.5, patchN + 0.12) * uDensity;
  float dist = length(wxz - uCam.xz);
  float fade = 1.0 - smoothstep(uRadius * 0.6, uRadius * 0.98, dist);
  float scale = (dens > r3 ? 1.0 : 0.0) * fade;
  float hgt = mix(0.22, 0.55, gvn(wxz * 0.08)) * mix(0.65, 1.15, r1) * scale;
  float ang = r2 * 6.2831;
  vec3 p = position;
  p = vec3(p.x * cos(ang) - p.z * sin(ang), p.y, p.x * sin(ang) + p.z * cos(ang));
  p.y *= hgt; p.xz *= mix(0.6, 1.0, scale);
  float t = uv.y;
  float wind = sin(uTime * 1.6 + wxz.x * 0.35 + wxz.y * 0.22) * 0.5 + sin(uTime * 3.1 + wxz.x * 0.9) * 0.2 + gvn(wxz * 0.1 + uTime * 0.3) * 0.5;
  p.x += wind * t * t * 0.22 * hgt;
  p.z += wind * t * t * 0.12 * hgt;
  vec3 transformed = vec3(wxz.x + p.x, gy + p.y - 0.04, wxz.y + p.z);
  vT = t;
  float dry = smoothstep(0.45, 0.8, gvn(wxz * 0.02) + gvn(wxz * 0.11 + 3.1) * 0.35);
  vec3 green = mix(vec3(0.08, 0.13, 0.03), vec3(0.2, 0.26, 0.07), r3);
  vec3 straw = vec3(0.34, 0.28, 0.12);
  vGCol = mix(green, straw, dry * 0.45 + m.a * 0.2);
`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vT; varying vec3 vGCol;')
        .replace('#include <map_fragment>', `
  vec3 gc = vGCol * mix(0.5, 1.25, vT) + vec3(0.03, 0.04, 0.0) * vT * vT;
  diffuseColor.rgb *= gc;`);
    };
    mat.customProgramCacheKey = () => 'grassGPU';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.userData.noAO = true;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    world.scene.add(this.mesh);
  }
  update(camPos, time) {
    this.uniforms.uCam.value.copy(camPos);
    this.uniforms.uTime.value = time;
  }
}

// Millet/wheat stalks in the field mask (same technique, denser rows).
class CropField {
  constructor(world) {
    this.world = world;
    const hf = world.hf;
    const q = world.engine.quality;
    this.spacing = q >= 1 ? 0.36 : 0.55;
    this.radius = q >= 2 ? 60 : q === 1 ? 45 : 30;
    const n = Math.floor((this.radius * 2) / this.spacing);
    const geo = bladeClump(3, 4, 0.03, 13, true);
    // Add a drooping seed head (as extra quads) to each clump
    const offs = new Float32Array(n * n * 2);
    let k = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      offs[k++] = (i - n / 2) * this.spacing;
      offs[k++] = (j - n / 2) * this.spacing;
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 2));
    geo.instanceCount = n * n;
    this.uniforms = {
      tHeight: { value: hf.heightTexture() }, tMask: { value: hf.maskTexture() }, tWet: { value: hf.wetTexture() },
      uHalf: { value: hf.half }, uSize: { value: hf.size }, uCell: { value: hf.cell }, uN: { value: hf.N },
      uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uSpacing: { value: this.spacing }, uRadius: { value: this.radius },
      uDensity: { value: 1 },
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec2 aOff;
varying float vT; varying vec3 vGCol;
${HEIGHT_SAMPLER}`)
        .replace('#include <begin_vertex>', `
  vec2 snap = floor(uCam.xz / uSpacing) * uSpacing;
  vec2 wxz = snap + aOff;
  vec2 cellId = floor(wxz / uSpacing + 0.5);
  float r1 = gh21(cellId), r2 = gh21(cellId + 17.3), r3 = gh21(cellId + 41.1);
  wxz += (vec2(r1, r2) - 0.5) * uSpacing * 0.5;
  vec2 muv = (wxz + uHalf) / uSize;
  vec4 m = texture2D(tMask, muv);
  float gy = hAt(wxz);
  float dist = length(wxz - uCam.xz);
  float fade = 1.0 - smoothstep(uRadius * 0.7, uRadius, dist);
  float scale = step(0.55, m.g) * fade * step(0.08, r3);
  float hgt = mix(0.9, 1.35, r1) * scale;
  float ang = r2 * 6.2831;
  vec3 p = position;
  p = vec3(p.x * cos(ang) - p.z * sin(ang), p.y, p.x * sin(ang) + p.z * cos(ang));
  p.y *= hgt; p.xz *= scale;
  float t = uv.y;
  float wind = sin(uTime * 1.2 + wxz.x * 0.25 + wxz.y * 0.18) * 0.6 + gvn(wxz * 0.08 + uTime * 0.25);
  p.x += wind * t * t * 0.18;
  p.z += wind * t * t * 0.1;
  vec3 transformed = vec3(wxz.x + p.x, gy + p.y - 0.05, wxz.y + p.z);
  vT = t;
  float ripe = gvn(wxz * 0.03);
  vGCol = mix(vec3(0.1, 0.16, 0.04), vec3(0.42, 0.32, 0.1), smoothstep(0.45, 0.8, ripe));
`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vT; varying vec3 vGCol;')
        .replace('#include <map_fragment>', `
  vec3 gc = vGCol * mix(0.5, 1.15, vT);
  if (vT > 0.72) gc = mix(gc, vec3(0.5, 0.36, 0.12), 0.75);
  diffuseColor.rgb *= gc;`);
    };
    mat.customProgramCacheKey = () => 'cropGPU';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.userData.noAO = true;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    world.scene.add(this.mesh);
  }
  update(camPos, time) {
    this.uniforms.uCam.value.copy(camPos);
    this.uniforms.uTime.value = time;
  }
}

export { smoothPolyline };
