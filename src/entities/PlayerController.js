// Player input -> character actions. When locked onto an enemy, mouse motion
// selects the attack direction (like Kingdom Come) instead of turning the camera.
import * as THREE from 'three';
import { clamp } from '../core/MathUtil.js';

export class PlayerController {
  constructor(game, char) {
    this.game = game;
    this.c = char;
    this.selDir = 'right';
    this.stick = { x: 0, y: 0 };
    this.lockTarget = null;
    this.sprinting = false;
  }

  hostilesNear(r = 12) {
    const g = this.game, c = this.c;
    return g.entities.nearby(c.pos, r).filter((o) => o !== c && !o.dead && (g.combat.hostile(c, o) || o === this.lockTarget || o.tags.has('sparring')) && !o.ai?.surrendered);
  }

  pickLock(cycle = false) {
    const g = this.game, c = this.c;
    const cam = g.cameraCtl;
    const list = this.hostilesNear(14).map((o) => {
      const a = Math.atan2(o.pos.x - c.pos.x, o.pos.z - c.pos.z);
      let da = a - cam.yaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      return { o, score: Math.abs(da) * 6 + c.distTo(o) };
    }).sort((a, b) => a.score - b.score);
    if (!list.length) return null;
    if (cycle && this.lockTarget) {
      const i = list.findIndex((e) => e.o === this.lockTarget);
      return list[(i + 1) % list.length].o;
    }
    return list[0].o;
  }

  update(dt) {
    const g = this.game, c = this.c, inp = g.input;
    if (c.dead) { c.stop(); return; }
    const cam = g.cameraCtl;
    const t = g.clockTime;

    // --- lock-on management
    if (this.lockTarget && (this.lockTarget.dead || this.lockTarget.ai?.surrendered || c.distTo(this.lockTarget) > 18 || !c.combat.drawn)) this.lockTarget = null;
    if (c.combat.drawn && !this.lockTarget && c.weaponCls !== 'bow') {
      const n = this.pickLock();
      if (n && c.distTo(n) < 9) this.lockTarget = n;
    }
    if (inp.hit('Tab') && c.combat.drawn) this.lockTarget = this.pickLock(true);
    c.combat.target = this.lockTarget;

    // --- movement
    let mx = 0, mz = 0;
    if (inp.down('KeyW')) mz += 1;
    if (inp.down('KeyS')) mz -= 1;
    if (inp.down('KeyA')) mx -= 1;
    if (inp.down('KeyD')) mx += 1;
    if (inp.hit('KeyC')) c.sneak = !c.sneak;
    const L = Math.hypot(mx, mz);
    const yaw = cam.yaw;
    // camera-relative: forward = direction camera looks
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let dx = 0, dz = 0;
    if (L > 0) { dx = (fx * mz + rx * mx) / L; dz = (fz * mz + rz * mx) / L; }
    this.sprinting = inp.down('ShiftLeft') && L > 0 && c.stamina > 5 && !c.combat.blocking;
    let speed = c.combat.drawn ? (this.sprinting ? 4.2 : 2.0) : this.sprinting ? 5.6 : c.sneak ? 1.2 : 2.3;
    if (c.inventory.weight() > 40) speed *= 0.8;
    if (c.drunk) speed *= 0.85;
    c.desired.set(dx * speed * c.speedMul, 0, dz * speed * c.speedMul);
    if (c.drunk > 0) { c.desired.x += Math.sin(t * 1.3) * c.drunk; c.drunk = Math.max(0, c.drunk - dt * 0.004); }
    if (this.sprinting && c.combat.drawn) c.stamina -= 6 * dt;
    if (L > 0 && c.sneak) g.progression?.gain('stealth', dt * 0.05);

    // --- combat input
    if (inp.hit('KeyF')) { c.draw(!c.combat.drawn); if (!c.combat.drawn) this.lockTarget = null; }
    if (c.combat.drawn) {
      // direction selection from mouse motion
      if (this.lockTarget) {
        this.stick.x = clamp(this.stick.x * Math.exp(-dt * 3) + inp.mouse.dx * 0.06, -1, 1);
        this.stick.y = clamp(this.stick.y * Math.exp(-dt * 3) + inp.mouse.dy * 0.06, -1, 1);
        const ax = Math.abs(this.stick.x), ay = Math.abs(this.stick.y);
        if (Math.max(ax, ay) > 0.35) this.selDir = ax > ay ? (this.stick.x > 0 ? 'right' : 'left') : this.stick.y < 0 ? 'overhead' : 'thrust';
      }
      // keyboard alternatives (1-4 while armed select direction)
      if (inp.hit('KeyZ')) this.selDir = 'left';
      if (inp.hit('KeyX')) this.selDir = 'overhead';
      if (inp.hit('KeyV')) this.selDir = 'right';
      if (inp.hit('KeyB')) this.selDir = 'thrust';
      if (c.weaponCls === 'bow') {
        if (inp.mouseDown(0) && c.canAct()) { this.bowDraw = Math.min(1, (this.bowDraw || 0) + dt * 1.1); c.stamina -= dt * 6; g.cameraCtl.aiming = true; }
        else if (this.bowDraw > 0.15) {
          const cam = g.engine.camera;
          const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
          const from = c.pos.clone(); from.y += 1.45; from.addScaledVector(dir, 0.6);
          g.combat.archery.shoot(c, from, dir, this.bowDraw);
          g.progression.gain('archery', 1);
          this.bowDraw = 0; g.cameraCtl.aiming = false;
        } else { this.bowDraw = 0; g.cameraCtl.aiming = false; }
        c.faceYaw = g.cameraCtl.yaw;
      } else if (inp.mouseHit(0)) {
        const sw = this.lockTarget ? null : inp.swipeDir(8);
        const dir = sw ? { left: 'left', right: 'right', up: 'overhead', down: 'thrust' }[sw] : this.selDir;
        if (c.startAttack(dir)) this.selDir = dir;
      }
      c.setBlocking(inp.mouseDown(2));
      if (inp.hit('Space') && L > 0) c.dodge(dx, dz);
      else if (inp.hit('Space')) c.dodge(-Math.sin(c.yaw), -Math.cos(c.yaw));
      if (this.lockTarget) c.faceYaw = null;
      else if (L > 0) c.faceYaw = Math.atan2(dx, dz);
      else if (c.combat.attack || c.combat.blocking) c.faceYaw = cam.yaw;
    } else {
      c.setBlocking(false);
      c.faceYaw = null;
      if (inp.mouseHit(0) && !g.ui.anyPanelOpen()) { c.draw(true); }
    }

    // quick items
    if (inp.hit('Digit1')) g.useItem('bandage');
    if (inp.hit('Digit2')) g.useItem('medicine');
    if (inp.hit('Digit3')) g.useItem(c.inventory.has('driedMeat') ? 'driedMeat' : 'milletCake');
    // squad commands
    if (inp.hit('KeyG')) g.army?.cycleOrder();
  }
}
