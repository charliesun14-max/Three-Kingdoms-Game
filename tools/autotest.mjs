// Runs the story autopilot headless and reports progress/errors.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const [mission = '', minutes = '10', extra = ''] = process.argv.slice(2);
const port = 5100 + Math.floor(Math.random() * 800);
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); }); setTimeout(res, 8000); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 400)); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
await page.goto(`http://127.0.0.1:${port}/?play&skipIntro&auto&q=0${mission ? '&mission=' + mission : ''}${extra}`);
const end = Date.now() + +minutes * 60000;
let last = '';
while (Date.now() < end) {
  await new Promise((r) => setTimeout(r, 5000));
  const st = await page.evaluate(() => { const g = window.__game; if (!g || !g.story) return null; return { m: g.story.mission, q: g.quests?.tracked()?.id, region: g.regionId, year: g.time.year, rank: g.progression?.rank, done: g.flags.gameComplete, log: g.autopilot?.log.slice(-3), frames: g.frames }; }).catch((e) => ({ err: e.message }));
  const s = JSON.stringify(st);
  if (s !== last) { console.log(new Date().toISOString().slice(11, 19), s); last = s; }
  if (st && st.done) break;
}
console.log('ERRORS:', [...new Set(errs)].slice(0, 25).join('\n'));
await browser.close(); server.kill(); process.exit(0);
