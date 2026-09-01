import { describe, expect, it } from 'vitest';
import { overlayFreshCurrent, parseWeatherSnapshot, resolveCurrentSnapshot } from './snapshot';

const ok = {
  source: 'wunderground-pws',
  stationId: 'ICABAC4',
  location: { name: 'Cabacés', region: 'Tarragona', country: 'ES' },
  fetchedAt: '2026-08-31T12:00:00Z',
  observedAt: '2026-08-31T11:55:00Z',
  status: 'ok',
  precipRate: 0,
  metric: {
    temp: 30,
    feelsLike: 29,
    humidity: 40,
    windSpeed: 4,
    windGust: 6,
    windDir: 180,
  },
};

describe('parseWeatherSnapshot', () => {
  it('accepts a current-only snapshot', () => {
    expect(parseWeatherSnapshot(ok)?.metric.temp).toBe(30);
  });

  it('rejects missing metric fields', () => {
    expect(parseWeatherSnapshot({ ...ok, metric: { temp: 30 } })).toBeNull();
    expect(parseWeatherSnapshot(null)).toBeNull();
    expect(parseWeatherSnapshot({ ...ok, source: 'nws' })).toBeNull();
  });

  it('drops a malformed series instead of rejecting the snapshot', () => {
    const parsed = parseWeatherSnapshot({ ...ok, series: { hourly: [] } });
    expect(parsed?.metric.temp).toBe(30);
    expect(parsed?.series).toBeUndefined();
  });
});

describe('overlayFreshCurrent', () => {
  it('keeps cached series and fetch stamps on a live current reading', () => {
    const cached = parseWeatherSnapshot({
      ...ok,
      series: {
        hourly: [],
        daily: [],
        lastDays: [],
        yesterday: { high: 1, low: 0 },
        week: { high: 2, low: 0 },
        month: { high: 3, low: 0 },
      },
      forecastFetchedAt: '2026-08-31T09:00:00Z',
      historyFetchedAt: '2026-08-31T06:00:00Z',
    });
    const live = parseWeatherSnapshot({
      ...ok,
      source: 'open-meteo',
      fetchedAt: '2026-08-31T13:00:00Z',
      observedAt: '2026-08-31T13:00:00Z',
      metric: { ...ok.metric, temp: 22 },
    });
    expect(cached && live).toBeTruthy();
    const merged = overlayFreshCurrent(cached!, live!);
    expect(merged.source).toBe('open-meteo');
    expect(merged.metric.temp).toBe(22);
    expect(merged.series?.week.high).toBe(2);
    expect(merged.forecastFetchedAt).toBe('2026-08-31T09:00:00Z');
    expect(merged.historyFetchedAt).toBe('2026-08-31T06:00:00Z');
  });
});

describe('resolveCurrentSnapshot', () => {
  const nowIso = new Date().toISOString();

  it('prefers a fresh Pages snapshot over a live overlay', () => {
    const pages = parseWeatherSnapshot({ ...ok, observedAt: nowIso, fetchedAt: nowIso, metric: { ...ok.metric, temp: 31 } });
    const displayed = parseWeatherSnapshot({ ...ok, source: 'open-meteo', observedAt: nowIso, metric: { ...ok.metric, temp: 22 } });
    expect(resolveCurrentSnapshot(pages!, displayed, null).metric.temp).toBe(31);
  });

  it('keeps a still-fresh live overlay when Pages is stale', () => {
    const pages = parseWeatherSnapshot(ok);
    const displayed = parseWeatherSnapshot({
      ...ok,
      source: 'open-meteo',
      observedAt: nowIso,
      fetchedAt: nowIso,
      metric: { ...ok.metric, temp: 22 },
    });
    expect(resolveCurrentSnapshot(pages!, displayed, null).metric.temp).toBe(22);
  });

  it('applies a new live reading when both Pages and the overlay are stale', () => {
    const pages = parseWeatherSnapshot(ok);
    const live = parseWeatherSnapshot({
      ...ok,
      source: 'open-meteo',
      observedAt: nowIso,
      fetchedAt: nowIso,
      metric: { ...ok.metric, temp: 18 },
    });
    expect(resolveCurrentSnapshot(pages!, pages, live).metric.temp).toBe(18);
  });
});
