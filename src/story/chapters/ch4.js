// Chapter IV · 割據 — A Realm of One's Own (Xu Province, 194–198 AD)
// Tao Qian yields Xu Province to Liu Bei; Lü Bu's betrayal; the parting of ways.
import { wait } from '../../ui/UI.js';
import { BattleKit, alive } from '../BattleKit.js';
import { liuBei, brothers, joinFight, standDown } from '../cast.js';

const done = (g, q, o) => !!g.quests.get(q)?.objs.find((x) => x.id === o)?.done;

function officers(st, g) {
  const hall = st.S.xiaopei_hall || st.S.yamenHall;
  const cd = st.actor('chenDeng', { figure: 'chenDeng', name: 'Chen Deng', cn: '陳登', title: 'Yuanlong 元龍, Xu Province official', faction: 'militia', x: hall.x + 2.5, z: hall.z + 2, weapon: 'fists', brain: { mode: 'idle' } });
  cd.tags.add('officer');
  return { cd };
}

export const CHAPTER4 = {
  // ======================================================== 1. The Lord of Pei
  ch4_start: {
    chapter: 4,
    title: 'The Lord of Pei',
    async setup(st, g, o) {
      if (g.regionId !== 'xuzhou') {
        await g.travel('xuzhou', null, { msg: 'Xu Province, 194 AD…' });
        g.time.setDate(194, 10, 2, 10);
        g.time.customEra = { name: 'Xingping', cn: '興平', from: 194 };
        if (!o.restore) {
          await g.ui.chapterCard('第四章', '三讓徐州', 'Chapter IV · Thrice Yielding Xu Province', 'Cao Cao ravaged Xu Province to avenge his murdered father. Liu Bei came to its defence. Now the old governor Tao Qian lies dying — and three times he has begged Liu Bei to take his province.', 6);
        }
      }
      const hall = st.S.xiaopei_hall || st.S.yamenHall;
      const b = brothers(st, hall.x, hall.z + 1.2, 0);
      b.lb.facePoint(hall.x, hall.z + 10);
      officers(st, g);
      if (!o.restore) st.teleportPlayer(hall.x, hall.z + 9, Math.PI);
    },
    async run(st, g) {
      const hall = st.S.xiaopei_hall || st.S.yamenHall;
      const garrison = st.S.garrison_command || { x: 300, z: -30 };
      const bandits = g.world.region.settlements.find((s) => s.id === 'banditEast');
      g.quests.start({
        id: 'q_xz_pei', main: true, title: 'The Lord of Pei', cn: '沛相',
        desc: 'Liu Bei, now Governor of Xu Province, has summoned you to the hall at Xiaopei.',
        objectives: [
          { id: 'hall', text: 'Answer Liu Bei\'s summons in the Xiaopei hall', marker: { x: hall.x, z: hall.z + 3 }, check: () => st.near(hall.x, hall.z + 3, 5) },
          { id: 'troops', text: 'Raise troops at your garrison east of the city (talk to the recruiting officer)', hidden: true, marker: { x: garrison.x, z: garrison.z } },
          { id: 'bandits', text: 'Destroy the Mount Mang bandits who prey on the salt road', hidden: true, marker: { x: bandits.x, z: bandits.z } },
          { id: 'report', text: 'Report to Chen Deng', hidden: true, marker: () => g.entities.get('chenDeng')?.pos },
        ],
        chronicle: 'Liu Bei, Governor of Xu, made you Chancellor of Pei. You raised troops and cleared the Mount Mang bandits.',
      });
      await st.waitFor(() => done(g, 'q_xz_pei', 'hall'));
      await st.cutscene(async () => {
        st.shot([hall.x + 3, 2, hall.z + 6], [hall.x, 1.7, hall.z + 1], 2);
        await st.say('liuBei', '{name}. Ten years ago you were a farmer\'s son with a staff. Now half of You Province knows the name of the man who stood against Lü Bu.', { frame: false });
        await st.say('liuBei', 'Tao Qian is gone. I have accepted Xu Province — Heaven help me. I cannot govern it alone. I name you Chancellor of Pei. Xiaopei is yours to hold.', { frame: false });
        await st.say('chenDeng', 'Chen Yuanlong, at your service. The granaries are half empty, the salt road is plagued by bandits from Mount Mang, and the garrison is thin. A new lord has much to do.', { frame: false });
        const r = await st.choose('player', '', [
          { t: '“I will not fail you, elder brother Xuande.”', v: 0, tag: 'Loyalty' },
          { t: '“Pei will be the best-governed land in the empire.”', v: 1, tag: 'Ambition' },
        ]);
        if (r === 1) g.setFlag('ambition', (g.flags.ambition || 0) + 1);
        await st.say('zhangFei', 'Hah! Our little farmer is a lord now! Remember who taught you to hold a spear!', { frame: false });
      });
      g.progression.setRank('taishou');
      g.progression.addRenown(10);
      g.player.inventory.coins += 800;
      g.ui.notify('You are now Chancellor of Pei · 沛相 (rank of Grand Administrator).', 'merit');
      for (const o of g.quests.get('q_xz_pei').objs) o.hidden = false;
      // recruiting officer
      const rec = st.actor('recruiter', { name: 'Recruiting Officer Sun Qian', cn: '孫乾', title: 'Gongyou 公祐, of Beihai', faction: 'militia', x: garrison.x, z: garrison.z + 3, weapon: 'dao', body: 'leatherArmor', brain: { mode: 'idle' } });
      st.talkHandlers.set('recruiter', async () => {
        g.dialogue.begin();
        const cap = g.progression.rankDef().troops;
        const n = g.army.alive().length;
        const r = await st.choose('recruiter', `My lord! Volunteers wait at the gate — hungry men, but willing. Twenty coins each to equip them. You command ${n} of ${cap}.`, [
          { t: 'Recruit 4 spearmen (80 coins)', v: 4, if: () => n + 4 <= cap },
          { t: 'Recruit 8 spearmen (160 coins)', v: 8, if: () => n + 8 <= cap },
          { t: 'Equip my men with iron lamellar (600 coins)', v: 'armor', if: () => g.army.kit.body !== 'lamellar' },
          { t: 'Not now.', v: 0 },
        ]);
        if (typeof r === 'number' && r > 0) {
          const cost = r * 20;
          if (g.player.inventory.coins >= cost) { g.player.inventory.coins -= cost; g.army.kit = { ...g.army.kit, look: 'soldier', body: g.army.kit.body }; g.army.recruit(r); g.quests.complete('q_xz_pei', 'troops'); g.progression.gain('leadership', 4); }
          else await st.say('recruiter', 'The treasury… er, your purse, my lord, is too light.');
        } else if (r === 'armor') {
          if (g.player.inventory.coins >= 600) { g.player.inventory.coins -= 600; g.army.kit.body = 'lamellar'; g.army.kit.head = 'ironHelmet'; const k = g.army.alive().length; g.army.dismissAll(); g.army.recruit(k); g.ui.notify('Your troops now wear iron lamellar.', 'item'); }
        }
        g.dialogue.end();
        return true;
      });
      await st.waitFor(() => done(g, 'q_xz_pei', 'troops'));
      await st.waitFor(() => g.entities.withTag('banditEast').every((c) => c.dead || c.ai?.surrendered || c.faction === 'civilian'));
      g.setFlag('cleared_banditEast', true);
      g.quests.complete('q_xz_pei', 'bandits');
      st.talkHandlers.set('chenDeng', async () => {
        if (!done(g, 'q_xz_pei', 'bandits') || done(g, 'q_xz_pei', 'report')) return false;
        await st.convo([
          ['chenDeng', 'The salt road is open, and the merchants already sing your praises. Taxes will flow again.'],
          ['chenDeng', 'But I bring troubling news. Lü Bu — whom Lord Liu sheltered here when he had nowhere else to go — has been seen with Yuan Shu\'s envoys. A wolf cannot be fed into a dog.'],
        ]);
        g.quests.complete('q_xz_pei', 'report');
        return true;
      });
      await st.waitFor(() => g.quests.isDone('q_xz_pei'));
      g.progression.addMerit(120, 'governing Pei');
    },
  },

  // ======================================================== 2. The Wolf at the Gate
  ch4_lubu: {
    chapter: 4,
    title: 'The Wolf at the Gate',
    async setup(st, g) {
      officers(st, g);
      g.time.setDate(196, 6, 15, 7);
      g.time.customEra = { name: "Jian'an", cn: '建安', from: 196 };
    },
    async run(st, g) {
      const gateOut = st.S.xiaopeiGate_north_out || { x: 0, z: -145 };
      const cd = g.entities.get('chenDeng');
      await st.cutscene(async () => {
        st.shot([cd.pos.x + 3, 1.8, cd.pos.z + 3], [cd.pos.x, 1.6, cd.pos.z], 2.5);
        await st.say('chenDeng', 'My lord! While Liu Xuande fought Yuan Shu in the south, Lü Bu seized Xiapi in the night. Zhang Fei was drunk on watch — the city fell without a fight!', { frame: false });
        await st.say('chenDeng', 'Now Lü Bu sends Gao Shun and his Trap Crushers to take Xiaopei. They come from the north road.', { frame: false });
      });
      g.quests.start({
        id: 'q_xz_lubu', main: true, title: 'The Wolf at the Gate', cn: '陷陣營',
        desc: 'Lü Bu has betrayed Liu Bei and taken Xiapi. His general Gao Shun marches on Xiaopei with the elite "Trap Crushers" (陷陣營).',
        objectives: [
          { id: 'form', text: 'Form your troops outside the north gate', marker: { x: gateOut.x, z: gateOut.z - 20 }, check: () => st.near(gateOut.x, gateOut.z - 20, 16) },
          { id: 'hold', text: 'Break Gao Shun\'s assault', hidden: true, count: 20 },
          { id: 'gao', text: 'Defeat Gao Shun', hidden: true },
        ],
        chronicle: 'At the north gate of Xiaopei you broke Gao Shun\'s Trap Crushers. Zhang Liao withdrew in good order — a general worth remembering.',
      });
      await st.waitFor(() => done(g, 'q_xz_lubu', 'form'));
      for (const o of g.quests.get('q_xz_lubu').objs) o.hidden = false;
      const kit = new BattleKit(g, 196);
      const front = { x: gateOut.x, z: gateOut.z - 20 };
      const line = kit.line('militia', 12, front.x, front.z + 3, Math.PI, { aggro: 35 });
      g.army.order = 'follow'; g.army.applyOrder();
      g.audio.play('horn');
      let k = 0;
      const off = g.events.on('death', (c) => { if (c.faction === 'enemy') { k++; g.quests.progress('q_xz_lubu', 'hold', 1); } });
      const w1 = kit.wave('enemy', 12, front.x, front.z - 70, front, { hp: 100 });
      await st.waitFor(() => alive(w1).length <= 4);
      const gao = kit.officer({ id: 'gaoShun', figure: 'gaoShun', name: 'Gao Shun', cn: '高順', title: 'Commander of the Trap Crushers', faction: 'enemy', role: 'soldier', x: front.x, z: front.z - 60, weapon: 'dao', shield: true, body: 'generalArmor', hp: 700, stats: { str: 15, vit: 16, blade: 14, block: 14 } });
      const zl = kit.officer({ id: 'zhangLiao', figure: 'zhangLiao', name: 'Zhang Liao', cn: '張遼', title: 'Wenyuan 文遠', faction: 'enemy', role: 'soldier', x: front.x + 20, z: front.z - 65, weapon: 'ji', body: 'generalArmor', hp: 900, stats: { str: 16, vit: 16, polearm: 16, block: 14 } });
      zl.essential = true;
      const w2 = kit.wave('enemy', 12, front.x, front.z - 70, front, { hp: 110, arch: 'soldier', tune: { skill: 0.6, block: 0.65 } });
      g.ui.subtitle('Gao Shun', 'Trap Crushers! Break their line!', 4);
      await st.waitFor(() => gao.dead);
      off();
      g.quests.complete('q_xz_lubu', 'hold');
      g.quests.complete('q_xz_lubu', 'gao');
      kit.rout([...w1, ...w2]);
      g.ui.subtitle('Zhang Liao', 'Gao Shun has fallen. Withdraw in order! — You there, lord of Pei. We will meet again.', 5);
      zl.ai.fleeing = true;
      await st.waitTime(4);
      g.entities.remove(zl);
      g.progression.addMerit(250, 'breaking the Trap Crushers');
      g.progression.addRenown(12);
      g.audio.play('cheer');
      for (const c of line) if (!c.dead) { c.ai.mode = 'wander'; c.ai.area = { x: c.pos.x, z: c.pos.z, r: 10 }; }
      kit.clear();
      void wait; void joinFight; void standDown;
    },
  },

  // ======================================================== 3. Different Roads
  ch4_parting: {
    chapter: 4,
    title: 'Different Roads',
    async setup(st, g) {
      const hall = st.S.xiaopei_hall || st.S.yamenHall;
      const b = brothers(st, hall.x, hall.z + 1.5, Math.PI);
      b.lb.facePoint(hall.x, hall.z + 10);
      officers(st, g);
    },
    async run(st, g) {
      const hall = st.S.xiaopei_hall || st.S.yamenHall;
      g.quests.start({
        id: 'q_xz_part', main: true, title: 'Different Roads', cn: '分道',
        desc: 'Liu Bei has lost Xiapi and been beaten by Yuan Shu. He has come to Xiaopei.',
        objectives: [{ id: 'go', text: 'Meet Liu Bei in the hall', marker: { x: hall.x, z: hall.z + 3 }, check: () => st.near(hall.x, hall.z + 3.5, 5) }],
        chronicle: 'Liu Bei went to Cao Cao at Xuchang. With Cao Cao you besieged Lü Bu at Xiapi; Lü Bu was captured and hanged at the White Gate Tower. The court named you Governor of Xu Province. You were a lord in your own right.',
      });
      await st.waitFor(() => done(g, 'q_xz_part', 'go'));
      await st.cutscene(async () => {
        st.shot([hall.x - 3, 2, hall.z + 6], [hall.x, 1.7, hall.z + 1.5], 2);
        await st.say('liuBei', 'I have lost Xiapi, and my family is Lü Bu\'s prisoner. Yuan Shu presses from the south. I must go to Cao Cao at Xuchang — he holds the Emperor now, and he has offered me shelter.', { frame: false });
        await st.say('zhangFei', 'It was my fault. I drank. I… I lost the city.', { frame: false });
        const r = await st.choose('liuBei', '{name}. Will you come with us to Xuchang?', [
          { t: '“Where you go, I go, elder brother.”', v: 'follow', tag: 'Loyalty' },
          { t: '“Someone must hold Xu for the people. Let me stay.”', v: 'stay', tag: 'Duty' },
          { t: '“I have my own road now, Xuande.”', v: 'own', tag: 'Ambition' },
        ]);
        if (r === 'follow') {
          await st.say('liuBei', 'No. Your loyalty moves me more than I can say — but if you come, Pei falls to Lü Bu, and ten thousand families with it. Stay. That is the service I ask of you.', { frame: false });
          g.progression.addVirtue(3);
          g.setFlag('liuBond', 'brother');
        } else if (r === 'stay') {
          await st.say('liuBei', 'Spoken like a true shepherd of the people. Hold Pei, and one day we will meet again as equals.', { frame: false });
          g.progression.addVirtue(2);
          g.setFlag('liuBond', 'friend');
        } else {
          await st.say('guanYu', 'Hmph.', { frame: false });
          await st.say('liuBei', 'Every man must follow the Mandate as Heaven shows it to him. I will not hold you back. But do not forget the peach garden, {name}.', { frame: false });
          g.setFlag('liuBond', 'rival');
          g.setFlag('ambition', (g.flags.ambition || 0) + 2);
        }
        await st.say('narrator', 'In the winter of 198, Cao Cao and your army besieged Lü Bu at Xiapi. Chen Deng opened the city\'s secrets to you; the Si and Yi rivers were turned upon the walls. Lü Bu was captured and hanged at the White Gate Tower. Gao Shun died unbowed; Zhang Liao surrendered to Cao Cao.', { frame: false });
        await st.say('narrator', 'Cao Cao, who now spoke with the Emperor\'s voice, had you named Governor of Xu Province — to bind you to him. But a governor with an army answers to no one.', { frame: false });
      });
      g.quests.finish('q_xz_part');
      g.progression.setRank('zhoumu');
      g.progression.addMerit(300, 'the fall of Lü Bu');
      g.time.setDate(199, 1, 5, 10);
      for (const id of ['liuBei', 'guanYu', 'zhangFei']) st.dismiss(id);
      await st.fadeOut(1.5);
      await g.ui.chapterCard('第四章 終', '一方之主', 'End of Chapter IV', 'You are Governor of Xu Province — master of your own land and army. North of the Yellow River, Yuan Shao gathers a host of a hundred thousand. In Xuchang, Cao Cao holds the Son of Heaven. The deer is loose, and every hunter in the realm gives chase.', 6);
      void liuBei;
    },
    next: 'ch5_campaign',
  },
};
