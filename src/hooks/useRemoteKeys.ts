/**
 * Hook for handling Android TV remote key events
 */
import { useEffect, useRef } from 'react';
import { Platform, DeviceEventEmitter } from 'react-native';

export const KEYCODES = {
  BACK: 4,
  DPAD_UP: 19,
  DPAD_DOWN: 20,
  DPAD_LEFT: 21,
  DPAD_RIGHT: 22,
  SELECT: 23,
  ENTER: 66,
  MENU: 109,
} as const;

export type KeyHandler = (keyCode: number) => void | boolean;

interface UseRemoteKeysOptions {
  isActive?: boolean;
  onBack?: () => void;
  onKeyDown?: KeyHandler;
  /** Custom handlers: return true to prevent default */
  handlers?: Partial<Record<number, () => void>>;
}

/**
 * Subscribe to onKeyDown events. Handlers receive keyCode.
 * Return true from onKeyDown to prevent default (e.g. back).
 * TV performance: handlers stored in ref to avoid effect re-subscriptions every render.
 */
export function useRemoteKeys({
  isActive = true,
  onBack,
  onKeyDown,
  handlers = {},
}: UseRemoteKeysOptions) {
  const onBackRef = useRef(onBack);
  const onKeyDownRef = useRef(onKeyDown);
  const handlersRef = useRef(handlers);
  onBackRef.current = onBack;
  onKeyDownRef.current = onKeyDown;
  handlersRef.current = handlers;

  useEffect(() => {
    if (Platform.OS !== 'android' || !isActive) return;

    const sub = DeviceEventEmitter.addListener(
      'onKeyDown',
      (evt: { keyCode: number }) => {
        const kc = evt.keyCode;
        const custom = handlersRef.current[kc];
        if (custom) {
          custom();
          return;
        }
        if (kc === KEYCODES.BACK && onBackRef.current) {
          onBackRef.current();
          return;
        }
        onKeyDownRef.current?.(kc);
      }
    );
    return () => sub.remove();
  }, [isActive]);
}
