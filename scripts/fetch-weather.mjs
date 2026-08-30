/**
 * Fetch current conditions for Cabacés PWS ICABAC4 and write a sanitized
 * snapshot to public/data/current.json.
 *
 * Primary: Weather Underground PWS contributor API (needs WU_API_KEY).
 * Fallback: Open-Meteo at 41.25°N, 0.73°E if the key is missing or cannot
 * read this station (401/403). Fail clearly on any other error.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = resolve(ROOT, 'public/data/current.json');
const STATION_ID = 'ICABAC4';
const LOCATION = { name: 'Cabacés', region: 'Tarragona', country: 'ES' };
const FALLBACK_LAT = 41.25;
const FALLBACK_LON = 0.73;

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

async function fetchWunderground(apiKey) {
  const url = new URL('https://api.weather.com/v2/pws/observations/current');
  url.searchParams.set('stationId', STATION_ID);
  url.searchParams.set('format', 'json');
  url.searchParams.set('units', 'm');
  url.searchParams.set('numericPrecision', 'decimal');
  url.searchParams.set('apiKey', apiKey);

  const { response, body, text } = await fetchJson(url, 'wunderground');

  if (response.status === 401 || response.status === 403) {
    const err = new Error(
      `WU key cannot read station ${STATION_ID} (HTTP ${response.status}). Contributor keys are often limited to stations owned by that account.`,
    );
    err.code = 'WU_FORBIDDEN';
    err.detail = typeof body === 'string' ? body : JSON.stringify(body);
    throw err;
  }

  if (!response.ok) {
    throw new Error(`WU request failed HTTP ${response.status}: ${text.slice(0, 400)}`);
  }

  const obs = body?.observations?.[0];
  if (!obs) {
    throw new Error(`WU response had no observations for ${STATION_ID}.`);
  }
  if (obs.stationID && obs.stationID !== STATION_ID) {
    throw new Error(`WU returned station ${obs.stationID}, expected ${STATION_ID}.`);
  }

  const metric = obs.metric ?? {};
  const temp = requireNumber(metric.temp, 'metric.temp');

  return {
    source: 'wunderground-pws',
    stationId: STATION_ID,
    location: LOCATION,
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
    },
  };
}

async function fetchOpenMeteo() {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(FALLBACK_LAT));
  url.searchParams.set('longitude', String(FALLBACK_LON));
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation',
  );
  url.searchParams.set('timezone', 'UTC');

  const { response, body, text } = await fetchJson(url, 'open-meteo');
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed HTTP ${response.status}: ${text.slice(0, 400)}`);
  }

  const current = body?.current;
  if (!current) {
    throw new Error('Open-Meteo response had no current block.');
  }

  return {
    source: 'open-meteo',
    stationId: STATION_ID,
    location: LOCATION,
    fetchedAt: isoNow(),
    // Open-Meteo current.time is a model hour, not a PWS observation.
    // Use fetch time so the console does not mark a live fallback as stale.
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
    },
  };
}

async function main() {
  loadEnv();
  const apiKey = process.env.WU_API_KEY?.trim();
  const inCi = process.env.GITHUB_ACTIONS === 'true';

  if (!apiKey) {
    const message = 'WU_API_KEY is not set.';
    if (!inCi) {
      console.warn(`${message} Leaving sample public/data/current.json in place for local UI work.`);
      return;
    }
    console.warn(`${message} Falling back to Open-Meteo (${FALLBACK_LAT}N, ${FALLBACK_LON}E).`);
    writeSnapshot(await fetchOpenMeteo());
    return;
  }

  try {
    writeSnapshot(await fetchWunderground(apiKey));
  } catch (error) {
    if (error?.code === 'WU_FORBIDDEN') {
      console.error(error.message);
      if (error.detail) console.error(error.detail);
      console.warn(`Falling back to Open-Meteo (${FALLBACK_LAT}N, ${FALLBACK_LON}E).`);
      writeSnapshot(await fetchOpenMeteo());
      return;
    }
    console.error('Weather fetch failed.');
    console.error(error);
    process.exitCode = 1;
  }
}

await main();
