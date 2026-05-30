/**
 * CMS fetches often fail when the TV is offline or the server IP changed.
 * Avoid spamming Metro: log at most once per app session (dev only).
 */
const KEY = '__hotelCmsErrLogged';

export function logCmsNetworkErrorOnce(tag: string, err: unknown, urlHint: string): void {
  if (!__DEV__) return;

  const g = globalThis as { [KEY]?: Set<string> };
  if (!g[KEY]) g[KEY] = new Set();
  if (g[KEY]!.has(tag)) return;
  g[KEY]!.add(tag);

  const msg = err instanceof Error ? err.message : String(err);
  console.log(
    `${tag} ${msg} — CMS URL: ${urlHint} (same Wi‑Fi as TV? server running? IP in src/config/cmsEndpoints.ts)`,
  );
}
