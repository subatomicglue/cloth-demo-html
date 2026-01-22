import { createAxesOverlay } from "./axes_overlay.js";

const RENDERER_NAME = "WebGL";

// create a raw WebGL renderer instance.
export function createRenderer({ container, cloth, camera, notify }) {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.appendChild(canvas);

  const axes = createAxesOverlay({ container, camera });

  const gl = canvas.getContext("webgl", { alpha: false, antialias: true });
  if (!gl) {
    if (notify) notify("WebGL not supported on this device.", { type: "warning" });
    return {
      // draw no-op when WebGL is unavailable.
      render() {},
      // resize no-op when WebGL is unavailable.
      resize() { axes.resize(0, 0); },
      // return empty size when WebGL is unavailable.
      getSize() { return { width: 0, height: 0 }; },
      // release DOM resources when WebGL is unavailable.
      dispose() { axes.dispose(); canvas.remove(); },
    };
  }

  gl.clearColor(0.88, 0.95, 1.0, 1);
  gl.enable(gl.DEPTH_TEST);

  const VS = `
attribute vec3 aPos;
uniform mat4 uMVP;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

  const FS = `
precision mediump float;
uniform vec3 uFrontColor;
uniform vec3 uBackColor;
uniform float uOpacity;
void main() {
  vec3 color = gl_FrontFacing ? uFrontColor : uBackColor;
  gl_FragColor = vec4(color, uOpacity);
}
`;

  function compile(type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  const aPos = gl.getAttribLocation(prog, "aPos");
  const uMVP = gl.getUniformLocation(prog, "uMVP");
  const uFrontColor = gl.getUniformLocation(prog, "uFrontColor");
  const uBackColor = gl.getUniformLocation(prog, "uBackColor");
  const uOpacity = gl.getUniformLocation(prog, "uOpacity");

  const positions = cloth.getPositions();

  const uintExt = gl.getExtension("OES_element_index_uint");
  const indexType = uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

  if (!uintExt && notify) {
    notify("WebGL: no UINT indices, 256x256 may not render.", { type: "warning" });
  }

  const triSrc = cloth.getTriangleIndices();
  const lineSrc = cloth.getLineIndices();
  const triIdx = uintExt ? new Uint32Array(triSrc) : new Uint16Array(triSrc);
  const lineIdx = uintExt ? new Uint32Array(lineSrc) : new Uint16Array(lineSrc);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

  const iboTri = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboTri);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triIdx, gl.STATIC_DRAW);

  const iboLine = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboLine);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lineIdx, gl.STATIC_DRAW);

  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, (2 * far * near) * nf, 0,
    ]);
  }

  function lookAt(e, t, u) {
    let zx = e[0] - t[0];
    let zy = e[1] - t[1];
    let zz = e[2] - t[2];
    let zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;

    let xx = u[1] * zz - u[2] * zy;
    let xy = u[2] * zx - u[0] * zz;
    let xz = u[0] * zy - u[1] * zx;
    let xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]),
      -(yx * e[0] + yy * e[1] + yz * e[2]),
      -(zx * e[0] + zy * e[1] + zz * e[2]),
      1,
    ]);
  }

  function mul(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  let width = 0;
  let height = 0;

  // resize to container bounds.
  function resize() {
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    axes.resize(width, height);
  }

  // draw the current cloth state.
  function render() {
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const near = camera.near != null ? camera.near : 0.01;
    const far = camera.far != null ? camera.far : 100;
    const P = perspective(camera.fov, canvas.width / canvas.height, near, far);
    const V = lookAt(camera.eye, camera.target, camera.up);
    const MVP = mul(P, V);
    gl.uniformMatrix4fv(uMVP, false, MVP);

    gl.uniform3f(uFrontColor, 1.0, 0.302, 0.302);
    gl.uniform3f(uBackColor, 1.0, 1.0, 1.0);
    gl.uniform1f(uOpacity, 1.0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboTri);
    gl.drawElements(gl.TRIANGLES, triIdx.length, indexType, 0);

    gl.uniform3f(uFrontColor, 0.145, 0.388, 0.922);
    gl.uniform3f(uBackColor, 0.145, 0.388, 0.922);
    gl.uniform1f(uOpacity, 1.0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboLine);
    gl.drawElements(gl.LINES, lineIdx.length, indexType, 0);

    axes.draw();
  }

  // return current render size for pointer ray math.
  function getSize() {
    return { width, height };
  }

  // release GPU/DOM resources.
  function dispose() {
    axes.dispose();
    gl.deleteBuffer(vbo);
    gl.deleteBuffer(iboTri);
    gl.deleteBuffer(iboLine);
    gl.deleteProgram(prog);
    canvas.remove();
  }

  resize();

  // return the Public API for the renderer
  function getName() {
    return RENDERER_NAME;
  }

  return { render, resize, getSize, dispose, getName };
}

createRenderer.getName = () => RENDERER_NAME;
