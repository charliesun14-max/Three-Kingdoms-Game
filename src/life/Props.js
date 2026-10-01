// Small procedural props for town life: tools people carry, gaming pieces, animals of the market.
// Hand props have their grip at the origin and extend along +Y (like weapons), so CharacterModel
// can aim them along a direction in character space.
import * as THREE from 'three';
import { Batch } from '../world/Buildings.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function built(fn) {
  const B = new Batch();
  B.frame(0, 0, 0, 0);
  fn(B);
  const g = new THREE.Group();
  for (const m of B.build(g)) { m.matrixAutoUpdate = true; m.castShadow = true; }
  return g;
}

export const PROPS = {
  broom: () => built((B) => {
    B.cyl('wood', 0, -0.35, 0, 0.018, 1.4, { seg: 6 });
    B.cyl('straw', 0, 1.0, 0, 0.05, 0.5, { r2: 0.16, seg: 8 });
  }),
  // 扁擔 carrying pole with a basket hanging from each end (worn on the shoulder)
  pole: () => built((B) => {
    B.cyl('wood', 0, -0.85, 0, 0.022, 1.7, { rx: Math.PI / 2, seg: 6 }); // centred: cyl() lifts by h/2 before rotating
    for (const z of [-0.78, 0.78]) {
      B.beam('straw', V(0, 0, z), V(0, -0.55, z), 0.008);
      B.cyl('straw', 0, -0.95, z, 0.2, 0.4, { r2: 0.24, seg: 10, color: 0xc8a868 });
      B.cyl('dark', 0, -0.57, z, 0.2, 0.02, { seg: 10, color: 0x6a5a2a });
    }
  }),
  basket: () => built((B) => {
    B.cyl('straw', 0, 0, 0, 0.22, 0.28, { r2: 0.27, seg: 12, color: 0xc0a060 });
    B.sphere('pottery', 0.05, 0.28, 0.03, 0.09, { color: 0xd8c080 });
    B.sphere('pottery', -0.07, 0.27, -0.04, 0.08, { color: 0x9a6a3a });
  }),
  sack: () => built((B) => {
    B.sphere('cloth', 0, 0, 0, 0.26, { sy: 0.62, color: 0xc8b48a });
    B.cyl('cloth', 0.22, 0, 0, 0.06, 0.12, { rz: Math.PI / 2, seg: 6, color: 0xb8a47a });
  }),
  rod: () => built((B) => {
    B.cyl('wood', 0, -0.4, 0, 0.018, 1.4, { r2: 0.014, seg: 6, color: 0x8a7040 });
    B.cyl('wood', 0, 1.0, 0, 0.014, 2.6, { r2: 0.005, seg: 5, color: 0xa08850 });
  }),
  axe: () => built((B) => {
    B.cyl('wood', 0, -0.15, 0, 0.022, 0.85, { seg: 6 });
    B.box('iron', 0, 0.58, 0.06, 0.03, 0.14, 0.2);
  }),
  cup: () => built((B) => { B.cyl('lacquer', 0, 0, 0.03, 0.035, 0.06, { r2: 0.045, seg: 10 }); }),
  // seven-stringed zither laid on the ground before a seated player
  qin: () => built((B) => {
    B.box('lacquer', 0, 0.05, 0, 1.2, 0.06, 0.2, { color: 0x2a1410 });
    for (let i = 0; i < 7; i++) B.box('bronze', 0, 0.085, -0.075 + i * 0.025, 1.1, 0.004, 0.004);
    for (const x of [-0.5, 0.5]) B.box('darkwood', x, 0, 0, 0.06, 0.05, 0.16);
  }),
  // bronze 投壺 pot with a long neck, and the arrows thrown into it
  pot: () => built((B) => {
    B.sphere('bronze', 0, 0.22, 0, 0.2, { sy: 1.1, color: 0x8a6a3a });
    B.cyl('bronze', 0, 0.38, 0, 0.06, 0.36, { r2: 0.05, seg: 12, color: 0x8a6a3a });
    B.cyl('bronze', 0, 0.72, 0, 0.07, 0.03, { seg: 12, color: 0x9a7a4a });
    for (const x of [-0.06, 0.06]) B.cyl('bronze', x * 1.6, 0.58, 0, 0.025, 0.1, { rz: Math.PI / 2, seg: 8 });
  }),
  arrow: () => built((B) => {
    B.cyl('wood', 0, 0, 0, 0.008, 0.75, { seg: 5, color: 0xb89a60 });
    B.box('cloth', 0, 0.02, 0, 0.004, 0.09, 0.04, { color: 0xe8e0d0 });
  }),
  // 箭靶 straw target on a stand, painted with rings
  target: () => {
    const g = built((B) => {
      for (const s of [-1, 1]) B.beam('darkwood', V(s * 0.5, 0, -0.3), V(s * 0.35, 1.9, 0.05), 0.05);
      B.beam('darkwood', V(0, 0, -0.5), V(0, 1.6, 0.0), 0.05);
    });
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#c8b078'; x.fillRect(0, 0, 128, 128);
    for (const [r, col] of [[60, '#e8dcc0'], [46, '#1a1a1a'], [32, '#e8dcc0'], [18, '#a8281a'], [7, '#e8c040']]) { x.fillStyle = col; x.beginPath(); x.arc(64, 64, r, 0, 7); x.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.18, 24), [new THREE.MeshStandardMaterial({ color: 0xb89a60, roughness: 1 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })]);
    face.rotation.x = Math.PI / 2; face.position.set(0, 1.45, 0.08);
    face.castShadow = true;
    g.add(face);
    g.userData.center = new THREE.Vector3(0, 1.45, 0.08);
    return g;
  },
  basin: () => built((B) => {
    B.cyl('wood', 0, 0, 0, 0.38, 0.22, { r2: 0.42, seg: 14 });
    B.cyl('dark', 0, 0.18, 0, 0.36, 0.02, { seg: 14, color: 0x4a6a78 });
    B.box('cloth', 0.15, 0.2, 0.05, 0.3, 0.02, 0.22, { color: 0x6a7a9a });
  }),
  block: () => built((B) => {
    B.cyl('wood', 0, 0, 0, 0.3, 0.45, { seg: 10, color: 0x8a6a40 });
  }),
  log: () => built((B) => { B.cyl('wood', 0, 0, 0, 0.1, 0.5, { seg: 8, color: 0x9a7a50 }); }),
  ball: (color = 0xc83020) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    m.castShadow = true;
    return m;
  },
  // 雞 a fighting cock: body, neck, comb, tail plumes and legs; parts named for animation
  rooster: (color = 0x8a3a1a) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 0.4, metalness: 0.2 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc81a10, roughness: 0.6 });
    const yel = new THREE.MeshStandardMaterial({ color: 0xd8a830, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat); body.scale.set(0.8, 0.85, 1.15); body.position.y = 0.3;
    const neck = new THREE.Group(); neck.position.set(0, 0.38, 0.12);
    const nk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.18, 8), mat); nk.position.y = 0.08; nk.rotation.x = 0.4; neck.add(nk);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat); head.position.set(0, 0.18, 0.05); neck.add(head);
    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.08), red); comb.position.set(0, 0.25, 0.05); neck.add(comb);
    const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), red); wattle.position.set(0, 0.13, 0.1); neck.add(wattle);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), yel); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.18, 0.12); neck.add(beak);
    const tail = new THREE.Group(); tail.position.set(0, 0.38, -0.16);
    for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.28, 0.06), dark); f.position.set((i - 2) * 0.025, 0.12, -0.04); f.rotation.x = -0.5 - i * 0.12; tail.add(f); }
    const legs = [];
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 5), yel); l.position.set(s * 0.05, 0.1, 0); g.add(l); legs.push(l); }
    g.add(body, neck, tail);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.userData = { body, neck, tail, legs };
    return g;
  },
  // simple 舞獅/acrobat stool and a storyteller's low table
  stool: () => built((B) => { B.cyl('darkwood', 0, 0, 0, 0.18, 0.42, { seg: 10 }); }),
  lowTable: () => built((B) => {
    B.box('darkwood', 0, 0.3, 0, 0.9, 0.05, 0.5);
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) B.box('darkwood', x * 0.4, 0, z * 0.2, 0.05, 0.3, 0.05);
    B.box('cloth', 0.15, 0.34, 0, 0.25, 0.02, 0.18, { color: 0xe8dcc0 });
  }),
  bowl: () => built((B) => { B.cyl('pottery', 0, 0, 0, 0.07, 0.05, { r2: 0.11, seg: 12, color: 0x6a4a3a }); }),
  ring: (r = 2.2) => built((B) => {
    // low woven fence ring for the cock pit
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
      B.beam('straw', V(Math.cos(a) * r, 0.25, Math.sin(a) * r), V(Math.cos(b) * r, 0.25, Math.sin(b) * r), 0.12, { color: 0xb09050 });
    }
  }),
};

// How each hand prop is held: aim direction in character space (or 'forearm'), and grip offset.
export const HOLD = {
  broom: { dir: [0.1, -0.75, 0.65] },
  rod: { dir: [0, 0.55, 0.84] },
  axe: { dir: 'tool' },
  cup: { dir: [0, 1, 0] },
};

// Props carried on the body rather than in the hand: bone and local placement.
export const WEAR = {
  pole: { bone: 'chest', pos: [-0.17, 0.2, 0.0], rot: [0, 0, 0] },
  basket: { bone: 'chest', pos: [0, -0.27, 0.28], rot: [0, 0, 0] },
  sack: { bone: 'chest', pos: [-0.25, 0.25, -0.2], rot: [0.25, 0.5, 0.45], scale: 0.8 },
};
