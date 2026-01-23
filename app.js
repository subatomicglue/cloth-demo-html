import { setGlobalErrorHandler } from "./error_handler.js"; // first thing to import
import { Cloth } from "./cloth.js";
import { createRenderer as createCanvas2D } from "./renderer_canvas2d.js";
import { createRenderer as createWebGL } from "./renderer_webgl.js";
import { createRenderer as createThree } from "./renderer_threejs.js";
import { LookAtCamera } from "./camera.js";
import { createToastManager } from "./toast_notification.js";

// constants
// search for PRESET_DEFINITIONS to edit presets
// search for PIN_EDGE_MODES to edit pinning modes
const INITIAL_POSITION_JITTER = 0.08; // fraction of spacing used to randomize initial cloth pose
const TOAST_COLORS = {
  info: "#7dd3fc",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
};

// grab DOM elements
const container = document.getElementById("viewport");
const presetSelect = document.getElementById("presetSelect");
const rendererSelect = document.getElementById("rendererSelect");
const settingsToggle = document.getElementById("settingsToggle");
const settingsWidget = document.getElementById("settingsWidget");
const windToggleBtn = document.getElementById("windToggleBtn");
const windToggleText = document.getElementById("windToggleText");
const infoWidget = document.getElementById("infoWidget");
const infoToggle = document.getElementById("infoToggle");
const infoToggleIcon = document.getElementById("infoToggleIcon");
const infoToggleLabel = document.getElementById("infoToggleLabel");
const infoToggleStatus = document.getElementById("infoToggleStatus");
const settingsForm = document.getElementById("settingsForm");
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
const status = document.getElementById("status");

// create the toast notification system.
const toastManager = createToastManager();
const notify = (message, options = {}) => {
  const type = options.type == null ? "info" : options.type;
  const fallbackColor = TOAST_COLORS[type] || TOAST_COLORS.info;
  const color = options.color == null ? fallbackColor : options.color;
  toastManager.notify(message, { ...options, type, color });
};
setGlobalErrorHandler((message) => notify(message, { type: "danger" }) ); // teach global error handler to notify


const rendererFactories = {
  three: createThree,
  canvas2d: createCanvas2D,
  webgl: createWebGL,
};
const DEFAULT_PIN_MODE_ID = "top";
const PIN_EDGE_MODES = [
  {
    id: "top",
    label: "Top",
    vertical: false,
    setup: (cloth) => cloth.pinRow(0),
  },
  {
    id: "bottom",
    label: "Bottom",
    vertical: false,
    setup: (cloth) => {
      const lastRow = Math.max(0, cloth.getRowCount() - 1);
      cloth.pinRow(lastRow);
    },
  },
  {
    id: "left",
    label: "Left",
    vertical: false,
    setup: (cloth) => cloth.pinColumn(0),
  },
  {
    id: "right",
    label: "Right",
    vertical: false,
    setup: (cloth) => {
      const lastColumn = Math.max(0, cloth.getColumnCount() - 1);
      cloth.pinColumn(lastColumn);
    },
  },
  {
    id: "left-right",
    label: "Left + Right",
    vertical: false,
    setup: (cloth) => {
      const lastColumn = Math.max(0, cloth.getColumnCount() - 1);
      const offset = cloth.getExtentX() * 0.05;
      cloth.pinColumn(0, { offset: [offset, 0, 0] });
      cloth.pinColumn(lastColumn, { offset: [-offset, 0, 0] });
    },
  },
  {
    id: "left-right-loose",
    label: "Left + Right (Loose)",
    vertical: false,
    setup: (cloth) => {
      const lastColumn = Math.max(0, cloth.getColumnCount() - 1);
      const offset = cloth.getExtentX() * 0.15;
      cloth.pinColumn(0, { offset: [offset, 0, 0] });
      cloth.pinColumn(lastColumn, { offset: [-offset, 0, 0] });
    },
  },
  {
    id: "flagpole-left",
    label: "Flagpole Left",
    vertical: true,
    setup: (cloth) => cloth.pinColumn(0),
  },
  {
    id: "flagpole-right",
    label: "Flagpole Right",
    vertical: true,
    setup: (cloth) => {
      const lastColumn = Math.max(0, cloth.getColumnCount() - 1);
      cloth.pinColumn(lastColumn);
    },
  },
  {
    id: "flagpole-left-right",
    label: "Flagpoles (Tight)",
    vertical: true,
    setup: (cloth) => {
      const lastColumn = Math.max(0, cloth.getColumnCount() - 1);
      const offset = cloth.getExtentX() * 0.02;
      cloth.pinColumn(0, { offset: [offset, 0, 0] });
      cloth.pinColumn(lastColumn, { offset: [-offset, 0, 0] });
    },
  },
  {
    id: "flagpole-left-right-loose",
    label: "Flagpoles (Loose)",
    vertical: true,
    setup: (cloth) => {
      const lastColumn = Math.max(0, cloth.getColumnCount() - 1);
      const offset = cloth.getExtentX() * 0.15;
      cloth.pinColumn(0, { offset: [offset, 0, 0] });
      cloth.pinColumn(lastColumn, { offset: [-offset, 0, 0] });
    },
  },
];
const PIN_EDGE_LOOKUP = new Map(PIN_EDGE_MODES.map((mode) => [mode.id, mode]));

function getPinModeConfig(id) {
  return PIN_EDGE_LOOKUP.get(id) || PIN_EDGE_LOOKUP.get(DEFAULT_PIN_MODE_ID);
}

function applyPinConfiguration(clothInstance, pinMode) {
  if (!clothInstance) return;
  if (pinMode && typeof pinMode.setup === "function") {
    pinMode.setup(clothInstance);
  } else {
    clothInstance.pinRow(0);
  }
}

// populate the Preset dropdown in the GUI
function populatePresetSelect() {
  if (!presetSelect) return;
  presetSelect.innerHTML = "";
  const customOption = document.createElement("option");
  customOption.value = "";
  customOption.textContent = "Custom";
  presetSelect.appendChild(customOption);
  PRESETS.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    option.dataset.query = preset.query || "";
    presetSelect.appendChild(option);
  });
  presetSelect.value = "";
}

function resetControlsFromDefaults(presetValue = "") {
  resetDefaults({ rebuild: false, persist: false, presetValue });
  snapshotAllControls();
}

// when a Preset dropdown changes, it's data comes through here.
// Applies the preset's query parameters to the controls and rebuilds the simulation.
function applyPresetQuery(query, { preserveRenderer = true, presetId = null, preservePanels = true } = {}) {
  resetControlsFromDefaults(presetId || "");
  if (presetSelect && presetId != null) {
    presetSelect.value = presetId;
  }

  const base = `${window.location.origin}${window.location.pathname}`;
  const target = new URL(query || "", base);
  if (preserveRenderer && rendererSelect) {
    const currentRenderer = rendererSelect.value || activeRendererType;
    if (currentRenderer) target.searchParams.set("renderer", currentRenderer);
  }

  const params = target.searchParams;
  CONTROL_BINDINGS.forEach(({ key, element, type }) => {
    if (type === "flag" && key === "windEnabled") {
      const value = params.get(key);
      if (value != null) {
        setWindEnabledState(parseFlag(value, true));
      }
      return;
    }
    if (!element) return;
    const value = params.get(key);
    if (value != null) {
      setControlValue(element, value);
    }
  });

  if (preservePanels) {
    const collapsedValue = params.get("settingsCollapsed");
    if (collapsedValue != null) setSettingsCollapsed(parseFlag(collapsedValue));
    const infoValue = params.get("infoCollapsed");
    if (infoValue != null) setInfoCollapsed(parseFlag(infoValue));
  }

  snapshotAllControls();
  persistControlState();
  buildRenderer(true).catch(() => {});
}

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
function updateInfoWidgetColors(bg) {
  const infoMinimized = document.body.classList.contains("info-collapsed");

  // Info widget is maximized: restore the status text color.
  if (!infoMinimized) {
    if (infoToggleIcon) infoToggleIcon.style.color = "#fff";
    if (infoToggleStatus) infoToggleStatus.style.color = "#fbd3a4";
    return;
  }

  // Info widget is minimized: invert the status text color relative to the renderer's background for visibility.
  const inverted = invertRgb(bg);
  const cssColor = rgbToCss(inverted);
  if (infoToggleIcon && cssColor) infoToggleIcon.style.color = cssColor;
  if (infoToggleStatus && cssColor) infoToggleStatus.style.color = cssColor;
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

const PRESET_DEFINITIONS = {
  "Tapestry": "?renderer=three&nx=16&ny=16&clothSize=5&constraintIters=6&gravityMag=9.8&windVec=%5B-20%2C0%2C0%5D&windVariation=1&pinEdge=top&maxSubstep=0.008&maxAccumulated=0.25&useShear=1&windEnabled=1&settingsCollapsed=0&infoCollapsed=0",
  "Waving Flag": "?renderer=three&nx=40&ny=20&clothSize=5&constraintIters=4&gravityMag=9.8&windVec=%5B20%2C0%2C1%5D&windVariation=0.8&pinEdge=flagpole-left&maxSubstep=0.008&maxAccumulated=0.25&useShear=1&windEnabled=1&settingsCollapsed=0&infoCollapsed=0",
  "Banner (Bar)": "?renderer=three&nx=40&ny=15&clothSize=5&constraintIters=6&gravityMag=9.8&windVec=%5B20%2C0%2C1%5D&windVariation=0.8&pinEdge=top&maxSubstep=0.008&maxAccumulated=0.25&useShear=1&windEnabled=1&settingsCollapsed=0&infoCollapsed=0",
  "Banner (Poles)": "?nx=30&ny=15&clothSize=5&constraintIters=6&gravityMag=9.8&windVec=%5B0%2C0%2C-5%5D&windVariation=1&pinEdge=flagpole-left-right&maxSubstep=0.008&maxAccumulated=0.25&useShear=1&windEnabled=1&toolbarCollapsed=0&hudHidden=0&renderer=three&settingsCollapsed=0&infoCollapsed=0",
  "Hammock": "?nx=40&ny=20&clothSize=5&constraintIters=6&gravityMag=9.8&windVec=%5B5%2C0%2C10%5D&windVariation=0.8&pinEdge=left-right&maxSubstep=0.008&maxAccumulated=0.25&useShear=1&windEnabled=1&toolbarCollapsed=0&hudHidden=0&renderer=three&settingsCollapsed=0&infoCollapsed=0",
  "Sail": "?nx=40&ny=20&clothSize=5&constraintIters=6&gravityMag=9.8&windVec=%5B0%2C10%2C20%5D&windVariation=0.8&pinEdge=flagpole-left-right-loose&maxSubstep=0.008&maxAccumulated=0.25&useShear=1&windEnabled=1&toolbarCollapsed=0&hudHidden=0&renderer=three&settingsCollapsed=0&infoCollapsed=0",
};

function slugifyPresetLabel(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

const PRESETS = Object.entries(PRESET_DEFINITIONS).map(([label, query]) => ({
  id: slugifyPresetLabel(label) || "preset",
  label,
  query: query || "",
}));

const PRESET_LOOKUP = new Map(PRESETS.map((preset) => [preset.id, preset]));

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

function validateWindVariationInput(showMessage = false) {
  if (!windVariationInput) return;
  const text = windVariationInput.value;
  if (text == null || text === "") {
    windVariationInput.setCustomValidity("");
    if (showMessage) windVariationInput.reportValidity();
    return;
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    windVariationInput.setCustomValidity("Enter a number between 0 and 1.");
  } else if (value < 0 || value > 1) {
    windVariationInput.setCustomValidity("Wind variation must stay between 0 and 1.");
  } else {
    windVariationInput.setCustomValidity("");
  }
  if (showMessage) {
    windVariationInput.reportValidity();
  }
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
  out.settingsCollapsed = document.body.classList.contains("settings-collapsed") ? "1" : "0";
  out.infoCollapsed = document.body.classList.contains("info-collapsed") ? "1" : "0";
  return out;
}

function updateUrlParams(record, options = {}) {
  const { replace = true } = options;
  const url = new URL(window.location.href);
  Object.entries(record).forEach(([key, value]) => {
    if (value == null || value === "") {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });
  if (replace) {
    window.history.replaceState(null, "", url);
  } else {
    window.location.href = url.toString();
  }
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
  updateUrlParams(record, { replace: true });
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

  // restore the Settings widget.
  const settingsParam = params.get("settingsCollapsed");
  const legacyToolbarParam = settingsParam == null ? params.get("toolbarCollapsed") : null;
  if (settingsParam != null || legacyToolbarParam != null) {
    const value = settingsParam != null ? settingsParam : legacyToolbarParam;
    setSettingsCollapsed(parseFlag(value));
  } else if (stored && (Object.prototype.hasOwnProperty.call(stored, "settingsCollapsed") || Object.prototype.hasOwnProperty.call(stored, "toolbarCollapsed"))) {
    const storedValue = Object.prototype.hasOwnProperty.call(stored, "settingsCollapsed")
      ? stored.settingsCollapsed
      : stored.toolbarCollapsed;
    setSettingsCollapsed(parseFlag(storedValue));
    usedStored = true;
  } else {
    setSettingsCollapsed(document.body.classList.contains("settings-collapsed"));
  }

  // restore the Info widget.
  const infoParam = params.get("infoCollapsed");
  const legacyHudParam = infoParam == null ? params.get("hudHidden") : null;
  if (infoParam != null || legacyHudParam != null) {
    const value = infoParam != null ? infoParam : legacyHudParam;
    setInfoCollapsed(parseFlag(value));
  } else if (stored && (Object.prototype.hasOwnProperty.call(stored, "infoCollapsed") || Object.prototype.hasOwnProperty.call(stored, "hudHidden"))) {
    const storedValue = Object.prototype.hasOwnProperty.call(stored, "infoCollapsed")
      ? stored.infoCollapsed
      : stored.hudHidden;
    setInfoCollapsed(parseFlag(storedValue));
    usedStored = true;
  } else {
    setInfoCollapsed(document.body.classList.contains("info-collapsed"));
  }

  if (usedStored) {
    const record = serializeControls();
    updateUrlParams(record);
  }
  persistControlState();
}

populateRendererSelect();
populatePinEdgeSelect();
populatePresetSelect();
loadPersistedControls();
if (rendererSelect && rendererSelect.value) {
  activeRendererType = rendererSelect.value;
}
setWindEnabledState(desiredWindEnabled);
snapshotAllControls();

let currentBaseWind = [-20, 0, 0];
let currentWindFactor = 1;
let targetWindFactor = 1;

const camera = new LookAtCamera({
  eye: [0, 1.2, 2.2],
  target: [0, 0, 0],
  up: [0, 1, 0],
  fovDeg: 55,
  near: 0.01,
  far: 200,
});

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

function populatePinEdgeSelect() {
  if (!pinEdgeSelect) return;
  const desiredValue = pinEdgeSelect.value || pinEdgeSelect.getAttribute("data-default") || DEFAULT_PIN_MODE_ID;
  pinEdgeSelect.innerHTML = "";
  PIN_EDGE_MODES.forEach((mode) => {
    const option = document.createElement("option");
    option.value = mode.id;
    option.textContent = mode.label;
    pinEdgeSelect.appendChild(option);
  });
  const hasDesired = PIN_EDGE_LOOKUP.has(desiredValue);
  const finalValue = hasDesired ? desiredValue : DEFAULT_PIN_MODE_ID;
  if (finalValue) {
    pinEdgeSelect.value = finalValue;
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
  right: false,
  lx: 0,
  ly: 0,
  mode: "none",
};

function isPanModifierActive(event) {
  return !!(event && (event.ctrlKey || event.metaKey));
}

function releasePointerInteraction() {
  if (cloth) {
    cloth.setPointerRay([0, 0, 0], [0, 0, -1], false);
  }
  pointer.down = false;
  pointer.right = false;
  pointer.mode = "none";
}

function tryBeginGrab(ray) {
  if (!cloth || !ray) return false;
  if (pointer.right || pointer.mode === "pan") return false;
  if (!cloth.hitTestRay(ray.o, ray.d)) return false;
  pointer.mode = "grab";
  pointer.down = true;
  cloth.setPointerRay(ray.o, ray.d, true);
  return true;
}

function isUiEventTarget(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest("#settingsWidget, #infoWidget, #settingsToggle, #infoToggle, #codeLink, #toast-notification-container");
}

function preventTouchPointerDefault(event) {
  if (event.pointerType === "touch" && !isUiEventTarget(event.target)) {
    event.preventDefault();
  }
}


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
  const windVariation = Math.max(0, Math.min(1, readNumber(windVariationInput, 0.5)));
  const pinEdge = pinEdgeSelect.value;
  const pinMode = getPinModeConfig(pinEdge);
  const isVertical = !!(pinMode && pinMode.vertical);
  const orientation = isVertical ? "vertical" : "horizontal";
  const originY = isVertical ? (ny - 1) * spacing * 0.5 : 0.7;

  return {
    nx,
    ny,
    size,
    spacing,
    pinMode,
    orientation,
    initialJitter: INITIAL_POSITION_JITTER,
    autoPinTopEdge: false,
    origin: [-extentX / 2, originY, -extentZ / 2],
    pinEdge,
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
  if (infoToggleStatus) infoToggleStatus.textContent = text;
  updateInfoWidgetColors(getActiveBackgroundColor());
}

function setSettingsCollapsed(collapsed) {
  if (!settingsToggle) return;
  document.body.classList.toggle("settings-collapsed", collapsed);
  settingsToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  settingsToggle.textContent = collapsed ? "Menu" : "Hide";
}

function setInfoCollapsed(collapsed) {
  if (!infoWidget || !infoToggle) return;
  document.body.classList.toggle("info-collapsed", collapsed);
  if (infoToggleIcon) infoToggleIcon.textContent = collapsed ? '+' : '−';
  if (infoToggleLabel) infoToggleLabel.textContent = collapsed ? 'Info' : 'Hide';
  infoToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  updateInfoWidgetColors(getActiveBackgroundColor());
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

function resetDefaults(options = {}) {
  const {
    rebuild = true,
    persist = true,
    presetValue = "",
    setPreset = true,
  } = options;
  if (settingsForm) settingsForm.reset();
  snapshotAllControls();
  if (persist) {
    persistControlState();
  }
  if (rebuild) {
    buildRenderer(true);
  }
  if (setPreset && presetSelect) {
    presetSelect.value = presetValue || "";
  }
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
  if (presetSelect && presetSelect.value !== "") {
    presetSelect.value = "";
  }
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
    camera.reframeForExtent(maxExtent);

    cloth = new Cloth(params);
    applyPinConfiguration(cloth, params.pinMode);
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
  updateInfoWidgetColors( getActiveBackgroundColor() );
  updateGithubLinkColor( getActiveBackgroundColor() );
}


function onPointerMove(e) {
  preventTouchPointerDefault(e);
  if (e.pointerType === "touch") return;
  if (isUiEventTarget(e.target)) return;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.shift = e.shiftKey;
  if (pointer.down && pointer.mode === "pan") {
    const dx = e.clientX - pointer.lx;
    const dy = e.clientY - pointer.ly;
    camera.panBy(dx, dy);
    pointer.lx = e.clientX;
    pointer.ly = e.clientY;
    return;
  }
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
    camera.orbitBy(dx, dy);
  }
  pointer.lx = e.clientX;
  pointer.ly = e.clientY;
}

function onPointerDown(e) {
  preventTouchPointerDefault(e);
  if (e.pointerType === "touch") return;
  if (isUiEventTarget(e.target)) return;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.down = true;
  pointer.shift = e.shiftKey;
  pointer.right = e.button === 2 || (e.button === 0 && (e.ctrlKey || e.metaKey)) || isPanModifierActive(e);
  pointer.lx = e.clientX;
  pointer.ly = e.clientY;
  pointer.mode = "none";

  if (pointer.right) {
    pointer.mode = "pan";
    return;
  }

  if (pointer.shift) {
    pointer.mode = "wind";
    return;
  }

  if (cloth) {
    const size = renderer && renderer.getSize ? renderer.getSize() : null;
    const ray = size ? camera.screenRay(pointer.x, pointer.y, size.width, size.height) : null;
    if (tryBeginGrab(ray)) return;
  }

  pointer.mode = "orbit";
}

function onPointerUp(e) {
  preventTouchPointerDefault(e);
  if (e.pointerType === "touch") return;
  releasePointerInteraction();
}

const ZOOM_WHEEL_SPEED = 0.0015;
const ZOOM_PINCH_SPEED = 0.009; // pinch feels slower, so boost response

function onWheel(e) {
  if (isUiEventTarget(e.target)) return;
  e.preventDefault();
  camera.zoomBy(e.deltaY * ZOOM_WHEEL_SPEED);
}

let pinchLastDist = null;
let panTouchLast = null;

function onTouchStart(e) {
  if (isUiEventTarget(e.target)) return;
  const touchCount = e.touches.length;
  const panModifier = isPanModifierActive(e);

  if (panModifier && touchCount >= 1) {
    const touch = e.touches[0];
    releasePointerInteraction();
    pointer.down = true;
    pointer.right = true;
    pointer.mode = "pan";
    if (touch) {
      pointer.x = pointer.lx = touch.clientX;
      pointer.y = pointer.ly = touch.clientY;
      panTouchLast = { x: touch.clientX, y: touch.clientY };
    } else {
      panTouchLast = null;
    }
    pinchLastDist = null;
    e.preventDefault();
    return;
  }

  if (touchCount === 1) {
    const touch = e.touches[0];
    pointer.x = pointer.lx = touch.clientX;
    pointer.y = pointer.ly = touch.clientY;
    const size = renderer && renderer.getSize ? renderer.getSize() : null;
    const ray = size ? camera.screenRay(touch.clientX, touch.clientY, size.width, size.height) : null;
    const grabbed = tryBeginGrab(ray);
    if (!grabbed) {
      pointer.down = true;
      pointer.mode = "orbit";
    }
  } else if (touchCount >= 2) {
    if (pointer.mode === "grab") {
      releasePointerInteraction();
    }
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchLastDist = Math.hypot(dx, dy);
    panTouchLast = {
      x: (e.touches[0].clientX + e.touches[1].clientX) * 0.5,
      y: (e.touches[0].clientY + e.touches[1].clientY) * 0.5,
    };
  } else {
    pinchLastDist = null;
    panTouchLast = null;
  }
  if (touchCount >= 1) {
    e.preventDefault();
  }
}

function onTouchMove(e) {
  if (isUiEventTarget(e.target)) return;
  if (isPanModifierActive(e) && pointer.mode === "pan" && e.touches.length >= 1) {
    const touch = e.touches[0];
    if (touch) {
      const dx = touch.clientX - pointer.lx;
      const dy = touch.clientY - pointer.ly;
      camera.panBy(dx, dy);
      pointer.x = pointer.lx = touch.clientX;
      pointer.y = pointer.ly = touch.clientY;
    }
    e.preventDefault();
    return;
  }
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    if (pointer.mode === "grab" && cloth) {
      pointer.x = pointer.lx = touch.clientX;
      pointer.y = pointer.ly = touch.clientY;
      const size = renderer && renderer.getSize ? renderer.getSize() : null;
      const ray = size ? camera.screenRay(touch.clientX, touch.clientY, size.width, size.height) : null;
      if (ray) cloth.setPointerRay(ray.o, ray.d, true);
      e.preventDefault();
      return;
    }
    if (pointer.mode === "orbit") {
      const dx = touch.clientX - pointer.lx;
      const dy = touch.clientY - pointer.ly;
      camera.orbitBy(dx, dy);
      pointer.x = pointer.lx = touch.clientX;
      pointer.y = pointer.ly = touch.clientY;
      e.preventDefault();
      return;
    }
    pointer.x = pointer.lx = touch.clientX;
    pointer.y = pointer.ly = touch.clientY;
    e.preventDefault();
    return;
  }
  if (e.touches.length !== 2) return;
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  const dist = Math.hypot(dx, dy);
  if (pinchLastDist != null) {
    const delta = pinchLastDist - dist;
    camera.zoomBy(delta * ZOOM_PINCH_SPEED);
  }
  if (panTouchLast) {
    const cx = (e.touches[0].clientX + e.touches[1].clientX) * 0.5;
    const cy = (e.touches[0].clientY + e.touches[1].clientY) * 0.5;
    camera.panBy(cx - panTouchLast.x, cy - panTouchLast.y);
    panTouchLast.x = cx;
    panTouchLast.y = cy;
  }
  pinchLastDist = dist;
  e.preventDefault();
}

function onTouchEnd(e) {
  if (e.touches.length < 2) {
    pinchLastDist = null;
    panTouchLast = null;
  }
  if (e.touches.length === 0) {
    releasePointerInteraction();
  }
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
      const ray = camera.screenRay(pointer.x, pointer.y, size.width, size.height);
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

// Settings UI:  setup the listener for the Preset dropdown
if (presetSelect) {
  presetSelect.addEventListener("change", () => {
    const selectedId = presetSelect.value;
    const preset = PRESET_LOOKUP.get(selectedId);
    if (!preset || !preset.query) return;
    applyPresetQuery(preset.query, { preserveRenderer: true, presetId: selectedId, preservePanels: false });
  });
}

// Settings UI:  setup the listener for the Renderer dropdown
if (rendererSelect) {
  rendererSelect.addEventListener("change", () => {
    persistControlState();
    buildRenderer(false)
      .then(() => notify(`Renderer: ${getCurrentRendererLabel()}`, { type: "info" }))
      .catch(() => {});
  });
}

// Settings UI:  setup the listener for the Controls Form, Submit/Reset buttons
if (settingsForm) {
  settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyChanges();
  });
  settingsForm.addEventListener("reset", () => {
    window.requestAnimationFrame(() => {
      snapshotAllControls();
      persistControlState();
    });
  });
}

// Settings UI:  setup the listener for the Reset Simulation button
resetSimBtn.addEventListener("click", resetSimulation);

// Auto-apply for form controls
bindAutoApply(pinEdgeSelect, "change");
bindAutoApply(useShearInput, "change");
const autoApplyInputs = [nxInput, nyInput, clothSizeInput, constraintInput, gravityInput, windInput, windVariationInput, maxSubstepInput, maxAccumulatedInput];
autoApplyInputs.forEach((input) => bindAutoApply(input, "blur"));
if (windVariationInput) {
  windVariationInput.addEventListener("input", () => validateWindVariationInput(false));
  windVariationInput.addEventListener("blur", () => validateWindVariationInput(true));
}

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

[settingsWidget, settingsForm, settingsToggle, infoWidget, infoToggle].forEach((el) => {
  if (!el) return;
  el.addEventListener("pointerdown", stopUiPointer);
  el.addEventListener("wheel", stopUiWheel, { passive: false });
});

if (settingsToggle) {
  settingsToggle.addEventListener("click", () => {
    const nextCollapsed = !document.body.classList.contains("settings-collapsed");
    setSettingsCollapsed(nextCollapsed);
    persistControlState();
  });
}

if (infoToggle) {
  infoToggle.addEventListener("click", () => {
    const nextHidden = !document.body.classList.contains("info-collapsed");
    setInfoCollapsed(nextHidden);
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
