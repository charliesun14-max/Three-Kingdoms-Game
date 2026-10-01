// Optional art assets. Everything in the game is procedural, but any piece can be replaced by
// a glTF 2.0 model (.glb) or an image texture listed in public/assets/manifest.json.
// Missing files or a missing manifest simply leave the procedural version in place.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BASE = './assets/';
const lib = { manifest: null, models: new Map(), textures: new Map(), errors: [], glowMats: [] };

function prepare(scene, e) {
  // normalise: apply scale/rotation, sit the model on y = 0 and centre it on its footprint
  const root = new THREE.Group();
  scene.rotation.set(THREE.MathUtils.degToRad(e.rotX || 0), THREE.MathUtils.degToRad(e.rotY || 0), THREE.MathUtils.degToRad(e.rotZ || 0));
  scene.scale.setScalar(e.scale ?? 1);
  root.add(scene);
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(scene);
  // "height" / "width" (metres) override "scale": the model is resized to that real-world size
  if ((e.height || e.width) && isFinite(box.min.y)) {
    const sz = box.getSize(new THREE.Vector3());
    const k = e.height ? e.height / Math.max(1e-4, sz.y) : e.width / Math.max(1e-4, sz.x, sz.z);
    scene.scale.multiplyScalar(k);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(scene);
  }
  if (e.anchor === 'top' && isFinite(box.min.y)) {
    // hanging things (lanterns): origin at the top centre
    const c = box.getCenter(new THREE.Vector3());
    scene.position.set(-c.x, -box.max.y + (e.y || 0), -c.z);
  } else if (e.anchor !== 'origin' && isFinite(box.min.y)) {
    const c = box.getCenter(new THREE.Vector3());
    scene.position.set(-c.x, -box.min.y + (e.y || 0), -c.z);
  } else scene.position.y += e.y || 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = e.castShadow ?? true; o.receiveShadow = true;
    if (e.emissive) {
      // e.g. lantern paper: lit from inside, using the colour map as the glow pattern
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(e.emissive.color ?? 0xffa040);
      o.material.emissiveMap = o.material.map;
      o.material.emissiveIntensity = e.emissive.intensity ?? 1.5;
    }
  });
  let size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  if (e.glow) {
    // a warm light inside the model (a stone lantern's chamber), seen through its openings; it
    // brightens at night via assets.setNight() and is picked up by bloom
    const [yf, sf] = e.glow;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false, fog: false });
    lib.glowMats.push(mat);
    const w = Math.min(size.x, size.z) * sf;
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, w * 1.2, w), mat);
    g.position.y = (e.anchor === 'top' ? -size.y : 0) + size.y * yf;
    g.castShadow = false; g.userData.noAO = true;
    root.add(g);
  }
  return { root, size, entry: e, skinned: (() => { let s = false; root.traverse((o) => { if (o.isSkinnedMesh) s = true; }); return s; })() };
}

// geometry baked into model space and grouped by material, for InstancedMesh use (trees, rocks)
function partsOf(m) {
  if (m.parts) return m.parts;
  const byMat = new Map();
  m.root.updateMatrixWorld(true);
  m.root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.length > 1) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const k = mats[0].uuid;
    if (!byMat.has(k)) byMat.set(k, { material: mats[0], geos: [] });
    byMat.get(k).geos.push(g);
  });
  m.parts = [];
  for (const { material, geos } of byMat.values()) {
    let geo = null;
    try { geo = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false); } catch { geo = null; }
    if (geo) m.parts.push({ geometry: geo, material });
    else for (const g of geos) m.parts.push({ geometry: g, material });
  }
  return m.parts;
}

export async function loadAssets(renderer, onProgress = () => {}) {
  let man;
  try {
    const r = await fetch(BASE + 'manifest.json', { cache: 'no-cache' });
    if (!r.ok) return lib;
    man = await r.json();
  } catch { return lib; }
  lib.manifest = man;
  const draco = new DRACOLoader().setDecoderPath('./decoders/draco/');
  const ktx2 = new KTX2Loader().setTranscoderPath('./decoders/basis/').detectSupport(renderer);
  const gltf = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const jobs = [];
  for (const section of ['props', 'trees', 'buildings', 'rocks', 'scatter', 'characters', 'food']) {
    for (const [key, val] of Object.entries(man[section] || {})) {
      const list = Array.isArray(val) ? val : [val];
      list.forEach((raw, i) => {
        const e = typeof raw === 'string' ? { file: raw } : raw;
        jobs.push(gltf.loadAsync(BASE + e.file).then((g) => {
          const id = `${section}/${key}`;
          if (!lib.models.has(id)) lib.models.set(id, []);
          lib.models.get(id)[i] = prepare(g.scene, e);
        }).catch((err) => lib.errors.push(`${e.file}: ${err.message || err}`)));
      });
    }
  }
  const tl = new THREE.TextureLoader();
  const loadTex = (key, file, e, linear) => jobs.push(tl.loadAsync(BASE + file).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = linear ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 16;
    if (e.repeat) t.repeat.set(e.repeat, e.repeat);
    lib.textures.set(key, t);
  }).catch((err) => lib.errors.push(`${file}: ${err.message || err}`)));
  for (const [key, raw] of Object.entries(man.textures || {})) {
    // "grass": "file.jpg"  or  { "file": colour, "normal": normal map, "roughness": roughness map }
    const e = typeof raw === 'string' ? { file: raw } : raw;
    if (e.file) loadTex(key, e.file, e, e.linear);
    if (e.normal) loadTex(key + ':normal', e.normal, e, true);
    if (e.roughness) loadTex(key + ':roughness', e.roughness, e, true);
  }
  let done = 0;
  jobs.forEach((j) => j.finally(() => onProgress(++done / jobs.length)));
  await Promise.all(jobs);
  for (const list of lib.models.values()) for (let i = list.length - 1; i >= 0; i--) if (!list[i]) list.splice(i, 1);
  if (lib.errors.length) console.warn('Some assets failed to load:\n' + lib.errors.join('\n'));
  return lib;
}

export const assets = {
  has(section, key) { return (lib.models.get(`${section}/${key}`) || []).length > 0; },
  variants(section, key) { return (lib.models.get(`${section}/${key}`) || []).length; },
  model(section, key, v = 0) { const l = lib.models.get(`${section}/${key}`); return l && l.length ? l[v % l.length] : null; },
  // a fresh copy to place in the world
  instance(section, key, v = 0) {
    const m = this.model(section, key, v);
    if (!m) return null;
    const one = () => (m.skinned ? cloneSkinned(m.root) : m.root.clone(true));
    let o;
    if (m.entry.cluster) {
      // several copies arranged as [x, z, scale, rotY degrees], e.g. a group of wine jars
      o = new THREE.Group();
      for (const [x, z, sc = 1, ry = 0] of m.entry.cluster) {
        const c = one();
        c.position.set(x, 0, z); c.scale.setScalar(sc); c.rotation.y = THREE.MathUtils.degToRad(ry);
        o.add(c);
      }
    } else o = one();
    o.userData.asset = `${section}/${key}`;
    return o;
  },
  parts(section, key, v = 0) { const m = this.model(section, key, v); return m ? partsOf(m) : null; },
  // texture('loess') is the colour map; texture('loess', 'normal') / ('loess', 'roughness') the others
  texture(key, kind) { return lib.textures.get(kind ? `${key}:${kind}` : key) || null; },
  get manifest() { return lib.manifest; },
  // 0 = day .. 1 = night: lights models that declare a "glow"
  setNight(n) {
    const k = 0.35 + n * 3.2;
    for (const m of lib.glowMats) m.color.setRGB(1.0 * k, 0.62 * k, 0.28 * k);
  },
  get loaded() { return !!lib.manifest; },
  get errors() { return lib.errors; },
};
