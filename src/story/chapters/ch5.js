// Chapter V · 群雄逐鹿 — The Deer Hunt of Warlords (199–208 AD)
// The strategic campaign: yearly orders from the war table in Xiaopei, field battles
// fought in person or by your generals, historical events, and famous officers.
import * as THREE from 'three';
import { wait } from '../../ui/UI.js';
import { BattleKit, alive } from '../BattleKit.js';
import { Campaign, FACTIONS } from '../Campaign.js';
import { CampaignUI, modal } from '../../ui/CampaignUI.js';
import { REGIONS } from '../../world/regions.js';
import { hashStr } from '../../core/Rng.js';

const OFFICERS = {
  zhaoYun: { figure: 'gongsunZan', name: 'Zhao Yun', cn: '趙雲', title: 'Zilong 子龍', weapon: 'spear', appearance: { height: 1.84, skin: 0xd8b088, robe: 0xe8e4d8, outfit: 'soldier', headwear: 'helmet', armor: 'general', armorColor: 0xc8c8cc, cape: 0xe8e4d8, beard: 'none', face: { stern: true } }, stats: { str: 17, agi: 16, vit: 17, polearm: 18, block: 16 } },
  xuShu: { name: 'Xu Shu', cn: '徐庶', title: 'Yuanzhi 元直', weapon: 'jian', appearance: { height: 1.76, skin: 0xd8b088, robe: 0x3a4a5a, outfit: 'robe', headwear: 'wrap', beard: 'goatee' }, stats: { str: 11, agi: 13, vit: 12, blade: 12, block: 10 } },
  zangBa: { figure: 'zangBa', name: 'Zang Ba', cn: '臧霸', title: 'Xuangao 宣高', weapon: 'dao', shield: true, stats: { str: 15, agi: 11, vit: 15, blade: 13, block: 12 } },
};

// Visual tag for battle banners per faction.
function bannerFor(f) { const F = FACTIONS[f]; return { cn: F.cn, colors: { bg: F.color, fg: '#f0e0b0', border: '#e8c860' } }; }

export async function runFieldBattle(st, g, spec) {
  // spec: { enemy, ourK, theirK, place, defence }
  const pb = bannerFor('player'), eb = bannerFor(spec.enemy);
  const pcn = g.player.cn?.[0] || '秦';
  const base = REGIONS.battlefield;
  const overrides = {
    seed: hashStr(spec.place + spec.enemy) % 100000,
    name: `Field of ${spec.place}`, cn: '戰場',
    settlements: [
      { ...base.settlements[0], banners: [pcn, '漢'], gateBanners: [pcn, pcn], bannerColors: pb.colors },
      { ...base.settlements[1], banners: [eb.cn, '軍'], gateBanners: [eb.cn, eb.cn], bannerColors: eb.colors },
    ],
  };
  await g.travel('battlefield', { x: 0, z: 80 }, { overrides, msg: `Marching to battle in ${spec.place}…` });
  g.time.hour = 9 + Math.random() * 6;
  const kit = new BattleKit(g, overrides.seed);
  const ours = kit.line('militia', Math.max(8, Math.min(18, Math.round(spec.ourK / 2))), 0, 60, Math.PI, { aggro: 40 });
  const officers = [];
  (g.campaign.officers || []).filter((id) => OFFICERS[id]).forEach((id, i) => {
    const o = OFFICERS[id];
    const c = kit.officer({ ...o, id, faction: 'militia', role: 'soldier', x: -6 + i * 12, z: 68, body: 'generalArmor', hp: 700, brain: { archetype: 'hero', fighter: true, mode: 'follow', leader: g.player, formation: [-3 + i * 6, -2], aggroRange: 40 } });
    c.essential = true;
    officers.push(c);
  });
  const nE = Math.max(10, Math.min(24, Math.round(spec.theirK / 2)));
  const gen = FACTIONS[spec.enemy].general;
  const general = kit.officer({ id: 'enemyGeneral', figure: gen.figure, name: gen.name, cn: gen.cn, title: `General of ${FACTIONS[spec.enemy].name}`, faction: 'enemy', role: 'soldier', x: 0, z: -70, weapon: 'ji', body: 'generalArmor', hp: 800, stats: { str: 16, vit: 16, polearm: 15, block: 14 } });
  const w1 = kit.wave('enemy', Math.ceil(nE * 0.55), 0, -50, { x: 0, z: 40 });
  g.quests.start({
    id: 'q_field', main: true, title: `Battle for ${spec.place}`, cn: '野戰',
    desc: spec.defence ? `${FACTIONS[spec.enemy].name} invades ${spec.place}. Hold the field.` : `Your army meets ${FACTIONS[spec.enemy].name}'s host in ${spec.place}.`,
    objectives: [
      { id: 'break', text: 'Break the enemy vanguard', count: w1.length, check: () => w1.length - alive(w1).length },
      { id: 'gen', text: `Defeat ${gen.name} ${gen.cn}`, hidden: true, marker: () => (general.dead ? null : general.pos) },
    ],
    autoFinish: false,
  });
  g.player.essential = true;
  g.audio.play('horn');
  g.ui.subtitle(g.player.name, 'Soldiers! For the people and for Heaven — advance!', 4);
  st.teleportPlayer(0, 72, Math.PI);
  kit.charge(ours, { x: 0, z: -30 });
  let lost = false;
  const knocked = () => g.clockTime < g.player.combat.knockedUntil;
  await st.waitFor(() => alive(w1).length <= 2 || knocked());
  if (!knocked()) {
    for (const o of g.quests.get('q_field').objs) o.hidden = false;
    const w2 = kit.wave('enemy', nE - w1.length, 0, -80, { x: 0, z: 20 });
    kit.charge([general], { x: 0, z: 10 });
    g.ui.subtitle(gen.name, 'Cut them down! Bring me their general\'s head!', 4);
    await st.waitFor(() => general.dead || knocked());
    if (general.dead) { kit.rout(w2); kit.rout(w1); g.audio.play('cheer'); }
  }
  lost = knocked();
  g.player.essential = false;
  if (lost) {
    g.player.hp = Math.max(g.player.hp, g.player.hpMax * 0.3);
    await modal(g, 'Defeat 敗', `Struck from your feet, you were carried from the field by your guards. The battle for ${spec.place} is lost.`);
  } else {
    g.quests.complete('q_field', 'break'); g.quests.complete('q_field', 'gen');
    await modal(g, 'Victory 勝', `${gen.name} has fallen and ${FACTIONS[spec.enemy].name}'s army flees. ${spec.place} is yours.`);
  }
  g.quests.finish('q_field');
  g.quests.list = g.quests.list.filter((q) => q.id !== 'q_field');
  const alliesLeft = alive(ours).length / Math.max(1, ours.length);
  await g.travel('xuzhou', null, { msg: 'Returning to Xiaopei…' });
  return { win: !lost, ratio: lost ? 0.3 : 0.5 + alliesLeft * 0.3 };
}

export const CHAPTER5 = {
  ch5_campaign: {
    chapter: 5,
    title: 'The Deer Hunt of Warlords',
    async setup(st, g, o) {
      if (g.regionId !== 'xuzhou') await g.travel('xuzhou', null, { msg: 'Xiaopei, seat of your government…' });
      if (!g.campaign) g.campaign = new Campaign(g);
      g.campaignUI = g.campaignUI || new CampaignUI(g);
      const hall = st.S.xiaopei_hall || st.S.yamenHall;
      // war table in the hall courtyard
      const tbl = { id: 'war_table', x: hall.x + 3, z: hall.z + 4, r: 2.4, label: 'War table — plan the year\'s campaign', kind: 'wartable' };
      g.world.interactables.push(tbl);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 2), new THREE.MeshStandardMaterial({ color: 0xc8b088, roughness: 0.8 }));
      mesh.position.set(tbl.x, g.world.groundHeight(tbl.x, tbl.z) + 0.75, tbl.z);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.75, 1.8), new THREE.MeshStandardMaterial({ color: 0x4a3020 }));
      legs.position.y = -0.4; mesh.add(legs);
      mesh.castShadow = true;
      g.engine.scene.add(mesh);
      st.actor('chenDeng', { figure: 'chenDeng', name: 'Chen Deng', cn: '陳登', title: 'Yuanlong 元龍, your chief adviser', faction: 'militia', x: tbl.x - 2, z: tbl.z - 1, weapon: 'fists', brain: { mode: 'idle' } }).facePoint(tbl.x, tbl.z);
      for (const id of g.campaign.officers) if (OFFICERS[id]) {
        const c = st.actor(id, { ...OFFICERS[id], faction: 'militia', x: tbl.x + 2 + Math.random() * 3, z: tbl.z + 2, body: 'generalArmor', brain: { mode: 'idle' } });
        c.facePoint(tbl.x, tbl.z);
      }
      if (!o.restore) st.teleportPlayer(tbl.x, tbl.z + 3, Math.PI);
      if (!g.flags.ch5_intro) {
        g.flags.ch5_intro = true;
        await g.ui.chapterCard('第五章', '群雄逐鹿', 'Chapter V · The Deer Hunt of Warlords', 'When the Qin lost its deer, the whole world chased after it. — Each year, give your orders at the war table in Xiaopei. Conquer provinces to rise from Governor to Duke and King.', 6);
      }
      g.campaign.checkTitles();
    },
    async run(st, g) {
      const c = g.campaign;
      g.quests.start({
        id: 'q_campaign', main: true, title: 'The Deer Hunt', cn: '逐鹿',
        desc: 'Expand from Xu Province. Three provinces make you a Duke; six a King. The Son of Heaven is held by Cao Cao at Xuchang, in Yu Province.',
        objectives: [
          { id: 'table', text: 'Give the year\'s orders at the war table in Xiaopei', marker: { x: st.S.yamenHall.x + 3, z: st.S.yamenHall.z + 4 } },
          { id: 'duke', text: 'Hold 3 provinces (Duke 公)', check: () => c.owned().length >= 3 },
          { id: 'king', text: 'Hold 6 provinces (King 王)', check: () => c.owned().length >= 6 },
        ],
        autoFinish: false,
      });
      let turn = false;
      st.objHandlers.set('war_table', async () => { turn = true; return true; });
      st.talkHandlers.set('chenDeng', async () => {
        const r = await (async () => { g.dialogue.begin(); const v = await st.choose('chenDeng', `My lord. The treasury holds ${c.gold.toLocaleString()} thousand coins; we field ${c.troops()} thousand men. ${c.owned('cao').length > 4 ? 'Cao Cao grows too strong — seek allies in the south.' : 'The north is divided. Strike while it quarrels.'}`, [{ t: 'Open the war table.', v: 1 }, { t: 'That will be all.', v: 0 }]); g.dialogue.end(); return v; })();
        if (r) turn = true;
        return true;
      });
      for (;;) {
        await st.waitFor(() => turn);
        turn = false;
        const order = await g.campaignUI.open();
        if (order.type === 'close') continue;
        if (order.type === 'attack') {
          const b = c.prepareAttack(order.id);
          const place = c.prov[order.id].name;
          if (order.mode === 'field') {
            const res = await runFieldBattle(st, g, { enemy: b.defender, ourK: b.commit, theirK: b.defTroops, place });
            c.applyResult(b, res.win, res.ratio);
            await CHAPTER5.ch5_campaign.setup(st, g, { restore: true });
          } else {
            const r = c.autoResolve(b);
            await modal(g, r.win ? 'Victory 捷報' : 'Defeat 敗報', r.win ? `Your generals report: ${place} has fallen. We lost ${r.ourLoss},000 men; the enemy ${r.theirLoss},000.` : `Your generals were repulsed at ${place}. ${r.ourLoss},000 men were lost.`);
          }
        } else if (order.type === 'recruit') {
          if (!c.recruit()) await modal(g, 'The Treasury', 'There is not enough coin to raise new troops.');
        } else if (order.type === 'develop') {
          if (!c.develop(order.id)) await modal(g, 'The Treasury', 'There is not enough coin, or the province is already flourishing.');
        } else if (order.type === 'ally') {
          const ok = c.proposeAlliance(order.faction);
          await modal(g, 'Diplomacy 外交', ok ? `${FACTIONS[order.faction].name} accepts your envoy's terms. You are allies.` : `${FACTIONS[order.faction].name} sends your envoy back with polite refusals.`);
        }
        g.quests.complete('q_campaign', 'table');
        g.quests.get('q_campaign').objs.find((x) => x.id === 'table').done = false;
        // the year turns
        const events = c.endYear();
        g.player.inventory.coins += Math.round(c.income() * 0.2);
        for (const ev of events) {
          if (ev.kind === 'event') await modal(g, ev.title, ev.text);
          else if (ev.kind === 'officer') {
            const pr = g.progression;
            const ok = (ev.need === 'virtue' ? pr.virtue : pr.renown) >= ev.min;
            if (ok) {
              const r = await modal(g, ev.title, ev.text + ' He will serve you, if you will have him.', ['Welcome him to your banner', 'Send him away']);
              if (r === 0) { c.officers.push(ev.id); c.note(`${OFFICERS[ev.id].name} ${OFFICERS[ev.id].cn} joined your service.`); }
            } else await modal(g, ev.title, ev.text + ` But he finds your ${ev.need === 'virtue' ? 'reputation for benevolence' : 'renown'} wanting, and rides on to seek Liu Bei instead.`);
          } else if (ev.kind === 'invasion') {
            const place = c.prov[ev.target].name;
            const r = await modal(g, 'Invasion! 敵襲', `${FACTIONS[ev.attacker].name} marches on ${place} with ${ev.troops},000 men!`, ['Ride to the defence in person', 'Trust the garrison']);
            let win;
            if (r === 0) { const res = await runFieldBattle(st, g, { enemy: ev.attacker, ourK: c.prov[ev.target].troops, theirK: ev.troops, place, defence: true }); win = res.win; await CHAPTER5.ch5_campaign.setup(st, g, { restore: true }); }
            else win = c.strength('player', c.prov[ev.target].troops) * 1.2 * (0.8 + Math.random() * 0.4) > c.strength(ev.attacker, ev.troops);
            c.resolveDefence(ev, win);
            if (r !== 0) await modal(g, win ? 'The walls held' : 'A province lost', win ? `The garrison of ${place} threw back the invaders.` : `${place} has fallen to ${FACTIONS[ev.attacker].name}.`);
          } else if (ev.kind === 'chibi') {
            c.flags.chibi = true;
            await modal(g, 'Cao Cao Marches South 南征', 'Cao Cao has taken Jing Province and marches down the Yangtze with a host he claims numbers eight hundred thousand. Sun Quan\'s envoy Lu Su and Liu Bei\'s strategist Zhuge Liang beg you to join them at the Red Cliffs.', ['To the Red Cliffs!']);
            const { runChibi } = await import('./ch6.js');
            const win = await runChibi(st, g);
            c.afterChibi(win);
            await CHAPTER5.ch5_campaign.setup(st, g, { restore: true });
          } else if (ev.kind === 'finalReady') {
            await modal(g, 'The Road to Xuchang 許昌', 'Cao Cao\'s power is broken and the road to Xuchang lies open. The Son of Heaven waits behind its walls. Attack Yu Province from the war table to begin the final campaign.');
          }
        }
        c.checkTitles();
        g.save(true);
        // Final campaign: attacking Yu after Red Cliffs
        if (c.prov.yu.owner === 'player' || (c.flags.finalStart)) break;
        if (c.flags.chibiDone && c.owned().length >= 3 && c.prov.yu.owner !== 'player' && c.canAttack('yu')) {
          const r = await modal(g, 'The Mandate Beckons 天命', 'Your ministers kneel: “The Han is a hollow shell; Cao Cao holds the Emperor like a puppet. March on Xuchang, and let Heaven decide.”', ['March on Xuchang (final chapter)', 'Not yet']);
          if (r === 0) { c.flags.finalStart = true; break; }
        }
      }
      g.quests.finish('q_campaign');
    },
    next: 'ch7_xuchang',
  },
};
void wait;
