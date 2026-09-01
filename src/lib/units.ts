import type { Units } from './types';

const STALE_MS = 30 * 60 * 1000;
const CALM_KMH = 0.5;

export function cToF(c: number): number {
  return c * (9 / 5) + 32;
}

export function kmhToMph(kmh: number): number {
  return kmh * 0.621371;
}

export function formatTemp(celsius: number, units: Units): string {
  const value = units === 'imperial' ? cToF(celsius) : celsius;
  return value.toFixed(1);
}

export function tempUnit(units: Units): string {
  return units === 'imperial' ? '°F' : '°C';
}

export function formatWind(kmh: number, units: Units): string {
  const value = units === 'imperial' ? kmhToMph(kmh) : kmh;
  return value.toFixed(1);
}

export function windUnit(units: Units): string {
  return units === 'imperial' ? 'mph' : 'km/h';
}

export function hPaToInHg(hPa: number): number {
  return hPa * 0.02953;
}

export function mmToIn(mm: number): number {
  return mm / 25.4;
}

export function formatPressure(hPa: number, units: Units): string {
  return units === 'imperial' ? hPaToInHg(hPa).toFixed(2) : Math.round(hPa).toString();
}

export function pressureUnit(units: Units): string {
  return units === 'imperial' ? 'inHg' : 'hPa';
}

export function formatPrecip(mm: number, units: Units): string {
  const value = units === 'imperial' ? mmToIn(mm) : mm;
  return units === 'imperial' ? value.toFixed(2) : value.toFixed(1);
}

export function precipUnit(units: Units): string {
  return units === 'imperial' ? 'in' : 'mm';
}

export function precipRateUnit(units: Units): string {
  return units === 'imperial' ? 'in/h' : 'mm/h';
}

export function isCalm(kmh: number): boolean {
  return kmh < CALM_KMH;
}

export function cardinalIndex(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360;
  return Math.round(normalized / 22.5) % 16;
}

export function formatDegrees(degrees: number): string {
  return `${String(Math.round(((degrees % 360) + 360) % 360)).padStart(3, '0')}°`;
}

export function observationAge(observedAt: string, now = Date.now()): number {
  return now - new Date(observedAt).getTime();
}

export function isStale(observedAt: string, now = Date.now()): boolean {
  return observationAge(observedAt, now) > STALE_MS;
}

export function formatAge(
  observedAt: string,
  labels: { now: string; min: string; hour: string; day: string; agoPrefix?: string; agoSuffix?: string },
  now = Date.now(),
): string {
  const age = observationAge(observedAt, now);
  if (!Number.isFinite(age) || age < 0) return '—';
  if (age < 60_000) return labels.now;
  let core: string;
  if (age < 3_600_000) core = `${Math.floor(age / 60_000)} ${labels.min}`;
  else if (age < 86_400_000) core = `${Math.floor(age / 3_600_000)} ${labels.hour}`;
  else core = `${Math.floor(age / 86_400_000)} ${labels.day}`;
  const prefix = labels.agoPrefix?.trim();
  const suffix = labels.agoSuffix?.trim();
  if (prefix) return `${prefix} ${core}`;
  if (suffix) return `${core} ${suffix}`;
  return core;
}

export function formatClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const total = Math.min(Math.floor(ms / 1000), 99 * 60 + 59);
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function formatStardate(date: Date): string {
  const year = date.getFullYear();
  const elapsed = date.getTime() - new Date(year, 0, 1).getTime();
  const dayFraction = elapsed / 86_400_000;
  return ((year % 100) * 1000 + (dayFraction / 365.25) * 1000).toFixed(1);
}
