// Learn-by-doing skills (Kingdom Come style) plus merit, rank, virtue and renown.
import { RANKS, rankIndex } from './Items.js';

export const SKILLS = {
  str: { name: 'Strength', cn: '力', desc: 'Damage with all weapons; carry weight.' },
  agi: { name: 'Agility', cn: '敏', desc: 'Attack speed and stamina efficiency.' },
  vit: { name: 'Vitality', cn: '體', desc: 'Health and stamina.' },
  blade: { name: 'Blade', cn: '刀劍', desc: 'Swords, sabres and axes.' },
  polearm: { name: 'Polearm', cn: '長兵', desc: 'Spears, halberds and staves.' },
  unarmed: { name: 'Unarmed', cn: '拳腳', desc: 'Fists and grappling.' },
  block: { name: 'Defence', cn: '格擋', desc: 'Blocking and parrying (perfect blocks train it fastest).' },
  archery: { name: 'Archery', cn: '射', desc: 'Bows and crossbows.' },
  speech: { name: 'Speech', cn: '辯', desc: 'Persuasion and better prices.' },
  leadership: { name: 'Leadership', cn: '統率', desc: 'Command more troops and inspire them.' },
  stealth: { name: 'Stealth', cn: '潛行', desc: 'Moving unseen.' },
};

export class Progression {
  constructor(game) {
    this.game = game;
    this.xp = {};
    for (const k of Object.keys(SKILLS)) this.xp[k] = 0;
    this.merit = 0; // 軍功
    this.virtue = 0; // 德 (benevolence; -100..100)
    this.renown = 0; // 名望
    this.rank = 'peasant';
  }
  level(k) { return this.game.player.stats[k === 'block' ? 'block' : k] ?? 1; }
  need(lv) { return 20 + lv * lv * 6; }
  gain(k, amt) {
    const pl = this.game.player;
    if (!pl || !(k in this.xp)) return;
    this.xp[k] += amt;
    const cur = pl.stats[k] ?? 1;
    if (cur >= 20) return;
    if (this.xp[k] >= this.need(cur)) {
      this.xp[k] -= this.need(cur);
      pl.stats[k] = cur + 1;
      if (k === 'vit') { pl.hpMax = pl.computeHpMax(); pl.staminaMax = 100 + pl.stats.vit * 3; }
      this.game.ui.notify(`${SKILLS[k].name} ${SKILLS[k].cn} increased to ${cur + 1}`, 'skill');
      this.game.audio?.play('levelup');
    }
  }
  addMerit(n, reason = '') {
    this.merit += n;
    if (n > 0) this.game.ui.notify(`+${n} merit 軍功${reason ? ' — ' + reason : ''}`, 'merit');
  }
  addVirtue(n, reason = '', silent = false) {
    this.virtue = Math.max(-100, Math.min(100, this.virtue + n));
    if (!silent) this.game.ui.notify(`${n > 0 ? 'Virtue rises' : 'Virtue falls'} 德 ${n > 0 ? '+' : ''}${n}${reason ? ' — ' + reason : ''}`, n > 0 ? 'virtue' : 'vice');
  }
  addRenown(n) { this.renown += n; }
  setRank(id, announce = true) {
    if (rankIndex(id) <= rankIndex(this.rank) && this.rank !== 'peasant') return;
    this.rank = id;
    const r = RANKS[rankIndex(id)];
    if (announce) this.game.ui.rankUp(r);
  }
  rankDef() { return RANKS[rankIndex(this.rank)]; }
  toJSON() { return { xp: this.xp, merit: this.merit, virtue: this.virtue, renown: this.renown, rank: this.rank }; }
  load(o) { Object.assign(this, o); }
}
