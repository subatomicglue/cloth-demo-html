// cloth.js - minimal Verlet cloth (ES module)
//
// Grid is nx * ny particles laid out horizontally (x,z plane) at y = 0.
// Top edge (j=0) is pinned by default.
// Uses Verlet integration + iterative distance constraints (structural + optional shear).

export class Cloth {
  // construct a new cloth with grid/solver settings.
  constructor({
    nx = 256,
    ny = 256,
    spacing = 0.01,
    origin = [-1.28, 0.0, -1.28], // roughly centers a 256*0.01 patch near origin
    gravity = [0, -9.8, 0],
    damping = 0.995,
    constraintIters = 6,
    useShear = true,
    pinEdge = "top", // "top" | "bottom" | "left" | "right"
    maxSubstep = 1 / 120,  // seconds
    maxAccumulated = 0.25, // seconds
  } = {}) {
    this.nx = nx;
    this.ny = ny;
    this.spacing = spacing;
    this.gravity = gravity;
    this.damping = damping;
    this.constraintIters = constraintIters;
    this.useShear = useShear;

    const n = nx * ny;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.invMass = new Float32Array(n); // 0 = pinned, 1 = normal mass (uniform)

    // init positions: horizontal sheet (x,z), y=0
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = (j * nx + i) * 3;
        const x = origin[0] + i * spacing;
        const y = origin[1];
        const z = origin[2] + j * spacing;
        this.pos[idx + 0] = x;
        this.pos[idx + 1] = y;
        this.pos[idx + 2] = z;

        this.prev[idx + 0] = x;
        this.prev[idx + 1] = y;
        this.prev[idx + 2] = z;

        this.invMass[j * nx + i] = 1.0;
      }
    }

    // pin one edge
    const pin = (i, j) => (this.invMass[j * nx + i] = 0.0);
    if (pinEdge === "top") for (let i = 0; i < nx; i++) pin(i, 0);
    if (pinEdge === "bottom") for (let i = 0; i < nx; i++) pin(i, ny - 1);
    if (pinEdge === "left") for (let j = 0; j < ny; j++) pin(0, j);
    if (pinEdge === "right") for (let j = 0; j < ny; j++) pin(nx - 1, j);

    // precompute triangle index buffer (shared by all renderers)
    this.indices = this._buildTriangleIndices();
    // precompute line index buffer (wireframe)
    this.lineIndices = this._buildLineIndices();

    // fixed-step integration bookkeeping
    this.maxSubstep = Math.max(1e-4, maxSubstep);
    this.maxAccumulated = Math.max(this.maxSubstep, maxAccumulated);
    this._stepAccumulator = 0;

    // optional forces + interaction state
    this.wind = new Float32Array([0, 0, 0]);
    this.windEnabled = true;
    this.pointerRayOrigin = new Float32Array([0, 0, 0]);
    this.pointerRayDir = new Float32Array([0, 0, -1]);
    this.pointerDown = false;
    this.pointerGrabIndex = -1;
    this.pointerGrabT = 0;
    this.pointerGrabThreshold = spacing * 2;
  }

  _buildTriangleIndices() {
    const { nx, ny } = this;
    const tris = (nx - 1) * (ny - 1) * 2;
    const idx = new Uint32Array(tris * 3);
    let p = 0;
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = j * nx + (i + 1);
        const c = (j + 1) * nx + i;
        const d = (j + 1) * nx + (i + 1);
        // two triangles: a-c-b and b-c-d
        idx[p++] = a; idx[p++] = c; idx[p++] = b;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    }
    return idx;
  }

  _buildLineIndices() {
    // Unique-ish edges (not perfectly deduped, but kept minimal/simple):
    // horizontal + vertical + (optional) diagonals for shear visibility
    const { nx, ny, useShear } = this;
    const edges = [];
    const pushEdge = (u, v) => { edges.push(u, v); };

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * nx + i;
        if (i + 1 < nx) pushEdge(a, a + 1);
        if (j + 1 < ny) pushEdge(a, a + nx);
        if (useShear) {
          if (i + 1 < nx && j + 1 < ny) pushEdge(a, a + nx + 1);
          if (i - 1 >= 0 && j + 1 < ny) pushEdge(a, a + nx - 1);
        }
      }
    }
    return new Uint32Array(edges);
  }

  // shared position buffer (Float32Array, xyz per vertex).
  getPositions() { return this.pos; }
  // triangle index buffer for filled rendering.
  getTriangleIndices() { return this.indices; }
  // line index buffer for wireframe rendering.
  getLineIndices() { return this.lineIndices; }

  // set or update wind acceleration vector.
  setWind(vec = [0, 0, 0]) {
    this.wind[0] = vec[0] ?? 0;
    this.wind[1] = vec[1] ?? 0;
    this.wind[2] = vec[2] ?? 0;
    this.windEnabled = true;
  }

  // enable/disable wind without changing the vector.
  setWindEnabled(enabled = true) {
    this.windEnabled = !!enabled;
  }

  // provide a pointer ray and active state for grabbing.
  setPointerRay(origin = [0, 0, 0], dir = [0, 0, -1], active = false) {
    const wasDown = this.pointerDown;
    this.pointerRayOrigin[0] = origin[0] ?? 0;
    this.pointerRayOrigin[1] = origin[1] ?? 0;
    this.pointerRayOrigin[2] = origin[2] ?? 0;

    let dx = dir[0] ?? 0;
    let dy = dir[1] ?? 0;
    let dz = dir[2] ?? -1;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    this.pointerRayDir[0] = dx;
    this.pointerRayDir[1] = dy;
    this.pointerRayDir[2] = dz;

    this.pointerDown = !!active;
    if (!this.pointerDown) {
      this.pointerGrabIndex = -1;
    } else if (!wasDown && this.pointerDown) {
      this.pointerGrabIndex = -1;
    }
  }

  // test whether a pointer ray is close enough to grab the cloth.
  hitTestRay(origin = [0, 0, 0], dir = [0, 0, -1], threshold = this.pointerGrabThreshold) {
    const hit = this._rayPick(origin, dir, threshold);
    return !!hit;
  }

  // advance simulation by dt seconds (internally substeps).
  step(dt) {
    if (!isFinite(dt) || dt <= 0) return;

    this._stepAccumulator = Math.min(this._stepAccumulator + dt, this.maxAccumulated);
    while (this._stepAccumulator + 1e-9 >= this.maxSubstep) {
      this._stepAccumulator -= this.maxSubstep;
      this._stepFixed(this.maxSubstep);
    }
  }

  // Private: structural distance constraints.
  _satisfyStructural() {
    const { pos, invMass, nx, ny, spacing } = this;

    // right neighbors
    for (let j = 0; j < ny; j++) {
      let base = j * nx;
      for (let i = 0; i < nx - 1; i++) {
        const a = base + i;
        const b = a + 1;
        this._solveDistance(a, b, spacing, pos, invMass);
      }
    }

    // down neighbors
    for (let j = 0; j < ny - 1; j++) {
      let base = j * nx;
      for (let i = 0; i < nx; i++) {
        const a = base + i;
        const b = a + nx;
        this._solveDistance(a, b, spacing, pos, invMass);
      }
    }
  }

  // Private: shear distance constraints.
  _satisfyShear() {
    const { pos, invMass, nx, ny, spacing } = this;
    const diag = Math.sqrt(2) * spacing;

    for (let j = 0; j < ny - 1; j++) {
      let base = j * nx;
      for (let i = 0; i < nx - 1; i++) {
        const a = base + i;
        const b = a + nx + 1;
        this._solveDistance(a, b, diag, pos, invMass);
      }
    }

    for (let j = 0; j < ny - 1; j++) {
      let base = j * nx;
      for (let i = 1; i < nx; i++) {
        const a = base + i;
        const b = a + nx - 1;
        this._solveDistance(a, b, diag, pos, invMass);
      }
    }
  }

  // Private: single distance constraint solve.
  _solveDistance(a, b, rest, pos, invMass) {
    const ia = a * 3, ib = b * 3;

    const ax = pos[ia + 0], ay = pos[ia + 1], az = pos[ia + 2];
    const bx = pos[ib + 0], by = pos[ib + 1], bz = pos[ib + 2];

    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 === 0) return;

    const d = Math.sqrt(d2);
    const diff = (d - rest) / d;

    const wA = invMass[a];
    const wB = invMass[b];
    const wSum = wA + wB;
    if (wSum === 0) return;

    const sA = wA / wSum;
    const sB = wB / wSum;

    // pull together/ apart
    dx *= diff; dy *= diff; dz *= diff;

    if (wA !== 0) {
      pos[ia + 0] += dx * sA;
      pos[ia + 1] += dy * sA;
      pos[ia + 2] += dz * sA;
    }
    if (wB !== 0) {
      pos[ib + 0] -= dx * sB;
      pos[ib + 1] -= dy * sB;
      pos[ib + 2] -= dz * sB;
    }
  }

  // Private: fixed-step verlet integration + constraints.
  _stepFixed(dt) {
    const dt2 = dt * dt;
    const { pos, prev, invMass, damping, gravity } = this;
    const windX = this.windEnabled ? this.wind[0] : 0;
    const windY = this.windEnabled ? this.wind[1] : 0;
    const windZ = this.windEnabled ? this.wind[2] : 0;

    // Verlet integrate
    for (let p = 0, k = 0; k < invMass.length; k++, p += 3) {
      if (invMass[k] === 0) continue; // pinned

      const x = pos[p + 0], y = pos[p + 1], z = pos[p + 2];
      const px = prev[p + 0], py = prev[p + 1], pz = prev[p + 2];

      const vx = (x - px) * damping;
      const vy = (y - py) * damping;
      const vz = (z - pz) * damping;

      prev[p + 0] = x;
      prev[p + 1] = y;
      prev[p + 2] = z;

      pos[p + 0] = x + vx + (gravity[0] + windX) * dt2;
      pos[p + 1] = y + vy + (gravity[1] + windY) * dt2;
      pos[p + 2] = z + vz + (gravity[2] + windZ) * dt2;
    }

    for (let iter = 0; iter < this.constraintIters; iter++) {
      this._satisfyStructural();
      if (this.useShear) this._satisfyShear();
    }

    this._applyPointerGrab();
  }

  // Private: choose a vertex to grab from the current ray.
  _findPointerGrabTarget() {
    const hit = this._rayPick(this.pointerRayOrigin, this.pointerRayDir, this.pointerGrabThreshold);
    if (!hit) {
      this.pointerGrabIndex = -1;
      return;
    }
    this.pointerGrabIndex = hit.index;
    this.pointerGrabT = hit.t;
  }

  // Private: ray proximity test against vertices.
  _rayPick(origin, dir, threshold) {
    const { pos, invMass } = this;
    let dx = dir[0] ?? 0;
    let dy = dir[1] ?? 0;
    let dz = dir[2] ?? -1;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;

    let bestIdx = -1;
    let bestDist = threshold;
    let bestT = 0;

    for (let i = 0, v = 0; i < pos.length; i += 3, v++) {
      if (invMass[v] === 0) continue;

      const px = pos[i + 0] - origin[0];
      const py = pos[i + 1] - origin[1];
      const pz = pos[i + 2] - origin[2];
      const t = px * dx + py * dy + pz * dz;
      if (t < 0) continue;

      const qx = origin[0] + dx * t;
      const qy = origin[1] + dy * t;
      const qz = origin[2] + dz * t;
      const dist = Math.hypot(pos[i + 0] - qx, pos[i + 1] - qy, pos[i + 2] - qz);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = v;
        bestT = t;
      }
    }

    if (bestIdx === -1) return null;
    return { index: bestIdx, t: bestT, dist: bestDist };
  }

  // Private: pin the grabbed vertex to the pointer ray.
  _applyPointerGrab() {
    if (!this.pointerDown) {
      this.pointerGrabIndex = -1;
      return;
    }
    if (this.pointerGrabIndex === -1) this._findPointerGrabTarget();
    if (this.pointerGrabIndex === -1) return;

    const o = this.pointerRayOrigin;
    const d = this.pointerRayDir;
    const t = this.pointerGrabT;
    const tx = o[0] + d[0] * t;
    const ty = o[1] + d[1] * t;
    const tz = o[2] + d[2] * t;

    const base = this.pointerGrabIndex * 3;
    this.pos[base + 0] = tx;
    this.pos[base + 1] = ty;
    this.pos[base + 2] = tz;
    this.prev[base + 0] = tx;
    this.prev[base + 1] = ty;
    this.prev[base + 2] = tz;
  }
}
