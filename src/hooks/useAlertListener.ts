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

export const useAlertListener = (enabled = true) => {
  const { showAlert, dismissAlert } = useEmergencyAlert();
  const showRef = useRef(showAlert);
  const dismissRef = useRef(dismissAlert);
  showRef.current = showAlert;
  dismissRef.current = dismissAlert;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

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
          dismissRef.current();
        } else if (shouldShow) {
          const title = String(payload.title ?? payload.headline ?? payload.subject ?? 'Alert');
          const message = String(payload.message ?? payload.body ?? payload.text ?? '');
          showRef.current({
            id: String(payload.id ?? payload.alert_id ?? 'alert'),
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
