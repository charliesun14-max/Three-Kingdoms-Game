// Procedural skinned humanoid with Han-era clothing, headwear, armour and faces.
// All body parts are merged into a single SkinnedMesh (rigid skinning for limbs,
// blended skinning for robes) so each character costs only a few draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { faceTexture, Tex } from '../world/TextureGen.js';

export const BONES = [
  'root', 'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR',
  'thighL', 'kneeL', 'footL', 'thighR', 'kneeR', 'footR',
];
const BI = Object.fromEntries(BONES.map((b, i) => [b, i]));
export const PARENT = {
  hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', elbowL: 'shoulderL', handL: 'elbowL',
  shoulderR: 'chest', elbowR: 'shoulderR', handR: 'elbowR',
  thighL: 'hips', kneeL: 'thighL', footL: 'kneeL', thighR: 'hips', kneeR: 'thighR', footR: 'kneeR',
};

// Rest-pose joint positions in model space (metres) for a 1.72 m adult.
export function jointPositions(p) {
  const sw = 0.178 * p.shoulders, hw = 0.095 * p.hipsW;
  return {
    root: [0, 0, 0], hips: [0, 0.95, 0], spine: [0, 1.05, 0], chest: [0, 1.25, 0], neck: [0, 1.47, 0], head: [0, 1.55, 0],
    shoulderL: [sw, 1.42, 0], elbowL: [sw + 0.01, 1.13, 0], handL: [sw + 0.015, 0.88, 0.01],
    shoulderR: [-sw, 1.42, 0], elbowR: [-sw - 0.01, 1.13, 0], handR: [-sw - 0.015, 0.88, 0.01],
    thighL: [hw, 0.93, 0], kneeL: [hw, 0.5, 0.01], footL: [hw, 0.08, 0],
    thighR: [-hw, 0.93, 0], kneeR: [-hw, 0.5, 0.01], footR: [-hw, 0.08, 0],
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers (all produce indexed BufferGeometry in model space)
function lathe(profile, seg = 12, sx = 1, sz = 1) {
  // LatheGeometry faces outward only when the profile runs bottom-to-top.
  const prof = profile[0][1] > profile[profile.length - 1][1] ? [...profile].reverse() : profile;
  const pts = prof.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.scale(sx, 1, sz);
  return g;
}
function limbGeo(a, b, r0, r1, seg = 8, sz = 1) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = lathe([[0, 0], [r0 * 0.7, 0.01], [r0, 0.04], [(r0 + r1) / 2 * 1.02, len * 0.5], [r1, len - 0.03], [r1 * 0.7, len - 0.005], [0, len]], seg, 1, sz);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate(A.x, A.y, A.z);
  return g;
}
function sphereAt(c, r, sx = 1, sy = 1, sz = 1, seg = 10) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.75 | 0));
  g.scale(sx, sy, sz);
  g.translate(...c);
  return g;
}
function boxAt(c, w, h, d, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(...c);
  return g;
}

class SkinBuilder {
  constructor() { this.groups = [[], [], []]; } // 0 cloth/skin, 1 metal/lacquer, 2 hair (glossy)
  // weightsFn(vertexPos) -> [[bone, w], ...] ; or a single bone name
  add(geo, bone, color, group = 0, weightsFn = null) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const c = new THREE.Color(color);
    const p = g.attributes.position, nrm = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      // cheap baked occlusion: surfaces facing down/inward and lower on the body are darker
      const ny = nrm ? nrm.getY(i) : 0;
      const y = p.getY(i);
      const ao = Math.min(1, 0.72 + 0.2 * (ny * 0.5 + 0.5) + 0.12 * Math.min(1, y / 1.5));
      col[i * 3] = c.r * ao; col[i * 3 + 1] = c.g * ao; col[i * 3 + 2] = c.b * ao;
      if (weightsFn) {
        const ws = weightsFn(p.getX(i), p.getY(i), p.getZ(i));
        let tot = 0;
        for (let k = 0; k < 4; k++) { if (ws[k]) { si[i * 4 + k] = BI[ws[k][0]]; sw[i * 4 + k] = ws[k][1]; tot += ws[k][1]; } }
        for (let k = 0; k < 4; k++) sw[i * 4 + k] /= tot || 1;
      } else {
        si[i * 4] = BI[bone]; sw[i * 4] = 1;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.groups[group].push(g);
  }
  build() {
    const lists = this.groups.map((l) => (l.length ? mergeGeometries(l) : null));
    const used = lists.map((g, i) => [g, i]).filter(([g]) => g);
    const merged = mergeGeometries(used.map(([g]) => g), true);
    // map material index for each group
    merged.groups.forEach((gr, k) => { gr.materialIndex = used[k][1]; });
    return merged;
  }
}

// ---------------------------------------------------------------------------
const matCache = new Map();
// Soft rim light on characters so they separate from the landscape behind them (driven by daylight).
export const CHAR_LIGHT = { uRim: { value: 0.08 }, uRimCol: { value: new THREE.Color(1.0, 0.93, 0.8) } };
function withRim(mat, key) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, CHAR_LIGHT);
    sh.fragmentShader = 'uniform float uRim;\nuniform vec3 uRimCol;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
      outgoingLight += uRimCol * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0) * uRim;
      #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'charRim' + key;
  return mat;
}
function bodyMaterials() {
  if (matCache.has('body')) return matCache.get('body');
  const cloth = withRim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, map: Tex.cloth() }), 'c');
  const metal = withRim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.55, map: Tex.lamellar() }), 'm');
  const hair = withRim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0 }), 'h');
  const res = [cloth, metal, hair];
  matCache.set('body', res);
  return res;
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c;
}

/**
 * Appearance spec (all optional):
 * height, build (0.9-1.2), female, skin, hair, beard ('none'|'stubble'|'goatee'|'short'|'long'|'bristly'|'grey'),
 * outfit ('peasant'|'robe'|'soldier'|'yellowTurban'|'bandit'|'official'|'general'|'woman'|'merchant'),
 * robe, trim, trousers, belt, shoes, headwear ('topknot'|'wrap'|'yellowScarf'|'helmet'|'official'|'hood'|'bamboo'|'greenScarf'|'crown'|'bun'),
 * armor ('none'|'leather'|'lamellar'|'general'), armorColor, face {fierce, stern, smile, redFace, wrinkles, moustache, stubble}
 */
export function buildHumanoid(ap = {}) {
  const P = {
    shoulders: (ap.female ? 0.86 : 1) * (0.94 + 0.12 * ((ap.build ?? 1) - 0.9) / 0.3),
    hipsW: ap.female ? 1.05 : 1,
    girth: (ap.build ?? 1) * (ap.female ? 0.9 : 1),
  };
  const J = jointPositions(P);
  const S = new SkinBuilder();
  const g = P.girth;
  const skin = ap.skin ?? 0xc99a70;
  const robe = ap.robe ?? 0x7a6a50;
  const trim = ap.trim ?? shade(robe, 0.6).getHex();
  const trousers = ap.trousers ?? 0x5a4c3a;
  const belt = ap.belt ?? 0x2a1e14;
  const shoes = ap.shoes ?? 0x2a2018;
  const hair = ap.hair ?? 0x16110d;
  const outfit = ap.outfit ?? 'peasant';
  const longRobe = ['robe', 'official', 'woman', 'merchant', 'general'].includes(outfit);
  const sleeveWide = ['robe', 'official', 'woman', 'merchant'].includes(outfit);

  // --- head & neck
  S.add(limbGeo([0, 1.44, 0], [0, 1.57, 0.005], 0.052 * g, 0.048, 8), 'neck', skin);
  S.add(sphereAt([0, 1.615, 0.005], 0.1, 0.9, 1.12, 1.0, 14), 'head', skin); // back of head / skull (face mesh overlays front)
  for (const s of [-1, 1]) S.add(sphereAt([s * 0.093, 1.6, -0.005], 0.022, 0.5, 1.2, 0.9, 6), 'head', ap.bigEars ? shade(skin, 1.0) : skin); // ears
  if (ap.bigEars) for (const s of [-1, 1]) S.add(sphereAt([s * 0.1, 1.58, -0.005], 0.026, 0.5, 1.7, 0.9, 6), 'head', skin);

  // --- torso (under-robe / skin shape)
  const torsoCol = ap.bare ? skin : robe;
  S.add(lathe([[0.001, 0.92], [0.14 * g, 0.94], [0.155 * g, 1.02], [0.15 * g, 1.1], [0.16 * g, 1.24], [0.148 * g * P.shoulders, 1.37], [0.1, 1.44], [0.05, 1.47], [0.001, 1.475]], 14, 1, 0.72), null, torsoCol, 0,
    (x, y) => (y < 1.0 ? [['hips', 1]] : y < 1.15 ? [['hips', (1.15 - y) / 0.15], ['spine', (y - 1.0) / 0.15]] : y < 1.3 ? [['spine', (1.3 - y) / 0.15], ['chest', (y - 1.15) / 0.15]] : [['chest', 1]]));
  // cross-collar (交領, closing to the wearer's right: 右衽) as flat bands on the chest
  if (!ap.bare) {
    const lap = boxAt([0, 0, 0], 0.036, 0.3, 0.008);
    lap.rotateZ(-0.72); lap.rotateY(0.18); lap.translate(-0.045, 1.305, 0.123 * g);
    S.add(lap, 'chest', trim);
    const lap2 = boxAt([0, 0, 0], 0.032, 0.13, 0.008);
    lap2.rotateZ(0.75); lap2.rotateY(-0.2); lap2.translate(-0.03, 1.39, 0.113 * g);
    S.add(lap2, 'chest', trim);
    S.add(lathe([[0.056, 1.42], [0.064, 1.44], [0.058, 1.47]], 10, 1, 0.9), 'neck', trim); // collar
  }
  // belt / sash
  S.add(lathe([[0.158 * g, 1.0], [0.162 * g, 1.03], [0.16 * g, 1.07]], 14, 1, 0.74), 'spine', belt);
  if (ap.sashTail !== false) S.add(boxAt([0.05, 0.93, 0.125 * g], 0.05, 0.16, 0.015), 'hips', belt);

  // --- skirt / lower robe with blended weights so it follows the legs
  const hemY = longRobe ? 0.12 : outfit === 'woman' ? 0.06 : 0.55;
  const flare = longRobe ? 0.3 : 0.23;
  const skirtCol = ap.skirt ?? robe;
  const skirtProfile = [[0.155 * g, 1.02], [0.17 * g, 0.9], [0.2 * g, 0.75], [flare * g * 0.95, (0.75 + hemY) / 2], [flare * g, hemY + 0.02], [flare * g * 0.98, hemY]];
  S.add(lathe(skirtProfile, 18, 1, 0.8), null, skirtCol, 0, (x, y) => {
    const t = Math.min(1, Math.max(0, (0.98 - y) / (0.98 - hemY)));
    const side = Math.max(-1, Math.min(1, x / (0.2 * g)));
    const legW = Math.pow(t, 1.3) * 0.75;
    const lw = legW * (0.5 + 0.5 * side), rw = legW * (0.5 - 0.5 * side);
    const ws = [['hips', 1 - legW]];
    if (lw > 0.001) ws.push([longRobe ? 'thighL' : 'thighL', lw]);
    if (rw > 0.001) ws.push(['thighR', rw]);
    return ws;
  });
  // hem trim band
  S.add(lathe([[flare * g * 1.005, hemY + 0.06], [flare * g * 1.01, hemY + 0.005]], 18, 1, 0.8), null, trim, 0, (x) => {
    const side = Math.max(-1, Math.min(1, x / (0.2 * g)));
    return [['hips', 0.25], ['thighL', 0.75 * (0.5 + 0.5 * side)], ['thighR', 0.75 * (0.5 - 0.5 * side)]];
  });

  // --- legs (trousers + leg wraps) and feet
  for (const s of ['L', 'R']) {
    const th = J['thigh' + s], kn = J['knee' + s], ft = J['foot' + s];
    S.add(limbGeo(th, kn, 0.078 * g, 0.056 * g, 9), 'thigh' + s, trousers);
    S.add(limbGeo(kn, [ft[0], ft[1] + 0.02, ft[2]], 0.056 * g, 0.042, 9), 'knee' + s, outfit === 'soldier' || outfit === 'bandit' || outfit === 'peasant' ? shade(trousers, 0.85) : trousers);
    if (outfit === 'soldier' || outfit === 'peasant' || outfit === 'bandit' || outfit === 'yellowTurban') {
      // leg wraps (行縢)
      S.add(limbGeo([kn[0], kn[1] - 0.06, kn[2]], [ft[0], ft[1] + 0.05, ft[2]], 0.06 * g, 0.05, 8), 'knee' + s, ap.wraps ?? 0x7a6a58);
    }
    S.add(sphereAt([kn[0], kn[1], kn[2] + 0.005], 0.058 * g, 1, 1, 1, 8), 'knee' + s, trousers);
    // shoe
    const shoe = sphereAt([ft[0], 0.045, ft[2] + 0.05], 0.05, 0.95, 0.75, 2.1, 10);
    S.add(shoe, 'foot' + s, shoes);
    S.add(boxAt([ft[0], 0.012, ft[2] + 0.04], 0.085, 0.024, 0.24), 'foot' + s, shade(shoes, 0.6));
  }

  // --- arms: sleeves & hands
  for (const s of ['L', 'R']) {
    const sh = J['shoulder' + s], el = J['elbow' + s], hd = J['hand' + s];
    const sign = s === 'L' ? 1 : -1;
    S.add(sphereAt([sh[0] - sign * 0.014, sh[1] - 0.014, sh[2]], 0.052 * g, 1, 0.9, 0.9, 10), 'shoulder' + s, ap.bare ? skin : robe);
    if (ap.bare) {
      S.add(limbGeo(sh, el, 0.055 * g, 0.042 * g, 9), 'shoulder' + s, skin);
      S.add(limbGeo(el, hd, 0.042 * g, 0.032, 9), 'elbow' + s, skin);
    } else {
      S.add(limbGeo(sh, el, 0.048 * g, 0.045 * g, 9), 'shoulder' + s, robe);
      if (sleeveWide) {
        // wide hanging sleeve (袂)
        const sl = lathe([[0.05, 0], [0.06, 0.05], [0.1, 0.18], [0.125, 0.25], [0.12, 0.27], [0.02, 0.28]], 10, 0.8, 1.15);
        sl.rotateX(Math.PI); sl.translate(el[0], el[1] + 0.02, el[2] - 0.01);
        S.add(sl, 'elbow' + s, robe);
        S.add(lathe([[0.122, 0.21], [0.126, 0.25]], 10, 0.8, 1.15).rotateX(Math.PI).translate(el[0], el[1] + 0.02, el[2] - 0.01), 'elbow' + s, trim);
      } else {
        S.add(limbGeo(el, [hd[0], hd[1] + 0.03, hd[2]], 0.056 * g, 0.045, 9), 'elbow' + s, robe);
        S.add(lathe([[0.047, 0], [0.05, 0.03]], 9).translate(hd[0], hd[1] + 0.03, hd[2]), 'elbow' + s, trim);
      }
    }
    S.add(sphereAt([el[0], el[1], el[2]], 0.055 * g, 1, 1, 1, 8), 'elbow' + s, ap.bare ? skin : robe);
    // hand: palm + fingers block + thumb
    S.add(sphereAt([hd[0], hd[1] - 0.035, hd[2] + 0.005], 0.04, 0.55, 1.0, 0.9, 8), 'hand' + s, skin);
    S.add(sphereAt([hd[0], hd[1] - 0.085, hd[2] + 0.012], 0.034, 0.5, 0.9, 0.75, 8), 'hand' + s, skin);
    S.add(sphereAt([hd[0] - sign * 0.004, hd[1] - 0.05, hd[2] + 0.035], 0.016, 1, 1.6, 1, 6), 'hand' + s, skin);
  }

  // --- armour
  if (ap.armor && ap.armor !== 'none') {
    const ac = ap.armorColor ?? (ap.armor === 'leather' ? 0x5a3a24 : 0x6a6e72);
    const grp = ap.armor === 'leather' ? 0 : 1;
    // lamellar cuirass
    S.add(lathe([[0.17 * g, 0.9], [0.175 * g, 1.02], [0.175 * g, 1.2], [0.18 * g * P.shoulders, 1.36], [0.13, 1.43]], 14, 1, 0.78), null, ac, grp,
      (x, y) => (y < 1.1 ? [['hips', (1.1 - y) / 0.2 + 0.001], ['spine', 1 - (1.1 - y) / 0.2]] : [['spine', Math.max(0.001, (1.3 - y) / 0.2)], ['chest', Math.min(1, (y - 1.1) / 0.2)]]));
    // shoulder guards (披膊)
    for (const s of ['L', 'R']) {
      const sh = J['shoulder' + s];
      const sign = s === 'L' ? 1 : -1;
      const pad = lathe([[0.001, 0.12], [0.07, 0.1], [0.095, 0.02], [0.1, -0.08]], 10, 1, 1.1);
      pad.translate(sh[0] + sign * 0.02, sh[1] - 0.02, sh[2]);
      S.add(pad, 'shoulder' + s, ac, grp);
    }
    // tassets (lamellar skirt)
    S.add(lathe([[0.18 * g, 0.98], [0.22 * g, 0.8], [0.24 * g, 0.66]], 16, 1, 0.82), null, ac, grp, (x, y) => {
      const t = Math.min(1, Math.max(0, (0.98 - y) / 0.32));
      const side = Math.max(-1, Math.min(1, x / 0.2));
      const lw = t * 0.5;
      return [['hips', 1 - lw], ['thighL', lw * (0.5 + 0.5 * side) + 0.0001], ['thighR', lw * (0.5 - 0.5 * side) + 0.0001]];
    });
    if (ap.armor === 'general') {
      // chest mirror plates (護心鏡) and ornate collar
      for (const s of [-1, 1]) S.add(sphereAt([s * 0.07, 1.28, 0.135 * g], 0.05, 1, 1, 0.25, 12), 'chest', 0xc8b070, 1);
      S.add(lathe([[0.09, 1.42], [0.12, 1.44], [0.07, 1.5]], 12, 1, 0.9), 'neck', ap.trim ?? 0x8a1a12, 0);
      // cape
      const cape = new THREE.PlaneGeometry(0.46, 1.0, 4, 8);
      cape.translate(0, 0.95, -0.14 * g);
      const pos = cape.attributes.position;
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const x = pos.getX(i); pos.setZ(i, -0.14 * g - (1.45 - y) * 0.12 - Math.abs(x) * 0.08); pos.setY(i, Math.min(y + 0.45, 1.44)); }
      cape.computeVertexNormals();
      S.add(cape, null, ap.cape ?? 0x8a1a12, 0, (x, y) => [['chest', Math.max(0.001, (y - 0.7) / 0.7)], ['hips', Math.max(0.001, 1 - (y - 0.7) / 0.7)]]);
      S.add(cape.clone().scale(-1, 1, 1).translate(0, 0, -0.005), null, shade(ap.cape ?? 0x8a1a12, 0.6), 0, (x, y) => [['chest', Math.max(0.001, (y - 0.7) / 0.7)], ['hips', Math.max(0.001, 1 - (y - 0.7) / 0.7)]]);
    }
  }

  // --- hair, beard, headwear
  const hw = ap.headwear ?? 'topknot';
  const hy = 1.615;
  if (hw !== 'helmet' || true) S.add(sphereAt([0, hy + 0.01, -0.008], 0.103, 0.93, 1.07, 1.02, 12).translate(0, 0, 0), 'head', hair, 2); // hair cap
  // trim hair cap front (so face shows): approximate by pushing hair up/back
  const hairG = S.groups[2][S.groups[2].length - 1];
  {
    const pos = hairG.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i), y = pos.getY(i);
      if (z > 0.02 && y < hy + 0.06) {
        // pull frontal-lower vertices back over the skull so the face is not covered
        pos.setZ(i, Math.min(z, 0.02 + (y - (hy - 0.02)) * 0.6));
        if (y < hy - 0.02) pos.setY(i, hy - 0.02 + (y - hy) * 0.1);
      }
    }
    hairG.computeVertexNormals();
  }
  const bunY = hy + 0.12;
  if (['topknot', 'wrap', 'official', 'yellowScarf', 'greenScarf', 'crown', 'bun'].includes(hw)) {
    S.add(sphereAt([0, bunY, -0.01], 0.042, 1, 1.1, 1, 8), 'head', hair, 2);
  }
  if (hw === 'wrap' || hw === 'greenScarf' || hw === 'yellowScarf') {
    const c = hw === 'yellowScarf' ? 0xd8a820 : hw === 'greenScarf' ? 0x2e5e3a : (ap.headCloth ?? 0x3a3028);
    S.add(sphereAt([0, hy + 0.035, -0.01], 0.108, 0.95, 0.85, 1.03, 12).translate(0, 0.012, 0), 'head', c);
    S.add(sphereAt([0, bunY + 0.005, -0.012], 0.05, 1.05, 1.1, 1.05, 8), 'head', c);
    if (hw === 'yellowScarf') {
      // trailing knot ends
      S.add(boxAt([0.02, hy - 0.03, -0.11], 0.03, 0.14, 0.012, 0.3), 'head', c);
      S.add(boxAt([-0.02, hy - 0.04, -0.105], 0.03, 0.16, 0.012, 0.2), 'head', c);
    }
  }
  if (hw === 'yellowScarf' && ap.bandOnly) {
    S.add(lathe([[0.1, hy + 0.02], [0.104, hy + 0.06]], 14), 'head', 0xd8a820);
  }
  if (hw === 'official' || hw === 'crown') {
    // 進賢冠: black gauze cap with a slanted front ridge
    S.add(lathe([[0.075, hy + 0.06], [0.07, hy + 0.1], [0.05, hy + 0.13]], 10, 0.9, 1.1), 'head', 0x141414, 2);
    const ridge = boxAt([0, bunY + 0.05, 0.0], 0.1, 0.1, 0.012, -0.5);
    S.add(ridge, 'head', 0x141414, 2);
    for (const s of [-1, 1]) S.add(boxAt([s * 0.085, hy - 0.03, 0.01], 0.01, 0.12, 0.012), 'head', 0x141414);
    if (hw === 'crown') S.add(boxAt([0, bunY + 0.09, 0], 0.26, 0.012, 0.16), 'head', 0x141414, 2); // mianguan board
  }
  if (hw === 'helmet') {
    const hc = ap.helmetColor ?? 0x55585c;
    S.add(lathe([[0.001, hy + 0.13], [0.06, hy + 0.12], [0.1, hy + 0.07], [0.112, hy + 0.0], [0.114, hy - 0.02]], 14, 0.95, 1.05), 'head', hc, 1);
    // neck & cheek guards (lamellar curtain)
    const cur = lathe([[0.115, hy], [0.12, hy - 0.1], [0.125, hy - 0.15]], 14, 0.95, 1.05);
    // remove front: squash front vertices backwards
    const p = cur.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0.03) p.setZ(i, 0.03 + (p.getZ(i) - 0.03) * 0.1);
    cur.computeVertexNormals();
    S.add(cur, 'head', shade(hc, 0.9), 1);
    S.add(boxAt([0, hy + 0.135, 0], 0.012, 0.06, 0.012), 'head', ap.plume ?? 0x9a1a12);
    if (ap.plume) S.add(sphereAt([0, hy + 0.19, -0.02], 0.03, 0.8, 1.5, 0.8, 6), 'head', ap.plume);
  }
  if (hw === 'hood') S.add(sphereAt([0, hy + 0.01, -0.02], 0.118, 1, 1.12, 1.06, 12), 'head', ap.headCloth ?? 0x4a3a2a);
  if (hw === 'bamboo') {
    S.add(lathe([[0.001, hy + 0.2], [0.1, hy + 0.12], [0.26, hy + 0.05], [0.27, hy + 0.04]], 16), 'head', 0xb89a60);
  }
  if (hw === 'bun' || ap.female) {
    S.add(sphereAt([0, hy + 0.02, -0.1], 0.055, 1, 1, 1, 8), 'head', hair, 2);
    S.add(boxAt([0, hy + 0.03, -0.1], 0.16, 0.008, 0.008), 'head', 0xc8a860, 1); // hairpin
  }

  // beard
  const bc = ap.beardColor ?? hair;
  switch (ap.beard) {
    case 'goatee': {
      const tuft = new THREE.ConeGeometry(0.018, 0.09, 6);
      tuft.rotateX(Math.PI + 0.25); tuft.translate(0, 1.5, 0.088);
      S.add(tuft, 'head', bc, 2);
      for (const s2 of [-1, 1]) { const m = boxAt([0, 0, 0], 0.04, 0.008, 0.01); m.rotateZ(s2 * 0.35); m.translate(s2 * 0.022, 1.552, 0.098); S.add(m, 'head', bc, 2); }
      break;
    }
    case 'short':
      S.add(sphereAt([0, 1.53, 0.07], 0.07, 1.05, 0.7, 0.55, 10), 'head', bc, 2);
      break;
    case 'long': { // Guan Yu's magnificent beard (美髯)
      S.add(sphereAt([0, 1.54, 0.07], 0.072, 1.1, 0.85, 0.58, 10), 'head', bc, 2);
      const wedge = new THREE.ConeGeometry(0.065, 0.42, 8, 3);
      wedge.rotateX(Math.PI); wedge.scale(1, 1, 0.5); wedge.translate(0, -0.2, 0); wedge.rotateX(-0.18);
      wedge.translate(0, 1.52, 0.1);
      S.add(wedge, 'head', bc, 2);
      for (const [x, len, r] of [[-0.045, 0.3, 0.022], [0.045, 0.3, 0.022], [0, 0.5, 0.02]]) {
        const c = new THREE.ConeGeometry(r, len, 5);
        c.rotateX(Math.PI); c.translate(0, -len / 2, 0); c.rotateX(-0.15); c.rotateZ(x * 1.5);
        c.translate(x, 1.53, 0.095);
        S.add(c, 'head', bc, 2);
      }
      for (const s2 of [-1, 1]) S.add(boxAt([s2 * 0.028, 1.556, 0.1], 0.042, 0.011, 0.012), 'head', bc, 2); // moustache
      break;
    }
    case 'bristly': { // Zhang Fei's tiger whiskers
      S.add(sphereAt([0, 1.54, 0.065], 0.082, 1.12, 0.85, 0.62, 10), 'head', bc, 2);
      for (let i = 0; i < 9; i++) {
        const a = -0.9 + (i / 8) * 1.8;
        const sp = new THREE.ConeGeometry(0.012, 0.09, 4);
        sp.rotateX(Math.PI / 2 + 0.3); sp.rotateY(a);
        sp.translate(Math.sin(a) * 0.075, 1.52 - Math.abs(a) * 0.02, 0.07 + Math.cos(a) * 0.03);
        S.add(sp, 'head', bc, 2);
      }
      break;
    }
    case 'grey':
      S.add(sphereAt([0, 1.52, 0.07], 0.06, 1, 1.2, 0.55, 10), 'head', 0xb8b4ac, 2);
      break;
  }

  const geo = S.build();
  const mesh = new THREE.SkinnedMesh(geo, bodyMaterials());
  // skeleton
  const bones = BONES.map((name) => { const b = new THREE.Bone(); b.name = name; return b; });
  const byName = Object.fromEntries(bones.map((b) => [b.name, b]));
  for (const b of bones) {
    const par = PARENT[b.name];
    const wp = J[b.name];
    if (par) {
      const pp = J[par];
      b.position.set(wp[0] - pp[0], wp[1] - pp[1], wp[2] - pp[2]);
      byName[par].add(b);
    } else b.position.set(...wp);
  }
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  byName.head.scale.setScalar(ap.female ? 1.04 : 1.08);

  // face overlay (separate mesh with its own texture, parented to head bone)
  const faceOpts = {
    skin: '#' + new THREE.Color(skin).getHexString(), hair: '#' + new THREE.Color(hair).getHexString(),
    ...(ap.face || {}), seed: ap.seed ?? 1,
  };
  if (ap.female) faceOpts.female = true;
  const ftex = faceTexture(faceOpts);
  const fg = new THREE.SphereGeometry(0.1005, 36, 26, Math.PI * 0.0, Math.PI, 0.18 * Math.PI, 0.64 * Math.PI);
  sculptFace(fg, ap);
  // Rotate so the texture centre (u=0.25 of full sphere → here u=0.5 of the half) faces +Z
  const fm = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.75 }));
  fm.scale.set(0.9, 1.12, 1.0);
  fm.position.set(0, 1.615 - 1.55, 0.006);
  // remap uv: half-sphere phi range [0,π] corresponds to u' in [0,1]; sample face texture u in [0,0.5]
  const uv = fg.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, 0.18 + uv.getY(i) * 0.64);
  fm.castShadow = false;
  byName.head.add(fm);

  return { mesh, bones: byName, face: fm, joints: J };
}

// Relief on the face shell: nose, brow ridge, cheekbones, lips and chin, pushed out radially.
// Works in the shell's own UV space so the painted features stay registered with the relief.
function sculptFace(geo, ap) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const G = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));
  const nose = ap.female ? 0.8 : 1, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = uv.getX(i), y = uv.getY(i), dx = Math.abs(x - 0.5);
    const edge = Math.min(1, Math.min(x, 1 - x) / 0.12) * Math.min(1, Math.min(y, 1 - y) / 0.1);
    let d = 0.0025;
    d += 0.021 * nose * G(x, y, 0.5, 0.37, 0.035, 0.07) + 0.01 * nose * G(x, y, 0.5, 0.47, 0.022, 0.08); // tip + bridge
    d += 0.004 * G(x, y, 0.5, 0.33, 0.07, 0.025); // nostril wings
    d += 0.0045 * G(dx, y, 0.085, 0.63, 0.07, 0.035) - 0.0028 * G(dx, y, 0.086, 0.55, 0.035, 0.03); // brow / sockets
    d += 0.004 * G(dx, y, 0.17, 0.44, 0.07, 0.06); // cheekbones
    d += 0.0035 * G(x, y, 0.5, 0.245, 0.06, 0.025) + 0.002 * G(x, y, 0.5, 0.2, 0.05, 0.02); // lips
    d += 0.004 * G(x, y, 0.5, 0.06, 0.09, 0.06); // chin
    v.fromBufferAttribute(pos, i).normalize();
    pos.setXYZ(i, pos.getX(i) + v.x * d * edge, pos.getY(i) + v.y * d * edge, pos.getZ(i) + v.z * d * edge);
  }
  geo.computeVertexNormals();
}

// ---------------------------------------------------------------------------
// Appearance presets for historical figures & generic roles.
export const FIGURES = {
  liuBei: { height: 1.76, skin: 0xd4a47a, robe: 0x3a4a6a, trim: 0xc8b890, trousers: 0x2a2a34, outfit: 'robe', headwear: 'wrap', headCloth: 0x2a2a30, beard: 'goatee', bigEars: true, face: { smile: true, stern: false }, build: 1.0 },
  guanYu: { height: 1.92, beardColor: 0x1e1812, skin: 0xa8442e, robe: 0x2f6a45, trim: 0xc8a850, trousers: 0x2a3a2a, outfit: 'robe', headwear: 'greenScarf', beard: 'long', face: { redFace: true, stern: true }, build: 1.15 },
  zhangFei: { height: 1.84, beardColor: 0x1a1410, skin: 0x9a6a48, robe: 0x2a2420, trim: 0x8a5a2a, trousers: 0x1e1a18, outfit: 'soldier', headwear: 'wrap', headCloth: 0x1a1612, beard: 'bristly', face: { fierce: true }, build: 1.22 },
  liuYan: { height: 1.7, skin: 0xd8b088, robe: 0x5a1a1a, trim: 0xc8a850, outfit: 'official', headwear: 'official', beard: 'grey', hair: 0x8a8680, face: { wrinkles: true, stern: true } },
  zouJing: { height: 1.74, skin: 0xc49870, robe: 0x7a1c14, trim: 0x2a2020, outfit: 'soldier', headwear: 'helmet', armor: 'general', armorColor: 0x70665a, beard: 'short', plume: 0x9a1a12 },
  luZhi: { height: 1.8, skin: 0xd0a880, robe: 0x2a2a2a, trim: 0xa08850, outfit: 'official', headwear: 'official', beard: 'grey', hair: 0x9a9690, face: { wrinkles: true } },
  chengYuanzhi: { height: 1.82, skin: 0xb07a50, robe: 0x8a7020, trim: 0x4a3a10, outfit: 'soldier', headwear: 'yellowScarf', armor: 'leather', beard: 'short', face: { fierce: true }, build: 1.2 },
  dengMao: { height: 1.76, skin: 0xa87850, robe: 0x7a6420, outfit: 'soldier', headwear: 'yellowScarf', armor: 'leather', beard: 'stubble', face: { fierce: true } },
  zhangJiao: { height: 1.72, skin: 0xc8a078, robe: 0xc8a020, trim: 0x3a2a10, outfit: 'robe', headwear: 'yellowScarf', beard: 'grey', face: { wrinkles: true, stern: true } },
  caoCao: { height: 1.62, skin: 0xd0a47c, robe: 0x1c2436, trim: 0xa08850, outfit: 'soldier', headwear: 'helmet', armor: 'general', armorColor: 0x3a3a40, cape: 0x1a1a24, beard: 'short', face: { stern: true } },
  dongZhuo: { height: 1.74, skin: 0xc49468, robe: 0x5a1a3a, trim: 0xc8a850, outfit: 'official', headwear: 'official', beard: 'short', build: 1.4, face: { fierce: true } },
  luBu: { height: 1.95, skin: 0xd0a078, robe: 0x7a1414, outfit: 'soldier', headwear: 'helmet', armor: 'general', armorColor: 0x8a7a50, plume: 0xc01818, cape: 0xa01818, beard: 'none', face: { fierce: true }, build: 1.18 },
  gongsunZan: { height: 1.8, skin: 0xd4ac80, robe: 0xd8d4c8, outfit: 'soldier', headwear: 'helmet', armor: 'general', armorColor: 0xb8b8b8, cape: 0xe8e4d8, beard: 'short' },
  huangfuSong: { height: 1.76, skin: 0xc8a078, robe: 0x6a1a14, outfit: 'soldier', headwear: 'helmet', armor: 'general', armorColor: 0x5a5a58, beard: 'grey', face: { wrinkles: true } },
  yuanShao: { height: 1.78, skin: 0xd8b088, robe: 0x7a5a1a, trim: 0xe8c860, outfit: 'soldier', headwear: 'helmet', armor: 'general', armorColor: 0xb89a50, cape: 0x6a4a10, beard: 'goatee', face: { stern: true } },
  sunJian: { height: 1.8, skin: 0xc49870, robe: 0x8a1a12, outfit: 'soldier', headwear: 'wrap', headCloth: 0xb01810, armor: 'general', armorColor: 0x6a4a3a, cape: 0xa01a10, beard: 'short', face: { fierce: true } },
  huaXiong: { height: 1.95, skin: 0xa87a58, robe: 0x2a1a2a, outfit: 'soldier', headwear: 'helmet', armor: 'general', armorColor: 0x3a3a3e, cape: 0x3a1a3a, beard: 'bristly', build: 1.3, face: { fierce: true } },
  zhangLiao: { height: 1.8, skin: 0xc8a078, robe: 0x5a2a1a, outfit: 'soldier', headwear: 'helmet', armor: 'general', armorColor: 0x6a6a6e, cape: 0x5a1a14, beard: 'short', face: { stern: true } },
  gaoShun: { height: 1.78, skin: 0xb88a60, robe: 0x3a3a3a, outfit: 'soldier', headwear: 'helmet', armor: 'general', armorColor: 0x4a4a4e, cape: 0x2a2a2a, beard: 'short', face: { stern: true } },
  chenDeng: { height: 1.72, skin: 0xd8b088, robe: 0x2a3a4a, trim: 0xc8b890, outfit: 'official', headwear: 'official', beard: 'goatee' },
  zangBa: { height: 1.84, skin: 0xa8784e, robe: 0x4a3a2a, outfit: 'soldier', headwear: 'wrap', armor: 'lamellar', beard: 'bristly', build: 1.2, face: { fierce: true } },
  zhouYu: { height: 1.8, skin: 0xe0b890, robe: 0xa02a1a, trim: 0xe8c860, outfit: 'soldier', headwear: 'helmet', armor: 'general', armorColor: 0x8a6a4a, cape: 0xb02a1a, beard: 'none', face: { smile: true } },
  zhugeLiang: { height: 1.84, skin: 0xe0b890, robe: 0xe8e4d8, trim: 0x2a2a3a, outfit: 'robe', headwear: 'wrap', headCloth: 0x2a2a3a, beard: 'goatee', face: {} },
  sunQuan: { height: 1.76, skin: 0xd8ac80, robe: 0x5a2a5a, trim: 0xe8c860, outfit: 'official', headwear: 'official', beard: 'short', beardColor: 0x6a2a3a, face: { stern: true } },
  huangGai: { height: 1.74, skin: 0xb88a60, robe: 0x7a2a1a, outfit: 'soldier', headwear: 'helmet', armor: 'lamellar', beard: 'grey', hair: 0x9a948c, face: { wrinkles: true, stern: true } },
  caoPi: { height: 1.74, skin: 0xd8b088, robe: 0x1c2436, trim: 0xa08850, outfit: 'soldier', headwear: 'helmet', armor: 'general', armorColor: 0x3a3a44, cape: 0x1c1c2c, beard: 'goatee', face: { stern: true } },
  xiahouDun: { height: 1.84, skin: 0xc49870, robe: 0x1c2436, outfit: 'soldier', headwear: 'helmet', armor: 'general', armorColor: 0x4a4a52, cape: 0x1a1a2a, beard: 'short', face: { fierce: true } },
  emperorXian: { height: 1.66, skin: 0xe0b890, robe: 0x1a1a1a, trim: 0x9a1a12, outfit: 'official', headwear: 'crown', beard: 'none' },
};

const SKINS = [0xd4a47a, 0xc99a70, 0xbf8f65, 0xb58660, 0xd8ae86, 0xa87a54];
const HAIRS = [0x15100c, 0x1c1510, 0x241a12, 0x0e0b09];
const EARTH = [0x6e5e48, 0x7a6a50, 0x5e5040, 0x8a7a5e, 0x685a4a, 0x7e6c52, 0x5a4a3c, 0x746658];
const DYED = [0x3a4a6a, 0x6a3a3a, 0x3a5a4a, 0x5a4a6a, 0x7a5a3a, 0x4a4a4a, 0x2e3e5a];

// Generate a random appearance for a role.
export function randomAppearance(role, rng) {
  const base = { skin: rng.pick(SKINS), hair: rng.pick(HAIRS), seed: rng.int(1, 9999), height: rng.range(1.62, 1.8), build: rng.range(0.92, 1.12) };
  switch (role) {
    case 'farmer':
      return { ...base, outfit: 'peasant', robe: rng.pick(EARTH), trousers: rng.pick(EARTH), headwear: rng.pick(['topknot', 'wrap', 'wrap', 'bamboo']), beard: rng.pick(['none', 'stubble', 'short', 'goatee']), face: { stubble: rng.chance(0.4), wrinkles: rng.chance(0.3) } };
    case 'elder':
      return { ...base, outfit: 'robe', robe: rng.pick(EARTH), hair: 0x9a948c, headwear: 'wrap', beard: 'grey', face: { wrinkles: true } };
    case 'woman':
      return { ...base, female: true, height: rng.range(1.52, 1.64), build: 0.9, outfit: 'woman', robe: rng.pick([...DYED, ...EARTH]), trim: rng.pick([0x8a2a1a, 0x2a2a2a, 0xc8b890]), headwear: 'bun', beard: 'none', face: { smile: rng.chance(0.4) } };
    case 'merchant':
      return { ...base, outfit: 'merchant', robe: rng.pick(DYED), trim: 0xc8b890, headwear: 'wrap', beard: rng.pick(['goatee', 'short', 'none']), build: rng.range(1.0, 1.25), face: { smile: true } };
    case 'official':
      return { ...base, outfit: 'official', robe: rng.pick([0x1a1a1a, 0x3a1a1a, 0x1a2a3a]), trim: 0xa08850, headwear: 'official', beard: rng.pick(['goatee', 'short', 'grey']) };
    case 'guard':
    case 'soldier':
      return { ...base, outfit: 'soldier', robe: rng.pick([0x7a2a1e, 0x8a3020, 0x6a2418]), trousers: 0x3a3028, headwear: 'helmet', armor: 'lamellar', armorColor: rng.pick([0x6a6e72, 0x5a5e62, 0x707070]), beard: rng.pick(['none', 'stubble', 'short']), face: { stern: true } };
    case 'militia':
      return { ...base, outfit: 'soldier', robe: rng.pick(EARTH), trousers: rng.pick(EARTH), headwear: rng.pick(['wrap', 'wrap', 'helmet']), armor: rng.chance(0.4) ? 'leather' : 'none', beard: rng.pick(['none', 'stubble', 'short']), helmetColor: 0x5a4a3a };
    case 'yellowTurban':
      return { ...base, outfit: 'yellowTurban', robe: rng.pick([0x8a7a50, 0x7a6a44, 0x9a8a5a, 0x6e5e40]), trousers: rng.pick(EARTH), headwear: 'yellowScarf', armor: rng.chance(0.25) ? 'leather' : 'none', beard: rng.pick(['none', 'stubble', 'short', 'goatee']), face: { fierce: rng.chance(0.5), stubble: rng.chance(0.5) } };
    case 'bandit':
      return { ...base, outfit: 'bandit', robe: rng.pick([0x3a3028, 0x4a3a2a, 0x2a2420, 0x5a4a38]), trousers: 0x2a2420, headwear: rng.pick(['hood', 'wrap', 'topknot']), headCloth: rng.pick([0x2a2420, 0x4a2a1a, 0x3a3a2a]), armor: rng.chance(0.3) ? 'leather' : 'none', beard: rng.pick(['stubble', 'short', 'bristly']), face: { fierce: true, stubble: true } };
    case 'child':
      return { ...base, height: rng.range(1.1, 1.3), outfit: 'peasant', robe: rng.pick(EARTH), headwear: 'topknot', beard: 'none', build: 0.85 };
    default:
      return { ...base, outfit: 'peasant', robe: rng.pick(EARTH) };
  }
}
