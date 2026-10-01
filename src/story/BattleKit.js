// Shared helpers for scripted battles: waves, lines of allies, rout checks.
import { Rng } from '../core/Rng.js';
import { randomAppearance } from '../entities/Humanoid.js';
import { randomName } from '../entities/Population.js';
import { BARKS, pick } from '../life/barkLines.js';

const SIDE_COLOR = { yellowTurban: 0xc8a020, han: 0x9a1e14, militia: 0x9a1e14, dongZhuo: 0x3a1a2a, enemy: 0x1c2436, bandit: 0x3a3028 };

export const alive = (list) => list.filter((c) => !c.dead && !c.ai?.surrendered && !c.ai?.fleeing);

export const UNIFORMS = {
  yellowTurban: { look: 'yellowTurban', weapons: ['spear', 'spear', 'staff', 'dao', 'club', 'hoe'], body: [null, null, 'paddedJacket'], head: [null], arch: 'rebel', hp: 60, title: 'Yellow Turban' },
  han: { look: 'soldier', weapons: ['ji', 'spear', 'dao', 'bow'], body: ['lamellar', 'leatherArmor'], head: ['ironHelmet'], arch: 'soldier', hp: 90, title: 'Han soldier' },
  militia: { look: 'militia', weapons: ['spear', 'spear', 'dao', 'ji'], body: ['paddedJacket', 'leatherArmor'], head: [null, 'leatherCap'], arch: 'militia', hp: 80, title: 'Soldier' },
  dongZhuo: { look: 'soldier', uniform: { robe: 0x3a2a3a }, weapons: ['ji', 'spear', 'dao'], body: ['lamellar'], head: ['ironHelmet'], arch: 'soldier', hp: 95, title: "Dong Zhuo's soldier" },
  bingzhou: { look: 'soldier', uniform: { robe: 0x6a1414 }, weapons: ['ji', 'ji', 'dao'], body: ['lamellar'], head: ['ironHelmet'], arch: 'soldier', hp: 110, title: 'Bingzhou rider', faction: 'dongZhuo' },
  enemy: { look: 'soldier', uniform: { robe: 0x2a3446 }, weapons: ['ji', 'spear', 'dao', 'bow'], body: ['lamellar', 'leatherArmor'], head: ['ironHelmet'], arch: 'soldier', hp: 95, title: 'Enemy soldier' },
  bandit: { look: 'bandit', weapons: ['dao', 'club', 'axe', 'spear'], body: [null, 'paddedJacket'], head: [null], arch: 'bandit', hp: 65, title: 'Bandit' },
};

export class BattleKit {
  constructor(g, seed = 1) { this.g = g; this.rng = new Rng(seed); this.all = []; this.sides = []; }

  // A standard-bearer keeps the banner a few paces behind the middle of his side and never runs —
  // unless the side breaks. His death shakes the whole army.
  standard(list, kind) {
    const live = list.filter((c) => !c.dead);
    if (!live.length) return null;
    const cx = live.reduce((a, c) => a + c.pos.x, 0) / live.length, cz = live.reduce((a, c) => a + c.pos.z, 0) / live.length;
    const b = this.soldier(kind, cx, cz, { weapon: 'dao' });
    b.title = 'standard-bearer';
    b.model.setProp('standard');
    b.model.propMesh?.userData.cloth?.material.color.setHex(SIDE_COLOR[b.faction] ?? 0x9a1e14);
    b.ai.fighter = false;
    const g = this.g;
    b.ai.override = () => {
      if (b.ai.fleeing) return false;
      const l = list.filter((c) => !c.dead && c !== b);
      if (!l.length) return false;
      const mx = l.reduce((a, c) => a + c.pos.x, 0) / l.length, mz = l.reduce((a, c) => a + c.pos.z, 0) / l.length;
      const fx = l.reduce((a, c) => a + (c.combat.target ? c.combat.target.pos.x - c.pos.x : 0), 0), fz = l.reduce((a, c) => a + (c.combat.target ? c.combat.target.pos.z - c.pos.z : 0), 0);
      const L = Math.hypot(fx, fz) || 1;
      if (b.ai.navTo(mx - (fx / L) * 6, mz - (fz / L) * 6, 3.2, 1.5)) { b.stop(); b.faceYaw = Math.atan2(fx, fz); }
      const cl = b.model.propMesh?.userData.cloth;
      if (cl) cl.rotation.y = Math.sin(g.clockTime * 2.3 + b.pos.x) * 0.35;
      return true;
    };
    list.push(b);
    return b;
  }

  // Opt-in morale: when a side has lost its general or most of its men, the rest break and run.
  morale(list, opts = {}) {
    const side = { list, n0: list.length, general: opts.general || null, broken: false, name: opts.name || '', bearer: opts.bearer || null };
    this.sides.push(side);
    if (!this.g.battleKits) this.g.battleKits = new Set();
    this.g.battleKits.add(this);
    return side;
  }
  update() {
    for (const s of this.sides) {
      if (s.broken) continue;
      const left = alive(s.list).length;
      const shaken = (s.general?.dead ? 0.25 : 0) + (s.bearer?.dead ? 0.15 : 0);
      if (left / Math.max(1, s.n0) < 0.35 + shaken) {
        s.broken = true;
        this.rout(s.list);
        const g = this.g, live = alive(s.list).concat(s.list.filter((c) => !c.dead && c.ai?.fleeing));
        g.audio?.play('horn');
        g.ui.notify(`${s.name || 'The enemy'}: the line breaks and they flee!`, 'merit');
        live.slice(0, 3).forEach((c, i) => setTimeout(() => !c.dead && g.barks?.say(c, pick(['Run! Run for your lives!', 'The banner has fallen — flee!', 'Retreat! Retreat!', 'It\'s lost! Save yourselves!']), 2.5), i * 400));
      }
    }
    if (this.sides.every((s) => s.broken || !alive(s.list).length)) this.g.battleKits?.delete(this);
  }

  soldier(kind, x, z, extra = {}) {
    const g = this.g, rng = this.rng, U = UNIFORMS[kind] || UNIFORMS.enemy;
    const faction = extra.faction || U.faction || kind;
    const c = g.spawnNPC({
      ...randomName(rng), title: U.title, role: 'soldier', faction, x, z,
      appearance: { ...randomAppearance(U.look, rng), ...(U.uniform || {}) },
      weapon: extra.weapon || rng.pick(U.weapons), body: rng.pick(U.body), head: rng.pick(U.head), shield: rng.chance(0.25),
      stats: { str: rng.int(8, 11), vit: rng.int(7, 11), agi: rng.int(7, 10), polearm: rng.int(3, 8), blade: rng.int(3, 8), block: rng.int(3, 7) },
      hp: extra.hp || U.hp,
      brain: { archetype: extra.arch || U.arch, fighter: true, mode: 'wander', aggroRange: extra.aggro || 60, tune: extra.tune },
    });
    c.tags.add('alwaysActive');
    c.tags.add('battle');
    c.inventory.coins = rng.int(1, 15);
    if (kind === 'yellowTurban') c.inventory.add('yellowCloth');
    this.all.push(c);
    return c;
  }

  // A clump of soldiers around (x,z) that advances toward target point.
  wave(kind, n, x, z, target, extra = {}) {
    const list = [];
    for (let i = 0; i < n; i++) {
      const c = this.soldier(kind, x + this.rng.range(-10, 10), z + this.rng.range(-7, 7), extra);
      c.ai.area = { x: target.x, z: target.z, r: 6 };
      list.push(c);
    }
    return list;
  }

  // Allied line holding a position facing a direction.
  line(kind, n, x, z, faceYaw, extra = {}) {
    const list = [];
    const cx = Math.cos(faceYaw), sx = Math.sin(faceYaw);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 8), col = (i % 8) - 3.5;
      const px = x + cx * col * 1.8 - sx * row * 1.8, pz = z - sx * col * 1.8 - cx * row * 1.8;
      const c = this.soldier(kind, px, pz, { ...extra, aggro: extra.aggro || 30 });
      c.ai.mode = 'guard';
      c.ai.post = { x: px, z: pz, rot: faceYaw };
      c.yaw = faceYaw;
      list.push(c);
    }
    if (n >= 10 && !extra.noStandard) this.standard(list, kind);
    return list;
  }

  officer(o) {
    const g = this.g;
    const c = g.spawnNPC({ brain: { archetype: 'officer', fighter: true, mode: 'wander', aggroRange: 60 }, hp: 300, ...o });
    c.tags.add('officer'); c.tags.add('alwaysActive'); c.tags.add('battle');
    c.ai.area = { x: o.x, z: o.z, r: 8 };
    this.all.push(c);
    return c;
  }

  charge(list, target) { for (const c of list) { c.ai.mode = 'wander'; c.ai.area = { x: target.x, z: target.z, r: 6 }; c.ai.aggroRange = 80; } }
  rout(list) { for (const c of alive(list)) c.ai.fleeing = true; }
  clear() { for (const c of this.all) if (c.dead || c.ai?.fleeing) this.g.entities.remove(c); }
}
