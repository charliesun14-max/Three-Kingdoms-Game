// Shared materials for architecture and props.
import * as THREE from 'three';
import { Tex } from './TextureGen.js';

let M = null;

function latticeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8cdb0'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#3a2616'; g.lineWidth = 5;
  for (let i = 0; i <= 128; i += 21) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
  g.lineWidth = 10; g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function doorTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a2c18'; g.fillRect(0, 0, 128, 256);
  for (let x = 0; x < 128; x += 16) { g.fillStyle = x % 32 ? '#553420' : '#44281a'; g.fillRect(x, 0, 14, 256); }
  g.fillStyle = '#2a180c'; g.fillRect(62, 0, 4, 256);
  g.fillStyle = '#6a5030'; for (const y of [40, 216]) g.fillRect(0, y, 128, 8);
  // bronze door rings (pushou)
  g.fillStyle = '#9a7a3a'; for (const x of [48, 80]) { g.beginPath(); g.arc(x, 128, 7, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function materials() {
  if (M) return M;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  M = {
    plaster: std({ map: Tex.plaster(), color: 0xf0e8d8 }),
    rammed: std({ map: Tex.rammedEarth(), color: 0xe8d8c0 }),
    mudbrick: std({ map: Tex.mudPlaster(), color: 0xe0d4c0 }),
    brick: std({ map: Tex.mudBrick(), color: 0xd8ccb8 }),
    wood: std({ map: Tex.wood(), color: 0x8a6a50 }),
    darkwood: std({ map: Tex.wood(), color: 0x4a3426 }),
    lacquer: std({ map: Tex.lacquer(), color: 0xc04030, roughness: 0.55 }),
    roofTile: std({ map: Tex.roofTile(), color: 0x8a8e96, side: THREE.DoubleSide, roughness: 0.75 }),
    thatch: std({ map: Tex.thatch(), color: 0xd8c8a0, side: THREE.DoubleSide }),
    stone: std({ map: Tex.stone(), color: 0xc8c4bc }),
    cloth: std({ map: Tex.cloth(), vertexColors: true, side: THREE.DoubleSide, roughness: 1 }),
    dark: std({ color: 0x151010, roughness: 1 }),
    lattice: std({ map: latticeTexture(), roughness: 0.9 }),
    door: std({ map: doorTexture(), roughness: 0.8 }),
    straw: std({ map: Tex.thatch(), color: 0xe8d090 }),
    pottery: std({ color: 0x8a5a3a, roughness: 0.7 }),
    iron: std({ color: 0x55585c, metalness: 0.7, roughness: 0.45 }),
    bronze: std({ color: 0x9a7a3a, metalness: 0.8, roughness: 0.35 }),
    fire: new THREE.MeshBasicMaterial({ color: 0xffa040 }),
    ground: std({ map: Tex.loess(), color: 0xd0c0a0 }),
    vcol: std({ vertexColors: true, roughness: 0.9 }),
  };
  // surface relief from each texture's own shading: tiles, thatch straws, wood grain, mortar
  const relief = { plaster: 0.6, rammed: 2.6, mudbrick: 1.0, brick: 1.6, wood: 1.1, darkwood: 1.1, roofTile: 2.2, thatch: 2.4, stone: 1.8, straw: 2.0, ground: 1.0, door: 0.8 };
  for (const [k, sc] of Object.entries(relief)) {
    const m = M[k];
    if (!m?.map) continue;
    m.bumpMap = m.map;
    m.bumpScale = sc;
  }
  return M;
}
