import { describe, expect, it } from 'vitest';
import { dictionaries } from './i18n';
import { forecastHourLabel } from './forecast-label';

const dict = dictionaries.en;

describe('forecastHourLabel', () => {
  it('keeps clock hours from Open-Meteo', () => {
    expect(forecastHourLabel('19:00', dict, '2026-08-30')).toBe('19:00');
  });

  it('maps WU day/night parts relative to station today', () => {
    expect(forecastHourLabel('D:2026-08-30', dict, '2026-08-30')).toBe('Today');
    expect(forecastHourLabel('N:2026-08-30', dict, '2026-08-30')).toBe('Tonight');
    expect(forecastHourLabel('D:2026-08-31', dict, '2026-08-30')).toBe('Tomorrow');
    expect(forecastHourLabel('N:2026-08-31', dict, '2026-08-30')).toBe('Mon Tonight');
    expect(forecastHourLabel('D:2026-09-01', dict, '2026-08-30')).toBe('Tue');
  });
});
