// Game animals of the Han countryside: sika deer, wild boar, hares, pheasants — and, rarely, a tiger.
// Animals graze and wander, sense the hunter (less so when sneaking), flee or charge, and can be
// skinned for meat, hides and trophies.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, lerp, dampAngle } from '../core/MathUtil.js';
import { PROPS } from './Props.js';
import { itemDef } from '../rpg/Items.js';

const QB = ['root', 'body', 'neck', 'head', 'tail', 'flu', 'fll', 'fru', 'frl', 'blu', 'bll', 'bru', 'brl'];
const QI = Object.fromEntries(QB.map((b, i) => [b, i]));
const QP = { body: 'root', neck: 'body', head: 'neck', tail: 'body', flu: 'body', fll: 'flu', fru: 'body', frl: 'fru', blu: 'body', bll: 'blu', bru: 'body', brl: 'bru' };

export const SPECIES = {
  deer: { name: 'Sika Deer', cn: '梅花鹿', hp: 60, speed: 9.5, walk: 1.2, sense: 34, len: 1.15, bodyY: 0.86, bodyR: 0.2, w: 0.13, legR: 0.05, neck: [0, 1.32, 0.72], headLen: 0.3, color: 0x8a5230, belly: 0xe0d0b0, spots: true, tailLen: 0.16, loot: { venison: 2, deerHide: 1 }, stagLoot: { antlers: 1 } },
  boar: { name: 'Wild Boar', cn: '野豬', hp: 110, speed: 7.5, walk: 0.9, sense: 22, len: 1.05, bodyY: 0.56, bodyR: 0.28, w: 0.13, legR: 0.06, neck: [0, 0.6, 0.66], headLen: 0.42, headDown: 0.55, color: 0x2e241c, belly: 0x3a2e24, bristles: true, tusks: true, tailLen: 0.18, aggressive: 0.6, dmg: 18, loot: { boarMeat: 2, boarHide: 1, boarTusk: 1 } },
  tiger: { name: 'Tiger', cn: '虎', hp: 300, speed: 9, walk: 1.1, sense: 40, len: 1.6, bodyY: 0.74, bodyR: 0.27, w: 0.16, legR: 0.075, neck: [0, 0.98, 0.9], headLen: 0.32, color: 0xc8701e, belly: 0xece0c8, stripes: true, tailLen: 0.95, aggressive: 1, dmg: 34, loot: { tigerHide: 1 } },
  hare: { name: 'Hare', cn: '兔', hp: 12, speed: 8, sense: 16, loot: { hareMeat: 1, hareFur: 1 } },
  pheasant: { name: 'Pheasant', cn: '雉', hp: 10, speed: 5, sense: 14, loot: { pheasant: 1, feathers: 1 } },
};

function lathe(profile, seg = 10, sx = 1, sz = 1) {
  const prof = profile[0][1] > profile[profile.length - 1][1] ? [...profile].reverse() : profile;
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg);
  g.scale(sx, 1, sz);
  return g;
}
function limb(a, b, r0, r1, seg = 7) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const g = lathe([[r0 * 0.6, 0], [r0, 0.03], [r1, len - 0.02], [r1 * 0.6, len]], seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate(A.x, A.y, A.z);
  return g;
}

// Skinned quadruped from a species description (faces +z).
function buildQuadruped(S, stag = false) {
  const L = S.len / 2, y = S.bodyY;
  const J = {
    root: [0, 0, 0], body: [0, y, 0], neck: [0, y + 0.1, L * 0.85], head: S.neck, tail: [0, y + 0.06, -L * 0.95],
    flu: [S.w, y - 0.05, L * 0.72], fll: [S.w, y * 0.5, L * 0.74], fru: [-S.w, y - 0.05, L * 0.72], frl: [-S.w, y * 0.5, L * 0.74],
    // hind legs: the thigh slopes back to a high hock, then the cannon drops straight
    blu: [S.w, y - 0.02, -L * 0.62], bll: [S.w, y * 0.42, -L * 0.98], bru: [-S.w, y - 0.02, -L * 0.62], brl: [-S.w, y * 0.42, -L * 0.98],
  };
  const parts = [];
  const col = (x, yy, z, ny) => {
    const c = new THREE.Color(S.color);
    if (ny < -0.35 && yy > y - S.bodyR * 1.3) c.set(S.belly); // underside only
    else if (yy < y - S.bodyR * 1.3) c.multiplyScalar(0.72); // legs: the coat, a shade darker
    else if (yy > y + S.bodyR * 0.75 && Math.abs(x) < 0.05) c.multiplyScalar(0.7); // dorsal stripe
    if (S.spots && z < -S.len * 0.42 && yy > y - S.bodyR * 0.6) c.set(0xf2ece0); // white rump patch
    if (S.stripes && Math.sin(z * 15 + Math.abs(x) * 6 + Math.sin(yy * 9) * 1.2) > 0.55 && yy > y - S.bodyR * 0.6) c.set(0x1a120a);
    if (S.spots && yy > y && ((Math.floor(x * 22 + 40) * 7 + Math.floor(z * 18 + 40) * 13) % 11 === 0)) c.set(0xf0e6d0);
    return c;
  };
  const add = (geo, bone, color = null) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count, p = g.attributes.position, nr = g.attributes.normal;
    const ca = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const fixed = color !== null ? new THREE.Color(color) : null;
    for (let i = 0; i < n; i++) {
      const c = fixed || col(p.getX(i), p.getY(i), p.getZ(i), nr ? nr.getY(i) : 0);
      ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; si[i * 4] = QI[bone]; sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    parts.push(g);
  };
  const R = S.bodyR;
  const body = lathe([[0.02, -L * 1.05], [R * 0.7, -L * 0.95], [R * 0.98, -L * 0.6], [R, 0], [R * 0.95, L * 0.6], [R * 0.75, L * 0.95], [0.02, L * 1.05]], 14, 0.8, 1);
  body.rotateX(Math.PI / 2); body.translate(0, y, 0);
  add(body, 'body');
  // shoulder and haunch masses so the trunk reads as an animal, not a barrel
  add(new THREE.SphereGeometry(R * 1.05, 12, 9).scale(0.82, 1.08, 0.95).translate(0, y + R * 0.08, L * 0.62), 'body');
  add(new THREE.SphereGeometry(R * 1.08, 12, 9).scale(0.86, 1.05, 0.95).translate(0, y + R * 0.1, -L * 0.6), 'body');
  if (S.bristles) { const b = new THREE.BoxGeometry(0.05, 0.12, L * 1.6); b.translate(0, y + R * 0.95, 0.05); add(b, 'body', 0x15100c); }
  // neck and head
  const N = J.neck, H = J.head;
  add(limb([0, N[1] - 0.08, N[2] - 0.14], H, R * 0.78, R * 0.46, 9), 'neck');
  const head = lathe([[0.02, 0], [R * 0.48, 0.05], [R * 0.42, S.headLen * 0.55], [R * 0.24, S.headLen * 0.92], [0.02, S.headLen]], 9, 0.8, 1);
  head.rotateX(Math.PI / 2 + (S.headDown || 0.35)); head.translate(H[0], H[1], H[2] - 0.02);
  add(head, 'head');
  const fwd = new THREE.Vector3(0, -Math.sin(S.headDown || 0.35), Math.cos(S.headDown || 0.35));
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.018, 6, 5).translate(H[0] + s * R * 0.32, H[1] + 0.05, H[2] + 0.07), 'head', 0x0a0806);
    const ear = new THREE.ConeGeometry(S.stripes ? 0.05 : 0.04, S.stripes ? 0.07 : 0.13, 5); ear.rotateZ(s * -0.5); ear.translate(H[0] + s * R * 0.35, H[1] + 0.12, H[2] - 0.04);
    add(ear, 'head');
  }
  if (S.tusks) for (const s of [-1, 1]) { const t = new THREE.ConeGeometry(0.014, 0.1, 5); t.rotateX(-0.6); t.translate(s * 0.06, H[1] - 0.12 + fwd.y * S.headLen * 0.7, H[2] + fwd.z * S.headLen * 0.8); add(t, 'head', 0xe8e0c8); }
  if (stag) for (const s of [-1, 1]) {
    const base = new THREE.Vector3(H[0] + s * 0.06, H[1] + 0.1, H[2] - 0.02);
    add(limb(base.toArray(), [base.x + s * 0.12, base.y + 0.32, base.z - 0.06], 0.018, 0.01, 5), 'head', 0x8a7458);
    add(limb([base.x + s * 0.06, base.y + 0.16, base.z - 0.03], [base.x + s * 0.12, base.y + 0.26, base.z + 0.1], 0.012, 0.008, 5), 'head', 0x8a7458);
  }
  // tail
  const tl = new THREE.ConeGeometry(S.stripes ? 0.045 : 0.05, S.tailLen, 6);
  tl.translate(0, -S.tailLen / 2, 0); tl.rotateX(S.stripes ? 0.9 : 0.3); tl.translate(...J.tail);
  add(tl, 'tail', S.spots ? 0xf0e6d0 : null);
  // legs
  for (const [u, l] of [['flu', 'fll'], ['fru', 'frl'], ['blu', 'bll'], ['bru', 'brl']]) {
    const U = J[u], Lw = J[l];
    add(limb([U[0], U[1] + 0.12, U[2]], Lw, S.legR * 1.9, S.legR * 1.05, 7), u);
    add(limb(Lw, [Lw[0], 0.04, Lw[2]], S.legR, S.legR * 0.75, 6), l);
    add(new THREE.CylinderGeometry(S.legR * 0.8, S.legR, 0.05, 6).translate(Lw[0], 0.025, Lw[2] + 0.01), l, 0x1a1410);
  }
  const geo = mergeGeometries(parts);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  const bones = QB.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
  const by = Object.fromEntries(bones.map((b) => [b.name, b]));
  for (const b of bones) {
    const p = QP[b.name], w = J[b.name];
    if (p) { const pp = J[p]; b.position.set(w[0] - pp[0], w[1] - pp[1], w[2] - pp[2]); by[p].add(b); } else b.position.set(...w);
  }
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.frustumCulled = false;
  return { mesh, bones: by, bodyY: y };
}

function buildHare() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.9 });
  const w = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), m); body.scale.set(0.8, 0.85, 1.3); body.position.y = 0.16;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 7), m); head.position.set(0, 0.25, 0.15);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), w); tail.position.set(0, 0.18, -0.17);
  g.add(body, head, tail);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.13, 3, 6), m); e.position.set(s * 0.03, 0.36, 0.12); e.rotation.set(-0.35, 0, s * 0.18); g.add(e); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Wildlife {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.group = new THREE.Group();
    game.engine.scene.add(this.group);
    this.respawnAt = [];
    const R = game.world.region;
    if (['battlefield'].includes(game.regionId)) return;
    const spots = this.spawnAreas();
    if (!spots.length) return;
    const pickArea = (i) => spots[i % spots.length];
    for (let h = 0; h < 3; h++) { const a = pickArea(h); const n = 3 + Math.floor(Math.random() * 2); for (let i = 0; i < n; i++) this.spawn('deer', a.x + (Math.random() - 0.5) * 16, a.z + (Math.random() - 0.5) * 16, i === 0); }
    for (let h = 0; h < 2; h++) { const a = pickArea(h + 3); for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) this.spawn('boar', a.x + (Math.random() - 0.5) * 10, a.z + (Math.random() - 0.5) * 10); }
    for (let i = 0; i < 8; i++) { const a = pickArea(i + 5); this.spawn('hare', a.x + (Math.random() - 0.5) * 40, a.z + (Math.random() - 0.5) * 40); }
    for (let i = 0; i < 6; i++) { const a = pickArea(i + 2); this.spawn('pheasant', a.x + (Math.random() - 0.5) * 30, a.z + (Math.random() - 0.5) * 30); }
    // one tiger haunts the wildest hills of each region, far from people
    const far = spots.slice().sort((a, b) => b.remote - a.remote)[0];
    if (far && far.remote > 200 && !game.flags[`tiger_${game.regionId}`]) this.spawn('tiger', far.x, far.z);
    void R;
  }

  spawnAreas() {
    const g = this.g, R = g.world.region, hf = g.world.hf, out = [];
    const remote = (x, z) => Math.min(...R.settlements.map((s) => Math.hypot(s.x - x, s.z - z) - Math.max(s.w || 60, s.d || 60) / 2), 999);
    const ok = (x, z) => Math.abs(x) < hf.half - 30 && Math.abs(z) < hf.half - 30 && hf.waterAt(x, z) === null && hf.slope(x, z) < 0.35 && remote(x, z) > 70;
    for (const f of R.forests || []) for (let k = 0; k < 6; k++) {
      const a = Math.random() * 6.28, r = f.r * (0.5 + Math.random() * 0.6);
      const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
      if (ok(x, z)) out.push({ x, z, remote: remote(x, z) });
    }
    for (let k = 0; k < 40 && out.length < 14; k++) {
      const x = (Math.random() - 0.5) * hf.size * 0.8, z = (Math.random() - 0.5) * hf.size * 0.8;
      if (ok(x, z)) out.push({ x, z, remote: remote(x, z) });
    }
    return out.sort(() => Math.random() - 0.5);
  }

  spawn(kind, x, z, stag = false) {
    const g = this.g, S = SPECIES[kind];
    if (g.world.hf.waterAt(x, z) !== null) return null;
    let rig = null, root;
    if (kind === 'hare') root = buildHare();
    else if (kind === 'pheasant') {
      root = PROPS.rooster(0x7a3a1a);
      root.scale.setScalar(0.75);
      const u = root.userData;
      u.tail.scale.set(1, 2.4, 1);
      u.neck.children.forEach((m) => { if (m.isMesh && m.geometry.type === 'SphereGeometry' && m.material.color.getHex() !== 0xc81a10) m.material = new THREE.MeshStandardMaterial({ color: 0x1a4a3a, roughness: 0.4, metalness: 0.2 }); });
    } else {
      rig = buildQuadruped(S, kind === 'deer' && stag);
      root = new THREE.Group(); root.add(rig.mesh);
    }
    this.group.add(root);
    const a = { kind, S, stag, rig, root, pos: new THREE.Vector3(x, g.world.groundHeight(x, z), z), yaw: Math.random() * 6.28, speed: 0, hp: S.hp, state: 'graze', t: Math.random() * 10, phase: 0, target: null, alarm: 0, next: 0, dead: false, fly: 0 };
    root.position.copy(a.pos);
    this.list.push(a);
    return a;
  }

  // senses: distance to the player, halved when sneaking, doubled when running
  noticed(a) {
    const p = this.g.player, d = a.pos.distanceTo(p.pos);
    const run = Math.hypot(p.vel.x, p.vel.z) > 4, mounted = !!p.riding;
    const r = a.S.sense * (p.sneak ? 0.45 : 1) * (run ? 1.5 : 1) * (mounted ? 1.3 : 1);
    return d < r ? d : 0;
  }

  update(dt) {
    const g = this.g, p = g.player, hf = g.world.hf;
    if (!p) return;
    for (const a of this.list) {
      const d = a.pos.distanceTo(p.pos);
      a.root.visible = d < 260;
      if (d > 300) continue;
      a.t += dt;
      if (a.dead) { this.animateDead(a, dt); continue; }
      const S = a.S;
      // decide
      const seen = this.noticed(a);
      if (a.kind === 'pheasant' && (seen || a.alarm > 0) && !a.fly) { a.fly = 0.01; g.audio?.play('swing', a.pos); }
      if (a.fly) { this.flyAway(a, dt); continue; }
      if ((S.aggressive && (seen && d < 14 || a.alarm > 0) && Math.random() < S.aggressive + 0.4) || a.state === 'charge') {
        a.state = d < 60 && !p.dead ? 'charge' : 'graze';
      } else if (seen || a.alarm > 0) { a.state = 'flee'; a.calm = a.t + 6; }
      else if (a.state === 'flee' && a.t > (a.calm || 0)) a.state = 'graze';
      a.alarm = Math.max(0, a.alarm - dt);
      // act
      let want = 0, face = a.yaw;
      if (a.state === 'flee') { face = Math.atan2(a.pos.x - p.pos.x, a.pos.z - p.pos.z) + Math.sin(a.t * 0.7) * 0.4; want = S.speed; }
      else if (a.state === 'charge') {
        face = Math.atan2(p.pos.x - a.pos.x, p.pos.z - a.pos.z); want = d > 2 ? S.speed : 0.5;
        a.next -= dt;
        if (d < 1.6 && a.next <= 0 && !p.riding) {
          a.next = 1.4;
          const dmg = S.dmg * (p.combat.blocking ? 0.35 : 1) * (g.settings?.damageTaken ?? 1);
          p.damage(dmg, null, { animal: true });
          p.vel.x += Math.sin(face) * 6; p.vel.z += Math.cos(face) * 6;
          if (!p.dead) p.stagger(0.7, true);
          g.audio?.play('thud', p.pos); g.combat.blood.burst(p.pos.clone().setY(p.pos.y + 1), 10, face);
          g.cameraCtl.shake = 0.2;
        }
      } else {
        // graze: wander slowly with long pauses, head down
        a.next -= dt;
        if (a.next <= 0) { a.next = 3 + Math.random() * 8; a.walking = Math.random() < 0.45; a.wyaw = a.yaw + (Math.random() - 0.5) * 2.4; }
        if (a.walking) { want = S.walk || 0.8; face = a.wyaw; }
      }
      if (a.kind === 'hare' && a.state !== 'flee') want = a.walking ? 1.4 : 0;
      a.yaw = dampAngle(a.yaw, face, a.state === 'graze' ? 1.5 : 6, dt);
      a.speed = lerp(a.speed, want, 1 - Math.exp(-(want > a.speed ? 3 : 4) * dt));
      const px = a.pos.x, pz = a.pos.z;
      a.pos.x += Math.sin(a.yaw) * a.speed * dt; a.pos.z += Math.cos(a.yaw) * a.speed * dt;
      g.world.colliders.resolve(a.pos, a.kind === 'hare' || a.kind === 'pheasant' ? 0.15 : 0.45, a.pos.y + 0.5);
      if (hf.waterAt(a.pos.x, a.pos.z) !== null || Math.abs(a.pos.x) > hf.half - 20 || Math.abs(a.pos.z) > hf.half - 20) { a.pos.x = px; a.pos.z = pz; a.yaw += Math.PI * 0.7; }
      a.pos.y = g.world.groundHeight(a.pos.x, a.pos.z);
      a.root.position.copy(a.pos);
      a.root.rotation.y = a.yaw;
      if (a.rig) this.animate(a, dt);
      else if (a.kind === 'hare') { const hop = a.speed > 0.3 ? Math.abs(Math.sin(a.t * (a.speed > 4 ? 14 : 9))) * (a.speed > 4 ? 0.25 : 0.12) : 0; a.root.position.y += hop; a.root.rotation.x = -hop * 0.8; }
      else if (a.kind === 'pheasant') { const u = a.root.userData; u.neck.rotation.x = a.speed < 0.2 ? Math.max(0, Math.sin(a.t * 1.6)) ** 6 * 1.1 : 0.1; }
    }
    // respawn the dead elsewhere after a while
    this.respawnAt = this.respawnAt.filter((r) => { if (g.clockTime < r.t) return true; const ar = this.spawnAreas()[0]; if (ar && Math.hypot(ar.x - p.pos.x, ar.z - p.pos.z) > 120) this.spawn(r.kind, ar.x, ar.z, Math.random() < 0.3); return false; });
  }

  animate(a, dt) {
    const B = a.rig.bones, s = a.speed;
    const run = clamp((s - 3) / 4, 0, 1), move = clamp(s / 1, 0, 1);
    a.phase += dt * lerp(lerp(4, 7.5, clamp((s - 1) / 3, 0, 1)), 11, run) * (s > 0.1 ? 1 : 0);
    const ph = a.phase;
    const offs = run > 0.5 ? { fl: 0, fr: 0.25, bl: Math.PI, br: Math.PI + 0.25 } : { fl: 0, fr: Math.PI, bl: Math.PI, br: 0 };
    const amp = lerp(0.35, 0.8, run) * move;
    for (const [leg, o] of Object.entries(offs)) {
      const up = B[leg[0] + leg[1] + 'u'], lo = B[leg[0] + leg[1] + 'l'];
      const w = Math.sin(ph + o);
      up.rotation.x = -w * amp;
      lo.rotation.x = (leg[0] === 'f' ? 1 : -1) * Math.max(0, Math.cos(ph + o)) * amp * 1.2;
    }
    if (a.t > (a.headT || 0)) { a.headT = a.t + 2 + Math.random() * 5; a.headDown = Math.random() < 0.55; }
    const graze = a.state === 'graze' && s < 0.3 && a.headDown ? 1 : 0;
    a.graze = lerp(a.graze || 0, graze, 1 - Math.exp(-2 * dt));
    B.body.position.y = a.rig.bodyY + Math.abs(Math.sin(ph)) * lerp(0.02, 0.1, run) * move;
    B.body.rotation.x = Math.sin(ph) * 0.06 * run;
    B.neck.rotation.x = a.graze * 1.0 + run * 0.15 + Math.sin(a.t * 0.8) * 0.04 * (1 - a.graze);
    B.head.rotation.x = a.graze * 0.3 + Math.sin(a.t * 3) * 0.05 * a.graze;
    B.tail.rotation.x = (a.kind === 'deer' && a.state === 'flee' ? -1.2 : 0) + Math.sin(a.t * 2) * 0.1;
  }

  animateDead(a) {
    if (a.rig) { a.root.rotation.z = lerp(a.root.rotation.z, Math.PI / 2, 0.15); a.root.position.y = a.pos.y + 0.05; }
    else a.root.rotation.z = lerp(a.root.rotation.z, Math.PI / 2, 0.2);
  }

  flyAway(a, dt) {
    a.fly += dt;
    const p = this.g.player;
    if (a.fly < 0.05) a.flyYaw = Math.atan2(a.pos.x - p.pos.x, a.pos.z - p.pos.z) + (Math.random() - 0.5);
    a.pos.x += Math.sin(a.flyYaw) * 9 * dt; a.pos.z += Math.cos(a.flyYaw) * 9 * dt;
    a.pos.y += (a.fly < 1.5 ? 5 : 1) * dt;
    a.root.position.copy(a.pos); a.root.rotation.y = a.flyYaw;
    a.root.userData.tail.rotation.x = -1.2;
    if (a.fly > 7) { // lands somewhere further off
      a.fly = 0; a.state = 'graze';
      a.pos.y = this.g.world.groundHeight(a.pos.x, a.pos.z);
      if (this.g.world.hf.waterAt(a.pos.x, a.pos.z) !== null) { a.dead = true; a.root.visible = false; }
    }
  }

  // ---- combat with animals ---------------------------------------------------------
  hurt(a, dmg, from) {
    if (a.dead) return;
    a.hp -= dmg;
    a.alarm = 8;
    this.g.combat.blood.burst(a.pos.clone().setY(a.pos.y + (a.rig ? a.rig.bodyY : 0.2)), 14, from ? Math.atan2(a.pos.x - from.x, a.pos.z - from.z) : 0);
    if (a.hp <= 0) {
      a.dead = true; a.speed = 0; a.diedAt = this.g.clockTime;
      this.g.audio?.play('thud', a.pos);
      this.respawnAt.push({ kind: a.kind, t: this.g.clockTime + 420 });
      if (a.kind === 'tiger') { this.g.flags[`tiger_${this.g.regionId}`] = true; this.g.progression.addRenown(8); this.g.ui.notify('You have slain a tiger! The whole county will speak of it.', 'merit'); }
    } else if (a.S.aggressive) a.state = 'charge';
  }
  arrowHit(pos, owner, dmg) {
    for (const a of this.list) {
      if (a.dead || a.fly > 1.2) continue;
      const big = a.rig ? a.S.bodyR * 1.2 + 0.15 : 0.22;
      const cy = a.pos.y + (a.rig ? a.rig.bodyY : 0.18);
      if (Math.hypot(pos.x - a.pos.x, pos.z - a.pos.z) < big + (a.rig ? a.S.len * 0.3 : 0) && Math.abs(pos.y - cy) < big + 0.1) {
        this.hurt(a, dmg * (a.kind === 'tiger' ? 0.8 : 1.9), owner?.pos); // a broadhead in the flank brings most game down
        if (a.fly) { a.fly = 0; a.dead = true; a.pos.y = this.g.world.groundHeight(a.pos.x, a.pos.z); a.root.position.copy(a.pos); }
        this.g.progression.gain('archery', 1.5);
        return true;
      }
    }
    return false;
  }
  meleeHit(att, reach, arc, dmg) {
    let best = null, bd = reach + 0.6;
    for (const a of this.list) {
      if (a.dead || a.fly) continue;
      const d = Math.hypot(a.pos.x - att.pos.x, a.pos.z - att.pos.z);
      if (d > bd) continue;
      const ang = Math.abs(((Math.atan2(a.pos.x - att.pos.x, a.pos.z - att.pos.z) - att.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (ang > arc) continue;
      best = a; bd = d;
    }
    if (best) { this.hurt(best, dmg, att.pos); this.g.audio?.play('hit', best.pos); return true; }
    return false;
  }

  // dead animals the player is standing over
  carcasses() {
    const p = this.g.player;
    return this.list.filter((a) => a.dead && a.root.visible && a.pos.distanceTo(p.pos) < 2.6).map((a) => ({ id: 'carcass', x: a.pos.x, z: a.pos.z, r: 2.2, label: `Skin the ${a.S.name.toLowerCase()} ${a.S.cn}`, kind: 'life', act: 'skin', data: { a } }));
  }
  async skin(a) {
    const g = this.g, p = g.player;
    p.model.anim.setPose('kneel');
    await g.ui.fade(0.75, 0.4);
    const loot = { ...a.S.loot, ...(a.stag ? a.S.stagLoot : {}) };
    const got = [];
    for (const [id, n] of Object.entries(loot)) { p.inventory.add(id, n); got.push(`${itemDef(id).name}${n > 1 ? ' ×' + n : ''}`); }
    g.time.addHours(0.25);
    this.group.remove(a.root);
    this.list.splice(this.list.indexOf(a), 1);
    await g.ui.fade(0, 0.5);
    p.model.anim.setPose(null);
    g.record('hunted'); g.record('hunted_' + a.kind);
    g.ui.notify(`You skin and butcher the ${a.S.name.toLowerCase()}: ${got.join(', ')}.`, 'item');
    g.progression.gain('blade', 0.3);
  }
}
