import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { World } from './world/World.js';

export class Game {
  constructor(container, uiRoot, params) {
    this.container = container;
    this.uiRoot = uiRoot;
    this.params = params;
    this.quality = params.has('q') ? +params.get('q') : 1;
    this.hour = params.has('hour') ? +params.get('hour') : 9;
  }

  boot() {
    this.engine = new Engine(this.container, this.quality);
    this.world = new World(this.engine, 'zhuo');
    const cam = this.params.get('cam');
    if (cam) {
      const [x, y, z, tx, ty, tz] = cam.split(',').map(Number);
      const hf = this.world.hf;
      const rel = this.params.has('rel');
      this.engine.camera.position.set(x, y + (rel ? hf.getHeight(x, z) : 0), z);
      this.engine.camera.lookAt(tx, ty + (rel ? hf.getHeight(tx, tz) : 0), tz);
    }
    if (this.params.get('hide')) for (const n of this.params.get('hide').split(',')) { const o = this.engine.scene.getObjectByName(n); if (o) o.visible = false; if (n === 'grass') this.world.vegetation.grass.mesh.visible = false; if (n === 'crops') this.world.vegetation.crops.mesh.visible = false; }
    this.clock = new THREE.Clock();
    this.ready = true;
    const loop = () => {
      const dt = Math.min(0.05, this.clock.getDelta());
      this.world.update(dt, this.hour, this.engine.camera.position.clone().setY(0).add(new THREE.Vector3(0, this.world.hf.getHeight(this.engine.camera.position.x, this.engine.camera.position.z), 0)));
      this.engine.render(dt);
      this.frames = (this.frames || 0) + 1;
      const stopAt = this.params.has('frames') ? +this.params.get('frames') : Infinity;
      if (this.frames >= stopAt) { this.done = true; return; }
      requestAnimationFrame(loop);
    };
    loop();
  }
}
