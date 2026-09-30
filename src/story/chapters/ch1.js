// Chapter I · 黃天當立 — The Yellow Sky Shall Rise (Zhuo Commandery, 184 AD)
// Follows chapter 1 of the Romance of the Three Kingdoms and Liu Bei's biography in the
// Records of the Three Kingdoms, seen through the eyes of a Lousang peasant.
import { wait } from '../../ui/UI.js';
import { Rng } from '../../core/Rng.js';
import { randomAppearance, FIGURES } from '../../entities/Humanoid.js';
import { Brain } from '../../entities/AI.js';
import { randomName } from '../../entities/Population.js';

const done = (g, q, o) => !!g.quests.get(q)?.objs.find((x) => x.id === o)?.done;
const alive = (list) => list.filter((c) => !c.dead && !c.ai?.surrendered && !c.ai?.fleeing);

function family(st, g) {
  const S = st.S;
  const home = S.playerHome;
  const mother = st.actor('mother', { name: 'Mother', cn: '母親', title: 'Madam Qin', faction: 'civilian', appearance: { ...randomAppearance('woman', new Rng(11)), height: 1.56, robe: 0x5a4a3a, hair: 0x2a2420, face: { wrinkles: true } }, x: home.x + 1.5, z: home.z + 2, brain: { mode: 'idle' } });
  const mei = st.actor('mei', { name: 'Qin Mei', cn: '秦梅', title: 'your younger sister', faction: 'civilian', appearance: { ...randomAppearance('woman', new Rng(12)), height: 1.48, robe: 0x7a4a4a, face: { smile: true } }, x: home.x - 2, z: home.z + 4, brain: { mode: 'wander' } });
  mei.ai.area = { x: home.x, z: home.z + 4, r: 5 };
  return { mother, mei };
}

function spawnFather(st, g, x, z) {
  return st.actor('father', { name: 'Father', cn: '父親', title: 'Qin Fu, tenant farmer', faction: 'civilian', appearance: { ...randomAppearance('farmer', new Rng(13)), height: 1.7, beard: 'grey', hair: 0x6a6660, face: { wrinkles: true, stern: true } }, x, z, weapon: 'fists', brain: { mode: 'idle' } });
}

function elderWang(st) {
  const S = st.S;
  const c = st.actor('elderWang', { name: 'Elder Wang', cn: '王老', title: 'Village head of Lousang', faction: 'civilian', appearance: randomAppearance('elder', new Rng(14)), x: S.mulberry.x, z: S.mulberry.z + 1.5, brain: { mode: 'idle' } });
  c.model.anim.setPose('seiza');
  return c;
}

function liuBei(st, x, z, extra = {}) {
  return st.actor('liuBei', { figure: 'liuBei', name: 'Liu Bei', cn: '劉備', title: 'Xuande 玄德', x, z, weapon: 'twinSwords', stats: { str: 12, agi: 13, vit: 14, blade: 14, block: 12 }, ...extra });
}
function guanYu(st, x, z, extra = {}) {
  return st.actor('guanYu', { figure: 'guanYu', name: 'Guan Yu', cn: '關羽', title: 'Yunchang 雲長', x, z, weapon: 'fists', stats: { str: 18, agi: 12, vit: 18, polearm: 18, block: 14 }, ...extra });
}
function zhangFei(st, x, z, extra = {}) {
  return st.actor('zhangFei', { figure: 'zhangFei', name: 'Zhang Fei', cn: '張飛', title: 'Yide 翼德', x, z, weapon: 'fists', stats: { str: 19, agi: 11, vit: 18, polearm: 17, block: 12 }, ...extra });
}

// ---------------------------------------------------------------------------
export const CHAPTER1 = {
  // ======================================================== 1. A Peasant's Lot
  m1_home: {
    chapter: 1,
    title: "A Peasant's Lot",
    async setup(st, g, o) {
      const S = st.S, R = g.world.region;
      st.setTime(7.2);
      if (!o.restore) st.teleportPlayer(S.playerHome.x + 0.5, S.playerHome.z + 1.2, 0);
      family(st, g);
      const f = R.fields[1];
      const father = spawnFather(st, g, f.x - 8, f.z);
      father.model.anim.setLoop('farm');
      father.setWeapon('hoe');
      father.draw(false);
      elderWang(st);
      const lb = liuBei(st, S.market.x - 16, S.market.z - 14, { weapon: 'fists', appearance: { ...FIGURES.liuBei, robe: 0x5a5a6a, headwear: 'wrap' } });
      lb.ai.mode = 'idle';
      lb.facePoint(S.market.x, S.market.z);
      lb.model.anim.setLoop('talk');
      // a little sandal stall for Liu Bei (mats on the ground)
      g.player.inventory.add('taxMillet', 1);
    },
    async run(st, g) {
      const S = st.S, R = g.world.region;
      const f = R.fields[1];
      const q = g.quests.start({
        id: 'q_home', main: true, title: "A Peasant's Lot", cn: '農家',
        desc: 'Another spring in Lousang. Help your family, pay what is owed, and bring home coins for salt.',
        objectives: [
          { id: 'mother', text: 'Speak with Mother', marker: () => g.entities.get('mother')?.pos },
          { id: 'field', text: 'Help Father hoe the millet field', marker: { x: f.x - 8, z: f.z } },
          { id: 'tax', text: 'Bring the tax millet to Elder Wang under the great mulberry', marker: { x: S.mulberry.x, z: S.mulberry.z + 1.5 } },
          { id: 'sell', text: 'Sell straw sandals at the Zhuo County market', count: 4, marker: { x: S.market.x, z: S.market.z } },
          { id: 'liubei', text: 'Find Liu Bei, who sells sandals by the market', marker: () => g.entities.get('liuBei')?.pos },
          { id: 'home', text: 'Return home to Lousang before nightfall', marker: { x: S.playerHome.x, z: S.playerHome.z } },
        ],
        reward: { merit: 0 },
        chronicle: 'Worked the millet fields of Lousang and sold sandals in Zhuo, where you met Liu Bei.',
      });
      let sold = 0;
      const off = g.events.on('sold', (id) => { if (id === 'sandals') { sold++; g.quests.progress('q_home', 'sell', 1); } });

      st.talkHandlers.set('mother', async () => {
        g.dialogue.begin();
        if (!done(g, 'q_home', 'mother')) {
          await st.say('mother', 'You slept like a stone, {name}. Your father has been in the field since the cock crowed.');
          await st.say('mother', 'Take the tax millet to Elder Wang — the county clerk comes for it before the new moon. And take the sandals Mei and I wove to the market in Zhuo. We need coin for salt.');
          const r = await st.choose('player', 'Anything else, Mother?', [
            { t: 'I will be home before dark.', v: 0 },
            { t: 'Why must we pay the tax when the harvest failed?', v: 1 },
          ]);
          if (r === 1) await st.say('mother', 'Hush. The walls of Zhuo have ears, and the clerk has a whip. We pay, and we live. That is the way of things.');
          else await st.say('mother', 'Good boy. Keep away from the men with yellow cloth on their heads. Nothing good comes of them.');
          g.quests.complete('q_home', 'mother');
        } else {
          await st.say('mother', done(g, 'q_home', 'sell') ? 'Salt! Heaven be praised. Now wash your hands; supper is almost ready.' : 'The market in Zhuo lies east along the road. Mind the ditch by the old willow.');
        }
        g.dialogue.end();
        return true;
      });
      st.talkHandlers.set('mei', async () => {
        await st.convo([['mei', 'Brother! When you go to Zhuo, will you look at the silk stalls for me? Just look. I know we cannot buy anything.']]);
        return true;
      });
      st.talkHandlers.set('father', async (c) => {
        g.dialogue.begin();
        if (!done(g, 'q_home', 'field')) {
          await st.say('father', 'There you are. The ground is hard as a magistrate\'s heart. Take the hoe — the lord\'s steward will want his half of whatever grows.');
          const r = await st.choose('player', '', [{ t: 'Take the hoe and work beside him. (Pass three hours)', v: 1 }, { t: 'Later, Father.', v: 0 }]);
          g.dialogue.end();
          if (r === 1) {
            await st.fadeOut(0.8);
            g.player.setWeapon('hoe');
            g.player.pos.set(c.pos.x + 2, g.world.groundHeight(c.pos.x + 2, c.pos.z), c.pos.z);
            g.player.model.anim.setLoop('farm');
            await st.fadeIn(0.8);
            await wait(3500);
            await st.fadeOut(0.8);
            g.time.addHours(3);
            g.player.model.anim.setLoop(null);
            g.player.setWeapon('fists');
            g.progression.gain('str', 6);
            g.progression.gain('vit', 6);
            g.player.stamina = g.player.staminaMax * 0.5;
            g.player.food -= 10;
            await st.fadeIn(0.8);
            g.dialogue.begin();
            await st.say('father', 'Good work. Your back is stronger than mine ever was.');
            await st.say('father', 'Old Wang says there were fires in Changshan and Julu. Rebels, a hundred thousand of them. If they come here… no. They won\'t come here. Go on, the tax won\'t walk itself to the mulberry.');
            g.dialogue.end();
            g.quests.complete('q_home', 'field');
          }
        } else {
          await st.say('father', 'Go on to Zhuo, son. And don\'t let those townsmen cheat you on the sandals — a pair is worth ten coins at least.');
          g.dialogue.end();
        }
        return true;
      });
      st.talkHandlers.set('elderWang', async () => {
        g.dialogue.begin();
        if (!done(g, 'q_home', 'tax') && g.player.inventory.has('taxMillet')) {
          await st.say('elderWang', 'Ah, the Qin boy. You bring your family\'s millet? Good, good. Set it by the others.');
          g.player.inventory.remove('taxMillet');
          await st.say('elderWang', 'You see this mulberry? When Liu Bei was a boy he played beneath it and said, “One day I shall ride in a carriage with a canopy of feathers like this tree.” His uncle cuffed him — such words could get the whole clan executed!');
          const r = await st.choose('elderWang', 'Hah. The boy still dreams. He studied under the great scholar Lu Zhi, you know, alongside Gongsun Zan. And now he weaves mats.', [
            { t: 'Is it true he descends from the imperial house?', v: 0 },
            { t: 'What news of the rebels, Elder?', v: 1 },
            { t: 'I must go to market.', v: 2 },
          ]);
          if (r === 0) await st.say('elderWang', 'From Liu Sheng, Prince Jing of Zhongshan, son of Emperor Jing — so the family says. But Prince Liu Sheng had over a hundred and twenty sons. Half of You Province could claim the same!');
          if (r === 1) await st.say('elderWang', 'A healer called Zhang Jiao of Julu. His followers bind their heads in yellow. They whisper: “The Azure Sky is already dead; the Yellow Sky shall rise. When the year is jiazi, all under Heaven shall have good fortune.” This is the jiazi year, boy.');
          g.quests.complete('q_home', 'tax');
        } else await st.say('elderWang', 'Heaven sends droughts to warn the ruler. But does the ruler listen? The eunuchs hold his ears.');
        g.dialogue.end();
        return true;
      });
      st.talkHandlers.set('liuBei', async () => {
        g.dialogue.begin();
        if (!done(g, 'q_home', 'liubei')) {
          await st.say('liuBei', 'Ah — you are the Qin family\'s son, from Lousang. Selling sandals too? Then we are rivals today!');
          await st.say('liuBei', 'I am Liu Bei. My mother and I weave mats and sandals by the east wall of the village. A humble trade, but honest.');
          const r = await st.choose('liuBei', 'Tell me — how do the people of Lousang fare this spring?', [
            { t: 'We go hungry, but we endure.', v: 0 },
            { t: 'The taxes will be the death of us.', v: 1 },
            { t: 'Some say the Yellow Turbans have the right of it.', v: 2 },
          ]);
          if (r === 0) await st.say('liuBei', 'Endure… yes. Our people endure everything. That is precisely why it breaks my heart to see them suffer.');
          if (r === 1) await st.say('liuBei', 'While eunuchs sell offices in Luoyang, the farmer pays twice. It should not be so under the Han.');
          if (r === 2) { await st.say('liuBei', 'Careful, friend. Zhang Jiao promises paradise, but a rebellion eats the poor first. When the fighting comes, it is Lousang that will burn.'); g.progression.addVirtue(-1); }
          await st.say('liuBei', 'Here — the salt trader pays fair prices for sandals. And if you are ever in need, my door is by the great mulberry.');
          g.progression.addRenown(1);
          g.quests.complete('q_home', 'liubei');
        } else await st.say('liuBei', 'Safe travels home. The roads grow restless of late.');
        g.dialogue.end();
        return true;
      });

      await st.waitFor(() => ['mother', 'field', 'tax', 'sell', 'liubei'].every((k) => done(g, 'q_home', k)));
      off();
      // go home, it is getting late
      await st.waitFor(() => st.near(S.playerHome.x, S.playerHome.z, 6));
      g.quests.complete('q_home', 'home');
      g.dialogue.begin();
      await st.say('mother', 'You are back! Come, eat. The millet porridge is thin, but it is hot.');
      g.dialogue.end();
      await st.fadeOut(1.2);
      st.setTime(23.3);
      g.player.food = Math.min(100, g.player.food + 30);
      await wait(800);
    },
  },

  // ======================================================== 2. Fire in the Night
  m2_raid: {
    chapter: 1,
    title: 'Fire in the Night',
    async setup(st, g, o) {
      const S = st.S;
      st.setTime(23.4);
      const home = S.playerHome;
      st.teleportPlayer(home.x + 0.5, home.z + 2.6, 0);
      g.player.setWeapon('fists');
      family(st, g);
      const father = spawnFather(st, g, home.x + 6, home.z + 6);
      father.model.anim.setLoop(null);
      father.setWeapon('hoe');
      father.faction = 'militia';
      new Brain(father, { archetype: 'peasant', fighter: true, mode: 'idle', aggroRange: 12 });
      father.essential = true;
      elderWang(st);
      st.dismiss('liuBei');
      // hide villagers indoors
      for (const c of g.entities.list) if (c.role === 'farmer' || c.role === 'villager' || c.role === 'child') c.ai?.setHidden?.(true);
      g.setFlag('ch1_raid', true);
      void o;
    },
    async run(st, g) {
      const S = st.S;
      const home = S.playerHome;
      await st.fadeIn(1.5);
      const rng = new Rng(184);
      // burning haystacks
      const fires = [];
      for (const [dx, dz] of [[14, 10], [-18, 6], [4, 26], [30, -12]]) fires.push(g.world.settlements.addDynamicFire(home.x + dx, home.z + dz, 1.7));
      g.audio.setMood('tense');
      // raiders
      const raiders = [];
      for (let i = 0; i < 6; i++) {
        const nm = randomName(rng);
        const a = (i / 6) * Math.PI * 2;
        const c = g.spawnNPC({
          ...nm, title: 'Yellow Turban raider', role: 'yellowTurban', faction: 'yellowTurban', x: home.x + Math.cos(a) * 16, z: home.z + 10 + Math.sin(a) * 12,
          appearance: randomAppearance('yellowTurban', rng), weapon: rng.pick(['club', 'staff', 'hoe', 'sickle']),
          stats: { str: 7, vit: 5, agi: 7, blade: 2, polearm: 2 }, hp: 55,
          brain: { archetype: 'rebel', fighter: true, mode: 'wander', aggroRange: 22, tune: { aggression: 0.4, block: 0.25, perfect: 0.02, fleeAt: 0.25, surrender: 0.5 } },
        });
        c.ai.area = { x: home.x, z: home.z + 10, r: 15 };
        c.inventory.coins = rng.int(2, 15);
        c.inventory.add('yellowCloth');
        raiders.push(c);
      }
      g.dialogue.begin();
      await st.say('mei', 'Brother! Brother, wake up! Men with torches — they are burning the Zhangs\' barn!');
      await st.say('mother', 'Your father has gone out with the hoe. Take his old staff from under the bed — go, go! Heaven protect us!');
      g.dialogue.end();
      g.giveItem('staff');
      g.player.setWeapon('staff');
      const q = g.quests.start({
        id: 'q_raid', main: true, title: 'Fire in the Night', cn: '夜襲',
        desc: 'Yellow Turban raiders are burning Lousang. Take up your father\'s staff and drive them off.',
        objectives: [
          { id: 'draw', text: 'Take up the staff (press F)', check: () => g.player.combat.drawn },
          { id: 'fight', text: 'Drive off the raiders', count: 6, check: () => 6 - alive(raiders).length, marker: () => alive(raiders)[0]?.pos },
          { id: 'father', text: 'Find Father', marker: () => g.entities.get('father')?.pos },
        ],
        chronicle: 'Yellow Turban raiders burned barns in Lousang. You fought them with your father\'s staff alongside Liu Bei.',
      });
      void q;
      g.ui.subtitle(null, 'Press <b>F</b> to ready your staff. <b>LMB</b> strikes — move the mouse to choose the direction of your blow. Hold <b>RMB</b> to block.', 8);
      await st.waitFor(() => done(g, 'q_raid', 'draw'));
      await st.waitFor(() => alive(raiders).length <= 4 || g.clockTime > 0 && g.player.hp < g.player.hpMax * 0.5);
      // Liu Bei arrives
      const lb = liuBei(st, home.x + 30, home.z + 30, { brain: { archetype: 'hero', fighter: true, mode: 'idle', aggroRange: 40, tune: { aggression: 0.35 } } });
      lb.draw(true);
      g.ui.subtitle('Liu Bei', 'People of Lousang, to me! Protect the old and the children!', 4);
      g.ui.notify('Liu Bei has come to defend the village.', 'quest');
      g.ui.subtitle(null, 'Tip: block just <b>before</b> a blow lands (the green light in the combat star) for a <b>perfect parry</b>, then strike at once for a <b>riposte</b>.', 7);
      await st.waitFor(() => alive(raiders).length === 0);
      for (const r of raiders) if (!r.dead) { r.ai.fleeing = true; }
      g.quests.progress('q_raid', 'fight', 6);
      g.audio.setMood('peace');
      g.player.draw(false);
      const father = g.entities.get('father');
      father.ai.fighter = false;
      father.faction = 'civilian';
      father.model.anim.setPose('lie');
      await st.waitFor(() => father && g.player.distTo(father) < 3);
      g.quests.complete('q_raid', 'fight');
      g.quests.complete('q_raid', 'father');
      await st.cutscene(async () => {
        st.shot([father.pos.x + 2.2, 1.4, father.pos.z + 2.2], [father.pos.x, 0.4, father.pos.z], 3);
        lb.draw(false);
        lb.ai.goTo(father.pos.x - 1.2, father.pos.z + 1.5, 2);
        await st.say('father', 'Ugh… it is nothing. A scratch… from a sickle…');
        await st.say('liuBei', 'That is no scratch, uncle. The wound is deep and bleeding. {name}, he needs wound medicine — the apothecary by the Zhuo market sells jinchuang paste.');
        await st.say('liuBei', 'Take these coins. No — I insist. Neighbours are like the teeth and lips: when the lips are gone, the teeth feel the cold.');
        g.player.inventory.coins += 60;
        g.ui.notify('Received 60 wuzhu coins from Liu Bei.', 'item');
        await st.say('liuBei', 'I will stay with your family until dawn. And tomorrow — tomorrow the county posts a proclamation. The Governor calls for volunteers. Come find me at the county office.');
      }, { camLocked: true });
      for (const f of fires) f.remove();
      st.setTime(6.5);
      g.quests.finish('q_raid');
      g.progression.addMerit(10, 'defending Lousang');
      g.progression.addRenown(3);
      // medicine
      g.quests.start({
        id: 'q_medicine', main: true, title: 'Medicine for Father', cn: '求藥',
        desc: "Father's wound is deep. Buy jinchuang wound medicine from the apothecary in Zhuo and bring it home.",
        objectives: [
          { id: 'buy', text: 'Obtain Wound Medicine (Zhuo apothecary stall)', check: () => g.player.inventory.has('medicine'), marker: () => { const s = g.world.settlements.spots.stall4; return s ? { x: s.x, z: s.z } : null; } },
          { id: 'give', text: 'Bring the medicine to Father', marker: () => g.entities.get('father')?.pos },
        ],
        chronicle: "You bought wound medicine for your father with Liu Bei's coins.",
      });
      father.model.anim.setPose('lie');
      st.talkHandlers.set('father', async () => {
        g.dialogue.begin();
        if (g.player.inventory.has('medicine') && !done(g, 'q_medicine', 'give')) {
          g.player.inventory.remove('medicine');
          await st.say('father', 'Ahh — it stings like a hornet. But it is good. You are a good son.');
          await st.say('father', 'Son… Liu Bei is raising men, isn\'t he? I see it in your eyes. Go. A peasant\'s son can die in a ditch from hunger, or die for something. Better the second.');
          g.quests.complete('q_medicine', 'give');
          g.progression.addVirtue(3, 'filial piety');
        } else await st.say('father', 'The apothecary… by the market in Zhuo…');
        g.dialogue.end();
        return true;
      });
      st.talkHandlers.set('liuBei', async () => { await st.convo([['liuBei', 'Your father is strong. He will mend. Go quickly to Zhuo.']]); return true; });
      await st.waitFor(() => g.quests.isDone('q_medicine'));
      for (const c of g.entities.list) if (c.role === 'farmer' || c.role === 'villager' || c.role === 'child') c.ai?.setHidden?.(false);
    },
  },

  // ======================================================== 3. The Proclamation
  m3_notice: {
    chapter: 1,
    title: 'The Proclamation',
    async setup(st, g) {
      const S = st.S;
      if (g.time.hour < 9 || g.time.hour > 15) st.setTime(10);
      const nb = S.zhuoNotice;
      const lb = liuBei(st, nb.x - 1.2, nb.z + 1.2, { weapon: 'twinSwords' });
      lb.ai.mode = 'idle';
      lb.facePoint(nb.x, nb.z - 2);
      const zf = zhangFei(st, nb.x + 6, nb.z + 7);
      zf.ai.mode = 'idle';
      family(st, g);
      const father = spawnFather(st, g, S.playerHome.x + 2, S.playerHome.z + 3);
      father.model.anim.setPose('sitGround');
      elderWang(st);
      // a small crowd reading the notice
      const rng = new Rng(5);
      for (let i = 0; i < 5; i++) {
        const c = g.spawnNPC({ ...randomName(rng), role: 'townsman', faction: 'civilian', x: nb.x + rng.range(-4, 4), z: nb.z + rng.range(2, 5), look: rng.pick(['farmer', 'merchant', 'elder']), brain: { mode: 'idle' } });
        c.facePoint(nb.x, nb.z - 2);
        c.tags.add('crowd');
      }
    },
    async run(st, g) {
      const S = st.S;
      const nb = S.zhuoNotice;
      g.quests.start({
        id: 'q_notice', main: true, title: 'The Proclamation', cn: '榜文',
        desc: 'Governor Liu Yan has posted a call for volunteers against the Yellow Turbans. Liu Bei asked you to meet him at the county office.',
        objectives: [
          { id: 'read', text: 'Read the proclamation at the Zhuo county office', marker: { x: nb.x, z: nb.z } },
          { id: 'tavern', text: 'Drink with Liu Bei and Zhang Fei at the tavern', hidden: true, marker: { x: S.tavernTable.x, z: S.tavernTable.z } },
        ],
        chronicle: 'At the county office of Zhuo, Liu Bei read Liu Yan\'s proclamation and sighed; Zhang Fei rebuked him, and the two became friends. At the tavern, Guan Yu of Hedong joined them.',
      });
      const read = async () => {
        if (done(g, 'q_notice', 'read')) return;
        g.quests.complete('q_notice', 'read');
        const lb = g.entities.get('liuBei'), zf = g.entities.get('zhangFei');
        await st.cutscene(async () => {
          st.teleportPlayer(nb.x + 1.6, nb.z + 2.2, Math.PI);
          st.shot([nb.x + 0.5, 1.6, nb.z + 4.5], [nb.x - 0.5, 1.5, nb.z], 2);
          await st.say('herald', 'By order of Liu Yan, Inspector of You Province: the Yellow Turban bandits of Zhang Jiao have risen against the Son of Heaven. All brave men who would serve the dynasty, come forth and enlist!');
          lb.facePoint(nb.x, nb.z - 2);
          await st.say('narrator', 'Liu Bei, twenty-eight years of age, read the proclamation to the end — and heaved a long, deep sigh.');
          st.shot([nb.x + 3, 1.7, nb.z + 5], [zf.pos.x, 1.6, zf.pos.z], 2);
          await zf.ai.goTo(lb.pos.x + 1.1, lb.pos.z + 1.6, 1.8);
          zf.facePoint(lb.pos.x, lb.pos.z);
          await st.say('zhangFei', 'Why does a grown man sigh, when he ought to be doing something for his country?', { frame: false });
          lb.facePoint(zf.pos.x, zf.pos.z);
          st.shot([lb.pos.x + 1.8, 1.65, lb.pos.z + 3.2], [lb.pos.x + 0.4, 1.55, lb.pos.z + 0.8], 3);
          await st.say('liuBei', 'I am Liu Bei, of the imperial house — a descendant of Prince Jing of Zhongshan. I long to destroy these rebels and restore peace to the people. But I have no strength to do it. That is why I sigh.', { frame: false });
          await st.say('zhangFei', 'Ha! My name is Zhang Fei, called Yide. My family has lived in Zhuo for generations — we have land, and I sell wine and pork. I have some wealth. I will spend it all to raise volunteers. What say you?', { frame: false });
          await st.say('liuBei', 'Truly? Then Heaven has sent you! — And look, here is {name}, who fought beside me against the raiders in Lousang.', { frame: false });
          const r = await st.choose('zhangFei', 'Ho! A peasant who fights? Your arms are thick from the hoe. Will you stand with us?', [
            { t: 'The Yellow Turbans burned my village. I will fight.', v: 0 },
            { t: 'I will follow Liu Bei wherever he leads.', v: 1, do: (gg) => gg.progression.addVirtue(1) },
            { t: 'What is the pay?', v: 2 },
          ]);
          if (r === 2) await st.say('zhangFei', 'HAH! An honest man! Meat and wine every day, and your share of whatever loot we win. Good enough?');
          else await st.say('zhangFei', 'Good! You have a real man\'s liver. Come — let us drink to it!');
        });
        // move to the tavern
        await st.fadeOut(0.8);
        const t1 = S.tavernTable;
        for (const c of g.entities.withTag('crowd')) g.entities.remove(c);
        st.place(lb, t1.x - 0.7, t1.z - 1.2, 0);
        st.place(zf, t1.x + 0.7, t1.z - 1.2, 0);
        lb.model.anim.setPose('seiza'); zf.model.anim.setPose('seiza');
        zf.model.anim.setLoop('drinkLoop');
        st.teleportPlayer(t1.x, t1.z + 1.3, Math.PI);
        g.player.model.anim.setPose('seiza');
        const gy = guanYu(st, t1.x + 22, t1.z + 1.5);
        g.quests.complete('q_notice', 'tavern');
        await st.fadeIn(1);
        await st.cutscene(async () => {
          st.shot([t1.x + 3.5, 1.6, t1.z + 3.5], [t1.x, 0.9, t1.z], 3);
          await st.say('zhangFei', 'Innkeeper! More wine! Today we plan great deeds!', { frame: false });
          await st.say('narrator', 'As they drank, a giant of a man pushing a wheelbarrow stopped at the tavern door.', { frame: false });
          st.shot([t1.x + 8, 1.9, t1.z + 4], [gy.pos.x, 1.7, gy.pos.z], 1.5);
          await gy.ai.goTo(t1.x + 1.8, t1.z + 0.2, 1.6);
          gy.facePoint(t1.x, t1.z);
          st.shot([t1.x - 1.5, 1.4, t1.z + 2.5], [gy.pos.x, 1.8, gy.pos.z], 2.5);
          await st.say('guanYu', 'Wine, quickly! I must hurry into the city to enlist.', { frame: false });
          await st.say('narrator', 'He was nine chi tall, with a beard two chi long; his face was the dark red of a ripe date, his lips red as rouge. He had the eyes of a phoenix and brows like sleeping silkworms. His bearing was majestic.', { frame: false });
          await st.say('liuBei', 'Sir, will you sit and drink with us? What is your name?', { frame: false });
          gy.model.anim.setPose('seiza');
          await st.say('guanYu', 'My surname is Guan, my name Yu; my courtesy name is Yunchang. I am from Xieliang in Hedong. A local bully there oppressed the weak with his power — I killed him, and have been a fugitive these five or six years. I hear they are raising soldiers here to crush the rebels. So I have come.', { frame: false });
          await st.say('liuBei', 'Then our hearts are the same.', { frame: false });
          const r = await st.choose('guanYu', 'And this young man? He has the look of a farmer, but his eyes are steady.', [
            { t: 'I am {name}, of Lousang. Only a peasant — but I will learn to fight.', v: 0 },
            { t: 'Your fame will reach every corner of the empire, General.', v: 1 },
          ]);
          if (r === 1) await st.say('guanYu', 'Hmph. Flattery is the tongue\'s poison. Speak plainly with me, and we will be friends.', { frame: false });
          else await st.say('guanYu', 'Humility is the root of virtue. Heroes were all peasants once.', { frame: false });
          await st.say('zhangFei', 'Behind my farm there is a peach garden, now in full blossom. Tomorrow at dawn we will sacrifice to Heaven and Earth there and swear to be brothers — and plan our great enterprise!', { frame: false });
          await st.say('liuBei', 'Excellent! {name} — you will witness it. Come to the Zhang estate at first light.', { frame: false });
        });
        g.player.model.anim.setPose(null);
        g.quests.finish('q_notice');
        g.progression.addRenown(2);
      };
      st.objHandlers.set('zhuo_notice', read);
      st.talkHandlers.set('liuBei', async () => { await read(); return true; });
      st.talkHandlers.set('zhangFei', async () => { await st.convo([['zhangFei', 'Eh? Who are you staring at? Hah — go read the notice with the scholar there, friend.']]); return true; });
      await st.waitFor(() => g.quests.isDone('q_notice'));
      await st.fadeOut(1);
      for (const id of ['liuBei', 'guanYu', 'zhangFei']) { const c = g.entities.get(id); c?.model.anim.setPose(null); c?.model.anim.setLoop(null); }
      st.setTime(21);
      await wait(300);
      await st.fadeIn(1);
    },
  },

  // ======================================================== 4. Oath in the Peach Garden
  m4_oath: {
    chapter: 1,
    title: 'Oath in the Peach Garden',
    async setup(st, g) {
      const S = st.S;
      const a = S.oathAltar;
      st.dismiss('guanYu'); st.dismiss('zhangFei'); st.dismiss('liuBei');
      const lb = liuBei(st, a.x, a.z + 0.8, { weapon: 'fists' });
      const gy = guanYu(st, a.x - 1.1, a.z + 1.1);
      const zf = zhangFei(st, a.x + 1.1, a.z + 1.1);
      for (const c of [lb, gy, zf]) { c.ai.mode = 'idle'; c.yaw = Math.PI; c.faceYaw = Math.PI; }
      family(st, g);
      elderWang(st);
      const father = spawnFather(st, g, S.playerHome.x + 2, S.playerHome.z + 3);
      father.model.anim.setPose('sitGround');
    },
    async run(st, g) {
      const S = st.S;
      const a = S.oathAltar;
      g.quests.start({
        id: 'q_oath', main: true, title: 'Oath in the Peach Garden', cn: '桃園結義',
        desc: 'Liu Bei, Guan Yu and Zhang Fei will swear brotherhood in the peach garden behind the Zhang estate, east of Zhuo. Go there at dawn.',
        objectives: [{ id: 'go', text: 'Go to the Peach Garden at the Zhang estate', marker: { x: a.x, z: a.z + 3 }, check: () => st.near(a.x, a.z + 2, 7) }],
        chronicle: 'In the peach garden of Zhang Fei, Liu Bei, Guan Yu and Zhang Fei swore to be brothers. You swore your own oath before them.',
      });
      if (g.time.hour > 8 && g.time.hour < 20) g.ui.notify('Tip: sleep at home (your bed is inside the door) to pass the night.');
      await st.waitFor(() => done(g, 'q_oath', 'go'));
      const lb = g.entities.get('liuBei'), gy = g.entities.get('guanYu'), zf = g.entities.get('zhangFei');
      await st.fadeOut(0.8);
      st.setTime(6.3);
      st.teleportPlayer(a.x + 2.6, a.z + 3.6, Math.PI * 0.8);
      await st.fadeIn(1.2);
      await st.cutscene(async () => {
        st.shot([a.x + 4, 1.3, a.z + 5.5], [a.x, 1.0, a.z], 1.5);
        await st.say('narrator', 'The next day, in the peach garden, a black ox and a white horse were offered to Heaven and Earth. Amid the smoke of incense, the three men knelt.', { frame: false });
        for (const c of [lb, gy, zf]) c.model.anim.setPose('kneel');
        await wait(1200);
        st.shot([a.x, 1.2, a.z - 1.2], [a.x, 0.9, a.z + 1.2], 1.2);
        await st.say('liuBei', 'We three — Liu Bei, Guan Yu and Zhang Fei — though of different families, swear brotherhood and promise mutual help to one end.', { frame: false });
        await st.say('guanYu', 'We will rescue each other in difficulty; we will aid each other in danger. We swear to serve the state and save the people.', { frame: false });
        await st.say('zhangFei', 'We ask not to be born on the same day of the same month of the same year — but we seek to die together on the same day!', { frame: false });
        await st.say('liuBei', 'May Heaven, the all-ruling, and Earth, the all-producing, read our hearts. If we turn aside from righteousness or forget kindness, may Heaven and man smite us!', { frame: false });
        g.audio.play('gong');
        await wait(900);
        for (const c of [lb, gy, zf]) c.model.anim.setPose(null);
        await st.say('narrator', 'Liu Bei was named eldest brother, Guan Yu second, and Zhang Fei third.', { frame: false });
        st.shot([a.x + 1.5, 1.6, a.z + 5], [a.x + 0.3, 1.4, a.z + 1.5], 2);
        lb.facePoint(g.player.pos.x, g.player.pos.z);
        const r = await st.choose('liuBei', '{name}. You have seen our oath. We are three — we must become three hundred. Will you be the first to swear yourself to our cause?', [
          { t: 'Kneel: “I swear to follow you, Xuande, in life and death.”', v: 'liu', tag: 'Virtue' },
          { t: 'Kneel: “I swear to serve the Han and protect the common people.”', v: 'han' },
          { t: 'Remain standing: “I fight for my own fortune. But I will fight well.”', v: 'self', tag: 'Ambition' },
        ]);
        if (r !== 'self') g.player.model.anim.setPose('kneel');
        if (r === 'liu') { g.progression.addVirtue(5, 'loyalty'); g.setFlag('oath', 'liu'); await st.say('liuBei', 'Rise, rise! We shall share hardship and glory alike.', { frame: false }); }
        if (r === 'han') { g.progression.addVirtue(3); g.setFlag('oath', 'han'); await st.say('guanYu', 'A worthy oath. The people before all.', { frame: false }); }
        if (r === 'self') { g.setFlag('oath', 'self'); g.progression.addRenown(3); await st.say('zhangFei', 'Ha! At least he is honest! A man with ambition fights twice as hard. Hah!', { frame: false }); await st.say('liuBei', 'Every great man began by seeking his own path. Walk it with us for now.', { frame: false }); }
        g.player.model.anim.setPose(null);
        await st.say('zhangFei', 'The horse merchants Zhang Shiping and Su Shuang of Zhongshan have given us fifty fine horses and a thousand taels of gold and silver! And I have hired the best smith in Zhuo to forge our weapons.', { frame: false });
        await st.say('liuBei', 'Take this spear and jacket. From today you are a volunteer of the loyal army. Report to the camp south of the county walls and train with the drillmaster.', { frame: false });
      });
      g.setFlag('ch1_oath', true);
      g.giveItem('spear');
      g.giveItem('paddedJacket');
      g.player.setWeapon('spear');
      g.player.equip.body = 'paddedJacket';
      g.player.buildModel();
      g.player.inventory.coins += 100;
      g.progression.setRank('volunteer');
      g.quests.finish('q_oath');
      g.chronicleAdd('The volunteers of Zhuo number five hundred. Zou Jing, a colonel under Liu Yan, takes command.');
    },
  },

  // ======================================================== 5. Iron and Discipline
  m5_training: {
    chapter: 1,
    title: 'Iron and Discipline',
    async setup(st, g) {
      const S = st.S;
      const tgd = S.trainingGround;
      st.dismiss('guanYu'); st.dismiss('zhangFei'); st.dismiss('liuBei');
      const lb = liuBei(st, S.commandTent.x - 2, S.commandTent.z + 2);
      const gy = guanYu(st, S.commandTent.x + 2, S.commandTent.z + 2);
      const zf = zhangFei(st, tgd.x + 6, tgd.z - 3, { weapon: 'spear' });
      for (const c of [lb, gy, zf]) c.ai.mode = 'idle';
      st.actor('zouJing', { figure: 'zouJing', name: 'Zou Jing', cn: '鄒靖', title: 'Colonel under Liu Yan', x: S.commandTent.x, z: S.commandTent.z + 1, weapon: 'dao', body: 'generalArmor', faction: 'han' });
      const guo = st.actor('sergeant', { name: 'Drillmaster Guo', cn: '郭教頭', title: 'veteran of the Liang frontier wars', faction: 'militia', x: tgd.x, z: tgd.z, weapon: 'staff', body: 'leatherArmor', appearance: { ...randomAppearance('soldier', new Rng(21)), beard: 'short', face: { stern: true } }, stats: { str: 9, agi: 11, vit: 14, polearm: 10, block: 10 }, hp: 220, brain: { archetype: 'trainer', fighter: true, mode: 'idle', passive: true } });
      guo.essential = true;
      // volunteers drilling
      if (!g.entities.withTag('drill').length) {
        const rng = new Rng(31);
        for (let i = 0; i < 12; i++) {
          const c = g.spawnNPC({ ...randomName(rng), title: 'Volunteer', role: 'soldier', faction: 'militia', x: tgd.x - 10 + (i % 6) * 2.2, z: tgd.z + 4 + Math.floor(i / 6) * 2.2, look: 'militia', weapon: 'spear', body: 'paddedJacket', brain: { archetype: 'militia', fighter: true, mode: 'idle', aggroRange: 15 } });
          c.tags.add('drill');
          c.faceYaw = Math.PI;
          c.draw(true);
        }
      }
    },
    async run(st, g) {
      const S = st.S;
      const guo = g.entities.get('sergeant');
      const dirs = new Set();
      let blocks = 0, perfect = 0, riposte = 0;
      g.quests.start({
        id: 'q_train', main: true, title: 'Iron and Discipline', cn: '操練',
        desc: 'Drillmaster Guo will beat the farmer out of you. Learn the four cuts, the block, and the perfect parry.',
        objectives: [
          { id: 'talk', text: 'Report to Drillmaster Guo at the training ground', marker: () => guo.pos },
          { id: 'dirs', text: 'Land a blow from all four directions (left, right, overhead, thrust)', hidden: true, count: 4, check: () => dirs.size },
          { id: 'block', text: 'Block three of his strikes (hold RMB)', hidden: true, count: 3, check: () => blocks },
          { id: 'perfect', text: 'Perfect-parry a strike (block just as it lands)', hidden: true, check: () => perfect > 0 },
          { id: 'riposte', text: 'Riposte after a perfect parry (strike immediately)', hidden: true, optional: true, check: () => riposte > 0 },
        ],
        autoFinish: false,
      });
      const offs = [
        g.events.on('hit', (a, d, dmg, info) => { if (a === g.player && d === guo) { dirs.add(info.dir); if (info.masterstrike) riposte++; } }),
        g.events.on('blocked', (d, a) => { if (d === g.player && a === guo) blocks++; }),
        g.events.on('perfectBlock', (d, a) => { if (d === g.player && a === guo) perfect++; }),
      ];
      const spar = async (on) => {
        g.combat.setHostile(g.player, guo, on);
        guo.tags.toggle?.('sparring', on);
        if (on) { guo.tags.add('sparring'); guo.ai.passive = false; guo.combat.target = g.player; guo.ai.fighter = true; }
        else { guo.tags.delete('sparring'); guo.ai.passive = true; guo.combat.target = null; guo.draw(false); guo.hp = guo.hpMax; }
      };
      st.talkHandlers.set('sergeant', async () => {
        if (done(g, 'q_train', 'talk')) return false;
        g.dialogue.begin();
        await st.say('sergeant', 'So you are the farmer who beat off raiders with a stick. Hah. Luck is not skill, boy.');
        await st.say('sergeant', 'Listen well. A blow comes from four places: the left, the right, from above, or straight in — the thrust. Watch my shoulders and you will see where it comes from.');
        await st.say('sergeant', 'When you face a man, choose your cut with the flick of your wrist (move the mouse, then strike). Strike where his guard is not — his guarded side glows red in your eye.');
        await st.say('sergeant', 'Hold your guard up (RMB) and you will stop most blows — but it tires you. Raise it at the very last instant, as the blow lands, and you will turn his strength against him. Then strike, fast, before he recovers.');
        await st.say('sergeant', 'Draw your spear. Show me.');
        g.dialogue.end();
        g.quests.complete('q_train', 'talk');
        for (const o of g.quests.get('q_train').objs) o.hidden = false;
        await spar(true);
        return true;
      });
      guo.damage = ((orig) => function (amount, attacker, info) {
        // training: the drillmaster never goes below 40% and resets
        orig.call(this, amount * 0.5, attacker, info);
        if (this.hp < this.hpMax * 0.4) this.hp = this.hpMax * 0.8;
      })(guo.damage);
      const playerDamage = g.player.damage;
      g.player.damage = function (amount, attacker, info) {
        if (attacker === guo || attacker?.id === 'zhangFei') { amount *= 0.35; if (this.hp - amount < 10) { this.hp = 10; return; } }
        playerDamage.call(this, amount, attacker, info);
      };
      await st.waitFor(() => ['dirs', 'block', 'perfect'].every((k) => done(g, 'q_train', k)));
      await spar(false);
      g.player.draw(false);
      g.dialogue.begin();
      await st.say('sergeant', riposte ? 'Ha! You parried and struck back like a viper. Good. Very good.' : 'Not bad for a farmer. Remember: parry, then strike at once. That is how small men kill big men.');
      await st.say('sergeant', 'Now go and try your luck with Zhang Yide over there. He has been itching to break someone\'s ribs all morning.');
      g.dialogue.end();
      g.progression.gain('block', 10);
      g.progression.gain('polearm', 10);
      // spar with Zhang Fei
      const zf = g.entities.get('zhangFei');
      g.quests.get('q_train').objs.push({ id: 'zf', text: 'Spar with Zhang Fei', done: false, n: 0, marker: () => zf.pos });
      let zfHits = 0, zfStart = 0;
      offs.push(g.events.on('hit', (a, d) => { if (a === g.player && d === zf && zf.tags.has('sparring')) zfHits++; }));
      st.talkHandlers.set('zhangFei', async () => {
        if (zf.tags.has('sparring') || done(g, 'q_train', 'zf')) return false;
        g.dialogue.begin();
        await st.say('zhangFei', 'You want to test Zhang Yide? HAH! Very well, little brother. Land five blows on me before I tire of this, and I\'ll buy the wine tonight!');
        g.dialogue.end();
        zf.arch = zf.ai.arch; zf.ai.arch = { ...zf.ai.arch, skill: 0.5, aggression: 0.5, block: 0.55, perfect: 0.12, reaction: 0.3 };
        g.combat.setHostile(g.player, zf, true);
        zf.tags.add('sparring');
        zf.ai.passive = false; zf.combat.target = g.player;
        zfStart = g.clockTime;
        return true;
      });
      zf.damage = ((orig) => function (amount, attacker, info) { orig.call(this, amount * 0.25, attacker, info); if (this.hp < this.hpMax * 0.5) this.hp = this.hpMax * 0.9; })(zf.damage);
      await st.waitFor(() => zf.tags.has('sparring') && (zfHits >= 5 || g.clockTime - zfStart > 75 || g.player.hp <= 12));
      g.combat.setHostile(g.player, zf, false);
      zf.tags.delete('sparring'); zf.ai.passive = true; zf.combat.target = null; zf.draw(false); zf.ai.arch = zf.arch || zf.ai.arch;
      g.player.draw(false);
      g.dialogue.begin();
      if (zfHits >= 5) { await st.say('zhangFei', 'HAHAHA! Five! You struck me five times! Tonight the wine is on Zhang Yide!'); g.progression.addRenown(3); g.progression.addMerit(10, 'bested Zhang Fei in sparring'); }
      else await st.say('zhangFei', 'Hah! You last longer than most. Keep that spear up and you might live to see autumn!');
      g.dialogue.end();
      g.quests.complete('q_train', 'zf');
      g.player.damage = playerDamage;
      offs.forEach((f) => f());
      // fetch the brothers' weapons from the smith
      g.dialogue.begin();
      await st.say('liuBei', '{name}, one more errand. The blacksmith in Zhuo has finished our weapons. Would you fetch them? Take care — they are heavy. Brother Guan\'s blade alone weighs eighty-two jin.');
      g.dialogue.end();
      g.quests.get('q_train').objs.push({ id: 'smith', text: 'Collect the forged weapons from the Zhuo blacksmith', done: false, n: 0, marker: () => g.entities.get('smith')?.pos });
      st.talkHandlers.set('smith', async () => {
        if (done(g, 'q_train', 'smith')) return false;
        await st.convo([
          ['smith', 'For Master Liu and his brothers? Here — the finest work of my life. A pair of twin swords, male and female. A serpent spear eighteen chi long.'],
          ['smith', 'And this — the Green Dragon Crescent Blade. Eighty-two jin of the best Nanyang iron. I dreamt of a dragon the night I quenched it. Mind your back, lad!'],
        ]);
        g.quests.complete('q_train', 'smith');
        g.player.speedMul = 0.8;
        g.ui.notify('You carry the brothers\' weapons. (Movement slowed)', 'item');
        g.quests.get('q_train').objs.push({ id: 'deliver', text: 'Deliver the weapons to Liu Bei at the camp', done: false, n: 0, marker: () => g.entities.get('liuBei')?.pos });
        return true;
      });
      st.talkHandlers.set('liuBei', async () => {
        if (!done(g, 'q_train', 'smith') || done(g, 'q_train', 'deliver')) return false;
        g.player.speedMul = 1;
        const gy = g.entities.get('guanYu');
        await st.cutscene(async () => {
          st.shot([gy.pos.x + 2.5, 1.7, gy.pos.z + 3], [gy.pos.x, 1.4, gy.pos.z], 2);
          gy.setWeapon('guandao'); zf.setWeapon('serpentSpear'); g.entities.get('liuBei').setWeapon('twinSwords');
          gy.draw(true);
          await st.say('guanYu', 'A fine blade. With this, Guan Yunchang will cut through ten thousand rebels.', { frame: false });
          await st.say('zhangFei', 'Look at this spear! Like a snake\'s tongue! Oh, I pity the first rebel who meets it!', { frame: false });
          gy.draw(false);
          await st.say('liuBei', 'You have done well, {name}. Colonel Zou Jing wishes to see you. There is work on the southern road.', { frame: false });
        });
        g.quests.complete('q_train', 'deliver');
        g.quests.finish('q_train');
        g.progression.addMerit(20, 'training');
        return true;
      });
      await st.waitFor(() => g.quests.isDone('q_train'));
    },
  },

  // ======================================================== 6. The Southern Road
  m6_bandits: {
    chapter: 1,
    title: 'The Southern Road',
    async setup(st, g, o) {
      const S = st.S;
      st.dismiss('sergeant');
      const lb = liuBei(st, S.commandTent.x - 2, S.commandTent.z + 2);
      const gy = guanYu(st, S.commandTent.x + 2, S.commandTent.z + 2, { weapon: 'guandao' });
      const zf = zhangFei(st, S.commandTent.x + 4, S.commandTent.z + 3, { weapon: 'serpentSpear' });
      for (const c of [lb, gy, zf]) c.ai.mode = 'idle';
      st.actor('zouJing', { figure: 'zouJing', name: 'Zou Jing', cn: '鄒靖', title: 'Colonel under Liu Yan', x: S.commandTent.x, z: S.commandTent.z + 1, weapon: 'dao', body: 'generalArmor', faction: 'han' });
      if (!g.population.camps.get('banditSouth')?.some((c) => !c.dead) && !g.flags.cleared_banditSouth) g.population.spawnCamp('banditSouth', 'bandit', 5);
      void o;
    },
    async run(st, g) {
      const S = st.S;
      const camp = g.world.region.settlements.find((s) => s.id === 'banditSouth');
      const zj = g.entities.get('zouJing');
      g.quests.start({
        id: 'q_south', main: true, title: 'The Southern Road', cn: '南路剿匪',
        desc: 'Supply carts from Fanyang are being robbed in the southern hills. Colonel Zou Jing wants the road cleared.',
        objectives: [
          { id: 'talk', text: 'Report to Colonel Zou Jing at the command tent', marker: () => zj.pos },
          { id: 'clear', text: 'Destroy the bandits in the southern hills', hidden: true, marker: { x: camp.x, z: camp.z } },
          { id: 'return', text: 'Report back to Zou Jing', hidden: true, marker: () => zj.pos },
        ],
        chronicle: 'Leading your first squad, you destroyed the bandits of the southern hills.',
      });
      st.talkHandlers.set('zouJing', async () => {
        if (!done(g, 'q_south', 'talk')) {
          g.dialogue.begin();
          await st.say('zouJing', 'You are the one Liu Xuande speaks of. Good. I have no use for flatterers, only for men who get things done.');
          await st.say('zouJing', 'A gang of bandits in the southern hills has been robbing our grain carts from Fanyang. An army marches on its stomach. I am giving you four men. You are a squad leader now — a wuzhang. Clear that road.');
          await st.say('zouJing', 'Your men will follow you. Press G to order them: follow, charge, or hold. Do not lose them needlessly — mothers are waiting for them.');
          g.dialogue.end();
          g.quests.complete('q_south', 'talk');
          for (const o of g.quests.get('q_south').objs) o.hidden = false;
          g.progression.setRank('wuzhang');
          g.army.kit = { weapon: 'spear', body: 'paddedJacket', head: null, look: 'militia' };
          g.army.recruit(4);
          // bandit chief
          const rng = new Rng(9);
          const chief = g.spawnNPC({ id: 'banditChief', name: 'Scar-faced Fan', cn: '疤面范', title: 'Bandit chief', role: 'bandit', faction: 'bandit', x: camp.x + 2, z: camp.z - 2, appearance: { ...randomAppearance('bandit', rng), build: 1.25, beard: 'bristly' }, weapon: 'axe', body: 'leatherArmor', stats: { str: 13, vit: 12, blade: 8, block: 7 }, hp: 160, brain: { archetype: 'soldier', fighter: true, mode: 'wander', aggroRange: 20 } });
          chief.ai.area = { x: camp.x, z: camp.z, r: 6 };
          chief.tags.add('banditSouth'); chief.tags.add('officer');
          chief.inventory.coins = 120; chief.inventory.add('medicine'); chief.inventory.add('dao');
          return true;
        }
        if (done(g, 'q_south', 'clear') && !done(g, 'q_south', 'return')) {
          g.dialogue.begin();
          await st.say('zouJing', 'The road is clear? And your men? Good. You will make a soldier yet.');
          g.dialogue.end();
          g.quests.complete('q_south', 'return');
          return true;
        }
        return false;
      });
      await st.waitFor(() => done(g, 'q_south', 'talk'));
      await st.waitFor(() => g.entities.withTag('banditSouth').every((c) => c.dead || c.ai?.surrendered || c.faction === 'civilian'));
      g.setFlag('cleared_banditSouth', true);
      g.quests.complete('q_south', 'clear');
      g.ui.notify('The southern road is safe. Search the stash, then report to Zou Jing.', 'quest');
      await st.waitFor(() => g.quests.isDone('q_south'));
      g.progression.addMerit(40, 'clearing the southern road');
      g.player.inventory.coins += 80;
    },
  },

  // ======================================================== 7. Blood at Daxing Mountain
  m7_daxing: {
    chapter: 1,
    title: 'Blood at Daxing Mountain',
    async setup(st, g) {
      const S = st.S;
      const lb = liuBei(st, S.commandTent.x - 2, S.commandTent.z + 2);
      const gy = guanYu(st, S.commandTent.x + 2, S.commandTent.z + 2, { weapon: 'guandao' });
      const zf = zhangFei(st, S.commandTent.x + 4, S.commandTent.z + 3, { weapon: 'serpentSpear' });
      for (const c of [lb, gy, zf]) c.ai.mode = 'idle';
      st.actor('zouJing', { figure: 'zouJing', name: 'Zou Jing', cn: '鄒靖', title: 'Colonel under Liu Yan', x: S.commandTent.x, z: S.commandTent.z + 1, weapon: 'dao', body: 'generalArmor', faction: 'han' });
      if (g.army.alive().length < 4) g.army.recruit(4 - g.army.alive().length);
    },
    async run(st, g) {
      const S = st.S, P = st.P;
      const zj = g.entities.get('zouJing');
      const lb = g.entities.get('liuBei'), gy = g.entities.get('guanYu'), zf = g.entities.get('zhangFei');
      const field = P.daxingField;
      g.quests.start({
        id: 'q_daxing', main: true, title: 'Blood at Daxing Mountain', cn: '大興山之戰',
        desc: 'The Yellow Turban commander Cheng Yuanzhi marches on Zhuo with a vast host. The volunteers will meet them at the foot of Daxing Mountain.',
        objectives: [
          { id: 'brief', text: 'Attend the war council at the command tent', marker: () => zj.pos },
          { id: 'march', text: 'March to the battlefield below Daxing Mountain', hidden: true, marker: { x: field.x, z: field.z }, check: () => st.near(field.x, field.z, 25) },
          { id: 'hold', text: 'Break the Yellow Turban vanguard', hidden: true, count: 30 },
          { id: 'camp', text: 'Storm the Yellow Turban camp', hidden: true, marker: { x: 400, z: -300 } },
        ],
        chronicle: 'At Daxing Mountain, Zhang Fei slew Deng Mao and Guan Yu cut down Cheng Yuanzhi. The Yellow Turbans of Zhuo were scattered. You fought in the front rank.',
      });
      st.talkHandlers.set('zouJing', async () => {
        if (done(g, 'q_daxing', 'brief')) return false;
        await st.cutscene(async () => {
          st.shot([zj.pos.x + 3, 1.7, zj.pos.z + 4], [zj.pos.x, 1.4, zj.pos.z], 2);
          await st.say('scout', 'Colonel! Cheng Yuanzhi leads fifty thousand Yellow Turbans out of the hills toward Zhuo! Their vanguard is already below Daxing Mountain!', { frame: false });
          await st.say('zouJing', 'Fifty thousand rabble against five hundred. The odds favour us — they have numbers, we have discipline.', { frame: false });
          await st.say('liuBei', 'Let Brother Guan and Brother Zhang take the flanks. I will hold the centre with the banner. {name} will stand with me.', { frame: false });
          await st.say('zhangFei', 'Finally! My spear is thirsty!', { frame: false });
          await st.say('zouJing', 'March at once. Cross the Juma by the eastern bridge and form up on the plain below the mountain.', { frame: false });
        });
        g.quests.complete('q_daxing', 'brief');
        for (const o of g.quests.get('q_daxing').objs) o.hidden = false;
        return true;
      });
      await st.waitFor(() => done(g, 'q_daxing', 'brief'));
      // everyone marches: allies follow the player
      const allies = [];
      for (const [c, fx, fz] of [[lb, -1.5, -1], [gy, -4, -2], [zf, 3, -2], [zj, 0, -4]]) {
        c.ai.mode = 'follow'; c.ai.leader = g.player; c.ai.formation = [fx, fz]; c.ai.fighter = true; c.ai.passive = false; c.ai.aggroRange = 25;
        allies.push(c);
      }
      const rng = new Rng(88);
      const vols = [];
      for (let i = 0; i < 10; i++) {
        const c = g.spawnNPC({ ...randomName(rng), title: 'Volunteer', role: 'soldier', faction: 'militia', x: zj.pos.x + rng.range(-6, 6), z: zj.pos.z + rng.range(-3, 6), look: 'militia', weapon: rng.pick(['spear', 'spear', 'dao', 'ji']), body: 'paddedJacket', shield: rng.chance(0.3), stats: { str: 9, vit: 9, polearm: 5, blade: 4, block: 4 }, brain: { archetype: 'militia', fighter: true, mode: 'follow', leader: g.player, formation: [(i % 5 - 2) * 1.6, -6 - Math.floor(i / 5) * 1.6], aggroRange: 25 } });
        c.tags.add('alwaysActive');
        vols.push(c);
      }
      g.audio.play('horn');
      await st.waitFor(() => done(g, 'q_daxing', 'march'));
      // BATTLE
      g.audio.setMood('tense');
      for (const c of [...allies, ...vols]) { c.ai.mode = 'guard'; c.ai.post = { x: c.pos.x, z: c.pos.z, rot: Math.atan2(400 - c.pos.x, -300 - c.pos.z) }; c.ai.aggroRange = 30; }
      let kills = 0;
      const off = g.events.on('death', (c) => { if (c.faction === 'yellowTurban') { kills++; g.quests.progress('q_daxing', 'hold', 1); } });
      const spawnWave = (n, ox, oz, officer = null) => {
        const list = [];
        for (let i = 0; i < n; i++) {
          const x = ox + rng.range(-10, 10), z = oz + rng.range(-6, 6);
          const c = g.spawnNPC({ ...randomName(rng), title: 'Yellow Turban', role: 'yellowTurban', faction: 'yellowTurban', x, z, look: 'yellowTurban', weapon: rng.pick(['spear', 'spear', 'staff', 'dao', 'club', 'hoe']), body: rng.chance(0.2) ? 'paddedJacket' : null, stats: { str: rng.int(7, 10), vit: rng.int(5, 9), polearm: 3, blade: 3 }, hp: 60, brain: { archetype: 'rebel', fighter: true, mode: 'wander', aggroRange: 60, tune: { fleeAt: 0.1, surrender: 0.3 } } });
          c.ai.area = { x: field.x, z: field.z, r: 6 };
          c.tags.add('alwaysActive'); c.tags.add('daxing');
          c.inventory.coins = rng.int(1, 12); c.inventory.add('yellowCloth');
          list.push(c);
        }
        if (officer) list.push(officer);
        return list;
      };
      const dir = { x: 400 - field.x, z: -300 - field.z }; const L = Math.hypot(dir.x, dir.z); dir.x /= L; dir.z /= L;
      const front = (d) => ({ x: field.x + dir.x * d, z: field.z + dir.z * d });
      g.ui.chapterCard('', '大興山', 'Daxing Mountain', 'The yellow host pours down from the hills, their scarves like a field of ripe millet.', 3);
      let wave = spawnWave(10, front(55).x, front(55).z);
      await st.waitFor(() => alive(wave).length <= 3);
      // Deng Mao
      const f1 = front(50);
      const dm = g.spawnNPC({ id: 'dengMao', figure: 'dengMao', name: 'Deng Mao', cn: '鄧茂', title: 'Yellow Turban lieutenant', role: 'yellowTurban', faction: 'yellowTurban', x: f1.x, z: f1.z, weapon: 'dao', shield: true, body: 'leatherArmor', hp: 260, stats: { str: 12, vit: 12, blade: 9, block: 8 }, brain: { archetype: 'officer', fighter: true, mode: 'wander', aggroRange: 60 } });
      dm.ai.area = { x: field.x, z: field.z, r: 5 }; dm.tags.add('officer'); dm.tags.add('alwaysActive');
      wave = spawnWave(10, front(60).x, front(60).z, dm);
      g.ui.subtitle('Deng Mao', 'Who dares stand against the Lord of Heaven\'s army? Deng Mao is here!', 4);
      await st.waitFor(() => g.player.distTo(dm) < 14 || dm.hp < dm.hpMax * 0.6 || alive(wave).length <= 4);
      if (!dm.dead) {
        await st.cutscene(async () => {
          g.cutscene.freezeAI = true;
          const zx = dm.pos.x - dir.x * 2.2, zz = dm.pos.z - dir.z * 2.2;
          st.place(zf, zx, zz);
          zf.faceYaw = null; zf.yaw = Math.atan2(dm.pos.x - zx, dm.pos.z - zz);
          dm.yaw = zf.yaw + Math.PI;
          st.shot([zx + dir.z * 4 - dir.x * 1.5, 1.8, zz - dir.x * 4 - dir.z * 1.5], [dm.pos.x, 1.3, dm.pos.z], 2.5);
          await st.say('zhangFei', 'Deng Mao! Your head is mine!', { frame: false });
          zf.combat.drawn = true; zf.model.setDrawn(true);
          zf.model.anim.play('polearm_thrust', { speed: 0.8 });
          await wait(520);
          dm.die(zf);
          g.combat.blood.burst(dm.pos.clone().setY(dm.pos.y + 1.3), 40, zf.yaw);
          g.audio.play('hit', dm.pos);
          await wait(900);
          await st.say('narrator', 'Zhang Fei levelled his serpent spear and drove it through Deng Mao\'s chest. The rebel fell from his horse.', { frame: false });
          g.cutscene.freezeAI = false;
        });
      }
      await st.waitFor(() => alive(wave).length <= 3);
      // Cheng Yuanzhi
      const f2 = front(48);
      const cy = g.spawnNPC({ id: 'chengYuanzhi', figure: 'chengYuanzhi', name: 'Cheng Yuanzhi', cn: '程遠志', title: 'Yellow Turban commander', role: 'yellowTurban', faction: 'yellowTurban', x: f2.x, z: f2.z, weapon: 'ji', body: 'leatherArmor', hp: 420, stats: { str: 15, vit: 14, polearm: 12, block: 10 }, brain: { archetype: 'officer', fighter: true, mode: 'wander', aggroRange: 60 } });
      cy.ai.area = { x: field.x, z: field.z, r: 5 }; cy.tags.add('officer'); cy.tags.add('alwaysActive');
      wave = spawnWave(12, front(58).x, front(58).z, cy);
      g.ui.subtitle('Cheng Yuanzhi', 'You killed Deng Mao?! I will grind your bones to dust!', 4);
      await st.waitFor(() => g.player.distTo(cy) < 12 || cy.hp < cy.hpMax * 0.7 || alive(wave).length <= 5);
      if (!cy.dead) {
        await st.cutscene(async () => {
          g.cutscene.freezeAI = true;
          const gx = cy.pos.x - dir.x * 2.4, gz = cy.pos.z - dir.z * 2.4;
          st.place(gy, gx, gz);
          gy.faceYaw = null; gy.yaw = Math.atan2(cy.pos.x - gx, cy.pos.z - gz);
          cy.yaw = gy.yaw + Math.PI;
          st.shot([gx - dir.z * 4, 1.6, gz + dir.x * 4], [(gx + cy.pos.x) / 2, 1.5, (gz + cy.pos.z) / 2], 2.5);
          await st.say('narrator', 'Seeing his lieutenant fall, Cheng Yuanzhi whipped up his horse and came on, brandishing his halberd. Guan Yu rode out to meet him.', { frame: false });
          gy.combat.drawn = true; gy.model.setDrawn(true);
          gy.model.anim.play('polearm_right', { speed: 0.75 });
          await wait(650);
          cy.die(gy);
          g.combat.blood.burst(cy.pos.clone().setY(cy.pos.y + 1.4), 50, gy.yaw);
          g.audio.play('hit', cy.pos);
          await wait(1000);
          await st.say('narrator', 'With a single sweep of the Green Dragon Crescent Blade, Guan Yu cut Cheng Yuanzhi in two.', { frame: false });
          g.cutscene.freezeAI = false;
        });
      }
      // the rebels break
      g.audio.play('cheer');
      for (const c of alive(wave)) { c.ai.fleeing = true; }
      g.ui.subtitle('Liu Bei', 'Their leaders are dead! After them — to their camp!', 4);
      if (!done(g, 'q_daxing', 'hold')) g.quests.complete('q_daxing', 'hold');
      for (const c of [...allies, ...vols]) { c.ai.mode = 'follow'; c.ai.aggroRange = 30; }
      const campers = g.population.camps.get('ytcamp') || [];
      await st.waitFor(() => alive(campers).length <= 2 && st.near(400, -300, 60));
      for (const c of alive(campers)) c.ai.surrender?.();
      g.setFlag('cleared_ytcamp', true);
      g.quests.complete('q_daxing', 'camp');
      off();
      g.audio.setMood('peace');
      g.progression.addMerit(150, 'victory at Daxing Mountain');
      g.progression.setRank('shizhang');
      g.progression.addRenown(10);
      g.setFlag('ch1_daxing_won', true);
      await st.cutscene(async () => {
        const c = { x: 400, z: -300 };
        st.shot([c.x + 10, 4, c.z + 16], [c.x, 2, c.z], 1.5);
        g.audio.play('cheer');
        await st.say('liuBei', 'Victory! The rebels of Zhuo are scattered like chaff in the wind!', { frame: false });
        await st.say('zouJing', 'A great victory. The Governor must hear of this at once. {name} — you fought like a tiger. You are a section chief now: ten men will call you shizhang.', { frame: false });
        await st.say('zhangFei', 'HAHAHA! Did you see Deng Mao\'s face? Like a fish on a spear! Wine! We need wine!', { frame: false });
      });
      for (const v of vols) if (!v.dead) { v.ai.mode = 'wander'; v.ai.area = { x: v.pos.x, z: v.pos.z, r: 10 }; }
    },
  },

  // ======================================================== 8. The Governor's Feast
  m8_feast: {
    chapter: 1,
    title: "The Governor's Feast",
    async setup(st, g) {
      const S = st.S;
      const h = S.yamenHall;
      st.dismiss('zouJing');
      const ly = st.actor('liuYan', { figure: 'liuYan', name: 'Liu Yan', cn: '劉焉', title: 'Inspector of You Province', faction: 'han', x: h.x, z: h.z + 0.5, weapon: 'fists', brain: { mode: 'idle' } });
      ly.facePoint(h.x, h.z + 10);
      const lb = liuBei(st, h.x - 1.5, h.z + 5), gy = guanYu(st, h.x - 3, h.z + 5.5, { weapon: 'guandao' }), zf = zhangFei(st, h.x + 1.5, h.z + 5.5, { weapon: 'serpentSpear' });
      for (const c of [lb, gy, zf]) { c.ai.mode = 'idle'; c.facePoint(h.x, h.z); }
    },
    async run(st, g) {
      const S = st.S;
      const h = S.yamenHall;
      g.quests.start({
        id: 'q_feast', main: true, title: "The Governor's Feast", cn: '劉焉宴',
        desc: 'Liu Yan, Inspector of You Province and a member of the imperial clan, summons the heroes of Daxing Mountain to the county office.',
        objectives: [{ id: 'go', text: 'Present yourself at the Zhuo county office', marker: { x: h.x, z: h.z + 5 }, check: () => st.near(h.x, h.z + 5, 6) }],
        chronicle: 'Liu Yan feasted the victors. News came that Qingzhou was besieged and that Lu Zhi fought Zhang Jiao at Guangzong.',
      });
      await st.waitFor(() => done(g, 'q_feast', 'go'));
      const ly = g.entities.get('liuYan');
      await st.cutscene(async () => {
        st.teleportPlayer(h.x + 0.2, h.z + 5.2, Math.PI);
        st.shot([h.x + 3, 1.8, h.z + 8], [h.x, 1.7, h.z + 1], 2);
        await st.say('liuYan', 'So these are the heroes of Daxing Mountain. Liu Xuande — I am told we share an ancestor. The dynasty is fortunate to have such kinsmen.', { frame: false });
        await st.say('liuBei', 'Your Excellency is too kind. The victory belongs to the brave men of Zhuo — like {name} here, a farmer of Lousang who stood in the front rank.', { frame: false });
        await st.say('liuYan', 'A farmer! Hah. When the dynasty is in peril, heroes rise from the fields. Take these rewards, and my thanks.', { frame: false });
        g.player.inventory.coins += 300;
        g.giveItem('dao');
        g.giveItem('leatherArmor');
        await st.say('herald', 'Urgent dispatch! The Grand Administrator of Qingzhou, Gong Jing, is besieged by the Yellow Turbans and begs for aid! And at Guangzong, General Lu Zhi has Zhang Jiao himself surrounded!', { frame: false });
        await st.say('liuBei', 'Lu Zhi was my teacher. I cannot sit idle while he fights. Your Excellency — give us leave to go south.', { frame: false });
        await st.say('liuYan', 'Go, then, with my blessing. Zou Jing will relieve Qingzhou; you, Xuande, take your volunteers to Guangzong.', { frame: false });
      });
      g.quests.finish('q_feast');
      g.setFlag('ch1_complete', true);
      g.save(true);
      await st.fadeOut(1.5);
      await g.ui.chapterCard('第一章 終', '桃園結義', 'End of Chapter I', `Merit ${g.progression.merit} · Virtue ${g.progression.virtue} · Rank: ${g.progression.rankDef().name}. The road south leads to Guangzong, where Zhang Jiao awaits.`, 5);
      await st.fadeIn(1);
    },
    next: 'ch2_start',
  },
};
