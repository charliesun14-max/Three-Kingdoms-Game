// Procedural heightfield + material masks for a region.
import * as THREE from 'three';
import { Simplex } from '../core/Noise.js';
import { clamp, lerp, smoothstep, smoothPolyline } from '../core/MathUtil.js';

export class Heightfield {
  constructor(region) {
    this.region = region;
    this.size = region.size;
    this.half = region.size / 2;
    this.cell = 2;
    this.N = this.size / this.cell + 1;
    this.H = new Float32Array(this.N * this.N);
    this.riverDist = new Float32Array(this.N * this.N).fill(1e9);
    this.riverSurf = new Float32Array(this.N * this.N).fill(-1e9);
    this.noise = new Simplex(region.seed);
    this.noise2 = new Simplex(region.seed + 17);
    this.maskRes = this.size; // 1 texel per metre
    this.mask = new Uint8Array(this.maskRes * this.maskRes * 4);
    this.generate();
  }

  idx(i, j) { return j * this.N + i; }
  toGrid(x) { return (x + this.half) / this.cell; }
  toWorld(i) { return i * this.cell - this.half; }

  baseHeight(x, z) {
    const R = this.region, n = this.noise;
    let h = R.baseHeight
      + 7 * n.fbm(x / 520, z / 520, 3)
      + 2.6 * n.fbm(x / 110 + 7, z / 110 - 3, 3)
      + 0.5 * n.fbm(x / 22, z / 22, 2);
    // Border mountains
    const e = R.edges;
    const bn = 1 - (z + this.half) / this.size; // 1 at north edge
    const bs = (z + this.half) / this.size;
    const bw = 1 - (x + this.half) / this.size;
    const be = (x + this.half) / this.size;
    const wob = 0.035 * this.noise2.fbm(x / 160, z / 160, 3);
    const ridge = this.noise2.ridged(x / 260, z / 260, 5);
    const edgeMask = (b, amp, start) => smoothstep(start, 1.0, b + wob) * amp;
    let m = 0;
    m = Math.max(m, edgeMask(bn, e.n, 0.8));
    m = Math.max(m, edgeMask(bw, e.w, 0.82));
    m = Math.max(m, edgeMask(be, e.e, 0.86));
    m = Math.max(m, edgeMask(bs, e.s, 0.87));
    h += m * (0.55 + 0.45 * ridge + 0.2 * this.noise.fbm(x / 300, z / 300, 3));
    // Named mountains / hills
    for (const mt of R.mountains) {
      const dx = x - mt.x, dz = z - mt.z;
      const d = Math.sqrt(dx * dx + dz * dz) / mt.r;
      if (d < 1.6) {
        const f = Math.exp(-d * d * 2.2);
        h += f * mt.h * (0.55 + 0.6 * this.noise.ridged(x / 120 + mt.x, z / 120, 4));
      }
    }
    return h;
  }

  generate() {
    const { N, H, region } = this;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        H[this.idx(i, j)] = this.baseHeight(this.toWorld(i), this.toWorld(j));
      }
    }
    // Flatten settlements
    for (const s of region.settlements) this.flattenRect(s.x, s.z, s.w / 2 + 6, s.d / 2 + 6, 42);
    for (const f of region.fields) this.flattenRect(f.x, f.z, f.w / 2 + 2, f.d / 2 + 2, 20, 0.7);
    this.carveRiver();
    for (const p of region.ponds || []) this.carvePond(p);
    this.buildRoads();
    this.buildMask();
  }

  sampleAvg(x, z, hw, hd) {
    let s = 0, n = 0;
    for (let a = -1; a <= 1; a += 0.5) for (let b = -1; b <= 1; b += 0.5) {
      s += this.getHeight(x + a * hw, z + b * hd); n++;
    }
    return s / n;
  }

  flattenRect(cx, cz, hw, hd, margin, strength = 1) {
    const target = this.sampleAvg(cx, cz, hw, hd);
    const i0 = Math.max(0, Math.floor(this.toGrid(cx - hw - margin)));
    const i1 = Math.min(this.N - 1, Math.ceil(this.toGrid(cx + hw + margin)));
    const j0 = Math.max(0, Math.floor(this.toGrid(cz - hd - margin)));
    const j1 = Math.min(this.N - 1, Math.ceil(this.toGrid(cz + hd + margin)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.toWorld(i), z = this.toWorld(j);
      const dx = Math.max(0, Math.abs(x - cx) - hw), dz = Math.max(0, Math.abs(z - cz) - hd);
      const d = Math.sqrt(dx * dx + dz * dz);
      const w = (1 - smoothstep(0, margin, d)) * strength;
      const k = this.idx(i, j);
      // Small residual undulation keeps flattened ground from looking artificial.
      const wobble = 0.25 * this.noise.noise(x / 18, z / 18);
      this.H[k] = lerp(this.H[k], target + wobble, w);
    }
  }

  carveRiver() {
    const R = this.region.river;
    if (!R) return;
    const pts = smoothPolyline(R.points, 2);
    this.riverPts = pts;
    // Monotonic surface height downstream.
    const surf = [];
    let prev = Infinity;
    for (const p of pts) {
      const h = this.getHeight(p[0], p[1]) - 1.4;
      prev = Math.min(prev, h);
      surf.push(prev);
    }
    // smooth
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 1; k < surf.length - 1; k++) surf[k] = Math.min(surf[k], (surf[k - 1] + surf[k] + surf[k + 1]) / 3);
    }
    this.riverSurfPts = surf;
    const reach = R.width / 2 + 28;
    const rc = Math.ceil(reach / this.cell);
    for (let k = 0; k < pts.length; k++) {
      const [px, pz] = pts[k];
      const gi = Math.round(this.toGrid(px)), gj = Math.round(this.toGrid(pz));
      for (let j = gj - rc; j <= gj + rc; j++) for (let i = gi - rc; i <= gi + rc; i++) {
        if (i < 0 || j < 0 || i >= this.N || j >= this.N) continue;
        const d = Math.hypot(this.toWorld(i) - px, this.toWorld(j) - pz);
        const id = this.idx(i, j);
        if (d < this.riverDist[id]) { this.riverDist[id] = d; this.riverSurf[id] = surf[k]; }
      }
    }
    const hw = R.width / 2;
    for (let id = 0; id < this.H.length; id++) {
      const d = this.riverDist[id];
      if (d > reach) continue;
      const s = this.riverSurf[id];
      const wx = this.toWorld(id % this.N), wz = this.toWorld(Math.floor(id / this.N));
      const wob = 1.6 * this.noise2.noise(wx / 11, wz / 11);
      const dd = d + wob;
      let target;
      if (dd < hw) {
        const t = dd / hw;
        target = s - R.depth * (1 - t * t) - 0.35;
      } else {
        target = s + 0.1 + (dd - hw) * 0.08;
      }
      const w = 1 - smoothstep(hw + 2, reach, dd);
      this.H[id] = Math.min(this.H[id], lerp(this.H[id], target, w));
      if (dd < hw + 1.5) this.H[id] = Math.min(this.H[id], target);
    }
  }

  carvePond(p) {
    const s = this.getHeight(p.x, p.z) - 0.6;
    p.surface = s;
    const reach = p.r + 14;
    const rc = Math.ceil(reach / this.cell);
    const gi = Math.round(this.toGrid(p.x)), gj = Math.round(this.toGrid(p.z));
    for (let j = gj - rc; j <= gj + rc; j++) for (let i = gi - rc; i <= gi + rc; i++) {
      const x = this.toWorld(i), z = this.toWorld(j);
      const d = Math.hypot(x - p.x, z - p.z) + 1.5 * this.noise.noise(x / 6, z / 6);
      const id = this.idx(i, j);
      let target = d < p.r ? s - p.depth * (1 - (d / p.r) ** 2) - 0.3 : s + 0.15 + (d - p.r) * 0.06;
      const w = 1 - smoothstep(p.r, reach, d);
      this.H[id] = lerp(this.H[id], Math.min(this.H[id], target), w);
      if (d < p.r) { this.riverDist[id] = Math.min(this.riverDist[id], 0); this.riverSurf[id] = s; }
    }
  }

  buildRoads() {
    this.roads = [];
    for (const r of this.region.roads) {
      const pts = smoothPolyline(r.pts, 1.5);
      const hs = pts.map((p) => this.getHeight(p[0], p[1]));
      // Moving average for gentle grades.
      const win = 10;
      const tgt = hs.map((_, k) => {
        let s = 0, n = 0;
        for (let q = Math.max(0, k - win); q <= Math.min(hs.length - 1, k + win); q++) { s += hs[q]; n++; }
        return s / n;
      });
      this.roads.push({ w: r.w, pts });
      const hw = r.w / 2;
      const reach = hw + 7;
      const rc = Math.ceil(reach / this.cell);
      const done = new Map();
      for (let k = 0; k < pts.length; k++) {
        const [px, pz] = pts[k];
        const gi = Math.round(this.toGrid(px)), gj = Math.round(this.toGrid(pz));
        for (let j = gj - rc; j <= gj + rc; j++) for (let i = gi - rc; i <= gi + rc; i++) {
          if (i < 0 || j < 0 || i >= this.N || j >= this.N) continue;
          const id = this.idx(i, j);
          if (this.region.river && this.riverDist[id] < this.region.river.width / 2 + 5) continue; // bridge span
          const d = Math.hypot(this.toWorld(i) - px, this.toWorld(j) - pz);
          const prev = done.get(id);
          if (prev && prev.d <= d) continue;
          done.set(id, { d, t: tgt[k] - 0.12 });
        }
      }
      for (const [id, v] of done) {
        const w = 1 - smoothstep(hw, reach, v.d);
        this.H[id] = lerp(this.H[id], v.t, w * 0.92);
      }
    }
  }

  buildMask() {
    const M = this.mask, S = this.maskRes, half = this.half;
    const setMax = (x, z, ch, v) => {
      const i = Math.floor(x + half), j = Math.floor(z + half);
      if (i < 0 || j < 0 || i >= S || j >= S) return;
      const k = (j * S + i) * 4 + ch;
      if (v > M[k]) M[k] = v;
    };
    // Roads (R)
    for (const r of this.roads) {
      const hw = r.w / 2;
      const rad = Math.ceil(hw + 2);
      for (let k = 0; k < r.pts.length; k++) {
        const [px, pz] = r.pts[k];
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          const x = Math.floor(px) + dx + 0.5, z = Math.floor(pz) + dz + 0.5;
          const d = Math.hypot(x - px, z - pz) + 0.8 * this.noise.noise(x / 3, z / 3);
          const v = 1 - smoothstep(hw - 0.6, hw + 1.2, d);
          if (v > 0) setMax(x, z, 0, v * 255);
        }
      }
    }
    // Fields (G)
    for (const f of this.region.fields) {
      const c = Math.cos(f.rot), s = Math.sin(f.rot);
      const R = Math.hypot(f.w, f.d) / 2 + 2;
      for (let z = Math.floor(f.z - R); z <= f.z + R; z++) for (let x = Math.floor(f.x - R); x <= f.x + R; x++) {
        const lx = (x + 0.5 - f.x) * c + (z + 0.5 - f.z) * s;
        const lz = -(x + 0.5 - f.x) * s + (z + 0.5 - f.z) * c;
        const ex = Math.abs(lx) - f.w / 2, ez = Math.abs(lz) - f.d / 2;
        const e = Math.max(ex, ez);
        const v = 1 - smoothstep(-1.2, 0.4, e);
        if (v > 0) setMax(x + 0.5, z + 0.5, 1, v * 255);
      }
    }
    // Settlement ground (B): packed earth near buildings.
    for (const st of this.region.settlements) {
      const hw = st.w / 2, hd = st.d / 2;
      const inner = st.type === 'walledTown' ? 1 : 0.8;
      for (let z = Math.floor(st.z - hd - 10); z <= st.z + hd + 10; z++) for (let x = Math.floor(st.x - hw - 10); x <= st.x + hw + 10; x++) {
        const dx = Math.max(0, Math.abs(x - st.x) - hw), dz = Math.max(0, Math.abs(z - st.z) - hd);
        const d = Math.hypot(dx, dz) + 6 * this.noise2.noise(x / 14, z / 14);
        // walled towns are packed earth right up to the walls; villages fade out at their edges
        let v = (1 - smoothstep(-6, 8, d - (st.type === 'walledTown' ? 12 : 0))) * inner;
        const patch = this.noise.noise(x / 9, z / 9) * 0.5 + 0.5;
        v *= st.type === 'walledTown' ? 0.95 : 0.35 + 0.65 * patch;
        if (v > 0) setMax(x + 0.5, z + 0.5, 2, v * 255);
        // the main cross streets of a walled town are worn into the ground like roads
        if (st.type === 'walledTown' && Math.abs(x - st.x) < hw && Math.abs(z - st.z) < hd) {
          const e = Math.min(Math.abs(x + 0.5 - st.x), Math.abs(z + 0.5 - st.z)) + 1.2 * this.noise.noise(x / 5, z / 5);
          const sv = 1 - smoothstep(4.5, 6.5, e);
          if (sv > 0) setMax(x + 0.5, z + 0.5, 0, sv * 200);
        }
      }
    }
    // Forest floor (A)
    for (const f of this.region.forests) {
      for (let z = Math.floor(f.z - f.r - 20); z <= f.z + f.r + 20; z += 1) for (let x = Math.floor(f.x - f.r - 20); x <= f.x + f.r + 20; x += 1) {
        const d = Math.hypot(x - f.x, z - f.z) + 30 * this.noise2.noise(x / 60, z / 60);
        const v = 1 - smoothstep(f.r * 0.6, f.r, d);
        if (v > 0) setMax(x + 0.5, z + 0.5, 3, v * 200);
      }
    }
  }

  getHeight(x, z) {
    const gx = clamp(this.toGrid(x), 0, this.N - 1.001);
    const gz = clamp(this.toGrid(z), 0, this.N - 1.001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const H = this.H, N = this.N;
    const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
  }

  getNormal(x, z, out = new THREE.Vector3()) {
    const e = 1.0;
    const hl = this.getHeight(x - e, z), hr = this.getHeight(x + e, z);
    const hd = this.getHeight(x, z - e), hu = this.getHeight(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  slope(x, z) {
    const n = this.getNormal(x, z, _n);
    return 1 - n.y;
  }

  // Returns water surface height if (x,z) is in water, otherwise null.
  waterAt(x, z) {
    const gi = Math.round(this.toGrid(x)), gj = Math.round(this.toGrid(z));
    if (gi < 0 || gj < 0 || gi >= this.N || gj >= this.N) return null;
    const id = this.idx(gi, gj);
    const s = this.riverSurf[id];
    if (s > -1e8 && this.getHeight(x, z) < s) return s;
    return null;
  }

  maskAt(x, z, ch) {
    const i = Math.floor(x + this.half), j = Math.floor(z + this.half);
    if (i < 0 || j < 0 || i >= this.maskRes || j >= this.maskRes) return 0;
    return this.mask[(j * this.maskRes + i) * 4 + ch] / 255;
  }

  isRoad(x, z) { return this.maskAt(x, z, 0) > 0.4; }

  heightTexture() {
    if (this._htex) return this._htex;
    const t = new THREE.DataTexture(this.H, this.N, this.N, THREE.RedFormat, THREE.FloatType);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    this._htex = t;
    return t;
  }

  maskTexture() {
    if (this._mtex) return this._mtex;
    const t = new THREE.DataTexture(this.mask, this.maskRes, this.maskRes, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    this._mtex = t;
    return t;
  }

  // Wetness near water (R channel) at grid resolution.
  wetTexture() {
    if (this._wtex) return this._wtex;
    const N = this.N;
    const data = new Uint8Array(N * N * 4);
    const hw = this.region.river ? this.region.river.width / 2 : 0;
    for (let id = 0; id < N * N; id++) {
      const d = this.riverDist[id];
      const s = this.riverSurf[id];
      let wet = 0;
      if (s > -1e8) {
        const above = this.H[id] - s;
        wet = 1 - smoothstep(0.1, 2.2, above);
        wet = Math.max(wet, 1 - smoothstep(hw, hw + 7, d));
      }
      data[id * 4] = wet * 255;
      data[id * 4 + 3] = 255;
    }
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    this._wtex = t;
    return t;
  }
}
const _n = new THREE.Vector3();
