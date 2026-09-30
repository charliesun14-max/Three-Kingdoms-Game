// Visual representation of a character: skinned body, weapon mounts, animator.
import * as THREE from 'three';
import { buildHumanoid } from './Humanoid.js';
import { Animator } from './Animator.js';
import { buildWeaponMesh, WEAPONS } from '../combat/Weapons.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _qw = new THREE.Quaternion(), _qh = new THREE.Quaternion();

export class CharacterModel {
  constructor(appearance = {}) {
    this.appearance = appearance;
    this.root = new THREE.Group();
    this.rig = buildHumanoid(appearance);
    const s = (appearance.height ?? 1.72) / 1.72;
    this.scale = s;
    this.rig.mesh.scale.setScalar(s);
    this.root.add(this.rig.mesh);
    this.anim = new Animator(this.rig);
    this.weaponId = null;
    this.weaponMesh = null;
    this.shieldMesh = null;
    this.sheathed = true;
    this.propMesh = null;
  }

  get bones() { return this.rig.bones; }

  setWeapon(id, drawn = false) {
    if (this.weaponMesh) { this.weaponMesh.parent?.remove(this.weaponMesh); this.weaponMesh = null; }
    this.weaponId = id;
    if (!id || id === 'fists') return;
    this.weaponMesh = buildWeaponMesh(id);
    if (!this.weaponMesh) return;
    if (id === 'twinSwords') {
      this.weaponMesh2 = buildWeaponMesh('twinSwords');
    }
    this.setDrawn(drawn);
  }

  setShield(on) {
    if (this.shieldMesh) { this.shieldMesh.parent?.remove(this.shieldMesh); this.shieldMesh = null; }
    if (on) { this.shieldMesh = buildWeaponMesh('shield'); this.setDrawn(!this.sheathed); }
  }

  // Draw/sheathe: move weapon mesh between hand and back/hip mount.
  setDrawn(drawn) {
    this.sheathed = !drawn;
    const w = this.weaponMesh;
    const cls = WEAPONS[this.weaponId]?.cls;
    if (w) {
      w.parent?.remove(w);
      if (drawn) {
        this.bones.handR.add(w);
        w.position.set(0, -0.07, 0.02);
        if (cls === 'polearm') w.rotation.set(Math.PI * 0.5, 0, 0);
        else if (cls === 'bow') w.rotation.set(0, 0, 0);
        else w.rotation.set(Math.PI * 0.6, 0, 0);
      } else if (cls === 'polearm') {
        // carried upright in right hand when relaxed
        this.bones.handR.add(w);
        w.position.set(0, -0.07, 0.02);
        w.rotation.set(Math.PI * 0.08, 0, 0);
      } else if (cls === 'bow') {
        this.bones.chest.add(w);
        w.position.set(0.05, 0.05, -0.16);
        w.rotation.set(0, Math.PI / 2, 0.4);
      } else {
        // scabbarded at left hip
        this.bones.hips.add(w);
        w.position.set(0.2, 0.0, 0.08);
        w.rotation.set(-2.55, 0, 0.1);
      }
    }
    if (this.weaponMesh2) {
      const w2 = this.weaponMesh2;
      w2.parent?.remove(w2);
      if (drawn) { this.bones.handL.add(w2); w2.position.set(0, -0.07, 0.02); w2.rotation.set(Math.PI * 0.6, 0, 0); }
      else { this.bones.hips.add(w2); w2.position.set(-0.2, 0.0, 0.08); w2.rotation.set(-2.55, 0, -0.1); }
    }
    if (this.shieldMesh) {
      const sm = this.shieldMesh;
      sm.parent?.remove(sm);
      if (drawn) { this.bones.handL.add(sm); sm.position.set(0.05, -0.08, 0.06); sm.rotation.set(0, Math.PI / 2, 0); }
      else { this.bones.chest.add(sm); sm.position.set(0, 0.0, -0.2); sm.rotation.set(0.1, Math.PI, 0); }
    }
  }

  // Hand-held prop (cup, hoe, scroll...)
  holdProp(mesh) {
    if (this.propMesh) this.propMesh.parent?.remove(this.propMesh);
    this.propMesh = mesh;
    if (mesh) { this.bones.handR.add(mesh); }
  }

  // Tip of the weapon in world space (for hit traces/effects)
  weaponTip(out = new THREE.Vector3()) {
    if (!this.weaponMesh || this.sheathed) return this.bones.handR.getWorldPosition(out);
    const len = WEAPONS[this.weaponId]?.length ?? 0.9;
    const grip = WEAPONS[this.weaponId]?.grip ?? 0;
    return out.set(0, len * (1 - grip), 0).applyMatrix4(this.weaponMesh.matrixWorld);
  }

  update(dt, state) {
    this.anim.update(dt, state);
    // Two-handed polearms: lay the shaft through both hands so thrusts and sweeps read correctly.
    const cls = WEAPONS[this.weaponId]?.cls;
    if (this.weaponMesh && !this.sheathed && cls === 'polearm') {
      this.root.updateMatrixWorld(true);
      const hr = this.bones.handR, hl = this.bones.handL;
      hr.getWorldPosition(_a);
      hl.getWorldPosition(_b);
      _dir.subVectors(_b, _a);
      if (_dir.lengthSq() < 1e-4) return;
      _dir.normalize();
      _qw.setFromUnitVectors(_up, _dir);
      hr.getWorldQuaternion(_qh);
      this.weaponMesh.quaternion.copy(_qh.invert().multiply(_qw));
      this.weaponMesh.position.set(0, -0.07, 0.02);
    }
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.rig.mesh.geometry.dispose();
  }
}
