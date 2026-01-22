const STYLE_ID = "toast-notification-style";
const CONTAINER_ID = "toast-notification-container";

const TYPE_THEMES = {
  info: {
    background: "rgba(12, 18, 24, 0.95)",
    text: "#e6f4ff",
    accent: "rgba(125, 211, 252, 0.85)",
  },
  success: {
    background: "rgba(6, 20, 14, 0.95)",
    text: "#dcfce7",
    accent: "rgba(52, 211, 153, 0.85)",
  },
  warning: {
    background: "rgba(32, 20, 4, 0.95)",
    text: "#fde68a",
    accent: "rgba(251, 191, 36, 0.9)",
  },
  danger: {
    background: "rgba(32, 7, 7, 0.95)",
    text: "#fee2e2",
    accent: "rgba(248, 113, 113, 0.9)",
  },
};

function parseHexColor(color) {
  if (typeof color !== "string") return null;
  const hex = color.trim();
  const shortMatch = /^#([0-9a-f]{3})$/i.exec(hex);
  if (shortMatch) {
    const c = shortMatch[1];
    return [
      parseInt(c[0] + c[0], 16),
      parseInt(c[1] + c[1], 16),
      parseInt(c[2] + c[2], 16),
    ];
  }
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  return [
    parseInt(match[1].slice(0, 2), 16),
    parseInt(match[1].slice(2, 4), 16),
    parseInt(match[1].slice(4, 6), 16),
  ];
}

function rgbaString([r, g, b], alpha) {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function readableTextColor([r, g, b]) {
  const lum = (0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255));
  return lum > 0.55 ? "#111314" : "#fefefe";
}

function resolveTheme(type, color) {
  const base = TYPE_THEMES[type] || TYPE_THEMES.info;
  if (!color) return base;
  const rgb = parseHexColor(color);
  if (!rgb) {
    return { ...base, accent: color };
  }
  return {
    background: rgbaString(rgb, 0.92),
    text: readableTextColor(rgb),
    accent: rgbaString(rgb, 0.9),
  };
}

// Private: inject the toast stylesheet once.
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${CONTAINER_ID} {
      position: fixed;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column-reverse;
      align-items: center;
      gap: 10px;
      z-index: 9999;
      pointer-events: none;
    }

    .toast-notification {
      --toast-bg: rgba(19, 20, 22, 0.92);
      --toast-text: #fef5e7;
      --toast-accent: rgba(125, 211, 252, 0.6);
      min-width: 220px;
      max-width: 360px;
      padding: 12px 14px;
      border-radius: 14px;
      background: var(--toast-bg);
      color: var(--toast-text);
      font-size: 12px;
      line-height: 1.4;
      letter-spacing: 0.01em;
      border: 1px solid var(--toast-accent);
      box-shadow: 0 16px 30px rgba(7, 8, 9, 0.35);
      opacity: 0;
      transform: translateY(14px);
      animation: toast-in 0.3s ease forwards;
      pointer-events: auto;
      cursor: pointer;
    }

    .toast-notification.toast-out {
      animation: toast-out 0.35s ease forwards;
    }

    @keyframes toast-in {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes toast-out {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(10px); }
    }

    @media (max-width: 720px) {
      #${CONTAINER_ID} {
        left: 12px;
        right: 12px;
        transform: none;
        align-items: stretch;
      }

      .toast-notification {
        max-width: none;
      }
    }
  `;
  document.head.appendChild(style);
}

// Private: create or return the toast container.
function ensureContainer() {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    document.body.appendChild(container);
  }
  return container;
}

// create a toast manager for in-app notifications.
export function createToastManager() {
  ensureStyle();
  const container = ensureContainer();

  // show a toast message with optional type and timeout.
  function notify(message, { type = "info", timeout = 2600, color = null } = {}) {
    if (!message) return;
    const toast = document.createElement("div");
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;
    const theme = resolveTheme(type, color);
    toast.style.setProperty("--toast-bg", theme.background);
    toast.style.setProperty("--toast-text", theme.text);
    if (theme.accent) toast.style.setProperty("--toast-accent", theme.accent);
    toast.setAttribute("role", "status");
    container.appendChild(toast);

    const remove = () => {
      toast.classList.add("toast-out");
      toast.addEventListener("animationend", () => toast.remove(), { once: true });
    };

    const timeoutId = window.setTimeout(remove, timeout);

    const dismiss = (event) => {
      event?.stopPropagation();
      window.clearTimeout(timeoutId);
      remove();
    };

    toast.addEventListener("click", dismiss);
    toast.addEventListener("pointerdown", (event) => event.stopPropagation());
  }

  // return the public API here
  return { notify };
}
