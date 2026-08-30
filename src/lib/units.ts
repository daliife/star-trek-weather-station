import type { Lang, Units } from './types';

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

export function formatAge(observedAt: string, labels: { now: string; min: string; hour: string; day: string }, now = Date.now()): string {
  const age = observationAge(observedAt, now);
  if (!Number.isFinite(age) || age < 0) return '—';
  if (age < 60_000) return labels.now;
  if (age < 3_600_000) return `${Math.floor(age / 60_000)} ${labels.min}`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)} ${labels.hour}`;
  return `${Math.floor(age / 86_400_000)} ${labels.day}`;
}

export function formatClock(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(clockLocale(lang), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function clockLocale(lang: Lang): string {
  if (lang === 'ca') return 'ca-ES';
  if (lang === 'es') return 'es-ES';
  return 'en-GB';
}
