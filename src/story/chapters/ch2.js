// Chapter II · 蒼天已死 — The Azure Sky Is Dead (Guangzong, summer 184 AD)
// Lu Zhi's siege of Zhang Jiao, the eunuch Zuo Feng's slander, Dong Zhuo's ingratitude,
// and Huangfu Song's storming of Guangzong.
import * as THREE from 'three';
import { wait } from '../../ui/UI.js';
import { BattleKit, alive } from '../BattleKit.js';
import { liuBei, guanYu, zhangFei, brothers, joinFight, standDown } from '../cast.js';

const done = (g, q, o) => !!g.quests.get(q)?.objs.find((x) => x.id === o)?.done;
const R = (g, id) => g.world.region.settlements.find((s) => s.id === id);

function cageCart(g, x, z, yaw) {
  const grp = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 2.4), wood); base.position.y = 0.1; grp.add(base);
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, 0.06), wood);
    bar.scale.y = 1.25; bar.position.set(s * 0.85, 1.15, -1.1 + i * 0.37); grp.add(bar);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 2.4), wood); top.position.y = 2.25; grp.add(top);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 14), wood); w.rotation.z = Math.PI / 2; w.position.set(s * 1.0, 0.45, 0); grp.add(w); }
  grp.traverse((m) => { m.castShadow = true; });
  grp.position.set(x, g.world.groundHeight(x, z), z);
  grp.rotation.y = yaw;
  g.engine.scene.add(grp);
  return grp;
}

export const CHAPTER2 = {
  // ======================================================== 1. The Siege Camp
  ch2_start: {
    chapter: 2,
    title: 'The Siege of Guangzong',
    async setup(st, g, o) {
      if (g.regionId !== 'guangzong') {
        await g.travel('guangzong', null, { msg: 'Marching south to Guangzong…' });
        g.time.setDate(184, 6, 3, 17);
        if (!o.restore) {
          await g.ui.chapterCard('第二章', '蒼天已死', 'Chapter II · The Azure Sky Is Dead', 'Guangzong, Julu Commandery. Summer, 184 AD. General Lu Zhi has Zhang Jiao penned inside the walls with a ring of trenches and palisades. Liu Bei marches to join his old teacher.');
        }
      }
      const cmd = st.S.hanCamp_command;
      st.actor('luZhi', { figure: 'luZhi', name: 'Lu Zhi', cn: '盧植', title: 'General of the Northern Capital Army', faction: 'han', x: cmd.x, z: cmd.z + 0.5, weapon: 'jian', body: 'generalArmor', brain: { mode: 'idle' } }).facePoint(cmd.x, cmd.z + 10);
      brothers(st, cmd.x - 2, cmd.z + 5, Math.PI);
      if (g.army.alive().length < 6) g.army.recruit(6 - g.army.alive().length);
    },
    async run(st, g) {
      const cmd = st.S.hanCamp_command;
      const lz = g.entities.get('luZhi');
      const depot = R(g, 'ytEast');
      g.quests.start({
        id: 'q_gz_depot', main: true, title: "Starve the Beast", cn: '焚糧',
        desc: 'Lu Zhi wants the rebels\' grain depot east of Guangzong burned. A city without grain cannot hold.',
        objectives: [
          { id: 'talk', text: 'Report to General Lu Zhi at the command tent', marker: () => lz.pos },
          { id: 'burn', text: 'Burn the grain stores at the rebel depot (0/3)', hidden: true, count: 3, marker: { x: depot.x, z: depot.z } },
          { id: 'back', text: 'Return to Lu Zhi', hidden: true, marker: () => lz.pos },
        ],
        chronicle: 'At Guangzong you burned the Yellow Turban grain depot under cover of night.',
      });
      st.talkHandlers.set('luZhi', async () => {
        if (!done(g, 'q_gz_depot', 'talk')) {
          await st.cutscene(async () => {
            st.shot([cmd.x + 3, 1.7, cmd.z + 5], [cmd.x, 1.6, cmd.z], 2);
            await st.say('liuBei', 'Teacher! Your student Liu Bei has come with five hundred volunteers from Zhuo.', { frame: false });
            await st.say('luZhi', 'Xuande. I remember a boy who preferred hounds, horses and fine clothes to the Classics. Yet here you stand at the head of an army. Heaven has a sense of humour.', { frame: false });
            await st.say('luZhi', 'Zhang Jiao is inside those walls with a hundred and fifty thousand. I have ringed the city with trenches and ramparts. We need not storm it — we will starve it.', { frame: false });
            await st.say('luZhi', 'Their grain comes from a depot to the east. Your man there — the farmer\'s son — he knows grain better than any officer. Let him burn it tonight.', { frame: false });
            await st.say('luZhi', 'Go quietly (press C to move stealthily). The rebels guard the stores, but fire does the fighting for you.', { frame: false });
          });
          g.quests.complete('q_gz_depot', 'talk');
          for (const o of g.quests.get('q_gz_depot').objs) o.hidden = false;
          st.setTime(22);
          g.giveItem('bandage', 2);
          return true;
        }
        if (done(g, 'q_gz_depot', 'burn') && !done(g, 'q_gz_depot', 'back')) {
          await st.convo([['luZhi', 'The eastern sky glows red. Well done. Zhang Jiao\'s followers will be eating their talismans within a month.']]);
          g.quests.complete('q_gz_depot', 'back');
          return true;
        }
        return false;
      });
      // grain piles
      const piles = [[-18, 10], [14, -16], [20, 18]].map(([dx, dz], i) => {
        const it = { id: `grain_${i}`, x: depot.x + dx, z: depot.z + dz, r: 2.5, label: 'Set fire to the grain store', kind: 'grain' };
        g.world.interactables.push(it);
        return it;
      });
      // straw grain stacks (visual)
      const grp = new THREE.Group();
      const straw = new THREE.MeshStandardMaterial({ color: 0xc8a860, roughness: 1 });
      for (const it of piles) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 2.2, 10), straw);
        m.position.set(it.x, g.world.groundHeight(it.x, it.z) + 1.1, it.z); m.castShadow = true;
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.2, 10), straw); cap.position.y = 1.7; m.add(cap);
        grp.add(m);
      }
      g.engine.scene.add(grp);
      let burned = 0;
      for (const it of piles) st.objHandlers.set(it.id, async () => {
        if (it.disabled) return true;
        it.disabled = true;
        g.world.settlements.addDynamicFire(it.x, it.z, 2.2);
        burned++;
        g.quests.progress('q_gz_depot', 'burn', 1);
        g.audio.play('draw', it);
        g.progression.gain('stealth', 4);
        if (burned === 1) {
          // raise the alarm
          for (const c of g.population.camps.get('ytEast') || []) { c.ai.aggroRange = 30; }
          g.ui.subtitle('Rebel sentry', 'FIRE! Fire in the stores! To arms!', 3);
        }
        return true;
      });
      await st.waitFor(() => g.quests.isDone('q_gz_depot'));
      g.progression.addMerit(60, 'burning the rebel grain');
      st.setTime(8);
    },
  },

  // ======================================================== 2. The Eunuch's Price
  ch2_eunuch: {
    chapter: 2,
    title: "The Eunuch's Price",
    async setup(st, g) {
      const cmd = st.S.hanCamp_command;
      st.actor('luZhi', { figure: 'luZhi', name: 'Lu Zhi', cn: '盧植', title: 'General of the Northern Capital Army', faction: 'han', x: cmd.x, z: cmd.z + 0.5, weapon: 'jian', body: 'generalArmor', brain: { mode: 'idle' } });
      brothers(st, cmd.x - 3, cmd.z + 6, Math.PI);
      st.actor('zuoFeng', { name: 'Zuo Feng', cn: '左豐', title: 'Palace eunuch, Imperial Inspector', faction: 'han', x: cmd.x + 2.5, z: cmd.z + 3, appearance: { outfit: 'official', robe: 0x3a1a3a, trim: 0xc8a850, headwear: 'official', beard: 'none', skin: 0xe0b898, height: 1.64, build: 1.2, face: { smile: true } }, brain: { mode: 'idle' } });
    },
    async run(st, g) {
      const cmd = st.S.hanCamp_command;
      const lz = g.entities.get('luZhi'), zf = g.entities.get('zuoFeng');
      g.quests.start({
        id: 'q_gz_eunuch', main: true, title: "The Eunuch's Price", cn: '左豐索賄',
        desc: 'An imperial inspector has arrived from Luoyang. Everyone in camp is nervous.',
        objectives: [{ id: 'go', text: 'Attend General Lu Zhi at the command tent', marker: { x: cmd.x, z: cmd.z + 5 }, check: () => st.near(cmd.x, cmd.z + 5, 6) }],
        chronicle: 'The eunuch Zuo Feng demanded a bribe of Lu Zhi and was refused. Lu Zhi was carted to Luoyang in a cage. Dong Zhuo took his command.',
      });
      await st.waitFor(() => done(g, 'q_gz_eunuch', 'go'));
      await st.cutscene(async () => {
        st.shot([cmd.x + 4, 1.7, cmd.z + 5], [cmd.x + 1, 1.5, cmd.z + 1.5], 2);
        await st.say('zuoFeng', 'General Lu. Such long, long trenches you have dug. The Son of Heaven wonders why a hundred and fifty thousand peasants are still alive behind them.', { frame: false });
        await st.say('luZhi', 'Because I will not throw the lives of my soldiers against walls that hunger will open for me. The siege works. Soon the city will fall of itself.', { frame: false });
        await st.say('zuoFeng', 'Soon, soon. Inspectors are expensive to feed, General. The journey from Luoyang is long. A small gift — for my trouble — and my report will praise your patience.', { frame: false });
        await st.say('luZhi', 'The army\'s grain is barely enough for the army. I have nothing to give a eunuch.', { frame: false });
        await st.say('zuoFeng', 'Nothing. How… principled.', { frame: false });
        await st.say('narrator', 'Zuo Feng returned to Luoyang and told the Emperor: “The rebels of Guangzong are easily beaten, but General Lu sits behind his ramparts waiting for Heaven to destroy them.” The Emperor flew into a rage.', { frame: false });
      });
      await st.fadeOut(1);
      g.time.addHours(24 * 6);
      st.dismiss('zuoFeng');
      // Lu Zhi in a cage cart on the road north, with an escort
      const road = { x: 20, z: 180 };
      const cart = cageCart(g, road.x, road.z, 0);
      st.place(lz, road.x, road.z); lz.equip.body = null; lz.equip.weapon = 'fists'; lz.buildModel(); lz.model.anim.setPose('handsBehind'); lz.radius = 0.1;
      const kit = new BattleKit(g, 184);
      const escort = [];
      for (let i = 0; i < 6; i++) { const c = kit.soldier('han', road.x + (i % 2 ? 3 : -3), road.z - 4 + Math.floor(i / 2) * 3, { aggro: 8 }); c.ai.mode = 'guard'; c.ai.post = { x: c.pos.x, z: c.pos.z, rot: 0 }; c.faction = 'han'; escort.push(c); }
      const { lb, gy, zf: fei } = brothers(st, road.x - 1, road.z + 9, Math.PI);
      st.teleportPlayer(road.x + 2, road.z + 10, Math.PI);
      await st.fadeIn(1);
      let choice = null;
      await st.cutscene(async () => {
        st.shot([road.x + 5, 2.2, road.z + 8], [road.x, 1.5, road.z], 2);
        await st.say('narrator', 'Six days later. On the northern road, the volunteers met an escort of imperial soldiers — and a cage cart. Inside sat Lu Zhi.', { frame: false });
        await st.say('liuBei', 'Teacher! What is this?', { frame: false });
        await st.say('luZhi', 'Zuo Feng slandered me to the Emperor. Dong Zhuo takes my command. I go to Luoyang to be judged.', { frame: false });
        await st.say('zhangFei', 'I will kill these guards and set you free! Then we\'ll go to Luoyang and gut that eunuch like a pig!', { frame: false });
        fei.draw(true);
        choice = await st.choose('liuBei', 'Brother, wait! — {name}, what do you say?', [
          { t: 'Hold, Yide. The court will judge him. Striking imperial troops makes us rebels.', v: 'restrain', tag: 'Order' },
          { t: 'Zhang Fei is right. A loyal general in a cage — this is the Han we fight for?', v: 'free', tag: 'Righteous fury' },
          { t: '(Say nothing.)', v: 'silent' },
        ]);
        if (choice === 'free') {
          await st.say('luZhi', 'NO! If you raise a blade against the Emperor\'s soldiers for my sake, you make me a rebel too. The court will see the truth in time. Go — serve the dynasty. That is how you save me.', { frame: false });
          await st.say('zhangFei', 'Grrr… Fine! But I will remember that eunuch\'s face!', { frame: false });
          g.progression.addVirtue(2, 'standing for justice');
          g.setFlag('ch2_defiant', true);
        } else if (choice === 'restrain') {
          await st.say('liuBei', 'He is right, brother. The court has its own justice. We cannot make ourselves outlaws.', { frame: false });
          g.progression.addVirtue(1);
          g.progression.addRenown(2);
        } else {
          await st.say('guanYu', 'Third brother. Put up your spear.', { frame: false });
        }
        fei.draw(false);
        await st.say('narrator', 'The cage cart rolled north toward Luoyang. (History: Lu Zhi was later pardoned and restored to office, thanks to Huangfu Song\'s testimony.)', { frame: false });
      });
      g.quests.finish('q_gz_eunuch');
      await st.fadeOut(1);
      g.engine.scene.remove(cart);
      for (const c of escort) g.entities.remove(c);
      st.dismiss('luZhi');
      st.setTime(9);
      await st.fadeIn(1);
      void lb; void gy;
    },
  },

  // ======================================================== 3. Saving Dong Zhuo
  ch2_dongzhuo: {
    chapter: 2,
    title: 'An Ungrateful Lord',
    async setup(st, g) {
      const w = R(g, 'ytWest');
      const b = brothers(st, w.x + 80, w.z + 70, -Math.PI * 0.75);
      joinFight([b.lb, b.gy, b.zf], g.player);
      st.teleportPlayer(w.x + 84, w.z + 76, -Math.PI * 0.75);
    },
    async run(st, g) {
      const w = R(g, 'ytWest');
      const kit = new BattleKit(g, 185);
      const fld = { x: w.x + 40, z: w.z + 40 };
      const dz = st.actor('dongZhuo', { figure: 'dongZhuo', name: 'Dong Zhuo', cn: '董卓', title: 'General of the Household, Lu Zhi\'s replacement', faction: 'han', x: fld.x, z: fld.z, weapon: 'dao', body: 'generalArmor', hp: 500, brain: { archetype: 'officer', fighter: true, mode: 'guard', aggroRange: 12 } });
      dz.ai.post = { x: fld.x, z: fld.z };
      const guards = kit.line('han', 4, fld.x, fld.z + 3, Math.PI * 1.25, { aggro: 12 });
      const rebels = [...kit.wave('yellowTurban', 10, fld.x - 25, fld.z - 20, fld), ...kit.wave('yellowTurban', 8, fld.x - 5, fld.z - 30, fld)];
      g.quests.start({
        id: 'q_gz_dong', main: true, title: 'An Ungrateful Lord', cn: '救董卓',
        desc: 'Dong Zhuo, Lu Zhi\'s replacement, attacked Zhang Jiao and was routed. His guard is surrounded near the western rebel camp.',
        objectives: [{ id: 'save', text: 'Break the rebels surrounding Dong Zhuo', count: 18, check: () => 18 - alive(rebels).length, marker: () => dz.pos }],
        chronicle: 'You saved Dong Zhuo from the Yellow Turbans. He treated Liu Bei with contempt because the brothers held no office.',
      });
      g.audio.play('horn');
      g.ui.subtitle('Liu Bei', 'That is the imperial banner — they are overrun! Brothers, charge!', 4);
      await st.waitFor(() => alive(rebels).length <= 3);
      kit.rout(rebels);
      g.quests.complete('q_gz_dong', 'save');
      const { lb, gy, zf } = { lb: g.entities.get('liuBei'), gy: g.entities.get('guanYu'), zf: g.entities.get('zhangFei') };
      standDown([lb, gy, zf, ...guards]);
      dz.ai.mode = 'idle'; dz.draw(false);
      await st.cutscene(async () => {
        st.place(lb, dz.pos.x + 1.2, dz.pos.z + 2.5); st.place(zf, dz.pos.x + 3, dz.pos.z + 3); st.place(gy, dz.pos.x - 0.8, dz.pos.z + 3.2);
        st.teleportPlayer(dz.pos.x + 2, dz.pos.z + 4.2);
        dz.facePoint(lb.pos.x, lb.pos.z); lb.facePoint(dz.pos.x, dz.pos.z);
        st.shot([dz.pos.x + 4, 1.8, dz.pos.z + 5], [dz.pos.x + 0.8, 1.5, dz.pos.z + 1], 2);
        await st.say('dongZhuo', 'Hmph. Who are you people? What office do you hold?', { frame: false });
        await st.say('liuBei', 'We are volunteers from Zhuo Commandery. We hold no office.', { frame: false });
        await st.say('dongZhuo', 'No office. I see.', { frame: false });
        await st.say('narrator', 'Dong Zhuo turned his back and walked away without a word of thanks.', { frame: false });
        dz.facePoint(dz.pos.x - 10, dz.pos.z - 10);
        await st.say('zhangFei', 'We fight our way through blood to save this pig\'s life, and he spits on us? I\'ll kill him where he stands!', { frame: false });
        zf.draw(true);
        const r = await st.choose('guanYu', 'Third brother, he is an imperial officer! {name} — help me hold him!', [
          { t: 'Grab Zhang Fei\'s arm: “Not here, brother. Not like this.”', v: 0, tag: 'Restraint' },
          { t: '“Dong Zhuo will bring ruin on the empire one day. Maybe Yide is right.”', v: 1, tag: 'Foresight' },
        ]);
        if (r === 0) { g.progression.addVirtue(1); await st.say('liuBei', 'Killing a court officer would make us criminals. There will be a reckoning, but not today.', { frame: false }); }
        else { g.setFlag('ch2_foresawDong', true); g.progression.addRenown(2); await st.say('guanYu', 'You may be right. But a man is not punished for crimes he has yet to commit.', { frame: false }); }
        zf.draw(false);
        await st.say('zhangFei', 'Bah! Then I will not serve under him. Brother, let us go to Huangfu Song instead!', { frame: false });
      });
      g.quests.finish('q_gz_dong');
      g.progression.addMerit(60, 'rescuing an imperial general');
      st.dismiss('dongZhuo');
      for (const c of guards) g.entities.remove(c);
      kit.clear();
    },
  },

  // ======================================================== 4. The Fall of Guangzong
  ch2_storm: {
    chapter: 2,
    title: 'The Fall of Guangzong',
    async setup(st, g) {
      const cmd = st.S.hanCamp_command;
      st.actor('huangfuSong', { figure: 'huangfuSong', name: 'Huangfu Song', cn: '皇甫嵩', title: 'General of the Left of the Household', faction: 'han', x: cmd.x, z: cmd.z + 0.5, weapon: 'dao', body: 'generalArmor', brain: { mode: 'idle' } });
      brothers(st, cmd.x - 3, cmd.z + 6, Math.PI);
      st.setTime(5.6);
    },
    async run(st, g) {
      const cmd = st.S.hanCamp_command;
      const hs = g.entities.get('huangfuSong');
      const city = R(g, 'guangzong');
      const gateOut = st.S.guangzongGate_south_out, gateIn = st.S.guangzongGate_south_in;
      g.quests.start({
        id: 'q_gz_storm', main: true, title: 'The Fall of Guangzong', cn: '破廣宗',
        desc: 'Zhang Jiao is dead of sickness. His brother Zhang Liang, "General of Man", holds the city. Huangfu Song will storm it at dawn.',
        objectives: [
          { id: 'brief', text: 'Receive orders from Huangfu Song', marker: () => hs.pos },
          { id: 'gate', text: 'Assault the south gate of Guangzong', hidden: true, marker: { x: gateOut.x, z: gateOut.z }, check: () => st.near(gateOut.x, gateOut.z, 14) },
          { id: 'inside', text: 'Fight through the streets to the county office', hidden: true, marker: { x: city.x, z: city.z } },
          { id: 'liang', text: 'Defeat Zhang Liang', hidden: true },
        ],
        chronicle: 'Huangfu Song stormed Guangzong. Zhang Liang was slain and the Yellow Turban cause broken. (History: Zhang Jiao had already died of illness; his coffin was opened and his head sent to Luoyang.)',
      });
      st.talkHandlers.set('huangfuSong', async () => {
        if (done(g, 'q_gz_storm', 'brief')) return false;
        await st.cutscene(async () => {
          st.shot([cmd.x + 3, 1.7, cmd.z + 5], [cmd.x, 1.6, cmd.z], 2);
          await st.say('huangfuSong', 'You are Lu Zhi\'s volunteers? Good. Lu Zhi was right about this siege — I have told the Emperor so, and he will be restored. But now we end it.', { frame: false });
          await st.say('huangfuSong', 'Zhang Jiao died of sickness three days ago. Zhang Liang hides the news, but his men are losing heart. At dawn we strike the south gate while their guard is thin. Your squad goes in behind the ram.', { frame: false });
          await st.say('zhangFei', 'At last — a general who fights!', { frame: false });
        });
        g.quests.complete('q_gz_storm', 'brief');
        for (const o of g.quests.get('q_gz_storm').objs) o.hidden = false;
        return true;
      });
      await st.waitFor(() => done(g, 'q_gz_storm', 'brief'));
      const lb = g.entities.get('liuBei'), gy = g.entities.get('guanYu'), zf = g.entities.get('zhangFei');
      joinFight([lb, gy, zf], g.player, 35);
      const kit = new BattleKit(g, 186);
      const hanLine = kit.line('han', 12, gateOut.x, gateOut.z + 30, Math.PI, { aggro: 40 });
      g.audio.play('horn');
      await st.waitFor(() => done(g, 'q_gz_storm', 'gate'));
      // defenders at the gate
      const gateDef = kit.wave('yellowTurban', 10, gateIn.x, gateIn.z - 10, gateOut);
      kit.charge(hanLine, { x: gateIn.x, z: gateIn.z - 20 });
      g.ui.subtitle('Huangfu Song', 'The gate is broken! Into the city!', 4);
      await st.waitFor(() => alive(gateDef).length <= 3 && st.near(gateIn.x, gateIn.z, 25));
      g.quests.complete('q_gz_storm', 'inside');
      const liang = kit.officer({ id: 'zhangLiang', figure: 'zhangJiao', name: 'Zhang Liang', cn: '張梁', title: 'General of Man 人公將軍', faction: 'yellowTurban', role: 'yellowTurban', x: city.x + 20, z: city.z - 10, weapon: 'ji', body: 'leatherArmor', hp: 520, stats: { str: 15, vit: 15, polearm: 13, block: 11 } });
      const guard2 = kit.wave('yellowTurban', 12, city.x + 10, city.z - 5, { x: gateIn.x, z: gateIn.z - 10 });
      g.ui.subtitle('Zhang Liang', 'The Lord of Heaven is not dead! He has ascended! Kill the dogs of Han!', 4);
      await st.waitFor(() => liang.dead);
      g.quests.complete('q_gz_storm', 'liang');
      kit.rout(guard2);
      kit.rout(gateDef);
      g.setFlag('cleared_guangzong', true);
      g.audio.play('cheer');
      standDown([lb, gy, zf]);
      g.quests.finish('q_gz_storm');
      g.progression.addMerit(200, 'the fall of Guangzong');
      g.progression.setRank(g.progression.merit >= 600 ? 'tunzhang' : 'duibo');
      await st.cutscene(async () => {
        st.shot([city.x + 8, 3, city.z + 16], [city.x, 2, city.z], 1.5);
        await st.say('liuBei', 'It is over. The Yellow Sky has fallen.', { frame: false });
        await st.say('guanYu', 'And yet, look at them. Farmers, most of them. Just like us.', { frame: false });
        const r = await st.choose('player', '', [
          { t: '“They were starving. The Han let them starve.”', v: 0 },
          { t: '“They chose rebellion. They paid for it.”', v: 1 },
        ]);
        if (r === 0) { g.progression.addVirtue(2); await st.say('liuBei', 'Remember that feeling, {name}. If ever you govern, remember it.', { frame: false }); }
        else await st.say('zhangFei', 'Hah! That\'s the way to think about it! Let\'s drink!', { frame: false });
        await st.say('narrator', 'For their service, Liu Bei was made Commandant of Anxi County. Guan Yu and Zhang Fei went with him. You were rewarded with coin, rank and a lamellar coat.', { frame: false });
      });
      g.giveItem('lamellar');
      g.player.inventory.coins += 500;
      g.setFlag('ch2_complete', true);
      await st.fadeOut(1.5);
      await g.ui.chapterCard('第二章 終', '黃巾之亂平', 'End of Chapter II', 'The Yellow Turban rebellion is broken — but the fire it lit will burn the Han to the ground. Six years pass.', 5);
    },
    next: 'ch3_start',
  },
};
