// Tileable high-resolution ground and wall surfaces for the terrain and buildings, from the downloaded scans.
//   node tools/assets/terrain-textures.mjs
// Writes WebP maps to public/assets/textures/. Megascans/Poly Haven surfaces are already seamless and are only
// converted; the gravel is cut from the middle of the trench ground patch (a 3D asset, not a tile) and made
// seamless by cross-fading it with a half-offset copy of itself toward its borders.
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DL = 'assets-src/downloaded';
const OUT = 'public/assets/textures';
const VILLAGE = `${DL}/Mountain_Surrounded_Village_Environment-62667742/fbx/fbx_mega_village_environ_extracted/FBX Mega Village Environment 4 Houses/Textures`;
const TRENCH = `${DL}/Military_Trenches_Ground_Patch_Rock_S_03-4906428e/fbx/mid/military_trenches_ground_extracted/Military_Trenches_Ground_Patch_Rock_S_03_ydzkbhu_Mid_2K_`;
mkdirSync(OUT, { recursive: true });

async function raw(file, size, crop) {
  let img = sharp(file);
  if (crop) img = img.extract(crop);
  return img.resize(size, size, { fit: 'fill' }).removeAlpha().raw().toBuffer();
}

// Blend an image with itself rolled by half its size: the rolled copy is used near the borders (where the
// original would show a seam once tiled) and the original in the middle (where the rolled copy has its seam).
function seamless(px, S, feather = 0.22) {
  const out = Buffer.alloc(px.length);
  const f = Math.floor(S * feather);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    const w = d >= f ? 0 : 1 - d / f; // weight of the rolled copy
    const s = w * w * (3 - 2 * w);
    const i = (y * S + x) * 3, j = (((y + S / 2) % S) * S + ((x + S / 2) % S)) * 3;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(px[i + c] * (1 - s) + px[j + c] * s);
  }
  return out;
}

async function save(px, S, name, q) {
  await sharp(px, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: q }).toFile(join(OUT, name));
  console.log(`✓ textures/${name}`);
}

async function convert(src, name, size, q, channel) {
  if (!existsSync(src)) return console.warn(`! ${src} missing`);
  if (channel === undefined) await sharp(src).resize(size, size, { fit: 'fill' }).removeAlpha().webp({ quality: q }).toFile(join(OUT, name));
  else {
    // one channel of a packed map (e.g. roughness in G) as a greyscale image
    const { data, info } = await sharp(src).resize(size, size, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const g = Buffer.alloc(size * size);
    const c = Math.min(channel, info.channels - 1);
    for (let i = 0; i < g.length; i++) g[i] = data[i * info.channels + c];
    await sharp(g, { raw: { width: size, height: size, channels: 1 } }).webp({ quality: q }).toFile(join(OUT, name));
  }
  console.log(`✓ textures/${name}`);
}

// gravel and pebbles: the inner 1100 px of the 2K trench patch, made tileable
{
  const S = 1024, crop = { left: 474, top: 474, width: 1100, height: 1100 };
  for (const [map, name, q] of [['BaseColor.jpg', 'gravel_color.webp', 90], ['Normal.jpg', 'gravel_normal.webp', 92], ['Roughness.jpg', 'gravel_rough.webp', 85]]) {
    if (!existsSync(TRENCH + map)) { console.warn(`! ${TRENCH + map} missing`); continue; }
    await save(seamless(await raw(TRENCH + map, S, crop), S), S, name, q);
  }
}
// mossy rock for cliffs and steep slopes (Megascans surface, glTF metallic-roughness: G = roughness)
await convert(`${VILLAGE}/MI_Mossy_Stone_Wall_ujyjbehqx_2K_BaseColor.PNG`, 'rock_color.webp', 1024, 90);
await convert(`${VILLAGE}/MI_Mossy_Stone_Wall_ujyjbehqx_2K_Normal.PNG`, 'rock_normal.webp', 1024, 92);
await convert(`${VILLAGE}/MI_Mossy_Stone_Wall_ujyjbehqx_2K_MetallicRoughness.PNG`, 'rock_rough.webp', 1024, 85, 1);
// meadow soil (mud with clover and leaves) roughness, to go with forest_floor_color/normal
await convert(`${VILLAGE}/brown_mud_leaves_01_MetallicRoughness.PNG`, 'forest_floor_rough.webp', 1024, 85, 1);
// walls: weathered stone blocks with earth joints (footings, gate piers, rammed-earth town walls)
await convert(`${VILLAGE}/MI_Ancient_Temple_Wall_temjbivr_2K_BaseColor.PNG`, 'wall_stone_color.webp', 1024, 90);
await convert(`${VILLAGE}/MI_Ancient_Temple_Wall_temjbivr_2K_Normal.PNG`, 'wall_stone_normal.webp', 1024, 92);
await convert(`${VILLAGE}/MI_Dirty_Stone_Wall_wmqjcfsg_2K_BaseColor.PNG`, 'brick_color.webp', 1024, 90);
await convert(`${VILLAGE}/MI_Dirty_Stone_Wall_wmqjcfsg_2K_Normal.PNG`, 'brick_normal.webp', 1024, 92);
// worn timber planks
await convert(`${VILLAGE}/M_Wood_Floor_Walnut_Worn_BaseColor.PNG`, 'planks_color.webp', 1024, 90);
await convert(`${VILLAGE}/T_Wood_Floor_Walnut_N.PNG`, 'planks_normal.webp', 1024, 92);
