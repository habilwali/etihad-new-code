import {useCallback, useEffect, useState} from 'react';
import {formatHeaderDate, formatHeaderTime} from '../utils/dateTime';
import {fetchOpenMeteoCurrent} from '../services/openMeteoWeather';

const TICK_MS = 60_000;
/** Refresh Open-Meteo current weather periodically (hotel lobby TVs). */
const WEATHER_REFRESH_MS = 15 * 60_000;

const FALLBACK_TEMP = 23;
const FALLBACK_CONDITION = 'Sunny';

export interface AppHeaderClockOptions {
  /**
   * When set, replaces live Open-Meteo temperature in the header.
   * Omit to use [Open-Meteo](https://api.open-meteo.com) for Abu Dhabi default coords.
   */
  temperature?: number;
  /**
   * When set, replaces live Open-Meteo condition label.
   */
  weatherCondition?: string;
}

/**
 * Live date/time (minute refresh) + Open-Meteo weather for AppHeader.
 * Weather: fetches on mount and every 15 minutes; falls back on error.
 */
export function useAppHeaderClock(
  opts: AppHeaderClockOptions = {},
): {
  date: string;
  time: string;
  temperature: number;
  weatherCondition: string;
} {
  const temperatureOverride = opts.temperature;
  const weatherOverride = opts.weatherCondition;

  const [date, setDate] = useState(() => formatHeaderDate(new Date()));
  const [time, setTime] = useState(() => formatHeaderTime(new Date()));

  const [liveTemp, setLiveTemp] = useState(FALLBACK_TEMP);
  const [liveWeather, setLiveWeather] = useState(FALLBACK_CONDITION);

  const refreshWeather = useCallback(async () => {
    const r = await fetchOpenMeteoCurrent();
    if (r) {
      setLiveTemp(Math.round(r.temperature));
      setLiveWeather(r.weatherCondition);
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setDate(formatHeaderDate(n));
      setTime(formatHeaderTime(n));
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void refreshWeather();
    const wid = setInterval(() => {
      void refreshWeather();
    }, WEATHER_REFRESH_MS);
    return () => clearInterval(wid);
  }, [refreshWeather]);

  const temperature =
    typeof temperatureOverride === 'number' ? temperatureOverride : liveTemp;
  const weatherCondition =
    typeof weatherOverride === 'string' && weatherOverride.trim() !== ''
      ? weatherOverride
      : liveWeather;

  return {date, time, temperature, weatherCondition};
}
