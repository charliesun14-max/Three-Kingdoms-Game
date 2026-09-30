// Procedural audio: combat foley, ambience, and generative guqin/drum music (no asset files).
const PENTA = [0, 2, 4, 7, 9]; // gong shang jue zhi yu

export class Audio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.enabled = false;
    this.volume = game.settings?.volume ?? 0.8;
    this.bufCache = new Map();
    this.musicMood = 'peace';
    this.nextNote = 0;
    this.nextBird = 2;
    this.nextDrum = 0;
    this.phrase = [];
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.volume; this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = 0.34; this.music.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 0.5; this.amb.connect(this.master);
    // reverb
    this.verb = c.createConvolver();
    const len = c.sampleRate * 2.6, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb.buffer = ir;
    this.verbGain = c.createGain(); this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.startAmbience();
    this.enabled = true;
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  makeNoise(sec) {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // Karplus-Strong plucked string (guqin/pipa colour), cached per pitch.
  pluckBuffer(freq, dur = 3.2, bright = 0.5) {
    const key = `${freq.toFixed(1)}_${bright}`;
    if (this.bufCache.has(key)) return this.bufCache.get(key);
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * dur);
    const b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
    const P = Math.max(2, Math.round(sr / freq));
    const buf = new Float32Array(P);
    for (let i = 0; i < P; i++) buf[i] = Math.random() * 2 - 1;
    let idx = 0, prev = 0;
    const damp = 0.996 + bright * 0.003;
    for (let i = 0; i < n; i++) {
      const v = buf[idx];
      const nv = damp * (v * 0.5 + prev * 0.5);
      prev = v;
      buf[idx] = nv;
      d[i] = v * (i < 30 ? i / 30 : 1);
      idx = (idx + 1) % P;
    }
    this.bufCache.set(key, b);
    return b;
  }

  // spatial routing
  route(node, pos, vol = 1, verb = 0.2) {
    const c = this.ctx;
    const g = c.createGain();
    let v = vol;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pos && this.game.player) {
      const cam = this.game.engine.camera.position;
      const dx = pos.x - cam.x, dz = pos.z - cam.z;
      const d = Math.hypot(dx, dz);
      v *= 1 / (1 + Math.max(0, d - 3) * 0.12);
      if (d > 60) v = 0;
      if (pan) {
        const yaw = this.game.cameraCtl?.yaw || 0;
        const a = Math.atan2(dx, dz) - yaw;
        pan.pan.value = Math.max(-1, Math.min(1, -Math.sin(a) * 0.8));
      }
    }
    g.gain.value = v;
    node.connect(g);
    if (pan) { g.connect(pan); pan.connect(this.sfx); } else g.connect(this.sfx);
    if (verb > 0) { const vg = c.createGain(); vg.gain.value = verb * v; g.connect(vg); vg.connect(this.verb); }
    return g;
  }

  noise(dur, freq, q, gain, pos, type = 'bandpass', sweepTo = null, attack = 0.005) {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g);
    this.route(g, pos);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  tone(freq, dur, gain, pos, type = 'sine', freqEnd = null, verb = 0.3) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); this.route(g, pos, 1, verb);
    o.start(t); o.stop(t + dur + 0.05);
  }
  metal(base, dur, gain, pos) {
    for (const r of [1, 2.76, 5.4, 8.93]) this.tone(base * r * (0.98 + Math.random() * 0.04), dur / Math.sqrt(r), gain / r, pos, 'sine', null, 0.4);
    this.noise(0.05, 3000, 0.8, gain * 1.5, pos, 'highpass');
  }
  pluck(freq, gain = 0.5, dest = null, when = 0) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.pluckBuffer(freq);
    const g = c.createGain(); g.gain.value = gain;
    s.connect(g); g.connect(dest || this.music);
    const vg = c.createGain(); vg.gain.value = 0.5; g.connect(vg); vg.connect(this.verb);
    s.start(c.currentTime + when);
  }

  play(name, pos = null, opts = {}) {
    if (!this.enabled) return;
    switch (name) {
      case 'swing': this.noise(0.28, 900, 0.9, 0.35, pos, 'bandpass', 2600, 0.08); break;
      case 'hit': this.noise(0.16, 700, 1.2, 0.9, pos, 'lowpass'); this.tone(110, 0.18, 0.5, pos, 'sine', 55); break;
      case 'thud': this.noise(0.12, 300, 1, 0.9, pos, 'lowpass'); this.tone(80, 0.2, 0.6, pos, 'sine', 40); break;
      case 'block': this.metal(420 + Math.random() * 80, 0.7, 0.35, pos); break;
      case 'parry': this.metal(640 + Math.random() * 60, 1.2, 0.45, pos); this.noise(0.3, 5000, 2, 0.2, pos, 'bandpass'); break;
      case 'shieldBlock': this.noise(0.15, 400, 1, 0.9, pos, 'lowpass'); this.tone(150, 0.2, 0.4, pos, 'triangle', 90); break;
      case 'draw': this.noise(0.4, 2500, 3, 0.18, pos, 'bandpass', 6000, 0.1); break;
      case 'sheathe': this.noise(0.35, 5000, 3, 0.15, pos, 'bandpass', 2200, 0.08); break;
      case 'death': this.noise(0.5, 250, 0.7, 0.5, pos, 'lowpass', 120, 0.05); break;
      case 'step': this.noise(0.07, opts.soft ? 600 : 1100, 0.9, opts.gain ?? 0.12, pos, 'lowpass'); break;
      case 'gong': for (const r of [1, 1.47, 2.1, 2.9, 4.1]) this.tone(92 * r, 5 / Math.sqrt(r), 0.28 / r, null, 'sine', 92 * r * 0.985, 0.6); break;
      case 'quest': [0, 4, 7].forEach((k, i) => this.pluck(293.66 * Math.pow(2, k / 12), 0.5, this.sfx, i * 0.12)); break;
      case 'questDone': [0, 2, 4, 7, 9, 12].forEach((k, i) => this.pluck(293.66 * Math.pow(2, k / 12), 0.45, this.sfx, i * 0.09)); break;
      case 'tick': this.pluck(587.3, 0.3, this.sfx); break;
      case 'click': this.tone(1200, 0.05, 0.08, null, 'triangle'); break;
      case 'levelup': [7, 9, 12, 14].forEach((k, i) => this.pluck(293.66 * Math.pow(2, k / 12), 0.4, this.sfx, i * 0.1)); break;
      case 'coins': for (let i = 0; i < 4; i++) setTimeout(() => this.metal(2400 + Math.random() * 800, 0.2, 0.08, null), i * 60); break;
      case 'eat': this.noise(0.25, 1200, 1, 0.2, null, 'bandpass'); break;
      case 'drum': this.tone(70, 0.5, 0.9, pos, 'sine', 38, 0.4); this.noise(0.08, 200, 1, 0.5, pos, 'lowpass'); break;
      case 'horn': { const c = this.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 146; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.4); g.gain.setValueAtTime(0.25, t + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4); o.connect(f); f.connect(g); this.route(g, pos, 1, 0.6); o.start(t); o.stop(t + 2.5); break; }
      case 'cheer': this.noise(2.2, 900, 0.5, 0.35, pos, 'bandpass', 700, 0.3); break;
      default: break;
    }
  }
  voice() {}

  // ---- ambience -----------------------------------------------------------
  startAmbience() {
    const c = this.ctx;
    const mk = (freq, type, q) => {
      const s = c.createBufferSource(); s.buffer = this.makeNoise(4); s.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.amb); s.start();
      return { g, f };
    };
    this.wind = mk(420, 'lowpass', 0.4);
    this.river = mk(900, 'bandpass', 0.35);
    this.crowd = mk(500, 'bandpass', 0.9);
    this.fireAmb = mk(2500, 'highpass', 0.5);
  }

  update(dt) {
    if (!this.enabled) return;
    const g = this.game, c = this.ctx, t = c.currentTime;
    const p = g.player;
    if (!p) return;
    const night = g.world?.sky?.nightFactor ?? 0;
    const windV = 0.12 + 0.06 * Math.sin(t * 0.13) + 0.04 * Math.sin(t * 0.71);
    this.wind.g.gain.setTargetAtTime(windV, t, 0.5);
    this.wind.f.frequency.setTargetAtTime(350 + 150 * Math.sin(t * 0.21), t, 0.5);
    // river proximity
    const hf = g.world.hf;
    let rd = 999;
    if (hf.riverPts) { const gi = Math.round(hf.toGrid(p.pos.x)), gj = Math.round(hf.toGrid(p.pos.z)); rd = hf.riverDist[hf.idx(Math.max(0, Math.min(hf.N - 1, gi)), Math.max(0, Math.min(hf.N - 1, gj)))]; }
    this.river.g.gain.setTargetAtTime(Math.max(0, 1 - rd / 45) * 0.35, t, 0.4);
    // crowd in town during the day
    const inTown = g.locationKind === 'walledTown' || g.locationKind === 'armyCamp' || g.locationKind === 'rebelCamp';
    this.crowd.g.gain.setTargetAtTime(inTown ? 0.07 * (1 - night * 0.8) : 0, t, 1);
    // fires
    let fd = 999;
    for (const f of g.world.settlements.fires) fd = Math.min(fd, Math.hypot(f.x - p.pos.x, f.z - p.pos.z));
    this.fireAmb.g.gain.setTargetAtTime(Math.max(0, 1 - fd / 12) * 0.05 * (0.6 + Math.random() * 0.8), t, 0.05);
    // birds by day, crickets by night
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      if (night < 0.5) {
        const base = 2000 + Math.random() * 2500;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) setTimeout(() => this.tone(base * (0.9 + Math.random() * 0.3), 0.09, 0.03, null, 'sine', base * (1.2 + Math.random() * 0.3), 0.5), i * 110);
        this.nextBird = 1.5 + Math.random() * 5;
      } else {
        for (let i = 0; i < 6; i++) setTimeout(() => this.tone(4400, 0.03, 0.012, null, 'square', null, 0.2), i * 55);
        this.nextBird = 0.6 + Math.random() * 1.2;
      }
    }
    // music
    this.updateMusic(dt);
  }

  setMood(m) { this.musicMood = m; }
  setRain(v) {
    if (!this.enabled) return;
    if (!this.rainN) { const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.makeNoise(3); s.loop = true; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900; const gn = c.createGain(); gn.gain.value = 0; s.connect(f); f.connect(gn); gn.connect(this.amb); s.start(); this.rainN = gn; }
    this.rainN.gain.setTargetAtTime(v * 0.22, this.ctx.currentTime, 0.8);
  }

  updateMusic(dt) {
    const c = this.ctx;
    const combat = this.game.inCombat;
    const mood = combat ? 'combat' : this.musicMood;
    this.nextNote -= dt;
    const root = 146.83; // D3
    if (mood === 'combat') {
      this.nextDrum -= dt;
      if (this.nextDrum <= 0) {
        const pat = [1, 0, 0.5, 0, 1, 0.4, 0.7, 0];
        this.drumStep = ((this.drumStep || 0) + 1) % pat.length;
        const v = pat[this.drumStep];
        if (v) { const tt = c.currentTime; const o = c.createOscillator(); o.frequency.setValueAtTime(90, tt); o.frequency.exponentialRampToValueAtTime(42, tt + 0.3); const g = c.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.7 * v, tt + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.45); o.connect(g); g.connect(this.music); o.start(tt); o.stop(tt + 0.5); }
        this.nextDrum = 0.19;
      }
      if (this.nextNote <= 0) {
        const k = PENTA[Math.floor(Math.random() * 5)] + 12 * Math.floor(Math.random() * 2);
        this.pluck(root * Math.pow(2, k / 12), 0.4);
        this.nextNote = 0.38 * (1 + Math.floor(Math.random() * 3));
      }
      return;
    }
    if (this.nextNote > 0) return;
    // sparse guqin phrases with long silences
    if (!this.phrase.length) {
      if (Math.random() < 0.35) { this.nextNote = 6 + Math.random() * 10; return; }
      let deg = Math.floor(Math.random() * 5);
      const len = 4 + Math.floor(Math.random() * 6);
      const oct = mood === 'tense' ? 0 : 1;
      for (let i = 0; i < len; i++) {
        deg = Math.max(0, Math.min(9, deg + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]));
        const semis = PENTA[deg % 5] + 12 * (Math.floor(deg / 5) + oct - 1);
        this.phrase.push({ f: root * Math.pow(2, semis / 12), d: [0.5, 0.75, 1, 1.5, 2][Math.floor(Math.random() * 5)] * (mood === 'tense' ? 0.7 : 1) });
      }
    }
    const n = this.phrase.shift();
    this.pluck(n.f, 0.55);
    if (Math.random() < 0.25) this.pluck(n.f / 2, 0.3); // octave bass (散音)
    this.nextNote = n.d;
  }
}
