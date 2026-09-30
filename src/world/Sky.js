// Atmospheric sky, sun/moon lighting, fog, stars and day-night cycle.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/MathUtil.js';

export class SkySystem {
  constructor(engine) {
    this.engine = engine;
    const scene = engine.scene;
    this.sky = makeSkyDome();
    scene.add(this.sky);

    this.sunDir = new THREE.Vector3();
    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    const S = 70;
    sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S;
    sc.near = 1; sc.far = 600;
    this.sun.shadow.mapSize.set(engine.quality >= 2 ? 4096 : 2048, engine.quality >= 2 ? 4096 : 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x5b5036, 0.9);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xc8d4dc, 0.0016);

    // Stars
    const sg = new THREE.BufferGeometry();
    const sp = [];
    const ss = [];
    for (let i = 0; i < 2600; i++) {
      const v = new THREE.Vector3().randomDirection();
      if (v.y < -0.1) v.y = -v.y;
      v.multiplyScalar(9000);
      sp.push(v.x, v.y, v.z);
      ss.push(Math.random());
    }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('size', new THREE.Float32BufferAttribute(ss, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `attribute float size; varying float vS; uniform float uTime;
        void main(){ vS = size; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = 1.0 + size * 2.2; }`,
      fragmentShader: `uniform float uAlpha; varying float vS; uniform float uTime;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
        float tw = 0.7 + 0.3 * sin(uTime * (1.0 + vS * 3.0) + vS * 40.0);
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.9), uAlpha * (1.0 - d * 2.0) * tw * (0.4 + vS)); }`,
      transparent: true, depthWrite: false, fog: false,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // Moon
    const moonTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,250,235,1)'); grd.addColorStop(0.45, 'rgba(240,235,215,1)');
      grd.addColorStop(0.5, 'rgba(200,200,190,0.35)'); grd.addColorStop(1, 'rgba(200,200,190,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(160,160,150,0.35)';
      for (const [x, y, r] of [[50, 50, 9], [74, 70, 12], [60, 80, 6], [80, 44, 5]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true }));
    this.moon.scale.setScalar(420);
    scene.add(this.moon);

    this.pmrem = new THREE.PMREMGenerator(engine.renderer);
    this.envScene = new THREE.Scene();
    this.envSky = makeSkyDome(this.sky.material.uniforms);
    this.envSky.material = this.sky.material;
    this.envScene.add(this.envSky);
    this.envTarget = null;
    this.lastEnvUpdate = -999;
    this.weather = { overcast: 0, rain: 0 };
    this.fogBase = 0.00085;
  }

  // hour: 0..24
  update(hour, dt, focus) {
    const scene = this.engine.scene;
    // Sun path for ~39°N latitude in late spring
    const t = (hour - 6) / 12; // 0 at sunrise, 1 at sunset
    const elev = Math.sin(t * Math.PI) * 68 - 4; // degrees
    const az = lerp(-110, 110, t) * Math.PI / 180;
    const phi = (90 - elev) * Math.PI / 180;
    this.sunDir.setFromSphericalCoords(1, phi, Math.PI + az);
    const u = this.sky.material.uniforms;
    u.uSun.value.copy(this.sunDir);
    const ov = this.weather.overcast;
    u.uOvercast.value = ov;
    u.uTime.value += dt;

    const day = smoothstep(-6, 8, elev);
    const golden = (1 - smoothstep(4, 22, elev)) * day;
    const night = 1 - smoothstep(-10, 2, elev);

    // Sun / moon key light
    const sunCol = new THREE.Color().setRGB(1.0, lerp(0.95, 0.62, golden), lerp(0.88, 0.38, golden));
    const moonCol = new THREE.Color(0x8ea8d8);
    const lightDir = this.sunDir.clone();
    if (elev < -2) {
      // moon opposite
      lightDir.copy(this.sunDir).multiplyScalar(-1);
      lightDir.y = Math.max(0.35, lightDir.y);
      lightDir.normalize();
      this.sun.color.copy(moonCol);
      this.sun.intensity = 0.28 * night;
    } else {
      this.sun.color.copy(sunCol);
      this.sun.intensity = lerp(0.2, 3.1, day) * lerp(1, 0.35, ov);
    }
    const f = focus || new THREE.Vector3();
    this.sun.position.copy(f).addScaledVector(lightDir, 250);
    this.sun.target.position.copy(f);
    // Snap shadow camera to texel grid to reduce shimmering.
    this.sun.target.updateMatrixWorld();

    this.hemi.intensity = lerp(0.14, 1.05, day) * lerp(1, 0.8, ov);
    this.hemi.color.setRGB(lerp(0.35, 0.72, day), lerp(0.42, 0.8, day), lerp(0.62, 0.95, day));
    this.hemi.groundColor.setRGB(lerp(0.1, 0.42, day), lerp(0.1, 0.36, day), lerp(0.14, 0.26, day));

    // Fog tint follows horizon
    const fogDay = new THREE.Color().setRGB(0.62, 0.7, 0.8).lerp(new THREE.Color(0.62, 0.64, 0.66), ov);
    const fogGold = new THREE.Color(0.86, 0.66, 0.46);
    const fogNight = new THREE.Color(0.04, 0.055, 0.09);
    const fc = fogDay.clone().lerp(fogGold, golden * 0.7).lerp(fogNight, night);
    scene.fog.color.copy(fc);
    scene.fog.density = this.fogBase * (1 + ov * 1.5 + this.weather.rain * 1.5 + golden * 0.3);
    this.engine.renderer.toneMappingExposure = lerp(0.62, 0.52, day) * (night > 0.5 ? 1.25 : 1);

    this.starMat.uniforms.uAlpha.value = night;
    this.starMat.uniforms.uTime.value += dt;
    this.stars.position.copy(this.engine.camera.position);
    const moonDir = this.sunDir.clone().multiplyScalar(-1);
    moonDir.y = Math.abs(moonDir.y) * 0.8 + 0.2;
    this.moon.position.copy(this.engine.camera.position).addScaledVector(moonDir.normalize(), 8000);
    this.moon.material.opacity = Math.max(0, (night - 0.25) / 0.75);
    // sky colours by time of day
    const zen = new THREE.Color(0.1, 0.24, 0.55).lerp(new THREE.Color(0.2, 0.22, 0.35), golden * 0.6).lerp(new THREE.Color(0.004, 0.008, 0.02), night);
    const hor = new THREE.Color(0.55, 0.68, 0.82).lerp(new THREE.Color(0.95, 0.55, 0.28), golden).lerp(new THREE.Color(0.02, 0.03, 0.06), night);
    zen.lerp(new THREE.Color(0.45, 0.47, 0.5).multiplyScalar(lerp(1, 0.08, night)), ov * 0.8);
    hor.lerp(new THREE.Color(0.6, 0.62, 0.64).multiplyScalar(lerp(1, 0.08, night)), ov * 0.8);
    u.uZenith.value.copy(zen);
    u.uHorizon.value.copy(hor);
    u.uSunCol.value.copy(sunCol).multiplyScalar(day);
    u.uNight.value = night;
    this.sky.position.copy(this.engine.camera.position);
    // Night sky darkening (Preetham goes black; blend to deep blue via background)
    this.engine.renderer.setClearColor(fc);

    this.hour = hour;
    this.elev = elev;
    this.dayFactor = day;
    this.nightFactor = night;
    this.updateEnv(hour);
  }

  updateEnv(hour) {
    if (Math.abs(hour - this.lastEnvUpdate) < 0.25) return;
    this.lastEnvUpdate = hour;
    this.envSky.position.set(0, 0, 0);
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
    this.engine.scene.environment = this.envTarget.texture;
    this.engine.scene.environmentIntensity = clamp(0.15 + this.dayFactor * 0.55, 0.12, 0.7);
  }
}

function makeSkyDome() {
  const uniforms = {
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
    uZenith: { value: new THREE.Color(0.1, 0.25, 0.55) },
    uHorizon: { value: new THREE.Color(0.6, 0.7, 0.8) },
    uOvercast: { value: 0 },
    uNight: { value: 0 },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 uSun, uSunCol, uZenith, uHorizon; uniform float uOvercast, uNight, uTime;
      varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=.5;} return s; }
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, -0.2);
        float t = pow(clamp(1.0 - y, 0.0, 1.0), 3.0);
        vec3 col = mix(uZenith, uHorizon, t);
        // below horizon: ground haze
        if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.7, clamp(-d.y * 4.0, 0.0, 1.0));
        float mu = max(dot(d, normalize(uSun)), 0.0);
        // mie glow + sun disk
        col += uSunCol * (pow(mu, 8.0) * 0.25 + pow(mu, 64.0) * 0.6) * (1.0 - uOvercast * 0.7);
        col += uSunCol * smoothstep(0.9996, 0.99985, mu) * 20.0 * (1.0 - uOvercast);
        // clouds on a virtual plane
        if (d.y > 0.01) {
          vec2 cp = d.xz / (d.y + 0.08) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015);
          float c = fbm(cp * 1.3);
          float cov = mix(0.56, 0.3, uOvercast);
          float cloud = smoothstep(cov, cov + 0.28, c) * smoothstep(0.01, 0.2, d.y);
          float shade = fbm(cp * 1.3 + normalize(uSun).xz * 0.06);
          vec3 lit = mix(uHorizon * 1.15 + uSunCol * 0.35, uSunCol * 0.9 + 0.25, pow(mu, 4.0) * 0.5);
          vec3 dark = uHorizon * 0.55 + uZenith * 0.2;
          vec3 cc = mix(lit, dark, smoothstep(0.35, 0.8, shade - c + 0.5) * 0.8);
          cc = mix(cc, vec3(0.03, 0.035, 0.05), uNight * 0.92);
          col = mix(col, cc, cloud * 0.92);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
