// The player's personal squad: recruits follow in formation and obey simple orders.
import { Rng } from '../core/Rng.js';
import { randomAppearance } from '../entities/Humanoid.js';
import { randomName } from '../entities/Population.js';

const ORDERS = [
  { id: 'follow', name: 'Follow me', cn: '隨我' },
  { id: 'charge', name: 'Charge!', cn: '衝鋒' },
  { id: 'hold', name: 'Hold position', cn: '堅守' },
];

export class Army {
  constructor(game) {
    this.game = game;
    this.troops = [];
    this.order = 'follow';
    this.rng = new Rng(77);
    this.kit = { weapon: 'spear', body: 'paddedJacket', head: null, look: 'militia' };
  }
  slot(i) {
    // two ranks behind the leader
    const row = Math.floor(i / 4), col = i % 4;
    return [(col - 1.5) * 1.5, -2.2 - row * 1.6];
  }
  recruit(n = 1, opts = {}) {
    const g = this.game, p = g.player;
    for (let k = 0; k < n; k++) {
      const nm = randomName(this.rng);
      const i = this.troops.length;
      const [fx, fz] = this.slot(i);
      const c = g.spawnNPC({
        ...nm, title: opts.title || 'Your soldier', role: 'soldier', faction: 'militia', x: p.pos.x + fx, z: p.pos.z + fz,
        appearance: randomAppearance(opts.look || this.kit.look, this.rng), weapon: opts.weapon || this.kit.weapon, shield: opts.shield ?? false,
        body: opts.body ?? this.kit.body, head: opts.head ?? this.kit.head,
        stats: { str: 9, vit: 9, agi: 8, polearm: 5, blade: 4, block: 4 },
        brain: { archetype: opts.archetype || 'militia', fighter: true, mode: 'follow', leader: p, formation: [fx, fz], aggroRange: 14 },
      });
      c.tags.add('squad');
      c.tags.add('alwaysActive');
      this.troops.push(c);
    }
    this.applyOrder();
  }
  dismissAll() { for (const t of this.troops) this.game.entities.remove(t); this.troops = []; }
  alive() { return this.troops.filter((t) => !t.dead); }
  cycleOrder() {
    if (!this.alive().length) return;
    const i = ORDERS.findIndex((o) => o.id === this.order);
    this.order = ORDERS[(i + 1) % ORDERS.length].id;
    this.applyOrder();
    const o = ORDERS.find((x) => x.id === this.order);
    this.game.ui.subtitle(this.game.player.name, `${o.name} ${o.cn}`, 2);
    this.game.audio.play(this.order === 'charge' ? 'horn' : 'drum');
  }
  applyOrder() {
    const p = this.game.player;
    this.alive().forEach((t, i) => {
      const ai = t.ai;
      ai.formation = this.slot(i);
      if (this.order === 'follow') { ai.mode = 'follow'; ai.aggroRange = 12; ai.leader = p; }
      else if (this.order === 'charge') { ai.mode = 'follow'; ai.aggroRange = 45; }
      else if (this.order === 'hold') { ai.mode = 'guard'; ai.post = { x: t.pos.x, z: t.pos.z, rot: t.yaw }; ai.aggroRange = 8; }
    });
  }
  update(dt) {
    // prune the dead from the formation periodically
    if (this.troops.some((t) => t.dead) && Math.random() < dt) {
      this.troops = this.troops.filter((t) => !t.dead || this.game.clockTime - t.deathTime < 1);
      this.applyOrder();
    }
  }
  toJSON() { return { n: this.alive().length, order: this.order, kit: this.kit }; }
  load(o) {
    if (!o) return;
    this.kit = o.kit || this.kit;
    this.dismissAll();
    if (o.n) this.recruit(o.n);
    this.order = o.order || 'follow';
    this.applyOrder();
  }
}
