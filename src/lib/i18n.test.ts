import { describe, expect, it } from 'vitest';
import station from '../config/station.json';
import { dictionaries, detectLang, isLang, langs } from './i18n';

describe('i18n', () => {
  it('accepts the three console languages', () => {
    expect(langs).toEqual(['ca', 'es', 'en']);
    expect(isLang('en')).toBe(true);
    expect(isLang('ca')).toBe(true);
    expect(isLang('es')).toBe(true);
    expect(isLang('fr')).toBe(false);
    expect(isLang(null)).toBe(false);
  });

  it('detects ca/es from the browser when nothing is stored', () => {
    expect(detectLang(null, 'ca-ES')).toBe('ca');
    expect(detectLang(null, 'es')).toBe('es');
    expect(detectLang(null, 'fr-FR')).toBe('en');
    expect(detectLang('es', 'ca-ES')).toBe('es');
  });

  it('keeps the same copy keys in every dictionary', () => {
    const keys = Object.keys(dictionaries.en).sort();
    expect(Object.keys(dictionaries.ca).sort()).toEqual(keys);
    expect(Object.keys(dictionaries.es).sort()).toEqual(keys);
    expect(dictionaries.en.noData).toBe('No data');
    expect(dictionaries.ca.noData).toBe('Sense dades');
    expect(dictionaries.es.noData).toBe('Sin datos');
  });
});

describe('station config', () => {
  it('pins a named PWS with coordinates', () => {
    expect(station.stationId).toBe('ICABAC4');
    expect(station.name).toBe('Cabacés');
    expect(Number.isFinite(station.lat)).toBe(true);
    expect(Number.isFinite(station.lon)).toBe(true);
  });
});
