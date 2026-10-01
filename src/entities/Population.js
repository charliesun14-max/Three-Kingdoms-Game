// Spawns the ambient population of a region: villagers with daily routines,
// merchants, guards, and the hostile camps.
import { Rng } from '../core/Rng.js';
import { Character } from './Character.js';
import { Brain } from './AI.js';
import { randomAppearance } from './Humanoid.js';
import { Inventory } from '../rpg/Items.js';

const SURNAMES = ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Gao', 'Lin', 'Luo', 'Zheng', 'Liang', 'Song', 'Tang', 'Han', 'Feng', 'Deng', 'Cao', 'Peng', 'Zeng', 'Xiao', 'Tian', 'Dong', 'Pan', 'Yuan', 'Cai', 'Jiang', 'Yu', 'Du', 'Ye', 'Cheng', 'Wei', 'Su', 'Lü', 'Ding', 'Ren', 'Shen', 'Yao', 'Lu', 'Jiang'];
const SURNAME_CN = { Wang: '王', Li: '李', Zhang: '張', Liu: '劉', Chen: '陳', Yang: '楊', Zhao: '趙', Huang: '黃', Zhou: '周', Wu: '吳', Xu: '徐', Sun: '孫', Ma: '馬', Zhu: '朱', Hu: '胡', Guo: '郭', He: '何', Gao: '高', Lin: '林', Luo: '羅', Zheng: '鄭', Liang: '梁', Song: '宋', Tang: '唐', Han: '韓', Feng: '馮', Deng: '鄧', Cao: '曹', Peng: '彭', Zeng: '曾', Xiao: '蕭', Tian: '田', Dong: '董', Pan: '潘', Yuan: '袁', Cai: '蔡', Jiang: '蔣', Yu: '于', Du: '杜', Ye: '葉', Cheng: '程', Wei: '魏', Su: '蘇', 'Lü': '呂', Ding: '丁', Ren: '任', Shen: '沈', Yao: '姚', Lu: '盧' };
const GIVEN = [['Da', '大'], ['Er', '二'], ['San', '三'], ['Ping', '平'], ['An', '安'], ['Fu', '福'], ['Gui', '貴'], ['Shou', '壽'], ['Chang', '昌'], ['Xing', '興'], ['Kang', '康'], ['Bao', '寶'], ['Hu', '虎'], ['Niu', '牛'], ['Gou', '狗'], ['Tie', '鐵'], ['Shi', '石'], ['Yi', '義'], ['De', '德'], ['Cheng', '成'], ['Mao', '茂'], ['Kui', '奎'], ['Wen', '文'], ['Jun', '俊']];
const GIVEN_F = [['Mei', '梅'], ['Lan', '蘭'], ['Ju', '菊'], ['Zhu', '竹'], ['Hua', '花'], ['Yu', '玉'], ['Xiu', '秀'], ['Zhen', '珍'], ['Ying', '英'], ['Fang', '芳']];

export function randomName(rng, female = false) {
  const s = rng.pick(SURNAMES);
  const gv = rng.pick(female ? GIVEN_F : GIVEN);
  return { name: `${s} ${gv[0]}`, cn: `${SURNAME_CN[s] || ''}${gv[1]}` };
}

export const SHOPS = {
  smith: { title: 'Blacksmith', stock: { staff: 2, club: 1, dao: 2, jian: 1, spear: 2, axe: 1, bow: 2, shield: 2, paddedJacket: 2, leatherCap: 2, leatherArmor: 1 }, coins: 1500 },
  grocer: { title: 'Grocer', stock: { milletCake: 12, driedMeat: 6, wine: 5, bandage: 4, millet: 3 }, coins: 400 },
  apothecary: { title: 'Apothecary', stock: { bandage: 10, medicine: 5, herbs: 4 }, coins: 500 },
  tailor: { title: 'Cloth Merchant', stock: { headCloth: 4, hempTunic: 3, paddedJacket: 1, silk: 2 }, coins: 900 },
  innkeeper: { title: 'Innkeeper', stock: { wine: 10, driedMeat: 5, milletCake: 8 }, coins: 600 },
  butcher: { title: 'Butcher & Wine-seller', stock: { driedMeat: 10, wine: 12 }, coins: 800 },
  salt: { title: 'Salt Trader', stock: { salt: 4, sandals: 6, mat: 3 }, coins: 700 },
};

export class Population {
  constructor(game) {
    this.game = game;
    this.rng = new Rng(game.world.region.seed * 7);
    this.camps = new Map(); // camp id -> [characters]
  }

  spawn(o) {
    const g = this.game;
    const c = new Character(g, o);
    if (o.brain !== false) new Brain(c, o.brain || {});
    if (o.shop) {
      const def = SHOPS[o.shop];
      c.shop = o.shop;
      c.shopTitle = def.title;
      c.inventory = new Inventory();
      for (const [k, v] of Object.entries(def.stock)) c.inventory.add(k, v);
      c.inventory.coins = def.coins;
    }
    g.entities.add(c);
    return c;
  }

  sched(entries) { return entries.map((e) => ({ ...e })); }

  populateZhuo() {
    const g = this.game, S = g.world.settlements.spots, R = g.world.region, rng = this.rng;
    const lousang = R.settlements.find((s) => s.id === 'lousang');
    const zhuo = R.settlements.find((s) => s.id === 'zhuo');
    const fields = R.fields;
    const houses = g.world.settlements.buildings.filter((b) => b.id && b.id.startsWith('lousang_'));
    // --- Lousang villagers
    houses.forEach((b, i) => {
      const f = fields[i % 5];
      const farmer = randomName(rng);
      const home = b.door;
      this.spawn({
        ...farmer, role: 'farmer', faction: 'civilian', x: home.x, z: home.z, appearance: randomAppearance('farmer', rng), weapon: 'fists',
        brain: { archetype: 'peasant', mode: 'schedule', schedule: [
          { from: 5.5, to: 11.5, x: f.x + rng.range(-f.w / 3, f.w / 3), z: f.z + rng.range(-f.d / 3, f.d / 3), act: 'farm' },
          { from: 11.5, to: 13, x: lousang.x + rng.range(-12, 12), z: lousang.z + rng.range(-8, 8), act: 'sit' },
          { from: 13, to: 18, x: f.x + rng.range(-f.w / 3, f.w / 3), z: f.z + rng.range(-f.d / 3, f.d / 3), act: 'farm' },
          { from: 18, to: 20.5, x: lousang.x + rng.range(-10, 10), z: lousang.z + rng.range(-8, 8), act: 'wander', r: 10 },
          { from: 20.5, to: 5.5, x: home.x, z: home.z, act: 'sleep' },
        ] },
      });
      if (i % 2 === 0) {
        const wife = randomName(rng, true);
        this.spawn({
          ...wife, role: 'villager', faction: 'civilian', x: home.x + 1, z: home.z + 1, appearance: randomAppearance('woman', rng),
          brain: { archetype: 'peasant', mode: 'schedule', schedule: [
            { from: 6, to: 9, x: S.villageWell.x + rng.range(-3, 3), z: S.villageWell.z + rng.range(-3, 3), act: 'talk' },
            { from: 9, to: 19, x: home.x + rng.range(-4, 4), z: home.z + rng.range(2, 6), act: 'wander', r: 6 },
            { from: 19, to: 6, x: home.x, z: home.z, act: 'sleep' },
          ] },
        });
      }
      if (i % 4 === 1) {
        const kid = randomName(rng);
        this.spawn({ ...kid, role: 'child', faction: 'civilian', x: home.x, z: home.z + 2, appearance: randomAppearance('child', rng), brain: { mode: 'wander' } }).ai.area = { x: lousang.x, z: lousang.z, r: 25 };
      }
    });
    // Elder under the mulberry
    // --- Zhuo town
    const gateGuards = [['north', 0], ['south', Math.PI], ['east', -Math.PI / 2], ['west', Math.PI / 2]];
    for (const [gid, rot] of gateGuards) {
      for (const sd of [-1, 1]) {
        const sp = S[`zhuoGate_${gid}_in`];
        const out = S[`zhuoGate_${gid}_out`];
        const px = out.x + (gid === 'north' || gid === 'south' ? sd * 3.4 : 0), pz = out.z + (gid === 'east' || gid === 'west' ? sd * 3.4 : 0);
        const nm = randomName(rng);
        const c = this.spawn({ ...nm, title: 'Gate guard', role: 'guard', faction: 'han', x: px, z: pz, appearance: randomAppearance('guard', rng), weapon: 'ji', body: 'lamellar', head: 'ironHelmet', stats: { str: 11, vit: 11, polearm: 8, block: 7 }, brain: { archetype: 'soldier', fighter: true, mode: 'guard', aggroRange: 14 } });
        c.ai.post = { x: px, z: pz, rot: Math.atan2(out.x - sp.x, out.z - sp.z) };
        void rot;
      }
    }
    // patrol
    for (let i = 0; i < 3; i++) {
      const nm = randomName(rng);
      const c = this.spawn({ ...nm, title: 'Watchman', role: 'guard', faction: 'han', x: zhuo.x + rng.range(-40, 40), z: zhuo.z, appearance: randomAppearance('guard', rng), weapon: 'dao', shield: true, body: 'leatherArmor', head: 'leatherCap', stats: { str: 10, vit: 10, blade: 6, block: 6 }, brain: { archetype: 'soldier', fighter: true, mode: 'wander', aggroRange: 14 } });
      c.ai.area = { x: zhuo.x, z: zhuo.z, r: 70 };
    }
    // merchants at stalls
    const stalls = g.world.settlements.marketStalls;
    const shopKinds = ['grocer', 'tailor', 'salt', 'grocer', 'apothecary', 'salt', 'butcher', 'grocer', 'tailor', 'salt', 'grocer', 'apothecary'];
    stalls.forEach((st, i) => {
      const kind = shopKinds[i];
      const fem = i === 1 || i === 8 || i === 10;
      const nm = randomName(rng, fem);
      this.spawn({ ...nm, role: 'merchant', faction: 'civilian', x: st.x, z: st.z, yaw: st.rot, appearance: randomAppearance(fem ? 'woman' : 'merchant', rng), shop: kind,
        brain: { mode: 'schedule', schedule: [
          { from: 7, to: 18, x: st.x, z: st.z, act: 'talk', rot: st.rot },
          { from: 18, to: 7, x: zhuo.x + rng.range(-60, 60), z: zhuo.z + rng.range(-60, 60), act: 'sleep' },
        ] } });
    });
    // blacksmith
    this.spawn({ id: 'smith', name: 'Blacksmith Tie', cn: '鐵匠', title: 'Zhuo County forge', role: 'merchant', faction: 'civilian', x: S.smithy.x, z: S.smithy.z, yaw: S.smithy.rot, appearance: { ...randomAppearance('farmer', rng), bare: true, robe: 0x3a2a1a, build: 1.25, headwear: 'wrap', beard: 'short' }, shop: 'smith',
      brain: { mode: 'schedule', schedule: [{ from: 6, to: 19, x: S.smithy.x, z: S.smithy.z, act: 'hammer', rot: S.smithy.rot }, { from: 19, to: 6, x: S.smithy.x, z: S.smithy.z - 3, act: 'sleep' }] } });
    // innkeeper
    this.spawn({ id: 'innkeeper', name: 'Innkeeper Hou', cn: '侯掌櫃', role: 'merchant', faction: 'civilian', x: S.tavernDoor.x, z: S.tavernDoor.z, yaw: 0, appearance: randomAppearance('merchant', rng), shop: 'innkeeper',
      brain: { mode: 'schedule', schedule: [{ from: 0, to: 24, x: S.tavernDoor.x + 1.5, z: S.tavernDoor.z + 0.5, act: 'talk', rot: 0 }] } });
    // tavern patrons (evenings)
    for (let i = 0; i < 4; i++) {
      const nm = randomName(rng);
      const home = { x: zhuo.x + rng.range(-70, 70), z: zhuo.z + rng.range(-60, 60) };
      const tbl = i < 2 ? S.tavernTable : S.tavernTable2;
      this.spawn({ ...nm, role: 'townsman', faction: 'civilian', x: home.x, z: home.z, appearance: randomAppearance(rng.chance(0.3) ? 'official' : 'farmer', rng),
        brain: { mode: 'schedule', schedule: [
          { from: 7, to: 17, x: S.market.x + rng.range(-20, 20), z: S.market.z + rng.range(-15, 15), act: 'wander', r: 18 },
          { from: 17, to: 23, x: tbl.x + (i % 2 ? 0.9 : -0.9), z: tbl.z, act: 'drink', rot: Math.PI },
          { from: 23, to: 7, x: home.x, z: home.z, act: 'sleep' },
        ] } });
    }
    // townsfolk wandering
    for (let i = 0; i < 10; i++) {
      const female = rng.chance(0.4);
      const nm = randomName(rng, female);
      const home = { x: zhuo.x + rng.range(-80, 80), z: zhuo.z + rng.range(-70, 70) };
      const nearest = g.nav ? g.nav.free(...g.nav.cell(home.x, home.z)) : null;
      if (nearest) { home.x = nearest[0] - g.nav.half + 0.5; home.z = nearest[1] - g.nav.half + 0.5; }
      this.spawn({ ...nm, role: 'townsman', faction: 'civilian', x: home.x, z: home.z, appearance: randomAppearance(female ? 'woman' : rng.pick(['farmer', 'merchant', 'official', 'elder']), rng),
        brain: { mode: 'schedule', schedule: [
          { from: 6.5, to: 12, x: S.market.x + rng.range(-25, 25), z: S.market.z + rng.range(-20, 20), act: 'wander', r: 20 },
          { from: 12, to: 18, x: zhuo.x + rng.range(-60, 60), z: zhuo.z + rng.range(-5, 5), act: 'wander', r: 30 },
          { from: 18, to: 6.5, x: home.x, z: home.z, act: 'sleep' },
        ] } });
    }
    // street traffic: people going about their business along the two main streets
    const streetPt = () => (rng.chance(0.5) ? { x: zhuo.x + rng.range(-85, 85), z: zhuo.z + rng.range(-3, 3) } : { x: zhuo.x + rng.range(-3, 3), z: zhuo.z + rng.range(-80, 80) });
    for (let i = 0; i < 14; i++) {
      const female = rng.chance(0.35);
      const a = streetPt(), b = streetPt(), c = streetPt();
      this.spawn({ ...randomName(rng, female), role: 'townsman', faction: 'civilian', x: a.x, z: a.z, appearance: randomAppearance(female ? 'woman' : rng.pick(['farmer', 'farmer', 'merchant', 'official', 'elder']), rng),
        brain: { mode: 'schedule', schedule: [
          { from: 6, to: 10, x: a.x, z: a.z, act: 'wander', r: 9 },
          { from: 10, to: 14, x: b.x, z: b.z, act: 'wander', r: 9 },
          { from: 14, to: 19, x: c.x, z: c.z, act: 'wander', r: 9 },
          { from: 19, to: 6, x: a.x, z: a.z, act: 'sleep' },
        ] } });
    }
    // Taoist preacher of the Way of Great Peace near the market (foreshadowing)
    this.spawn({ id: 'preacher', name: 'Wandering Taoist', cn: '太平道人', title: 'follower of the Way of Great Peace', role: 'preacher', faction: 'civilian', x: S.market.x - 8, z: S.market.z + 3,
      appearance: { ...randomAppearance('elder', rng), robe: 0xb89a40, headwear: 'yellowScarf', beard: 'grey' },
      brain: { mode: 'schedule', schedule: [{ from: 7, to: 18, x: S.market.x - 8, z: S.market.z + 3, act: 'talk' }, { from: 18, to: 7, x: S.market.x - 8, z: S.market.z + 3, act: 'sleep' }] } });
    // --- Taoyuan servants
    const ty = R.settlements.find((s) => s.id === 'taoyuan');
    for (let i = 0; i < 3; i++) {
      const nm = randomName(rng, i === 2);
      this.spawn({ ...nm, title: 'Servant of the Zhang estate', role: 'servant', faction: 'civilian', x: ty.x - 18 + rng.range(-10, 10), z: ty.z - 5 + rng.range(-8, 8), appearance: randomAppearance(i === 2 ? 'woman' : 'farmer', rng), brain: { mode: 'wander' } }).ai.area = { x: ty.x - 18, z: ty.z - 6, r: 14 };
    }
    // --- hostile camps
    this.spawnCamp('ytcamp', 'yellowTurban', 14);
    this.spawnCamp('banditWest', 'bandit', 5);
    this.spawnCamp('banditSouth', 'bandit', 5);
    // travellers on the roads
    for (let i = 0; i < 4; i++) {
      const nm = randomName(rng);
      const a = rng.chance(0.5) ? S.villageWell : S.market;
      const b = a === S.market ? S.villageWell : S.market;
      const c = this.spawn({ ...nm, title: 'Traveller', role: 'traveller', faction: 'civilian', x: a.x + rng.range(-5, 5), z: a.z + rng.range(-5, 5), appearance: randomAppearance(rng.pick(['farmer', 'merchant']), rng),
        brain: { mode: 'schedule', schedule: [{ from: 6, to: 12, x: b.x, z: b.z, act: 'wander', r: 10 }, { from: 12, to: 18, x: a.x, z: a.z, act: 'wander', r: 10 }, { from: 18, to: 6, x: a.x, z: a.z, act: 'sleep' }] } });
      c.tags.add('alwaysActive');
    }
  }

  // Generic population for regions beyond Zhuo, driven by settlement types.
  populateGeneric() {
    const g = this.game, R = g.world.region, rng = this.rng, S = g.world.settlements.spots;
    for (const st of R.settlements) {
      if (g.flags[`cleared_${st.id}`]) continue;
      switch (st.type) {
        case 'walledTown': {
          const hostile = st.faction === 'yellowTurban';
          if (hostile) { this.spawnGarrison(st, 'yellowTurban', 18, { r: Math.min(st.w, st.d) * 0.4 }); break; }
          for (const gid of ['north', 'south', 'east', 'west']) {
            const out = S[`${st.id}Gate_${gid}_out`];
            if (!out) continue;
            for (const sd of [-1, 1]) {
              const px = out.x + (gid === 'north' || gid === 'south' ? sd * 3.4 : 0), pz = out.z + (gid === 'east' || gid === 'west' ? sd * 3.4 : 0);
              const c = this.spawn({ ...randomName(rng), title: 'Gate guard', role: 'guard', faction: st.faction || 'han', x: px, z: pz, appearance: randomAppearance('guard', rng), weapon: 'ji', body: 'lamellar', head: 'ironHelmet', stats: { str: 11, vit: 11, polearm: 8, block: 7 }, brain: { archetype: 'soldier', fighter: true, mode: 'guard', aggroRange: 14 } });
              c.ai.post = { x: px, z: pz };
            }
          }
          for (let i = 0; i < 12; i++) {
            const female = rng.chance(0.4);
            const x = st.x + rng.range(-st.w / 3, st.w / 3), z = st.z + rng.range(-st.d / 3, st.d / 3);
            const c = this.spawn({ ...randomName(rng, female), role: 'townsman', faction: 'civilian', x, z, appearance: randomAppearance(female ? 'woman' : rng.pick(['farmer', 'merchant', 'official', 'elder']), rng), brain: { mode: 'wander' } });
            c.ai.area = { x: st.x, z: st.z, r: Math.min(st.w, st.d) * 0.35 };
          }
          const stalls = g.world.settlements.marketStalls || [];
          const kinds = ['grocer', 'tailor', 'salt', 'grocer', 'apothecary', 'salt', 'butcher', 'grocer', 'tailor', 'salt', 'grocer', 'apothecary'];
          stalls.forEach((sp, i) => this.spawn({ ...randomName(rng), role: 'merchant', faction: 'civilian', x: sp.x, z: sp.z, yaw: sp.rot, appearance: randomAppearance('merchant', rng), shop: kinds[i], brain: { mode: 'idle' } }));
          if (S.smithy) this.spawn({ id: 'smith', name: 'Blacksmith', cn: '鐵匠', role: 'merchant', faction: 'civilian', x: S.smithy.x, z: S.smithy.z, yaw: S.smithy.rot, appearance: { ...randomAppearance('farmer', rng), bare: true, build: 1.2 }, shop: 'smith', brain: { mode: 'schedule', schedule: [{ from: 0, to: 24, x: S.smithy.x, z: S.smithy.z, act: 'hammer', rot: S.smithy.rot }] } });
          if (S.tavernDoor) this.spawn({ id: 'innkeeper', name: 'Innkeeper', cn: '掌櫃', role: 'merchant', faction: 'civilian', x: S.tavernDoor.x + 1.5, z: S.tavernDoor.z + 0.5, appearance: randomAppearance('merchant', rng), shop: 'innkeeper', brain: { mode: 'idle' } });
          break;
        }
        case 'armyCamp': {
          const f = st.faction || 'han';
          const kind = f === 'han' || f === 'militia' ? 'soldier' : 'soldier';
          const n = st.garrison ?? 10;
          for (let i = 0; i < n; i++) {
            const x = st.x + rng.range(-st.w / 3, st.w / 3), z = st.z + rng.range(-st.d / 4, st.d / 3);
            const c = this.spawn({ ...randomName(rng), title: 'Soldier', role: 'soldier', faction: f, x, z, appearance: { ...randomAppearance(kind, rng), ...(st.uniform || {}) }, weapon: rng.pick(['ji', 'spear', 'dao']), shield: rng.chance(0.3), body: rng.chance(0.6) ? 'lamellar' : 'leatherArmor', head: 'ironHelmet', stats: { str: 10, vit: 10, polearm: 6, blade: 6, block: 6 }, brain: { archetype: 'soldier', fighter: true, mode: 'wander', aggroRange: 16 } });
            c.ai.area = { x: st.x, z: st.z, r: Math.min(st.w, st.d) * 0.3 };
            c.ai.leash = { x: st.x, z: st.z, r: Math.max(st.w, st.d) };
            c.tags.add(st.id);
          }
          break;
        }
        case 'rebelCamp': this.spawnCamp(st.id, 'yellowTurban', 12); break;
        case 'banditCamp': this.spawnCamp(st.id, 'bandit', 5); break;
        case 'village': case 'hamlet': {
          const n = st.type === 'village' ? 12 : 5;
          for (let i = 0; i < n; i++) {
            const female = rng.chance(0.4);
            const c = this.spawn({ ...randomName(rng, female), role: female ? 'villager' : 'farmer', faction: 'civilian', x: st.x + rng.range(-st.w / 3, st.w / 3), z: st.z + rng.range(-st.d / 3, st.d / 3), appearance: randomAppearance(female ? 'woman' : 'farmer', rng), brain: { mode: 'wander' } });
            c.ai.area = { x: st.x, z: st.z, r: Math.min(st.w, st.d) * 0.4 };
          }
          break;
        }
        default: break;
      }
    }
  }

  spawnGarrison(st, kind, n, o = {}) {
    const rng = this.rng, list = [];
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(5, o.r || 40);
      const c = this.spawn({ ...randomName(rng), title: kind === 'yellowTurban' ? 'Yellow Turban' : 'Soldier', role: kind, faction: kind, x: st.x + Math.cos(a) * r, z: st.z + Math.sin(a) * r, appearance: randomAppearance(kind, rng), weapon: rng.pick(['spear', 'spear', 'dao', 'staff', 'club']), body: rng.chance(0.35) ? 'paddedJacket' : null, stats: { str: rng.int(7, 11), vit: rng.int(6, 10), polearm: 4, blade: 4 }, brain: { archetype: kind === 'yellowTurban' ? 'rebel' : 'soldier', fighter: true, mode: 'wander', aggroRange: 18 } });
      c.ai.area = { x: st.x, z: st.z, r: o.r || 40 };
      c.ai.leash = { x: st.x, z: st.z, r: (o.r || 40) * 1.8 };
      c.tags.add(st.id);
      c.inventory.coins = rng.int(2, 20);
      if (kind === 'yellowTurban') c.inventory.add('yellowCloth');
      list.push(c);
    }
    this.camps.set(st.id, list);
    return list;
  }

  spawnCamp(campId, kind, n) {
    const g = this.game, rng = this.rng;
    const s = g.world.region.settlements.find((x) => x.id === campId);
    if (!s) return [];
    if (g.flags[`cleared_${campId}`]) return [];
    const list = [];
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(3, Math.min(s.w, s.d) * 0.35);
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      const nm = randomName(rng);
      const yt = kind === 'yellowTurban';
      const weapon = yt ? rng.pick(['spear', 'spear', 'staff', 'dao', 'hoe', 'club']) : rng.pick(['dao', 'club', 'axe', 'spear', 'sickle']);
      const c = this.spawn({
        ...nm, title: yt ? 'Yellow Turban' : 'Bandit', role: kind, faction: kind, x, z,
        appearance: randomAppearance(kind, rng), weapon,
        body: rng.chance(0.3) ? 'paddedJacket' : null, head: null,
        stats: { str: rng.int(7, 11), vit: rng.int(6, 10), agi: rng.int(6, 10), blade: rng.int(2, 6), polearm: rng.int(2, 6) },
        brain: { archetype: yt ? 'rebel' : 'bandit', fighter: true, mode: 'wander', aggroRange: 16 },
      });
      c.ai.area = { x: s.x, z: s.z, r: Math.min(s.w, s.d) * 0.35 };
      c.ai.leash = { x: s.x, z: s.z, r: Math.max(s.w, s.d) * 0.9 + 20 };
      c.tags.add(campId);
      c.inventory.coins = rng.int(3, 40);
      if (yt) { c.inventory.add('yellowCloth', 1); if (rng.chance(0.4)) c.inventory.add('talisman', 1); }
      if (rng.chance(0.3)) c.inventory.add('milletCake', 1);
      if (rng.chance(0.15)) c.inventory.add('bandage', 1);
      list.push(c);
    }
    this.camps.set(campId, list);
    return list;
  }
}
