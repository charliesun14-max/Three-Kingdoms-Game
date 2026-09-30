// Game orchestrator: boot, main loop, interactions, saving and shared helpers.
import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { events } from './core/Events.js';
import { GameTime } from './core/GameTime.js';
import { World } from './world/World.js';
import { REGIONS } from './world/regions.js';
import { Campaign } from './story/Campaign.js';
import { NavGrid } from './world/NavGrid.js';
import { Entities } from './entities/Entities.js';
import { Character } from './entities/Character.js';
import { Brain } from './entities/AI.js';
import { PlayerController } from './entities/PlayerController.js';
import { CameraController } from './entities/CameraController.js';
import { Population } from './entities/Population.js';
import { CharacterModel } from './entities/CharacterModel.js';
import { FIGURES, randomAppearance } from './entities/Humanoid.js';
import { Combat } from './combat/Combat.js';
import { WEAPONS } from './combat/Weapons.js';
import { UI, wait } from './ui/UI.js';
import { Dialogue } from './story/Dialogue.js';
import { Quests } from './story/Quests.js';
import { Story } from './story/Story.js';
import { Army } from './story/Army.js';
import { Audio } from './audio/Audio.js';
import { Progression } from './rpg/Progression.js';
import { Inventory, itemDef, ARMORS, ITEMS } from './rpg/Items.js';
import { Rng } from './core/Rng.js';
import { Autopilot } from './debug/Autopilot.js';
import { Riding } from './entities/Riding.js';
import { Horse } from './entities/Horse.js';

const SAVE_KEY = 'tk_mandate_save_v1';

export class Game {
  constructor(container, uiRoot, params) {
    this.container = container;
    this.uiRoot = uiRoot;
    this.params = params;
    this.settings = { sens: 1, volume: 0.8, damageTaken: 1, invertX: false, invertY: false, maxAttackers: 2 };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('tk_settings') || '{}')); } catch { /* ignore */ }
    const q = params.has('q') ? +params.get('q') : +(localStorage.getItem('tk_quality') ?? 1);
    this.quality = Math.max(0, Math.min(2, isNaN(q) ? 1 : q));
    this.events = events;
    this.clockTime = 0;
    this.flags = {};
    this.chronicle = [];
    this.state = 'boot';
    this.dt = 0;
    this.frames = 0;
    this.inCombat = false;
  }
  saveSettings() { localStorage.setItem('tk_settings', JSON.stringify(this.settings)); }

  // ------------------------------------------------------------------ boot
  async boot() {
    this.engine = new Engine(this.container, this.quality);
    this.input = new Input(this.engine.canvas);
    this.ui = new UI(this, this.uiRoot);
    this.audio = new Audio(this);
    this.time = new GameTime();
    const p = this.params;
    if (p.has('hour')) this.time.hour = +p.get('hour');
    this.ui.loading('Shaping the land of Zhuo…', 0.05);
    await wait(30);
    await this.loadRegion('zhuo');
    this.ui.hideLoading();
    this.clock = new THREE.Clock();
    this.ready = true;
    requestAnimationFrame(() => this.loop());
    const hasSave = !!localStorage.getItem(SAVE_KEY);
    if (p.has('scene') && p.get('scene') === 'chars') { this.setupCharShowcase(); return; }
    if (p.has('auto')) { new Autopilot(this); this.ui.fastCards = true; }
    if (p.has('play') || p.has('shot')) { await this.newGame({ skipIntro: p.has('skipIntro'), mission: p.get('mission') }); this.applyDebugParams(); return; }
    if (p.has('continue') && hasSave) { await this.loadGame(); return; }
    this.showTitle(hasSave);
  }

  async loadRegion(id, overrides = null) {
    if (this.world) this.disposeWorld();
    const def = overrides ? { ...REGIONS[id], ...overrides } : id;
    this.world = new World(this.engine, def, (msg, pr) => this.ui.loading(msg, pr));
    this.ui.loading('Charting paths…', 0.8);
    await wait(10);
    this.nav = new NavGrid(this.world);
    this.entities = new Entities(this);
    this.combat = new Combat(this);
    this.population = new Population(this);
    this.ui.loading('Villagers wake…', 0.92);
    await wait(10);
    if (id === 'zhuo') this.population.populateZhuo();
    else this.population.populateGeneric();
    this.regionId = id;
    if (this.riding) this.riding.horses = [];
    this.spawnAmbientHorses();
    this.world.update(0.016, this.time.hour, new THREE.Vector3());
  }

  spawnAmbientHorses() {
    if (!this.riding) return;
    const coats = ['bay', 'chestnut', 'black', 'grey', 'bay'];
    let k = 0;
    for (const s of this.world.region.settlements) {
      if (s.type !== 'armyCamp' && s.type !== 'estate') continue;
      for (let i = 0; i < 3; i++) this.riding.spawn({ coat: coats[k++ % coats.length], name: 'Army horse', x: s.x + s.w / 2 - 8, z: s.z - s.d / 4 + i * 3, yaw: Math.PI / 2 });
    }
  }

  // Move the player (and squad) to another region map.
  async travel(regionId, spawn = null, opts = {}) {
    const pl = this.player;
    await this.ui.fade(1, 0.8);
    this.ui.showHUD(false);
    const squad = this.army.alive().length;
    const horse = this.riding.toJSON();
    if (this.riding.mount) this.riding.dismount();
    this.army.troops = [];
    pl.model.root.parent?.remove(pl.model.root);
    this.ui.loading(opts.msg || 'The road is long…', 0.05);
    await wait(30);
    await this.loadRegion(regionId, opts.overrides || null);
    this.entities.add(pl);
    const st = spawn || this.world.region.places.start;
    pl.pos.set(st.x, this.world.groundHeight(st.x, st.z), st.z);
    pl.vel.set(0, 0, 0);
    pl.combat.target = null;
    this.playerCtl.lockTarget = null;
    this.playerFactionHostility = null;
    if (squad) this.army.recruit(squad);
    this.riding.reset(horse);
    this.cameraCtl.snapBehind(pl);
    this.ui.hideLoading();
    this.ui.showHUD(true);
    await this.ui.fade(0, 1);
  }

  disposeWorld() {
    const sc = this.engine.scene;
    for (const o of [...sc.children]) {
      sc.remove(o);
      o.traverse?.((m) => { if (m.geometry) m.geometry.dispose?.(); });
    }
    this.world = null;
  }

  showTitle(hasSave) {
    this.state = 'title';
    this.ui.showHUD(false);
    this.titleCam = { t: 0 };
    this.ui.showTitle(hasSave, {
      continue: async () => { this.audio.init(); this.ui.hideTitle(); await this.loadGame(); },
      new: async () => { this.audio.init(); this.ui.hideTitle(); await this.newGame({}); },
      settings: () => this.showSettings(),
      about: () => this.showAbout(),
    });
  }

  showSettings() {
    const el = document.createElement('div');
    el.className = 'panel-wrap on';
    const s = this.settings;
    el.innerHTML = `<div class="panel" style="height:auto"><div class="close">✕</div><div class="body"><h2>Settings 設</h2>
      <div class="stat"><span>Graphics quality</span><span><span class="btn" data-q="0">Low</span> <span class="btn" data-q="1">Medium</span> <span class="btn" data-q="2">High</span> (current: ${['Low', 'Medium', 'High'][this.quality]})</span></div>
      <div class="stat"><span>Mouse sensitivity</span><input type="range" min="0.5" max="2" step="0.1" value="${s.sens}" id="s-sens"></div>
      <div class="stat"><span>Master volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" id="s-vol"></div>
      <div class="stat"><span>Difficulty</span><span><span class="btn" data-d="0.6">Story</span> <span class="btn" data-d="1">Warrior</span> <span class="btn" data-d="1.5">Hardcore</span> (×${s.damageTaken})</span></div></div></div>`;
    el.querySelector('.close').onclick = () => el.remove();
    el.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { localStorage.setItem('tk_quality', b.dataset.q); location.reload(); }; });
    el.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { s.damageTaken = +b.dataset.d; this.saveSettings(); el.remove(); this.showSettings(); }; });
    el.querySelector('#s-sens').oninput = (e) => { s.sens = +e.target.value; this.saveSettings(); };
    el.querySelector('#s-vol').oninput = (e) => { s.volume = +e.target.value; this.audio.setVolume(s.volume); this.saveSettings(); };
    this.uiRoot.appendChild(el);
  }

  showAbout() {
    const el = document.createElement('div');
    el.className = 'panel-wrap on';
    el.innerHTML = `<div class="panel" style="height:auto;max-height:86vh"><div class="close">✕</div><div class="body">
      <h2>History 史</h2>
      <p>In the first year of Zhongping (184 AD), the Taoist healer Zhang Jiao and his brothers raised hundreds of thousands under yellow headscarves, proclaiming “The Azure Sky is already dead; the Yellow Sky shall rise.” The Han court, rotten with eunuch intrigue, called on the provinces to raise volunteers. In Zhuo Commandery, a straw-sandal seller of imperial descent named Liu Bei answered — and with Guan Yu and Zhang Fei swore brotherhood in a peach garden.</p>
      <p>You are a peasant of Lousang, Liu Bei's own village. The names, offices and battles here follow the <i>Records of the Three Kingdoms</i> (三國志) and the <i>Romance of the Three Kingdoms</i> (三國演義); where the two disagree, the game notes it in the Chronicle. Your path — and the dynasty you may one day found — is your own.</p>
      <h3>Credits</h3><p>Design, code, procedural art and music generated in-engine with three.js. Fonts: Ma Shan Zheng, Cormorant Garamond.</p></div></div>`;
    el.querySelector('.close').onclick = () => el.remove();
    this.uiRoot.appendChild(el);
  }

  createPlayerIfNeeded() {
    if (this.player) return;
    const R = this.world.region;
    const st = R.places.start;
    const pl = new Character(this, {
      id: 'player', name: this.playerName || 'Qin Mu', cn: '秦牧', faction: 'player', role: 'player', x: st.x, z: st.z, yaw: Math.PI,
      appearance: { skin: 0xc99a70, hair: 0x15100c, robe: 0x6e5e48, trousers: 0x5a4c3a, outfit: 'peasant', headwear: 'wrap', headCloth: 0x4a3a2a, beard: 'stubble', height: 1.76, build: 1.02, face: { stern: false } },
      weapon: 'fists', stats: { str: 9, agi: 8, vit: 9, blade: 1, polearm: 2, unarmed: 3, block: 2, speech: 5, leadership: 1, stealth: 3 },
    });
    pl.inventory.coins = 23;
    pl.inventory.add('milletCake', 3).add('sandals', 6).add('bandage', 1);
    this.entities.add(pl);
    this.player = pl;
    this.playerCtl = new PlayerController(this, pl);
    this.cameraCtl = new CameraController(this);
    this.cameraCtl.sens = 0.0024 * this.settings.sens;
    this.cameraCtl.snapBehind(pl);
    this.progression = new Progression(this);
    this.quests = new Quests(this);
    this.dialogue = new Dialogue(this);
    this.army = new Army(this);
    this.story = new Story(this);
    this.riding = new Riding(this);
    this.spawnAmbientHorses();
    events.on('death', (c, killer) => this.onDeath(c, killer));
    events.on('hit', (a, d) => { if (d === this.player || a === this.player) this.lastCombat = this.clockTime; if (d === this.player) this.cameraCtl.shake = 0.08; });
  }

  async newGame(opts = {}) {
    this.createPlayerIfNeeded();
    this.state = 'play';
    this.ui.showHUD(true);
    this.input.requestLock();
    this.story.begin(opts);
    await this.story.setupDone;
  }

  applyDebugParams() {
    const p = this.params;
    if (p.has('at')) {
      const [x, z] = p.get('at').split(',').map(Number);
      this.player.pos.set(x, this.world.groundHeight(x, z), z);
    }
    if (p.has('yaw')) { this.player.yaw = +p.get('yaw'); this.cameraCtl.yaw = +p.get('yaw'); }
    if (p.has('pitch')) this.cameraCtl.pitch = +p.get('pitch');
    if (p.has('dist')) { this.cameraCtl.targetDist = +p.get('dist'); this.cameraCtl.dist = +p.get('dist'); }
    if (p.has('hour')) this.time.hour = +p.get('hour');
    if (p.has('weapon')) this.player.setWeapon(p.get('weapon'));
    if (p.has('armor')) { this.player.equip.body = p.get('armor'); this.player.buildModel(); }
    if (p.has('drawn')) this.player.draw(true);
    if (p.has('foes')) {
      // debug skirmish: spawn enemies in front of the player
      const n = +p.get('foes') || 2;
      const kind = p.get('foeKind') || 'bandit';
      const pl = this.player;
      for (let i = 0; i < n; i++) {
        const a = pl.yaw + (i - (n - 1) / 2) * 0.5;
        const d = 2.6 + (i % 2) * 1.2;
        const c = this.spawnNPC({ name: `Foe ${i + 1}`, faction: kind, role: kind, look: kind, x: pl.pos.x + Math.sin(a) * d, z: pl.pos.z + Math.cos(a) * d, weapon: p.get('foeWeapon') || 'dao', brain: { archetype: kind === 'yellowTurban' ? 'rebel' : 'bandit', fighter: true, mode: 'idle', aggroRange: 20 } });
        c.yaw = a + Math.PI;
      }
      pl.draw(true);
      this.playerCtl.lockTarget = this.playerCtl.pickLock();
    }
    if (p.has('attackAt')) {
      const [frame, dir] = p.get('attackAt').split(':');
      this.debugAttack = { frame: +frame, dir: dir || 'right' };
    }
  }

  // ------------------------------------------------------------------ main loop
  loop() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.dt = dt;
    this.frames++;
    this.clockTime += dt;
    try { this.tick(dt); } catch (e) { console.error(e); }
    try { this.autopilot?.update(dt); } catch (e) { console.error('autopilot', e); }
    if (!this.autopilot || this.frames % 60 === 0) this.engine.render(dt);
    this.input.endFrame();
    const stopAt = this.params.has('frames') ? +this.params.get('frames') : Infinity;
    if (this.frames >= stopAt && (!this.shotWait || this.shotReady)) { this.done = true; return; }
    requestAnimationFrame(() => this.loop());
  }

  tick(dt) {
    const inp = this.input;
    if (this.state === 'title') {
      this.titleCam.t += dt;
      const t = this.titleCam.t * 0.02;
      const cam = this.engine.camera;
      const cx = 200, cz = 150;
      cam.position.set(cx + Math.cos(t) * 180, 60 + Math.sin(t * 0.7) * 8, cz + Math.sin(t) * 180);
      cam.lookAt(cx - 60, 25, cz - 40);
      this.world.update(dt, 17.3, new THREE.Vector3(cx, 20, cz));
      return;
    }
    if (!this.player) { this.world?.update(dt, this.time.hour, this.engine.camera.position); return; }
    const paused = this.ui.anyPanelOpen();
    inp.wantLock = !paused && !this.dialogue.active;
    // panels
    if (inp.hit('Escape')) { if (this.ui.panelOpen) this.ui.closePanel(); else if (!this.dialogue.active) this.ui.openPanel('menu'); }
    if (!this.dialogue.active && !this.cutscene) {
      for (const [k, tab] of [['KeyI', 'inventory'], ['KeyJ', 'journal'], ['KeyM', 'map'], ['KeyC', 'character']]) {
        if (inp.hit(k) && k !== 'KeyC') { if (this.ui.panelOpen === tab) this.ui.closePanel(); else this.ui.openPanel(tab); }
      }
      if (inp.hit('KeyP')) { if (this.ui.panelOpen === 'character') this.ui.closePanel(); else this.ui.openPanel('character'); }
    }
    if (paused) { this.ui.update(0); return; }

    if (this.debugAttack && this.frames === this.debugAttack.frame) this.player.startAttack(this.debugAttack.dir);
    this.time.advance(dt * (this.timeWarp || 1));
    if (this.dialogue.active || this.cutscene?.lockPlayer) { this.player.stop(); this.player.setBlocking(false); }
    else if (!this.riding.controlPlayer(dt)) this.playerCtl.update(dt);
    if (this.input.hit('KeyH') && !this.dialogue.active) this.riding.whistle();
    // hunger
    this.player.food = Math.max(0, this.player.food - dt * 0.0045 * (this.timeWarp || 1));
    if (this.player.food <= 0 && Math.random() < dt * 0.2) this.player.damage(1, null, { hunger: true });

    this.entities.update(dt);
    this.riding.update(dt);
    this.combat.update(dt);
    this.army.update(dt);
    this.quests.update();
    this.story.update(dt);
    this.dialogue.update(dt);
    if (!this.dialogue.active && !this.cutscene && !this.busyInteract) this.updateInteraction();
    else this.ui.prompt(null);
    this.updateLocation();
    this.inCombat = this.clockTime - (this.lastCombat ?? -99) < 6 || (this.playerCtl.lockTarget && !this.playerCtl.lockTarget.dead);
    this.cameraCtl.update(dt);
    const focus = this.player.pos;
    this.world.update(dt, this.time.hour, focus);
    this.ui.update(dt);
    this.audio.update(dt);
    this.footsteps(dt);
  }

  footsteps(dt) {
    const p = this.player;
    const ph = p.model.anim.phase;
    const s = Math.floor(ph / Math.PI);
    if (s !== this._lastStep && Math.hypot(p.vel.x, p.vel.z) > 0.8) this.audio.play('step', p.pos, { soft: !this.world.hf.isRoad(p.pos.x, p.pos.z), gain: p.sneak ? 0.04 : 0.1 });
    this._lastStep = s;
  }

  updateLocation() {
    const p = this.player.pos;
    let best = null;
    for (const s of this.world.region.settlements) {
      if (Math.abs(p.x - s.x) < s.w / 2 + 10 && Math.abs(p.z - s.z) < s.d / 2 + 10) { best = s; break; }
    }
    const name = best ? `${best.name} ${best.cn}` : `${this.world.region.name} ${this.world.region.cn}`;
    if (name !== this.locationName) {
      this.locationName = name;
      this.locationKind = best?.type || 'wild';
      if (best && this.frames > 5) this.ui.notify(`${best.name} · ${best.cn}`, 'item');
    }
  }

  // ------------------------------------------------------------------ interaction
  updateInteraction() {
    const p = this.player;
    let best = null, bd = 2.6;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const consider = (x, z, r, obj) => {
      const dx = x - p.pos.x, dz = z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > r + 0.4) return;
      const facing = (dx * fx + dz * fz) / (d || 1);
      const score = d - facing * 0.8;
      if (score < bd) { bd = score; best = obj; }
    };
    for (const it of this.world.interactables) if (!it.disabled) consider(it.x, it.z, it.r, { kind: 'object', it });
    if (!p.riding) for (const h of this.riding.horses) if (!h.rider) consider(h.pos.x, h.pos.z, 2.2, { kind: 'horse', h });
    for (const c of this.entities.nearby(p.pos, 3)) {
      if (c === p || c.ai?.hidden) continue;
      if (c.dead) { if (c.inventory.list().length || c.inventory.coins || c.equip.weapon !== 'fists') consider(c.pos.x, c.pos.z, 1.8, { kind: 'loot', c }); continue; }
      if (c.ai?.surrendered) { consider(c.pos.x, c.pos.z, 2.2, { kind: 'surrender', c }); continue; }
      if (this.combat.hostile(p, c)) continue;
      if (c.combat.drawn && c.combat.target) continue;
      consider(c.pos.x, c.pos.z, 2.4, { kind: 'talk', c });
    }
    let label = null;
    if (best) {
      if (best.kind === 'object') label = best.it.label;
      else if (best.kind === 'loot') label = `Search the body of ${best.c.name}`;
      else if (best.kind === 'surrender') label = `Deal with ${best.c.name} (surrendered)`;
      else if (best.kind === 'horse') label = `Mount ${best.h.name}`;
      else label = `Talk to ${best.c.name}${best.c.cn ? ' ' + best.c.cn : ''}`;
    }
    this.ui.prompt(label);
    if (best && this.input.hit('KeyE')) this.interact(best);
  }

  async interact(b) {
    // one interaction at a time (handlers may run fades/cutscenes between dialogue lines)
    if (this.busyInteract) return;
    this.busyInteract = true;
    try { await this.interactInner(b); } finally { this.busyInteract = false; }
  }

  async interactInner(b) {
    if (b.kind === 'horse') return this.riding.mountHorse(b.h);
    if (b.kind === 'talk') return this.story.talk(b.c);
    if (b.kind === 'loot') return this.loot(b.c);
    if (b.kind === 'surrender') return this.story.surrendered(b.c);
    const it = b.it;
    if (await this.story.interact(it)) return;
    switch (it.kind) {
      case 'bed': return this.sleep(it);
      case 'well': this.player.stamina = this.player.staminaMax; this.player.food = Math.min(100, this.player.food + 3); this.ui.notify('You drink cool well water.'); return;
      case 'fire': return this.rest(it);
      case 'notice': this.ui.notify('Official notices of the county are posted here.'); return;
      case 'chest': return this.lootChest(it);
      default: this.ui.notify(it.label);
    }
  }

  loot(c) {
    const p = this.player;
    const got = [];
    if (c.inventory.coins) { p.inventory.coins += c.inventory.coins; got.push(`${c.inventory.coins} coins`); c.inventory.coins = 0; this.audio.play('coins'); }
    for (const it of c.inventory.list()) { p.inventory.add(it.id, it.n); got.push(`${it.name}${it.n > 1 ? ' ×' + it.n : ''}`); c.inventory.remove(it.id, it.n); }
    if (c.equip.weapon !== 'fists' && !WEAPONS[c.equip.weapon].unique) { p.inventory.add(c.equip.weapon); got.push(WEAPONS[c.equip.weapon].name); c.equip.weapon = 'fists'; c.model.setWeapon(null); }
    if (c.equip.body && Math.random() < 0.5) { p.inventory.add(c.equip.body); got.push(ARMORS[c.equip.body].name); c.equip.body = null; }
    this.ui.notify(got.length ? `Found: ${got.join(', ')}` : 'Nothing of value.', 'item');
    this.events.emit('looted', c);
  }
  lootChest(it) {
    if (this.flags[`looted_${it.id}`]) { this.ui.notify('Empty.'); return; }
    this.flags[`looted_${it.id}`] = true;
    const rng = new Rng(it.id.length * 31 + Math.floor(this.clockTime));
    const coins = rng.int(40, 140);
    this.player.inventory.coins += coins;
    const items = ['bandage', 'medicine', 'wine', 'driedMeat', 'silk', 'salt'];
    const pick = rng.pick(items);
    this.player.inventory.add(pick);
    this.audio.play('coins');
    this.ui.notify(`Found ${coins} coins and ${itemDef(pick).name}.`, 'item');
    this.progression.addVirtue(-1, 'taking what is not yours');
  }

  async sleep(it) {
    if (this.inCombat) { this.ui.notify('You cannot rest with enemies nearby.'); return; }
    await this.ui.fade(1, 0.8);
    const h = this.time.hour;
    const hours = h >= 20 || h < 5 ? ((24 - h + 6) % 24) : 8;
    this.time.addHours(hours);
    this.player.hp = this.player.hpMax;
    this.player.stamina = this.player.staminaMax;
    this.player.bleed = 0;
    this.player.food = Math.max(0, this.player.food - 15);
    this.save();
    this.ui.notify(`You sleep for ${Math.round(hours)} hours. Game saved.`);
    await wait(600);
    await this.ui.fade(0, 1);
  }
  async rest() {
    if (this.inCombat) return;
    await this.ui.fade(1, 0.6);
    this.time.addHours(2);
    this.player.heal(20);
    this.player.stamina = this.player.staminaMax;
    await wait(300);
    await this.ui.fade(0, 0.8);
    this.ui.notify('You rest by the fire for two hours.');
  }

  // ------------------------------------------------------------------ items & trade
  giveItem(id, n = 1, silent = false) {
    this.player.inventory.add(id, n);
    if (!silent) this.ui.notify(`Received: ${itemDef(id).name}${n > 1 ? ' ×' + n : ''}`, 'item');
  }
  useItem(id) {
    const p = this.player;
    if (!p.inventory.has(id)) { this.ui.notify(`No ${itemDef(id).name} left.`); return false; }
    const def = ITEMS[id];
    if (!def?.use) return false;
    const u = def.use;
    p.inventory.remove(id);
    if (u.heal) p.heal(u.heal);
    if (u.stopBleed) p.bleed = 0;
    if (u.food) p.food = Math.min(100, p.food + u.food);
    if (u.stamina) p.stamina = Math.min(p.staminaMax, p.stamina + u.stamina);
    if (u.drunk) p.drunk = (p.drunk || 0) + u.drunk;
    this.audio.play('eat');
    this.ui.notify(`Used ${def.name}.`, 'item');
    return true;
  }
  useOrEquip(id) {
    const p = this.player;
    const d = itemDef(id);
    if (d.type === 'weapon') { p.setWeapon(p.equip.weapon === id ? 'fists' : id); this.ui.notify(`Equipped ${p.weapon.name}.`, 'item'); }
    else if (d.type === 'armor') {
      const slot = ARMORS[id].slot;
      p.equip[slot] = p.equip[slot] === id ? null : id;
      p.buildModel();
    } else if (d.type === 'shield') {
      p.equip.shield = !p.equip.shield;
      p.model.setShield(p.equip.shield);
    } else if (d.type === 'use') this.useItem(id);
  }
  priceMul() { return Math.max(0.7, 1.25 - (this.player.stats.speech - 5) * 0.03 - this.progression.renown * 0.001); }
  trade(m, id, buy) {
    const p = this.player, d = itemDef(id);
    const mul = this.priceMul();
    if (buy) {
      const price = Math.ceil(d.price * mul);
      if (p.inventory.coins < price) { this.ui.notify('You cannot afford that.'); return; }
      if (!m.inventory.remove(id)) return;
      p.inventory.coins -= price; m.inventory.coins += price; p.inventory.add(id);
      this.progression.gain('speech', 0.4);
    } else {
      const price = Math.floor(d.price * 0.5 / mul);
      if (m.inventory.coins < price) { this.ui.notify(`${m.name} cannot afford it.`); return; }
      if (!p.inventory.remove(id)) return;
      if (p.equip.weapon === id && !p.inventory.has(id)) p.setWeapon('fists');
      if ((p.equip.body === id || p.equip.head === id) && !p.inventory.has(id)) { if (p.equip.body === id) p.equip.body = null; else p.equip.head = null; p.buildModel(); }
      p.inventory.coins += price; m.inventory.coins -= price; m.inventory.add(id);
      this.progression.gain('speech', 0.3);
      this.events.emit('sold', id, m);
    }
    this.audio.play('coins');
  }

  // ------------------------------------------------------------------ deaths & crimes
  onDeath(c, killer) {
    if (c === this.player) {
      this.state = 'dead';
      this.input.exitLock();
      setTimeout(() => this.ui.death(() => { location.search = ''; }, () => this.loadGame()), 1800);
      return;
    }
    if (killer === this.player) {
      if (['civilian', 'han', 'militia'].includes(c.faction)) {
        this.progression.addVirtue(-15, 'murder');
        this.playerFactionHostility = new Set(['han']);
        this.ui.notify('The guards will hunt you for this crime!', 'vice');
      } else {
        const m = c.faction === 'yellowTurban' ? 6 : c.faction === 'bandit' ? 5 : 8;
        this.progression.addMerit(m + (c.tags.has('officer') ? 30 : 0));
      }
    }
  }

  // ------------------------------------------------------------------ helpers for story
  spawnNPC(o) {
    const pop = this.population;
    const fig = o.figure ? FIGURES[o.figure] : null;
    const c = pop.spawn({ ...o, appearance: o.appearance || fig || randomAppearance(o.look || 'farmer', new Rng(Math.random() * 1e6)) });
    return c;
  }
  flag(k) { return this.flags[k]; }
  setFlag(k, v = true) { this.flags[k] = v; }
  chronicleAdd(text) { this.chronicle.push({ date: this.time.dateCn(), text }); }
  compassMarkers() {
    const out = this.quests.markers();
    if (this.playerCtl.lockTarget) out.push({ x: this.playerCtl.lockTarget.pos.x, z: this.playerCtl.lockTarget.pos.z, kind: 'enemy' });
    for (const s of this.world.region.settlements) if (Math.hypot(s.x - this.player.pos.x, s.z - this.player.pos.z) < 450 && s.type !== 'banditCamp') out.push({ x: s.x, z: s.z, kind: 'place', label: s.name });
    return out;
  }

  drawMap(cv) {
    const ctx = cv.getContext('2d');
    const W = cv.width, hf = this.world.hf, R = this.world.region;
    const img = ctx.createImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const wx = (x / W - 0.5) * hf.size, wz = (y / W - 0.5) * hf.size;
      const h = hf.getHeight(wx, wz);
      const n = hf.getNormal(wx, wz);
      const shade = 0.75 + (n.x * -0.6 + n.z * -0.4) * 1.4;
      const wet = hf.waterAt(wx, wz) !== null;
      const road = hf.maskAt(wx, wz, 0), field = hf.maskAt(wx, wz, 1), forest = hf.maskAt(wx, wz, 3);
      let r = 226, g = 212, b = 178;
      const alt = Math.min(1, Math.max(0, (h - 20) / 120));
      r -= alt * 70; g -= alt * 70; b -= alt * 60;
      if (forest > 0.3) { r -= 40; g -= 28; b -= 40; }
      if (field > 0.5) { r -= 10; g -= 2; b -= 30; }
      if (road > 0.5) { r = 150; g = 110; b = 70; }
      r *= shade; g *= shade; b *= shade;
      if (wet) { r = 90; g = 110; b = 115; }
      const i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const toC = (x, z) => [(x / hf.size + 0.5) * W, (z / hf.size + 0.5) * W];
    ctx.font = '22px "Ma Shan Zheng", serif';
    ctx.textAlign = 'center';
    for (const s of R.settlements) {
      const [x, y] = toC(s.x, s.z);
      const hostile = s.type === 'rebelCamp' || s.type === 'banditCamp';
      if (hostile && this.flags[`cleared_${s.id}`]) continue;
      ctx.fillStyle = hostile ? '#9a1e14' : '#2a1a0e';
      if (hostile) { ctx.font = 'bold 20px serif'; ctx.fillText('✕', x, y + 7); ctx.font = '22px "Ma Shan Zheng", serif'; }
      else { const w = (s.w / hf.size) * W, d = (s.d / hf.size) * W; ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = s.type === 'walledTown' ? 3 : 1; ctx.strokeRect(x - w / 2, y - d / 2, w, d); }
      ctx.fillStyle = hostile ? '#7a1a10' : '#2a1a0e';
      ctx.fillText(s.cn, x, y - (s.d / hf.size) * W / 2 - 6);
    }
    ctx.font = '26px "Ma Shan Zheng", serif';
    ctx.fillStyle = 'rgba(60,70,80,0.8)';
    if (R.river) { const p = R.river.points[3]; const [x, y] = toC(p[0], p[1]); ctx.fillText('拒馬河', x, y - 14); }
    for (const m of this.quests.markers()) {
      const [x, y] = toC(m.x, m.z);
      ctx.fillStyle = '#c89a20'; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-7, -7, 14, 14); ctx.restore();
    }
    const [px, py] = toC(this.player.pos.x, this.player.pos.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-this.player.yaw + Math.PI);
    ctx.fillStyle = '#9a1e14'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
    // compass rose
    ctx.fillStyle = '#2a1a0e'; ctx.font = '30px "Ma Shan Zheng", serif'; ctx.fillText('北', W - 40, 44);
  }

  // ------------------------------------------------------------------ save/load
  serialize() {
    return {
      v: 1, region: this.regionId, time: this.time.toJSON(), player: this.player.toJSON(), progression: this.progression.toJSON(),
      quests: this.quests.toJSON(), flags: this.flags, chronicle: this.chronicle, story: this.story.toJSON(), army: this.army.toJSON(), campaign: this.campaign?.toJSON(), horse: this.riding.toJSON(),
    };
  }
  save(silent = false) {
    if (!this.player || this.player.dead) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize())); if (!silent) this.audio.play('tick'); } catch (e) { console.warn('save failed', e); }
  }
  async loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (this.player) { location.search = '?continue=1'; return; }
    if (s.region !== this.regionId) await this.loadRegion(s.region);
    this.createPlayerIfNeeded();
    this.time.load(s.time);
    this.flags = s.flags || {};
    this.chronicle = s.chronicle || [];
    const p = this.player, sp = s.player;
    Object.assign(p.stats, sp.stats);
    p.equip = sp.equip; p.hp = sp.hp; p.stamina = sp.stamina; p.food = sp.food;
    p.hpMax = p.computeHpMax(); p.staminaMax = 100 + p.stats.vit * 3;
    p.inventory = Inventory.from(sp.inventory);
    p.baseLook = sp.baseLook || p.baseLook;
    p.pos.set(sp.pos[0], this.world.groundHeight(sp.pos[0], sp.pos[1]), sp.pos[1]);
    p.yaw = sp.yaw;
    p.name = sp.name;
    p.buildModel();
    this.progression.load(s.progression);
    this.army.load(s.army);
    if (s.horse) this.riding.reset(s.horse);
    if (s.campaign) { this.campaign = new Campaign(this); this.campaign.load(s.campaign); }
    this.state = 'play';
    this.ui.showHUD(true);
    await this.story.restore(s.story, s.quests);
    this.cameraCtl.snapBehind(p);
    this.input.requestLock();
    this.ui.notify('Game loaded.');
  }

  // ------------------------------------------------------------------ debug showcase
  setupCharShowcase() {
    const rng = new Rng(3);
    const px = 365, pz = 180;
    const list = this.params.get('list') ? this.params.get('list').split(',') : ['liuBei', 'guanYu', 'zhangFei', 'farmer', 'woman', 'soldier', 'yellowTurban', 'bandit', 'official'];
    const poses = (this.params.get('poses') || '').split(',');
    this.showcase = [];
    list.forEach((id, i) => {
      const ap = FIGURES[id] || randomAppearance(id, rng);
      const m = new CharacterModel(ap);
      const x = px + (i - (list.length - 1) / 2) * 1.3, z = pz;
      m.root.position.set(x, this.world.hf.getHeight(x, z), z);
      this.engine.scene.add(m.root);
      const weapon = this.params.get('w') || { liuBei: 'twinSwords', guanYu: 'guandao', zhangFei: 'serpentSpear', soldier: 'ji', yellowTurban: 'spear', bandit: 'dao' }[id];
      const state = { speed: 0, stance: 'relaxed', weaponCls: 'fists' };
      if (weapon) m.setWeapon(weapon, false);
      state.weaponCls = weapon ? WEAPONS[weapon].cls : 'fists';
      state.armed = !!weapon;
      const pz2 = poses[i] || '';
      if (pz2.startsWith('clip:')) {
        const [name, at] = pz2.slice(5).split('@');
        state.stance = 'combat'; m.setDrawn(true);
        m.anim.play(name); m.anim.clip.speed = 0; m.anim.clip.t = m.anim.clip.def.dur * +(at || 0.45);
      } else if (pz2 === 'combat') { state.stance = 'combat'; m.setDrawn(true); }
      else if (pz2 === 'walk') state.speed = 1.5;
      else if (pz2 === 'run') state.speed = 5;
      else if (pz2 === 'block') { state.stance = 'combat'; state.blocking = true; m.setDrawn(true); }
      else if (pz2) m.anim.setPose(pz2);
      this.showcase.push({ model: m, state });
    });
    const cz = +(this.params.get('cd') || 5.2), cy = +(this.params.get('ch') || 1.35), cx = +(this.params.get('cx') || 0);
    const cam = this.engine.camera;
    cam.position.set(px + cx, this.world.hf.getHeight(px, pz + cz) + cy, pz + cz);
    cam.lookAt(px + cx * 0.3, this.world.hf.getHeight(px, pz) + +(this.params.get('ly') || 1.0), pz);
    this.state = 'showcase';
    const horses = (this.params.get('horses') || '').split(',').filter(Boolean).map((coat, i) => {
      const h = new Horse(this, { coat, x: px - 3 + i * 3, z: pz - 2.5, yaw: Math.PI / 2 });
      h.pos.y = this.world.hf.getHeight(h.pos.x, h.pos.z);
      h.speed = +(this.params.get('hspeed') || 0);
      return h;
    });
    this.tick = (dt) => {
      for (const c of this.showcase) c.model.update(dt, c.state);
      for (const h of horses) { const s = h.speed; h.update(dt); h.pos.x = px - 3 + horses.indexOf(h) * 3; h.speed = s; h.root.position.copy(h.pos); }
      this.world.update(dt, this.time.hour, new THREE.Vector3(px, 20, pz));
    };
  }
}
