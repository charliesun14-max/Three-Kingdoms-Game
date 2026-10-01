// Screenshot harness: node tools/shoot.mjs <name> "<query string>" [waitFrames] [width] [height]
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';

const [name = 'shot', query = '', frames = '6', W = '1280', H = '720', script = ''] = process.argv.slice(2);
const port = 5100 + Math.floor(Math.random() * 800);
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); }); setTimeout(res, 8000); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => { logs.push(`[pageerror] ${e.message}\n${e.stack}`); page.evaluate(() => { window.__err = 1; }).catch(() => {}); });
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/?${query}&frames=${frames}`);
try {
  await page.waitForFunction(() => (window.__game && window.__game.ready) || window.__err, null, { timeout: 240000 });
  if (script) await page.evaluate(script);
  await page.waitForFunction(() => window.__game.done || window.__err, null, { timeout: 400000, polling: 1000 });
} catch (e) { logs.push('TIMEOUT ' + e.message); }
fs.mkdirSync('screenshots/tmp', { recursive: true });
await page.screenshot({ path: `screenshots/tmp/${name}.png`, timeout: 400000 });
console.log(`shot ${name} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log([...new Set(logs.filter((l) => !l.includes('GPU stall') && !l.includes('[vite]')))].slice(0, 12).join('\n'));
await browser.close();
server.kill();
process.exit(0);
