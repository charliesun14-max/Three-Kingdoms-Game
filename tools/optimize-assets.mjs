// Shrinks downloaded models before they go into the game: every .glb/.gltf under the input folder
// is welded, compressed with Meshopt and given WebP textures (max 2048 px by default), then written
// with the same relative path under the output folder. Images are copied across unchanged.
//   npm run assets:optimize                       assets-src/  ->  public/assets/
//   npm run assets:optimize -- in/ out/ --texture-size 4096
import { readdirSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, relative, dirname, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const pos = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--'));
const extra = args.filter((a) => !pos.includes(a));
const src = pos[0] || 'assets-src', out = pos[1] || 'public/assets';
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

function* walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) yield* walk(p); else yield p;
  }
}

let before = 0, after = 0, n = 0;
for (const file of walk(src)) {
  const ext = extname(file).toLowerCase();
  const rel = relative(src, file);
  if (ext === '.glb' || ext === '.gltf') {
    const dest = join(out, rel.replace(/\.gltf$/i, '.glb'));
    mkdirSync(dirname(dest), { recursive: true });
    const r = spawnSync('npx', ['gltf-transform', 'optimize', file, dest, '--compress', 'meshopt', '--texture-compress', 'webp', '--instance', 'false', ...extra], { stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) { console.error(`✗ ${rel} failed`); continue; }
    const a = statSync(file).size, b = statSync(dest).size;
    before += a; after += b; n++;
    console.log(`✓ ${rel}: ${mb(a)} → ${mb(b)}${b > 100 * 1048576 ? '  (still over 100 MB: needs Git LFS, or try --texture-size 1024)' : ''}`);
  } else if (['.jpg', '.jpeg', '.png', '.webp', '.ktx2', '.json'].includes(ext)) {
    const dest = join(out, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(file, dest);
  } else if (['.fbx', '.obj', '.blend', '.dae'].includes(ext)) {
    console.warn(`! ${rel}: convert to .glb in Blender first (File → Export → glTF 2.0)`);
  }
}
console.log(n ? `\n${n} model(s): ${mb(before)} → ${mb(after)}` : `No .glb/.gltf files found in ${src}/`);
