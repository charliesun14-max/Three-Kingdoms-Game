// Small skill games drawn as a DOM overlay: timing meters, rapid tapping, a fishing line.
// Each returns a promise. While one runs, game.minigame is set and the player stands still.

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class Minigames {
  constructor(game) {
    this.g = game;
  }

  open(title, cn, sub = '') {
    const g = this.g;
    g.minigame = true;
    g.input.exitLock();
    const el = h('div', 'mg');
    el.innerHTML = `<div class="mg-box"><div class="mg-title"><span class="cn">${cn}</span>${title}</div><div class="mg-sub">${sub}</div><div class="mg-body"></div><div class="mg-foot"></div></div>`;
    g.ui.root.appendChild(el);
    return { el, body: el.querySelector('.mg-body'), sub: el.querySelector('.mg-sub'), foot: el.querySelector('.mg-foot') };
  }
  close(m) {
    m.el.classList.add('out');
    setTimeout(() => m.el.remove(), 300);
    this.g.minigame = false;
    this.g.input.requestLock();
  }
  // resolves on Space / E / click
  press(m, keys = ['Space', 'KeyE']) {
    return new Promise((res) => {
      const k = (e) => { if (keys.includes(e.code)) { e.preventDefault(); done(); } };
      const c = () => done();
      const done = () => { window.removeEventListener('keydown', k, true); m.el.removeEventListener('mousedown', c); res(); };
      window.addEventListener('keydown', k, true);
      m.el.addEventListener('mousedown', c);
    });
  }
  wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // A needle sweeps a bar; stop it inside the gold zone. Returns accuracy 0..1 (1 = dead centre).
  async meter(m, { label = 'Press SPACE', zone = 0.16, speed = 1.2, center = null } = {}) {
    const bar = h('div', 'mg-meter', '<div class="zone"></div><div class="needle"></div>');
    const lab = h('div', 'mg-label', label);
    m.body.appendChild(lab); m.body.appendChild(bar);
    const zc = center ?? (0.25 + Math.random() * 0.5);
    const z = bar.querySelector('.zone'), n = bar.querySelector('.needle');
    z.style.left = `${(zc - zone / 2) * 100}%`; z.style.width = `${zone * 100}%`;
    let t = Math.random() * 3, run = true, last = performance.now(), x = 0;
    const tick = (now) => {
      if (!run) return;
      t += ((now - last) / 1000) * speed; last = now;
      x = 0.5 - 0.5 * Math.cos(t * Math.PI);
      n.style.left = `${x * 100}%`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await this.press(m);
    run = false;
    const acc = Math.max(0, 1 - Math.abs(x - zc) / (zone / 2));
    bar.classList.add(acc > 0 ? 'hit' : 'miss');
    await this.wait(450);
    bar.remove(); lab.remove();
    return acc;
  }

  // Tap SPACE as fast as you can against an opponent's pull. Returns true if you win.
  async tug(m, { label = 'Tap SPACE!', foe = 0.5, you = 0.5, secs = 12 } = {}) {
    const bar = h('div', 'mg-tug', '<div class="fill"></div><div class="mid"></div>');
    const lab = h('div', 'mg-label', label);
    m.body.appendChild(lab); m.body.appendChild(bar);
    const fill = bar.querySelector('.fill');
    let pos = 0.5, taps = 0, run = true, last = performance.now();
    const k = (e) => { if (e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); taps++; } };
    const c = () => taps++;
    window.addEventListener('keydown', k, true); m.el.addEventListener('mousedown', c);
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        pos += taps * 0.022 * (0.7 + you * 0.6); taps = 0;
        pos -= dt * (0.09 + foe * 0.16) * (1 + 0.3 * Math.sin(now / 300));
        pos = Math.max(0, Math.min(1, pos));
        fill.style.width = `${pos * 100}%`;
        if (pos >= 1 || pos <= 0 || (now - t0) / 1000 > secs) { run = false; res(); return; }
        if (run) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    window.removeEventListener('keydown', k, true); m.el.removeEventListener('mousedown', c);
    const win = pos >= 0.5;
    bar.classList.add(win ? 'hit' : 'miss');
    await this.wait(500);
    bar.remove(); lab.remove();
    return win;
  }

  // Fishing: wait for the bobber to dip, strike in time, then keep line tension in the safe band.
  async reel(m, { fight = 0.5 } = {}) {
    const lab = h('div', 'mg-label', 'Hold SPACE (or the mouse) to reel in. Ease off when the line is taut!');
    const bar = h('div', 'mg-reel', '<div class="safe"></div><div class="tension"></div>');
    const prog = h('div', 'mg-prog', '<div class="fill"></div>');
    m.body.appendChild(lab); m.body.appendChild(bar); m.body.appendChild(prog);
    const tEl = bar.querySelector('.tension'), pEl = prog.querySelector('.fill');
    let held = false, tension = 0.3, got = 0, last = performance.now();
    const kd = (e) => { if (e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); held = true; } };
    const ku = (e) => { if (e.code === 'Space' || e.code === 'KeyE') held = false; };
    const md = () => { held = true; }, mu = () => { held = false; };
    window.addEventListener('keydown', kd, true); window.addEventListener('keyup', ku, true);
    m.el.addEventListener('mousedown', md); window.addEventListener('mouseup', mu);
    const result = await new Promise((res) => {
      const tick = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const surge = Math.max(0, Math.sin(now / (380 - fight * 120)) * fight * 0.9);
        tension += (held ? 0.55 + surge : -0.6) * dt;
        tension = Math.max(0, Math.min(1, tension));
        if (held && tension < 0.85) got += dt * (0.22 - fight * 0.08);
        if (!held) got -= dt * 0.03;
        got = Math.max(0, got);
        tEl.style.left = `${tension * 100}%`;
        pEl.style.width = `${Math.min(1, got) * 100}%`;
        if (tension >= 1) { res('snap'); return; }
        if (got >= 1) { res('caught'); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    window.removeEventListener('keydown', kd, true); window.removeEventListener('keyup', ku, true);
    m.el.removeEventListener('mousedown', md); window.removeEventListener('mouseup', mu);
    lab.remove(); bar.remove(); prog.remove();
    return result;
  }

  // Choice buttons inside the overlay; resolves with the chosen value.
  choose(m, options) {
    return new Promise((res) => {
      const row = h('div', 'mg-choices');
      for (const o of options) {
        const b = h('button', 'mg-btn' + (o.disabled ? ' off' : ''), o.t);
        if (!o.disabled) b.onclick = () => { row.remove(); res(o.v); };
        row.appendChild(b);
      }
      m.body.appendChild(row);
    });
  }
  text(m, html) { const e = h('div', 'mg-text', html); m.body.appendChild(e); return e; }
}
