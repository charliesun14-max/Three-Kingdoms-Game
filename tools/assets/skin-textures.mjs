// Prepare character skin atlases: remove (or thin to stubble) a painted beard shadow on the face,
// and normalise the skin to a neutral light tone so the game can tint it per character
// (material colour = character skin / NEUTRAL). Writes PNGs to assets-src/.build/char/.
//   node tools/assets/skin-textures.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'assets-src/downloaded/Modular_Character_Male_Integrated_to_UE4_ALS-0cc54b6f/fbx/modular-character-male-i_extracted/textures/';
const OUT = 'assets-src/.build/char/';
export const NEUTRAL = [226, 188, 158];
const S = 2048;
mkdirSync(OUT, { recursive: true });

const { data } = await sharp(SRC + 'T_M_Skin_BaseColor.jpg').resize(S, S).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const N = S * S;
const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), L = new Float32Array(N);
for (let i = 0; i < N; i++) { R[i] = data[i * 3]; G[i] = data[i * 3 + 1]; B[i] = data[i * 3 + 2]; L[i] = 0.3 * R[i] + 0.59 * G[i] + 0.11 * B[i]; }
const idx = (x, y) => y * S + x;
const px = (f) => Math.round(f * S);

// separable box blur, applied three times ~ gaussian
function blur(src, r) {
  let a = Float32Array.from(src), b = new Float32Array(N);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < S; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += a[idx(Math.min(S - 1, Math.max(0, x)), y)];
      for (let x = 0; x < S; x++) { b[idx(x, y)] = acc / (2 * r + 1); acc += a[idx(Math.min(S - 1, x + r + 1), y)] - a[idx(Math.max(0, x - r), y)]; } }
    for (let x = 0; x < S; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += b[idx(x, Math.min(S - 1, Math.max(0, y)))];
      for (let y = 0; y < S; y++) { a[idx(x, y)] = acc / (2 * r + 1); acc += b[idx(x, Math.min(S - 1, y + r + 1))] - b[idx(x, Math.max(0, y - r))]; } }
  }
  return a;
}

// skin reference: 75th percentile of luminance in the upper face (forehead, cheeks above the beard)
const ref = (() => {
  const xs = [];
  for (let y = px(0.04); y < px(0.12); y += 2) for (let x = px(0.26); x < px(0.48); x += 2) xs.push(idx(x, y));
  xs.sort((a, b) => L[a] - L[b]);
  const k = xs[Math.floor(xs.length * 0.75)];
  return [R[k], G[k], B[k], L[k]];
})();

// beard zone: below the eye line on the face tile; mask = clearly darker than skin
const M = new Float32Array(N);
for (let y = px(0.115); y < px(0.29); y++) for (let x = px(0.2); x < px(0.55); x++) {
  const t = (ref[3] * 0.84 - L[idx(x, y)]) / (ref[3] * 0.12);
  M[idx(x, y)] = Math.max(0, Math.min(1, t));
}
const Mg = blur(M, 4).map((v) => Math.min(1, v * 1.8));
// fill: normalised convolution of the unmasked skin
const inv = Mg.map((v) => 1 - v);
const nr = blur(R.map((v, i) => v * inv[i]), 28), ng = blur(G.map((v, i) => v * inv[i]), 28), nb = blur(B.map((v, i) => v * inv[i]), 28), d = blur(inv, 28);
const hp = (() => { const lb = blur(L, 2); return L.map((v, i) => v - lb[i]); })();

function make(amount) {
  const out = Buffer.alloc(N * 3);
  const k = NEUTRAL.map((v, c) => v / Math.max(1, ref[c]));
  for (let i = 0; i < N; i++) {
    const m = Mg[i] * amount, dv = Math.max(d[i], 1e-3);
    const det = hp[i] * 0.45;
    const r = R[i] * (1 - m) + (nr[i] / dv + det) * m, g = G[i] * (1 - m) + (ng[i] / dv + det) * m, b = B[i] * (1 - m) + (nb[i] / dv + det) * m;
    out[i * 3] = Math.max(0, Math.min(255, r * k[0]));
    out[i * 3 + 1] = Math.max(0, Math.min(255, g * k[1]));
    out[i * 3 + 2] = Math.max(0, Math.min(255, b * k[2]));
  }
  return out;
}
await sharp(make(1), { raw: { width: S, height: S, channels: 3 } }).png().toFile(OUT + 'skin_male_clean.png');
await sharp(make(0.6), { raw: { width: S, height: S, channels: 3 } }).png().toFile(OUT + 'skin_male_stubble.png');
// Unreal normal maps are DirectX-style (green = down); glTF wants OpenGL-style, so flip green
{
  const nm = await sharp(SRC + 'T_M_Skin_Normal.png').resize(S, S).removeAlpha().raw().toBuffer();
  for (let i = 1; i < nm.length; i += 3) nm[i] = 255 - nm[i];
  await sharp(nm, { raw: { width: S, height: S, channels: 3 } }).png().toFile(OUT + 'skin_male_normal.png');
}
const rough = await sharp(SRC + 'Skin_Roughness.png').resize(1024, 1024).greyscale().raw().toBuffer();
const orm = Buffer.alloc(1024 * 1024 * 3);
for (let i = 0; i < 1024 * 1024; i++) { orm[i * 3] = 255; orm[i * 3 + 1] = rough[i]; orm[i * 3 + 2] = 0; }
await sharp(orm, { raw: { width: 1024, height: 1024, channels: 3 } }).png().toFile(OUT + 'skin_male_orm.png');
console.log('skin ref', ref.map(Math.round), 'neutral', NEUTRAL);

// ---- female head atlas (Mixamo pack): natural lips, dark brown irises, black hair, neutral skin
{
  const F = 'assets-src/.build/char/Female_3_Body_diffuse.png';
  const { data: fd, info } = await sharp(F).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, n = W * H;
  const lum = (i) => 0.3 * fd[i * 3] + 0.59 * fd[i * 3 + 1] + 0.11 * fd[i * 3 + 2];
  // skin reference from the forehead/cheeks of the face tile
  const s = [];
  for (let y = Math.round(H * 0.12); y < Math.round(H * 0.2); y++) for (let x = Math.round(W * 0.1); x < Math.round(W * 0.4); x++) s.push(y * W + x);
  s.sort((a, b) => lum(a) - lum(b));
  const k = s[Math.floor(s.length * 0.6)];
  const ref = [fd[k * 3], fd[k * 3 + 1], fd[k * 3 + 2]];
  const out = Buffer.alloc(n * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let r = fd[i * 3], g = fd[i * 3 + 1], b = fd[i * 3 + 2];
    const u = x / W, v = y / H, l = 0.3 * r + 0.59 * g + 0.11 * b;
    // lips: strongly red pixels on the face tile -> muted rose
    if (u < 0.5 && v < 0.4 && r > 110 && r > g * 1.7 && r > b * 1.5) { const t = 0.75; r = r * (1 - t) + l * 1.32 * t; g = g * (1 - t) + l * 0.86 * t; b = b * (1 - t) + l * 0.74 * t; }
    // irises: green -> dark brown (eye tiles in the top-middle of the atlas)
    else if (u > 0.49 && u < 0.61 && v < 0.21 && g > r * 1.02) { r = l * 0.78; g = l * 0.52; b = l * 0.36; }
    // painted hair on the scalp: deepen towards black
    else if (u < 0.5 && v < 0.27 && l < 0.55 * (0.3 * ref[0] + 0.59 * ref[1] + 0.11 * ref[2])) { r *= 0.5; g *= 0.48; b *= 0.46; }
    // neutral skin tone (everything else)
    else { r *= NEUTRAL[0] / ref[0]; g *= NEUTRAL[1] / ref[1]; b *= NEUTRAL[2] / ref[2]; }
    out[i * 3] = Math.min(255, Math.max(0, r)); out[i * 3 + 1] = Math.min(255, Math.max(0, g)); out[i * 3 + 2] = Math.min(255, Math.max(0, b));
  }
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toFile(OUT + 'skin_female.png');
  const spec = await sharp('assets-src/.build/char/Female_3_Body_specular.png').resize(W, H).greyscale().raw().toBuffer();
  const orm = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) { orm[i * 3] = 255; orm[i * 3 + 1] = 255 - spec[i] * 0.6; orm[i * 3 + 2] = 0; }
  await sharp(orm, { raw: { width: W, height: H, channels: 3 } }).png().toFile(OUT + 'skin_female_orm.png');
  console.log('female skin ref', ref);
}
