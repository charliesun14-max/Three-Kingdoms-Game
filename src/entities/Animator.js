// Procedural + keyframed animation for the humanoid rig.
// Angles in degrees, Euler XYZ in each bone's rest frame.
// Conventions: shoulder.x < 0 raises the arm forward; shoulderL.z > 0 / shoulderR.z < 0 lifts sideways;
// elbow.x < 0 bends the forearm up; thigh.x < 0 swings the leg forward; knee.x > 0 flexes;
// spine/chest.x > 0 leans forward; spine/chest.y > 0 twists toward the character's left.
import * as THREE from 'three';
import { clamp, lerp } from '../core/MathUtil.js';

const D = Math.PI / 180;
const BONE_LIST = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR', 'thighL', 'kneeL', 'footL', 'thighR', 'kneeR', 'footR'];

const ease = (t) => t * t * (3 - 2 * t);
const _wv = new THREE.Vector3();

// ---- static poses -----------------------------------------------------------
export const POSES = {
  relaxed: { shoulderL: [2, 0, 7], shoulderR: [2, 0, -7], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0] },
  guardBlade: { _w: [0.2, 0.75, 0.65],  shoulderR: [-38, 12, -22], elbowR: [-68, 0, 0], handR: [10, 0, 10], shoulderL: [-28, -10, 16], elbowL: [-70, 0, 0], chest: [4, -8, 0], spine: [2, 0, 0] },
  guardShield: { _w: [0.2, 0.75, 0.65],  shoulderR: [-38, 12, -22], elbowR: [-68, 0, 0], handR: [10, 0, 10], shoulderL: [-55, -25, 20], elbowL: [-80, 0, 0], handL: [0, 0, 0], chest: [4, -8, 0] },
  guardPolearm: { _w: [0.06, 0.12, 1],  shoulderR: [-8, -6, -18], elbowR: [-88, 0, 0], handR: [0, 0, 0], shoulderL: [-58, -24, 6], elbowL: [-32, 0, 0], handL: [0, 0, 0], chest: [4, -24, 0], spine: [3, -8, 0] },
  guardFists: { _w: [0, 0.7, 0.7],  shoulderR: [-50, 20, -10], elbowR: [-115, 0, 0], shoulderL: [-55, -20, 10], elbowL: [-115, 0, 0], chest: [6, -10, 0] },
  carryPolearm: { shoulderR: [-10, 0, -8], elbowR: [-60, 0, 0], handR: [0, 0, 0] },
  bow: { shoulderL: [-48, -8, 18], shoulderR: [-48, 8, -18], elbowL: [-82, 0, 0], elbowR: [-82, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0], spine: [18, 0, 0], chest: [12, 0, 0], head: [16, 0, 0] },
  kneel: { hips: [0, 0, 0], thighL: [-88, 0, 4], kneeL: [92, 0, 0], thighR: [6, 0, -3], kneeR: [98, 0, 0], footR: [40, 0, 0], spine: [6, 0, 0], shoulderL: [-15, 0, 10], shoulderR: [-15, 0, -10], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], _drop: 0.46 },
  kowtow: { thighL: [-100, 0, 4], kneeL: [150, 0, 0], thighR: [-100, 0, -4], kneeR: [150, 0, 0], spine: [40, 0, 0], chest: [30, 0, 0], head: [10, 0, 0], shoulderL: [-100, 0, 10], shoulderR: [-100, 0, -10], elbowL: [-20, 0, 0], elbowR: [-20, 0, 0], _drop: 0.62 },
  seiza: { thighL: [-92, 0, 3], kneeL: [165, 0, 0], thighR: [-92, 0, -3], kneeR: [165, 0, 0], footL: [60, 0, 0], footR: [60, 0, 0], spine: [2, 0, 0], shoulderL: [-25, 0, 8], shoulderR: [-25, 0, -8], elbowL: [-50, 0, 0], elbowR: [-50, 0, 0], _drop: 0.6 },
  sitGround: { thighL: [-80, 0, 30], kneeL: [120, 0, 0], thighR: [-80, 0, -30], kneeR: [120, 0, 0], spine: [8, 0, 0], shoulderL: [-30, 0, 10], shoulderR: [-30, 0, -10], elbowL: [-40, 0, 0], elbowR: [-40, 0, 0], _drop: 0.72 },
  salute: { shoulderL: [-52, -30, -8], shoulderR: [-52, 30, 8], elbowL: [-78, 0, 0], elbowR: [-78, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0], spine: [16, 0, 0], chest: [10, 0, 0], head: [10, 0, 0] },
  armsCrossed: { shoulderL: [-38, -30, 0], shoulderR: [-38, 30, 0], elbowL: [-105, 0, 0], elbowR: [-100, 0, 0] },
  handsBehind: { shoulderL: [22, 0, 2], shoulderR: [22, 0, -2], elbowL: [-40, 0, 0], elbowR: [-40, 0, 0], spine: [-2, 0, 0] },
  lie: { _lie: 1, shoulderL: [0, 0, 12], shoulderR: [0, 0, -12], elbowL: [-5, 0, 0], elbowR: [-5, 0, 0], thighL: [0, 0, 4], thighR: [0, 0, -4], kneeL: [4, 0, 0], kneeR: [4, 0, 0], head: [-8, 0, 0] },
  dead: { _lie: 1, shoulderL: [-20, 0, 50], shoulderR: [-30, 0, -65], elbowL: [-40, 0, 0], elbowR: [-15, 0, 0], thighL: [-10, 0, 12], thighR: [-25, 0, -8], kneeL: [30, 0, 0], kneeR: [15, 0, 0], head: [-10, 30, 0], chest: [0, 10, 0] },
  surrender: { thighL: [-88, 0, 4], kneeL: [92, 0, 0], thighR: [6, 0, -3], kneeR: [98, 0, 0], shoulderL: [-160, 0, 20], shoulderR: [-160, 0, -20], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], head: [15, 0, 0], _drop: 0.46 },
  cheer: { shoulderR: [-168, 0, -12], elbowR: [-10, 0, 0], shoulderL: [-20, 0, 20], chest: [-6, 0, 0], head: [-15, 0, 0] },
  point: { shoulderR: [-85, 10, -5], elbowR: [-5, 0, 0], handR: [0, 0, 0] },
  drink: { shoulderR: [-62, 28, -8], elbowR: [-132, 0, 0], head: [-18, 0, 0] },
};

// ---- clips ------------------------------------------------------------------
// Each clip: duration, keys [{t, pose}], hitTime (for attacks), loop.
function atk(wind, strike, dur = 0.82, hit = 0.46) {
  return { dur, hit, keys: [{ t: 0, pose: null }, { t: 0.36, pose: wind }, { t: hit, pose: strike }, { t: 0.68, pose: strike }, { t: 1, pose: null }] };
}
export const CLIPS = {
  // Blade (one-handed, right hand)
  blade_right: atk(
    { _w: [-0.6, 0.72, -0.3], shoulderR: [-55, -35, -75], elbowR: [-70, 0, 0], handR: [0, 0, 30], chest: [0, -38, 0], spine: [0, -12, 0], shoulderL: [-20, 0, 25] },
    { _w: [0.85, 0.05, 0.55], shoulderR: [-82, 45, -10], elbowR: [-12, 0, 0], handR: [0, 0, -20], chest: [8, 34, 0], spine: [4, 12, 0], shoulderL: [-10, 0, 30] }),
  blade_left: atk(
    { _w: [0.6, 0.72, -0.25], shoulderR: [-70, 62, 12], elbowR: [-112, 0, 0], handR: [0, 0, -30], chest: [0, 36, 0], spine: [0, 12, 0] },
    { _w: [-0.85, 0.02, 0.55], shoulderR: [-78, -30, -62], elbowR: [-10, 0, 0], handR: [0, 0, 20], chest: [8, -34, 0], spine: [4, -12, 0], shoulderL: [-10, 0, 35] }),
  blade_overhead: atk(
    { _w: [0, 0.65, -0.75], shoulderR: [-168, 5, -18], elbowR: [-78, 0, 0], handR: [30, 0, 0], chest: [-10, -6, 0], spine: [-6, 0, 0], shoulderL: [-30, 0, 20] },
    { _w: [0, -0.35, 1], shoulderR: [-62, 12, -8], elbowR: [-8, 0, 0], handR: [-30, 0, 0], chest: [18, 4, 0], spine: [12, 0, 0], thighL: [-22, 0, 0], kneeL: [16, 0, 0] }),
  blade_thrust: atk(
    { _w: [0.05, 0.05, 1], shoulderR: [-8, -10, -22], elbowR: [-118, 0, 0], handR: [-45, 0, 0], chest: [0, -26, 0], spine: [0, -8, 0] },
    { _w: [0, -0.02, 1], shoulderR: [-84, 8, -4], elbowR: [-4, 0, 0], handR: [-58, 0, 0], chest: [10, 16, 0], spine: [10, 6, 0], thighL: [-28, 0, 0], kneeL: [18, 0, 0], shoulderL: [10, 0, 30] }, 0.78, 0.44),
  // Polearm (two-handed)
  polearm_thrust: atk(
    { _w: [0.05, 0.1, 1], shoulderR: [8, -6, -20], elbowR: [-70, 0, 0], shoulderL: [-40, -24, 6], elbowL: [-60, 0, 0], chest: [0, -32, 0], spine: [0, -10, 0] },
    { _w: [0, -0.06, 1], shoulderR: [-55, 10, -10], elbowR: [-20, 0, 0], shoulderL: [-85, -18, 4], elbowL: [-4, 0, 0], chest: [14, -8, 0], spine: [12, 0, 0], thighL: [-30, 0, 0], kneeL: [18, 0, 0] }, 0.86, 0.48),
  polearm_right: atk(
    { _w: [-0.85, 0.25, 0.45], shoulderR: [-30, -20, -60], elbowR: [-80, 0, 0], shoulderL: [-70, 10, 20], elbowL: [-50, 0, 0], chest: [0, -50, 0], spine: [0, -14, 0] },
    { _w: [0.85, 0.02, 0.5], shoulderR: [-60, 40, -10], elbowR: [-40, 0, 0], shoulderL: [-50, -40, 40], elbowL: [-30, 0, 0], chest: [8, 40, 0], spine: [4, 14, 0] }, 0.95, 0.52),
  polearm_left: atk(
    { _w: [0.85, 0.25, 0.45], shoulderR: [-60, 40, -10], elbowR: [-60, 0, 0], shoulderL: [-40, -40, 30], elbowL: [-60, 0, 0], chest: [0, 44, 0], spine: [0, 14, 0] },
    { _w: [-0.85, 0.02, 0.5], shoulderR: [-30, -30, -50], elbowR: [-60, 0, 0], shoulderL: [-75, 10, 10], elbowL: [-30, 0, 0], chest: [8, -46, 0], spine: [4, -14, 0] }, 0.95, 0.52),
  polearm_overhead: atk(
    { _w: [0, 0.95, 0.3], shoulderR: [-150, 0, -20], elbowR: [-60, 0, 0], shoulderL: [-160, 0, 20], elbowL: [-50, 0, 0], chest: [-12, -10, 0], spine: [-6, 0, 0] },
    { _w: [0, -0.3, 1], shoulderR: [-40, 6, -14], elbowR: [-60, 0, 0], shoulderL: [-70, -10, 10], elbowL: [-20, 0, 0], chest: [20, -10, 0], spine: [14, 0, 0], thighL: [-24, 0, 0], kneeL: [16, 0, 0] }, 1.0, 0.54),
  // Fists
  fists_right: atk({ shoulderR: [-40, 10, -40], elbowR: [-110, 0, 0], chest: [0, -30, 0] }, { shoulderR: [-88, 30, -10], elbowR: [-10, 0, 0], chest: [4, 26, 0] }, 0.6, 0.34),
  fists_left: atk({ shoulderL: [-40, -10, 40], elbowL: [-110, 0, 0], chest: [0, 30, 0] }, { shoulderL: [-88, -30, 10], elbowL: [-10, 0, 0], chest: [4, -26, 0] }, 0.6, 0.34),
  fists_overhead: atk({ shoulderR: [-140, 0, -20], elbowR: [-100, 0, 0], chest: [-8, 0, 0] }, { shoulderR: [-70, 0, -10], elbowR: [-30, 0, 0], chest: [16, 0, 0] }, 0.7, 0.4),
  fists_thrust: atk({ shoulderR: [-30, 0, -20], elbowR: [-120, 0, 0], chest: [0, -20, 0] }, { shoulderR: [-90, 0, -5], elbowR: [0, 0, 0], chest: [8, 14, 0] }, 0.55, 0.32),
  // Reactions
  hit: { dur: 0.42, keys: [{ t: 0, pose: null }, { t: 0.25, pose: { chest: [-16, 10, 0], spine: [-8, 0, 0], head: [-18, 10, 0] } }, { t: 1, pose: null }] },
  stagger: { dur: 0.9, keys: [{ t: 0, pose: null }, { t: 0.2, pose: { chest: [-22, -14, 0], spine: [-12, 0, 0], head: [-20, 0, 0], shoulderR: [-20, 0, -45], shoulderL: [-20, 0, 45], thighR: [18, 0, 0], kneeR: [20, 0, 0] } }, { t: 0.7, pose: { chest: [-8, 0, 0] } }, { t: 1, pose: null }] },
  parry: { dur: 0.35, keys: [{ t: 0, pose: null }, { t: 0.3, pose: { _w: [0.9, 0.4, 0.3], shoulderR: [-95, 30, -30], elbowR: [-60, 0, 0], handR: [0, 0, 40], chest: [0, 10, 0] } }, { t: 1, pose: null }] },
  dodge: { dur: 0.45, keys: [{ t: 0, pose: null }, { t: 0.4, pose: { thighL: [20, 0, 0], kneeL: [30, 0, 0], thighR: [-30, 0, 0], kneeR: [40, 0, 0], chest: [-10, 0, 0], _drop: 0.1 } }, { t: 1, pose: null }] },
  // Everyday
  farm: { dur: 1.6, loop: true, keys: [{ t: 0, pose: { shoulderR: [-40, 0, -12], elbowR: [-60, 0, 0], shoulderL: [-50, -10, 10], elbowL: [-40, 0, 0], spine: [18, 0, 0] } }, { t: 0.45, pose: { shoulderR: [-150, 0, -15], elbowR: [-60, 0, 0], shoulderL: [-150, 0, 15], elbowL: [-40, 0, 0], spine: [-4, 0, 0] } }, { t: 0.62, pose: { shoulderR: [-40, 0, -12], elbowR: [-40, 0, 0], shoulderL: [-50, -10, 10], elbowL: [-20, 0, 0], spine: [30, 0, 0] } }, { t: 1, pose: { shoulderR: [-40, 0, -12], elbowR: [-60, 0, 0], shoulderL: [-50, -10, 10], elbowL: [-40, 0, 0], spine: [18, 0, 0] } }] },
  talk: { dur: 2.4, loop: true, keys: [{ t: 0, pose: { shoulderR: [-25, 10, -10], elbowR: [-60, 0, 0] } }, { t: 0.3, pose: { shoulderR: [-35, -10, -25], elbowR: [-75, 0, 0], handR: [0, 0, 20] } }, { t: 0.6, pose: { shoulderR: [-20, 15, -8], elbowR: [-55, 0, 0] } }, { t: 1, pose: { shoulderR: [-25, 10, -10], elbowR: [-60, 0, 0] } }] },
  talk_once: { dur: 1.8, keys: [{ t: 0, pose: null }, { t: 0.25, pose: { shoulderR: [-35, -10, -25], elbowR: [-75, 0, 0], handR: [0, 0, 20] } }, { t: 0.6, pose: { shoulderR: [-28, 12, -10], elbowR: [-62, 0, 0] } }, { t: 1, pose: null }] },
  hammer: { dur: 0.9, loop: true, keys: [{ t: 0, pose: { shoulderR: [-60, 0, -10], elbowR: [-40, 0, 0], spine: [15, 0, 0] } }, { t: 0.5, pose: { shoulderR: [-130, 0, -10], elbowR: [-90, 0, 0], spine: [10, 0, 0] } }, { t: 0.65, pose: { shoulderR: [-50, 0, -10], elbowR: [-30, 0, 0], spine: [20, 0, 0] } }, { t: 1, pose: { shoulderR: [-60, 0, -10], elbowR: [-40, 0, 0], spine: [15, 0, 0] } }] },
  drinkLoop: { dur: 4, loop: true, keys: [{ t: 0, pose: { shoulderR: [-30, 10, -8], elbowR: [-80, 0, 0] } }, { t: 0.2, pose: POSES.drink }, { t: 0.35, pose: POSES.drink }, { t: 0.5, pose: { shoulderR: [-30, 10, -8], elbowR: [-80, 0, 0] } }, { t: 1, pose: { shoulderR: [-30, 10, -8], elbowR: [-80, 0, 0] } }] },
};

// ---- Animator ----------------------------------------------------------------
export class Animator {
  constructor(rig) {
    this.rig = rig;
    this.bones = rig.bones;
    this.cur = {};
    for (const b of BONE_LIST) this.cur[b] = [0, 0, 0];
    this.phase = 0;
    this.time = Math.random() * 10;
    this.clip = null; // {name, t, speed, weight, onHit, hitDone}
    this.loopClip = null;
    this.pose = null; // named static pose override (e.g. kneel)
    this.poseW = 0;
    this.drop = 0;
    this.lie = 0;
    this.stance = 'relaxed';
    this.stanceW = 0;
    this.blocking = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.lean = 0;
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  play(name, opts = {}) {
    const c = CLIPS[name];
    if (!c) return;
    this.clip = { name, def: c, t: 0, speed: opts.speed ?? 1, onHit: opts.onHit, hitDone: false, onEnd: opts.onEnd };
  }
  get busy() { return !!this.clip; }
  clipProgress() { return this.clip ? this.clip.t / this.clip.def.dur : 1; }

  setLoop(name) { this.loopClip = name ? { name, def: CLIPS[name], t: Math.random() * CLIPS[name].dur } : null; }
  setPose(name) { this.pose = name; }

  samplePose(pose, out, w) {
    if (!pose || w <= 0) return;
    for (const k in pose) {
      if (k[0] === '_' && k !== '_w') continue;
      const v = pose[k], o = out[k];
      if (!o) continue;
      o[0] = lerp(o[0], v[0], w); o[1] = lerp(o[1], v[1], w); o[2] = lerp(o[2], v[2], w);
    }
  }

  sampleClip(def, t, out) {
    const keys = def.keys;
    const u = clamp(t / def.dur, 0, 1);
    let i = 0;
    while (i < keys.length - 2 && u > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1];
    const f = ease(clamp((u - a.t) / Math.max(1e-4, b.t - a.t), 0, 1));
    // null pose = current base (weight 0)
    const touched = new Set([...Object.keys(a.pose || {}), ...Object.keys(b.pose || {})]);
    for (const k of touched) {
      if ((k[0] === '_' && k !== '_w') || !out[k]) continue;
      const base = out[k];
      const va = a.pose && a.pose[k] ? a.pose[k] : base;
      const vb = b.pose && b.pose[k] ? b.pose[k] : base;
      out[k] = [lerp(va[0], vb[0], f), lerp(va[1], vb[1], f), lerp(va[2], vb[2], f)];
    }
    const da = a.pose?._drop ?? 0, db = b.pose?._drop ?? 0;
    return lerp(da, db, f);
  }

  /**
   * s: { speed, maxSpeed, backward, strafe, stance('relaxed'|'combat'), weaponCls, shield, blocking, dead, grounded, sneak }
   */
  update(dt, s) {
    this.time += dt;
    const out = {};
    for (const b of BONE_LIST) out[b] = [0, 0, 0];
    out._w = [0.2, 0.75, 0.65];

    // Base / stance
    this.samplePose(POSES.relaxed, out, 1);
    const combat = s.stance === 'combat';
    this.stanceW = lerp(this.stanceW, combat ? 1 : 0, 1 - Math.exp(-10 * dt));
    let guard = POSES.guardBlade;
    if (s.weaponCls === 'polearm') guard = POSES.guardPolearm;
    else if (s.weaponCls === 'fists') guard = POSES.guardFists;
    else if (s.weaponCls === 'bow') guard = POSES.bow;
    else if (s.shield) guard = POSES.guardShield;
    if (!combat && s.weaponCls === 'polearm' && s.armed) this.samplePose(POSES.carryPolearm, out, 1);
    this.samplePose(guard, out, this.stanceW);

    // Breathing / idle
    const br = Math.sin(this.time * 1.6);
    out.chest[0] += br * 1.2;
    out.head[0] += Math.sin(this.time * 0.37) * 2;
    out.head[1] += Math.sin(this.time * 0.23) * 4 * (1 - this.stanceW);

    // Locomotion
    const sp = s.speed || 0;
    const run = clamp((sp - 2.2) / 2.6, 0, 1);
    const stride = lerp(1.35, 2.5, run);
    const dir = s.backward ? -1 : 1;
    this.phase += (sp * dt / stride) * Math.PI * 2 * dir;
    const moveW = clamp(sp / 1.2, 0, 1);
    const ph = this.phase;
    const A = lerp(26, 44, run) * moveW * (s.sneak ? 0.8 : 1);
    const K = lerp(38, 80, run) * moveW;
    out.thighL[0] += -A * Math.sin(ph);
    out.thighR[0] += -A * Math.sin(ph + Math.PI);
    out.kneeL[0] += K * Math.max(0, Math.cos(ph)) + 5 * moveW;
    out.kneeR[0] += K * Math.max(0, Math.cos(ph + Math.PI)) + 5 * moveW;
    out.footL[0] += 10 * moveW * Math.sin(ph - 0.6);
    out.footR[0] += 10 * moveW * Math.sin(ph + Math.PI - 0.6);
    const armAmp = lerp(22, 48, run) * moveW * (1 - this.stanceW * 0.85);
    out.shoulderL[0] += armAmp * Math.sin(ph);
    out.shoulderR[0] += armAmp * Math.sin(ph + Math.PI) * (s.armed && s.weaponCls === 'polearm' && !combat ? 0.3 : 1);
    out.elbowL[0] += -run * 55 * (1 - this.stanceW);
    out.elbowR[0] += -run * 55 * (1 - this.stanceW);
    out.spine[1] += 6 * moveW * Math.sin(ph);
    out.chest[1] += -4 * moveW * Math.sin(ph);
    out.spine[0] += run * 12 + (s.sneak ? 18 : 0);
    out.head[0] += -run * 6 + (s.sneak ? -8 : 0);
    if (s.strafe) out.hips[1] += s.strafe * 30 * moveW;
    let bob = moveW * (lerp(0.018, 0.05, run)) * Math.abs(Math.cos(ph));
    let drop = bob + (s.sneak ? 0.18 : 0);

    // Blocking overlay
    this.blocking = lerp(this.blocking, s.blocking ? 1 : 0, 1 - Math.exp(-18 * dt));
    if (this.blocking > 0.01) {
      const bp = s.weaponCls === 'polearm'
        ? { _w: [0.92, 0.38, 0.1], shoulderR: [-30, 20, -30], elbowR: [-100, 0, 0], shoulderL: [-80, -40, 30], elbowL: [-70, 0, 0], chest: [4, 10, 0] }
        : s.shield ? { shoulderL: [-80, -40, 10], elbowL: [-85, 0, 0], shoulderR: [-40, 10, -22] }
          : { _w: [0.95, 0.3, 0.15], shoulderR: [-92, 42, -26], elbowR: [-58, 0, 0], handR: [0, 0, 50], chest: [4, 12, 0], shoulderL: [-20, 0, 25] };
      this.samplePose(bp, out, this.blocking);
    }

    // Looping activity (farming, talking)
    if (this.loopClip && !this.clip && moveW < 0.1) {
      this.loopClip.t = (this.loopClip.t + dt) % this.loopClip.def.dur;
      drop += this.sampleClip(this.loopClip.def, this.loopClip.t, out) || 0;
    }

    // Static pose override (kneel, sit, lie ...)
    const targetPoseW = this.pose ? 1 : 0;
    this.poseW = lerp(this.poseW, targetPoseW, 1 - Math.exp(-5 * dt));
    if (this.pose) this._lastPose = this.pose;
    const P = POSES[this._lastPose];
    if (P && this.poseW > 0.001) {
      this.samplePose(P, out, this.poseW);
      drop = lerp(drop, P._drop ?? 0, this.poseW);
    }
    const lieTarget = (P && P._lie && this.pose) || s.dead ? 1 : 0;

    // One-shot clip
    if (this.clip) {
      const c = this.clip;
      c.t += dt * c.speed;
      drop += this.sampleClip(c.def, c.t, out) || 0;
      if (c.def.hit !== undefined && !c.hitDone && c.t / c.def.dur >= c.def.hit) {
        c.hitDone = true;
        if (c.onHit) c.onHit();
      }
      if (c.t >= c.def.dur) { const cb = c.onEnd; this.clip = null; if (cb) cb(); }
    }

    // Death pose
    if (s.dead) this.samplePose(POSES.dead, out, 1);

    // Look-at (head/neck)
    out.neck[1] += this.lookYaw * 0.4;
    out.head[1] += this.lookYaw * 0.6;
    out.head[0] += this.lookPitch;

    // Smooth and apply
    const k = 1 - Math.exp(-22 * dt);
    for (const b of BONE_LIST) {
      const c = this.cur[b], t = out[b];
      c[0] = lerp(c[0], t[0], k); c[1] = lerp(c[1], t[1], k); c[2] = lerp(c[2], t[2], k);
      const bone = this.bones[b];
      if (!bone) continue;
      this._e.set(c[0] * D, c[1] * D, c[2] * D, 'XYZ');
      bone.quaternion.setFromEuler(this._e);
    }
    if (!this.wdir) this.wdir = new THREE.Vector3(0.2, 0.75, 0.65);
    _wv.set(out._w[0], out._w[1], out._w[2]).normalize();
    this.wdir.lerp(_wv, 1 - Math.exp(-(this.clip ? 30 : 16) * dt)).normalize();
    this.drop = lerp(this.drop, drop, 1 - Math.exp(-12 * dt));
    this.lie = lerp(this.lie, lieTarget, 1 - Math.exp(-(s.dead ? 7 : 4) * dt));
    this.bones.hips.position.y = 0.95 - this.drop;
    // lying: rotate whole body back around the feet
    this.bones.root.rotation.x = -this.lie * Math.PI / 2 * 0.98;
    this.bones.root.position.y = this.lie * 0.12;
    this.bones.root.position.z = -this.lie * 0.05;
  }
}
