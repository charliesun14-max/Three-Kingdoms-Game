// Copies the Draco and Basis/KTX2 decoders out of three.js into public/decoders/ so compressed
// models load offline (the desktop build has no CDN to fall back on).
import { cpSync, mkdirSync } from 'node:fs';

const libs = 'node_modules/three/examples/jsm/libs';
mkdirSync('public/decoders', { recursive: true });
cpSync(`${libs}/draco/gltf`, 'public/decoders/draco', { recursive: true });
cpSync(`${libs}/basis`, 'public/decoders/basis', { recursive: true, filter: (f) => !f.endsWith('.md') });
