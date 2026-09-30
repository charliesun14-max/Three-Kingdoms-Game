// Chapter VI · 赤壁 — The Red Cliffs (winter, 208 AD)
// Zhou Yu's fire attack on Cao Cao's chained fleet, carried on the southeast wind.
import * as THREE from 'three';
import { wait } from '../../ui/UI.js';
import { BattleKit, alive } from '../BattleKit.js';
import { liuBei, joinFight, standDown } from '../cast.js';
import { modal } from '../../ui/CampaignUI.js';

const done = (g, q, o) => !!g.quests.get(q)?.objs.find((x) => x.id === o)?.done;

function fireShip(g, x, z, y) {
  const grp = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });
  const reed = new THREE.MeshStandardMaterial({ color: 0xb89a58, roughness: 1 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 10), wood); hull.position.y = 0.2; grp.add(hull);
  const load = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 1.6, 8), reed); load.rotation.x = Math.PI / 2; load.scale.set(1, 3.2, 1); load.position.y = 1.4; grp.add(load);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7), wood); mast.position.set(0, 4, 2); grp.add(mast);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(3, 4), new THREE.MeshStandardMaterial({ color: 0x9a3a2a, side: THREE.DoubleSide })); sail.position.set(0, 5, 2.1); grp.add(sail);
  grp.traverse((m) => { m.castShadow = true; });
  grp.position.set(x, y, z);
  g.engine.scene.add(grp);
  return grp;
}

export async function runChibi(st, g) {
  await g.travel('chibi', null, { msg: 'Down the Yangtze to the Red Cliffs…' });
  g.time.setDate(208, 11, 20, 15);
  await g.ui.chapterCard('第六章', '赤壁', 'Chapter VI · The Red Cliffs', 'Winter, 208 AD. Cao Cao\'s fleet lies chained together at Wulin on the north bank, to spare his northern soldiers the river-sickness. The allies of the south have one hope: fire.', 6);
  const cmd = st.S.alliedCamp_command;
  const zy = st.actor('zhouYu', { figure: 'zhouYu', name: 'Zhou Yu', cn: '周瑜', title: 'Gongjin 公瑾, Grand Commander of Wu', faction: 'han', x: cmd.x, z: cmd.z + 0.5, weapon: 'jian', body: 'generalArmor', brain: { mode: 'idle' } });
  const zl = st.actor('zhugeLiang', { figure: 'zhugeLiang', name: 'Zhuge Liang', cn: '諸葛亮', title: 'Kongming 孔明, the Sleeping Dragon', faction: 'han', x: cmd.x + 3, z: cmd.z + 2.5, weapon: 'fists', brain: { mode: 'idle' } });
  const hg = st.actor('huangGai', { figure: 'huangGai', name: 'Huang Gai', cn: '黃蓋', title: 'Gongfu 公覆, veteran of Wu', faction: 'han', x: cmd.x - 3, z: cmd.z + 2.5, weapon: 'axe', body: 'lamellar', brain: { mode: 'idle' } });
  for (const c of [zy, zl, hg]) c.facePoint(cmd.x, cmd.z + 10);
  const withLiu = g.flags.liuBond !== 'rival';
  if (withLiu) liuBei(st, cmd.x + 5, cmd.z + 4, { brain: { mode: 'idle' } }).facePoint(cmd.x, cmd.z + 10);
  st.teleportPlayer(cmd.x, cmd.z + 9, Math.PI);
  g.quests.start({
    id: 'q_chibi', main: true, title: 'The Red Cliffs', cn: '赤壁之戰',
    desc: 'Join Zhou Yu and Zhuge Liang against Cao Cao\'s chained fleet.',
    objectives: [
      { id: 'council', text: 'Attend Zhou Yu\'s council', marker: { x: cmd.x, z: cmd.z + 4 }, check: () => st.near(cmd.x, cmd.z + 4, 5) },
      { id: 'ships', text: 'Go to the fire ships on the riverbank at nightfall', hidden: true },
      { id: 'land', text: 'Storm Cao Cao\'s camp at Wulin', hidden: true },
      { id: 'caoren', text: 'Defeat Cao Ren, commander of the rearguard', hidden: true },
    ],
    autoFinish: false,
    chronicle: 'At the Red Cliffs, Huang Gai\'s fire ships ran before the southeast wind into Cao Cao\'s chained fleet. You led the landing at Wulin. Cao Cao fled by the Huarong road.',
  });
  await st.waitFor(() => done(g, 'q_chibi', 'council'));
  await st.cutscene(async () => {
    st.shot([cmd.x + 4, 2, cmd.z + 7], [cmd.x, 1.6, cmd.z + 1.5], 2);
    await st.say('zhouYu', 'So the Lord of Xu comes to the Yangtze. Good. We are fifty thousand; Cao Cao claims eight hundred thousand. Even a quarter of that would drown us — unless the river burns.', { frame: false });
    await st.say('huangGai', 'I have endured a flogging before the whole army so that Cao Cao\'s spies would believe my hatred of Zhou Yu. He has accepted my offer to defect. Tonight my ships sail to him — packed with dry reeds soaked in oil.', { frame: false });
    await st.say('zhugeLiang', 'Cao Cao has chained his ships to calm the northerners\' stomachs. It was Pang Tong who whispered that idea in his ear. A chained fleet cannot scatter.', { frame: false });
    await st.say('zhouYu', 'All that we lack is a wind from the southeast. In winter the wind blows from the northwest. Fire driven that way burns only ourselves.', { frame: false });
    await st.say('zhugeLiang', 'Leave the wind to me. On the night of the twentieth, I will borrow it from Heaven at the Seven Stars Altar.', { frame: false });
    const r = await st.choose('zhouYu', '{name}. Your men will ride in the second wave of ships and land at Wulin while the fleet burns. Will you do it?', [
      { t: '“My men will be the first ashore.”', v: 0 },
      { t: '“And when Cao Cao is broken — what of Jing Province?”', v: 1, tag: 'Ambition' },
    ]);
    if (r === 1) await st.say('zhouYu', 'Ha! A lord who counts the spoils before the battle. We will talk of Jing when Cao Cao is gone.', { frame: false });
  });
  for (const o of g.quests.get('q_chibi').objs) o.hidden = false;
  g.time.hour = 21;
  const shore = { x: 330, z: 20 };
  g.quests.get('q_chibi').objs.find((x) => x.id === 'ships').marker = shore;
  await st.waitFor(() => st.near(shore.x, shore.z, 14));
  g.quests.complete('q_chibi', 'ships');
  // --- the fire attack
  const S = g.world.settlements;
  const water = g.world.hf.waterAt(0, -130) ?? 5;
  const boats = [];
  for (let i = 0; i < 6; i++) boats.push(fireShip(g, 250 + i * 22, -30 - (i % 2) * 12, water));
  await st.cutscene(async () => {
    st.shot([380, water + 8, -10], [300, water + 2, -80], 2);
    await st.say('narrator', 'That night the wind turned. Banners that had streamed south all winter now snapped toward the north. On the Seven Stars Altar, Zhuge Liang lowered his hair and prayed.', { frame: false });
    await st.say('huangGai', 'Hoist the dragon banners! Tell them Huang Gai comes to surrender!', { frame: false });
    // sail
    const t0 = g.clockTime;
    const targets = boats.map((b, i) => ({ b, x: -80 + i * 38, z: -210 }));
    const from = boats.map((b) => b.position.clone());
    st.shot([300, water + 14, -60], [60, water, -200], 0.8);
    await st.waitFor(() => {
      const u = Math.min(1, (g.clockTime - t0) / 7);
      boats.forEach((b, i) => { b.position.x = from[i].x + (targets[i].x - from[i].x) * u; b.position.z = from[i].z + (targets[i].z - from[i].z) * u; b.rotation.y = Math.atan2(targets[i].x - from[i].x, targets[i].z - from[i].z); b.position.y = water + Math.sin(g.clockTime * 2 + i) * 0.15; });
      return u >= 1;
    });
    // ignite
    for (const b of boats) S.addDynamicFire(b.position.x, b.position.z, 2.6, water + 1);
    g.audio.play('cheer');
    const ships = (S.ships || []).filter((s) => s.z < -150);
    st.shot([60, water + 18, -100], [0, water + 4, -225], 1.2);
    for (let i = 0; i < ships.length; i++) {
      const s = ships[(i * 7) % ships.length];
      S.addDynamicFire(s.x, s.z, 3.4, s.y);
      S.addDynamicFire(s.x + 4, s.z - 3, 2.4, s.y + 3);
      await wait(260);
    }
    await st.say('narrator', 'The fire ships struck the chained fleet. Flames leapt from hull to hull; the chains that had steadied Cao Cao\'s ships now bound them to their doom. The fire lit the river and the cliffs red — and they have been called the Red Cliffs ever since.', { frame: false });
  }, { camLocked: true });
  // --- the landing at Wulin
  g.time.hour = 23;
  const land = { x: -40, z: -300 };
  st.teleportPlayer(land.x, land.z, Math.PI);
  const kit = new BattleKit(g, 208);
  const allies = kit.line('han', 12, land.x, land.z + 2, Math.PI, { aggro: 50 });
  const zyF = st.actor('zhouYu', { figure: 'zhouYu', faction: 'han', x: land.x + 4, z: land.z + 3 });
  st.place(zyF, land.x + 4, land.z + 3);
  joinFight([zyF], g.player, 40);
  zyF.faction = 'han';
  const camp = { x: -100, z: -560 };
  const wA = kit.wave('enemy', 12, land.x - 10, land.z - 50, land);
  g.quests.complete('q_chibi', 'land');
  g.quests.get('q_chibi').objs.find((x) => x.id === 'caoren').marker = camp;
  g.audio.play('horn');
  g.ui.subtitle('Zhou Yu', 'Ashore! Ashore! Do not let Cao Cao reform his lines!', 4);
  await st.waitFor(() => alive(wA).length <= 3);
  kit.charge(allies, { x: camp.x, z: camp.z + 40 });
  const cr = kit.officer({ id: 'caoRen', figure: 'caoPi', name: 'Cao Ren', cn: '曹仁', title: 'Zixiao 子孝, General Who Conquers the South', faction: 'enemy', role: 'soldier', x: camp.x, z: camp.z + 30, weapon: 'dao', shield: true, body: 'generalArmor', hp: 900, stats: { str: 17, vit: 17, blade: 15, block: 15 } });
  const wB = kit.wave('enemy', 14, camp.x, camp.z + 20, { x: camp.x, z: camp.z + 60 });
  await st.waitFor(() => cr.dead || g.player.dead);
  g.quests.complete('q_chibi', 'caoren');
  kit.rout([...wA, ...wB]);
  await st.cutscene(async () => {
    const cc = st.actor('caoCao', { figure: 'caoCao', name: 'Cao Cao', cn: '曹操', faction: 'enemy', x: camp.x - 6, z: camp.z - 10, brain: { mode: 'idle' } });
    st.shot([camp.x + 4, 2.4, camp.z + 2], [cc.pos.x, 1.6, cc.pos.z], 2);
    await st.say('caoCao', 'Burned… all of it burned. Very well. A general who cannot retreat is no general at all. To Huarong!', { frame: false });
    cc.ai.goTo(camp.x - 40, camp.z - 80, 5);
    await st.say('narrator', 'Cao Cao fled by the muddy Huarong road with a few hundred riders. The Romance tells that Guan Yu waited there with five hundred swordsmen — and, remembering old kindnesses, let him pass.', { frame: false });
  });
  st.dismiss('caoCao');
  standDown([zyF]);
  g.quests.finish('q_chibi');
  g.progression.addMerit(600, 'the Red Cliffs');
  g.progression.addRenown(25);
  await modal(g, 'Victory at the Red Cliffs 赤壁大捷', 'Cao Cao\'s dream of uniting the realm by the sword has drowned in the Yangtze. Three powers now divide the empire — and yours is one of them.');
  kit.clear();
  return true;
}

export const CHAPTER6 = {};
void done;
