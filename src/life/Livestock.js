// Farm and street animals that make a settlement feel lived in: hens scratching in every farmyard,
// yellow village dogs that bark at strangers after dark, black pigs rooting behind the houses and
// yellow oxen tethered by the gable. Hens are drawn as instanced meshes (two draw calls per colour);
// the quadrupeds reuse the wildlife rig and gait.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildQuadruped, Wildlife } from './Wildlife.js';
import { Rng } from '../core/Rng.js';
import { lerp, dampAngle } from '../core/MathUtil.js';

const KINDS = {
  dog: { len: 0.74, bodyY: 0.44, bodyR: 0.13, w: 0.08, legR: 0.03, neck: [0, 0.66, 0.46], headLen: 0.24, headDown: 0.15, color: 0xb08a50, belly: 0xe2d0a8, tailLen: 0.3, walk: 1.2, trot: 3.2, r: 0.3 },
  pig: { len: 0.95, bodyY: 0.42, bodyR: 0.25, w: 0.12, legR: 0.05, neck: [0, 0.48, 0.6], headLen: 0.34, headDown: 0.6, color: 0x2a2420, belly: 0x3a322c, tailLen: 0.12, walk: 0.5, trot: 2.4, r: 0.45 },
  ox: { len: 1.7, bodyY: 1.0, bodyR: 0.37, w: 0.2, legR: 0.07, neck: [0, 1.12, 1.12], headLen: 0.5, headDown: 0.55, color: 0xa8743a, belly: 0xc8a070, tailLen: 0.75, walk: 0.6, trot: 1.6, r: 0.8 },
};

// A hen as two vertex-coloured geometries: body (with legs and tail) and head (pivoting at the neck).
function henGeometries(feather, dark) {
  const col = (g, c) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c);
    for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    return g.index ? g.toNonIndexed() : g;
  };
  const body = [
    col(new THREE.SphereGeometry(0.13, 10, 8).scale(0.8, 0.82, 1.15).translate(0, 0.25, 0), feather),
    col(new THREE.SphereGeometry(0.08, 8, 6).scale(0.7, 1, 1.1).translate(0, 0.3, -0.12).rotateX(-0.2), dark),
    col(new THREE.ConeGeometry(0.06, 0.16, 6).rotateX(-2.2).translate(0, 0.36, -0.16), dark),
  ];
  for (const s of [-1, 1]) body.push(col(new THREE.CylinderGeometry(0.01, 0.01, 0.14, 4).translate(s * 0.04, 0.07, 0.01), 0xc89a30));
  const head = [
    col(new THREE.CylinderGeometry(0.035, 0.05, 0.13, 7).translate(0, 0.06, 0).rotateX(0.35), feather),
    col(new THREE.SphereGeometry(0.045, 8, 6).translate(0, 0.13, 0.04), feather),
    col(new THREE.BoxGeometry(0.014, 0.035, 0.05).translate(0, 0.18, 0.04), 0xb8180e),
    col(new THREE.ConeGeometry(0.013, 0.04, 5).rotateX(Math.PI / 2).translate(0, 0.13, 0.095), 0xd8a830),
  ];
  return { body: mergeGeometries(body), head: mergeGeometries(head) };
}

export class Livestock {
  constructor(game) {
    this.g = game;
    this.group = new THREE.Group();
    game.engine.scene.add(this.group);
    this.animals = [];
    this.hens = [];
    this.rng = new Rng((game.world.region.seed || 1) * 29 + 11);
    const S = game.world.settlements;
    for (const b of S.buildings) {
      if (!b.yardGate || !b.door) continue;
      this.farmstead(b);
    }
    for (const s of game.world.region.settlements) {
      if (s.type === 'walledTown') this.town(s);
    }
    this.buildHens();
  }

  add(kind, home, opts = {}) {
    const S = KINDS[kind], rig = buildQuadruped(S);
    if (kind === 'ox') {
      // short curved horns on the head bone
      const hm = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.6 });
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 6), hm);
        h.position.set(s * 0.13, 0.12, -0.06); h.rotation.set(-0.3, 0, s * -1.1);
        rig.bones.head.add(h);
      }
    }
    const root = new THREE.Group(); root.add(rig.mesh);
    this.group.add(root);
    const a = {
      kind, S, rig, root, home, opts, pos: new THREE.Vector3(home.x, this.g.world.groundHeight(home.x, home.z), home.z),
      yaw: this.rng.range(0, 6.28), speed: 0, state: 'graze', t: this.rng.range(0, 10), phase: 0, next: 0, target: null, sound: this.rng.range(5, 30),
    };
    root.position.copy(a.pos);
    this.animals.push(a);
    return a;
  }

  // yard between the door and the gate of a farmstead
  farmstead(b) {
    const R = this.rng;
    const yx = (b.door.x + b.yardGate.x) / 2, yz = (b.door.z + b.yardGate.z) / 2;
    const yr = Math.max(1.5, Math.hypot(b.yardGate.x - b.door.x, b.yardGate.z - b.door.z) / 2 - 0.6);
    if (R.chance(0.75)) {
      const n = R.int(3, 7), v = R.int(0, 2);
      for (let i = 0; i < n; i++) this.hen(yx + R.range(-yr, yr) * 0.6, yz + R.range(-yr, yr) * 0.6, { x: yx, z: yz, r: yr }, (v + (R.chance(0.3) ? 1 : 0)) % 3);
    }
    if (R.chance(0.45)) this.add('dog', { x: yx, z: yz, r: yr + 3 }, { guard: true });
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const side = (lx, lz) => ({ x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c });
    if (R.chance(0.3)) { const p = side(-(b.w / 2 + 1.6), -b.d * 0.2); this.add('pig', { ...p, r: 1.6 }); }
    if (R.chance(0.3)) {
      // tethered by either gable end, wherever there is room
      for (const [lx, lz] of [[b.w / 2 + 2.4, 0], [-(b.w / 2 + 2.4), 0], [b.w / 2 + 3.4, -b.d * 0.5], [-(b.w / 2 + 3.4), -b.d * 0.5]]) {
        const p = side(lx, lz);
        if (!this.blocked(p.x, p.z, 0.9)) { this.add('ox', { ...p, r: 0.7 }, { tethered: true }); break; }
      }
    }
  }

  town(s) {
    const R = this.rng;
    for (let i = 0; i < 6; i++) this.add('dog', { x: s.x + R.range(-s.w / 3, s.w / 3), z: s.z + R.range(-s.d / 3, s.d / 3), r: 26 }, { stray: true });
    // hens scratching by some of the houses inside the walls
    for (const b of this.g.world.settlements.buildings) {
      if (!b.door || b.yardGate || Math.abs(b.x - s.x) > s.w / 2 || Math.abs(b.z - s.z) > s.d / 2 || !R.chance(0.18)) continue;
      const v = R.int(0, 2);
      for (let i = 0; i < R.int(2, 4); i++) this.hen(b.door.x + R.range(-2, 2), b.door.z + R.range(0.5, 3), { x: b.door.x, z: b.door.z + 1.5, r: 3 }, v);
    }
  }

  // would something of radius r standing here be pushed out by a wall or prop?
  blocked(x, z, r) {
    const v = new THREE.Vector3(x, this.g.world.groundHeight(x, z), z);
    this.g.world.colliders.resolve(v, r, v.y + 0.5);
    return Math.hypot(v.x - x, v.z - z) > 0.05 || this.g.world.hf.waterAt(x, z) !== null;
  }

  hen(x, z, home, v) {
    this.hens.push({ pos: new THREE.Vector3(x, this.g.world.groundHeight(x, z), z), home, v, yaw: this.rng.range(0, 6.28), speed: 0, t: this.rng.range(0, 9), next: 0, peck: 0, walk: false, flee: 0, ty: 0 });
  }

  buildHens() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const colours = [[0x8a5a2a, 0x4a2a14], [0xe8e0d0, 0xc8c0b0], [0x2a2420, 0x1a3a2a]];
    this.henMesh = colours.map(([f, d], k) => {
      const g = henGeometries(f, d), n = Math.max(1, this.hens.filter((h) => h.v === k).length);
      const mk = (geo) => { const im = new THREE.InstancedMesh(geo, mat, n); im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; this.group.add(im); return im; };
      return { body: mk(g.body), head: mk(g.head) };
    });
    this.m4 = new THREE.Matrix4(); this.m4b = new THREE.Matrix4(); this.m4c = new THREE.Matrix4();
    this.q = new THREE.Quaternion(); this.v3 = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1);
  }

  update(dt) {
    const g = this.g, p = g.player;
    if (!p) return;
    const hr = g.time?.hour ?? 12, night = hr < 5.5 || hr > 20;
    for (const a of this.animals) {
      const d = a.pos.distanceTo(p.pos);
      a.root.visible = d < 150;
      if (d > 120) continue;
      this.think(a, dt, d, night);
      Wildlife.prototype.animate.call(null, a, dt);
      const B = a.rig.bones;
      if (a.kind === 'dog') {
        // curled tail held high, wagging when it decides you are a friend
        B.tail.rotation.x = -2.2 + Math.sin(a.t * (a.wag ? 14 : 3)) * (a.wag ? 0.35 : 0.08);
        if (a.state === 'lie') { B.body.position.y = a.rig.bodyY * 0.55; B.neck.rotation.x = 0.5; }
        if (a.state === 'bark') { B.neck.rotation.x = -0.25 + Math.sin(a.t * 18) * 0.06 * (a.barking > 0 ? 1 : 0); }
      } else if (a.kind === 'ox') {
        B.tail.rotation.x = Math.sin(a.t * 1.3) * 0.25;
        B.head.rotation.y = Math.sin(a.t * 2.2) * 0.04; // chewing the cud
      }
    }
    this.updateHens(dt, p, night);
  }

  think(a, dt, d, night) {
    const g = this.g, p = g.player, S = a.S;
    a.t += dt; a.next -= dt; a.sound -= dt;
    let want = 0, face = a.yaw;
    if (a.kind === 'dog') {
      const stranger = (night || a.opts.guard) && d < (night ? 14 : 7) && !p.dead;
      if (stranger && a.state !== 'bark' && !a.friend) { a.state = 'bark'; a.barking = 0; a.barkUntil = a.t + 6 + Math.random() * 6; }
      if (a.state === 'bark') {
        face = Math.atan2(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
        want = d > 6 ? S.trot : d < 3.5 ? -0.6 : 0;
        a.barking -= dt;
        if (a.barking <= 0 && a.sound <= 0) { g.audio?.dog?.(a.pos); a.barking = 0.6; a.sound = 1.4 + Math.random() * 2; }
        if (a.t > a.barkUntil || d > 22) { a.state = 'graze'; a.friend = !night && Math.random() < 0.5; a.next = 4; }
      } else if (night && a.next <= 0) { a.state = 'lie'; a.next = 20; }
      a.wag = a.friend && d < 6;
      if (a.wag) face = Math.atan2(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
    } else if (a.sound <= 0 && d < 25) {
      a.sound = a.kind === 'pig' ? 6 + Math.random() * 10 : 20 + Math.random() * 40;
      if (a.kind === 'pig') g.audio?.grunt?.(a.pos); else g.audio?.moo?.(a.pos);
    }
    if (a.state === 'graze' || a.state === 'lie') {
      if (a.next <= 0) {
        a.next = 3 + Math.random() * (a.opts.tethered ? 14 : 8);
        if (a.state === 'lie' && night) a.next = 30;
        else a.state = 'graze';
        const r = a.home.r * Math.sqrt(Math.random()), ang = Math.random() * 6.28;
        a.target = Math.random() < (a.opts.tethered ? 0.3 : 0.55) ? { x: a.home.x + Math.cos(ang) * r, z: a.home.z + Math.sin(ang) * r } : null;
      }
      if (a.target && a.state === 'graze') {
        const dx = a.target.x - a.pos.x, dz = a.target.z - a.pos.z;
        if (Math.hypot(dx, dz) > 0.3) { face = Math.atan2(dx, dz); want = S.walk; } else a.target = null;
      }
    }
    a.yaw = dampAngle(a.yaw, face, a.state === 'bark' ? 5 : 1.6, dt);
    a.speed = lerp(a.speed, want, 1 - Math.exp(-3 * dt));
    const px = a.pos.x, pz = a.pos.z;
    a.pos.x += Math.sin(a.yaw) * a.speed * dt; a.pos.z += Math.cos(a.yaw) * a.speed * dt;
    g.world.colliders.resolve(a.pos, S.r, a.pos.y + 0.5);
    if (g.world.hf.waterAt(a.pos.x, a.pos.z) !== null) { a.pos.x = px; a.pos.z = pz; a.target = null; }
    a.pos.y = g.world.groundHeight(a.pos.x, a.pos.z);
    a.root.position.copy(a.pos);
    a.root.rotation.y = a.yaw;
  }

  updateHens(dt, p, night) {
    const g = this.g, counts = this.henMesh.map(() => 0);
    for (const h of this.hens) {
      const d = Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z);
      if (d > 70 || night) continue; // roosting in the coop after dark
      h.t += dt; h.next -= dt;
      let want = 0;
      if (d < 2.6 && !p.dead) { h.flee = 1.2; h.fy = Math.atan2(h.pos.x - p.pos.x, h.pos.z - p.pos.z) + (Math.random() - 0.5); if (!h.squawk) { h.squawk = true; g.audio?.cluck?.(h.pos, true); } }
      if (h.flee > 0) { h.flee -= dt; want = 3.2; h.yaw = dampAngle(h.yaw, h.fy, 10, dt); h.peck = 0; }
      else {
        h.squawk = false;
        if (h.next <= 0) {
          h.next = 0.6 + Math.random() * 2.5;
          h.walk = Math.random() < 0.45;
          const back = Math.hypot(h.pos.x - h.home.x, h.pos.z - h.home.z) > h.home.r;
          h.ty = back ? Math.atan2(h.home.x - h.pos.x, h.home.z - h.pos.z) : h.yaw + (Math.random() - 0.5) * 2.5;
          if (Math.random() < 0.04 && d < 30) g.audio?.cluck?.(h.pos, false);
        }
        if (h.walk) { want = 0.45; h.yaw = dampAngle(h.yaw, h.ty, 4, dt); h.peck = 0; }
        else h.peck = Math.max(0, Math.sin(h.t * 7)) ** 3; // scratch-and-peck
      }
      h.speed = lerp(h.speed, want, 1 - Math.exp(-6 * dt));
      h.pos.x += Math.sin(h.yaw) * h.speed * dt; h.pos.z += Math.cos(h.yaw) * h.speed * dt;
      g.world.colliders.resolve(h.pos, 0.12, h.pos.y + 0.3);
      h.pos.y = g.world.groundHeight(h.pos.x, h.pos.z);
      const bob = h.speed > 0.2 ? Math.abs(Math.sin(h.t * 16)) * 0.02 : 0;
      const M = this.henMesh[h.v], i = counts[h.v]++;
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, h.yaw);
      this.m4.compose(this.v3.set(h.pos.x, h.pos.y + bob, h.pos.z), this.q, this.one);
      M.body.setMatrixAt(i, this.m4);
      // head: pivot at the neck base, pitched down to peck, a little forward jerk while walking
      this.m4b.makeRotationX(0.25 + h.peck * 1.2 + (h.speed > 0.2 ? Math.sin(h.t * 16) * 0.15 : 0));
      this.m4b.setPosition(0, 0.31, 0.1);
      M.head.setMatrixAt(i, this.m4c.multiplyMatrices(this.m4, this.m4b));
    }
    this.henMesh.forEach((M, k) => {
      for (const im of [M.body, M.head]) { im.count = Math.min(counts[k], im.instanceMatrix.count); im.instanceMatrix.needsUpdate = true; }
    });
  }
}
