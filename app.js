import { Cloth } from "./cloth.js";
import { createRenderer as createCanvas2D } from "./renderer_canvas2d.js";
import { createRenderer as createWebGL } from "./renderer_webgl.js";
import { createRenderer as createThree } from "./renderer_threejs.js";
import { createToastManager } from "./toast_notification.js";

const container = document.getElementById("viewport");
const rendererSelect = document.getElementById("rendererSelect");
const toolbarToggle = document.getElementById("toolbarToggle");
const toolbar = document.getElementById("toolbar");
const windToggleBtn = document.getElementById("windToggleBtn");
const windToggleText = document.getElementById("windToggleText");
const hud = document.getElementById("hud");
const hudToggle = document.getElementById("hudToggle");
const controlsForm = document.getElementById("controls");
const nxInput = document.getElementById("nx");
const nyInput = document.getElementById("ny");
const clothSizeInput = document.getElementById("clothSize");
const constraintInput = document.getElementById("constraintIters");
const gravityInput = document.getElementById("gravityMag");
const windInput = document.getElementById("windVec");
const windVariationInput = document.getElementById("windVariation");
const pinEdgeSelect = document.getElementById("pinEdge");
const maxSubstepInput = document.getElementById("maxSubstep");
const maxAccumulatedInput = document.getElementById("maxAccumulated");
const useShearInput = document.getElementById("useShear");
const applyBtn = document.getElementById("applyBtn");
const resetSimBtn = document.getElementById("resetSimBtn");
const resetDefaultsBtn = document.getElementById("resetDefaultsBtn");
const status = document.getElementById("status");
const { notify } = createToastManager();

let currentBaseWind = [-20, 0, 0];
let currentWindFactor = 1;
let targetWindFactor = 1;

const camera = {
  eye: [0, 1.2, 2.2],
  target: [0, 0, 0],
  up: [0, 1, 0],
  fov: 55 * Math.PI / 180,
  fovDeg: 55,
  near: 0.01,
  far: 200,
};

const rendererFactories = {
  three: createThree,
  canvas2d: createCanvas2D,
  webgl: createWebGL,
};

let cloth = null;
let renderer = null;
let activeRendererType = rendererSelect.value;
let lastTime = performance.now();
let buildToken = 0;
let currentParams = null;

const pointer = {
  x: 0,
  y: 0,
  down: false,
  shift: false,
  lx: 0,
  ly: 0,
  mode: "none",
};

function isUiEventTarget(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest("#toolbar, #hud, #toolbarToggle, #toast-notification-container");
}

const orbit = {
  yaw: 0,
  pitch: 0,
  radius: 1,
};

function readNumber(input, fallback) {
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function parseVectorInput(text) {
  if (!text || !text.trim()) return [0, 0, 0];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return [
        Number(parsed[0]) || 0,
        Number(parsed[1]) || 0,
        Number(parsed[2]) || 0,
      ];
    }
    if (parsed && typeof parsed === "object") {
      return [
        Number(parsed.x) || 0,
        Number(parsed.y) || 0,
        Number(parsed.z) || 0,
      ];
    }
  } catch (err) {
    // handled below
  }
  notify("Wind vector must be JSON, e.g. [0,0,0] or {\"x\":0,\"y\":0,\"z\":0}", { type: "warning" });
  return [0, 0, 0];
}

function readParams() {
  const nx = Math.max(2, Math.floor(readNumber(nxInput, 16)));
  const ny = Math.max(2, Math.floor(readNumber(nyInput, 16)));
  const size = Math.max(1, readNumber(clothSizeInput, 20));
  const spacing = size / Math.max(1, Math.max(nx, ny) - 1);
  const extentX = spacing * (nx - 1);
  const extentZ = spacing * (ny - 1);
  const gravityMag = Math.max(0, readNumber(gravityInput, 9.8));
  const wind = parseVectorInput(windInput.value);
  const windVariation = readNumber(windVariationInput, 0.5);

  return {
    nx,
    ny,
    size,
    spacing,
    origin: [-extentX / 2, 0.7, -extentZ / 2],
    pinEdge: pinEdgeSelect.value,
    constraintIters: Math.max(1, Math.floor(readNumber(constraintInput, 6))),
    useShear: useShearInput.checked,
    gravity: [0, -gravityMag, 0],
    gravityMag,
    wind,
    windVariation,
    maxSubstep: Math.max(0.002, readNumber(maxSubstepInput, 1 / 120)),
    maxAccumulated: Math.max(0.05, readNumber(maxAccumulatedInput, 0.25)),
  };
}

function updateStatus(params) {
  if (!status) return;
  status.textContent = `Renderer: ${activeRendererType} | ${params.nx}x${params.ny} | size ${params.size} | step ${params.maxSubstep.toFixed(3)}s`;
}

function updateWindToggle() {
  if (!windToggleBtn || !cloth) return;
  windToggleBtn.textContent = cloth.windEnabled ? "Wind On" : "Wind Off";
}

function disposeRenderer() {
  if (renderer && renderer.dispose) renderer.dispose();
  renderer = null;
  container.innerHTML = "";
}

function resetSimulation() {
  buildRenderer(true);
  notify("Cloth reset.", { type: "info" });
}

function resetDefaults() {
  if (controlsForm) controlsForm.reset();
  buildRenderer(true);
}

function needsRebuild(nextParams, prevParams) {
  if (!prevParams) return true;
  if (nextParams.nx !== prevParams.nx) return true;
  if (nextParams.ny !== prevParams.ny) return true;
  if (nextParams.size !== prevParams.size) return true;
  if (nextParams.spacing !== prevParams.spacing) return true;
  if (nextParams.pinEdge !== prevParams.pinEdge) return true;
  if (nextParams.useShear !== prevParams.useShear) return true;
  return false;
}

function applyParamsWithoutRebuild(nextParams) {
  if (!cloth) return;
  cloth.constraintIters = nextParams.constraintIters;
  cloth.maxSubstep = Math.max(1e-4, nextParams.maxSubstep);
  cloth.maxAccumulated = Math.max(cloth.maxSubstep, nextParams.maxAccumulated);
  cloth.gravity[0] = nextParams.gravity[0];
  cloth.gravity[1] = nextParams.gravity[1];
  cloth.gravity[2] = nextParams.gravity[2];
  cloth.setWind(nextParams.wind);
  currentBaseWind = nextParams.wind.slice();
  currentParams = nextParams;
  updateStatus(nextParams);
  updateWindToggle();
  notify("Settings applied.", { type: "info" });
}

function applyChanges() {
  const params = readParams();
  if (needsRebuild(params, currentParams)) {
    buildRenderer(true);
  } else {
    applyParamsWithoutRebuild(params);
  }
}

async function buildRenderer(rebuildCloth = true) {
  const token = ++buildToken;
  const params = rebuildCloth || !currentParams ? readParams() : currentParams;

  if (rebuildCloth || !cloth) {
    const maxExtent = Math.max(
      (params.nx - 1) * params.spacing,
      (params.ny - 1) * params.spacing
    );
    const distance = (maxExtent * 0.5) / Math.tan(camera.fov * 0.5);
    camera.eye = [distance * 0.35, maxExtent * 0.3 + 0.6, distance * 1.1];
    camera.target = [0, 0, 0];
    camera.near = 0.01;
    camera.far = Math.max(200, distance * 3 + maxExtent * 4);
    syncOrbitFromCamera();

    cloth = new Cloth(params);
    cloth.setWind(params.wind);
    updateWindText();
    currentBaseWind = params.wind.slice();
    currentParams = params;
  }

  disposeRenderer();
  activeRendererType = rendererSelect.value;
  const factory = rendererFactories[activeRendererType];
  if (!factory) return;
  notify(`Renderer: ${activeRendererType}`, { type: "info" });

  let nextRenderer = null;
  try {
    nextRenderer = await factory({ container, cloth, camera, notify });
  } catch (err) {
    notify(`Renderer failed: ${err?.message ?? err}`, { type: "warning" });
    return;
  }
  if (token !== buildToken) {
    if (nextRenderer && nextRenderer.dispose) nextRenderer.dispose();
    return;
  }

  renderer = nextRenderer;
  if (renderer && renderer.resize) renderer.resize();
  updateStatus(currentParams || params);
  updateWindToggle();
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function syncOrbitFromCamera() {
  const dx = camera.eye[0] - camera.target[0];
  const dy = camera.eye[1] - camera.target[1];
  const dz = camera.eye[2] - camera.target[2];
  orbit.radius = Math.hypot(dx, dy, dz) || 1;
  orbit.yaw = Math.atan2(dx, dz);
  orbit.pitch = Math.asin(dy / orbit.radius);
}

function applyOrbitCamera() {
  const cp = Math.cos(orbit.pitch);
  const sp = Math.sin(orbit.pitch);
  const cy = Math.cos(orbit.yaw);
  const sy = Math.sin(orbit.yaw);
  camera.eye = [
    camera.target[0] + orbit.radius * sy * cp,
    camera.target[1] + orbit.radius * sp,
    camera.target[2] + orbit.radius * cy * cp,
  ];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function screenRay(px, py, width, height) {
  if (!width || !height) return null;
  const nx = (px / width) * 2 - 1;
  const ny = -(py / height) * 2 + 1;
  const aspect = width / height;
  const t = Math.tan(camera.fov * 0.5);

  let dx = nx * t * aspect;
  let dy = ny * t;
  let dz = -1;
  let l = Math.hypot(dx, dy, dz) || 1;
  dx /= l; dy /= l; dz /= l;

  const f = normalize([
    camera.target[0] - camera.eye[0],
    camera.target[1] - camera.eye[1],
    camera.target[2] - camera.eye[2],
  ]);
  const r = normalize(cross(f, camera.up));
  const u = cross(r, f);

  const wx = r[0] * dx + u[0] * dy + f[0] * (-dz);
  const wy = r[1] * dx + u[1] * dy + f[1] * (-dz);
  const wz = r[2] * dx + u[2] * dy + f[2] * (-dz);
  l = Math.hypot(wx, wy, wz) || 1;

  return { o: camera.eye, d: [wx / l, wy / l, wz / l] };
}

function onPointerMove(e) {
  if (isUiEventTarget(e.target)) return;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.shift = e.shiftKey;
  if (pointer.down && pointer.shift && pointer.mode !== "grab") {
    pointer.mode = "wind";
  }
  if (pointer.down && pointer.mode === "wind" && cloth) {
    const dx = e.clientX - pointer.lx;
    const dy = e.clientY - pointer.ly;
    currentBaseWind = [dx * 0.1, 0, dy * 0.1];
    cloth.setWind(currentBaseWind);
  }
  if (pointer.down && pointer.mode === "orbit") {
    const dx = e.clientX - pointer.lx;
    const dy = e.clientY - pointer.ly;
    const speed = 0.005;
    orbit.yaw -= dx * speed;
    orbit.pitch = Math.max(-1.35, Math.min(1.35, orbit.pitch - dy * speed));
    applyOrbitCamera();
  }
  pointer.lx = e.clientX;
  pointer.ly = e.clientY;
}

function onPointerDown(e) {
  if (isUiEventTarget(e.target)) return;
  pointer.down = true;
  pointer.shift = e.shiftKey;
  pointer.lx = e.clientX;
  pointer.ly = e.clientY;
  pointer.mode = "none";

  if (pointer.shift) {
    pointer.mode = "wind";
    return;
  }

  if (cloth) {
    const size = renderer && renderer.getSize ? renderer.getSize() : null;
    const ray = size ? screenRay(pointer.x, pointer.y, size.width, size.height) : null;
    if (ray && cloth.hitTestRay(ray.o, ray.d)) {
      pointer.mode = "grab";
      cloth.setPointerRay(ray.o, ray.d, true);
      return;
    }
  }

  pointer.mode = "orbit";
}

function onPointerUp() {
  pointer.down = false;
  pointer.mode = "none";
  if (cloth) cloth.setPointerRay([0, 0, 0], [0, 0, -1], false);
}

function onWheel(e) {
  if (isUiEventTarget(e.target)) return;
  e.preventDefault();
  const zoomSpeed = 0.0015;
  const scale = Math.exp(e.deltaY * zoomSpeed);
  orbit.radius = Math.min(200, Math.max(0.5, orbit.radius * scale));
  applyOrbitCamera();
}

let pinchLastDist = null;

function onTouchMove(e) {
  if (isUiEventTarget(e.target)) return;
  if (e.touches.length !== 2) return;
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  const dist = Math.hypot(dx, dy);
  if (pinchLastDist != null) {
    const delta = pinchLastDist - dist;
    const zoomSpeed = 0.003;
    const scale = Math.exp(delta * zoomSpeed);
    orbit.radius = Math.min(200, Math.max(0.5, orbit.radius * scale));
    applyOrbitCamera();
  }
  pinchLastDist = dist;
  e.preventDefault();
}

function onTouchEnd(e) {
  if (e.touches.length < 2) pinchLastDist = null;
}

function onKeyDown(e) {
  if (!cloth) return;
  if (e.key.toLowerCase() === "w") {
    cloth.setWindEnabled(!cloth.windEnabled);
    windToggleBtn.textContent = cloth.windEnabled ? "WIND ON" : "WIND OFF";
    updateWindText();
  }
}

function onResize() {
  if (renderer && renderer.resize) renderer.resize();
}

function frame(t) {
  const dt = (t - lastTime) / 1000;
  lastTime = t;

  if (cloth && renderer) {
    const size = renderer.getSize ? renderer.getSize() : null;
    if (size) {
      const ray = screenRay(pointer.x, pointer.y, size.width, size.height);
      if (ray) cloth.setPointerRay(ray.o, ray.d, pointer.down && pointer.mode === "grab");
    }

    // Apply wind variation
    if (currentParams && currentParams.windVariation > 0) {
      // Randomly update target with small probability per frame
      if (Math.random() < 0.02) {
        const variation = currentParams.windVariation;
        targetWindFactor = (1 - variation) + variation * Math.random();
      }
      // Smoothly interpolate to target
      currentWindFactor += (targetWindFactor - currentWindFactor) * 0.02;
      cloth.wind[0] = currentBaseWind[0] * currentWindFactor;
      cloth.wind[1] = currentBaseWind[1] * currentWindFactor;
      cloth.wind[2] = currentBaseWind[2] * currentWindFactor;
    } else {
      // No variation, set to base
      cloth.wind[0] = currentBaseWind[0];
      cloth.wind[1] = currentBaseWind[1];
      cloth.wind[2] = currentBaseWind[2];
    }

    cloth.step(dt);
    renderer.render();
  }

  requestAnimationFrame(frame);
}

rendererSelect.addEventListener("change", () => buildRenderer(false));
if (controlsForm) {
  controlsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyChanges();
  });
}
applyBtn.addEventListener("click", applyChanges);
resetSimBtn.addEventListener("click", resetSimulation);
resetDefaultsBtn.addEventListener("click", resetDefaults);

// Auto-apply for form controls
pinEdgeSelect.addEventListener("change", applyChanges);
useShearInput.addEventListener("change", applyChanges);
const autoApplyInputs = [nxInput, nyInput, clothSizeInput, constraintInput, gravityInput, windInput, windVariationInput, maxSubstepInput, maxAccumulatedInput];
autoApplyInputs.forEach(input => input.addEventListener("blur", applyChanges));

// Hide apply button since changes auto-apply
applyBtn.style.display = "none";
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("wheel", onWheel, { passive: false });
window.addEventListener("touchmove", onTouchMove, { passive: false });
window.addEventListener("touchend", onTouchEnd);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("resize", onResize);

function stopUiPointer(event) {
  event.stopPropagation();
}

function stopUiWheel(event) {
  event.preventDefault();
  event.stopPropagation();
}

[toolbar, controlsForm, toolbarToggle, hud, hudToggle].forEach((el) => {
  if (!el) return;
  el.addEventListener("pointerdown", stopUiPointer);
  el.addEventListener("wheel", stopUiWheel, { passive: false });
});

if (toolbarToggle) {
  toolbarToggle.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("toolbar-collapsed");
    toolbarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toolbarToggle.textContent = collapsed ? "Menu" : "Hide";
  });
}

if (hudToggle) {
  hudToggle.addEventListener("click", () => {
    const hidden = document.body.classList.toggle("hud-hidden");
    hudToggle.setAttribute("aria-expanded", hidden ? "false" : "true");
    if (hidden) {
      hud.style.display = 'none';
      document.body.appendChild(hudToggle);
      hudToggle.style.position = 'fixed';
      hudToggle.style.bottom = '12px';
      hudToggle.style.left = '12px';
      hudToggle.style.right = 'auto';
      hudToggle.style.top = 'auto';
      hudToggle.textContent = 'Info';
    } else {
      hud.style.display = '';
      hud.appendChild(hudToggle);
      hudToggle.style.position = 'absolute';
      hudToggle.style.top = '6px';
      hudToggle.style.right = '6px';
      hudToggle.style.bottom = 'auto';
      hudToggle.style.left = 'auto';
      hudToggle.textContent = 'Hide';
    }
  });
}

function updateWindText() {
  if (windToggleText) {
    windToggleText.textContent = "W: toggle";
  }
}

if (windToggleBtn) {
  windToggleBtn.addEventListener("click", () => {
    if (!cloth) return;
    cloth.setWindEnabled(!cloth.windEnabled);
    windToggleBtn.textContent = cloth.windEnabled ? "WIND ON" : "WIND OFF";
    updateWindText();
  });
}

if (windToggleText) {
  windToggleText.addEventListener("click", () => {
    if (!cloth) return;
    cloth.setWindEnabled(!cloth.windEnabled);
    windToggleBtn.textContent = cloth.windEnabled ? "WIND ON" : "WIND OFF";
    updateWindText();
  });
}

buildRenderer(true).then(() => requestAnimationFrame(frame));
