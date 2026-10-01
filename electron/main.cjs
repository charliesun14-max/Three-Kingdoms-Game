// Desktop shell: runs the built game (dist/) in its own window and serves it over app://game/.
// Files under assets/ are looked up first in the player's own asset folders, so larger art
// packs can be dropped in next to the game without rebuilding it.
const { app, BrowserWindow, protocol, net, shell, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);
// prefer the discrete GPU on laptops with two
app.commandLine.appendSwitch('force_high_performance_gpu');

const GAME_DIR = app.isPackaged ? path.join(process.resourcesPath, 'game') : path.join(__dirname, '..', 'dist');

// Where players can put their own assets/ folder (first match wins for each file)
function assetDirs() {
  const dirs = [];
  if (process.env.TK_ASSETS) dirs.push(path.resolve(process.env.TK_ASSETS));
  if (app.isPackaged) {
    const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
    dirs.push(path.join(exeDir, 'assets'));
    // macOS: beside the .app bundle rather than inside it
    if (process.platform === 'darwin') dirs.push(path.join(exeDir, '..', '..', '..', 'assets'));
  }
  dirs.push(path.join(app.getPath('userData'), 'assets'));
  return [...new Set(dirs)].filter((d) => fs.existsSync(d));
}

function inside(root, rel) {
  const p = path.resolve(root, rel);
  return p === root || p.startsWith(root + path.sep) ? p : null;
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.warn(`Bad manifest ${f}: ${e.message}`); return null; } };

// The bundled manifest and every player manifest are merged; player entries win key by key.
function mergedManifest() {
  const list = [path.join(GAME_DIR, 'assets', 'manifest.json'), ...assetDirs().reverse().map((d) => path.join(d, 'manifest.json'))]
    .filter((f) => fs.existsSync(f)).map(readJson).filter(Boolean);
  if (!list.length) return null;
  const out = {};
  for (const m of list) {
    for (const [k, v] of Object.entries(m)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = { ...(out[k] || {}), ...v };
      else out[k] = v;
    }
  }
  return out;
}

function resolveFile(rel) {
  if (rel.startsWith('assets/')) {
    for (const d of assetDirs()) {
      const p = inside(d, rel.slice(7));
      if (p && fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
  }
  const p = inside(GAME_DIR, rel);
  return p && fs.existsSync(p) && fs.statSync(p).isFile() ? p : null;
}

function serve(req) {
  const url = new URL(req.url);
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!rel) rel = 'index.html';
  if (rel === 'assets/manifest.json') {
    const m = mergedManifest();
    return m ? new Response(JSON.stringify(m), { headers: { 'content-type': 'application/json' } }) : new Response('not found', { status: 404 });
  }
  const file = resolveFile(rel);
  if (!file) return new Response('not found', { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

function userAssetFolder() {
  const d = path.join(app.getPath('userData'), 'assets');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 600,
    backgroundColor: '#0c0a08', title: 'Mandate of Heaven', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12' && !app.isPackaged) win.webContents.toggleDevTools();
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL('app://game/index.html' + (process.env.TK_QUERY ? '?' + process.env.TK_QUERY : ''));
  return win;
}

ipcMain.handle('tk:openAssets', () => shell.openPath(userAssetFolder()));
ipcMain.handle('tk:assetInfo', () => ({ folders: assetDirs(), userFolder: path.join(app.getPath('userData'), 'assets') }));
ipcMain.handle('tk:fullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender); w.setFullScreen(!w.isFullScreen()); return w.isFullScreen(); });
ipcMain.handle('tk:quit', () => app.quit());

app.whenReady().then(() => {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  protocol.handle('app', serve);
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
