// Export every region of the game in a form Unreal Engine 5 can import:
//   node tools/unreal/export-world.mjs [regionId ...]   (or double-click Export-Unreal-Windows.bat / Export-Unreal-Mac.command)
// For each region, unreal-export/<region>/ receives:
//   heightmap.png / heightmap.r16  16-bit landscape heightmap, resampled to a valid Landscape size
//   weight_<layer>.png             8-bit paint layers at the same resolution (grass, road, field, town, woods, wet, rock)
//   trees.csv, placements.csv      every tree, rock, building, scanned prop and named spot in Unreal coordinates
//   world.json                     the same data plus the region definition, river and road polylines
//   IMPORT.txt                     the exact Landscape import settings (location, scale, size)
// Coordinates: the game is metres, Y up, right-handed; Unreal is centimetres, Z up, left-handed.
//   UE.X = x*100, UE.Y = z*100, UE.Z = y*100; UE yaw (degrees) = 90 - game yaw (degrees).
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import zlib from 'zlib';

const OUT = 'unreal-export';
const WIN = process.platform === 'win32';
const port = 5100 + Math.floor(Math.random() * 800);
const snap = `node_modules/.ue-export-${port}`;
console.log('Building the game (about a minute)…');
spawnSync('npx', ['vite', 'build', '--outDir', snap, '--emptyOutDir'], { stdio: 'ignore', shell: WIN });
const server = spawn('npx', ['vite', 'preview', '--outDir', snap, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: !WIN, shell: WIN });
// stop the whole npx > vite process tree, then drop the snapshot
process.on('exit', () => {
  try { if (WIN) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); else process.kill(-server.pid); } catch {}
  try { fs.rmSync(snap, { recursive: true, force: true }); } catch {}
});
await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); }); setTimeout(res, 10000); });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${port}/?play&q=3&msaa=0`);
console.log('Loading the game in a hidden browser (a few minutes)…');
await page.waitForFunction(() => window.__game && window.__game.ready && window.__game.state === 'play', null, { timeout: 900000, polling: 1000 });
await page.evaluate(() => { const g = window.__game; g.params.set('frames', String(g.frames + 1)); });
const regions = process.argv.slice(2).length ? process.argv.slice(2) : ['zhuo', 'guangzong', 'hulao', 'xuzhou', 'chibi', 'xuchang'];

// ---- 16-bit greyscale PNG writer (no dependencies) ----------------------------------------------
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, bits, rowBytes, get) {
  const raw = Buffer.alloc((rowBytes + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (rowBytes + 1)] = 0; get(y, raw, y * (rowBytes + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = bits; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Landscape sizes Unreal accepts without padding (vertices per side)
const SIZES = [127, 253, 505, 1009, 2017, 4033, 8129];
const bilinear = (src, N, u, v) => {
  const x = Math.min(N - 1.0001, Math.max(0, u)), y = Math.min(N - 1.0001, Math.max(0, v));
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const a = src[j * N + i], b = src[j * N + i + 1], c = src[(j + 1) * N + i], d = src[(j + 1) * N + i + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
};
const ue = (x, y, z) => [+(x * 100).toFixed(1), +(z * 100).toFixed(1), +(y * 100).toFixed(1)];
const ueYaw = (r) => +(90 - (r * 180) / Math.PI).toFixed(2);

for (const id of regions) {
  console.log(`region ${id}…`);
  const data = await page.evaluate(async (id) => {
    const g = window.__game;
    if (g.regionId !== id) await g.loadRegion(id);
    const W = g.world, hf = W.hf, S = W.settlements, V = W.vegetation;
    const b64 = (arr) => { const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    const inst = [];
    for (const [k, list] of S.instances || []) { const [section, key] = k.split('|'); for (const it of list) inst.push({ section, key, x: it.x, y: it.y, z: it.z, yaw: it.yaw, s: it.s }); }
    const wet = hf.wetTexture().image.data;
    const wetR = new Uint8Array(hf.N * hf.N); for (let i = 0; i < wetR.length; i++) wetR[i] = wet[i * 4];
    return {
      region: JSON.parse(JSON.stringify(hf.region)), N: hf.N, cell: hf.cell, size: hf.size, maskRes: hf.maskRes,
      H: b64(hf.H), mask: b64(hf.mask), wet: b64(wetR),
      river: hf.riverPts || null, riverSurf: hf.riverSurfPts || null, roads: (hf.roads || []).map((r) => ({ w: r.w, pts: r.pts })),
      trees: V.trees.map((t) => ({ sp: t.sp, x: t.x, z: t.z, y: hf.getHeight(t.x, t.z), s: t.s, r: t.r || 0 })),
      rocks: V.rocks.map((r) => ({ kind: r.kind, prop: !!r.prop, x: r.x, z: r.z, y: hf.getHeight(r.x, r.z), s: r.s, r: r.r })),
      buildings: S.buildings.map((b) => ({ id: b.id || null, kind: b.kind, x: b.x, z: b.z, y: hf.getHeight(b.x, b.z), rot: b.rot, w: b.w, d: b.d, door: b.door })),
      spots: Object.fromEntries(Object.entries(S.spots).map(([k, v]) => [k, { ...v, y: hf.getHeight(v.x, v.z) }])), instances: inst,
    };
  }, id);
  const dir = `${OUT}/${id}`;
  fs.mkdirSync(dir, { recursive: true });
  const H = new Float32Array(Buffer.from(data.H, 'base64').buffer.slice(0));
  const N = data.N, size = data.size;
  const R = SIZES.find((s) => s >= N) || SIZES[SIZES.length - 1];
  let hmin = Infinity, hmax = -Infinity;
  for (const h of H) { hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
  const mid = (hmin + hmax) / 2, half = (hmax - hmin) / 2 + 1;
  const zscale = Math.ceil(((half * 100 * 128) / 32000) * 100) / 100; // Landscape Z scale: 1 unit = zscale/128 cm
  const toU16 = (h) => Math.max(0, Math.min(65535, Math.round(32768 + ((h - mid) * 100 * 128) / zscale)));
  const hs = new Uint16Array(R * R);
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) hs[j * R + i] = toU16(bilinear(H, N, (i / (R - 1)) * (N - 1), (j / (R - 1)) * (N - 1)));
  fs.writeFileSync(`${dir}/heightmap.r16`, Buffer.from(hs.buffer));
  fs.writeFileSync(`${dir}/heightmap.png`, png(R, R, 16, R * 2, (y, b, o) => { for (let x = 0; x < R; x++) b.writeUInt16BE(hs[y * R + x], o + x * 2); }));
  // paint layers
  const mask = new Uint8Array(Buffer.from(data.mask, 'base64')), M = data.maskRes;
  const wet = new Uint8Array(Buffer.from(data.wet, 'base64'));
  const maskAt = (u, v, ch) => { const i = Math.min(M - 1, Math.floor(u * M)), j = Math.min(M - 1, Math.floor(v * M)); return mask[(j * M + i) * 4 + ch] / 255; };
  const layers = { grass: new Uint8Array(R * R), road: new Uint8Array(R * R), field: new Uint8Array(R * R), town: new Uint8Array(R * R), woods: new Uint8Array(R * R), wet: new Uint8Array(R * R), rock: new Uint8Array(R * R) };
  const cellCm = (size * 100) / (R - 1);
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    const u = i / (R - 1), v = j / (R - 1), k = j * R + i;
    const hx = (hs[j * R + Math.min(R - 1, i + 1)] - hs[j * R + Math.max(0, i - 1)]) * zscale / 128 / (2 * cellCm);
    const hz = (hs[Math.min(R - 1, j + 1) * R + i] - hs[Math.max(0, j - 1) * R + i]) * zscale / 128 / (2 * cellCm);
    const slope = 1 - 1 / Math.sqrt(1 + hx * hx + hz * hz);
    const w = {
      road: maskAt(u, v, 0), field: maskAt(u, v, 1), town: maskAt(u, v, 2), woods: maskAt(u, v, 3),
      wet: bilinear(wet, N, u * (N - 1), v * (N - 1)) / 255, rock: Math.min(1, Math.max(0, (slope - 0.22) / 0.2)),
    };
    // weight-blended layers: later layers cover earlier ones, grass takes what is left
    let left = 1;
    for (const L of ['rock', 'road', 'wet', 'town', 'field', 'woods']) { const a = Math.min(left, w[L]); layers[L][k] = Math.round(a * 255); left -= a; }
    layers.grass[k] = Math.round(left * 255);
  }
  for (const [L, arr] of Object.entries(layers)) fs.writeFileSync(`${dir}/weight_${L}.png`, png(R, R, 8, R, (y, b, o) => { for (let x = 0; x < R; x++) b[o + x] = arr[y * R + x]; }));
  // placements in Unreal space
  const trees = data.trees.map((t) => ({ species: t.sp, loc: ue(t.x, t.y, t.z), yaw: ueYaw(t.r), scale: +t.s.toFixed(3) }));
  const place = [
    ...data.buildings.map((b) => ({ type: 'building', name: b.kind, id: b.id, loc: ue(b.x, b.y, b.z), yaw: ueYaw(b.rot), scale: 1, size: [b.w, b.d] })),
    ...data.rocks.map((r) => ({ type: r.prop ? 'scatter' : 'rock', name: String(r.kind), loc: ue(r.x, r.y, r.z), yaw: ueYaw(r.r), scale: +r.s.toFixed(3) })),
    ...data.instances.map((it) => ({ type: it.section, name: it.key, loc: ue(it.x, it.y, it.z), yaw: ueYaw(it.yaw), scale: +it.s.toFixed(3) })),
    ...Object.entries(data.spots).map(([k, s]) => ({ type: 'spot', name: k, loc: ue(s.x, s.y, s.z), yaw: ueYaw(s.rot || 0), scale: 1 })),
  ];
  // CSVs in Unreal DataTable layout (first column is the row name)
  const csv = (head, rows) => [['Name', ...head].join(','), ...rows.map((r, i) => [`R${i}`, ...r].join(','))].join('\n');
  fs.writeFileSync(`${dir}/trees.csv`, csv(['Species', 'X', 'Y', 'Z', 'Yaw', 'Scale'], trees.map((t) => [t.species, ...t.loc, t.yaw, t.scale])));
  fs.writeFileSync(`${dir}/placements.csv`, csv(['Type', 'Asset', 'X', 'Y', 'Z', 'Yaw', 'Scale'], place.map((p) => [p.type, p.name, ...p.loc, p.yaw, p.scale])));
  const landscape = { resolution: R, location: [-(size / 2) * 100, -(size / 2) * 100, +(mid * 100).toFixed(1)], scale: [+cellCm.toFixed(4), +cellCm.toFixed(4), zscale], heightRange: [hmin, hmax] };
  fs.writeFileSync(`${dir}/world.json`, JSON.stringify({ region: data.region, landscape, river: data.river && data.river.map((p, i) => ue(p[0], data.riverSurf[i], p[1])), roads: data.roads.map((r) => ({ width: r.w * 100, pts: r.pts.map((p) => ue(p[0], 0, p[1])) })), trees, placements: place }, null, 1));
  fs.writeFileSync(`${dir}/IMPORT.txt`, `Region ${id} (${data.region.name || id})
Landscape mode > New > Import from File: heightmap.png (or heightmap.r16)
  Resolution         ${R} x ${R}   (game grid ${N} x ${N} at ${data.cell} m, resampled)
  Location           X ${landscape.location[0]}  Y ${landscape.location[1]}  Z ${landscape.location[2]}
  Scale              X ${landscape.scale[0]}  Y ${landscape.scale[1]}  Z ${landscape.scale[2]}
  Height range       ${hmin.toFixed(2)} m .. ${hmax.toFixed(2)} m
Layers: add weight-blended paint layers grass, road, field, town, woods, wet, rock and import weight_<layer>.png into each.
Then run tools/unreal/import_world.py in the editor (Tools > Execute Python Script) for trees and placements.
`);
  console.log(`  ${R}x${R} landscape, ${trees.length} trees, ${place.length} placements -> ${dir}`);
}
await browser.close();
console.log(`\nDone. The files are in the "${OUT}" folder.`);
process.exit(0);
