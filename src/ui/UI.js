// DOM-based HUD, dialogue box, notifications and fullscreen overlays.
import { itemDef, RANKS, rankIndex, ARMORS } from '../rpg/Items.js';
import { SKILLS } from '../rpg/Progression.js';
import { WEAPONS } from '../combat/Weapons.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.hud = h('div', 'hud hidden');
    root.appendChild(this.hud);
    this.hud.innerHTML = `
      <div class="hud-date"><div class="cn"></div><div class="en"></div><div class="loc"></div></div>
      <div class="compass"><div class="strip"></div></div><div class="compass-center"></div>
      <div class="target-bar" style="display:none"><div class="tn"></div><div class="bar"><b></b><i></i></div></div>
      <div class="quest-tracker"></div>
      <div class="vitals">
        <div class="row"><span class="rank"></span><span class="coins"></span></div>
        <div class="bar hp"><b></b><i></i></div>
        <div class="bar stam"><i></i></div>
        <div class="bar food" style="height:4px"><i></i></div>
        <div class="status"></div>
      </div>
      <div class="crosshair"></div>
      <svg class="star" viewBox="-75 -75 150 150"></svg>
      <div class="prompt"></div>
      <div class="notify"></div>
      <div class="subtitle"></div>
      <div class="help"></div>`;
    this.q = (s) => this.hud.querySelector(s);
    this.buildStar();
    this.dialogueEl = h('div', 'dialogue');
    this.dialogueEl.innerHTML = '<div class="seal"></div><div class="name"></div><div class="text"></div><div class="choices"></div><div class="cont"></div>';
    root.appendChild(this.dialogueEl);
    this.fadeEl = h('div', 'fade'); root.appendChild(this.fadeEl);
    this.chapterEl = h('div', 'chapter'); root.appendChild(this.chapterEl);
    this.rankEl = h('div', 'rankup'); root.appendChild(this.rankEl);
    this.deathEl = h('div', 'death'); root.appendChild(this.deathEl);
    this.panelWrap = h('div', 'panel-wrap'); root.appendChild(this.panelWrap);
    this.panelOpen = null;
    this.subT = 0;
    this.lastHp = 1;
    this.compassMarks = [];
    this.q('.help').innerHTML = '<kbd>WASD</kbd> move · <kbd>Shift</kbd> run · <kbd>F</kbd> draw · <kbd>LMB</kbd> attack · <kbd>RMB</kbd> block · <kbd>E</kbd> interact<br><kbd>I</kbd> inventory · <kbd>J</kbd> journal · <kbd>M</kbd> map · <kbd>C</kbd> character · <kbd>Esc</kbd> menu';
  }

  // ---------------------------------------------------------------- combat star
  buildStar() {
    const svg = this.q('.star');
    const petal = (rot, id) => `<g transform="rotate(${rot})"><path id="${id}" d="M0,-24 L-13,-44 L0,-66 L13,-44 Z" fill="rgba(240,225,190,.14)" stroke="rgba(240,225,190,.55)" stroke-width="1.5"/></g>`;
    svg.innerHTML = `<circle r="17" fill="none" stroke="rgba(240,225,190,.35)" stroke-width="1"/>
      ${petal(0, 'p-overhead')}${petal(90, 'p-right')}${petal(180, 'p-thrust')}${petal(270, 'p-left')}
      <circle id="p-perfect" r="9" fill="rgba(90,200,120,0)" />`;
    this.petals = { overhead: svg.querySelector('#p-overhead'), right: svg.querySelector('#p-right'), thrust: svg.querySelector('#p-thrust'), left: svg.querySelector('#p-left') };
    this.perfectDot = svg.querySelector('#p-perfect');
  }

  updateStar(ctl, player) {
    const svg = this.q('.star');
    const on = player.combat.drawn && !player.dead;
    svg.classList.toggle('on', on);
    if (!on) return;
    const tg = ctl.lockTarget;
    const guard = tg?.ai?.guardDir;
    const incoming = tg && tg.combat.attack ? tg.combat.attack.dir : null;
    for (const [dir, el] of Object.entries(this.petals)) {
      let fill = 'rgba(240,225,190,.12)', stroke = 'rgba(240,225,190,.5)';
      if (tg && guard === dir && tg.combat.blocking) { fill = 'rgba(200,50,30,.55)'; stroke = '#ff7a5a'; }
      else if (tg && guard === dir) { fill = 'rgba(200,50,30,.25)'; stroke = 'rgba(255,120,90,.7)'; }
      if (dir === ctl.selDir) { fill = 'rgba(230,190,90,.75)'; stroke = '#ffe2a0'; }
      if (incoming === dir) { stroke = '#ff3a2a'; }
      el.setAttribute('fill', fill);
      el.setAttribute('stroke', stroke);
      el.setAttribute('stroke-width', incoming === dir ? 4 : 1.5);
    }
    // perfect block cue: green when an enemy strike is about to land
    let cue = 0;
    if (tg && tg.combat.attack && tg.model.anim.clip) {
      const c = tg.model.anim.clip;
      const hitAt = c.def.hit * c.def.dur;
      const left = (hitAt - c.t) / (c.speed || 1);
      if (left > 0 && left < 0.3) cue = 1 - left / 0.3;
    }
    this.perfectDot.setAttribute('fill', `rgba(90,210,120,${cue * 0.9})`);
  }

  // ---------------------------------------------------------------- per-frame HUD
  showHUD(on) { this.hud.classList.toggle('hidden', !on); }

  update(dt) {
    const g = this.game, p = g.player;
    if (!p) return;
    const t = g.time;
    this.q('.hud-date .cn').textContent = `${t.dateCn()} · ${t.shichen().cn}`;
    this.q('.hud-date .en').textContent = `${t.shichen().en} · ${t.clock()}`;
    this.q('.hud-date .loc').textContent = g.locationName || '';
    const hpf = Math.max(0, p.hp / p.hpMax);
    this.q('.bar.hp i').style.width = `${hpf * 100}%`;
    this.q('.bar.hp b').style.width = `${hpf * 100}%`;
    this.q('.bar.stam i').style.width = `${Math.max(0, p.stamina / p.staminaMax) * 100}%`;
    this.q('.bar.food i').style.width = `${Math.max(0, p.food)}%`;
    const r = g.progression.rankDef();
    this.q('.vitals .rank').textContent = `${r.cn}`;
    this.q('.vitals .rank').title = r.name;
    this.q('.vitals .coins').textContent = `${p.inventory.coins} 錢`;
    const st = [];
    if (p.bleed > 0.05) st.push('Bleeding 流血');
    if (p.food < 15) st.push('Starving 飢');
    if (p.drunk > 0.1) st.push('Drunk 醉');
    const stHtml = st.map((s) => `<span>${s}</span>`).join('');
    if (this._st !== stHtml) { this.q('.vitals .status').innerHTML = stHtml; this._st = stHtml; }
    // damage vignette
    if (hpf < this.lastHp - 0.01) g.engine.grade.uniforms.uHurt.value = Math.min(1, g.engine.grade.uniforms.uHurt.value + 0.6);
    this.lastHp = hpf;
    g.engine.grade.uniforms.uHurt.value = Math.max(hpf < 0.25 ? 0.35 : 0, g.engine.grade.uniforms.uHurt.value - dt * 1.5);

    // target bar
    const tg = g.playerCtl?.lockTarget;
    const tb = this.q('.target-bar');
    if (tg && !tg.dead) {
      tb.style.display = 'block';
      tb.querySelector('.tn').textContent = `${tg.name}${tg.cn ? ' ' + tg.cn : ''}`;
      tb.querySelector('i').style.width = `${(tg.hp / tg.hpMax) * 100}%`;
      tb.querySelector('b').style.width = `${(tg.hp / tg.hpMax) * 100}%`;
    } else tb.style.display = 'none';

    this.updateStar(g.playerCtl, p);
    this.updateCompass();
    this.updateTracker();
    // subtitle timeout
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.q('.subtitle').innerHTML = ''; }
  }

  updateCompass() {
    const g = this.game;
    const yaw = g.cameraCtl.yaw; // 0 = facing +z (south)
    const W = 520, pxPerRad = W / (Math.PI * 0.9);
    const strip = this.q('.compass .strip');
    const heading = (a) => { let d = a - yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
    let html = '';
    // world: north = -z. Direction angle a for vector (x,z) = atan2(x, z)
    const cards = [['北', Math.PI], ['東北', Math.PI * 0.75, 1], ['東', Math.PI / 2], ['東南', Math.PI / 4, 1], ['南', 0], ['西南', -Math.PI / 4, 1], ['西', -Math.PI / 2], ['西北', -Math.PI * 0.75, 1]];
    // camera looks along +yaw; positive heading difference means to the left in screen space
    for (const [lab, a, minor] of cards) {
      const d = heading(a);
      if (Math.abs(d) > Math.PI * 0.46) continue;
      html += `<div class="card ${minor ? 'minor' : ''}" style="left:${W / 2 - d * pxPerRad}px">${lab}</div>`;
    }
    for (let k = 0; k < 36; k++) {
      const d = heading((k / 36) * Math.PI * 2);
      if (Math.abs(d) > Math.PI * 0.46) continue;
      html += `<div class="tick" style="left:${W / 2 - d * pxPerRad}px"></div>`;
    }
    const p = g.player.pos;
    for (const m of g.compassMarkers()) {
      const d = heading(Math.atan2(m.x - p.x, m.z - p.z));
      if (Math.abs(d) > Math.PI * 0.46) continue;
      html += `<div class="mark ${m.kind || ''}" style="left:${W / 2 - d * pxPerRad}px" title="${m.label || ''}"></div>`;
    }
    strip.innerHTML = html;
  }

  updateTracker() {
    const q = this.game.quests?.tracked();
    const el = this.q('.quest-tracker');
    let html = '';
    if (q) {
      html = `<div class="qt-title">${q.title}<span class="cn">${q.cn || ''}</span></div>`;
      for (const o of q.objectives()) html += `<div class="qt-obj ${o.done ? 'done' : ''}">${o.text}</div>`;
    }
    if (html !== this._qt) { el.innerHTML = html; this._qt = html; }
  }

  // ---------------------------------------------------------------- messages
  prompt(text) {
    const el = this.q('.prompt');
    const html = text ? `<kbd>E</kbd>${text}` : '';
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  notify(text, kind = '') {
    const box = this.q('.notify');
    const d = h('div', kind, text);
    box.appendChild(d);
    while (box.children.length > 6) box.firstChild.remove();
    setTimeout(() => d.classList.add('out'), 4200);
    setTimeout(() => d.remove(), 5200);
  }
  subtitle(name, text, dur = 3.5) {
    this.q('.subtitle').innerHTML = name ? `<b>${name}:</b>${text}` : text;
    this.subT = dur;
  }

  // ---------------------------------------------------------------- dialogue
  showLine(sp, text, choices, onChoose) {
    const el = this.dialogueEl;
    el.classList.add('on');
    const seal = el.querySelector('.seal');
    const cn = sp.cn || sp.name.slice(0, 2);
    seal.textContent = cn.slice(0, 4);
    seal.classList.toggle('small', cn.length > 2);
    seal.style.background = sp.color || '#9a1e14';
    el.querySelector('.name').innerHTML = `${sp.name}${sp.title ? `<small>${sp.title}</small>` : ''}`;
    const tEl = el.querySelector('.text');
    tEl.textContent = '';
    this._type = { el: tEl, text, i: 0 };
    const ch = el.querySelector('.choices');
    ch.innerHTML = '';
    el.querySelector('.cont').textContent = choices ? '' : 'Click or press Space ▸';
    if (choices) {
      choices.forEach((c, i) => {
        const d = h('div', 'choice', `<span class="k">${i + 1}.</span>${c.t}${c.tag ? `<span class="tag">[${c.tag}]</span>` : ''}`);
        d.onclick = () => onChoose(i);
        ch.appendChild(d);
      });
    }
  }
  typeTick(dt) {
    const t = this._type;
    if (!t || t.i >= t.text.length) return true;
    t.i = Math.min(t.text.length, t.i + dt * 70);
    t.el.textContent = t.text.slice(0, Math.floor(t.i));
    return t.i >= t.text.length;
  }
  finishTyping() { const t = this._type; if (t) { t.i = t.text.length; t.el.textContent = t.text; } }
  hideDialogue() { this.dialogueEl.classList.remove('on'); this._type = null; }

  // ---------------------------------------------------------------- overlays
  fade(to, dur = 1) {
    this.fadeEl.style.transition = `opacity ${dur}s`;
    this.fadeEl.style.opacity = to;
    return new Promise((r) => setTimeout(r, dur * 1000));
  }
  async chapterCard(num, titleCn, titleEn, sub, hold = 4.5) {
    this.chapterEl.innerHTML = `<div class="num">${num}</div><div class="title">${titleCn}</div><div class="en">${titleEn}</div><div class="sub">${sub || ''}</div>`;
    this.chapterEl.classList.add('on');
    this.game.audio?.play('gong');
    await wait(hold * 1000);
    this.chapterEl.classList.remove('on');
    await wait(1400);
  }
  rankUp(r) {
    this.rankEl.innerHTML = `<div class="l">Promotion</div><div class="cn">${r.cn}</div><div class="en">${r.name}</div>`;
    this.rankEl.classList.add('on');
    this.game.audio?.play('gong');
    setTimeout(() => this.rankEl.classList.remove('on'), 4200);
  }
  death(onLoad, onRetry) {
    this.deathEl.innerHTML = `<div class="cn">殞</div><div class="en">You have fallen.</div>
      <div style="display:flex;gap:14px"><span class="btn" id="d-retry">Rise again (last save)</span><span class="btn" id="d-title">Title screen</span></div>`;
    this.deathEl.classList.add('on');
    this.deathEl.querySelector('#d-retry').onclick = () => { this.deathEl.classList.remove('on'); onRetry(); };
    this.deathEl.querySelector('#d-title').onclick = () => { this.deathEl.classList.remove('on'); onLoad(); };
  }
  letterbox(on) { this.root.classList.toggle('letterbox', on); }

  // ---------------------------------------------------------------- title & loading
  showTitle(hasSave, handlers) {
    const el = h('div', 'title-screen');
    el.innerHTML = `
      <div class="logo-cn">天命</div>
      <div class="logo-en">Mandate of Heaven</div>
      <div class="tag">Zhuo Commandery, 184 AD. The azure sky is dead; the yellow sky shall rise. From a mulberry-shaded village, a peasant takes up the spear.</div>
      <div class="menu">
        <div class="mi ${hasSave ? '' : 'disabled'}" data-a="continue"><span class="cn">續</span>Continue</div>
        <div class="mi" data-a="new"><span class="cn">始</span>New Journey</div>
        <div class="mi" data-a="settings"><span class="cn">設</span>Settings</div>
        <div class="mi" data-a="about"><span class="cn">史</span>History &amp; Credits</div>
      </div>
      <div class="foot">Controls: WASD · Mouse · F draw weapon · LMB strike (mouse direction chooses the cut) · RMB block · E interact</div>
      <div class="seal-big"><span>天</span><span>命</span><span>三</span><span>國</span></div>`;
    el.querySelectorAll('.mi').forEach((m) => { m.onclick = () => handlers[m.dataset.a]?.(); });
    this.root.appendChild(el);
    this.titleEl = el;
  }
  hideTitle() { this.titleEl?.remove(); this.titleEl = null; }
  loading(msg, p) {
    if (!this.loadEl) {
      this.loadEl = h('div', 'loading', `<div class="cn">天命</div><div class="msg"></div><div class="bar"><i></i></div>
        <div class="quote">“The empire, long divided, must unite; long united, must divide. Thus it has ever been.”<br>— Luo Guanzhong, <i>Romance of the Three Kingdoms</i></div>`);
      this.root.appendChild(this.loadEl);
    }
    this.loadEl.querySelector('.msg').textContent = msg;
    this.loadEl.querySelector('.bar i').style.width = `${Math.round(p * 100)}%`;
  }
  hideLoading() { this.loadEl?.remove(); this.loadEl = null; }

  // ---------------------------------------------------------------- panels
  anyPanelOpen() { return !!this.panelOpen || !!this.titleEl || this.deathEl.classList.contains('on'); }

  openPanel(tab) {
    this.panelOpen = tab;
    this.panelWrap.classList.add('on');
    this.game.input.exitLock();
    this.renderPanel();
  }
  closePanel() {
    this.panelOpen = null;
    this.panelWrap.classList.remove('on');
    this.panelWrap.innerHTML = '';
    this.game.input.requestLock();
  }

  renderPanel() {
    const tab = this.panelOpen;
    const tabs = [['inventory', '囊', 'Inventory'], ['character', '身', 'Character'], ['journal', '志', 'Journal'], ['map', '圖', 'Map'], ['menu', '選', 'System']];
    this.panelWrap.innerHTML = `<div class="panel"><div class="tabs">${tabs.map(([id, cn, en]) => `<div class="tab ${id === tab ? 'on' : ''}" data-t="${id}"><span class="cn">${cn}</span>${en}</div>`).join('')}</div><div class="close">✕</div><div class="body"></div></div>`;
    this.panelWrap.querySelectorAll('.tab').forEach((t) => { t.onclick = () => { this.panelOpen = t.dataset.t; this.renderPanel(); }; });
    this.panelWrap.querySelector('.close').onclick = () => this.closePanel();
    const body = this.panelWrap.querySelector('.body');
    ({ inventory: this.renderInventory, character: this.renderCharacter, journal: this.renderJournal, map: this.renderMap, menu: this.renderMenu, shop: this.renderShop }[tab] || this.renderInventory).call(this, body);
  }

  renderInventory(body) {
    const g = this.game, p = g.player;
    const list = p.inventory.list();
    const eq = (id) => p.equip.weapon === id || p.equip.body === id || p.equip.head === id || (id === 'shield' && p.equip.shield);
    const groups = { weapon: 'Weapons 兵器', shield: 'Shields 盾', armor: 'Armour 甲冑', use: 'Provisions & Medicine 糧藥', trade: 'Goods 貨物', quest: 'Keepsakes 要物' };
    let html = `<div class="grid2" style="grid-template-columns: 2fr 1fr"><div>`;
    for (const [type, label] of Object.entries(groups)) {
      const its = list.filter((i) => i.type === type);
      if (!its.length) continue;
      html += `<h3>${label}</h3><div class="items">`;
      for (const it of its) html += `<div class="item ${eq(it.id) ? 'eq' : ''}" data-id="${it.id}"><div class="ic">${(it.cn || '?').slice(0, 1)}</div><div><div class="nm">${it.name}${it.n > 1 ? ` ×${it.n}` : ''}</div><div class="ds">${it.desc || ''}</div></div></div>`;
      html += `</div>`;
    }
    const w = WEAPONS[p.equip.weapon];
    html += `</div><div><h2>${p.name}</h2><div class="muted">${g.progression.rankDef().name} · ${g.progression.rankDef().cn}</div>
      <h3>Equipped</h3>
      <div class="stat"><span>Weapon</span><b>${w.name}</b></div>
      <div class="stat"><span>Body</span><b>${p.equip.body ? ARMORS[p.equip.body].name : '—'}</b></div>
      <div class="stat"><span>Head</span><b>${p.equip.head ? ARMORS[p.equip.head].name : '—'}</b></div>
      <div class="stat"><span>Shield</span><b>${p.equip.shield ? 'Han Shield' : '—'}</b></div>
      <h3>Protection</h3>
      <div class="stat"><span>Slash</span><b>${p.armorValue('slash')}</b></div><div class="stat"><span>Stab</span><b>${p.armorValue('stab')}</b></div><div class="stat"><span>Blunt</span><b>${p.armorValue('blunt')}</b></div>
      <h3>Purse</h3><div class="stat"><span>Wuzhu coins 五銖錢</span><b>${p.inventory.coins}</b></div>
      <div class="stat"><span>Load</span><b>${p.inventory.weight().toFixed(1)} jin</b></div>
      <p class="muted" style="font-size:14px;margin-top:14px">Click an item to equip or use it.</p></div></div>`;
    body.innerHTML = html;
    body.querySelectorAll('.item').forEach((el) => { el.onclick = () => { g.useOrEquip(el.dataset.id); this.renderPanel(); }; });
  }

  renderCharacter(body) {
    const g = this.game, p = g.player, pr = g.progression;
    let html = `<div class="grid2"><div><h2>${p.name}</h2><div class="muted">${pr.rankDef().name} · ${pr.rankDef().cn}</div><h3>Attributes & Skills 技藝</h3>`;
    for (const [k, s] of Object.entries(SKILLS)) {
      const lv = p.stats[k] ?? 1;
      const f = Math.min(1, (pr.xp[k] || 0) / pr.need(lv));
      html += `<div class="stat"><div style="flex:1"><span>${s.name} <span style="font-family:var(--brush);color:#8a3a1a">${s.cn}</span></span><div class="xp"><i style="width:${f * 100}%"></i></div></div><b style="margin-left:14px">${lv}</b></div>`;
    }
    html += `</div><div><h3>Standing 名分</h3>
      <div class="stat"><span>Merit 軍功</span><b>${pr.merit}</b></div>
      <div class="stat"><span>Virtue 德</span><b>${pr.virtue > 0 ? '+' : ''}${pr.virtue}</b></div>
      <div class="stat"><span>Renown 名望</span><b>${pr.renown}</b></div>
      <div class="stat"><span>Health</span><b>${Math.ceil(p.hp)} / ${p.hpMax}</b></div>
      <div class="stat"><span>Stamina</span><b>${Math.ceil(p.stamina)} / ${p.staminaMax}</b></div>
      <h3>The Road to the Throne 位階</h3>`;
    const ri = rankIndex(pr.rank);
    RANKS.forEach((r, i) => { html += `<div class="stat" style="opacity:${i <= ri ? 1 : 0.45}"><span><span style="font-family:var(--brush);font-size:20px;color:#8a1a10;margin-right:8px">${r.cn}</span>${r.name}</span><b>${i < ri ? '✓' : i === ri ? '◆' : ''}</b></div>`; });
    html += `</div></div>`;
    body.innerHTML = html;
  }

  renderJournal(body) {
    const qs = this.game.quests;
    let html = `<div class="grid2"><div><h2>Journal 志</h2><h3>Active</h3>`;
    for (const q of qs.active()) {
      html += `<div class="quest"><div class="qn">${q.title}<span class="cn">${q.cn || ''}</span></div><div class="qd">${q.desc || ''}</div>`;
      for (const o of q.objectives()) html += `<div class="qo ${o.done ? 'done' : ''}">◆ ${o.text}</div>`;
      html += `</div>`;
    }
    html += `<h3>Completed</h3>`;
    for (const q of qs.completed()) html += `<div class="quest done"><div class="qn">${q.title}<span class="cn">${q.cn || ''}</span></div></div>`;
    html += `</div><div><h3>Chronicle 紀</h3>`;
    for (const e of this.game.chronicle.slice().reverse()) html += `<p style="margin:6px 0;font-size:15px"><b>${e.date}</b> — ${e.text}</p>`;
    html += `</div></div>`;
    body.innerHTML = html;
  }

  renderMap(body) {
    body.innerHTML = `<div class="mapwrap"><canvas width="900" height="900"></canvas><div class="legend"><h2>${this.game.world.region.name}</h2><div class="muted" style="font-family:var(--brush);font-size:24px">${this.game.world.region.cn} · ${this.game.world.region.province}</div>
      <h3>Legend</h3><div>▲ You</div><div style="color:#b08a20">◆ Objective</div><div>■ Settlement</div><div style="color:#9a1e14">✕ Hostile camp</div>
      <p class="muted" style="font-size:14px;margin-top:20px">Scroll of the commandery, drawn by the county clerk.</p></div></div>`;
    this.game.drawMap(body.querySelector('canvas'));
  }

  renderMenu(body) {
    const g = this.game;
    const s = g.settings;
    body.innerHTML = `<h2>System 選</h2>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 20px"><span class="btn" id="m-resume">Resume</span><span class="btn" id="m-save">Save game</span><span class="btn" id="m-load">Load last save</span><span class="btn" id="m-title">Quit to title</span></div>
      <h3>Settings</h3>
      <div class="stat"><span>Graphics quality</span><span><span class="btn" data-q="0">Low</span> <span class="btn" data-q="1">Medium</span> <span class="btn" data-q="2">High</span> (current: ${['Low', 'Medium', 'High'][g.quality]}, reloads)</span></div>
      <div class="stat"><span>Mouse sensitivity</span><input type="range" min="0.5" max="2" step="0.1" value="${s.sens}" id="m-sens"></div>
      <div class="stat"><span>Master volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" id="m-vol"></div>
      <div class="stat"><span>Difficulty (damage taken)</span><span><span class="btn" data-d="0.6">Story</span> <span class="btn" data-d="1">Warrior</span> <span class="btn" data-d="1.5">Hardcore</span> (current ×${s.damageTaken})</span></div>
      <h3>Controls</h3>
      <p style="font-size:16px;line-height:1.7">WASD move · Shift sprint · C sneak · F draw/sheathe · LMB strike — while locked on, move the mouse to choose the cut (left, right, overhead ↑, thrust ↓), or use Z/X/V/B · RMB block (block just before a blow lands for a <b>perfect parry</b>, then strike for a riposte) · Space dodge · Tab switch target · E interact · 1 bandage · 2 medicine · 3 eat · G order troops · I/J/M/C panels · Esc menu</p>`;
    body.querySelector('#m-resume').onclick = () => this.closePanel();
    body.querySelector('#m-save').onclick = () => { g.save(); this.notify('Game saved.'); };
    body.querySelector('#m-load').onclick = () => { this.closePanel(); g.loadGame(); };
    body.querySelector('#m-title').onclick = () => { location.search = ''; };
    body.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { localStorage.setItem('tk_quality', b.dataset.q); location.reload(); }; });
    body.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { s.damageTaken = +b.dataset.d; g.saveSettings(); this.renderPanel(); }; });
    body.querySelector('#m-sens').oninput = (e) => { s.sens = +e.target.value; g.cameraCtl.sens = 0.0024 * s.sens; g.saveSettings(); };
    body.querySelector('#m-vol').oninput = (e) => { s.volume = +e.target.value; g.audio?.setVolume(s.volume); g.saveSettings(); };
  }

  // Merchant trade screen
  openShop(merchant) {
    this.shopMerchant = merchant;
    this.openPanel('shop');
  }
  renderShop(body) {
    const g = this.game, p = g.player, m = this.shopMerchant;
    const mul = g.priceMul();
    let html = `<div class="grid2"><div><h2>${m.name} <span style="font-size:22px">${m.cn || ''}</span></h2><div class="muted">${m.shopTitle || 'Merchant'} · purse ${m.inventory.coins} 錢</div><h3>Wares</h3><div class="items">`;
    for (const it of m.inventory.list()) html += `<div class="item" data-buy="${it.id}"><div class="ic">${(it.cn || '?')[0]}</div><div><div class="nm">${it.name}${it.n > 1 ? ` ×${it.n}` : ''}</div><div class="ds">${Math.ceil(it.price * mul)} 錢 · ${it.desc || ''}</div></div></div>`;
    html += `</div></div><div><h2>Your pack</h2><div class="muted">${p.inventory.coins} 錢</div><h3>Sell</h3><div class="items">`;
    for (const it of p.inventory.list().filter((i) => i.type !== 'quest')) html += `<div class="item" data-sell="${it.id}"><div class="ic">${(it.cn || '?')[0]}</div><div><div class="nm">${it.name}${it.n > 1 ? ` ×${it.n}` : ''}</div><div class="ds">${Math.floor(it.price * 0.5 / mul)} 錢</div></div></div>`;
    html += `</div></div></div>`;
    body.innerHTML = html;
    body.querySelectorAll('[data-buy]').forEach((el) => { el.onclick = () => { g.trade(m, el.dataset.buy, true); this.renderPanel(); }; });
    body.querySelectorAll('[data-sell]').forEach((el) => { el.onclick = () => { g.trade(m, el.dataset.sell, false); this.renderPanel(); }; });
  }
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export { itemDef };
