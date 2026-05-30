import { getCmsHttpOrigin } from '../config/cmsEndpoints';

const UPDATE_CHECK_TIMEOUT_MS = 10_000;

export interface UpdateInfo {
  update_available: true;
  version_name: string;
  version_code: number;
  apk_url: string;
  release_notes: string;
  is_force_update: boolean;
}

export type UpdateCheckResult =
  | { available: false }
  | { available: true; info: UpdateInfo }
  | { available: false; error: string };

export async function checkForUpdate(versionCode: number): Promise<UpdateCheckResult> {
  const url = `${getCmsHttpOrigin()}/api/app/check-update.php?version_code=${versionCode}`;

  console.log('[UpdateService] Checking URL:', url);
  console.log('[UpdateService] Installed versionCode:', versionCode);

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(tid);
    console.log('[UpdateService] HTTP status:', res.status);
  } catch (err) {
    clearTimeout(tid);
    console.warn('[UpdateService] Network error:', err);
    return { available: false, error: 'Network error' };
  }

  let body: unknown;
  try {
    body = await res.json();
    console.log('[UpdateService] Response body:', JSON.stringify(body));
  } catch (err) {
    console.warn('[UpdateService] JSON parse error:', err);
    return { available: false, error: 'Invalid response' };
  }

  if (typeof body !== 'object' || body === null) {
    return { available: false, error: 'Empty response' };
  }

  const rec = body as Record<string, unknown>;

  if (rec.update_available !== true) {
    console.log('[UpdateService] No update available (update_available !== true)');
    return { available: false };
  }

  // Support both:
  //   apk_url  — full URL already (e.g. "http://192.168.70.242:8080/uploads/app.apk")
  //   apk_path — relative path from CMS (e.g. "/uploads/apk/app.apk")
  //              → we prepend the CMS base origin automatically
  const rawApkUrl  = rec.apk_url;
  const rawApkPath = rec.apk_path;

  let apk_url = '';

  if (typeof rawApkUrl === 'string' &&
      (rawApkUrl.startsWith('http://') || rawApkUrl.startsWith('https://'))) {
    apk_url = rawApkUrl;
  } else if (typeof rawApkPath === 'string' && rawApkPath.length > 0) {
    const base = getCmsHttpOrigin(); // e.g. http://192.168.70.242:8080
    const path = rawApkPath.startsWith('/') ? rawApkPath : `/${rawApkPath}`;
    apk_url = `${base}${path}`;
  }

  console.log('[UpdateService] Update available! version_code:', rec.version_code, '| apk_url:', apk_url || '(missing/invalid)');

  return {
    available: true,
    info: {
      update_available: true,
      version_name: typeof rec.version_name === 'string' ? rec.version_name : '',
      version_code: typeof rec.version_code === 'number' ? rec.version_code : 0,
      apk_url,
      release_notes: typeof rec.release_notes === 'string' ? rec.release_notes : '',
      is_force_update: rec.is_force_update === true,
    },
  };
}
