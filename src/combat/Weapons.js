// Weapon definitions (Han-era arms) and their procedural meshes.
// Meshes are built along +Y with the grip at the origin.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// dmg: base damage by type; reach metres; speed multiplier; stam: stamina per swing.
export const WEAPONS = {
  fists: { name: 'Bare Fists', cn: '拳', cls: 'fists', hands: 1, reach: 0.9, speed: 1.3, dmg: { slash: 0, stab: 0, blunt: 7 }, stam: 9, weight: 0, price: 0 },
  staff: { name: 'Wooden Staff', cn: '棍', cls: 'polearm', hands: 2, reach: 2.0, speed: 1.1, dmg: { slash: 0, stab: 4, blunt: 13 }, stam: 12, weight: 2, price: 30, length: 1.9, grip: 0.35 },
  hoe: { name: 'Farmer\'s Hoe', cn: '鋤', cls: 'polearm', hands: 2, reach: 1.7, speed: 0.95, dmg: { slash: 10, stab: 0, blunt: 8 }, stam: 14, weight: 2.5, price: 20, length: 1.5, grip: 0.3 },
  sickle: { name: 'Sickle', cn: '鐮', cls: 'blade', hands: 1, reach: 1.0, speed: 1.25, dmg: { slash: 12, stab: 2, blunt: 0 }, stam: 9, weight: 0.6, price: 15, length: 0.5, grip: 0 },
  dao: { name: 'Ring-Pommel Dao', cn: '環首刀', cls: 'blade', hands: 1, reach: 1.35, speed: 1.1, dmg: { slash: 24, stab: 10, blunt: 2 }, stam: 11, weight: 1.3, price: 380, length: 1.0, grip: 0 },
  jian: { name: 'Bronze Jian', cn: '劍', cls: 'blade', hands: 1, reach: 1.3, speed: 1.15, dmg: { slash: 18, stab: 20, blunt: 1 }, stam: 10, weight: 1.1, price: 320, length: 0.95, grip: 0 },
  twinSwords: { name: 'Twin Swords', cn: '雙股劍', cls: 'blade', hands: 1, reach: 1.3, speed: 1.3, dmg: { slash: 22, stab: 18, blunt: 1 }, stam: 10, weight: 2.2, price: 0, length: 0.95, grip: 0, unique: true },
  spear: { name: 'Iron Spear', cn: '矛', cls: 'polearm', hands: 2, reach: 2.6, speed: 0.95, dmg: { slash: 6, stab: 28, blunt: 4 }, stam: 13, weight: 2.6, price: 260, length: 2.8, grip: 0.38 },
  ji: { name: 'Halberd (Ji)', cn: '戟', cls: 'polearm', hands: 2, reach: 2.7, speed: 0.85, dmg: { slash: 24, stab: 26, blunt: 6 }, stam: 15, weight: 3.4, price: 520, length: 2.9, grip: 0.38 },
  axe: { name: 'Battle Axe', cn: '鉞', cls: 'blunt', hands: 1, reach: 1.2, speed: 0.9, dmg: { slash: 20, stab: 0, blunt: 14 }, stam: 14, weight: 2.4, price: 220, length: 0.9, grip: 0 },
  club: { name: 'Studded Club', cn: '棒', cls: 'blunt', hands: 1, reach: 1.1, speed: 1.0, dmg: { slash: 0, stab: 0, blunt: 20 }, stam: 12, weight: 2, price: 60, length: 0.85, grip: 0 },
  guandao: { name: 'Green Dragon Crescent Blade', cn: '青龍偃月刀', cls: 'polearm', hands: 2, reach: 3.0, speed: 0.8, dmg: { slash: 48, stab: 18, blunt: 10 }, stam: 16, weight: 18, price: 0, length: 2.6, grip: 0.35, unique: true },
  serpentSpear: { name: 'Serpent Spear', cn: '丈八蛇矛', cls: 'polearm', hands: 2, reach: 3.3, speed: 0.9, dmg: { slash: 14, stab: 44, blunt: 6 }, stam: 15, weight: 8, price: 0, length: 3.8, grip: 0.4, unique: true },
  fangtianji: { name: 'Sky Piercer', cn: '方天畫戟', cls: 'polearm', hands: 2, reach: 3.2, speed: 0.95, dmg: { slash: 42, stab: 42, blunt: 8 }, stam: 14, weight: 12, price: 0, length: 3.2, grip: 0.38, unique: true },
  bow: { name: 'Composite Bow', cn: '弓', cls: 'bow', hands: 2, reach: 60, speed: 1, dmg: { slash: 0, stab: 26, blunt: 0 }, stam: 8, weight: 1, price: 300, length: 1.3, grip: 0.5 },
};

export const SHIELDS = {
  shield: { name: 'Han Shield', cn: '盾', block: 0.75, weight: 3, price: 160 },
};

const mats = {};
function M(key) {
  if (mats[key]) return mats[key];
  const def = {
    iron: { color: 0x9aa0a8, metalness: 0.85, roughness: 0.32 },
    darkIron: { color: 0x4a4c50, metalness: 0.8, roughness: 0.45 },
    bronze: { color: 0xb08a48, metalness: 0.85, roughness: 0.35 },
    wood: { color: 0x6a4a30, roughness: 0.8 },
    darkWood: { color: 0x3a2618, roughness: 0.8 },
    wrap: { color: 0x2a1a14, roughness: 0.95 },
    red: { color: 0x9a1a12, roughness: 0.9 },
    green: { color: 0x2e6a45, metalness: 0.3, roughness: 0.5 },
    gold: { color: 0xd0a850, metalness: 0.9, roughness: 0.3 },
    lacquer: { color: 0x7a1a12, roughness: 0.45 },
    leather: { color: 0x5a3a24, roughness: 0.85 },
  }[key];
  mats[key] = new THREE.MeshStandardMaterial(def);
  return mats[key];
}

function part(geo, mat) { return { geo, mat }; }
function cyl(r0, r1, h, y0, seg = 8) { const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.translate(0, y0 + h / 2, 0); return g; }
function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }

// Single-edged blade profile extruded thin
function bladeGeo(len, w0, w1, tipCurve = 0.2, thick = 0.008, curve = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w0 / 2, 0);
  s.lineTo(w0 / 2, 0);
  s.quadraticCurveTo(w1 / 2 + curve, len * 0.6, w1 / 2 + curve * 1.2, len * (1 - tipCurve));
  s.quadraticCurveTo(w1 / 2 + curve, len, -w1 / 2 + curve * 1.4, len);
  s.lineTo(-w1 / 2 + curve, len * 0.6);
  s.lineTo(-w0 / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: 0.003, bevelSegments: 1, steps: 1, curveSegments: 6 });
  g.translate(0, 0, -thick / 2);
  return g;
}
function spearHead(len, w) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.quadraticCurveTo(w, len * 0.3, 0, len); s.quadraticCurveTo(-w, len * 0.3, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.004, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, 0, -0.006);
  return g;
}

export function buildWeaponMesh(id) {
  const parts = [];
  switch (id) {
    case 'dao': {
      parts.push(part(cyl(0.016, 0.016, 0.2, -0.16), M('wrap')));
      const ring = new THREE.TorusGeometry(0.035, 0.008, 6, 14); ring.translate(0, -0.2, 0);
      parts.push(part(ring, M('darkIron')));
      parts.push(part(box(0.06, 0.02, 0.04, 0, 0.04, 0), M('bronze')));
      parts.push(part(bladeGeo(0.82, 0.034, 0.03, 0.12, 0.007, 0.012).translate(0, 0.05, 0), M('iron')));
      break;
    }
    case 'jian':
    case 'twinSwords': {
      parts.push(part(cyl(0.015, 0.015, 0.18, -0.16), M('wrap')));
      parts.push(part(new THREE.SphereGeometry(0.025, 8, 6).translate(0, -0.17, 0), M('bronze')));
      parts.push(part(box(0.09, 0.025, 0.035, 0, 0.03, 0), M('bronze')));
      const b = bladeGeo(0.78, 0.04, 0.03, 0.08, 0.008, 0);
      parts.push(part(b.translate(0, 0.045, 0), M(id === 'jian' ? 'bronze' : 'iron')));
      break;
    }
    case 'sickle': {
      parts.push(part(cyl(0.018, 0.016, 0.3, -0.25), M('wood')));
      const c = new THREE.TorusGeometry(0.14, 0.012, 4, 12, Math.PI * 0.9); c.scale(1, 1, 0.3); c.translate(0.14, 0.05, 0);
      parts.push(part(c, M('darkIron')));
      break;
    }
    case 'hoe': {
      parts.push(part(cyl(0.02, 0.018, 1.5, -0.45), M('wood')));
      parts.push(part(box(0.2, 0.14, 0.02, 0.0, 1.0, 0.08).rotateX(0), M('darkIron')));
      break;
    }
    case 'staff': {
      parts.push(part(cyl(0.022, 0.02, 1.9, -0.66), M('wood')));
      break;
    }
    case 'club': {
      parts.push(part(cyl(0.02, 0.045, 0.85, -0.15), M('darkWood')));
      for (let i = 0; i < 10; i++) parts.push(part(new THREE.ConeGeometry(0.012, 0.03, 4).rotateZ(Math.PI / 2).translate(0.045, 0.4 + (i % 5) * 0.08, 0).rotateY((i * Math.PI * 2) / 5 + (i > 4 ? 0.6 : 0)), M('darkIron')));
      break;
    }
    case 'axe': {
      parts.push(part(cyl(0.02, 0.02, 0.9, -0.2), M('wood')));
      const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.14, -0.08); s.quadraticCurveTo(0.2, 0.06, 0.14, 0.2); s.lineTo(0, 0.12);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false }); g.translate(0.015, 0.52, -0.006);
      parts.push(part(g, M('darkIron')));
      break;
    }
    case 'spear':
    case 'serpentSpear': {
      const L = id === 'spear' ? 2.8 : 3.8, grip = WEAPONS[id].grip;
      parts.push(part(cyl(0.02, 0.018, L - 0.3, -L * grip), M(id === 'spear' ? 'wood' : 'darkWood')));
      if (id === 'spear') parts.push(part(spearHead(0.32, 0.05).translate(0, L * (1 - grip) - 0.3, 0), M('iron')));
      else {
        // wavy serpent blade
        const s = new THREE.Shape();
        s.moveTo(0, 0);
        for (let i = 0; i <= 8; i++) s.lineTo(Math.sin(i * 1.3) * 0.03 + 0.02 * (1 - i / 8), (i / 8) * 0.5);
        for (let i = 8; i >= 0; i--) s.lineTo(Math.sin(i * 1.3) * 0.03 - 0.02 * (1 - i / 8), (i / 8) * 0.5);
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false });
        g.translate(0, L * (1 - grip) - 0.32, -0.005);
        parts.push(part(g, M('iron')));
        parts.push(part(new THREE.SphereGeometry(0.06, 6, 5).scale(1, 1.4, 1).translate(0, L * (1 - grip) - 0.36, 0), M('red'))); // tassel
      }
      parts.push(part(cyl(0.03, 0.022, 0.08, L * (1 - grip) - 0.34), M('darkIron')));
      parts.push(part(cyl(0.022, 0.03, 0.08, -L * grip - 0.05), M('darkIron'))); // butt cap
      break;
    }
    case 'ji':
    case 'fangtianji': {
      const L = WEAPONS[id].length, grip = WEAPONS[id].grip;
      const top = L * (1 - grip);
      parts.push(part(cyl(0.021, 0.02, L - 0.35, -L * grip), M(id === 'ji' ? 'wood' : 'lacquer')));
      parts.push(part(spearHead(0.34, 0.045).translate(0, top - 0.34, 0), M('iron')));
      // side blade(s)
      const blades = id === 'ji' ? [1] : [1, -1];
      for (const s of blades) {
        const sh = new THREE.Shape();
        if (id === 'ji') { sh.moveTo(0, 0); sh.lineTo(0.2, 0.03); sh.lineTo(0.2, -0.02); sh.lineTo(0, -0.05); }
        else { sh.moveTo(0, 0.06); sh.quadraticCurveTo(0.2, 0.12, 0.18, -0.12); sh.quadraticCurveTo(0.1, -0.02, 0, -0.06); }
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: false });
        g.translate(0.02, 0, -0.005); if (s < 0) g.scale(-1, 1, 1);
        g.translate(0, top - 0.42, 0);
        parts.push(part(g, M('iron')));
      }
      if (id === 'fangtianji') parts.push(part(new THREE.SphereGeometry(0.06, 6, 5).scale(1, 1.6, 1).translate(0, top - 0.52, 0), M('red')));
      break;
    }
    case 'guandao': {
      const L = 2.6, grip = 0.35, top = L * (1 - grip);
      parts.push(part(cyl(0.024, 0.022, L - 0.5, -L * grip), M('green')));
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.lineTo(0.05, 0); s.quadraticCurveTo(0.16, 0.35, 0.02, 0.62); s.quadraticCurveTo(-0.02, 0.4, -0.06, 0.28);
      s.lineTo(-0.04, 0.12); s.lineTo(-0.08, 0.06); s.lineTo(-0.02, 0.05); s.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.004, bevelSegments: 1 });
      g.translate(0, top - 0.52, -0.007);
      parts.push(part(g, M('iron')));
      parts.push(part(new THREE.TorusGeometry(0.04, 0.012, 6, 10).translate(0, top - 0.55, 0), M('gold'))); // dragon mouth ring
      parts.push(part(new THREE.SphereGeometry(0.07, 6, 5).scale(1, 1.5, 1).translate(0.05, top - 0.6, 0), M('red')));
      parts.push(part(cyl(0.022, 0.035, 0.18, -L * grip - 0.1), M('gold')));
      break;
    }
    case 'bow': {
      const c = new THREE.TorusGeometry(0.6, 0.014, 5, 20, Math.PI * 0.75); c.rotateZ(-Math.PI * 0.375 + Math.PI / 2); c.translate(-0.55, 0, 0);
      parts.push(part(c, M('darkWood')));
      break;
    }
    case 'shield': {
      const s = new THREE.Shape();
      s.moveTo(-0.28, -0.5); s.lineTo(0.28, -0.5); s.lineTo(0.3, 0.45); s.quadraticCurveTo(0, 0.62, -0.3, 0.45); s.lineTo(-0.28, -0.5);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
      parts.push(part(g, M('lacquer')));
      parts.push(part(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, 0.04), M('bronze')));
      break;
    }
    default:
      return null;
  }
  const group = new THREE.Group();
  // merge per material
  const byMat = new Map();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!byMat.has(p.mat)) byMat.set(p.mat, []);
    byMat.get(p.mat).push(g);
  }
  for (const [m, list] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(list), m);
    mesh.castShadow = true;
    group.add(mesh);
  }
  group.userData.weaponId = id;
  return group;
}

// Attach helpers: rotation for grip in right hand (blade points forward/up when forearm is forward).
export function mountInHand(weaponMesh, id, hand = 'R') {
  const w = WEAPONS[id] || {};
  weaponMesh.position.set(0, -0.06, 0.015);
  if (id === 'shield') {
    weaponMesh.position.set(hand === 'L' ? 0.06 : -0.06, -0.05, 0.03);
    weaponMesh.rotation.set(Math.PI / 2, 0, hand === 'L' ? -Math.PI / 2 : Math.PI / 2);
    return;
  }
  if (id === 'bow') { weaponMesh.rotation.set(Math.PI / 2, 0, Math.PI / 2); return; }
  if (w.cls === 'polearm') weaponMesh.rotation.set(Math.PI * 0.62, 0, 0);
  else weaponMesh.rotation.set(Math.PI * 0.62, 0, 0);
}
