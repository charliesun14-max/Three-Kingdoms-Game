// Shared helpers for scripted battles: waves, lines of allies, rout checks.
import { Rng } from '../core/Rng.js';
import { randomAppearance } from '../entities/Humanoid.js';
import { randomName } from '../entities/Population.js';

export const alive = (list) => list.filter((c) => !c.dead && !c.ai?.surrendered && !c.ai?.fleeing);

export const UNIFORMS = {
  yellowTurban: { look: 'yellowTurban', weapons: ['spear', 'spear', 'staff', 'dao', 'club', 'hoe'], body: [null, null, 'paddedJacket'], head: [null], arch: 'rebel', hp: 60, title: 'Yellow Turban' },
  han: { look: 'soldier', weapons: ['ji', 'spear', 'dao'], body: ['lamellar', 'leatherArmor'], head: ['ironHelmet'], arch: 'soldier', hp: 90, title: 'Han soldier' },
  militia: { look: 'militia', weapons: ['spear', 'spear', 'dao', 'ji'], body: ['paddedJacket', 'leatherArmor'], head: [null, 'leatherCap'], arch: 'militia', hp: 80, title: 'Soldier' },
  dongZhuo: { look: 'soldier', uniform: { robe: 0x3a2a3a }, weapons: ['ji', 'spear', 'dao'], body: ['lamellar'], head: ['ironHelmet'], arch: 'soldier', hp: 95, title: "Dong Zhuo's soldier" },
  bingzhou: { look: 'soldier', uniform: { robe: 0x6a1414 }, weapons: ['ji', 'ji', 'dao'], body: ['lamellar'], head: ['ironHelmet'], arch: 'soldier', hp: 110, title: 'Bingzhou rider', faction: 'dongZhuo' },
  enemy: { look: 'soldier', uniform: { robe: 0x2a3446 }, weapons: ['ji', 'spear', 'dao'], body: ['lamellar', 'leatherArmor'], head: ['ironHelmet'], arch: 'soldier', hp: 95, title: 'Enemy soldier' },
  bandit: { look: 'bandit', weapons: ['dao', 'club', 'axe', 'spear'], body: [null, 'paddedJacket'], head: [null], arch: 'bandit', hp: 65, title: 'Bandit' },
};

export class BattleKit {
  constructor(g, seed = 1) { this.g = g; this.rng = new Rng(seed); this.all = []; }

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
