// Tree/rock scattering with tiled instancing + LOD, and GPU-placed grass & crops.
import * as THREE from 'three';
import { Rng } from '../core/Rng.js';
import { buildTree, treeMaterials, allTreeUniforms } from './TreeFactory.js';
import { smoothPolyline, smoothstep } from '../core/MathUtil.js';
import { assets } from '../core/Assets.js';
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
    this.lodNear = world.engine.quality >= 3 ? 420 : 260;
  }

  canPlace(x, z, clearance = 2.5, allowSettlement = false, maxSlope = 0.45) {
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
    if (hf.slope(x, z) > maxSlope) return false;
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
    if (s > 0.8) this.world.colliders.addCircle(x, z, s * (kind === 'crag' ? 0.7 : 0.8), { kind: 'rock' });
  }

  // scanned scatter models (stumps, fallen trunks, dead trees): instanced with the rocks
  addProp(kind, x, z, s, collideR = 0.6) {
    const r = Math.random() * 6.28;
    this.rocks.push({ x, z, s, r, kind, tilt: 0, prop: true });
    if (kind === 'fallenPine') {
      const m = assets.model('scatter', kind);
      if (m) this.world.colliders.addBox(x, z, (m.size.x * s) / 2 * 0.85, 0.5 * s, -r, { kind: 'rock' });
    } else this.world.colliders.addCircle(x, z, collideR * s, { kind: 'rock' });
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
        // now and then a stump or a fallen trunk instead of a living tree (scanned models only)
        if (rng.next() < 0.06 && (assets.has('scatter', 'stump') || assets.has('scatter', 'fallenPine'))) {
          this.addProp(rng.next() < 0.5 ? 'stump' : 'fallenPine', px, pz, rng.range(0.85, 1.15));
          continue;
        }
        this.addTree(rng.pick(f.mix), px, pz, rng.range(0.8, 1.2));
      }
    }
    // Wooded hills: mountainsides carry pine and mixed forest in broad patches, thinning toward
    // the ridges, so the hills read as forested ranges rather than bare grass
    const q = this.world.engine.quality;
    const dens = q >= 3 ? 1 : q >= 2 ? 0.8 : q >= 1 ? 0.55 : 0.3;
    const base = R.baseHeight ?? 10;
    for (let z = -hf.half; z < hf.half; z += 8) for (let x = -hf.half; x < hf.half; x += 8) {
      const px = x + rng.range(0, 8), pz = z + rng.range(0, 8);
      const alt = hf.getHeight(px, pz) - base;
      if (alt < 16) continue;
      const patch = 0.5 + 0.5 * hf.noise2.fbm(px / 260, pz / 260, 3);
      const p = smoothstep(16, 34, alt) * smoothstep(0.3, 0.62, patch) * (1 - smoothstep(150, 210, alt)) * dens;
      if (rng.next() > p) continue;
      if (!this.canPlace(px, pz, 1.0, false, 0.72)) continue;
      const sp = alt > 60 || rng.next() < 0.55 ? 'pine' : rng.pick(['elm', 'elm', 'poplar']);
      this.addTree(sp, px, pz, rng.range(0.8, 1.25));
    }
    // Meadow trees and shrubs
    for (let z = -hf.half; z < hf.half; z += 26) for (let x = -hf.half; x < hf.half; x += 26) {
      const px = x + rng.range(0, 26), pz = z + rng.range(0, 26);
      const alt = hf.getHeight(px, pz);
      if (rng.next() < 0.16 * (q >= 2 ? 1.6 : 1) && this.canPlace(px, pz, 3)) {
        const sp = alt > 60 ? 'pine' : rng.pick(['elm', 'elm', 'poplar', 'jujube', 'poplar', 'pine']);
        this.addTree(sp, px, pz, rng.range(0.8, 1.15));
      }
    }
    for (let z = -hf.half; z < hf.half; z += 11) for (let x = -hf.half; x < hf.half; x += 11) {
      const px = x + rng.range(0, 11), pz = z + rng.range(0, 11);
      const forest = hf.maskAt(px, pz, 3);
      if (rng.next() < 0.07 + forest * 0.25 && this.canPlace(px, pz, 1.2)) this.addTree('shrub', px, pz, rng.range(0.7, 1.4));
    }
    // Groves: small stands of elm, jujube and poplar scattered over the plains
    const groves = q >= 2 ? 26 : q >= 1 ? 16 : 8;
    for (let k = 0; k < groves; k++) {
      const gx = rng.range(-hf.half * 0.9, hf.half * 0.9), gz = rng.range(-hf.half * 0.9, hf.half * 0.9);
      const sp = rng.pick(['elm', 'elm', 'jujube', 'poplar', 'mulberry']);
      const n = rng.int(6, 16);
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(0, 22);
        const px = gx + Math.cos(a) * r, pz = gz + Math.sin(a) * r;
        if (this.canPlace(px, pz, 2.2)) this.addTree(rng.next() < 0.8 ? sp : 'shrub', px, pz, rng.range(0.85, 1.2));
      }
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
    // River stones: boulders along the banks and a few breaking the shallows
    if (hf.riverPts) {
      const hw = R.river.width / 2;
      for (let k = 2; k < hf.riverPts.length - 2; k += 2) {
        if (rng.next() > 0.45) continue;
        const a = hf.riverPts[k - 1], b = hf.riverPts[k + 1];
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
        const side = rng.sign(), off = hw * rng.range(0.55, 1.15);
        const px = hf.riverPts[k][0] - (dz / L) * off * side, pz = hf.riverPts[k][1] + (dx / L) * off * side;
        if (hf.maskAt(px, pz, 0) > 0.05) continue; // keep fords and bridges clear
        this.addRock(px, pz, rng.next() < 0.3 ? rng.range(0.9, 1.6) : rng.range(0.3, 0.75), rng.int(0, 2));
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
    // Crags on steep high ground, and a few dead trees in the open
    if (assets.has('rocks', 'crag')) {
      for (let z = -hf.half; z < hf.half; z += 48) for (let x = -hf.half; x < hf.half; x += 48) {
        const px = x + rng.range(0, 48), pz = z + rng.range(0, 48);
        if (hf.slope(px, pz) < 0.32 || hf.getHeight(px, pz) < 30 || rng.next() > 0.3) continue;
        if (hf.maskAt(px, pz, 0) > 0.02 || hf.maskAt(px, pz, 1) > 0.02 || hf.maskAt(px, pz, 2) > 0.05 || hf.waterAt(px, pz) !== null) continue;
        this.addRock(px, pz, rng.range(5, 11), 'crag');
      }
    }
    if (assets.has('scatter', 'deadTree')) {
      for (let z = -hf.half; z < hf.half; z += 70) for (let x = -hf.half; x < hf.half; x += 70) {
        const px = x + rng.range(0, 70), pz = z + rng.range(0, 70);
        if (rng.next() < 0.22 && this.canPlace(px, pz, 3)) this.addProp('deadTree', px, pz, rng.range(0.7, 1.0), 0.25);
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
        // a tree model from the asset manifest: instance each of its material parts
        const parts = assets.parts('trees', sp, v);
        if (parts && parts.length) {
          for (const part of parts) windify(part.material);
          for (const lod of [0]) for (const part of parts) {
            const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
            list.forEach((t, i) => { p.set(t.x, this.hf.getHeight(t.x, t.z) - 0.05, t.z); q.setFromAxisAngle(up, t.r); s.setScalar(t.s); m.compose(p, q, s); im.setMatrixAt(i, m); });
            im.castShadow = lod === 0; im.receiveShadow = true; im.computeBoundingSphere();
            if (part.material.transparent || part.material.alphaTest > 0) im.userData.noAO = true;
            (lod === 0 ? tile.lod0 : tile.lod1).add(im);
          }
        }
        // distant tiles always use the cheap procedural impostor of the species
        for (const lod of parts && parts.length ? [1] : [0, 1]) {
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
    // close-up ground cover from scanned plants: dandelions and seed-headed grass tufts
    const ql = this.world.engine.quality;
    this.details = [];
    if (ql >= 1 && assets.has('scatter', 'grassTuft')) this.details.push(new DetailField(this.world, 'grassTuft', ql >= 3 ? 1800 : ql >= 2 ? 1200 : 600, ql >= 2 ? 48 : 34, 0.75, 1.3));
    if (ql >= 1 && assets.has('scatter', 'dandelion')) this.details.push(new DetailField(this.world, 'dandelion', ql >= 3 ? 700 : ql >= 2 ? 480 : 240, ql >= 2 ? 40 : 28, 0.8, 1.25));
    this.grass = new GrassField(this.world);
    this.crops = new CropField(this.world);
  }

  buildRocks() {
    const SMALL = ['small', 'smallB', 'smallC'].filter((k) => assets.has('rocks', k));
    const BIG = ['big', 'bigB', 'bigC', 'bigD'].filter((k) => assets.has('rocks', k));
    if (SMALL.length || BIG.length) return this.buildScannedRocks(SMALL.length ? SMALL : BIG, BIG.length ? BIG : SMALL);
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

  // Megascans-style rock and deadwood models, instanced per 200 m tile: full set near the camera,
  // only the large pieces (without shadows) further out.
  buildScannedRocks(SMALL, BIG) {
    const hf = this.hf;
    const tint = new THREE.Color(...(hf.region.rockTint || [1, 1, 1]).map((v) => Math.pow(v, 0.6)));
    const buckets = new Map();
    for (const r of this.rocks) {
      const h = Math.abs(Math.floor(r.x * 3.1 + r.z * 7.7));
      const section = r.prop ? 'scatter' : 'rocks';
      const key = r.prop ? r.kind : r.kind === 'crag' ? 'crag' : r.s < 0.9 ? SMALL[h % SMALL.length] : BIG[h % BIG.length];
      const v = h % Math.max(1, assets.variants(section, key));
      const model = assets.model(section, key, v);
      if (!model) continue;
      const ti = Math.floor((r.x + hf.half) / TILE), tj = Math.floor((r.z + hf.half) / TILE);
      const tk = `${ti},${tj}`;
      if (!buckets.has(tk)) buckets.set(tk, { ti, tj, groups: new Map() });
      const gk = `${section}|${key}|${v}`;
      const g = buckets.get(tk).groups;
      if (!g.has(gk)) g.set(gk, { section, key, v, model, list: [] });
      g.get(gk).list.push(r);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    this.rockTiles = [];
    for (const b of buckets.values()) {
      const tile = { near: new THREE.Group(), far: new THREE.Group(), cx: (b.ti + 0.5) * TILE - hf.half, cz: (b.tj + 0.5) * TILE - hf.half, lod: -1 };
      for (const grp of b.groups.values()) {
        const { model, list } = grp;
        const ext = Math.max(model.size.x, model.size.z, 0.01);
        const parts = assets.parts(grp.section, grp.key, grp.v);
        if (!parts?.length) continue;
        const mats = list.map((r) => {
          // rocks: r.s is a radius in metres; scatter props: r.s is a plain scale factor
          const k = r.prop ? r.s * (model.entry.k || 1) : (r.s * 2 * (r.kind === 'crag' ? 1 : 1.25)) / ext;
          const rad = (ext * k) / 2;
          // sink into the lowest ground under the footprint so slopes never show a gap
          let y = hf.getHeight(r.x, r.z);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) y = Math.min(y, hf.getHeight(r.x + dx * rad * 0.7, r.z + dz * rad * 0.7));
          p.set(r.x, y - model.size.y * k * (r.prop ? 0.02 : 0.1), r.z);
          q.setFromAxisAngle(up, r.r);
          sc.setScalar(k);
          return m.compose(p, q, sc).clone();
        });
        const isBig = grp.section === 'rocks' && grp.key !== 'small' && !SMALL.includes(grp.key) || grp.key === 'crag' || grp.key === 'deadTree';
        for (const far of isBig ? [false, true] : [false]) for (const part of parts) {
          const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
          list.forEach((r, i) => {
            im.setMatrixAt(i, mats[i]);
            const t = 0.9 + ((Math.abs(Math.floor(r.x * 13 + r.z * 5)) % 100) / 100) * 0.2;
            im.setColorAt(i, col.copy(grp.section === 'rocks' ? tint : col.setRGB(1, 1, 1)).multiplyScalar(t));
          });
          im.castShadow = !far; im.receiveShadow = true; im.computeBoundingSphere();
          (far ? tile.far : tile.near).add(im);
        }
      }
      this.group.add(tile.near, tile.far);
      tile.far.visible = false;
      this.rockTiles.push(tile);
    }
  }

  update(dt, camPos, time) {
    if (this.rockTiles) for (const t of this.rockTiles) {
      const d = Math.hypot(camPos.x - t.cx, camPos.z - t.cz);
      const lod = d < this.lodNear * 0.8 ? 0 : d < 1600 ? 1 : 2;
      if (lod !== t.lod) { t.lod = lod; t.near.visible = lod === 0; t.far.visible = lod === 1; }
    }
    for (const u of allTreeUniforms()) u.uTime.value = time;
    for (const tile of this.tiles.values()) {
      const d = Math.hypot(camPos.x - tile.cx, camPos.z - tile.cz);
      const lod = d < this.lodNear ? 0 : d < 1400 ? 1 : 2;
      if (lod !== tile.lod) {
        tile.lod = lod;
        tile.lod0.visible = lod === 0;
        tile.lod1.visible = lod === 1;
      }
    }
    if (this.grass) this.grass.update(camPos, time);
    for (const d of this.details || []) d.update(camPos);
    WIND.uTime.value = time;
    if (this.crops) this.crops.update(camPos, time);
  }
}

// ---------------------------------------------------------------------------
// Wind sway for scanned tree models (their materials come from the asset loader).
const WIND = { uTime: { value: 0 } };
function windify(mat) {
  if (!mat || mat.userData.windy) return;
  mat.userData.windy = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    {
      vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float h = max(0.0, transformed.y);
      float ph = ip.x * 0.13 + ip.z * 0.17;
      float sway = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
      transformed.x += sway * h * h * 0.0009;
      transformed.z += sway * 0.6 * h * h * 0.0009;
      ${mat.alphaTest > 0 || mat.transparent ? 'transformed += normal * sin(uTime * 4.0 + position.x * 3.0 + ph) * 0.004 * h;' : ''}
    }`);
  };
  mat.customProgramCacheKey = () => 'windy' + mat.uuid;
}

// Scanned ground-cover plants scattered around the camera on a world-aligned grid of cells (so they
// stay put as you move), skipping roads, fields, towns, water and steep ground; re-laid every few metres.
class DetailField {
  constructor(world, key, count, radius, minS, maxS) {
    this.world = world; this.hf = world.hf; this.radius = radius; this.key = key;
    this.cell = Math.sqrt((Math.PI * radius * radius) / count);
    this.minS = minS; this.maxS = maxS;
    const parts = assets.parts('scatter', key) || [];
    this.meshes = parts.map((p) => {
      const im = new THREE.InstancedMesh(p.geometry, p.material, count);
      im.count = 0; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false;
      im.userData.noAO = true;
      world.scene.add(im);
      return im;
    });
    this.max = count; this.last = null;
  }
  update(cam) {
    if (!this.meshes.length) return;
    if (this.last && Math.hypot(cam.x - this.last.x, cam.z - this.last.z) < this.cell * 3) return;
    this.last = { x: cam.x, z: cam.z };
    const hf = this.hf, c = this.cell, r = this.radius;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const h = (a, b, k) => { const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
    let n = 0;
    for (let gz = Math.floor((cam.z - r) / c); gz <= (cam.z + r) / c && n < this.max; gz++) {
      for (let gx = Math.floor((cam.x - r) / c); gx <= (cam.x + r) / c && n < this.max; gx++) {
        const x = (gx + h(gx, gz, 1)) * c, z = (gz + h(gx, gz, 2)) * c;
        if (Math.hypot(x - cam.x, z - cam.z) > r) continue;
        // patchy: plants come in drifts
        const patch = 0.5 + 0.5 * hf.noise2.noise(x / 18 + (this.key.length * 3.1), z / 18);
        if (h(gx, gz, 3) > patch * 1.1) continue;
        if (Math.abs(x) > hf.half - 2 || Math.abs(z) > hf.half - 2) continue;
        if (hf.maskAt(x, z, 0) > 0.1 || hf.maskAt(x, z, 1) > 0.15 || hf.maskAt(x, z, 2) > 0.15 || hf.waterAt(x, z) !== null || hf.slope(x, z) > 0.5) continue;
        p.set(x, hf.getHeight(x, z) - 0.02, z);
        q.setFromAxisAngle(up, h(gx, gz, 4) * 6.283);
        s.setScalar(this.minS + (this.maxS - this.minS) * h(gx, gz, 5));
        m.compose(p, q, s);
        for (const im of this.meshes) im.setMatrixAt(n, m);
        n++;
      }
    }
    for (const im of this.meshes) { im.count = n; im.instanceMatrix.needsUpdate = true; }
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
    this.spacing = opts.spacing ?? (q >= 3 ? 0.3 : q >= 2 ? 0.34 : q === 1 ? 0.42 : 0.6);
    this.radius = opts.radius ?? (q >= 3 ? 64 : q >= 2 ? 46 : q === 1 ? 34 : 24);
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
varying float vT; varying vec3 vGCol; varying float vFlower; varying vec3 vFlowerCol;
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
  float dens = 1.0 - m.r * 1.4 - m.g * 1.2 - smoothstep(0.12, 0.4, m.b) * 1.3 - m.a * 0.45 - smoothstep(0.35, 0.7, wet) - smoothstep(0.45, 0.9, slope);
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
  // wildflowers in drifts: a few blades in a patch carry white, yellow or violet heads
  float fl = smoothstep(0.62, 0.8, gvn(wxz * 0.045 + 11.0)) * step(0.82, gh21(cellId + 3.7));
  float hue = gh21(cellId + 9.1);
  vFlower = fl * (1.0 - m.b) * (1.0 - m.r);
  vFlowerCol = hue < 0.4 ? vec3(0.95, 0.92, 0.8) : hue < 0.75 ? vec3(0.95, 0.78, 0.2) : vec3(0.55, 0.38, 0.8);
`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vT; varying vec3 vGCol; varying float vFlower; varying vec3 vFlowerCol;')
        .replace('#include <map_fragment>', `
  vec3 gc = vGCol * mix(0.5, 1.25, vT) + vec3(0.03, 0.04, 0.0) * vT * vT;
  gc = mix(gc, vFlowerCol * 0.8, vFlower * smoothstep(0.78, 0.95, vT));
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
    this.radius = q >= 3 ? 80 : q >= 2 ? 60 : q === 1 ? 45 : 30;
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
