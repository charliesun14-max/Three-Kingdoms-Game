// Registry of live characters with a coarse spatial hash for neighbour queries.
export class Entities {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.byId = new Map();
    this.cell = 8;
    this.grid = new Map();
  }
  add(c) {
    this.list.push(c);
    this.byId.set(c.id, c);
    this.game.engine.scene.add(c.model.root);
    return c;
  }
  remove(c) {
    c.ai?.cancelScript?.();
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
    if (this.byId.get(c.id) === c) this.byId.delete(c.id);
    c.model.root.parent?.remove(c.model.root);
  }
  get(id) { return this.byId.get(id); }
  withTag(tag) { return this.list.filter((c) => c.tags.has(tag)); }
  rebuild() {
    this.grid.clear();
    for (const c of this.list) {
      const k = `${Math.floor(c.pos.x / this.cell)},${Math.floor(c.pos.z / this.cell)}`;
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = []));
      a.push(c);
    }
  }
  nearby(p, r) {
    const out = [];
    const i0 = Math.floor((p.x - r) / this.cell), i1 = Math.floor((p.x + r) / this.cell);
    const j0 = Math.floor((p.z - r) / this.cell), j1 = Math.floor((p.z + r) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.grid.get(`${i},${j}`);
      if (!a) continue;
      for (const c of a) if (Math.hypot(c.pos.x - p.x, c.pos.z - p.z) <= r) out.push(c);
    }
    return out;
  }
  // Characters push each other apart.
  separate() {
    for (const [, a] of this.grid) {
      for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
        const p = a[i], q = a[j];
        if (p.dead || q.dead || p.ai?.hidden || q.ai?.hidden) continue;
        const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz), m = p.radius + q.radius;
        if (d < m && d > 1e-4) {
          const push = (m - d) / 2;
          const nx = dx / d, nz = dz / d;
          const wp = p === this.game.player ? 0.3 : 1, wq = q === this.game.player ? 0.3 : 1;
          p.pos.x -= nx * push * wp; p.pos.z -= nz * push * wp;
          q.pos.x += nx * push * wq; q.pos.z += nz * push * wq;
        }
      }
    }
  }
  update(dt) {
    // bodies of nameless soldiers fade from the world after a few minutes
    if (Math.random() < dt) for (const c of this.list) if (c.dead && !c.tags.has('cast') && this.game.clockTime - (c.deathTime || 0) > 240) { this.remove(c); break; }
    this.rebuild();
    const pl = this.game.player;
    this.frame = (this.frame || 0) + 1;
    for (const c of this.list) {
      const dist = pl ? Math.hypot(c.pos.x - pl.pos.x, c.pos.z - pl.pos.z) : 0;
      const far = dist > 170;
      c.model.root.visible = !far && !(c.ai && c.ai.hidden);
      if (far && c !== pl && !c.tags.has('alwaysActive')) continue;
      // level of detail: idle townsfolk further off think and animate less often (time is accumulated)
      c._acc = (c._acc || 0) + dt;
      const busy = c === pl || c.combat.target || c.combat.drawn || c.ai?.script || c.ai?.override?.chase || c.tags.has('alwaysActive') || this.game.cutscene;
      const lod = busy ? 1 : c.ai?.hidden ? 6 : dist > 60 ? 3 : dist > 25 ? 2 : 1;
      if (lod > 1 && (this.frame + (c._slot ?? (c._slot = Math.floor(Math.random() * 6)))) % lod) continue;
      const step = Math.min(c._acc, 0.2); c._acc = 0;
      if (c.ai && !this.game.cutscene?.freezeAI) c.ai.update(step);
      c.update(step);
    }
    this.separate();
  }
}
