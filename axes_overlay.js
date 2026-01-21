export function createAxesOverlay({ container, camera, size = 48, padding = 14 }) {
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "2";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize(nextWidth, nextHeight) {
    width = nextWidth;
    height = nextHeight;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function normalize(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function drawAxis(dir, color, label) {
    const len2 = Math.hypot(dir[0], dir[1]);
    if (len2 < 1e-6) return;
    const nx = dir[0] / len2;
    const ny = dir[1] / len2;

    const baseX = width - padding - size;
    const baseY = height - padding - size;
    const endX = baseX + nx * size;
    const endY = baseY - ny * size;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(label, endX + 4, endY - 2);
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    const f = normalize([
      camera.target[0] - camera.eye[0],
      camera.target[1] - camera.eye[1],
      camera.target[2] - camera.eye[2],
    ]);
    const r = normalize(cross(f, camera.up));
    const u = cross(r, f);

    const axes = [
      { v: [1, 0, 0], color: "#ff4d4d", label: "X" },
      { v: [0, 1, 0], color: "#4caf50", label: "Y" },
      { v: [0, 0, 1], color: "#3f7bff", label: "Z" },
    ];

    for (const axis of axes) {
      const dx = axis.v[0] * r[0] + axis.v[1] * r[1] + axis.v[2] * r[2];
      const dy = axis.v[0] * u[0] + axis.v[1] * u[1] + axis.v[2] * u[2];
      drawAxis([dx, dy], axis.color, axis.label);
    }
  }

  function dispose() {
    canvas.remove();
  }

  return { resize, draw, dispose };
}
