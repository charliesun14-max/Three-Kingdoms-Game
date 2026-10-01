// Visual representation of a character: skinned body, weapon mounts, animator.
import * as THREE from 'three';
import { buildHumanoid } from './Humanoid.js';
import { Animator } from './Animator.js';
import { buildWeaponMesh, WEAPONS } from '../combat/Weapons.js';
import { PROPS, HOLD, WEAR } from '../life/Props.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _qw = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const _s1 = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3(), _p1 = new THREE.Vector3();
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _co = new THREE.Vector3();

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

  // Everyday prop by name (broom, rod, pole...): held in the right hand or worn on the body.
  setProp(kind) {
    if (this.propKind === kind) return;
    if (this.propMesh) { this.propMesh.parent?.remove(this.propMesh); this.propMesh = null; }
    this.propKind = kind || null;
    if (!kind || !PROPS[kind]) return;
    const mesh = PROPS[kind]();
    this.propMesh = mesh;
    const w = WEAR[kind];
    if (w) { this.bones[w.bone].add(mesh); mesh.position.set(...w.pos); mesh.rotation.set(...w.rot); if (w.scale) mesh.scale.setScalar(w.scale); }
    else { this.bones.handR.add(mesh); mesh.position.set(0, -0.07, 0.02); }
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
    if (this.propMesh) {
      this.propMesh.visible = this.sheathed;
      const hold = HOLD[this.propKind];
      if (hold && this.sheathed) {
        this.root.updateMatrixWorld(true);
        const hr = this.bones.handR;
        if (hold.dir === 'forearm' || hold.dir === 'tool') {
          hr.getWorldPosition(_a); this.bones.elbowR.getWorldPosition(_b); _dir.subVectors(_a, _b).normalize();
          // a tool's haft crosses the fist at right angles to the forearm, in the plane of the swing
          if (hold.dir === 'tool') { _co.set(-1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(_qr)); _dir.crossVectors(_co, _dir).normalize(); }
        }
        else _dir.set(...hold.dir).normalize().applyQuaternion(this.root.getWorldQuaternion(_qr));
        _qw.setFromUnitVectors(_up, _dir);
        hr.getWorldQuaternion(_qh);
        this.propMesh.quaternion.copy(_qh.invert().multiply(_qw));
      }
    }
    // Drawn weapons point along the animation's weapon direction (character space),
    // held at the right hand. This reads far better than raw hand-bone orientation.
    const cls = WEAPONS[this.weaponId]?.cls;
    if (this.weaponMesh && !this.sheathed && cls !== 'bow' && this.anim.wdir) {
      this.root.updateMatrixWorld(true);
      const hr = this.bones.handR;
      _dir.copy(this.anim.wdir).applyQuaternion(this.root.getWorldQuaternion(_qr));
      _qw.setFromUnitVectors(_up, _dir);
      hr.getWorldQuaternion(_qh);
      this.weaponMesh.quaternion.copy(_qh.invert().multiply(_qw));
      this.weaponMesh.position.set(0, -0.07, 0.02);
      if (cls === 'polearm' && this.anim.lie < 0.2) {
        // left hand grips the shaft ahead of the right hand
        hr.getWorldPosition(_a);
        _b.copy(_a).addScaledVector(_dir, 0.55 * this.scale);
        this.solveArmIK('L', _b);
      }
    }
  }

  // Analytic two-bone IK: rotate shoulder & elbow so the hand reaches target (world).
  solveArmIK(side, target) {
    const sh = this.bones['shoulder' + side], el = this.bones['elbow' + side], hd = this.bones['hand' + side];
    const S = sh.getWorldPosition(_s1), a = el.position.length() * this.scale, b = hd.position.length() * this.scale;
    _t1.subVectors(target, S);
    let d = _t1.length();
    const maxd = (a + b) * 0.999;
    if (d > maxd) { _t1.multiplyScalar(maxd / d); d = maxd; }
    if (d < 0.05) return;
    const dirT = _t2.copy(_t1).normalize();
    // pole: elbows drop down and out to the side
    _p1.set(side === 'L' ? 0.6 : -0.6, -1, -0.2).applyQuaternion(this.root.getWorldQuaternion(_qr));
    _p1.addScaledVector(dirT, -_p1.dot(dirT)).normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const E = _e1.copy(S).addScaledVector(dirT, Math.cos(ang) * a).addScaledVector(_p1, Math.sin(ang) * a);
    this.aimBone(sh, el.position, _d1.subVectors(E, S));
    sh.updateMatrixWorld(true);
    const Ew = el.getWorldPosition(_e2);
    this.aimBone(el, hd.position, _d2.subVectors(_t3.copy(S).add(_t1), Ew));
    el.updateMatrixWorld(true);
  }
  aimBone(bone, childOffset, worldDir) {
    bone.parent.getWorldQuaternion(_qp);
    const dirP = worldDir.clone().normalize().applyQuaternion(_qp.invert());
    bone.quaternion.setFromUnitVectors(_co.copy(childOffset).normalize(), dirP);
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.rig.mesh.geometry.dispose();
  }
}
