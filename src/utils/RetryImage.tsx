/**
 * Shared network-image component for the Etihad Plaza TV app.
 *
 * Uses react-native-fast-image (Glide on Android) for:
 *   - Disk + memory LRU caching (immutable strategy)
 *   - Better OOM resistance on low-RAM TVs (Videocon E43EL1100 etc.)
 *
 * Auto-retries up to MAX_RETRIES times on error with RETRY_DELAY_MS gap.
 * No fade animation — images appear instantly from cache.
 *
 * Also exports `optimizeImageUrl` which appends lightweight size hints
 * (?w=640&h=360) so the CMS can return smaller images, reducing memory
 * consumption by ~75% vs full-res on a 1080p-but-512MB-RAM TV.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet} from 'react-native';
import FastImage from 'react-native-fast-image';

/* ─── Image URL size optimizer ────────────────────────────────
   Appends ?w=640&h=360&fit=crop to CMS URLs that don't already
   carry size params.  If the CMS doesn't support these params
   it simply ignores them — no harm done.
────────────────────────────────────────────────────────────── */
const TV_IMG_W = 640;
const TV_IMG_H = 360;

export function optimizeImageUrl(url: string): string {
  if (!url) {return url;}
  try {
    const hasSize = /[?&](w|width|h|height|size)=/i.test(url);
    if (hasSize) {return url;}
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}w=${TV_IMG_W}&h=${TV_IMG_H}&fit=crop`;
  } catch {
    return url;
  }
}

/* ─── RetryImage ──────────────────────────────────────────────
   Drop-in replacement for <Image source={{uri}} …/>.
   Accepts the same resizeMode values.
────────────────────────────────────────────────────────────── */
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

type ResizeMode = keyof typeof FastImage.resizeMode;

interface RetryImageProps {
  uri: string;
  style?: object | object[];
  resizeMode?: ResizeMode;
}

export default function RetryImage({
  uri,
  style,
  resizeMode = 'cover',
}: RetryImageProps) {
  const [attempt, setAttempt] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optimizedUri = optimizeImageUrl(uri);

  useEffect(() => {setAttempt(0);}, [uri]);
  useEffect(
    () => () => {if (retryTimer.current) {clearTimeout(retryTimer.current);}},
    [],
  );

  const handleError = useCallback(() => {
    if (attempt >= MAX_RETRIES) {return;}
    retryTimer.current = setTimeout(
      () => setAttempt(a => a + 1),
      RETRY_DELAY_MS,
    );
  }, [attempt]);

  return (
    <FastImage
      key={`${optimizedUri}-${attempt}`}
      source={{
        uri: optimizedUri,
        priority: FastImage.priority.normal,
        cache: FastImage.cacheControl.immutable,
      }}
      style={[StyleSheet.absoluteFill, style]}
      resizeMode={FastImage.resizeMode[resizeMode]}
      onError={handleError}
    />
  );
}
