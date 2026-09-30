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
    this.rebuild();
    const pl = this.game.player;
    for (const c of this.list) {
      const far = pl && Math.hypot(c.pos.x - pl.pos.x, c.pos.z - pl.pos.z) > 170;
      c.model.root.visible = !far && !(c.ai && c.ai.hidden);
      if (far && c !== pl && !c.tags.has('alwaysActive')) continue;
      if (c.ai && !this.game.cutscene?.freezeAI) c.ai.update(dt);
      c.update(dt);
    }
    this.separate();
  }
}
