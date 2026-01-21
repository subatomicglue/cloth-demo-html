const STYLE_ID = "toast-notification-style";
const CONTAINER_ID = "toast-notification-container";

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
      min-width: 220px;
      max-width: 360px;
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(19, 20, 22, 0.92);
      color: #fef5e7;
      font-size: 12px;
      line-height: 1.4;
      letter-spacing: 0.01em;
      box-shadow: 0 16px 30px rgba(7, 8, 9, 0.35);
      opacity: 0;
      transform: translateY(14px);
      animation: toast-in 0.3s ease forwards;
    }

    .toast-notification.toast-info {
      border: 1px solid rgba(125, 211, 252, 0.4);
    }

    .toast-notification.toast-warning {
      border: 1px solid rgba(252, 165, 165, 0.5);
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
  function notify(message, { type = "info", timeout = 2600 } = {}) {
    if (!message) return;
    const toast = document.createElement("div");
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    const remove = () => {
      toast.classList.add("toast-out");
      toast.addEventListener("animationend", () => toast.remove(), { once: true });
    };

    window.setTimeout(remove, timeout);
  }

  // return the public API here
  return { notify };
}
