import { useEffect, useState } from 'react';
import {
  buildGetBackgroundImageApiUrl,
  resolveCmsMediaUrl,
} from '../config/cmsEndpoints';

const FETCH_TIMEOUT_MS = 12_000;

interface BackgroundImageApiBody {
  success?: boolean;
  image_available?: boolean;
  image_path?: string;
}

/**
 * Fetches CMS background image URL on mount.
 * - `undefined`: still loading (use local fallback for first paint).
 * - `string`: remote image URI.
 * - `null`: API said no image or request failed (use local asset).
 */
export function useBackgroundImageUri(): string | null | undefined {
  const [uri, setUri] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    (async () => {
      try {
        const res = await fetch(buildGetBackgroundImageApiUrl(), {
          method: 'GET',
          signal: controller.signal,
        });
        if (cancelled) return;
        if (!res.ok) {
          setUri(null);
          return;
        }
        const body = (await res.json()) as BackgroundImageApiBody;
        if (cancelled) return;
        if (
          body.success !== true ||
          body.image_available !== true ||
          typeof body.image_path !== 'string' ||
          !body.image_path.trim()
        ) {
          setUri(null);
          return;
        }
        const full = resolveCmsMediaUrl(body.image_path.trim());
        setUri(full || null);
      } catch {
        if (!cancelled) setUri(null);
      } finally {
        clearTimeout(tid);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(tid);
      controller.abort();
    };
  }, []);

  return uri;
}
