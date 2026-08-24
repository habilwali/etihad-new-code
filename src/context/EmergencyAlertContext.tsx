import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {reportCmsSeenOnce} from '../services/cmsSeenApi';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertData {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  ctaLabel?: string;
  ctaUrl?: string;
  autoDismissMs?: number;
  /**
   * CMS payload id used for `api=seen` reporting.
   * Defaults to `id` when omitted.
   */
  reportId?: string;
}

interface AlertContextType {
  alertData: AlertData | null;
  isVisible: boolean;
  showAlert: (data: AlertData) => void;
  /** User dismiss — hides modal and permanently skips this alert id. */
  dismissAlert: () => void;
  /** CMS cleared alert — hide only, do not remember as user-dismissed. */
  hideAlert: () => void;
  /** True if the user already dismissed this alert id. */
  isAlertDismissed: (id: string) => boolean;
}

const DISMISSED_KEY = '@etihad/alerts/dismissedIds/v1';
const MAX_DISMISSED = 200;

const EmergencyAlertContext = createContext<AlertContextType | null>(null);

export const useEmergencyAlert = () => {
  const ctx = useContext(EmergencyAlertContext);
  if (!ctx) {
    throw new Error('useEmergencyAlert must be inside EmergencyAlertProvider');
  }
  return ctx;
};

export const EmergencyAlertProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  const [alertData, setAlertData] = useState<AlertData | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertDataRef = useRef<AlertData | null>(null);
  alertDataRef.current = alertData;

  // Load previously dismissed alert IDs so user dismiss survives restarts.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(DISMISSED_KEY)
      .then(raw => {
        if (cancelled || !raw) {
          return;
        }
        try {
          const ids = JSON.parse(raw);
          if (Array.isArray(ids)) {
            dismissedIdsRef.current = new Set(ids.map(String));
          }
        } catch {
          // ignore corrupt storage
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  const persistDismissedIds = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      const ids = Array.from(dismissedIdsRef.current).slice(-MAX_DISMISSED);
      dismissedIdsRef.current = new Set(ids);
      AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(ids)).catch(() => {});
    }, 200);
  }, []);

  const isAlertDismissed = useCallback((id: string) => {
    return dismissedIdsRef.current.has(String(id));
  }, []);

  const showAlert = useCallback(
    (data: AlertData) => {
      const id = String(data.id || '');
      // Never re-show an alert the user already dismissed.
      if (id && dismissedIdsRef.current.has(id)) {
        return;
      }
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
      setAlertData(data);
      setIsVisible(true);
      // Report to CMS admin Viewing History — once per id (deduped in cmsSeenApi).
      const seenId = String(data.reportId || data.id || '').trim();
      if (seenId) {
        reportCmsSeenOnce(seenId);
      }
      if (data.autoDismissMs) {
        // Auto-hide only — does NOT mark as permanently dismissed.
        dismissTimer.current = setTimeout(
          () => setIsVisible(false),
          data.autoDismissMs,
        );
      }
    },
    [],
  );

  const hideAlert = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
    }
    setIsVisible(false);
    setTimeout(() => setAlertData(null), 300);
  }, []);

  const dismissAlert = useCallback(() => {
    const current = alertDataRef.current;
    if (current?.id) {
      dismissedIdsRef.current.add(String(current.id));
      persistDismissedIds();
    }
    hideAlert();
  }, [hideAlert, persistDismissedIds]);

  useEffect(
    () => () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    },
    [],
  );

  return (
    <EmergencyAlertContext.Provider
      value={{
        alertData,
        isVisible,
        showAlert,
        dismissAlert,
        hideAlert,
        isAlertDismissed,
      }}>
      {children}
    </EmergencyAlertContext.Provider>
  );
};
