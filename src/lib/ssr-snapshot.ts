import rawSnapshot from '../../public/data/current.json';
import station from '../config/station.json';
import { forecastHourLabel } from './forecast-label';
import { dictionaries, type Dictionary } from './i18n';
import { parseWeatherSnapshot } from './snapshot';
import type { WeatherSeries, WeatherSnapshot } from './types';
import {
  cardinalIndex,
  formatAge,
  formatDegrees,
  formatPrecip,
  formatPressure,
  formatTemp,
  formatWind,
  isCalm,
  isStale,
  precipRateUnit,
  precipUnit,
  pressureUnit,
  tempUnit,
  windUnit,
} from './units';

const units = 'metric' as const;
const dict: Dictionary = dictionaries.en;
const dash = dict.noData;

function weekdayFromDate(isoDate: string, weekdays: string[]): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return '—';
  return weekdays[new Date(year, month - 1, day).getDay()] ?? '—';
}

function dayNumber(isoDate: string): string {
  const day = Number(isoDate.split('-')[2]);
  return Number.isFinite(day) ? String(day) : '';
}

function forecastDayLabel(isoDate: string, index: number): string {
  const num = dayNumber(isoDate);
  if (index === 0) return num ? `${dict.today} ${num}` : dict.today;
  if (index === 1) return num ? `${dict.tomorrow} ${num}` : dict.tomorrow;
  const name = weekdayFromDate(isoDate, dict.weekdaysLong);
  return num ? `${name} ${num}` : name;
}

function historyDayParts(isoDate: string, today: string): { name: string; day: string } {
  const offset = Math.round((Date.parse(`${today}T00:00:00`) - Date.parse(`${isoDate}T00:00:00`)) / 86400000);
  const day = dayNumber(isoDate);
  if (offset === 0) return { name: dict.today, day };
  if (offset === 1) return { name: dict.yesterday, day };
  return { name: weekdayFromDate(isoDate, dict.weekdaysLong), day };
}

function seriesHeight(temp: number, temps: number[]): string {
  const min = Math.min(...temps) - 2;
  const max = Math.max(...temps) + 1;
  const pct = ((temp - min) / (max - min)) * 68 + 26;
  return `${Math.round(pct)}%`;
}

function formatRainAmount(mm: number | undefined): string {
  if (typeof mm !== 'number' || !Number.isFinite(mm)) return dash;
  return `${formatPrecip(mm, units)} ${precipUnit(units)}`;
}

function formatRainPair(mm: number | undefined, chance: number | undefined): string {
  const hasRain = typeof mm === 'number' && Number.isFinite(mm);
  const hasChance = typeof chance === 'number' && Number.isFinite(chance);
  const amount = hasRain ? `${formatPrecip(mm, units)} ${precipUnit(units)}` : '';
  const showChance = hasChance && ((chance ?? 0) > 0 || !hasRain);
  const pct = showChance ? `${Math.round(chance as number)}%` : '';
  return [amount, pct].filter(Boolean).join(' · ');
}

function emptySeries() {
  return {
    hourly: Array.from({ length: 6 }, () => ({ t: '—', v: dash, r: '' })),
    daily: Array.from({ length: 5 }, (_, index) => ({
      k: index === 0 ? dict.today : index === 1 ? dict.tomorrow : `+${index}`,
      h: dash,
      l: dash,
      r: dash,
    })),
    hyh: dash,
    hyl: dash,
    hyr: dash,
    hwh: dash,
    hwl: dash,
    hwr: dash,
    hmh: dash,
    hml: dash,
    hmr: dash,
    lastDays: Array.from({ length: 7 }, () => ({ v: dash, k: '—', n: '', h: '26%' })),
  };
}

function seriesBinds(series: WeatherSeries) {
  const unit = tempUnit(units);
  const hourly = Array.from({ length: 6 }, (_, index) => {
    const point = series.hourly[index];
    if (!point) return { t: '—', v: dash, r: '' };
    return {
      t: forecastHourLabel(point.hour, dict),
      v: `${formatTemp(point.temp, units)}${unit}`,
      r: formatRainPair(point.rain, point.chance),
    };
  });
  const daily = Array.from({ length: 5 }, (_, index) => {
    const day = series.daily[index];
    if (!day) return { k: '—', h: dash, l: dash, r: dash };
    return {
      k: forecastDayLabel(day.date, index),
      h: `${formatTemp(day.high, units)}${unit}`,
      l: `${formatTemp(day.low, units)}${unit}`,
      r: formatRainPair(day.rain, day.chance) || dash,
    };
  });
  const today = series.lastDays[series.lastDays.length - 1]?.date ?? '';
  const temps = series.lastDays.map((point) => point.temp);
  const lastDays = Array.from({ length: 7 }, (_, index) => {
    const point = series.lastDays[index];
    if (!point) return { v: dash, k: '—', n: '', h: '26%' };
    const label = historyDayParts(point.date, today);
    return {
      v: `${formatTemp(point.temp, units)}${unit}`,
      k: label.name,
      n: label.day,
      h: seriesHeight(point.temp, temps),
    };
  });
  return {
    hourly,
    daily,
    hyh: `${formatTemp(series.yesterday.high, units)}${unit}`,
    hyl: `${formatTemp(series.yesterday.low, units)}${unit}`,
    hyr: formatRainAmount(series.yesterday.rain),
    hwh: `${formatTemp(series.week.high, units)}${unit}`,
    hwl: `${formatTemp(series.week.low, units)}${unit}`,
    hwr: formatRainAmount(series.week.rain),
    hmh: `${formatTemp(series.month.high, units)}${unit}`,
    hml: `${formatTemp(series.month.low, units)}${unit}`,
    hmr: formatRainAmount(series.month.rain),
    lastDays,
  };
}

function buildInitial(snapshot: WeatherSnapshot | null) {
  const series = snapshot?.series ? seriesBinds(snapshot.series) : emptySeries();
  if (!snapshot || snapshot.status !== 'ok') {
    return {
      temp: dash,
      tempUnit: '',
      feels: dash,
      wind: dash,
      windUnit: '',
      humidity: dash,
      gust: dash,
      direction: dash,
      cardinal: '',
      pressure: dash,
      precipRate: dash,
      precipToday: dash,
      sunrise: dash,
      sunset: dash,
      observed: dash,
      source: dict.noData,
      stationKey: dict.station,
      stationId: dash,
      location: dash,
      region: dash,
      opsStatus: dict.offlineStatus,
      linkStatus: dict.noData,
      state: 'ready',
      ...series,
    };
  }
  const { metric } = snapshot;
  const stale = isStale(snapshot.observedAt);
  const precip = snapshot.precipRate > 0;
  return {
    temp: formatTemp(metric.temp, units),
    tempUnit: tempUnit(units),
    feels: `${formatTemp(metric.feelsLike, units)}${tempUnit(units)}`,
    wind: isCalm(metric.windSpeed) ? dict.calm : formatWind(metric.windSpeed, units),
    windUnit: isCalm(metric.windSpeed) ? '' : windUnit(units),
    humidity: `${Math.round(metric.humidity)}%`,
    gust: `${formatWind(metric.windGust, units)} ${windUnit(units)}`,
    direction: isCalm(metric.windSpeed) ? dict.calm : formatDegrees(metric.windDir),
    cardinal: isCalm(metric.windSpeed) ? '' : (dict.cardinals[cardinalIndex(metric.windDir)] ?? dash),
    pressure:
      typeof metric.pressure === 'number' ? `${formatPressure(metric.pressure, units)} ${pressureUnit(units)}` : dash,
    precipRate: `${formatPrecip(snapshot.precipRate, units)} ${precipRateUnit(units)}`,
    precipToday:
      typeof metric.precipTotal === 'number' ? `${formatPrecip(metric.precipTotal, units)} ${precipUnit(units)}` : dash,
    sunrise: snapshot.sun?.rise ?? dash,
    sunset: snapshot.sun?.set ?? dash,
    observed: formatAge(snapshot.observedAt, dict),
    source: snapshot.source === 'open-meteo' ? 'Open-Meteo' : 'WunderGround',
    stationKey: snapshot.source === 'wunderground-pws' ? dict.station : dict.site,
    stationId:
      snapshot.source === 'wunderground-pws'
        ? snapshot.stationId
        : `${Math.abs(station.lat).toFixed(2)}${station.lat >= 0 ? 'N' : 'S'} ${Math.abs(station.lon).toFixed(2)}${station.lon >= 0 ? 'E' : 'W'}`,
    location: snapshot.location.name,
    region: snapshot.location.region,
    opsStatus: stale ? dict.dataExpired : precip ? dict.precip : dict.nominal,
    linkStatus: stale ? dict.stale : dict.online,
    state: stale ? 'stale' : 'ready',
    ...series,
  };
}

export const initial = buildInitial(parseWeatherSnapshot(rawSnapshot));
