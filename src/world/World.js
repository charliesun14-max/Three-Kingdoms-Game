// A loaded region: terrain, water, sky, vegetation, settlements and colliders.
import * as THREE from 'three';
import { REGIONS } from './regions.js';
import { Heightfield } from './Heightfield.js';
import { Terrain } from './Terrain.js';
import { Water } from './Water.js';
import { SkySystem } from './Sky.js';
import { Colliders } from './Colliders.js';
import { Vegetation } from './Vegetation.js';
import { Settlements } from './Settlements.js';

export class World {
  constructor(engine, regionId = 'zhuo', onProgress = () => {}) {
    this.engine = engine;
    this.scene = engine.scene;
    this.region = REGIONS[regionId];
    this.colliders = new Colliders(16);
    this.interactables = [];
    onProgress('Shaping the land…', 0.1);
    this.hf = new Heightfield(this.region);
    onProgress('Raising the earth…', 0.3);
    this.terrain = new Terrain(this.hf, this.scene);
    this.water = new Water(this.hf, this.scene);
    this.sky = new SkySystem(engine);
    onProgress('Building villages and walls…', 0.45);
    this.vegetation = new Vegetation(this);
    this.settlements = new Settlements(this);
    this.settlements.build();
    onProgress('Planting forests…', 0.65);
    this.vegetation.scatter();
    this.vegetation.build();
    this.time = 0;
  }

  groundHeight(x, z) {
    let h = this.hf.getHeight(x, z);
    // Walkable raised surfaces (bridges, platforms)
    for (const s of this.settlements.surfaces) {
      const dx = x - s.x, dz = z - s.z;
      const lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c;
      if (Math.abs(lx) <= s.hw && Math.abs(lz) <= s.hd) {
        const y = typeof s.y === 'function' ? s.y(lx, lz) : s.y;
        if (y > h) h = y;
      }
    }
    return h;
  }

  update(dt, hour, focus) {
    this.time += dt;
    this.sky.update(hour, dt, focus);
    this.water.update(dt, this.sky);
    this.vegetation.update(dt, this.engine.camera.position, this.time);
    this.settlements.update(dt, this.time, this.sky);
  }
}
