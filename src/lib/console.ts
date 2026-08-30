import { dictionaries, isLang } from './i18n';
import type { Dictionary } from './i18n';
import {
  DEFAULT_STATION,
  applyDocumentTitle,
  fetchOpenMeteoSeries,
  fetchOpenMeteoSnapshot,
} from './station';
import type { ConsoleView, Lang, LinkStatus, OpsStatus, Units, WeatherSeries, WeatherSnapshot } from './types';
import {
  cardinalIndex,
  formatAge,
  formatClock,
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

const LANG_KEY = 'lcars.lang';
const UNITS_KEY = 'lcars.units';
const VIEW_KEY = 'lcars.view';

function weekdayFromDate(isoDate: string, weekdays: string[]): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return '—';
  return weekdays[new Date(year, month - 1, day).getDay()] ?? '—';
}

function dayNumber(isoDate: string): string {
  const day = Number(isoDate.split('-')[2]);
  return Number.isFinite(day) ? String(day) : '';
}

function forecastDayLabel(isoDate: string, index: number, dict: Dictionary): string {
  const num = dayNumber(isoDate);
  if (index === 0) return num ? `${dict.today} ${num}` : dict.today;
  if (index === 1) return num ? `${dict.tomorrow} ${num}` : dict.tomorrow;
  const name = weekdayFromDate(isoDate, dict.weekdaysLong);
  return num ? `${name} ${num}` : name;
}

function historyDayParts(isoDate: string, today: string, dict: Dictionary): { name: string; day: string } {
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

function isUnits(value: string | null): value is Units {
  return value === 'metric' || value === 'imperial';
}

function isView(value: string | null): value is ConsoleView {
  return value === 'station' || value === 'forecast' || value === 'history';
}

function loadLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY);
  return isLang(stored) ? stored : 'en';
}

function loadUnits(): Units {
  const stored = localStorage.getItem(UNITS_KEY);
  return isUnits(stored) ? stored : 'metric';
}

function loadView(): ConsoleView {
  const stored = localStorage.getItem(VIEW_KEY);
  return isView(stored) ? stored : 'station';
}

function bindSeries(
  root: HTMLElement,
  series: WeatherSeries | null,
  units: Units,
  dict: Dictionary,
  note: string,
) {
  bind(root, 'seriesNote', note);
  root.querySelectorAll<HTMLElement>('[data-bind="seriesNote"]').forEach((node) => {
    node.hidden = !note;
  });

  if (!series) {
    for (let index = 0; index < 6; index += 1) {
      bind(root, `fx${index}t`, dash());
      bind(root, `fx${index}`, dash());
      bind(root, `fx${index}r`, '');
    }
    for (let index = 0; index < 5; index += 1) {
      bind(root, `fd${index}h`, dash());
      bind(root, `fd${index}l`, dash());
      bind(root, `fd${index}r`, dash());
      bind(root, `fd${index}k`, dash());
    }
    bind(root, 'hyh', dash());
    bind(root, 'hyl', dash());
    bind(root, 'hyr', dash());
    bind(root, 'hwh', dash());
    bind(root, 'hwl', dash());
    bind(root, 'hwr', dash());
    bind(root, 'hmh', dash());
    bind(root, 'hml', dash());
    bind(root, 'hmr', dash());
    for (let index = 0; index < 7; index += 1) {
      bind(root, `hs${index}`, dash());
      bind(root, `hs${index}k`, dash());
      bind(root, `hs${index}n`, '');
      root.querySelector<HTMLElement>(`[data-bar="${index}"]`)?.style.setProperty('--h', '26%');
    }
    return;
  }

  const unit = tempUnit(units);
  series.hourly.forEach((point, index) => {
    bind(root, `fx${index}t`, point.hour);
    bind(root, `fx${index}`, `${formatTemp(point.temp, units)}${unit}`);
    bind(root, `fx${index}r`, formatRainPair(point.rain, point.chance, units));
  });
  series.daily.forEach((day, index) => {
    bind(root, `fd${index}h`, `${formatTemp(day.high, units)}${unit}`);
    bind(root, `fd${index}l`, `${formatTemp(day.low, units)}${unit}`);
    bind(root, `fd${index}r`, formatRainPair(day.rain, day.chance, units) || dash());
    bind(root, `fd${index}k`, forecastDayLabel(day.date, index, dict));
  });
  bind(root, 'hyh', `${formatTemp(series.yesterday.high, units)}${unit}`);
  bind(root, 'hyl', `${formatTemp(series.yesterday.low, units)}${unit}`);
  bind(root, 'hyr', formatRainAmount(series.yesterday.rain, units));
  bind(root, 'hwh', `${formatTemp(series.week.high, units)}${unit}`);
  bind(root, 'hwl', `${formatTemp(series.week.low, units)}${unit}`);
  bind(root, 'hwr', formatRainAmount(series.week.rain, units));
  bind(root, 'hmh', `${formatTemp(series.month.high, units)}${unit}`);
  bind(root, 'hml', `${formatTemp(series.month.low, units)}${unit}`);
  bind(root, 'hmr', formatRainAmount(series.month.rain, units));
  const today = series.lastDays[series.lastDays.length - 1]?.date ?? '';
  const temps = series.lastDays.map((point) => point.temp);
  series.lastDays.forEach((point, index) => {
    const label = historyDayParts(point.date, today, dict);
    bind(root, `hs${index}`, `${formatTemp(point.temp, units)}${unit}`);
    bind(root, `hs${index}k`, label.name);
    bind(root, `hs${index}n`, label.day);
    root.querySelector<HTMLElement>(`[data-bar="${index}"]`)?.style.setProperty('--h', seriesHeight(point.temp, temps));
  });
}

function setView(root: HTMLElement, view: ConsoleView) {
  root.dataset.view = view;
  root.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== view;
  });
  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((btn) => {
    const active = btn.dataset.view === view;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function snapshotUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}data/current.json`;
}

function bind(root: HTMLElement, name: string, value: string) {
  root.querySelectorAll(`[data-bind="${name}"]`).forEach((node) => {
    node.textContent = value;
  });
}

function applyI18n(root: HTMLElement, dict: Dictionary) {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n as keyof Dictionary;
    const value = dict[key];
    if (typeof value === 'string') node.textContent = value;
  });
}

function sourceLabel(source: WeatherSnapshot['source']): string {
  return source === 'open-meteo' ? 'Open-Meteo' : 'WunderGround';
}

function opsLabel(status: OpsStatus, dict: Dictionary): string {
  if (status === 'precip') return dict.precip;
  if (status === 'expired') return dict.dataExpired;
  if (status === 'offline') return dict.offlineStatus;
  if (status === 'error') return dict.error;
  if (status === 'loading') return dict.loading;
  return dict.nominal;
}

function linkLabel(status: LinkStatus, dict: Dictionary): string {
  if (status === 'stale') return dict.stale;
  if (status === 'nodata') return dict.noData;
  if (status === 'error') return dict.error;
  if (status === 'loading') return dict.loading;
  return dict.online;
}

function deriveStatus(data: WeatherSnapshot | null, error: boolean): { ops: OpsStatus; link: LinkStatus } {
  if (error) return { ops: 'error', link: 'error' };
  if (!data || data.status !== 'ok') return { ops: 'offline', link: 'nodata' };
  if (isStale(data.observedAt)) return { ops: 'expired', link: 'stale' };
  if (data.precipRate > 0) return { ops: 'precip', link: 'online' };
  return { ops: 'nominal', link: 'online' };
}

function dash(): string {
  return '—';
}

function formatSite(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}${ns} ${Math.abs(lon).toFixed(2)}${ew}`;
}

function moduleTitle(view: ConsoleView, dict: Dictionary): string {
  if (view === 'forecast') return dict.forecast;
  if (view === 'history') return dict.history;
  return dict.meteorology;
}

function bindStationIdentity(
  root: HTMLElement,
  dict: Dictionary,
  source: WeatherSnapshot['source'] | null,
  station: { stationId: string; lat: number; lon: number },
  stationId?: string,
) {
  if (source === 'wunderground-pws') {
    bind(root, 'stationKey', dict.station);
    bind(root, 'stationId', stationId || station.stationId);
    return;
  }
  bind(root, 'stationKey', dict.site);
  bind(root, 'stationId', formatSite(station.lat, station.lon));
}

function formatRainAmount(mm: number | undefined, units: Units): string {
  if (typeof mm !== 'number' || !Number.isFinite(mm)) return dash();
  return `${formatPrecip(mm, units)} ${precipUnit(units)}`;
}

function formatRainPair(mm: number | undefined, chance: number | undefined, units: Units): string {
  const hasRain = typeof mm === 'number' && Number.isFinite(mm);
  const hasChance = typeof chance === 'number' && Number.isFinite(chance);
  const amount = hasRain ? `${formatPrecip(mm, units)} ${precipUnit(units)}` : '';
  const showChance = hasChance && ((chance ?? 0) > 0 || !hasRain);
  const pct = showChance ? `${Math.round(chance as number)}%` : '';
  return [amount, pct].filter(Boolean).join(' · ');
}

export function initWeatherConsole(root: HTMLElement) {
  let lang = loadLang();
  let units = loadUnits();
  let view = loadView();
  const station = DEFAULT_STATION;
  let snapshot: WeatherSnapshot | null = null;
  let series: WeatherSeries | null = null;
  let seriesFailed = false;
  let seriesPending = false;
  let showSeriesWait = false;
  let seriesWaitTimer: number | null = null;
  let failed = false;

  const seriesNote = (dict: Dictionary) => {
    if (seriesFailed) return dict.noData;
    if (seriesPending && showSeriesWait) return dict.loading;
    return '';
  };

  const render = () => {
    const dict = dictionaries[lang];
    applyI18n(root, dict);

    root.dataset.lang = lang;
    root.dataset.units = units;
    document.documentElement.lang = lang;
    setView(root, view);
    bindSeries(root, series, units, dict, seriesNote(dict));
    root.querySelectorAll<HTMLElement>('[data-lang]').forEach((btn) => {
      const active = btn.dataset.lang === lang;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    root.querySelectorAll<HTMLElement>('[data-units]').forEach((btn) => {
      const active = btn.dataset.units === units;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    applyDocumentTitle(snapshot?.location.name ?? station.name);
    bind(root, 'clock', formatClock(new Date()));

    const { ops, link } = snapshot || failed
      ? deriveStatus(snapshot, failed)
      : { ops: 'loading' as const, link: 'loading' as const };

    root.dataset.state = failed ? 'error' : snapshot && link === 'stale' ? 'stale' : 'ready';
    root.dataset.ops = ops;
    root.dataset.link = link;

    bind(root, 'opsStatus', opsLabel(ops, dict));
    bind(root, 'linkStatus', linkLabel(link, dict));
    bind(root, 'moduleTitle', moduleTitle(view, dict));
    bind(root, 'sunrise', snapshot?.sun?.rise ?? dash());
    bind(root, 'sunset', snapshot?.sun?.set ?? dash());

    if (!snapshot) {
      bind(root, 'temp', dash());
      bind(root, 'tempUnit', tempUnit(units));
      bind(root, 'feels', dash());
      bind(root, 'wind', dash());
      bind(root, 'windUnit', windUnit(units));
      bind(root, 'humidity', dash());
      bind(root, 'gust', dash());
      bind(root, 'direction', dash());
      bind(root, 'cardinal', dash());
      bind(root, 'pressure', dash());
      bind(root, 'precipRate', dash());
      bind(root, 'precipToday', dash());
      bind(root, 'observed', dash());
      bind(root, 'source', dict.noData);
      bindStationIdentity(root, dict, null, station);
      bind(root, 'location', station.name);
      bind(root, 'region', station.region);
      return;
    }

    const { metric } = snapshot;
    bind(root, 'temp', formatTemp(metric.temp, units));
    bind(root, 'tempUnit', tempUnit(units));
    bind(root, 'feels', `${formatTemp(metric.feelsLike, units)}${tempUnit(units)}`);
    bind(root, 'wind', isCalm(metric.windSpeed) ? dict.calm : formatWind(metric.windSpeed, units));
    bind(root, 'windUnit', isCalm(metric.windSpeed) ? '' : windUnit(units));
    bind(root, 'humidity', `${Math.round(metric.humidity)}%`);
    bind(root, 'gust', `${formatWind(metric.windGust, units)} ${windUnit(units)}`);
    bind(
      root,
      'pressure',
      typeof metric.pressure === 'number' ? `${formatPressure(metric.pressure, units)} ${pressureUnit(units)}` : dash(),
    );
    bind(root, 'precipRate', `${formatPrecip(snapshot.precipRate, units)} ${precipRateUnit(units)}`);
    bind(
      root,
      'precipToday',
      typeof metric.precipTotal === 'number' ? `${formatPrecip(metric.precipTotal, units)} ${precipUnit(units)}` : dash(),
    );
    if (isCalm(metric.windSpeed)) {
      bind(root, 'direction', dict.calm);
      bind(root, 'cardinal', '');
    } else {
      bind(root, 'direction', formatDegrees(metric.windDir));
      bind(root, 'cardinal', dict.cardinals[cardinalIndex(metric.windDir)] ?? dash());
    }
    bind(root, 'observed', formatAge(snapshot.observedAt, dict));
    bind(root, 'source', sourceLabel(snapshot.source));
    bindStationIdentity(root, dict, snapshot.source, station, snapshot.stationId);
    bind(root, 'location', snapshot.location.name);
    bind(root, 'region', snapshot.location.region);
    applyDocumentTitle(snapshot.location.name);
  };

  root.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isLang(btn.dataset.lang ?? '')) return;
      lang = btn.dataset.lang as Lang;
      localStorage.setItem(LANG_KEY, lang);
      render();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-units]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isUnits(btn.dataset.units ?? '')) return;
      units = btn.dataset.units as Units;
      localStorage.setItem(UNITS_KEY, units);
      render();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isView(btn.dataset.view ?? '')) return;
      view = btn.dataset.view as ConsoleView;
      localStorage.setItem(VIEW_KEY, view);
      render();
    });
  });

  const prefs = root.querySelector<HTMLDialogElement>('[data-prefs]');
  const prefsOpen = root.querySelector<HTMLButtonElement>('[data-prefs-open]');
  prefsOpen?.addEventListener('click', () => {
    prefs?.showModal();
    prefsOpen.setAttribute('aria-expanded', 'true');
  });
  prefs?.addEventListener('close', () => {
    prefsOpen?.setAttribute('aria-expanded', 'false');
    prefsOpen?.focus();
  });
  prefs?.addEventListener('click', (event) => {
    if (event.target === prefs) prefs.close();
  });

  window.setInterval(() => {
    bind(root, 'clock', formatClock(new Date()));
    if (snapshot) bind(root, 'observed', formatAge(snapshot.observedAt, dictionaries[lang]));
  }, 1000);

  const loadWeather = async () => {
    applyDocumentTitle(station.name);
    series = null;
    seriesFailed = false;
    seriesPending = true;
    showSeriesWait = false;
    if (seriesWaitTimer !== null) window.clearTimeout(seriesWaitTimer);
    seriesWaitTimer = window.setTimeout(() => {
      showSeriesWait = true;
      render();
    }, 200);

    try {
      const response = await fetch(snapshotUrl(), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
      snapshot = (await response.json()) as WeatherSnapshot;
      failed = false;
    } catch (error) {
      console.error(error);
      try {
        snapshot = await fetchOpenMeteoSnapshot(station);
        failed = false;
      } catch (fallbackError) {
        console.error(fallbackError);
        failed = true;
        snapshot = null;
      }
    }

    try {
      if (snapshot?.series) {
        series = snapshot.series;
        seriesFailed = false;
      } else if (snapshot?.source === 'wunderground-pws') {
        series = null;
        seriesFailed = true;
      } else {
        series = await fetchOpenMeteoSeries(station);
        seriesFailed = false;
      }
      if (snapshot && !snapshot.sun && series?.sun && snapshot.source === 'open-meteo') {
        snapshot = { ...snapshot, sun: series.sun };
      }
    } catch (error) {
      console.error(error);
      series = null;
      seriesFailed = true;
    }
    seriesPending = false;
    showSeriesWait = false;
    if (seriesWaitTimer !== null) window.clearTimeout(seriesWaitTimer);
    seriesWaitTimer = null;
    render();
  };

  render();

  window.setTimeout(() => {
    root.classList.remove('is-booting');
  }, 700);

  void loadWeather();
}
