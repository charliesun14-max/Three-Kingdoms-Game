// Async dialogue runner: `await dlg.say('liuBei', '...')`, `await dlg.choose([...])`.
import * as THREE from 'three';
import { SPEAKERS } from './Speakers.js';

export class Dialogue {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.pending = null; // {resolve, choices}
    this.depth = 0;
  }

  speaker(id) {
    if (typeof id === 'object') return id;
    const c = this.game.entities.get(id);
    const s = SPEAKERS[id];
    if (s) return s;
    if (c) return { name: c.name, cn: c.cn, title: c.title };
    if (id === 'player') return { name: this.game.player.name, cn: this.game.player.cn || '我', color: '#3a4a5a' };
    return { name: id, cn: '' };
  }

  // Frame the conversation with a cinematic camera between player and speaker.
  frame(id) {
    const g = this.game;
    const c = typeof id === 'string' ? g.entities.get(id) : null;
    const p = g.player;
    if (!c || !p || c === p) return;
    const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z, L = Math.hypot(dx, dz) || 1;
    // over-the-shoulder shot of the speaker; try both shoulders and a side angle, keep the clearest
    const look = new THREE.Vector3(c.pos.x, c.pos.y + 1.5 - c.model.anim.drop * 0.9, c.pos.z);
    const cands = [];
    for (const [back, sideOff] of [[1.6, 0.7], [1.6, -0.7], [0.4, 2.2], [0.4, -2.2]]) {
      const side = new THREE.Vector3(-dz / L, 0, dx / L);
      const cp = new THREE.Vector3(p.pos.x - (dx / L) * back, p.pos.y + 1.75, p.pos.z - (dz / L) * back).addScaledVector(side, sideOff);
      const blocked = g.cameraCtl.blockedLine(look.x, look.z, cp.x, cp.z);
      cands.push({ cp, blocked });
    }
    const pick = cands.find((k) => !k.blocked) || cands[0];
    g.cameraCtl.cinematic(pick.cp, look, 3.5);
    // turn to face each other
    if (!c.combat.drawn && !c.ai?.script) c.facePoint(p.pos.x, p.pos.z);
    p.facePoint(c.pos.x, c.pos.z);
  }

  begin() {
    this.depth++;
    if (this.active) return;
    this.active = true;
    const g = this.game;
    g.player.stop();
    g.input.exitLock();
    g.ui.prompt(null);
  }
  end() {
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth > 0) return;
    this.active = false;
    const g = this.game;
    g.ui.hideDialogue();
    if (!g.cutscene) g.cameraCtl.release();
    g.player.faceYaw = null;
    g.input.requestLock();
  }

  say(id, text, opts = {}) {
    const g = this.game;
    const sp = this.speaker(id);
    if (opts.frame !== false && !g.cutscene?.camLocked) this.frame(id);
    g.audio?.voice(sp, text);
    return new Promise((resolve) => {
      g.ui.showLine(sp, this.fmt(text), null);
      this.pending = { resolve, choices: null };
      const ch = g.entities.get(id);
      if (ch && !ch.model.anim.clip && !ch.combat.drawn && ch.model.anim.poseW < 0.5) ch.model.anim.play('talk_once');
    });
  }

  choose(id, text, choices) {
    const g = this.game;
    const sp = this.speaker(id);
    const avail = choices.filter((c) => !c.if || c.if(g));
    if (!g.cutscene?.camLocked) this.frame(id);
    return new Promise((resolve) => {
      g.ui.showLine(sp, this.fmt(text), avail.map((c) => ({ t: this.fmt(c.t), tag: c.tag })), (i) => this.pick(i));
      this.pending = { resolve, choices: avail };
    });
  }

  fmt(t) { return String(t).replace(/\{name\}/g, this.game.player?.name || 'friend'); }

  pick(i) {
    const p = this.pending;
    if (!p || !p.choices || i >= p.choices.length) return;
    this.pending = null;
    const c = p.choices[i];
    this.game.audio?.play('click');
    if (c.do) c.do(this.game);
    p.resolve(c.v !== undefined ? c.v : i);
  }

  update(dt) {
    if (!this.pending) return;
    const g = this.game, inp = g.input;
    const typed = g.ui.typeTick(dt);
    if (this.pending.choices) {
      for (let k = 0; k < this.pending.choices.length; k++) if (inp.hit(`Digit${k + 1}`)) { this.pick(k); return; }
      return;
    }
    if (inp.hit('Space') || inp.hit('Enter') || inp.hit('KeyE') || inp.mouseHit(0)) {
      if (!typed) { g.ui.finishTyping(); return; }
      const p = this.pending;
      this.pending = null;
      p.resolve();
    }
  }
}
