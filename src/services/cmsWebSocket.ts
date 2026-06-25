/**
 * Single shared WebSocket to the CMS.
 * Opening two sockets (alerts + notifications) often means only one receives
 * broadcasts; the other stays idle. All subscribers get every message and filter locally.
 *
 * Call {@link setCmsDeviceMac} once the device MAC is known so the connection
 * uses `?mac=AA:BB:CC:DD:EE:FF` for per-tenant message routing. The server
 * still delivers "send-to-all" broadcasts regardless of MAC.
 */
import { buildCmsWebSocketUrl, normalizeDeviceMac } from '../config/cmsEndpoints';

type DataHandler = (data: string) => void;
type OpenHandler = () => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** MAC set via {@link setCmsDeviceMac}. Empty string = connect without MAC (legacy). */
let deviceMac = '';

const messageHandlers = new Set<DataHandler>();
const openHandlers = new Set<OpenHandler>();

function broadcastMessage(data: string) {
  messageHandlers.forEach((h) => {
    try {
      h(data);
    } catch (e) {
      if (__DEV__) console.log('[CMS WS] message handler error', e);
    }
  });
}

function broadcastOpen() {
  openHandlers.forEach((h) => {
    try {
      h();
    } catch (e) {
      if (__DEV__) console.log('[CMS WS] onOpen handler error', e);
    }
  });
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (messageHandlers.size === 0) return;
  clearReconnect();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectIfNeeded();
  }, 2500);
}

function connectIfNeeded() {
  if (messageHandlers.size === 0) return;

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  if (socket) {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
    socket = null;
  }

  try {
    const wsUrl = buildCmsWebSocketUrl(deviceMac);
    socket = new WebSocket(wsUrl);
    if (__DEV__) console.log('[CMS WS] connecting (shared)', wsUrl);

    socket.onopen = () => {
      if (__DEV__) console.log('[CMS WS] open — subscribers:', messageHandlers.size);
      // Belt-and-suspenders: also send REGISTER in case server prefers message-based auth.
      if (deviceMac) {
        try {
          socket?.send(JSON.stringify({ type: 'REGISTER', mac: deviceMac }));
        } catch {
          /* ignore — server may not require REGISTER when ?mac= is on the URL */
        }
      }
      broadcastOpen();
    };

    socket.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        broadcastMessage(ev.data);
      }
    };

    socket.onerror = () => {
      // use console.log — console.warn triggers RN LogBox (yellow in-app bar)
      if (__DEV__) console.log('[CMS WS] error');
      try {
        socket?.close();
      } catch {
        /* ignore */
      }
    };

    socket.onclose = () => {
      if (__DEV__) console.log('[CMS WS] closed');
      socket = null;
      scheduleReconnect();
    };
  } catch {
    socket = null;
    scheduleReconnect();
  }
}

export interface CmsWsSubscription {
  onMessage: DataHandler;
  onOpen?: OpenHandler;
}

/**
 * Inform the shared WebSocket about the device MAC address.
 * - If already open: sends a `REGISTER` message so the server can start filtering.
 * - If connecting / closed: stores MAC and uses it for the next `connectIfNeeded()`,
 *   forcing a reconnect so the new URL includes `?mac=`.
 * Safe to call multiple times; a no-op when the MAC is unchanged.
 */
export function setCmsDeviceMac(mac: string): void {
  const normalized = normalizeDeviceMac(mac);
  if (normalized === deviceMac) return;
  deviceMac = normalized;

  if (socket?.readyState === WebSocket.OPEN) {
    // Already connected — update server via REGISTER (URL already established).
    try {
      socket.send(JSON.stringify({ type: 'REGISTER', mac: deviceMac }));
    } catch {
      /* ignore */
    }
  } else {
    // Reconnect so the new URL carries ?mac=
    clearReconnect();
    if (socket) {
      try { socket.close(); } catch { /* ignore */ }
      socket = null;
    }
    connectIfNeeded();
  }
}

/**
 * Register handlers for the shared CMS WebSocket. Unsubscribe in useEffect cleanup.
 */
export function subscribeCmsWebSocket(handlers: CmsWsSubscription): () => void {
  messageHandlers.add(handlers.onMessage);
  if (handlers.onOpen) openHandlers.add(handlers.onOpen);

  connectIfNeeded();

  if (socket?.readyState === WebSocket.OPEN && handlers.onOpen) {
    queueMicrotask(() => handlers.onOpen?.());
  }

  return () => {
    messageHandlers.delete(handlers.onMessage);
    if (handlers.onOpen) openHandlers.delete(handlers.onOpen);

    clearReconnect();

    if (messageHandlers.size === 0) {
      try {
        socket?.close();
      } catch {
        /* ignore */
      }
      socket = null;
    }
  };
}
