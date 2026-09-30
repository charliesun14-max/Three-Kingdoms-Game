// Third-person orbit camera with lock-on framing, collision and cinematic mode.
import * as THREE from 'three';
import { clamp, dampAngle, lerp } from '../core/MathUtil.js';

export class CameraController {
  constructor(game) {
    this.game = game;
    this.cam = game.engine.camera;
    this.yaw = 0;
    this.pitch = 0.18;
    this.dist = 3.6;
    this.targetDist = 3.6;
    this.sens = 0.0024;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.cine = null; // {pos, look, speed}
    this.shake = 0;
    this.fov = 62;
  }

  cinematic(pos, look, speed = 2.5) {
    const p = this.unblock(pos, look);
    this.cine = { pos: p, look: look.clone(), speed };
  }

  // True if the XZ segment a->b crosses a tall static collider (walls, buildings).
  blockedLine(ax, az, bx, bz) {
    const col = this.game.world.colliders;
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(L / 0.25);
    for (let k = 1; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      for (const c of col.query(x, z, 0.3)) {
        if (c.kind === 'tree' || c.kind === 'prop' || c.kind === 'pole' || c.kind === 'fire' || c.type !== 'box') continue;
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
        if (Math.abs(lx) < c.hw + 0.25 && Math.abs(lz) < c.hd + 0.25) return true;
      }
    }
    return false;
  }
  // Pull a camera position toward its look target until the view is unobstructed.
  unblock(pos, look) {
    const p = pos.clone();
    for (let i = 0; i < 20 && this.blockedLine(look.x, look.z, p.x, p.z); i++) p.lerp(look, 0.12);
    const gy = this.game.world.groundHeight(p.x, p.z) + 0.4;
    if (p.y < gy) p.y = gy;
    return p;
  }
  release() { this.cine = null; }

  snapBehind(char) {
    this.yaw = char.yaw;
    this.pitch = 0.2;
  }

  update(dt) {
    const g = this.game, inp = g.input, p = g.player;
    if (this.cine) {
      const k = 1 - Math.exp(-this.cine.speed * dt);
      this.pos.lerp(this.cine.pos, k);
      this.look.lerp(this.cine.look, k);
      this.cam.position.copy(this.pos);
      this.cam.lookAt(this.look);
      return;
    }
    if (!p) return;
    const lock = g.playerCtl?.lockTarget;
    if (!g.ui.anyPanelOpen() && !g.dialogue?.active) {
      if (!lock) {
        this.yaw -= inp.mouse.dx * this.sens * (g.settings.invertX ? -1 : 1);
        this.pitch += inp.mouse.dy * this.sens * (g.settings.invertY ? -1 : 1);
      } else {
        // subtle look while locked
        this.pitch += inp.mouse.dy * this.sens * 0.15;
      }
      this.targetDist = clamp(this.targetDist + inp.mouse.wheel * 0.4, 1.8, 7.5);
    }
    this.pitch = clamp(this.pitch, -0.5, 1.15);
    this.dist = lerp(this.dist, lock ? Math.max(3.4, this.targetDist) : this.targetDist, 1 - Math.exp(-6 * dt));
    const head = new THREE.Vector3(p.pos.x, p.pos.y + 1.55 - p.model.anim.drop * 0.9, p.pos.z);
    if (lock) {
      const tx = lock.pos.x - p.pos.x, tz = lock.pos.z - p.pos.z;
      const want = Math.atan2(tx, tz);
      this.yaw = dampAngle(this.yaw, want, 5, dt);
      this.pitch = lerp(this.pitch, 0.22, 1 - Math.exp(-3 * dt));
    }
    // shoulder offset to the right
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const off = p.combat.drawn ? 0.55 : 0.4;
    const pivot = head.clone().addScaledVector(right, off);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const back = new THREE.Vector3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    let d = this.dist;
    // collision against static colliders (walls, buildings) along XZ
    const col = g.world.colliders;
    for (let s = 0.4; s <= d; s += 0.25) {
      const x = pivot.x + back.x * s, z = pivot.z + back.z * s;
      let blocked = false;
      for (const c of col.query(x, z, 0.3)) {
        if (c.kind === 'tree' || c.kind === 'prop' || c.kind === 'pole' || c.kind === 'fire') continue;
        if (c.type === 'box') {
          const dx = x - c.x, dz = z - c.z;
          const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
          if (Math.abs(lx) < c.hw + 0.2 && Math.abs(lz) < c.hd + 0.2) { blocked = true; break; }
        }
      }
      if (blocked) { d = Math.max(0.6, s - 0.3); break; }
    }
    const target = pivot.clone().addScaledVector(back, d);
    const gy = g.world.groundHeight(target.x, target.z) + 0.35;
    if (target.y < gy) target.y = gy;
    const k = 1 - Math.exp(-14 * dt);
    this.pos.lerp(target, k);
    if (this.pos.distanceTo(target) > 8) this.pos.copy(target);
    const lookAt = lock ? head.clone().lerp(new THREE.Vector3(lock.pos.x, lock.pos.y + 1.3, lock.pos.z), 0.35) : pivot.clone().addScaledVector(back, -4);
    this.look.lerp(lookAt, 1 - Math.exp(-12 * dt));
    this.cam.position.copy(this.pos);
    if (this.shake > 0) {
      this.cam.position.x += (Math.random() - 0.5) * this.shake;
      this.cam.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.cam.lookAt(this.look);
    const wantFov = g.playerCtl?.sprinting ? 68 : 62;
    this.fov = lerp(this.fov, wantFov, 1 - Math.exp(-4 * dt));
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}
