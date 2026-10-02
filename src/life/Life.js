// Town and village life for a region: working people with their tools, performers, beggars,
// the market cockpit, and the street behaviour around the player (hawking, gossip, rain, curfew).
import * as THREE from 'three';
import { assets } from '../core/Assets.js';
import { Rng } from '../core/Rng.js';
import { PROPS } from './Props.js';
import { BARKS, pick } from './barkLines.js';
import { randomName } from '../entities/Population.js';
import { randomAppearance } from '../entities/Humanoid.js';
import { Activities } from './Activities.js';
import { Wildlife } from './Wildlife.js';
import { Livestock } from './Livestock.js';
import { Critters } from '../world/Critters.js';
import { Atmos } from '../world/Atmos.js';
import { Encounters } from './Encounters.js';

const PENTA = [0, 2, 4, 7, 9];

export class Life {
  constructor(game) {
    this.g = game;
    this.rng = new Rng((game.world.region.seed || 1) * 13 + 5);
    this.group = new THREE.Group();
    game.engine.scene.add(this.group);
    this.anims = [];
    this.musicians = [];
    this.storytellers = [];
    this.nextAmbient = 3;
    this.nextChat = 5;
    this.act = new Activities(this);
    try { game.wildlife = new Wildlife(game); } catch (e) { console.warn('wildlife', e); game.wildlife = null; }
    try { this.atmos = new Atmos(game); } catch (e) { console.warn('atmos', e); }
    try { this.livestock = new Livestock(game); } catch (e) { console.warn('livestock', e); }
    try { this.critters = new Critters(game); } catch (e) { console.warn('critters', e); }
    this.enc = new Encounters(game);
    this.nextShelter = 0;
    this.nextLamp = 0;
    for (const s of game.world.region.settlements) {
      try {
        if (s.type === 'walledTown') this.buildTown(s);
        else if (s.type === 'village' || s.type === 'hamlet') this.buildVillage(s);
        else if (s.type === 'armyCamp' && (!s.faction || s.faction === 'han')) this.act.archeryRange(s.x - s.w / 2 + 16, s.z + s.d / 2 - 14, Math.PI / 2, `${s.id}_range`);
      } catch (e) { console.warn('life build', s.id, e); }
    }
  }

  // ---- placement helpers ---------------------------------------------------------
  clear(x, z, r) {
    const W = this.g.world;
    if (W.hf.waterAt(x, z) !== null) return false;
    for (const c of W.colliders.query(x, z, r + 2)) {
      if (c.disabled) continue;
      if (c.type === 'circle') { if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false; }
      else {
        const dx = x - c.x, dz = z - c.z, lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
        if (Math.abs(lx) < c.hw + r && Math.abs(lz) < c.hd + r) return false;
      }
    }
    return true;
  }
  free(x, z, r = 1, maxR = 14) {
    if (this.clear(x, z, r)) return [x, z];
    for (let rr = 1.5; rr <= maxR; rr += 1.5) for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + rr;
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      if (this.clear(px, pz, r)) return [px, pz];
    }
    return [x, z];
  }
  place(mesh, x, z, rot = 0, collideR = 0) {
    mesh.position.set(x, this.g.world.groundHeight(x, z), z);
    mesh.rotation.y = rot;
    this.group.add(mesh);
    if (collideR) this.g.world.colliders.addCircle(x, z, collideR, { kind: 'prop' });
    return mesh;
  }
  // a model from the asset manifest, if there is one (else nothing is placed)
  asset(section, key, x, z, rot = 0, collideR = 0, v = 0) {
    const o = assets.instance(section, key, v);
    return o ? this.place(o, x, z, rot, collideR) : null;
  }
  npc(role, look, x, z, schedule, extra = {}) {
    const female = look === 'woman';
    return this.g.population.spawn({ ...randomName(this.rng, female), role, faction: 'civilian', x, z, appearance: randomAppearance(look, this.rng), brain: { mode: 'schedule', schedule }, ...extra });
  }
  day(from, to, x, z, act, extra = {}, home = null) {
    const h = home || { x, z };
    return [{ from, to, x, z, act, ...extra }, { from: to, to: from, x: h.x, z: h.z, act: 'sleep' }];
  }

  // ---- a county town -----------------------------------------------------------
  buildTown(s) {
    const g = this.g, S = g.world.settlements.spots, cx = s.x, cz = s.z;
    const mx = cx + 45, mz = cz + 45;
    const gateIn = S[`${s.id}Gate_south_in`] || { x: cx, z: cz + s.d / 2 - 12 };
    const gateOut = S[`${s.id}Gate_south_out`] || { x: cx, z: cz + s.d / 2 + 10 };
    const R = this.rng;

    // street sweepers in front of the shops
    for (let i = 0; i < 3; i++) {
      const along = R.chance(0.5), t = R.range(20, 70) * R.sign();
      const [x, z] = this.free(along ? cx + t : cx + R.sign() * 6, along ? cz + R.sign() * 6 : cz + t, 0.6);
      this.npc('townsman', R.chance(0.4) ? 'woman' : 'farmer', x, z, [
        { from: 6, to: 11, x, z, act: 'sweep', rot: R.range(0, 6.28) },
        { from: 11, to: 18, x: cx + R.range(-60, 60), z: cz + R.range(-3, 3), act: 'wander', r: 12 },
        { from: 18, to: 6, x, z, act: 'sleep' },
      ]);
    }
    // porters with carrying poles between the market and the south gate; a sack-carrier at the granary
    for (let i = 0; i < 2; i++) {
      const a = { x: mx - 30 + i * 4, z: mz + R.range(-2, 2) };
      this.npc('farmer', 'farmer', a.x, a.z, [{ from: 7, to: 17, x: a.x, z: a.z, act: 'haul', to: { x: gateIn.x + R.range(-3, 3), z: gateIn.z - 4 }, prop: 'pole' }, { from: 17, to: 7, x: a.x, z: a.z, act: 'sleep' }]);
    }
    this.npc('farmer', 'farmer', mx - 33, mz + 2, [{ from: 7, to: 18, x: mx - 33, z: mz + 2, act: 'haul', to: { x: mx + 2, z: mz - 21 }, prop: 'sack', pose: 'carrySack', speed: 1.0 }, { from: 18, to: 7, x: mx - 33, z: mz + 2, act: 'sleep' }]);
    // a woman going to market with a basket
    for (let i = 0; i < 2; i++) {
      const a = this.free(mx + R.range(-20, 20), mz + R.range(-4, 4), 0.5);
      this.npc('townsman', 'woman', a[0], a[1], [{ from: 7, to: 13, x: a[0], z: a[1], act: 'wander', r: 14, carry: 'basket' }, { from: 13, to: 18, x: cx + R.range(-50, 50), z: cz, act: 'wander', r: 20 }, { from: 18, to: 7, x: a[0], z: a[1], act: 'sleep' }]);
    }
    // washerwomen at the town well
    this.washers(mx + 18, mz, 2);
    // the woodcutter behind the inn, beside a woodpile the player can work at
    const [wx, wz] = this.free(mx - 34, mz + 20, 1.2);
    this.act.woodpile(wx, wz, `${s.id}_wood`);
    this.npc('farmer', 'farmer', wx + 2.2, wz + 1, this.day(7, 17, wx + 2.2, wz + 1, 'chop', { rot: -Math.PI / 2 }), { appearance: { ...randomAppearance('farmer', R), bare: true, build: 1.2 } });
    // beggars by the gate and the market
    for (const [bx, bz] of [[gateIn.x + 5, gateIn.z - 2], [mx - 20, mz + 13]]) {
      const [x, z] = this.free(bx, bz, 0.6);
      this.npc('beggar', 'elder', x, z, this.day(7, 20, x, z, 'beg', { rot: R.range(0, 6.28) }), { appearance: { ...randomAppearance('elder', R), robe: 0x5a5040, trousers: 0x4a4030 } });
    }
    // performers: a juggler with an audience, a qin player, a storyteller with listeners
    const [jx, jz] = this.free(mx - 6, mz + 1.5, 1);
    const jug = this.npc('performer', 'farmer', jx, jz, this.day(9, 18, jx, jz, 'juggle', { rot: Math.PI }), { appearance: { ...randomAppearance('farmer', R), robe: 0xa0302a, trousers: 0x2a2a3a, headwear: 'wrap', headCloth: 0xd8a830 } });
    jug.title = 'street acrobat';
    this.juggler(jug);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI + (i - 1) * 0.6, x = jx + Math.sin(a) * 3, z = jz + Math.cos(a) * 3;
      this.npc('townsman', i === 1 ? 'woman' : 'farmer', x, z, this.day(10, 16, x, z, 'watch', { rot: Math.atan2(jx - x, jz - z) }));
    }
    const [qx, qz] = this.free(mx + 31, mz + 1, 1);
    const qin = this.npc('performer', 'elder', qx, qz, this.day(8, 21, qx, qz, 'qin', { rot: Math.PI }), { appearance: { ...randomAppearance('elder', R), robe: 0x2a3a4a, headwear: 'wrap' } });
    qin.title = 'qin player';
    this.place(PROPS.qin(), qx - Math.sin(0) * 0, qz - 0.55, Math.PI / 2);
    this.musicians.push({ c: qin, next: 0, phrase: [] });
    const [sx, sz] = this.free(mx - 10, mz + 17, 1.2);
    const st = this.npc('storyteller', 'elder', sx, sz, this.day(9, 20, sx, sz, 'storyteller', { rot: Math.PI }));
    st.title = 'storyteller 說書人';
    this.place(PROPS.lowTable(), sx, sz - 0.7, 0, 0.5);
    this.storytellers.push({ c: st, next: 0, line: 0 });
    for (let i = 0; i < 4; i++) {
      const a = Math.PI + (i - 1.5) * 0.45, x = sx + Math.sin(a) * 3.2, z = sz + Math.cos(a) * 3.2;
      this.npc('townsman', i === 2 ? 'woman' : R.pick(['farmer', 'elder', 'merchant']), x, z, this.day(10, 19, x, z, 'listen', { rot: Math.atan2(sx - x, sz - z) }));
    }
    // the cockpit, the touhu pot outside the tavern, the strongman at a tavern table
    this.act.cockpit(...this.free(mx - 29, mz - 12, 2.6), `${s.id}_cockpit`);
    this.act.touhu(...this.free(cx - 44, cz - 0.5, 0.8), `${s.id}_touhu`);
    const tt = { x: cx - 36, z: cz - 4.3 };
    const sm = this.npc('strongman', 'farmer', tt.x + 0.9, tt.z, this.day(11, 23, tt.x + 0.9, tt.z, 'drink', { rot: -Math.PI / 2 }), { appearance: { ...randomAppearance('farmer', R), bare: true, build: 1.3, height: 1.86, beard: 'bristly' } });
    sm.name = R.pick(['Big Niu', 'Iron Arm Zhao', 'Ox-Head Wang']); sm.title = 'tavern strongman';
    // benches outside the tavern and around the market square
    for (const [bx, bz, br] of [[cx - 40.5, cz - 3.2, 0], [cx - 31.5, cz - 3.2, 0], [mx - 22, mz + 6, Math.PI / 2], [mx + 22, mz - 6, -Math.PI / 2]]) {
      const [px, pz] = this.free(bx, bz, 1.0);
      this.asset('props', 'bench', px, pz, br, 0.5);
    }
    // services: barber, horse dealer, granary foreman
    const [bx, bz] = this.free(mx + 10, mz + 16, 0.8);
    this.place(PROPS.stool(), bx + 0.8, bz, 0, 0.3);
    const barber = this.npc('barber', 'merchant', bx, bz, this.day(8, 18, bx, bz, 'idle', { rot: Math.PI / 2 }));
    barber.title = 'barber';
    const [hx, hz] = this.free(gateOut.x + 12, gateOut.z + 6, 1.5);
    const dealer = this.npc('horsedealer', 'merchant', hx, hz, this.day(7, 19, hx, hz, 'stand', { rot: -Math.PI / 2 }));
    dealer.title = 'horse dealer';
    this.act.horseLine(hx + 3, hz, dealer);
    this.act.raceCourse(s, `${s.id}_race`);
    const [scx, scz] = this.free(mx + 20, mz + 15, 1);
    this.place(PROPS.lowTable(), scx, scz + 0.7, 0, 0.5);
    const scr = this.npc('scribe', 'elder', scx, scz, this.day(8, 18, scx, scz, 'storyteller', { rot: 0 }), { appearance: { ...randomAppearance('official', R), headwear: 'official' } });
    scr.title = 'letter-writer 代書';
    const [fx, fz] = this.free(mx + 8, mz - 19, 0.6);
    const fm = this.npc('foreman', 'merchant', fx, fz, this.day(7, 18, fx, fz, 'stand', { rot: Math.PI }));
    fm.title = 'granary foreman';
    this.act.granary = { cart: { x: mx - 33, z: mz + 1.5 }, door: { x: mx + 2, z: mz - 21.5 }, foreman: fm };
    // children chasing about the market
    for (let i = 0; i < 2; i++) {
      const [x, z] = this.free(mx + R.range(-15, 15), mz + R.range(-3, 3), 0.5);
      this.npc('child', 'child', x, z, [{ from: 8, to: 18, x, z, act: 'wander', r: 16, speed: 2.4 }, { from: 18, to: 8, x, z, act: 'sleep' }]);
    }
    // the Earth God shrine and the garrison's archery range
    this.act.shrine(...this.free(cx + 58, cz - 14, 1.6), `${s.id}_shrine`);
    this.act.archeryRange(cx - 49, cz - 61, -Math.PI / 2, `${s.id}_range`);
  }

  buildVillage(s) {
    const R = this.rng;
    const well = s.type === 'hamlet' ? { x: s.x + 2, z: s.z + 2 } : { x: s.x - 2, z: s.z + 2 };
    this.washers(well.x, well.z, 2);
    const [wx, wz] = this.free(s.x + R.range(-20, 20), s.z + R.range(-15, 15), 1.2);
    this.act.woodpile(wx, wz, `${s.id}_wood`);
    this.npc('farmer', 'farmer', wx + 2.2, wz + 1, this.day(7, 12, wx + 2.2, wz + 1, 'chop', { rot: -Math.PI / 2 }));
    this.act.shrine(...this.free(s.x + s.w / 2 - 8, s.z - s.d / 2 + 8, 1.6), `${s.id}_shrine`);
    // a dry-stone pen at the edge of the village
    if (assets.has('props', 'stoneWall')) {
      const a = R.range(0, Math.PI * 2), r = Math.max(s.w, s.d) / 2 + 6;
      const [px, pz] = this.free(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, 6);
      const rot = -a + Math.PI / 2, c = Math.cos(rot), sn = Math.sin(rot);
      for (const [lx, lz, lr] of [[-4, 0, 0], [0, 0, 0], [4, 0, 0], [6, 2.1, Math.PI / 2], [6, 6.1, Math.PI / 2]]) {
        const wx = px + lx * c + lz * sn, wz = pz - lx * sn + lz * c;
        const w = this.asset('props', 'stoneWall', wx, wz, rot + lr);
        if (w) this.g.world.colliders.addBox(wx, wz, 2, 0.35, -(rot + lr), { kind: 'wall' });
      }
    }
    // an old man fishing if there is water near the village
    const hf = this.g.world.hf;
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * Math.PI * 2, r = 40 + (k % 6) * 15;
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      if (hf.waterAt(x, z) !== null) continue;
      const ax = x + Math.cos(a) * 3, az = z + Math.sin(a) * 3;
      if (hf.waterAt(ax, az) === null) continue;
      const f = this.npc('fisherman', 'elder', x, z, this.day(6, 17, x, z, 'fish', { rot: a + 0 }));
      f.title = 'fisherman';
      break;
    }
    for (let i = 0; i < 2; i++) {
      const [x, z] = this.free(s.x + R.range(-15, 15), s.z + R.range(-10, 10), 0.5);
      this.npc('child', 'child', x, z, [{ from: 8, to: 18, x, z, act: 'wander', r: 14, speed: 2.4 }, { from: 18, to: 8, x, z, act: 'sleep' }]);
    }
  }

  washers(x, z, n) {
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + 0.5, px = x + Math.cos(a) * 1.7, pz = z + Math.sin(a) * 1.7;
      const rot = Math.atan2(x - px, z - pz);
      this.place(PROPS.basin(), px + Math.sin(rot) * 0.6, pz + Math.cos(rot) * 0.6, rot);
      this.npc('villager', 'woman', px, pz, this.day(7, 12, px, pz, 'wash', { rot }));
    }
  }

  juggler(c) {
    const balls = [0xc83020, 0xe8c040, 0x3060a0].map((col) => { const b = PROPS.ball(col); this.group.add(b); return b; });
    const v = new THREE.Vector3();
    this.anims.push((t) => {
      const on = !c.dead && c.ai?.arrived && c.ai.activity?.act === 'juggle' && !c.ai.hidden;
      for (const b of balls) b.visible = on;
      if (!on) return;
      c.model.bones.chest.getWorldPosition(v);
      const yaw = c.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      balls.forEach((b, i) => {
        const ph = t * 3.2 + (i * Math.PI * 2) / 3;
        const side = Math.cos(ph) * 0.28, up = Math.abs(Math.sin(ph)) * 0.85;
        b.position.set(v.x + fx * 0.38 + rx * side, v.y + 0.05 + up, v.z + fz * 0.38 + rz * side);
      });
    });
  }

  // ---- per frame -----------------------------------------------------------------
  update(dt) {
    const g = this.g, p = g.player, t = g.clockTime;
    if (!p) return;
    for (const f of this.anims) f(t, dt);
    this.act.update(dt);
    this.g.wildlife?.update(dt);
    this.atmos?.update(dt);
    this.livestock?.update(dt);
    this.critters?.update(dt);
    this.enc.update(dt);
    this.shelter(dt);
    this.lamps(dt);
    // the qin player's music carries across the market
    for (const m of this.musicians) {
      const c = m.c, d = c.distTo(p);
      if (c.dead || c.ai.hidden || !c.ai.arrived || d > 18 || !g.audio.enabled) continue;
      m.next -= dt;
      if (m.next > 0) continue;
      if (!m.phrase.length) {
        let deg = Math.floor(Math.random() * 5);
        for (let i = 0; i < 5 + Math.floor(Math.random() * 5); i++) { deg = Math.max(0, Math.min(9, deg + [-1, 1, 1, -2, 2, 0][Math.floor(Math.random() * 6)])); m.phrase.push({ k: PENTA[deg % 5] + 12 * Math.floor(deg / 5), d: [0.4, 0.6, 0.8, 1.2][Math.floor(Math.random() * 4)] }); }
        m.next = 1.5 + Math.random() * 2;
        continue;
      }
      const n = m.phrase.shift();
      g.audio.pluck(196 * Math.pow(2, n.k / 12), 0.55 * (1 - d / 18), g.audio.sfx);
      m.next = n.d;
    }
    // the storyteller's tale, overheard in pieces
    for (const s of this.storytellers) {
      const c = s.c;
      if (c.dead || c.ai.hidden || !c.ai.arrived || c.distTo(p) > 12) continue;
      s.next -= dt;
      if (s.next > 0) continue;
      const lines = this.act.taleLines();
      g.barks.say(c, lines[s.line % lines.length], 4.5);
      s.line++;
      s.next = 6;
    }
    // well-fed and blessed
    const b = p.buffs || (p.buffs = {});
    if (b.fed > g.clockTime) p.stamina = Math.min(p.staminaMax, p.stamina + dt * 3);
    if (b.blessed > g.clockTime && Math.random() < dt * 0.2) p.heal(0.5);
    this.ambient(dt);
    this.chats(dt);
  }

  ambient(dt) {
    const g = this.g, p = g.player;
    this.nextAmbient -= dt;
    if (this.nextAmbient > 0 || g.dialogue.active || g.cutscene || g.inCombat) return;
    this.nextAmbient = 2.5 + Math.random() * 3.5;
    const town = g.locationKind === 'walledTown' || g.locationKind === 'village' || g.locationKind === 'hamlet' || g.locationKind === 'armyCamp';
    const near = g.entities.nearby(p.pos, 13).filter((c) => c !== p && !c.dead && c.ai && !c.ai.hidden && !c.ai.script && !(c.ai.fighter && c.combat.target) && !c.tags.has('brawling'));
    if (!near.length) return;
    const c = near[Math.floor(Math.random() * near.length)];
    const hr = g.time.hour, rain = g.weather?.rain || 0;
    const guard = g.social.temperament(c) === 'guard';
    if (p.combat.drawn && town && g.locationKind !== 'armyCamp' && !g.social.brawl && c.distTo(p) < 8) {
      g.barks.say(c, pick(guard ? BARKS.weaponGuard : BARKS.weaponCivilian), 2.6);
      if (!guard && c.faction === 'civilian' && c.ai.fighter !== true) g.social.cower(c, 2.5);
    } else if (rain > 0.45 && c.faction === 'civilian' && Math.random() < 0.6) {
      g.barks.say(c, pick(BARKS.rain), 2.4);
    } else if (guard && (hr > 21 || hr < 5) && town) {
      g.barks.say(c, pick(BARKS.curfew), 3);
    } else if (c.shop && BARKS.hawk[c.shop] && hr > 7 && hr < 18) {
      g.barks.say(c, pick(BARKS.hawk[c.shop]), 2.8);
    } else if (c.role === 'beggar' && c.distTo(p) < 6) {
      g.barks.say(c, pick(BARKS.greet.beggar), 2.6);
    } else if (c.distTo(p) < 2.2 && Math.hypot(p.vel.x, p.vel.z) > 3) {
      g.barks.say(c, pick(BARKS.passing), 2);
    }
  }

  // two passers-by stop and talk
  chats(dt) {
    const g = this.g, p = g.player;
    this.nextChat -= dt;
    if (this.nextChat > 0) return;
    this.nextChat = 7 + Math.random() * 9;
    const idle = (c) => c.faction === 'civilian' && c.ai && !c.ai.override && !c.ai.script && !c.ai.hidden && c.ai.activity?.act === 'wander' && !c.shop;
    const pool = g.entities.nearby(p.pos, 26).filter((c) => c !== p && !c.dead && idle(c));
    for (const a of pool) {
      const b = pool.find((o) => o !== a && o.distTo(a) < 7);
      if (!b) continue;
      const lines = pick(BARKS.chats);
      const mx = (a.pos.x + b.pos.x) / 2, mz = (a.pos.z + b.pos.z) / 2;
      const ang = Math.atan2(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      const until = g.clockTime + 9 + Math.random() * 6;
      const set = (c, other, sx, k) => {
        let said = false;
        c.ai.override = () => {
          if (g.clockTime > until || c.dead) return false;
          if (c.ai.navTo(mx + Math.sin(ang) * sx, mz + Math.cos(ang) * sx, 1.3, 0.4)) {
            c.faceYaw = Math.atan2(other.pos.x - c.pos.x, other.pos.z - c.pos.z);
            if (c.model.anim.loopClip?.name !== 'talk') c.model.anim.setLoop('talk');
            if (!said && g.clockTime > until - 9 + k * 3.2) { said = true; g.barks.say(c, lines[k] || pick(['Hm.', 'Truly.', 'Ha!']), 3.2); }
          }
          return true;
        };
      };
      set(a, b, 0.8, 0); set(b, a, -0.8, 1);
      return;
    }
  }

  // service and performer conversations
  async talk(c) { if (await this.enc.talk(c)) return true; return this.act.talk(c); }

  // in a downpour, people hurry under the nearest eaves until it passes
  shelter(dt) {
    const g = this.g, rain = g.weather?.rain || 0;
    this.nextShelter -= dt;
    if (rain < 0.45 || this.nextShelter > 0) return;
    this.nextShelter = 1.2;
    const blds = g.world.settlements.buildings || [];
    const cand = g.entities.nearby(g.player.pos, 80).filter((c) => c.faction === 'civilian' && c.ai && !c.ai.override && !c.ai.script && !c.ai.hidden && !c.shop && !['performer', 'storyteller', 'beggar'].includes(c.role) && ['wander', 'haul', 'sweep', 'wash', 'basket'].includes(c.ai.activity?.act));
    for (const c of cand.slice(0, 2)) {
      let best = null, bd = 45;
      for (const b of blds) { const d = Math.hypot(b.door.x - c.pos.x, b.door.z - c.pos.z); if (d < bd) { bd = d; best = b; } }
      if (!best) continue;
      const dx = best.x - best.door.x, dz = best.z - best.door.z, L = Math.hypot(dx, dz) || 1;
      const side = (Math.random() - 0.5) * 3;
      const sx = best.door.x + (dx / L) * 1.05 + (dz / L) * side, sz = best.door.z + (dz / L) * 1.05 - (dx / L) * side;
      c.model.setProp(null);
      c.ai.override = () => {
        if ((g.weather?.rain || 0) < 0.25) return false;
        if (c.ai.navTo(sx, sz, 3.4, 0.5)) { c.faceYaw = Math.atan2(-dx, -dz); c.model.anim.setPose('armsCrossed'); }
        return true;
      };
    }
  }

  // the night watch carries lanterns
  lamps(dt) {
    this.nextLamp -= dt;
    if (this.nextLamp > 0) return;
    this.nextLamp = 2;
    const g = this.g, night = (g.world.sky?.nightFactor ?? 0) > 0.45;
    for (const c of g.entities.nearby(g.player.pos, 160)) {
      if (c.role !== 'guard' || c.dead) continue;
      if (night && !c.model.propKind) c.model.setProp('lantern');
      else if (!night && c.model.propKind === 'lantern') c.model.setProp(null);
    }
  }
  interact(it) { return this.act.interact(it); }
  extraInteractables() { return [...this.act.dynamic(), ...(this.g.wildlife?.carcasses() || [])]; }
}
