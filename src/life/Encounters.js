// Chance happenings in the street: a purse-snatcher, a lost child, a belligerent drunk, a bully
// shaking down a vendor. One at a time, every few minutes, while the player is in a town or village.
import { BARKS, pick } from './barkLines.js';
import { randomName } from '../entities/Population.js';
import { randomAppearance } from '../entities/Humanoid.js';
import { Rng } from '../core/Rng.js';

export class Encounters {
  constructor(game) {
    this.g = game;
    this.rng = new Rng(Math.floor(Math.random() * 1e6));
    this.cur = null;
    this.next = 70 + Math.random() * 60;
  }

  inTown() { const k = this.g.locationKind; return k === 'walledTown' || k === 'village' || k === 'hamlet'; }

  update(dt) {
    const g = this.g;
    if (this.cur) { this.cur.update?.(dt); return; }
    if (g.dialogue.active || g.cutscene || g.inCombat || g.social.brawl || g.minigame || g.law.wanted() > 0) return;
    this.next -= dt;
    if (this.next > 0 || !this.inTown()) return;
    this.next = 150 + Math.random() * 150;
    const h = g.time.hour;
    const choices = [];
    if (h > 8 && h < 19) choices.push('thief', 'child', 'bully');
    if (h > 17 || h < 2) choices.push('drunk');
    const k = choices[Math.floor(Math.random() * choices.length)];
    if (k) try { this[k](); } catch (e) { console.warn('encounter', e); this.cur = null; }
  }

  civiliansNear(r = 30) {
    const g = this.g;
    return g.entities.nearby(g.player.pos, r).filter((c) => c !== g.player && !c.dead && c.faction === 'civilian' && c.ai && !c.ai.override && !c.ai.script && !c.ai.hidden && !c.essential && c.role !== 'child');
  }
  spawnAt(dist, role, look, extra = {}) {
    const g = this.g, p = g.player;
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * 6.28, x = p.pos.x + Math.cos(a) * dist, z = p.pos.z + Math.sin(a) * dist;
      if (g.world.hf.waterAt(x, z) !== null || !g.nav || !g.nav.free) continue;
      return g.population.spawn({ ...randomName(this.rng, look === 'woman'), role, faction: 'civilian', x, z, appearance: randomAppearance(look, this.rng), brain: { mode: 'idle' }, ...extra });
    }
    return null;
  }
  done(cleanup = []) {
    for (const c of cleanup) if (c && !c.dead) { c.ai.override = null; setTimeout(() => this.g.entities.list.includes(c) && this.g.entities.remove(c), 30000); }
    this.cur = null;
  }

  // ---- a purse-snatcher -------------------------------------------------------------
  thief() {
    const g = this.g, p = g.player;
    const victim = this.civiliansNear(25)[0];
    if (!victim) return;
    const th = g.population.spawn({ ...randomName(this.rng), role: 'thief', title: 'purse-snatcher', faction: 'civilian', x: victim.pos.x + 1.2, z: victim.pos.z + 0.6, appearance: { ...randomAppearance('bandit', this.rng), headwear: 'wrap' }, brain: { archetype: 'bandit', mode: 'idle', fighter: false, tune: { fleeAt: 0.7, surrender: 1 } } });
    th.tags.add('thief');
    const purse = 20 + Math.floor(Math.random() * 40);
    g.barks.say(victim, pick(['My purse! Thief! Stop him!', 'Aiya! He took my money!', 'Thief! Somebody stop him!']), 3);
    const away = { x: th.pos.x - p.pos.x, z: th.pos.z - p.pos.z };
    const L = Math.hypot(away.x, away.z) || 1;
    let stamina = 28;
    const run = () => {
      if (th.dead || th.ai.surrendered) return false;
      stamina -= g.dt;
      const tired = stamina < 0;
      const dx = th.pos.x - p.pos.x, dz = th.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
      th.model.anim.setPose(null);
      if (d > 70) { stamina = 99; return true; }
      th.ai.navTo(th.pos.x + (dx / d + away.x / L * 0.5) * 8, th.pos.z + (dz / d + away.z / L * 0.5) * 8, tired ? 3.2 : 5.4, 1);
      return true;
    };
    th.ai.override = run;
    const qid = `enc_thief_${Math.floor(g.clockTime)}`;
    const st = { th, victim, purse, got: false, returned: false };
    g.quests.start({ id: qid, title: 'Stop, Thief!', cn: '捉賊', desc: `A purse-snatcher robbed ${victim.name} in the street.`, objectives: [
      { id: 'catch', text: 'Catch the thief', marker: () => (th.dead ? null : th.pos), check: () => st.got },
      { id: 'return', text: `Return the purse to ${victim.name} — or keep it`, marker: () => victim.pos, check: () => st.returned },
    ], autoFinish: false });
    this.cur = {
      kind: 'thief', st, qid,
      update: () => {
        if (st.got && !st.returned && victim.dead) { g.quests.finish(qid); this.done([th]); }
        if (!st.got && (th.dead || th.ai.surrendered || th.distTo(p) < 1.7)) this.thiefCaught(th);
        if (!st.got && th.distTo(p) > 140) { g.ui.notify('The thief got away.', 'item'); g.quests.get(qid).state = 'failed'; this.done([th]); }
      },
      talk: async (c) => {
        if (c === victim && st.got && !st.returned) {
          g.dialogue.begin();
          const r = await g.story.choose(victim.id, 'You caught him! Heaven bless you — do you have my purse?', [
            { t: `Return the purse. (${purse} coins)`, v: 1 }, { t: 'Keep it. "What purse?"', v: 0 },
          ]);
          if (r) { p.inventory.coins -= Math.min(purse, p.inventory.coins); await g.story.say(victim.id, 'All of it! Here — take ten for your trouble. There are still good men under Heaven.'); p.inventory.coins += 10; g.progression.addVirtue(3, 'honesty'); g.progression.addRenown(0.5); }
          else { await g.story.say(victim.id, '…I see. You are no better than he was.'); g.progression.addVirtue(-3, 'keeping a stolen purse'); }
          g.dialogue.end();
          st.returned = true; g.quests.finish(qid); this.done([th]);
          return true;
        }
        return false;
      },
    };
  }
  thiefCaught(th) {
    const g = this.g, st = this.cur.st;
    if (st.got) return;
    st.got = true;
    th.ai.override = null;
    th.ai.surrendered = true; th.stop(); th.model.anim.setPose('surrender');
    g.barks.say(th, pick(['All right! All right! Here — take it!', 'Mercy! I have children to feed!', 'Don\'t hit me! Here\'s the purse!']), 3);
    g.player.inventory.coins += st.purse;
    g.ui.notify(`You recover the purse (${st.purse} coins).`, 'item');
    g.progression.gain('agi', 1);
    setTimeout(() => { if (!th.dead) { th.ai.surrendered = false; th.model.anim.setPose(null); this.g.law.flee?.(th, 20); } }, 5000);
  }

  // ---- a lost child -------------------------------------------------------------------
  child() {
    const g = this.g, p = g.player;
    const kid = this.spawnAt(6, 'child', 'child');
    const mother = this.spawnAt(55 + Math.random() * 25, 'villager', 'woman');
    if (!kid || !mother) { this.done([kid, mother]); return; }
    kid.ai.override = () => { kid.stop(); kid.faceYaw = Math.atan2(p.pos.x - kid.pos.x, p.pos.z - kid.pos.z); kid.model.anim.setLoop('wash'); return true; };
    mother.ai.override = () => { mother.ai.navTo(mother.pos.x + Math.sin(g.clockTime * 0.2) * 2, mother.pos.z, 1, 0.5); return true; };
    g.barks.say(kid, 'Waaah… I can\'t find my mama…', 4);
    const qid = `enc_child_${Math.floor(g.clockTime)}`;
    const st = { following: false, done: false };
    g.quests.start({ id: qid, title: 'A Lost Child', cn: '迷童', desc: 'A little one has lost their mother in the crowd.', objectives: [
      { id: 'talk', text: 'Comfort the crying child', marker: () => kid.pos, check: () => st.following },
      { id: 'mother', text: `Bring the child to ${mother.name}`, marker: () => mother.pos, check: () => st.done },
    ], autoFinish: false, reward: { renown: 0.5 } });
    this.cur = {
      kind: 'child',
      update: () => {
        if (kid.dead || mother.dead) { g.quests.get(qid).state = 'failed'; this.done([kid, mother]); return; }
        if (st.following && kid.distTo(mother) < 4 && !st.done) {
          st.done = true;
          kid.ai.override = () => { kid.stop(); kid.faceYaw = Math.atan2(mother.pos.x - kid.pos.x, mother.pos.z - kid.pos.z); return true; };
          g.barks.say(kid, 'Mama!', 2.5);
          setTimeout(() => g.barks.say(mother, 'Little Hu! Where did you go? Oh — thank you, kind sir, thank you!', 4), 1200);
          g.player.inventory.coins += 5; g.progression.addVirtue(2, 'kindness');
          g.quests.finish(qid);
          setTimeout(() => this.done([kid, mother]), 6000);
        }
      },
      talk: async (c) => {
        if (c === kid && !st.following) {
          g.dialogue.begin();
          await g.story.say(kid.id, 'I was watching the juggler and Mama was gone… She has a blue headscarf. Will you help me find her?');
          g.dialogue.end();
          st.following = true;
          kid.model.anim.setLoop(null);
          kid.ai.override = () => { const d = kid.distTo(p); if (d > 2) kid.ai.navTo(p.pos.x, p.pos.z, d > 6 ? 3.5 : 1.8, 1.5); else { kid.stop(); kid.faceYaw = null; } return true; };
          return true;
        }
        return false;
      },
    };
  }

  // ---- a drunk spoiling for a fight ----------------------------------------------------------
  drunk() {
    const g = this.g, p = g.player;
    const d = this.spawnAt(12, 'townsman', 'farmer');
    if (!d) return;
    d.name = 'Drunkard ' + d.name.split(' ')[0]; d.title = 'reeking of millet wine';
    d.temper = 'tough';
    let t = 0, said = 0;
    const lines = ['Hey! HEY! You! You looking at me?', 'Hic… I could take you. I could take ten of you!', 'Your face… your face is an insult to my ancestors!'];
    d.ai.override = () => {
      t += g.dt;
      const dist = d.distTo(p);
      d.ai.navTo(p.pos.x + Math.sin(t * 2) * 1.5, p.pos.z, 1.1, 2.2);
      d.yaw += Math.sin(t * 3) * 0.02;
      if (t > said * 6 && said < lines.length && dist < 9) { g.barks.say(d, lines[said], 3); said++; }
      if (said >= lines.length && dist < 3.5 && t > 20) { d.ai.override = null; g.social.startBrawl(d); return false; }
      if (t > 50 || dist > 40) return false;
      return true;
    };
    this.cur = {
      kind: 'drunk',
      update: () => { if (!d.ai.override && !g.social.brawl) this.done([d]); },
      talk: async (c) => {
        if (c !== d) return false;
        g.dialogue.begin();
        const r = await g.story.choose(d.id, 'Wha— what d\'you want? Hic.', [
          { t: 'Go home and sleep it off, friend.', v: 'calm', tag: `Speech ${p.stats.speech}` },
          { t: 'Buy him a bowl of soup instead. (5 coins)', v: 'soup', if: () => p.inventory.coins >= 5 },
          { t: 'You want a fight? Come on, then.', v: 'fight' },
        ]);
        g.dialogue.end();
        if (r === 'fight' || (r === 'calm' && Math.random() > 0.3 + p.stats.speech * 0.05)) { g.barks.say(d, 'Ha! Now you\'ve done it!', 2.5); d.ai.override = null; g.social.startBrawl(d); }
        else { if (r === 'soup') { p.inventory.coins -= 5; g.progression.addVirtue(1, 'kindness'); } g.barks.say(d, r === 'soup' ? 'Soup… soup is good. You\'re all right, you.' : 'Hic… maybe you\'re right… my wife will kill me…', 3); d.ai.override = null; d.ai.mode = 'wander'; d.ai.area = { x: d.pos.x + 30, z: d.pos.z, r: 10 }; this.done([d]); }
        return true;
      },
    };
  }

  // ---- a bully shaking down a vendor -----------------------------------------------------------
  bully() {
    const g = this.g;
    const vendor = g.entities.nearby(g.player.pos, 45).find((c) => c.shop && !c.dead && c.ai && !c.ai.override);
    if (!vendor) return;
    const b = g.population.spawn({ ...randomName(this.rng), role: 'townsman', title: 'local tough', faction: 'civilian', x: vendor.pos.x + Math.sin(vendor.yaw) * 1.6, z: vendor.pos.z + Math.cos(vendor.yaw) * 1.6, appearance: { ...randomAppearance('bandit', this.rng), build: 1.25, height: 1.82 }, brain: { mode: 'idle' } });
    b.temper = 'tough';
    vendor.ai.override = () => { vendor.stop(); vendor.faceYaw = Math.atan2(b.pos.x - vendor.pos.x, b.pos.z - vendor.pos.z); vendor.model.anim.setPose('cower'); return !this.curDone; };
    let t = 0;
    b.ai.override = () => {
      t += g.dt; b.stop(); b.faceYaw = Math.atan2(vendor.pos.x - b.pos.x, vendor.pos.z - b.pos.z);
      if (t % 5 < g.dt) { g.barks.say(b, pick(['Pay up, old man. The street is not free.', 'Protection money! Or do you want an accident?', 'Five hundred coins, or your stall burns tonight.']), 3); if (!b.model.anim.clip) b.model.anim.play('insult'); }
      return true;
    };
    this.curDone = false;
    const qid = `enc_bully_${Math.floor(g.clockTime)}`;
    const st = { resolved: false };
    g.quests.start({ id: qid, title: 'Protection Money', cn: '惡霸', desc: `A thug is shaking down ${vendor.name} at the market.`, objectives: [{ id: 'deal', text: 'Deal with the thug', marker: () => b.pos, check: () => st.resolved }], autoFinish: false });
    const finish = (good) => {
      st.resolved = true; this.curDone = true; vendor.ai.override = null; vendor.model.anim.setPose(null);
      if (good) {
        g.barks.say(vendor, 'Heaven sent you! Take this — it\'s the least I can do.', 3.5);
        const goods = vendor.inventory.list().filter((i) => i.type === 'use' || i.type === 'trade');
        const gift = goods[0];
        if (gift) { vendor.inventory.remove(gift.id); g.player.inventory.add(gift.id); g.ui.notify(`${vendor.name} gives you ${gift.name}.`, 'item'); }
        g.player.inventory.coins += 15; g.progression.addVirtue(2, 'protecting the weak'); g.progression.addRenown(1);
      }
      g.quests.finish(qid);
    };
    this.cur = {
      kind: 'bully',
      update: () => {
        if (st.resolved) { if (!g.social.brawl) this.done([b]); return; }
        const br = g.social.brawl;
        if (b.dead) finish(true);
        else if (this.fought && !br && b.mem?.fear) finish(true);
        else if (this.fought && !br && !b.mem?.fear) { finish(false); g.barks.say(vendor, 'Aiya… he\'ll be back tomorrow.', 3); }
      },
      talk: async (c) => {
        if (c !== b || st.resolved) return false;
        g.dialogue.begin();
        const ren = g.progression.renown;
        const r = await g.story.choose(b.id, 'What? This is none of your business. Walk on.', [
          { t: 'Leave him be. Now.', v: 'threat', tag: `Renown ${Math.round(ren)}` },
          { t: 'Here — take this and go. (30 coins)', v: 'pay', if: () => g.player.inventory.coins >= 30 },
          { t: 'Then I\'ll make it my business. (Fight)', v: 'fight' },
        ]);
        g.dialogue.end();
        if (r === 'pay') { g.player.inventory.coins -= 30; g.barks.say(b, 'Hmph. Easy money.', 2.5); b.ai.override = null; b.ai.mode = 'wander'; finish(true); }
        else if (r === 'threat' && Math.random() < 0.25 + ren * 0.02) { g.barks.say(b, '…Tch. Not worth it.', 2.5); b.ai.override = null; b.ai.mode = 'wander'; b.ai.area = { x: b.pos.x + 40, z: b.pos.z, r: 10 }; finish(true); }
        else { g.barks.say(b, 'You want to bleed for this old fool? Fine!', 2.5); b.ai.override = null; this.fought = true; g.social.startBrawl(b); }
        return true;
      },
    };
  }

  async talk(c) { return this.cur?.talk ? this.cur.talk(c) : false; }
}
