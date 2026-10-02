// Load the game once, then take several framed screenshots (each spec sets the scene up in JS).
//   node tools/multishot.mjs "<query>" specs.json [W] [H] [frames]
// specs.json: [{ "name": "crag", "js": "g.time.hour = 10; g.photoCam = {pos:[..], look:[..]}" }, ...]
// Inside "js", g is the game. Shots are written to screenshots/tmp/<name>.png.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';

const [query, specFile, W = 960, H = 540, frames = 4] = process.argv.slice(2);
const specs = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const port = 5100 + Math.floor(Math.random() * 800);
// Shoot a frozen build so source edits during the run don't reload the page.
const snap = `node_modules/.multishot-${port}`;
spawnSync('npx', ['vite', 'build', '--outDir', snap, '--emptyOutDir'], { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--outDir', snap, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
// stop the whole npx > vite process group, then drop the snapshot
process.on('exit', () => { try { process.kill(-server.pid); } catch {} try { fs.rmSync(snap, { recursive: true, force: true }); } catch {} });
await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); }); setTimeout(res, 8000); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('crash', () => console.log('PAGE CRASHED (renderer out of memory?)'));
const logs = []; page.on('console', (m) => { logs.push(m.text().slice(0, 160)); if (logs.length > 15) logs.shift(); });
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/?${query}`);
try {
  await page.waitForFunction(() => window.__game && window.__game.ready && window.__game.state === 'play', null, { timeout: 600000, polling: 1000 });
} catch (e) { console.log('LOAD FAILED', e.message.slice(0, 200), '\n' + logs.join('\n'), '\n' + errs.join('\n')); process.exit(1); }
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
fs.mkdirSync('screenshots/tmp', { recursive: true });
// pause the game loop; each shot then runs a few update + render cycles by hand
await page.evaluate(() => { const g = window.__game; g.params.set('frames', String(g.frames + 1)); });
await page.waitForFunction(() => window.__game.done, null, { timeout: 600000, polling: 500 });
for (const s of specs) {
  const t1 = Date.now();
  await page.evaluate(`(() => { const g = window.__game; ${s.js} })()`);
  await page.evaluate(async (n) => {
    const g = window.__game;
    for (let i = 0; i < n; i++) {
      try { g.tick(1 / 30); } catch (e) { console.error(e); }
      g.engine.render(1 / 30);
      await new Promise((r) => setTimeout(r, 0));
    }
  }, +frames);
  await page.screenshot({ path: `screenshots/tmp/${s.name}.png`, timeout: 600000 });
  console.log(`shot ${s.name} in ${((Date.now() - t1) / 1000).toFixed(0)}s`);
}
console.log('ERRORS', [...new Set(errs)].slice(0, 8).join('\n'));
await browser.close(); process.exit(0);
