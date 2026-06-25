import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationAttachment {
  url: string;
  name: string;
  mime: string;
  size: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  seen: boolean;
  attachment?: NotificationAttachment;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  addNotification: (n: Omit<NotificationItem, 'seen'>) => void;
  markAsSeen: (id: string) => void;
  markAllAsSeen: () => void;
  removeNotification: (id: string) => void;
  refreshFromApi: (items: Array<Omit<NotificationItem, 'seen'> & { seen?: boolean }>) => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be inside NotificationProvider');
  return ctx;
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotificationsState] = useState<NotificationItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SEEN_KEY = '@etihad/messages/seenIds/v1';

  const persistSeenIds = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const ids = Array.from(seenIdsRef.current);
      AsyncStorage.setItem(SEEN_KEY, JSON.stringify(ids)).catch(() => {});
    }, 250);
  }, []);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SEEN_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) return;
        try {
          const ids = JSON.parse(raw);
          if (Array.isArray(ids)) {
            seenIdsRef.current = new Set(ids.map(String));
            // Apply to any already-loaded notifications
            setNotificationsState((prev) => {
              const next = prev.map((n) =>
                seenIdsRef.current.has(n.id) ? { ...n, seen: true } : n
              );
              return next;
            });
          }
        } catch {
          // ignore corrupt storage
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  const addNotification = useCallback((n: Omit<NotificationItem, 'seen'>) => {
    setNotificationsState((prev) => {
      if (prev.some((x) => x.id === n.id)) return prev;
      const seen = seenIdsRef.current.has(n.id);
      return [{ ...n, seen }, ...prev];
    });
  }, []);

  const markAsSeen = useCallback((id: string) => {
    seenIdsRef.current.add(id);
    persistSeenIds();
    setNotificationsState((prev) =>
      prev.map((n) => (n.id === id ? { ...n, seen: true } : n))
    );
  }, [persistSeenIds]);

  const markAllAsSeen = useCallback(() => {
    setNotificationsState((prev) => {
      for (const n of prev) seenIdsRef.current.add(n.id);
      persistSeenIds();
      return prev.map((n) => ({ ...n, seen: true }));
    });
  }, [persistSeenIds]);

  const removeNotification = useCallback((id: string) => {
    setNotificationsState((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const refreshFromApi = useCallback((items: Array<Omit<NotificationItem, 'seen'> & { seen?: boolean }>) => {
    setNotificationsState((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      for (const item of items) {
        const existing = byId.get(item.id);
        const seenFromStorage = seenIdsRef.current.has(item.id);
        byId.set(item.id, {
          id: item.id,
          title: item.title,
          message: item.message,
          createdAt: item.createdAt,
          // Prefer the freshest attachment data; fall back to what we already stored
          attachment: item.attachment ?? existing?.attachment,
          // Preserve local seen state across restarts; otherwise respect API seen if provided
          seen: existing?.seen ?? seenFromStorage ?? item.seen ?? false,
        });
      }
      const next = [...byId.values()].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      // Skip update if nothing changed — prevents re-renders that disrupt TV remote nav
      if (
        prev.length === next.length &&
        prev.every((p, i) => p.id === next[i].id && p.seen === next[i].seen)
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const unreadCount = notifications.filter((n) => !n.seen).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        markAsSeen,
        markAllAsSeen,
        removeNotification,
        refreshFromApi,
        unreadCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

