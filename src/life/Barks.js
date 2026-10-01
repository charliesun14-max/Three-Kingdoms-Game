// Floating speech above characters' heads (projected from world space each frame).
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Barks {
  constructor(game) {
    this.g = game;
    this.el = document.createElement('div');
    this.el.className = 'barks';
    game.ui.root.appendChild(this.el);
    this.list = [];
  }

  say(c, text, dur = 3.4) {
    if (!c || !text) return;
    this.list = this.list.filter((b) => { if (b.c === c) { b.el.remove(); return false; } return true; });
    const el = document.createElement('div');
    el.className = 'bark' + (c === this.g.player ? ' me' : '');
    el.textContent = text;
    this.el.appendChild(el);
    this.list.push({ c, el, until: this.g.clockTime + dur + text.length * 0.03 });
    if (this.list.length > 8) { const o = this.list.shift(); o.el.remove(); }
  }

  clear() { for (const b of this.list) b.el.remove(); this.list = []; }

  update() {
    const g = this.g, cam = g.engine.camera, W = g.engine.renderer.domElement.clientWidth, H = g.engine.renderer.domElement.clientHeight;
    const now = g.clockTime;
    const hide = !!g.dialogue?.active || g.ui.anyPanelOpen() || !!g.cutscene;
    this.list = this.list.filter((b) => {
      if (now > b.until || b.c.dead && b.c !== g.player) { b.el.remove(); return false; }
      const c = b.c;
      _v.set(c.pos.x, c.pos.y + (c.riding ? 2.9 : 2.1) - (c.model?.anim.drop || 0) * 0.8, c.pos.z);
      const d = _v.distanceTo(cam.position);
      _v.project(cam);
      const vis = !hide && _v.z < 1 && d < 28 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      b.el.style.display = vis ? '' : 'none';
      if (vis) {
        b.el.style.left = `${((_v.x + 1) / 2) * W}px`;
        b.el.style.top = `${((1 - _v.y) / 2) * H}px`;
        b.el.style.opacity = String(Math.min(1, (b.until - now) / 0.4) * (1 - Math.max(0, d - 16) / 12));
      }
      return true;
    });
  }
}
