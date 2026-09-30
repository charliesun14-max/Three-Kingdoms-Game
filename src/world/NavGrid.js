// 1 m occupancy grid built from static colliders + bounded A* with path smoothing.
export class NavGrid {
  constructor(world) {
    this.world = world;
    const hf = world.hf;
    this.half = hf.half;
    this.N = hf.size; // 1 m cells
    this.block = new Uint8Array(this.N * this.N);
    this.build();
    this.cameFrom = new Int32Array(this.N * this.N);
    this.gScore = new Float32Array(this.N * this.N);
    this.stamp = new Uint32Array(this.N * this.N);
    this.closedStamp = new Uint32Array(this.N * this.N);
    this.curStamp = 1;
  }

  cell(x, z) { return [Math.floor(x + this.half), Math.floor(z + this.half)]; }
  idx(i, j) { return j * this.N + i; }
  blocked(i, j) { return i < 0 || j < 0 || i >= this.N || j >= this.N || this.block[j * this.N + i] > 0; }

  build() {
    const pad = 0.3;
    for (const c of this.world.colliders.all) {
      if (c.type === 'circle') {
        if (c.r < 0.25) continue;
        const r = c.r + pad;
        for (let z = Math.floor(c.z - r); z <= c.z + r; z++) for (let x = Math.floor(c.x - r); x <= c.x + r; x++) {
          if (Math.hypot(x + 0.5 - c.x, z + 0.5 - c.z) < r) this.mark(x, z);
        }
      } else {
        const R = Math.hypot(c.hw, c.hd) + pad;
        for (let z = Math.floor(c.z - R); z <= c.z + R; z++) for (let x = Math.floor(c.x - R); x <= c.x + R; x++) {
          const dx = x + 0.5 - c.x, dz = z + 0.5 - c.z;
          const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
          if (Math.abs(lx) < c.hw + pad && Math.abs(lz) < c.hd + pad) this.mark(x, z);
        }
      }
    }
    // deep water & steep slopes
    const hf = this.world.hf;
    for (let j = 0; j < this.N; j += 1) for (let i = 0; i < this.N; i += 1) {
      const x = i - this.half + 0.5, z = j - this.half + 0.5;
      const w = hf.waterAt(x, z);
      if (w !== null && w - hf.getHeight(x, z) > 1.0 && !this.onSurface(x, z)) this.block[j * this.N + i] = 2;
    }
  }
  onSurface(x, z) {
    for (const s of this.world.settlements.surfaces) {
      const dx = x - s.x, dz = z - s.z;
      const lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c;
      if (Math.abs(lx) <= s.hw && Math.abs(lz) <= s.hd) return true;
    }
    return false;
  }
  mark(x, z) {
    const i = Math.floor(x + this.half), j = Math.floor(z + this.half);
    if (i >= 0 && j >= 0 && i < this.N && j < this.N) this.block[j * this.N + i] = 1;
  }

  // Nearest free cell to (x,z)
  free(i, j, maxR = 6) {
    if (!this.blocked(i, j)) return [i, j];
    for (let r = 1; r <= maxR; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (!this.blocked(i + di, j + dj)) return [i + di, j + dj];
    }
    return null;
  }

  lineFree(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(L / 0.5);
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      const [i, j] = this.cell(x, z);
      if (this.blocked(i, j)) return false;
    }
    return true;
  }

  // Returns array of [x,z] waypoints or null
  findPath(ax, az, bx, bz, maxExpand = 30000) {
    if (this.lineFree(ax, az, bx, bz)) return [[bx, bz]];
    let s = this.cell(ax, az), e = this.cell(bx, bz);
    s = this.free(s[0], s[1]); e = this.free(e[0], e[1]);
    if (!s || !e) return null;
    const N = this.N;
    const stamp = ++this.curStamp;
    const start = this.idx(s[0], s[1]), goal = this.idx(e[0], e[1]);
    const heap = new MinHeap();
    this.gScore[start] = 0; this.stamp[start] = stamp; this.cameFrom[start] = -1;
    heap.push(start, 0);
    let expanded = 0, found = false, best = start, bestH = Infinity;
    const ei = e[0], ej = e[1];
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) { found = true; break; }
      if (this.closedStamp[cur] === stamp) continue;
      this.closedStamp[cur] = stamp;
      if (++expanded > maxExpand) break;
      const ci = cur % N, cj = (cur / N) | 0;
      const h0 = Math.hypot(ci - ei, cj - ej);
      if (h0 < bestH) { bestH = h0; best = cur; }
      for (const [di, dj, cost] of D) {
        const ni = ci + di, nj = cj + dj;
        if (this.blocked(ni, nj)) continue;
        if (di && dj && (this.blocked(ci + di, cj) || this.blocked(ci, cj + dj))) continue;
        const nid = nj * N + ni;
        const g = this.gScore[cur] + cost;
        if (this.stamp[nid] === stamp && g >= this.gScore[nid]) continue;
        this.stamp[nid] = stamp; this.gScore[nid] = g; this.cameFrom[nid] = cur;
        heap.push(nid, g + Math.hypot(ni - ei, nj - ej) * 1.05);
      }
    }
    let node = found ? goal : best;
    const raw = [];
    while (node !== -1 && node !== undefined) {
      raw.push([(node % N) - this.half + 0.5, ((node / N) | 0) - this.half + 0.5]);
      if (node === start) break;
      node = this.cameFrom[node];
    }
    raw.reverse();
    if (found) raw[raw.length - 1] = [bx, bz];
    // string pulling
    const out = [];
    let a = [ax, az], k = 0;
    while (k < raw.length) {
      let far = k;
      for (let m = raw.length - 1; m > k; m--) { if (this.lineFree(a[0], a[1], raw[m][0], raw[m][1])) { far = m; break; } }
      out.push(raw[far]);
      a = raw[far];
      k = far + 1;
    }
    return out;
  }
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = k[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}
