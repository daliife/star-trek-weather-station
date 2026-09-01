import type { WeatherSeries, WeatherSnapshot } from './types';
import { isStale } from './units';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTempRange(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const range = value as { high?: unknown; low?: unknown };
  return isFiniteNumber(range.high) && isFiniteNumber(range.low);
}

function isWeatherSeries(value: unknown): value is WeatherSeries {
  if (!value || typeof value !== 'object') return false;
  const series = value as WeatherSeries;
  if (!Array.isArray(series.hourly) || !Array.isArray(series.daily) || !Array.isArray(series.lastDays)) {
    return false;
  }
  return isTempRange(series.yesterday) && isTempRange(series.week) && isTempRange(series.month);
}

export function parseWeatherSnapshot(value: unknown): WeatherSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as WeatherSnapshot;
  if (raw.source !== 'wunderground-pws' && raw.source !== 'open-meteo') return null;
  if (raw.status !== 'ok' && raw.status !== 'error' && raw.status !== 'offline') return null;
  if (typeof raw.stationId !== 'string' || typeof raw.fetchedAt !== 'string' || typeof raw.observedAt !== 'string') {
    return null;
  }
  if (!isFiniteNumber(raw.precipRate)) return null;
  const location = raw.location;
  if (!location || typeof location.name !== 'string' || typeof location.region !== 'string') return null;
  const metric = raw.metric;
  if (
    !metric ||
    !isFiniteNumber(metric.temp) ||
    !isFiniteNumber(metric.feelsLike) ||
    !isFiniteNumber(metric.humidity) ||
    !isFiniteNumber(metric.windSpeed) ||
    !isFiniteNumber(metric.windGust) ||
    !isFiniteNumber(metric.windDir)
  ) {
    return null;
  }
  if (raw.series && !isWeatherSeries(raw.series)) {
    const { series: _dropped, ...rest } = raw;
    return rest;
  }
  return raw;
}

export function overlayFreshCurrent(cached: WeatherSnapshot, live: WeatherSnapshot): WeatherSnapshot {
  return {
    ...live,
    series: cached.series ?? live.series,
    forecastFetchedAt: cached.forecastFetchedAt,
    historyFetchedAt: cached.historyFetchedAt,
  };
}

export function resolveCurrentSnapshot(
  pages: WeatherSnapshot,
  displayed: WeatherSnapshot | null,
  live: WeatherSnapshot | null,
): WeatherSnapshot {
  if (!isStale(pages.observedAt)) return pages;
  if (displayed && !isStale(displayed.observedAt)) return overlayFreshCurrent(pages, displayed);
  if (live) return overlayFreshCurrent(pages, live);
  return pages;
}
