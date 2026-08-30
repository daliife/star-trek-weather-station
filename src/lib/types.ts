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
  };
}

export type OpsStatus = 'nominal' | 'precip' | 'expired' | 'offline' | 'loading' | 'error';
export type LinkStatus = 'online' | 'stale' | 'nodata' | 'loading' | 'error';
export type ConsoleView = 'station' | 'forecast' | 'history';
