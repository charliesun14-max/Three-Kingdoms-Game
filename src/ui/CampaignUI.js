// War-table overlay: painted map of Han China, province info and yearly orders.
import { FACTIONS, ADJ } from '../story/Campaign.js';

// Rough outline of the Han realm in normalised map space (x east, y south).
const OUTLINE = [[0.86, 0.05], [0.95, 0.12], [0.9, 0.2], [0.86, 0.26], [0.9, 0.3], [0.86, 0.36], [0.84, 0.42], [0.86, 0.5], [0.83, 0.58], [0.82, 0.66], [0.78, 0.74], [0.7, 0.8], [0.62, 0.88], [0.55, 0.95], [0.45, 0.96], [0.38, 0.9], [0.3, 0.84], [0.2, 0.76], [0.16, 0.66], [0.18, 0.55], [0.12, 0.46], [0.05, 0.36], [0.02, 0.24], [0.1, 0.2], [0.22, 0.24], [0.32, 0.18], [0.42, 0.12], [0.52, 0.1], [0.62, 0.08], [0.72, 0.04]];
const YELLOW = [[0.14, 0.32], [0.24, 0.29], [0.33, 0.25], [0.38, 0.17], [0.44, 0.14], [0.47, 0.22], [0.45, 0.32], [0.5, 0.36], [0.58, 0.35], [0.66, 0.31], [0.74, 0.28], [0.82, 0.27]];
const YANGTZE = [[0.2, 0.64], [0.28, 0.61], [0.36, 0.64], [0.44, 0.61], [0.52, 0.58], [0.58, 0.61], [0.64, 0.58], [0.7, 0.56], [0.76, 0.55], [0.83, 0.56]];

function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export class CampaignUI {
  constructor(game) {
    this.game = game;
    this.el = null;
    this.sel = null;
    this.cellMap = null;
  }

  buildCells(W, H) {
    const c = this.game.campaign;
    const ids = Object.keys(c.prov);
    const pts = ids.map((id) => [c.prov[id].x, c.prov[id].y]);
    const cells = new Int8Array(W * H).fill(-1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = x / W, ny = y / H;
      if (!inPoly(nx, ny, OUTLINE)) continue;
      let best = 0, bd = 9;
      for (let k = 0; k < pts.length; k++) {
        // jitter borders a little so they look hand-drawn
        const d = (nx - pts[k][0]) ** 2 * 1.1 + (ny - pts[k][1]) ** 2 + 0.0004 * Math.sin(nx * 60 + k) * Math.cos(ny * 50);
        if (d < bd) { bd = d; best = k; }
      }
      cells[y * W + x] = best;
    }
    this.cellMap = { W, H, cells, ids };
  }

  draw(cv) {
    const g = this.game, c = g.campaign;
    const W = cv.width, H = cv.height;
    if (!this.cellMap || this.cellMap.W !== W) this.buildCells(W, H);
    const ctx = cv.getContext('2d');
    const { cells, ids } = this.cellMap;
    const img = ctx.createImageData(W, H);
    const cols = ids.map((id) => {
      const f = FACTIONS[c.prov[id].owner];
      const h = f.color.replace('#', '');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, k = cells[i];
      const n = (Math.sin(x * 0.13) * Math.cos(y * 0.11) + Math.sin(x * 0.031 + y * 0.027)) * 6;
      let r = 232 + n, gg = 218 + n, b = 186 + n; // parchment
      if (k >= 0) {
        const cc = cols[k];
        const sel = this.sel === ids[k];
        const a = sel ? 0.55 : 0.34;
        r = r * (1 - a) + cc[0] * a; gg = gg * (1 - a) + cc[1] * a; b = b * (1 - a) + cc[2] * a;
        // borders
        const kr = x + 1 < W ? cells[i + 1] : k, kd = y + 1 < H ? cells[i + W] : k;
        if (kr !== k || kd !== k) { r = 70; gg = 50; b = 36; }
      }
      const o = i * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // coastline
    ctx.strokeStyle = 'rgba(50,35,20,.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); OUTLINE.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H))); ctx.closePath(); ctx.stroke();
    // sea wash
    ctx.fillStyle = 'rgba(90,110,120,.18)';
    ctx.font = '38px "Ma Shan Zheng", serif'; ctx.textAlign = 'center';
    ctx.fillText('東 海', W * 0.93, H * 0.5);
    // rivers
    const river = (pts, name) => {
      ctx.strokeStyle = 'rgba(60,90,110,.85)'; ctx.lineWidth = 3.5; ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H))); ctx.stroke();
      ctx.fillStyle = 'rgba(40,70,90,.9)'; ctx.font = '20px "Ma Shan Zheng", serif';
      const m = pts[Math.floor(pts.length / 2)]; ctx.fillText(name, m[0] * W + 30, m[1] * H + 22);
    };
    river(YELLOW, '黃河'); river(YANGTZE, '長江');
    // provinces
    for (const id of ids) {
      const p = c.prov[id];
      const x = p.x * W, y = p.y * H;
      const f = FACTIONS[p.owner];
      ctx.fillStyle = f.color; ctx.strokeStyle = '#f5e8c8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(x - 15, y - 15, 30, 30); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f5e8c8'; ctx.font = '22px "Ma Shan Zheng", serif'; ctx.fillText(f.cn, x, y + 8);
      ctx.fillStyle = '#2a1a0e'; ctx.font = '24px "Ma Shan Zheng", serif'; ctx.fillText(p.cn, x, y - 24);
      ctx.font = 'bold 14px "Cormorant Garamond", serif'; ctx.fillText(`${p.troops}k`, x, y + 32);
      if (c.canAttack(id)) { ctx.strokeStyle = '#c01a10'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    }
    // title cartouche
    ctx.fillStyle = 'rgba(40,20,10,.85)'; ctx.font = '40px "Ma Shan Zheng", serif'; ctx.textAlign = 'left';
    ctx.fillText('天下', 24, 56);
    ctx.font = '18px "Cormorant Garamond", serif'; ctx.fillText(`The realm in the year ${c.year} AD`, 26, 84);
  }

  pick(cv, ev) {
    const r = cv.getBoundingClientRect();
    const x = Math.floor(((ev.clientX - r.left) / r.width) * cv.width), y = Math.floor(((ev.clientY - r.top) / r.height) * cv.height);
    const k = this.cellMap.cells[y * cv.width + x];
    return k >= 0 ? this.cellMap.ids[k] : null;
  }

  // Opens the war table. Resolves with an order object.
  open() {
    const g = this.game;
    if (g.autopilot) {
      const c = g.campaign;
      const tgt = ['yu', 'yan', 'qing', 'yang', 'ji', 'si', 'jing'].find((id) => c.canAttack(id));
      if (!g.params.has('autoField') && tgt && c.troops() < c.prov[tgt].troops * 1.4 && c.gold >= 700) return Promise.resolve({ type: 'recruit' });
      return Promise.resolve(tgt ? { type: 'attack', id: tgt, mode: g.params.has('autoField') ? 'field' : 'auto' } : { type: 'rest' });
    }
    g.input.exitLock();
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'panel-wrap on';
      el.innerHTML = `<div class="panel" style="width:min(1320px,96vw);height:min(820px,94vh)"><div class="close">✕</div>
        <div class="body" style="display:flex;gap:22px;overflow:hidden"><canvas width="760" height="720" style="height:100%;aspect-ratio:760/720;border:1px solid #9a7a4a;cursor:pointer"></canvas>
        <div class="side" style="flex:1;overflow:auto"></div></div></div>`;
      g.uiRoot.appendChild(el);
      this.el = el;
      const cv = el.querySelector('canvas');
      const finish = (v) => { el.remove(); this.el = null; g.input.requestLock(); resolve(v); };
      el.querySelector('.close').onclick = () => finish({ type: 'close' });
      cv.onclick = (e) => { this.sel = this.pick(cv, e); this.draw(cv); this.side(el.querySelector('.side'), finish); };
      this.draw(cv);
      this.side(el.querySelector('.side'), finish);
    });
  }

  side(box, finish) {
    const g = this.game, c = g.campaign, pr = g.progression;
    const mine = c.owned();
    let html = `<h2>War Council 軍議</h2><div class="muted">${pr.rankDef().name} ${pr.rankDef().cn} · Year ${c.year}</div>
      <div class="stat"><span>Provinces</span><b>${mine.length} / 14</b></div>
      <div class="stat"><span>Treasury</span><b>${c.gold.toLocaleString()} thousand coins (+${c.income()}/yr)</b></div>
      <div class="stat"><span>Soldiers</span><b>${c.troops()}k</b></div>
      <div class="stat"><span>Allies</span><b>${[...c.allies].map((f) => FACTIONS[f].name).join(', ') || '—'}</b></div>
      <div class="stat"><span>Officers</span><b>${c.officers.join(', ')}</b></div>`;
    if (this.sel) {
      const p = c.prov[this.sel], f = FACTIONS[p.owner];
      html += `<h3>${p.name} Province ${p.cn}</h3>
        <div class="stat"><span>Held by</span><b style="color:${f.color}">${f.name} ${f.cn}</b></div>
        <div class="stat"><span>Seat</span><b>${p.seat}</b></div>
        <div class="stat"><span>Garrison</span><b>${p.troops},000</b></div>
        <div class="stat"><span>Prosperity</span><b>${'◆'.repeat(p.dev)}${'◇'.repeat(6 - p.dev)}</b></div>
        <div class="stat"><span>Borders</span><b>${ADJ[p.id].map((n) => c.prov[n].cn).join(' ')}</b></div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">`;
      if (c.canAttack(p.id)) {
        const b = c.prepareAttack(p.id);
        html += `<span class="btn" data-a="field">⚔ Lead the attack in person (${b.commit}k vs ${b.defTroops}k)</span>
          <span class="btn" data-a="auto">✎ Send your generals (auto-resolve)</span>`;
        if (p.owner !== 'player' && !c.allies.has(p.owner)) html += `<span class="btn" data-a="ally">☯ Propose alliance with ${f.name}</span>`;
      } else if (p.owner === 'player') {
        html += `<span class="btn" data-a="develop">⚒ Develop ${p.name} (700)</span>`;
      } else if (!c.allies.has(p.owner)) html += `<span class="btn" data-a="ally">☯ Propose alliance with ${f.name}</span>`;
      html += `</div>`;
    } else html += `<p class="muted" style="margin-top:14px">Click a province on the map. Provinces ringed in red border your lands and can be attacked.</p>`;
    html += `<h3>Other orders (one per year)</h3><div style="display:flex;flex-direction:column;gap:8px">
      <span class="btn" data-a="recruit">⚑ Raise 14,000 troops (700)</span>
      <span class="btn" data-a="rest">☾ Rest and govern — end the year</span></div>
      <h3>Annals</h3>${c.log.slice(0, 8).map((l) => `<p style="margin:4px 0;font-size:14px"><b>${l.year}</b> — ${l.text}</p>`).join('')}`;
    box.innerHTML = html;
    box.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'field' || a === 'auto') finish({ type: 'attack', id: this.sel, mode: a });
        else if (a === 'develop') finish({ type: 'develop', id: this.sel });
        else if (a === 'ally') finish({ type: 'ally', faction: c.prov[this.sel].owner });
        else if (a === 'recruit') finish({ type: 'recruit' });
        else finish({ type: 'rest' });
      };
    });
  }
}

// Simple modal dialog used for yearly events.
export function modal(game, title, text, buttons = ['Continue']) {
  if (game.autopilot) { game.autopilot.note(`modal: ${title}`); return Promise.resolve(0); }
  game.input.exitLock();
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'panel-wrap on';
    el.innerHTML = `<div class="panel" style="height:auto;width:min(720px,92vw)"><div class="body"><h2>${title}</h2><p style="font-size:19px;line-height:1.55">${text}</p>
      <div style="display:flex;gap:12px;margin-top:18px;flex-wrap:wrap">${buttons.map((b, i) => `<span class="btn" data-i="${i}">${b}</span>`).join('')}</div></div></div>`;
    game.uiRoot.appendChild(el);
    el.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { el.remove(); game.input.requestLock(); resolve(+b.dataset.i); }; });
  });
}
