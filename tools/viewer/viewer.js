// Dev-only asset viewer: npm run dev, then open /asset-viewer.html?m=models/props/well.glb,models/rocks/boulder.glb
// Lays models out in a row on a 1 m grid under a sun and sky light, labelled with name, size and triangle count.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const q = new URLSearchParams(location.search);
const files = (q.get('m') || '').split(',').filter(Boolean);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fa6b8);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
const sun = new THREE.DirectionalLight(0xfff1dd, 2.6);
sun.position.set(-20, 30, 25); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 200 });
scene.add(sun, new THREE.HemisphereLight(0xcfe0ff, 0x4a4030, 0.6));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x7a7466, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
scene.add(new THREE.GridHelper(400, 400, 0x555555, 0x666666));
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 2000);
const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('./decoders/draco/')).setMeshoptDecoder(MeshoptDecoder);
const scale = +(q.get('scale') || 1);
let x = 0, maxH = 1;
const labels = [];
for (const f of files) {
  const g = await loader.loadAsync('./assets/' + f).catch((e) => { console.error(f, e); return null; });
  if (!g) continue;
  const o = g.scene; o.scale.setScalar(scale);
  let tris = 0;
  o.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
  if (q.get('fit')) { const b0 = new THREE.Box3().setFromObject(o); o.scale.multiplyScalar(+q.get('fit') / Math.max(1e-6, b0.max.y - b0.min.y)); }
  const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
  o.position.set(x + s.x / 2 - (b.min.x + s.x / 2), -b.min.y, -(b.min.z + s.z / 2));
  scene.add(o);
  labels.push({ p: new THREE.Vector3(x + s.x / 2, s.y + 0.1, 0), t: `${f.split('/').pop()}  ${s.x.toFixed(2)}×${s.y.toFixed(2)}×${s.z.toFixed(2)} m  ${Math.round(tris)} tris` });
  x += s.x + Math.max(0.5, s.x * 0.25); maxH = Math.max(maxH, s.y);
}
const span = Math.max(x, maxH * 1.6);
cam.position.set(x / 2 + (+(q.get('cx') || 0)), maxH * 0.9 + span * 0.18 + (+(q.get('cy') || 0)), span * 0.95 * (+(q.get('cz') || 1)));
cam.lookAt(x / 2, maxH * 0.35, 0);
renderer.render(scene, cam);
const l = document.getElementById('l');
labels.forEach((lb, i) => { const v = lb.p.clone().project(cam); const d = document.createElement('div'); d.textContent = lb.t; d.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - v.y) / 2 * innerHeight - 16 - (i % 2) * 14) + 'px'; l.appendChild(d); });
window.viewerReady = true;
