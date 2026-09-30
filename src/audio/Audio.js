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
  pluck(freq, gain = 0.5, dest = null, when = 0, slide = 0) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.pluckBuffer(freq);
    // 吟猱 ornament: the left hand slides/vibrates the stopped string after the pluck
    if (slide) { const t0 = c.currentTime + when; s.playbackRate.setValueAtTime(1, t0 + 0.25); s.playbackRate.linearRampToValueAtTime(slide, t0 + 0.6); }
    else if (!dest) { const t0 = c.currentTime + when; s.playbackRate.setValueAtTime(1, t0); for (let i = 1; i < 6; i++) s.playbackRate.linearRampToValueAtTime(1 + (i % 2 ? 0.006 : -0.006), t0 + 0.3 + i * 0.16); }
    const g = c.createGain(); g.gain.value = gain;
    s.connect(g); g.connect(dest || this.music);
    const vg = c.createGain(); vg.gain.value = 0.5; g.connect(vg); vg.connect(this.verb);
    s.start(c.currentTime + when);
  }

  // 簫 end-blown bamboo flute: breathy sine with delayed vibrato
  xiao(freq, dur) {
    const c = this.ctx, t = c.currentTime + 0.1;
    while (freq > 900) freq /= 2;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2; const g2 = c.createGain(); g2.gain.value = 0.12; o2.connect(g2);
    const lfo = c.createOscillator(); lfo.frequency.value = 5; const lg = c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * 0.012, t + dur * 0.6); lfo.connect(lg); lg.connect(o.frequency);
    const br = c.createBufferSource(); br.buffer = this.noiseBuf; const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = freq * 2; bf.Q.value = 2; const bg = c.createGain(); bg.gain.value = 0.05; br.connect(bf); bf.connect(bg);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.35); g.gain.setValueAtTime(0.09, t + dur - 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g2.connect(g); bg.connect(g); g.connect(this.music);
    const vg = c.createGain(); vg.gain.value = 0.6; g.connect(vg); vg.connect(this.verb);
    for (const n of [o, o2, lfo]) { n.start(t); n.stop(t + dur + 0.1); }
    br.start(t); br.stop(t + dur + 0.1);
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
      case 'cheer': this.noise(2.2, 900, 0.5, 0.35, pos, 'bandpass', 700, 0.3); for (let i = 0; i < 5; i++) setTimeout(() => this.voice({ id: 'crowd' + i + Math.random(), pos, baseLook: { height: 1.6 + Math.random() * 0.2 } }, 'shout'), i * 90 + Math.random() * 200); break;
      case 'bow': this.pluck(98 + Math.random() * 8, 0.5, this.sfx); this.noise(0.12, 300, 2, 0.35, pos, 'lowpass'); this.noise(0.5, 1800, 1.2, 0.12, pos, 'bandpass', 700, 0.05); break;
      case 'arrowHit': this.noise(0.08, 500, 1.2, 0.6, pos, 'lowpass'); this.tone(180, 0.12, 0.3, pos, 'triangle', 90); break;
      case 'arrowGround': this.noise(0.06, 800, 1, 0.25, pos, 'lowpass'); break;
      case 'hammer': this.metal(900 + Math.random() * 60, 0.5, 0.12, pos); break;
      case 'splash': this.noise(0.4, 1400, 0.6, 0.3, pos, 'bandpass', 500, 0.02); break;
      default: break;
    }
  }
  // Formant-synthesised vocalisations: glottal sawtooth + breath through vowel formants.
  voice(ch, kind = 'effort') {
    if (!this.enabled || !ch || !['effort', 'pain', 'death', 'shout'].includes(kind)) return;
    const c = this.ctx, t = c.currentTime;
    if ((ch._vox || 0) > t) return;
    const cp = this.game.engine?.camera.position; const d = ch.pos && cp ? Math.hypot(ch.pos.x - cp.x, ch.pos.z - cp.z) : 0;
    if (d > 45) return;
    const female = ch.baseLook?.female;
    const seed = (ch.id || '').length * 7.3 + (ch.baseLook?.height || 1.7) * 40;
    const f0 = (female ? 215 : 108) * (0.88 + (seed % 1) * 0.28) * (kind === 'pain' ? 1.35 : kind === 'death' ? 1.2 : kind === 'shout' ? 1.25 : 1);
    const dur = { effort: 0.22, pain: 0.38, death: 0.9, shout: 0.55 }[kind] || 0.3;
    ch._vox = t + dur + (kind === 'effort' ? 0.6 : 0.2);
    // vowel formants: 'ha' / 'ah' / 'oh' / 'uh'
    const V = { effort: [[700, 1200, 2500]], pain: [[800, 1300, 2600], [550, 900, 2400]], death: [[750, 1150, 2500], [450, 800, 2300]], shout: [[650, 1100, 2450], [800, 1250, 2600]] }[kind];
    const out = c.createGain(); out.gain.setValueAtTime(0.0001, t);
    const peak = kind === 'effort' ? 0.22 : kind === 'death' ? 0.3 : 0.3;
    out.gain.exponentialRampToValueAtTime(peak, t + (kind === 'effort' ? 0.02 : 0.05));
    out.gain.setValueAtTime(peak, t + dur * 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * (kind === 'effort' ? 1.1 : 1), t);
    if (kind === 'death') o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + dur);
    else if (kind === 'pain') { o.frequency.linearRampToValueAtTime(f0 * 1.15, t + dur * 0.25); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + dur); }
    else o.frequency.exponentialRampToValueAtTime(f0 * 0.85, t + dur);
    // jitter/vibrato so it isn't a buzzer
    const lfo = c.createOscillator(); lfo.frequency.value = 5.5 + Math.random() * 3; const lg = c.createGain(); lg.gain.value = f0 * 0.025; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    const br = c.createBufferSource(); br.buffer = this.noiseBuf; const bg = c.createGain(); bg.gain.value = kind === 'effort' ? 0.5 : 0.25;
    const src = c.createGain(); src.gain.value = 0.35; o.connect(src); br.connect(bg); bg.connect(src);
    const [a, b] = [V[0], V[V.length - 1]];
    [0, 1, 2].forEach((i) => {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [9, 11, 14][i] * (female ? 0.9 : 1);
      const k = female ? 1.17 : 1;
      f.frequency.setValueAtTime(a[i] * k, t); f.frequency.linearRampToValueAtTime(b[i] * k, t + dur);
      const fg = c.createGain(); fg.gain.value = [1, 0.55, 0.18][i] * 3;
      src.connect(f); f.connect(fg); fg.connect(out);
    });
    this.route(out, ch.pos, 1, 0.25);
    o.start(t); o.stop(t + dur + 0.05); br.start(t, Math.random()); br.stop(t + dur + 0.05);
  }

  hoof(pos, hard, gain = 0.2) {
    this.noise(0.06, hard ? 900 : 380, 1.4, gain, pos, 'lowpass');
    this.tone(hard ? 240 : 150, 0.07, gain * 0.7, pos, 'triangle', hard ? 160 : 90, 0.15);
  }
  dog(pos) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) setTimeout(() => {
      if (!this.enabled) return;
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.14);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(f); f.connect(g); this.route(g, pos, 1, 0.5); o.start(t); o.stop(t + 0.2);
    }, i * (180 + Math.random() * 120));
  }
  rooster(pos) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const pts = [[0, 600], [0.12, 900], [0.35, 880], [0.55, 1150], [1.1, 1050], [1.35, 700]];
    o.frequency.setValueAtTime(600, t); for (const [dt, f] of pts) o.frequency.linearRampToValueAtTime(f, t + dt);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 2;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.06); g.gain.setValueAtTime(0.12, t + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(f); f.connect(g); this.route(g, pos, 1, 0.6); o.start(t); o.stop(t + 1.45);
  }


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
    // village life: dogs, cockcrow at dawn, the smith's hammer, summer cicadas
    const hr = g.time?.hour ?? 12;
    this.nextLife = (this.nextLife ?? 4) - dt;
    if (this.nextLife <= 0) {
      this.nextLife = 5 + Math.random() * 9;
      const sp = g.world.settlements?.spots || {};
      const near = g.world.region.settlements?.filter((s) => s.type !== 'banditCamp' && Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 140) || [];
      if (near.length) {
        const s = near[Math.floor(Math.random() * near.length)];
        const pos = { x: s.x + (Math.random() - 0.5) * s.w, z: s.z + (Math.random() - 0.5) * s.d };
        if (hr > 4.8 && hr < 7 && Math.random() < 0.6) this.rooster(pos);
        else if (Math.random() < 0.45) this.dog(pos);
      }
      this.forge = null;
      for (const k in sp) if (/smithy/.test(k) && hr > 7 && hr < 18) { this.forge = sp[k]; break; }
    }
    if (this.forge && hr > 7 && hr < 18 && Math.hypot(this.forge.x - p.pos.x, this.forge.z - p.pos.z) < 50) {
      this.nextHammer = (this.nextHammer ?? 0) - dt;
      if (this.nextHammer <= 0) { this.play('hammer', this.forge); this.hammerN = ((this.hammerN || 0) + 1) % 7; this.nextHammer = this.hammerN === 0 ? 2.5 + Math.random() * 3 : 0.55; }
    }
    if (!this.cicada) { const s = c.createBufferSource(); s.buffer = this.makeNoise(2); s.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = 6; const am = c.createGain(); const lfo = c.createOscillator(); lfo.frequency.value = 38; const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain); am.gain.value = 0.5; const gn = c.createGain(); gn.gain.value = 0; s.connect(f); f.connect(am); am.connect(gn); gn.connect(this.amb); s.start(); lfo.start(); this.cicada = gn; }
    const summer = g.time && g.time.month >= 5 && g.time.month <= 8 ? 1 : 0;
    this.cicada.gain.setTargetAtTime(summer * (1 - night) * (0.5 + 0.5 * Math.sin(t * 0.09)) * 0.035 * (g.weather?.rain > 0.2 ? 0 : 1), t, 1.5);
    // distant clash of a battle in progress
    const fighters = g.entities?.list?.filter((e) => !e.dead && e.combat?.drawn && e.faction !== 'civilian' && e.pos && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 120).length || 0;
    if (fighters > 10) {
      this.nextClash = (this.nextClash ?? 0) - dt;
      if (this.nextClash <= 0) { this.metal(500 + Math.random() * 400, 0.5, 0.03 * Math.min(1, fighters / 30), null); if (Math.random() < 0.3) this.voice({ id: 'far' + Math.random(), pos: null, baseLook: {} }, 'shout'); this.nextClash = 0.15 + Math.random() * 0.5; }
    }
    this.crowd.g.gain.setTargetAtTime(Math.max(inTown ? 0.07 * (1 - night * 0.8) : 0, Math.min(0.12, fighters * 0.004)), t, 1);
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
    this.music.gain.setTargetAtTime(this.game.dialogue?.active ? 0.16 : 0.34, c.currentTime, 0.6);
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
    this.pluck(n.f, 0.55, null, 0, Math.random() < 0.3 ? (Math.random() < 0.5 ? 1.059 : 0.944) : 0);
    if (mood === 'peace' && !this.phrase.length && Math.random() < 0.4) this.xiao(n.f * 2, 2.5 + Math.random() * 2);
    if (Math.random() < 0.25) this.pluck(n.f / 2, 0.3); // octave bass (散音)
    this.nextNote = n.d;
  }
}
