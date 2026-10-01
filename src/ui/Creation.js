// New-journey character creation: name, looks and upbringing, with a live preview in the village.
import * as THREE from 'three';
import { CharacterModel } from '../entities/CharacterModel.js';
import { SURNAMES, SURNAME_CN, GIVEN } from '../entities/Population.js';

export const BACKGROUNDS = {
  farmer: { name: "A farmer's son", cn: '農家子', desc: 'Raised behind the plough on rented land. A strong back and good wind.', stats: { vit: 2, str: 1 }, items: { milletCake: 2 } },
  hunter: { name: "A hunter's son", cn: '獵戶子', desc: 'Your uncle took you into the hills with bow and snare. You move quietly and shoot straight.', stats: { archery: 4, stealth: 3, agi: 1 }, items: { fishingRod: 1 } },
  scholar: { name: "A poor scholar's grandson", cn: '寒士子', desc: 'Your grandfather taught you the classics by lamplight. You read, write and speak well — scribes pay you more.', stats: { speech: 3, leadership: 2 }, coins: 40 },
  smith: { name: "A smith's apprentice", cn: '鐵匠徒', desc: 'Two years at the forge in Zhuo before your father fell ill. You know iron, and how to swing it.', stats: { str: 2, blade: 3 }, items: {} },
};
const SKINS = [['Fair', 0xd8ae86], ['Light', 0xd4a47a], ['Wheat', 0xc99a70], ['Sun-browned', 0xbf8f65], ['Weathered', 0xa87a54]];
const BEARDS = [['Clean-shaven', 'none'], ['Stubble', 'stubble'], ['Goatee', 'goatee'], ['Short beard', 'short']];
const HEAD = [['Head-cloth', 'wrap'], ['Topknot', 'topknot'], ['Bamboo hat', 'bamboo']];
const BUILD = [['Lean', 0.94, 1.72], ['Average', 1.02, 1.76], ['Broad', 1.14, 1.8]];
const ROBES = [['Undyed hemp', 0x8a7a5e], ['Earth brown', 0x6e5e48], ['Ash grey', 0x5e5a54], ['Faded indigo', 0x3e4a5e], ['Rust', 0x6a4030]];

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class Creation {
  constructor(game) {
    this.g = game;
    this.c = { sur: 'Qin', given: ['Mu', '牧'], custom: '', skin: 2, beard: 1, head: 0, build: 1, robe: 1, bg: 'farmer' };
  }

  open() {
    return new Promise((resolve) => {
      const g = this.g;
      this.resolve = resolve;
      const st = g.world.region.places.start;
      this.at = new THREE.Vector3(st.x, g.world.groundHeight(st.x, st.z), st.z);
      this.rot = Math.PI * 0.85;
      g.state = 'creator';
      this.el = h('div', 'creator');
      g.ui.root.appendChild(this.el);
      this.render();
      this.rebuild();
      g.creator = this;
    });
  }

  look() {
    const c = this.c, [, b, ht] = BUILD[c.build];
    return { skin: SKINS[c.skin][1], hair: 0x15100c, robe: ROBES[c.robe][1], trousers: 0x5a4c3a, outfit: 'peasant', headwear: HEAD[c.head][1], headCloth: 0x4a3a2a, beard: BEARDS[c.beard][1], height: ht, build: b, face: { stern: false, stubble: BEARDS[c.beard][1] === 'stubble' } };
  }
  names() {
    const c = this.c;
    if (c.custom.trim()) return { name: c.custom.trim().slice(0, 24), cn: '', sur: c.custom.trim().split(/\s+/)[0], surCn: '' };
    return { name: `${c.sur} ${c.given[0]}`, cn: `${SURNAME_CN[c.sur] || ''}${c.given[1]}`, sur: c.sur, surCn: SURNAME_CN[c.sur] || '' };
  }

  rebuild() {
    const g = this.g;
    if (this.model) { g.engine.scene.remove(this.model.root); this.model.dispose?.(); }
    this.model = new CharacterModel(this.look());
    this.model.root.position.copy(this.at);
    g.engine.scene.add(this.model.root);
  }

  tick(dt) {
    const g = this.g, cam = g.engine.camera;
    this.rot += dt * 0.25;
    this.model.root.rotation.y = this.rot;
    this.model.update(dt, { speed: 0, stance: 'relaxed', weaponCls: 'fists' });
    cam.position.set(this.at.x + 1.1, this.at.y + 1.55, this.at.z + 2.6);
    cam.lookAt(this.at.x + 0.55, this.at.y + 1.15, this.at.z);
    g.world.update(dt, 9.5, this.at);
  }

  render() {
    const c = this.c, n = this.names();
    const opt = (key, list, label) => `<div class="cr-row"><span>${label}</span><div class="cr-opts">${list.map(([t], i) => `<span class="btn ${c[key] === i ? 'on' : ''}" data-k="${key}" data-v="${i}">${t}</span>`).join('')}</div></div>`;
    this.el.innerHTML = `<div class="cr-panel">
      <div class="cr-title"><span class="cn">立身</span>Who are you?</div>
      <div class="cr-name"><span class="big">${n.cn || n.name}</span> <span class="muted">${n.cn ? n.name : ''}</span></div>
      <div class="cr-row"><span>Family name</span><select id="cr-sur">${['Qin', ...SURNAMES.filter((s) => s !== 'Qin')].map((s) => `<option ${s === c.sur ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <span>Given name</span><select id="cr-given">${[['Mu', '牧'], ...GIVEN].map(([en, cn]) => `<option value="${en}|${cn}" ${en === c.given[0] ? 'selected' : ''}>${en} ${cn}</option>`).join('')}</select>
        <span class="btn" id="cr-rand">Random</span></div>
      <div class="cr-row"><span>Or type a name</span><input id="cr-custom" maxlength="24" placeholder="(optional)" value="${c.custom}"></div>
      ${opt('skin', SKINS, 'Complexion')}${opt('build', BUILD, 'Build')}${opt('beard', BEARDS, 'Beard')}${opt('head', HEAD, 'Headwear')}${opt('robe', ROBES, 'Clothes')}
      <div class="cr-sub">Upbringing</div>
      <div class="cr-bgs">${Object.entries(BACKGROUNDS).map(([k, b]) => `<div class="cr-bg ${c.bg === k ? 'on' : ''}" data-bg="${k}"><b>${b.cn}</b> ${b.name}<div>${b.desc}</div><div class="muted">${Object.entries(b.stats).map(([s, v]) => `+${v} ${s}`).join(' · ')}${b.coins ? ` · +${b.coins} coins` : ''}${b.items?.fishingRod ? ' · fishing rod' : ''}</div></div>`).join('')}</div>
      <div class="cr-go"><span class="btn big" id="cr-begin">Begin the journey 啟程</span></div>
    </div>`;
    const q = (s) => this.el.querySelector(s);
    this.el.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { c[b.dataset.k] = +b.dataset.v; this.render(); this.rebuild(); }; });
    this.el.querySelectorAll('[data-bg]').forEach((b) => { b.onclick = () => { c.bg = b.dataset.bg; this.render(); }; });
    q('#cr-sur').onchange = (e) => { c.sur = e.target.value; c.custom = ''; this.render(); };
    q('#cr-given').onchange = (e) => { c.given = e.target.value.split('|'); c.custom = ''; this.render(); };
    q('#cr-custom').oninput = (e) => { c.custom = e.target.value; q('.cr-name').innerHTML = `<span class="big">${this.names().cn || this.names().name}</span>`; };
    q('#cr-rand').onclick = () => {
      c.sur = SURNAMES[Math.floor(Math.random() * SURNAMES.length)]; c.given = GIVEN[Math.floor(Math.random() * GIVEN.length)]; c.custom = '';
      c.skin = Math.floor(Math.random() * SKINS.length); c.beard = Math.floor(Math.random() * BEARDS.length); c.head = Math.floor(Math.random() * HEAD.length); c.build = Math.floor(Math.random() * 3); c.robe = Math.floor(Math.random() * ROBES.length);
      this.render(); this.rebuild();
    };
    q('#cr-begin').onclick = () => this.finish();
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
  }

  finish() {
    const g = this.g, n = this.names();
    g.engine.scene.remove(this.model.root);
    this.el.remove();
    g.creator = null;
    g.playerName = n.name; g.playerCn = n.cn;
    g.playerSurname = { en: n.sur || 'Qin', cn: n.surCn || '秦' };
    g.playerLook = this.look();
    g.playerBackground = this.c.bg;
    this.resolve();
  }
}
