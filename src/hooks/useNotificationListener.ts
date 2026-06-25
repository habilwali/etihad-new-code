import { useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationContext';
import type { NotificationAttachment } from '../context/NotificationContext';
import { buildCmsNotificationsUrl } from '../config/cmsEndpoints';
import { logCmsNetworkErrorOnce } from '../utils/networkErrorLog';
import { subscribeCmsWebSocket } from '../services/cmsWebSocket';
import { getDeviceMacForWelcomeApi } from '../utils/getDeviceMacForWelcome';

const POLL_MS = 20_000; // 20s poll — reduces re-renders, refreshFromApi skips when unchanged

/** Safely parse the `attachment` object from a raw notification payload field. */
function parseAttachment(raw: unknown): NotificationAttachment | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const a = raw as Record<string, unknown>;
  const url = typeof a.url === 'string' ? a.url.trim() : '';
  if (!url) return undefined;
  return {
    url,
    name: typeof a.name === 'string' ? a.name.trim() : url.split('/').pop() ?? '',
    mime: typeof a.mime === 'string' ? a.mime.trim() : 'application/octet-stream',
    size: typeof a.size === 'number' ? a.size : 0,
  };
}

export const useNotificationListener = (enabled = true) => {
  const { addNotification, refreshFromApi } = useNotifications();
  const addRef = useRef(addNotification);
  const refreshRef = useRef(refreshFromApi);
  addRef.current = addNotification;
  refreshRef.current = refreshFromApi;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    let pollUrl = '';

    const fetchHistory = async () => {
      if (!pollUrl) return; // MAC not yet resolved
      try {
        const res = await fetch(pollUrl);
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.list ?? data?.data ?? data?.notifications ?? [];
        const parsed = list.map((n: Record<string, unknown>) => ({
          id: String(n.id ?? n.notification_id ?? ''),
          title: String(n.title ?? ''),
          message: String(n.message ?? n.body ?? ''),
          createdAt: String(n.createdAt ?? n.created_at ?? n.date ?? new Date().toISOString()),
          seen: Boolean(n.seen ?? n.read ?? false),
          attachment: parseAttachment(n.attachment),
        }));
        if (parsed.length) refreshRef.current(parsed);
      } catch (e) {
        logCmsNetworkErrorOnce('[NotificationListener]', e, pollUrl);
      }
    };

    const handlePayload = (raw: string) => {
      try {
        const payload = JSON.parse(raw);
        const type = payload?.type ?? payload?.data?.type;
        if (type === 'NOTIFICATION' || type === 'notification') {
          const item = payload?.data ?? payload?.notification ?? payload;
          const id = String(item?.id ?? payload?.id ?? Date.now());
          const title = String(item?.title ?? payload?.title ?? 'Notification');
          const message = String(item?.message ?? payload?.message ?? item?.body ?? '');
          const createdAt = String(item?.createdAt ?? payload?.createdAt ?? new Date().toISOString());
          const attachment = parseAttachment(item?.attachment ?? payload?.attachment);
          addRef.current({ id, title, message, createdAt, attachment });
        }
      } catch (e) {
        if (__DEV__) console.warn('[NotificationListener] parse error', e);
      }
    };

    /** Keep polling even when WS is up — same cold-start / missed-push issue as alerts. */
    const ensurePolling = () => {
      if (pollInterval !== null) return;
      void fetchHistory();
      pollInterval = setInterval(() => {
        void fetchHistory();
      }, POLL_MS);
    };

    // Resolve MAC once (shared cached promise), then start MAC-aware polling.
    getDeviceMacForWelcomeApi().then(mac => {
      if (!alive) return;
      pollUrl = buildCmsNotificationsUrl(mac);
      ensurePolling();
    });

    const unsubWs = subscribeCmsWebSocket({
      onMessage: handlePayload,
      onOpen: () => {
        void fetchHistory();
      },
    });

    return () => {
      alive = false;
      unsubWs();
      if (pollInterval !== null) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };
  }, [enabled]);
};
