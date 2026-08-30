import { dictionaries, isLang } from './i18n';
import type { Dictionary } from './i18n';
import type { Lang, LinkStatus, OpsStatus, Units, WeatherSnapshot } from './types';
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

function isUnits(value: string | null): value is Units {
  return value === 'metric' || value === 'imperial';
}

function loadLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY);
  return isLang(stored) ? stored : 'ca';
}

function loadUnits(): Units {
  const stored = localStorage.getItem(UNITS_KEY);
  return isUnits(stored) ? stored : 'metric';
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
  return source === 'open-meteo' ? 'Open-Meteo' : 'WunderGround PWS';
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
  let snapshot: WeatherSnapshot | null = null;
  let failed = false;

  const render = () => {
    const dict = dictionaries[lang];
    applyI18n(root, dict);

    root.dataset.lang = lang;
    root.dataset.units = units;
    document.documentElement.lang = lang;
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

    bind(root, 'clock', formatClock(new Date(), lang));

    const { ops, link } = snapshot || failed
      ? deriveStatus(snapshot, failed)
      : { ops: 'loading' as const, link: 'loading' as const };

    root.dataset.state = failed ? 'error' : snapshot ? (link === 'stale' ? 'stale' : 'ready') : 'loading';
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
      bind(root, 'fetchedAt', dash());
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
    bind(root, 'direction', formatDegrees(metric.windDir));
    bind(root, 'cardinal', dict.cardinals[cardinalIndex(metric.windDir)] ?? dash());
    bind(root, 'observed', formatAge(snapshot.observedAt, dict));
    bind(root, 'source', sourceLabel(snapshot.source));
    bind(root, 'stationId', snapshot.stationId);
    bind(root, 'location', snapshot.location.name);
    bind(root, 'fetchedAt', formatClock(new Date(snapshot.fetchedAt), lang));
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

  window.setInterval(() => {
    bind(root, 'clock', formatClock(new Date(), lang));
    if (snapshot) bind(root, 'observed', formatAge(snapshot.observedAt, dictionaries[lang]));
  }, 1000);

  render();

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
