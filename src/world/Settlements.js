// Lays out villages, the walled county town, estates and camps for a region.
import * as THREE from 'three';
import { Rng } from '../core/Rng.js';
import {
  Batch, farmhouse, tiledHouse, twoStorey, watchtower, wallSegment, gateTower, cornerTower, lowWall, fence,
  palisade, tent, commandTent, well, haystack, jars, cart, millstone, firewood, table, stall, weaponRack, dummy,
  altar, banner, campfireBase, bridge,
} from './Buildings.js';
import { bannerTexture, signTexture } from './TextureGen.js';

export class Settlements {
  constructor(world) {
    this.world = world;
    this.hf = world.hf;
    this.region = world.region;
    this.group = new THREE.Group();
    this.group.name = 'settlements';
    world.scene.add(this.group);
    this.B = new Batch();
    this.surfaces = [];
    this.banners = [];
    this.fires = [];
    this.lanterns = [];
    this.spots = {}; // named positions used by NPCs/quests: id -> {x,z,rot}
    this.buildings = []; // {id, kind, x, z, rot, w, d, door:{x,z}}
    this.rng = new Rng(this.region.seed * 3 + 1);
  }

  // --- helpers -------------------------------------------------------------
  ground(x, z, w = 0, d = 0) {
    if (!w) return this.hf.getHeight(x, z);
    let m = Infinity;
    for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) m = Math.min(m, this.hf.getHeight(x + (a * w) / 2, z + (b * d) / 2));
    return m;
  }
  site(x, z, rot = 0, w = 6, d = 6) {
    this.B.frame(x, this.ground(x, z, w, d), z, rot);
    return this.B;
  }
  collide(x, z, w, d, rot = 0, data = {}) {
    return this.world.colliders.addBox(x, z, w / 2, d / 2, rot, data);
  }
  // local offset -> world
  lw(cx, cz, rot, lx, lz) {
    const c = Math.cos(rot), s = Math.sin(rot);
    return [cx + lx * c + lz * s, cz - lx * s + lz * c];
  }
  spot(id, x, z, rot = 0) { this.spots[id] = { x, z, rot }; return this.spots[id]; }
  interact(o) { this.world.interactables.push(o); return o; }
  registerBuilding(b) { this.buildings.push(b); return b; }

  // Place a building archetype at world pos with collider; returns door world position.
  place(kind, x, z, rot, opts = {}) {
    const dims = {
      farmhouse: [opts.w ?? 7, opts.d ?? 4.4],
      tiled: [opts.w ?? 9, opts.d ?? 5.5],
      twoStorey: [opts.w ?? 9, opts.d ?? 6],
      watchtower: [opts.base ?? 4.2, opts.base ?? 4.2],
    }[kind];
    const [w, d] = dims;
    const B = this.site(x, z, rot, w + 1, d + 1);
    if (kind === 'farmhouse') farmhouse(B, opts);
    else if (kind === 'tiled') tiledHouse(B, opts);
    else if (kind === 'twoStorey') twoStorey(B, opts);
    else if (kind === 'watchtower') watchtower(B, opts);
    this.collide(x, z, w + 0.2, d + 0.2, rot, { kind: 'building' });
    const doorLocalX = kind === 'farmhouse' ? -w * 0.18 : opts.doorX ?? 0;
    const [dx, dz] = this.lw(x, z, rot, doorLocalX, d / 2 + 1.6);
    const b = this.registerBuilding({ id: opts.id, kind, x, z, rot, w, d, door: { x: dx, z: dz, rot } });
    return b;
  }

  prop(fn, x, z, rot = 0, collideR = 0, ...args) {
    const B = this.site(x, z, rot, 1, 1);
    fn(B, ...args);
    if (collideR) this.world.colliders.addCircle(x, z, collideR, { kind: 'prop' });
  }

  addBanner(x, z, text, colors = {}, h = 6.5, rot = 0) {
    const B = this.site(x, z, rot, 0.5, 0.5);
    banner(B, h);
    const y = this.ground(x, z);
    const tex = bannerTexture(text, colors.bg, colors.fg, colors.border);
    const g = new THREE.PlaneGeometry(1.1, 2.2, 8, 12);
    g.translate(0.62, -1.1, 0);
    const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 1 });
    const uni = { uTime: { value: 0 }, uPhase: { value: this.rng.range(0, 10) } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = 'uniform float uTime; uniform float uPhase;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float f = clamp(position.x / 1.2, 0.0, 1.0);
        transformed.z += sin(uTime * 3.0 + position.x * 3.0 + uPhase) * 0.18 * f + sin(uTime * 5.3 + position.y * 2.0) * 0.05 * f;
        transformed.x -= (1.0 - cos(sin(uTime*2.0+uPhase)*0.3)) * f * 0.3;`);
    };
    mat.customProgramCacheKey = () => 'banner';
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y + h - 0.25, z);
    m.rotation.y = rot;
    m.castShadow = true;
    this.group.add(m);
    this.banners.push(uni);
    this.world.colliders.addCircle(x, z, 0.15, { kind: 'pole' });
    return m;
  }

  addSign(x, y, z, rot, text) {
    const tex = signTexture(text);
    const chars = [...text].length;
    const g = new THREE.PlaneGeometry(0.5, 0.5 * chars + 0.12);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    m.position.set(x, y, z);
    m.rotation.y = rot;
    this.group.add(m);
  }

  addFire(x, z, big = false) {
    const B = this.site(x, z, 0, 1, 1);
    campfireBase(B);
    const y = this.ground(x, z);
    const fire = makeFlame(big ? 1.3 : 1);
    fire.position.set(x, y + 0.1, z);
    this.group.add(fire);
    const light = new THREE.PointLight(0xff8a3a, 0, big ? 22 : 16, 1.6);
    light.position.set(x, y + 1.2, z);
    this.group.add(light);
    this.fires.push({ mesh: fire, light, x, z, base: big ? 26 : 18 });
    this.world.colliders.addCircle(x, z, 0.8, { kind: 'fire' });
    this.interact({ id: `fire_${x | 0}_${z | 0}`, x, z, r: 2.2, label: 'Rest by the fire', verb: 'rest', kind: 'fire' });
  }

  addLantern(x, y, z) {
    const g = new THREE.SphereGeometry(0.22, 10, 8);
    g.scale(1, 1.2, 1);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xb02018, emissive: 0xff5020, emissiveIntensity: 0, roughness: 0.6 }));
    m.position.set(x, y, z);
    this.group.add(m);
    this.lanterns.push(m);
  }

  addNotice(x, z, rot, id, label) {
    const B = this.site(x, z, rot, 2, 1);
    for (const s of [-1, 1]) B.cyl('darkwood', s * 1.1, 0, 0, 0.09, 2.6, { seg: 6 });
    B.box('wood', 0, 1.0, 0, 2.4, 1.3, 0.1);
    B.roof('roofTile', 0, 2.5, 0, 2.4, 0.4, 0.35, { type: 'gable', overhang: 0.25, lift: 0.08, nu: 4, nv: 2 });
    // paper sheets
    const y = this.ground(x, z);
    const tex = makeNoticeTexture();
    const g = new THREE.PlaneGeometry(2.1, 1.1);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    const [px, pz] = this.lw(x, z, rot, 0, 0.07);
    m.position.set(px, y + 1.65, pz);
    m.rotation.y = rot;
    this.group.add(m);
    this.collide(x, z, 2.6, 0.4, rot);
    const [ix, iz] = this.lw(x, z, rot, 0, 1.4);
    return this.interact({ id, x: ix, z: iz, r: 2.0, label, verb: 'read', kind: 'notice' });
  }

  // --- build ---------------------------------------------------------------
  build() {
    for (const s of this.region.settlements) {
      const fn = {
        village: this.buildVillage, walledTown: this.buildWalledTown, estate: this.buildEstate,
        armyCamp: this.buildArmyCamp, rebelCamp: this.buildRebelCamp, banditCamp: this.buildBanditCamp, hamlet: this.buildHamlet,
      }[s.type];
      if (fn) fn.call(this, s);
    }
    for (const b of this.region.bridges || []) this.buildBridge(b);
    this.B.build(this.group);
  }

  buildBridge(b) {
    const y = (this.hf.getHeight(b.x + Math.sin(b.rot) * b.len / 2, b.z + Math.cos(b.rot) * b.len / 2)
      + this.hf.getHeight(b.x - Math.sin(b.rot) * b.len / 2, b.z - Math.cos(b.rot) * b.len / 2)) / 2;
    const deckY = Math.max(y, this.hf.waterAt(b.x, b.z) ?? y) + 0.6;
    this.B.frame(b.x, deckY, b.z, b.rot);
    bridge(this.B, b.len, b.w);
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    this.surfaces.push({ x: b.x, z: b.z, hw: b.w / 2, hd: b.len / 2, c, s, y: deckY - 0.02 });
    // railings as colliders (side boxes)
    for (const side of [-1, 1]) {
      const [rx, rz] = this.lw(b.x, b.z, b.rot, side * (b.w / 2 + 0.1), 0);
      this.collide(rx, rz, 0.3, b.len - 1, b.rot, { top: deckY + 1.2 });
    }
  }

  // Farmstead: house + yard enclosure + props
  farmstead(x, z, rot, rng, o = {}) {
    const w = o.w ?? rng.range(6.5, 8), d = o.d ?? rng.range(4.2, 4.8);
    const house = this.place('farmhouse', x, z, rot, { w, d, wall: rng.chance(0.5) ? 'mudbrick' : 'rammed', porch: rng.chance(0.4), id: o.id });
    const yardD = o.yardD ?? rng.range(8, 11), yardW = w + rng.range(4, 7);
    // enclosure (in local coordinates of the farmstead frame)
    const B = this.site(x, z, rot, w, d);
    const L = (lx, lz) => [lx, lz];
    const zb = -d / 2 - 1, zf = d / 2 + yardD;
    const xl = -yardW / 2, xr = yardW / 2;
    const gate = 2.4;
    const enclosure = o.wall ? lowWall : fence;
    const eo = o.wall ? { h: 1.8, thatchTop: true, mat: 'rammed' } : { wattle: rng.chance(0.6) };
    enclosure(B, ...L(xl, zb), ...L(xl, zf), eo);
    enclosure(B, ...L(xr, zf), ...L(xr, zb), eo);
    enclosure(B, ...L(xl, zf), ...L(-gate / 2, zf), eo);
    enclosure(B, ...L(gate / 2, zf), ...L(xr, zf), eo);
    if (o.wall) enclosure(B, ...L(xr, zb), ...L(xl, zb), eo);
    // colliders for enclosure sides
    const addSide = (ax, az, bx, bz) => {
      const [wx1, wz1] = this.lw(x, z, rot, ax, az), [wx2, wz2] = this.lw(x, z, rot, bx, bz);
      const len = Math.hypot(wx2 - wx1, wz2 - wz1);
      this.collide((wx1 + wx2) / 2, (wz1 + wz2) / 2, len, 0.4, Math.atan2(-(wz2 - wz1), wx2 - wx1));
    };
    addSide(xl, zb, xl, zf); addSide(xr, zf, xr, zb); addSide(xl, zf, -gate / 2, zf); addSide(gate / 2, zf, xr, zf);
    // props in yard
    const px = (lx, lz) => this.lw(x, z, rot, lx, lz);
    if (rng.chance(0.7)) { const [a, b] = px(xr - 2, d / 2 + 3); this.prop(haystack, a, b, 0, 1.4, rng.range(0.7, 1)); }
    if (rng.chance(0.6)) { const [a, b] = px(xl + 1.2, d / 2 + 1.2); this.prop(jars, a, b, rot, 0.6, rng.int(2, 4), rng.int(1, 99)); }
    if (rng.chance(0.5)) { const [a, b] = px(w / 2 + 0.8, 0); this.prop(firewood, a, b, rot + Math.PI / 2, 0.8); }
    if (rng.chance(0.35)) { const [a, b] = px(xl + 2.5, zf - 2.5); this.prop(millstone, a, b, rng.range(0, 6), 1.1); }
    if (rng.chance(0.3)) { const [a, b] = px(xr - 2.2, zf - 3); this.prop(cart, a, b, rot + rng.range(-0.5, 0.5), 1.4); }
    const [gx, gz] = px(0, zf + 1.2);
    house.yardGate = { x: gx, z: gz };
    return house;
  }

  buildVillage(s) {
    const rng = new Rng(this.region.seed + 7);
    // Hand-placed key homes
    const liuBei = this.farmstead(s.x + 8, s.z - 30, 0, rng, { id: 'liubei_house', w: 7.5, wall: true });
    this.spot('liuBeiHome', liuBei.door.x, liuBei.door.z);
    const home = this.farmstead(s.x - 22, s.z + 14, 0, rng, { id: 'player_house', w: 7, yardD: 9 });
    this.spot('playerHome', home.door.x, home.door.z, 0);
    this.region.places.start = { x: home.door.x + 0.5, z: home.door.z + 1 };
    this.interact({ id: 'player_bed', x: home.door.x, z: home.door.z - 0.6, r: 1.6, label: 'Sleep (home)', verb: 'sleep', kind: 'bed' });
    // Great mulberry tree (樓桑) southeast of Liu Bei's house — the village's namesake.
    this.world.vegetation.addTree('mulberry', s.x + 20, s.z - 16, 1.0, { rot: 0.7 });
    this.spot('mulberry', s.x + 17, s.z - 11);
    this.region.places.lousangMulberry = { x: s.x + 17, z: s.z - 10 };
    // well and threshing floor at village centre
    this.prop(well, s.x - 2, s.z + 2, 0.3, 1.1);
    this.spot('villageWell', s.x - 2, s.z + 4.5);
    this.interact({ id: 'lousang_well', x: s.x - 2, z: s.z + 3.6, r: 2, label: 'Drink from the well', verb: 'drink', kind: 'well' });
    // shrine to the earth god (土地廟)
    const sh = this.site(s.x + 40, s.z + 12, -Math.PI / 2, 3, 3);
    sh.box('stone', 0, -0.3, 0, 3.2, 0.7, 2.6, { uv: 1 });
    sh.box('mudbrick', 0, 0.4, -0.2, 2.4, 1.6, 1.8);
    sh.roof('roofTile', 0, 2.0, -0.2, 2.4, 1.8, 0.9, { type: 'gable', overhang: 0.35, lift: 0.2, nu: 5, nv: 3 });
    sh.box('dark', 0, 0.4, 0.71, 1.0, 1.1, 0.02);
    this.collide(s.x + 40, s.z + 12, 3.2, 2.6, -Math.PI / 2);
    this.spot('shrine', s.x + 38, s.z + 12);
    // Other farmsteads around the lanes
    const plots = [
      [-45, -25, 0.1], [-20, -32, 0.05], [35, -38, -0.1], [-55, 10, 0.2], [48, -8, -0.15],
      [-48, 40, 0.1], [10, 30, 0.0], [38, 35, -0.2], [-15, 52, 0.05], [62, 30, -0.3], [-68, -20, 0.25], [25, 58, 0.1],
    ];
    plots.forEach(([dx, dz, r], i) => this.farmstead(s.x + dx, s.z + dz, r + (rng.chance(0.2) ? Math.PI : 0), rng, { id: `lousang_${i}` }));
    // loose haystacks and carts along the edges of fields
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(55, 75);
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      if (this.hf.maskAt(x, z, 0) < 0.05 && this.hf.maskAt(x, z, 1) < 0.1) this.prop(haystack, x, z, 0, 1.4, rng.range(0.8, 1.1));
    }
    // trees in and around the village (scholar trees, jujube, elms)
    for (let i = 0; i < 26; i++) {
      const x = s.x + rng.range(-s.w / 2, s.w / 2), z = s.z + rng.range(-s.d / 2, s.d / 2);
      if (this.world.vegetation.canPlace(x, z, 2.5, true)) this.world.vegetation.addTree(rng.pick(['elm', 'jujube', 'elm', 'willow', 'peach']), x, z, rng.range(0.8, 1.1));
    }
  }

  buildHamlet(s) {
    const rng = new Rng(this.region.seed + 71);
    const plots = [[-18, -10, 0.2], [12, -14, -0.1], [-8, 14, 0.1], [22, 12, -0.2], [-28, 16, 0.3]];
    plots.forEach(([dx, dz, r], i) => this.farmstead(s.x + dx, s.z + dz, r, rng, { id: `hamlet_${i}` }));
    this.prop(well, s.x + 2, s.z + 2, 0, 1.1);
    for (let i = 0; i < 8; i++) {
      const x = s.x + rng.range(-35, 35), z = s.z + rng.range(-30, 30);
      if (this.world.vegetation.canPlace(x, z, 2.5, true)) this.world.vegetation.addTree(rng.pick(['elm', 'jujube', 'willow']), x, z, rng.range(0.8, 1.1));
    }
  }

  buildWalledTown(s) {
    const rng = new Rng(this.region.seed + 17);
    const cx = s.x, cz = s.z, hw = s.w / 2, hd = s.d / 2;
    const G = (lx, lz) => [cx + lx, cz + lz];
    const wallH = 8, wallT = 6, gateW = 20;
    // Wall ring (counter-clockwise so crenels face outward)
    const B = this.B;
    const gy = this.ground(cx, cz);
    B.frame(cx, gy, cz, 0);
    const segs = [
      [[hw, -hd], [gateW / 2, -hd]], [[-gateW / 2, -hd], [-hw, -hd]],
      [[-hw, -hd], [-hw, -gateW / 2]], [[-hw, gateW / 2], [-hw, hd]],
      [[-hw, hd], [-gateW / 2, hd]], [[gateW / 2, hd], [hw, hd]],
      [[hw, hd], [hw, gateW / 2]], [[hw, -gateW / 2], [hw, -hd]],
    ];
    for (const [[ax, az], [bx, bz]] of segs) {
      const r = wallSegment(B, ax, az, bx, bz, { h: wallH, t: wallT });
      this.collide(cx + r.cx, cz + r.cz, r.len, wallT, r.rot, { kind: 'wall' });
    }
    // Gates
    const gates = [
      { id: 'north', lx: 0, lz: -hd, rot: 0 }, { id: 'south', lx: 0, lz: hd, rot: 0 },
      { id: 'west', lx: -hw, lz: 0, rot: Math.PI / 2 }, { id: 'east', lx: hw, lz: 0, rot: Math.PI / 2 },
    ];
    for (const g of gates) {
      B.frame(cx, gy, cz, 0);
      B.push().sub(g.lx, 0, g.lz, g.rot);
      gateTower(B, { w: gateW, d: wallT + 2, h: wallH, gateW: 5.5 });
      B.pop();
      const pw = (gateW - 5.5) / 2;
      for (const sd of [-1, 1]) {
        const [px, pz] = this.lw(cx + g.lx, cz + g.lz, g.rot, sd * (5.5 / 2 + pw / 2), 0);
        this.collide(px, pz, pw, wallT + 2, g.rot, { kind: 'wall' });
      }
      const [ox, oz] = this.lw(cx + g.lx, cz + g.lz, g.rot, 0, g.id === 'north' || g.id === 'east' ? -9 : 9);
      this.spot(`zhuoGate_${g.id}_out`, ox, oz);
      const [ix, iz] = this.lw(cx + g.lx, cz + g.lz, g.rot, 0, g.id === 'north' || g.id === 'east' ? 9 : -9);
      this.spot(`zhuoGate_${g.id}_in`, ix, iz);
      // guard banners by gate
      const [b1x, b1z] = this.lw(cx + g.lx, cz + g.lz, g.rot, -4.5, g.id === 'north' || g.id === 'east' ? -6.5 : 6.5);
      this.addBanner(b1x, b1z, '漢', { bg: '#8a1a12' }, 6, g.rot);
    }
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      B.frame(cx, gy, cz, 0);
      B.push().sub(sx * hw, 0, sz * hd, 0);
      cornerTower(B, { s: 9, h: wallH });
      B.pop();
      this.collide(cx + sx * hw, cz + sz * hd, 9, 9);
    }

    // --- Yamen (county office) compound in the NE block, facing south
    const yx = cx + 45, yz = cz - 50, yw = 56, yd = 52;
    const yb = this.site(yx, yz, 0, yw, yd);
    lowWall(yb, -yw / 2, -yd / 2, yw / 2, -yd / 2, { h: 3.2 });
    lowWall(yb, -yw / 2, -yd / 2, -yw / 2, yd / 2, { h: 3.2 });
    lowWall(yb, yw / 2, yd / 2, yw / 2, -yd / 2, { h: 3.2 });
    lowWall(yb, -yw / 2, yd / 2, -4, yd / 2, { h: 3.2 });
    lowWall(yb, 4, yd / 2, yw / 2, yd / 2, { h: 3.2 });
    this.collide(yx, yz - yd / 2, yw, 0.8); this.collide(yx - yw / 2, yz, 0.8, yd); this.collide(yx + yw / 2, yz, 0.8, yd);
    this.collide(yx - yw / 4 - 2, yz + yd / 2, yw / 2 - 4, 0.8); this.collide(yx + yw / 4 + 2, yz + yd / 2, yw / 2 - 4, 0.8);
    // gate house
    this.B.push();
    const gh = this.site(yx, yz + yd / 2, 0, 8, 4);
    for (const sd of [-1, 1]) gh.cyl('lacquer', sd * 3, 0, 0, 0.2, 3.6, { seg: 8 });
    gh.roof('roofTile', 0, 3.6, 0, 8, 3, 1.6, { type: 'hip', overhang: 0.9, lift: 0.4 });
    this.B.pop();
    this.addLantern(yx - 3, this.ground(yx, yz) + 3.2, yz + yd / 2 + 0.3);
    this.addLantern(yx + 3, this.ground(yx, yz) + 3.2, yz + yd / 2 + 0.3);
    // drum (鳴冤鼓) outside the gate
    const dr = this.site(yx + 6.5, yz + yd / 2 + 2, 0, 1, 1);
    dr.box('darkwood', 0, 0, 0, 1.4, 1.0, 0.5);
    dr.cyl('lacquer', 0, 1.0, 0, 0.55, 0.7, { rx: Math.PI / 2, seg: 14 });
    this.collide(yx + 6.5, yz + yd / 2 + 2, 1.4, 0.8);
    // main hall
    const hall = this.place('tiled', yx, yz - 8, 0, { w: 18, d: 9, h: 3.8, lacquer: true, platform: 1.1, rise: 3.0, id: 'yamen_hall' });
    this.spot('yamenHall', hall.door.x, hall.door.z + 1.5);
    this.place('tiled', yx - 18, yz + 8, Math.PI / 2, { w: 10, d: 5, gable: true, id: 'yamen_west' });
    this.place('tiled', yx + 18, yz + 8, -Math.PI / 2, { w: 10, d: 5, gable: true, id: 'yamen_east' });
    const wt = this.site(yx + 22, yz - 20, 0, 4, 4);
    watchtower(wt, { levels: 3, base: 4.2 });
    this.collide(yx + 22, yz - 20, 5, 5);
    // Yamen plaza with notice board (recruitment notice is posted here)
    const nb = this.addNotice(yx - 12, yz + yd / 2 + 8, 0, 'zhuo_notice', 'Read the proclamation');
    this.region.places.zhuoNotice = { x: nb.x, z: nb.z };
    this.spot('zhuoNotice', nb.x, nb.z + 0.5, Math.PI);
    this.addBanner(yx - 6, yz + yd / 2 + 3, '涿', { bg: '#1c1c1c', fg: '#e8d8a8', border: '#9a1e14' }, 7);
    this.addBanner(yx + 10, yz + yd / 2 + 3, '漢', { bg: '#8a1a12' }, 7);

    // --- Tavern (酒肆) on the main street, NW block
    const tv = this.place('twoStorey', cx - 40, cz - 14, 0, { w: 12, d: 8, id: 'tavern' });
    this.spot('tavernDoor', tv.door.x, tv.door.z);
    this.region.places.zhuoTavern = { x: tv.door.x, z: tv.door.z + 1 };
    this.addBanner(cx - 46.5, cz - 8.5, '酒', { bg: '#e8dcc0', fg: '#1a1a1a', border: '#8a1a12' }, 6.5);
    this.addLantern(cx - 42, this.ground(cx - 40, cz - 14) + 3.3, cz - 9.7);
    this.addLantern(cx - 38, this.ground(cx - 40, cz - 14) + 3.3, cz - 9.7);
    // outdoor tables
    for (const [dx, dz] of [[-44, -5.5], [-36, -5.5]]) {
      const tb = this.site(cx + dx, cz + dz, 0, 1.6, 0.8);
      table(tb, 1.6, 0.8);
      this.collide(cx + dx, cz + dz, 1.6, 0.8);
    }
    this.spot('tavernTable', cx - 36, cz - 4.3);
    this.spot('tavernTable2', cx - 44, cz - 4.3);

    // --- Garrison (NW block): barracks and yard
    this.place('tiled', cx - 70, cz - 70, 0, { w: 20, d: 7, gable: true, id: 'barracks1' });
    this.place('tiled', cx - 70, cz - 52, Math.PI, { w: 20, d: 7, gable: true, id: 'barracks2' });
    this.prop(weaponRack, cx - 52, cz - 61, Math.PI / 2, 0.8);
    this.prop(dummy, cx - 58, cz - 58, 0, 0.3);
    this.prop(dummy, cx - 58, cz - 64, 0, 0.3);
    this.spot('garrisonYard', cx - 62, cz - 61);
    const gw = this.site(cx - 88, cz - 78, 0, 4, 4);
    watchtower(gw, { levels: 2, base: 4 });
    this.collide(cx - 88, cz - 78, 5, 5);

    // --- Market (SE block)
    const mx = cx + 45, mz = cz + 45;
    this.spot('market', mx, mz);
    this.region.places.zhuoMarket = { x: mx, z: mz };
    const stallColors = [0xa04028, 0x405a78, 0x7a6a40, 0x6a3a5a, 0x3a6a4a, 0x9a7a30];
    const stallSpots = [];
    for (let i = 0; i < 6; i++) {
      const row = i < 3 ? -1 : 1;
      const x = mx - 16 + (i % 3) * 16, z = mz + row * 9;
      const rot = row < 0 ? 0 : Math.PI;
      const st = this.site(x, z, rot, 3, 3);
      stall(st, stallColors[i]);
      jars(st, 2, i + 3);
      this.collide(x, z, 3.4, 2.8, rot);
      const [sx, sz] = this.lw(x, z, rot, 0, -0.6);
      stallSpots.push({ x: sx, z: sz, rot: rot + Math.PI });
      this.spot(`stall${i}`, sx, sz, rot + Math.PI);
    }
    this.marketStalls = stallSpots;
    // shops ringing the market
    this.place('tiled', mx - 30, mz - 26, 0, { w: 10, d: 6, gable: true, id: 'shop_cloth' });
    this.place('tiled', mx + 2, mz - 26, 0, { w: 10, d: 6, id: 'shop_grain' });
    const smithy = this.place('farmhouse', mx + 30, mz - 24, 0, { w: 9, d: 5.5, wall: 'mudbrick', porch: true, id: 'smithy' });
    this.spot('smithy', smithy.door.x + 2.5, smithy.door.z + 0.8, Math.PI);
    this.prop((b) => { b.box('stone', 0, 0, 0, 1.4, 0.9, 1.0); b.box('iron', 0, 0.9, 0, 0.7, 0.25, 0.3); }, mx + 33, mz - 17.5, 0, 0.8); // anvil + forge base
    this.addFire(mx + 36, mz - 17.5);
    this.prop(weaponRack, mx + 27, mz - 17, 0, 0.8);
    this.addSign(mx + 30 - 3.2, this.ground(mx + 30, mz - 24) + 2.2, mz - 24 + 2.9, 0, '鐵匠');
    this.place('twoStorey', mx - 26, mz + 28, Math.PI, { w: 11, d: 7, id: 'inn' });
    this.place('tiled', mx + 6, mz + 30, Math.PI, { w: 12, d: 6, gable: true, id: 'shop_butcher' });
    this.place('tiled', mx + 32, mz + 28, Math.PI, { w: 9, d: 6, id: 'shop_apothecary' });
    this.addSign(mx + 32 + 2.5, this.ground(mx + 32, mz + 28) + 2.2, mz + 28 - 3.1, Math.PI, '藥');
    this.prop(cart, mx - 36, mz, 0.4, 1.4);
    this.prop(well, mx + 18, mz, 0, 1.1);

    // --- Residential courtyards filling remaining blocks
    const reserved = [
      [cx + 45, cz - 50, yw + 6, yd + 22], [cx - 40, cz - 14, 16, 12], [cx - 70, cz - 61, 30, 34], [cx - 88, cz - 78, 8, 8],
      [mx, mz, 84, 76], [cx, cz, 14, 400], [cx, cz, 400, 14],
    ];
    const free = (x, z, w, d) => {
      for (const [rx, rz, rw, rd] of reserved) if (Math.abs(x - rx) < (w + rw) / 2 && Math.abs(z - rz) < (d + rd) / 2) return false;
      return Math.abs(x - cx) < hw - wallT / 2 - w / 2 - 2 && Math.abs(z - cz) < hd - wallT / 2 - d / 2 - 2;
    };
    const plotW = 16, plotD = 17;
    let n = 0;
    for (let lz = -hd + 12; lz < hd - 8; lz += plotD) {
      for (let lx = -hw + 12; lx < hw - 8; lx += plotW) {
        const x = cx + lx + rng.range(-1, 1), z = cz + lz + rng.range(-1, 1);
        if (!free(x, z, plotW - 1, plotD - 1)) continue;
        // face the nearest main street
        const faceSouth = z < cz;
        const rot = faceSouth ? 0 : Math.PI;
        const kind = rng.next();
        if (kind < 0.55) this.place('tiled', x, z, rot, { w: rng.range(9, 12), d: rng.range(5, 6.5), gable: rng.chance(0.6), id: `house_${n}` });
        else if (kind < 0.8) this.place('farmhouse', x, z, rot, { w: rng.range(7, 9), d: 5, wall: 'plaster', id: `house_${n}` });
        else this.place('twoStorey', x, z, rot, { w: 10, d: 6.5, id: `house_${n}` });
        // side courtyard wall
        const B2 = this.site(x, z, rot, 12, 12);
        lowWall(B2, -plotW / 2 + 0.5, -plotD / 2 + 1.5, -plotW / 2 + 0.5, plotD / 2 - 2.5, { h: 2.0 });
        this.collide(...this.lw(x, z, rot, -plotW / 2 + 0.5, -0.5), 0.6, plotD - 4, rot);
        if (rng.chance(0.4)) { const [a, b] = this.lw(x, z, rot, 5, 5.5); this.prop(jars, a, b, 0, 0.6, 2, n); }
        n++;
      }
    }
    // Trees within town (courtyard scholar trees)
    for (let i = 0; i < 18; i++) {
      const x = cx + rng.range(-hw + 10, hw - 10), z = cz + rng.range(-hd + 10, hd - 10);
      if (Math.abs(x - cx) < 9 || Math.abs(z - cz) < 9) continue;
      if (this.world.vegetation.canPlace(x, z, 3, true)) this.world.vegetation.addTree(rng.pick(['elm', 'elm', 'jujube', 'willow']), x, z, rng.range(0.8, 1));
    }
    // Street life props
    for (let i = 0; i < 8; i++) {
      const alongX = rng.chance(0.5);
      const t = rng.range(-hw + 15, hw - 15);
      const x = alongX ? cx + t : cx + rng.sign() * 7.5, z = alongX ? cz + rng.sign() * 7.5 : cz + t;
      if (Math.abs(x - mx) < 42 && Math.abs(z - mz) < 38) continue;
      this.prop(jars, x, z, 0, 0.6, rng.int(1, 3), i + 50);
    }
    this.spot('townCentre', cx, cz);
  }

  buildEstate(s) {
    const rng = new Rng(this.region.seed + 23);
    // Zhang Fei's manor compound (he was a wealthy butcher and wine seller)
    const mx = s.x - 18, mz = s.z - 8, w = 44, d = 36;
    const B = this.site(mx, mz, 0, w, d);
    lowWall(B, -w / 2, -d / 2, w / 2, -d / 2, { h: 2.8 });
    lowWall(B, -w / 2, -d / 2, -w / 2, d / 2, { h: 2.8 });
    lowWall(B, w / 2, d / 2, w / 2, -d / 2, { h: 2.8 });
    lowWall(B, -w / 2, d / 2, -3, d / 2, { h: 2.8 });
    lowWall(B, 3, d / 2, w / 2, d / 2, { h: 2.8 });
    this.collide(mx, mz - d / 2, w, 0.8); this.collide(mx - w / 2, mz, 0.8, d); this.collide(mx + w / 2, mz, 0.8, d);
    this.collide(mx - w / 4 - 1.5, mz + d / 2, w / 2 - 3, 0.8); this.collide(mx + w / 4 + 1.5, mz + d / 2, w / 2 - 3, 0.8);
    const g = this.site(mx, mz + d / 2, 0, 6, 3);
    for (const sd of [-1, 1]) g.cyl('darkwood', sd * 2.4, 0, 0, 0.18, 3.2, { seg: 8 });
    g.roof('roofTile', 0, 3.2, 0, 6, 2.4, 1.3, { type: 'gable', overhang: 0.6, lift: 0.3 });
    const hall = this.place('tiled', mx, mz - 8, 0, { w: 16, d: 8, h: 3.4, platform: 0.8, rise: 2.6, id: 'zhangfei_hall' });
    this.spot('zhangFeiHall', hall.door.x, hall.door.z + 1);
    this.place('tiled', mx - 14, mz + 6, Math.PI / 2, { w: 9, d: 5, gable: true, id: 'zf_west' });
    this.place('farmhouse', mx + 14, mz + 7, -Math.PI / 2, { w: 8, d: 5, id: 'zf_storehouse' });
    const wt = this.site(mx + 17, mz - 13, 0, 4, 4);
    watchtower(wt, { levels: 3, base: 3.8 });
    this.collide(mx + 17, mz - 13, 4.6, 4.6);
    this.addLantern(mx - 2.4, this.ground(mx, mz) + 2.9, mz + d / 2 + 0.3);
    this.addLantern(mx + 2.4, this.ground(mx, mz) + 2.9, mz + d / 2 + 0.3);
    // butcher's stall & wine jars outside the gate
    const bx = mx - 9, bz = mz + d / 2 + 5;
    const st = this.site(bx, bz, 0, 3, 3);
    stall(st, 0x6a2a1a);
    jars(st, 3, 77);
    this.collide(bx, bz, 3.4, 2.8);
    this.spot('butcherStall', bx, bz - 0.6 + 1.8, Math.PI);
    this.prop(jars, mx + 8, mz + d / 2 + 3, 0, 1.0, 5, 91);
    this.addBanner(mx + 5, mz + d / 2 + 2, '酒', { bg: '#e8dcc0', fg: '#1a1a1a', border: '#8a1a12' }, 5.5);
    // Peach orchard east of the manor
    const ox = s.x + 30, oz = s.z + 20;
    this.region.places.peachGarden = { x: ox, z: oz };
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      if (Math.abs(i) <= 1 && Math.abs(j) <= 1) continue; // clearing for the oath altar
      const x = ox + i * 6.5 + rng.range(-1.2, 1.2), z = oz + j * 6.5 + rng.range(-1.2, 1.2);
      this.world.vegetation.addTree('peach', x, z, rng.range(0.9, 1.2));
    }
    this.prop(altar, ox, oz - 2, 0, 1.4);
    this.spot('oathAltar', ox, oz + 0.2, Math.PI);
    this.interact({ id: 'oath_altar', x: ox, z: oz, r: 2.4, label: 'The altar of the Peach Garden', verb: 'examine', kind: 'altar' });
    // a few mats/tables around the altar for the oath feast
    const t1 = this.site(ox - 3.5, oz + 2, Math.PI / 2, 1.6, 0.8); table(t1, 1.6, 0.8);
    const t2 = this.site(ox + 3.5, oz + 2, Math.PI / 2, 1.6, 0.8); table(t2, 1.6, 0.8);
    this.collide(ox - 3.5, oz + 2, 0.8, 1.6); this.collide(ox + 3.5, oz + 2, 0.8, 1.6);
  }

  buildArmyCamp(s) {
    const rng = new Rng(this.region.seed + 31);
    const cx = s.x, cz = s.z, hw = s.w / 2, hd = s.d / 2;
    const B = this.site(cx, cz, 0, s.w, s.d);
    const gate = 8;
    const sides = [
      [[-hw, -hd], [-gate / 2, -hd]], [[gate / 2, -hd], [hw, -hd]],
      [[hw, -hd], [hw, hd]], [[hw, hd], [gate / 2, hd]], [[-gate / 2, hd], [-hw, hd]], [[-hw, hd], [-hw, -hd]],
    ];
    for (const [[ax, az], [bx, bz]] of sides) {
      palisade(B, ax, az, bx, bz);
      const len = Math.hypot(bx - ax, bz - az);
      this.collide(cx + (ax + bx) / 2, cz + (az + bz) / 2, len, 0.5, Math.atan2(-(bz - az), bx - ax));
    }
    this.spot('camp_gate_n', cx, cz - hd - 4);
    // command tent at the rear (south)
    const ct = this.site(cx, cz + hd - 14, Math.PI, 8, 6);
    commandTent(ct, { w: 9, d: 7, color: 0xe0d6c0, roofColor: 0x8a2a1a });
    this.collide(cx, cz + hd - 14, 9.4, 7.4);
    this.spot('commandTent', cx, cz + hd - 19.5, Math.PI);
    this.addBanner(cx - 6, cz + hd - 20, '劉', { bg: '#8a1a12' }, 7.5);
    this.addBanner(cx + 6, cz + hd - 20, '義', { bg: '#1a1a1a', fg: '#e8d8a8', border: '#9a1e14' }, 7.5);
    // tent rows
    for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) {
      const x = cx - hw + 12 + i * 9, z = cz - hd + 12 + r * 12;
      const tb = this.site(x, z, Math.PI / 2, 4, 3);
      tent(tb, { w: 4.2, d: 3.2, h: 2.3, color: rng.pick([0xd8ccb0, 0xc8bca0, 0xd0c4a8]) });
      this.collide(x, z, 3.4, 4.4);
    }
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
      const x = cx + 14 + i * 9, z = cz - hd + 12 + r * 12;
      const tb = this.site(x, z, -Math.PI / 2, 4, 3);
      tent(tb, { w: 4.2, d: 3.2, h: 2.3, color: rng.pick([0xd8ccb0, 0xc8bca0]) });
      this.collide(x, z, 3.4, 4.4);
    }
    // training ground
    const tx = cx - 20, tz = cz + 14;
    this.spot('trainingGround', tx, tz);
    this.region.places.militiaYard = { x: tx, z: tz };
    for (let i = 0; i < 4; i++) this.prop(dummy, tx - 12 + i * 4, tz + 8, 0, 0.3);
    this.prop(weaponRack, tx + 12, tz + 8, 0, 0.8);
    this.prop(weaponRack, tx + 12, tz - 6, 0, 0.8);
    this.addFire(cx + 22, cz + 12, true);
    this.spot('campFire', cx + 22, cz + 14.5);
    this.prop(jars, cx + 30, cz + 20, 0, 0.8, 4, 12);
    this.prop(cart, cx + 34, cz + 6, 0.3, 1.4);
    this.addBanner(cx - 4.5, cz - hd - 1, '漢', { bg: '#8a1a12' }, 7);
    this.addBanner(cx + 4.5, cz - hd - 1, '劉', { bg: '#8a1a12' }, 7);
  }

  buildRebelCamp(s) {
    const rng = new Rng(this.region.seed + 41);
    const cx = s.x, cz = s.z, R = s.w / 2;
    const B = this.site(cx, cz, 0, s.w, s.d);
    const n = 16;
    for (let i = 0; i < n; i++) {
      if (i === 4 || i === 12) continue; // gaps (entrances south & north)
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const ax = Math.cos(a0) * R, az = Math.sin(a0) * R * 0.85, bx = Math.cos(a1) * R, bz = Math.sin(a1) * R * 0.85;
      B.frame(cx, this.ground(cx + (ax + bx) / 2, cz + (az + bz) / 2), cz, 0);
      palisade(B, ax, az, bx, bz, { h: 2.8 });
      const len = Math.hypot(bx - ax, bz - az);
      this.collide(cx + (ax + bx) / 2, cz + (az + bz) / 2, len, 0.5, Math.atan2(-(bz - az), bx - ax));
    }
    this.spot('yt_gate_s', cx, cz + R * 0.85 + 5);
    this.spot('yt_gate_n', cx, cz - R * 0.85 - 5);
    // central altar platform with banners: 蒼天已死 黃天當立
    const al = this.site(cx, cz, 0, 8, 8);
    al.box('rammed', 0, -0.4, 0, 8, 1.4, 8, { uv: 2 });
    al.box('stone', 0, 1.0, 0, 3, 0.2, 3);
    al.cyl('bronze', 0, 1.2, 0, 0.5, 0.7, { r2: 0.6, seg: 14 });
    this.collide(cx, cz, 8, 8, 0, { top: 1.0 });
    this.surfaces.push({ x: cx, z: cz, hw: 4, hd: 4, c: 1, s: 0, y: this.ground(cx, cz, 8, 8) + 1.0 });
    this.spot('ytAltar', cx, cz + 5.5);
    this.addBanner(cx - 3, cz - 3, '黃天', { bg: '#c8a020', fg: '#3a2a10', border: '#6a4a10' }, 8);
    this.addBanner(cx + 3, cz - 3, '當立', { bg: '#c8a020', fg: '#3a2a10', border: '#6a4a10' }, 8);
    const tentsN = 16;
    for (let i = 0; i < tentsN; i++) {
      const a = (i / tentsN) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const r = R * rng.range(0.5, 0.72);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.85;
      if (Math.abs(x - cx) < 6 && Math.abs(Math.abs(z - cz) - R * 0.7) < 10) continue;
      const tb = this.site(x, z, -a, 4, 3);
      tent(tb, { w: 3.8, d: 3, h: 2.1, color: rng.pick([0xb8a070, 0xa89060, 0xc0a878, 0x9a8a6a]) });
      this.collide(x, z, 3.8, 3.2, -a);
    }
    this.addFire(cx + 14, cz + 10, true);
    this.addFire(cx - 16, cz - 8);
    this.addFire(cx - 8, cz + 18);
    this.spot('ytFire', cx + 14, cz + 13);
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, Math.PI * 2);
      this.addBanner(cx + Math.cos(a) * R * 0.9, cz + Math.sin(a) * R * 0.78, rng.pick(['黃', '天', '太平']), { bg: '#c8a020', fg: '#3a2a10', border: '#6a4a10' }, 6);
    }
    // watch platforms
    for (const a of [Math.PI * 0.5 - 0.3, Math.PI * 0.5 + 0.3]) {
      const x = cx + Math.cos(a) * (R - 5), z = cz + Math.sin(a) * (R - 5) * 0.85;
      const wb = this.site(x, z, 0, 3, 3);
      for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) wb.cyl('wood', px * 1.2, 0, pz * 1.2, 0.1, 4.2, { seg: 5 });
      wb.box('wood', 0, 4.2, 0, 3, 0.15, 3);
      wb.box('wood', 0, 4.35, 1.45, 3, 0.9, 0.08);
      wb.roof('thatch', 0, 5.6, 0, 2.6, 2.6, 0.9, { type: 'pyramid', overhang: 0.4 });
      this.collide(x, z, 2.8, 2.8);
    }
    this.prop(cart, cx - 22, cz + 16, 1.2, 1.4);
    this.prop(jars, cx + 20, cz - 14, 0, 0.9, 5, 33);
  }

  buildBanditCamp(s) {
    const rng = new Rng(this.region.seed + s.x);
    const cx = s.x, cz = s.z;
    this.addFire(cx, cz);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const x = cx + Math.cos(a) * 9, z = cz + Math.sin(a) * 9;
      const tb = this.site(x, z, -a + Math.PI / 2, 4, 3);
      tent(tb, { w: 3.4, d: 2.8, h: 1.9, color: rng.pick([0x8a7a5a, 0x7a6a50, 0x6a5a44]) });
      this.collide(x, z, 3.4, 3, -a + Math.PI / 2);
    }
    this.prop(jars, cx + 5, cz - 6, 0, 0.8, 3, 5);
    this.prop(firewood, cx - 6, cz + 5, 0.5, 0.8);
    this.prop(cart, cx + 12, cz + 8, 2.2, 1.4);
    // crude stake barricade
    const B = this.site(cx, cz, 0, 20, 20);
    palisade(B, -16, -14, -4, -18, { h: 2.2 });
    palisade(B, 6, -18, 16, -12, { h: 2.2 });
    this.spot(`${s.id}_centre`, cx, cz + 3);
    this.interact({ id: `${s.id}_chest`, x: cx + 3, z: cz - 5, r: 1.8, label: 'Search the bandit stash', verb: 'loot', kind: 'chest' });
    const cb = this.site(cx + 3, cz - 6, 0, 1, 1);
    cb.box('darkwood', 0, 0, 0, 1.2, 0.7, 0.8);
    cb.box('iron', 0, 0.5, 0.41, 0.2, 0.2, 0.02);
  }

  update(dt, time, sky) {
    for (const u of this.banners) u.uTime.value = time;
    const night = sky.nightFactor ?? 0;
    const cam = this.world.engine.camera.position;
    for (const f of this.fires) {
      f.mesh.userData.uni.uTime.value = time;
      const d = Math.hypot(cam.x - f.x, cam.z - f.z);
      const flick = 0.8 + 0.2 * Math.sin(time * 13 + f.x) * Math.sin(time * 7.3 + f.z);
      f.light.intensity = d < 140 ? f.base * flick * (0.35 + night * 0.9) : 0;
      f.light.visible = d < 140;
    }
    for (const l of this.lanterns) l.material.emissiveIntensity = 0.15 + night * 2.8;
  }
}

function makeFlame(scale = 1) {
  const uni = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9,78.2)))*43758.5); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){
        vec2 uv = vUv; float y = uv.y;
        float w = 0.5 - abs(uv.x - 0.5);
        float t = n(vec2(uv.x * 5.0, y * 3.0 - uTime * 3.5)) * 0.6 + n(vec2(uv.x*11.0, y*7.0 - uTime*6.0))*0.4;
        float shape = smoothstep(0.0, 0.35, w * (1.2 - y) * 2.2 - y * 0.35 + t * 0.35 - 0.1);
        vec3 col = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.85, 0.4), smoothstep(0.2, 0.9, shape) * (1.0 - y));
        gl_FragColor = vec4(col * 1.6, shape * (1.0 - y * 0.8));
      }`,
  });
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1 * scale, 1.6 * scale), mat);
    p.position.y = 0.8 * scale;
    p.rotation.y = (i / 3) * Math.PI;
    g.add(p);
  }
  g.userData.uni = uni;
  return g;
}

function makeNoticeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#5a3a20'; g.fillRect(0, 0, 256, 128);
  const papers = [[8, 10, 110, 108], [128, 6, 120, 114]];
  for (const [x, y, w, h] of papers) {
    g.fillStyle = '#e8dcc0'; g.fillRect(x, y, w, h);
    g.fillStyle = '#2a2018';
    g.font = '13px "Ma Shan Zheng", "WenQuanYi Zen Hei", serif';
    const text = '招募義兵討黃巾賊保境安民幽州太守劉焉告示天下';
    let k = 0;
    for (let col = 0; col < 7; col++) for (let row = 0; row < 7; row++) {
      g.fillText(text[k++ % text.length], x + w - 14 - col * 15, y + 16 + row * 14);
    }
    g.fillStyle = '#b02010'; g.fillRect(x + 8, y + h - 24, 16, 16);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
