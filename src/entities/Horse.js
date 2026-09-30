// Procedural horse: skinned quadruped with walk/trot/gallop gaits and a Han saddle.
// (Stirrups were not yet used in the Han dynasty, so the saddle has none.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, lerp, dampAngle } from '../core/MathUtil.js';

const HB = ['root', 'body', 'neck', 'head', 'tail', 'flu', 'fll', 'fru', 'frl', 'blu', 'bll', 'bru', 'brl'];
const HI = Object.fromEntries(HB.map((b, i) => [b, i]));
// rest positions (metres), horse faces +z, withers ~1.45 m
const HJ = {
  root: [0, 0, 0], body: [0, 1.25, 0], neck: [0, 1.45, 0.72], head: [0, 2.0, 1.12], tail: [0, 1.42, -0.8],
  flu: [0.2, 1.1, 0.62], fll: [0.2, 0.62, 0.64], fru: [-0.2, 1.1, 0.62], frl: [-0.2, 0.62, 0.64],
  blu: [0.2, 1.12, -0.6], bll: [0.2, 0.6, -0.68], bru: [-0.2, 1.12, -0.6], brl: [-0.2, 0.6, -0.68],
};
const HP = { body: 'root', neck: 'body', head: 'neck', tail: 'body', flu: 'body', fll: 'flu', fru: 'body', frl: 'fru', blu: 'body', bll: 'blu', bru: 'body', brl: 'bru' };

export const COATS = {
  bay: { coat: 0x6a3a1e, mane: 0x1a120c, legs: 0x2a1a10 },
  chestnut: { coat: 0x8a4a22, mane: 0x6a3014, legs: 0x7a4020 },
  black: { coat: 0x1c1816, mane: 0x0e0c0a, legs: 0x141210 },
  grey: { coat: 0x9a968e, mane: 0x6a6660, legs: 0x5a5650 },
  white: { coat: 0xe2ded4, mane: 0xd8d2c6, legs: 0xc8c2b6 },
  redHare: { coat: 0x9a2a14, mane: 0x3a0a04, legs: 0x5a1a0a },
};

function lathe(profile, seg = 10, sx = 1, sz = 1) {
  const prof = profile[0][1] > profile[profile.length - 1][1] ? [...profile].reverse() : profile;
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg);
  g.scale(sx, 1, sz);
  return g;
}
function limb(a, b, r0, r1, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = lathe([[r0 * 0.6, 0], [r0, 0.04], [r1, len - 0.02], [r1 * 0.6, len]], seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate(A.x, A.y, A.z);
  return g;
}

export function buildHorse(coatId = 'bay') {
  const C = COATS[coatId] || COATS.bay;
  const parts = [];
  const add = (geo, bone, color) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; si[i * 4] = HI[bone]; sw[i * 4] = 1; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    parts.push(g);
  };
  // barrel body along z
  const body = lathe([[0.02, -0.95], [0.22, -0.88], [0.34, -0.6], [0.37, -0.2], [0.36, 0.25], [0.33, 0.6], [0.24, 0.85], [0.02, 0.92]], 14, 0.82, 1);
  body.rotateX(Math.PI / 2); body.translate(0, 1.25, 0);
  add(body, 'body', C.coat);
  // chest and rump volume
  add(new THREE.SphereGeometry(0.34, 12, 10).scale(0.85, 1, 0.9).translate(0, 1.2, 0.62), 'body', C.coat);
  add(new THREE.SphereGeometry(0.36, 12, 10).scale(0.95, 0.95, 0.9).translate(0, 1.3, -0.62), 'body', C.coat);
  // neck
  add(limb([0, 1.35, 0.65], [0, 1.95, 1.06], 0.24, 0.13, 10), 'neck', C.coat);
  // mane strip
  const mane = new THREE.BoxGeometry(0.06, 0.2, 0.7);
  mane.rotateX(-0.9); mane.translate(0, 1.82, 0.78);
  add(mane, 'neck', C.mane);
  // head
  const head = lathe([[0.02, 0], [0.13, 0.06], [0.12, 0.3], [0.09, 0.5], [0.07, 0.58], [0.02, 0.6]], 10, 0.8, 1);
  head.rotateX(Math.PI / 2 + 0.9); head.translate(0, 2.02, 1.05);
  add(head, 'head', C.coat);
  for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.04, 0.14, 5).translate(s * 0.07, 2.16, 1.02), 'head', C.coat);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.025, 6, 5).translate(s * 0.1, 1.98, 1.16), 'head', 0x0a0806);
  // bridle
  add(new THREE.TorusGeometry(0.1, 0.012, 4, 12).rotateY(Math.PI / 2).rotateX(-0.9).translate(0, 1.82, 1.34), 'head', 0x3a1a10);
  // tail
  const tail = new THREE.ConeGeometry(0.1, 0.8, 7);
  tail.translate(0, -0.4, 0); tail.rotateX(0.25); tail.translate(0, 1.42, -0.84);
  add(tail, 'tail', C.mane);
  // legs
  for (const [u, l] of [['flu', 'fll'], ['fru', 'frl'], ['blu', 'bll'], ['bru', 'brl']]) {
    const U = HJ[u], L = HJ[l];
    const back = u[0] === 'b';
    add(limb([U[0], U[1] + 0.12, U[2]], L, back ? 0.13 : 0.1, 0.06, 8), u, C.coat);
    add(limb(L, [L[0], 0.1, L[2]], 0.055, 0.045, 7), l, C.legs);
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8).translate(L[0], 0.05, L[2] + 0.01), l, 0x1a1410);
  }
  // saddle cloth and saddle (Han saddles were low, with no stirrups)
  const cloth = new THREE.BoxGeometry(0.78, 0.04, 0.7); cloth.translate(0, 1.6, 0.05);
  add(cloth, 'body', 0x8a1a12);
  add(lathe([[0.3, 0], [0.32, 0.05], [0.28, 0.12]], 12, 1, 1.25).translate(0, 1.6, 0.05), 'body', 0x4a2a18);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.36, 0.5).translate(s * 0.33, 1.44, 0.05), 'body', 0x8a1a12);

  const geo = mergeGeometries(parts);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  const bones = HB.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
  const by = Object.fromEntries(bones.map((b) => [b.name, b]));
  for (const b of bones) {
    const p = HP[b.name], w = HJ[b.name];
    if (p) { const pp = HJ[p]; b.position.set(w[0] - pp[0], w[1] - pp[1], w[2] - pp[2]); by[p].add(b); } else b.position.set(...w);
  }
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  return { mesh, bones: by };
}

export class Horse {
  constructor(game, o = {}) {
    this.game = game;
    this.id = o.id || 'horse' + Math.floor(Math.random() * 1e6);
    this.name = o.name || 'Horse';
    this.cn = o.cn || '馬';
    this.coat = o.coat || 'bay';
    this.rig = buildHorse(this.coat);
    this.root = new THREE.Group();
    this.root.add(this.rig.mesh);
    this.pos = new THREE.Vector3(o.x || 0, 0, o.z || 0);
    this.yaw = o.yaw || 0;
    this.speed = 0;
    this.phase = 0;
    this.rider = null;
    this.owner = o.owner || null;
    this.radius = 0.7;
    this.target = null; // whistle target
    game.engine.scene.add(this.root);
  }

  // speed m/s; turn -1..1
  drive(dt, throttle, turn, gallop) {
    const max = gallop ? 11.5 : throttle > 0 ? 4.2 : throttle < 0 ? -1.4 : 0;
    this.speed = lerp(this.speed, max * Math.abs(throttle || (gallop ? 1 : 0)) * Math.sign(throttle || 1), 1 - Math.exp(-(max === 0 ? 2.5 : 1.2) * dt));
    if (throttle === 0 && !gallop) this.speed = lerp(this.speed, 0, 1 - Math.exp(-2.5 * dt));
    this.yaw += turn * dt * lerp(1.8, 1.0, clamp(Math.abs(this.speed) / 11, 0, 1));
  }

  update(dt) {
    const g = this.game, w = g.world;
    if (!this.rider) {
      if (this.target) {
        const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d < 2.5) { this.target = null; this.speed = 0; }
        else { this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 3, dt); this.speed = lerp(this.speed, d > 20 ? 9 : 3, 1 - Math.exp(-2 * dt)); }
      } else this.speed = lerp(this.speed, 0, 1 - Math.exp(-3 * dt));
    }
    const vx = Math.sin(this.yaw) * this.speed, vz = Math.cos(this.yaw) * this.speed;
    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += vx * dt; this.pos.z += vz * dt;
    w.colliders.resolve(this.pos, this.radius, this.pos.y + 0.8);
    const water = w.hf.waterAt(this.pos.x, this.pos.z);
    if (water !== null && water - w.groundHeight(this.pos.x, this.pos.z) > 1.4) { this.pos.x = px; this.pos.z = pz; this.speed *= 0.3; }
    const lim = w.hf.half - 6;
    this.pos.x = clamp(this.pos.x, -lim, lim); this.pos.z = clamp(this.pos.z, -lim, lim);
    const gy = w.groundHeight(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 12);
    // pitch to slope
    const ahead = w.groundHeight(this.pos.x + Math.sin(this.yaw) * 0.9, this.pos.z + Math.cos(this.yaw) * 0.9);
    const behind = w.groundHeight(this.pos.x - Math.sin(this.yaw) * 0.9, this.pos.z - Math.cos(this.yaw) * 0.9);
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    this.rig.mesh.rotation.x = -Math.atan2(ahead - behind, 1.8) * 0.8;
    this.animate(dt);
  }

  animate(dt) {
    const B = this.rig.bones, s = Math.abs(this.speed);
    const gallop = clamp((s - 5) / 4, 0, 1), move = clamp(s / 1.5, 0, 1);
    this.phase += dt * lerp(lerp(3.2, 7, clamp((s - 1.5) / 3.5, 0, 1)), 9.5, gallop) * (s > 0.1 ? 1 : 0) * Math.sign(this.speed || 1);
    const ph = this.phase;
    if (move > 0.2 && this.game.audio?.enabled) {
      const beats = Math.floor(ph / Math.PI);
      if (beats !== this._beat) {
        this._beat = beats;
        const p = this.game.player?.pos;
        if (p && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 40) {
          const hard = this.game.world.hf.isRoad?.(this.pos.x, this.pos.z);
          const gv = 0.12 + gallop * 0.18;
          this.game.audio.hoof(this.pos, hard, gv);
          setTimeout(() => this.game.audio.hoof(this.pos, hard, gv * 0.8), gallop > 0.5 ? 60 : 110 / Math.max(1, s * 0.4));
        }
      }
    }
    // walk/trot: diagonal pairs; gallop: fronts together, backs together (rotary approximation)
    const offs = gallop > 0.5 ? { fl: 0, fr: 0.3, bl: Math.PI, br: Math.PI + 0.3 } : { fl: 0, fr: Math.PI, bl: Math.PI, br: 0 };
    const amp = lerp(0.35, 0.75, gallop) * move;
    for (const [leg, o] of Object.entries(offs)) {
      const up = B[leg[0] + leg[1] + 'u'], lo = B[leg[0] + leg[1] + 'l'];
      const a = Math.sin(ph + o);
      up.rotation.x = -a * amp;
      lo.rotation.x = (leg[0] === 'f' ? 1 : -1) * Math.max(0, Math.cos(ph + o)) * amp * 1.2;
    }
    const bob = Math.abs(Math.sin(ph)) * lerp(0.02, 0.09, gallop) * move;
    B.body.position.y = 1.25 + bob;
    B.body.rotation.x = Math.sin(ph * 2) * 0.03 * move + gallop * Math.sin(ph) * 0.06;
    B.neck.rotation.x = -0.05 + Math.sin(ph * 2 + 0.5) * 0.08 * move + gallop * 0.25;
    B.head.rotation.x = Math.sin(this.game.clockTime * 0.7) * 0.05 * (1 - move);
    B.tail.rotation.x = 0.2 + gallop * 0.6 + Math.sin(this.game.clockTime * 2) * 0.05;
    B.tail.rotation.z = Math.sin(this.game.clockTime * 1.3) * 0.15;
  }

  saddleWorld(out = new THREE.Vector3()) {
    return out.set(0, 1.62 + this.rig.bones.body.position.y - 1.25, 0.05).applyMatrix4(this.root.matrixWorld);
  }
}
