// Lightweight WebSocket helper with auto-reconnect and fallback hooks
// Usage: const rt = createRealtime({ path: '/orders', onMessage }); rt.close()

export function createRealtime({ path = '/', onMessage, onStatusChange } = {}) {
  const base =
    (typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.VITE_WS_URL) ||
    '';
  if (!base) {
    onStatusChange?.('disabled');
    return { close() {}, isActive: () => false };
  }

  let ws = null;
  let active = true;
  let reconnectAttempts = 0;

  const buildUrl = () => {
    const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
    const p = path.startsWith('/') ? path : `/${path}`;
    const url = `${trimmed}${p}`;
    return url;
  };

  const connect = () => {
    if (!active) return;
    const url = buildUrl();
    try {
      ws = new WebSocket(url);
    } catch (e) {
      onStatusChange?.('error', e);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      reconnectAttempts = 0;
      onStatusChange?.('open');
    };
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        onMessage?.(data);
      } catch {
        onMessage?.(evt.data);
      }
    };
    ws.onerror = (e) => {
      onStatusChange?.('error', e);
    };
    ws.onclose = () => {
      if (!active) return;
      onStatusChange?.('closed');
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    reconnectAttempts += 1;
    const delay = Math.min(30_000, 1000 * Math.pow(2, reconnectAttempts));
    onStatusChange?.('reconnecting', { delay });
    setTimeout(() => connect(), delay);
  };

  connect();

  return {
    close() {
      active = false;
      try {
        ws && ws.close();
      } catch {}
    },
    isActive: () => active,
    send(payload) {
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          const data =
            typeof payload === 'string' ? payload : JSON.stringify(payload);
          ws.send(data);
        }
      } catch {}
    },
  };
}
