/**
 * Fetch current conditions for Cabacés PWS ICABAC4 and write a sanitized
 * snapshot to public/data/current.json.
 *
 * Primary: Weather Underground for current, forecast, and history (needs WU_API_KEY).
 * Fallback: Open-Meteo for the whole snapshot if the key is missing or cannot
 * read current conditions. A WU snapshot never mixes Open-Meteo series.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchOpenMeteoSeries, fetchWundergroundForecast, fetchWundergroundHistory, isForecastFresh, isHistoryFresh, touchLastDays } from './weather-series.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = resolve(ROOT, 'public/data/current.json');
const STATION_PATH = resolve(ROOT, 'src/config/station.json');

function loadStationConfig() {
  const defaults = JSON.parse(readFileSync(STATION_PATH, 'utf8'));
  const lat = Number(process.env.STATION_LAT ?? defaults.lat);
  const lon = Number(process.env.STATION_LON ?? defaults.lon);
  return {
    stationId: (process.env.WU_STATION_ID ?? defaults.stationId).trim().toUpperCase(),
    name: (process.env.STATION_NAME ?? defaults.name).trim(),
    region: (process.env.STATION_REGION ?? defaults.region).trim(),
    country: (process.env.STATION_COUNTRY ?? defaults.country).trim(),
    lat,
    lon,
  };
}

function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function feelsLike(temp, heatIndex, windChill) {
  if (typeof heatIndex === 'number' && heatIndex > temp) return heatIndex;
  if (typeof windChill === 'number' && windChill < temp) return windChill;
  return temp;
}

function requireNumber(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Sanitized snapshot missing numeric field: ${label}`);
  }
  return value;
}

function writeSnapshot(snapshot) {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUT_PATH} (source=${snapshot.source}, status=${snapshot.status})`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 400);
  }
  return { response, body, text };
}

async function fetchWunderground(apiKey, station) {
  const url = new URL('https://api.weather.com/v2/pws/observations/current');
  url.searchParams.set('stationId', station.stationId);
  url.searchParams.set('format', 'json');
  url.searchParams.set('units', 'm');
  url.searchParams.set('numericPrecision', 'decimal');
  url.searchParams.set('apiKey', apiKey);

  const { response, body, text } = await fetchJson(url);

  if (response.status === 401 || response.status === 403) {
    const err = new Error(
      `WU key cannot read station ${station.stationId} (HTTP ${response.status}). Contributor keys are often limited to stations owned by that account.`,
    );
    err.code = 'WU_FORBIDDEN';
    err.detail = typeof body === 'string' ? body : JSON.stringify(body);
    throw err;
  }

  if (response.status === 429) {
    const err = new Error(`WU rate limit (HTTP 429) for ${station.stationId}.`);
    err.code = 'WU_RATE_LIMIT';
    throw err;
  }

  if (!response.ok) {
    throw new Error(`WU request failed HTTP ${response.status}: ${text.slice(0, 400)}`);
  }

  const obs = body?.observations?.[0];
  if (!obs) {
    const err = new Error(
      `WU response had no observations for ${station.stationId}. Contributor keys return empty or stale payloads when the daily/minute cap is hit.`,
    );
    err.code = 'WU_NO_DATA';
    throw err;
  }
  if (obs.stationID && obs.stationID !== station.stationId) {
    throw new Error(`WU returned station ${obs.stationID}, expected ${station.stationId}.`);
  }

  const metric = obs.metric ?? {};
  const temp = requireNumber(metric.temp, 'metric.temp');

  return {
    source: 'wunderground-pws',
    stationId: station.stationId,
    location: { name: station.name, region: station.region, country: station.country },
    fetchedAt: isoNow(),
    observedAt: obs.obsTimeUtc ?? isoNow(),
    status: 'ok',
    precipRate: typeof metric.precipRate === 'number' ? metric.precipRate : 0,
    metric: {
      temp,
      feelsLike: feelsLike(temp, metric.heatIndex, metric.windChill),
      humidity: requireNumber(obs.humidity, 'humidity'),
      windSpeed: requireNumber(metric.windSpeed, 'metric.windSpeed'),
      windGust: requireNumber(metric.windGust, 'metric.windGust'),
      windDir: requireNumber(obs.winddir, 'winddir'),
      ...(typeof metric.pressure === 'number' ? { pressure: metric.pressure } : {}),
      ...(typeof metric.precipTotal === 'number' ? { precipTotal: metric.precipTotal } : {}),
    },
  };
}

async function fetchOpenMeteo(station) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(station.lat));
  url.searchParams.set('longitude', String(station.lon));
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,surface_pressure',
  );
  url.searchParams.set('daily', 'precipitation_sum,sunrise,sunset');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', 'auto');

  const { response, body, text } = await fetchJson(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed HTTP ${response.status}: ${text.slice(0, 400)}`);
  }

  const current = body?.current;
  if (!current) {
    throw new Error('Open-Meteo response had no current block.');
  }

  const todayRain = body?.daily?.precipitation_sum?.[0];
  const rise = /T(\d{2}:\d{2})/.exec(String(body?.daily?.sunrise?.[0] ?? ''))?.[1];
  const set = /T(\d{2}:\d{2})/.exec(String(body?.daily?.sunset?.[0] ?? ''))?.[1];

  return {
    source: 'open-meteo',
    stationId: station.stationId,
    location: { name: station.name, region: station.region, country: station.country },
    fetchedAt: isoNow(),
    observedAt: isoNow(),
    status: 'ok',
    precipRate: typeof current.precipitation === 'number' ? current.precipitation : 0,
    metric: {
      temp: requireNumber(current.temperature_2m, 'temperature_2m'),
      feelsLike: requireNumber(current.apparent_temperature, 'apparent_temperature'),
      humidity: requireNumber(current.relative_humidity_2m, 'relative_humidity_2m'),
      windSpeed: requireNumber(current.wind_speed_10m, 'wind_speed_10m'),
      windGust: requireNumber(current.wind_gusts_10m, 'wind_gusts_10m'),
      windDir: requireNumber(current.wind_direction_10m, 'wind_direction_10m'),
      ...(typeof current.surface_pressure === 'number' ? { pressure: current.surface_pressure } : {}),
      ...(typeof todayRain === 'number' ? { precipTotal: todayRain } : {}),
    },
    ...(rise && set ? { sun: { rise, set } } : {}),
  };
}

function hasForecast(series) {
  return Array.isArray(series?.hourly) && Array.isArray(series?.daily) && series.daily.length > 0;
}

function hasHistory(series) {
  return Boolean(series?.yesterday && series?.week && series?.month && Array.isArray(series?.lastDays));
}

async function loadPreviousSnapshot() {
  const liveUrl = process.env.SNAPSHOT_URL?.trim();
  if (liveUrl) {
    try {
      const { response, body } = await fetchJson(liveUrl);
      if (response.ok && body && typeof body === 'object') {
        console.log(`Loaded previous snapshot from ${liveUrl}`);
        return body;
      }
    } catch (error) {
      console.warn(`Live snapshot unavailable (${liveUrl}): ${error.message}`);
    }
  }
  if (!existsSync(OUT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(OUT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function withWundergroundSeries(snapshot, apiKey, station, previous) {
  const sameSource = previous?.source === 'wunderground-pws';
  const prevSeries = sameSource ? previous.series : null;
  const reuseForecast = sameSource && hasForecast(prevSeries) && isForecastFresh(previous.forecastFetchedAt ?? previous.fetchedAt);
  const reuseHistory = sameSource && hasHistory(prevSeries) && isHistoryFresh(previous.historyFetchedAt ?? previous.fetchedAt);

  let forecast = reuseForecast
    ? { hourly: prevSeries.hourly, daily: prevSeries.daily, sun: previous.sun ?? prevSeries.sun }
    : null;
  let history = reuseHistory
    ? {
        yesterday: prevSeries.yesterday,
        week: prevSeries.week,
        month: prevSeries.month,
        lastDays: prevSeries.lastDays,
      }
    : null;

  const jobs = [];
  if (!reuseForecast) {
    jobs.push(
      fetchWundergroundForecast(apiKey, station).then((value) => {
        forecast = value;
      }),
    );
  }
  if (!reuseHistory) {
    jobs.push(
      fetchWundergroundHistory(apiKey, station, snapshot.metric.temp).then((value) => {
        history = value;
      }),
    );
  }

  console.log(
    `WU series forecast=${reuseForecast ? 'reuse' : 'fetch'} history=${reuseHistory ? 'reuse' : 'fetch'}.`,
  );

  try {
    if (jobs.length) await Promise.all(jobs);
  } catch (error) {
    console.warn(`WU series unavailable; leaving Previsió/Històric empty rather than mixing Open-Meteo. ${error.message}`);
  }

  if (!forecast && hasForecast(prevSeries)) {
    forecast = { hourly: prevSeries.hourly, daily: prevSeries.daily, sun: previous.sun ?? prevSeries.sun };
  }
  if (!history && hasHistory(prevSeries)) {
    history = {
      yesterday: prevSeries.yesterday,
      week: prevSeries.week,
      month: prevSeries.month,
      lastDays: prevSeries.lastDays,
    };
  }
  if (!forecast || !history) return snapshot;

  history.lastDays = touchLastDays(history.lastDays, snapshot.metric.temp);
  if (forecast.sun) snapshot.sun = forecast.sun;
  snapshot.series = {
    hourly: forecast.hourly,
    daily: forecast.daily,
    yesterday: history.yesterday,
    week: history.week,
    month: history.month,
    lastDays: history.lastDays,
  };
  snapshot.forecastFetchedAt = reuseForecast ? previous.forecastFetchedAt ?? previous.fetchedAt : snapshot.fetchedAt;
  snapshot.historyFetchedAt = reuseHistory ? previous.historyFetchedAt ?? previous.fetchedAt : snapshot.fetchedAt;
  return snapshot;
}

async function withOpenMeteoSeries(snapshot, station) {
  try {
    const series = await fetchOpenMeteoSeries(station);
    if (!snapshot.sun) snapshot.sun = series.sun;
    delete series.sun;
    snapshot.series = series;
  } catch (error) {
    console.warn(`Open-Meteo series unavailable. ${error.message}`);
  }
  return snapshot;
}

async function main() {
  loadEnv();
  const station = loadStationConfig();
  const apiKey = process.env.WU_API_KEY?.trim();

  if (!apiKey) {
    console.warn(
      `WU_API_KEY is not set. Falling back to Open-Meteo (${station.lat}N, ${station.lon}E) for ${station.stationId}.`,
    );
    writeSnapshot(await withOpenMeteoSeries(await fetchOpenMeteo(station), station));
    return;
  }

  try {
    // Current every run; forecast ~3 h; history once per Europe/Madrid day. Cron */15 stays under 1500/day.
    // The browser never uses this key and does not call Open-Meteo when the snapshot is WU.
    const previous = await loadPreviousSnapshot();
    console.log(`WU PWS current for ${station.stationId}.`);
    writeSnapshot(await withWundergroundSeries(await fetchWunderground(apiKey, station), apiKey, station, previous));
  } catch (error) {
    if (error?.code === 'WU_FORBIDDEN' || error?.code === 'WU_RATE_LIMIT' || error?.code === 'WU_NO_DATA') {
      console.error(error.message);
      if (error.detail) console.error(error.detail);
      console.warn(`Falling back to Open-Meteo (${station.lat}N, ${station.lon}E) for ${station.stationId}.`);
      writeSnapshot(await withOpenMeteoSeries(await fetchOpenMeteo(station), station));
      return;
    }
    console.error('Weather fetch failed.');
    console.error(error);
    process.exitCode = 1;
  }
}

await main();
