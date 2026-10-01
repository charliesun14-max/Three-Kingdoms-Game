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
const lib = { manifest: null, models: new Map(), textures: new Map(), errors: [] };

function prepare(scene, e) {
  // normalise: apply scale/rotation, sit the model on y = 0 and centre it on its footprint
  const root = new THREE.Group();
  scene.rotation.set(THREE.MathUtils.degToRad(e.rotX || 0), THREE.MathUtils.degToRad(e.rotY || 0), THREE.MathUtils.degToRad(e.rotZ || 0));
  scene.scale.setScalar(e.scale ?? 1);
  root.add(scene);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  if (e.anchor !== 'origin' && isFinite(box.min.y)) {
    const c = box.getCenter(new THREE.Vector3());
    scene.position.set(-c.x, -box.min.y + (e.y || 0), -c.z);
  } else scene.position.y += e.y || 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = e.castShadow ?? true; o.receiveShadow = true; } });
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
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
  for (const section of ['props', 'trees', 'buildings', 'rocks']) {
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
  for (const [key, raw] of Object.entries(man.textures || {})) {
    const e = typeof raw === 'string' ? { file: raw } : raw;
    jobs.push(tl.loadAsync(BASE + e.file).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = e.linear ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
      t.anisotropy = 8;
      if (e.repeat) t.repeat.set(e.repeat, e.repeat);
      lib.textures.set(key, t);
    }).catch((err) => lib.errors.push(`${e.file}: ${err.message || err}`)));
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
    const o = m.skinned ? cloneSkinned(m.root) : m.root.clone(true);
    o.userData.asset = `${section}/${key}`;
    return o;
  },
  parts(section, key, v = 0) { const m = this.model(section, key, v); return m ? partsOf(m) : null; },
  texture(key) { return lib.textures.get(key) || null; },
  get loaded() { return !!lib.manifest; },
  get errors() { return lib.errors; },
};
