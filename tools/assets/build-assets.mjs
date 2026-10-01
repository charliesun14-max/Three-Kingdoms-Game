// Builds the game's art assets from the raw downloads in assets-src/.
//   1. tools/assets/build-assets.sh runs Blender to turn FBX/.blend files into geometry-only GLBs
//      in assets-src/.build/ (see tools/blender/).
//   2. This script attaches the PBR textures to each GLB by material name, resizes them, encodes
//      them as WebP, compresses the geometry with Meshopt and writes public/assets/models/.
//   3. Tileable ground textures go to public/assets/textures/.
// Run: node tools/assets/build-assets.mjs   (or npm run assets:build)
import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, weld, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DL = 'assets-src/downloaded';
const RAW = 'assets-src/.build';
const OUT = 'public/assets';
const VILLAGE = `${DL}/Mountain_Surrounded_Village_Environment-62667742/fbx/fbx_mega_village_environ_extracted/FBX Mega Village Environment 4 Houses/Textures`;
const POT = `${DL}/Ancient_Stone_Pot_PBR_UVW_8K-a3b0e90c/fbx/ancient-stone-pot-pbruvw_extracted/textures/Ancient_Pot_Unwrapped_Material__25_`;
const LAMP = `${DL}/China_lantern-25e905a6/fbx/chinalamp_extracted/ChinaLamp_Material_`;
const TRENCH = `${DL}/Military_Trenches_Ground_Patch_Rock_S_03-4906428e/fbx/mid/military_trenches_ground_extracted/Military_Trenches_Ground_Patch_Rock_S_03_ydzkbhu_Mid_2K_`;
const GROUND = `${DL}/Ground-fbf8a1a7/fbx/ground-house-in-the-wood_extracted/textures/Ground024_2K_`;
const GV = `${DL}/Grass_Vegitation_Mix-e351d09f/fbx/grass-vegitation-mix_extracted/textures`;
const CUP = `${DL}/chinese_cup-10fd1206/blender/chinese-cup_extracted/textures`;

// Megascans materials exported from the village scene: MI_<name>_<id>_2K -> <name>_BaseColor.PNG etc.
function megascans(mat) {
  const base = mat.replace(/\.\d+$/, '');
  const f = (s) => `${VILLAGE}/${base}_${s}.PNG`;
  if (!existsSync(f('BaseColor'))) return null;
  return { base: f('BaseColor'), normal: f('Normal'), mr: f('MetallicRoughness'), ao: f('Occlusion') };
}

// [output, raw glb, max texture size, texture resolver (material name -> maps)]
const MODELS = [
  ['models/props/well.glb', 'well_lod0.glb', 1024, megascans],
  ['models/props/stone_wall.glb', 'stoneWall_lod0.glb', 1024, megascans],
  ['models/props/fireplace.glb', 'fireplace_lod0.glb', 1024, megascans],
  ['models/props/firewood_a.glb', 'firewoodA_lod0.glb', 512, megascans],
  ['models/props/firewood_b.glb', 'firewoodB_lod0.glb', 512, megascans],
  ['models/props/bench.glb', 'bench_lod0.glb', 1024, megascans],
  ['models/props/bollard.glb', 'bollard_lod0.glb', 512, megascans],
  ['models/props/railing.glb', 'railing_lod0.glb', 1024, megascans],
  ['models/props/door.glb', 'door_lod0.glb', 1024, megascans],
  ['models/rocks/boulder.glb', 'boulder_lod0.glb', 1024, megascans],
  ['models/rocks/mossy_rock.glb', 'mossyRock_lod0.glb', 1024, megascans],
  ['models/rocks/ledge_rock.glb', 'ledgeRock_lod0.glb', 1024, megascans],
  ['models/rocks/ledge_root.glb', 'ledgeRoot_lod0.glb', 1024, megascans],
  ['models/rocks/cliff_a.glb', 'cliffA_lod0.glb', 1024, megascans],
  ['models/rocks/cliff_b.glb', 'cliffB_lod0.glb', 1024, megascans],
  ['models/rocks/coast_cliff.glb', 'coastCliff_lod1.glb', 2048, megascans],
  ['models/rocks/embankment.glb', 'embankment_lod1.glb', 1024, megascans],
  ['models/rocks/stump.glb', 'stump_lod1.glb', 1024, megascans],
  ['models/rocks/fallen_pine.glb', 'fallenPine_lod1.glb', 1024, megascans],
  ['models/trees/pruned_a.glb', 'prunedA_lod0.glb', 1024, megascans],
  ['models/trees/pruned_b.glb', 'prunedB_lod0.glb', 1024, megascans],
  ['models/trees/pruned_c.glb', 'prunedC_lod0.glb', 1024, megascans],
  ['models/trees/pruned_d.glb', 'prunedD_lod0.glb', 1024, megascans],
  ['models/rocks/trench_rock.glb', 'trenchRock.glb', 1024, () => ({ base: `${TRENCH}BaseColor.jpg`, normal: `${TRENCH}Normal.jpg`, orm: { r: `${TRENCH}AO.jpg`, g: `${TRENCH}Roughness.jpg` } })],
  ['models/props/stone_jar.glb', 'pot.glb', 1024, () => ({ base: `${POT}BaseCol.png`, normal: `${POT}Normal.png`, orm: { g: `${POT}Roughne.png`, b: `${POT}Metalli.png` } })],
  ['models/props/stone_lantern.glb', 'lantern.glb', 1024, () => ({ base: `${LAMP}BaseColor.1001.png`, normal: `${LAMP}Normal.1001.png`, mr: `${LAMP}OcclusionRoughnessMetallic.1001.png`, ao: `${LAMP}OcclusionRoughnessMetallic.1001.png` })],
  ['models/props/cup.glb', 'cup.glb', 512, (m) => (m.endsWith('001') ? { base: `${CUP}/китай.jpg` } : null)],
  // broadleaf tree and ground-cover plants (sources prepared as described in tools/assets/foliage.py)
  ['models/trees/broadleaf.glb', 'veg/mobile_tree.glb', 2048, (m) => (m.includes('Leaf') ? { base: `${RAW}/veg/T_Mobile_Trees_Leaf.png`, alpha: true } : { base: `${RAW}/veg/T_Mobile_Trees_Trunk.png`, normal: `${RAW}/veg/T_Mobile_Trees_Trunk_normal.png` })],
  ['models/trees/gv_bush.glb', 'veg/gv_bush.glb', 1024, (m) => ({ base: `${GV}/${m.replace(/\.\d+$/, '')}.png`, alpha: true })],
  ['models/trees/gv_flower.glb', 'veg/gv_flower.glb', 1024, (m) => ({ base: `${GV}/${m.replace(/\.\d+$/, '')}.png`, alpha: true })],
  // character skin parts (skin atlases prepared by tools/assets/skin-textures.mjs)
  ['models/characters/male_head.glb', 'char/male_head_lo.glb', 2048, () => SKIN],
  ['models/characters/female_head.glb', 'char/female_head.glb', 1024, () => ({ base: `${RAW}/char/skin_female.png`, normal: `${RAW}/char/Female_3_Body_normal.png`, mr: `${RAW}/char/skin_female_orm.png` })],
  ['models/characters/male_hand_a.glb', 'char/male_hand_a.glb', 1024, () => SKIN],
  ['models/characters/male_hand_b.glb', 'char/male_hand_b.glb', 1024, () => SKIN],
];
const SKIN = { base: `${RAW}/char/skin_male_clean.png`, normal: `${RAW}/char/skin_male_normal.png`, orm: null, mr: `${RAW}/char/skin_male_orm.png` };

// Tileable ground textures: [output, source, size, quality]
const TEXTURES = [
  ['textures/skin_male_stubble.webp', `${RAW}/char/skin_male_stubble.png`, 2048, 90],
  ['textures/ground024_color.webp', `${GROUND}Color.jpg`, 2048, 88],
  ['textures/ground024_normal.webp', `${GROUND}Normal.jpg`, 2048, 92],
  ['textures/ground024_rough.webp', `${GROUND}Roughness.jpg`, 1024, 85],
  ['textures/forest_floor_color.webp', `${VILLAGE}/brown_mud_leaves_01_diff.PNG`, 2048, 88],
  ['textures/forest_floor_normal.webp', `${VILLAGE}/brown_mud_leaves_01_nor_gl.PNG`, 2048, 92],
];

const QUALITY = { base: 86, normal: 94, orm: 90 };
const real = (f) => f && existsSync(f) && statSync(f).size > 200; // skips Megascans' 1x1 placeholder maps

async function webp(input, size, q) {
  return sharp(input).resize(size, size, { fit: 'inside', withoutEnlargement: true }).webp({ quality: q }).toBuffer();
}
async function ormImage(o, size) {
  // pack separate greyscale maps into glTF's occlusion (R) / roughness (G) / metalness (B) layout
  const ch = async (f, fill) => (real(f) ? sharp(f).resize(size, size, { fit: 'fill' }).greyscale().raw().toBuffer() : Buffer.alloc(size * size, fill));
  const [r, g, b] = await Promise.all([ch(o.r, 255), ch(o.g, 200), ch(o.b, 0)]);
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) { px[i * 3] = r[i]; px[i * 3 + 1] = g[i]; px[i * 3 + 2] = b[i]; }
  return sharp(px, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: QUALITY.orm }).toBuffer();
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const only = process.argv[2];

for (const [out, raw, size, resolve] of MODELS) {
  if (only && !out.includes(only)) continue;
  const src = join(RAW, raw);
  if (!existsSync(src)) { console.warn(`! ${raw} missing; run tools/assets/build-assets.sh first`); continue; }
  const doc = await io.read(src);
  doc.setLogger(new Logger(Logger.Verbosity.ERROR));
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const cache = new Map();
  const tex = async (key, make) => {
    if (!cache.has(key)) cache.set(key, doc.createTexture(key.split('/').pop()).setImage(new Uint8Array(await make())).setMimeType('image/webp'));
    return cache.get(key);
  };
  for (const mat of doc.getRoot().listMaterials()) {
    const maps = resolve(mat.getName());
    if (!maps) continue;
    if (real(maps.base)) mat.setBaseColorTexture(await tex(maps.base, () => webp(maps.base, size, QUALITY.base))).setBaseColorFactor([1, 1, 1, 1]);
    // cut-out foliage: alpha-tested, both sides lit
    if (maps.alpha) mat.setAlphaMode('MASK').setAlphaCutoff(0.45).setDoubleSided(true);
    if (real(maps.normal)) mat.setNormalTexture(await tex(maps.normal, () => webp(maps.normal, size, QUALITY.normal)));
    const orm = maps.orm ? await tex(JSON.stringify(maps.orm), () => ormImage(maps.orm, size)) : real(maps.mr) ? await tex(maps.mr, () => webp(maps.mr, size, QUALITY.orm)) : null;
    if (orm) mat.setMetallicRoughnessTexture(orm).setMetallicFactor(1).setRoughnessFactor(1);
    if (maps.orm?.r && real(maps.orm.r)) mat.setOcclusionTexture(orm);
    else if (real(maps.ao)) mat.setOcclusionTexture(await tex(maps.ao, () => webp(maps.ao, size, QUALITY.orm)));
  }
  await doc.transform(dedup(), prune(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const dest = join(OUT, out);
  mkdirSync(dirname(dest), { recursive: true });
  await io.write(dest, doc);
  console.log(`✓ ${out}  ${(statSync(dest).size / 1024).toFixed(0)} KB`);
}

for (const [out, src, size, q] of TEXTURES) {
  if (only && !out.includes(only)) continue;
  if (!real(src)) { console.warn(`! ${src} missing`); continue; }
  const dest = join(OUT, out);
  mkdirSync(dirname(dest), { recursive: true });
  await sharp(src).resize(size, size, { fit: 'inside', withoutEnlargement: true }).webp({ quality: q }).toFile(dest);
  console.log(`✓ ${out}  ${(statSync(dest).size / 1024).toFixed(0)} KB`);
}
