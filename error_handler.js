
// GLOBAL ERROR HANDLER
// helper utilities for capturing runtime errors
// in app startup and routing them to a consumer-provided handler.
// By default, errors are logged to the console.

// IMPORTANT: require("error_handler") before any other app code to ensure
// all errors are captured.

const pendingGlobalErrors = [];
let onGlobalError = (message) => {
  pendingGlobalErrors.push(message);
  // eslint-disable-next-line no-console
  console.error(message);
};

export function formatErrorMessage(prefix, value) {
  if (!value) return prefix;
  if (typeof value === "string") return `${prefix}: ${value}`;
  if (value && value.message) return `${prefix}: ${value.message}`;
  try {
    return `${prefix}: ${JSON.stringify(value)}`;
  } catch {
    return `${prefix}: ${String(value)}`;
  }
}

// use this to override / set a custom global error handler (if not, you'll see them on the console)
export function setGlobalErrorHandler(handler) {
  onGlobalError = handler;

  // flush any pending errors that occurred before the handler was set.
  while (pendingGlobalErrors.length) {
    const buffered = pendingGlobalErrors.shift();
    onGlobalError(buffered);
  }
}

// register our global error handler
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    const detail = event?.error || event?.message || event;
    onGlobalError(formatErrorMessage("Runtime error", detail));
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason ?? event;
    onGlobalError(formatErrorMessage("Unhandled rejection", reason));
  });
}
