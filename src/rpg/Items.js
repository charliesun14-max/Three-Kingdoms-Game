// Item database. Prices in wuzhu coins (五銖錢).
import { WEAPONS } from '../combat/Weapons.js';

export const ARMORS = {
  // slot: body | head
  hempTunic: { slot: 'body', name: 'Hemp Tunic', cn: '麻衣', armor: { slash: 3, stab: 2, blunt: 3 }, weight: 1, price: 40, look: { outfit: 'peasant' } },
  paddedJacket: { slot: 'body', name: 'Padded Jacket', cn: '絮襖', armor: { slash: 10, stab: 6, blunt: 9 }, weight: 3, price: 160, look: { outfit: 'soldier' } },
  leatherArmor: { slot: 'body', name: 'Lacquered Leather Armour', cn: '皮甲', armor: { slash: 18, stab: 12, blunt: 9 }, weight: 6, price: 600, look: { outfit: 'soldier', armor: 'leather' } },
  lamellar: { slot: 'body', name: 'Iron Lamellar Armour', cn: '札甲', armor: { slash: 34, stab: 24, blunt: 14 }, weight: 14, price: 2400, look: { outfit: 'soldier', armor: 'lamellar' } },
  generalArmor: { slot: 'body', name: "General's Scale Armour", cn: '魚鱗甲', armor: { slash: 46, stab: 34, blunt: 20 }, weight: 16, price: 9000, look: { outfit: 'soldier', armor: 'general' } },
  headCloth: { slot: 'head', name: 'Head Cloth', cn: '幘', armor: { slash: 1, stab: 1, blunt: 1 }, weight: 0, price: 10, look: { headwear: 'wrap' } },
  leatherCap: { slot: 'head', name: 'Leather Helmet', cn: '皮盔', armor: { slash: 6, stab: 5, blunt: 5 }, weight: 1, price: 180, look: { headwear: 'helmet', helmetColor: 0x5a4030 } },
  ironHelmet: { slot: 'head', name: 'Iron Helmet', cn: '兜鍪', armor: { slash: 12, stab: 10, blunt: 8 }, weight: 2.5, price: 700, look: { headwear: 'helmet' } },
};

export const ITEMS = {
  // consumables
  bandage: { type: 'use', name: 'Linen Bandage', cn: '布帶', desc: 'Stops bleeding.', price: 18, weight: 0.1, use: { stopBleed: true, heal: 5 } },
  medicine: { type: 'use', name: 'Wound Medicine', cn: '金創藥', desc: 'Herbal paste for sword wounds. Restores health over time.', price: 90, weight: 0.2, use: { heal: 45, stopBleed: true } },
  milletCake: { type: 'use', name: 'Millet Cake', cn: '粟餅', desc: 'Plain peasant food.', price: 6, weight: 0.2, use: { food: 25, heal: 3 } },
  driedMeat: { type: 'use', name: 'Dried Pork', cn: '肉脯', desc: 'Salted and dried. Hearty.', price: 22, weight: 0.3, use: { food: 45, heal: 6 } },
  wine: { type: 'use', name: 'Jar of Wine', cn: '酒', desc: 'Millet wine. Warms the heart; dulls the eye.', price: 25, weight: 1, use: { food: 5, stamina: 30, drunk: 0.3 } },
  // trade goods
  sandals: { type: 'trade', name: 'Straw Sandals', cn: '草鞋', desc: 'Woven by hand. Cheap, but always in demand.', price: 12, weight: 0.3 },
  mat: { type: 'trade', name: 'Woven Mat', cn: '席', desc: 'A reed sitting mat.', price: 30, weight: 1.5 },
  millet: { type: 'trade', name: 'Sack of Millet', cn: '粟', desc: 'A dou of millet grain.', price: 40, weight: 5 },
  silk: { type: 'trade', name: 'Bolt of Silk', cn: '帛', desc: 'Fine silk from Qi.', price: 600, weight: 2 },
  salt: { type: 'trade', name: 'Salt', cn: '鹽', desc: 'A government monopoly. Valuable.', price: 120, weight: 2 },
  yellowCloth: { type: 'trade', name: 'Yellow Headscarf', cn: '黃巾', desc: 'Taken from a fallen rebel. Proof of a kill.', price: 3, weight: 0.05 },
  talisman: { type: 'trade', name: 'Taoist Talisman', cn: '符', desc: 'A paper charm of the Way of Great Peace. Rebels drink its ashes in water.', price: 8, weight: 0.01 },
  // quest items
  notice: { type: 'quest', name: 'Recruitment Proclamation', cn: '榜文', desc: 'Governor Liu Yan calls for volunteers to fight the Yellow Turbans.', price: 0, weight: 0 },
  taxMillet: { type: 'quest', name: 'Tax Millet', cn: '租粟', desc: "Your family's share of the autumn tax for the village head.", price: 0, weight: 5 },
  letter: { type: 'quest', name: 'Sealed Letter', cn: '書信', desc: 'A letter sealed with clay.', price: 0, weight: 0 },
  tigerTally: { type: 'quest', name: 'Tiger Tally', cn: '虎符', desc: 'Half of a bronze tiger tally — authority to command troops.', price: 0, weight: 0.2 },
  seal: { type: 'quest', name: 'Imperial Jade Seal', cn: '傳國玉璽', desc: '"Having received the Mandate from Heaven, may the sovereign live long and prosper."', price: 0, weight: 1 },
  herbs: { type: 'quest', name: 'Medicinal Herbs', cn: '草藥', desc: 'Gathered for your father\'s wound.', price: 10, weight: 0.2 },
};

// Unified lookup
export function itemDef(id) {
  if (ITEMS[id]) return { id, ...ITEMS[id] };
  if (WEAPONS[id]) return { id, type: 'weapon', ...WEAPONS[id], desc: weaponDesc(id) };
  if (ARMORS[id]) return { id, type: 'armor', ...ARMORS[id], desc: armorDesc(id) };
  if (id === 'shield') return { id, type: 'shield', name: 'Han Shield', cn: '盾', price: 160, weight: 3, desc: 'Lacquered wood and hide. Blocks arrows and blows.' };
  return { id, type: 'misc', name: id, price: 0, weight: 0 };
}
function weaponDesc(id) {
  const w = WEAPONS[id];
  const d = w.dmg;
  return `${w.cls === 'polearm' ? 'Two-handed polearm' : w.cls === 'blade' ? 'Blade' : w.cls === 'blunt' ? 'Blunt weapon' : w.cls === 'bow' ? 'Bow' : 'Unarmed'} · Slash ${d.slash} · Stab ${d.stab} · Blunt ${d.blunt} · Reach ${w.reach}m`;
}
function armorDesc(id) {
  const a = ARMORS[id].armor;
  return `Protection · Slash ${a.slash} · Stab ${a.stab} · Blunt ${a.blunt}`;
}

export class Inventory {
  constructor() { this.items = new Map(); this.coins = 0; }
  add(id, n = 1) { this.items.set(id, (this.items.get(id) || 0) + n); return this; }
  remove(id, n = 1) {
    const c = this.items.get(id) || 0;
    if (c < n) return false;
    if (c - n <= 0) this.items.delete(id); else this.items.set(id, c - n);
    return true;
  }
  count(id) { return this.items.get(id) || 0; }
  has(id, n = 1) { return this.count(id) >= n; }
  list() { return [...this.items.entries()].map(([id, n]) => ({ ...itemDef(id), n })); }
  weight() { let w = 0; for (const [id, n] of this.items) w += (itemDef(id).weight || 0) * n; return w; }
  toJSON() { return { items: [...this.items.entries()], coins: this.coins }; }
  static from(o) { const inv = new Inventory(); for (const [k, v] of o.items) inv.items.set(k, v); inv.coins = o.coins; return inv; }
}

// Military & civil ranks from peasant to emperor.
export const RANKS = [
  { id: 'peasant', name: 'Peasant', cn: '農夫', merit: 0 },
  { id: 'volunteer', name: 'Volunteer', cn: '義勇', merit: 0 },
  { id: 'wuzhang', name: 'Squad Leader (5 men)', cn: '伍長', merit: 60, troops: 4 },
  { id: 'shizhang', name: 'Section Chief (10 men)', cn: '什長', merit: 150, troops: 8 },
  { id: 'duibo', name: 'Platoon Commander (50 men)', cn: '隊率', merit: 320, troops: 12 },
  { id: 'tunzhang', name: 'Company Commander', cn: '屯長', merit: 600, troops: 16 },
  { id: 'junhou', name: 'Major', cn: '軍候', merit: 1000, troops: 20 },
  { id: 'xiaowei', name: 'Colonel', cn: '校尉', merit: 1600, troops: 24 },
  { id: 'taishou', name: 'Grand Administrator', cn: '太守', merit: 2400, troops: 28 },
  { id: 'zhoumu', name: 'Provincial Governor', cn: '州牧', merit: 3600, troops: 32 },
  { id: 'gong', name: 'Duke', cn: '公', merit: 5000, troops: 36 },
  { id: 'wang', name: 'King', cn: '王', merit: 7000, troops: 40 },
  { id: 'huangdi', name: 'Emperor', cn: '皇帝', merit: 10000, troops: 48 },
];
export const rankIndex = (id) => RANKS.findIndex((r) => r.id === id);
