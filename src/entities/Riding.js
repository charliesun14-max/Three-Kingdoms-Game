// Mounting, riding and calling your horse (whistle with H).
import * as THREE from 'three';
import { Horse } from './Horse.js';
import { dampAngle } from '../core/MathUtil.js';

export class Riding {
  constructor(game) {
    this.game = game;
    this.horses = [];
    this.mount = null; // horse the player rides
    this._v = new THREE.Vector3();
  }

  spawn(o) {
    const h = new Horse(this.game, o);
    h.pos.y = this.game.world.groundHeight(h.pos.x, h.pos.z);
    this.horses.push(h);
    return h;
  }
  playerHorse() { return this.horses.find((h) => h.owner === 'player'); }

  // Called on region change (scene cleared): re-create the player's horse beside them.
  reset(keepPlayerHorse) {
    const coat = keepPlayerHorse?.coat;
    this.horses = this.horses.filter((h) => h.owner !== 'player');
    this.mount = null;
    if (coat) {
      const p = this.game.player.pos;
      this.spawn({ owner: 'player', coat, name: keepPlayerHorse.name, x: p.x + 3, z: p.z + 2 });
    }
  }

  nearest(r = 3) {
    const p = this.game.player.pos;
    let best = null, bd = r;
    for (const h of this.horses) { const d = Math.hypot(h.pos.x - p.x, h.pos.z - p.z); if (d < bd && !h.rider) { bd = d; best = h; } }
    return best;
  }

  mountHorse(h) {
    const pl = this.game.player;
    if (pl.combat.drawn) pl.draw(false);
    this.mount = h;
    h.rider = pl;
    pl.riding = h;
    pl.model.anim.setPose('ride');
    this.game.ui.notify(`You mount ${h.name}. W/S speed · A/D turn · Shift gallop · E dismount`, 'item');
  }
  dismount() {
    const h = this.mount, pl = this.game.player;
    if (!h) return;
    h.rider = null;
    this.mount = null;
    pl.riding = null;
    pl.model.anim.setPose(null);
    const sx = Math.cos(h.yaw), sz = -Math.sin(h.yaw);
    pl.pos.set(h.pos.x + sx * 1.1, this.game.world.groundHeight(h.pos.x + sx * 1.1, h.pos.z + sz * 1.1), h.pos.z + sz * 1.1);
    h.speed = 0;
  }
  whistle() {
    const h = this.playerHorse();
    if (!h) { this.game.ui.notify('You have no horse.'); return; }
    const p = this.game.player.pos;
    h.target = { x: p.x + 2, z: p.z + 2 };
    this.game.audio?.play('tick');
    this.game.ui.notify(`You whistle for ${h.name}.`);
  }

  // Player input while mounted; returns true if it consumed the frame.
  controlPlayer(dt) {
    const g = this.game, inp = g.input, pl = g.player, h = this.mount;
    if (!h) return false;
    let throttle = 0, turn = 0;
    if (inp.down('KeyW')) throttle += 1;
    if (inp.down('KeyS')) throttle -= 1;
    if (inp.down('KeyA')) turn += 1;
    if (inp.down('KeyD')) turn -= 1;
    const gallop = inp.down('ShiftLeft') && throttle > 0;
    // steer gently toward camera direction when moving and no A/D
    if (!turn && throttle > 0) h.yaw = dampAngle(h.yaw, g.cameraCtl.yaw, 1.4, dt);
    h.drive(dt, throttle, turn, gallop);
    if (inp.hit('KeyE') || pl.dead) { this.dismount(); return true; }
    pl.stop();
    return true;
  }

  // Keep the rider glued to the saddle after horse update.
  syncRider() {
    const h = this.mount, pl = this.game.player;
    if (!h) return;
    h.root.updateMatrixWorld(true);
    h.saddleWorld(this._v);
    pl.pos.set(this._v.x, this._v.y - 0.95 + 0.02, this._v.z);
    pl.vel.set(0, 0, 0);
    pl.yaw = h.yaw;
    pl.faceYaw = h.yaw;
    const r = pl.model.root;
    r.position.copy(pl.pos);
    r.rotation.y = h.yaw;
  }

  update(dt) {
    for (const h of this.horses) h.update(dt);
    this.syncRider();
  }

  toJSON() { const h = this.playerHorse(); return h ? { coat: h.coat, name: h.name } : null; }
}
