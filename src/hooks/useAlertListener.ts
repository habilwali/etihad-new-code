import { useEffect, useRef } from 'react';
import type { AlertSeverity } from '../context/EmergencyAlertContext';
import { useEmergencyAlert } from '../context/EmergencyAlertContext';
import { buildCmsAlertPollUrl } from '../config/cmsEndpoints';
import { logCmsNetworkErrorOnce } from '../utils/networkErrorLog';
import { subscribeCmsWebSocket, setCmsDeviceMac } from '../services/cmsWebSocket';
import { getDeviceMacForWelcomeApi } from '../utils/getDeviceMacForWelcome';

const POLL_MS = 5_000;

function isTruthyActive(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
  }
  return false;
}

/** CMS often returns { data: {...} }, { response: {...} }, or { alert: {...} }; merge to top level. */
function mergeAlertEnvelope(raw: Record<string, unknown>): Record<string, unknown> {
  const inner = raw.data ?? raw.response ?? raw.result;
  const fromInner =
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? (inner as Record<string, unknown>)
      : {};
  const alertObj = raw.alert;
  const fromAlert =
    alertObj && typeof alertObj === 'object' && !Array.isArray(alertObj)
      ? (alertObj as Record<string, unknown>)
      : {};
  return { ...raw, ...fromInner, ...fromAlert };
}

function normalizeType(t: unknown): string | undefined {
  if (t == null || typeof t !== 'string') return undefined;
  return t.trim().toUpperCase().replace(/\s+/g, '_');
}

function normalizeSeverity(v: unknown): AlertSeverity {
  const s = String(v ?? 'info').trim().toLowerCase();
  if (s === 'critical' || s === 'crit' || s === 'error' || s === 'danger') return 'critical';
  if (s === 'warning' || s === 'warn') return 'warning';
  return 'info';
}

/** Stable id when CMS omits one — same title+message = same id across polls. */
function buildAlertId(payload: Record<string, unknown>, title: string, message: string): string {
  const raw = payload.id ?? payload.alert_id ?? payload.notification_id;
  if (raw != null && String(raw).trim() !== '' && String(raw).trim() !== 'alert') {
    return String(raw).trim();
  }
  // Content hash fallback (same idea as overlay service) so user dismiss sticks across polls.
  let h = 0;
  const key = `${title}|${message}`;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return `alert-${h}`;
}

/** Prefer CMS `id` / `alert_id` for admin Seen reporting. */
function cmsReportId(payload: Record<string, unknown>, fallbackId: string): string {
  const raw = payload.id ?? payload.alert_id ?? payload.notification_id;
  if (raw != null && String(raw).trim() !== '') {
    return String(raw).trim();
  }
  return fallbackId;
}

/**
 * If CMS includes a non-empty targetMacs / target_macs list, only show when this device
 * is listed. Empty / missing list = broadcast to all.
 */
function isTargetedToThisMac(
  payload: Record<string, unknown>,
  deviceMac: string,
): boolean {
  const raw =
    payload.targetMacs ??
    payload.target_macs ??
    payload.targetMac ??
    payload.macs;
  if (raw == null) {
    return true;
  }
  const list: string[] = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === 'string' && raw.trim()
    ? [raw]
    : [];
  if (list.length === 0) {
    return true;
  }
  if (!deviceMac) {
    return false;
  }
  const mac = deviceMac.trim().toUpperCase();
  return list.some(m => String(m).trim().toUpperCase() === mac);
}

export const useAlertListener = (enabled = true) => {
  const { showAlert, hideAlert, isAlertDismissed } = useEmergencyAlert();
  const showRef = useRef(showAlert);
  const hideRef = useRef(hideAlert);
  const isDismissedRef = useRef(isAlertDismissed);
  showRef.current = showAlert;
  hideRef.current = hideAlert;
  isDismissedRef.current = isAlertDismissed;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let deviceMac = '';

    const handlePayload = (raw: string) => {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const payload = mergeAlertEnvelope(parsed);

        if (__DEV__) console.log('[AlertListener] payload:', JSON.stringify(payload));

        const typeNorm = normalizeType(payload.type);
        const activeVal = payload.active;
        const active = isTruthyActive(activeVal);

        const isDismiss =
          typeNorm === 'DISMISS' ||
          activeVal === false ||
          activeVal === 0 ||
          (typeof activeVal === 'string' &&
            ['false', '0', 'no', 'off'].includes(activeVal.trim().toLowerCase())) ||
          String(payload.status ?? '')
            .trim()
            .toLowerCase() === 'dismissed' ||
          String(payload.status ?? '')
            .trim()
            .toLowerCase() === 'dismiss';

        const isEmergencyType =
          typeNorm === 'EMERGENCY_ALERT' ||
          typeNorm === 'ALERT' ||
          typeNorm === 'EMERGENCY';

        const hasContent = !!(payload.title || payload.message || payload.body || payload.headline);

        // Show if not dismissed and CMS marks an active emergency, or active + text (some APIs omit type)
        const shouldShow = !isDismiss && active && (isEmergencyType || hasContent);

        if (__DEV__) console.log('[AlertListener]', { typeNorm, active, isDismiss, shouldShow });

        if (isDismiss) {
          // CMS cleared the alert — hide UI only; do not touch user-dismiss memory.
          hideRef.current();
        } else if (shouldShow) {
          // Do not show (or report seen) when this TV is outside targetMacs.
          if (!isTargetedToThisMac(payload, deviceMac)) {
            if (__DEV__) {
              console.log('[AlertListener] skip — not targeted to this MAC', deviceMac);
            }
            return;
          }
          const title = String(payload.title ?? payload.headline ?? payload.subject ?? 'Alert');
          const message = String(payload.message ?? payload.body ?? payload.text ?? '');
          const id = buildAlertId(payload, title, message);
          // Skip if user already dismissed this alert from the remote.
          if (isDismissedRef.current(id)) {
            return;
          }
          showRef.current({
            id,
            reportId: cmsReportId(payload, id),
            title,
            message,
            severity: normalizeSeverity(payload.severity ?? payload.level),
            ctaLabel: payload.ctaLabel != null ? String(payload.ctaLabel) : undefined,
            ctaUrl: payload.ctaUrl != null ? String(payload.ctaUrl) : undefined,
            autoDismissMs:
              typeof payload.autoDismissMs === 'number' ? payload.autoDismissMs : undefined,
          });
        }
      } catch (e) {
        console.warn('[AlertListener] parse error', e);
      }
    };

    // pollUrl is set once MAC resolves; guarded by `alive` in case the effect
    // is cleaned up before the async probe finishes.
    let pollUrl = '';

    const doPoll = async () => {
      if (!pollUrl) return; // MAC not yet resolved
      try {
        const res = await fetch(pollUrl);
        const data = (await res.json()) as Record<string, unknown>;
        const merged = mergeAlertEnvelope(data);

        // Infer type only from merged fields (fixes wrong DISMISS when alert lived under `data`)
        if (merged.type == null || String(merged.type).trim() === '') {
          if (merged.active !== undefined && merged.active !== null) {
            merged.type = isTruthyActive(merged.active) ? 'EMERGENCY_ALERT' : 'DISMISS';
          }
        }

        handlePayload(JSON.stringify(merged));
      } catch (e) {
        logCmsNetworkErrorOnce('[AlertListener]', e, pollUrl);
      }
    };

    const ensurePolling = () => {
      if (pollInterval !== null) return;
      void doPoll();
      pollInterval = setInterval(() => {
        void doPoll();
      }, POLL_MS);
    };

    // Resolve MAC once (cached after first call), then start MAC-aware polling and
    // update the shared WebSocket URL so the server can filter per-tenant messages.
    getDeviceMacForWelcomeApi().then(mac => {
      if (!alive) return;
      deviceMac = mac;
      pollUrl = buildCmsAlertPollUrl(mac);
      // Inform the shared WS singleton so it reconnects with ?mac= if needed.
      setCmsDeviceMac(mac);
      ensurePolling();
    });

    const unsubWs = subscribeCmsWebSocket({
      onMessage: handlePayload,
      onOpen: () => {
        void doPoll();
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
