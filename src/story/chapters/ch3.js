// Chapter III · 虎牢關 — Tiger Trap Pass (190 AD)
// The coalition against Dong Zhuo: Hua Xiong's challenge, the three brothers against Lü Bu,
// and the burning of Luoyang — where the Imperial Jade Seal is found.
import { wait } from '../../ui/UI.js';
import { BattleKit, alive } from '../BattleKit.js';
import { brothers, joinFight, standDown } from '../cast.js';

const done = (g, q, o) => !!g.quests.get(q)?.objs.find((x) => x.id === o)?.done;

function lords(st) {
  const c = st.S.coalition_command;
  const ys = st.actor('yuanShao', { figure: 'yuanShao', name: 'Yuan Shao', cn: '袁紹', title: 'Leader of the Coalition', faction: 'han', x: c.x, z: c.z + 0.5, weapon: 'jian', body: 'generalArmor', brain: { mode: 'idle' } });
  const cc = st.actor('caoCao', { figure: 'caoCao', name: 'Cao Cao', cn: '曹操', title: 'Mengde 孟德, General of Vehement Might', faction: 'han', x: c.x + 3.5, z: c.z + 2.5, weapon: 'jian', body: 'generalArmor', brain: { mode: 'idle' } });
  const sj = st.actor('sunJian', { figure: 'sunJian', name: 'Sun Jian', cn: '孫堅', title: 'Wentai 文臺, Administrator of Changsha', faction: 'han', x: c.x - 3.5, z: c.z + 2.5, weapon: 'dao', body: 'generalArmor', brain: { mode: 'idle' } });
  const gz = st.actor('gongsunZan', { figure: 'gongsunZan', name: 'Gongsun Zan', cn: '公孫瓚', title: 'the White Horse General', faction: 'han', x: c.x - 5.5, z: c.z + 4.5, weapon: 'spear', body: 'generalArmor', brain: { mode: 'idle' } });
  for (const x of [ys, cc, sj, gz]) x.facePoint(c.x, c.z + 10);
  return { ys, cc, sj, gz };
}

export const CHAPTER3 = {
  // ======================================================== 1. The Coalition
  ch3_start: {
    chapter: 3,
    title: 'The Eighteen Lords',
    async setup(st, g, o) {
      if (g.regionId !== 'hulao') {
        await g.travel('hulao', null, { msg: 'Six years pass… The road to Hulao Pass.' });
        g.time.setDate(190, 2, 10, 10);
        g.time.customEra = { name: 'Chuping', cn: '初平', from: 190 };
        if (!o.restore) {
          await g.ui.chapterCard('第三章', '虎牢關', 'Chapter III · Tiger Trap Pass', '189: Emperor Ling dies. The eunuchs murder the regent He Jin and are slaughtered in turn. The frontier general Dong Zhuo seizes Luoyang, deposes the boy emperor and enthrones his brother Liu Xie. 190: Cao Cao calls the lords of the east to arms. Eighteen armies gather before Hulao Pass.', 7);
        }
      }
      lords(st);
      const c = st.S.coalition_command;
      brothers(st, c.x + 1, c.z + 9, Math.PI);
      if (g.army.alive().length < 8) g.army.recruit(8 - g.army.alive().length);
    },
    async run(st, g) {
      const c = st.S.coalition_command;
      const cc = g.entities.get('caoCao');
      g.quests.start({
        id: 'q_hl_council', main: true, title: 'The Eighteen Lords', cn: '十八路諸侯',
        desc: 'The coalition against Dong Zhuo has gathered east of Hulao Pass under Yuan Shao. Liu Bei has come with Gongsun Zan.',
        objectives: [
          { id: 'cao', text: 'Speak with Cao Cao', marker: () => cc.pos },
          { id: 'council', text: 'Attend the war council', hidden: true, marker: { x: c.x, z: c.z + 5 }, check: () => done(g, 'q_hl_council', 'cao') && st.near(c.x, c.z + 5, 5) },
        ],
        chronicle: 'At the coalition camp before Hulao Pass you met Cao Cao, Yuan Shao and Sun Jian.',
      });
      st.talkHandlers.set('caoCao', async () => {
        if (done(g, 'q_hl_council', 'cao')) { await st.convo([['caoCao', 'Yuan Shao has a hundred advisers and cannot choose between them. Watch him, {name} — that is what indecision looks like.']]); return true; }
        g.dialogue.begin();
        await st.say('caoCao', 'You serve with Liu Xuande? The farmer who fought at Guangzong — I have heard of you. Cao Mengde does not forget capable men.');
        const r = await st.choose('caoCao', 'Tell me — why do you fight? For Han? For Liu Bei? For yourself?', [
          { t: 'For the people. The Han must be made worthy of them again.', v: 0 },
          { t: 'For my brothers-in-arms.', v: 1 },
          { t: 'For my own name. A peasant can rise in times like these.', v: 2 },
        ]);
        if (r === 2) { await st.say('caoCao', 'Ha! Honest ambition. I prefer it to pious lies. “Better that I wrong the world than the world wrong me” — remember that, farmer.'); g.setFlag('caoRespect', true); }
        else if (r === 0) await st.say('caoCao', 'A noble answer. Nobility is expensive. I hope you can afford it.');
        else await st.say('caoCao', 'Loyalty. The rarest coin of our age.');
        g.dialogue.end();
        g.quests.complete('q_hl_council', 'cao');
        for (const o of g.quests.get('q_hl_council').objs) o.hidden = false;
        return true;
      });
      await st.waitFor(() => g.quests.isDone('q_hl_council'));
      await st.cutscene(async () => {
        st.shot([c.x + 5, 1.9, c.z + 7], [c.x, 1.6, c.z + 1], 2);
        await st.say('yuanShao', 'My lords. Dong Zhuo\'s general Hua Xiong holds the ground before Sishui and Hulao. He has already killed Bao Xin\'s brother and two of our officers.', { frame: false });
        await st.say('sunJian', 'He mauled my vanguard too. My red headscarf is all that was left on the field — I had my officer Zu Mao wear it to draw them off.', { frame: false });
        await st.say('yuanShao', 'If only my generals Yan Liang or Wen Chou were here! Then we should have nothing to fear from Hua Xiong.', { frame: false });
      });
    },
  },

  // ======================================================== 2. While the Wine Is Warm
  ch3_huaxiong: {
    chapter: 3,
    title: 'While the Wine Is Warm',
    async setup(st, g) {
      lords(st);
      const c = st.S.coalition_command;
      brothers(st, c.x + 1, c.z + 9, Math.PI);
    },
    async run(st, g) {
      const c = st.S.coalition_command;
      const gy = g.entities.get('guanYu'), cc = g.entities.get('caoCao'), ys = g.entities.get('yuanShao');
      await st.cutscene(async () => {
        st.shot([c.x + 4, 1.8, c.z + 9], [gy.pos.x, 1.7, gy.pos.z], 2);
        await st.say('scout', 'Hua Xiong comes to the camp gate with iron cavalry, cursing the lords and challenging any man to fight!', { frame: false });
        await st.say('guanYu', 'I will go and bring you Hua Xiong\'s head.', { frame: false });
        await st.say('yuanShao', 'Who is this? … A mounted archer under Liu Bei? You insult us! Would you have Hua Xiong laugh at the coalition for sending an archer against him?', { frame: false });
        await st.say('caoCao', 'Calm yourself, Benchu. This man has an extraordinary bearing. Hua Xiong cannot know he is only an archer. Let him try. — Here: a cup of hot wine before you ride.', { frame: false });
        await st.say('guanYu', 'Pour it. I will drink it when I return.', { frame: false });
        const r = await st.choose('guanYu', '{name}. Ride at my stirrup, and keep Hua Xiong\'s guards off my back.', [
          { t: 'I ride with you, General Guan.', v: 0 },
        ]);
        void r;
      });
      const kit = new BattleKit(g, 190);
      const fld = { x: 150, z: 0 };
      const hx = kit.officer({ id: 'huaXiong', figure: 'huaXiong', name: 'Hua Xiong', cn: '華雄', title: 'Chief Commander of Dong Zhuo', faction: 'dongZhuo', role: 'soldier', x: fld.x - 10, z: fld.z, weapon: 'dao', body: 'generalArmor', hp: 600, stats: { str: 17, vit: 16, blade: 14, block: 12 }, brain: { archetype: 'officer', fighter: true, mode: 'guard', aggroRange: 4 } });
      hx.ai.post = { x: fld.x - 10, z: fld.z };
      const riders = kit.wave('dongZhuo', 10, fld.x - 18, fld.z + 8, fld);
      g.quests.start({
        id: 'q_hl_hua', main: true, title: 'While the Wine Is Warm', cn: '溫酒斬華雄',
        desc: 'Guan Yu rides out against Hua Xiong. Keep Dong Zhuo\'s riders off him.',
        objectives: [{ id: 'guards', text: 'Defeat Hua Xiong\'s guard', count: 10, check: () => 10 - alive(riders).length, marker: { x: fld.x, z: fld.z } }],
        chronicle: 'Guan Yu cut down Hua Xiong and returned before his cup of wine had cooled. (History records that it was Sun Jian who slew Hua Xiong at Yangren; the Romance gives the deed to Guan Yu.)',
      });
      joinFight([gy], g.player, 30);
      st.teleportPlayer(fld.x + 30, fld.z + 3, -Math.PI / 2);
      g.audio.play('drum');
      await st.waitFor(() => alive(riders).length <= 2);
      g.quests.complete('q_hl_hua', 'guards');
      kit.rout(riders);
      await st.cutscene(async () => {
        g.cutscene.freezeAI = true;
        const gx = hx.pos.x + 2.5, gz = hx.pos.z;
        st.place(gy, gx, gz); gy.yaw = -Math.PI / 2; gy.faceYaw = null; hx.yaw = Math.PI / 2;
        st.shot([gx + 1, 1.6, gz + 5], [(gx + hx.pos.x) / 2, 1.5, gz], 2.5);
        await st.say('huaXiong', 'Another fool comes to die? Who are you?', { frame: false });
        await st.say('guanYu', 'Guan Yunchang.', { frame: false });
        gy.combat.drawn = true; gy.model.setDrawn(true);
        gy.model.anim.play('polearm_overhead', { speed: 0.8 });
        await wait(620);
        hx.die(gy);
        g.combat.blood.burst(hx.pos.clone().setY(hx.pos.y + 1.5), 50, gy.yaw);
        g.audio.play('hit', hx.pos);
        await wait(900);
        await st.say('narrator', 'The lords heard drums shake the earth and shouts like the heavens splitting. Then the bells on Guan Yu\'s horse jingled back into camp — and he threw Hua Xiong\'s head on the ground. The wine was still warm.', { frame: false });
        g.cutscene.freezeAI = false;
      });
      standDown([gy]);
      g.quests.finish('q_hl_hua');
      g.progression.addMerit(100, 'the death of Hua Xiong');
      g.progression.addRenown(8);
      kit.clear();
    },
  },

  // ======================================================== 3. Three Heroes Fight Lü Bu
  ch3_lubu: {
    chapter: 3,
    title: 'Three Heroes Fight Lü Bu',
    async setup(st, g) {
      lords(st);
      const c = st.S.coalition_command;
      brothers(st, c.x + 1, c.z + 9, Math.PI);
    },
    async run(st, g) {
      const east = st.S.pass_east;
      const kit = new BattleKit(g, 191);
      const lb = g.entities.get('liuBei'), gy = g.entities.get('guanYu'), zf = g.entities.get('zhangFei'), gz = g.entities.get('gongsunZan');
      g.quests.start({
        id: 'q_hl_lubu', main: true, title: 'Three Heroes Fight Lü Bu', cn: '三英戰呂布',
        desc: 'Dong Zhuo has sent his adopted son Lü Bu — the greatest warrior under Heaven — out of Hulao Pass with the Bingzhou cavalry.',
        objectives: [
          { id: 'form', text: 'Form up with Gongsun Zan\'s army before the pass', marker: { x: east.x + 60, z: east.z } , check: () => st.near(east.x + 60, east.z, 18) },
          { id: 'hold', text: 'Hold against the Bingzhou cavalry', hidden: true, count: 14 },
          { id: 'lubu', text: 'Survive Lü Bu', hidden: true },
        ],
        chronicle: 'Before Hulao Pass, Liu Bei, Guan Yu and Zhang Fei fought Lü Bu together until he retreated into the pass. You held the flank against his Bingzhou riders — and crossed blades with Lü Bu himself.',
      });
      await st.waitFor(() => done(g, 'q_hl_lubu', 'form'));
      for (const o of g.quests.get('q_hl_lubu').objs) o.hidden = false;
      const line = kit.line('han', 16, east.x + 55, east.z, -Math.PI / 2, { aggro: 35 });
      joinFight([lb, gy, zf], g.player, 30);
      st.setTime(15);
      g.world.settlements.openGate();
      g.audio.play('horn');
      g.ui.subtitle('Scout', 'The gate opens! Lü Bu rides out — the purple-gold crown, the Sky Piercer halberd, on Red Hare!', 5);
      let kills = 0;
      const off = g.events.on('death', (c) => { if (c.faction === 'dongZhuo') { kills++; g.quests.progress('q_hl_lubu', 'hold', 1); } });
      const w1 = kit.wave('bingzhou', 10, east.x + 5, east.z, { x: east.x + 50, z: east.z });
      await st.waitFor(() => alive(w1).length <= 3);
      const w2 = kit.wave('bingzhou', 8, east.x + 5, east.z, { x: east.x + 50, z: east.z });
      const lubu = kit.officer({ id: 'luBu', figure: 'luBu', name: 'Lü Bu', cn: '呂布', title: 'Fengxian 奉先 — the Flying General', faction: 'dongZhuo', role: 'soldier', x: east.x + 6, z: east.z + 4, weapon: 'fangtianji', body: 'generalArmor', hp: 3000, stats: { str: 22, vit: 22, agi: 16, polearm: 20, block: 18 }, brain: { archetype: 'hero', fighter: true, mode: 'wander', aggroRange: 70 } });
      lubu.essential = true;
      lubu.ai.area = { x: east.x + 45, z: east.z, r: 6 };
      lubu.combat.target = g.player;
      g.ui.subtitle('Lü Bu', 'Among men, Lü Bu. Among horses, Red Hare. Which of you insects wants to die first?', 5);
      const t0 = g.clockTime;
      await st.waitFor(() => (g.player.distTo(lubu) < 6 && g.clockTime - t0 > 25) || g.player.hp < g.player.hpMax * 0.35 || g.clockTime - t0 > 70);
      off();
      g.quests.complete('q_hl_lubu', 'hold');
      await st.cutscene(async () => {
        g.cutscene.freezeAI = true;
        const L = lubu.pos;
        st.place(zf, L.x + 2.4, L.z + 0.5); zf.faceYaw = null; zf.yaw = -Math.PI / 2;
        st.place(gy, L.x + 1.2, L.z - 2.2); gy.faceYaw = null; gy.yaw = Math.atan2(L.x - gy.pos.x, L.z - gy.pos.z);
        st.place(lb, L.x + 1.4, L.z + 2.6); lb.faceYaw = null; lb.yaw = Math.atan2(L.x - lb.pos.x, L.z - lb.pos.z);
        lubu.yaw = Math.PI / 2; lubu.faceYaw = null;
        for (const c of [zf, gy, lb, lubu]) { c.combat.drawn = true; c.model.setDrawn(true); }
        st.shot([L.x + 7, 2.2, L.z + 6], [L.x + 1.2, 1.4, L.z], 2);
        await st.say('zhangFei', 'Three-surnamed slave! Stop right there! Zhang Yide of Yan is here!', { frame: false });
        zf.model.anim.play('polearm_thrust'); lubu.model.anim.play('parry');
        await wait(700);
        await st.say('narrator', 'Zhang Fei fought Lü Bu for fifty bouts with neither gaining the advantage. Guan Yu spurred his horse and joined with his crescent blade — thirty more bouts, and still Lü Bu stood.', { frame: false });
        gy.model.anim.play('polearm_right'); lubu.model.anim.play('parry');
        await wait(700);
        await st.say('narrator', 'Then Liu Bei drew his twin swords and rode in. The three circled Lü Bu like the spokes of a lantern; the watching armies forgot to breathe.', { frame: false });
        lb.model.anim.play('blade_left'); lubu.model.anim.play('polearm_left');
        await wait(700);
        await st.say('luBu', 'Enough! Another day, brothers from Zhuo!', { frame: false });
        await st.say('narrator', 'Lü Bu feinted at Liu Bei\'s face, broke through, and galloped back into Hulao Pass, trailing his halberd behind him.', { frame: false });
        g.cutscene.freezeAI = false;
      });
      g.entities.remove(lubu);
      kit.rout(w2);
      g.quests.complete('q_hl_lubu', 'lubu');
      g.progression.addMerit(180, 'standing against Lü Bu');
      g.progression.addRenown(10);
      g.progression.setRank(g.progression.merit >= 1000 ? 'junhou' : 'tunzhang');
      standDown([lb, gy, zf]);
      for (const c of line) if (!c.dead) { c.ai.mode = 'wander'; c.ai.area = { x: c.pos.x, z: c.pos.z, r: 8 }; }
      kit.clear();
      void gz;
    },
  },

  // ======================================================== 4. Ashes of Luoyang
  ch3_seal: {
    chapter: 3,
    title: 'Ashes of Luoyang',
    async setup(st, g) {
      g.world.settlements.openGate();
      const dc = st.S.dongCamp_command || { x: -420, z: 30 };
      // Dong Zhuo has fled west; his camp is burning
      for (const [dx, dz] of [[-20, -10], [15, 12], [30, -25], [-35, 20], [0, 30]]) g.world.settlements.addDynamicFire(dc.x + dx, dc.z + dz, 2);
      for (const c of g.entities.list) if (c.faction === 'dongZhuo') g.entities.remove(c);
      st.setTime(19.5);
    },
    async run(st, g) {
      const dc = st.S.dongCamp_centre || { x: -420, z: 0 };
      const well = { id: 'palace_well', x: dc.x - 8, z: dc.z - 18, r: 2.4, label: 'A well glimmers with a strange light', kind: 'well' };
      g.world.interactables.push(well);
      const B = g.world.settlements;
      B.addDynamicFire(well.x + 3, well.z + 2, 0.4);
      g.quests.start({
        id: 'q_hl_seal', main: true, title: 'Ashes of Luoyang', cn: '焚洛陽',
        desc: 'Dong Zhuo has abandoned the pass, burned Luoyang and dragged the Emperor west to Chang\'an. The coalition advances through the smoke.',
        objectives: [
          { id: 'go', text: 'Pass through Hulao and search Dong Zhuo\'s abandoned camp', marker: { x: dc.x, z: dc.z }, check: () => st.near(dc.x, dc.z, 30) },
          { id: 'well', text: 'Investigate the glimmering well', hidden: true, marker: { x: well.x, z: well.z } },
        ],
        chronicle: 'In the ashes of Dong Zhuo\'s camp you drew a lacquered box from a well — the Imperial Jade Seal of the Han.',
      });
      await st.waitFor(() => done(g, 'q_hl_seal', 'go'));
      for (const o of g.quests.get('q_hl_seal').objs) o.hidden = false;
      st.objHandlers.set('palace_well', async () => {
        if (done(g, 'q_hl_seal', 'well')) return true;
        well.disabled = true;
        const sj = st.actor('sunJian', { figure: 'sunJian', name: 'Sun Jian', cn: '孫堅', title: 'Wentai 文臺', faction: 'han', x: well.x + 12, z: well.z + 6, weapon: 'dao', body: 'generalArmor', brain: { mode: 'idle' } });
        await st.cutscene(async () => {
          st.shot([well.x + 3, 1.6, well.z + 3], [well.x, 0.8, well.z], 2);
          await st.say('narrator', 'At the bottom of the well lay the body of a palace lady. Around her neck hung a small vermilion box sealed with gold. Inside was a seal of jade, four inches square, with five dragons entwined on its knob — one corner mended with gold.', { frame: false });
          await st.say('narrator', 'Eight characters were carved upon it: 受命於天，既壽永昌 — “Having received the Mandate from Heaven, may the reign be long and prosperous.” It was the Heirloom Seal of the Realm, carved by the First Emperor of Qin.', { frame: false });
          sj.ai.goTo(well.x + 2.5, well.z + 2, 3);
          await wait(1500);
          sj.facePoint(g.player.pos.x, g.player.pos.z);
          const r = await st.choose('sunJian', 'You there — what have you found? … By Heaven. The Imperial Seal. Give it to me, {name}. I will guard it for the Emperor.', [
            { t: 'Hand the Seal to Sun Jian. (As history records.)', v: 'give', tag: 'History' },
            { t: 'Give it to Yuan Shao, leader of the coalition.', v: 'yuan', tag: 'Order' },
            { t: 'Keep it hidden in your robe. “There was nothing but a corpse, my lord.”', v: 'keep', tag: 'Ambition' },
          ]);
          if (r === 'give') { g.progression.addVirtue(1); await st.say('sunJian', 'You are an honest man. Tell no one of this — for your own sake.', { frame: false }); g.setFlag('seal', 'sunJian'); }
          else if (r === 'yuan') { await st.say('sunJian', 'Yuan Shao? Hmph. As you wish. Yuan Shao will think it was sent by Heaven to him.', { frame: false }); g.progression.addRenown(3); g.setFlag('seal', 'yuan'); }
          else { await st.say('sunJian', 'Nothing? … Very well.', { frame: false }); g.giveItem('seal'); g.setFlag('seal', 'player'); g.progression.addVirtue(-3, 'deceit'); g.progression.addRenown(-2); }
        });
        g.quests.complete('q_hl_seal', 'well');
        return true;
      });
      await st.waitFor(() => g.quests.isDone('q_hl_seal'));
      g.progression.setRank('xiaowei');
      g.progression.addMerit(120, 'the Luoyang campaign');
      await st.fadeOut(1.5);
      await g.ui.chapterCard('第三章 終', '諸侯散', 'End of Chapter III', 'Quarrelling over precedence and plunder, the coalition dissolves. Sun Jian is killed in an ambush. In 192, Lü Bu murders Dong Zhuo in Chang\'an. The empire belongs to whoever can seize it.', 6);
    },
    next: 'ch4_start',
  },
};
