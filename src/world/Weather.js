// Changing weather: clear → overcast → rain, with camera-following rain streaks.
import * as THREE from 'three';
import { lerp } from '../core/MathUtil.js';

export class Weather {
  constructor(game) {
    this.game = game;
    this.state = 'clear';
    this.overcast = 0; this.rain = 0;
    this.target = { overcast: 0, rain: 0 };
    this.nextChange = 3 + Math.random() * 6; // in game hours
    const n = 5000;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60;
      pos.set([x, y, z, x + 0.05, y - 0.7, z + 0.02], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.uni = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAlpha: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni, transparent: true, depthWrite: false,
      vertexShader: `uniform float uTime; uniform vec3 uCam; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y - uTime * 16.0, 30.0);
          p.xz = mod(p.xz - uCam.xz + 30.0, 60.0) - 30.0 + uCam.xz; p.y += uCam.y - 8.0;
          vA = 1.0 - smoothstep(20.0, 30.0, length(p.xz - uCam.xz));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
      fragmentShader: 'uniform float uAlpha; varying float vA; void main(){ gl_FragColor = vec4(0.75, 0.8, 0.86, uAlpha * vA * 0.45); }',
    });
    this.lines = new THREE.LineSegments(g, mat);
    this.lines.frustumCulled = false;
    game.engine.scene.add(this.lines);
    this.lastHour = null;
  }

  set(state) {
    this.state = state;
    this.target = state === 'rain' ? { overcast: 1, rain: 1 } : state === 'overcast' ? { overcast: 0.75, rain: 0 } : { overcast: 0, rain: 0 };
  }

  update(dt) {
    const g = this.game, t = g.time;
    const h = t.day * 24 + t.hour;
    if (this.lastHour !== null) this.nextChange -= Math.max(0, h - this.lastHour);
    this.lastHour = h;
    if (this.nextChange <= 0 && !g.cutscene) {
      const r = Math.random();
      this.set(this.state === 'rain' ? (r < 0.6 ? 'overcast' : 'clear') : this.state === 'overcast' ? (r < 0.45 ? 'rain' : 'clear') : (r < 0.35 ? 'overcast' : 'clear'));
      this.nextChange = 4 + Math.random() * 10;
    }
    const k = 1 - Math.exp(-dt * 0.25);
    this.overcast = lerp(this.overcast, this.target.overcast, k);
    this.rain = lerp(this.rain, this.target.rain, k);
    const sky = g.world.sky;
    sky.weather.overcast = this.overcast;
    sky.weather.rain = this.rain;
    this.uni.uTime.value += dt;
    this.uni.uCam.value.copy(g.engine.camera.position);
    this.uni.uAlpha.value = this.rain;
    this.lines.visible = this.rain > 0.02;
    g.world.vegetation.grass && (g.world.vegetation.grass.uniforms.uDensity.value = 1);
    if (g.world.terrain.uniforms.uWetness) g.world.terrain.uniforms.uWetness.value = this.rain;
    g.audio?.setRain?.(this.rain);
  }
}
