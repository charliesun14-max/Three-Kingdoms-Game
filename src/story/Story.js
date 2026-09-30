// Story director: runs missions as async scripts, manages the cast of historical
// characters, routes conversations, and restores progress from saves.
import * as THREE from 'three';
import { wait } from '../ui/UI.js';
import { CHAPTER1 } from './chapters/ch1.js';
import { SMALLTALK } from './smalltalk.js';
import { itemDef } from '../rpg/Items.js';

export const MISSIONS = { ...CHAPTER1 };
export const MISSION_ORDER = Object.keys(MISSIONS);

export class Story {
  constructor(game) {
    this.g = game;
    this.mission = null;
    this.waiters = [];
    this.talkHandlers = new Map(); // id -> async fn(c) returning true if handled
    this.objHandlers = new Map();
    this.cast = {};
    this.runId = 0;
  }

  // ---------------------------------------------------------------- utilities
  waitFor(pred) {
    return new Promise((resolve) => this.waiters.push({ pred, resolve, run: this.runId }));
  }
  waitTime(sec) { const end = this.g.clockTime + sec; return this.waitFor(() => this.g.clockTime >= end); }
  near(x, z, r = 4) { const p = this.g.player.pos; return Math.hypot(p.x - x, p.z - z) < r; }
  get S() { return this.g.world.settlements.spots; }
  get P() { return this.g.world.region.places; }

  // Spawn or fetch a cast member (historical figure) by id.
  actor(id, spec) {
    const g = this.g;
    let c = g.entities.get(id);
    if (c && !c.dead) return c;
    c = g.spawnNPC({ id, faction: 'militia', essential: true, brain: { archetype: 'hero', fighter: true, mode: 'idle', passive: true }, ...spec });
    c.tags.add('cast');
    c.tags.add('alwaysActive');
    this.cast[id] = c;
    return c;
  }
  place(c, x, z, yaw) {
    c.pos.set(x, this.g.world.groundHeight(x, z), z);
    c.vel.set(0, 0, 0);
    if (yaw !== undefined) { c.yaw = yaw; c.faceYaw = yaw; }
  }
  dismiss(id) { const c = this.g.entities.get(id); if (c) this.g.entities.remove(c); delete this.cast[id]; }

  say(id, text, opts) { return this.g.dialogue.say(id, text, opts); }
  choose(id, text, choices) { return this.g.dialogue.choose(id, text, choices); }
  async convo(lines) {
    this.g.dialogue.begin();
    for (const [id, text] of lines) await this.say(id, text);
    this.g.dialogue.end();
  }

  async cutscene(fn, opts = {}) {
    const g = this.g;
    g.cutscene = { lockPlayer: true, camLocked: !!opts.camLocked, freezeAI: false };
    g.ui.letterbox(true);
    g.playerCtl.lockTarget = null;
    g.dialogue.begin();
    try { await fn(); } finally {
      g.dialogue.end();
      g.ui.letterbox(false);
      g.cutscene = null;
      g.cameraCtl.release();
      g.cameraCtl.snapBehind(g.player);
    }
  }
  shot(pos, look, speed = 2.5) {
    const g = this.g;
    const p = new THREE.Vector3(pos[0], (pos[1] ?? 1.7) + g.world.groundHeight(pos[0], pos[2]), pos[2]);
    const l = new THREE.Vector3(look[0], (look[1] ?? 1.4) + g.world.groundHeight(look[0], look[2]), look[2]);
    g.cameraCtl.cinematic(p, l, speed);
    if (speed > 50) { g.cameraCtl.pos.copy(p); g.cameraCtl.look.copy(l); }
  }
  async fadeOut(d = 1) { await this.g.ui.fade(1, d); }
  async fadeIn(d = 1) { await this.g.ui.fade(0, d); }
  teleportPlayer(x, z, yaw) {
    const p = this.g.player;
    p.pos.set(x, this.g.world.groundHeight(x, z), z);
    p.vel.set(0, 0, 0);
    if (yaw !== undefined) { p.yaw = yaw; this.g.cameraCtl.snapBehind(p); }
  }
  setTime(h) { const t = this.g.time; if (h < t.hour) t.addHours(24 - t.hour + h); else t.hour = h; }

  // ---------------------------------------------------------------- flow
  async begin(opts = {}) {
    const g = this.g;
    const start = opts.mission && MISSIONS[opts.mission] ? opts.mission : MISSION_ORDER[0];
    if (!opts.skipIntro && start === MISSION_ORDER[0]) await this.intro();
    await this.startMission(start, { fresh: true, debug: !!opts.mission });
  }

  async intro() {
    const g = this.g;
    g.ui.fadeEl.style.transition = 'none';
    g.ui.fadeEl.style.opacity = 1;
    g.ui.showHUD(false);
    await g.ui.chapterCard('第一章', '黃天當立', 'Chapter I · The Yellow Sky Shall Rise', 'Zhuo Commandery, You Province. The second month of the first year of Zhongping — 184 AD. Plague and famine stalk the land; the court is ruled by eunuchs. In Julu, a healer named Zhang Jiao has gathered followers beyond counting.');
    g.ui.showHUD(true);
  }

  async startMission(id, o = {}) {
    const g = this.g;
    const m = MISSIONS[id];
    if (!m) return;
    this.runId++;
    this.waiters = [];
    this.talkHandlers.clear();
    this.objHandlers.clear();
    this.mission = id;
    g.setFlag('mission', id);
    if (m.setup) await m.setup(this, g, o);
    g.save(true);
    const run = this.runId;
    try {
      await m.run(this, g, o);
    } catch (e) {
      if (e !== 'abort') console.error(e);
      return;
    }
    if (run !== this.runId) return;
    const idx = MISSION_ORDER.indexOf(id);
    const next = m.next || MISSION_ORDER[idx + 1];
    if (next && MISSIONS[next]) await this.startMission(next);
  }

  update() {
    const g = this.g;
    if (!this.waiters.length) return;
    this._n0 = this.waiters.length;
    const keep = [];
    for (const w of this.waiters) {
      if (w.run !== this.runId) continue;
      let ok = false;
      try { ok = w.pred(g); } catch { ok = false; }
      if (ok) w.resolve(); else keep.push(w);
    }
    // waiters registered while resolving are appended after this frame
    const added = this.waiters.slice(this._n0 ?? this.waiters.length);
    this.waiters = keep.concat(added.filter((w) => !keep.includes(w)));
  }

  // ---------------------------------------------------------------- conversations
  async talk(c) {
    const h = this.talkHandlers.get(c.id);
    if (h && (await h(c)) !== false) return;
    const m = MISSIONS[this.mission];
    if (m?.talk && (await m.talk(this, this.g, c)) === true) return;
    await this.smalltalk(c);
  }

  async smalltalk(c) {
    const g = this.g;
    const lines = SMALLTALK[c.role] || SMALLTALK.default;
    const ch = MISSIONS[this.mission]?.chapter || 1;
    const pool = lines.filter((l) => !l.ch || l.ch === ch);
    const line = pool[Math.floor(Math.random() * pool.length)]?.t || '...';
    g.dialogue.begin();
    const opts = [];
    if (c.shop) opts.push({ t: 'Let me see your wares.', v: 'shop' });
    if (this.canRecruit(c)) opts.push({ t: 'Join the volunteer army. The Han needs men.', v: 'recruit', tag: `Speech ${g.player.stats.speech} · Virtue ${g.progression.virtue}` });
    opts.push({ t: 'Any news?', v: 'news' });
    opts.push({ t: 'Farewell.', v: 'bye' });
    const r = await this.choose(c.id, line, opts);
    if (r === 'shop') { g.dialogue.end(); g.ui.openShop(c); return; }
    if (r === 'news') await this.say(c.id, this.news(c));
    if (r === 'recruit') await this.tryRecruit(c);
    g.dialogue.end();
  }

  news() {
    const f = this.g.flags;
    if (f.ch1_daxing_won) return 'They say Cheng Yuanzhi\'s head was taken by a red-faced giant with a crescent blade. Zhuo will sing of it for a hundred years!';
    if (f.ch1_oath) return 'Butcher Zhang has sold his lands to buy horses and blades. Three men swore brotherhood among the peach trees — the whole county talks of nothing else.';
    if (f.ch1_raid) return 'Rebels burned barns in Lousang. The Governor, Liu Yan, has posted a call for volunteers at the county office.';
    return 'Zhang Jiao\'s followers wear yellow cloth on their heads. They say the thirty-six fang will rise together on a jiazi day. Heaven help us.';
  }

  canRecruit(c) {
    const g = this.g;
    return g.flags.ch1_oath && ['farmer', 'townsman', 'traveller'].includes(c.role) && !c.tags.has('recruited') && g.army.troops.length < (g.progression.rankDef().troops || 2);
  }
  async tryRecruit(c) {
    const g = this.g;
    const chance = 0.25 + g.player.stats.speech * 0.04 + g.progression.virtue * 0.006 + g.progression.renown * 0.002;
    if (Math.random() < chance) {
      await this.say(c.id, 'You fought for Lousang when the rebels came. If you lead, I will follow. My mother will weep, but I will follow.');
      c.tags.add('recruited');
      g.entities.remove(c);
      g.army.recruit(1);
      g.progression.gain('speech', 2);
      g.progression.gain('leadership', 2);
      g.ui.notify(`${c.name} joins your squad.`, 'merit');
    } else {
      await this.say(c.id, 'I have fields to tend and mouths to feed. Find braver men than me.');
      g.progression.gain('speech', 0.5);
    }
  }

  async surrendered(c) {
    const g = this.g;
    g.dialogue.begin();
    const r = await this.choose(c.id, 'Mercy! Mercy, sir! I only joined them for a bowl of millet. I have a mother in Fanyang…', [
      { t: 'Go home, and never take up the yellow scarf again.', v: 'spare', tag: 'Virtue' },
      { t: 'Empty your purse, then run.', v: 'rob' },
      { t: 'Rebels deserve no mercy. (Execute)', v: 'kill' },
    ]);
    g.dialogue.end();
    if (r === 'spare') { g.progression.addVirtue(3, 'mercy'); c.ai.surrendered = false; c.faction = 'civilian'; c.ai.fighter = false; c.ai.mode = 'wander'; c.ai.area = { x: c.pos.x + 60, z: c.pos.z + 60, r: 30 }; c.model.anim.setPose(null); c.ai.fleeing = true; c.tags.add('spared'); g.events.emit('spared', c); }
    else if (r === 'rob') { g.player.inventory.coins += c.inventory.coins + 5; c.inventory.coins = 0; g.progression.addVirtue(-2, 'robbing the defeated'); c.ai.surrendered = false; c.faction = 'civilian'; c.ai.fighter = false; c.model.anim.setPose(null); c.ai.mode = 'wander'; c.ai.area = { x: c.pos.x + 80, z: c.pos.z, r: 30 }; g.events.emit('spared', c); }
    else { g.progression.addVirtue(-4, 'killing the defenceless'); c.die(g.player); g.progression.addMerit(4); }
  }

  async interact(it) {
    const h = this.objHandlers.get(it.id);
    if (h) { const r = await h(it); return r !== false; }
    return false;
  }

  // ---------------------------------------------------------------- save/restore
  toJSON() { return { mission: this.mission }; }
  async restore(s, questState) {
    const id = s?.mission && MISSIONS[s.mission] ? s.mission : MISSION_ORDER[0];
    // Replay mission from its start with the saved player state.
    const g = this.g;
    const pos = g.player.pos.clone();
    this.runId++;
    this.startMission(id, { restore: true, questState, pos });
    await wait(50);
    void itemDef;
  }
}
