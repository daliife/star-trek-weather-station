export type Lang = 'ca' | 'es' | 'en';
export type Units = 'metric' | 'imperial';
export type WeatherSource = 'wunderground-pws' | 'open-meteo';

export interface StationConfig {
  stationId: string;
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
}

export interface TempRange {
  high: number;
  low: number;
  rain?: number;
}

export interface HourPoint {
  hour: string;
  temp: number;
  rain?: number;
  chance?: number;
}

export interface DayPoint extends TempRange {
  date: string;
  chance?: number;
}

export interface SeriesPoint {
  date: string;
  temp: number;
}

export interface WeatherSeries {
  hourly: HourPoint[];
  daily: DayPoint[];
  yesterday: TempRange;
  week: TempRange;
  month: TempRange;
  lastDays: SeriesPoint[];
  sun?: {
    rise: string;
    set: string;
  };
}

export interface WeatherSnapshot {
  source: WeatherSource;
  stationId: string;
  location: {
    name: string;
    region: string;
    country: string;
  };
  fetchedAt: string;
  observedAt: string;
  status: 'ok' | 'error' | 'offline';
  precipRate: number;
  metric: {
    temp: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    windGust: number;
    windDir: number;
    pressure?: number;
    precipTotal?: number;
  };
  series?: WeatherSeries;
  sun?: {
    rise: string;
    set: string;
  };
  forecastFetchedAt?: string;
  historyFetchedAt?: string;
}

export type OpsStatus = 'nominal' | 'precip' | 'expired' | 'offline' | 'loading' | 'error';
export type LinkStatus = 'online' | 'stale' | 'nodata' | 'loading' | 'error';
export type ConsoleView = 'station' | 'forecast' | 'history';
