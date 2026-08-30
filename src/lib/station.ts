import defaultStation from '../config/station.json';
import type { StationConfig, WeatherSnapshot } from './types';

export const STATION_KEY = 'lcars.station';
export const DEFAULT_STATION: StationConfig = defaultStation;

export function normalizeStationId(value: string): string {
  return value.trim().toUpperCase();
}

export function sameStationId(left: string, right: string): boolean {
  return normalizeStationId(left) === normalizeStationId(right);
}

export function parseStation(value: unknown): StationConfig | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<StationConfig>;
  const stationId = typeof raw.stationId === 'string' ? normalizeStationId(raw.stationId) : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const region = typeof raw.region === 'string' ? raw.region.trim() : '';
  const country = typeof raw.country === 'string' ? raw.country.trim() : DEFAULT_STATION.country;
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  if (!stationId || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { stationId, name, region, country, lat, lon };
}

export function loadStation(): StationConfig {
  try {
    return parseStation(JSON.parse(localStorage.getItem(STATION_KEY) ?? '')) ?? DEFAULT_STATION;
  } catch {
    return DEFAULT_STATION;
  }
}

export function saveStation(station: StationConfig): void {
  localStorage.setItem(STATION_KEY, JSON.stringify(station));
}

export function clearStation(): void {
  localStorage.removeItem(STATION_KEY);
}

export function applyDocumentTitle(name: string): void {
  document.title = `Star Trek Weather Station · ${name}`;
}

export async function geocodePlace(name: string, language: string): Promise<{ lat: number; lon: number; region?: string; country?: string } | null> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', name);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', language);
  const response = await fetch(url);
  if (!response.ok) return null;
  const body = (await response.json()) as { results?: Array<{ latitude: number; longitude: number; admin1?: string; country_code?: string }> };
  const hit = body.results?.[0];
  if (!hit) return null;
  return {
    lat: hit.latitude,
    lon: hit.longitude,
    region: hit.admin1,
    country: hit.country_code,
  };
}

export async function fetchOpenMeteoSnapshot(station: StationConfig): Promise<WeatherSnapshot> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(station.lat));
  url.searchParams.set('longitude', String(station.lon));
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation',
  );
  url.searchParams.set('timezone', 'auto');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
  const body = (await response.json()) as { current?: Record<string, number | string> };
  const current = body.current;
  if (!current) throw new Error('Open-Meteo response had no current block.');
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const num = (key: string) => {
    const value = Number(current[key]);
    if (!Number.isFinite(value)) throw new Error(`Open-Meteo missing ${key}`);
    return value;
  };
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
    },
  };
}
