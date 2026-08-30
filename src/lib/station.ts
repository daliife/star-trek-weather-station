import defaultStation from '../config/station.json';
import type { StationConfig, TempRange, WeatherSeries, WeatherSnapshot } from './types';

const SERIES_HOURS = 6;
const SERIES_DAYS = 5;
const SERIES_BARS = 7;
const SERIES_PAST_DAYS = 31;
const SERIES_FORECAST_DAYS = 5;

export const DEFAULT_STATION: StationConfig = defaultStation;

export function applyDocumentTitle(name: string): void {
  document.title = `Star Trek Weather Station · ${name}`;
}

export async function fetchOpenMeteoSnapshot(station: StationConfig): Promise<WeatherSnapshot> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(station.lat));
  url.searchParams.set('longitude', String(station.lon));
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,surface_pressure',
  );
  url.searchParams.set('daily', 'precipitation_sum');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', 'auto');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
  const body = (await response.json()) as {
    current?: Record<string, number | string>;
    daily?: { precipitation_sum?: Array<number | null> };
  };
  const current = body.current;
  if (!current) throw new Error('Open-Meteo response had no current block.');
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const num = (key: string) => {
    const value = Number(current[key]);
    if (!Number.isFinite(value)) throw new Error(`Open-Meteo missing ${key}`);
    return value;
  };
  const todayRain = Number(body.daily?.precipitation_sum?.[0]);
  const pressure = Number(current.surface_pressure);
  return {
    source: 'open-meteo',
    stationId: station.stationId,
    location: { name: station.name, region: station.region, country: station.country },
    fetchedAt: now,
    observedAt: now,
    status: 'ok',
    precipRate: Number.isFinite(Number(current.precipitation)) ? Number(current.precipitation) : 0,
    metric: {
      temp: num('temperature_2m'),
      feelsLike: num('apparent_temperature'),
      humidity: num('relative_humidity_2m'),
      windSpeed: num('wind_speed_10m'),
      windGust: num('wind_gusts_10m'),
      windDir: num('wind_direction_10m'),
      ...(Number.isFinite(pressure) ? { pressure } : {}),
      ...(Number.isFinite(todayRain) ? { precipTotal: todayRain } : {}),
    },
  };
}

type OpenMeteoSeriesBody = {
  timezone?: string;
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    precipitation?: Array<number | null>;
    precipitation_probability?: Array<number | null>;
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    temperature_2m_mean?: Array<number | null>;
    precipitation_sum?: Array<number | null>;
    precipitation_probability_max?: Array<number | null>;
  };
};

function requireFinite(value: number | null | undefined, label: string): number {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error(`Open-Meteo series missing ${label}`);
  return num;
}

function hourLabel(isoLocal: string): string {
  const match = /T(\d{2})/.exec(isoLocal);
  return match ? `${match[1]}:00` : isoLocal;
}

function localDateStamp(timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function rangeOf(highs: number[], lows: number[], rains: Array<number | null>, from: number, to: number): TempRange {
  const sliceHigh = highs.slice(from, to + 1);
  const sliceLow = lows.slice(from, to + 1);
  if (!sliceHigh.length || !sliceLow.length) throw new Error('Open-Meteo series range is empty.');
  const sliceRain = rains.slice(from, to + 1).filter((value): value is number => value !== null);
  return {
    high: Math.max(...sliceHigh),
    low: Math.min(...sliceLow),
    ...(sliceRain.length ? { rain: sliceRain.reduce((sum, value) => sum + value, 0) } : {}),
  };
}

function optionalFinite(value: number | null | undefined): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

export async function fetchOpenMeteoSeries(station: StationConfig): Promise<WeatherSeries> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(station.lat));
  url.searchParams.set('longitude', String(station.lon));
  url.searchParams.set('hourly', 'temperature_2m,precipitation,precipitation_probability');
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_probability_max',
  );
  url.searchParams.set('forecast_days', String(SERIES_FORECAST_DAYS));
  url.searchParams.set('past_days', String(SERIES_PAST_DAYS));
  url.searchParams.set('timezone', 'auto');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Open-Meteo series HTTP ${response.status}`);
  const body = (await response.json()) as OpenMeteoSeriesBody;

  const hours = body.hourly?.time ?? [];
  const hourTemps = body.hourly?.temperature_2m ?? [];
  const hourRain = body.hourly?.precipitation ?? [];
  const hourChance = body.hourly?.precipitation_probability ?? [];
  const dates = body.daily?.time ?? [];
  const highs = (body.daily?.temperature_2m_max ?? []).map((value, index) => requireFinite(value, `daily max ${index}`));
  const lows = (body.daily?.temperature_2m_min ?? []).map((value, index) => requireFinite(value, `daily min ${index}`));
  const means = (body.daily?.temperature_2m_mean ?? []).map((value, index) => requireFinite(value, `daily mean ${index}`));
  const dailyRain = (body.daily?.precipitation_sum ?? []).map((value) => optionalFinite(value) ?? null);
  const dailyChance = body.daily?.precipitation_probability_max ?? [];

  const now = Date.now();
  const hourly = [];
  for (let index = 0; index < hours.length && hourly.length < SERIES_HOURS; index += 1) {
    const stamp = hours[index];
    const temp = hourTemps[index];
    if (!stamp || new Date(stamp).getTime() <= now) continue;
    const rain = optionalFinite(hourRain[index]);
    const chance = optionalFinite(hourChance[index]);
    hourly.push({
      hour: hourLabel(stamp),
      temp: requireFinite(temp, `hourly ${stamp}`),
      ...(rain !== undefined ? { rain } : {}),
      ...(chance !== undefined ? { chance } : {}),
    });
  }
  if (hourly.length < SERIES_HOURS) throw new Error('Open-Meteo series had too few upcoming hours.');

  const today = localDateStamp(body.timezone);
  const todayIndex = dates.indexOf(today);
  if (todayIndex < SERIES_BARS - 1 || todayIndex + SERIES_DAYS > dates.length) {
    throw new Error('Open-Meteo series did not include today and the next days.');
  }

  const daily = dates.slice(todayIndex, todayIndex + SERIES_DAYS).map((date, index) => {
    const rain = optionalFinite(dailyRain[todayIndex + index]);
    const chance = optionalFinite(dailyChance[todayIndex + index]);
    return {
      date,
      high: highs[todayIndex + index] ?? requireFinite(undefined, `forecast max ${date}`),
      low: lows[todayIndex + index] ?? requireFinite(undefined, `forecast min ${date}`),
      ...(rain !== undefined ? { rain } : {}),
      ...(chance !== undefined ? { chance } : {}),
    };
  });

  const yesterdayIndex = todayIndex - 1;
  const weekFrom = todayIndex - 7;
  const monthFrom = todayIndex - 30;
  if (yesterdayIndex < 0 || weekFrom < 0 || monthFrom < 0) {
    throw new Error('Open-Meteo series did not include enough history.');
  }

  const lastDays = dates.slice(todayIndex - (SERIES_BARS - 1), todayIndex + 1).map((date, index) => {
    const dayIndex = todayIndex - (SERIES_BARS - 1) + index;
    return { date, temp: means[dayIndex] ?? requireFinite(undefined, `series ${date}`) };
  });

  return {
    hourly,
    daily,
    yesterday: {
      high: highs[yesterdayIndex] as number,
      low: lows[yesterdayIndex] as number,
      ...(optionalFinite(dailyRain[yesterdayIndex]) !== undefined
        ? { rain: optionalFinite(dailyRain[yesterdayIndex]) }
        : {}),
    },
    week: rangeOf(highs, lows, dailyRain, weekFrom, yesterdayIndex),
    month: rangeOf(highs, lows, dailyRain, monthFrom, yesterdayIndex),
    lastDays,
  };
}
