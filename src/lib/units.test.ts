import { describe, expect, it } from 'vitest';
import {
  cToF,
  cardinalIndex,
  formatAge,
  formatClock,
  formatCountdown,
  formatDegrees,
  formatStardate,
  freshnessRemaining,
  formatPrecip,
  formatPressure,
  formatTemp,
  formatWind,
  isCalm,
  isStale,
  kmhToMph,
  observationAge,
  precipUnit,
  pressureUnit,
  tempUnit,
  windUnit,
} from './units';

const ageLabels = { now: 'now', min: 'min', hour: 'h', day: 'd' };

describe('unit converters', () => {
  it('keeps metric temperatures and converts imperial', () => {
    expect(formatTemp(21.4, 'metric')).toBe('21.4');
    expect(formatTemp(21.4, 'imperial')).toBe(cToF(21.4).toFixed(1));
    expect(tempUnit('metric')).toBe('°C');
    expect(tempUnit('imperial')).toBe('°F');
  });

  it('formats wind, pressure, and rain for both unit systems', () => {
    expect(formatWind(10, 'metric')).toBe('10.0');
    expect(formatWind(10, 'imperial')).toBe(kmhToMph(10).toFixed(1));
    expect(windUnit('imperial')).toBe('mph');
    expect(formatPressure(1013.25, 'metric')).toBe('1013');
    expect(formatPressure(1013.25, 'imperial')).toBe('29.92');
    expect(pressureUnit('imperial')).toBe('inHg');
    expect(formatPrecip(2.4, 'metric')).toBe('2.4');
    expect(formatPrecip(25.4, 'imperial')).toBe('1.00');
    expect(precipUnit('metric')).toBe('mm');
  });

  it('treats sub-threshold wind as calm and wraps compass points', () => {
    expect(isCalm(0.4)).toBe(true);
    expect(isCalm(0.5)).toBe(false);
    expect(cardinalIndex(0)).toBe(0);
    expect(cardinalIndex(360)).toBe(0);
    expect(cardinalIndex(-22.5)).toBe(15);
    expect(formatDegrees(7)).toBe('007°');
    expect(formatDegrees(370)).toBe('010°');
  });
});

describe('observation age', () => {
  const now = Date.parse('2026-08-30T21:00:00Z');

  it('marks snapshots older than 30 minutes as stale', () => {
    expect(isStale('2026-08-30T20:29:00Z', now)).toBe(true);
    expect(isStale('2026-08-30T20:31:00Z', now)).toBe(false);
    expect(observationAge('2026-08-30T20:00:00Z', now)).toBe(3_600_000);
  });

  it('formats relative age with optional prefix or suffix', () => {
    expect(formatAge('2026-08-30T20:59:30Z', ageLabels, now)).toBe('now');
    expect(formatAge('2026-08-30T20:45:00Z', ageLabels, now)).toBe('15 min');
    expect(formatAge('2026-08-30T18:00:00Z', ageLabels, now)).toBe('3 h');
    expect(formatAge('2026-08-28T21:00:00Z', ageLabels, now)).toBe('2 d');
    expect(formatAge('2026-08-30T20:45:00Z', { ...ageLabels, agoPrefix: 'fa' }, now)).toBe('fa 15 min');
    expect(formatAge('2026-08-30T20:45:00Z', { ...ageLabels, agoSuffix: 'ago' }, now)).toBe('15 min ago');
    expect(formatAge('not-a-date', ageLabels, now)).toBe('—');
  });

  it('pads the console clock to HH:MM:SS', () => {
    expect(formatClock(new Date(2026, 7, 30, 9, 5, 7))).toBe('09:05:07');
  });

  it('pads a countdown as MM:SS and clamps empty values', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-12)).toBe('00:00');
    expect(formatCountdown(1500)).toBe('00:01');
    expect(formatCountdown(61_000)).toBe('01:01');
    expect(formatCountdown(10 * 60 * 1000)).toBe('10:00');
  });

  it('counts remaining freshness against the 30 minute stale window', () => {
    expect(freshnessRemaining('2026-08-30T20:40:00Z', now)).toBe(10 * 60 * 1000);
    expect(freshnessRemaining('2026-08-30T20:29:00Z', now)).toBeLessThan(0);
  });

  it('renders a TNG-style stardate from local time', () => {
    expect(formatStardate(new Date(2026, 0, 1, 0, 0, 0))).toBe('26000.0');
    const later = formatStardate(new Date(2026, 8, 1, 12, 0, 0));
    expect(later).toMatch(/^\d{5}\.\d$/);
    expect(Number(later)).toBeGreaterThan(26000);
  });
});
