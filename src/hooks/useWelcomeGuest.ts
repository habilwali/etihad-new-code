import { useEffect, useState } from 'react';
import { fetchWelcomeByMac } from '../services/welcomeApi';
import type { WelcomeGuestPayload } from '../services/welcomeApi';
import { getDeviceMacForWelcomeApi } from '../utils/getDeviceMacForWelcome';
import {
  readWelcomeGuestCache,
  writeWelcomeGuestCache,
} from '../utils/welcomeGuestCache';
import {
  welcomePerfFlowStart,
  welcomePerfLogBreakdown,
} from '../utils/welcomePerfSession';

export type WelcomeGuestUiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; source: 'api'; data: WelcomeGuestPayload }
  | { status: 'ready'; source: 'fallback'; reason?: string };

const FALLBACK_NAME = 'Guest';
const FALLBACK_WELCOME = 'Welcome home';

/**
 * Loads welcome copy from CMS when `enabled` (e.g. after splash).
 * Falls back to generic labels on API error or offline (MAC always resolved via `getDeviceMacForWelcomeApi`).
 */
export function useWelcomeGuest(enabled: boolean) {
  const [state, setState] = useState<WelcomeGuestUiState>({ status: 'idle' });

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      const flowT0 = Date.now();
      welcomePerfFlowStart();
      try {
        const mac = await getDeviceMacForWelcomeApi();
        if (cancelled) return;

        // Metro + adb logcat: filter tag "WelcomeGuest" or search "mac_address"
        console.log('[WelcomeGuest] mac_address for CMS:', mac);

        const cached = readWelcomeGuestCache(mac);
        if (cached) {
          setState({ status: 'ready', source: 'api', data: cached });
          console.log('[WelcomeGuest] showing cached welcome (revalidating in background)');
        }

        console.log('[WelcomeGuest] calling Welcome API…');
        const result = await fetchWelcomeByMac(mac);
        if (cancelled) return;

        console.log(
          '[WelcomeGuest] Welcome API finished',
          result.ok
            ? { ok: true, room: result.data.roomNumber }
            : { ok: false, reason: result.reason, message: result.message },
        );

        if (result.ok) {
          writeWelcomeGuestCache(mac, result.data);
          setState({ status: 'ready', source: 'api', data: result.data });
          return;
        }

        if (readWelcomeGuestCache(mac)) {
          console.log('[WelcomeGuest] API failed; keeping cached welcome');
          return;
        }

        if (__DEV__) {
          console.log('[WelcomeGuest]', result.reason, result.message);
        }
        setState({
          status: 'ready',
          source: 'fallback',
          reason: result.reason,
        });
      } finally {
        if (!cancelled) {
          welcomePerfLogBreakdown(Date.now() - flowT0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const guestName =
    state.status === 'ready' && state.source === 'api'
      ? state.data.clientName || FALLBACK_NAME
      : FALLBACK_NAME;

  const welcomeMessage =
    state.status === 'ready' && state.source === 'api'
      ? state.data.welcomeMessage || FALLBACK_WELCOME
      : FALLBACK_WELCOME;

  const roomNumber =
    state.status === 'ready' && state.source === 'api' ? state.data.roomNumber : undefined;

  const signatureTitle =
    state.status === 'ready' && state.source === 'api' ? state.data.signatureTitle : undefined;

  const roomNavLabel =
    roomNumber && roomNumber.length > 0 ? `Room NO: ${roomNumber}` : 'Room NO: —';

  const loading = state.status === 'loading';

  return {
    state,
    loading,
    guestName,
    welcomeMessage,
    roomNumber,
    signatureTitle,
    roomNavLabel,
  };
}
