# LCARS Weather Console

Desktop-first [Astro](https://astro.build/) static site for **current conditions** at Cabacés PWS [ICABAC4](https://www.wunderground.com/weather/es/cabac%C3%A9s/ICABAC4). The UI is a full-screen TNG-style LCARS ops console, not a single themed widget, so later panels can drop in without a redesign.

Weather Underground is fetched in GitHub Actions (or locally) so the API key never reaches the browser. Imperial values are converted in the client from one metric snapshot.

Fan work. Not affiliated with Paramount, Star Trek, or Weather Underground.

## Local preview

```sh
pnpm install
pnpm fetch-weather
pnpm dev
```

Open [http://localhost:4321/star-trek-weather-station/](http://localhost:4321/star-trek-weather-station/).

Optional: `cp .env.example .env` and set `WU_API_KEY` if you have a contributor key that can read ICABAC4. Without a key, `pnpm fetch-weather` writes a live Open-Meteo snapshot instead.

Requires Node 22+ and pnpm.

## Data flow

GitHub Pages cannot keep a secret. v1 therefore:

1. Stores `WU_API_KEY` as a **GitHub Actions secret** (and a gitignored local `.env`).
2. Runs `scripts/fetch-weather.mjs` to write a sanitized snapshot to `public/data/current.json`.
3. Builds Astro and deploys `dist/`. The browser only loads that JSON.

Primary source: Weather Underground for **Ara**, **Previsió**, and **Històric**. Current comes from the [PWS observations](https://developer.weather.com/docs/openapi/pws-observations-current-conditions-2-0/get-v2-pws-observations-current-by-stationid) endpoint; history from PWS daily summaries; forecast from the Weather Company 5-day / 2-day hourly products at the station coordinates. The station is fixed in `src/config/station.json`. If the key is missing or WU cannot serve current conditions, the whole snapshot (including series) falls back to [Open-Meteo](https://open-meteo.com/). A WU snapshot never mixes in Open-Meteo forecast/history. The footer source badge is that snapshot. We do not scrape wunderground.com.

The PWS payload has no sky-condition phrase. The center readout is temperature. A status pill shows `NOMINAL` / `PRECIP` (from `precipRate`) / `DATA EXPIRED` / `OFFLINE`. The footer link state is `ONLINE` / `STALE` / `NO DATA` (stale if the observation is older than about 30 minutes).

## API quota

PWS contributor keys are typically capped at **1500 calls/day** and **30/minute**. Usage is on the WU account under [API Keys](https://www.wunderground.com/member/api-keys) → Show Usage.

The public site does not spend that quota. The browser never sees `WU_API_KEY`. Each visitor only loads `current.json` from Pages. Only `scripts/fetch-weather.mjs` in GitHub Actions (or a local `.env`) calls Weather Underground: current + history + daily/hourly forecast (**up to 4 calls per run**).

The deploy cron is every 10 minutes: about **144–576 WU calls/day**, plus a burst on each push to `main` or a manual run. That stays under 1500. If WU returns 429 or an empty observation, the script falls back to Open-Meteo for the whole snapshot so the console stays up.

## Snapshot shape

```json
{
  "source": "wunderground-pws",
  "stationId": "ICABAC4",
  "location": { "name": "Cabacés", "region": "Tarragona", "country": "ES" },
  "fetchedAt": "2026-08-30T15:00:00Z",
  "observedAt": "2026-08-30T15:00:00Z",
  "status": "ok",
  "precipRate": 0,
  "metric": {
    "temp": 30.6,
    "feelsLike": 30.0,
    "humidity": 41,
    "windSpeed": 4.8,
    "windGust": 6.4,
    "windDir": 0,
    "pressure": 1013.2,
    "precipTotal": 0
  }
}
```

`source` is `wunderground-pws` or `open-meteo`. Feels-like is heat index or wind chill from the PWS payload. When the same source can provide it, `series` holds forecast and history for the other two views.

## Language and units

Labels live in `src/i18n/{ca,es,en}.json` (numbers stay numeric). Default language is English; default units are metric (°C, km/h, hPa, mm). The imperial toggle is °F, mph, inHg, and inches. Language and units are set in the preferences dialog and persist in `localStorage`.

## GitHub Pages

1. Add repo secret `WU_API_KEY`.
2. Set Pages source to **GitHub Actions**.
3. `.github/workflows/deploy.yml` runs on push to `main`, `workflow_dispatch`, and every 10 minutes: fetch snapshot → build → deploy `dist/`. Live JSON is not committed back to git.

`astro.config.mjs` sets `base` to `/star-trek-weather-station/` for project Pages. Change that if you later use a custom domain or a user site.

## Layout

- Left: view pills `STATION` / `FORECAST` / `HISTORY`, plus a preferences control for language and units
- Top: location, station id, current view, local chronometer
- Station view: oversized temperature, separate feels-like and wind tiles, humidity/gust/direction/age grid
- Forecast and History views: Open-Meteo hourly/daily forecast plus yesterday / 7 / 30 day history
- Bottom: source, station, link status, fetched-at

Tokens and frame live in `src/styles/lcars.css` (Antonio, own elbows/pills — no LCARS CSS kit). The interactive island is `WeatherConsole.astro`.

## Out of v1

Hourly/daily forecast, history charts, astronomy, radar, sounds, pressure/precip/UV panels, custom domain.
