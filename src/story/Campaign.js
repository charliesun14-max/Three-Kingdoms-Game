// Strategic campaign across the 14 provinces of Han China (199 AD onward).
// One turn = one year. The player acts once per year from the war table; rivals act,
// and historical events (Guandu, Red Cliffs…) unfold unless the player changes them.
import { PROVINCES } from '../world/regions.js';

export const FACTIONS = {
  player: { name: 'Your House', cn: '秦', color: '#9a1e14' },
  cao: { name: 'Cao Cao', cn: '曹', color: '#2c3e63', general: { figure: 'xiahouDun', name: 'Xiahou Dun', cn: '夏侯惇' } },
  yuan: { name: 'Yuan Shao', cn: '袁', color: '#b08a24', general: { figure: 'yuanShao', name: 'Yan Liang', cn: '顏良' } },
  sun: { name: 'Sun Ce · Sun Quan', cn: '孫', color: '#a4502a', general: { figure: 'sunJian', name: 'Taishi Ci', cn: '太史慈' } },
  liubiao: { name: 'Liu Biao', cn: '表', color: '#4a7a4c', general: { figure: 'huangGai', name: 'Huang Zu', cn: '黃祖' } },
  liuzhang: { name: 'Liu Zhang', cn: '璋', color: '#6a5a8e', general: { figure: 'zhangLiao', name: 'Zhang Ren', cn: '張任' } },
  ma: { name: 'Ma Teng', cn: '馬', color: '#8a6440', general: { figure: 'luBu', name: 'Ma Chao', cn: '馬超' } },
  shi: { name: 'Shi Xie', cn: '士', color: '#4a8a86', general: { figure: 'chenDeng', name: 'Shi Hui', cn: '士徽' } },
  liubei: { name: 'Liu Bei', cn: '劉', color: '#3a6a3a', general: { figure: 'guanYu', name: 'Guan Yu', cn: '關羽' } },
};

export const ADJ = {
  you: ['ji', 'bing', 'qing'], ji: ['you', 'bing', 'qing', 'yan', 'si'], bing: ['you', 'ji', 'si', 'yong', 'liang'],
  qing: ['ji', 'yan', 'xu'], yan: ['ji', 'qing', 'xu', 'yu', 'si'], xu: ['qing', 'yan', 'yu', 'yang'],
  si: ['bing', 'ji', 'yan', 'yu', 'yong', 'jing'], yu: ['yan', 'xu', 'si', 'jing', 'yang'], liang: ['bing', 'yong', 'yi'],
  yong: ['liang', 'bing', 'si', 'jing', 'yi'], jing: ['si', 'yu', 'yang', 'yi', 'yong', 'jiao'], yang: ['xu', 'yu', 'jing', 'jiao'],
  yi: ['liang', 'yong', 'jing', 'jiao'], jiao: ['jing', 'yang', 'yi'],
};

const START = {
  xu: ['player', 22, 3], yan: ['cao', 22, 3], yu: ['cao', 30, 4], si: ['cao', 14, 2], yong: ['cao', 14, 2],
  ji: ['yuan', 45, 5], qing: ['yuan', 20, 3], bing: ['yuan', 20, 2], you: ['yuan', 25, 2],
  yang: ['sun', 38, 3], jing: ['liubiao', 45, 4], yi: ['liuzhang', 40, 4], liang: ['ma', 30, 2], jiao: ['shi', 14, 2],
};

export const TITLES = [
  { n: 1, rank: 'zhoumu' }, { n: 3, rank: 'gong' }, { n: 6, rank: 'wang' },
];

export class Campaign {
  constructor(game) {
    this.game = game;
    FACTIONS.player.cn = game.flags.surname?.cn || '秦';
    this.year = 199;
    this.prov = {};
    for (const p of PROVINCES) {
      const [owner, troops, dev] = START[p.id];
      this.prov[p.id] = { ...p, owner, troops, dev };
    }
    this.gold = 1500; // in thousands of coins (strategic scale)
    this.allies = new Set();
    this.log = [];
    this.pending = null; // battle awaiting the player
    this.flags = {};
    this.officers = ['chenDeng'];
  }

  get player() { return this.game.player; }
  owned(f = 'player') { return Object.values(this.prov).filter((p) => p.owner === f); }
  troops(f = 'player') { return this.owned(f).reduce((a, p) => a + p.troops, 0); }
  income() { return 300 + this.owned().reduce((a, p) => a + p.dev * 220, 0); }
  neighbors(id) { return ADJ[id] || []; }
  canAttack(id) {
    const p = this.prov[id];
    if (!p || p.owner === 'player' || this.allies.has(p.owner)) return false;
    return this.neighbors(id).some((n) => this.prov[n].owner === 'player');
  }
  note(text) { this.log.unshift({ year: this.year, text }); this.game.chronicleAdd(text); }

  // Relative strength including officers, leadership and renown.
  strength(f, troops) {
    if (f === 'player') {
      const pl = this.player.stats;
      return troops * (1.1 + pl.leadership * 0.03 + this.officers.length * 0.08 + this.game.progression.renown * 0.002);
    }
    return troops * (f === 'cao' ? 1.1 : f === 'yuan' ? 0.95 : 1.0);
  }

  // Player-committed attack: returns battle spec (for 3D) or resolves automatically.
  prepareAttack(id) {
    const tgt = this.prov[id];
    const from = this.neighbors(id).map((n) => this.prov[n]).filter((p) => p.owner === 'player').sort((a, b) => b.troops - a.troops)[0];
    const commit = Math.max(4, Math.floor(from.troops * 0.85));
    return { target: id, from: from.id, commit, defender: tgt.owner, defTroops: tgt.troops };
  }

  autoResolve(b) {
    const att = this.strength('player', b.commit) * (0.8 + Math.random() * 0.45);
    const def = this.strength(b.defender, b.defTroops) * 1.15 * (0.8 + Math.random() * 0.45);
    return this.applyResult(b, att > def, att / (att + def));
  }

  // win: boolean, ratio 0..1 (share of the fighting strength that was ours)
  applyResult(b, win, ratio = 0.6) {
    const from = this.prov[b.from], tgt = this.prov[b.target];
    const ourLoss = Math.round(b.commit * (win ? 0.35 - ratio * 0.2 : 0.55));
    const theirLoss = Math.round(b.defTroops * (win ? 0.8 : 0.25 + ratio * 0.2));
    from.troops = Math.max(1, from.troops - b.commit);
    const survivors = Math.max(1, b.commit - ourLoss);
    if (win) {
      const old = tgt.owner;
      tgt.owner = 'player';
      tgt.troops = survivors;
      this.note(`Your army took ${tgt.name} Province (${tgt.cn}) from ${FACTIONS[old].name}.`);
      this.game.progression.addMerit(300);
      this.game.progression.addRenown(8);
      this.checkTitles();
    } else {
      from.troops += survivors;
      tgt.troops = Math.max(2, tgt.troops - theirLoss);
      this.note(`Your attack on ${tgt.name} Province was thrown back.`);
    }
    return { win, ourLoss, theirLoss };
  }

  checkTitles() {
    const n = this.owned().length;
    for (const t of TITLES) if (n >= t.n) this.game.progression.setRank(t.rank);
  }

  recruit() {
    if (this.gold < 700) return false;
    this.gold -= 700;
    const cap = this.owned().sort((a, b) => b.dev - a.dev)[0];
    cap.troops += 14;
    this.note(`You raised 14,000 troops in ${cap.name}.`);
    return true;
  }
  develop(id) {
    const p = this.prov[id];
    if (!p || p.owner !== 'player' || this.gold < 700 || p.dev >= 6) return false;
    this.gold -= 700; p.dev++;
    this.note(`Irrigation and granaries were built in ${p.name} (prosperity ${p.dev}).`);
    return true;
  }
  proposeAlliance(f) {
    const pr = this.game.progression;
    const caoFear = this.troops('cao') / Math.max(1, this.troops());
    const chance = 0.25 + pr.renown * 0.004 + pr.virtue * 0.004 + (f === 'sun' || f === 'liubei' ? 0.25 : 0) + (caoFear > 2 ? 0.2 : 0);
    const ok = Math.random() < chance;
    if (ok) { this.allies.add(f); this.note(`You swore an alliance with ${FACTIONS[f].name}.`); }
    return ok;
  }

  // Rivals move, events fire, the year advances.
  endYear() {
    const out = [];
    this.gold += this.income();
    for (const p of this.owned()) p.troops += Math.round(p.dev * 1.2);
    // AI growth
    for (const p of Object.values(this.prov)) if (p.owner !== 'player') p.troops = Math.min(80, p.troops + Math.round(p.dev * 1.4));
    // historical events
    const y = this.year;
    if (y === 199 && this.prov.you.owner === 'yuan') { this.note('Yuan Shao destroyed Gongsun Zan at Yijing. The north is his.'); }
    if (y === 200 && !this.flags.guandu) {
      this.flags.guandu = true;
      if (this.owned('yuan').length && this.owned('cao').length) {
        const lose = this.owned('yuan').sort((a, b) => a.troops - b.troops).slice(0, 2);
        for (const p of lose) { if (this.neighbors(p.id).some((n) => this.prov[n].owner === 'cao')) { p.owner = 'cao'; p.troops = 18; } }
        for (const p of this.owned('yuan')) p.troops = Math.round(p.troops * 0.5);
        this.note('At Guandu, Cao Cao burned Yuan Shao\'s grain at Wuchao and destroyed his host of a hundred thousand.');
        out.push({ kind: 'event', title: 'The Battle of Guandu 官渡之戰', text: 'Outnumbered ten to one, Cao Cao raided Yuan Shao\'s granary at Wuchao and routed the northern army. Yuan Shao will die of grief within two years. Cao Cao is now the mightiest lord in the realm.' });
      }
    }
    if (y === 201 && !this.flags.zhaoyun) {
      this.flags.zhaoyun = true;
      out.push({ kind: 'officer', id: 'zhaoYun', title: 'Zhao Zilong seeks a lord 趙雲', text: 'Zhao Yun of Changshan, once a captain of Gongsun Zan, comes to your gate with a spear and a white horse.', need: 'virtue', min: 15 });
    }
    if (y === 203 && !this.flags.xushu) { this.flags.xushu = true; out.push({ kind: 'officer', id: 'xuShu', title: 'The wandering strategist Xu Shu 徐庶', text: 'A swordsman-turned-scholar of Yingchuan offers his counsel.', need: 'renown', min: 60 }); }
    if (y >= 204 && y <= 206) {
      for (const p of this.owned('yuan')) if (this.neighbors(p.id).some((n) => this.prov[n].owner === 'cao') && Math.random() < 0.7) { p.owner = 'cao'; p.troops = 20; this.note(`Cao Cao conquered ${p.name} from the sons of Yuan Shao.`); }
    }
    // AI aggression: each faction may attack its weakest non-allied neighbour
    for (const f of Object.keys(FACTIONS)) {
      if (f === 'player' || f === 'liubei') continue;
      const mine = this.owned(f);
      if (!mine.length) continue;
      const src = mine.sort((a, b) => b.troops - a.troops)[0];
      const targets = this.neighbors(src.id).map((n) => this.prov[n]).filter((p) => p.owner !== f && !(p.owner === 'player' && this.allies.has(f)));
      if (!targets.length) continue;
      const tgt = targets.sort((a, b) => a.troops - b.troops)[0];
      const aggr = f === 'cao' ? 0.55 : f === 'sun' ? 0.3 : 0.2;
      if (Math.random() > aggr || src.troops < tgt.troops * 1.3) continue;
      if (tgt.owner === 'player') {
        out.push({ kind: 'invasion', attacker: f, from: src.id, target: tgt.id, troops: Math.round(src.troops * 0.6) });
        src.troops = Math.round(src.troops * 0.4);
        continue;
      }
      const a = this.strength(f, src.troops * 0.7) * (0.8 + Math.random() * 0.4), d = this.strength(tgt.owner, tgt.troops) * 1.15;
      if (a > d) { this.note(`${FACTIONS[f].name} seized ${tgt.name} from ${FACTIONS[tgt.owner].name}.`); tgt.owner = f; tgt.troops = Math.round(src.troops * 0.4); src.troops = Math.round(src.troops * 0.5); }
      else src.troops = Math.round(src.troops * 0.75);
    }
    this.year++;
    this.game.time.setDate(this.year, 1, 10, 10);
    // Red Cliffs
    if (!this.flags.chibi && (this.year >= 208 || this.owned().length >= 4)) out.push({ kind: 'chibi' });
    if (this.flags.chibiDone && !this.flags.final && this.prov.yu.owner !== 'player' && this.canAttack('yu')) out.push({ kind: 'finalReady' });
    return out;
  }

  // Defence against an invasion.
  resolveDefence(inv, win) {
    const tgt = this.prov[inv.target];
    if (win) { tgt.troops = Math.max(3, tgt.troops - Math.round(inv.troops * 0.2)); this.note(`You repelled ${FACTIONS[inv.attacker].name}'s invasion of ${tgt.name}.`); this.game.progression.addMerit(200); }
    else {
      tgt.owner = inv.attacker; tgt.troops = Math.round(inv.troops * 0.6);
      this.note(`${FACTIONS[inv.attacker].name} took ${tgt.name} from you.`);
    }
  }

  // After Red Cliffs: Cao Cao is crippled.
  afterChibi(win) {
    this.flags.chibiDone = true;
    this.flags.chibi = true;
    if (win) {
      for (const p of this.owned('cao')) p.troops = Math.round(p.troops * 0.45);
      if (this.prov.jing.owner === 'cao' || this.prov.jing.owner === 'liubiao') { this.prov.jing.owner = 'liubei'; this.prov.jing.troops = 20; }
      this.note('At the Red Cliffs, fire consumed Cao Cao\'s fleet. His power south of the Yangtze was broken forever. Liu Bei took the southern commanderies of Jing.');
    }
  }

  toJSON() { return { year: this.year, prov: Object.fromEntries(Object.entries(this.prov).map(([k, v]) => [k, { owner: v.owner, troops: v.troops, dev: v.dev }])), gold: this.gold, allies: [...this.allies], log: this.log.slice(0, 30), flags: this.flags, officers: this.officers }; }
  load(o) {
    if (!o) return;
    this.year = o.year; this.gold = o.gold; this.allies = new Set(o.allies); this.log = o.log || []; this.flags = o.flags || {}; this.officers = o.officers || [];
    for (const [k, v] of Object.entries(o.prov)) Object.assign(this.prov[k], v);
  }
}
