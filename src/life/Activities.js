// Things to do in town: games of skill and chance, odd jobs, fishing, prayer, services and performers.
import * as THREE from 'three';
import { PROPS } from './Props.js';
import { Batch, firewood } from '../world/Buildings.js';
import { BARKS, pick } from './barkLines.js';
import { itemDef } from '../rpg/Items.js';
import { wait } from '../ui/UI.js';

const TALES = [
  { title: 'The Feast at Hongmen 鴻門宴', lines: [
    'Four hundred years ago, the Hegemon Xiang Yu invited Liu Bang — our Gaozu — to a feast at Hongmen, meaning to kill him at the table.',
    'Fan Zeng raised his jade ring three times as a signal. Three times Xiang Yu pretended not to see.',
    'Then Xiang Zhuang drew his sword to perform a sword dance — every thrust aimed at Liu Bang\'s heart! But Xiang Bo rose and danced too, shielding Liu Bang with his own body.',
    'Fan Kuai burst in with shield and sword, ate a raw shoulder of pork in one sitting and shamed the Hegemon with his words. Liu Bang slipped away to the latrine — and rode for his life.',
    'And so the man who could have been killed over wine became the founder of our Han. Heaven chooses whom it chooses!'] },
  { title: 'Han Xin Crawls 胯下之辱', lines: [
    'Han Xin was a poor youth in Huaiyin who wore a sword but had no rice. A butcher\'s boy blocked his path in the market.',
    '"You carry a sword, but you are a coward. Stab me — or crawl between my legs!"',
    'Han Xin looked at him a long while… then knelt and crawled. The whole market laughed.',
    'Years later he was the greatest general under Heaven, who won the realm for Gaozu. He sent for the butcher\'s boy — and made him an officer. "Had I killed you then," he said, "I would never have become what I am."'] },
  { title: 'The Cowherd and the Weaver Girl 牛郎織女', lines: [
    'The Weaver Girl wove the clouds of Heaven. One day she came down to bathe and met a poor cowherd, and they loved one another.',
    'The Queen Mother of the West was furious. With one stroke of her hairpin she drew the Silver River across the sky to part them.',
    'But on the seventh night of the seventh month, all the magpies of the world fly up and make a bridge — and the two lovers meet for a single night.',
    'That is why it rains on the seventh night. Those are her tears.'] },
  { title: 'Jing Ke and the King of Qin 荊軻刺秦', lines: [
    'Jing Ke rode west to the court of Qin carrying a map of Yan\'s lands and the head of a traitor general.',
    'At the river Yi his friends sang: "The wind howls, the Yi is cold; the hero goes, and will not return."',
    'Before the King of Qin he unrolled the map — and at its end lay a poisoned dagger! He seized the King\'s sleeve and struck.',
    'The sleeve tore. The King ran around a pillar, drew his long sword at last, and cut Jing Ke down. Brave men still pour wine for him at the river Yi.'] },
];

// Characters a market scribe needs most: [meaning, correct, two look-alikes]
const GLYPHS = {
  mother: ['mother', '母', '毋', '父'], father: ['father', '父', '文', '母'], son: ['son', '子', '了', '女'], millet: ['millet, grain', '米', '來', '禾'],
  water: ['water', '水', '永', '火'], horse: ['horse', '馬', '鳥', '牛'], mountain: ['mountain', '山', '出', '川'], river: ['river', '河', '何', '可'],
  field: ['field', '田', '由', '甲'], moon: ['moon, month', '月', '日', '目'], home: ['home, family', '家', '宗', '安'], army: ['army', '軍', '車', '運'],
  cart: ['cart', '車', '東', '軍'], east: ['east', '東', '束', '車'], south: ['south', '南', '幸', '北'], king: ['king', '王', '玉', '主'],
  peace: ['peace, safe', '安', '女', '宗'], money: ['money', '錢', '鐵', '銀'], silk: ['silk', '絲', '終', '系'], sick: ['ill', '病', '疾', '痛'],
  return: ['return home', '歸', '帰', '婦'], heaven: ['heaven', '天', '夫', '大'], well: ['well (in health)', '好', '如', '妃'],
};
const LETTERS = [
  { to: 'a son serving in the army', text: 'To my son with the army in Ji: your mother is well and the millet harvest was good. Come home safe.', words: ['son', 'army', 'mother', 'millet', 'home'] },
  { to: 'a merchant in the east', text: 'To Merchant Wang in the east: the cart and two horses will reach you next month, with six bolts of silk.', words: ['east', 'cart', 'horse', 'moon', 'silk'] },
  { to: 'a brother in the south', text: 'To my elder brother in the south: father is gravely ill. Return home at once.', words: ['south', 'father', 'sick', 'return', 'home'] },
  { to: 'a landlord', text: 'To the landlord: the river flooded our field. We beg Heaven, and you, for another month to pay.', words: ['river', 'field', 'heaven', 'moon', 'money'] },
  { to: 'a daughter married far away', text: 'To my daughter beyond the mountains: we are well. Your mother sends silk for the new child.', words: ['mountain', 'well', 'mother', 'silk'] },
];

const ROOSTERS = [
  { name: 'Red Plume', cn: '赤羽', color: 0x9a2a12 }, { name: 'Black Iron', cn: '鐵烏', color: 0x1a1a1a },
  { name: 'Golden Spur', cn: '金距', color: 0xb07a2a }, { name: 'White Crane', cn: '白鶴', color: 0xd8d0c0 },
  { name: 'Thunder', cn: '霹靂', color: 0x5a3a2a }, { name: 'Jade Comb', cn: '玉冠', color: 0x6a4a22 },
];

export class Activities {
  constructor(life) {
    this.life = life;
    this.g = life.g;
    this.targets = [];
    this.cocks = [];
    this.job = null;
    this.range = null;
    this.fishing = null;
    this.granary = null;
    this.flying = [];
  }

  station(id, x, z, r, label, act, data = {}) {
    const it = { id, x, z, r, label, kind: 'life', act, data };
    this.g.world.interactables.push(it);
    return it;
  }

  // ---- props and stations --------------------------------------------------------
  woodpile(x, z, id) {
    const B = new Batch(); B.frame(x, this.g.world.groundHeight(x, z), z, 0); firewood(B);
    const grp = new THREE.Group(); B.build(grp); this.life.group.add(grp);
    this.g.world.colliders.addBox(x, z, 0.9, 0.7, 0, { kind: 'prop' });
    const bx = x + 1.6, bz = z + 1.2;
    this.life.place(PROPS.block(), bx, bz, 0, 0.35);
    const logs = [];
    for (let i = 0; i < 2; i++) { const l = this.life.place(PROPS.log(), bx, bz, 0); l.position.y += 0.45; l.rotation.z = 0; l.visible = i === 0; logs.push(l); }
    this.station(id, bx, bz + 0.9, 1.6, 'Split firewood — paid work', 'chop', { x: bx, z: bz });
  }

  shrine(x, z, id) {
    const B = new Batch(); B.frame(x, this.g.world.groundHeight(x, z), z, 0);
    B.box('stone', 0, 0, 0, 2.2, 0.5, 1.6);
    B.box('brick', 0, 0.5, -0.2, 1.8, 1.1, 1.1);
    for (const s of [-0.8, 0.8]) B.cyl('lacquer', s, 0.5, 0.4, 0.07, 1.3, { seg: 8 });
    B.roof('roofTile', 0, 1.75, 0, 2.2, 1.6, 0.6, { type: 'hip', overhang: 0.35, lift: 0.18 });
    B.box('dark', 0, 0.8, 0.36, 0.7, 0.6, 0.06);
    B.cyl('bronze', 0, 0.5, 0.95, 0.22, 0.25, { r2: 0.28, seg: 12, color: 0x7a5a30 });
    const grp = new THREE.Group(); B.build(grp); this.life.group.add(grp);
    this.g.world.colliders.addBox(x, z, 1.2, 0.9, 0, { kind: 'wall' });
    // incense smoke
    const smoke = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 1.4), new THREE.MeshBasicMaterial({ color: 0xd8d0c8, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    smoke.position.set(x, this.g.world.groundHeight(x, z) + 1.5, z + 0.95);
    this.life.group.add(smoke);
    this.life.anims.push((t) => { smoke.rotation.y = t * 0.6; smoke.material.opacity = 0.18 + 0.08 * Math.sin(t * 1.3); smoke.scale.x = 1 + 0.3 * Math.sin(t * 2.1); });
    this.station(id, x, z + 1.9, 1.8, 'Pray at the Earth God shrine 土地廟', 'shrine');
  }

  touhu(x, z, id) {
    const pot = this.life.place(PROPS.pot(), x, z, 0, 0.3);
    this.station(id, x, z + 2.6, 1.6, 'Play touhu 投壺 (pitch-pot)', 'touhu', { pot });
  }

  cockpit(x, z, id) {
    this.life.place(PROPS.ring(2.2), x, z, 0);
    this.g.world.colliders.addCircle(x, z, 2.4, { kind: 'prop' });
    const pair = [0, 1].map((i) => {
      const r = PROPS.rooster(ROOSTERS[i].color);
      this.life.place(r, x + (i ? 0.9 : -0.9), z, i ? -Math.PI / 2 : Math.PI / 2);
      return r;
    });
    this.cocks.push({ x, z, pair, fight: null, home: [[x - 0.9, z], [x + 0.9, z]] });
    const L = this.life;
    for (let i = 0; i < 2; i++) {
      const a = i ? 0.3 : Math.PI + 0.3, px = x + Math.cos(a) * 3.2, pz = z + Math.sin(a) * 3.2;
      const o = L.npc('cockman', 'farmer', px, pz, L.day(9, 19, px, pz, 'stand', { rot: Math.atan2(x - px, z - pz) }));
      o.title = 'cock-fighter';
    }
    for (let i = 0; i < 3; i++) {
      const a = 1.2 + i * 0.7, px = x + Math.cos(a) * 3.4, pz = z + Math.sin(a) * 3.4;
      L.npc('townsman', i === 1 ? 'merchant' : 'farmer', px, pz, L.day(11, 18, px, pz, 'cheer', { rot: Math.atan2(x - px, z - pz) }));
    }
    this.station(id, x, z - 3.2, 2.2, 'Bet on the cockfight 鬥雞', 'cockfight', { pit: this.cocks[this.cocks.length - 1] });
  }

  archeryRange(x, z, rot, id) {
    const g = this.g;
    if (!this.life.clear(x, z, 0.6)) return;
    const fx = Math.sin(rot), fz = Math.cos(rot);
    const list = [];
    for (const [d, side, mul] of [[12, -2.5, 1], [20, 0.5, 1.4], [30, 3, 2]]) {
      const tx = x + fx * d + fz * side, tz = z + fz * d - fx * side;
      if (g.world.hf.waterAt(tx, tz) !== null) continue;
      const t = PROPS.target();
      this.life.place(t, tx, tz, rot + Math.PI, 0.5);
      const c = new THREE.Vector3(tx, g.world.groundHeight(tx, tz) + 1.45, tz);
      const tg = { center: c, normal: new THREE.Vector3(-fx, 0, -fz), r: 0.62, mul, range: id };
      list.push(tg); this.targets.push(tg);
    }
    g.combat.archery.targets = this.targets;
    this.station(id, x, z, 1.6, 'Archery practice at the butts 射侯', 'range', { x, z, rot, targets: list });
  }

  horseLine(x, z, dealer) {
    const g = this.g;
    const coats = [['bay', 900], ['chestnut', 1000], ['grey', 1300], ['black', 1500]];
    const B = new Batch(); B.frame(x, g.world.groundHeight(x, z), z, 0);
    B.box('darkwood', 0, 0, -3.5, 0.15, 1.1, 0.15); B.box('darkwood', 0, 0, 5, 0.15, 1.1, 0.15); B.box('darkwood', 0, 1.0, 0.75, 0.12, 0.1, 8.6);
    const grp = new THREE.Group(); B.build(grp); this.life.group.add(grp);
    dealer.forSale = coats.map(([coat, price], i) => {
      const h = g.riding.spawn({ coat, name: `${coat[0].toUpperCase()}${coat.slice(1)} horse`, x: x + 1.6, z: z - 2.5 + i * 2.3, yaw: Math.PI / 2 });
      h.owner = 'dealer'; h.price = price;
      return h;
    });
  }

  dynamic() {
    const g = this.g, p = g.player, out = [];
    if (this.job?.kind === 'haul') {
      const j = this.job, G = this.granary;
      if (!j.carrying) out.push({ id: 'job_pick', x: G.cart.x, z: G.cart.z, r: 2.4, label: 'Shoulder a sack of grain', kind: 'life', act: 'pickSack' });
      else out.push({ id: 'job_drop', x: G.door.x, z: G.door.z, r: 2.4, label: 'Stack the sack in the granary', kind: 'life', act: 'dropSack' });
    }
    // fishing at the water's edge
    if (p.inventory.has('fishingRod') && !p.riding && !p.combat.drawn && !this.fishing && !this.job?.carrying) {
      const hf = g.world.hf;
      if (hf.waterAt(p.pos.x, p.pos.z) === null) {
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
        for (const d of [1.5, 2.5, 3.5]) if (hf.waterAt(p.pos.x + fx * d, p.pos.z + fz * d) !== null) { out.push({ id: 'fish', x: p.pos.x, z: p.pos.z, r: 2, label: 'Cast your line 垂釣', kind: 'life', act: 'fish' }); break; }
      }
    }
    return out;
  }

  // ---- conversations with townsfolk who offer something ---------------------------
  async talk(c) {
    const g = this.g, st = g.story, p = g.player;
    const role = c.role;
    const day = g.time.year * 400 + g.time.month * 31 + g.time.day;
    const m = c.mem || (c.mem = {});
    const opts = (list) => list.filter(Boolean);
    if (role === 'performer' || role === 'storyteller') {
      g.dialogue.begin();
      const r = await st.choose(c.id, role === 'storyteller' ? 'Sit, sit! Three coins for a tale — tales of heroes, of beauties, of ghosts!' : c.title === 'qin player' ? '(He plays on without looking up. The melody is “Flowing Water”.)' : 'Hup! Hai! Coins for the acrobat, kind people!', opts([
        role === 'storyteller' && { t: 'Tell me a tale. (3 coins)', v: 'tale', if: () => p.inventory.coins >= 3 },
        { t: 'Toss a few coins. (5 coins)', v: 'tip', if: () => p.inventory.coins >= 5 },
        { t: 'Move on.', v: 0 },
      ]));
      if (r === 'tale') {
        p.inventory.coins -= 3; c.inventory.coins += 3;
        const tale = TALES[(m.tales = (m.tales ?? Math.floor(Math.random() * TALES.length)) + 1) % TALES.length];
        await st.say(c.id, `Today: ${tale.title}!`);
        for (const l of tale.lines) await st.say(c.id, l);
        g.progression.gain('speech', 0.5);
      } else if (r === 'tip') {
        p.inventory.coins -= 5; c.inventory.coins += 5; g.audio.play('coins');
        await st.say(c.id, pick(BARKS.tip));
        g.progression.addVirtue(0.3, '', true); g.progression.addRenown(0.1);
      }
      g.dialogue.end();
      return true;
    }
    if (role === 'beggar') {
      g.dialogue.begin();
      const r = await st.choose(c.id, pick(BARKS.greet.beggar), [
        { t: 'Give alms. (2 coins)', v: 'alms', if: () => p.inventory.coins >= 2 },
        { t: 'You hear things on the street. Any news?', v: 'news' },
        { t: 'Away with you.', v: 0 },
      ]);
      if (r === 'alms') {
        p.inventory.coins -= 2; g.audio.play('coins');
        await st.say(c.id, pick(BARKS.alms));
        if (m.alms !== day) { m.alms = day; g.progression.addVirtue(1, 'charity'); }
      } else if (r === 'news') await st.say(c.id, this.rumour());
      g.dialogue.end();
      return true;
    }
    if (role === 'strongman') {
      g.dialogue.begin();
      const r = await st.choose(c.id, `Ha! You have arms like reeds. ${c.name} has never lost at the wrist — care to try? Twenty coins says you can't move me.`, [
        { t: 'Arm-wrestle him. (Bet 20)', v: 20, if: () => p.inventory.coins >= 20, tag: `Strength ${p.stats.str}` },
        { t: 'Not today.', v: 0 },
      ]);
      g.dialogue.end();
      if (r) await this.armWrestle(c, r);
      return true;
    }
    if (role === 'barber') { await this.barber(c); return true; }
    if (role === 'scribe') { await this.scribe(c); return true; }
    if (role === 'horsedealer') { await this.horseDealer(c); return true; }
    if (role === 'foreman') { await this.foreman(c); return true; }
    if (role === 'cockman') {
      g.dialogue.begin();
      await st.say(c.id, pick(['My bird has the heart of a tiger and the spurs of a dragon!', 'Bet on the pit, friend — the next bout starts soon.', 'Fed him on millet soaked in wine. Fierce as Xiang Yu, he is.']));
      g.dialogue.end();
      return true;
    }
    if (c.shop === 'tailor') {
      g.dialogue.begin();
      const r = await st.choose(c.id, 'Silk, hemp, ramie — and dyes from three provinces. What will it be?', [
        { t: 'Let me see your wares.', v: 'shop' },
        { t: 'Make me a new robe. (150 coins)', v: 'robe', if: () => p.inventory.coins >= 150 },
        { t: 'Nothing today.', v: 0 },
      ]);
      g.dialogue.end();
      if (r === 'shop') g.ui.openShop(c);
      if (r === 'robe') await this.tailor(c);
      return true;
    }
    return false;
  }

  rumour() {
    const g = this.g, R = g.world.region;
    const camps = R.settlements.filter((s) => s.type === 'banditCamp' && !g.flags[`cleared_${s.id}`]);
    const list = [
      camps.length && `Bandits hide out at ${camps[0].name}. The county pays a bounty — read the notice board.`,
      'The river bends below the town. Old Wu catches mandarin fish there — the ones the poets sing of.',
      'Deer come down to the forest edges at dawn and dusk. A good bow and a quiet step, that\'s all you need.',
      'The strongman in the tavern cheats — he braces his foot on the table leg. Ha!',
      'The magistrate\'s clerk takes bribes. Everyone knows. Two coins for me, and you know it too.',
      'They say a golden carp lives in this river. Catch it and you\'ll never be poor again.',
      'Guards at night are lazy. A man who goes softly can do as he likes after the curfew drum.',
    ].filter(Boolean);
    return list[Math.floor(Math.random() * list.length)];
  }

  taleLines() {
    const t = TALES[Math.floor(this.g.clockTime / 120) % TALES.length];
    return t.lines.map((l) => l.length > 120 ? l.slice(0, l.indexOf(' ', 100)) + '…' : l);
  }

  // ---- stations ------------------------------------------------------------------
  async interact(it) {
    switch (it.act) {
      case 'touhu': return this.playTouhu(it);
      case 'cockfight': return this.cockfight(it);
      case 'chop': return this.chopWood(it);
      case 'shrine': return this.pray(it);
      case 'range': return this.archery(it);
      case 'fish': return this.fish(it);
      case 'pickSack': return this.pickSack();
      case 'dropSack': return this.dropSack();
      case 'skin': return this.g.wildlife.skin(it.data.a);
      case 'race': return this.race(it);
      default: return false;
    }
  }

  opponent() {
    const g = this.g;
    const n = g.entities.nearby(g.player.pos, 10).find((c) => c !== g.player && c.faction === 'civilian' && !c.shop && !c.dead && c.role !== 'child');
    return n ? n.name : 'a tavern regular';
  }

  async playTouhu(it) {
    const g = this.g, p = g.player, mg = g.minigames;
    const m = mg.open('Touhu — pitching arrows into the pot', '投壺', 'Two strokes for each arrow: stop the needle in the gold for <b>aim</b>, then for <b>strength</b>. Pitch into the ear of the pot for double.');
    const foe = this.opponent();
    const bet = await mg.choose(m, [
      { t: 'Play for fun', v: -1 }, { t: 'Bet 10 coins', v: 10, disabled: p.inventory.coins < 10 }, { t: 'Bet 40 coins', v: 40, disabled: p.inventory.coins < 40 }, { t: 'Walk away', v: 0 },
    ]);
    if (!bet) { mg.close(m); return true; }
    const pot = it.data.pot.position;
    p.faceYaw = null; p.yaw = Math.atan2(pot.x - p.pos.x, pot.z - p.pos.z);
    const score = mg.text(m, '');
    let me = 0, him = 0;
    const skill = 0.45 + Math.random() * 0.3 - (p.buffs?.blessed > g.clockTime ? 0.05 : 0);
    for (let i = 0; i < 4; i++) {
      score.innerHTML = `Arrow ${i + 1} of 4 · <b>You ${me}</b> — ${foe} ${him}`;
      const a1 = await mg.meter(m, { label: 'Aim — press SPACE', zone: 0.2, speed: 1.25 });
      const a2 = await mg.meter(m, { label: 'Strength — press SPACE', zone: 0.22, speed: 1.6 });
      const inPot = a1 > 0 && a2 > 0, ear = a1 > 0.72 && a2 > 0.72;
      p.model.anim.play('talk_once', { speed: 1.6 });
      this.pitch(p.pos, pot, inPot, (a1 > 0 ? 0 : 0.6) + (a2 > 0 ? 0 : 0.4));
      g.audio.play(inPot ? 'block' : 'arrowGround', pot);
      me += ear ? 2 : inPot ? 1 : 0;
      score.innerHTML = `${ear ? 'Through the ear! 貫耳 — two points!' : inPot ? 'In the pot!' : 'A miss.'} · <b>You ${me}</b> — ${foe} ${him}`;
      await mg.wait(900);
      const r = Math.random();
      const hisPts = r < skill * 0.35 ? 2 : r < skill ? 1 : 0;
      him += hisPts;
      this.pitch({ x: pot.x + 2.4, y: pot.y, z: pot.z + 1.2 }, pot, hisPts > 0, 0.5);
      score.innerHTML = `${foe}: ${hisPts === 2 ? 'through the ear!' : hisPts ? 'in!' : 'misses.'} · <b>You ${me}</b> — ${foe} ${him}`;
      await mg.wait(900);
    }
    const res = me > him ? 'win' : me < him ? 'lose' : 'draw';
    if (bet > 0 && res === 'win') { p.inventory.coins += bet; g.audio.play('coins'); }
    if (bet > 0 && res === 'lose') p.inventory.coins -= bet;
    score.innerHTML = `<b>${res === 'win' ? 'You win' : res === 'lose' ? `${foe} wins` : 'A draw'}</b>, ${me} to ${him}.${bet > 0 && res !== 'draw' ? ` ${res === 'win' ? '+' : '−'}${bet} coins.` : ''}`;
    g.progression.gain('agi', 0.4);
    await mg.choose(m, [{ t: 'Done', v: 1 }]);
    mg.close(m);
    return true;
  }

  pitch(from, pot, inPot, miss) {
    const a = PROPS.arrow();
    this.life.group.add(a);
    const s = new THREE.Vector3(from.x, (from.y ?? pot.y) + 1.3, from.z);
    const e = new THREE.Vector3(pot.x + (inPot ? 0 : (Math.random() - 0.5) * 1.2 * (0.6 + miss)), pot.y + (inPot ? 0.62 : 0.05), pot.z + (inPot ? 0 : (Math.random() - 0.5) * 1.2));
    const t0 = this.g.clockTime;
    this.flying.push({ a, s, e, t0, dur: 0.7, until: t0 + 25 });
  }

  async armWrestle(c, bet) {
    const g = this.g, p = g.player, mg = g.minigames;
    const m = mg.open(`Arm-wrestling ${c.name}`, '角力', 'Hammer SPACE to drive his wrist down. He tires — but so do you.');
    const win = await mg.tug(m, { label: 'Tap SPACE as fast as you can!', foe: 0.55 + Math.random() * 0.15, you: Math.min(1, p.stats.str / 18), secs: 14 });
    if (win) { p.inventory.coins += bet; c.inventory.coins = Math.max(0, c.inventory.coins - bet); g.audio.play('coins'); g.progression.gain('str', 2); g.progression.addRenown(0.4); }
    else p.inventory.coins -= bet;
    mg.text(m, win ? `<b>${c.name}'s wrist slams onto the table!</b> The tavern roars. +${bet} coins.` : `<b>${c.name} pins you</b> and laughs. −${bet} coins.`);
    g.barks.say(c, win ? pick(['Aiya! My arm!', 'Again! Tomorrow! …Maybe next month.', 'Heaven, what do you eat?']) : pick(['Ha! Reeds, I said!', 'Come back when you\'ve carried millstones.', 'Next!']), 3);
    await mg.choose(m, [{ t: 'Done', v: 1 }]);
    mg.close(m);
  }

  async cockfight(it) {
    const g = this.g, p = g.player, mg = g.minigames, pit = it.data.pit;
    if (pit.fight) return true;
    const [ia, ib] = [Math.floor(Math.random() * ROOSTERS.length), 0].map((v, k) => (k ? (v + 1 + Math.floor(Math.random() * (ROOSTERS.length - 1))) % ROOSTERS.length : v));
    const A = { ...ROOSTERS[ia], hp: 100, pow: 7 + Math.random() * 5, spd: 0.8 + Math.random() * 0.5 };
    const Bc = { ...ROOSTERS[ib === ia ? (ia + 1) % ROOSTERS.length : ib], hp: 100, pow: 7 + Math.random() * 5, spd: 0.8 + Math.random() * 0.5 };
    pit.pair[0].traverse((o) => { if (o.isMesh && o.material.color && o.material.roughness === 0.75) o.material.color.setHex(A.color); });
    pit.pair[1].traverse((o) => { if (o.isMesh && o.material.color && o.material.roughness === 0.75) o.material.color.setHex(Bc.color); });
    const sA = A.pow * A.spd, sB = Bc.pow * Bc.spd;
    const oddsA = Math.max(1.2, Math.min(3.5, 2 * sB / (sA + sB) + 0.6)), oddsB = Math.max(1.2, Math.min(3.5, 2 * sA / (sA + sB) + 0.6));
    const desc = (r) => `${r.cn} ${r.name} — ${(3.2 + r.pow * 0.18).toFixed(1)} jin, ${r.spd > 1.1 ? 'quick' : r.spd > 0.95 ? 'steady' : 'slow'}, ${r.pow > 10 ? 'fierce spurs' : 'light spurs'}`;
    const m = mg.open('The cockpit', '鬥雞', `Left: ${desc(A)} · odds ${oddsA.toFixed(1)}<br>Right: ${desc(Bc)} · odds ${oddsB.toFixed(1)}`);
    const side = await mg.choose(m, [{ t: `Back ${A.cn} ${A.name}`, v: 'A' }, { t: `Back ${Bc.cn} ${Bc.name}`, v: 'B' }, { t: 'Just watch', v: 'W' }, { t: 'Leave', v: 0 }]);
    if (!side) { mg.close(m); return true; }
    let bet = 0;
    if (side !== 'W') bet = await mg.choose(m, [{ t: '10 coins', v: 10, disabled: p.inventory.coins < 10 }, { t: '30 coins', v: 30, disabled: p.inventory.coins < 30 }, { t: '100 coins', v: 100, disabled: p.inventory.coins < 100 }, { t: 'Never mind', v: 0 }]);
    if (side !== 'W' && !bet) { mg.close(m); return true; }
    p.inventory.coins -= bet;
    const log = mg.text(m, 'The handlers release the birds…');
    const bars = mg.text(m, '');
    pit.fight = { A, B: Bc, t: 0, hop: [0, 0], peck: [0, 0] };
    g.audio.play('cheer', pit.pair[0].position);
    const luck = p.buffs?.blessed > g.clockTime ? 0.06 : 0;
    while (A.hp > 0 && Bc.hp > 0) {
      await mg.wait(650 + Math.random() * 500);
      const aFirst = Math.random() < A.spd / (A.spd + Bc.spd);
      const [atk, def, k] = aFirst ? [A, Bc, 0] : [Bc, A, 1];
      const crit = Math.random() < 0.18 + (side === (k ? 'B' : 'A') ? luck : 0);
      const dmg = atk.pow * (0.6 + Math.random() * 0.8) * (crit ? 2 : 1);
      def.hp = Math.max(0, def.hp - dmg);
      pit.fight.peck[k] = 0.4; pit.fight.hop[1 - k] = 0.3;
      g.combat.sparks.burst(pit.pair[1 - k].position.clone().setY(pit.pair[1 - k].position.y + 0.4), crit ? 10 : 4, 0.25);
      log.innerHTML = crit ? `<b>${atk.cn} ${atk.name}</b> strikes with both spurs — feathers fly!` : `${atk.cn} ${atk.name} lands a blow.`;
      bars.innerHTML = `${A.cn} ${'▮'.repeat(Math.ceil(A.hp / 10))}${'▯'.repeat(10 - Math.ceil(A.hp / 10))} &nbsp; ${Bc.cn} ${'▮'.repeat(Math.ceil(Bc.hp / 10))}${'▯'.repeat(10 - Math.ceil(Bc.hp / 10))}`;
    }
    const winner = A.hp > 0 ? 'A' : 'B', W = winner === 'A' ? A : Bc;
    pit.fight = null;
    let msg = `<b>${W.cn} ${W.name} wins!</b> The loser's handler scoops up his bird.`;
    if (bet && side === winner) { const pay = Math.round(bet * (winner === 'A' ? oddsA : oddsB)); p.inventory.coins += pay; g.audio.play('coins'); msg += ` You collect ${pay} coins.`; }
    else if (bet) msg += ` Your ${bet} coins are gone.`;
    log.innerHTML = msg;
    g.audio.play('cheer', pit.pair[0].position);
    await mg.choose(m, [{ t: 'Done', v: 1 }]);
    mg.close(m);
    return true;
  }

  async chopWood(it) {
    const g = this.g, p = g.player, mg = g.minigames;
    const { x, z } = it.data;
    p.pos.set(x, g.world.groundHeight(x, z + 0.9), z + 0.9); p.yaw = Math.PI; p.faceYaw = Math.PI;
    if (p.combat.drawn) p.draw(false);
    p.model.setProp('axe'); p.model.anim.setLoop('chop');
    const m = mg.open('Splitting firewood', '劈柴', 'Two coins a log from the innkeeper. Strike when the needle is in the gold.');
    const t = mg.text(m, '');
    let pay = 0, clean = 0;
    for (let i = 0; i < 6; i++) {
      t.innerHTML = `Log ${i + 1} of 6 · earned ${pay} coins`;
      const a = await mg.meter(m, { label: 'Swing — SPACE', zone: 0.24, speed: 1.35 });
      if (a > 0) { pay += a > 0.75 ? 3 : 2; if (a > 0.75) clean++; g.audio.play('thud', p.pos); }
      else g.audio.play('swing', p.pos);
    }
    p.model.anim.setLoop(null); p.model.setProp(null);
    p.inventory.coins += pay; g.audio.play('coins');
    g.time.addHours(1); p.stamina = Math.max(0, p.stamina - 30); p.food = Math.max(0, p.food - 4);
    g.progression.gain('str', 1 + clean * 0.3);
    t.innerHTML = `You split six logs${clean ? ` (${clean} clean through)` : ''}. <b>+${pay} coins.</b> An hour passes.`;
    await mg.choose(m, [{ t: 'Done', v: 1 }]);
    mg.close(m);
    return true;
  }

  async pray() {
    const g = this.g, p = g.player, st = g.story;
    g.dialogue.begin();
    const r = await st.choose({ name: 'Shrine of the Earth God', cn: '土地' }, 'A small shrine to the Lord of the Soil. Ashes of old incense; an offering of millet, pecked by sparrows.', [
      { t: 'Burn incense and pray. (3 coins)', v: 'pray', if: () => p.inventory.coins >= 3 || p.inventory.has('incense') },
      { t: 'Bow and go on your way.', v: 'bow' },
    ]);
    g.dialogue.end();
    if (r === 'pray') {
      if (p.inventory.has('incense')) p.inventory.remove('incense'); else p.inventory.coins -= 3;
      p.model.anim.setPose('kneel');
      await wait(1800);
      p.model.anim.setPose(null);
      (p.buffs = p.buffs || {}).blessed = g.clockTime + 900;
      g.progression.addVirtue(0.5, '', true);
      g.ui.notify('The Earth God\'s blessing: wounds mend a little, and luck favours you at games of chance.', 'virtue');
    } else p.model.anim.play('greet');
    return true;
  }

  async archery(it) {
    const g = this.g, p = g.player, st = g.story;
    if (this.range) return true;
    g.dialogue.begin();
    const r = await st.choose({ name: 'Range master', cn: '射官' }, 'Six arrows at the butts — near, middle and far. Score thirty and you win forty coins; twenty earns you fifteen. Entry is five coins.', [
      { t: 'Take the six arrows. (5 coins)', v: 1, if: () => p.inventory.coins >= 5 },
      { t: 'Not now.', v: 0 },
    ]);
    g.dialogue.end();
    if (!r) return true;
    p.inventory.coins -= 5;
    const { x, z, rot } = it.data;
    p.pos.set(x, g.world.groundHeight(x, z), z); p.yaw = rot; g.cameraCtl.yaw = rot;
    this.range = { it, shots: 0, score: 0, prevWeapon: p.equip.weapon, done: false };
    if (p.equip.weapon !== 'bow') p.setWeapon('bow');
    p.draw(true);
    g.ui.notify('Hold the left mouse button to draw, release to loose. Six arrows.', 'item');
    return true;
  }
  onArrowShot(owner) {
    if (this.range && owner === this.g.player) {
      this.range.shots++;
      if (this.range.shots >= 6) this.range.endAt = this.g.clockTime + 2.5;
    }
  }
  onTargetHit(tg, dist) {
    const g = this.g;
    const ring = dist / tg.r;
    const pts = ring < 0.12 ? 10 : ring < 0.3 ? 7 : ring < 0.53 ? 5 : ring < 0.77 ? 3 : 1;
    const got = Math.round(pts * tg.mul);
    g.audio.play('arrowHit', tg.center);
    if (this.range) { this.range.score += got; g.ui.notify(`${pts === 10 ? 'Bullseye! ' : ''}+${got} (score ${this.range.score})`, 'merit'); }
    g.progression.gain('archery', pts * 0.2);
  }
  endRange() {
    const g = this.g, p = g.player, R = this.range;
    this.range = null;
    const prize = R.score >= 30 ? 40 : R.score >= 20 ? 15 : 0;
    p.inventory.coins += prize;
    if (p.combat.drawn) p.draw(false);
    if (R.prevWeapon !== 'bow' && !p.inventory.has('bow')) p.setWeapon(R.prevWeapon);
    g.ui.notify(`Archery: ${R.score} points.${prize ? ` Prize: ${prize} coins.` : ' No prize this time.'}`, prize ? 'merit' : 'item');
    if (R.score >= 30) g.progression.addRenown(0.5);
  }

  // ---- horse racing outside the south gate ---------------------------------------------------
  raceCourse(town, id) {
    const g = this.g, hf = g.world.hf, R = g.world.region;
    const ok = (x, z) => hf.waterAt(x, z) === null && hf.slope(x, z) < 0.22 && Math.abs(x) < hf.half - 40 && Math.abs(z) < hf.half - 40 && !R.settlements.some((s) => Math.abs(s.x - x) < s.w / 2 + 6 && Math.abs(s.z - z) < s.d / 2 + 6);
    const clearPath = (a, b) => { for (let k = 1; k < 12; k++) { const x = a.x + (b.x - a.x) * k / 12, z = a.z + (b.z - a.z) * k / 12; if (!ok(x, z)) return false; } return true; };
    // try a ring of directions around the town walls until a clear, dry loop of six flags fits
    for (const rad of [80, 60, 100, 50]) for (let k = 0; k < 16; k++) {
      const rot = k * Math.PI / 8;
      const off = Math.max(town.w, town.d) / 2 + rad + 18;
      const cx = town.x + Math.sin(rot) * off, cz = town.z + Math.cos(rot) * off;
      const pts = [];
      for (let i = 0; i < 6; i++) { const a = rot + Math.PI + (i / 6) * Math.PI * 2; pts.push({ x: cx + Math.sin(a) * rad, z: cz + Math.cos(a) * rad }); }
      if (!pts.every((p) => ok(p.x, p.z)) || !pts.every((p, i) => clearPath(p, pts[(i + 1) % 6]))) continue;
      pts.forEach((p, i) => this.life.place(PROPS.flag(i === 0 ? 0xe8c040 : 0xb02818), p.x + 2, p.z, 0, 0.2));
      this.station(id, pts[0].x, pts[0].z, 5, 'Horse race 賽馬 — enter on horseback', 'race', { pts });
      return;
    }
  }
  async race(it) {
    const g = this.g, p = g.player, st = g.story, pts = it.data.pts;
    if (this.racing) return true;
    if (!g.riding.mount) { g.ui.notify('You must be on horseback to race.', 'item'); return true; }
    g.dialogue.begin();
    const r = await st.choose({ name: 'Race steward', cn: '賽官' }, 'Once around the six flags and back to the yellow banner. Twenty coins to enter; the winner takes a hundred.', [
      { t: 'Enter the race. (20 coins)', v: 1, if: () => p.inventory.coins >= 20 }, { t: 'Not today.', v: 0 },
    ]);
    g.dialogue.end();
    if (!r) return true;
    p.inventory.coins -= 20;
    const start = pts[0], next = pts[1], yaw = Math.atan2(next.x - start.x, next.z - start.z);
    const side = (k) => ({ x: start.x + Math.cos(yaw) * k * 3, z: start.z - Math.sin(yaw) * k * 3 });
    const me = g.riding.mount;
    Object.assign(me.pos, { ...side(0), y: g.world.groundHeight(start.x, start.z) }); me.yaw = yaw; me.speed = 0;
    const racers = [-1, 1].map((k, i) => {
      const s = side(k * 1.2);
      const h = g.riding.spawn({ coat: ['black', 'grey'][i], name: 'Race horse', x: s.x, z: s.z, yaw });
      h.owner = 'race';
      const rider = this.life.npc('rider', 'farmer', s.x, s.z, [{ from: 0, to: 24, x: s.x, z: s.z, act: 'idle' }]);
      rider.name = ['Ma Chao the Younger', 'Swift Li', 'Old Horse Gao'][Math.floor(Math.random() * 3)] + (i ? '' : ' of the north');
      rider.riding = h; h.rider = rider; rider.model.anim.setPose('ride');
      return { h, rider, idx: 1, skill: 0.9 + Math.random() * 0.08, done: false };
    });
    this.racing = { pts, racers, me: { idx: 1, done: false }, state: 'count', t: 0, finish: [], qid: `race_${Math.floor(g.clockTime)}` };
    const R = this.racing;
    g.quests.start({ id: R.qid, title: 'Horse Race', cn: '賽馬', desc: 'Ride around the six flags and back to the yellow banner.', objectives: [{ id: 'flags', text: 'Ride through the flags', count: pts.length, marker: () => pts[R.me.idx % pts.length] }], autoFinish: false });
    for (const [n, w] of [['三 Three', 0], ['二 Two', 1000], ['一 One', 2000], ['Ride! 馳!', 3000]]) setTimeout(() => g.ui.subtitle('Race steward', n, 1), w);
    setTimeout(() => { R.state = 'run'; g.audio.play('drum'); }, 3000);
    return true;
  }
  raceUpdate(dt) {
    const R = this.racing, g = this.g;
    if (!R) return;
    const me = g.riding.mount;
    const pts = R.pts, N = pts.length;
    if (R.state === 'count') { if (me) me.speed = 0; for (const o of R.racers) o.h.speed = 0; }
    for (const o of R.racers) {
      const h = o.h;
      if (R.state === 'run' && !o.done) {
        const tg = pts[o.idx % N];
        const want = Math.atan2(tg.x - h.pos.x, tg.z - h.pos.z);
        let da = want - h.yaw; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        h.drive(dt, 1, Math.max(-1, Math.min(1, da * 2.2)), Math.abs(da) < 0.9);
        h.speed = Math.min(h.speed, 11.5 * o.skill);
        if (Math.hypot(tg.x - h.pos.x, tg.z - h.pos.z) < 7) { o.idx++; if (o.idx > N) { o.done = true; R.finish.push(o.rider.name); } }
      } else if (o.done) h.drive(dt, 0, 0, false);
      // keep the rider in the saddle
      h.root.updateMatrixWorld(true);
      const v = h.saddleWorld(new THREE.Vector3());
      o.rider.pos.set(v.x, v.y - 0.93, v.z); o.rider.yaw = h.yaw;
      o.rider.model.root.position.copy(o.rider.pos); o.rider.model.root.rotation.y = h.yaw;
    }
    if (R.state === 'run' && !R.me.done && me) {
      const tg = pts[R.me.idx % N];
      if (Math.hypot(tg.x - me.pos.x, tg.z - me.pos.z) < 8) {
        R.me.idx++; g.quests.progress(R.qid, 'flags', 1); g.audio.play('tick');
        if (R.me.idx > N) { R.me.done = true; R.finish.push('you'); }
      }
    }
    if (R.state === 'run' && (R.me.done || !me)) {
      const place = R.finish.indexOf('you') + 1;
      if (place === 1) { g.player.inventory.coins += 100; g.audio.play('cheer'); g.progression.addRenown(1); g.ui.notify('You win the race! +100 coins.', 'merit'); }
      else g.ui.notify(me ? `You finish ${place === 2 ? 'second' : 'third'}. ${R.finish[0]} takes the prize.` : 'You left the race.', 'item');
      g.quests.finish(R.qid);
      R.state = 'over';
      setTimeout(() => { for (const o of R.racers) { this.g.entities.remove(o.rider); const hs = this.g.riding.horses; hs.splice(hs.indexOf(o.h), 1); o.h.root.parent?.remove(o.h.root); } this.racing = null; }, 15000);
    }
  }

  // ---- granary work: carry sacks from the cart into the store ----------------------
  async foreman(c) {
    const g = this.g, st = g.story;
    g.dialogue.begin();
    if (this.job) { await st.say(c.id, `${this.job.need - this.job.n} more sacks. Put your back into it!`); g.dialogue.end(); return; }
    const r = await st.choose(c.id, 'The tax grain has come in and my porters are drunk. Carry six sacks from the cart to the granary — four coins a sack.', [
      { t: 'I\'ll do it.', v: 1 }, { t: 'Find someone else.', v: 0 },
    ]);
    g.dialogue.end();
    if (!r) return;
    this.job = { kind: 'haul', n: 0, need: 6, carrying: false, id: `job_haul_${Math.floor(g.clockTime)}` };
    const G = this.granary, job = this.job;
    g.quests.start({ id: job.id, title: 'Granary Work', cn: '扛糧', desc: 'Carry six sacks of tax grain from the cart to the county granary.', objectives: [{ id: 'sacks', text: 'Carry sacks to the granary', count: 6, marker: () => (job.carrying ? G.door : G.cart) }], reward: { coins: 24 }, chronicle: 'You carried tax grain for the county granary.' });
  }
  pickSack() {
    const p = this.g.player;
    if (p.combat.drawn) p.draw(false);
    this.job.carrying = true;
    p.model.setProp('sack'); p.model.anim.setPose('carrySack');
    return true;
  }
  dropSack() {
    const g = this.g, p = g.player, j = this.job;
    j.carrying = false; j.n++;
    p.model.setProp(null); p.model.anim.setPose(null);
    g.audio.play('thud', p.pos);
    g.progression.gain('str', 0.6);
    g.quests.progress(j.id, 'sacks', 1);
    if (j.n >= j.need) { g.quests.finish(j.id); this.job = null; g.barks.say(this.granary.foreman, 'Good work. Come back when the next cart comes in.', 3); }
    return true;
  }

  // ---- the scribe's table: write letters for those who cannot ----------------------------
  async scribe(c) {
    const g = this.g, p = g.player, mg = g.minigames, st = g.story;
    g.dialogue.begin();
    const r = await st.choose(c.id, 'My eyes are failing and the queue is long. Can you write a fair hand? Five coins a letter — I pay for correct characters, not for blots.', [
      { t: 'Take a customer\'s letter.', v: 1, tag: `Speech ${p.stats.speech}` }, { t: 'Not today.', v: 0 },
    ]);
    g.dialogue.end();
    if (!r) return;
    const L = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    const m = mg.open('Writing a letter for ' + L.to, '代書', `“${L.text}”`);
    const words = L.words.slice().sort(() => Math.random() - 0.5).slice(0, 4);
    const status = mg.text(m, '');
    let right = 0;
    for (let i = 0; i < words.length; i++) {
      const [meaning, ok, ...wrong] = GLYPHS[words[i]];
      status.innerHTML = `Brush the character for <b>${meaning}</b>: (${i + 1} of ${words.length})`;
      const opts = [ok, ...wrong].sort(() => Math.random() - 0.5).map((ch) => ({ t: `<span style="font-family:'Ma Shan Zheng',serif;font-size:34px">${ch}</span>`, v: ch }));
      const pick = await mg.choose(m, opts);
      if (pick === ok) { right++; status.innerHTML = `<b>${ok}</b> — a fine stroke.`; } else status.innerHTML = `<b>${pick}</b>? The customer frowns: it should be <b>${ok}</b>.`;
      await mg.wait(900);
    }
    const pay = right === words.length ? 6 : right >= words.length - 1 ? 4 : right >= 2 ? 2 : 0;
    p.inventory.coins += pay; if (pay) g.audio.play('coins');
    g.progression.gain('speech', 0.5 + right * 0.2);
    g.time.addHours(0.5);
    status.innerHTML = `${right} of ${words.length} characters correct. ${pay ? `The customer pays <b>${pay} coins</b>.` : 'The customer takes his letter elsewhere.'}`;
    await mg.choose(m, [{ t: 'Done', v: 1 }]);
    mg.close(m);
  }

  // ---- services ----------------------------------------------------------------------
  async barber(c) {
    const g = this.g, st = g.story, p = g.player;
    g.dialogue.begin();
    const r = await st.choose(c.id, 'Sit, sit. A trim? A beard to make the ladies sigh? Ten coins.', [
      { t: 'Clean-shaven', v: 'none' }, { t: 'A little stubble', v: 'stubble' }, { t: 'A scholar\'s goatee', v: 'goatee' },
      { t: 'A short, full beard', v: 'short' }, { t: 'A long, flowing beard (like Guan Yu!)', v: 'long' }, { t: 'Never mind.', v: 0 },
    ].map((o) => ({ ...o, if: () => !o.v || p.inventory.coins >= 10 })));
    if (r) {
      p.inventory.coins -= 10; c.inventory.coins += 10;
      await g.ui.fade(1, 0.5);
      p.baseLook = { ...p.baseLook, beard: r, face: { ...(p.baseLook.face || {}), stubble: r === 'stubble' } };
      p.buildModel();
      g.time.addHours(0.5);
      await g.ui.fade(0, 0.6);
      await st.say(c.id, r === 'long' ? 'Magnificent! You look like the Lord Guan himself!' : 'There! Ten years younger.');
    }
    g.dialogue.end();
  }

  async tailor(c) {
    const g = this.g, st = g.story, p = g.player;
    const colours = [['Indigo', 0x2a3a5a], ['Madder red', 0x7a2a1e], ['Black silk', 0x1a1816], ['Ochre', 0x9a7a40], ['Jade green', 0x2f5a42], ['Undyed hemp', 0xb8a888]];
    const col = await st.choose(c.id, 'Which colour? Madder for courage, indigo for scholars, black for officials.', [...colours.map(([n, v]) => ({ t: n, v })), { t: 'Never mind.', v: -1 }]);
    if (col === -1) { g.dialogue.end(); return; }
    const cut = await st.choose(c.id, 'And the cut?', [{ t: 'A long scholar\'s robe (深衣)', v: 'robe' }, { t: 'A short working tunic (短褐)', v: 'peasant' }, { t: 'A merchant\'s wide-sleeved coat', v: 'merchant' }]);
    p.inventory.coins -= 150; c.inventory.coins += 150;
    await g.ui.fade(1, 0.5);
    p.baseLook = { ...p.baseLook, robe: col, outfit: cut, trim: cut === 'peasant' ? undefined : 0xc8b890 };
    p.buildModel();
    g.time.addHours(2);
    await g.ui.fade(0, 0.6);
    await st.say(c.id, 'Fits like it grew on you!');
    g.dialogue.end();
  }

  async horseDealer(c) {
    const g = this.g, st = g.story, p = g.player;
    const list = (c.forSale || []).filter((h) => h.owner === 'dealer');
    g.dialogue.begin();
    if (!list.length) { await st.say(c.id, 'Sold out! Come back next season.'); g.dialogue.end(); return; }
    const r = await st.choose(c.id, 'Horses from the northern pastures! No stirrups to coddle you — a real rider grips with his knees.', [
      ...list.map((h) => ({ t: `${h.name} — ${h.price} coins`, v: h, if: () => p.inventory.coins >= h.price })), { t: 'Just looking.', v: 0 },
    ]);
    if (r) {
      p.inventory.coins -= r.price; c.inventory.coins += r.price; g.audio.play('coins');
      const old = g.riding.playerHorse(); if (old) old.owner = null;
      r.owner = 'player'; r.name = `Your ${r.name.toLowerCase()}`;
      await st.say(c.id, 'A fine choice. Whistle for it (H) and it will come.');
    }
    g.dialogue.end();
  }

  async meal(c) {
    const g = this.g, p = g.player;
    if (p.inventory.coins < 12) return;
    p.inventory.coins -= 12; c.inventory.coins += 12;
    await g.ui.fade(1, 0.6);
    g.time.addHours(1);
    p.food = Math.min(100, p.food + 60); p.heal(20); p.stamina = p.staminaMax;
    (p.buffs = p.buffs || {}).fed = g.clockTime + 600;
    await g.ui.fade(0, 0.8);
    g.ui.notify('Millet, pickled greens, a bowl of mutton broth and warm wine. Well fed: stamina recovers faster.', 'virtue');
  }

  // ---- fishing -----------------------------------------------------------------------
  async fish() {
    const g = this.g, p = g.player, mg = g.minigames, hf = g.world.hf;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let bd = 3;
    for (let d = 3; d <= 9; d += 0.5) if (hf.waterAt(p.pos.x + fx * d, p.pos.z + fz * d) !== null) bd = d;
    const bx = p.pos.x + fx * bd, bz = p.pos.z + fz * bd, wy = hf.waterAt(bx, bz) ?? p.pos.y;
    p.faceYaw = p.yaw;
    p.model.setProp('rod'); p.model.anim.setPose('fish');
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc83a20, roughness: 0.5 }));
    bob.position.set(bx, wy, bz);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xe8e0d0, transparent: true, opacity: 0.6 }));
    this.life.group.add(bob, line);
    this.fishing = { bob, line, wy, dip: 0 };
    g.audio.play('splash', bob.position);
    const m = mg.open('Fishing', '垂釣', 'Watch the float. When it dips, strike — press SPACE at once!');
    let again = true;
    while (again) {
      const status = mg.text(m, 'Waiting for a bite…');
      const waitMs = 2500 + Math.random() * 9000 * (g.time.hour > 5 && g.time.hour < 9 || g.time.hour > 16 && g.time.hour < 20 ? 0.6 : 1);
      const cancel = mg.choose(m, [{ t: 'Reel in and stop', v: 'stop' }]);
      const r = await Promise.race([mg.wait(waitMs).then(() => 'bite'), cancel]);
      m.body.querySelector('.mg-choices')?.remove();
      if (r === 'stop') { status.remove(); break; }
      this.fishing.dip = 1;
      g.audio.play('splash', bob.position);
      status.innerHTML = '<b>A bite! Strike — SPACE!</b>';
      const struck = await Promise.race([mg.press(m).then(() => true), mg.wait(1100).then(() => false)]);
      this.fishing.dip = 0;
      if (!struck) { status.innerHTML = 'Too slow — the fish stole your bait.'; }
      else {
        const roll = Math.random() + (p.buffs?.blessed > g.clockTime ? 0.03 : 0);
        const kind = roll > 0.985 ? 'goldenCarp' : roll > 0.88 ? 'mandarinFish' : roll > 0.7 ? 'catfish' : roll > 0.4 ? 'carp' : 'crucian';
        const fight = { crucian: 0.2, carp: 0.45, catfish: 0.6, mandarinFish: 0.7, goldenCarp: 0.95 }[kind];
        status.innerHTML = 'Hooked! Bring it in…';
        const res = await mg.reel(m, { fight });
        if (res === 'caught') { p.inventory.add(kind); status.innerHTML = `<b>You land a ${itemDef(kind).name} ${itemDef(kind).cn}!</b>`; g.progression.gain('agi', 0.3); if (kind === 'goldenCarp') g.progression.addRenown(1); }
        else status.innerHTML = 'Snap! The line breaks and the fish is gone.';
        g.time.addHours(0.25);
      }
      again = (await mg.choose(m, [{ t: 'Cast again', v: 1 }, { t: 'Stop fishing', v: 0 }])) === 1;
      status.remove();
    }
    mg.close(m);
    this.life.group.remove(bob, line);
    this.fishing = null;
    p.model.setProp(null); p.model.anim.setPose(null); p.faceYaw = null;
    return true;
  }

  // ---- per frame -------------------------------------------------------------------
  update(dt) {
    const g = this.g, t = g.clockTime, p = g.player;
    // cock idle pecking and the fight itself
    for (const pit of this.cocks) {
      pit.pair.forEach((r, k) => {
        const u = r.userData, f = pit.fight;
        const [hx, hz] = pit.home[k];
        if (f) {
          f.peck[k] = Math.max(0, f.peck[k] - dt); f.hop[k] = Math.max(0, f.hop[k] - dt);
          const lunge = f.peck[k] > 0 ? Math.sin((f.peck[k] / 0.4) * Math.PI) * 0.6 : 0;
          r.position.x = hx + (k ? -1 : 1) * (0.35 + lunge) + Math.sin(t * 9 + k) * 0.05;
          r.position.y = g.world.groundHeight(hx, hz) + Math.max(0, Math.sin((f.hop[k] / 0.3) * Math.PI)) * 0.35 + (f.peck[k] > 0 ? 0.15 : 0);
          u.neck.rotation.x = 0.6 * lunge + 0.2;
          u.tail.rotation.x = -0.3 + Math.sin(t * 12) * 0.1;
        } else {
          r.position.x += (hx - r.position.x) * Math.min(1, dt * 3);
          r.position.y = g.world.groundHeight(hx, hz);
          const pk = Math.max(0, Math.sin(t * 1.7 + k * 2.1)) ** 6;
          u.neck.rotation.x = pk * 1.1;
          u.tail.rotation.x = Math.sin(t * 2 + k) * 0.05;
        }
      });
    }
    // touhu arrows in flight
    this.flying = this.flying.filter((f) => {
      const u = Math.min(1, (t - f.t0) / f.dur);
      f.a.position.lerpVectors(f.s, f.e, u); f.a.position.y += Math.sin(u * Math.PI) * 1.2;
      f.a.rotation.set(u < 1 ? -1.2 + u * 1.9 : 0.08, 0, 0);
      if (t > f.until) { this.life.group.remove(f.a); return false; }
      return true;
    });
    // fishing float and line
    if (this.fishing) {
      const F = this.fishing;
      F.bob.position.y = F.wy + Math.sin(t * 2.2) * 0.02 - (F.dip ? 0.08 + Math.sin(t * 25) * 0.03 : 0);
      const tip = new THREE.Vector3(0, 3.55, 0);
      if (p.model.propMesh) { p.model.propMesh.updateMatrixWorld(true); tip.applyMatrix4(p.model.propMesh.matrixWorld); }
      const pos = F.line.geometry.attributes.position;
      pos.setXYZ(0, tip.x, tip.y, tip.z); pos.setXYZ(1, F.bob.position.x, F.bob.position.y, F.bob.position.z); pos.needsUpdate = true;
    }
    // archery session
    if (this.range) {
      const R = this.range;
      if (R.endAt && t > R.endAt) this.endRange();
      else if (Math.hypot(p.pos.x - R.it.data.x, p.pos.z - R.it.data.z) > 10) this.endRange();
    }
    this.raceUpdate(dt);
    // carrying a sack: slow and unarmed
    if (this.job?.carrying) { if (p.combat.drawn) p.draw(false); p.speedMul = 0.6; }
    else if (p.speedMul === 0.6) p.speedMul = 1;
  }
}
