// Debug autopilot (?auto): plays the story end-to-end to smoke-test every mission.
// Teleports to objectives, advances dialogue, talks/interacts, and dispatches enemies.
export class Autopilot {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.log = [];
    this.lastMission = null;
    this.stuck = 0;
    game.autopilot = this;
  }

  note(s) { this.log.push(`[${this.g.story?.mission}] ${s}`); if (this.log.length > 400) this.log.shift(); }

  update(dt) {
    const g = this.g;
    if (!g.player || !g.story) return;
    this.t += dt;
    if (g.story.mission !== this.lastMission) { this.note('start'); this.lastMission = g.story.mission; this.stuck = 0; }
    // dialogue
    const d = g.dialogue;
    if (d.pending) {
      if (d.pending.choices) d.pick(0);
      else { const p = d.pending; d.pending = null; g.ui.finishTyping(); p.resolve(); }
      return;
    }
    if (this.t < 0.25) return;
    this.t = 0;
    const p = g.player;
    p.hp = p.hpMax; p.stamina = p.staminaMax; p.bleed = 0; p.food = 100;
    if (g.cutscene || g.busyInteract) return;
    const q = g.quests.tracked();
    // dispatch nearby hostiles (keep officers for a moment so scripted duels can trigger)
    let killed = 0;
    for (const c of g.entities.nearby(p.pos, 70)) {
      if (c.dead || c === p || !g.combat.hostile(p, c)) continue;
      if (c.tags.has('sparring')) { this.sp = (this.sp || 0) + 1; g.events.emit('hit', p, c, 5, { dir: ['left', 'right', 'overhead', 'thrust'][this.sp % 4], masterstrike: true }); g.events.emit('blocked', p, c); g.events.emit('perfectBlock', p, c); killed++; continue; }
      if (c.essential) continue;
      c.die(p); killed++;
      if (killed > 6) break;
    }
    if (!p.combat.drawn && q && q.objs.some((o) => o.id === 'draw' && !o.done)) p.draw(true);
    // quest marker
    const m = g.quests.markers()[0];
    if (m && m.x !== undefined) {
      const dx = m.x - p.pos.x, dz = m.z - p.pos.z;
      if (Math.hypot(dx, dz) > 2.2) { p.pos.set(m.x + 0.8, g.world.groundHeight(m.x + 0.8, m.z + 0.8), m.z + 0.8); p.vel.set(0, 0, 0); }
    }
    // talk / interact with whatever is close
    const near = g.entities.nearby(p.pos, 4).filter((c) => c !== p && !c.dead && !g.combat.hostile(p, c) && (g.story.talkHandlers.has(c.id)));
    if (near.length && !d.active) { g.interact({ kind: 'talk', c: near[0] }); return; }
    for (const it of g.world.interactables) {
      if (it.disabled) continue;
      if (Math.hypot(it.x - p.pos.x, it.z - p.pos.z) < 3.5 && g.story.objHandlers.has(it.id)) { g.interact({ kind: 'object', it }); return; }
    }
    // generic sold-item objective (chapter 1): sell sandals to anyone with a shop
    if (q && q.id === 'q_home' && !q.objs.find((o) => o.id === 'sell').done) {
      const shop = g.entities.list.find((c) => c.shop === 'salt' || c.shop === 'grocer');
      if (shop && p.inventory.has('sandals')) g.trade(shop, 'sandals', false);
    }
    if (q && q.id === 'q_medicine' && !p.inventory.has('medicine')) p.inventory.add('medicine');
    if (q && q.id === 'q_xz_pei' && g.story.talkHandlers.has('recruiter') && !q.objs.find((o) => o.id === 'troops').done) {
      const r = g.entities.get('recruiter'); if (r) { p.pos.copy(r.pos); p.pos.x += 1; }
    }
    this.stuck += 0.25;
    if (this.stuck > 240) { this.note('STUCK: ' + JSON.stringify(q?.objs.map((o) => [o.id, o.done]))); this.stuck = 0; }
  }
}
