// Prints hand positions (character space: +z forward, +x left) for poses/clip keys.
import * as THREE from 'three';
import { BONES, PARENT, jointPositions } from '../src/entities/Humanoid.js';
import { POSES, CLIPS } from '../src/entities/Animator.js';
const J = jointPositions({ shoulders: 1, hipsW: 1, girth: 1 });
function rig() {
  const b = {};
  for (const n of BONES) { b[n] = new THREE.Bone(); b[n].name = n; }
  for (const n of BONES) { const p = PARENT[n]; const w = J[n]; if (p) { const pp = J[p]; b[n].position.set(w[0] - pp[0], w[1] - pp[1], w[2] - pp[2]); b[p].add(b[n]); } else b[n].position.set(...w); }
  return b;
}
const D = Math.PI / 180;
function apply(b, pose) { for (const k in pose) if (b[k] && k[0] !== '_') b[k].quaternion.setFromEuler(new THREE.Euler(pose[k][0] * D, pose[k][1] * D, pose[k][2] * D, 'XYZ')); }
const f = (v) => `(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`;
function show(name, poses) {
  const b = rig();
  apply(b, POSES.relaxed);
  for (const p of poses) apply(b, p);
  b.root.updateMatrixWorld(true);
  const hr = b.handR.getWorldPosition(new THREE.Vector3()), hl = b.handL.getWorldPosition(new THREE.Vector3()), el = b.elbowR.getWorldPosition(new THREE.Vector3());
  const w = poses.reduce((a, p) => p._w || a, null);
  console.log(name.padEnd(28), 'R', f(hr), 'L', f(hl), 'elbowR', f(el), w ? 'w ' + w.join(',') : '');
}
const which = process.argv[2] || '';
for (const [k, v] of Object.entries(POSES)) if (k.includes(which)) show('pose ' + k, [v]);
for (const [k, c] of Object.entries(CLIPS)) if (k.includes(which) && c.hit !== undefined) {
  const guard = k.startsWith('polearm') ? POSES.guardPolearm : POSES.guardBlade;
  c.keys.forEach((kk, i) => { if (kk.pose) show(`${k}#${i}@${kk.t}`, [guard, kk.pose]); });
}
