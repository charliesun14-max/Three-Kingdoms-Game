// Arrows: ballistic projectiles with simple character hit tests.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _t = new THREE.Vector3();
export class Archery {
  constructor(game) {
    this.game = game;
    this.arrows = [];
    this.geo = new THREE.CylinderGeometry(0.006, 0.006, 0.8, 4);
    this.geo.rotateX(Math.PI / 2);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8 });
  }

  shoot(owner, from, dir, power = 1) {
    const g = this.game;
    const speed = 22 + 30 * power;
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.copy(from);
    g.engine.scene.add(m);
    this.arrows.push({ owner, pos: from.clone(), vel: dir.clone().normalize().multiplyScalar(speed), life: 6, mesh: m, stuck: false, dmg: (owner.weapon.dmg.stab || 20) * (0.5 + power * 0.7) });
    g.audio?.play('bow', from);
    g.life?.act.onArrowShot(owner);
  }

  update(dt) {
    const g = this.game;
    for (const a of this.arrows) {
      a.life -= dt;
      if (a.stuck) continue;
      const prev = _v.copy(a.pos);
      a.vel.y -= 9.8 * dt;
      a.pos.addScaledVector(a.vel, dt);
      a.mesh.position.copy(a.pos);
      a.mesh.lookAt(a.pos.clone().add(a.vel));
      // straw butts on the archery range: segment against each target's face
      let struck = false;
      for (const tg of this.targets || []) {
        const d0 = _t.subVectors(prev, tg.center).dot(tg.normal), d1 = _t.subVectors(a.pos, tg.center).dot(tg.normal);
        if (d0 < 0 || d1 > 0.02) continue;
        const u = d0 / (d0 - d1 || 1);
        const hit = _t.copy(prev).lerp(a.pos, u);
        const dist = hit.distanceTo(tg.center);
        if (dist < tg.r) { a.pos.copy(hit).addScaledVector(tg.normal, 0.05); a.mesh.position.copy(a.pos); a.stuck = true; a.life = 30; g.life?.act.onTargetHit(tg, dist); struck = true; break; }
      }
      if (struck) continue;
      if (g.wildlife?.arrowHit(a.pos, a.owner, a.dmg)) { a.stuck = true; a.life = Math.min(a.life, 0.1); continue; }
      // hit characters
      for (const c of g.entities.nearby(a.pos, 3)) {
        if (c === a.owner || c.dead || !(g.combat.hostile(a.owner, c) || a.owner.combat.target === c)) continue;
        const dy = a.pos.y - (c.pos.y + 1.1);
        if (Math.abs(dy) > 0.95) continue;
        if (Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z) < c.radius + 0.15) {
          const blocked = c.combat.blocking && c.equip.shield && Math.abs(c.angleTo(a.owner)) < 1.2;
          if (blocked) { g.audio?.play('shieldBlock', c.pos); }
          else {
            const arm = c.armorValue('stab');
            const dmg = a.dmg * (60 / (60 + arm * 2.2)) * (c === g.player ? g.settings.damageTaken : 1);
            c.damage(dmg, a.owner, { arrow: true });
            if (Math.random() < 0.5) c.bleed = Math.min(6, c.bleed + 0.6);
            g.combat.blood.burst(a.pos, 12, Math.atan2(a.vel.x, a.vel.z));
            g.audio?.play('arrowHit', c.pos);
            if (!c.dead) c.stagger(0.3);
            g.events.emit('hit', a.owner, c, dmg, { dir: 'thrust', arrow: true });
          }
          a.stuck = true; a.life = Math.min(a.life, 0.1);
          break;
        }
      }
      // hit ground
      const gy = g.world.groundHeight(a.pos.x, a.pos.z);
      if (a.pos.y < gy) { if (Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z) < 30) g.audio?.play('arrowGround', a.pos); a.pos.y = gy + 0.05; a.mesh.position.copy(a.pos); a.stuck = true; a.life = Math.min(a.life, 20); }
      void prev;
    }
    for (const a of this.arrows) if (a.life <= 0) g.engine.scene.remove(a.mesh);
    this.arrows = this.arrows.filter((a) => a.life > 0);
  }
}
