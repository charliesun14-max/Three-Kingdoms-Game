// Static 2D (XZ) colliders in a spatial hash: circles and oriented boxes.
export class Colliders {
  constructor(cell = 16) {
    this.cell = cell;
    this.map = new Map();
    this.all = [];
  }
  key(i, j) { return i * 73856093 ^ j * 19349663; }
  insert(c) {
    this.all.push(c);
    const r = c.type === 'circle' ? c.r : Math.hypot(c.hw, c.hd);
    const i0 = Math.floor((c.x - r) / this.cell), i1 = Math.floor((c.x + r) / this.cell);
    const j0 = Math.floor((c.z - r) / this.cell), j1 = Math.floor((c.z + r) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j);
      if (!this.map.has(k)) this.map.set(k, []);
      this.map.get(k).push(c);
    }
    return c;
  }
  addCircle(x, z, r, data = {}) { return this.insert({ type: 'circle', x, z, r, ...data }); }
  // hw/hd = half extents along local x/z; rot = yaw (radians)
  addBox(x, z, hw, hd, rot = 0, data = {}) {
    return this.insert({ type: 'box', x, z, hw, hd, rot, c: Math.cos(rot), s: Math.sin(rot), ...data });
  }
  remove(c) {
    c.disabled = true;
  }
  query(x, z, r = 1) {
    const out = [];
    const seen = new Set();
    const i0 = Math.floor((x - r) / this.cell), i1 = Math.floor((x + r) / this.cell);
    const j0 = Math.floor((z - r) / this.cell), j1 = Math.floor((z + r) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.map.get(this.key(i, j));
      if (!a) continue;
      for (const c of a) if (!seen.has(c) && !c.disabled) { seen.add(c); out.push(c); }
    }
    return out;
  }
  // Push a circle (pos with x,z) out of colliders. Returns true if collided.
  resolve(pos, radius, y = null) {
    let hit = false;
    for (const c of this.query(pos.x, pos.z, radius + 2)) {
      if (y !== null && c.top !== undefined && y > c.top) continue; // walked on top (e.g. low platforms)
      if (c.type === 'circle') {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d = Math.hypot(dx, dz), m = c.r + radius;
        if (d < m && d > 1e-6) { pos.x += (dx / d) * (m - d); pos.z += (dz / d) * (m - d); hit = true; }
      } else {
        // to local
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const lx = dx * c.c - dz * c.s;
        const lz = dx * c.s + dz * c.c;
        const cx = Math.max(-c.hw, Math.min(c.hw, lx));
        const cz = Math.max(-c.hd, Math.min(c.hd, lz));
        let ox = lx - cx, oz = lz - cz;
        let d = Math.hypot(ox, oz);
        if (d < radius) {
          let nx, nz, push;
          if (d > 1e-6) { nx = ox / d; nz = oz / d; push = radius - d; }
          else {
            // inside box: push out along smallest penetration
            const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
            if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + radius; }
            else { nx = 0; nz = Math.sign(lz) || 1; push = pz + radius; }
          }
          const wx = nx * c.c + nz * c.s;
          const wz = -nx * c.s + nz * c.c;
          pos.x += wx * push; pos.z += wz * push;
          hit = true;
        }
      }
    }
    return hit;
  }
  // Segment test for line of sight / projectiles (XZ only).
  blocked(ax, az, bx, bz, step = 1) {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(L / step);
    for (let k = 1; k < n; k++) {
      const x = ax + (bx - ax) * (k / n), z = az + (bz - az) * (k / n);
      for (const c of this.query(x, z, 0.1)) {
        if (c.noBlockSight) continue;
        if (c.type === 'circle') { if (Math.hypot(x - c.x, z - c.z) < c.r) return true; }
        else {
          const dx = x - c.x, dz = z - c.z;
          const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
          if (Math.abs(lx) < c.hw && Math.abs(lz) < c.hd) return true;
        }
      }
    }
    return false;
  }
}
