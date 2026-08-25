const LIFECYCLE_KEY = "__dolHelperServerLifecycle";

function newClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `page_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function connectServerLifecycle() {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return null;
  if (window[LIFECYCLE_KEY]) return window[LIFECYCLE_KEY];

  const clientId = newClientId();
  let events = null;

  function connect() {
    if (events && events.readyState !== EventSource.CLOSED) return;
    events = new EventSource(`/api/session/events?id=${encodeURIComponent(clientId)}`);
  }

  function disconnect() {
    events?.close();
    events = null;
    try {
      navigator.sendBeacon?.(`/api/session/close?id=${encodeURIComponent(clientId)}`, "");
    } catch {
      // SSE 断开本身仍会让服务端清理会话。
    }
  }

  window.addEventListener("pagehide", disconnect);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) connect();
  });

  const lifecycle = { clientId, connect, disconnect };
  window[LIFECYCLE_KEY] = lifecycle;
  connect();
  return lifecycle;
}
