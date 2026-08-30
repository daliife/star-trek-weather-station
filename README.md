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

Optional: `cp .env.example .env` and set `WU_API_KEY` if you have a contributor key that can read ICABAC4. Without a key, `pnpm fetch-weather` leaves the sample `public/data/current.json` in place so the console can be designed offline.

Requires Node 22+ and pnpm.

## Data flow

GitHub Pages cannot keep a secret. v1 therefore:

1. Stores `WU_API_KEY` as a **GitHub Actions secret** (and a gitignored local `.env`).
2. Runs `scripts/fetch-weather.mjs` to write a sanitized snapshot to `public/data/current.json`.
3. Builds Astro and deploys `dist/`. The browser only loads that JSON.

Primary source: [PWS current observations](https://developer.weather.com/docs/openapi/pws-observations-current-conditions-2-0/get-v2-pws-observations-current-by-stationid) for the station in `src/config/station.json` (default `ICABAC4`, `units=m`). Override with `WU_STATION_ID` / `STATION_*` env vars. Contributor keys are often limited to stations owned by that account. If the key is missing in CI or the request returns 401/403, the script falls back to [Open-Meteo](https://open-meteo.com/) at the configured coordinates. In the console, Preferències can point at another PWS; if it is not the server snapshot, the browser queries Open-Meteo. The footer source badge shows which provider was used. We do not scrape wunderground.com.

The PWS payload has no sky-condition phrase. The center readout is temperature. A status pill shows `NOMINAL` / `PRECIP` (from `precipRate`) / `DATA EXPIRED` / `OFFLINE`. The footer link state is `ONLINE` / `STALE` / `NO DATA` (stale if the observation is older than about 30 minutes).

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
    "windDir": 0
  }
}
```

`source` is `wunderground-pws` or `open-meteo`. Feels-like is heat index or wind chill from the PWS payload.

## Language and units

Labels live in `src/i18n/{ca,es,en}.json` (numbers stay numeric). Default language is Catalan; default units are metric (°C, km/h). The imperial toggle is °F and mph. Language and units are set in the preferences dialog and persist in `localStorage`.

## GitHub Pages

1. Add repo secret `WU_API_KEY`.
2. Set Pages source to **GitHub Actions**.
3. `.github/workflows/deploy.yml` runs on push to `main`, `workflow_dispatch`, and every 10 minutes: fetch snapshot → build → deploy `dist/`. Live JSON is not committed back to git.

`astro.config.mjs` sets `base` to `/star-trek-weather-station/` for project Pages. Change that if you later use a custom domain or a user site.

## Layout

- Left: view pills `STATION` / `FORECAST` / `HISTORY`, plus a preferences control for language and units
- Top: location, station id, current view, local chronometer
- Station view: oversized temperature, separate feels-like and wind tiles, humidity/gust/direction/age grid
- Forecast and History views: labeled mock data until live endpoints are wired
- Bottom: source, station, link status, fetched-at, fan disclaimer

Tokens and frame live in `src/styles/lcars.css` (Antonio, own elbows/pills — no LCARS CSS kit). The interactive island is `WeatherConsole.astro`.

## Out of v1

Hourly/daily forecast, history charts, astronomy, radar, sounds, pressure/precip/UV panels, custom domain.
