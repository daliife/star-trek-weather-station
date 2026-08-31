import { describe, expect, it } from 'vitest';
import { parseWeatherSnapshot } from './snapshot';

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
