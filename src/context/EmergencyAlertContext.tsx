import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertData {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  ctaLabel?: string;
  ctaUrl?: string;
  autoDismissMs?: number;
}

interface AlertContextType {
  alertData: AlertData | null;
  isVisible: boolean;
  showAlert: (data: AlertData) => void;
  dismissAlert: () => void;
}

const EmergencyAlertContext = createContext<AlertContextType | null>(null);

export const useEmergencyAlert = () => {
  const ctx = useContext(EmergencyAlertContext);
  if (!ctx) throw new Error('useEmergencyAlert must be inside EmergencyAlertProvider');
  return ctx;
};

export const EmergencyAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alertData, setAlertData] = useState<AlertData | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showAlert = useCallback((data: AlertData) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setAlertData(data);
    setIsVisible(true);
    if (data.autoDismissMs) {
      dismissTimer.current = setTimeout(() => setIsVisible(false), data.autoDismissMs);
    }
  }, []);

  const dismissAlert = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setIsVisible(false);
    setTimeout(() => setAlertData(null), 300);
  }, []);

  useEffect(() => () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); }, []);

  return (
    <EmergencyAlertContext.Provider value={{ alertData, isVisible, showAlert, dismissAlert }}>
      {children}
    </EmergencyAlertContext.Provider>
  );
};

