// Greeting and antagonising anyone in the street, and the fistfights that can follow.
import { BARKS, pick } from './barkLines.js';
import { rankIndex } from '../rpg/Items.js';

const COWARD_ROLES = new Set(['child', 'merchant', 'official', 'preacher', 'servant', 'beggar', 'performer', 'elder']);
const GUARD_ROLES = new Set(['guard', 'soldier', 'sergeant', 'recruiter']);

export class Social {
  constructor(game) {
    this.g = game;
    this.brawl = null;
    this.cool = 0;
  }

  mem(c) { return c.mem || (c.mem = { greets: 0, antag: 0, fear: false, friend: false, day: -1 }); }

  // what kind of person this is, for choosing lines
  kind(c) {
    if (GUARD_ROLES.has(c.role)) return c.role === 'soldier' ? 'soldier' : 'guard';
    if (c.role === 'child') return 'child';
    if (c.baseLook?.female && !['merchant', 'beggar'].includes(c.role)) return 'woman';
    return BARKS.greet[c.role] ? c.role : 'default';
  }
  temperament(c) {
    if (c.temper) return c.temper;
    const h = [...String(c.id)].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 3) % 100;
    if (GUARD_ROLES.has(c.role) || (c.faction === 'han' && c.ai?.fighter)) c.temper = 'guard';
    else if (COWARD_ROLES.has(c.role) || c.baseLook?.female || h < 50) c.temper = 'coward';
    else c.temper = 'tough';
    return c.temper;
  }

  standing() {
    const g = this.g;
    if (g.law?.wanted() > 0 || g.progression.virtue < -10) return 'infamous';
    if (rankIndex(g.progression.rank) >= 5 || g.progression.renown >= 40) return 'lord';
    return 'common';
  }

  // turn to face the player for a moment (does not disturb scripted actors)
  attend(c, secs = 3, then = null) {
    if (!c.ai || c.ai.script || c.ai.fighter && c.combat.target) return;
    const g = this.g, until = g.clockTime + secs;
    c.ai.override = () => {
      if (g.clockTime > until) { then?.(); return false; }
      c.stop();
      c.faceYaw = Math.atan2(g.player.pos.x - c.pos.x, g.player.pos.z - c.pos.z);
      return true;
    };
  }

  greet(c) {
    const g = this.g, p = g.player;
    if (this.cool > g.clockTime || c.dead) return;
    this.cool = g.clockTime + 1.6;
    const st = this.standing();
    p.faceYaw = null; p.yaw = Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
    if (!p.combat.drawn) p.model.anim.play('greet');
    g.barks.say(p, pick(st === 'lord' ? BARKS.playerGreetLord : BARKS.playerGreet));
    const m = this.mem(c);
    const day = g.time.year * 400 + g.time.month * 31 + g.time.day;
    setTimeout(() => {
      if (c.dead) return;
      this.attend(c, 3.5);
      let line;
      if (m.fear) line = pick(BARKS.greetInfamous);
      else if (st === 'lord' && this.temperament(c) !== 'guard') line = pick(BARKS.greetLord);
      else if (st === 'infamous') line = pick(BARKS.greetInfamous);
      else if (m.friend) line = pick(BARKS.greetFriend);
      else line = pick(BARKS.greet[this.kind(c)] || BARKS.greet.default);
      g.barks.say(c, line);
      if (!c.model.anim.clip && !c.combat.drawn && c.model.anim.poseW < 0.5) c.model.anim.play(st === 'lord' || this.kind(c) === 'guard' ? 'greet' : 'talk_once');
    }, 650);
    if (m.day !== day) {
      m.day = day; m.greets++;
      if (m.greets >= 3 && !m.fear) m.friend = true;
      g.progression.gain('speech', 0.15);
    }
  }

  antagonize(c) {
    const g = this.g, p = g.player;
    if (this.cool > g.clockTime || c.dead || this.brawl) return;
    this.cool = g.clockTime + 1.8;
    p.faceYaw = null; p.yaw = Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
    if (!p.combat.drawn) p.model.anim.play('insult');
    g.barks.say(p, pick(BARKS.playerAntag));
    const m = this.mem(c);
    m.antag++; m.friend = false;
    const t = this.temperament(c);
    setTimeout(() => {
      if (c.dead || this.brawl) return;
      if (t === 'guard') {
        g.barks.say(c, pick(BARKS.antagGuard));
        this.attend(c, 3);
        if (m.antag >= 3) g.law?.crime('insult', { victim: c, certain: true });
      } else if (t === 'coward' || m.fear) {
        g.barks.say(c, pick(BARKS.antagCoward));
        m.fear = true;
        this.cower(c, 4 + Math.random() * 3);
        g.progression.addVirtue(-0.3, '', true);
      } else {
        g.barks.say(c, pick(BARKS.antagTough));
        this.attend(c, 2.5);
        if (!c.model.anim.clip) c.model.anim.play('insult');
        if (m.antag >= 2 || Math.random() < 0.3) setTimeout(() => this.startBrawl(c), 1300);
      }
    }, 700);
  }

  cower(c, secs) {
    if (!c.ai || c.ai.script) return;
    const g = this.g, until = g.clockTime + secs;
    c.ai.override = () => {
      if (g.clockTime > until) return false;
      c.stop();
      c.faceYaw = Math.atan2(g.player.pos.x - c.pos.x, g.player.pos.z - c.pos.z);
      c.model.anim.setPose('cower');
      return true;
    };
  }

  // ---- fistfights --------------------------------------------------------------
  startBrawl(c) {
    const g = this.g, p = g.player;
    if (this.brawl || c.dead || c.distTo(p) > 8 || g.dialogue.active) return;
    const ai = c.ai;
    this.brawl = {
      c, t0: g.clockTime, nextCrowd: g.clockTime + 1,
      npc: { weapon: c.equip.weapon, fighter: ai.fighter, passive: ai.passive, arch: ai.arch, aggro: ai.aggroRange },
      pWeapon: p.equip.weapon,
    };
    g.barks.say(c, pick(BARKS.brawlStart));
    ai.override = null; ai.fleeing = false;
    if (c.equip.weapon !== 'fists') c.setWeapon('fists');
    ai.fighter = true; ai.passive = false; ai.aggroRange = 20;
    ai.arch = { ...ai.arch, skill: 0.3, aggression: 0.55, block: 0.4, perfect: 0.05, reaction: 0.42, fleeAt: 0, surrender: 0 };
    c.model.anim.setPose(null); c.model.anim.setLoop(null);
    g.combat.setHostile(c, p, true);
    c.combat.target = p;
    if (p.equip.weapon !== 'fists') { if (p.combat.drawn) p.draw(false); p.setWeapon('fists'); }
    p.draw(true);
    g.playerCtl.lockTarget = c;
    g.ui.notify('A fistfight! Fists only — draw a blade and it becomes assault.', 'vice');
    this.gatherCrowd(c);
  }

  gatherCrowd(c) {
    const g = this.g, b = this.brawl;
    b.crowd = [];
    for (const o of g.entities.nearby(c.pos, 28)) {
      if (o === c || o === g.player || o.dead || !o.ai || o.ai.script || o.ai.hidden || o.ai.fighter || o.faction !== 'civilian') continue;
      b.crowd.push(o);
      if (b.crowd.length >= 9) break;
    }
    b.crowd.forEach((o, i) => {
      const a = (i / b.crowd.length) * Math.PI * 2 + Math.random() * 0.4, r = 4.5 + Math.random() * 1.5;
      const loop = Math.random() < 0.5 ? 'cheerLoop' : 'clap';
      o.ai.override = () => {
        if (!this.brawl || o.dead) return false;
        const mx = (g.player.pos.x + b.c.pos.x) / 2, mz = (g.player.pos.z + b.c.pos.z) / 2;
        const x = mx + Math.cos(a) * r, z = mz + Math.sin(a) * r;
        if (o.ai.navTo(x, z, 2.6, 0.9)) {
          o.faceYaw = Math.atan2(mx - o.pos.x, mz - o.pos.z);
          if (o.model.anim.loopClip?.name !== loop) o.model.anim.setLoop(loop);
        } else { o.faceYaw = null; if (o.model.anim.loopClip) o.model.anim.setLoop(null); }
        return true;
      };
    });
  }

  nonLethal(victim, attacker) {
    const b = this.brawl, p = this.g.player;
    return !!b && !b.lethal && ((victim === b.c && attacker === p) || (victim === p && attacker === b.c));
  }

  onHit(att, def) {
    const b = this.brawl, g = this.g;
    if (!b || b.lethal) return;
    if (att === g.player && def === b.c && g.player.equip.weapon !== 'fists') {
      b.lethal = true;
      g.ui.notify('You drew steel in a fistfight!', 'vice');
      this.mem(b.c).assaulted = true;
      g.law?.crime('assault', { victim: b.c });
      g.combat.setHostile(g.player, b.c, true);
      b.c.ai.arch = { ...b.npc.arch, fleeAt: 0.3, surrender: 0.5 };
    }
  }

  update(dt) {
    const b = this.brawl, g = this.g;
    if (!b) return;
    const p = g.player, c = b.c;
    if (b.lethal) { if (c.dead || !c.combat.target) this.end(); return; }
    if (c.dead) { this.end(); return; }
    if (g.clockTime > b.nextCrowd && b.crowd.length) {
      b.nextCrowd = g.clockTime + 1.4 + Math.random() * 2;
      const o = b.crowd[Math.floor(Math.random() * b.crowd.length)];
      if (!o.dead) g.barks.say(o, pick(BARKS.brawlCrowd), 2.2);
    }
    if (c.hp < c.hpMax * 0.3) {
      g.barks.say(c, pick(BARKS.brawlYield));
      this.end();
      this.mem(c).fear = true;
      this.sitDazed(c, 7);
      g.progression.addRenown(0.6);
      g.progression.gain('unarmed', 3);
      g.ui.notify(`You beat ${c.name} in a fistfight.`, 'merit');
      g.record('brawlsWon');
      for (const o of b.crowd) if (!o.dead && Math.random() < 0.5) setTimeout(() => g.barks.say(o, pick(['Ha! Well fought!', 'That settles it!', 'Pay up, Old Wang!', 'Ooh, he\'ll feel that tomorrow.'])), 300 + Math.random() * 1500);
    } else if (p.hp < p.hpMax * 0.25) {
      g.barks.say(c, pick(BARKS.brawlWin));
      const took = Math.min(p.inventory.coins, 5 + Math.floor(Math.random() * 16));
      p.inventory.coins -= took;
      this.end();
      p.combat.knockedUntil = g.clockTime + 3.5;
      p.model.anim.setPose('kneel');
      setTimeout(() => p.model.anim.setPose(null), 3500);
      g.ui.notify(`${c.name} beat you${took ? ` and took ${took} coins` : ''}.`, 'vice');
      g.record('brawlsLost');
    } else if (c.distTo(p) > 30 || g.clockTime - b.t0 > 120) this.end();
  }

  sitDazed(c, secs) {
    const g = this.g, until = g.clockTime + secs;
    c.ai.override = () => { if (g.clockTime > until) return false; c.stop(); c.model.anim.setPose('sitGround'); return true; };
  }

  end() {
    const b = this.brawl, g = this.g, p = g.player;
    if (!b) return;
    this.brawl = null;
    const c = b.c;
    g.combat.setHostile(c, p, false);
    if (!c.dead) {
      c.ai.fighter = b.npc.fighter; c.ai.passive = b.npc.passive; c.ai.arch = b.npc.arch; c.ai.aggroRange = b.npc.aggro;
      c.combat.target = null; c.combat.blocking = false; c.draw(false);
      if (b.npc.weapon !== 'fists') c.setWeapon(b.npc.weapon);
      c.tags.delete('brawling');
    }
    if (g.playerCtl.lockTarget === c) g.playerCtl.lockTarget = null;
    if (p.combat.drawn) p.draw(false);
    if (b.pWeapon !== 'fists' && p.equip.weapon === 'fists') p.setWeapon(b.pWeapon);
  }
}
