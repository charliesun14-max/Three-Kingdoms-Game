// Terrain mesh (chunked for culling) with a splat-blended standard material.
import * as THREE from 'three';
import { Tex } from './TextureGen.js';
import { assets } from '../core/Assets.js';

const mix = (a, b, t) => a + (b - a) * t;

export class Terrain {
  constructor(hf, scene, quality = 1) {
    this.hf = hf;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.material = this.makeMaterial();
    this.buildChunks();
    this.buildHorizon();
    scene.add(this.group);
  }

  makeMaterial() {
    const hf = this.hf;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    const uniforms = {
      tGrass: { value: Tex.grass() },
      tDry: { value: Tex.dryGrass() },
      tLoess: { value: Tex.loess() },
      tRock: { value: Tex.rock() },
      tField: { value: Tex.field() },
      tRoad: { value: Tex.road() },
      tLitter: { value: Tex.litter() },
      tMask: { value: hf.maskTexture() },
      tWet: { value: hf.wetTexture() },
      uHalf: { value: hf.half },
      uSize: { value: hf.size },
      uSeason: { value: 0.0 }, // 0 summer .. 1 autumn
      uWetness: { value: 0 },
      uCloudT: { value: 0 },
      uCloudK: { value: 0 },
      uRockTint: { value: new THREE.Vector3(...(hf.region.rockTint || [1, 1, 1])) },
      // optional photo-scanned layers from the asset manifest
      tLitterN: { value: assets.texture('litter', 'normal') },
      tLitterR: { value: assets.texture('litter', 'roughness') },
      tMud: { value: assets.texture('mud') },
      tMudN: { value: assets.texture('mud', 'normal') },
      tTown: { value: Tex.packedEarth() },
      tMudR: { value: assets.texture('mud', 'roughness') },
      tGravel: { value: assets.texture('gravel') },
      tGravelN: { value: assets.texture('gravel', 'normal') },
      tGravelR: { value: assets.texture('gravel', 'roughness') },
      tRockC: { value: assets.texture('terrainRock') },
      tRockN: { value: assets.texture('terrainRock', 'normal') },
      tRockR: { value: assets.texture('terrainRock', 'roughness') },
    };
    const defines = {};
    if (this.quality >= 2) defines.DETAIL_NORMALS = '';
    if (uniforms.tLitterN.value) defines.HAS_LITTER_N = '';
    if (uniforms.tLitterR.value) defines.HAS_LITTER_R = '';
    if (uniforms.tMud.value) defines.HAS_MUD = '';
    if (uniforms.tMudN.value) defines.HAS_MUD_N = '';
    // scanned surfaces: gravel (roads, yards, river banks) and triplanar rock for slopes
    if (uniforms.tGravel.value && uniforms.tGravelN.value && uniforms.tGravelR.value) defines.HAS_GRAVEL = '';
    if (uniforms.tRockC.value && uniforms.tRockN.value && uniforms.tRockR.value) defines.HAS_ROCK = '';
    if (uniforms.tMudR.value) defines.HAS_MUD_R = '';
    for (const k of ['tGravel', 'tGravelN', 'tGravelR', 'tRockC', 'tRockN', 'tRockR', 'tMudR', 'tMud', 'tMudN', 'tLitterN', 'tLitterR']) {
      if (uniforms[k].value) uniforms[k].value.anisotropy = 16;
    }
    for (const k of ['tGrass', 'tDry', 'tLoess', 'tRock', 'tField', 'tRoad', 'tLitter', 'tTown']) uniforms[k].value.anisotropy = 16;
    mat.defines = defines;
    this.uniforms = uniforms;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying vec3 vWNorm;
uniform sampler2D tGrass, tDry, tLoess, tRock, tField, tRoad, tLitter, tMask, tWet;
uniform sampler2D tLitterN, tLitterR, tMud, tMudN, tTown;
uniform sampler2D tMudR, tGravel, tGravelN, tGravelR, tRockC, tRockN, tRockR;
// partial-derivative blend of a tangent-space normal onto another, by weight
vec3 blendN(vec3 a, vec3 b, float w) {
  b = normalize(mix(vec3(0.0, 0.0, 1.0), b, w));
  return normalize(vec3(a.xy / max(a.z, 0.2) + b.xy / max(b.z, 0.2), 1.0));
}
uniform float uHalf, uSize, uSeason;
uniform vec3 uRockTint;
uniform float uWetness;
uniform float uCloudT, uCloudK;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
// Tile-breaking lookup (after Inigo Quilez): a slowly varying noise picks between two offset copies of the
// texture, so a 2-3 m photo tile never repeats visibly. Gradients are taken once so mips stay continuous.
float ntK, ntF; vec2 ntOa, ntOb;
void noTileSetup(vec2 x){
  float k = vnoise(x * 0.37) * 6.0;
  ntF = fract(k);
  float ia = floor(k), ib = ia + 1.0;
  ntOa = sin(vec2(3.0, 7.0) * ia); ntOb = sin(vec2(3.0, 7.0) * ib);
  ntK = smoothstep(0.25, 0.75, ntF);
}
vec4 noTile(sampler2D t, vec2 x){
  vec2 dx = dFdx(x), dy = dFdy(x);
  return mix(textureGrad(t, x + ntOa, dx, dy), textureGrad(t, x + ntOb, dx, dy), ntK);
}
// average colour of a texture (its last mip)
vec3 avgOf(sampler2D t){ return textureLod(t, vec2(0.5), 12.0).rgb; }
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 triW(vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
vec3 tex2(sampler2D t, vec2 p){
  // two scales to break tiling
  vec3 a = texture2D(t, p * 0.19).rgb;
  vec3 b = texture2D(t, p * 0.043 + 0.37).rgb;
  return mix(a, b, 0.38);
}
`)
        .replace('#include <map_fragment>', `
  vec2 wp = vWPos.xz;
  vec2 muv = (wp + uHalf) / uSize;
  vec4 m = texture2D(tMask, muv);
  float wet = texture2D(tWet, muv).r;
  float slope = 1.0 - clamp(vWNorm.y, 0.0, 1.0);
  float n1 = vnoise(wp * 0.02), n2 = vnoise(wp * 0.11 + 3.1), n3 = vnoise(wp*0.5);
  vec3 grass = tex2(tGrass, wp);
  vec3 dry = tex2(tDry, wp);
  vec3 loess = tex2(tLoess, wp);
  vec3 rock = tex2(tRock, wp * 0.6 + vec2(0.0, vWPos.y*0.1)) * uRockTint;
  vec3 field = texture2D(tField, wp * 0.09).rgb;
  vec3 road = texture2D(tRoad, wp * 0.16).rgb;
  vec3 litter = tex2(tLitter, wp);
  float wLitter = 0.0, wMud = 0.0, wGravel = 0.0;
  float camD = length(vWPos - cameraPosition);
  float near = 1.0 - smoothstep(30.0, 140.0, camD); // photo detail fades out where tiling would show
  noTileSetup(wp * 0.4);
#ifdef HAS_MUD
  // photo detail: the meadow soil scan modulates every procedural ground layer near the camera
  vec3 soil = noTile(tMud, wp * 0.42).rgb;
  float det = clamp(lum(soil) / max(lum(avgOf(tMud)), 0.05), 0.35, 1.9);
  float detK = near * 0.55;
  grass *= mix(1.0, det, detK); dry *= mix(1.0, det, detK); loess *= mix(1.0, det, detK * 0.8); field *= mix(1.0, det, detK * 0.7);
  // patches where the clover-and-leaf soil itself shows between the grass
  float soilShow = smoothstep(0.55, 0.85, n2 * 0.6 + n3 * 0.5) * 0.55 * near;
  grass = mix(grass, soil * vec3(0.92, 1.02, 0.86), soilShow);
#endif
#ifdef HAS_GRAVEL
  vec3 gravel = noTile(tGravel, wp * 0.55).rgb;
  road = mix(road, gravel * vec3(1.02, 0.98, 0.92), 0.55 * mix(0.6, 1.0, near));
#endif
  // base meadow: grass patched with dry grass and bare loess
  float dryAmt = smoothstep(0.5, 0.95, n1 * 0.8 + n2 * 0.3 + uSeason * 0.5);
  vec3 col = mix(grass, dry, dryAmt * 0.45);
  float bare = smoothstep(0.7, 0.9, n2 * 0.7 + n3 * 0.3) * 0.35;
  col = mix(col, loess, bare);
  // hills: under the hillside woods the ground turns to dark leaf litter and moss
  float alt = smoothstep(30.0, 60.0, vWPos.y + n1 * 12.0);
  float wood = alt * smoothstep(0.42, 0.68, n1 * 0.7 + n2 * 0.3);
  col = mix(col, litter * vec3(0.78, 0.84, 0.7), wood * 0.7);
  wLitter = max(wLitter, wood * 0.7);
  col = mix(col, mix(grass, dry, 0.35) * 0.92, alt * (1.0 - wood) * 0.35);
  col = mix(col, litter, m.a * 0.85);
  wLitter = max(wLitter, m.a * 0.85);
  col = mix(col, field, m.g);
  vec3 town = mix(texture2D(tTown, wp * 0.24).rgb, texture2D(tTown, wp * 0.061 + 0.4).rgb, 0.3);
  town = mix(town, loess * vec3(0.95, 0.93, 0.9), 0.25 + 0.3 * n2);
#ifdef HAS_GRAVEL
  // trodden yards and streets: packed loess with grit and pebbles worked into it
  float grit = smoothstep(0.25, 0.7, n2 * 0.6 + n3 * 0.5);
  town = mix(town * mix(1.0, clamp(lum(gravel) / max(lum(avgOf(tGravel)), 0.05), 0.35, 1.9), 0.85 * near), gravel * vec3(0.98, 0.9, 0.78), grit * 0.6) * 0.9;
#endif
  col = mix(col, town, m.b * 0.92);
  float wTown = m.b * 0.92 * (1.0 - m.r);
  col = mix(col, road, m.r);
#ifdef HAS_GRAVEL
  wGravel = max(m.r * 0.6, wTown * 0.7);
#endif
  wLitter *= (1.0 - m.g) * (1.0 - m.b * 0.9) * (1.0 - m.r);
  // rock on steep slopes
  float rk = smoothstep(0.22, 0.42, slope + (n3 - 0.5) * 0.12);
#ifdef HAS_ROCK
  {
    // scanned rock, projected along the three world axes so steep faces don't stretch
    vec3 tw = triW(normalize(vWNorm)); vec3 rp = vWPos * 0.3;
    vec3 rc = texture2D(tRockC, rp.zy).rgb * tw.x + texture2D(tRockC, rp.xz).rgb * tw.y + texture2D(tRockC, rp.xy).rgb * tw.z;
    // keep the region's rock colour at large scale, the scan's detail up close
    vec3 scan = rc / max(avgOf(tRockC), vec3(0.05)) * lum(rock) * 1.05;
    rock = mix(rock, mix(scan, rc * uRockTint, 0.35), mix(0.55, 0.95, near));
  }
#endif
  col = mix(col, rock, rk);
  wLitter *= 1.0 - rk;
  // wet banks: darker mud and sand
#ifdef HAS_MUD
  vec3 mud = mix(texture2D(tMud, wp * 0.21).rgb, texture2D(tMud, wp * 0.047 + 0.3).rgb, 0.35) * vec3(0.82, 0.8, 0.78);
#else
  vec3 mud = loess * vec3(0.55, 0.52, 0.48);
#endif
#ifdef HAS_GRAVEL
  // river banks: wet sand and pebbles at the waterline, mud above
  float bank = smoothstep(0.5, 0.95, wet) * smoothstep(0.3, 0.6, n3 * 0.7 + n2 * 0.3);
  mud = mix(mud, gravel * vec3(0.78, 0.76, 0.72), bank * 0.8);
  wGravel = max(wGravel, bank * wet * 0.8);
#endif
  col = mix(col, mud, wet * 0.8);
  wMud = wet * 0.8 * (1.0 - wGravel);
  wLitter *= 1.0 - wMud;
  vec2 rockUv = (wp * 0.6 + vec2(0.0, vWPos.y * 0.1)) * 0.19;
  // macro variation
  col *= 0.92 + 0.16 * n1;
  col *= 1.0 - uWetness * 0.28;
  diffuseColor.rgb *= col;
  // drifting cloud shadows (they only block the sun, so applied to direct light below)
  vec2 cp = wp / 190.0 + vec2(uCloudT * 0.011, uCloudT * 0.004);
  float cn = vnoise(cp) * 0.55 + vnoise(cp * 2.3 + 7.1) * 0.3 + vnoise(cp * 5.1 + 1.7) * 0.15;
  float cloudSh = 1.0 - uCloudK * smoothstep(0.5, 0.68, cn);
`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  reflectedLight.directDiffuse *= cloudSh;
  reflectedLight.directSpecular *= cloudSh;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(0.95, 0.55, max(wet * 0.7, uWetness * 0.6));
#ifdef HAS_LITTER_R
  roughnessFactor = mix(roughnessFactor, texture2D(tLitterR, wp * 0.19).g, wLitter * 0.8);
#endif
#ifdef HAS_GRAVEL
  roughnessFactor = mix(roughnessFactor, noTile(tGravelR, wp * 0.55).r * (1.0 - wet * 0.4), wGravel);
#endif
#ifdef HAS_MUD_R
  roughnessFactor = mix(roughnessFactor, noTile(tMudR, wp * 0.42).r * 0.9, wMud * 0.7);
#endif
#ifdef HAS_ROCK
  roughnessFactor = mix(roughnessFactor, texture2D(tRockR, vWPos.xz * 0.3).r, rk * 0.8);
#endif`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef DETAIL_NORMALS
  {
    // tangent frame for a heightfield: u along world +X, v along world +Z
    vec3 wn = normalize(vWNorm);
    vec3 T = normalize(vec3(1.0, 0.0, 0.0) - wn * wn.x);
    vec3 Bt = cross(T, wn);
    vec3 tn = vec3(0.0, 0.0, 1.0);
  #ifdef HAS_LITTER_N
    tn = blendN(tn, texture2D(tLitterN, wp * 0.19).xyz * 2.0 - 1.0, wLitter);
  #endif
  #ifdef HAS_MUD_N
    tn = blendN(tn, texture2D(tMudN, wp * 0.21).xyz * 2.0 - 1.0, wMud);
  #endif
    // packed earth: pebbles and ruts in relief
    if (wTown > 0.02) {
      vec2 tu = wp * 0.24; float e2 = 0.004;
      float t0 = dot(texture2D(tTown, tu).rgb, vec3(0.333));
      float tx = dot(texture2D(tTown, tu + vec2(e2, 0.0)).rgb, vec3(0.333));
      float ty = dot(texture2D(tTown, tu + vec2(0.0, e2)).rgb, vec3(0.333));
      tn = blendN(tn, vec3((t0 - tx) * 6.0, (t0 - ty) * 6.0, 1.0), wTown);
    }
  #ifdef HAS_GRAVEL
    if (wGravel > 0.01) tn = blendN(tn, noTile(tGravelN, wp * 0.55).xyz * 2.0 - 1.0, wGravel);
  #endif
  #ifdef HAS_ROCK
    if (rk > 0.01) {
      // triplanar normal (whiteout blend), brought back into this heightfield's tangent frame
      vec3 tw = triW(wn); vec3 rp = vWPos * 0.3;
      vec3 nx = texture2D(tRockN, rp.zy).xyz * 2.0 - 1.0, ny = texture2D(tRockN, rp.xz).xyz * 2.0 - 1.0, nz = texture2D(tRockN, rp.xy).xyz * 2.0 - 1.0;
      nx = vec3(nx.xy + wn.zy, abs(nx.z) * wn.x);
      ny = vec3(ny.xy + wn.xz, abs(ny.z) * wn.y);
      nz = vec3(nz.xy + wn.xy, abs(nz.z) * wn.z);
      vec3 rwn = normalize(nx.zyx * tw.x + ny.xzy * tw.y + nz.xyz * tw.z);
      tn = blendN(tn, vec3(dot(rwn, T), dot(rwn, Bt), max(dot(rwn, wn), 0.2)), rk);
    }
  #else
    // rock faces: relief from the rock texture's own luminance (finite differences, mip-filtered)
    if (rk > 0.01) {
      float e = 0.006;
      float h0 = dot(texture2D(tRock, rockUv).rgb, vec3(0.333));
      float hx = dot(texture2D(tRock, rockUv + vec2(e, 0.0)).rgb, vec3(0.333));
      float hy = dot(texture2D(tRock, rockUv + vec2(0.0, e)).rgb, vec3(0.333));
      tn = blendN(tn, vec3((h0 - hx) * 7.0, (h0 - hy) * 7.0, 1.0), rk);
    }
  #endif
    vec3 wN = normalize(T * tn.x + Bt * tn.y + wn * tn.z);
    normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
  }
#endif`);
    };
    mat.customProgramCacheKey = () => 'terrainSplat' + Object.keys(defines).join('');
    return mat;
  }

  buildChunks() {
    const hf = this.hf;
    const chunkCells = 50; // 100m chunks at 2m cells
    const nChunks = Math.ceil((hf.N - 1) / chunkCells);
    for (let cj = 0; cj < nChunks; cj++) {
      for (let ci = 0; ci < nChunks; ci++) {
        const i0 = ci * chunkCells, j0 = cj * chunkCells;
        const i1 = Math.min(hf.N - 1, i0 + chunkCells), j1 = Math.min(hf.N - 1, j0 + chunkCells);
        const w = i1 - i0 + 1, d = j1 - j0 + 1;
        const pos = new Float32Array(w * d * 3);
        const nor = new Float32Array(w * d * 3);
        const uv = new Float32Array(w * d * 2);
        let p = 0, q = 0;
        const n = new THREE.Vector3();
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = hf.toWorld(i), z = hf.toWorld(j);
          pos[p] = x; pos[p + 1] = hf.H[hf.idx(i, j)]; pos[p + 2] = z;
          hf.getNormal(x, z, n);
          nor[p] = n.x; nor[p + 1] = n.y; nor[p + 2] = n.z;
          p += 3;
          uv[q++] = x / hf.size + 0.5; uv[q++] = z / hf.size + 0.5;
        }
        const idx = [];
        for (let j = 0; j < d - 1; j++) for (let i = 0; i < w - 1; i++) {
          const a = j * w + i, b = a + 1, c = a + w, e = c + 1;
          idx.push(a, c, b, b, c, e);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeBoundingSphere();
        g.computeBoundingBox();
        const mesh = new THREE.Mesh(g, this.material);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
      }
    }
  }

  // A low-res ring of distant mountains beyond the playable area for a real horizon.
  buildHorizon() {
    const hf = this.hf;
    const inner = hf.half * 0.98, outer = hf.half * 6;
    const segA = 160, segR = 26;
    const pos = [], col = [], idx = [];
    const n = hf.noise2;
    for (let r = 0; r <= segR; r++) {
      const t = r / segR;
      const rad = inner + (outer - inner) * Math.pow(t, 1.6);
      for (let a = 0; a <= segA; a++) {
        const ang = (a / segA) * Math.PI * 2;
        let x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
        // square-ish inner edge to meet terrain border
        const sq = Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
        if (r === 0) { x /= sq; z /= sq; }
        const northness = Math.max(0, -Math.sin(ang));
        const ridge = 0.55 * n.ridged(x / 1400, z / 1400, 4) + 0.45 * (0.5 + 0.5 * n.fbm(x / 700, z / 700, 4));
        let h = (50 + northness * 170) * ridge * Math.sin(Math.min(1, t * 1.3) * Math.PI) + 15;
        if (r === 0) h = hf.getHeight(Math.max(-hf.half, Math.min(hf.half, x)), Math.max(-hf.half, Math.min(hf.half, z))) - 2;
        if (r === segR) h = -40;
        pos.push(x, h, z);
        // dark forest on the flanks, paler rock and meadow toward the crests
        const crest = Math.min(1, Math.max(0, (h - 60) / 120));
        const fr = 0.5 + 0.5 * n.fbm(x / 300, z / 300, 3);
        const forest = (1 - crest) * (fr > 0.42 ? 1 : 0.55);
        col.push(mix(0.2, 0.42, crest) * (1 - forest * 0.45), mix(0.26, 0.4, crest) * (1 - forest * 0.25), mix(0.14, 0.32, crest) * (1 - forest * 0.4));
      }
    }
    for (let r = 0; r < segR; r++) for (let a = 0; a < segA; a++) {
      const i0 = r * (segA + 1) + a, i1 = i0 + 1, i2 = i0 + segA + 1, i3 = i2 + 1;
      idx.push(i0, i1, i2, i1, i3, i2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: 0xffffff });
    // canopy speckle so the far forests have texture before the haze takes them
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvHP = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vHP;
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float hn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x), mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x), f.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  float sp = hn(vHP.xz * 0.09) * 0.6 + hn(vHP.xz * 0.33) * 0.4;
  diffuseColor.rgb *= 0.78 + 0.42 * sp;`);
    };
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = false;
    mesh.name = 'horizon';
    this.group.add(mesh);
  }
}
