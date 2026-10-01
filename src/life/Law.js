// Crime and the county law: witnesses, bounties per region, guards who chase and confront,
// fines, bribes, jail — and pickpocketing and stall theft for the light-fingered.
import { BARKS, pick } from './barkLines.js';
import { itemDef } from '../rpg/Items.js';

export const CRIMES = {
  theft: { fine: 25, name: 'theft' },
  pickpocket: { fine: 20, name: 'picking pockets' },
  assault: { fine: 40, name: 'assault' },
  murder: { fine: 250, name: 'murder' },
  trespass: { fine: 15, name: 'breaking into a house' },
  insult: { fine: 8, name: 'insulting an officer' },
  bribery: { fine: 30, name: 'attempted bribery' },
  resisting: { fine: 60, name: 'resisting arrest' },
  horseTheft: { fine: 70, name: 'horse theft' },
};

export class Law {
  constructor(game) {
    this.g = game;
    this.confronting = false;
    this.lastSeen = -99;
    this.nextBark = 0;
  }

  get state() {
    const f = this.g.flags;
    if (!f.law) f.law = { bounty: {}, crimes: {}, hostile: {} };
    return f.law;
  }
  wanted(region = this.g.regionId) { return this.state.bounty[region] || 0; }
  hunting() { return !!this.state.hostile[this.g.regionId] && this.wanted() > 0; }

  isEnforcer(c) {
    return !!c && !c.dead && c.faction === 'han' && c.ai?.fighter && !c.essential && !c.tags?.has('squad') && !c.ai?.hidden;
  }
  hostileTo(a, b) {
    const p = this.g.player;
    if (!this.hunting()) return false;
    return (a === p && this.isEnforcer(b)) || (b === p && this.isEnforcer(a));
  }

  witnesses(victim = null) {
    const g = this.g, p = g.player;
    const night = g.world.sky?.nightFactor ?? 0;
    const R = (p.sneak ? 9 : 18) * (1 - night * 0.45);
    return g.entities.nearby(p.pos, R).filter((c) => c !== p && !c.dead && !c.ai?.hidden && !c.ai?.surrendered && (c === victim || c !== victim) && ['civilian', 'han', 'militia'].includes(c.faction) && !(c.model.anim.pose === 'lie'));
  }

  // Record a crime if anyone saw it. Returns true when witnessed.
  crime(kind, opts = {}) {
    const g = this.g, def = CRIMES[kind] || { fine: 20, name: kind };
    const w = this.witnesses(opts.victim).filter((c) => opts.victim?.dead ? c !== opts.victim : true);
    if (!w.length && !opts.certain) return false;
    const st = this.state, r = g.regionId;
    st.bounty[r] = (st.bounty[r] || 0) + def.fine;
    g.record('crimes');
    (st.crimes[r] = st.crimes[r] || []).push(def.name);
    g.ui.notify(`Crime witnessed: ${def.name} — bounty ${st.bounty[r]} coins`, 'vice');
    g.progression.addVirtue(kind === 'murder' ? -15 : kind === 'insult' ? -0.5 : -2, '', kind !== 'murder');
    const shout = kind === 'murder' || kind === 'assault' ? BARKS.crimeSeen : BARKS.thief;
    w.slice(0, 3).forEach((c, i) => setTimeout(() => !c.dead && g.barks.say(c, pick(shout), 2.5), 200 + i * 450));
    for (const c of w) if (c.faction === 'civilian' && c.ai && !c.ai.script) this.flee(c, 7);
    if (kind === 'murder' || kind === 'resisting') st.hostile[r] = true;
    this.lastSeen = g.clockTime;
    return true;
  }

  flee(c, secs) {
    const g = this.g, until = g.clockTime + secs;
    c.ai.override = () => {
      if (g.clockTime > until) return false;
      const p = g.player, dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z, L = Math.hypot(dx, dz) || 1;
      c.model.anim.setPose(null); c.model.anim.setLoop(null);
      c.ai.navTo(c.pos.x + (dx / L) * 10, c.pos.z + (dz / L) * 10, 4.4, 1);
      return true;
    };
  }

  clear(region = this.g.regionId) {
    const st = this.state;
    st.bounty[region] = 0; st.crimes[region] = []; st.hostile[region] = false;
    for (const c of this.g.entities.list) if (this.isEnforcer(c) && c.combat.target === this.g.player) { c.combat.target = null; c.ai.override = null; }
  }

  update(dt) {
    const g = this.g, p = g.player;
    const el = g.ui.q('.wanted');
    const b = this.wanted();
    if (el) {
      el.style.display = b > 0 ? 'block' : 'none';
      if (b > 0) el.innerHTML = this.hunting() ? `<b>Hunted 追捕</b> · the guards will fight · bounty ${b}` : `<b>Wanted 通緝</b> · bounty ${b} coins`;
    }
    if (b <= 0 || p.dead || g.cutscene || g.dialogue.active) return;
    // guards who can see you come for you
    const seen = g.entities.nearby(p.pos, p.sneak ? 22 : 40).filter((c) => this.isEnforcer(c));
    if (seen.length) this.lastSeen = g.clockTime;
    if (this.hunting()) {
      for (const c of seen) if (!c.combat.target) { c.combat.target = p; c.ai.override = null; }
      if (g.clockTime - this.lastSeen > 90) { this.state.hostile[g.regionId] = false; g.ui.notify('You have slipped the guards — for now. Your bounty remains.', 'item'); }
      return;
    }
    if (this.confronting) return;
    for (const c of seen) {
      if (c.ai.override?.chase) continue;
      const f = () => {
        if (this.wanted() <= 0 || this.hunting() || c.dead) return false;
        const d = c.distTo(p);
        if (d > 50) return false;
        c.model.anim.setPose(null); c.model.anim.setLoop(null);
        if (d < 2.6) { c.stop(); c.faceYaw = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z); if (!this.confronting && !g.dialogue.active && !g.busyInteract) this.confront(c); return true; }
        c.ai.navTo(p.pos.x, p.pos.z, d > 8 ? 4.4 : 2.2, 2.2);
        if (g.clockTime > this.nextBark) { this.nextBark = g.clockTime + 5; g.barks.say(c, pick(BARKS.guardChase), 2.5); }
        return true;
      };
      f.chase = true;
      c.ai.override = f;
    }
  }

  async confront(guard) {
    const g = this.g, p = g.player, st = this.state, r = g.regionId;
    this.confronting = true;
    g.busyInteract = true;
    try {
      if (p.combat.drawn) p.draw(false);
      const b = this.wanted();
      const crimes = [...new Set(st.crimes[r] || [])].join(', ') || 'disturbing the peace';
      g.dialogue.begin();
      const speech = p.stats.speech;
      const r1 = await g.story.choose(guard.id, `Halt! You are wanted in this county for ${crimes}. The magistrate's fine is ${b} coins. Pay it, or come to the cells.`, [
        { t: `Pay the fine. (${b} coins)`, v: 'pay', if: () => p.inventory.coins >= b },
        { t: `Perhaps this will settle it… (Bribe: ${Math.ceil(b / 2)} coins)`, v: 'bribe', tag: `Speech ${speech}`, if: () => p.inventory.coins >= Math.ceil(b / 2) },
        { t: 'There has been a misunderstanding, officer.', v: 'talk', tag: `Speech ${speech}`, if: () => b <= 40 },
        { t: 'I will go quietly. (Jail)', v: 'jail' },
        { t: 'Make me. (Resist)', v: 'resist' },
      ]);
      if (r1 === 'pay') {
        p.inventory.coins -= b; g.audio.play('coins');
        await g.story.say(guard.id, 'Paid in full. Keep out of trouble.');
        this.clear();
      } else if (r1 === 'bribe') {
        const ok = Math.random() < 0.3 + speech * 0.04;
        if (ok) { p.inventory.coins -= Math.ceil(b / 2); g.audio.play('coins'); await g.story.say(guard.id, '…I see nothing. I hear nothing. Off with you.'); this.clear(); g.progression.addVirtue(-2, 'bribing an officer'); }
        else { await g.story.say(guard.id, 'You think a soldier of Han can be bought? That will cost you more.'); st.bounty[r] += CRIMES.bribery.fine; (st.crimes[r] = st.crimes[r] || []).push(CRIMES.bribery.name); g.dialogue.end(); this.confronting = false; g.busyInteract = false; return this.confront(guard); }
      } else if (r1 === 'talk') {
        const ok = Math.random() < 0.15 + speech * 0.05;
        g.progression.gain('speech', 1);
        if (ok) { await g.story.say(guard.id, 'Hm. Perhaps. I will let it go — this once.'); this.clear(); }
        else { await g.story.say(guard.id, 'Save your stories for the magistrate. Pay, or the cells.'); g.dialogue.end(); this.confronting = false; g.busyInteract = false; return this.confront(guard); }
      } else if (r1 === 'jail') {
        g.dialogue.end();
        await this.jail();
      } else {
        await g.story.say(guard.id, 'Resisting arrest! To arms!');
        st.bounty[r] += CRIMES.resisting.fine; st.hostile[r] = true;
        (st.crimes[r] = st.crimes[r] || []).push(CRIMES.resisting.name);
      }
      g.dialogue.end();
    } finally {
      this.confronting = false;
      g.busyInteract = false;
      guard.ai.override = null;
    }
  }

  async jail() {
    const g = this.g, p = g.player;
    const b = this.wanted();
    const days = Math.max(1, Math.ceil(b / 60));
    await g.ui.fade(1, 1);
    g.time.addHours(24 * days);
    const lost = Math.floor(p.inventory.coins * 0.3);
    p.inventory.coins -= lost;
    p.hp = p.hpMax; p.food = Math.max(10, p.food - 20 * days);
    const S = g.world.settlements.spots;
    const at = S.yamenHall || Object.values(S).find((s, i) => /_hall$/.test(Object.keys(S)[i])) || p.pos;
    p.pos.set(at.x, g.world.groundHeight(at.x, at.z + 3), at.z + 3);
    this.clear();
    g.cameraCtl.snapBehind?.(p);
    await g.ui.fade(0, 1.2);
    g.record('jailDays', days);
    g.ui.notify(`You spent ${days} day${days > 1 ? 's' : ''} in the county cells${lost ? ` and ${lost} coins went to the gaolers` : ''}.`, 'vice');
  }

  // ---- light fingers ----------------------------------------------------------
  // Can the player try to lift this person's purse? (sneaking, behind them, not a guard)
  canPick(c) {
    const p = this.g.player;
    if (!p.sneak || c.dead || !c.ai || c.ai.fighter || c.essential || c.role === 'child' || c.faction !== 'civilian') return false;
    if (c.mem?.picked) return false;
    return Math.abs(c.angleTo(p)) > 1.7;
  }
  pickpocket(c) {
    const g = this.g, p = g.player;
    const mem = c.mem || (c.mem = {});
    mem.picked = true;
    const chance = Math.min(0.9, 0.35 + p.stats.stealth * 0.045 - (c.shop ? 0.12 : 0));
    g.progression.gain('stealth', 1.5);
    if (Math.random() < chance) {
      const rich = { merchant: [8, 40], official: [15, 50], townsman: [3, 16], innkeeper: [10, 30] }[c.role] || [1, 8];
      const coins = rich[0] + Math.floor(Math.random() * (rich[1] - rich[0]));
      p.inventory.coins += coins;
      let got = `${coins} coins`;
      if (Math.random() < 0.3) { const id = ['milletCake', 'bandage', 'wine', 'herbs', 'salt'][Math.floor(Math.random() * 5)]; if (itemDef(id)) { p.inventory.add(id); got += ` and ${itemDef(id).name}`; } }
      g.audio.play('coins');
      g.ui.notify(`Lifted ${got} from ${c.name}.`, 'item');
      g.record('pockets');
      g.progression.addVirtue(-1, '', true);
    } else {
      g.barks.say(c, pick(BARKS.thief), 2.5);
      c.faceYaw = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
      this.crime('pickpocket', { victim: c, certain: true });
      if (g.social.temperament(c) === 'tough' && Math.random() < 0.5) setTimeout(() => g.social.startBrawl(c), 900);
    }
  }
  canSteal(m) {
    const p = this.g.player;
    return p.sneak && m.shop && !m.dead && m.inventory.list().length > 0 && Math.abs(m.angleTo(p)) > 1.2;
  }
  stealFrom(m) {
    const g = this.g, p = g.player;
    const goods = m.inventory.list().filter((i) => i.type !== 'weapon' && i.type !== 'armor');
    const it = goods[Math.floor(Math.random() * goods.length)] || m.inventory.list()[0];
    const chance = Math.min(0.85, 0.3 + p.stats.stealth * 0.045);
    g.progression.gain('stealth', 1.2);
    if (Math.random() < chance) {
      m.inventory.remove(it.id); p.inventory.add(it.id);
      g.ui.notify(`Stole ${it.name} from ${m.name}'s stall.`, 'item');
      g.record('stalls');
      g.progression.addVirtue(-1, '', true);
      if (this.witnesses().filter((c) => c !== m && Math.abs(c.angleTo(p)) < 1.3).length > 1) this.crime('theft');
    } else {
      g.barks.say(m, pick(BARKS.thief), 2.5);
      this.crime('theft', { victim: m, certain: true });
    }
  }
}
