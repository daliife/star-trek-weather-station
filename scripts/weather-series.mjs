const SERIES_HOURS = 6;
const SERIES_DAYS = 5;
const SERIES_BARS = 7;
const SERIES_PAST_DAYS = 31;
const STATION_TZ = 'Europe/Madrid';
const FORECAST_TTL_MS = 3 * 60 * 60 * 1000;

function stationDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STATION_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function ymdCompact(isoDate) {
  return isoDate.replaceAll('-', '');
}

function dateFromLocal(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ''));
  return match?.[1] ?? '';
}

function hourFromLocal(value) {
  const match = /T(\d{2}:\d{2})/.exec(String(value ?? ''));
  return match?.[1] ?? '';
}

function stampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  const raw = String(value ?? '').trim();
  if (!raw) return NaN;
  const normalized = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  return Date.parse(normalized);
}

function hourLabel(value) {
  const local = hourFromLocal(value);
  if (local) return local;
  const ms = stampMs(value);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: STATION_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
}

function sunPair(rise, set) {
  const up = hourFromLocal(rise);
  const down = hourFromLocal(set);
  return up && down ? { rise: up, set: down } : undefined;
}

function finite(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function rangeOf(highs, lows, rains, from, to) {
  const sliceHigh = highs.slice(from, to + 1).filter((value) => value !== null);
  const sliceLow = lows.slice(from, to + 1).filter((value) => value !== null);
  if (!sliceHigh.length || !sliceLow.length) return null;
  const sliceRain = (rains ?? []).slice(from, to + 1).filter((value) => value !== null);
  return {
    high: Math.max(...sliceHigh),
    low: Math.min(...sliceLow),
    ...(sliceRain.length ? { rain: sliceRain.reduce((sum, value) => sum + value, 0) } : {}),
  };
}

function dayChance(chances, dayIndex) {
  const day = finite(chances?.[dayIndex * 2]);
  const night = finite(chances?.[dayIndex * 2 + 1]);
  if (day === null && night === null) return undefined;
  return Math.max(day ?? 0, night ?? 0);
}

function hoursFromDaypart(daypart, dailyDates) {
  const part = Array.isArray(daypart) ? daypart[0] : daypart;
  if (!part || typeof part !== 'object') return [];
  const temps = part.temperature ?? [];
  const modes = part.dayOrNight ?? [];
  const rains = part.qpf ?? [];
  const chances = part.precipChance ?? [];
  const upcoming = [];
  for (let index = 0; index < temps.length && upcoming.length < SERIES_HOURS; index += 1) {
    const temp = finite(temps[index]);
    const mode = String(modes[index] ?? '').toUpperCase();
    if (temp === null || (mode !== 'D' && mode !== 'N')) continue;
    const date = dateFromLocal(dailyDates[Math.floor(index / 2)]);
    if (!date) continue;
    const rain = finite(rains[index]);
    const chance = finite(chances[index]);
    upcoming.push({
      hour: `${mode}:${date}`,
      temp,
      ...(rain !== null ? { rain } : {}),
      ...(chance !== null ? { chance } : {}),
    });
  }
  return upcoming;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { response, body, text };
}

function wuUrl(path, params) {
  const url = new URL(path, 'https://api.weather.com');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url;
}

export function isForecastFresh(fetchedAt, now = Date.now()) {
  const ms = Date.parse(String(fetchedAt ?? ''));
  return Number.isFinite(ms) && now - ms < FORECAST_TTL_MS;
}

export function isHistoryFresh(fetchedAt, now = Date.now()) {
  const ms = Date.parse(String(fetchedAt ?? ''));
  if (!Number.isFinite(ms)) return false;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: STATION_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(ms)) === fmt.format(new Date(now));
}

export function touchLastDays(lastDays, todayTemp) {
  if (!Array.isArray(lastDays) || lastDays.length === 0) return lastDays;
  const today = stationDate(0);
  return [...lastDays.slice(0, -1), { date: today, temp: todayTemp }];
}

export async function fetchWundergroundHistory(apiKey, station, todayTemp) {
  const today = stationDate(0);
  const historyUrl = wuUrl('/v2/pws/history/daily', {
    stationId: station.stationId,
    format: 'json',
    units: 'm',
    startDate: ymdCompact(stationDate(-SERIES_PAST_DAYS)),
    endDate: ymdCompact(stationDate(-1)),
    numericPrecision: 'decimal',
    apiKey,
  });
  const history = await fetchJson(historyUrl);
  if (!history.response.ok) throw new Error(`WU history HTTP ${history.response.status}`);

  const observations = Array.isArray(history.body?.observations) ? history.body.observations : [];
  const days = observations
    .map((obs) => {
      const date = dateFromLocal(obs.obsTimeLocal) || dateFromLocal(obs.obsTimeUtc);
      const metric = obs.metric ?? {};
      const high = finite(metric.tempHigh);
      const low = finite(metric.tempLow);
      const avg = finite(metric.tempAvg);
      const rain = finite(metric.precipTotal);
      if (!date || high === null || low === null) return null;
      return { date, high, low, avg: avg ?? (high + low) / 2, rain };
    })
    .filter(Boolean)
    .sort((left, right) => left.date.localeCompare(right.date));

  if (days.length < SERIES_BARS - 1) throw new Error('WU history did not include enough daily summaries.');

  const highs = days.map((day) => day.high);
  const lows = days.map((day) => day.low);
  const rains = days.map((day) => day.rain);
  const yesterday = days[days.length - 1];
  const yesterdayRange = {
    high: yesterday.high,
    low: yesterday.low,
    ...(yesterday.rain !== null ? { rain: yesterday.rain } : {}),
  };
  const week = rangeOf(highs, lows, rains, Math.max(0, days.length - 7), days.length - 1);
  const month = rangeOf(highs, lows, rains, Math.max(0, days.length - 30), days.length - 1);
  if (!week || !month) throw new Error('WU history ranges were incomplete.');

  const pastBars = days.slice(-(SERIES_BARS - 1)).map((day) => ({ date: day.date, temp: day.avg }));
  return {
    yesterday: yesterdayRange,
    week,
    month,
    lastDays: [...pastBars, { date: today, temp: todayTemp }],
  };
}

export async function fetchWundergroundForecast(apiKey, station) {
  const dailyUrl = wuUrl('/v3/wx/forecast/daily/5day', {
    geocode: `${station.lat},${station.lon}`,
    format: 'json',
    units: 'm',
    language: 'en-US',
    apiKey,
  });
  const daily = await fetchJson(dailyUrl);
  if (!daily.response.ok) throw new Error(`WU daily forecast HTTP ${daily.response.status}`);

  const dailyDates = daily.body?.validTimeLocal ?? [];
  const dailyHighs = daily.body?.calendarDayTemperatureMax ?? daily.body?.temperatureMax ?? [];
  const dailyLows = daily.body?.calendarDayTemperatureMin ?? daily.body?.temperatureMin ?? [];
  const dailyQpf = daily.body?.qpf ?? [];
  const dailyChances = daily.body?.daypart?.[0]?.precipChance ?? [];
  const forecastDays = [];
  for (let index = 0; index < dailyDates.length && forecastDays.length < SERIES_DAYS; index += 1) {
    const date = dateFromLocal(dailyDates[index]);
    const high = finite(dailyHighs[index]);
    const low = finite(dailyLows[index]);
    if (!date || high === null || low === null) continue;
    const rain = finite(dailyQpf[index]);
    const chance = dayChance(dailyChances, index);
    forecastDays.push({
      date,
      high,
      low,
      ...(rain !== null ? { rain } : {}),
      ...(chance !== undefined ? { chance } : {}),
    });
  }
  if (forecastDays.length < SERIES_DAYS) throw new Error('WU daily forecast was incomplete.');

  // PWS contributor keys can read daily/5day (including day/night parts) but not hourly/2day (HTTP 401).
  const upcoming = hoursFromDaypart(daily.body?.daypart, dailyDates);
  if (upcoming.length < SERIES_HOURS) {
    console.warn(`WU daypart forecast incomplete (${upcoming.length}/${SERIES_HOURS}).`);
  }

  return {
    hourly: upcoming,
    daily: forecastDays,
    sun: sunPair(
      daily.body?.sunriseTimeLocal?.[0] ?? daily.body?.sunriseTimeUtc?.[0],
      daily.body?.sunsetTimeLocal?.[0] ?? daily.body?.sunsetTimeUtc?.[0],
    ),
  };
}

export async function fetchWundergroundSeries(apiKey, station, todayTemp) {
  const [history, forecast] = await Promise.all([
    fetchWundergroundHistory(apiKey, station, todayTemp),
    fetchWundergroundForecast(apiKey, station),
  ]);
  return { ...forecast, ...history };
}

export async function fetchOpenMeteoSeries(station) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(station.lat));
  url.searchParams.set('longitude', String(station.lon));
  url.searchParams.set('hourly', 'temperature_2m,precipitation,precipitation_probability');
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_probability_max,sunrise,sunset',
  );
  url.searchParams.set('forecast_days', String(SERIES_DAYS));
  url.searchParams.set('past_days', String(SERIES_PAST_DAYS));
  url.searchParams.set('timezone', 'auto');
  const { response, body } = await fetchJson(url);
  if (!response.ok) throw new Error(`Open-Meteo series HTTP ${response.status}`);

  const hours = body?.hourly?.time ?? [];
  const hourTemps = body?.hourly?.temperature_2m ?? [];
  const hourRain = body?.hourly?.precipitation ?? [];
  const hourChance = body?.hourly?.precipitation_probability ?? [];
  const dates = body?.daily?.time ?? [];
  const highs = body?.daily?.temperature_2m_max ?? [];
  const lows = body?.daily?.temperature_2m_min ?? [];
  const means = body?.daily?.temperature_2m_mean ?? [];
  const dailyRain = body?.daily?.precipitation_sum ?? [];
  const dailyChance = body?.daily?.precipitation_probability_max ?? [];
  const sunrises = body?.daily?.sunrise ?? [];
  const sunsets = body?.daily?.sunset ?? [];
  const now = Date.now();
  const hourly = [];
  for (let index = 0; index < hours.length && hourly.length < SERIES_HOURS; index += 1) {
    const stamp = hours[index];
    const temp = finite(hourTemps[index]);
    if (!stamp || temp === null || new Date(stamp).getTime() <= now) continue;
    const rain = finite(hourRain[index]);
    const chance = finite(hourChance[index]);
    hourly.push({
      hour: hourFromLocal(stamp),
      temp,
      ...(rain !== null ? { rain } : {}),
      ...(chance !== null ? { chance } : {}),
    });
  }
  if (hourly.length < SERIES_HOURS) throw new Error('Open-Meteo series had too few upcoming hours.');

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: body?.timezone || STATION_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const todayIndex = dates.indexOf(today);
  if (todayIndex < SERIES_BARS - 1 || todayIndex + SERIES_DAYS > dates.length) {
    throw new Error('Open-Meteo series did not include today and the next days.');
  }

  const daily = dates.slice(todayIndex, todayIndex + SERIES_DAYS).map((date, index) => {
    const rain = finite(dailyRain[todayIndex + index]);
    const chance = finite(dailyChance[todayIndex + index]);
    return {
      date,
      high: finite(highs[todayIndex + index]),
      low: finite(lows[todayIndex + index]),
      ...(rain !== null ? { rain } : {}),
      ...(chance !== null ? { chance } : {}),
    };
  });
  if (daily.some((day) => day.high === null || day.low === null)) {
    throw new Error('Open-Meteo daily forecast was incomplete.');
  }

  const yesterdayIndex = todayIndex - 1;
  const finiteHighs = highs.map(finite);
  const finiteLows = lows.map(finite);
  const finiteRains = dailyRain.map(finite);
  const week = rangeOf(finiteHighs, finiteLows, finiteRains, todayIndex - 7, yesterdayIndex);
  const month = rangeOf(finiteHighs, finiteLows, finiteRains, todayIndex - 30, yesterdayIndex);
  if (!week || !month) throw new Error('Open-Meteo history ranges were incomplete.');

  const lastDays = dates.slice(todayIndex - (SERIES_BARS - 1), todayIndex + 1).map((date, index) => ({
    date,
    temp: finite(means[todayIndex - (SERIES_BARS - 1) + index]),
  }));
  if (lastDays.some((day) => day.temp === null)) throw new Error('Open-Meteo last-days series was incomplete.');

  return {
    hourly,
    daily,
    yesterday: {
      high: finite(highs[yesterdayIndex]),
      low: finite(lows[yesterdayIndex]),
      ...(finite(dailyRain[yesterdayIndex]) !== null ? { rain: finite(dailyRain[yesterdayIndex]) } : {}),
    },
    week,
    month,
    lastDays,
    sun: sunPair(sunrises[todayIndex], sunsets[todayIndex]),
  };
}

export {
  FORECAST_TTL_MS,
  dateFromLocal,
  finite,
  hourFromLocal,
  hourLabel,
  hoursFromDaypart,
  rangeOf,
  stampMs,
  sunPair,
};
