// Free-roam content outside the main story: bounties, militia patrols, and liubo at the tavern.
import { BattleKit, alive } from './BattleKit.js';
import { itemDef } from '../rpg/Items.js';

export class SideQuests {
  constructor(story) {
    this.st = story;
    this.g = story.g;
    this.patrolAt = -1;
  }

  // Returns true if it handled the interaction.
  async interact(it) {
    const g = this.g;
    if (/_notice$/.test(it.id) && g.flags.ch1_oath) return this.bountyBoard();
    return false;
  }

  async talk(c) {
    const g = this.g;
    if ((c.id === 'innkeeper') && g.flags.ch1_oath) return this.tavern(c);
    if ((c.id === 'sergeant' || c.id === 'recruiter' || c.id === 'zouJing') && g.flags.ch1_daxing_won) return this.patrolOffer(c);
    return false;
  }

  bounties() {
    const g = this.g, R = g.world.region;
    return R.settlements.filter((s) => s.type === 'banditCamp' && !g.flags[`cleared_${s.id}`]).map((s) => ({ s, reward: 150 + Math.round(Math.abs(s.x) % 60) }));
  }

  async bountyBoard() {
    const g = this.g, st = this.st;
    const list = this.bounties().filter((b) => !g.quests.isActive(`bounty_${b.s.id}`));
    g.dialogue.begin();
    if (!list.length) { await st.say('herald', 'No bounties are posted today. The roads are quiet — for now.'); g.dialogue.end(); return true; }
    const r = await st.choose('herald', 'Bounties posted by the county office. Wanted: bandits preying on the roads. Rewards paid on proof of the deed.', [
      ...list.map((b) => ({ t: `${b.s.name} ${b.s.cn} — ${b.reward} coins`, v: b.s.id })),
      { t: 'Leave the board.', v: null },
    ]);
    g.dialogue.end();
    const b = list.find((x) => x.s.id === r);
    if (!b) return true;
    const id = b.s.id;
    if (!g.population.camps.get(id)?.some((c) => !c.dead)) g.population.spawnCamp(id, 'bandit', 5);
    g.quests.start({
      id: `bounty_${id}`, title: `Bounty: ${b.s.name}`, cn: '懸賞',
      desc: `The county pays ${b.reward} coins to whoever destroys the bandits at ${b.s.name}.`,
      objectives: [{ id: 'kill', text: `Destroy the bandits at ${b.s.name}`, marker: { x: b.s.x, z: b.s.z }, check: () => g.entities.withTag(id).every((c) => c.dead || c.ai?.surrendered || c.faction === 'civilian') }],
      reward: { coins: b.reward, merit: 30, renown: 3 },
      onComplete: () => { g.flags[`cleared_${id}`] = true; },
      chronicle: `You claimed the county bounty on the bandits of ${b.s.name}.`,
    });
    return true;
  }

  async patrolOffer(c) {
    const g = this.g, st = this.st;
    if (g.quests.isActive('patrol')) return false;
    const day = g.time.year * 400 + g.time.month * 31 + g.time.day;
    g.dialogue.begin();
    if (this.patrolAt === day) { await st.say(c.id, 'You have done your patrol for today. Rest — tomorrow there will be more work.'); g.dialogue.end(); return true; }
    const r = await st.choose(c.id, 'Scattered rebels still raid the outlying farms. Will you take a patrol out? The army pays in coin and merit.', [
      { t: 'I will lead the patrol.', v: 1 }, { t: 'Not now.', v: 0 },
    ]);
    g.dialogue.end();
    if (!r) return true;
    this.patrolAt = day;
    const R = g.world.region;
    const hf = g.world.hf;
    let x = 0, z = 0;
    for (let i = 0; i < 40; i++) {
      x = (Math.random() - 0.5) * hf.size * 0.7; z = (Math.random() - 0.5) * hf.size * 0.7;
      if (Math.hypot(x - g.player.pos.x, z - g.player.pos.z) > 150 && hf.waterAt(x, z) === null && hf.slope(x, z) < 0.3 && !R.settlements.some((s) => Math.abs(s.x - x) < s.w && Math.abs(s.z - z) < s.d)) break;
    }
    const kit = new BattleKit(g, Math.floor(Math.random() * 1e5));
    const band = kit.wave(Math.random() < 0.5 ? 'yellowTurban' : 'bandit', 4 + Math.floor(Math.random() * 3), x, z, { x, z }, { aggro: 18 });
    for (const b of band) { b.ai.mode = 'wander'; b.ai.area = { x, z, r: 10 }; b.tags.delete('alwaysActive'); }
    kit.morale(band, { name: 'The raiders' });
    g.quests.start({
      id: 'patrol', title: 'Patrol Duty', cn: '巡邏',
      desc: 'A band of raiders has been sighted in the countryside. Find and destroy them.',
      objectives: [{ id: 'kill', text: 'Destroy the raiders', count: band.length, marker: { x, z }, check: () => band.length - alive(band).length }],
      reward: { coins: 60 + band.length * 10, merit: 25 },
      chronicle: 'You led a patrol against raiders in the countryside.',
    });
    return true;
  }

  // 六博 liubo: each player throws six sticks; the most marked faces wins.
  async tavern(c) {
    const g = this.g, st = this.st;
    g.dialogue.begin();
    const r = await st.choose(c.id, 'Welcome, welcome! Wine, meat — or a game of liubo? The dice sticks are fresh-cut bamboo.', [
      { t: 'Show me your food and wine.', v: 'shop' },
      { t: 'A hot meal and a cup of wine. (12 coins)', v: 'meal', if: () => g.player.inventory.coins >= 12 },
      { t: 'Play liubo — bet 10 coins', v: 10, if: () => g.player.inventory.coins >= 10 },
      { t: 'Play liubo — bet 50 coins', v: 50, if: () => g.player.inventory.coins >= 50 },
      { t: 'Rent a mat for the night (8 coins)', v: 'sleep', if: () => g.player.inventory.coins >= 8 },
      { t: 'Nothing, thank you.', v: 0 },
    ]);
    if (r === 'shop') { g.dialogue.end(); g.ui.openShop(c); return true; }
    if (r === 'meal') { g.dialogue.end(); await g.life?.act.meal(c); return true; }
    if (r === 'sleep') { g.player.inventory.coins -= 8; g.dialogue.end(); await g.sleep({}); return true; }
    if (typeof r === 'number' && r > 0) {
      const throwSticks = () => Array.from({ length: 6 }, () => (Math.random() < 0.5 ? 1 : 0)).reduce((a, b) => a + b, 0);
      const you = throwSticks(), him = throwSticks();
      const glyph = (n) => '▮'.repeat(n) + '▯'.repeat(6 - n);
      if (you > him) { g.player.inventory.coins += r; g.audio.play('coins'); await st.say(c.id, `You throw ${glyph(you)} — ${you} marked! I throw ${glyph(him)}. Aiya, the sticks favour you. ${r} coins, yours.`); g.progression.addRenown(0.2); }
      else if (you < him) { g.player.inventory.coins -= r; await st.say(c.id, `You throw ${glyph(you)}, I throw ${glyph(him)} — ${him} marked! Heaven smiles on the house today.`); }
      else await st.say(c.id, `${glyph(you)} against ${glyph(him)} — a draw! Keep your coins.`);
    }
    g.dialogue.end();
    void itemDef;
    return true;
  }
}
