import { dictionaries, isLang } from './i18n';
import type { Dictionary } from './i18n';
import type { ConsoleView, Lang, LinkStatus, OpsStatus, Units, WeatherSnapshot } from './types';
import {
  cardinalIndex,
  formatAge,
  formatClock,
  formatDegrees,
  formatTemp,
  formatWind,
  isCalm,
  isStale,
  tempUnit,
  windUnit,
} from './units';

const LANG_KEY = 'lcars.lang';
const UNITS_KEY = 'lcars.units';
const VIEW_KEY = 'lcars.view';

const MOCK_HOURS = [29.8, 28.4, 26.9, 25.1, 23.6, 22.4];
const MOCK_DAYS = [
  { high: 31.2, low: 18.4 },
  { high: 30.1, low: 17.8 },
  { high: 28.6, low: 16.9 },
  { high: 27.4, low: 16.2 },
  { high: 26.8, low: 15.7 },
];
const MOCK_HISTORY = {
  yesterday: { high: 32.1, low: 19.0 },
  week: { high: 33.4, low: 15.2 },
  month: { high: 36.8, low: 12.6 },
};
const MOCK_SERIES = [24.6, 26.1, 23.8, 28.4, 25.9, 27.5, 24.8];

function nextHours(count: number): string[] {
  const start = new Date().getHours() + 1;
  return Array.from({ length: count }, (_, index) => {
    const hour = (start + index + 24) % 24;
    return `${String(hour).padStart(2, '0')}:00`;
  });
}

function weekdayLabel(offsetDays: number, weekdays: string[]): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return weekdays[date.getDay()] ?? '—';
}

function seriesLabel(daysAgo: number, dict: Dictionary): string {
  if (daysAgo === 0) return dict.today;
  if (daysAgo === 1) return dict.yesterday;
  return weekdayLabel(-daysAgo, dict.weekdays);
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
  return isLang(stored) ? stored : 'ca';
}

function loadUnits(): Units {
  const stored = localStorage.getItem(UNITS_KEY);
  return isUnits(stored) ? stored : 'metric';
}

function loadView(): ConsoleView {
  const stored = localStorage.getItem(VIEW_KEY);
  return isView(stored) ? stored : 'station';
}

function bindMocks(root: HTMLElement, units: Units, dict: Dictionary) {
  const hours = nextHours(MOCK_HOURS.length);
  MOCK_HOURS.forEach((temp, index) => {
    bind(root, `fx${index}t`, hours[index] ?? '—');
    bind(root, `fx${index}`, `${formatTemp(temp, units)}${tempUnit(units)}`);
  });
  MOCK_DAYS.forEach((day, index) => {
    bind(root, `fd${index}h`, `${formatTemp(day.high, units)}${tempUnit(units)}`);
    bind(root, `fd${index}l`, `${formatTemp(day.low, units)}${tempUnit(units)}`);
    if (index >= 2) bind(root, `fd${index}k`, weekdayLabel(index, dict.weekdays));
  });
  bind(root, 'hyh', `${formatTemp(MOCK_HISTORY.yesterday.high, units)}${tempUnit(units)}`);
  bind(root, 'hyl', `${formatTemp(MOCK_HISTORY.yesterday.low, units)}${tempUnit(units)}`);
  bind(root, 'hwh', `${formatTemp(MOCK_HISTORY.week.high, units)}${tempUnit(units)}`);
  bind(root, 'hwl', `${formatTemp(MOCK_HISTORY.week.low, units)}${tempUnit(units)}`);
  bind(root, 'hmh', `${formatTemp(MOCK_HISTORY.month.high, units)}${tempUnit(units)}`);
  bind(root, 'hml', `${formatTemp(MOCK_HISTORY.month.low, units)}${tempUnit(units)}`);
  MOCK_SERIES.forEach((temp, index) => {
    bind(root, `hs${index}`, `${formatTemp(temp, units)}${tempUnit(units)}`);
    bind(root, `hs${index}k`, seriesLabel(MOCK_SERIES.length - 1 - index, dict));
    const bar = root.querySelector<HTMLElement>(`[data-bar="${index}"]`);
    bar?.style.setProperty('--h', seriesHeight(temp, MOCK_SERIES));
  });
}

function setView(root: HTMLElement, view: ConsoleView) {
  const prev = root.dataset.view;
  root.dataset.view = view;
  root.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
    const show = panel.dataset.panel === view;
    panel.hidden = !show;
    if (show && prev && prev !== view) {
      panel.classList.remove('is-entering');
      void panel.offsetWidth;
      panel.classList.add('is-entering');
    }
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

export function initWeatherConsole(root: HTMLElement) {
  let lang = loadLang();
  let units = loadUnits();
  let view = loadView();
  let snapshot: WeatherSnapshot | null = null;
  let failed = false;

  const render = () => {
    const dict = dictionaries[lang];
    applyI18n(root, dict);

    root.dataset.lang = lang;
    root.dataset.units = units;
    document.documentElement.lang = lang;
    setView(root, view);
    bindMocks(root, units, dict);
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

    bind(root, 'clock', formatClock(new Date()));

    const { ops, link } = snapshot || failed
      ? deriveStatus(snapshot, failed)
      : { ops: 'loading' as const, link: 'loading' as const };

    root.dataset.state = failed ? 'error' : snapshot && link === 'stale' ? 'stale' : 'ready';
    root.dataset.ops = ops;
    root.dataset.link = link;

    bind(root, 'opsStatus', opsLabel(ops, dict));
    bind(root, 'linkStatus', linkLabel(link, dict));

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
      bind(root, 'observed', dash());
      bind(root, 'source', dict.noData);
      bind(root, 'stationId', 'ICABAC4');
      bind(root, 'location', 'Cabacés');
      bind(root, 'region', 'Tarragona');
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
    if (isCalm(metric.windSpeed)) {
      bind(root, 'direction', dict.calm);
      bind(root, 'cardinal', '');
    } else {
      bind(root, 'direction', formatDegrees(metric.windDir));
      bind(root, 'cardinal', dict.cardinals[cardinalIndex(metric.windDir)] ?? dash());
    }
    bind(root, 'observed', formatAge(snapshot.observedAt, dict));
    bind(root, 'source', sourceLabel(snapshot.source));
    bind(root, 'stationId', snapshot.stationId);
    bind(root, 'location', snapshot.location.name);
    bind(root, 'region', snapshot.location.region);
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

  render();

  window.setTimeout(() => {
    root.classList.remove('is-booting');
  }, 1200);

  fetch(snapshotUrl(), { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
      snapshot = (await response.json()) as WeatherSnapshot;
      failed = false;
      render();
    })
    .catch((error) => {
      console.error(error);
      failed = true;
      snapshot = null;
      render();
    });
}
