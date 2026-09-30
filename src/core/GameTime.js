// In-game calendar. Starts in the 1st year of Zhongping (中平元年, 184 AD), 2nd month.
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const BRANCH_EN = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
const ERAS = [
  { from: 184, name: 'Zhongping', cn: '中平' },
  { from: 189, name: 'Zhongping', cn: '中平' },
  { from: 190, name: 'Chuping', cn: '初平' },
  { from: 194, name: 'Xingping', cn: '興平' },
  { from: 196, name: 'Jian\'an', cn: '建安' },
];
const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

export class GameTime {
  constructor() {
    this.year = 184;
    this.month = 2;
    this.day = 12;
    this.hour = 7.5;
    this.scale = 30; // game seconds per real second
    this.customEra = null;
  }
  advance(dtReal) { this.addHours((dtReal * this.scale) / 3600); }
  addHours(h) {
    this.hour += h;
    while (this.hour >= 24) { this.hour -= 24; this.day++; }
    while (this.day > 30) { this.day -= 30; this.month++; }
    while (this.month > 12) { this.month -= 12; this.year++; }
  }
  setDate(y, m, d = 1, h = this.hour) { this.year = y; this.month = m; this.day = d; this.hour = h; }
  era() {
    if (this.customEra) return { name: this.customEra.name, cn: this.customEra.cn, n: this.year - this.customEra.from + 1 };
    let e = ERAS[0];
    for (const x of ERAS) if (this.year >= x.from) e = x;
    const start = e.name === 'Zhongping' ? 184 : e.from;
    return { ...e, n: this.year - start + 1 };
  }
  shichen() { const i = Math.floor(((this.hour + 1) % 24) / 2); return { cn: BRANCHES[i] + '時', en: `Hour of the ${BRANCH_EN[i]}` }; }
  clock() { const h = Math.floor(this.hour), m = Math.floor((this.hour % 1) * 60); return `${h}:${String(m).padStart(2, '0')}`; }
  dateCn() { const e = this.era(); return `${e.cn}${e.n === 1 ? '元' : CN_NUM[e.n] || e.n}年 ${CN_NUM[this.month]}月`; }
  dateEn() { const e = this.era(); return `${this.month === 1 ? '1st' : this.month === 2 ? '2nd' : this.month === 3 ? '3rd' : this.month + 'th'} month, year ${e.n} of ${e.name} (${this.year} AD)`; }
  isNight() { return this.hour < 5.5 || this.hour > 19.5; }
  toJSON() { return { year: this.year, month: this.month, day: this.day, hour: this.hour, customEra: this.customEra }; }
  load(o) { Object.assign(this, o); }
}
