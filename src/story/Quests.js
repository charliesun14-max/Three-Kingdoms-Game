// Quest log: objectives are predicates evaluated each frame, with optional markers.
export class Quest {
  constructor(def) {
    const { objectives: _o, ...rest } = def;
    Object.assign(this, rest);
    this.state = 'active';
    this.objs = (def.objectives || []).map((o) => ({ ...o, done: false, n: 0 }));
  }
  objectives() {
    return this.objs.filter((o) => !o.hidden || o.done).map((o) => ({ text: o.count ? `${o.text} (${Math.min(o.n, o.count)}/${o.count})` : o.text, done: o.done }));
  }
  current() { return this.objs.find((o) => !o.done && !o.optional); }
}

export class Quests {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.trackedId = null;
  }
  start(def, silent = false) {
    const ex = this.get(def.id);
    if (ex && ex.state === 'active') return ex;
    if (ex) this.list.splice(this.list.indexOf(ex), 1);
    const q = new Quest(def);
    this.list.push(q);
    if (!this.trackedId || def.main) this.trackedId = q.id;
    if (!silent) {
      this.game.ui.notify(`New quest: ${q.title} ${q.cn || ''}`, 'quest');
      this.game.audio?.play('quest');
    }
    q.onStart?.(this.game, q);
    return q;
  }
  get(id) { return this.list.find((q) => q.id === id); }
  active() { return this.list.filter((q) => q.state === 'active'); }
  completed() { return this.list.filter((q) => q.state === 'done'); }
  isActive(id) { return this.get(id)?.state === 'active'; }
  isDone(id) { return this.get(id)?.state === 'done'; }
  tracked() {
    const t = this.get(this.trackedId);
    if (t && t.state === 'active') return t;
    const m = this.active().find((q) => q.main) || this.active()[0];
    this.trackedId = m?.id;
    return m;
  }
  // mark objective done by id (used by story scripts)
  complete(qid, oid) {
    const q = this.get(qid);
    if (!q || q.state !== 'active') return;
    const o = q.objs.find((x) => x.id === oid);
    if (o && !o.done) { o.done = true; o.n = o.count || 1; this.game.audio?.play('tick'); this.game.ui.notify(`✓ ${o.text}`, 'quest'); o.onDone?.(this.game, q); }
  }
  progress(qid, oid, n = 1) {
    const q = this.get(qid);
    const o = q?.objs.find((x) => x.id === oid);
    if (!o || o.done) return;
    o.n += n;
    if (o.n >= (o.count || 1)) this.complete(qid, oid);
  }
  finish(qid) {
    const q = this.get(qid);
    if (!q || q.state !== 'active') return;
    q.state = 'done';
    const g = this.game;
    g.ui.notify(`Quest complete: ${q.title}`, 'quest');
    g.audio?.play('questDone');
    const r = q.reward || {};
    if (r.coins) { g.player.inventory.coins += r.coins; g.ui.notify(`+${r.coins} wuzhu coins`, 'item'); }
    if (r.merit) g.progression.addMerit(r.merit, q.title);
    if (r.items) for (const [id, n] of Object.entries(r.items)) g.giveItem(id, n);
    if (r.renown) g.progression.addRenown(r.renown);
    g.chronicleAdd(q.chronicle || `Completed “${q.title}”.`);
    q.onComplete?.(g, q);
    if (this.trackedId === qid) this.trackedId = null;
  }
  fail(qid) { const q = this.get(qid); if (q) { q.state = 'failed'; this.game.ui.notify(`Quest failed: ${q.title}`, 'vice'); } }

  update() {
    const g = this.game;
    for (const q of this.active()) {
      for (const o of q.objs) {
        if (o.done || !o.check) continue;
        const r = o.check(g, q, o);
        if (r === true) this.complete(q.id, o.id);
        else if (typeof r === 'number') { o.n = r; if (o.count && r >= o.count) this.complete(q.id, o.id); }
      }
      if (q.autoFinish !== false && q.objs.length && q.objs.every((o) => o.done || o.optional)) this.finish(q.id);
    }
  }

  markers() {
    const out = [];
    const q = this.tracked();
    if (!q) return out;
    for (const o of q.objs) {
      if (o.done || !o.marker) continue;
      const m = typeof o.marker === 'function' ? o.marker(this.game) : o.marker;
      if (m) out.push({ ...m, kind: m.kind || '', label: o.text });
      if (!o.optional) break;
    }
    return out;
  }

  toJSON() {
    return { tracked: this.trackedId, list: this.list.map((q) => ({ id: q.id, state: q.state, objs: q.objs.map((o) => ({ id: o.id, done: o.done, n: o.n })) })) };
  }
}
