/**
 * Open-Meteo — free weather API (no API key).
 * Default location: Abu Dhabi area (Etihad Plaza).
 *
 * @see https://open-meteo.com/en/docs
 */

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

/** Default: coordinates from product (Abu Dhabi / Yas / Etihad area). */
export const OPEN_METEO_DEFAULT_LAT = 24.4539;
export const OPEN_METEO_DEFAULT_LON = 54.3773;

const FETCH_TIMEOUT_MS = 12_000;

export interface OpenMeteoCurrent {
  temperature: number;
  /** Short label for AppHeader, e.g. "Partly cloudy" */
  weatherCondition: string;
}

/** WMO Weather interpretation codes (Open-Meteo current_weather.weathercode). */
function wmoCodeToLabel(code: number): string {
  if (code === 0) {return 'Clear';}
  if (code === 1) {return 'Mainly clear';}
  if (code === 2) {return 'Partly cloudy';}
  if (code === 3) {return 'Overcast';}
  if (code === 45 || code === 48) {return 'Fog';}
  if (code >= 51 && code <= 55) {return 'Drizzle';}
  if (code >= 56 && code <= 57) {return 'Freezing drizzle';}
  if (code >= 61 && code <= 65) {return 'Rain';}
  if (code >= 66 && code <= 67) {return 'Freezing rain';}
  if (code >= 71 && code <= 77) {return 'Snow';}
  if (code >= 80 && code <= 82) {return 'Rain showers';}
  if (code >= 85 && code <= 86) {return 'Snow showers';}
  if (code >= 95 && code <= 99) {return 'Thunderstorm';}
  return 'Weather';
}

export function buildOpenMeteoForecastUrl(
  latitude: number = OPEN_METEO_DEFAULT_LAT,
  longitude: number = OPEN_METEO_DEFAULT_LON,
): string {
  const p = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current_weather: 'true',
  });
  return `${OPEN_METEO_BASE}?${p.toString()}`;
}

/**
 * Fetches current temperature (°C) and a human-readable condition from Open-Meteo.
 * Returns null on network/parse failure (caller keeps previous or fallback values).
 */
export async function fetchOpenMeteoCurrent(
  latitude: number = OPEN_METEO_DEFAULT_LAT,
  longitude: number = OPEN_METEO_DEFAULT_LON,
): Promise<OpenMeteoCurrent | null> {
  const url = buildOpenMeteoForecastUrl(latitude, longitude);
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {method: 'GET', signal: controller.signal});
    clearTimeout(tid);
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as {
      current_weather?: {
        temperature?: number;
        weathercode?: number;
      };
    };
    const cw = body.current_weather;
    if (!cw || typeof cw.temperature !== 'number') {
      return null;
    }
    const code = typeof cw.weathercode === 'number' ? cw.weathercode : 0;
    return {
      temperature: Math.round(cw.temperature * 10) / 10,
      weatherCondition: wmoCodeToLabel(code),
    };
  } catch {
    clearTimeout(tid);
    return null;
  }
}
