// Keyboard + mouse input with pointer lock and per-frame edge detection.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, buttons: new Set(), pressed: new Set(), released: new Set(), wheel: 0 };
    this.locked = false;
    this.enabled = true;
    // Rolling window of recent mouse motion, used to pick attack directions.
    this.motion = [];

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Tab', 'Space', 'F1', 'F5', 'F9'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons.clear(); });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && this.wantLock) this.requestLock();
      this.mouse.buttons.add(e.button);
      this.mouse.pressed.add(e.button);
    });
    window.addEventListener('mouseup', (e) => {
      this.mouse.buttons.delete(e.button);
      this.mouse.released.add(e.button);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
      const now = performance.now();
      this.motion.push({ t: now, x: e.movementX, y: e.movementY });
      while (this.motion.length && now - this.motion[0].t > 180) this.motion.shift();
    });
    window.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    this.wantLock = true;
  }

  requestLock() {
    if (this.canvas.requestPointerLock) {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  up(code) { return this.released.has(code); }
  mouseDown(b) { return this.enabled && this.mouse.buttons.has(b); }
  mouseHit(b) { return this.enabled && this.mouse.pressed.has(b); }
  mouseUp(b) { return this.mouse.released.has(b); }

  // Dominant recent mouse motion direction: 'left' | 'right' | 'up' | 'down' | null
  swipeDir(minMag = 6) {
    let x = 0, y = 0;
    for (const m of this.motion) { x += m.x; y += m.y; }
    if (Math.hypot(x, y) < minMag) return null;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
    return y > 0 ? 'down' : 'up';
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.pressed.clear();
    this.mouse.released.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
  }
}
