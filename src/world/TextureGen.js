// Procedural, tileable canvas textures (no external image assets needed).
import * as THREE from 'three';
import { Rng } from '../core/Rng.js';

// Tileable value noise on a wrapping lattice.
class TileNoise {
  constructor(seed, period) {
    this.p = period;
    const rng = new Rng(seed);
    this.v = new Float32Array(period * period);
    for (let i = 0; i < this.v.length; i++) this.v[i] = rng.next();
  }
  at(x, y) {
    const p = this.p;
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p;
    const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const a = this.v[y0 * p + x0], b = this.v[y0 * p + x1];
    const c = this.v[y1 * p + x0], d = this.v[y1 * p + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
}

// fbm over tileable noise; u,v in [0,1)
function makeFbm(seed, basePeriod = 4, octaves = 5) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(new TileNoise(seed + o * 101, basePeriod << o));
  return (u, v) => {
    let s = 0, a = 0.5, n = 0;
    for (let o = 0; o < octaves; o++) {
      const P = basePeriod << o;
      s += layers[o].at(u * P, v * P) * a;
      n += a; a *= 0.5;
    }
    return s / n;
  };
}

function canvasTex(size, painter, { srgb = true, repeat = true, mips = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  painter(img.data, size, ctx);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = mips;
  t.needsUpdate = true;
  return t;
}

const mix = (a, b, t) => a + (b - a) * t;
function put(d, i, r, g, b, a = 255) {
  d[i] = Math.max(0, Math.min(255, r));
  d[i + 1] = Math.max(0, Math.min(255, g));
  d[i + 2] = Math.max(0, Math.min(255, b));
  d[i + 3] = a;
}

function colorField(seed, size, fn) {
  const f1 = makeFbm(seed, 4, 6);
  const f2 = makeFbm(seed + 7, 16, 4);
  return canvasTex(size, (d, S) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const c = fn(f1(u, v), f2(u, v), u, v, x, y);
        put(d, (y * S + x) * 4, c[0], c[1], c[2], c[3] ?? 255);
      }
    }
  });
}

const cache = new Map();
function cached(key, gen) {
  if (!cache.has(key)) cache.set(key, gen());
  return cache.get(key);
}

export const Tex = {
  grass: () => cached('grass', () => colorField(11, 512, (a, b) => {
    const t = a * 0.7 + b * 0.3;
    const dry = Math.max(0, (a - 0.6) * 2);
    return [mix(78, 120, dry) + b * 22 - 8, mix(96, 112, dry) + t * 30, mix(48, 60, dry) + b * 10];
  })),
  dryGrass: () => cached('dryGrass', () => colorField(21, 512, (a, b) => {
    return [148 + a * 40 + b * 20, 132 + a * 30, 80 + b * 20];
  })),
  loess: () => cached('loess', () => colorField(31, 512, (a, b, u, v, x, y) => {
    const peb = ((x * 7919 + y * 104729) % 97) < 2 ? -30 : 0;
    return [150 + a * 40 + peb, 122 + a * 32 + peb, 84 + b * 26 + peb];
  })),
  rock: () => cached('rock', () => {
    const f = makeFbm(41, 8, 6), g = makeFbm(43, 2, 3);
    return canvasTex(512, (d, S) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const n = f(u, v), m = g(u, v);
        const crack = Math.abs(n - 0.5) < 0.012 ? -45 : 0;
        const strata = Math.sin((v + m * 0.25) * 60) * 8;
        const base = 104 + n * 70 + strata + crack;
        put(d, (y * S + x) * 4, base + 8 + m * 20, base + 2, base - 6 + m * 10);
      }
    });
  }),
  field: () => cached('field', () => {
    const f = makeFbm(51, 8, 5);
    return canvasTex(512, (d, S) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const n = f(u, v);
        const row = Math.sin(u * Math.PI * 2 * 24);
        const ridge = row > 0.2 ? 1 : 0;
        const green = ridge * (n > 0.3 ? 1 : 0.6);
        put(d, (y * S + x) * 4,
          mix(104 + n * 26, 96 + n * 20, green), mix(84 + n * 20, 116 + n * 24, green), mix(58 + n * 12, 44, green));
      }
    });
  }),
  road: () => cached('road', () => {
    const f = makeFbm(61, 8, 6);
    const rng = new Rng(62);
    return canvasTex(512, (d, S, ctx) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const n = f(u, v);
        // two cart ruts along u
        const rut = Math.exp(-Math.pow((u - 0.32) * 26, 2)) + Math.exp(-Math.pow((u - 0.68) * 26, 2));
        const pebble = rng.next() < 0.004 ? 28 : 0;
        const b = 122 + n * 36 - rut * 24 + pebble;
        put(d, (y * S + x) * 4, b + 10, b - 12, b - 44);
      }
    });
  }),
  litter: () => cached('litter', () => colorField(71, 512, (a, b, u, v, x, y) => {
    const leaf = ((x * 31 + y * 17) % 13 === 0 && a > 0.5) ? 25 : 0;
    return [88 + a * 40 + leaf, 74 + a * 28, 44 + b * 14];
  })),
  plaster: () => cached('plaster', () => colorField(81, 256, (a, b) => {
    const c = 205 + a * 30 - b * 15;
    return [c, c - 10, c - 26];
  })),
  rammedEarth: () => cached('rammedEarth', () => {
    const f = makeFbm(91, 4, 5);
    return canvasTex(256, (d, S) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const n = f(u, v);
        const layer = (Math.floor(v * 6 + n * 0.3) % 2) * 5 + (Math.abs((v * 6 + n * 0.3) % 1 - 0.02) < 0.015 ? -10 : 0);
        put(d, (y * S + x) * 4, 162 + n * 40 + layer, 136 + n * 32 + layer, 100 + n * 22 + layer);
      }
    });
  }),
  mudBrick: () => cached('mudBrick', () => {
    const f = makeFbm(101, 8, 4);
    return canvasTex(256, (d, S) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const n = f(u, v);
        const row = Math.floor(v * 12);
        const bu = (u * 6 + (row % 2) * 0.5) % 1;
        const mortar = (v * 12) % 1 < 0.06 || bu < 0.03 ? -12 : 0;
        const straw = ((x * 131 + y * 71) % 53) === 0 ? 20 : 0;
        put(d, (y * S + x) * 4, 150 + n * 34 + mortar + straw, 128 + n * 28 + mortar + straw, 98 + n * 20 + mortar);
      }
    });
  }),
  mudPlaster: () => cached('mudPlaster', () => {
    const f = makeFbm(105, 4, 6), f2 = makeFbm(107, 16, 3);
    return canvasTex(256, (d, S) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const n = f(u, v), m = f2(u, v);
        const crack = Math.abs(m - 0.5) < 0.008 ? -26 : 0;
        const straw = ((x * 131 + y * 71) % 61) === 0 ? 18 : 0;
        const stain = Math.max(0, 0.25 - v) * 60; // rain-darkened base? (v=0 top in canvas)
        const c = 146 + n * 42 + crack + straw;
        put(d, (y * S + x) * 4, c + 6, c - 12, c - 38 - stain * 0);
      }
    });
  }),
  thatch: () => cached('thatch', () => {
    const rng = new Rng(111);
    return canvasTex(256, (d, S, ctx) => {
      for (let i = 0; i < d.length; i += 4) put(d, i, 120, 98, 58);
      ctx.putImageData(new ImageData(d, S, S), 0, 0);
      for (let i = 0; i < 2600; i++) {
        const x = rng.range(0, S), y = rng.range(-20, S);
        const l = rng.range(18, 44);
        const c = rng.range(0.6, 1.25);
        ctx.strokeStyle = `rgb(${170 * c | 0},${140 * c | 0},${82 * c | 0})`;
        ctx.lineWidth = rng.range(0.6, 1.8);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng.range(-3, 3), y + l); ctx.stroke();
      }
      const id = ctx.getImageData(0, 0, S, S);
      d.set(id.data);
    });
  }),
  roofTile: () => cached('roofTile', () => {
    const f = makeFbm(121, 4, 4);
    return canvasTex(256, (d, S) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const n = f(u, v);
        // tube tiles running along v; overlapping courses along u
        const cu = (u * 16) % 1;
        const tube = Math.pow(Math.sin(cu * Math.PI), 0.6);
        const course = (v * 20) % 1;
        const lip = course > 0.9 ? -24 : course < 0.08 ? 14 : 0;
        const c = 58 + tube * 42 + n * 18 + lip;
        put(d, (y * S + x) * 4, c, c + 2, c + 8);
      }
    });
  }),
  wood: () => cached('wood', () => {
    const f = makeFbm(131, 4, 5);
    return canvasTex(256, (d, S) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const n = f(u * 0.5, v * 4);
        const grain = Math.sin((u * 40 + n * 6)) * 10;
        put(d, (y * S + x) * 4, 108 + grain + n * 30, 70 + grain * 0.8 + n * 20, 42 + grain * 0.5 + n * 10);
      }
    });
  }),
  lacquer: () => cached('lacquer', () => colorField(141, 128, (a, b) => [128 + a * 30, 30 + a * 10, 24 + b * 8])),
  cloth: () => cached('cloth', () => {
    const f = makeFbm(151, 16, 3);
    return canvasTex(128, (d, S) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const weave = ((x % 2) ^ (y % 2)) ? 8 : -8;
        const n = f(x / S, y / S);
        const c = 200 + weave + n * 40;
        put(d, (y * S + x) * 4, c, c, c);
      }
    });
  }),
  lamellar: () => cached('lamellar', () => {
    return canvasTex(128, (d, S) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const row = Math.floor(y / 16);
        const px = (x + (row % 2) * 4) % 8;
        const py = y % 16;
        const edge = px === 0 || py === 0 ? -60 : 0;
        const lace = py > 12 && px > 2 && px < 6 ? 1 : 0;
        const shade = 150 - py * 3 + edge;
        if (lace) put(d, (y * S + x) * 4, 150, 40, 30);
        else put(d, (y * S + x) * 4, shade, shade - 4, shade - 10);
      }
    }, { srgb: true });
  }),
  stone: () => cached('stone', () => {
    const f = makeFbm(161, 8, 5);
    return canvasTex(256, (d, S) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const n = f(u, v);
        const row = Math.floor(v * 6);
        const bu = (u * 4 + (row % 2) * 0.5) % 1;
        const joint = (v * 6) % 1 < 0.04 || bu < 0.025 ? -40 : 0;
        const c = 120 + n * 50 + joint;
        put(d, (y * S + x) * 4, c, c - 2, c - 8);
      }
    });
  }),
  // Leaf cluster card with alpha, tinted per species via material color.
  leaves: (kind = 'broad') => cached('leaves_' + kind, () => {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const rng = new Rng(kind.length * 977 + 3);
    ctx.clearRect(0, 0, S, S);
    const n = kind === 'needle' ? 520 : kind === 'blossom' ? 0 : kind === 'willow' ? 340 : 220;
    if (kind === 'blossom') {
      // Peach sprays: dark twigs with five-petalled flowers clustered along them and a few young leaves.
      const twigs = [];
      for (let i = 0; i < 9; i++) {
        const a0 = rng.range(0, Math.PI * 2), L = rng.range(60, 110);
        const x0 = S / 2 + Math.cos(a0) * rng.range(0, 30), y0 = S / 2 + Math.sin(a0) * rng.range(0, 30);
        const a1 = a0 + rng.range(-0.5, 0.5);
        const x1 = x0 + Math.cos(a1) * L, y1 = y0 + Math.sin(a1) * L;
        ctx.strokeStyle = `rgb(${58 + rng.range(-8, 8) | 0},${34 | 0},${30 | 0})`; ctx.lineWidth = rng.range(1.4, 2.4); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + rng.range(-10, 10), (y0 + y1) / 2 + rng.range(-10, 10), x1, y1); ctx.stroke();
        twigs.push([x0, y0, x1, y1]);
      }
      for (let i = 0; i < 40; i++) {
        const [x0, y0, x1, y1] = twigs[i % twigs.length], u = rng.next();
        ctx.save(); ctx.translate(x0 + (x1 - x0) * u + rng.range(-6, 6), y0 + (y1 - y0) * u + rng.range(-6, 6)); ctx.rotate(rng.range(0, Math.PI * 2));
        ctx.fillStyle = `rgb(${92 + rng.range(-10, 15) | 0},${124 + rng.range(-10, 20) | 0},${58 | 0})`;
        ctx.beginPath(); ctx.ellipse(5, 0, 6, 2.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      for (let i = 0; i < 230; i++) {
        const [x0, y0, x1, y1] = twigs[i % twigs.length], u = Math.pow(rng.next(), 0.8);
        const x = x0 + (x1 - x0) * u + rng.range(-7, 7), y = y0 + (y1 - y0) * u + rng.range(-7, 7);
        const R = rng.range(2.6, 4.6), sh = rng.range(0.8, 1.05), rot = rng.range(0, 7);
        const deep = rng.next() < 0.3;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        for (let k = 0; k < 5; k++) {
          ctx.rotate(Math.PI * 2 / 5);
          const gr = ctx.createRadialGradient(0, -R * 0.6, 0, 0, -R * 0.6, R * 0.75);
          gr.addColorStop(0, deep ? `rgb(${238 * sh | 0},${120 * sh | 0},${150 * sh | 0})` : `rgb(${250 * sh | 0},${196 * sh | 0},${208 * sh | 0})`);
          gr.addColorStop(1, deep ? `rgb(${214 * sh | 0},${92 * sh | 0},${124 * sh | 0})` : `rgb(${240 * sh | 0},${160 * sh | 0},${182 * sh | 0})`);
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.ellipse(0, -R * 0.62, R * 0.52, R * 0.66, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = 'rgb(160,50,70)'; ctx.beginPath(); ctx.arc(0, 0, R * 0.28, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgb(240,210,120)'; for (let k = 0; k < 4; k++) { ctx.fillRect(Math.cos(k * 1.7) * R * 0.3, Math.sin(k * 1.7) * R * 0.3, 1, 1); }
        ctx.restore();
      }
    }
    for (let i = 0; i < n; i++) {
      const ang = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * S * 0.44;
      const x = S / 2 + Math.cos(ang) * r, y = S / 2 + Math.sin(ang) * r * (kind === 'willow' ? 1.0 : 0.85);
      const shade = rng.range(0.55, 1.15);
      ctx.save();
      ctx.translate(x, y);
      if (kind === 'needle') {
        ctx.rotate(rng.range(0, Math.PI * 2));
        ctx.strokeStyle = `rgb(${60 * shade | 0},${96 * shade | 0},${52 * shade | 0})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(rng.range(8, 16), 0); ctx.stroke();
      } else if (kind === 'willow') {
        ctx.rotate(Math.PI / 2 + rng.range(-0.3, 0.3));
        ctx.fillStyle = `rgb(${110 * shade | 0},${150 * shade | 0},${66 * shade | 0})`;
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      } else if (kind === 'blossom') {
        const pink = rng.next() < 0.72;
        ctx.fillStyle = pink
          ? `rgb(${240 * Math.min(1, shade + 0.1) | 0},${150 * shade | 0},${170 * shade | 0})`
          : `rgb(${96 * shade | 0},${128 * shade | 0},${60 * shade | 0})`;
        ctx.beginPath(); ctx.arc(0, 0, rng.range(3, 6), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.rotate(rng.range(0, Math.PI * 2));
        ctx.fillStyle = `rgb(${100 * shade | 0},${136 * shade | 0},${64 * shade | 0})`;
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(40,60,20,0.5)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
      }
      ctx.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }),
};

// Face texture for a character's head (drawn on the front of a sphere via UV).
export function faceTexture(opts = {}) {
  const key = 'face_' + JSON.stringify(opts);
  return cached(key, () => {
    const W = 256, H = 128;
    const c = document.createElement('canvas');
    c.width = W * 2; c.height = H * 2;
    const g = c.getContext('2d');
    g.scale(2, 2);
    const skin = opts.skin || '#d9a877';
    g.fillStyle = skin; g.fillRect(0, 0, W, H);
    // subtle shading noise
    const rng = new Rng(opts.seed || 5);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(${rng.next() < 0.5 ? '120,70,40' : '255,220,190'},0.04)`;
      g.beginPath(); g.arc(rng.range(0, W), rng.range(0, H), rng.range(2, 8), 0, 7); g.fill();
    }
    // Sphere UV: u=0.75 is +Z front for three.js SphereGeometry? we place features at u=0.25*W (rotated in mesh)
    const cx = W * 0.25, cy = H * 0.5;
    const s = opts.fierce ? 1.25 : 1;
    // soft modelling: eye sockets, jaw and temples darker, forehead/nose bridge lighter
    const shadeBlob = (x, y, rx, ry, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y); g.fillStyle = gr; g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, 7); g.fill(); g.restore(); };
    shadeBlob(W * 0.25 - 11, H * 0.5 - 4, 10, 6, 'rgba(70,35,20,0.22)');
    shadeBlob(W * 0.25 + 11, H * 0.5 - 4, 10, 6, 'rgba(70,35,20,0.22)');
    shadeBlob(W * 0.25, H * 0.5 - 20, 26, 10, 'rgba(255,230,200,0.12)');
    shadeBlob(W * 0.25, H * 0.5 + 34, 30, 12, 'rgba(60,30,15,0.18)');
    shadeBlob(W * 0.25 - 34, H * 0.5 + 6, 10, 26, 'rgba(60,30,15,0.16)');
    shadeBlob(W * 0.25 + 34, H * 0.5 + 6, 10, 26, 'rgba(60,30,15,0.16)');
    // cheeks
    if (opts.redFace) { g.fillStyle = 'rgba(150,30,20,0.85)'; g.fillRect(0, 0, W, H); }
    shadeBlob(cx - 18, cy + 9, 9, 6, opts.female ? 'rgba(210,100,90,0.16)' : 'rgba(190,90,70,0.08)');
    shadeBlob(cx + 18, cy + 9, 9, 6, opts.female ? 'rgba(210,100,90,0.16)' : 'rgba(190,90,70,0.08)');
    // eyes: almond shape with a heavier upper lid (epicanthic fold), brown iris, catch-light
    const ey = cy - 4;
    for (const dx of [-11, 11]) {
      const ex = cx + dx, sd = Math.sign(dx), ew = 5.4 * s, eh = opts.fierce ? 3.4 : 2.3;
      shadeBlob(ex, ey - 2.5, 7.5, 3.5, 'rgba(90,45,25,0.18)');
      g.save();
      g.beginPath();
      g.moveTo(ex - ew, ey + (sd < 0 ? 0.4 : -0.4));
      g.quadraticCurveTo(ex - ew * 0.2, ey - eh * 1.25, ex + ew, ey + (sd < 0 ? -0.6 : 0.6) - (opts.fierce ? 0 : 0.3) * sd);
      g.quadraticCurveTo(ex + ew * 0.1, ey + eh * 0.95, ex - ew, ey + (sd < 0 ? 0.4 : -0.4));
      g.closePath();
      g.fillStyle = '#ece2d2'; g.fill();
      g.clip();
      const ir = g.createRadialGradient(ex, ey - 0.2, 0, ex, ey - 0.2, opts.fierce ? 2.9 : 2.4);
      ir.addColorStop(0, '#0c0806'); ir.addColorStop(0.45, '#1c120b'); ir.addColorStop(0.8, '#3e2816'); ir.addColorStop(1, '#23160e');
      g.fillStyle = ir; g.beginPath(); g.arc(ex, ey - 0.2, opts.fierce ? 2.9 : 2.4, 0, 7); g.fill();
      g.fillStyle = 'rgba(40,20,10,0.35)'; g.fillRect(ex - ew, ey - eh * 1.3, ew * 2, 1.1); // lid shadow on the eyeball
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(ex - 0.8, ey - 1.1, 0.55, 0, 7); g.fill();
      // upper lid line + crease, faint lower lid
      g.strokeStyle = 'rgba(28,14,8,0.95)'; g.lineWidth = 1.3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ex - ew, ey + (sd < 0 ? 0.4 : -0.4)); g.quadraticCurveTo(ex - ew * 0.2, ey - eh * 1.25, ex + ew, ey + (sd < 0 ? -0.6 : 0.6)); g.stroke();
      g.strokeStyle = 'rgba(110,60,35,0.35)'; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(ex - ew * 0.7, ey + eh * 0.9 - 0.3); g.quadraticCurveTo(ex, ey + eh * 1.05, ex + ew * 0.8, ey + eh * 0.5); g.stroke();
      if (opts.wrinkles) { g.beginPath(); g.moveTo(ex + sd * ew, ey + 0.5); g.lineTo(ex + sd * (ew + 3), ey - 1); g.moveTo(ex + sd * ew, ey + 1.5); g.lineTo(ex + sd * (ew + 3), ey + 2.5); g.stroke(); }
    }
    // brows: tapered strokes
    const tilt = opts.fierce ? 3 : opts.stern ? 1.5 : 0;
    for (const dx of [-11, 11]) {
      const sd = Math.sign(dx), x0 = cx + dx - 6.5 * sd, x1 = cx + dx + 6.5 * sd, y0 = ey - 6.2 + (opts.female ? -0.6 : 0);
      g.fillStyle = opts.hair || '#1b1410';
      const th = (opts.fierce ? 2.4 : opts.female ? 1.0 : 1.7);
      g.beginPath(); g.moveTo(x0, y0 + th * 0.5); g.quadraticCurveTo((x0 + x1) / 2, y0 - th - 0.8 - tilt * 0.5, x1, y0 - tilt + 0.6);
      g.quadraticCurveTo((x0 + x1) / 2, y0 - 0.4 - tilt * 0.5, x0, y0 + th * 0.5 + th); g.fill();
    }
    // nose: bridge light, side shadow, nostrils
    shadeBlob(cx, ey + 6, 2.2, 8, 'rgba(255,225,195,0.18)');
    shadeBlob(cx + 3.5, cy + 8, 3, 6, 'rgba(90,45,25,0.18)');
    g.fillStyle = 'rgba(70,32,20,0.55)';
    g.beginPath(); g.ellipse(cx - 2.6, cy + 12.4, 1.4, 0.8, 0.3, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx + 2.6, cy + 12.4, 1.4, 0.8, -0.3, 0, 7); g.fill();
    g.strokeStyle = 'rgba(90,45,28,0.4)'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(cx - 4.6, cy + 11); g.quadraticCurveTo(cx - 5.2, cy + 13.5, cx - 3, cy + 13.6); g.stroke();
    g.beginPath(); g.moveTo(cx + 4.6, cy + 11); g.quadraticCurveTo(cx + 5.2, cy + 13.5, cx + 3, cy + 13.6); g.stroke();
    // philtrum + lips
    shadeBlob(cx, cy + 17, 2, 3, 'rgba(90,45,25,0.15)');
    const lip = opts.redFace ? '#5a1810' : opts.female ? '#b0504a' : '#9a5a48';
    const my = cy + 21, mw = opts.female ? 5.2 : 6.2, sm = opts.smile ? 1.4 : 0;
    g.fillStyle = lip;
    g.beginPath(); g.moveTo(cx - mw, my - sm * 0.5); g.quadraticCurveTo(cx - mw * 0.4, my - 2.2, cx, my - 1.4); g.quadraticCurveTo(cx + mw * 0.4, my - 2.2, cx + mw, my - sm * 0.5);
    g.quadraticCurveTo(cx, my + 0.3 + sm, cx - mw, my - sm * 0.5); g.fill();
    g.globalAlpha = 0.8;
    g.beginPath(); g.moveTo(cx - mw * 0.85, my); g.quadraticCurveTo(cx, my + 3.4 + sm, cx + mw * 0.85, my); g.quadraticCurveTo(cx, my + 0.8 + sm, cx - mw * 0.85, my); g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(50,20,12,0.85)'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(cx - mw, my - sm * 0.5); g.quadraticCurveTo(cx, my + 0.8 + sm, cx + mw, my - sm * 0.5); g.stroke();
    shadeBlob(cx, my + 6, 5, 2.2, 'rgba(90,45,25,0.16)');
    // moustache / stubble
    if (opts.moustache) {
      g.fillStyle = opts.hair || '#1b1410';
      g.beginPath(); g.moveTo(cx - 12, cy + 22); g.quadraticCurveTo(cx, cy + 14, cx + 12, cy + 22);
      g.quadraticCurveTo(cx, cy + 18, cx - 12, cy + 22); g.fill();
    }
    if (opts.stubble) {
      g.fillStyle = 'rgba(30,20,15,0.35)';
      g.beginPath(); g.ellipse(cx, cy + 26, 20, 12, 0, 0, Math.PI); g.fill();
    }
    if (opts.wrinkles) {
      g.strokeStyle = 'rgba(90,50,30,0.4)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx - 14, ey - 13); g.lineTo(cx + 14, ey - 13); g.stroke();
      g.beginPath(); g.moveTo(cx - 12, cy + 14); g.lineTo(cx - 9, cy + 22); g.stroke();
      g.beginPath(); g.moveTo(cx + 12, cy + 14); g.lineTo(cx + 9, cy + 22); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// Banner texture with a large Chinese character (e.g. 漢, 劉, 黃天).
export function bannerTexture(text, bg = '#9a1e14', fg = '#f2e2b0', border = '#e8c860') {
  return cached('banner_' + text + bg, () => {
    const W = 128, H = 256;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(6, 6, W - 12, H - 12);
    g.fillStyle = fg;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const chars = [...text];
    const fs = chars.length > 1 ? Math.min(90, 200 / chars.length) : 96;
    g.font = `${fs}px "Ma Shan Zheng", "WenQuanYi Zen Hei", serif`;
    chars.forEach((ch, i) => g.fillText(ch, W / 2, H / 2 + (i - (chars.length - 1) / 2) * fs * 1.05));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function signTexture(text, bg = '#2b1a10', fg = '#e8d29a') {
  return cached('sign_' + text, () => {
    const chars = [...text];
    const W = 64, H = 64 * chars.length + 16;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#8a6a3a'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '48px "Ma Shan Zheng", "WenQuanYi Zen Hei", serif';
    chars.forEach((ch, i) => g.fillText(ch, W / 2, 8 + 32 + i * 64));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
