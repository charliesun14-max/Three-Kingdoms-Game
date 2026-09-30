// Fading ribbon behind weapon tips during attacks, for readable, weighty swings.
import * as THREE from 'three';

const N = 14;
export class Trails {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map(); // character -> {mesh, pts:[{tip,base,t}]}
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0,0.93,0.8) * vA, vA * 0.55); }',
    });
  }
  get(c) {
    let it = this.items.get(c);
    if (!it) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
      g.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(N * 2), 1));
      const idx = [];
      for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      it = { mesh, pts: [] };
      this.items.set(c, it);
    }
    return it;
  }
  update(dt, chars, camPos) {
    for (const c of chars) {
      const atk = c.combat.attack && !c.dead && c.model.weaponMesh && !c.model.sheathed;
      if (!atk && !this.items.has(c)) continue;
      if (Math.hypot(c.pos.x - camPos.x, c.pos.z - camPos.z) > 25) continue;
      const it = this.get(c);
      if (atk) {
        const tip = c.model.weaponTip(new THREE.Vector3());
        const hand = c.model.bones.handR.getWorldPosition(new THREE.Vector3());
        const base = hand.lerp(tip, 0.45);
        it.pts.unshift({ tip, base, a: 1 });
        if (it.pts.length > N) it.pts.pop();
      }
      for (const p of it.pts) p.a -= dt * 5;
      it.pts = it.pts.filter((p) => p.a > 0);
      const pos = it.mesh.geometry.attributes.position.array, al = it.mesh.geometry.attributes.aA.array;
      for (let i = 0; i < N; i++) {
        const p = it.pts[Math.min(i, it.pts.length - 1)];
        const a = i < it.pts.length ? Math.max(0, p.a) * (1 - i / N) : 0;
        if (!p) { al[i * 2] = al[i * 2 + 1] = 0; continue; }
        pos.set([p.tip.x, p.tip.y, p.tip.z, p.base.x, p.base.y, p.base.z], i * 6);
        al[i * 2] = a; al[i * 2 + 1] = 0;
      }
      it.mesh.geometry.attributes.position.needsUpdate = true;
      it.mesh.geometry.attributes.aA.needsUpdate = true;
      if (!it.pts.length && !atk) { this.scene.remove(it.mesh); it.mesh.geometry.dispose(); this.items.delete(c); }
    }
  }
}
