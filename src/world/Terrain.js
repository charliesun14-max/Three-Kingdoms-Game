// Terrain mesh (chunked for culling) with a splat-blended standard material.
import * as THREE from 'three';
import { Tex } from './TextureGen.js';

export class Terrain {
  constructor(hf, scene) {
    this.hf = hf;
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
    };
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
uniform float uHalf, uSize, uSeason;
uniform vec3 uRockTint;
uniform float uWetness;
uniform float uCloudT, uCloudK;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
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
  // base meadow: grass patched with dry grass and bare loess
  float dryAmt = smoothstep(0.5, 0.95, n1 * 0.8 + n2 * 0.3 + uSeason * 0.5);
  vec3 col = mix(grass, dry, dryAmt * 0.45);
  float bare = smoothstep(0.7, 0.9, n2 * 0.7 + n3 * 0.3) * 0.35;
  col = mix(col, loess, bare);
  // high altitude: sparser, rockier soil
  float alt = smoothstep(45.0, 90.0, vWPos.y + n1 * 12.0);
  col = mix(col, mix(dry, loess, 0.5), alt * 0.6);
  col = mix(col, litter, m.a * 0.85);
  col = mix(col, field, m.g);
  col = mix(col, loess * vec3(0.95,0.93,0.9), m.b * 0.9);
  col = mix(col, road, m.r);
  // rock on steep slopes
  float rk = smoothstep(0.22, 0.42, slope + (n3 - 0.5) * 0.12);
  col = mix(col, rock, rk);
  // wet banks: darker mud and sand
  vec3 mud = loess * vec3(0.55, 0.52, 0.48);
  col = mix(col, mud, wet * 0.8);
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
  roughnessFactor = mix(0.95, 0.55, max(wet * 0.7, uWetness * 0.6));`);
    };
    mat.customProgramCacheKey = () => 'terrainSplat';
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
        const c = 0.28 + 0.18 * ridge;
        col.push(c * 0.9, c * 0.98, c * 0.82);
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
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: 0x8a8a6a });
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = false;
    mesh.name = 'horizon';
    this.group.add(mesh);
  }
}
