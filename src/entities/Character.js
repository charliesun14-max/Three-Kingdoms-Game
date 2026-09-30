// Gameplay character: stats, equipment, movement physics and combat state.
import * as THREE from 'three';
import { CharacterModel } from './CharacterModel.js';
import { WEAPONS } from '../combat/Weapons.js';
import { ARMORS, Inventory } from '../rpg/Items.js';
import { clamp, dampAngle, angleDiff } from '../core/MathUtil.js';

let NEXT_ID = 1;
export const ATTACK_DIRS = ['left', 'right', 'overhead', 'thrust'];

export class Character {
  constructor(game, o = {}) {
    this.game = game;
    this.id = o.id || `c${NEXT_ID++}`;
    this.name = o.name || 'Stranger';
    this.cn = o.cn || '';
    this.title = o.title || '';
    this.faction = o.faction || 'civilian';
    this.role = o.role || 'civilian';
    this.tags = new Set(o.tags || []);
    this.baseLook = { ...(o.appearance || {}) };
    this.stats = { str: 8, agi: 8, vit: 8, blade: 3, polearm: 3, unarmed: 3, block: 3, archery: 2, speech: 5, leadership: 1, stealth: 3, ...(o.stats || {}) };
    this.equip = { weapon: o.weapon || 'fists', shield: !!o.shield, body: o.body || null, head: o.head || null };
    this.inventory = o.inventory || new Inventory();
    this.hpMax = o.hp || this.computeHpMax();
    this.hp = this.hpMax;
    this.staminaMax = 100 + this.stats.vit * 3;
    this.stamina = this.staminaMax;
    this.bleed = 0;
    this.food = 80;
    this.dead = false;
    this.pos = new THREE.Vector3(o.x || 0, 0, o.z || 0);
    this.vel = new THREE.Vector3();
    this.desired = new THREE.Vector3(); // desired horizontal velocity
    this.yaw = o.yaw || 0;
    this.faceYaw = null; // optional forced facing
    this.radius = 0.34;
    this.speedMul = 1;
    this.sneak = false;
    this.essential = !!o.essential; // cannot die (story characters) — they get knocked down instead
    this.combat = {
      drawn: false, target: null, attack: null, blocking: false, blockStart: -9, riposteUntil: -9, staggerUntil: -9,
      guardDir: 'right', dodgeUntil: -9, lastHit: -9, attackDir: 'right', cooldown: 0, knockedUntil: -9,
    };
    this.ai = null;
    this.dialogue = o.dialogue || null;
    this.home = o.home || null;
    this.buildModel();
    this.pos.y = game.world ? game.world.groundHeight(this.pos.x, this.pos.z) : 0;
  }

  computeHpMax() { return 70 + this.stats.vit * 5; }

  get weapon() { return WEAPONS[this.equip.weapon] || WEAPONS.fists; }
  get weaponCls() { return this.weapon.cls; }
  get alive() { return !this.dead; }
  get time() { return this.game.clockTime; }

  look() {
    const ap = { ...this.baseLook };
    for (const slot of ['body', 'head']) {
      const a = ARMORS[this.equip[slot]];
      if (a && a.look) {
        for (const [k, v] of Object.entries(a.look)) {
          if (k === 'outfit' && ['robe', 'official', 'woman', 'merchant'].includes(ap.outfit) && !a.look.armor) continue;
          ap[k] = v;
        }
      }
    }
    return ap;
  }

  buildModel() {
    const old = this.model;
    this.model = new CharacterModel(this.look());
    this.model.root.userData.character = this;
    this.model.setWeapon(this.equip.weapon, this.combat.drawn);
    this.model.setShield(this.equip.shield);
    if (old) {
      const parent = old.root.parent;
      old.dispose();
      if (parent) parent.add(this.model.root);
    }
  }

  armorValue(type) {
    let a = 0;
    for (const slot of ['body', 'head']) { const def = ARMORS[this.equip[slot]]; if (def) a += def.armor[type]; }
    return a;
  }

  setWeapon(id) {
    this.equip.weapon = id || 'fists';
    this.model.setWeapon(this.equip.weapon, this.combat.drawn);
  }

  draw(on = true) {
    if (this.combat.drawn === on) return;
    this.combat.drawn = on;
    this.model.setDrawn(on);
    this.game.audio?.play(on ? 'draw' : 'sheathe', this.pos);
    if (!on) { this.combat.blocking = false; }
  }

  // ---- combat actions ------------------------------------------------------
  canAct() {
    const t = this.time;
    return !this.dead && !this.combat.attack && t > this.combat.staggerUntil && t > this.combat.knockedUntil;
  }

  attackCost() { return this.weapon.stam * (1 + (this.equip.body === 'lamellar' ? 0.1 : 0)); }

  startAttack(dir) {
    if (!this.canAct() || !this.combat.drawn) return false;
    const cost = this.attackCost();
    if (this.stamina < cost * 0.4) return false;
    this.stamina -= cost;
    this.combat.blocking = false;
    const cls = this.weaponCls === 'blunt' ? 'blade' : this.weaponCls === 'bow' ? 'fists' : this.weaponCls;
    const clip = `${cls}_${dir}`;
    const riposte = this.time < this.combat.riposteUntil;
    const speed = this.weapon.speed * (1 + (this.stats.agi - 8) * 0.015) * (riposte ? 1.35 : 1) * (this.stamina < 10 ? 0.75 : 1);
    this.combat.attack = { dir, start: this.time, riposte, clip };
    this.combat.attackDir = dir;
    this.model.anim.play(clip, {
      speed,
      onHit: () => this.game.combat.resolve(this),
      onEnd: () => { this.combat.attack = null; },
    });
    this.game.combat.announce(this, dir, (this.model.anim.clip.def.hit * this.model.anim.clip.def.dur) / speed);
    this.game.audio?.play('swing', this.pos, { weapon: this.equip.weapon });
    if (Math.random() < 0.45 || dir === 'overhead') this.game.audio?.voice(this, 'effort');
    if (riposte) this.combat.riposteUntil = -9;
    return true;
  }

  setBlocking(on) {
    if (on && !this.combat.blocking) this.combat.blockStart = this.time;
    this.combat.blocking = on && this.combat.drawn && !this.combat.attack && this.time > this.combat.staggerUntil && !this.dead;
  }

  dodge(dirX, dirZ) {
    if (!this.canAct() || this.stamina < 15) return false;
    this.stamina -= 15;
    const L = Math.hypot(dirX, dirZ) || 1;
    this.vel.x += (dirX / L) * 6.5;
    this.vel.z += (dirZ / L) * 6.5;
    this.combat.dodgeUntil = this.time + 0.32;
    this.model.anim.play('dodge', { speed: 1.2 });
    return true;
  }

  stagger(dur = 0.9, big = false) {
    this.combat.staggerUntil = this.time + dur;
    this.combat.attack = null;
    this.combat.blocking = false;
    this.model.anim.play(big ? 'stagger' : 'hit', { speed: big ? 1 : 1.2 });
    if (!this.dead) this.game.audio?.voice(this, 'pain');
  }

  heal(n) { this.hp = Math.min(this.hpMax, this.hp + n); }

  damage(amount, attacker, info = {}) {
    if (this.dead) return;
    this.hp -= amount;
    this.combat.lastHit = this.time;
    this.game.events?.emit('damaged', this, attacker, amount, info);
    if (this.hp <= 0) {
      if (this.essential) {
        this.hp = 1;
        this.combat.knockedUntil = this.time + 6;
        this.model.anim.setPose('kneel');
        setTimeout(() => this.model.anim.setPose(null), 5000);
        return;
      }
      this.die(attacker);
    }
  }

  die(killer) {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.combat.blocking = false;
    this.combat.attack = null;
    this.bleed = 0;
    this.model.anim.clip = null;
    this.deathTime = this.time;
    this.game.events?.emit('death', this, killer);
    this.game.audio?.play('death', this.pos);
    if (this._vox) this._vox = 0;
    this.game.audio?.voice(this, 'death');
  }

  // ---- per-frame -----------------------------------------------------------
  update(dt) {
    const g = this.game;
    const world = g.world;
    const t = this.time;
    if (!this.dead) {
      // stamina regen
      const busy = this.combat.attack || this.combat.blocking || t < this.combat.staggerUntil;
      const running = this.desired.length() > 4 && !this.combat.drawn;
      if (running) this.stamina -= 7 * dt;
      else if (!busy) this.stamina = Math.min(this.staminaMax, this.stamina + (t - this.combat.lastHit > 1.5 ? 22 : 10) * dt);
      if (this.stamina < 0) this.stamina = 0;
      // bleeding
      if (this.bleed > 0) {
        this.damage(this.bleed * dt, null, { bleed: true });
        this.bleed = Math.max(0, this.bleed - dt * 0.12);
      }
    }

    if (this.riding) { this.model.update(dt, { speed: 0, stance: 'relaxed', weaponCls: 'fists' }); return; }
    // --- movement integration
    const stunned = t < this.combat.staggerUntil || t < this.combat.knockedUntil || this.dead;
    let want = stunned ? _zero : this.desired;
    if (this.combat.attack) want = _tmp.copy(this.desired).multiplyScalar(0.25);
    const acc = t < this.combat.dodgeUntil ? 2 : 12;
    this.vel.x += (want.x - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (want.z - this.vel.z) * Math.min(1, acc * dt);
    // water drag
    const water = world.hf.waterAt(this.pos.x, this.pos.z);
    let depth = 0;
    if (water !== null) {
      depth = water - world.groundHeight(this.pos.x, this.pos.z);
      if (depth > 0.3) { this.vel.x *= 1 - Math.min(0.9, depth * 0.9 * dt * 4); this.vel.z *= 1 - Math.min(0.9, depth * 0.9 * dt * 4); }
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // world bounds
    const lim = world.hf.half - 6;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);
    // deep water: push back
    if (depth > 1.35) { this.pos.x -= this.vel.x * dt * 1.2; this.pos.z -= this.vel.z * dt * 1.2; }
    world.colliders.resolve(this.pos, this.radius, this.pos.y + 0.5);
    const gy = world.groundHeight(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 18);
    if (Math.abs(gy - this.pos.y) > 1.5) this.pos.y = gy;

    // --- facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (!this.dead) {
      if (this.faceYaw !== null) this.yaw = dampAngle(this.yaw, this.faceYaw, 10, dt);
      else if (this.combat.target && this.combat.drawn && this.combat.target.alive) {
        const tg = this.combat.target.pos;
        this.yaw = dampAngle(this.yaw, Math.atan2(tg.x - this.pos.x, tg.z - this.pos.z), this.combat.attack ? 5 : 9, dt);
      } else if (hs > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 9, dt);
    }

    // --- visuals
    const root = this.model.root;
    root.position.set(this.pos.x, this.pos.y - Math.max(0, Math.min(depth, 0.6)) * 0, this.pos.z);
    root.rotation.y = this.yaw;
    // local movement direction relative to facing (for backward/strafe gait)
    const fwdX = Math.sin(this.yaw), fwdZ = Math.cos(this.yaw);
    const along = (this.vel.x * fwdX + this.vel.z * fwdZ);
    const side = (this.vel.x * fwdZ - this.vel.z * fwdX);
    const st = _animState;
    st.speed = hs;
    st.backward = along < -0.3 && this.combat.drawn;
    st.strafe = this.combat.drawn && hs > 0.3 ? clamp(side / hs, -1, 1) * (along >= -0.3 ? 1 : -1) : 0;
    st.stance = this.combat.drawn ? 'combat' : 'relaxed';
    st.weaponCls = this.combat.drawn ? this.weaponCls : (this.weaponCls === 'polearm' ? 'polearm' : 'fists');
    st.armed = this.equip.weapon !== 'fists';
    st.shield = this.equip.shield;
    st.blocking = this.combat.blocking;
    st.dead = this.dead;
    st.sneak = this.sneak;
    this.updateLook(dt);
    this.model.update(dt, st);
  }

  // Head/neck look-at: conversation partners, the current foe, or a passer-by who catches the eye.
  updateLook(dt) {
    const g = this.game, an = this.model.anim;
    let tg = null;
    if (!this.dead) {
      const d = g.dialogue, p = g.player;
      if (d?.active && d.speakerId) {
        const sp = d.speakerId === 'player' ? p : g.entities.get(d.speakerId);
        if (sp && sp !== this && this.distTo(sp) < 9) tg = sp;
        else if (sp === this && p !== this && this.distTo(p) < 9) tg = p;
      } else if (this.combat.target && !this.combat.target.dead) tg = this.combat.target;
      else if (this !== p && p && !this.combat.drawn && (this.hash ?? (this.hash = [...String(this.id) + this.name].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) % 10)) < 7) {
        const dd = this.distTo(p);
        if (dd < 5 && dd > 0.8) tg = p;
      }
    }
    let yaw = 0, pitch = 0;
    if (tg) {
      const a = angleDiff(this.yaw, Math.atan2(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z));
      if (Math.abs(a) < 2.0) {
        yaw = clamp(a, -1.15, 1.15) * 57.3;
        const dy = (tg.pos.y + (tg.riding ? 2.3 : 1.55)) - (this.pos.y + (this.riding ? 2.3 : 1.55));
        pitch = clamp(-Math.atan2(dy, Math.max(0.5, this.distTo(tg))) * 57.3, -30, 30);
      }
    }
    const k = 1 - Math.exp(-dt * 5);
    an.lookYaw += (yaw - an.lookYaw) * k;
    an.lookPitch += (pitch - an.lookPitch) * k;
  }

  distTo(o) { return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z); }
  angleTo(o) { return angleDiff(this.yaw, Math.atan2(o.pos.x - this.pos.x, o.pos.z - this.pos.z)); }
  facePoint(x, z) { this.faceYaw = Math.atan2(x - this.pos.x, z - this.pos.z); }

  moveToward(x, z, speed) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { this.desired.set(0, 0, 0); return d; }
    const s = Math.min(speed, d * 3);
    this.desired.set((dx / d) * s, 0, (dz / d) * s);
    return d;
  }
  stop() { this.desired.set(0, 0, 0); }

  toJSON() {
    return {
      id: this.id, name: this.name, stats: this.stats, equip: this.equip, hp: this.hp, stamina: this.stamina, food: this.food,
      pos: [this.pos.x, this.pos.z], yaw: this.yaw, inventory: this.inventory.toJSON(), baseLook: this.baseLook,
    };
  }
}
const _zero = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _animState = {};
