// Chapter VII · 天命 — The Mandate of Heaven
// The march on Xuchang, the last Han emperor, and the abdication at the altar.
import { wait } from '../../ui/UI.js';
import { BattleKit, alive } from '../BattleKit.js';
import { brothers, joinFight, standDown } from '../cast.js';
import { modal } from '../../ui/CampaignUI.js';

const done = (g, q, o) => !!g.quests.get(q)?.objs.find((x) => x.id === o)?.done;

export const CHAPTER7 = {
  ch7_xuchang: {
    chapter: 7,
    title: 'The Mandate of Heaven',
    async setup(st, g, o) {
      if (g.regionId !== 'xuchang') await g.travel('xuchang', null, { msg: 'The grand army marches on Xuchang…' });
      if (!o.restore) await g.ui.chapterCard('第七章', '天命', 'Chapter VII · The Mandate of Heaven', 'Twenty-five years ago you held a hoe in a millet field in Lousang. Now a hundred thousand soldiers camp beneath your banner before the walls of Xuchang, where Cao Cao keeps the last Emperor of Han.', 7);
      const cmd = st.S.yourCamp_command;
      st.actor('chenDeng', { figure: 'chenDeng', name: 'Chen Deng', cn: '陳登', title: 'your Chancellor', faction: 'militia', x: cmd.x + 2, z: cmd.z + 2, brain: { mode: 'idle' } });
      if (g.flags.liuBond !== 'rival') {
        const b = brothers(st, cmd.x - 3, cmd.z + 4, Math.PI);
        for (const c of [b.lb, b.gy, b.zf]) c.faction = 'militia';
      }
      if (g.army.alive().length < 12) g.army.recruit(12 - g.army.alive().length);
      if (!o.restore) st.teleportPlayer(cmd.x, cmd.z + 8, Math.PI);
    },
    async run(st, g) {
      const cmd = st.S.yourCamp_command;
      const gateOut = st.S.xuchangCityGate_south_out, gateIn = st.S.xuchangCityGate_south_in;
      const hall = st.S.xuchangCity_hall;
      const withLiu = g.flags.liuBond !== 'rival';
      g.quests.start({
        id: 'q_final', main: true, title: 'The Mandate of Heaven', cn: '天命',
        desc: 'Take Xuchang and free the Son of Heaven from Cao Cao.',
        objectives: [
          { id: 'council', text: 'Address your generals at the command tent', marker: { x: cmd.x, z: cmd.z + 4 }, check: () => st.near(cmd.x, cmd.z + 4, 6) },
          { id: 'gate', text: 'Storm the south gate of Xuchang', hidden: true, marker: { x: gateOut.x, z: gateOut.z }, check: () => st.near(gateOut.x, gateOut.z, 14) },
          { id: 'palace', text: 'Fight through the city to the palace', hidden: true, marker: { x: hall.x, z: hall.z + 6 } },
          { id: 'xuchu', text: 'Defeat Xu Chu, Cao Cao\'s bodyguard', hidden: true },
          { id: 'emperor', text: 'Enter the palace hall', hidden: true, marker: { x: hall.x, z: hall.z + 2 }, check: () => done(g, 'q_final', 'xuchu') && st.near(hall.x, hall.z + 2, 5) },
        ],
        autoFinish: false,
      });
      await st.waitFor(() => done(g, 'q_final', 'council'));
      await st.cutscene(async () => {
        st.shot([cmd.x + 4, 2, cmd.z + 7], [cmd.x, 1.6, cmd.z + 2], 2);
        await st.say('chenDeng', 'My lord — no, it is not yet time for that word. The army is ready. Cao Cao has shut himself inside Xuchang with his Tiger Guards.', { frame: false });
        if (withLiu) {
          await st.say('liuBei', '{name}. Once, in Lousang, I gave a farmer\'s son sixty coins for his father\'s medicine. I never imagined I would follow that farmer\'s banner to Xuchang.', { frame: false });
          await st.say('zhangFei', 'Follow? Hah! We are here to watch his back — the way we did at Daxing Mountain!', { frame: false });
          await st.say('guanYu', 'The peach garden oath binds the three of us. Today it binds four.', { frame: false });
        }
        const r = await st.choose('player', 'Soldiers of the realm…', [
          { t: '“We march not to destroy the Han, but to end the suffering that the Han could not.”', v: 'people', tag: 'Virtue' },
          { t: '“Heaven has chosen. Take the city!”', v: 'heaven' },
          { t: '“Every man who reaches the palace will be a noble by nightfall!”', v: 'glory', tag: 'Ambition' },
        ]);
        if (r === 'people') g.progression.addVirtue(3);
        g.audio.play('cheer');
      });
      for (const o of g.quests.get('q_final').objs) o.hidden = false;
      const kit = new BattleKit(g, 220);
      const line = kit.line('militia', 16, gateOut.x, gateOut.z + 30, Math.PI, { aggro: 40 });
      const bros = withLiu ? ['liuBei', 'guanYu', 'zhangFei'].map((id) => g.entities.get(id)).filter(Boolean) : [];
      joinFight(bros, g.player, 40);
      g.audio.play('horn');
      await st.waitFor(() => done(g, 'q_final', 'gate'));
      const def1 = kit.wave('enemy', 14, gateIn.x, gateIn.z - 10, gateOut);
      kit.charge(line, { x: gateIn.x, z: gateIn.z - 20 });
      g.ui.subtitle('Cao soldier', 'Hold the gate! For the Chancellor!', 3);
      await st.waitFor(() => alive(def1).length <= 3 && st.near(gateIn.x, gateIn.z, 30));
      g.quests.complete('q_final', 'gate');
      const def2 = kit.wave('enemy', 12, hall.x, hall.z + 25, { x: gateIn.x, z: gateIn.z - 30 });
      const xc = kit.officer({ id: 'xuChu', figure: 'zangBa', name: 'Xu Chu', cn: '許褚', title: 'Zhongkang 仲康, the Tiger Fool', faction: 'enemy', role: 'soldier', x: hall.x, z: hall.z + 14, weapon: 'axe', body: 'generalArmor', hp: 1100, stats: { str: 20, vit: 20, blade: 16, block: 14 } });
      xc.ai.area = { x: hall.x, z: hall.z + 14, r: 5 };
      await st.waitFor(() => alive(def2).length <= 4 || st.near(hall.x, hall.z + 20, 20));
      g.quests.complete('q_final', 'palace');
      await st.waitFor(() => xc.dead);
      g.quests.complete('q_final', 'xuchu');
      kit.rout([...def1, ...def2]);
      g.audio.play('cheer');
      standDown(bros);
      await st.waitFor(() => done(g, 'q_final', 'emperor'));
      // --- the palace: Cao Cao and the Emperor
      const cc = st.actor('caoCao', { figure: 'caoCao', name: 'Cao Cao', cn: '曹操', title: 'Chancellor of Han, King of Wei', faction: 'civilian', x: hall.x + 2.5, z: hall.z + 1.5, weapon: 'fists', brain: { mode: 'idle' } });
      const em = st.actor('emperorXian', { figure: 'emperorXian', name: 'Emperor Xian', cn: '漢獻帝', title: 'Liu Xie, Son of Heaven', faction: 'civilian', x: hall.x, z: hall.z - 0.5, weapon: 'fists', brain: { mode: 'idle' } });
      em.facePoint(hall.x, hall.z + 10); cc.facePoint(g.player.pos.x, g.player.pos.z);
      let ending = 'emperor';
      await st.cutscene(async () => {
        st.teleportPlayer(hall.x, hall.z + 4.5, Math.PI);
        st.shot([hall.x + 3.5, 2.2, hall.z + 6.5], [hall.x + 1, 1.7, hall.z + 1], 2);
        await st.say('caoCao', 'So. The farmer from Zhuo. I told you once that I remember capable men. I did not imagine you would be the one to end me.', { frame: false });
        await st.say('caoCao', '“The old steed in the stable still dreams of galloping a thousand li.” — I wrote that. Now the stable is yours.', { frame: false });
        const r = await st.choose('caoCao', 'What will you do with me, conqueror?', [
          { t: '“You kept the realm from falling apart. Live out your days in Qiao, Mengde.”', v: 'spare', tag: 'Virtue' },
          { t: '“You killed thousands in Xu Province. Your life is forfeit.”', v: 'kill' },
        ]);
        if (r === 'spare') { g.progression.addVirtue(5, 'magnanimity'); g.setFlag('caoSpared', true); await st.say('caoCao', 'Hah… The Han has found a better master than I was. Or a better liar. We shall see.', { frame: false }); }
        else { g.progression.addVirtue(-3); g.setFlag('caoKilled', true); await st.say('caoCao', 'Then let it be quick. Better that I wrong the world…', { frame: false }); }
        st.dismiss('caoCao');
        st.shot([hall.x - 2.5, 1.9, hall.z + 4], [hall.x, 1.7, hall.z - 0.3], 2);
        await st.say('emperorXian', 'I became emperor at nine, in a palace full of corpses. Dong Zhuo, Li Jue, Cao Cao — I have been every warlord\'s seal and none of them\'s sovereign.', { frame: false });
        await st.say('emperorXian', 'Yao yielded the realm to Shun because Shun was worthy. The Mandate of Han is exhausted. The people turn their faces to you. I will yield the throne.', { frame: false });
        let declines = 0;
        for (;;) {
          const c = await st.choose('emperorXian', declines === 0 ? 'Will you accept the Mandate of Heaven?' : declines === 1 ? 'The ministers beg you. Heaven has sent omens — a yellow dragon was seen at Qiao. Will you accept?' : 'For the third time, I implore you: accept the realm, for the sake of the people.', [
            { t: declines < 2 ? '“I am unworthy, Majesty.” (Decline, as custom demands)' : '“…I accept the Mandate — for the people.”', v: declines < 2 ? 'decline' : 'accept', tag: declines < 2 ? 'Ritual humility' : 'Destiny' },
            { t: '“Remain on your throne. I will serve the Han as its guardian.” (Alternate ending)', v: 'regent' },
          ]);
          if (c === 'decline') { declines++; g.progression.addVirtue(1); continue; }
          if (c === 'regent') ending = 'regent';
          break;
        }
        if (ending === 'regent') await st.say('emperorXian', 'Then you are the Duke of Zhou of our age. May history be kinder to you than it was to him.', { frame: false });
      });
      g.quests.finish('q_final');
      if (ending === 'regent') { await CHAPTER7.ch7_xuchang.epilogue(st, g, 'regent'); return; }
      await CHAPTER7.ch7_xuchang.coronation(st, g);
    },

    async coronation(st, g) {
      const alt = st.S.altar_foot, top = st.S.altar_top;
      await st.fadeOut(1.5);
      g.time.addHours(24 * 20);
      g.time.hour = 10;
      // imperial dress
      const p = g.player;
      p.baseLook = { ...p.baseLook, outfit: 'official', robe: 0x151212, trim: 0xc8a040, headwear: 'crown', trousers: 0x151212 };
      p.equip.body = null; p.equip.head = null; p.setWeapon('fists');
      p.buildModel();
      g.army.dismissAll();
      // ministers and soldiers kneel on both sides of the approach
      const kit = new BattleKit(g, 221);
      const rows = [];
      for (let i = 0; i < 18; i++) {
        const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
        const c = kit.soldier(i < 8 ? 'han' : 'militia', alt.x + side * 5, alt.z + 6 + k * 3, { aggro: 0 });
        c.faction = 'militia'; c.ai.fighter = false; c.ai.mode = 'idle';
        c.yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2; c.faceYaw = c.yaw;
        rows.push(c);
      }
      const em = st.actor('emperorXian', { figure: 'emperorXian', name: 'Liu Xie', cn: '劉協', title: 'the former Emperor Xian, now Duke of Shanyang', faction: 'civilian', x: top.x - 1.5, z: top.z + 0.5, brain: { mode: 'idle' } });
      st.place(em, top.x - 1.5, top.z + 0.5, Math.PI);
      st.teleportPlayer(alt.x, alt.z + 30, Math.PI);
      await st.fadeIn(2);
      g.audio.setMood('peace');
      let dynasty = { cn: '周', name: 'Zhou' }, era = { cn: '太平', name: 'Taiping' };
      await st.cutscene(async () => {
        st.shot([alt.x + 14, 6, alt.z + 30], [alt.x, 4, alt.z - 10], 1.2);
        await st.say('narrator', 'On an auspicious day chosen by the astrologers, an altar of three tiers was raised south of Xuchang — just as the sage-kings of old had received the realm.', { frame: false });
        for (const c of rows) c.model.anim.setPose('kowtow');
        await wait(1500);
        st.teleportPlayer(top.x, top.z + 2.5, Math.PI);
        st.shot([top.x + 6, 3, top.z + 7], [top.x, 1.8, top.z], 1.5);
        await st.say('emperorXian', 'The way of Heaven is not constant; it favours only the virtuous. Now I, Liu Xie, reverently yield the Mandate to you, as Yao yielded to Shun.', { frame: false });
        if (g.player.inventory.has('seal')) await st.say('narrator', 'You drew from your robe a vermilion box you had carried in secret for twenty years — the Heirloom Seal of the Realm, taken from a well in burning Luoyang. The ministers gasped: Heaven itself had chosen its keeper long ago.', { frame: false });
        else await st.say('emperorXian', 'Receive the imperial seal and the ribbons of office.', { frame: false });
        const d = await st.choose('player', 'Name the dynasty that begins today:', [
          { t: 'Great Zhou 大周 — to return to the golden age of the sages', v: 0 },
          { t: 'Great Pei 大沛 — after the land that first trusted me', v: 1 },
          { t: 'Great Qin 大秦 — after my own clan', v: 2 },
          { t: 'Great Jin 晉 — “to advance”', v: 3 },
        ]);
        dynasty = [{ cn: '周', name: 'Zhou' }, { cn: '沛', name: 'Pei' }, { cn: '秦', name: 'Qin' }, { cn: '晉', name: 'Jin' }][d];
        const e = await st.choose('player', 'And the first era of your reign shall be called:', [
          { t: 'Taiping 太平 — “Great Peace”, the dream the Yellow Turbans died for', v: 0 },
          { t: 'Tianshou 天授 — “Granted by Heaven”', v: 1 },
          { t: 'Kangmin 康民 — “The People at Ease”', v: 2 },
        ]);
        era = [{ cn: '太平', name: 'Taiping' }, { cn: '天授', name: 'Tianshou' }, { cn: '康民', name: 'Kangmin' }][e];
        st.shot([top.x, 2.2, top.z + 9], [top.x, 1.9, top.z], 1.2);
        for (const c of rows) c.model.anim.setPose('kowtow');
        g.audio.play('gong');
        await st.say('narrator', '萬歲！萬歲！萬萬歲！ — “Ten thousand years! Ten thousand years! Ten thousand times ten thousand years!”', { frame: false });
        g.audio.play('cheer');
        await wait(1200);
      }, { camLocked: true });
      g.time.customEra = { name: era.name, cn: era.cn, from: g.time.year };
      g.setFlag('dynasty', dynasty);
      g.progression.setRank('huangdi');
      g.chronicleAdd(`You ascended the throne as Emperor of the Great ${dynasty.name} (${dynasty.cn}), proclaiming the era ${era.name} (${era.cn}).`);
      await g.ui.chapterCard('天命所歸', `大${dynasty.cn}`, `The Great ${dynasty.name} Dynasty`, `Era ${era.name} ${era.cn}, first year. From a millet field in Lousang to the Dragon Throne.`, 6);
      await CHAPTER7.ch7_xuchang.epilogue(st, g, 'emperor');
    },

    async epilogue(st, g, ending) {
      const pr = g.progression, f = g.flags;
      const parts = [];
      if (ending === 'regent') parts.push('You ruled as the Guardian of Han until your death. Historians compare you to the Duke of Zhou — the regent who could have been king and chose not to be. The Han endured another century, a shadow sustained by your loyalty.');
      else parts.push(`You reigned as the first emperor of the Great ${f.dynasty?.name || 'Zhou'}.`);
      if (pr.virtue >= 25) parts.push('Taxes were halved, the granaries opened in famine years, and the old soldiers given land. In the villages they sang of the Farmer Emperor who never forgot the millet fields.');
      else if (pr.virtue <= -10) parts.push('Your reign was strong and feared. The realm was united — but many whispered that the new dynasty was built on the same cruelty as the old.');
      else parts.push('Your reign was hard-won and orderly. The realm, divided for thirty years, was one again.');
      if (f.liuBond === 'brother' || f.liuBond === 'friend') parts.push('Liu Bei was made King of Shu and ruled the west in your name; Guan Yu and Zhang Fei guarded the frontiers. When the four of you met, you drank as you once had beneath the peach blossoms.');
      else if (f.liuBond === 'rival') parts.push('Liu Bei proclaimed himself Emperor of Han in Chengdu and never bowed to you. The west remained a thorn for a generation.');
      if (f.seal === 'player') parts.push('The Heirloom Seal, hidden for twenty years, was placed on the altar of your ancestral temple.');
      if (f.caoSpared) parts.push('Cao Cao lived out his days in Qiao, writing poetry and commentaries on Sunzi. He died, as he wished, in his bed.');
      parts.push(`Merit ${pr.merit} · Virtue ${pr.virtue > 0 ? '+' : ''}${pr.virtue} · Renown ${pr.renown}. Thank you for playing Mandate of Heaven.`);
      await modal(g, ending === 'regent' ? 'Epilogue — The Guardian of Han' : 'Epilogue — The Farmer Emperor', parts.join('<br><br>'), ['Continue your reign (free roam)']);
      g.setFlag('gameComplete', ending);
      g.save();
    },
  },
};
