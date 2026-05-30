import { useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { CMS_NOTIFICATIONS_REST_URL } from '../config/cmsEndpoints';
import { logCmsNetworkErrorOnce } from '../utils/networkErrorLog';
import { subscribeCmsWebSocket } from '../services/cmsWebSocket';

const POLL_MS = 20_000; // 20s poll — reduces re-renders, refreshFromApi skips when unchanged

export const useNotificationListener = (enabled = true) => {
  const { addNotification, refreshFromApi } = useNotifications();
  const addRef = useRef(addNotification);
  const refreshRef = useRef(refreshFromApi);
  addRef.current = addNotification;
  refreshRef.current = refreshFromApi;

  useEffect(() => {
    if (!enabled) return;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const fetchHistory = async () => {
      try {
        const res = await fetch(CMS_NOTIFICATIONS_REST_URL);
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.list ?? data?.data ?? data?.notifications ?? [];
        const parsed = list.map((n: Record<string, unknown>) => ({
          id: String(n.id ?? n.notification_id ?? ''),
          title: String(n.title ?? ''),
          message: String(n.message ?? n.body ?? ''),
          createdAt: String(n.createdAt ?? n.created_at ?? n.date ?? new Date().toISOString()),
          seen: Boolean(n.seen ?? n.read ?? false),
        }));
        if (parsed.length) refreshRef.current(parsed);
      } catch (e) {
        logCmsNetworkErrorOnce('[NotificationListener]', e, CMS_NOTIFICATIONS_REST_URL);
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
          addRef.current({ id, title, message, createdAt });
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

    ensurePolling();

    const unsubWs = subscribeCmsWebSocket({
      onMessage: handlePayload,
      onOpen: () => {
        void fetchHistory();
      },
    });

    return () => {
      unsubWs();
      if (pollInterval !== null) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };
  }, [enabled]);
};
