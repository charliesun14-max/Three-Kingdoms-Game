// Geometry kit for Han-dynasty architecture. Everything is batched per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { materials } from './Materials.js';
import { Rng } from '../core/Rng.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

// Box with world-scaled UVs (so textures keep physical size on any box).
function boxGeo(w, h, d, uvScale = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    if (nx > 0.5) uv.setXY(i, z / uvScale, y / uvScale);
    else if (ny > 0.5) uv.setXY(i, x / uvScale, z / uvScale);
    else uv.setXY(i, x / uvScale, y / uvScale);
  }
  return g;
}

export class Batch {
  constructor() {
    this.parts = new Map();
    this.origin = new THREE.Matrix4();
    this.stack = [];
  }
  // Set current building frame
  frame(x, y, z, rot = 0) {
    _q.setFromAxisAngle(UP, rot);
    this.origin.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1));
    return this;
  }
  push() { this.stack.push(this.origin.clone()); return this; }
  pop() { this.origin.copy(this.stack.pop()); return this; }
  // Nest a sub-frame relative to current frame.
  sub(x, y, z, rot = 0) {
    _q.setFromAxisAngle(UP, rot);
    _m.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1));
    this.origin.multiply(_m);
    return this;
  }
  add(matKey, geo, color = null, local = null) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (local) g.applyMatrix4(local);
    g.applyMatrix4(this.origin);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = color ? new THREE.Color(color) : new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!this.parts.has(matKey)) this.parts.set(matKey, []);
    this.parts.get(matKey).push(g);
    return g;
  }
  // Box: (x,z) centre, y = base, extends upward h.
  box(mat, x, y, z, w, h, d, o = {}) {
    const g = boxGeo(w, h, d, o.uv ?? 2);
    _q.setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0));
    _m.compose(_v.set(x, y + h / 2, z), _q, _s.set(1, 1, 1));
    return this.add(mat, g, o.color, _m.clone());
  }
  cyl(mat, x, y, z, r, h, o = {}) {
    const g = new THREE.CylinderGeometry(o.r2 ?? r, r, h, o.seg ?? 10, 1, o.open ?? false);
    _q.setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0));
    _m.compose(_v.set(x, y + h / 2, z), _q, _s.set(1, 1, 1));
    return this.add(mat, g, o.color, _m.clone());
  }
  sphere(mat, x, y, z, r, o = {}) {
    const g = new THREE.SphereGeometry(r, o.seg ?? 10, o.seg2 ?? 8);
    _m.compose(_v.set(x, y, z), _q.identity(), _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
    return this.add(mat, g, o.color, _m.clone());
  }
  // Beam between two local points with square cross-section t.
  beam(mat, a, b, t = 0.2, o = {}) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const g = boxGeo(t, len, o.t2 ?? t, 1);
    _q.setFromUnitVectors(UP, dir.clone().normalize());
    _m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
    return this.add(mat, g, o.color, _m.clone());
  }
  quad(mat, pts, uvs, color) {
    const g = new THREE.BufferGeometry();
    const p = [pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]].flatMap((v) => [v.x, v.y, v.z]);
    const u = uvs ? [uvs[0], uvs[1], uvs[2], uvs[0], uvs[2], uvs[3]].flat() : [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    g.computeVertexNormals();
    return this.add(mat, g, color);
  }
  tri(mat, a, b, c, color) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c].flatMap((v) => [v.x, v.y, v.z]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([a.x / 2, a.y / 2, b.x / 2, b.y / 2, c.x / 2, c.y / 2], 2));
    g.computeVertexNormals();
    return this.add(mat, g, color);
  }

  /**
   * Chinese roof. Local origin at eave level centre. Types: 'hip' (廡殿), 'gable' (懸山), 'pyramid' (攢尖).
   * Concave profile and upturned corners give the characteristic silhouette.
   */
  roof(mat, x, y, z, w, d, rise, o = {}) {
    const type = o.type || 'hip';
    const oh = o.overhang ?? 0.8;
    const ow = w / 2 + oh, od = d / 2 + oh;
    const curve = o.curve ?? 1.55;
    const lift = o.lift ?? (mat === 'thatch' ? 0 : 0.35);
    let rl = type === 'gable' ? ow : type === 'pyramid' ? 0 : Math.max(0.3, ow - od);
    const R1 = new THREE.Vector3(-rl, rise, 0), R2 = new THREE.Vector3(rl, rise, 0);
    const sides = [
      [new THREE.Vector3(-ow, 0, od), new THREE.Vector3(ow, 0, od), R1, R2],
      [new THREE.Vector3(ow, 0, -od), new THREE.Vector3(-ow, 0, -od), R2, R1],
    ];
    if (type !== 'gable') {
      sides.push([new THREE.Vector3(ow, 0, od), new THREE.Vector3(ow, 0, -od), R2, R2]);
      sides.push([new THREE.Vector3(-ow, 0, -od), new THREE.Vector3(-ow, 0, od), R1, R1]);
    }
    const nu = o.nu ?? 10, nv = o.nv ?? 6;
    const tileRep = mat === 'thatch' ? 3 : 2.6;
    const thick = mat === 'thatch' ? 0.28 : 0.14;
    for (const [eA, eB, tA, tB] of sides) {
      const pos = [], uv = [], idx = [];
      const eLen = eA.distanceTo(eB);
      const sLen = Math.hypot(od, rise);
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        for (let i = 0; i <= nu; i++) {
          const u = i / nu;
          const E = new THREE.Vector3().lerpVectors(eA, eB, u);
          const T = new THREE.Vector3().lerpVectors(tA, tB, u);
          const P = new THREE.Vector3().lerpVectors(E, T, v);
          P.y = rise * Math.pow(v, curve);
          const cornerT = Math.pow(Math.abs(2 * u - 1), 5) * Math.pow(1 - v, 2);
          if (type !== 'gable' || true) {
            P.y += lift * cornerT;
            // pull corners outward along the eave direction
            const along = new THREE.Vector3().subVectors(eB, eA).normalize();
            P.addScaledVector(along, (u - 0.5) * 2 * lift * 0.6 * cornerT);
          }
          pos.push(P.x, P.y, P.z);
          uv.push((u * eLen) / tileRep, (v * sLen) / tileRep);
        }
      }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, e = c + 1;
        idx.push(a, b, c, b, e, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const under = g.clone();
      _m.compose(_v.set(x, y + thick, z), _q.setFromAxisAngle(UP, o.rot || 0), _s.set(1, 1, 1));
      this.add(mat, g, o.color, _m.clone());
      // Underside/fascia: offset copy slightly lower, darker
      _m.compose(_v.set(x, y, z), _q.setFromAxisAngle(UP, o.rot || 0), _s.set(1, 1, 1));
      this.add(o.underMat || 'darkwood', under, null, _m.clone());
    }
    // ridges
    if (mat !== 'thatch' || o.ridge) {
      const rm = o.ridgeMat || mat;
      const lr = _m.compose(_v.set(x, y, z), _q.setFromAxisAngle(UP, o.rot || 0), _s.set(1, 1, 1)).clone();
      const addBeam = (a, b, t) => {
        const dir = new THREE.Vector3().subVectors(b, a);
        const len = dir.length();
        const g = boxGeo(t, len, t * 1.2, 1);
        const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
        const mm = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
        this.add(rm, g, 0x5a5e66, lr.clone().multiply(mm));
      };
      const ry = rise + thick + 0.12;
      if (rl > 0.01) addBeam(new THREE.Vector3(-rl - 0.25, ry, 0), new THREE.Vector3(rl + 0.25, ry, 0), 0.34);
      if (type === 'gable') {
        // raised ridge ends
        for (const s of [-1, 1]) addBeam(new THREE.Vector3(s * (rl + 0.1), ry, 0), new THREE.Vector3(s * (rl + 0.45), ry + 0.45, 0), 0.24);
      } else {
        const corners = [[ow, od], [ow, -od], [-ow, od], [-ow, -od]];
        for (const [cx, cz] of corners) {
          const top = new THREE.Vector3(Math.sign(cx) * rl, ry, 0);
          const bot = new THREE.Vector3(cx * 0.98, lift + thick + 0.1, cz * 0.98);
          addBeam(top, bot, 0.22);
        }
        if (type === 'pyramid') {
          const fin = new THREE.CylinderGeometry(0.05, 0.22, 0.9, 8);
          this.add('bronze', fin, null, lr.clone().multiply(new THREE.Matrix4().makeTranslation(0, ry + 0.45, 0)));
        }
      }
    } else {
      // thatch ridge roll
      const lr = _m.compose(_v.set(x, y + rise + 0.1, z), _q.setFromAxisAngle(UP, o.rot || 0), _s.set(1, 1, 1)).clone();
      const g = new THREE.CylinderGeometry(0.28, 0.28, rl * 2 + 0.3, 8);
      g.rotateZ(Math.PI / 2);
      this.add('thatch', g, 0xb8a070, lr);
    }
  }

  // Triangular gable end wall (on the x = ±hw faces) under a gable roof.
  gableEnds(mat, x, y, z, w, d, rise, rot = 0, thick = 0.3) {
    for (const s of [-1, 1]) {
      const g = new THREE.BufferGeometry();
      const hw = s * w / 2, hd = d / 2 + 0.02;
      const P = [
        [hw, 0, -hd], [hw, 0, hd], [hw, rise * 0.98, 0],
      ];
      const v = [...P[0], ...P[1], ...P[2]];
      if (s > 0) v.splice(0, 9, ...P[1], ...P[0], ...P[2]);
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, d / 2, 0, d / 4, rise / 2], 2));
      g.computeVertexNormals();
      const g2 = g.clone();
      _m.compose(_v.set(x, y, z), _q.setFromAxisAngle(UP, rot), _s.set(1, 1, 1));
      this.add(mat, g, null, _m.clone());
      _m.compose(_v.set(x - s * thick, y, z), _q.setFromAxisAngle(UP, rot), _s.set(1, 1, 1));
      // inner face (flip)
      const p = g2.attributes.position.array;
      for (let i = 0; i < 3; i++) { const t = p[i]; p[i] = p[3 + i]; p[3 + i] = t; }
      g2.computeVertexNormals();
      this.add(mat, g2, null, _m.clone());
    }
  }

  build(parent, { castShadow = true } = {}) {
    const M = materials();
    const out = [];
    for (const [k, list] of this.parts) {
      const g = mergeGeometries(list, false);
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, M[k] || M.vcol);
      mesh.castShadow = castShadow && k !== 'fire';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      out.push(mesh);
    }
    this.parts.clear();
    return out;
  }
}

// ---------------------------------------------------------------------------
// Building archetypes. All take a Batch with frame() already set to the site.

// Peasant farmhouse: mud walls, thatched gable roof, south-facing door.
export function farmhouse(B, o = {}) {
  const w = o.w ?? 7, d = o.d ?? 4.4, h = o.h ?? 2.5;
  const wall = o.wall ?? 'mudbrick';
  B.box('rammed', 0, -0.4, 0, w + 0.5, 0.55, d + 0.5, { uv: 2 });
  B.box(wall, 0, 0, 0, w, h, d);
  B.gableEnds(wall, 0, h, 0, w, d, 1.7);
  B.roof('thatch', 0, h - 0.05, 0, w, d, 1.75, { type: 'gable', overhang: 0.65, curve: 1.1 });
  // door + frame
  B.box('door', -w * 0.18, 0, d / 2 + 0.02, 1.05, 1.9, 0.08, { uv: 2 });
  B.box('darkwood', -w * 0.18, 1.9, d / 2 + 0.05, 1.35, 0.16, 0.12);
  B.box('darkwood', -w * 0.18 - 0.6, 0, d / 2 + 0.05, 0.14, 2.0, 0.12);
  B.box('darkwood', -w * 0.18 + 0.6, 0, d / 2 + 0.05, 0.14, 2.0, 0.12);
  // window
  B.box('lattice', w * 0.2, 1.05, d / 2 + 0.03, 1.0, 0.75, 0.06, { uv: 1 });
  B.box('darkwood', w * 0.2, 0.98, d / 2 + 0.06, 1.2, 0.09, 0.1);
  // back window
  B.box('lattice', 0, 1.2, -d / 2 - 0.03, 0.7, 0.5, 0.06, { uv: 0.7 });
  // eave poles
  if (o.porch) {
    for (const px of [-w / 2 + 0.3, w / 2 - 0.3]) B.cyl('darkwood', px, 0, d / 2 + 0.55, 0.09, h, { seg: 6 });
  }
}

// Tiled timber-frame house on a platform.
export function tiledHouse(B, o = {}) {
  const w = o.w ?? 9, d = o.d ?? 5.5, h = o.h ?? 3.0;
  const plat = o.platform ?? 0.45;
  B.box('stone', 0, -0.3, 0, w + 1.4, plat + 0.3, d + 1.4, { uv: 1.5 });
  const y0 = plat;
  B.box(o.wall ?? 'plaster', 0, y0, 0, w - 0.1, h, d - 0.1);
  // columns
  const col = o.lacquer ? 'lacquer' : 'darkwood';
  const nb = Math.max(2, Math.round(w / 3));
  for (let i = 0; i <= nb; i++) {
    const x = -w / 2 + (w * i) / nb;
    for (const zz of [d / 2, -d / 2]) B.cyl(col, x, y0, zz, 0.16, h, { seg: 8 });
  }
  // beams
  B.box('darkwood', 0, y0 + h - 0.3, d / 2 + 0.02, w + 0.3, 0.3, 0.25);
  B.box('darkwood', 0, y0 + h - 0.3, -d / 2 - 0.02, w + 0.3, 0.3, 0.25);
  B.box('darkwood', w / 2 + 0.02, y0 + h - 0.3, 0, 0.25, 0.3, d + 0.3);
  B.box('darkwood', -w / 2 - 0.02, y0 + h - 0.3, 0, 0.25, 0.3, d + 0.3);
  // bracket blocks (dougong suggestion)
  for (let i = 0; i <= nb; i++) {
    const x = -w / 2 + (w * i) / nb;
    B.box('darkwood', x, y0 + h, d / 2 + 0.2, 0.5, 0.22, 0.5);
    B.box('darkwood', x, y0 + h, -d / 2 - 0.2, 0.5, 0.22, 0.5);
  }
  // door(s) and windows between columns
  const doorX = o.doorX ?? 0;
  B.box('door', doorX, y0, d / 2 + 0.05, 1.5, 2.3, 0.08);
  for (let i = 0; i < nb; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / nb;
    if (Math.abs(x - doorX) < 1.2) continue;
    B.box('lattice', x, y0 + 0.9, d / 2 + 0.04, Math.min(1.8, w / nb - 0.6), 1.2, 0.06, { uv: 1 });
  }
  if (o.gable) {
    B.gableEnds(o.wall ?? 'plaster', 0, y0 + h + 0.22, 0, w, d, (o.rise ?? 1.9) * 0.9);
    B.roof('roofTile', 0, y0 + h + 0.2, 0, w, d, o.rise ?? 1.9, { type: 'gable', overhang: 0.9, lift: 0.18 });
  } else {
    B.roof('roofTile', 0, y0 + h + 0.2, 0, w, d, o.rise ?? 2.1, { type: 'hip', overhang: 1.1, lift: 0.4 });
  }
  // steps
  B.box('stone', doorX, -0.3, d / 2 + 0.95, 2.2, plat + 0.1, 0.5, { uv: 1 });
  B.box('stone', doorX, -0.3, d / 2 + 1.4, 2.2, plat * 0.5 + 0.05, 0.45, { uv: 1 });
}

// Two-storey building (tavern, gate towers, estates).
export function twoStorey(B, o = {}) {
  const w = o.w ?? 9, d = o.d ?? 6;
  tiledHouseBody(B, w, d, 0.4, 3.0, o);
  // balcony floor + upper storey
  const y1 = 0.4 + 3.0 + 0.25;
  B.roof('roofTile', 0, y1 - 0.25, 0, w, d, 0.7, { type: 'hip', overhang: 0.9, lift: 0.25, nv: 3 });
  const w2 = w - 1.2, d2 = d - 1.2;
  B.box(o.wall ?? 'plaster', 0, y1 + 0.2, 0, w2, 2.6, d2);
  const nb = Math.max(2, Math.round(w2 / 2.5));
  for (let i = 0; i < nb; i++) {
    const x = -w2 / 2 + (w2 * (i + 0.5)) / nb;
    B.box('lattice', x, y1 + 0.9, d2 / 2 + 0.03, w2 / nb - 0.5, 1.2, 0.06, { uv: 1 });
  }
  for (let i = 0; i <= nb; i++) {
    const x = -w2 / 2 + (w2 * i) / nb;
    B.cyl(o.lacquer ? 'lacquer' : 'darkwood', x, y1 + 0.2, d2 / 2, 0.13, 2.6, { seg: 6 });
  }
  // railing
  B.box('darkwood', 0, y1 + 0.2, d2 / 2 + 0.55, w2 + 0.6, 0.12, 0.1);
  B.box('darkwood', 0, y1 + 0.85, d2 / 2 + 0.55, w2 + 0.6, 0.1, 0.1);
  B.roof('roofTile', 0, y1 + 2.8, 0, w2, d2, 1.9, { type: o.upperType || 'hip', overhang: 1.1, lift: 0.45 });
}

function tiledHouseBody(B, w, d, plat, h, o) {
  B.box('stone', 0, -0.3, 0, w + 1.2, plat + 0.3, d + 1.2, { uv: 1.5 });
  B.box(o.wall ?? 'plaster', 0, plat, 0, w - 0.1, h, d - 0.1);
  const col = o.lacquer ? 'lacquer' : 'darkwood';
  const nb = Math.max(2, Math.round(w / 3));
  for (let i = 0; i <= nb; i++) {
    const x = -w / 2 + (w * i) / nb;
    for (const zz of [d / 2, -d / 2]) B.cyl(col, x, plat, zz, 0.17, h + 0.3, { seg: 8 });
  }
  B.box('darkwood', 0, plat + h - 0.25, d / 2 + 0.02, w + 0.3, 0.3, 0.25);
  B.box('door', o.doorX ?? 0, plat, d / 2 + 0.05, 1.6, 2.4, 0.08);
  for (let i = 0; i < nb; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / nb;
    if (Math.abs(x - (o.doorX ?? 0)) < 1.3) continue;
    B.box('lattice', x, plat + 0.9, d / 2 + 0.04, Math.min(1.8, w / nb - 0.6), 1.3, 0.06, { uv: 1 });
  }
  B.box('stone', o.doorX ?? 0, -0.3, d / 2 + 0.85, 2.4, plat + 0.1, 0.55, { uv: 1 });
}

// Han multi-storey watchtower (望樓), as seen in Han funerary pottery models.
export function watchtower(B, o = {}) {
  const levels = o.levels ?? 3;
  let s = o.base ?? 4.2;
  let y = 0;
  B.box('stone', 0, -0.5, 0, s + 1.2, 0.8, s + 1.2, { uv: 1.5 });
  for (let l = 0; l < levels; l++) {
    const h = l === 0 ? 3.4 : 2.8;
    B.box(l === 0 ? 'rammed' : 'plaster', 0, y + 0.3, 0, s, h, s);
    for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) B.cyl('darkwood', cx * s / 2, y + 0.3, cz * s / 2, 0.15, h, { seg: 6 });
    if (l === 0) B.box('door', 0, y + 0.3, s / 2 + 0.03, 1.3, 2.2, 0.08);
    else for (const f of [0, 1, 2, 3]) {
      const a = (f * Math.PI) / 2;
      B.push().sub(0, 0, 0, a);
      B.box('lattice', 0, y + 1.1, s / 2 + 0.03, s * 0.5, 1.0, 0.06, { uv: 1 });
      B.pop();
    }
    y += h + 0.3;
    if (l < levels - 1) {
      // balcony with eave
      B.roof('roofTile', 0, y - 0.1, 0, s, s, 0.8, { type: 'hip', overhang: 0.9, lift: 0.3, nv: 3 });
      B.box('darkwood', 0, y + 0.2, 0, s + 0.9, 0.2, s + 0.9);
      s *= 0.84;
    }
  }
  B.roof('roofTile', 0, y, 0, s, s, 2.0, { type: 'pyramid', overhang: 1.1, lift: 0.5 });
  return y;
}

// City wall segment from a to b (local coords), rammed earth with crenellations.
export function wallSegment(B, ax, az, bx, bz, o = {}) {
  const h = o.h ?? 7.5, t = o.t ?? 5.5;
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(-(bz - az), bx - ax);
  B.push().sub((ax + bx) / 2, 0, (az + bz) / 2, rot);
  // Slight batter: bottom wider
  B.box('rammed', 0, -1.5, 0, len, h * 0.55 + 1.5, t, { uv: 3 });
  B.box('rammed', 0, h * 0.55, 0, len, h * 0.45, t - 0.8, { uv: 3 });
  // wall-walk parapet with crenels on the outer (+z local) side
  const n = Math.floor(len / 2.2);
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * (len / n);
    B.box('rammed', x, h, (t - 0.8) / 2 - 0.35, len / n * 0.55, 1.3, 0.6, { uv: 2 });
  }
  B.box('rammed', 0, h, -(t - 0.8) / 2 + 0.25, len, 0.9, 0.45, { uv: 2 });
  // tile coping on parapets
  B.box('roofTile', 0, h + 0.9, -(t - 0.8) / 2 + 0.25, len, 0.12, 0.7, { uv: 2 });
  B.pop();
  return { cx: (ax + bx) / 2, cz: (az + bz) / 2, len, rot, t };
}

// Gatehouse spanning a wall: passage + multi-storey tower (城樓)
export function gateTower(B, o = {}) {
  const w = o.w ?? 18, d = o.d ?? 8, h = o.h ?? 7.5, gw = o.gateW ?? 5;
  // two piers
  const pw = (w - gw) / 2;
  for (const s of [-1, 1]) B.box('rammed', s * (gw / 2 + pw / 2), -1.5, 0, pw, h + 1.5, d, { uv: 3 });
  // lintel beam over the gate
  B.box('rammed', 0, h - 1.4, 0, gw, 1.4, d, { uv: 3 });
  B.box('darkwood', 0, h - 1.6, d / 2 + 0.05, gw + 0.6, 0.35, 0.3);
  B.box('darkwood', 0, h - 1.6, -d / 2 - 0.05, gw + 0.6, 0.35, 0.3);
  // open gate doors
  for (const s of [-1, 1]) {
    B.push().sub(s * gw / 2, 0, -d / 2 + 0.5, s * -1.25);
    B.box('door', -s * 1.25, 0, 0, 2.5, h - 1.8, 0.2, { uv: 4 });
    B.pop();
  }
  // tower building on top
  B.push().sub(0, h, 0, 0);
  const tw = w - 2, td = d - 1.5;
  B.box('darkwood', 0, 0, 0, tw + 1, 0.3, td + 1);
  B.box('plaster', 0, 0.3, 0, tw, 3.2, td);
  const nb = 5;
  for (let i = 0; i <= nb; i++) {
    const x = -tw / 2 + (tw * i) / nb;
    for (const zz of [td / 2, -td / 2]) B.cyl('lacquer', x, 0.3, zz, 0.18, 3.2, { seg: 8 });
  }
  for (let i = 0; i < nb; i++) {
    const x = -tw / 2 + (tw * (i + 0.5)) / nb;
    B.box('lattice', x, 1.0, td / 2 + 0.04, tw / nb - 0.5, 1.5, 0.06, { uv: 1 });
    B.box('lattice', x, 1.0, -td / 2 - 0.04, tw / nb - 0.5, 1.5, 0.06, { uv: 1 });
  }
  B.roof('roofTile', 0, 3.6, 0, tw, td, 2.6, { type: 'hip', overhang: 1.5, lift: 0.6 });
  B.pop();
}

export function cornerTower(B, o = {}) {
  const s = o.s ?? 8, h = o.h ?? 7.5;
  B.box('rammed', 0, -1.5, 0, s, h + 1.5, s, { uv: 3 });
  B.push().sub(0, h, 0, 0);
  B.box('plaster', 0, 0, 0, s - 2.5, 2.6, s - 2.5);
  for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) B.cyl('lacquer', cx * (s - 2.5) / 2, 0, cz * (s - 2.5) / 2, 0.15, 2.6);
  B.roof('roofTile', 0, 2.8, 0, s - 2.5, s - 2.5, 2.0, { type: 'pyramid', overhang: 1.1, lift: 0.5 });
  B.pop();
}

// Low courtyard/compound wall (rammed earth with tile coping).
export function lowWall(B, ax, az, bx, bz, o = {}) {
  const h = o.h ?? 2.2, t = o.t ?? 0.55;
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.1) return;
  const rot = Math.atan2(-(bz - az), bx - ax);
  B.push().sub((ax + bx) / 2, 0, (az + bz) / 2, rot);
  B.box(o.mat ?? 'rammed', 0, -0.3, 0, len, h + 0.3, t, { uv: 2 });
  if (o.coping !== false) {
    const g = o.thatchTop ? 'thatch' : 'roofTile';
    B.box(g, 0, h, 0, len + 0.2, 0.14, t + 0.5, { uv: 2 });
    B.box(g, 0, h + 0.14, 0, len + 0.2, 0.12, 0.2, { uv: 2 });
  }
  B.pop();
}

export function fence(B, ax, az, bx, bz, o = {}) {
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(-(bz - az), bx - ax);
  const h = o.h ?? 1.2;
  B.push().sub((ax + bx) / 2, 0, (az + bz) / 2, rot);
  const n = Math.max(2, Math.round(len / 1.6));
  for (let i = 0; i <= n; i++) B.cyl('wood', -len / 2 + (len * i) / n, -0.2, 0, 0.06, h + 0.2, { seg: 5 });
  B.box('wood', 0, h * 0.45, 0, len, 0.07, 0.06);
  B.box('wood', 0, h * 0.85, 0, len, 0.07, 0.06);
  if (o.wattle) B.box('straw', 0, 0.1, 0, len, h * 0.8, 0.08, { uv: 1 });
  B.pop();
}

export function palisade(B, ax, az, bx, bz, o = {}) {
  const len = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(-(bz - az), bx - ax);
  const h = o.h ?? 3.2;
  const rng = new Rng(Math.floor(ax * 13 + az * 7));
  B.push().sub((ax + bx) / 2, 0, (az + bz) / 2, rot);
  const n = Math.round(len / 0.34);
  for (let i = 0; i < n; i++) {
    const hh = h * rng.range(0.88, 1.08);
    B.cyl('wood', -len / 2 + (i + 0.5) * (len / n), -0.4, 0, 0.16, hh + 0.4, { r2: 0.02, seg: 5 });
  }
  B.box('darkwood', 0, h * 0.35, -0.18, len, 0.14, 0.1);
  B.box('darkwood', 0, h * 0.72, -0.18, len, 0.14, 0.1);
  B.pop();
}

export function tent(B, o = {}) {
  const w = o.w ?? 4, d = o.d ?? 3, h = o.h ?? 2.4, color = o.color ?? 0xd8ccb0;
  const hw = w / 2, hd = d / 2;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // ridge tent: two sloped cloth sheets + triangular ends
  B.quad('cloth', [V(-hw, 0, hd), V(hw, 0, hd), V(hw, h, 0), V(-hw, h, 0)], [[0, 0], [w / 2, 0], [w / 2, 1], [0, 1]], color);
  B.quad('cloth', [V(hw, 0, -hd), V(-hw, 0, -hd), V(-hw, h, 0), V(hw, h, 0)], [[0, 0], [w / 2, 0], [w / 2, 1], [0, 1]], color);
  B.tri('cloth', V(-hw, 0, -hd), V(-hw, 0, hd), V(-hw, h, 0), new THREE.Color(color).multiplyScalar(0.9));
  B.tri('cloth', V(hw, 0, hd), V(hw, 0, -hd), V(hw, h, 0), new THREE.Color(color).multiplyScalar(0.8));
  B.cyl('wood', -hw - 0.1, 0, 0, 0.05, h + 0.3, { seg: 5 });
  B.cyl('wood', hw + 0.1, 0, 0, 0.05, h + 0.3, { seg: 5 });
  B.beam('wood', V(-hw - 0.1, h + 0.05, 0), V(hw + 0.1, h + 0.05, 0), 0.07);
  // dark entrance
  B.tri('dark', V(hw + 0.01, 0, 0.6), V(hw + 0.01, 0, -0.6), V(hw + 0.01, h * 0.7, 0));
}

// Command tent: larger, taller with a wall section.
export function commandTent(B, o = {}) {
  const w = o.w ?? 8, d = o.d ?? 6, color = o.color ?? 0xe0d4b8;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const hw = w / 2, hd = d / 2, wh = 1.8, h = 3.8;
  B.quad('cloth', [V(-hw, 0, hd), V(hw, 0, hd), V(hw, wh, hd), V(-hw, wh, hd)], null, color);
  B.quad('cloth', [V(hw, 0, -hd), V(-hw, 0, -hd), V(-hw, wh, -hd), V(hw, wh, -hd)], null, color);
  B.quad('cloth', [V(hw, 0, hd), V(hw, 0, -hd), V(hw, wh, -hd), V(hw, wh, hd)], null, color);
  B.quad('cloth', [V(-hw, 0, -hd), V(-hw, 0, hd), V(-hw, wh, hd), V(-hw, wh, -hd)], null, color);
  B.quad('cloth', [V(-hw - 0.3, wh, hd + 0.3), V(hw + 0.3, wh, hd + 0.3), V(hw * 0.4, h, 0), V(-hw * 0.4, h, 0)], null, o.roofColor ?? color);
  B.quad('cloth', [V(hw + 0.3, wh, -hd - 0.3), V(-hw - 0.3, wh, -hd - 0.3), V(-hw * 0.4, h, 0), V(hw * 0.4, h, 0)], null, o.roofColor ?? color);
  B.quad('cloth', [V(hw + 0.3, wh, hd + 0.3), V(hw + 0.3, wh, -hd - 0.3), V(hw * 0.4, h, 0), V(hw * 0.4, h, 0)], null, o.roofColor ?? color);
  B.quad('cloth', [V(-hw - 0.3, wh, -hd - 0.3), V(-hw - 0.3, wh, hd + 0.3), V(-hw * 0.4, h, 0), V(-hw * 0.4, h, 0)], null, o.roofColor ?? color);
  B.box('dark', 0, 0, hd + 0.01, 1.6, 1.7, 0.02);
  for (const [x, z] of [[-hw, hd], [hw, hd], [-hw, -hd], [hw, -hd]]) B.cyl('wood', x, 0, z, 0.06, wh + 0.1, { seg: 5 });
}

// ---- props ------------------------------------------------------------------
export function well(B) {
  B.cyl('stone', 0, 0, 0, 0.9, 0.8, { seg: 12, r2: 0.85 });
  B.cyl('dark', 0, 0.5, 0, 0.7, 0.32, { seg: 12 });
  for (const s of [-1, 1]) B.box('darkwood', s * 1.0, 0, 0, 0.14, 2.2, 0.14);
  B.box('darkwood', 0, 2.1, 0, 2.3, 0.14, 0.14);
  B.cyl('wood', 0, 1.6, 0, 0.12, 0.8, { rz: Math.PI / 2, seg: 8 });
  B.roof('thatch', 0, 2.25, 0, 2.2, 1.0, 0.55, { type: 'gable', overhang: 0.25 });
}

export function haystack(B, s = 1) {
  B.cyl('straw', 0, 0, 0, 1.4 * s, 1.6 * s, { r2: 1.3 * s, seg: 12 });
  B.cyl('straw', 0, 1.6 * s, 0, 1.3 * s, 1.1 * s, { r2: 0.1, seg: 12 });
}

export function jars(B, n = 3, seed = 1) {
  const rng = new Rng(seed);
  for (let i = 0; i < n; i++) {
    const x = rng.range(-0.8, 0.8), z = rng.range(-0.5, 0.5), s = rng.range(0.28, 0.45);
    B.sphere('pottery', x, s * 1.1, z, s, { sy: 1.25, color: rng.pick([0xffffff, 0xd0b090, 0x806050]) });
    B.cyl('pottery', x, s * 2.2, z, s * 0.45, s * 0.35, { seg: 8 });
  }
}

export function cart(B) {
  B.box('wood', 0, 0.8, 0, 1.6, 0.12, 2.6);
  for (const s of [-1, 1]) {
    B.box('wood', s * 0.78, 0.9, 0, 0.08, 0.5, 2.6);
    B.cyl('darkwood', s * 0.95, 0, 0.1, 0.72, 0.12, { rz: Math.PI / 2, seg: 14 });
  }
  B.beam('wood', new THREE.Vector3(-0.35, 0.85, 1.3), new THREE.Vector3(-0.3, 0.55, 3.4), 0.1);
  B.beam('wood', new THREE.Vector3(0.35, 0.85, 1.3), new THREE.Vector3(0.3, 0.55, 3.4), 0.1);
  B.box('straw', 0, 0.92, -0.3, 1.3, 0.5, 1.6, { uv: 1 });
}

export function millstone(B) {
  B.cyl('stone', 0, 0, 0, 1.1, 0.5, { seg: 16 });
  B.cyl('stone', 0, 0.5, 0, 0.6, 0.45, { seg: 14 });
  B.beam('wood', new THREE.Vector3(0.4, 0.8, 0), new THREE.Vector3(1.8, 0.8, 0), 0.08);
}

export function firewood(B) {
  for (let i = 0; i < 12; i++) {
    const y = Math.floor(i / 4) * 0.2, x = (i % 4) * 0.22 - 0.33;
    B.cyl('wood', x, y + 0.1, 0, 0.1, 1.4, { rx: Math.PI / 2, seg: 6 });
  }
}

export function table(B, w = 1.6, d = 0.8) {
  B.box('darkwood', 0, 0.62, 0, w, 0.08, d);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) B.box('darkwood', x * (w / 2 - 0.08), 0, z * (d / 2 - 0.08), 0.08, 0.62, 0.08);
}

export function stall(B, color = 0xa05030) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const [x, z] of [[-1.5, 1.1], [1.5, 1.1], [-1.5, -1.1], [1.5, -1.1]]) B.cyl('wood', x, 0, z, 0.06, z > 0 ? 2.2 : 2.6, { seg: 5 });
  B.quad('cloth', [V(-1.8, 2.2, 1.5), V(1.8, 2.2, 1.5), V(1.8, 2.65, -1.3), V(-1.8, 2.65, -1.3)], null, color);
  B.box('wood', 0, 0, 0.7, 2.8, 0.85, 0.7);
  B.box('darkwood', 0, 0.85, 0.7, 2.9, 0.06, 0.8);
}

export function weaponRack(B) {
  B.box('darkwood', 0, 0, 0, 2.2, 0.12, 0.4);
  B.box('darkwood', 0, 1.6, 0, 2.2, 0.1, 0.12);
  for (const s of [-1, 1]) B.box('darkwood', s * 1.05, 0, 0, 0.1, 1.7, 0.1);
  for (let i = 0; i < 6; i++) {
    const x = -0.85 + i * 0.34;
    B.cyl('wood', x, 0.1, 0.05, 0.025, 2.4, { seg: 5, rx: -0.08 });
    B.cyl('iron', x, 2.5, 0.25, 0.04, 0.35, { seg: 5, r2: 0.005, rx: -0.08 });
  }
}

export function dummy(B) {
  B.cyl('wood', 0, 0, 0, 0.08, 1.9, { seg: 6 });
  B.beam('wood', new THREE.Vector3(-0.6, 1.4, 0), new THREE.Vector3(0.6, 1.4, 0), 0.08);
  B.cyl('straw', 0, 0.9, 0, 0.26, 0.8, { seg: 8 });
  B.sphere('straw', 0, 1.9, 0, 0.2);
}

export function altar(B) {
  B.box('stone', 0, 0, 0, 2.6, 0.9, 1.4, { uv: 1 });
  B.box('darkwood', 0, 0.9, 0, 2.8, 0.1, 1.5);
  B.cyl('bronze', 0, 1.0, 0, 0.3, 0.35, { r2: 0.38, seg: 12 }); // incense ding
  for (const s of [-1, 1]) B.cyl('lacquer', s * 0.9, 1.0, 0.2, 0.05, 0.4, { seg: 6 }); // candles
}

export function banner(B, h = 6) {
  B.cyl('darkwood', 0, 0, 0, 0.07, h, { seg: 6 });
  B.cyl('bronze', 0, h, 0, 0.02, 0.35, { r2: 0.08, seg: 6 });
  B.beam('darkwood', new THREE.Vector3(0, h - 0.2, 0), new THREE.Vector3(1.2, h - 0.2, 0), 0.05);
}

export function campfireBase(B) {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    B.sphere('stone', Math.cos(a) * 0.65, 0.1, Math.sin(a) * 0.65, 0.18, { sy: 0.7 });
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    B.beam('darkwood', new THREE.Vector3(Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5), new THREE.Vector3(0, 0.45, 0), 0.08);
  }
}

export function bridge(B, len, w) {
  // plank deck with railings and pier posts
  const n = Math.ceil(len / 0.5);
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + (i + 0.5) * (len / n);
    B.box('wood', 0, -0.12, z, w, 0.12, len / n - 0.03, { uv: 1 });
  }
  for (const s of [-1, 1]) {
    B.box('darkwood', s * (w / 2), -0.3, 0, 0.22, 0.25, len);
    B.box('darkwood', s * (w / 2 - 0.05), 0.85, 0, 0.1, 0.1, len);
    for (let z = -len / 2; z <= len / 2 + 0.01; z += 2.5) B.box('darkwood', s * (w / 2 - 0.05), 0, z, 0.12, 0.95, 0.12);
  }
  for (let z = -len / 2 + 4; z < len / 2 - 3; z += 5) {
    for (const s of [-1, 1]) B.cyl('darkwood', s * (w / 2 - 0.3), -5, z, 0.2, 4.9, { seg: 7 });
  }
}
