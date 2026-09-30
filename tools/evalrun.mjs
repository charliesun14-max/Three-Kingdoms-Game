// Start the game with a query, wait N seconds, then evaluate an expression.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
const [query, secs, expr] = process.argv.slice(2);
const port = 5100 + Math.floor(Math.random() * 800);
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); }); setTimeout(res, 8000); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${port}/?${query}`);
await new Promise((r) => setTimeout(r, +secs * 1000));
try { console.log(JSON.stringify(await page.evaluate(expr), null, 1)); } catch (e) { console.log('EVAL ERR', e.message); }
console.log('ERRORS', [...new Set(errs)].slice(0, 10).join('\n'));
await browser.close(); server.kill(); process.exit(0);
