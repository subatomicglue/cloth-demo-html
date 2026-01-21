import { createAxesOverlay } from "./axes_overlay.js";

// create a Canvas2D renderer instance.
export function createRenderer({ container, cloth, camera, notify }) {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d", { alpha: false });
  let width = 0;
  let height = 0;

  const axes = createAxesOverlay({ container, camera });

  // resize to container bounds.
  function resize() {
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    axes.resize(width, height);
  }

  function normalize(v) {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    v.x /= len; v.y /= len; v.z /= len; return v;
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function makeViewBasis() {
    const eye = { x: camera.eye[0], y: camera.eye[1], z: camera.eye[2] };
    const target = { x: camera.target[0], y: camera.target[1], z: camera.target[2] };
    const f = normalize(sub(target, eye));
    const up = { x: camera.up[0], y: camera.up[1], z: camera.up[2] };
    const r = normalize(cross(f, up));
    const u = cross(r, f);
    return { r, u, f, eye };
  }

  function project(x, y, z, basis) {
    const dx = x - basis.eye.x;
    const dy = y - basis.eye.y;
    const dz = z - basis.eye.z;
    const cx = dx * basis.r.x + dy * basis.r.y + dz * basis.r.z;
    const cy = dx * basis.u.x + dy * basis.u.y + dz * basis.u.z;
    const cz = dx * basis.f.x + dy * basis.f.y + dz * basis.f.z;

    const scale = (0.5 * height) / Math.tan(camera.fov * 0.5);
    if (cz <= 0.01) return null;

    const sx = (width * 0.5) + (cx * scale / cz);
    const sy = (height * 0.5) - (cy * scale / cz);
    return { x: sx, y: sy, z: cz };
  }

  const pos = cloth.getPositions();
  const tri = cloth.getTriangleIndices();
  const lines = cloth.getLineIndices();

  // draw the current cloth state.
  function render() {
    ctx.clearRect(0, 0, width, height);

    const basis = makeViewBasis();
    const n = pos.length / 3;
    const projected = new Array(n);

    for (let i = 0; i < n; i++) {
      const p = i * 3;
      projected[i] = project(pos[p], pos[p + 1], pos[p + 2], basis);
    }

    ctx.fillStyle = "#ff0000";
    for (let k = 0; k < tri.length; k += 3) {
      const a = projected[tri[k]];
      const b = projected[tri[k + 1]];
      const c = projected[tri[k + 2]];
      if (!a || !b || !c) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = "#0000ff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < lines.length; k += 2) {
      const a = projected[lines[k]];
      const b = projected[lines[k + 1]];
      if (!a || !b) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    axes.draw();
  }

  // return current render size for pointer ray math.
  function getSize() {
    return { width, height };
  }

  // release DOM resources.
  function dispose() {
    axes.dispose();
    canvas.remove();
  }

  resize();

  // return the Public API for the renderer
  return { render, resize, getSize, dispose };
}
