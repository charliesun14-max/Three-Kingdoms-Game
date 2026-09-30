// Melee resolution: reach/arc tests, directional blocking, perfect blocks
// (ripostes), armour mitigation, bleeding and faction hostility.
import * as THREE from 'three';
import { angleDiff } from '../core/MathUtil.js';
import { Trails } from './Trails.js';

export const PERFECT_WINDOW = 0.26;

const HOSTILE = {
  player: ['yellowTurban', 'bandit', 'dongZhuo', 'enemy', 'rebelOfficer', 'yuan', 'cao', 'sun', 'wolf'],
  han: ['yellowTurban', 'bandit', 'dongZhuo', 'enemy', 'rebelOfficer'],
  militia: ['yellowTurban', 'bandit', 'dongZhuo', 'enemy', 'rebelOfficer'],
  yellowTurban: ['player', 'han', 'militia', 'civilian'],
  bandit: ['player', 'han', 'militia', 'civilian', 'merchant'],
  dongZhuo: ['player', 'han', 'militia'],
  enemy: ['player', 'han', 'militia'],
  rebelOfficer: ['player', 'han', 'militia'],
};

export class Combat {
  constructor(game) {
    this.game = game;
    this.blood = new BloodFX(game.engine.scene);
    this.sparks = new SparkFX(game.engine.scene);
    this.trails = new Trails(game.engine.scene);
    this.overrides = new Map(); // "a|b" -> bool (temporary hostility, e.g. crimes or duels)
  }

  // Limit how many AI attack the player at once (KCD-style fairness).
  requestToken(brain, target) {
    if (target !== this.game.player) return true;
    const now = this.game.clockTime;
    if (!this.tokens) this.tokens = new Map();
    for (const [b, exp] of this.tokens) if (exp < now || b.c.dead || b.c.combat.target !== target) this.tokens.delete(b);
    if (this.tokens.has(brain)) { this.tokens.set(brain, now + 2.5); return true; }
    const max = this.game.settings?.maxAttackers ?? 2;
    if (this.tokens.size < max) { this.tokens.set(brain, now + 2.5); return true; }
    return false;
  }
  releaseToken(brain) { this.tokens?.delete(brain); }

  hostile(a, b) {
    if (!a || !b || a === b) return false;
    const k1 = `${a.id}|${b.id}`, k2 = `${b.id}|${a.id}`;
    if (this.overrides.has(k1)) return this.overrides.get(k1);
    if (this.overrides.has(k2)) return this.overrides.get(k2);
    const fa = a.faction, fb = b.faction;
    if (fa === fb) return false;
    if (HOSTILE[fa]?.includes(fb) || HOSTILE[fb]?.includes(fa)) return true;
    const pf = this.game.playerFactionHostility;
    if (pf && ((fa === 'player' && pf.has(fb)) || (fb === 'player' && pf.has(fa)))) return true;
    return false;
  }
  setHostile(a, b, v = true) { this.overrides.set(`${a.id}|${b.id}`, v); }

  // Warn potential defenders that an attack is coming (AI reaction).
  announce(attacker, dir, hitIn) {
    for (const c of this.game.entities.nearby(attacker.pos, 5)) {
      if (c === attacker || c.dead || !c.ai) continue;
      if (!this.hostile(attacker, c) && attacker.combat.target !== c) continue;
      c.ai.onIncoming?.(attacker, dir, hitIn);
    }
  }

  resolve(attacker) {
    const g = this.game;
    const W = attacker.weapon;
    const atk = attacker.combat.attack;
    if (!atk || attacker.dead) return;
    const dir = atk.dir;
    const arc = dir === 'thrust' ? 0.55 : dir === 'overhead' ? 0.75 : 1.2;
    const reach = W.reach + 0.35;
    const cands = [];
    for (const c of g.entities.nearby(attacker.pos, reach + 1.5)) {
      if (c === attacker || c.dead) continue;
      const friendlyFire = !this.hostile(attacker, c) && attacker.combat.target !== c;
      if (friendlyFire && !(attacker.faction === 'player' && c === attacker.combat.target)) continue;
      const d = attacker.distTo(c) - c.radius;
      if (d > reach) continue;
      const a = Math.abs(attacker.angleTo(c));
      if (a > arc) continue;
      cands.push({ c, d, a });
    }
    if (!cands.length) {
      g.events.emit('whiff', attacker);
      return;
    }
    cands.sort((p, q) => p.d + p.a - (q.d + q.a));
    const maxHits = W.cls === 'polearm' && (dir === 'left' || dir === 'right') ? 2 : 1;
    for (let i = 0; i < Math.min(maxHits, cands.length); i++) this.hit(attacker, cands[i].c, dir, atk);
  }

  hit(att, def, dir, atk) {
    const g = this.game;
    const t = g.clockTime;
    const W = att.weapon;
    const hitPoint = def.pos.clone().setY(def.pos.y + 1.3);
    if (t < def.combat.dodgeUntil) { g.events.emit('dodged', def, att); return; }
    const facing = Math.abs(def.angleTo(att)) < 1.4;
    let blocked = false, perfect = false;
    const masterstrike = atk.riposte;
    if (def.combat.blocking && facing && !masterstrike) {
      if (def.ai && def.ai.blockSuccess) {
        const r = def.ai.blockSuccess(att, dir);
        blocked = r.blocked; perfect = r.perfect;
      } else {
        blocked = true;
        perfect = t - def.combat.blockStart < PERFECT_WINDOW;
      }
    }
    // attacks on the flank/back are never blocked
    if (perfect) {
      att.stagger(0.85, true);
      def.combat.riposteUntil = t + 0.9;
      def.stamina = Math.min(def.staminaMax, def.stamina + 5);
      this.sparks.burst(hitPoint, 22, 1.4);
      g.audio?.play('parry', def.pos);
      g.events.emit('perfectBlock', def, att);
      this.skillUse(def, 'block', 2);
      return;
    }
    if (blocked) {
      const shieldMul = def.equip.shield ? 0.55 : 1;
      const cost = W.stam * 1.6 * shieldMul * (W.cls === 'polearm' ? 1.2 : 1);
      def.stamina -= cost;
      this.sparks.burst(hitPoint, 10, 1);
      g.audio?.play(def.equip.shield ? 'shieldBlock' : 'block', def.pos);
      this.skillUse(def, 'block', 0.6);
      if (def.stamina <= 0) {
        def.stamina = 0;
        def.stagger(1.1, true);
        g.events.emit('guardBreak', def, att);
        this.applyDamage(att, def, dir, 0.4, hitPoint);
      } else {
        def.model.anim.play('parry', { speed: 1.6 });
        g.events.emit('blocked', def, att);
      }
      return;
    }
    this.applyDamage(att, def, dir, masterstrike ? 1.7 : 1, hitPoint, masterstrike);
  }

  applyDamage(att, def, dir, mul, hitPoint, masterstrike = false) {
    const g = this.game;
    const W = att.weapon;
    const typeWeights = dir === 'thrust' ? { slash: 0.25, stab: 1, blunt: 0.4 } : { slash: 1, stab: 0.2, blunt: 1 };
    const strMul = 1 + (att.stats.str - 8) * 0.035;
    const skillKey = W.cls === 'polearm' ? 'polearm' : W.cls === 'fists' ? 'unarmed' : 'blade';
    const skMul = 1 + att.stats[skillKey] * 0.025;
    let total = 0, pierce = 0;
    for (const tp of ['slash', 'stab', 'blunt']) {
      const raw = W.dmg[tp] * typeWeights[tp] * strMul * skMul * mul;
      if (raw <= 0) continue;
      const arm = def.armorValue(tp);
      const mit = raw * (60 / (60 + arm * 2.2));
      total += mit;
      if (tp !== 'blunt') pierce += Math.max(0, mit - 4);
    }
    // back/flank bonus
    if (Math.abs(def.angleTo(att)) > 1.8) total *= 1.35;
    // difficulty scaling for the player
    if (def.faction === 'player') total *= g.settings?.damageTaken ?? 1;
    total = Math.max(1, total * (0.9 + Math.random() * 0.2));
    if (pierce > 8 && Math.random() < 0.55) def.bleed = Math.min(6, def.bleed + pierce * 0.05);
    def.damage(total, att, { dir, masterstrike });
    this.blood.burst(hitPoint, Math.min(40, 8 + total), att.yaw);
    g.audio?.play(W.cls === 'fists' || W.dmg.blunt > W.dmg.slash ? 'thud' : 'hit', def.pos);
    if (!def.dead) {
      const big = total > def.hpMax * 0.22 || masterstrike;
      def.stagger(big ? 0.8 : 0.38, big);
      // knockback
      const kx = def.pos.x - att.pos.x, kz = def.pos.z - att.pos.z, L = Math.hypot(kx, kz) || 1;
      def.vel.x += (kx / L) * (big ? 3.5 : 1.5);
      def.vel.z += (kz / L) * (big ? 3.5 : 1.5);
    }
    g.events.emit('hit', att, def, total, { masterstrike, dir });
    if (att === g.player || def === g.player) g.hitStop = masterstrike ? 0.14 : 0.06;
    this.skillUse(att, W.cls === 'polearm' ? 'polearm' : W.cls === 'fists' ? 'unarmed' : 'blade', 1 + total / 30);
    this.skillUse(att, 'str', 0.3);
  }

  skillUse(c, key, amount) {
    if (c !== this.game.player) return;
    this.game.progression?.gain(key, amount);
  }

  update(dt) {
    this.trails.update(dt, this.game.entities.list, this.game.engine.camera.position);
    this.blood.update(dt);
    this.sparks.update(dt);
  }
}

// ---- particles -----------------------------------------------------------------
class ParticlePool {
  constructor(scene, n, color, size, additive = false) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.i = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let k = 0; k < n; k++) this.pos[k * 3 + 1] = -9999;
  }
  spawn(p, v, life) {
    const k = this.i++ % this.n;
    this.pos[k * 3] = p.x; this.pos[k * 3 + 1] = p.y; this.pos[k * 3 + 2] = p.z;
    this.vel[k * 3] = v.x; this.vel[k * 3 + 1] = v.y; this.vel[k * 3 + 2] = v.z;
    this.life[k] = life;
  }
  update(dt, gravity = 9) {
    for (let k = 0; k < this.n; k++) {
      if (this.life[k] <= 0) continue;
      this.life[k] -= dt;
      this.vel[k * 3 + 1] -= gravity * dt;
      this.pos[k * 3] += this.vel[k * 3] * dt;
      this.pos[k * 3 + 1] += this.vel[k * 3 + 1] * dt;
      this.pos[k * 3 + 2] += this.vel[k * 3 + 2] * dt;
      if (this.life[k] <= 0) this.pos[k * 3 + 1] = -9999;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
class BloodFX extends ParticlePool {
  constructor(scene) { super(scene, 600, 0x6a0806, 0.06); }
  burst(p, n, yaw) {
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(Math.sin(yaw) * 2 + (Math.random() - 0.5) * 3, Math.random() * 2.5, Math.cos(yaw) * 2 + (Math.random() - 0.5) * 3);
      this.spawn(p, v, 0.5 + Math.random() * 0.5);
    }
  }
}
class SparkFX extends ParticlePool {
  constructor(scene) { super(scene, 300, 0xffc060, 0.05, true); }
  burst(p, n, s = 1) {
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set((Math.random() - 0.5) * 7 * s, Math.random() * 4 * s, (Math.random() - 0.5) * 7 * s);
      this.spawn(p, v, 0.15 + Math.random() * 0.25);
    }
  }
  update(dt) { super.update(dt, 14); }
}
