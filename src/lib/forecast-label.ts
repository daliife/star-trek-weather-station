import type { Dictionary } from './i18n';

const STATION_TZ = 'Europe/Madrid';

export function stationDateStamp(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STATION_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function addIsoDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function weekdayFromDate(isoDate: string, weekdays: string[]): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return '—';
  return weekdays[new Date(year, month - 1, day).getDay()] ?? '—';
}

export function forecastHourLabel(hour: string, dict: Dictionary, today = stationDateStamp()): string {
  if (/^\d{2}:\d{2}$/.test(hour)) return hour;
  const match = /^([DN]):(\d{4}-\d{2}-\d{2})$/.exec(hour);
  if (!match) return hour || '—';
  const [, mode, date] = match;
  const tomorrow = addIsoDays(today, 1);
  if (date === today) return mode === 'N' ? dict.tonight : dict.today;
  if (date === tomorrow && mode === 'D') return dict.tomorrow;
  const weekday = weekdayFromDate(date, dict.weekdaysLong);
  return mode === 'N' ? `${weekday} ${dict.tonight}` : weekday;
}
