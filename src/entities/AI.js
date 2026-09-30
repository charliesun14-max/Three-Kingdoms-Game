// NPC brains: daily schedules, following, scripted moves, and melee combat tactics.
import { clamp, angleDiff } from '../core/MathUtil.js';
import { ATTACK_DIRS } from './Character.js';
import { PERFECT_WINDOW } from '../combat/Combat.js';

export const ARCHETYPES = {
  peasant: { skill: 0.15, aggression: 0.35, block: 0.25, perfect: 0.02, reaction: 0.5, fleeAt: 0.3, surrender: 0.3 },
  bandit: { skill: 0.35, aggression: 0.55, block: 0.45, perfect: 0.08, reaction: 0.38, fleeAt: 0.2, surrender: 0.45 },
  rebel: { skill: 0.3, aggression: 0.6, block: 0.35, perfect: 0.05, reaction: 0.42, fleeAt: 0.12, surrender: 0.25 },
  militia: { skill: 0.35, aggression: 0.5, block: 0.45, perfect: 0.08, reaction: 0.36, fleeAt: 0.0, surrender: 0 },
  soldier: { skill: 0.55, aggression: 0.55, block: 0.6, perfect: 0.15, reaction: 0.3, fleeAt: 0.05, surrender: 0.1 },
  officer: { skill: 0.7, aggression: 0.6, block: 0.72, perfect: 0.25, reaction: 0.25, fleeAt: 0, surrender: 0 },
  hero: { skill: 0.95, aggression: 0.75, block: 0.9, perfect: 0.5, reaction: 0.16, fleeAt: 0, surrender: 0 },
  trainer: { skill: 0.6, aggression: 0.45, block: 0.7, perfect: 0.2, reaction: 0.28, fleeAt: 0, surrender: 0 },
};

export class Brain {
  constructor(char, opts = {}) {
    this.c = char;
    this.game = char.game;
    this.arch = { ...ARCHETYPES[opts.archetype || 'peasant'], ...(opts.tune || {}) };
    this.fighter = opts.fighter ?? false;
    this.mode = opts.mode || 'idle';
    this.schedule = opts.schedule || null; // [{from,to,x,z,act,rot}]
    this.aggroRange = opts.aggroRange ?? 18;
    this.leash = opts.leash ?? null; // {x,z,r}
    this.leader = opts.leader || null;
    this.formation = opts.formation || [0, -2];
    this.path = null;
    this.pathIdx = 0;
    this.pathGoal = null;
    this.repathAt = 0;
    this.stuckT = 0;
    this.lastPos = { x: char.pos.x, z: char.pos.z };
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeSwitch = 0;
    this.nextAttack = 0.8 + Math.random();
    this.pendingBlock = null;
    this.guardDir = 'right';
    this.fleeing = false;
    this.surrendered = false;
    this.script = null; // {x,z,speed,resolve,face}
    this.activity = null;
    this.wanderTarget = null;
    this.wanderWait = 0;
    this.home = opts.home || null;
    this.passive = opts.passive ?? false; // won't auto-aggro
    this.hidden = false;
    char.ai = this;
  }

  // --- scripted control --------------------------------------------------------
  goTo(x, z, speed = 1.6) {
    return new Promise((resolve) => {
      const d = Math.hypot(x - this.c.pos.x, z - this.c.pos.z);
      this.script = { x, z, speed, resolve, deadline: this.game.clockTime + Math.max(5, (d / speed) * 2.5) };
      this.path = null;
    });
  }
  cancelScript() { if (this.script) { const r = this.script.resolve; this.script = null; r?.(); } }

  // --- navigation --------------------------------------------------------------
  navTo(x, z, speed, arriveR = 0.6) {
    const c = this.c;
    const d = Math.hypot(x - c.pos.x, z - c.pos.z);
    if (d < arriveR) { c.stop(); this.path = null; return true; }
    const t = this.game.clockTime;
    const goalMoved = !this.pathGoal || Math.hypot(this.pathGoal[0] - x, this.pathGoal[1] - z) > 2;
    if (!this.path || (goalMoved && t > (this.nextRepath || 0)) || t > this.repathAt) {
      const nav = this.game.nav;
      this.nextRepath = t + 0.7 + Math.random() * 0.6;
      const near = d < 8;
      this.path = nav ? nav.findPath(c.pos.x, c.pos.z, x, z, near ? 2500 : 12000) : [[x, z]];
      if (!this.path || !this.path.length) this.path = [[x, z]];
      this.pathIdx = 0;
      this.pathGoal = [x, z];
      this.repathAt = t + 6 + Math.random() * 3;
    }
    let wp = this.path[this.pathIdx];
    while (wp && Math.hypot(wp[0] - c.pos.x, wp[1] - c.pos.z) < 0.7 && this.pathIdx < this.path.length - 1) wp = this.path[++this.pathIdx];
    if (!wp) wp = [x, z];
    c.moveToward(wp[0], wp[1], speed);
    // stuck detection
    const moved = Math.hypot(c.pos.x - this.lastPos.x, c.pos.z - this.lastPos.z);
    this.stuckT = moved < 0.05 * speed ? this.stuckT + this.game.dt : 0;
    this.lastPos.x = c.pos.x; this.lastPos.z = c.pos.z;
    if (this.stuckT > 1.5) { this.repathAt = 0; this.stuckT = 0; c.vel.x += (Math.random() - 0.5) * 2; c.vel.z += (Math.random() - 0.5) * 2; }
    return false;
  }

  // --- perception ------------------------------------------------------------
  findTarget() {
    const c = this.c;
    let best = null, bd = this.aggroRange;
    for (const o of this.game.entities.nearby(c.pos, this.aggroRange)) {
      if (o === c || o.dead || !this.game.combat.hostile(c, o)) continue;
      if (o.ai?.surrendered) continue;
      if (o.ai?.hidden) continue;
      let d = c.distTo(o);
      if (o === this.game.player && this.game.player.sneak) d *= 1.8;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // --- combat reactions ------------------------------------------------------
  onIncoming(attacker, dir, hitIn) {
    if (this.c.dead || this.fleeing || this.surrendered) return;
    const a = this.arch;
    if (Math.random() > a.block + 0.1) return;
    const react = a.reaction * (0.7 + Math.random() * 0.6);
    const now = this.game.clockTime;
    this.pendingBlock = { dir, at: now + Math.min(react, hitIn - 0.02), hitAt: now + hitIn, until: now + hitIn + 0.25, perfect: Math.random() < a.perfect, attacker };
  }

  blockSuccess(att, dir) {
    const pb = this.pendingBlock;
    const now = this.game.clockTime;
    const readIt = this.guardDir === dir || Math.random() < this.arch.skill * 0.35;
    const perfect = !!(pb && pb.perfect && readIt && now - this.c.combat.blockStart < PERFECT_WINDOW + 0.1);
    return { blocked: readIt, perfect };
  }

  // --- main update -------------------------------------------------------------
  update(dt) {
    const c = this.c;
    if (c.dead) { c.stop(); return; }
    const g = this.game;
    const now = g.clockTime;

    if (this.surrendered) { c.stop(); c.model.anim.setPose('surrender'); return; }

    if (this.script) {
      c.faceYaw = null;
      const s = this.script;
      if (now > s.deadline) { c.pos.set(s.x, this.game.world.groundHeight(s.x, s.z), s.z); }
      if (this.navTo(s.x, s.z, s.speed, 0.5) || now > s.deadline) { c.stop(); const r = s.resolve; this.script = null; r?.(); }
      return;
    }

    // pending block handling
    if (this.pendingBlock) {
      const pb = this.pendingBlock;
      if (now >= pb.at && now < pb.until) {
        if (!c.combat.blocking) { this.guardDir = pb.dir; c.setBlocking(true); }
      } else if (now >= pb.until) { this.pendingBlock = null; c.setBlocking(false); }
    }

    // threat evaluation
    if (this.fighter && !this.passive) {
      const tg = c.combat.target;
      if (!tg || tg.dead || tg.ai?.surrendered || c.distTo(tg) > this.aggroRange * 1.6 || !g.combat.hostile(c, tg)) {
        c.combat.target = this.findTarget();
      } else if (Math.random() < dt * 0.5) {
        // occasionally switch to a much closer threat
        const n = this.findTarget();
        if (n && c.distTo(n) < c.distTo(tg) - 3) c.combat.target = n;
      }
    } else if (!this.fighter && this.mode !== 'follow') {
      // civilians flee from nearby fights
      const threat = this.nearbyThreat();
      if (threat) { this.fleeFrom(threat, dt); return; }
    }

    if (this.fighter && c.combat.target) { this.fight(dt); return; }
    if (c.combat.drawn && now - c.combat.lastHit > 4) c.draw(false);

    switch (this.mode) {
      case 'follow': this.follow(dt); break;
      case 'schedule': this.runSchedule(dt); break;
      case 'wander': this.wander(dt); break;
      case 'guard': this.guardPost(dt); break;
      default: c.stop();
    }
  }

  nearbyThreat() {
    const c = this.c;
    for (const o of this.game.entities.nearby(c.pos, 12)) {
      if (o.dead || o === c) continue;
      if (o.combat.drawn && this.game.combat.hostile(o, c)) return o;
      if (o.combat.attack && o.combat.target && o.combat.target !== c && c.distTo(o) < 7 && o.faction !== 'han') return o;
    }
    return null;
  }

  fleeFrom(threat, dt) {
    const c = this.c;
    const dx = c.pos.x - threat.pos.x, dz = c.pos.z - threat.pos.z, L = Math.hypot(dx, dz) || 1;
    c.faceYaw = null;
    c.model.anim.setPose(null);
    c.model.anim.setLoop(null);
    this.navTo(c.pos.x + (dx / L) * 12, c.pos.z + (dz / L) * 12, 4.5, 1);
  }

  fight(dt) {
    const c = this.c, g = this.game, a = this.arch;
    const tg = c.combat.target;
    const now = g.clockTime;
    c.model.anim.setPose(null);
    c.model.anim.setLoop(null);
    c.faceYaw = null;
    if (!c.combat.drawn) c.draw(true);
    const d = c.distTo(tg);
    const reach = c.weapon.reach;
    // flee / surrender at low health
    if (!this.fleeing && a.fleeAt > 0 && c.hp < c.hpMax * a.fleeAt) {
      if (Math.random() < a.surrender) { this.surrender(); return; }
      this.fleeing = true;
    }
    if (this.fleeing) {
      const dx = c.pos.x - tg.pos.x, dz = c.pos.z - tg.pos.z, L = Math.hypot(dx, dz) || 1;
      c.combat.blocking = false;
      c.draw(false);
      this.navTo(c.pos.x + (dx / L) * 10, c.pos.z + (dz / L) * 10, 5.2, 1);
      if (d > 40) { this.fleeing = false; c.combat.target = null; this.leash = null; }
      return;
    }
    // leash (camp guards return home)
    if (this.leash && Math.hypot(c.pos.x - this.leash.x, c.pos.z - this.leash.z) > this.leash.r && d > 6) {
      c.combat.target = null;
      this.navTo(this.leash.x, this.leash.z, 3);
      return;
    }
    if (c.weaponCls === 'bow') { this.archer(dt, tg, d); return; }
    const engage = reach * 0.8 + tg.radius;
    const tokenOk = g.combat.requestToken ? g.combat.requestToken(this, tg) : true;
    if (d > engage + 0.6) {
      const run = d > 6 ? 4.6 : 2.4;
      this.navTo(tg.pos.x, tg.pos.z, run, engage);
      if (d < 6 && Math.random() < dt * 0.3 && tokenOk && !c.combat.attack && c.stamina > 40 && d < engage + 1.6) {
        // lunge
        c.startAttack(Math.random() < 0.5 ? 'thrust' : 'overhead');
      }
      return;
    }
    // in range: circle, keep spacing, attack
    this.strafeSwitch -= dt;
    if (this.strafeSwitch <= 0) { this.strafeDir = -this.strafeDir; this.strafeSwitch = 1.2 + Math.random() * 2.5; }
    const ang = Math.atan2(c.pos.x - tg.pos.x, c.pos.z - tg.pos.z);
    const want = tokenOk ? engage : engage + 1.4;
    const radial = (d - want) * -1.6;
    const tx = Math.sin(ang), tz = Math.cos(ang);
    const sx = Math.cos(ang) * this.strafeDir, sz = -Math.sin(ang) * this.strafeDir;
    const strafeSp = c.combat.blocking ? 0.6 : 1.1;
    c.desired.set(tx * radial + sx * strafeSp, 0, tz * radial + sz * strafeSp);
    // separation from allies
    for (const o of g.entities.nearby(c.pos, 1.6)) {
      if (o === c || o.dead) continue;
      const ox = c.pos.x - o.pos.x, oz = c.pos.z - o.pos.z, L = Math.hypot(ox, oz) || 1;
      c.desired.x += (ox / L) * 1.2; c.desired.z += (oz / L) * 1.2;
    }
    this.nextAttack -= dt;
    if (!c.combat.attack && this.nextAttack <= 0 && tokenOk && !c.combat.blocking && c.stamina > c.attackCost() * 0.8 && Math.abs(c.angleTo(tg)) < 0.5) {
      const dir = this.pickAttackDir(tg);
      if (c.startAttack(dir)) {
        this.nextAttack = (1.6 - a.aggression) * (0.8 + Math.random() * 0.9) + (c.stamina < 40 ? 1 : 0);
        // combos for skilled fighters
        if (Math.random() < a.skill * 0.4) this.nextAttack = 0.15;
      }
    }
    // riposte after a perfect block
    if (now < c.combat.riposteUntil && !c.combat.attack) c.startAttack(this.pickAttackDir(tg));
    if (!tokenOk) g.combat.releaseToken?.(this, tg);
  }

  // Keep 12-28 m away and loose arrows with skill-based spread.
  archer(dt, tg, d) {
    const c = this.c, g = this.game;
    if (d < 10) this.navTo(c.pos.x - (tg.pos.x - c.pos.x), c.pos.z - (tg.pos.z - c.pos.z), 3, 1);
    else if (d > 30) this.navTo(tg.pos.x, tg.pos.z, 3, 25);
    else c.stop();
    c.faceYaw = Math.atan2(tg.pos.x - c.pos.x, tg.pos.z - c.pos.z);
    this.nextShot = (this.nextShot ?? 1 + Math.random() * 2) - dt;
    if (this.nextShot <= 0 && d < 45 && !c.combat.attack) {
      this.nextShot = 2.2 + Math.random() * 1.8;
      const from = c.pos.clone(); from.y += 1.45;
      const T = tg.pos.clone(); T.y += 1.1;
      const flight = d / 45;
      T.x += tg.vel.x * flight; T.z += tg.vel.z * flight;
      const dir = T.sub(from);
      dir.y += d * d * 0.0024; // arc to compensate for drop
      const spread = (1 - this.arch.skill) * 0.08;
      dir.normalize(); dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread;
      g.combat.archery.shoot(c, from, dir, 1);
    }
  }

  pickAttackDir(tg) {
    // prefer directions the target is not guarding (AI targets expose guardDir)
    const gd = tg.ai ? tg.ai.guardDir : null;
    const opts = ATTACK_DIRS.filter((d) => d !== gd);
    const w = this.c.weaponCls === 'polearm' ? ['thrust', 'thrust', 'right', 'left', 'overhead'] : opts;
    return w[Math.floor(Math.random() * w.length)];
  }

  surrender() {
    const c = this.c;
    this.surrendered = true;
    c.combat.target = null;
    c.combat.blocking = false;
    c.draw(false);
    c.stop();
    c.model.anim.setPose('surrender');
    this.game.events.emit('surrender', c);
  }

  follow(dt) {
    const c = this.c, L = this.leader;
    if (!L || L.dead) { c.stop(); return; }
    // formation slot behind/beside the leader
    const fx = this.formation[0], fz = this.formation[1];
    const cy = Math.cos(L.yaw), sy = Math.sin(L.yaw);
    const x = L.pos.x + fx * cy + fz * sy, z = L.pos.z - fx * sy + fz * cy;
    const d = Math.hypot(x - c.pos.x, z - c.pos.z);
    if (d > 60) { c.pos.x = x; c.pos.z = z; }
    const lspd = Math.hypot(L.vel.x, L.vel.z);
    const sp = d > 8 ? 5 : d > 3 ? Math.max(2.2, lspd * 1.1) : Math.max(1.2, lspd);
    if (this.navTo(x, z, sp, 0.8)) { c.faceYaw = L.yaw; } else c.faceYaw = null;
    if (L.combat.drawn && !c.combat.drawn) c.draw(true);
    if (!L.combat.drawn && c.combat.drawn) c.draw(false);
  }

  guardPost(dt) {
    const c = this.c;
    const p = this.post;
    if (!p) { c.stop(); return; }
    if (this.navTo(p.x, p.z, 1.6, 0.6)) { if (p.rot !== undefined) c.faceYaw = p.rot; }
  }

  wander(dt) {
    const c = this.c;
    const area = this.area || { x: c.pos.x, z: c.pos.z, r: 10 };
    if (!this.wanderTarget) {
      this.wanderWait -= dt;
      c.stop();
      if (this.wanderWait <= 0) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * area.r;
        this.wanderTarget = [area.x + Math.cos(a) * r, area.z + Math.sin(a) * r];
      }
      return;
    }
    if (this.navTo(this.wanderTarget[0], this.wanderTarget[1], 1.2, 0.8)) {
      this.wanderTarget = null;
      this.wanderWait = 3 + Math.random() * 8;
    }
  }

  runSchedule(dt) {
    const c = this.c, g = this.game;
    const h = g.time.hour;
    const entry = this.schedule.find((e) => (e.from <= e.to ? h >= e.from && h < e.to : h >= e.from || h < e.to)) || this.schedule[0];
    if (entry !== this.activity) {
      this.activity = entry;
      this.arrived = false;
      c.model.anim.setLoop(null);
      c.model.anim.setPose(null);
      this.setHidden(false);
    }
    if (!this.arrived) {
      c.faceYaw = null;
      if (this.navTo(entry.x, entry.z, entry.speed || 1.35, 0.6)) {
        this.arrived = true;
        if (entry.rot !== undefined) c.faceYaw = entry.rot;
        const act = entry.act;
        if (act === 'sleep') this.setHidden(true);
        else if (act === 'farm') c.model.anim.setLoop('farm');
        else if (act === 'talk') c.model.anim.setLoop('talk');
        else if (act === 'hammer') c.model.anim.setLoop('hammer');
        else if (act === 'drink') { c.model.anim.setPose('seiza'); c.model.anim.setLoop('drinkLoop'); }
        else if (act === 'sit') c.model.anim.setPose('seiza');
        else if (act === 'guard') c.model.anim.setPose(null);
        else if (act === 'pray') c.model.anim.setPose('kneel');
        else if (act === 'wander') { this.area = { x: entry.x, z: entry.z, r: entry.r || 8 }; }
      }
    } else if (entry.act === 'wander') {
      this.wander(dt);
    } else c.stop();
  }

  setHidden(h) {
    this.hidden = h;
    this.c.model.root.visible = !h;
  }
}
