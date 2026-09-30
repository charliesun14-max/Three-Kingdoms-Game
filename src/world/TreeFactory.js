// Procedural tree geometry: bark trunk/branches + alpha-tested leaf cards.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/Rng.js';
import { Tex } from './TextureGen.js';

const SPECIES = {
  pine: { h: [9, 14], trunkR: 0.26, bark: [0.42, 0.26, 0.18], leaf: 'needle', tint: 0x8fb07a, crown: 'layered', cards: 70, cardSize: 2.3 },
  elm: { h: [8, 12], trunkR: 0.3, bark: [0.33, 0.28, 0.23], leaf: 'broad', tint: 0xa9c07c, crown: 'round', cards: 90, cardSize: 2.4 },
  poplar: { h: [14, 19], trunkR: 0.24, bark: [0.62, 0.6, 0.52], leaf: 'broad', tint: 0xb4c884, crown: 'column', cards: 80, cardSize: 2.0 },
  willow: { h: [7, 10], trunkR: 0.32, bark: [0.3, 0.26, 0.2], leaf: 'willow', tint: 0xb0c880, crown: 'weeping', cards: 60, cardSize: 2.2 },
  peach: { h: [3.2, 4.6], trunkR: 0.14, bark: [0.3, 0.2, 0.17], leaf: 'blossom', tint: 0xffffff, crown: 'round', cards: 78, cardSize: 1.15 },
  jujube: { h: [4, 6], trunkR: 0.15, bark: [0.3, 0.22, 0.16], leaf: 'broad', tint: 0x98b070, crown: 'sparse', cards: 40, cardSize: 1.6 },
  mulberry: { h: [15, 17], trunkR: 0.8, bark: [0.36, 0.3, 0.24], leaf: 'broad', tint: 0x9cbc70, crown: 'canopy', cards: 260, cardSize: 3.4 },
  shrub: { h: [0.9, 1.6], trunkR: 0.04, bark: [0.3, 0.25, 0.2], leaf: 'broad', tint: 0x94ae6c, crown: 'bush', cards: 16, cardSize: 1.2 },
};
export const SPECIES_LIST = Object.keys(SPECIES);

function colorize(geo, rgb) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = 0.85 + Math.random() * 0.2;
    c[i * 3] = rgb[0] * v; c[i * 3 + 1] = rgb[1] * v; c[i * 3 + 2] = rgb[2] * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// Tapered limb from a to b.
function limb(a, b, r0, r1, radial = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

function card(center, size, crownCenter, rng, stretchY = 1, hang = false) {
  const g = new THREE.PlaneGeometry(size, size * stretchY);
  if (hang) g.translate(0, -size * stretchY * 0.45, 0);
  const e = new THREE.Euler(rng.range(-0.6, 0.6), rng.range(0, Math.PI * 2), rng.range(-0.5, 0.5));
  if (hang) e.set(0, rng.range(0, Math.PI * 2), 0);
  g.applyQuaternion(new THREE.Quaternion().setFromEuler(e));
  g.translate(center.x, center.y, center.z);
  // Spherical normals (outward from crown centre) give soft volumetric shading.
  const pos = g.attributes.position, nor = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(crownCenter);
    v.y *= 0.7;
    v.normalize();
    v.y = v.y * 0.6 + 0.4;
    v.normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

export function buildTree(species, seed, lod = 0) {
  const sp = SPECIES[species];
  const rng = new Rng(seed);
  const H = rng.range(sp.h[0], sp.h[1]);
  const wood = [];
  const leaves = [];
  const radial = lod ? 4 : 7;
  const leanX = rng.range(-0.25, 0.25), leanZ = rng.range(-0.25, 0.25);
  // trunk polyline
  const trunkPts = [];
  const segs = species === 'peach' || species === 'jujube' ? 4 : 5;
  const trunkTop = sp.crown === 'column' ? H * 0.95 : sp.crown === 'bush' ? 0.3 : H * (sp.crown === 'canopy' ? 0.45 : 0.62);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const wig = species === 'peach' || species === 'jujube' || species === 'mulberry' ? 0.35 : 0.12;
    trunkPts.push(new THREE.Vector3(leanX * t * H * 0.15 + rng.range(-wig, wig) * t, t * trunkTop, leanZ * t * H * 0.15 + rng.range(-wig, wig) * t));
  }
  for (let i = 0; i < segs; i++) {
    const r0 = sp.trunkR * (1 - (i / segs) * 0.6) * (i === 0 ? 1.25 : 1);
    const r1 = sp.trunkR * (1 - ((i + 1) / segs) * 0.6);
    wood.push(colorize(limb(trunkPts[i], trunkPts[i + 1], r0, r1, radial), sp.bark));
  }
  if (!lod && sp.crown !== 'bush') {
    // root flare
    const fl = new THREE.CylinderGeometry(sp.trunkR * 1.2, sp.trunkR * 2.0, 0.5, radial, 1, true);
    fl.translate(0, 0.2, 0);
    wood.push(colorize(fl, sp.bark));
  }
  const top = trunkPts[segs];
  const crownC = new THREE.Vector3(top.x, 0, top.z);
  const nCards = Math.round(sp.cards * (lod ? 0.28 : 1));
  const cs = sp.cardSize * (lod ? 1.7 : 1);

  const branchTo = (from, to, r) => wood.push(colorize(limb(from, to, r, r * 0.45, lod ? 3 : 5), sp.bark));

  switch (sp.crown) {
    case 'layered': { // Chinese pine: tiers of flat umbrella pads
      const tiers = lod ? 3 : 5;
      crownC.y = H * 0.78;
      for (let t = 0; t < tiers; t++) {
        const y = H * (0.55 + 0.45 * (t / tiers)) + rng.range(-0.3, 0.3);
        const nb = 3 + (t < 2 ? 1 : 0);
        for (let b = 0; b < nb; b++) {
          const ang = rng.range(0, Math.PI * 2);
          const reach = (1 - t / tiers) * H * 0.3 + 1.0;
          const s = new THREE.Vector3(top.x * (y / H), y - 0.8, top.z * (y / H));
          const e = new THREE.Vector3(s.x + Math.cos(ang) * reach, y + rng.range(-0.2, 0.4), s.z + Math.sin(ang) * reach);
          if (!lod) branchTo(s, e, sp.trunkR * 0.3);
          const per = Math.ceil(nCards / (tiers * nb));
          for (let k = 0; k < per; k++) {
            const p = new THREE.Vector3().lerpVectors(s, e, rng.range(0.3, 1.1));
            p.x += rng.range(-1, 1); p.z += rng.range(-1, 1); p.y += rng.range(-0.25, 0.35);
            leaves.push(card(p, cs * rng.range(0.8, 1.2), crownC, rng, 0.55));
          }
        }
      }
      break;
    }
    case 'column': {
      crownC.set(top.x * 0.6, H * 0.6, top.z * 0.6);
      for (let k = 0; k < nCards; k++) {
        const t = rng.range(0.22, 1.0);
        const r = (1.6 + 0.5 * Math.sin(t * Math.PI)) * Math.sin(t * Math.PI * 0.95) * rng.range(0.3, 1);
        const a = rng.range(0, Math.PI * 2);
        const p = new THREE.Vector3(top.x * t + Math.cos(a) * r, H * t, top.z * t + Math.sin(a) * r);
        leaves.push(card(p, cs * rng.range(0.8, 1.2), crownC, rng, 1.3));
      }
      if (!lod) for (let b = 0; b < 6; b++) {
        const y = H * rng.range(0.3, 0.85), a = rng.range(0, 6.28);
        branchTo(new THREE.Vector3(top.x * y / H, y, top.z * y / H), new THREE.Vector3(top.x * y / H + Math.cos(a) * 1.2, y + 1.4, top.z * y / H + Math.sin(a) * 1.2), 0.08);
      }
      break;
    }
    case 'weeping': {
      crownC.set(top.x, H * 0.7, top.z);
      const nb = lod ? 4 : 7;
      const ends = [];
      for (let b = 0; b < nb; b++) {
        const a = (b / nb) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const e = new THREE.Vector3(top.x + Math.cos(a) * rng.range(2, 3.4), H * rng.range(0.85, 1.0), top.z + Math.sin(a) * rng.range(2, 3.4));
        branchTo(top, e, sp.trunkR * 0.45);
        ends.push(e);
      }
      for (let k = 0; k < nCards; k++) {
        const e = ends[k % ends.length];
        const p = new THREE.Vector3(e.x + rng.range(-1.6, 1.6), e.y + rng.range(-0.6, 0.4), e.z + rng.range(-1.6, 1.6));
        const out = new THREE.Vector3(p.x - top.x, 0, p.z - top.z);
        p.addScaledVector(out.normalize(), rng.range(0, 0.8));
        leaves.push(card(p, cs * rng.range(0.7, 1.0), crownC, rng, 2.4, true));
      }
      break;
    }
    case 'bush': {
      crownC.set(0, 0.4, 0);
      for (let k = 0; k < nCards; k++) {
        const p = new THREE.Vector3(rng.range(-0.7, 0.7), rng.range(0.3, H * 0.8), rng.range(-0.7, 0.7));
        leaves.push(card(p, cs * rng.range(0.8, 1.2), crownC, rng));
      }
      break;
    }
    default: { // round, sparse, canopy
      const spread = sp.crown === 'canopy' ? H * 0.55 : sp.crown === 'sparse' ? H * 0.38 : H * 0.34;
      const cy = sp.crown === 'canopy' ? H * 0.7 : H * 0.7;
      crownC.set(top.x, cy, top.z);
      const nb = sp.crown === 'canopy' ? 9 : lod ? 4 : 6;
      const ends = [];
      for (let b = 0; b < nb; b++) {
        const a = (b / nb) * Math.PI * 2 + rng.range(-0.4, 0.4);
        const r = spread * rng.range(0.55, 0.95);
        const e = new THREE.Vector3(top.x + Math.cos(a) * r, cy + rng.range(-0.1, 0.35) * H * 0.3, top.z + Math.sin(a) * r);
        branchTo(top, e, sp.trunkR * (sp.crown === 'canopy' ? 0.42 : 0.5));
        ends.push(e);
        if (sp.crown === 'canopy' && !lod) {
          // secondary forks
          for (let f = 0; f < 2; f++) {
            const a2 = a + rng.range(-0.8, 0.8);
            const e2 = new THREE.Vector3(e.x + Math.cos(a2) * r * 0.4, e.y + rng.range(0, 2), e.z + Math.sin(a2) * r * 0.4);
            branchTo(e, e2, sp.trunkR * 0.18);
            ends.push(e2);
          }
        }
      }
      ends.push(new THREE.Vector3(top.x, cy + H * 0.12, top.z));
      for (let k = 0; k < nCards; k++) {
        const e = ends[k % ends.length];
        const rr = spread * (sp.crown === 'sparse' ? 0.45 : 0.55);
        const p = new THREE.Vector3(e.x + rng.gauss() * rr * 0.6, e.y + rng.gauss() * rr * 0.35, e.z + rng.gauss() * rr * 0.6);
        leaves.push(card(p, cs * rng.range(0.8, 1.25), crownC, rng, 0.8));
      }
    }
  }

  const woodGeo = mergeGeometries(wood.map((g) => g.toNonIndexed()));
  const leafGeo = mergeGeometries(leaves.map((g) => g.toNonIndexed()));
  // Per-vertex "height fraction" in color.r for wind.
  woodGeo.computeBoundingSphere();
  leafGeo.computeBoundingSphere();
  return { wood: woodGeo, leaves: leafGeo, height: H, trunkR: sp.trunkR };
}

const matCache = new Map();
export function treeMaterials(species) {
  if (matCache.has(species)) return matCache.get(species);
  const sp = SPECIES[species];
  const windChunk = (strength) => `
    #include <begin_vertex>
    {
      vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
      float h = max(0.0, transformed.y);
      float ph = ip.x * 0.13 + ip.z * 0.17;
      float sway = (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25) * ${strength.toFixed(3)} * uWind;
      transformed.x += sway * h * h * 0.01;
      transformed.z += sway * 0.6 * h * h * 0.01;
      #ifdef IS_LEAF
      transformed += normal * sin(uTime * 4.0 + position.x * 3.0 + ph) * 0.03 * uWind;
      #endif
    }`;
  const uniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
  const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: Tex.wood() });
  wood.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', windChunk(1.0));
  };
  wood.customProgramCacheKey = () => 'treeWood';
  const leaf = new THREE.MeshStandardMaterial({
    map: Tex.leaves(sp.leaf), color: sp.tint, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85,
  });
  leaf.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = '#define IS_LEAF\nuniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', windChunk(1.0));
    // Fake translucency: brighten back-lit leaves.
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.indirectDiffuse *= 1.25;`);
  };
  leaf.customProgramCacheKey = () => 'treeLeaf' + species;
  const res = { wood, leaf, uniforms };
  matCache.set(species, res);
  return res;
}
export function allTreeUniforms() {
  return [...matCache.values()].map((m) => m.uniforms);
}
