import { describe, expect, it } from 'vitest';
import {
  dateFromLocal,
  finite,
  hourFromLocal,
  hourLabel,
  hoursFromDaypart,
  rangeOf,
  stampMs,
  sunPair,
} from './weather-series.mjs';

describe('WU timestamp helpers', () => {
  it('reads local date and hour from WU validTimeLocal', () => {
    expect(dateFromLocal('2025-08-31T19:00:00+0200')).toBe('2025-08-31');
    expect(hourFromLocal('2025-08-31T19:00:00+0200')).toBe('19:00');
    expect(hourFromLocal('')).toBe('');
  });

  it('parses offset stamps without a colon and UTC epoch seconds', () => {
    const local = stampMs('2025-08-31T19:00:00+0200');
    const utc = stampMs(1_756_659_600);
    expect(Number.isFinite(local)).toBe(true);
    expect(utc).toBe(1_756_659_600_000);
    expect(local).toBe(utc);
  });

  it('labels hours from local strings or UTC epochs in Europe/Madrid', () => {
    expect(hourLabel('2025-08-31T19:00:00+0200')).toBe('19:00');
    expect(hourLabel(1_756_659_600)).toBe('19:00');
    expect(hourLabel('')).toBe('');
  });
});

describe('series helpers', () => {
  it('keeps finite numbers and drops junk', () => {
    expect(finite(12.4)).toBe(12.4);
    expect(finite('8')).toBe(8);
    expect(finite('nope')).toBeNull();
  });

  it('builds high/low/rain ranges from slices', () => {
    expect(rangeOf([20, 22, 18], [10, 11, 9], [0, 1.2, 0], 0, 2)).toEqual({
      high: 22,
      low: 9,
      rain: 1.2,
    });
    expect(rangeOf([null, null], [10, 11], [], 0, 1)).toBeNull();
  });

  it('pairs sunrise and sunset only when both hours exist', () => {
    expect(sunPair('2025-08-31T07:12:00+0200', '2025-08-31T20:41:00+0200')).toEqual({
      rise: '07:12',
      set: '20:41',
    });
    expect(sunPair('', '2025-08-31T20:41:00+0200')).toBeUndefined();
  });

  it('fills hourly slots from 5-day day/night parts, skipping elapsed nulls', () => {
    const dates = [
      '2026-08-30T07:00:00+0200',
      '2026-08-31T07:00:00+0200',
      '2026-09-01T07:00:00+0200',
      '2026-09-02T07:00:00+0200',
      '2026-09-03T07:00:00+0200',
    ];
    const points = hoursFromDaypart(
      {
        temperature: [null, 19, 31, 17, 28, 16],
        dayOrNight: [null, 'N', 'D', 'N', 'D', 'N'],
        qpf: [null, 0, 0.2, 0, 0, 1],
        precipChance: [null, 8, 20, 10, 5, 40],
      },
      dates,
    );
    expect(points).toEqual([
      { hour: 'N:2026-08-30', temp: 19, rain: 0, chance: 8 },
      { hour: 'D:2026-08-31', temp: 31, rain: 0.2, chance: 20 },
      { hour: 'N:2026-08-31', temp: 17, rain: 0, chance: 10 },
      { hour: 'D:2026-09-01', temp: 28, rain: 0, chance: 5 },
      { hour: 'N:2026-09-01', temp: 16, rain: 1, chance: 40 },
    ]);
  });
});
