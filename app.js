import { Cloth } from "./cloth.js";
import { createRenderer as createCanvas2D } from "./renderer_canvas2d.js";
import { createRenderer as createWebGL } from "./renderer_webgl.js";
import { createRenderer as createThree } from "./renderer_threejs.js";
import { createToastManager } from "./toast_notification.js";

const pendingGlobalErrors = [];
let showGlobalError = (message) => {
  pendingGlobalErrors.push(message);
  // eslint-disable-next-line no-console
  console.error(message);
};

function formatErrorMessage(prefix, value) {
  if (!value) return prefix;
  if (typeof value === "string") return `${prefix}: ${value}`;
  if (value && value.message) return `${prefix}: ${value.message}`;
  try {
    return `${prefix}: ${JSON.stringify(value)}`;
  } catch {
    return `${prefix}: ${String(value)}`;
  }
}


const container = document.getElementById("viewport");
const rendererSelect = document.getElementById("rendererSelect");
const toolbarToggle = document.getElementById("toolbarToggle");
const toolbar = document.getElementById("toolbar");
const windToggleBtn = document.getElementById("windToggleBtn");
const windToggleText = document.getElementById("windToggleText");
const hud = document.getElementById("hud");
const hudToggle = document.getElementById("hudToggle");
const hudToggleIcon = document.getElementById("hudToggleIcon");
const hudToggleLabel = document.getElementById("hudToggleLabel");
const hudToggleStatus = document.getElementById("hudToggleStatus");
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
const toastManager = createToastManager();
const TOAST_COLORS = {
  info: "#7dd3fc",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
};
const notify = (message, options = {}) => {
  const type = options.type == null ? "info" : options.type;
  const fallbackColor = TOAST_COLORS[type] || TOAST_COLORS.info;
  const color = options.color == null ? fallbackColor : options.color;
  toastManager.notify(message, { ...options, type, color });
};
showGlobalError = (message) => {
  notify(message, { type: "danger" });
};
while (pendingGlobalErrors.length) {
  const buffered = pendingGlobalErrors.shift();
  showGlobalError(buffered);
}

const rendererFactories = {
  three: createThree,
  canvas2d: createCanvas2D,
  webgl: createWebGL,
};

function invertRgb(rgb) {
  if (!rgb) return null;
  return [
    255 - rgb[0],
    255 - rgb[1],
    255 - rgb[2],
  ];
}

function rgbToCss(rgb) {
  if (!rgb) return null;
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function getActiveBackgroundColor() {
  if (renderer) return renderer.getBackgroundColor();
  return rendererFactories[activeRendererType].getBackgroundColor();
}

// set the minimized ControlWidget "status text" color based on background inversion.
function updateControlsWidgetColors(bg) {
  const hudMinimized = document.body.classList.contains("hud-hidden");

  // Controls Widget is maximized: restore the status text color.
  if (!hudMinimized) {
    if (hudToggleIcon) hudToggleIcon.style.color = "#fff";
    if (hudToggleStatus) hudToggleStatus.style.color = "#fbd3a4";
    return;
  }

  // Controls Widget is minimized: invert the status text color relative to the renderer's background for visibility.
  const inverted = invertRgb( bg );
  const cssColor = rgbToCss(inverted);
  if (hudToggleIcon && cssColor) hudToggleIcon.style.color = cssColor;
  if (hudToggleStatus && cssColor) hudToggleStatus.style.color = cssColor;
}

// set the github link color based on background inversion.
function updateGithubLinkColor(bg) {
  const codeLink = document.getElementById("codeLink");
  if (!codeLink) return;
  const inverted = invertRgb(bg);
  const cssColor = rgbToCss(inverted);
  if (cssColor) codeLink.style.color = cssColor;
}

let cloth = null;
let renderer = null;
let activeRendererType = "three";
let lastTime = performance.now();
let buildToken = 0;
let currentParams = null;
let fpsSmooth = 0;
let desiredWindEnabled = true;

const CONTROL_BINDINGS = [
  { key: "renderer", element: rendererSelect },
  { key: "nx", element: nxInput },
  { key: "ny", element: nyInput },
  { key: "clothSize", element: clothSizeInput },
  { key: "constraintIters", element: constraintInput },
  { key: "gravityMag", element: gravityInput },
  { key: "windVec", element: windInput },
  { key: "windVariation", element: windVariationInput },
  { key: "pinEdge", element: pinEdgeSelect },
  { key: "maxSubstep", element: maxSubstepInput },
  { key: "maxAccumulated", element: maxAccumulatedInput },
  { key: "useShear", element: useShearInput, type: "checkbox" },
  { key: "windEnabled", type: "flag" },
];

const trackedControls = [
  nxInput, nyInput, clothSizeInput, constraintInput,
  gravityInput, windInput, windVariationInput,
  maxSubstepInput, maxAccumulatedInput,
  pinEdgeSelect, useShearInput,
];

const controlSnapshots = new Map();
const STORAGE_KEY = "cloth-demo-controls";

function parseFlag(value, fallback = false) {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

function readControlValue(el) {
  if (!el) return null;
  if (el.type === "checkbox") return el.checked ? "1" : "0";
  return el.value;
}

function setControlValue(el, value) {
  if (!el || value == null) return;
  if (el.type === "checkbox") {
    const truthy = value === true || value === "true" || value === "1";
    el.checked = truthy;
  } else {
    el.value = value;
  }
}

function snapshotControl(el) {
  if (!el) return;
  controlSnapshots.set(el, readControlValue(el));
}

function snapshotAllControls() {
  trackedControls.forEach(snapshotControl);
}

function bindAutoApply(el, eventName) {
  if (!el) return;
  el.addEventListener(eventName, () => {
    const current = readControlValue(el);
    const prev = controlSnapshots.get(el);
    if (prev === current) return;
    applyChanges();
  });
}

function serializeControls() {
  const out = {};
  CONTROL_BINDINGS.forEach(({ key, element, type }) => {
    let value = null;
    if (type === "flag" && key === "windEnabled") {
      const enabled = cloth ? cloth.windEnabled : desiredWindEnabled;
      value = enabled ? "1" : "0";
    } else if (element) {
      value = readControlValue(element);
    }
    if (value != null) out[key] = value;
  });
  out.toolbarCollapsed = document.body.classList.contains("toolbar-collapsed") ? "1" : "0";
  out.hudHidden = document.body.classList.contains("hud-hidden") ? "1" : "0";
  return out;
}

function updateUrlParams(record) {
  const url = new URL(window.location.href);
  Object.entries(record).forEach(([key, value]) => {
    if (value == null || value === "") {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });
  window.history.replaceState(null, "", url);
}

function saveToStorage(record) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // ignore storage failures
  }
}

function loadFromStorage() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function persistControlState() {
  const record = serializeControls();
  updateUrlParams(record);
  saveToStorage(record);
}

// ALWAYS prefers URL params over stored values
function loadPersistedControls() {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const stored = loadFromStorage();
  let usedStored = false;

  // restore individual settings controls.
  CONTROL_BINDINGS.forEach(({ key, element, type }) => {
    // restore the wind enabled flag.
    if (type === "flag" && key === "windEnabled") {
      let value = params.get(key);
      if (value == null && stored && Object.prototype.hasOwnProperty.call(stored, key)) {
        value = stored[key];
        usedStored = true;
      }
      if (value != null) {
        setWindEnabledState(parseFlag(value, true));
      }
      return;
    }

    // generic restore for all settings
    if (!element) return;
    let value = params.get(key);
    if (value == null && stored && Object.prototype.hasOwnProperty.call(stored, key)) {
      value = stored[key];
      usedStored = true;
    }
    if (value != null) setControlValue(element, value);
  });

  // restore the "Controls" widget toolbar.
  const toolbarParam = params.get("toolbarCollapsed");
  if (toolbarParam != null) {
    setToolbarCollapsed(parseFlag(toolbarParam));
  } else if (stored && Object.prototype.hasOwnProperty.call(stored, "toolbarCollapsed")) {
    setToolbarCollapsed(parseFlag(stored.toolbarCollapsed));
    usedStored = true;
  } else {
    setToolbarCollapsed(document.body.classList.contains("toolbar-collapsed"));
  }

  // restore the HUD for "Cloth Simulation Lab" settings.
  const hudParam = params.get("hudHidden");
  if (hudParam != null) {
    setHudHidden(parseFlag(hudParam));
  } else if (stored && Object.prototype.hasOwnProperty.call(stored, "hudHidden")) {
    setHudHidden(parseFlag(stored.hudHidden));
    usedStored = true;
  } else {
    setHudHidden(document.body.classList.contains("hud-hidden"));
  }

  if (usedStored) {
    const record = serializeControls();
    updateUrlParams(record);
  }
  persistControlState();
}

populateRendererSelect();
loadPersistedControls();
if (rendererSelect && rendererSelect.value) {
  activeRendererType = rendererSelect.value;
}
setWindEnabledState(desiredWindEnabled);
snapshotAllControls();

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

function populateRendererSelect() {
  if (!rendererSelect) return;
  const desiredValue = rendererSelect.value || activeRendererType;
  rendererSelect.innerHTML = "";
  let firstValue = null;
  Object.entries(rendererFactories).forEach(([type, factory]) => {
    if (!firstValue) firstValue = type;
    const option = document.createElement("option");
    option.value = type;
    option.textContent = factory.getName();
    rendererSelect.appendChild(option);
  });
  const resolved = Object.prototype.hasOwnProperty.call(rendererFactories, desiredValue)
    ? desiredValue
    : firstValue;
  if (resolved) {
    rendererSelect.value = resolved;
  }
}

function getRendererLabelFromType(type) {
  if (!type) return "";
  const factory = rendererFactories[type];
  if (factory && typeof factory.getName === "function") {
    return factory.getName();
  }
  if (rendererSelect) {
    const option = rendererSelect.querySelector(`option[value=\"${type}\"]`);
    if (option) return option.textContent.trim();
  }
  return type;
}

function getCurrentRendererLabel() {
  if (renderer && typeof renderer.getName === "function") {
    return renderer.getName();
  }
  return getRendererLabelFromType(activeRendererType);
}

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
  return !!target.closest("#toolbar, #hud, #toolbarToggle, #hudToggle, #codeLink, #toast-notification-container");
}

function preventTouchPointerDefault(event) {
  if (event.pointerType === "touch" && !isUiEventTarget(event.target)) {
    event.preventDefault();
  }
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
  const size = Math.max(1, readNumber(clothSizeInput, 5));
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
  const rendererLabel = getCurrentRendererLabel();
  const sizeText = `${params.size}:${params.nx}x${params.ny}`;
  const fpsDisplay = Math.max(0, Math.min(999, Math.round(fpsSmooth)));
  const text = `${rendererLabel} | ${sizeText} | ${fpsDisplay}FPS`;
  status.textContent = text;
  if (hudToggleStatus) hudToggleStatus.textContent = text;
  updateControlsWidgetColors(getActiveBackgroundColor());
}

function setToolbarCollapsed(collapsed) {
  if (!toolbarToggle) return;
  document.body.classList.toggle("toolbar-collapsed", collapsed);
  toolbarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  toolbarToggle.textContent = collapsed ? "Menu" : "Hide";
}

function setHudHidden(hidden) {
  if (!hud || !hudToggle) return;
  document.body.classList.toggle("hud-hidden", hidden);
  if (hudToggleIcon) hudToggleIcon.textContent = hidden ? '+' : '−';
  if (hudToggleLabel) hudToggleLabel.textContent = hidden ? 'Info' : 'Hide';
  hudToggle.setAttribute("aria-expanded", hidden ? "false" : "true");
  updateControlsWidgetColors(getActiveBackgroundColor());
}

function updateWindToggle() {
  if (!windToggleBtn) return;
  const enabled = cloth ? cloth.windEnabled : desiredWindEnabled;
  windToggleBtn.textContent = enabled ? "WIND ON" : "WIND OFF";
}

function setWindEnabledState(next) {
  desiredWindEnabled = !!next;
  if (cloth) cloth.setWindEnabled(desiredWindEnabled);
  updateWindToggle();
  updateWindText();
}

function disposeRenderer() {
  if (renderer && renderer.dispose) renderer.dispose();
  renderer = null;
  container.innerHTML = "";
}

function resetSimulation() {
  buildRenderer(true);
  notify("Cloth reset.", { type: "success" });
}

function resetDefaults() {
  if (controlsForm) controlsForm.reset();
  snapshotAllControls();
  persistControlState();
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
}

function applyChanges() {
  const params = readParams();
  if (needsRebuild(params, currentParams)) {
    buildRenderer(true);
  } else {
    applyParamsWithoutRebuild(params);
  }
  snapshotAllControls();
  persistControlState();
  notify("Settings applied.", { type: "success" });
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
    setWindEnabledState(desiredWindEnabled);
  }

  disposeRenderer();
  if (rendererSelect) {
    activeRendererType = rendererSelect.value;
  }
  const factory = rendererFactories[activeRendererType];
  if (!factory) return;

  let nextRenderer = null;
  try {
    nextRenderer = await factory({ container, cloth, camera, notify });
  } catch (err) {
    const failedLabel = getRendererLabelFromType(activeRendererType);
    const errorMessage = err && err.message ? err.message : err;
    notify(`Renderer failed (${failedLabel}): ${errorMessage}`, { type: "danger" });
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
  updateControlsWidgetColors( getActiveBackgroundColor() );
  updateGithubLinkColor( getActiveBackgroundColor() );
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
  preventTouchPointerDefault(e);
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
  preventTouchPointerDefault(e);
  if (isUiEventTarget(e.target)) return;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
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

function onPointerUp(e) {
  preventTouchPointerDefault(e);
  pointer.down = false;
  pointer.mode = "none";
  if (cloth) cloth.setPointerRay([0, 0, 0], [0, 0, -1], false);
}

const ZOOM_WHEEL_SPEED = 0.0015;
const ZOOM_PINCH_SPEED = 0.009; // pinch feels slower, so boost response

function applyZoomDelta(delta) {
  if (!Number.isFinite(delta) || delta === 0) return;
  const scale = Math.exp(delta);
  orbit.radius = Math.min(200, Math.max(0.5, orbit.radius * scale));
  applyOrbitCamera();
}

function onWheel(e) {
  if (isUiEventTarget(e.target)) return;
  e.preventDefault();
  applyZoomDelta(e.deltaY * ZOOM_WHEEL_SPEED);
}

let pinchLastDist = null;

function onTouchStart(e) {
  if (isUiEventTarget(e.target)) return;
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchLastDist = Math.hypot(dx, dy);
  } else {
    pinchLastDist = null;
  }
  if (e.touches.length >= 1) {
    e.preventDefault();
  }
}

function onTouchMove(e) {
  if (isUiEventTarget(e.target)) return;
  if (e.touches.length === 1) {
    e.preventDefault();
    return;
  }
  if (e.touches.length !== 2) return;
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  const dist = Math.hypot(dx, dy);
  if (pinchLastDist != null) {
    const delta = pinchLastDist - dist;
    applyZoomDelta(delta * ZOOM_PINCH_SPEED);
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
    const next = !(cloth ? cloth.windEnabled : desiredWindEnabled);
    setWindEnabledState(next);
    persistControlState();
  }
}

function onResize() {
  if (renderer && renderer.resize) renderer.resize();
}

function frame(t) {
  const dt = (t - lastTime) / 1000;
  lastTime = t;
  if (dt > 0) {
    const fpsInstant = Math.floor( (1 / dt) );
    fpsSmooth = fpsSmooth ? fpsSmooth + (fpsInstant - fpsSmooth) * 0.02 : fpsInstant;
    updateStatus(currentParams);
  }

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

if (rendererSelect) {
  rendererSelect.addEventListener("change", () => {
    persistControlState();
    buildRenderer(false)
      .then(() => notify(`Renderer: ${getCurrentRendererLabel()}`, { type: "info" }))
      .catch(() => {});
  });
}
if (controlsForm) {
  controlsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyChanges();
  });
  controlsForm.addEventListener("reset", () => {
    window.requestAnimationFrame(() => {
      snapshotAllControls();
      persistControlState();
    });
  });
}
resetSimBtn.addEventListener("click", resetSimulation);
resetDefaultsBtn.addEventListener("click", resetDefaults);

// Auto-apply for form controls
bindAutoApply(pinEdgeSelect, "change");
bindAutoApply(useShearInput, "change");
const autoApplyInputs = [nxInput, nyInput, clothSizeInput, constraintInput, gravityInput, windInput, windVariationInput, maxSubstepInput, maxAccumulatedInput];
autoApplyInputs.forEach(input => bindAutoApply(input, "blur"));

// Hide apply button since changes auto-apply
applyBtn.style.display = "none";
window.addEventListener("pointermove", onPointerMove, { passive: false });
window.addEventListener("pointerdown", onPointerDown, { passive: false });
window.addEventListener("pointerup", onPointerUp, { passive: false });
window.addEventListener("wheel", onWheel, { passive: false });
window.addEventListener("touchstart", onTouchStart, { passive: false });
window.addEventListener("touchmove", onTouchMove, { passive: false });
window.addEventListener("touchend", onTouchEnd);
window.addEventListener("touchcancel", onTouchEnd);
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
    const nextCollapsed = !document.body.classList.contains("toolbar-collapsed");
    setToolbarCollapsed(nextCollapsed);
    persistControlState();
  });
}

if (hudToggle) {
  hudToggle.addEventListener("click", () => {
    const nextHidden = !document.body.classList.contains("hud-hidden");
    setHudHidden(nextHidden);
    persistControlState();
  });
}

function updateWindText() {
  if (windToggleText) {
    windToggleText.textContent = "W: toggle";
  }
}

if (windToggleBtn) {
  windToggleBtn.addEventListener("click", () => {
    setWindEnabledState(!desiredWindEnabled);
    persistControlState();
  });
}

if (windToggleText) {
  windToggleText.addEventListener("click", () => {
    setWindEnabledState(!desiredWindEnabled);
    persistControlState();
  });
}

buildRenderer(true)
  .then(() => {
    notify(`Renderer: ${getCurrentRendererLabel()}`, { type: "info" });
    requestAnimationFrame(frame);
  })
  .catch(() => requestAnimationFrame(frame));
